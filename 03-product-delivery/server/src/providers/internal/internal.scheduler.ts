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
/**
 * Settle a single transaction by ID. Extraído do scheduler para ser reusável
 * pelo endpoint externo (POST /pay/internal/pix-settled).
 *
 * Atualiza transaction pra 'completed', registra webhook event, entrega
 * callback ao source_app e processa splits. Para Pix, OPCIONALMENTE debita
 * no bank — omitido quando o débito já aconteceu externamente (ex.: o user
 * pagou via copia-e-cola no bank, que credita direto a plataforma).
 */
export function settleTransaction(
  transactionId: string,
  opts: { skipBankDebit?: boolean } = {}
): boolean {
  const db = getDb();

  // Atualiza status (idempotente via WHERE status='pending')
  const updateResult = db.prepare(
    `UPDATE transactions SET status = 'completed', completed_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ? AND status = 'pending'`
  ).run(transactionId);

  if (updateResult.changes === 0) {
    // Já processada ou inexistente
    return false;
  }

  const tx = db.prepare(
    'SELECT id, source_app, provider_id, type, amount, status, callback_url, metadata FROM transactions WHERE id = ?'
  ).get(transactionId) as TransactionRow | undefined;

  if (!tx) return false;

  // Webhook event interno
  const eventId = generateUUID();
  db.prepare(
    `INSERT INTO webhook_events (id, event_id, provider, event_type, transaction_id, payload, processed)
     VALUES (?, ?, 'internal', 'payment_confirmed', ?, ?, 1)`
  ).run(
    generateUUID(),
    eventId,
    transactionId,
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

  // Callback ao source_app (fire-and-forget; retry scheduler lida com falhas)
  if (tx.callback_url) {
    deliverCallback(tx).catch(() => {});
  }

  // Splits (fire-and-forget)
  settleSplits(transactionId).catch((err) => {
    console.error(`[settle] Split settlement failed for tx ${transactionId}:`, (err as Error).message);
  });

  // Pix: debitar payer no bank (skip se já debitado externamente)
  if (tx.type === 'pix' && !opts.skipBankDebit) {
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

  return true;
}

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
        // Checa tipo antes de settlar: Pix NÃO é auto-settled pelo scheduler.
        // Pix aguarda notificação externa do bank (POST /pay/internal/pix-settled)
        // que o usuário de fato pagou via copia-e-cola.
        const tx = db.prepare(
          'SELECT type FROM transactions WHERE id = ?'
        ).get(settlement.transaction_id) as { type: string } | undefined;

        if (tx?.type === 'pix') {
          // Marca settlement como processado pra não ficar looping, mas NÃO
          // toca na transação — ela permanece 'pending' até confirmação externa.
          db.prepare(
            'UPDATE scheduled_settlements SET settled = 1 WHERE id = ?'
          ).run(settlement.id);
          continue;
        }

        // Não-Pix: segue o fluxo normal
        settleTransaction(settlement.transaction_id);
        db.prepare(
          'UPDATE scheduled_settlements SET settled = 1 WHERE id = ?'
        ).run(settlement.id);
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

  // Include the source app's API key in the callback so receivers can authenticate
  // the webhook. The receiver should validate the X-API-Key header against its own
  // configured value (it's the same shared secret used for outbound requests).
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const app = db
      .prepare('SELECT api_key FROM app_registrations WHERE app_name = ? AND is_active = 1')
      .get(tx.source_app) as { api_key?: string } | undefined;
    if (app?.api_key) headers['X-API-Key'] = app.api_key;
  } catch {
    // non-fatal — receiver will reject if it requires the header
  }

  try {
    const response = await fetch(tx.callback_url, {
      method: 'POST',
      headers,
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
