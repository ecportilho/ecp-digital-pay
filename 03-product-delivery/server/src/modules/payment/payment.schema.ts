import { z } from 'zod';

const splitRuleSchema = z.object({
  account_id: z.string().min(1),
  account_name: z.string().min(1),
  amount: z.number().int().positive(),
  type: z.enum(['fixed', 'percentage']).default('fixed'),
});

export const pixChargeSchema = z.object({
  amount: z.number().int().positive(),
  customer_name: z.string().min(1),
  customer_document: z.string().min(11).max(14),
  description: z.string().optional(),
  expiration_seconds: z.number().int().positive().default(3600),
  callback_url: z.string().url().optional(),
  metadata: z.record(z.unknown()).optional(),
  splits: z.array(splitRuleSchema).min(1).optional(),
});

export const cardChargeSchema = z.object({
  amount: z.number().int().positive(),
  customer_name: z.string().min(1),
  customer_document: z.string().min(11).max(14),
  description: z.string().optional(),
  card_token: z.string().nullish(),
  card_number: z.string().nullish(),
  card_expiry: z.string().nullish(),
  card_cvv: z.string().nullish(),
  card_holder_name: z.string().nullish(),
  save_card: z.boolean().default(false),
  installments: z.number().int().min(1).max(12).default(1),
  callback_url: z.string().url().optional(),
  metadata: z.record(z.unknown()).optional(),
  splits: z.array(splitRuleSchema).min(1).optional(),
}).refine(
  (data) => data.card_token || (data.card_number && data.card_holder_name),
  { message: 'Either card_token or card_number + card_holder_name are required' }
);

export const boletoSchema = z.object({
  amount: z.number().int().positive(),
  customer_name: z.string().min(1),
  customer_document: z.string().min(11).max(14),
  customer_email: z.string().email().optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().optional(),
  interest_rate: z.number().int().min(0).optional(),
  penalty_rate: z.number().int().min(0).optional(),
  discount_amount: z.number().int().min(0).optional(),
  discount_days: z.number().int().min(0).optional(),
  callback_url: z.string().url().optional(),
  metadata: z.record(z.unknown()).optional(),
  splits: z.array(splitRuleSchema).min(1).optional(),
});

export const createTransactionSplitSchema = z.object({
  splits: z.array(splitRuleSchema).min(1),
});

export type CreateTransactionSplitBody = z.infer<typeof createTransactionSplitSchema>;

export const refundSchema = z.object({
  amount: z.number().int().positive().optional(),
  reason: z.string().optional(),
});

export type PixChargeBody = z.infer<typeof pixChargeSchema>;
export type CardChargeBody = z.infer<typeof cardChargeSchema>;
export type BoletoBody = z.infer<typeof boletoSchema>;
export type RefundBody = z.infer<typeof refundSchema>;
