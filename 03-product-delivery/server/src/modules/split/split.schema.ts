import { z } from 'zod';

export const splitRuleSchema = z.object({
  account_id: z.string().min(1),
  account_name: z.string().min(1),
  amount: z.number().int().positive(),
  type: z.enum(['fixed', 'percentage']),
});

export const createSplitSchema = z.object({
  transaction_id: z.string().uuid(),
  splits: z.array(splitRuleSchema).min(1),
});

export type SplitRule = z.infer<typeof splitRuleSchema>;
export type CreateSplitBody = z.infer<typeof createSplitSchema>;
