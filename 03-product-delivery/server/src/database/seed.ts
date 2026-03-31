import { getDb } from './connection.js';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';

/**
 * Seed the database with initial development data.
 *
 * Data includes:
 * - Admin user: admin@ecpay.dev / Admin@123
 * - Feature flag: PAYMENT_PROVIDER = internal
 * - App registrations: ecp-bank, ecp-emps, ecp-food
 * - 20 demo transactions (pix, card, boleto)
 * - 3 demo card tokens
 * - 5 demo splits
 * - 10 demo webhook events
 */
export async function seed(): Promise<void> {
  const db = getDb();

  // Check if already seeded
  const existingAdmin = db.prepare('SELECT id FROM admin_users WHERE email = ?').get('admin@ecpay.dev');
  if (existingAdmin) {
    console.log('[seed] Database already seeded, skipping');
    return;
  }

  // ============================================================
  // 1. Admin user
  // ============================================================
  const adminId = randomUUID();
  const passwordHash = bcrypt.hashSync('Admin@123', 10);

  db.prepare(`
    INSERT INTO admin_users (id, name, email, password, role, is_active)
    VALUES (?, 'Edson Portilho', 'admin@ecpay.dev', ?, 'admin', 1)
  `).run(adminId, passwordHash);

  // ============================================================
  // 2. Feature flags
  // ============================================================
  db.prepare(`
    INSERT OR IGNORE INTO feature_flags (key, value, description, updated_by)
    VALUES ('PAYMENT_PROVIDER', 'internal', 'Active payment provider mode (internal/external)', ?)
  `).run(adminId);

  db.prepare(`
    INSERT OR IGNORE INTO feature_flags (key, value, description, updated_by)
    VALUES ('INTERNAL_SIMULATION_DELAY', '3000', 'Delay in ms for simulated payment settlement', ?)
  `).run(adminId);

  db.prepare(`
    INSERT OR IGNORE INTO feature_flags (key, value, description, updated_by)
    VALUES ('INTERNAL_AUTO_APPROVE_CARDS', 'true', 'Auto-approve card charges in internal mode', ?)
  `).run(adminId);

  // ============================================================
  // 3. App registrations
  // ============================================================
  const apps = [
    { name: 'ecp-bank', key: 'ecp-bank-dev-key', url: 'http://localhost:3333/webhooks/pay' },
    { name: 'ecp-emps', key: 'ecp-emps-dev-key', url: 'http://localhost:3334/webhooks/pay' },
    { name: 'ecp-food', key: 'ecp-food-dev-key', url: 'http://localhost:3000/api/webhooks/ecp-pay/payment-confirmed' },
  ];

  const appIds: Record<string, string> = {};
  for (const a of apps) {
    const id = randomUUID();
    appIds[a.name] = id;
    db.prepare(`
      INSERT OR IGNORE INTO app_registrations (id, app_name, api_key, callback_base_url, is_active)
      VALUES (?, ?, ?, ?, 1)
    `).run(id, a.name, a.key, a.url);
  }

  // ============================================================
  // 4. Demo transactions (20 total)
  // ============================================================
  const txIds: string[] = [];
  const sourceApps = ['ecp-bank', 'ecp-emps', 'ecp-food'];
  const customers = [
    { name: 'Maria Silva', doc: '12345678901' },
    { name: 'Joao Santos', doc: '98765432100' },
    { name: 'Ana Oliveira', doc: '11122233344' },
    { name: 'Carlos Souza', doc: '55566677788' },
    { name: 'Fernanda Lima', doc: '99988877766' },
  ];

  const insertTx = db.prepare(`
    INSERT INTO transactions (id, source_app, provider, provider_id, type, amount, currency, status,
      customer_name, customer_document, description, idempotency_key,
      pix_qr_code, pix_qr_code_text, pix_expiration,
      card_token, card_last4, card_brand, card_installments,
      boleto_barcode, boleto_digitable, boleto_due_date,
      metadata, callback_url, callback_status, callback_attempts,
      created_at, updated_at, completed_at, refunded_at)
    VALUES (?, ?, 'internal', ?, ?, ?, 'BRL', ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?)
  `);

  // Helper to create dates relative to now
  function daysAgo(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().replace('T', ' ').slice(0, 19);
  }

  // PIX transactions (7)
  const pixTxs = [
    { app: 'ecp-bank', cust: 0, amount: 15050, status: 'completed', days: 7 },
    { app: 'ecp-bank', cust: 1, amount: 50000, status: 'completed', days: 6 },
    { app: 'ecp-emps', cust: 2, amount: 120000, status: 'completed', days: 5 },
    { app: 'ecp-emps', cust: 3, amount: 8900, status: 'pending', days: 1 },
    { app: 'ecp-food', cust: 4, amount: 3500, status: 'completed', days: 3 },
    { app: 'ecp-food', cust: 0, amount: 4200, status: 'expired', days: 10 },
    { app: 'ecp-bank', cust: 1, amount: 75000, status: 'completed', days: 2 },
  ];

  for (const tx of pixTxs) {
    const id = randomUUID();
    txIds.push(id);
    const c = customers[tx.cust];
    const createdAt = daysAgo(tx.days);
    const completedAt = tx.status === 'completed' ? createdAt : null;
    insertTx.run(
      id, tx.app, `int_pix_${id}`, 'pix', tx.amount, tx.status,
      c.name, c.doc, `Pagamento PIX - ${tx.app}`, randomUUID(),
      Buffer.from(`ECPPAY-PIX-QR:${id}`).toString('base64'), `ECPPAY-PIX-${id}`, daysAgo(tx.days - 1),
      null, null, null, null,
      null, null, null,
      JSON.stringify({ source: tx.app }), apps.find(a => a.name === tx.app)!.url, tx.status === 'completed' ? 'delivered' : 'pending', tx.status === 'completed' ? 1 : 0,
      createdAt, createdAt, completedAt, null,
    );
  }

  // CARD transactions (8)
  const cardTxs = [
    { app: 'ecp-bank', cust: 0, amount: 25000, status: 'completed', last4: '4242', brand: 'visa', installments: 1, days: 8 },
    { app: 'ecp-bank', cust: 1, amount: 199900, status: 'completed', last4: '5555', brand: 'mastercard', installments: 3, days: 7 },
    { app: 'ecp-emps', cust: 2, amount: 35000, status: 'completed', last4: '4242', brand: 'visa', installments: 1, days: 6 },
    { app: 'ecp-emps', cust: 3, amount: 89900, status: 'failed', last4: '9999', brand: 'visa', installments: 1, days: 5 },
    { app: 'ecp-food', cust: 4, amount: 4590, status: 'completed', last4: '1234', brand: 'mastercard', installments: 1, days: 4 },
    { app: 'ecp-food', cust: 0, amount: 7800, status: 'completed', last4: '4242', brand: 'visa', installments: 2, days: 3 },
    { app: 'ecp-bank', cust: 2, amount: 150000, status: 'refunded', last4: '5555', brand: 'mastercard', installments: 6, days: 9 },
    { app: 'ecp-emps', cust: 4, amount: 12000, status: 'completed', last4: '4242', brand: 'visa', installments: 1, days: 2 },
  ];

  for (const tx of cardTxs) {
    const id = randomUUID();
    txIds.push(id);
    const c = customers[tx.cust];
    const createdAt = daysAgo(tx.days);
    const completedAt = (tx.status === 'completed' || tx.status === 'refunded') ? createdAt : null;
    const refundedAt = tx.status === 'refunded' ? daysAgo(tx.days - 1) : null;
    insertTx.run(
      id, tx.app, `int_card_${id}`, 'card', tx.amount, tx.status,
      c.name, c.doc, `Pagamento Cartao - ${tx.app}`, randomUUID(),
      null, null, null,
      `tok_internal_${id.replace(/-/g, '').slice(0, 16)}`, tx.last4, tx.brand, tx.installments,
      null, null, null,
      JSON.stringify({ source: tx.app }), apps.find(a => a.name === tx.app)!.url, tx.status === 'completed' ? 'delivered' : 'pending', tx.status === 'completed' ? 1 : 0,
      createdAt, createdAt, completedAt, refundedAt,
    );
  }

  // BOLETO transactions (5)
  const boletoTxs = [
    { app: 'ecp-bank', cust: 0, amount: 500000, status: 'completed', days: 15 },
    { app: 'ecp-emps', cust: 1, amount: 250000, status: 'pending', days: 3 },
    { app: 'ecp-emps', cust: 2, amount: 100000, status: 'completed', days: 12 },
    { app: 'ecp-food', cust: 3, amount: 45000, status: 'expired', days: 20 },
    { app: 'ecp-bank', cust: 4, amount: 180000, status: 'completed', days: 8 },
  ];

  for (const tx of boletoTxs) {
    const id = randomUUID();
    txIds.push(id);
    const c = customers[tx.cust];
    const createdAt = daysAgo(tx.days);
    const completedAt = tx.status === 'completed' ? daysAgo(tx.days - 2) : null;
    const dueDate = daysAgo(tx.days - 5).slice(0, 10);
    const amountStr = tx.amount.toString().padStart(10, '0');
    insertTx.run(
      id, tx.app, `int_boleto_${id}`, 'boleto', tx.amount, tx.status,
      c.name, c.doc, `Boleto - ${tx.app}`, randomUUID(),
      null, null, null,
      null, null, null, null,
      `0019${amountStr.slice(0, 1)}${id.replace(/-/g, '').slice(0, 25)}${amountStr}`.slice(0, 44).padEnd(44, '0'),
      `00190.00000 00000.000000 00000.000000 0 ${amountStr}`,
      dueDate,
      JSON.stringify({ source: tx.app }), apps.find(a => a.name === tx.app)!.url, tx.status === 'completed' ? 'delivered' : 'pending', tx.status === 'completed' ? 1 : 0,
      createdAt, createdAt, completedAt, null,
    );
  }

  // ============================================================
  // 5. Demo card tokens (3)
  // ============================================================
  const cardTokens = [
    { doc: '12345678901', last4: '4242', brand: 'visa', holder: 'Maria Silva', month: 12, year: 2028, app: 'ecp-bank' },
    { doc: '98765432100', last4: '5555', brand: 'mastercard', holder: 'Joao Santos', month: 6, year: 2027, app: 'ecp-bank' },
    { doc: '11122233344', last4: '4242', brand: 'visa', holder: 'Ana Oliveira', month: 3, year: 2029, app: 'ecp-emps' },
  ];

  for (const ct of cardTokens) {
    db.prepare(`
      INSERT INTO card_tokens (id, customer_document, provider, token, last4, brand, holder_name, expiry_month, expiry_year, is_active, source_app)
      VALUES (?, ?, 'internal', ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(
      randomUUID(), ct.doc, `tok_internal_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
      ct.last4, ct.brand, ct.holder, ct.month, ct.year, ct.app,
    );
  }

  // ============================================================
  // 6. Demo splits (5 transactions from ecp-food)
  // ============================================================
  // Use the food transactions
  const foodTxIds = txIds.filter((_, i) => {
    // Indices 4 (pix food), 5 (pix food expired), 10 (card food), 11 (card food), 17 (boleto food expired)
    return [4, 5, 10, 11, 17].includes(i);
  });

  for (let i = 0; i < Math.min(foodTxIds.length, 5); i++) {
    const txId = foodTxIds[i];
    // Look up the transaction amount
    const txRow = db.prepare('SELECT amount FROM transactions WHERE id = ?').get(txId) as { amount: number } | undefined;
    if (!txRow) continue;

    const total = txRow.amount;
    const platformFee = Math.round(total * 0.10); // 10% plataforma
    const deliveryFee = Math.round(total * 0.10); // 10% entrega
    const vendorAmount = total - platformFee - deliveryFee; // 80% vendedor

    db.prepare(`
      INSERT INTO splits (id, transaction_id, account_id, account_name, amount, type, status)
      VALUES (?, ?, 'platform-001', 'ECP Food Platform', ?, 'fixed', 'completed')
    `).run(randomUUID(), txId, platformFee);

    db.prepare(`
      INSERT INTO splits (id, transaction_id, account_id, account_name, amount, type, status)
      VALUES (?, ?, 'vendor-001', 'Restaurante Bom Sabor', ?, 'fixed', 'completed')
    `).run(randomUUID(), txId, vendorAmount);

    db.prepare(`
      INSERT INTO splits (id, transaction_id, account_id, account_name, amount, type, status)
      VALUES (?, ?, 'delivery-001', 'Entrega Rapida LTDA', ?, 'fixed', 'completed')
    `).run(randomUUID(), txId, deliveryFee);
  }

  // ============================================================
  // 7. Demo webhook events (10)
  // ============================================================
  const eventTypes = ['payment_confirmed', 'payment_confirmed', 'payment_confirmed', 'payment_confirmed', 'payment_confirmed',
    'payment_failed', 'payment_expired', 'refund_completed', 'payment_confirmed', 'payment_confirmed'];

  for (let i = 0; i < 10; i++) {
    const txId = txIds[i % txIds.length];
    db.prepare(`
      INSERT INTO webhook_events (id, event_id, provider, event_type, transaction_id, payload, processed, created_at)
      VALUES (?, ?, 'internal', ?, ?, ?, 1, ?)
    `).run(
      randomUUID(),
      randomUUID(),
      eventTypes[i],
      txId,
      JSON.stringify({
        event: eventTypes[i],
        transaction_id: txId,
        timestamp: daysAgo(10 - i),
      }),
      daysAgo(10 - i),
    );
  }

  // ============================================================
  // 8. Refund record for the refunded card transaction
  // ============================================================
  const refundedTx = db.prepare(
    `SELECT id, amount FROM transactions WHERE status = 'refunded' LIMIT 1`
  ).get() as { id: string; amount: number } | undefined;

  if (refundedTx) {
    db.prepare(`
      INSERT INTO refunds (id, transaction_id, provider_refund_id, amount, status, completed_at)
      VALUES (?, ?, ?, ?, 'completed', datetime('now'))
    `).run(randomUUID(), refundedTx.id, `int_refund_${randomUUID()}`, refundedTx.amount);
  }

  // ============================================================
  // 9. Initial audit logs
  // ============================================================
  db.prepare(`
    INSERT INTO audit_logs (id, user_id, action, resource, resource_id, metadata, created_at)
    VALUES (?, ?, 'SEED_DATABASE', 'system', NULL, '{"message":"Initial seed data applied"}', datetime('now'))
  `).run(randomUUID(), adminId);

  console.log('[seed] Seed data applied successfully');
  console.log('[seed]   - 1 admin user (admin@ecpay.dev / Admin@123)');
  console.log('[seed]   - 3 feature flags');
  console.log('[seed]   - 3 app registrations');
  console.log('[seed]   - 20 demo transactions');
  console.log('[seed]   - 3 card tokens');
  console.log('[seed]   - 5 transactions with splits');
  console.log('[seed]   - 10 webhook events');
}

// Run directly if called as script
if (process.argv[1]?.includes('seed')) {
  seed().catch(console.error);
}
