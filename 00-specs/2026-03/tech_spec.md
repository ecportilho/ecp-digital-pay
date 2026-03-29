# ECP Pay — Especificação Técnica

> **Versão:** 1.0  
> **Data:** 29/03/2026  
> **Status:** Em desenvolvimento  
> **Repositório:** `ecp-pay`

---

## 1. Stack Tecnológica

Stack idêntica ao ecossistema ECP. **Um `npm run dev` liga API + Painel Admin.**

### 1.1. Back-end (API)

| Tecnologia | Versão | Papel |
|-----------|--------|-------|
| **TypeScript** | 5.5 | Linguagem base |
| **Fastify** | 5.0 | Servidor HTTP |
| **Zod** | 3.23 | Validação de contratos |
| **SQLite3** | — | `database-pay.sqlite` |
| **better-sqlite3** | — | Driver SQLite síncrono |
| **tsx** | 4.19 | Hot reload |
| **bcryptjs** | — | Hash de senhas do painel admin |
| **jsonwebtoken** | — | JWT para autenticação do painel |
| **node-cron** | — | Scheduler para simulação de liquidação (modo INTERNAL) |

### 1.2. Front-end (Painel Admin)

| Tecnologia | Versão | Papel |
|-----------|--------|-------|
| **React** | 18.3 | UI |
| **React Router** | 6.26 | Navegação SPA |
| **Tailwind CSS** | 3.4 | Estilização |
| **Lucide React** | — | Ícones |
| **Vite** | 5.4 | Build tool |
| **Recharts** | 2.x | Gráficos do dashboard (leve, React-nativo) |

### 1.3. Portas e URLs

| Serviço | Porta | URL |
|---------|-------|-----|
| API (Payment Service) | 3335 | `http://localhost:3335` |
| Painel Admin (SPA) | 5175 | `http://localhost:5175` |
| ecp-bank (referência) | 3333 | `http://localhost:3333` |
| ecp-emps (referência) | 3334 | `http://localhost:3334` |

---

## 2. Regras Invioláveis de Código

Herda todas as 13 regras do ecossistema ECP, com adições:

1-13. (idênticas ao ecp-digital-bank — TypeScript strict, centavos, UUID, AppError, soft delete, etc.)

14. **NOVO — Provider Interface:** toda operação de pagamento passa pela `PaymentProvider` interface. NUNCA chamar Asaas diretamente de um service.
15. **NOVO — Feature flag em runtime:** `PAYMENT_PROVIDER` pode ser alterada sem restart via endpoint admin. Mudança registrada em audit log.
16. **NOVO — Paridade de contrato:** modo INTERNAL e EXTERNAL retornam exatamente o mesmo payload. Apps consumidores NUNCA sabem qual modo está ativo.
17. **NOVO — Cofre de tokens:** dados sensíveis (número de cartão, CVV) NUNCA persistidos. Apenas token + last4 + brand + holder_name.
18. **NOVO — Toda transação registra `source_app`:** identificação obrigatória de qual app originou a chamada.
19. **NOVO — Idempotência de webhook:** `event_id` único por evento. Processamento idempotente com dedup em tabela `webhook_events`.

---

## 3. Arquitetura — Provider Pattern

### 3.1. Provider Interface (contrato abstrato)

```typescript
// server/src/providers/payment-provider.interface.ts

export interface PixChargeInput {
  amount: number;              // centavos
  customer_name: string;
  customer_document: string;   // CPF ou CNPJ
  description?: string;
  expiration_seconds?: number; // default 3600 (1h)
}

export interface PixChargeResult {
  transaction_id: string;      // UUID interno do ecp-pay
  provider_id: string;         // ID no provider externo (ou UUID interno)
  qr_code: string;             // base64 da imagem QR
  qr_code_text: string;        // pix copia e cola
  expiration: string;          // ISO datetime
  status: TransactionStatus;
}

export interface CardChargeInput {
  amount: number;
  customer_name: string;
  customer_document: string;
  description?: string;
  card_token?: string;         // se já salvo no cofre
  card_number?: string;        // se novo (será tokenizado)
  card_expiry?: string;
  card_cvv?: string;
  card_holder_name?: string;
  save_card?: boolean;
  installments?: number;       // 1-12
}

export interface CardChargeResult {
  transaction_id: string;
  provider_id: string;
  status: TransactionStatus;
  card_token?: string;         // retornado se save_card=true
  card_last4?: string;
  card_brand?: string;
}

export interface BoletoInput {
  amount: number;
  customer_name: string;
  customer_document: string;
  customer_email?: string;
  due_date: string;            // YYYY-MM-DD
  description?: string;
  interest_rate?: number;      // basis points (100 = 1%)
  penalty_rate?: number;       // basis points
  discount_amount?: number;    // centavos
  discount_days?: number;
}

export interface BoletoResult {
  transaction_id: string;
  provider_id: string;
  barcode: string;             // 47 dígitos
  digitable_line: string;
  pdf_url?: string;
  pix_qr_code?: string;       // QR Code Pix embutido no boleto
  pix_copy_paste?: string;
  due_date: string;
  status: TransactionStatus;
}

export interface RefundInput {
  transaction_id: string;
  amount?: number;             // parcial (centavos) ou undefined = total
}

export interface RefundResult {
  refund_id: string;
  original_transaction_id: string;
  amount: number;
  status: TransactionStatus;
}

export interface WebhookEvent {
  event_id: string;
  event_type: string;          // payment_confirmed | payment_failed | refund_completed | ...
  transaction_id: string;      // ID interno do ecp-pay
  provider_id: string;
  data: Record<string, unknown>;
  received_at: string;
}

export type TransactionStatus = 
  | 'pending' 
  | 'processing' 
  | 'completed' 
  | 'failed' 
  | 'refunded' 
  | 'partially_refunded'
  | 'expired'
  | 'cancelled';

export interface PaymentProvider {
  readonly name: string;       // "asaas" | "internal" | "stripe"
  
  createPixCharge(input: PixChargeInput): Promise<PixChargeResult>;
  createCardCharge(input: CardChargeInput): Promise<CardChargeResult>;
  createBoleto(input: BoletoInput): Promise<BoletoResult>;
  refund(input: RefundInput): Promise<RefundResult>;
  getTransactionStatus(provider_id: string): Promise<TransactionStatus>;
  parseWebhook(headers: Record<string, string>, body: unknown): Promise<WebhookEvent>;
}
```

### 3.2. Asaas Adapter (modo EXTERNAL)

```typescript
// server/src/providers/asaas/asaas.adapter.ts

export class AsaasAdapter implements PaymentProvider {
  readonly name = 'asaas';
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    const sandbox = process.env.ASAAS_SANDBOX === 'true';
    this.baseUrl = sandbox 
      ? 'https://sandbox.asaas.com/api/v3'
      : 'https://api.asaas.com/v3';
    this.apiKey = process.env.ASAAS_API_KEY!;
  }

  async createPixCharge(input: PixChargeInput): Promise<PixChargeResult> {
    // 1. Criar customer no Asaas (ou buscar existente)
    // 2. POST /payments { billingType: 'PIX', value, customer, ... }
    // 3. GET /payments/{id}/pixQrCode
    // 4. Mapear resposta para PixChargeResult
  }

  async createCardCharge(input: CardChargeInput): Promise<CardChargeResult> {
    // 1. POST /payments { billingType: 'CREDIT_CARD', creditCard, creditCardHolderInfo, ... }
    // 2. Se save_card: extrair creditCardToken da resposta
    // 3. Mapear resposta para CardChargeResult
  }

  async createBoleto(input: BoletoInput): Promise<BoletoResult> {
    // 1. POST /payments { billingType: 'BOLETO', dueDate, value, ... }
    // 2. Extrair barcode, linha digitável
    // 3. Mapear resposta para BoletoResult
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    // POST /payments/{id}/refund { value }
  }

  async getTransactionStatus(provider_id: string): Promise<TransactionStatus> {
    // GET /payments/{provider_id} → mapear status Asaas para TransactionStatus
  }

  async parseWebhook(headers: Record<string, string>, body: unknown): Promise<WebhookEvent> {
    // Validar assinatura do webhook Asaas
    // Mapear evento Asaas para WebhookEvent normalizado
  }
}
```

### 3.3. Internal Provider (modo INTERNAL)

```typescript
// server/src/providers/internal/internal.adapter.ts

export class InternalAdapter implements PaymentProvider {
  readonly name = 'internal';
  private simulationDelay: number; // ms, default 3000

  constructor() {
    this.simulationDelay = parseInt(process.env.INTERNAL_SIMULATION_DELAY || '3000');
  }

  async createPixCharge(input: PixChargeInput): Promise<PixChargeResult> {
    const transactionId = crypto.randomUUID();
    // 1. Gerar QR Code localmente (formato Pix válido, payload mock)
    // 2. Gerar pix copia-e-cola com dados formatados
    // 3. Registrar no banco com status 'pending'
    // 4. Agendar liquidação simulada após this.simulationDelay
    // 5. Retornar PixChargeResult
  }

  async createCardCharge(input: CardChargeInput): Promise<CardChargeResult> {
    const transactionId = crypto.randomUUID();
    // 1. Se card_number: gerar token local (SHA-256 de número+validade)
    // 2. Simular análise antifraude (aprovar por padrão, rejeitar se amount > 100000)
    // 3. Registrar no banco com status 'completed' (cartão é síncrono)
    // 4. Retornar CardChargeResult com token
  }

  async createBoleto(input: BoletoInput): Promise<BoletoResult> {
    const transactionId = crypto.randomUUID();
    // 1. Gerar código de barras mock (formato FEBRABAN, 47 dígitos)
    // 2. Gerar linha digitável formatada
    // 3. Registrar no banco com status 'pending'
    // 4. Retornar BoletoResult
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    // Estorno instantâneo: alterar status da transação original
  }

  async getTransactionStatus(provider_id: string): Promise<TransactionStatus> {
    // Buscar no banco local
  }

  async parseWebhook(headers: Record<string, string>, body: unknown): Promise<WebhookEvent> {
    // No modo INTERNAL, webhooks são gerados pelo próprio ecp-pay
    // Este método é chamado pelo scheduler interno
  }
}
```

### 3.4. Provider Factory

```typescript
// server/src/providers/provider.factory.ts

export class ProviderFactory {
  private static instance: PaymentProvider;
  private static currentMode: 'internal' | 'external';

  static getProvider(): PaymentProvider {
    const mode = getFeatureFlag('PAYMENT_PROVIDER'); // lê do banco ou env
    
    if (!this.instance || this.currentMode !== mode) {
      this.instance = mode === 'external' 
        ? new AsaasAdapter() 
        : new InternalAdapter();
      this.currentMode = mode;
    }
    
    return this.instance;
  }

  static switchProvider(mode: 'internal' | 'external', userId: string): void {
    setFeatureFlag('PAYMENT_PROVIDER', mode);
    auditLog({ action: 'SWITCH_PROVIDER', userId, metadata: { from: this.currentMode, to: mode } });
    this.instance = null!; // força recriação no próximo getProvider()
    this.currentMode = mode;
  }
}
```

---

## 4. Modelo de Dados (SQLite)

### 4.1. Tabelas

```sql
-- Transações (ledger central do ecp-pay)
CREATE TABLE transactions (
  id                TEXT PRIMARY KEY,           -- UUID v4
  source_app        TEXT NOT NULL,              -- 'ecp-bank' | 'ecp-emps' | 'ecp-food'
  provider          TEXT NOT NULL,              -- 'internal' | 'asaas' | 'stripe'
  provider_id       TEXT,                       -- ID na API do provider externo
  type              TEXT NOT NULL,              -- 'pix' | 'card' | 'boleto'
  amount            INTEGER NOT NULL,           -- centavos
  currency          TEXT NOT NULL DEFAULT 'BRL',
  status            TEXT NOT NULL DEFAULT 'pending',
  customer_name     TEXT NOT NULL,
  customer_document TEXT NOT NULL,              -- CPF ou CNPJ
  description       TEXT,
  idempotency_key   TEXT NOT NULL UNIQUE,
  
  -- Dados específicos Pix
  pix_qr_code       TEXT,
  pix_qr_code_text  TEXT,
  pix_expiration     TEXT,
  
  -- Dados específicos cartão
  card_token        TEXT,
  card_last4        TEXT,
  card_brand        TEXT,
  card_installments INTEGER DEFAULT 1,
  
  -- Dados específicos boleto
  boleto_barcode    TEXT,
  boleto_digitable  TEXT,
  boleto_due_date   TEXT,
  boleto_pdf_url    TEXT,
  boleto_pix_qr     TEXT,
  
  -- Metadados
  metadata          TEXT,                       -- JSON livre do app de origem
  callback_url      TEXT,                       -- URL para notificar app quando status mudar
  callback_status   TEXT DEFAULT 'pending',     -- pending | delivered | failed
  callback_attempts INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at      TEXT,
  refunded_at       TEXT
);

-- Split de pagamento
CREATE TABLE splits (
  id                TEXT PRIMARY KEY,
  transaction_id    TEXT NOT NULL REFERENCES transactions(id),
  account_id        TEXT NOT NULL,              -- identificador da conta destino
  account_name      TEXT NOT NULL,              -- nome legível
  amount            INTEGER NOT NULL,           -- centavos
  type              TEXT NOT NULL,              -- 'fixed' | 'percentage'
  status            TEXT NOT NULL DEFAULT 'pending',
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Cofre de tokens de cartão
CREATE TABLE card_tokens (
  id                TEXT PRIMARY KEY,
  customer_document TEXT NOT NULL,              -- CPF ou CNPJ (chave do cofre)
  provider          TEXT NOT NULL,              -- quem gerou o token
  token             TEXT NOT NULL,              -- creditCardToken (Asaas) ou hash (internal)
  last4             TEXT NOT NULL,
  brand             TEXT NOT NULL,              -- visa | mastercard | elo | amex
  holder_name       TEXT NOT NULL,
  expiry_month      INTEGER NOT NULL,
  expiry_year       INTEGER NOT NULL,
  is_active         INTEGER NOT NULL DEFAULT 1,
  source_app        TEXT NOT NULL,              -- app onde o cartão foi salvo pela primeira vez
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at        TEXT
);

-- Estornos
CREATE TABLE refunds (
  id                    TEXT PRIMARY KEY,
  transaction_id        TEXT NOT NULL REFERENCES transactions(id),
  provider_refund_id    TEXT,
  amount                INTEGER NOT NULL,       -- centavos
  status                TEXT NOT NULL DEFAULT 'pending',
  reason                TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at          TEXT
);

-- Eventos de webhook (idempotência)
CREATE TABLE webhook_events (
  id                TEXT PRIMARY KEY,
  event_id          TEXT NOT NULL UNIQUE,       -- ID único do evento (dedup)
  provider          TEXT NOT NULL,
  event_type        TEXT NOT NULL,
  transaction_id    TEXT REFERENCES transactions(id),
  payload           TEXT NOT NULL,              -- JSON raw do provider
  processed         INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Feature flags
CREATE TABLE feature_flags (
  key               TEXT PRIMARY KEY,
  value             TEXT NOT NULL,
  description       TEXT,
  updated_by        TEXT,
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Audit log
CREATE TABLE audit_logs (
  id                TEXT PRIMARY KEY,
  user_id           TEXT,
  action            TEXT NOT NULL,
  resource          TEXT NOT NULL,
  resource_id       TEXT,
  metadata          TEXT,                       -- JSON
  ip_address        TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Usuários do painel admin
CREATE TABLE admin_users (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  email             TEXT NOT NULL UNIQUE,
  password          TEXT NOT NULL,              -- bcrypt hash
  role              TEXT NOT NULL DEFAULT 'viewer', -- admin | operator | viewer
  is_active         INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at     TEXT
);

-- Configuração de callbacks por app
CREATE TABLE app_registrations (
  id                TEXT PRIMARY KEY,
  app_name          TEXT NOT NULL UNIQUE,       -- 'ecp-bank' | 'ecp-emps' | 'ecp-food'
  api_key           TEXT NOT NULL UNIQUE,       -- chave de autenticação do app
  callback_base_url TEXT NOT NULL,              -- URL base para callbacks
  is_active         INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Simulação de liquidação (modo INTERNAL)
CREATE TABLE scheduled_settlements (
  id                TEXT PRIMARY KEY,
  transaction_id    TEXT NOT NULL REFERENCES transactions(id),
  settle_at         TEXT NOT NULL,              -- datetime para mudar status
  settled           INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 4.2. Índices

```sql
CREATE INDEX idx_tx_source ON transactions(source_app);
CREATE INDEX idx_tx_status ON transactions(status);
CREATE INDEX idx_tx_type ON transactions(type);
CREATE INDEX idx_tx_created ON transactions(created_at);
CREATE INDEX idx_tx_customer ON transactions(customer_document);
CREATE INDEX idx_tx_idempotency ON transactions(idempotency_key);
CREATE INDEX idx_tx_provider_id ON transactions(provider_id);
CREATE INDEX idx_splits_tx ON splits(transaction_id);
CREATE INDEX idx_tokens_customer ON card_tokens(customer_document);
CREATE INDEX idx_tokens_active ON card_tokens(is_active);
CREATE INDEX idx_refunds_tx ON refunds(transaction_id);
CREATE INDEX idx_webhook_event_id ON webhook_events(event_id);
CREATE INDEX idx_webhook_tx ON webhook_events(transaction_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_created ON audit_logs(created_at);
CREATE INDEX idx_scheduled_settle ON scheduled_settlements(settle_at, settled);
```

---

## 5. Contratos da API

Base URL: `http://localhost:3335`

### 5.1. Payment API (consumida pelos apps)

Autenticação: header `X-API-Key` com chave registrada em `app_registrations`.

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/pay/pix` | Criar cobrança Pix (QR Code + copia e cola) |
| POST | `/pay/card` | Cobrar cartão (novo ou token salvo) |
| POST | `/pay/boleto` | Emitir boleto com código de barras + QR Pix |
| GET | `/pay/transactions/:id` | Consultar status de transação |
| POST | `/pay/transactions/:id/refund` | Estorno total ou parcial |
| GET | `/pay/cards/:customer_document` | Listar cartões salvos de um cliente |
| DELETE | `/pay/cards/tokens/:token_id` | Remover token do cofre |
| POST | `/pay/webhooks/asaas` | Receber webhook do Asaas |
| GET | `/pay/health` | Health check + provider ativo |

### 5.2. Admin API (painel web)

Autenticação: JWT via login do painel admin.

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/admin/auth/login` | Login do painel |
| GET | `/admin/auth/me` | Dados do usuário logado |
| GET | `/admin/dashboard` | KPIs agregados (volume, txs, taxa sucesso) |
| GET | `/admin/transactions` | Lista paginada com filtros |
| GET | `/admin/transactions/:id` | Detalhe completo da transação |
| GET | `/admin/transactions/summary` | Resumo por tipo, app, período |
| GET | `/admin/providers` | Provider ativo + configuração |
| POST | `/admin/providers/switch` | Alternar INTERNAL ↔ EXTERNAL |
| GET | `/admin/feature-flags` | Listar feature flags |
| PATCH | `/admin/feature-flags/:key` | Alterar feature flag |
| GET | `/admin/splits` | Regras e extrato de split |
| GET | `/admin/tokens` | Estatísticas do cofre (count por brand, app) |
| GET | `/admin/webhooks` | Log de webhooks recebidos/enviados |
| POST | `/admin/webhooks/:id/retry` | Retry manual de callback |
| GET | `/admin/audit-logs` | Log de auditoria |
| GET | `/admin/apps` | Apps registrados |
| POST | `/admin/apps` | Registrar novo app |
| PATCH | `/admin/apps/:id` | Atualizar configuração de app |
| GET | `/admin/config` | Configurações gerais |
| PATCH | `/admin/config` | Atualizar configurações |

**Total: 29 endpoints (9 payment + 20 admin)**

---

## 6. Estrutura de Pastas

```
ecp-pay/
├── server/
│   ├── src/
│   │   ├── app.ts
│   │   ├── server.ts                     # Entry point — porta 3335
│   │   ├── database/
│   │   │   ├── connection.ts             # database-pay.sqlite
│   │   │   ├── migrations/
│   │   │   └── seed.ts
│   │   ├── providers/                    # ★ CORE: Provider Pattern
│   │   │   ├── payment-provider.interface.ts  # Contrato abstrato
│   │   │   ├── provider.factory.ts       # Factory com feature flag
│   │   │   ├── asaas/
│   │   │   │   ├── asaas.adapter.ts      # Implementa PaymentProvider
│   │   │   │   ├── asaas.mapper.ts       # Mapeia payloads Asaas ↔ ECP
│   │   │   │   └── asaas.webhook.ts      # Parser de webhooks Asaas
│   │   │   └── internal/
│   │   │       ├── internal.adapter.ts   # Implementa PaymentProvider (mock)
│   │   │       ├── internal.qrcode.ts    # Gerador de QR Code local
│   │   │       ├── internal.boleto.ts    # Gerador de boleto local
│   │   │       └── internal.scheduler.ts # Simulação de liquidação
│   │   ├── modules/
│   │   │   ├── payment/                  # API de pagamentos (consumida pelos apps)
│   │   │   │   ├── payment.routes.ts
│   │   │   │   ├── payment.service.ts    # Orquestra: valida → provider → persiste → callback
│   │   │   │   └── payment.schema.ts
│   │   │   ├── card-vault/              # Cofre de tokens
│   │   │   │   ├── card-vault.routes.ts
│   │   │   │   ├── card-vault.service.ts
│   │   │   │   └── card-vault.schema.ts
│   │   │   ├── split/                    # Lógica de split
│   │   │   │   ├── split.service.ts
│   │   │   │   └── split.schema.ts
│   │   │   ├── webhook/                  # Recepção e processamento de webhooks
│   │   │   │   ├── webhook.routes.ts
│   │   │   │   ├── webhook.service.ts
│   │   │   │   └── webhook.schema.ts
│   │   │   ├── callback/                 # Notificação de volta aos apps
│   │   │   │   ├── callback.service.ts
│   │   │   │   └── callback.retry.ts
│   │   │   ├── admin/                    # Painel admin (endpoints)
│   │   │   │   ├── admin-auth.routes.ts
│   │   │   │   ├── admin-dashboard.routes.ts
│   │   │   │   ├── admin-transactions.routes.ts
│   │   │   │   ├── admin-providers.routes.ts
│   │   │   │   ├── admin-config.routes.ts
│   │   │   │   └── admin-apps.routes.ts
│   │   │   └── health/
│   │   │       └── health.routes.ts
│   │   ├── shared/
│   │   │   ├── errors/
│   │   │   │   ├── app-error.ts
│   │   │   │   └── error-codes.ts
│   │   │   ├── middleware/
│   │   │   │   ├── api-key-auth.ts       # Autentica apps via X-API-Key
│   │   │   │   ├── admin-auth.ts         # JWT para painel admin
│   │   │   │   ├── rate-limiter.ts
│   │   │   │   └── error-handler.ts
│   │   │   └── utils/
│   │   │       ├── money.ts
│   │   │       ├── uuid.ts
│   │   │       ├── feature-flags.ts      # get/set flags do banco
│   │   │       └── audit.ts              # Helper de audit log
│   │   └── types/
│   │       └── fastify.d.ts
│   ├── tsconfig.json
│   ├── package.json
│   └── database-pay.sqlite
│
├── web/                                  # Painel Admin SPA
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── routes/
│   │   │   ├── index.tsx
│   │   │   ├── login.tsx
│   │   │   ├── dashboard.tsx             # KPIs, gráficos, provider ativo
│   │   │   ├── transactions.tsx          # Lista + filtros + busca
│   │   │   ├── transaction-detail.tsx    # Detalhe completo + timeline
│   │   │   ├── providers.tsx             # Toggle INTERNAL/EXTERNAL + config
│   │   │   ├── splits.tsx               # Regras de split + extrato
│   │   │   ├── card-vault.tsx           # Tokens salvos (stats)
│   │   │   ├── webhooks.tsx             # Log de webhooks + retry
│   │   │   ├── apps.tsx                 # Apps registrados + API keys
│   │   │   ├── audit-log.tsx            # Log de auditoria
│   │   │   └── settings.tsx             # Feature flags + configurações
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   ├── Header.tsx
│   │   │   │   └── MobileNav.tsx
│   │   │   ├── ui/                      # Mesmos componentes do ecossistema ECP
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── Card.tsx
│   │   │   │   ├── Input.tsx
│   │   │   │   ├── Modal.tsx
│   │   │   │   ├── Table.tsx
│   │   │   │   ├── Badge.tsx
│   │   │   │   └── Toggle.tsx           # ★ NOVO: Toggle para feature flags
│   │   │   ├── dashboard/
│   │   │   │   ├── VolumeChart.tsx
│   │   │   │   ├── SuccessRateChart.tsx
│   │   │   │   ├── RevenueByAppChart.tsx
│   │   │   │   └── ProviderStatusCard.tsx
│   │   │   ├── transactions/
│   │   │   │   ├── TransactionList.tsx
│   │   │   │   ├── TransactionFilters.tsx
│   │   │   │   ├── TransactionTimeline.tsx
│   │   │   │   └── TransactionStatusBadge.tsx
│   │   │   └── providers/
│   │   │       ├── ProviderToggle.tsx    # ★ Toggle visual INTERNAL ↔ EXTERNAL
│   │   │       └── ProviderConfig.tsx
│   │   ├── hooks/
│   │   │   ├── useAuth.ts
│   │   │   ├── useFetch.ts
│   │   │   └── useDashboard.ts
│   │   ├── services/
│   │   │   └── api.ts
│   │   ├── lib/
│   │   │   └── formatters.ts
│   │   └── styles/
│   │       └── globals.css              # MESMA identidade visual ECP
│   ├── index.html
│   ├── tailwind.config.ts
│   ├── vite.config.ts
│   └── package.json
│
├── 00-specs/
│   ├── product_briefing_espec.md
│   ├── tech_spec.md
│   └── design_spec.md
│
├── package.json
├── .env
├── .env.example
├── .gitattributes
├── .gitignore
├── .npmrc
├── tsconfig.base.json
└── README.md
```

---

## 7. Variáveis de Ambiente

```bash
# ECP Pay — Variáveis de Ambiente

# Servidor
PORT=3335
HOST=0.0.0.0
NODE_ENV=development

# JWT (painel admin)
JWT_SECRET=ecp-pay-admin-secret-mude-em-producao

# Banco de dados
DATABASE_PATH=./database-pay.sqlite

# CORS (painel admin)
CORS_ORIGIN=http://localhost:5175

# ★ FEATURE FLAG — Provider
PAYMENT_PROVIDER=internal               # "internal" ou "external"

# Asaas (só necessário quando PAYMENT_PROVIDER=external)
ASAAS_API_KEY=                           # API key do Asaas
ASAAS_SANDBOX=true                       # true = sandbox, false = produção
ASAAS_WEBHOOK_TOKEN=                     # Token para validar webhooks

# Modo INTERNAL — Configuração de simulação
INTERNAL_SIMULATION_DELAY=3000           # ms até "liquidação" simulada (default 3s)
INTERNAL_AUTO_APPROVE_CARDS=true         # aprovar cartões automaticamente
INTERNAL_MAX_SIMULATED_AMOUNT=10000000   # R$ 100.000 máx por transação simulada

# Frontend
VITE_API_URL=http://localhost:3335
```

---

## 8. Dados de Seed

| Dado | Valor |
|------|-------|
| **Admin** | Edson Portilho (admin@ecpay.dev / Admin@123) |
| **Feature flag** | PAYMENT_PROVIDER = internal |
| **Apps registrados** | ecp-bank (key: ecp-bank-dev-key), ecp-emps (key: ecp-emps-dev-key), ecp-food (key: ecp-food-dev-key) |
| **Transações demo** | 20 transações mistas (pix, card, boleto) de todos os apps |
| **Tokens demo** | 3 cartões tokenizados (2 Visa, 1 Mastercard) |
| **Splits demo** | 5 transações com split (simulando ecp-food) |
| **Webhooks demo** | 10 eventos processados |

---

## 9. Segurança

- Apps autenticados via `X-API-Key` (registrada em `app_registrations`)
- Painel admin autenticado via JWT (login + senha)
- RBAC no admin: `admin` (tudo), `operator` (transações + webhooks), `viewer` (só leitura)
- Dados de cartão (número, CVV) NUNCA persistidos — apenas token + last4 + brand
- Audit log de toda ação administrativa
- Rate limiting: 100 transações/minuto por app
- Idempotência: `idempotency_key` em toda transação, `event_id` em todo webhook
- Webhook do Asaas validado por token
- CORS restrito à origem do painel admin
- Helmet para headers de segurança

---

*Documento gerado para o projeto ECP Pay — v1.0*  
*Stack: TypeScript + Fastify 5.0 + SQLite3 + React 18.3 + Vite 5.4*
