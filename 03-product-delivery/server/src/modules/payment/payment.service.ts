import type { PixChargeBody, CardChargeBody, BoletoBody, RefundBody, CreateTransactionSplitBody } from './payment.schema.js';
import type { PixChargeResult, CardChargeResult, BoletoResult, RefundResult, TransactionStatus } from '../../providers/payment-provider.interface.js';
import { ProviderFactory } from '../../providers/provider.factory.js';
import { getDb } from '../../database/connection.js';
import { generateUUID } from '../../shared/utils/uuid.js';
import { AppError } from '../../shared/errors/app-error.js';
import { ErrorCode } from '../../shared/errors/error-codes.js';
import { auditLog } from '../../shared/utils/audit.js';
import { createSplit } from '../split/split.service.js';
import { notifyBankCardPurchase } from './bank-card-notifier.js';

/**
 * Payment service — orchestrates: validate -> provider -> persist -> callback.
 */

interface TransactionRow {
  id: string;
  source_app: string;
  provider: string;
  provider_id: string;
  type: string;
  amount: number;
  currency: string;
  status: string;
  customer_name: string;
  customer_document: string;
  description: string | null;
  idempotency_key: string;
  pix_qr_code: string | null;
  pix_qr_code_text: string | null;
  pix_expiration: string | null;
  card_token: string | null;
  card_last4: string | null;
  card_brand: string | null;
  card_installments: number | null;
  boleto_barcode: string | null;
  boleto_digitable: string | null;
  boleto_due_date: string | null;
  boleto_pdf_url: string | null;
  boleto_pix_qr: string | null;
  metadata: string | null;
  callback_url: string | null;
  callback_status: string;
  callback_attempts: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  refunded_at: string | null;
}

/**
 * Check idempotency key and return existing result if found.
 */
function checkIdempotency(idempotencyKey: string): TransactionRow | null {
  const db = getDb();
  const existing = db.prepare(
    'SELECT * FROM transactions WHERE idempotency_key = ?'
  ).get(idempotencyKey) as TransactionRow | undefined;

  return existing ?? null;
}

/**
 * Finalize a transaction record: update source_app, idempotency_key, callback_url, metadata.
 * The internal adapter creates the row with placeholder values; this fills them in.
 */
function finalizeTransaction(
  transactionId: string,
  sourceApp: string,
  idempotencyKey: string,
  callbackUrl?: string,
  metadata?: Record<string, unknown>,
): void {
  const db = getDb();
  db.prepare(`
    UPDATE transactions SET
      source_app = ?,
      idempotency_key = ?,
      callback_url = ?,
      metadata = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    sourceApp,
    idempotencyKey,
    callbackUrl ?? null,
    metadata ? JSON.stringify(metadata) : null,
    transactionId,
  );
}

/**
 * Finalize card token source_app (for internal provider).
 */
function finalizeCardTokenSourceApp(customerDocument: string, sourceApp: string): void {
  const db = getDb();
  db.prepare(
    `UPDATE card_tokens SET source_app = ? WHERE customer_document = ? AND source_app = '__pending__'`
  ).run(sourceApp, customerDocument);
}

/**
 * Process inline splits if provided in the payment request body.
 */
async function processInlineSplits(
  transactionId: string,
  splits?: Array<{ account_id: string; account_name: string; amount: number; type: 'fixed' | 'percentage' }>,
) {
  if (!splits || splits.length === 0) return undefined;

  return createSplit({
    transaction_id: transactionId,
    splits,
  });
}

export async function createPixCharge(
  body: PixChargeBody,
  sourceApp: string,
  idempotencyKey: string,
  callbackUrl?: string,
): Promise<PixChargeResult> {
  // Check idempotency
  const existing = checkIdempotency(idempotencyKey);
  if (existing) {
    return {
      transaction_id: existing.id,
      provider_id: existing.provider_id,
      qr_code: existing.pix_qr_code || '',
      qr_code_text: existing.pix_qr_code_text || '',
      expiration: existing.pix_expiration || '',
      status: existing.status as TransactionStatus,
    };
  }

  const provider = ProviderFactory.getProvider();
  const result = await provider.createPixCharge({
    amount: body.amount,
    customer_name: body.customer_name,
    customer_document: body.customer_document,
    description: body.description,
    expiration_seconds: body.expiration_seconds,
  });

  // Finalize the transaction record with source_app and idempotency
  finalizeTransaction(result.transaction_id, sourceApp, idempotencyKey, callbackUrl || body.callback_url, body.metadata);

  // Process inline splits if provided
  const splits = await processInlineSplits(result.transaction_id, body.splits);

  auditLog({
    action: 'CREATE_PIX_CHARGE',
    resource: 'transaction',
    resourceId: result.transaction_id,
    metadata: { source_app: sourceApp, amount: body.amount, provider: provider.name },
  });

  return splits ? { ...result, splits } : result;
}

export async function createCardCharge(
  body: CardChargeBody,
  sourceApp: string,
  idempotencyKey: string,
  callbackUrl?: string,
): Promise<CardChargeResult> {
  // Check idempotency
  const existing = checkIdempotency(idempotencyKey);
  if (existing) {
    return {
      transaction_id: existing.id,
      provider_id: existing.provider_id,
      status: existing.status as TransactionStatus,
      card_token: existing.card_token ?? undefined,
      card_last4: existing.card_last4 ?? undefined,
      card_brand: existing.card_brand ?? undefined,
    };
  }

  const provider = ProviderFactory.getProvider();
  const result = await provider.createCardCharge({
    amount: body.amount,
    customer_name: body.customer_name,
    customer_document: body.customer_document,
    description: body.description,
    card_token: body.card_token,
    card_number: body.card_number,
    card_expiry: body.card_expiry,
    card_cvv: body.card_cvv,
    card_holder_name: body.card_holder_name,
    save_card: body.save_card,
    installments: body.installments,
  });

  // Finalize the transaction record
  finalizeTransaction(result.transaction_id, sourceApp, idempotencyKey, callbackUrl || body.callback_url, body.metadata);
  finalizeCardTokenSourceApp(body.customer_document, sourceApp);

  // Process inline splits if provided
  const splits = await processInlineSplits(result.transaction_id, body.splits);

  auditLog({
    action: 'CREATE_CARD_CHARGE',
    resource: 'transaction',
    resourceId: result.transaction_id,
    metadata: { source_app: sourceApp, amount: body.amount, provider: provider.name },
  });

  // Notify bank to register purchase on cardholder's invoice (async, non-blocking)
  if (body.card_number && result.status === 'completed') {
    notifyBankCardPurchase({
      card_number: body.card_number,
      amount: body.amount,
      description: body.description || `Pagamento ${sourceApp}`,
      merchant_name: sourceApp === 'ecp-food' ? 'FoodFlow Delivery' : sourceApp,
      merchant_category: sourceApp === 'ecp-food' ? 'Alimentacao' : 'Pagamentos',
      transaction_id: result.transaction_id,
    }).catch(() => {}); // fire-and-forget
  }

  return splits ? { ...result, splits } : result;
}

export async function createBoleto(
  body: BoletoBody,
  sourceApp: string,
  idempotencyKey: string,
  callbackUrl?: string,
): Promise<BoletoResult> {
  // Check idempotency
  const existing = checkIdempotency(idempotencyKey);
  if (existing) {
    return {
      transaction_id: existing.id,
      provider_id: existing.provider_id,
      barcode: existing.boleto_barcode || '',
      digitable_line: existing.boleto_digitable || '',
      pdf_url: existing.boleto_pdf_url ?? undefined,
      pix_qr_code: undefined,
      pix_copy_paste: existing.boleto_pix_qr ?? undefined,
      due_date: existing.boleto_due_date || '',
      status: existing.status as TransactionStatus,
    };
  }

  const provider = ProviderFactory.getProvider();
  const result = await provider.createBoleto({
    amount: body.amount,
    customer_name: body.customer_name,
    customer_document: body.customer_document,
    customer_email: body.customer_email,
    due_date: body.due_date,
    description: body.description,
    interest_rate: body.interest_rate,
    penalty_rate: body.penalty_rate,
    discount_amount: body.discount_amount,
    discount_days: body.discount_days,
  });

  // Finalize the transaction record
  finalizeTransaction(result.transaction_id, sourceApp, idempotencyKey, callbackUrl || body.callback_url, body.metadata);

  // Process inline splits if provided
  const splits = await processInlineSplits(result.transaction_id, body.splits);

  auditLog({
    action: 'CREATE_BOLETO',
    resource: 'transaction',
    resourceId: result.transaction_id,
    metadata: { source_app: sourceApp, amount: body.amount, provider: provider.name },
  });

  return splits ? { ...result, splits } : result;
}

export async function getTransaction(transactionId: string): Promise<Record<string, unknown> | null> {
  const db = getDb();
  const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(transactionId) as TransactionRow | undefined;

  if (!tx) return null;

  // Parse metadata JSON
  const metadata = tx.metadata ? JSON.parse(tx.metadata) : null;

  // Get splits if any
  const splits = db.prepare('SELECT * FROM splits WHERE transaction_id = ?').all(transactionId);

  // Get refunds if any
  const refunds = db.prepare('SELECT * FROM refunds WHERE transaction_id = ?').all(transactionId);

  return {
    ...tx,
    metadata,
    splits,
    refunds,
  };
}

export async function createTransactionSplit(
  transactionId: string,
  body: CreateTransactionSplitBody,
  sourceApp: string,
) {
  const db = getDb();
  const tx = db.prepare('SELECT id FROM transactions WHERE id = ?').get(transactionId) as { id: string } | undefined;
  if (!tx) {
    throw new AppError(404, ErrorCode.TRANSACTION_NOT_FOUND, 'Transaction not found');
  }

  // Check if splits already exist for this transaction
  const existingSplits = db.prepare('SELECT COUNT(*) as count FROM splits WHERE transaction_id = ?').get(transactionId) as { count: number };
  if (existingSplits.count > 0) {
    throw new AppError(409, ErrorCode.SPLIT_ALREADY_EXISTS, 'Splits already exist for this transaction');
  }

  const splits = await createSplit({
    transaction_id: transactionId,
    splits: body.splits,
  });

  auditLog({
    action: 'CREATE_TRANSACTION_SPLIT',
    resource: 'split',
    resourceId: transactionId,
    metadata: { source_app: sourceApp, split_count: body.splits.length },
  });

  return splits;
}

export async function refundTransaction(
  transactionId: string,
  body: RefundBody,
  sourceApp: string,
): Promise<RefundResult> {
  const db = getDb();
  const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(transactionId) as TransactionRow | undefined;

  if (!tx) {
    throw new AppError(404, ErrorCode.TRANSACTION_NOT_FOUND, 'Transaction not found');
  }

  const provider = ProviderFactory.getProvider();

  // For Asaas, we need to pass the provider_id; for internal, the transaction_id
  const refundInput = {
    transaction_id: provider.name === 'asaas' ? tx.provider_id : transactionId,
    amount: body.amount,
  };

  const result = await provider.refund(refundInput);

  // Overwrite with our internal transaction_id
  result.original_transaction_id = transactionId;

  auditLog({
    action: 'REFUND_TRANSACTION',
    resource: 'transaction',
    resourceId: transactionId,
    metadata: { source_app: sourceApp, amount: body.amount ?? tx.amount, provider: provider.name },
  });

  return result;
}
