/**
 * Callback service — notifies source apps when transaction status changes.
 */

import { getDb } from '../../database/connection.js';
import { auditLog } from '../../shared/utils/audit.js';

export interface CallbackPayload {
  event: string;
  transaction_id: string;
  external_id: string;
  type: string;
  amount: number;
  status: string;
  source_app: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

interface TransactionForCallback {
  id: string;
  source_app: string;
  provider_id: string;
  type: string;
  amount: number;
  status: string;
  callback_url: string | null;
  callback_status: string;
  callback_attempts: number;
  metadata: string | null;
}

/**
 * Build a callback payload from a transaction.
 */
function buildPayload(tx: TransactionForCallback): CallbackPayload {
  const eventMap: Record<string, string> = {
    completed: 'payment.completed',
    failed: 'payment.failed',
    refunded: 'payment.refunded',
    partially_refunded: 'payment.partially_refunded',
    expired: 'payment.expired',
    cancelled: 'payment.cancelled',
    pending: 'payment.pending',
    processing: 'payment.processing',
  };

  return {
    event: eventMap[tx.status] || `payment.${tx.status}`,
    transaction_id: tx.id,
    external_id: tx.provider_id,
    type: tx.type,
    amount: tx.amount,
    status: tx.status,
    source_app: tx.source_app,
    timestamp: new Date().toISOString(),
    metadata: tx.metadata ? JSON.parse(tx.metadata) : undefined,
  };
}

/**
 * Resolve the callback URL for a transaction.
 * Uses the transaction's callback_url if set, otherwise the app's callback_base_url.
 */
function resolveCallbackUrl(tx: TransactionForCallback): string | null {
  if (tx.callback_url) return tx.callback_url;

  const db = getDb();
  const app = db.prepare(
    'SELECT callback_base_url FROM app_registrations WHERE app_name = ? AND is_active = 1'
  ).get(tx.source_app) as { callback_base_url: string } | undefined;

  return app?.callback_base_url ?? null;
}

/**
 * Send a callback notification to the source app for a given transaction.
 */
export async function sendCallback(transactionId: string): Promise<void> {
  const db = getDb();
  const tx = db.prepare(
    `SELECT id, source_app, provider_id, type, amount, status, callback_url, callback_status, callback_attempts, metadata
     FROM transactions WHERE id = ?`
  ).get(transactionId) as TransactionForCallback | undefined;

  if (!tx) return;

  const callbackUrl = resolveCallbackUrl(tx);
  if (!callbackUrl) {
    // No callback URL configured — mark as delivered (nothing to do)
    db.prepare(
      `UPDATE transactions SET callback_status = 'delivered', updated_at = datetime('now') WHERE id = ?`
    ).run(transactionId);
    return;
  }

  const payload = buildPayload(tx);

  try {
    const response = await fetch(callbackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ECP-Pay-Event': payload.event,
        'X-ECP-Pay-Transaction': transactionId,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });

    if (response.ok) {
      db.prepare(
        `UPDATE transactions SET callback_status = 'delivered', callback_attempts = callback_attempts + 1, updated_at = datetime('now')
         WHERE id = ?`
      ).run(transactionId);
    } else {
      db.prepare(
        `UPDATE transactions SET callback_status = 'failed', callback_attempts = callback_attempts + 1, updated_at = datetime('now')
         WHERE id = ?`
      ).run(transactionId);
    }
  } catch {
    db.prepare(
      `UPDATE transactions SET callback_status = 'failed', callback_attempts = callback_attempts + 1, updated_at = datetime('now')
       WHERE id = ?`
    ).run(transactionId);
  }
}

/**
 * Retry failed callbacks that haven't exceeded max attempts.
 * RN-10: 3 attempts with exponential backoff (30s, 2min, 10min).
 */
export async function retryFailedCallbacks(): Promise<void> {
  const db = getDb();

  // Find transactions with failed callbacks and less than 3 attempts
  const failedTxs = db.prepare(
    `SELECT id FROM transactions
     WHERE callback_status = 'failed' AND callback_attempts < 3
     AND callback_url IS NOT NULL
     ORDER BY updated_at ASC
     LIMIT 10`
  ).all() as Array<{ id: string }>;

  for (const tx of failedTxs) {
    try {
      await sendCallback(tx.id);
    } catch (err) {
      console.error(`[callback] Retry failed for transaction ${tx.id}:`, err);
    }
  }

  // Mark transactions that exceeded max attempts as delivery_failed
  db.prepare(
    `UPDATE transactions SET callback_status = 'delivery_failed', updated_at = datetime('now')
     WHERE callback_status = 'failed' AND callback_attempts >= 3`
  ).run();
}
