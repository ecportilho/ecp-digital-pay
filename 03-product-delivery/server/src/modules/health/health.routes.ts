import type { FastifyInstance } from 'fastify';
import { ProviderFactory } from '../../providers/provider.factory.js';

const startTime = Date.now();

/**
 * Health check route.
 * GET /pay/health — returns provider name, status, uptime.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (request, reply) => {
    const provider = ProviderFactory.getProvider();
    const uptimeMs = Date.now() - startTime;
    const uptimeSeconds = Math.floor(uptimeMs / 1000);

    return reply.send({
      status: 'ok',
      provider: provider.name,
      mode: ProviderFactory.getCurrentMode(),
      uptime: uptimeSeconds,
      timestamp: new Date().toISOString(),
    });
  });
}
