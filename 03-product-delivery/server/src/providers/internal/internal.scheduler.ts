/**
 * Settlement scheduler for INTERNAL mode.
 * Periodically checks scheduled_settlements table and
 * moves transactions from 'pending' to 'completed'.
 */

import { getDb } from '../../database/connection.js';
import { generateUUID } from '../../shared/utils/uuid.js';
import { settleSplits } from '../../modules/split/split-settlement.service.js';
import { notifyBankPixDebit } from '../../modules/payment/bank-card-notifier.js';

let intervalId: ReturnType<typeof setInterval> | null = null;

interface ScheduledSettlement {
  id: string;
  transaction_id: string;
  settle_at: string;
  settled: number;
}

interface TransactionRow {
  id: string;
  source_app: string;
  provider_id: string;
  type: string;
  amount: number;
  status: string;
  callback_url: string | null;
  metadata: string | null;
}

/**
 * Process all pending settlements that are due.
 * Called periodically by the interval timer.
 */
function processSettlements(): void {
  try {
    const db = getDb();
    const now = new Date().toISOString();

    const pendingSettlements = db.prepare(
      `SELECT id, transaction_id, settle_at FROM scheduled_settlements
       WHERE settle_at <= ? AND settled = 0`
    ).all(now) as ScheduledSettlement[];

    for (const settlement of pendingSettlements) {
      try {
        // Update transaction to completed
        db.prepare(
          `UPDATE transactions SET status = 'completed', completed_at = datetime('now'), updated_at = datetime('now')
           WHERE id = ? AND status = 'pending'`
        ).run(settlement.transaction_id);

        // Mark settlement as processed
        db.prepare(
          'UPDATE scheduled_settlements SET settled = 1 WHERE id = ?'
        ).run(settlement.id);

        // Insert a webhook event for internal tracking
        const tx = db.prepare(
          'SELECT id, source_app, provider_id, type, amount, status, callback_url, metadata FROM transactions WHERE id = ?'
        ).get(settlement.transaction_id) as TransactionRow | undefined;

        if (tx) {
          const eventId = generateUUID();
          db.prepare(
            `INSERT INTO webhook_events (id, event_id, provider, event_type, transaction_id, payload, processed)
             VALUES (?, ?, 'internal', 'payment_confirmed', ?, ?, 1)`
          ).run(
            generateUUID(),
            eventId,
            settlement.transaction_id,
            JSON.stringify({
              event: 'payment.completed',
              transaction_id: tx.id,
              type: tx.type,
              amount: tx.amount,
              status: 'completed',
              source_app: tx.source_app,
              timestamp: new Date().toISOString(),
            }),
          );

          // Schedule callback delivery (async, fire and forget)
          if (tx.callback_url) {
            deliverCallback(tx).catch(() => {
              // Callback failures are handled by the retry scheduler
            });
          }

          // Settle pending splits for this transaction (async, fire and forget)
          settleSplits(settlement.transaction_id).catch((err) => {
            console.error(`[scheduler] Split settlement failed for tx ${settlement.transaction_id}:`, (err as Error).message);
          });

          // For Pix payments: debit payer's account in the bank
          if (tx.type === 'pix') {
            const txDoc = db.prepare('SELECT customer_document FROM transactions WHERE id = ?').get(tx.id) as { customer_document: string } | undefined;
            if (txDoc?.customer_document) {
              notifyBankPixDebit({
                cpf: txDoc.customer_document,
                amount: tx.amount,
                description: `Pix - ${tx.source_app}`,
                merchant_name: tx.source_app === 'ecp-food' ? 'FoodFlow Delivery' : tx.source_app,
                transaction_id: tx.id,
              }).catch(() => {});
            }
          }
        }
      } catch (err) {
        console.error(`[scheduler] Error processing settlement ${settlement.id}:`, err);
      }
    }
  } catch (err) {
    console.error('[scheduler] Error in processSettlements:', err);
  }
}

/**
 * Deliver callback to the source app after settlement.
 */
async function deliverCallback(tx: TransactionRow): Promise<void> {
  if (!tx.callback_url) return;

  const db = getDb();
  const payload = {
    event: 'payment.completed',
    transaction_id: tx.id,
    external_id: tx.provider_id,
    type: tx.type,
    amount: tx.amount,
    status: 'completed',
    source_app: tx.source_app,
    timestamp: new Date().toISOString(),
    metadata: tx.metadata ? JSON.parse(tx.metadata) : undefined,
  };

  try {
    const response = await fetch(tx.callback_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });

    if (response.ok) {
      db.prepare(
        `UPDATE transactions SET callback_status = 'delivered', callback_attempts = callback_attempts + 1, updated_at = datetime('now')
         WHERE id = ?`
      ).run(tx.id);
    } else {
      db.prepare(
        `UPDATE transactions SET callback_status = 'failed', callback_attempts = callback_attempts + 1, updated_at = datetime('now')
         WHERE id = ?`
      ).run(tx.id);
    }
  } catch {
    db.prepare(
      `UPDATE transactions SET callback_status = 'failed', callback_attempts = callback_attempts + 1, updated_at = datetime('now')
       WHERE id = ?`
    ).run(tx.id);
  }
}

/**
 * Schedule a settlement for a transaction after a delay.
 */
export function scheduleSettlement(transactionId: string, delayMs: number): void {
  const db = getDb();
  const settleAt = new Date(Date.now() + delayMs).toISOString();

  db.prepare(
    `INSERT INTO scheduled_settlements (id, transaction_id, settle_at, settled)
     VALUES (?, ?, ?, 0)`
  ).run(generateUUID(), transactionId, settleAt);
}

/**
 * Start the settlement scheduler. Checks every second for due settlements.
 */
export function startSettlementScheduler(): void {
  if (intervalId) return;

  intervalId = setInterval(processSettlements, 1000);
  console.log('[scheduler] Settlement scheduler started (INTERNAL mode)');
}

/**
 * Stop the settlement scheduler.
 */
export function stopSettlementScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  console.log('[scheduler] Settlement scheduler stopped');
}
