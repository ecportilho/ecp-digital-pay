import 'dotenv/config';
import { buildApp } from './app.js';
import { getDb } from './database/connection.js';
import { seed } from './database/seed.js';
import { startSettlementScheduler } from './providers/internal/internal.scheduler.js';
import { startCallbackRetryScheduler } from './modules/callback/callback.retry.js';

const PORT = parseInt(process.env.PORT || '3335');
const HOST = process.env.HOST || '0.0.0.0';

async function start() {
  // Initialize database (runs migrations)
  getDb();

  // Run seed (idempotent — skips if already seeded)
  await seed();

  // Start background schedulers
  const providerMode = process.env.PAYMENT_PROVIDER || 'internal';
  if (providerMode === 'internal') {
    startSettlementScheduler();
  }
  startCallbackRetryScheduler();

  const app = await buildApp();

  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`[ecp-pay] Server running on http://${HOST}:${PORT}`);
    console.log(`[ecp-pay] Provider mode: ${providerMode}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
