import type {
  PaymentProvider,
  PixChargeInput,
  PixChargeResult,
  CardChargeInput,
  CardChargeResult,
  BoletoInput,
  BoletoResult,
  RefundInput,
  RefundResult,
  WebhookEvent,
  TransactionStatus,
} from '../payment-provider.interface.js';
import { generateUUID } from '../../shared/utils/uuid.js';
import { mapAsaasStatus, mapAsaasCardBrand } from './asaas.mapper.js';
import { parseAsaasWebhook } from './asaas.webhook.js';
import { AppError } from '../../shared/errors/app-error.js';
import { ErrorCode } from '../../shared/errors/error-codes.js';

/**
 * Asaas adapter — implements PaymentProvider for EXTERNAL mode.
 * Communicates with the Asaas API (sandbox or production).
 */
export class AsaasAdapter implements PaymentProvider {
  readonly name = 'asaas';
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    const sandbox = process.env.ASAAS_SANDBOX === 'true';
    this.baseUrl = sandbox
      ? 'https://sandbox.asaas.com/api/v3'
      : 'https://api.asaas.com/v3';
    this.apiKey = process.env.ASAAS_API_KEY || '';
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    if (!this.apiKey) {
      throw new AppError(500, ErrorCode.PROVIDER_UNAVAILABLE, 'Asaas API key not configured. Set ASAAS_API_KEY environment variable.');
    }

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'access_token': this.apiKey,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30_000),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMsg = (data as Record<string, unknown>).errors
          ? JSON.stringify((data as Record<string, unknown>).errors)
          : `Asaas API error: ${response.status}`;
        throw new AppError(502, ErrorCode.PROVIDER_ERROR, errorMsg);
      }

      return data as T;
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(502, ErrorCode.PROVIDER_UNAVAILABLE, `Failed to communicate with Asaas: ${(err as Error).message}`);
    }
  }

  /**
   * Find or create a customer in Asaas by CPF/CNPJ.
   */
  private async ensureCustomer(name: string, document: string, email?: string): Promise<string> {
    // Search for existing customer
    const searchResult = await this.request<{ data: Array<{ id: string }> }>(
      'GET',
      `/customers?cpfCnpj=${document}`,
    );

    if (searchResult.data?.length > 0) {
      return searchResult.data[0].id;
    }

    // Create new customer
    const customer = await this.request<{ id: string }>('POST', '/customers', {
      name,
      cpfCnpj: document,
      email: email || undefined,
    });

    return customer.id;
  }

  async createPixCharge(input: PixChargeInput): Promise<PixChargeResult> {
    const transactionId = generateUUID();
    const customerId = await this.ensureCustomer(input.customer_name, input.customer_document);

    // Create PIX payment
    const payment = await this.request<{
      id: string;
      status: string;
    }>('POST', '/payments', {
      customer: customerId,
      billingType: 'PIX',
      value: input.amount / 100, // Asaas uses reais, not centavos
      description: input.description || 'Pagamento via ECP Pay',
      externalReference: transactionId,
      dueDate: new Date(Date.now() + (input.expiration_seconds ?? 3600) * 1000).toISOString().split('T')[0],
    });

    // Get PIX QR Code
    const pixData = await this.request<{
      encodedImage: string;
      payload: string;
      expirationDate: string;
    }>('GET', `/payments/${payment.id}/pixQrCode`);

    return {
      transaction_id: transactionId,
      provider_id: payment.id,
      qr_code: pixData.encodedImage,
      qr_code_text: pixData.payload,
      expiration: pixData.expirationDate,
      status: mapAsaasStatus(payment.status),
    };
  }

  async createCardCharge(input: CardChargeInput): Promise<CardChargeResult> {
    const transactionId = generateUUID();
    const customerId = await this.ensureCustomer(input.customer_name, input.customer_document);

    const paymentBody: Record<string, unknown> = {
      customer: customerId,
      billingType: 'CREDIT_CARD',
      value: input.amount / 100,
      description: input.description || 'Pagamento via ECP Pay',
      externalReference: transactionId,
      installmentCount: input.installments ?? 1,
      dueDate: new Date().toISOString().split('T')[0],
    };

    if (input.card_token) {
      paymentBody.creditCardToken = input.card_token;
    } else if (input.card_number) {
      const [expiryMonth, expiryYear] = (input.card_expiry || '01/2030').split('/');
      paymentBody.creditCard = {
        holderName: input.card_holder_name || input.customer_name,
        number: input.card_number,
        expiryMonth,
        expiryYear,
        ccv: input.card_cvv,
      };
      paymentBody.creditCardHolderInfo = {
        name: input.card_holder_name || input.customer_name,
        cpfCnpj: input.customer_document,
      };
    }

    const payment = await this.request<{
      id: string;
      status: string;
      creditCard?: { creditCardToken?: string; creditCardNumber?: string; creditCardBrand?: string };
    }>('POST', '/payments', paymentBody);

    return {
      transaction_id: transactionId,
      provider_id: payment.id,
      status: mapAsaasStatus(payment.status),
      card_token: payment.creditCard?.creditCardToken,
      card_last4: payment.creditCard?.creditCardNumber?.slice(-4),
      card_brand: mapAsaasCardBrand(payment.creditCard?.creditCardBrand),
    };
  }

  async createBoleto(input: BoletoInput): Promise<BoletoResult> {
    const transactionId = generateUUID();
    const customerId = await this.ensureCustomer(input.customer_name, input.customer_document, input.customer_email);

    const paymentBody: Record<string, unknown> = {
      customer: customerId,
      billingType: 'BOLETO',
      value: input.amount / 100,
      dueDate: input.due_date,
      description: input.description || 'Pagamento via ECP Pay',
      externalReference: transactionId,
    };

    if (input.interest_rate) {
      paymentBody.interest = { value: input.interest_rate / 100 };
    }
    if (input.penalty_rate) {
      paymentBody.fine = { value: input.penalty_rate / 100 };
    }
    if (input.discount_amount && input.discount_days) {
      paymentBody.discount = {
        value: input.discount_amount / 100,
        dueDateLimitDays: input.discount_days,
        type: 'FIXED',
      };
    }

    const payment = await this.request<{
      id: string;
      status: string;
      bankSlipUrl?: string;
      nossoNumero?: string;
    }>('POST', '/payments', paymentBody);

    // Get identification field (barcode/digitable line)
    const identField = await this.request<{
      identificationField: string;
      nossoNumero: string;
      barCode: string;
    }>('GET', `/payments/${payment.id}/identificationField`).catch(() => ({
      identificationField: '',
      nossoNumero: '',
      barCode: '',
    }));

    // Try to get PIX QR for hybrid boleto
    const pixData = await this.request<{
      encodedImage: string;
      payload: string;
    }>('GET', `/payments/${payment.id}/pixQrCode`).catch(() => null);

    return {
      transaction_id: transactionId,
      provider_id: payment.id,
      barcode: identField.barCode || '',
      digitable_line: identField.identificationField || '',
      pdf_url: payment.bankSlipUrl,
      pix_qr_code: pixData?.encodedImage,
      pix_copy_paste: pixData?.payload,
      due_date: input.due_date,
      status: mapAsaasStatus(payment.status),
    };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const refundId = generateUUID();

    const body: Record<string, unknown> = {};
    if (input.amount) {
      body.value = input.amount / 100;
    }

    await this.request('POST', `/payments/${input.transaction_id}/refund`, body);

    return {
      refund_id: refundId,
      original_transaction_id: input.transaction_id,
      amount: input.amount ?? 0,
      status: 'refunded',
    };
  }

  async getTransactionStatus(provider_id: string): Promise<TransactionStatus> {
    const payment = await this.request<{ status: string }>('GET', `/payments/${provider_id}`);
    return mapAsaasStatus(payment.status);
  }

  async parseWebhook(headers: Record<string, string>, body: unknown): Promise<WebhookEvent> {
    return parseAsaasWebhook(headers, body);
  }
}
