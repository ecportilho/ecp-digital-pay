import type { FastifyInstance } from 'fastify';
import * as webhookService from './webhook.service.js';

/**
 * Webhook routes — receive webhooks from external providers.
 * Note: Asaas webhook endpoint does NOT require api-key-auth (authenticated by webhook token).
 */
export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  // POST /pay/webhooks/asaas — Receive Asaas webhook
  app.post('/webhooks/asaas', async (request, reply) => {
    await webhookService.processAsaasWebhook(
      request.headers as Record<string, string>,
      request.body,
    );
    return reply.status(200).send({ received: true });
  });
}
