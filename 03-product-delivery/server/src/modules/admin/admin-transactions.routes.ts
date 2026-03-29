import type { FastifyInstance } from 'fastify';
import { getDb } from '../../database/connection.js';
import { AppError } from '../../shared/errors/app-error.js';
import { ErrorCode } from '../../shared/errors/error-codes.js';
import { auditLog } from '../../shared/utils/audit.js';
import { ProviderFactory } from '../../providers/provider.factory.js';

/**
 * Admin transaction routes — list, detail, summary, simulate payment.
 */
export async function adminTransactionsRoutes(app: FastifyInstance): Promise<void> {
  // GET /admin/transactions — paginated list with filters
  app.get('/transactions', async (request, reply) => {
    const db = getDb();
    const query = request.query as Record<string, string | undefined>;

    let sql = 'SELECT * FROM transactions WHERE 1=1';
    const params: unknown[] = [];

    if (query.type) {
      sql += ' AND type = ?';
      params.push(query.type);
    }
    if (query.status) {
      sql += ' AND status = ?';
      params.push(query.status);
    }
    if (query.source_app) {
      sql += ' AND source_app = ?';
      params.push(query.source_app);
    }
    if (query.start_date) {
      sql += ' AND created_at >= ?';
      params.push(query.start_date);
    }
    if (query.end_date) {
      sql += ' AND created_at <= ?';
      params.push(query.end_date);
    }
    if (query.search) {
      sql += ' AND (customer_name LIKE ? OR customer_document LIKE ? OR id LIKE ?)';
      const searchTerm = `%${query.search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }
    if (query.min_amount) {
      sql += ' AND amount >= ?';
      params.push(parseInt(query.min_amount));
    }
    if (query.max_amount) {
      sql += ' AND amount <= ?';
      params.push(parseInt(query.max_amount));
    }

    // Count total
    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
    const totalResult = db.prepare(countSql).get(...params) as { total: number };

    // Pagination
    const page = parseInt(query.page || '1');
    const limit = Math.min(parseInt(query.limit || '20'), 100);
    const offset = (page - 1) * limit;

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const transactions = db.prepare(sql).all(...params);

    return reply.send({
      transactions,
      pagination: {
        total: totalResult.total,
        page,
        limit,
        pages: Math.ceil(totalResult.total / limit),
      },
    });
  });

  // GET /admin/transactions/summary — summary by type/app/period
  app.get('/transactions/summary', async (request, reply) => {
    const db = getDb();
    const query = request.query as Record<string, string | undefined>;

    // Summary by type
    const byType = db.prepare(
      `SELECT type,
        COUNT(*) as count,
        COALESCE(SUM(amount), 0) as total_amount,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END), 0) as completed_amount,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count
       FROM transactions GROUP BY type`
    ).all();

    // Summary by app
    const byApp = db.prepare(
      `SELECT source_app,
        COUNT(*) as count,
        COALESCE(SUM(amount), 0) as total_amount,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count
       FROM transactions GROUP BY source_app`
    ).all();

    // Daily volume (last 30 days)
    const daily = db.prepare(
      `SELECT date(created_at) as date,
        COUNT(*) as count,
        COALESCE(SUM(amount), 0) as volume
       FROM transactions
       WHERE created_at >= datetime('now', '-30 days')
       GROUP BY date(created_at)
       ORDER BY date ASC`
    ).all();

    return reply.send({
      by_type: byType,
      by_app: byApp,
      daily,
    });
  });

  // GET /admin/transactions/:id — full detail with timeline
  app.get('/transactions/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();

    const transaction = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!transaction) {
      throw new AppError(404, ErrorCode.TRANSACTION_NOT_FOUND, 'Transaction not found');
    }

    // Parse metadata
    if (transaction.metadata && typeof transaction.metadata === 'string') {
      try { transaction.metadata = JSON.parse(transaction.metadata as string); } catch { /* keep as string */ }
    }

    // Get splits
    const splits = db.prepare('SELECT * FROM splits WHERE transaction_id = ?').all(id);

    // Get refunds
    const refunds = db.prepare('SELECT * FROM refunds WHERE transaction_id = ?').all(id);

    // Get webhook events
    const webhookEvents = db.prepare('SELECT * FROM webhook_events WHERE transaction_id = ? ORDER BY created_at ASC').all(id);

    // Build timeline
    const timeline: Array<{ event: string; timestamp: string; details?: string }> = [];
    timeline.push({ event: 'created', timestamp: transaction.created_at as string });

    if (transaction.status === 'completed' && transaction.completed_at) {
      timeline.push({ event: 'completed', timestamp: transaction.completed_at as string });
    }
    if (transaction.status === 'refunded' && transaction.refunded_at) {
      timeline.push({ event: 'refunded', timestamp: transaction.refunded_at as string });
    }
    if (transaction.callback_status === 'delivered') {
      timeline.push({ event: 'callback_delivered', timestamp: transaction.updated_at as string });
    }

    // Add webhook events to timeline
    for (const we of webhookEvents as Array<{ event_type: string; created_at: string }>) {
      timeline.push({ event: `webhook:${we.event_type}`, timestamp: we.created_at });
    }

    // Sort timeline by timestamp
    timeline.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    return reply.send({
      ...transaction,
      splits,
      refunds,
      webhook_events: webhookEvents,
      timeline,
    });
  });

  // POST /admin/transactions/:id/simulate-payment — (internal mode only)
  app.post('/transactions/:id/simulate-payment', async (request, reply) => {
    const { id } = request.params as { id: string };
    const mode = ProviderFactory.getCurrentMode();

    if (mode !== 'internal') {
      throw new AppError(400, ErrorCode.PROVIDER_ERROR, 'Simulate payment is only available in INTERNAL mode');
    }

    const db = getDb();
    const tx = db.prepare('SELECT id, status FROM transactions WHERE id = ?').get(id) as { id: string; status: string } | undefined;

    if (!tx) {
      throw new AppError(404, ErrorCode.TRANSACTION_NOT_FOUND, 'Transaction not found');
    }

    if (tx.status !== 'pending') {
      throw new AppError(400, ErrorCode.TRANSACTION_ALREADY_COMPLETED, `Transaction is already '${tx.status}'`);
    }

    // Force complete
    db.prepare(
      `UPDATE transactions SET status = 'completed', completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
    ).run(id);

    // Mark any pending settlement as settled
    db.prepare(
      'UPDATE scheduled_settlements SET settled = 1 WHERE transaction_id = ? AND settled = 0'
    ).run(id);

    auditLog({
      userId: request.adminUser?.id,
      action: 'SIMULATE_PAYMENT',
      resource: 'transaction',
      resourceId: id,
      ipAddress: request.ip,
    });

    return reply.send({ status: 'ok', transaction_id: id, new_status: 'completed' });
  });
}
