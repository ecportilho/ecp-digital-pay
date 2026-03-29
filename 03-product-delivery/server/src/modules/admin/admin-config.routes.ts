import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getAllFeatureFlags, setFeatureFlag } from '../../shared/utils/feature-flags.js';
import { getDb } from '../../database/connection.js';
import { auditLog } from '../../shared/utils/audit.js';

const patchFlagSchema = z.object({
  value: z.string().min(1),
});

/**
 * Admin config routes — feature flags, audit logs, and general settings.
 */
export async function adminConfigRoutes(app: FastifyInstance): Promise<void> {
  // GET /admin/feature-flags
  app.get('/feature-flags', async (request, reply) => {
    const db = getDb();
    const flags = db.prepare(
      'SELECT key, value, description, updated_by, updated_at FROM feature_flags'
    ).all();
    return reply.send({ flags });
  });

  // PATCH /admin/feature-flags/:key
  app.patch('/feature-flags/:key', async (request, reply) => {
    const { key } = request.params as { key: string };
    const { value } = patchFlagSchema.parse(request.body);
    const userId = request.adminUser?.id ?? 'system';

    const previousFlags = getAllFeatureFlags();
    const previousValue = previousFlags[key];

    setFeatureFlag(key, value, userId);

    auditLog({
      userId,
      action: 'UPDATE_FEATURE_FLAG',
      resource: 'feature_flag',
      resourceId: key,
      metadata: { previous_value: previousValue, new_value: value },
      ipAddress: request.ip,
    });

    return reply.send({ status: 'ok', key, value });
  });

  // GET /admin/audit-logs — paginated audit logs
  app.get('/audit-logs', async (request, reply) => {
    const db = getDb();
    const query = request.query as Record<string, string | undefined>;

    let sql = 'SELECT * FROM audit_logs WHERE 1=1';
    const params: unknown[] = [];

    if (query.action) {
      sql += ' AND action = ?';
      params.push(query.action);
    }
    if (query.resource) {
      sql += ' AND resource = ?';
      params.push(query.resource);
    }
    if (query.user_id) {
      sql += ' AND user_id = ?';
      params.push(query.user_id);
    }
    if (query.start_date) {
      sql += ' AND created_at >= ?';
      params.push(query.start_date);
    }
    if (query.end_date) {
      sql += ' AND created_at <= ?';
      params.push(query.end_date);
    }

    // Count
    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
    const totalResult = db.prepare(countSql).get(...params) as { total: number };

    // Pagination
    const page = parseInt(query.page || '1');
    const limit = Math.min(parseInt(query.limit || '20'), 100);
    const offset = (page - 1) * limit;

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const logs = db.prepare(sql).all(...params);

    // Parse metadata JSON
    for (const log of logs as Array<Record<string, unknown>>) {
      if (log.metadata && typeof log.metadata === 'string') {
        try { log.metadata = JSON.parse(log.metadata as string); } catch { /* keep as string */ }
      }
    }

    return reply.send({
      logs,
      pagination: {
        total: totalResult.total,
        page,
        limit,
        pages: Math.ceil(totalResult.total / limit),
      },
    });
  });

  // GET /admin/config — general configuration
  app.get('/config', async (request, reply) => {
    const flags = getAllFeatureFlags();

    return reply.send({
      payment_provider: flags.PAYMENT_PROVIDER || process.env.PAYMENT_PROVIDER || 'internal',
      asaas_configured: !!process.env.ASAAS_API_KEY,
      asaas_sandbox: process.env.ASAAS_SANDBOX === 'true',
      internal_simulation_delay: parseInt(process.env.INTERNAL_SIMULATION_DELAY || '3000'),
      cors_origin: process.env.CORS_ORIGIN || 'http://localhost:5175',
      node_env: process.env.NODE_ENV || 'development',
      callback_max_attempts: 3,
      callback_retry_delays: [30, 120, 600], // seconds
      rate_limit_per_minute: 100,
    });
  });

  // PATCH /admin/config — update general configuration
  app.patch('/config', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const userId = request.adminUser?.id ?? 'system';

    // Only allow updating feature flags through this endpoint
    if (body.payment_provider && typeof body.payment_provider === 'string') {
      setFeatureFlag('PAYMENT_PROVIDER', body.payment_provider, userId);
    }

    if (body.internal_simulation_delay && typeof body.internal_simulation_delay === 'number') {
      setFeatureFlag('INTERNAL_SIMULATION_DELAY', String(body.internal_simulation_delay), userId);
    }

    auditLog({
      userId,
      action: 'UPDATE_CONFIG',
      resource: 'config',
      metadata: body,
      ipAddress: request.ip,
    });

    return reply.send({ status: 'ok' });
  });
}
