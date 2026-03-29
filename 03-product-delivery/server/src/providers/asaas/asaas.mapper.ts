import type { TransactionStatus } from '../payment-provider.interface.js';

/**
 * Map Asaas payment status to internal TransactionStatus.
 */
export function mapAsaasStatus(asaasStatus: string): TransactionStatus {
  const statusMap: Record<string, TransactionStatus> = {
    PENDING: 'pending',
    RECEIVED: 'completed',
    CONFIRMED: 'completed',
    OVERDUE: 'expired',
    REFUNDED: 'refunded',
    RECEIVED_IN_CASH: 'completed',
    REFUND_REQUESTED: 'processing',
    REFUND_IN_PROGRESS: 'processing',
    CHARGEBACK_REQUESTED: 'processing',
    CHARGEBACK_DISPUTE: 'processing',
    AWAITING_CHARGEBACK_REVERSAL: 'processing',
    DUNNING_REQUESTED: 'processing',
    DUNNING_RECEIVED: 'completed',
    AWAITING_RISK_ANALYSIS: 'processing',
    AUTHORIZED: 'processing',
  };

  return statusMap[asaasStatus] ?? 'pending';
}

/**
 * Map internal type to Asaas billingType.
 */
export function mapBillingType(type: 'pix' | 'card' | 'boleto'): string {
  const map: Record<string, string> = {
    pix: 'PIX',
    card: 'CREDIT_CARD',
    boleto: 'BOLETO',
  };
  return map[type];
}

/**
 * Map Asaas webhook event type to internal event type.
 */
export function mapAsaasEventType(event: string): string {
  const eventMap: Record<string, string> = {
    'PAYMENT_RECEIVED': 'payment_confirmed',
    'PAYMENT_CONFIRMED': 'payment_confirmed',
    'PAYMENT_OVERDUE': 'payment_expired',
    'PAYMENT_DELETED': 'payment_cancelled',
    'PAYMENT_RESTORED': 'payment_restored',
    'PAYMENT_REFUNDED': 'refund_completed',
    'PAYMENT_RECEIVED_IN_CASH_UNDONE': 'payment_failed',
    'PAYMENT_CHARGEBACK_REQUESTED': 'chargeback_requested',
    'PAYMENT_CHARGEBACK_DISPUTE': 'chargeback_dispute',
    'PAYMENT_AWAITING_CHARGEBACK_REVERSAL': 'chargeback_reversal',
    'PAYMENT_DUNNING_RECEIVED': 'payment_confirmed',
    'PAYMENT_DUNNING_REQUESTED': 'dunning_requested',
    'PAYMENT_BANK_SLIP_VIEWED': 'boleto_viewed',
    'PAYMENT_CHECKOUT_VIEWED': 'checkout_viewed',
  };

  return eventMap[event] ?? event.toLowerCase();
}

/**
 * Map Asaas card brand to lowercase format.
 */
export function mapAsaasCardBrand(brand: string | undefined): string {
  if (!brand) return 'unknown';
  const map: Record<string, string> = {
    VISA: 'visa',
    MASTERCARD: 'mastercard',
    ELO: 'elo',
    AMEX: 'amex',
    HIPERCARD: 'hipercard',
    DINERS: 'diners',
  };
  return map[brand.toUpperCase()] ?? brand.toLowerCase();
}
