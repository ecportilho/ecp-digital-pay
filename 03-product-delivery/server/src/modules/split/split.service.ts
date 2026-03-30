import type { CreateSplitBody } from './split.schema.js';
import { getDb } from '../../database/connection.js';
import { generateUUID } from '../../shared/utils/uuid.js';
import { AppError } from '../../shared/errors/app-error.js';
import { ErrorCode } from '../../shared/errors/error-codes.js';
import { auditLog } from '../../shared/utils/audit.js';
import { settleSplits } from './split-settlement.service.js';

/**
 * Split service — handles payment split logic.
 */

interface SplitRow {
  id: string;
  transaction_id: string;
  account_id: string;
  account_name: string;
  amount: number;
  type: string;
  status: string;
  created_at: string;
}

export async function createSplit(body: CreateSplitBody): Promise<SplitRow[]> {
  const db = getDb();

  // Validate that transaction exists
  const tx = db.prepare(
    'SELECT id, amount FROM transactions WHERE id = ?'
  ).get(body.transaction_id) as { id: string; amount: number } | undefined;

  if (!tx) {
    throw new AppError(404, ErrorCode.TRANSACTION_NOT_FOUND, 'Transaction not found');
  }

  // RN-09: Validate that split amounts sum matches transaction total
  const totalSplit = body.splits.reduce((sum, s) => sum + s.amount, 0);
  if (totalSplit !== tx.amount) {
    throw new AppError(400, ErrorCode.SPLIT_AMOUNT_MISMATCH,
      `Split amounts sum (${totalSplit}) does not match transaction amount (${tx.amount})`);
  }

  // Insert split records
  const insertStmt = db.prepare(`
    INSERT INTO splits (id, transaction_id, account_id, account_name, amount, type, status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending')
  `);

  const results: SplitRow[] = [];

  const insertAll = db.transaction(() => {
    for (const split of body.splits) {
      const splitId = generateUUID();
      insertStmt.run(
        splitId,
        body.transaction_id,
        split.account_id,
        split.account_name,
        split.amount,
        split.type,
      );
      results.push({
        id: splitId,
        transaction_id: body.transaction_id,
        account_id: split.account_id,
        account_name: split.account_name,
        amount: split.amount,
        type: split.type,
        status: 'pending',
        created_at: new Date().toISOString(),
      });
    }
  });

  insertAll();

  auditLog({
    action: 'CREATE_SPLIT',
    resource: 'split',
    resourceId: body.transaction_id,
    metadata: { split_count: body.splits.length, total: totalSplit },
  });

  // Async settlement — don't block the response
  settleSplits(body.transaction_id).catch((err) => {
    console.error(`[split] Settlement failed for tx ${body.transaction_id}:`, (err as Error).message);
  });

  return results;
}

export async function getSplitsByTransaction(transactionId: string): Promise<SplitRow[]> {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM splits WHERE transaction_id = ? ORDER BY created_at ASC'
  ).all(transactionId) as SplitRow[];
}
