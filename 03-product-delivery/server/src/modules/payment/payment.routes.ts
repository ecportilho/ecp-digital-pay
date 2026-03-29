import type { FastifyInstance } from 'fastify';
import { pixChargeSchema, cardChargeSchema, boletoSchema, refundSchema } from './payment.schema.js';
import * as paymentService from './payment.service.js';
import { AppError } from '../../shared/errors/app-error.js';
import { ErrorCode } from '../../shared/errors/error-codes.js';

/**
 * Payment routes — consumed by ecosystem apps.
 * All routes require api-key-auth middleware (registered in app.ts).
 */
export async function paymentRoutes(app: FastifyInstance): Promise<void> {
  // POST /pay/pix — Create Pix charge
  app.post('/pix', async (request, reply) => {
    const idempotencyKey = request.headers['x-idempotency-key'] as string;
    if (!idempotencyKey) {
      throw new AppError(400, ErrorCode.IDEMPOTENCY_KEY_REQUIRED, 'X-Idempotency-Key header is required');
    }

    const body = pixChargeSchema.parse(request.body);
    const result = await paymentService.createPixCharge(
      body,
      request.sourceApp!.app_name,
      idempotencyKey,
      body.callback_url ?? undefined,
    );
    return reply.status(201).send(result);
  });

  // POST /pay/card — Charge credit card
  app.post('/card', async (request, reply) => {
    const idempotencyKey = request.headers['x-idempotency-key'] as string;
    if (!idempotencyKey) {
      throw new AppError(400, ErrorCode.IDEMPOTENCY_KEY_REQUIRED, 'X-Idempotency-Key header is required');
    }

    const body = cardChargeSchema.parse(request.body);
    const result = await paymentService.createCardCharge(
      body,
      request.sourceApp!.app_name,
      idempotencyKey,
      body.callback_url ?? undefined,
    );
    return reply.status(201).send(result);
  });

  // POST /pay/boleto — Issue boleto
  app.post('/boleto', async (request, reply) => {
    const idempotencyKey = request.headers['x-idempotency-key'] as string;
    if (!idempotencyKey) {
      throw new AppError(400, ErrorCode.IDEMPOTENCY_KEY_REQUIRED, 'X-Idempotency-Key header is required');
    }

    const body = boletoSchema.parse(request.body);
    const result = await paymentService.createBoleto(
      body,
      request.sourceApp!.app_name,
      idempotencyKey,
      body.callback_url ?? undefined,
    );
    return reply.status(201).send(result);
  });

  // GET /pay/transactions/:id — Get transaction status
  app.get('/transactions/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const transaction = await paymentService.getTransaction(id);
    if (!transaction) {
      throw new AppError(404, ErrorCode.TRANSACTION_NOT_FOUND, 'Transaction not found');
    }
    return reply.send(transaction);
  });

  // POST /pay/transactions/:id/refund — Refund transaction
  app.post('/transactions/:id/refund', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = refundSchema.parse(request.body);
    const result = await paymentService.refundTransaction(id, body, request.sourceApp!.app_name);
    return reply.status(201).send(result);
  });
}
