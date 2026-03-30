/**
 * Notifies ecp-digital-bank when a card charge is processed,
 * so the purchase appears on the cardholder's invoice/statement.
 *
 * The bank endpoint POST /api/cards/purchase-by-number requires
 * a platform JWT token for authentication.
 */

const BANK_API_URL = process.env.ECP_BANK_API_URL || 'http://localhost:3333';
const BANK_PLATFORM_EMAIL = process.env.ECP_BANK_PLATFORM_EMAIL || 'marina@email.com';
const BANK_PLATFORM_PASSWORD = process.env.ECP_BANK_PLATFORM_PASSWORD || 'Senha@123';

let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getBankToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  const response = await fetch(`${BANK_API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: BANK_PLATFORM_EMAIL, password: BANK_PLATFORM_PASSWORD }),
  });

  if (!response.ok) {
    throw new Error(`Bank login failed: ${response.status}`);
  }

  const data = await response.json() as { token: string };
  cachedToken = data.token;
  tokenExpiry = Date.now() + 23 * 60 * 60 * 1000; // 23h cache
  return cachedToken;
}

interface CardNotification {
  card_number: string;
  amount: number;           // centavos
  description: string;
  merchant_name: string;
  merchant_category?: string;
  transaction_id: string;   // ECP Pay transaction ID for tracing
}

export async function notifyBankCardPurchase(notification: CardNotification): Promise<void> {
  try {
    const token = await getBankToken();

    const response = await fetch(`${BANK_API_URL}/api/cards/purchase-by-number`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        cardNumber: notification.card_number,
        amountCents: notification.amount,
        description: notification.description,
        merchantName: notification.merchant_name,
        merchantCategory: notification.merchant_category || 'Pagamentos',
      }),
    });

    if (response.ok) {
      const result = await response.json() as { purchaseId: string };
      console.log(`[bank-notify] Compra registrada na fatura | card=****${notification.card_number.slice(-4)} | valor=${notification.amount} cents | purchaseId=${result.purchaseId} | ecpPayTx=${notification.transaction_id}`);
    } else {
      const errText = await response.text().catch(() => 'unknown');
      console.error(`[bank-notify] Falha ao registrar na fatura: ${response.status} ${errText}`);
    }
  } catch (err) {
    console.error(`[bank-notify] Erro ao notificar bank:`, (err as Error).message);
    // Non-blocking — payment already succeeded, card notification is best-effort
  }
}
