import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ProviderFactory } from '../../providers/provider.factory.js';
import { getDb } from '../../database/connection.js';

const switchProviderSchema = z.object({
  mode: z.enum(['internal', 'external']),
});

/**
 * Admin provider routes — view and switch providers.
 */
export async function adminProvidersRoutes(app: FastifyInstance): Promise<void> {
  // GET /admin/providers
  app.get('/providers', async (request, reply) => {
    const provider = ProviderFactory.getProvider();
    const db = getDb();

    // Provider stats
    const stats = db.prepare(
      `SELECT provider,
        COUNT(*) as total_transactions,
        COALESCE(SUM(amount), 0) as total_volume,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
       FROM transactions GROUP BY provider`
    ).all();

    return reply.send({
      active_provider: provider.name,
      mode: ProviderFactory.getCurrentMode(),
      config: {
        asaas_configured: !!process.env.ASAAS_API_KEY,
        asaas_sandbox: process.env.ASAAS_SANDBOX === 'true',
        internal_simulation_delay: parseInt(process.env.INTERNAL_SIMULATION_DELAY || '3000'),
      },
      stats,
    });
  });

  // POST /admin/providers/switch
  app.post('/providers/switch', async (request, reply) => {
    const { mode } = switchProviderSchema.parse(request.body);
    const userId = request.adminUser?.id ?? 'system';
    const previousMode = ProviderFactory.getCurrentMode();

    ProviderFactory.switchProvider(mode, userId);

    return reply.send({
      status: 'ok',
      previous_mode: previousMode,
      mode,
      provider: ProviderFactory.getProvider().name,
    });
  });
}
