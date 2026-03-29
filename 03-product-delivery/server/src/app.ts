import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { errorHandler } from './shared/middleware/error-handler.js';
import { apiKeyAuth } from './shared/middleware/api-key-auth.js';
import { adminAuth } from './shared/middleware/admin-auth.js';
import { rateLimiter } from './shared/middleware/rate-limiter.js';
import { paymentRoutes } from './modules/payment/payment.routes.js';
import { cardVaultRoutes } from './modules/card-vault/card-vault.routes.js';
import { webhookRoutes } from './modules/webhook/webhook.routes.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { adminAuthRoutes } from './modules/admin/admin-auth.routes.js';
import { adminDashboardRoutes } from './modules/admin/admin-dashboard.routes.js';
import { adminTransactionsRoutes } from './modules/admin/admin-transactions.routes.js';
import { adminProvidersRoutes } from './modules/admin/admin-providers.routes.js';
import { adminConfigRoutes } from './modules/admin/admin-config.routes.js';
import { adminAppsRoutes } from './modules/admin/admin-apps.routes.js';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'development' ? 'info' : 'warn',
    },
  });

  // --- Plugins ---
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5175',
    credentials: true,
  });

  await app.register(helmet, {
    contentSecurityPolicy: false, // disabled for admin SPA
  });

  // --- Global error handler ---
  app.setErrorHandler(errorHandler);

  // --- Health check (no auth) ---
  await app.register(healthRoutes, { prefix: '/pay' });

  // --- Webhook routes (authenticated by webhook token, not API key) ---
  await app.register(webhookRoutes, { prefix: '/pay' });

  // --- Payment API routes (api-key-auth + rate-limiter) ---
  await app.register(async function payRoutes(payApp) {
    payApp.addHook('onRequest', apiKeyAuth);
    payApp.addHook('onRequest', rateLimiter);

    await payApp.register(paymentRoutes);
    await payApp.register(cardVaultRoutes);
  }, { prefix: '/pay' });

  // --- Admin routes (JWT auth) ---
  // Auth routes (login) do not require JWT
  await app.register(adminAuthRoutes, { prefix: '/admin' });

  // Protected admin routes
  await app.register(async function protectedAdmin(adminApp) {
    adminApp.addHook('onRequest', adminAuth);

    await adminApp.register(adminDashboardRoutes);
    await adminApp.register(adminTransactionsRoutes);
    await adminApp.register(adminProvidersRoutes);
    await adminApp.register(adminConfigRoutes);
    await adminApp.register(adminAppsRoutes);
  }, { prefix: '/admin' });

  return app;
}
