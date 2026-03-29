import type { FastifyInstance } from 'fastify';
import { listCardsParamsSchema, deleteTokenParamsSchema } from './card-vault.schema.js';
import * as cardVaultService from './card-vault.service.js';
import { AppError } from '../../shared/errors/app-error.js';
import { ErrorCode } from '../../shared/errors/error-codes.js';

/**
 * Card vault routes — manage tokenized cards.
 * All routes require api-key-auth middleware.
 */
export async function cardVaultRoutes(app: FastifyInstance): Promise<void> {
  // GET /pay/cards/:customer_document — List saved cards
  app.get('/cards/:customer_document', async (request, reply) => {
    const { customer_document } = listCardsParamsSchema.parse(request.params);
    const cards = await cardVaultService.listCardsByCustomer(customer_document);
    return reply.send({ cards });
  });

  // DELETE /pay/cards/tokens/:token_id — Remove card token
  app.delete('/cards/tokens/:token_id', async (request, reply) => {
    const { token_id } = deleteTokenParamsSchema.parse(request.params);
    await cardVaultService.deleteCardToken(token_id);
    return reply.status(204).send();
  });
}
