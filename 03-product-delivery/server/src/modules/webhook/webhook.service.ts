/**
 * Webhook service — processes incoming webhooks and manages event dedup.
 */

import { getDb } from '../../database/connection.js';
import { generateUUID } from '../../shared/utils/uuid.js';
import { ProviderFactory } from '../../providers/provider.factory.js';
import { sendCallback } from '../callback/callback.service.js';
import { auditLog } from '../../shared/utils/audit.js';

export async function processAsaasWebhook(headers: Record<string, string>, body: unknown): Promise<void> {
  const provider = ProviderFactory.getProvider();
  const event = await provider.parseWebhook(headers, body);
  const db = getDb();

  // Check dedup: if event_id already processed, skip
  const existing = db.prepare(
    'SELECT id FROM webhook_events WHERE event_id = ?'
  ).get(event.event_id) as { id: string } | undefined;

  if (existing) {
    return; // Already processed, idempotent response
  }

  // Store webhook event
  const webhookId = generateUUID();
  db.prepare(`
    INSERT INTO webhook_events (id, event_id, provider, event_type, transaction_id, payload, processed)
    VALUES (?, ?, ?, ?, ?, ?, 0)
  `).run(
    webhookId,
    event.event_id,
    provider.name,
    event.event_type,
    event.transaction_id || null,
    JSON.stringify(event.data),
  );

  // Update transaction status if we have a transaction_id
  if (event.transaction_id) {
    // Try to find by internal transaction_id first
    let tx = db.prepare('SELECT id, status FROM transactions WHERE id = ?').get(event.transaction_id) as { id: string; status: string } | undefined;

    // If not found, try by provider_id
    if (!tx && event.provider_id) {
      tx = db.prepare('SELECT id, status FROM transactions WHERE provider_id = ?').get(event.provider_id) as { id: string; status: string } | undefined;
    }

    if (tx) {
      // Map event type to new status
      let newStatus: string | null = null;
      if (event.event_type === 'payment_confirmed') newStatus = 'completed';
      else if (event.event_type === 'payment_failed') newStatus = 'failed';
      else if (event.event_type === 'payment_expired') newStatus = 'expired';
      else if (event.event_type === 'payment_cancelled') newStatus = 'cancelled';
      else if (event.event_type === 'refund_completed') newStatus = 'refunded';

      if (newStatus && newStatus !== tx.status) {
        const updateFields = newStatus === 'completed'
          ? `status = '${newStatus}', completed_at = datetime('now'), updated_at = datetime('now')`
          : newStatus === 'refunded'
            ? `status = '${newStatus}', refunded_at = datetime('now'), updated_at = datetime('now')`
            : `status = '${newStatus}', updated_at = datetime('now')`;

        db.prepare(`UPDATE transactions SET ${updateFields} WHERE id = ?`).run(tx.id);

        // Trigger callback to source app
        sendCallback(tx.id).catch((err) => {
          console.error(`[webhook] Error sending callback for transaction ${tx!.id}:`, err);
        });
      }
    }
  }

  // Mark webhook as processed
  db.prepare('UPDATE webhook_events SET processed = 1 WHERE id = ?').run(webhookId);

  auditLog({
    action: 'PROCESS_WEBHOOK',
    resource: 'webhook_event',
    resourceId: webhookId,
    metadata: { event_type: event.event_type, transaction_id: event.transaction_id },
  });
}

export async function getWebhookEvents(filters: Record<string, unknown>): Promise<unknown[]> {
  const db = getDb();

  let query = 'SELECT * FROM webhook_events WHERE 1=1';
  const params: unknown[] = [];

  if (filters.provider) {
    query += ' AND provider = ?';
    params.push(filters.provider);
  }

  if (filters.event_type) {
    query += ' AND event_type = ?';
    params.push(filters.event_type);
  }

  if (filters.transaction_id) {
    query += ' AND transaction_id = ?';
    params.push(filters.transaction_id);
  }

  if (filters.processed !== undefined) {
    query += ' AND processed = ?';
    params.push(filters.processed ? 1 : 0);
  }

  query += ' ORDER BY created_at DESC';

  const limit = (filters.limit as number) || 50;
  const offset = (filters.offset as number) || 0;
  query += ' LIMIT ? OFFSET ?';
  params.push(limit, offset);

  return db.prepare(query).all(...params);
}
