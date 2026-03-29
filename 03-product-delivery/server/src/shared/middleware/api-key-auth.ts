import type { FastifyRequest, FastifyReply } from 'fastify';
import { getDb } from '../../database/connection.js';
import { AppError } from '../errors/app-error.js';
import { ErrorCode } from '../errors/error-codes.js';

/**
 * Middleware that authenticates apps via X-API-Key header.
 * Checks against app_registrations table.
 * Sets request.sourceApp with the authenticated app info.
 */
export async function apiKeyAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const apiKey = request.headers['x-api-key'] as string | undefined;

  if (!apiKey) {
    throw new AppError(401, ErrorCode.API_KEY_REQUIRED, 'X-API-Key header is required');
  }

  const db = getDb();
  const app = db.prepare(
    'SELECT id, app_name, callback_base_url, is_active FROM app_registrations WHERE api_key = ?'
  ).get(apiKey) as { id: string; app_name: string; callback_base_url: string; is_active: number } | undefined;

  if (!app) {
    throw new AppError(401, ErrorCode.API_KEY_INVALID, 'Invalid API key');
  }

  if (!app.is_active) {
    throw new AppError(403, ErrorCode.APP_INACTIVE, `App '${app.app_name}' is inactive`);
  }

  request.sourceApp = {
    id: app.id,
    app_name: app.app_name,
    callback_base_url: app.callback_base_url,
  };
}
