import type { WebhookEvent } from '../payment-provider.interface.js';
import { generateUUID } from '../../shared/utils/uuid.js';
import { mapAsaasStatus, mapAsaasEventType } from './asaas.mapper.js';

/**
 * Asaas webhook body shape (subset of fields we care about).
 */
interface AsaasWebhookBody {
  event: string;
  payment: {
    id: string;
    status: string;
    value: number;
    billingType: string;
    customer?: string;
    externalReference?: string;
    [key: string]: unknown;
  };
}

/**
 * Parse and validate incoming Asaas webhook events.
 */
export function parseAsaasWebhook(headers: Record<string, string>, body: unknown): WebhookEvent {
  // Validate webhook token
  const token = headers['asaas-access-token'] || headers['x-asaas-webhook-token'] || '';
  if (!validateAsaasWebhookToken(token)) {
    // In development, allow without token if env not set
    const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN;
    if (expectedToken) {
      throw new Error('Invalid Asaas webhook token');
    }
  }

  const data = body as AsaasWebhookBody;

  if (!data.event || !data.payment?.id) {
    throw new Error('Invalid Asaas webhook body: missing event or payment.id');
  }

  // The externalReference in Asaas is our transaction_id
  const transactionId = data.payment.externalReference || '';

  return {
    event_id: generateUUID(),
    event_type: mapAsaasEventType(data.event),
    transaction_id: transactionId,
    provider_id: data.payment.id,
    data: data as unknown as Record<string, unknown>,
    received_at: new Date().toISOString(),
  };
}

/**
 * Validate Asaas webhook signature/token.
 */
export function validateAsaasWebhookToken(token: string): boolean {
  const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!expectedToken) return true; // No token configured = skip validation (dev mode)
  return token === expectedToken;
}
