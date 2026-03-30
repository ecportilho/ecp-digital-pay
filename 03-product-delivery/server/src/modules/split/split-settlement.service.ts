/**
 * Split settlement service.
 * Settles pending splits by calling external webhooks (ecp-digital-emps)
 * to credit restaurant accounts, and marks platform splits as settled directly.
 */

import { getDb } from '../../database/connection.js';

const EMPS_WEBHOOK_URL = process.env.ECP_EMPS_WEBHOOK_URL || 'http://localhost:3334/webhooks/payment-received';
const EMPS_WEBHOOK_SECRET = process.env.ECP_EMPS_WEBHOOK_SECRET || 'ecp-pay-webhook-secret-dev';

interface SplitRow {
  id: string;
  transaction_id: string;
  account_id: string;
  account_name: string;
  amount: number;
  status: string;
}

/**
 * Settle all pending splits for a given transaction.
 * - Platform splits (account_id starts with 'ecp-') are marked as settled directly.
 * - Restaurant splits trigger a webhook call to ecp-digital-emps to credit the PJ account.
 */
export async function settleSplits(transactionId: string): Promise<void> {
  const db = getDb();

  // Get transaction info
  const tx = db.prepare('SELECT id, source_app, status FROM transactions WHERE id = ?')
    .get(transactionId) as { id: string; source_app: string; status: string } | undefined;

  if (!tx || tx.status !== 'completed') return;

  // Get pending splits
  const splits = db.prepare(
    "SELECT id, transaction_id, account_id, account_name, amount, status FROM splits WHERE transaction_id = ? AND status = 'pending'"
  ).all(transactionId) as SplitRow[];

  for (const split of splits) {
    try {
      if (split.account_id === 'ecp-food-platform' || split.account_id.startsWith('ecp-')) {
        // Platform split — just mark as settled, no external call
        db.prepare("UPDATE splits SET status = 'settled' WHERE id = ?").run(split.id);
        console.log(`[settlement] Platform split ${split.id} settled (${split.amount} cents)`);
        continue;
      }

      // Restaurant split — call ecp-emps webhook
      const response = await fetch(EMPS_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': EMPS_WEBHOOK_SECRET,
        },
        body: JSON.stringify({
          transaction_id: tx.id,
          split_id: split.id,
          account_id: split.account_id,
          account_name: split.account_name,
          amount: split.amount,
          source_app: tx.source_app,
          description: `Recebido - Pedido ${tx.source_app}`,
          reference_id: `split-${split.id}`,
        }),
      });

      if (response.ok) {
        const result = await response.json() as { transaction_id?: string };
        db.prepare("UPDATE splits SET status = 'settled' WHERE id = ?").run(split.id);
        console.log(`[settlement] Split ${split.id} settled: ${split.account_name} credited ${split.amount} cents | emps_tx=${result.transaction_id || '-'}`);
      } else {
        const errText = await response.text().catch(() => 'unknown error');
        console.error(`[settlement] Split ${split.id} failed: ${response.status} ${errText}`);
        db.prepare("UPDATE splits SET status = 'failed' WHERE id = ?").run(split.id);
      }
    } catch (err) {
      console.error(`[settlement] Split ${split.id} error:`, (err as Error).message);
      // Leave as pending — will retry on next scheduler cycle
    }
  }
}
