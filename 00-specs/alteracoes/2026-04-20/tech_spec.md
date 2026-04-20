# ECP Pay — Especificação Técnica

> **Versão:** 2.0
> **Data:** 20/04/2026
> **Status:** Implementado (fase 03)
> **Repositório:** `ecp-digital-pay`

---

## 1. Stack Tecnológica (versões reais do `package.json`)

### 1.1. Back-end (API) — `03-product-delivery/server/package.json`

| Tecnologia | Versão | Papel |
|-----------|--------|-------|
| **TypeScript** | `^5.5.0` | Linguagem base (strict mode) |
| **Node** | ≥ 20 (implícito) | Runtime |
| **Fastify** | `^5.0.0` | Servidor HTTP |
| **@fastify/cors** | `^10.0.0` | CORS |
| **@fastify/helmet** | `^12.0.0` | Security headers |
| **Zod** | `^3.23.8` | Validação de contratos |
| **better-sqlite3** | `^11.3.0` | Driver SQLite síncrono |
| **bcryptjs** | `^2.4.3` | Hash de senha admin |
| **jsonwebtoken** | `^9.0.2` | JWT do painel |
| **node-cron** | `^3.0.3` | Scheduler (dependência instalada; execução usa `setInterval`) |
| **dotenv** | `^16.6.1` | Carrega `.env` |
| **tsx** | `^4.19.0` | Hot reload em dev |
| **@types/node** | `^22.5.0` | Tipos Node 22 |

Scripts: `npm run dev` → `tsx watch src/server.ts`; `build` → `tsc`; `start` → `node dist/server.js`.

### 1.2. Front-end (Painel Admin) — `03-product-delivery/web/package.json`

| Tecnologia | Versão | Papel |
|-----------|--------|-------|
| **React** | `^18.3.1` | UI |
| **React DOM** | `^18.3.1` | Render |
| **React Router DOM** | `^6.26.0` | SPA routing |
| **Tailwind CSS** | `^3.4.10` | Estilização |
| **Lucide React** | `^0.441.0` | Ícones |
| **Recharts** | `^2.12.7` | Gráficos |
| **Vite** | `^5.4.0` | Build tool |
| **@vitejs/plugin-react** | `^4.3.1` | Plugin JSX |
| **TypeScript** | `^5.5.0` | Linguagem |
| **PostCSS** | `^8.4.41` | Pipeline CSS |
| **autoprefixer** | `^10.4.20` | Prefixos CSS |

Scripts: `dev` → `vite`; `build` → `tsc && vite build`; `preview` → `vite preview`.

### 1.3. Workspace raiz — `03-product-delivery/package.json`

- npm workspaces (`server`, `web`)
- `concurrently@^8.2.2` roda API + Painel paralelamente
- `npm run dev` → inicia os dois workspaces

### 1.4. Portas e URLs (reais)

| Serviço | Porta | URL |
|---------|-------|-----|
| API (Payment Service) | 3335 | `http://localhost:3335` |
| Painel Admin (SPA) | **5176** | `http://localhost:5176` |
| ecp-bank | 3333 | `http://localhost:3333` |
| ecp-emps | 3334 | `http://localhost:3334` |
| ecp-food | 3000 | `http://localhost:3000` |

> **Mudança vs. spec 2026-03:** porta do painel admin alterada de 5175 para 5176 (ver `.env.example`, `README.md`, `app.ts:28`).

### 1.5. tsconfig base — `03-product-delivery/tsconfig.base.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src"
  }
}
```

---

## 2. Regras Invioláveis de Código

Herda as 13 regras do ecossistema ECP e adiciona:

14. **Provider Interface:** toda operação de pagamento passa pela interface `PaymentProvider` (`server/src/providers/payment-provider.interface.ts`). Services NUNCA chamam Asaas diretamente.
15. **Feature flag em runtime:** `PAYMENT_PROVIDER` é alterada via `POST /admin/providers/switch` sem restart, e registrada em `audit_logs`.
16. **Paridade de contrato:** os adapters `InternalAdapter` e `AsaasAdapter` retornam tipos idênticos (`PixChargeResult`, `CardChargeResult`, `BoletoResult`, `RefundResult`). Apps consumidores não sabem qual modo está ativo.
17. **Cofre de tokens:** número de cartão e CVV NUNCA persistidos. Apenas `token + last4 + brand + holder_name + expiry`.
18. **`source_app` obrigatório:** toda transação registra o app que a originou, resolvido via `X-API-Key` no middleware `apiKeyAuth`.
19. **Idempotência de webhook:** `webhook_events.event_id` UNIQUE + check em `webhook.service.ts:17`.
20. **Idempotência de transação:** `transactions.idempotency_key` UNIQUE + check em `payment.service.ts:54` (header `X-Idempotency-Key` obrigatório em mutações).

---

## 3. Arquitetura — Provider Pattern

### 3.1. Interface (`server/src/providers/payment-provider.interface.ts`)

Exporta os tipos: `PixChargeInput/Result`, `CardChargeInput/Result`, `BoletoInput/Result`, `RefundInput/Result`, `WebhookEvent`, `TransactionStatus` e `PaymentProvider` com 6 métodos:

- `createPixCharge`
- `createCardCharge`
- `createBoleto`
- `refund`
- `getTransactionStatus`
- `parseWebhook`

### 3.2. Asaas Adapter (`server/src/providers/asaas/asaas.adapter.ts`)

Implementação real com `fetch()`:

- Base URL: `https://api-sandbox.asaas.com/v3` se `ASAAS_SANDBOX=true`, senão `https://api.asaas.com/v3`. Pode ser sobrescrita via `ASAAS_BASE_URL`.
- Headers: `Content-Type: application/json`, `User-Agent: ecp-pay/1.0`, `access_token: <ASAAS_API_KEY>`.
- `ensureCustomer`: `GET /customers?cpfCnpj={doc}` → se existir, reutiliza; senão `POST /customers`.
- `createPixCharge`: `POST /payments` (billingType: PIX, value em reais) + `GET /payments/{id}/pixQrCode` para obter `encodedImage` e `payload`.
- `createCardCharge`: `POST /payments` (CREDIT_CARD). Suporta `card_token` ou `card_number + creditCardHolderInfo`. Parcelamento via `installmentCount` + `installmentValue`.
- `createBoleto`: `POST /payments` (BOLETO) + `GET /payments/{id}/identificationField` + `GET /payments/{id}/pixQrCode` (para boleto híbrido).
- `refund`: `POST /payments/{id}/refund { value? }`.
- `getTransactionStatus`: `GET /payments/{id}`.
- Timeout: `AbortSignal.timeout(30_000)`.
- Erros: `AppError(502, PROVIDER_ERROR | PROVIDER_UNAVAILABLE)`.

### 3.3. Asaas Mapper (`asaas.mapper.ts`)

- `mapAsaasStatus(asaasStatus)` → `TransactionStatus` (cobre PENDING/RECEIVED/CONFIRMED/OVERDUE/REFUNDED/REFUND_REQUESTED/CHARGEBACK_*/AUTHORIZED/AWAITING_RISK_ANALYSIS).
- `mapAsaasEventType(event)` → eventos internos (`PAYMENT_CONFIRMED/RECEIVED/OVERDUE/DELETED/RESTORED/REFUNDED/CHARGEBACK_*/BANK_SLIP_VIEWED/CHECKOUT_VIEWED/...`).
- `mapAsaasCardBrand(brand)` → `visa/mastercard/elo/amex/hipercard/diners`.

### 3.4. Asaas Webhook (`asaas.webhook.ts`)

- Extrai `externalReference` do payload como `transaction_id` interno.
- Valida token `ASAAS_WEBHOOK_TOKEN` (headers `asaas-access-token` ou `x-asaas-webhook-token`). Se o env var não estiver setado, aceita sem token (modo dev).
- Retorna `WebhookEvent` normalizado.

### 3.5. Internal Adapter (`server/src/providers/internal/internal.adapter.ts`)

- `simulationDelay` lido de `INTERNAL_SIMULATION_DELAY` (default 3000ms).
- `createPixCharge`: gera QR Code via `generatePixQrCode`, insere transação com `source_app='__pending__'` e `idempotency_key='__pending_{id}__'`, agenda settlement via `scheduleSettlement`.
- `createCardCharge`: valida regras (RN-05/06), detecta brand (`detectBrand`), gera token local SHA-256 se `save_card`, insere transação com status `completed` imediato.
- `createBoleto`: gera barcode FEBRABAN mock via `generateBoleto`, QR Pix embutido, status `pending`.
- `refund`: bloqueia boletos e transações já refunded, calcula parcial/total, insere em `refunds` + atualiza status.
- `scheduleSettlement` grava em `scheduled_settlements`; o scheduler (`internal.scheduler.ts`) roda com `setInterval(1000)` e processa vencidos.

### 3.6. Provider Factory (`server/src/providers/provider.factory.ts`)

```typescript
static getProvider(): PaymentProvider {
  const mode = getFeatureFlag('PAYMENT_PROVIDER', 'internal');
  if (!this.instance || this.currentMode !== mode) {
    this.instance = mode === 'external' ? new AsaasAdapter() : new InternalAdapter();
    this.currentMode = mode;
  }
  return this.instance;
}

static switchProvider(mode, userId): void {
  setFeatureFlag('PAYMENT_PROVIDER', mode, userId);
  auditLog({ userId, action: 'SWITCH_PROVIDER', ... });
  this.instance = null;
}
```

---

## 4. Modelo de Dados (SQLite — `database-pay.sqlite`)

Migration única: `server/src/database/migrations/001-initial.sql`.

### 4.1. Tabelas implementadas

| Tabela | Propósito |
|--------|-----------|
| `transactions` | Ledger central (todos os pagamentos) |
| `splits` | Partes de split por transação |
| `card_tokens` | Cofre de tokens de cartão |
| `refunds` | Estornos |
| `webhook_events` | Eventos recebidos (com dedup via `event_id` UNIQUE) |
| `feature_flags` | Chave/valor persistido |
| `audit_logs` | Trilha de auditoria |
| `admin_users` | Usuários do painel |
| `app_registrations` | Apps do ecossistema (API keys + callback URL) |
| `scheduled_settlements` | Fila de liquidação do modo internal |

Campos importantes de `transactions`:

- `id` TEXT PK (UUID v4)
- `source_app`, `provider`, `provider_id`, `type` (`pix|card|boleto`)
- `amount` INTEGER (centavos), `currency` TEXT DEFAULT 'BRL', `status` TEXT
- `customer_name`, `customer_document`, `description`, `idempotency_key` UNIQUE
- Blocos específicos: Pix (`pix_qr_code`, `pix_qr_code_text`, `pix_expiration`), cartão (`card_token`, `card_last4`, `card_brand`, `card_installments`), boleto (`boleto_barcode`, `boleto_digitable`, `boleto_due_date`, `boleto_pdf_url`, `boleto_pix_qr`)
- `metadata` (JSON), `callback_url`, `callback_status`, `callback_attempts`
- `created_at`, `updated_at`, `completed_at`, `refunded_at`

Índices (16): `idx_tx_source`, `idx_tx_status`, `idx_tx_type`, `idx_tx_created`, `idx_tx_customer`, `idx_tx_idempotency`, `idx_tx_provider_id`, `idx_splits_tx`, `idx_tokens_customer`, `idx_tokens_active`, `idx_refunds_tx`, `idx_webhook_event_id`, `idx_webhook_tx`, `idx_audit_action`, `idx_audit_created`, `idx_scheduled_settle`.

---

## 5. Contratos da API

Base URL: `http://localhost:3335`.

### 5.1. Payment API (autenticada por `X-API-Key`)

Prefixo `/pay`. Middleware: `apiKeyAuth` + `rateLimiter`.

| Método | Rota | Arquivo |
|--------|------|---------|
| GET | `/pay/health` | `health.routes.ts` |
| POST | `/pay/pix` | `payment.routes.ts:13` |
| POST | `/pay/card` | `payment.routes.ts:30` |
| POST | `/pay/boleto` | `payment.routes.ts:47` |
| GET | `/pay/transactions/:id` | `payment.routes.ts:64` |
| POST | `/pay/transactions/:id/refund` | `payment.routes.ts:74` |
| POST | `/pay/transactions/:id/splits` | `payment.routes.ts:82` |
| GET | `/pay/cards/:customer_document` | `card-vault.routes.ts:13` |
| DELETE | `/pay/cards/tokens/:token_id` | `card-vault.routes.ts:20` |
| POST | `/pay/webhooks/asaas` | `webhook.routes.ts:10` (sem api-key, validado por token) |

### 5.2. Admin API (autenticada por JWT)

Prefixo `/admin`. Middleware: `adminAuth` (exceto `/auth/login`).

| Método | Rota | Arquivo |
|--------|------|---------|
| POST | `/admin/auth/login` | `admin-auth.routes.ts:26` |
| GET | `/admin/auth/me` | `admin-auth.routes.ts:81` |
| GET | `/admin/dashboard` | `admin-dashboard.routes.ts:10` |
| GET | `/admin/transactions` | `admin-transactions.routes.ts:13` |
| GET | `/admin/transactions/summary` | `admin-transactions.routes.ts:80` |
| GET | `/admin/transactions/:id` | `admin-transactions.routes.ts:123` |
| POST | `/admin/transactions/:id/simulate-payment` | `admin-transactions.routes.ts:178` |
| GET | `/admin/providers` | `admin-providers.routes.ts:15` |
| POST | `/admin/providers/switch` | `admin-providers.routes.ts:42` |
| GET | `/admin/feature-flags` | `admin-config.routes.ts:16` |
| PATCH | `/admin/feature-flags/:key` | `admin-config.routes.ts:25` |
| GET | `/admin/audit-logs` | `admin-config.routes.ts:48` |
| GET | `/admin/config` | `admin-config.routes.ts:109` |
| PATCH | `/admin/config` | `admin-config.routes.ts:126` |
| GET | `/admin/apps` | `admin-apps.routes.ts:26` |
| POST | `/admin/apps` | `admin-apps.routes.ts:58` |
| PATCH | `/admin/apps/:id` | `admin-apps.routes.ts:99` |

**Total implementado: 27 endpoints (10 payment + 17 admin)**.

### 5.3. Endpoints da spec 2026-03 NÃO implementados

- `/admin/splits` (GET)
- `/admin/tokens` (GET)
- `/admin/webhooks` (GET)
- `/admin/webhooks/:id/retry` (POST) — chamado pelo frontend mas não existe no backend

> A UI `webhooks.tsx` e o botão "Reenviar callback" em `transaction-detail.tsx` chamam `/admin/webhooks/:id/retry`, mas a rota correspondente não está registrada em `app.ts`. Dívida técnica a corrigir.

### 5.4. Validação (Zod)

Schemas em `payment.schema.ts`:

- `pixChargeSchema`: `amount` (int positivo), `customer_name`, `customer_document`, `description?`, `expiration_seconds` default 3600, `callback_url? (URL)`, `metadata?`, `splits?`
- `cardChargeSchema`: + `card_token?` | `card_number+card_holder_name`, `save_card` default false, `installments` 1–12 default 1
- `boletoSchema`: + `due_date` formato `YYYY-MM-DD`, `interest_rate`, `penalty_rate`, `discount_amount`, `discount_days`
- `refundSchema`: `amount?`, `reason?`
- `splitRuleSchema`: `account_id`, `account_name`, `amount`, `type: fixed|percentage`

---

## 6. Estrutura de Pastas (real)

```
ecp-digital-pay/
├── 00-specs/
│   ├── 2026-03/                           # spec anterior
│   └── 2026-04-20/                        # esta spec
├── 01-strategic-context/
├── 02-product-discovery/
├── 03-product-delivery/
│   ├── package.json                       # workspaces
│   ├── tsconfig.base.json
│   ├── architecture-output.json
│   ├── backend-status.json
│   ├── frontend-status.json
│   ├── ai-engineer-status.json
│   ├── qa-report.json
│   ├── server/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── database-pay.sqlite            # gerado em runtime
│   │   └── src/
│   │       ├── app.ts                     # Fastify setup + routes
│   │       ├── server.ts                  # Entry (porta 3335)
│   │       ├── database/
│   │       │   ├── connection.ts
│   │       │   ├── migrations/001-initial.sql
│   │       │   └── seed.ts
│   │       ├── providers/
│   │       │   ├── payment-provider.interface.ts
│   │       │   ├── provider.factory.ts
│   │       │   ├── asaas/
│   │       │   │   ├── asaas.adapter.ts
│   │       │   │   ├── asaas.mapper.ts
│   │       │   │   └── asaas.webhook.ts
│   │       │   └── internal/
│   │       │       ├── internal.adapter.ts
│   │       │       ├── internal.qrcode.ts
│   │       │       ├── internal.boleto.ts
│   │       │       └── internal.scheduler.ts
│   │       ├── modules/
│   │       │   ├── payment/
│   │       │   │   ├── payment.routes.ts
│   │       │   │   ├── payment.service.ts
│   │       │   │   ├── payment.schema.ts
│   │       │   │   └── bank-card-notifier.ts  # notifica ecp-bank
│   │       │   ├── card-vault/
│   │       │   │   ├── card-vault.routes.ts
│   │       │   │   ├── card-vault.service.ts
│   │       │   │   └── card-vault.schema.ts
│   │       │   ├── split/
│   │       │   │   ├── split.service.ts
│   │       │   │   └── split.schema.ts
│   │       │   ├── webhook/
│   │       │   │   ├── webhook.routes.ts
│   │       │   │   ├── webhook.service.ts
│   │       │   │   └── webhook.schema.ts
│   │       │   ├── callback/
│   │       │   │   ├── callback.service.ts
│   │       │   │   └── callback.retry.ts
│   │       │   ├── admin/
│   │       │   │   ├── admin-auth.routes.ts
│   │       │   │   ├── admin-dashboard.routes.ts
│   │       │   │   ├── admin-transactions.routes.ts
│   │       │   │   ├── admin-providers.routes.ts
│   │       │   │   ├── admin-config.routes.ts
│   │       │   │   └── admin-apps.routes.ts
│   │       │   └── health/
│   │       │       └── health.routes.ts
│   │       ├── shared/
│   │       │   ├── errors/
│   │       │   │   ├── app-error.ts
│   │       │   │   └── error-codes.ts
│   │       │   ├── middleware/
│   │       │   │   ├── api-key-auth.ts
│   │       │   │   ├── admin-auth.ts
│   │       │   │   ├── rate-limiter.ts
│   │       │   │   └── error-handler.ts
│   │       │   └── utils/
│   │       │       ├── money.ts
│   │       │       ├── uuid.ts
│   │       │       ├── feature-flags.ts
│   │       │       └── audit.ts
│   │       └── types/
│   │           └── fastify.d.ts
│   └── web/
│       ├── package.json
│       ├── tsconfig.json / tsconfig.node.json
│       ├── vite.config.ts
│       ├── tailwind.config.ts
│       ├── postcss.config.js
│       ├── index.html
│       └── src/
│           ├── main.tsx
│           ├── App.tsx
│           ├── vite-env.d.ts
│           ├── routes/
│           │   ├── login.tsx
│           │   ├── dashboard.tsx
│           │   ├── transactions.tsx
│           │   ├── transaction-detail.tsx
│           │   ├── providers.tsx
│           │   ├── webhooks.tsx
│           │   ├── apps.tsx
│           │   └── settings.tsx
│           ├── components/
│           │   ├── ui/
│           │   │   ├── Button.tsx
│           │   │   ├── Card.tsx
│           │   │   ├── Input.tsx          # + Select exportado no mesmo arquivo
│           │   │   ├── Modal.tsx
│           │   │   ├── Table.tsx
│           │   │   ├── Badge.tsx          # + TransactionStatusBadge / TypeBadge / WebhookStatusBadge / ProviderBadge
│           │   │   └── Toggle.tsx
│           │   └── layout/
│           │       ├── Sidebar.tsx
│           │       ├── Header.tsx
│           │       ├── MobileNav.tsx
│           │       └── InternalBanner.tsx
│           ├── hooks/
│           │   ├── useAuth.ts
│           │   └── useFetch.ts
│           ├── services/
│           │   └── api.ts
│           ├── lib/
│           │   └── formatters.ts
│           └── styles/
│               └── globals.css
├── 04-product-operation/
├── 05-docs/
└── README.md
```

---

## 7. Variáveis de Ambiente

Lidas em `server/src/server.ts` via `dotenv` (`.env` da raiz do `03-product-delivery/` e do `server/`).

```bash
# Servidor
PORT=3335
HOST=0.0.0.0
NODE_ENV=development

# JWT (painel admin)
JWT_SECRET=ecp-pay-admin-secret-mude-em-producao

# Banco de dados
DATABASE_PATH=./database-pay.sqlite

# CORS (painel admin)
CORS_ORIGIN=http://localhost:5176

# Feature flag — Provider
PAYMENT_PROVIDER=internal                 # internal | external

# Asaas (apenas quando external)
ASAAS_API_KEY=
ASAAS_SANDBOX=true
ASAAS_BASE_URL=https://api-sandbox.asaas.com/v3  # opcional
ASAAS_WEBHOOK_TOKEN=

# Modo INTERNAL
INTERNAL_SIMULATION_DELAY=3000
INTERNAL_AUTO_APPROVE_CARDS=true
INTERNAL_MAX_SIMULATED_AMOUNT=10000000

# Notificação ao ecp-bank (bank-card-notifier.ts)
ECP_BANK_API_URL=http://localhost:3333
ECP_BANK_PLATFORM_EMAIL=platform@ecpay.dev
ECP_BANK_PLATFORM_PASSWORD=EcpPay@Platform#2026

# Frontend
VITE_API_URL=http://localhost:3335
```

---

## 8. Integração Asaas (implementada)

Referência completa em `00-specs/2026-03/implementacao-asaas-claude-code.md`.

### 8.1. Autenticação

Header `access_token: <ASAAS_API_KEY>` (ver `asaas.adapter.ts:51`). Chaves sandbox começam com `$aact_hmlg_`, produção com `$aact_prod_`.

### 8.2. Fluxo customer-first

`ensureCustomer` em `asaas.adapter.ts:76`:
1. `GET /customers?cpfCnpj={doc}` → se `data[0]` existir, reutiliza.
2. Senão `POST /customers` com `{ name, cpfCnpj, email? }`.

### 8.3. Conversão centavos ↔ reais

Centavos internos → `value = amount / 100` ao enviar para Asaas. Campos relevantes: `interest.value`, `fine.value`, `discount.value` também em reais.

### 8.4. Rotas Asaas consumidas

- `POST /payments` (PIX/CREDIT_CARD/BOLETO)
- `GET /payments/{id}/pixQrCode`
- `GET /payments/{id}/identificationField` (boleto)
- `GET /payments/{id}` (status)
- `POST /payments/{id}/refund`
- `GET /customers?cpfCnpj=`
- `POST /customers`

### 8.5. Webhook

Rota: `POST /pay/webhooks/asaas` (sem `X-API-Key`, validado por `ASAAS_WEBHOOK_TOKEN` no body/header).

Fluxo em `webhook.service.ts:11`:
1. `provider.parseWebhook(headers, body)` → `WebhookEvent` normalizado.
2. Dedup em `webhook_events` por `event_id` UNIQUE.
3. Atualiza `transactions.status` conforme `mapAsaasEventType`.
4. Dispara `sendCallback(tx.id)` ao app de origem.
5. Marca `webhook_events.processed = 1`.
6. Log em `audit_logs`.

---

## 9. Dados de Seed (`server/src/database/seed.ts`)

Idempotente — pula se `admin@ecpay.dev` já existe.

| Dado | Valor |
|------|-------|
| Admin | Edson Portilho (`admin@ecpay.dev` / `Admin@123`) role `admin` |
| Feature flags | `PAYMENT_PROVIDER=internal`, `INTERNAL_SIMULATION_DELAY=3000`, `INTERNAL_AUTO_APPROVE_CARDS=true` |
| Apps | `ecp-bank` / `ecp-emps` / `ecp-food` com keys `*-dev-key` e callback URLs do ecossistema |
| Transações demo | 20 (7 pix, 8 card, 5 boleto) distribuídas entre os 3 apps e 5 clientes |
| Tokens demo | 3 cartões (2 visa, 1 mastercard) |
| Splits demo | 3 splits por transação (platform 10% / vendor 80% / delivery 10%) em 5 transações de ecp-food |
| Webhook events demo | 10 eventos processados |
| Refund record | 1 refund para a transação de cartão refunded |
| Audit log inicial | 1 entry `SEED_DATABASE` |

---

## 10. Segurança

- Apps autenticados via `X-API-Key` (`app_registrations`)
- Painel admin via JWT (24h), bcrypt hash (`bcryptjs.hashSync(password, 10)`)
- Campo `role` em `admin_users`: `admin | operator | viewer` (RBAC definido no schema; enforcement granular por rota ainda não implementado)
- Dados de cartão (número, CVV) nunca persistidos
- Audit log em toda ação (login, switch provider, update flag, refund, etc.)
- Rate limit: 100 req/min por app (`rate-limiter.ts`)
- Idempotência: `idempotency_key` UNIQUE + `webhook_events.event_id` UNIQUE
- Webhook Asaas validado por token (header `asaas-access-token`)
- CORS restrito a `CORS_ORIGIN` (default `http://localhost:5176`)
- Helmet com `contentSecurityPolicy: false` (SPA admin)

---

## 11. Schedulers em execução

Iniciados em `server.ts:25-28`:

1. **Settlement scheduler** (`internal.scheduler.ts`): `setInterval` de 1s. Ativo apenas se `PAYMENT_PROVIDER=internal`. Busca `scheduled_settlements.settled=0` vencidos, atualiza `transactions.status='completed'`, gera webhook event, dispara callback.
2. **Callback retry scheduler** (`callback.retry.ts`): `setInterval` de 30s. Busca callbacks com `callback_status='failed'` e `callback_attempts<3`. Executa `sendCallback`. Após 3 falhas marca `delivery_failed`.

---

## 12. Diferenças vs. Spec 2026-03

| Item | Spec 2026-03 | Implementado 2026-04 |
|------|-------------|---------------------|
| Porta Admin | 5175 | **5176** |
| Total de endpoints admin | 20 | 17 |
| `/admin/splits`, `/admin/tokens`, `/admin/webhooks` | Previstos | **Não implementados** |
| `/admin/webhooks/:id/retry` | Previsto | **Chamado pelo frontend, não existe no backend (dívida técnica)** |
| `POST /admin/transactions/:id/simulate-payment` | Não listado | **Implementado** |
| `POST /pay/transactions/:id/splits` | Não listado | **Implementado** |
| Páginas SPA | 12 previstas | 8 implementadas |
| Recharts LineChart no dashboard | Volume 30d por app (line) | **BarChart horizontal por app** + **PieChart por tipo** |
| Notificação ao ecp-bank | Não listado | **Implementado** (`bank-card-notifier.ts`) |
| `node-cron` | Listado como tecnologia | **Instalado, mas não usado** (schedulers usam `setInterval`) |

---

*Stack real: TypeScript 5.5 · Fastify 5.0 · better-sqlite3 11.3 · React 18.3 · Vite 5.4 · Tailwind 3.4 · Recharts 2.12 · Lucide 0.441*
*Documento gerado a partir do código em `03-product-delivery/` — 20/04/2026*
