-- ECP Pay — Migration 001: Initial Schema
-- All tables and indexes from tech_spec.md Section 4

-- Transações (ledger central do ecp-pay)
CREATE TABLE IF NOT EXISTS transactions (
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
  pix_expiration    TEXT,

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
CREATE TABLE IF NOT EXISTS splits (
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
CREATE TABLE IF NOT EXISTS card_tokens (
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
CREATE TABLE IF NOT EXISTS refunds (
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
CREATE TABLE IF NOT EXISTS webhook_events (
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
CREATE TABLE IF NOT EXISTS feature_flags (
  key               TEXT PRIMARY KEY,
  value             TEXT NOT NULL,
  description       TEXT,
  updated_by        TEXT,
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Audit log
CREATE TABLE IF NOT EXISTS audit_logs (
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
CREATE TABLE IF NOT EXISTS admin_users (
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
CREATE TABLE IF NOT EXISTS app_registrations (
  id                TEXT PRIMARY KEY,
  app_name          TEXT NOT NULL UNIQUE,       -- 'ecp-bank' | 'ecp-emps' | 'ecp-food'
  api_key           TEXT NOT NULL UNIQUE,       -- chave de autenticação do app
  callback_base_url TEXT NOT NULL,              -- URL base para callbacks
  is_active         INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Simulação de liquidação (modo INTERNAL)
CREATE TABLE IF NOT EXISTS scheduled_settlements (
  id                TEXT PRIMARY KEY,
  transaction_id    TEXT NOT NULL REFERENCES transactions(id),
  settle_at         TEXT NOT NULL,              -- datetime para mudar status
  settled           INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_tx_source ON transactions(source_app);
CREATE INDEX IF NOT EXISTS idx_tx_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_tx_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_tx_created ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_tx_customer ON transactions(customer_document);
CREATE INDEX IF NOT EXISTS idx_tx_idempotency ON transactions(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_tx_provider_id ON transactions(provider_id);
CREATE INDEX IF NOT EXISTS idx_splits_tx ON splits(transaction_id);
CREATE INDEX IF NOT EXISTS idx_tokens_customer ON card_tokens(customer_document);
CREATE INDEX IF NOT EXISTS idx_tokens_active ON card_tokens(is_active);
CREATE INDEX IF NOT EXISTS idx_refunds_tx ON refunds(transaction_id);
CREATE INDEX IF NOT EXISTS idx_webhook_event_id ON webhook_events(event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_tx ON webhook_events(transaction_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_scheduled_settle ON scheduled_settlements(settle_at, settled);
