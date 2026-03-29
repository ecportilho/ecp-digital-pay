import { z } from 'zod';

export const listCardsParamsSchema = z.object({
  customer_document: z.string().min(11).max(14),
});

export const deleteTokenParamsSchema = z.object({
  token_id: z.string().uuid(),
});

export type ListCardsParams = z.infer<typeof listCardsParamsSchema>;
export type DeleteTokenParams = z.infer<typeof deleteTokenParamsSchema>;
