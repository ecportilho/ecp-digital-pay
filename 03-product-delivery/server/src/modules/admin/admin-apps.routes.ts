import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDb } from '../../database/connection.js';
import { generateUUID } from '../../shared/utils/uuid.js';
import { AppError } from '../../shared/errors/app-error.js';
import { ErrorCode } from '../../shared/errors/error-codes.js';
import { auditLog } from '../../shared/utils/audit.js';

const createAppSchema = z.object({
  app_name: z.string().min(1),
  callback_base_url: z.string().url(),
  api_key: z.string().min(16).optional(),
});

const updateAppSchema = z.object({
  callback_base_url: z.string().url().optional(),
  is_active: z.boolean().optional(),
  regenerate_key: z.boolean().optional(),
});

/**
 * Admin apps routes — manage registered apps and API keys.
 */
export async function adminAppsRoutes(app: FastifyInstance): Promise<void> {
  // GET /admin/apps — list all registered apps with stats
  app.get('/apps', async (request, reply) => {
    const db = getDb();

    const apps = db.prepare(
      'SELECT id, app_name, api_key, callback_base_url, is_active, created_at, updated_at FROM app_registrations'
    ).all() as Array<Record<string, unknown>>;

    // Enrich with transaction stats
    for (const appRow of apps) {
      const stats = db.prepare(
        `SELECT COUNT(*) as total_transactions,
          COALESCE(SUM(amount), 0) as total_volume,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
         FROM transactions WHERE source_app = ?`
      ).get(appRow.app_name) as { total_transactions: number; total_volume: number; completed: number; failed: number };

      appRow.stats = stats;

      // Mask API key (show first 8 and last 4 chars)
      const key = appRow.api_key as string;
      if (key.length > 12) {
        appRow.api_key_masked = `${key.slice(0, 8)}...${key.slice(-4)}`;
      } else {
        appRow.api_key_masked = key;
      }
    }

    return reply.send({ apps });
  });

  // POST /admin/apps — register new app
  app.post('/apps', async (request, reply) => {
    const body = createAppSchema.parse(request.body);
    const db = getDb();
    const userId = request.adminUser?.id ?? 'system';

    // Check if app_name already exists
    const existing = db.prepare(
      'SELECT id FROM app_registrations WHERE app_name = ?'
    ).get(body.app_name);

    if (existing) {
      throw new AppError(409, ErrorCode.VALIDATION_ERROR, `App '${body.app_name}' already registered`);
    }

    const id = generateUUID();
    const apiKey = body.api_key || `${body.app_name}-${generateUUID().replace(/-/g, '').slice(0, 24)}`;

    db.prepare(`
      INSERT INTO app_registrations (id, app_name, api_key, callback_base_url, is_active)
      VALUES (?, ?, ?, ?, 1)
    `).run(id, body.app_name, apiKey, body.callback_base_url);

    auditLog({
      userId,
      action: 'CREATE_APP',
      resource: 'app_registration',
      resourceId: id,
      metadata: { app_name: body.app_name },
      ipAddress: request.ip,
    });

    return reply.status(201).send({
      id,
      app_name: body.app_name,
      api_key: apiKey,
      callback_base_url: body.callback_base_url,
      is_active: true,
    });
  });

  // PATCH /admin/apps/:id — update app registration
  app.patch('/apps/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateAppSchema.parse(request.body);
    const db = getDb();
    const userId = request.adminUser?.id ?? 'system';

    const existing = db.prepare(
      'SELECT id, app_name FROM app_registrations WHERE id = ?'
    ).get(id) as { id: string; app_name: string } | undefined;

    if (!existing) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'App registration not found');
    }

    const updates: string[] = [];
    const params: unknown[] = [];

    if (body.callback_base_url !== undefined) {
      updates.push('callback_base_url = ?');
      params.push(body.callback_base_url);
    }

    if (body.is_active !== undefined) {
      updates.push('is_active = ?');
      params.push(body.is_active ? 1 : 0);
    }

    let newApiKey: string | undefined;
    if (body.regenerate_key) {
      newApiKey = `${existing.app_name}-${generateUUID().replace(/-/g, '').slice(0, 24)}`;
      updates.push('api_key = ?');
      params.push(newApiKey);
    }

    if (updates.length > 0) {
      updates.push(`updated_at = datetime('now')`);
      params.push(id);
      db.prepare(`UPDATE app_registrations SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    auditLog({
      userId,
      action: 'UPDATE_APP',
      resource: 'app_registration',
      resourceId: id,
      metadata: { ...body, new_api_key: newApiKey ? '(regenerated)' : undefined },
      ipAddress: request.ip,
    });

    const updated = db.prepare('SELECT * FROM app_registrations WHERE id = ?').get(id);

    return reply.send({ status: 'ok', app: updated, ...(newApiKey ? { new_api_key: newApiKey } : {}) });
  });
}
