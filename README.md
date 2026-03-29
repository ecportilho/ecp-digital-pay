# ECP Pay — Serviço Centralizado de Pagamentos

> Serviço centralizado de pagamentos para o ecossistema ECP. Qualquer app processa qualquer meio de pagamento com uma única chamada, sem conhecer gateways, sem duplicar código.

**Stack:** TypeScript + Fastify 5.0 + SQLite3 + React 18.3 + Vite 5.4
**Versão:** 1.0
**Status:** Em desenvolvimento

---

## Arquitetura

```
                        Ecossistema ECP
         +------------------------------------------+
         |                                          |
    ecp-bank       ecp-emps        ecp-food
    (porta 3333)   (porta 3334)    (porta 3000)
         |              |              |
         +------+-------+------+------+
                |              |
           X-API-Key      X-API-Key
                |              |
    +-----------v--------------v-----------+
    |          ECP PAY (porta 3335)        |
    |                                      |
    |   +------------------------------+   |
    |   |     Serviço de Pagamentos    |   |
    |   |     (Pix / Cartão / Boleto)  |   |
    |   +------+-----------------------+   |
    |          |                           |
    |   +------v-----------------------+   |
    |   |    Provider Factory          |   |
    |   |  (alternável via flag)       |   |
    |   +------+-----------+----------+   |
    |          |           |              |
    |   +------v---+  +---v----------+   |
    |   | INTERNAL |  |   ASAAS      |   |
    |   | (mock)   |  |  (gateway)   |   |
    |   +----------+  +--------------+   |
    |                                      |
    |   +------------------------------+   |
    |   |   Painel Admin (porta 5176)  |   |
    |   |  Dashboard / Transações /    |   |
    |   |  Providers / Webhooks / ...  |   |
    |   +------------------------------+   |
    |                                      |
    |   [SQLite: database-pay.sqlite]      |
    +--------------------------------------+
```

---

## Início Rápido

### Pré-requisitos

- **Node.js** >= 20
- **npm** >= 10
- Git

### Instalação e Execução

```bash
# 1. Clone o repositório
git clone <repo-url> ecp-digital-pay
cd ecp-digital-pay/03-product-delivery

# 2. Instale as dependências (raiz + server + web)
npm install

# 3. Copie o arquivo de ambiente
cp .env.example .env

# 4. Inicie tudo (API + Painel Admin)
npm run dev
```

Este único comando inicia:
- **API** em `http://localhost:3335`
- **Painel Admin** em `http://localhost:5176`

O banco SQLite (`database-pay.sqlite`) é criado automaticamente na primeira execução, com migrações e dados de seed aplicados.

### Dados de Seed (credenciais padrão)

| Recurso | Valor |
|---------|-------|
| **Login Admin** | `admin@ecpay.dev` / `Admin@123` |
| **API Key ecp-bank** | `ecp-bank-dev-key` |
| **API Key ecp-emps** | `ecp-emps-dev-key` |
| **API Key ecp-food** | `ecp-food-dev-key` |
| **Provider Padrão** | `internal` (sem gateway externo necessário) |

---

## Variáveis de Ambiente

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `PORT` | `3335` | Porta do servidor da API |
| `HOST` | `0.0.0.0` | Endereço de bind do servidor |
| `NODE_ENV` | `development` | Ambiente |
| `JWT_SECRET` | `ecp-pay-admin-secret-*` | Segredo JWT para o painel admin |
| `DATABASE_PATH` | `./database-pay.sqlite` | Caminho do arquivo SQLite |
| `CORS_ORIGIN` | `http://localhost:5176` | Origem CORS permitida (painel admin) |
| `PAYMENT_PROVIDER` | `internal` | Provider ativo: `internal` ou `external` |
| `ASAAS_API_KEY` | _(vazio)_ | Chave da API Asaas (apenas quando provider=external) |
| `ASAAS_SANDBOX` | `true` | Usar ambiente sandbox do Asaas |
| `ASAAS_WEBHOOK_TOKEN` | _(vazio)_ | Token para validar webhooks do Asaas |
| `INTERNAL_SIMULATION_DELAY` | `3000` | ms até liquidação simulada (modo internal) |
| `INTERNAL_AUTO_APPROVE_CARDS` | `true` | Aprovar cartões automaticamente no modo internal |
| `INTERNAL_MAX_SIMULATED_AMOUNT` | `10000000` | Valor máximo por transação simulada (centavos) |
| `VITE_API_URL` | `http://localhost:3335` | URL da API para o frontend |

---

## Visão Geral da API

URL Base: `http://localhost:3335`

### API de Pagamentos (consumida pelos apps do ecossistema)

Autenticação: header `X-API-Key` com chave do app registrado.

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/pay/pix` | Criar cobrança Pix (QR Code + copia e cola) |
| `POST` | `/pay/card` | Cobrar cartão de crédito (novo ou tokenizado) |
| `POST` | `/pay/boleto` | Emitir boleto com código de barras + QR Pix |
| `GET` | `/pay/transactions/:id` | Consultar status da transação |
| `POST` | `/pay/transactions/:id/refund` | Estorno total ou parcial |
| `GET` | `/pay/cards/:customer_document` | Listar cartões salvos do cliente |
| `DELETE` | `/pay/cards/tokens/:token_id` | Remover token do cofre |
| `POST` | `/pay/webhooks/asaas` | Receber webhook do Asaas |
| `GET` | `/pay/health` | Health check + provider ativo |

### API Admin (painel web)

Autenticação: token JWT Bearer via login do painel admin.

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/admin/auth/login` | Login do painel admin |
| `GET` | `/admin/auth/me` | Dados do usuário admin logado |
| `GET` | `/admin/dashboard` | KPIs e métricas agregadas |
| `GET` | `/admin/transactions` | Lista paginada de transações com filtros |
| `GET` | `/admin/transactions/summary` | Resumo por tipo/app/período |
| `GET` | `/admin/transactions/:id` | Detalhe completo da transação |
| `GET` | `/admin/providers` | Informações do provider ativo |
| `POST` | `/admin/providers/switch` | Alternar INTERNAL / EXTERNAL |
| `GET` | `/admin/feature-flags` | Listar feature flags |
| `PATCH` | `/admin/feature-flags/:key` | Atualizar feature flag |
| `GET` | `/admin/config` | Configurações gerais |
| `PATCH` | `/admin/config` | Atualizar configurações |
| `GET` | `/admin/apps` | Apps registrados |
| `POST` | `/admin/apps` | Registrar novo app |
| `PATCH` | `/admin/apps/:id` | Atualizar configuração do app |
| `GET` | `/admin/splits` | Regras e extrato de split |
| `GET` | `/admin/tokens` | Estatísticas do cofre de cartões |
| `GET` | `/admin/webhooks` | Log de eventos de webhook |
| `POST` | `/admin/webhooks/:id/retry` | Retry manual de callback |
| `GET` | `/admin/audit-logs` | Log de auditoria |

**Total: 29 endpoints (9 pagamentos + 20 admin)**

---

## Modos de Provider

O ECP Pay suporta dois modos de provider, alternáveis em tempo de execução sem reiniciar o servidor:

### INTERNAL (padrão para desenvolvimento)

- Nenhum gateway externo necessário
- Pix: gera QR Code mock, aprova automaticamente após delay configurável
- Cartão: aprova instantaneamente (rejeita se últimos 4 dígitos = 9999 ou valor > R$ 100 mil)
- Boleto: gera código de barras e linha digitável mock
- Webhooks gerados internamente pelo scheduler
- **Custo zero, sem dependências externas, comportamento determinístico**

### EXTERNAL (gateway Asaas)

- Conecta à API real do Asaas (sandbox ou produção)
- QR Codes Pix reais, processamento de cartão real, boletos reais
- Webhooks recebidos do Asaas e encaminhados aos apps do ecossistema
- Requer configuração do `ASAAS_API_KEY`

Alternar via:
- Painel Admin: toggle na página Providers
- API: `POST /admin/providers/switch`
- A troca é registrada no log de auditoria

---

## Painel Admin

Acesse em `http://localhost:5176` após executar `npm run dev`.

Login padrão: `admin@ecpay.dev` / `Admin@123`

### Páginas

| Página | Descrição |
|--------|-----------|
| **Dashboard** | KPIs, gráficos de volume, taxa de sucesso, status do provider |
| **Transações** | Lista completa com filtros (app, tipo, status, provider, período) |
| **Detalhe da Transação** | Timeline, payload, split, webhook, ações de estorno |
| **Providers** | Toggle INTERNAL/EXTERNAL com modal de confirmação |
| **Split** | Regras de split e extrato de distribuição |
| **Cofre de Tokens** | Estatísticas de cartões tokenizados (sem dados sensíveis) |
| **Webhooks** | Eventos recebidos/enviados, status de entrega, retry manual |
| **Apps** | Apps do ecossistema registrados, gestão de API keys |
| **Log de Auditoria** | Todas as ações administrativas registradas |
| **Configurações** | Feature flags, controles de simulação, rate limits |

---

## Estrutura do Projeto

```
ecp-digital-pay/
├── 00-specs/2026-03/                # Especificações de entrada
│   ├── product_briefing_spec.md
│   ├── tech_spec.md
│   └── design_spec.md
│
├── 01-strategic-context/            # Fase 01 — OKRs, OST, princípios
├── 02-product-discovery/            # Fase 02 — Backlog, protótipos
│   └── prototype/
│       ├── low-fi.html
│       └── high-fi.html
│
├── 03-product-delivery/             # Fase 03 — Código + artefatos
│   ├── server/                      # Back-end (API Fastify)
│   │   └── src/
│   │       ├── app.ts               # Setup do Fastify
│   │       ├── server.ts            # Ponto de entrada (porta 3335)
│   │       ├── database/            # Conexão SQLite, migrações, seed
│   │       ├── providers/           # Provider Pattern (core)
│   │       │   ├── payment-provider.interface.ts
│   │       │   ├── provider.factory.ts
│   │       │   ├── asaas/           # Adapter Asaas (externo)
│   │       │   └── internal/        # Adapter Internal (mock)
│   │       ├── modules/
│   │       │   ├── payment/         # Rotas + serviço de pagamentos
│   │       │   ├── card-vault/      # Cofre de tokens
│   │       │   ├── split/           # Motor de split
│   │       │   ├── webhook/         # Processamento de webhooks
│   │       │   ├── callback/        # Entrega de callbacks + retry
│   │       │   ├── admin/           # Endpoints do painel admin
│   │       │   └── health/          # Health check
│   │       └── shared/
│   │           ├── errors/          # AppError + códigos de erro
│   │           ├── middleware/      # Auth, rate limiter, error handler
│   │           └── utils/           # Money, UUID, auditoria, feature flags
│   ├── web/                         # Front-end (Painel Admin React)
│   │   └── src/
│   │       ├── routes/              # Páginas (dashboard, transações, etc.)
│   │       ├── components/          # Componentes UI, gráficos, layout
│   │       ├── hooks/               # useAuth, useFetch
│   │       ├── services/            # Cliente API
│   │       └── styles/              # CSS global (identidade ECP)
│   ├── package.json                 # Workspace raiz
│   ├── tsconfig.base.json
│   ├── .env / .env.example
│   ├── architecture-output.json
│   ├── backend-status.json
│   ├── frontend-status.json
│   ├── ai-engineer-status.json
│   └── qa-report.json
│
├── 04-product-operation/            # Fase 04 — SLOs, DORA, testes A/B
├── 05-docs/                         # Site de documentação + dashboard
│   ├── index.html
│   └── dashboard/
│       └── index.html
│
└── README.md
```

---

## Resumo das Regras de Negócio

| Regra | Descrição |
|-------|-----------|
| **RN-01** | Toda transação exige `idempotency_key` (UUID). Chave duplicada retorna resultado existente |
| **RN-02** | Todos os valores monetários em centavos (inteiro). Nunca float |
| **RN-03** | Flag `PAYMENT_PROVIDER` alternável em tempo de execução. Registrada em auditoria |
| **RN-04** | Modo internal: Pix aprovado automaticamente após delay configurável |
| **RN-05** | Modo internal: Cartão aprovado se valor < R$ 10 mil e últimos 4 dígitos ≠ 9999 |
| **RN-06** | Modo internal: Cartão rejeitado se últimos 4 = 9999 ou valor > R$ 100 mil |
| **RN-14** | Interface do provider é o ÚNICO caminho para executar operações de pagamento |
| **RN-16** | Dados de cartão (número, CVV) NUNCA persistidos. Apenas token + últimos 4 + bandeira |
| **RN-18** | Toda transação registra `source_app` identificando o app de origem |
| **RN-19** | Idempotência de webhook via `event_id` único com tabela de deduplicação |

---

## Modelo de Segurança

- **Autenticação de apps:** header `X-API-Key` validado contra tabela `app_registrations`
- **Autenticação admin:** JWT com hash de senha via bcrypt
- **RBAC:** admin (acesso total), operador (transações + webhooks), visualizador (somente leitura)
- **Cofre de cartões:** dados brutos do cartão nunca armazenados. Abordagem somente por token
- **Trilha de auditoria:** toda ação admin registrada com usuário, ação, recurso e IP
- **Rate limiting:** 100 transações/minuto por app
- **Idempotência:** constraint UNIQUE em `idempotency_key` previne cobranças duplicadas
- **CORS:** restrito à origem do painel admin
- **Helmet:** headers de segurança aplicados

---

## Links e Especificações

- [Briefing de Produto](./00-specs/2026-03/product_briefing_spec.md)
- [Especificação Técnica](./00-specs/2026-03/tech_spec.md)
- [Especificação de Design](./00-specs/2026-03/design_spec.md)
- [Site de Documentação](./05-docs/index.html)
- [Dashboard Operacional](./05-docs/dashboard/index.html)
