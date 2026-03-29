import { z } from 'zod';

export const asaasWebhookSchema = z.object({
  event: z.string(),
  payment: z.object({
    id: z.string(),
    status: z.string(),
    value: z.number(),
    billingType: z.string(),
  }).passthrough(),
}).passthrough();

export const retryWebhookParamsSchema = z.object({
  id: z.string().uuid(),
});

export type AsaasWebhookBody = z.infer<typeof asaasWebhookSchema>;
export type RetryWebhookParams = z.infer<typeof retryWebhookParamsSchema>;
