import type { FastifyInstance } from 'fastify';
import { getDb } from '../../database/connection.js';
import { ProviderFactory } from '../../providers/provider.factory.js';

/**
 * Admin dashboard routes — KPIs and aggregated data.
 */
export async function adminDashboardRoutes(app: FastifyInstance): Promise<void> {
  // GET /admin/dashboard
  app.get('/dashboard', async (request, reply) => {
    const db = getDb();

    // Total volume (sum of completed transaction amounts)
    const totalVolume = db.prepare(
      `SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE status = 'completed'`
    ).get() as { total: number };

    // Total transaction count
    const totalCount = db.prepare(
      'SELECT COUNT(*) as count FROM transactions'
    ).get() as { count: number };

    // Completed count
    const completedCount = db.prepare(
      `SELECT COUNT(*) as count FROM transactions WHERE status = 'completed'`
    ).get() as { count: number };

    // Failed count
    const failedCount = db.prepare(
      `SELECT COUNT(*) as count FROM transactions WHERE status = 'failed'`
    ).get() as { count: number };

    // Success rate
    const successRate = totalCount.count > 0
      ? Math.round((completedCount.count / totalCount.count) * 10000) / 100
      : 0;

    // By type
    const byType = db.prepare(
      `SELECT type, COUNT(*) as count, COALESCE(SUM(amount), 0) as volume
       FROM transactions GROUP BY type`
    ).all() as Array<{ type: string; count: number; volume: number }>;

    // By source app
    const byApp = db.prepare(
      `SELECT source_app, COUNT(*) as count, COALESCE(SUM(amount), 0) as volume
       FROM transactions GROUP BY source_app`
    ).all() as Array<{ source_app: string; count: number; volume: number }>;

    // By status
    const byStatus = db.prepare(
      `SELECT status, COUNT(*) as count FROM transactions GROUP BY status`
    ).all() as Array<{ status: string; count: number }>;

    // Last 10 transactions
    const recentTransactions = db.prepare(
      `SELECT id, source_app, type, amount, status, customer_name, created_at
       FROM transactions ORDER BY created_at DESC LIMIT 10`
    ).all();

    // Today's volume
    const todayVolume = db.prepare(
      `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
       FROM transactions WHERE date(created_at) = date('now')`
    ).get() as { total: number; count: number };

    // Provider info
    const provider = ProviderFactory.getProvider();

    return reply.send({
      total_volume: totalVolume.total,
      total_transactions: totalCount.count,
      completed_transactions: completedCount.count,
      failed_transactions: failedCount.count,
      success_rate: successRate,
      today: {
        volume: todayVolume.total,
        count: todayVolume.count,
      },
      by_type: byType,
      by_app: byApp,
      by_status: byStatus,
      recent_transactions: recentTransactions,
      provider: {
        name: provider.name,
        mode: ProviderFactory.getCurrentMode(),
      },
    });
  });
}
