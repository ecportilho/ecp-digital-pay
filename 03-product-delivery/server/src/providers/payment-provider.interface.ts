// server/src/providers/payment-provider.interface.ts
// Complete provider interface from tech_spec.md Section 3.1

export interface PixChargeInput {
  amount: number;              // centavos
  customer_name: string;
  customer_document: string;   // CPF ou CNPJ
  description?: string;
  expiration_seconds?: number; // default 3600 (1h)
}

export interface PixChargeResult {
  transaction_id: string;      // UUID interno do ecp-pay
  provider_id: string;         // ID no provider externo (ou UUID interno)
  qr_code: string;             // base64 da imagem QR
  qr_code_text: string;        // pix copia e cola
  expiration: string;          // ISO datetime
  status: TransactionStatus;
}

export interface CardChargeInput {
  amount: number;
  customer_name: string;
  customer_document: string;
  description?: string;
  card_token?: string;         // se já salvo no cofre
  card_number?: string;        // se novo (será tokenizado)
  card_expiry?: string;
  card_cvv?: string;
  card_holder_name?: string;
  save_card?: boolean;
  installments?: number;       // 1-12
}

export interface CardChargeResult {
  transaction_id: string;
  provider_id: string;
  status: TransactionStatus;
  card_token?: string;         // retornado se save_card=true
  card_last4?: string;
  card_brand?: string;
}

export interface BoletoInput {
  amount: number;
  customer_name: string;
  customer_document: string;
  customer_email?: string;
  due_date: string;            // YYYY-MM-DD
  description?: string;
  interest_rate?: number;      // basis points (100 = 1%)
  penalty_rate?: number;       // basis points
  discount_amount?: number;    // centavos
  discount_days?: number;
}

export interface BoletoResult {
  transaction_id: string;
  provider_id: string;
  barcode: string;             // 47 dígitos
  digitable_line: string;
  pdf_url?: string;
  pix_qr_code?: string;       // QR Code Pix embutido no boleto
  pix_copy_paste?: string;
  due_date: string;
  status: TransactionStatus;
}

export interface RefundInput {
  transaction_id: string;
  amount?: number;             // parcial (centavos) ou undefined = total
}

export interface RefundResult {
  refund_id: string;
  original_transaction_id: string;
  amount: number;
  status: TransactionStatus;
}

export interface WebhookEvent {
  event_id: string;
  event_type: string;          // payment_confirmed | payment_failed | refund_completed | ...
  transaction_id: string;      // ID interno do ecp-pay
  provider_id: string;
  data: Record<string, unknown>;
  received_at: string;
}

export type TransactionStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'refunded'
  | 'partially_refunded'
  | 'expired'
  | 'cancelled';

export interface PaymentProvider {
  readonly name: string;       // "asaas" | "internal" | "stripe"

  createPixCharge(input: PixChargeInput): Promise<PixChargeResult>;
  createCardCharge(input: CardChargeInput): Promise<CardChargeResult>;
  createBoleto(input: BoletoInput): Promise<BoletoResult>;
  refund(input: RefundInput): Promise<RefundResult>;
  getTransactionStatus(provider_id: string): Promise<TransactionStatus>;
  parseWebhook(headers: Record<string, string>, body: unknown): Promise<WebhookEvent>;
}
