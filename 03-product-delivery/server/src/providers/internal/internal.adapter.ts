import { createHash } from 'node:crypto';
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
import { getDb } from '../../database/connection.js';
import { generateUUID } from '../../shared/utils/uuid.js';
import { generatePixQrCode } from './internal.qrcode.js';
import { generateBoleto } from './internal.boleto.js';
import { scheduleSettlement } from './internal.scheduler.js';
import { AppError } from '../../shared/errors/app-error.js';
import { ErrorCode } from '../../shared/errors/error-codes.js';

/**
 * Internal adapter — implements PaymentProvider for INTERNAL mode.
 * All operations are simulated locally without external API calls.
 */
export class InternalAdapter implements PaymentProvider {
  readonly name = 'internal';
  private simulationDelay: number;

  constructor() {
    this.simulationDelay = parseInt(process.env.INTERNAL_SIMULATION_DELAY || '3000');
  }

  async createPixCharge(input: PixChargeInput): Promise<PixChargeResult> {
    const transactionId = generateUUID();
    const providerId = `int_pix_${transactionId}`;
    const expirationSeconds = input.expiration_seconds ?? 3600;
    const expiration = new Date(Date.now() + expirationSeconds * 1000).toISOString();

    // Generate QR code
    const { qrCode, qrCodeText } = generatePixQrCode(transactionId, input.amount);

    // Store transaction in DB
    const db = getDb();
    db.prepare(`
      INSERT INTO transactions (id, source_app, provider, provider_id, type, amount, status,
        customer_name, customer_document, description, idempotency_key,
        pix_qr_code, pix_qr_code_text, pix_expiration)
      VALUES (?, '__pending__', 'internal', ?, 'pix', ?, 'pending',
        ?, ?, ?, ?,
        ?, ?, ?)
    `).run(
      transactionId, providerId, input.amount,
      input.customer_name, input.customer_document, input.description ?? null, `__pending_${transactionId}__`,
      qrCode, qrCodeText, expiration,
    );

    // Schedule automatic settlement
    scheduleSettlement(transactionId, this.simulationDelay);

    return {
      transaction_id: transactionId,
      provider_id: providerId,
      qr_code: qrCode,
      qr_code_text: qrCodeText,
      expiration,
      status: 'pending',
    };
  }

  async createCardCharge(input: CardChargeInput): Promise<CardChargeResult> {
    const transactionId = generateUUID();
    const providerId = `int_card_${transactionId}`;

    // Determine card last4 and brand
    let last4: string;
    let brand: string;
    let cardToken: string | undefined;

    if (input.card_token) {
      // Look up existing token
      const db = getDb();
      const tokenRow = db.prepare(
        'SELECT token, last4, brand FROM card_tokens WHERE token = ? AND is_active = 1'
      ).get(input.card_token) as { token: string; last4: string; brand: string } | undefined;

      if (!tokenRow) {
        throw new AppError(404, ErrorCode.CARD_TOKEN_NOT_FOUND, 'Card token not found or inactive');
      }
      last4 = tokenRow.last4;
      brand = tokenRow.brand;
      cardToken = tokenRow.token;
    } else {
      // New card
      last4 = input.card_number!.slice(-4);
      brand = detectBrand(input.card_number!);

      // RN-05 / RN-06: Business rules for rejection
      if (last4 === '9999') {
        throw new AppError(400, ErrorCode.CARD_DECLINED, 'Card declined (test card ending 9999)');
      }

      if (input.amount > 1000000) {
        // R$ 10.000,00 = 1_000_000 centavos
        throw new AppError(400, ErrorCode.LIMIT_EXCEEDED, 'Transaction amount exceeds limit of R$ 10.000,00');
      }

      // Generate token if save_card
      if (input.save_card) {
        const hash = createHash('sha256').update(`${input.card_number}:${input.card_expiry}`).digest('hex');
        cardToken = `tok_internal_${hash.slice(0, 16)}`;

        // Parse expiry
        const [expiryMonth, expiryYear] = parseExpiry(input.card_expiry!);

        // Save to card vault
        const db = getDb();
        const existing = db.prepare(
          'SELECT id FROM card_tokens WHERE token = ? AND is_active = 1'
        ).get(cardToken) as { id: string } | undefined;

        if (!existing) {
          db.prepare(`
            INSERT INTO card_tokens (id, customer_document, provider, token, last4, brand, holder_name, expiry_month, expiry_year, is_active, source_app)
            VALUES (?, ?, 'internal', ?, ?, ?, ?, ?, ?, 1, '__pending__')
          `).run(
            generateUUID(), input.customer_document, cardToken,
            last4, brand, input.card_holder_name ?? input.customer_name,
            expiryMonth, expiryYear,
          );
        }
      }
    }

    // Card charges are synchronous: immediately completed
    const status: TransactionStatus = 'completed';

    // Store transaction
    const db = getDb();
    db.prepare(`
      INSERT INTO transactions (id, source_app, provider, provider_id, type, amount, status,
        customer_name, customer_document, description, idempotency_key,
        card_token, card_last4, card_brand, card_installments, completed_at)
      VALUES (?, '__pending__', 'internal', ?, 'card', ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, datetime('now'))
    `).run(
      transactionId, providerId, input.amount, status,
      input.customer_name, input.customer_document, input.description ?? null, `__pending_${transactionId}__`,
      cardToken ?? null, last4, brand, input.installments ?? 1,
    );

    return {
      transaction_id: transactionId,
      provider_id: providerId,
      status,
      card_token: cardToken,
      card_last4: last4,
      card_brand: brand,
    };
  }

  async createBoleto(input: BoletoInput): Promise<BoletoResult> {
    const transactionId = generateUUID();
    const providerId = `int_boleto_${transactionId}`;

    // Generate barcode and digitable line
    const { barcode, digitableLine } = generateBoleto(transactionId, input.amount, input.due_date);

    // Generate embedded Pix QR for boleto
    const { qrCode: pixQr, qrCodeText: pixCopyPaste } = generatePixQrCode(transactionId, input.amount);

    // Store transaction
    const db = getDb();
    db.prepare(`
      INSERT INTO transactions (id, source_app, provider, provider_id, type, amount, status,
        customer_name, customer_document, description, idempotency_key,
        boleto_barcode, boleto_digitable, boleto_due_date, boleto_pix_qr)
      VALUES (?, '__pending__', 'internal', ?, 'boleto', ?, 'pending',
        ?, ?, ?, ?,
        ?, ?, ?, ?)
    `).run(
      transactionId, providerId, input.amount,
      input.customer_name, input.customer_document, input.description ?? null, `__pending_${transactionId}__`,
      barcode, digitableLine, input.due_date, pixCopyPaste,
    );

    return {
      transaction_id: transactionId,
      provider_id: providerId,
      barcode,
      digitable_line: digitableLine,
      pix_qr_code: pixQr,
      pix_copy_paste: pixCopyPaste,
      due_date: input.due_date,
      status: 'pending',
    };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const db = getDb();
    const tx = db.prepare(
      'SELECT id, amount, status, type FROM transactions WHERE id = ?'
    ).get(input.transaction_id) as { id: string; amount: number; status: string; type: string } | undefined;

    if (!tx) {
      throw new AppError(404, ErrorCode.TRANSACTION_NOT_FOUND, 'Transaction not found');
    }

    if (tx.type === 'boleto') {
      throw new AppError(400, ErrorCode.TRANSACTION_NOT_REFUNDABLE, 'Boleto transactions cannot be refunded');
    }

    if (tx.status === 'refunded') {
      throw new AppError(400, ErrorCode.TRANSACTION_ALREADY_REFUNDED, 'Transaction already fully refunded');
    }

    if (tx.status !== 'completed' && tx.status !== 'partially_refunded') {
      throw new AppError(400, ErrorCode.TRANSACTION_NOT_REFUNDABLE, `Cannot refund transaction with status '${tx.status}'`);
    }

    const refundAmount = input.amount ?? tx.amount;
    const refundId = generateUUID();
    const isPartial = refundAmount < tx.amount;
    const newStatus: TransactionStatus = isPartial ? 'partially_refunded' : 'refunded';

    // Insert refund record
    db.prepare(`
      INSERT INTO refunds (id, transaction_id, provider_refund_id, amount, status, completed_at)
      VALUES (?, ?, ?, ?, 'completed', datetime('now'))
    `).run(refundId, input.transaction_id, `int_refund_${refundId}`, refundAmount);

    // Update transaction status
    db.prepare(`
      UPDATE transactions SET status = ?, refunded_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(newStatus, input.transaction_id);

    return {
      refund_id: refundId,
      original_transaction_id: input.transaction_id,
      amount: refundAmount,
      status: newStatus,
    };
  }

  async getTransactionStatus(provider_id: string): Promise<TransactionStatus> {
    const db = getDb();
    const row = db.prepare(
      'SELECT status FROM transactions WHERE provider_id = ?'
    ).get(provider_id) as { status: TransactionStatus } | undefined;

    if (!row) {
      throw new AppError(404, ErrorCode.TRANSACTION_NOT_FOUND, `Transaction with provider_id '${provider_id}' not found`);
    }

    return row.status;
  }

  async parseWebhook(headers: Record<string, string>, body: unknown): Promise<WebhookEvent> {
    // In INTERNAL mode, webhooks are self-generated by the scheduler.
    // This method just parses the body directly.
    const data = body as Record<string, unknown>;

    return {
      event_id: (data.event_id as string) || generateUUID(),
      event_type: (data.event_type as string) || 'payment_confirmed',
      transaction_id: data.transaction_id as string,
      provider_id: data.provider_id as string,
      data,
      received_at: new Date().toISOString(),
    };
  }
}

/**
 * Detect card brand from card number.
 */
function detectBrand(cardNumber: string): string {
  const num = cardNumber.replace(/\s/g, '');
  if (/^4/.test(num)) return 'visa';
  if (/^5[1-5]/.test(num)) return 'mastercard';
  if (/^(636368|438935|504175|451416|636297)/.test(num) || /^(6362|6370|6375|6376)/.test(num)) return 'elo';
  if (/^3[47]/.test(num)) return 'amex';
  return 'unknown';
}

/**
 * Parse card expiry string (MM/YY or MM/YYYY) into [month, year].
 */
function parseExpiry(expiry: string): [number, number] {
  const parts = expiry.split('/');
  const month = parseInt(parts[0], 10);
  let year = parseInt(parts[1], 10);
  if (year < 100) year += 2000;
  return [month, year];
}
