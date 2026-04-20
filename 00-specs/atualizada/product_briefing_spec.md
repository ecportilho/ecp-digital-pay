# ECP Pay — Product Briefing & Especificação Funcional

> **Versão:** 2.0
> **Data:** 20/04/2026
> **Status:** Implementado (fase 03 concluída)
> **Repositório:** `ecp-digital-pay`

---

## 1. Visão Geral do Produto

O **ECP Pay** é o serviço centralizado de pagamentos do ecossistema ECP. Funciona como camada de abstração entre os produtos ECP (ecp-digital-bank, ecp-digital-bank-emps, ecp-food e futuros apps) e gateways de pagamento externos (hoje apenas Asaas).

Nenhum app do ecossistema fala diretamente com um gateway. Todos falam com o ECP Pay, que roteia, processa, registra e concilia as transações.

### 1.1. Problemas que resolve

1. **Acoplamento:** Sem ele, cada app teria sua própria integração com Asaas, duplicando código, tratamento de erros e lógica de webhooks.
2. **Portabilidade:** Se o Asaas mudar taxas ou sair do ar, a troca acontece em um único adapter — sem tocar nos apps.
3. **Observabilidade:** Todas as transações do ecossistema em um único banco com dashboard, logs e métricas.
4. **Independência de desenvolvimento:** Com o modo `internal`, todo o ecossistema roda sem conta no Asaas, sem internet, sem sandbox externo.

### 1.2. Posição no Ecossistema

```
ecp-digital-bank (PF)     ──┐
ecp-digital-bank-emps (PJ) ──┤──▶  ecp-pay (porta 3335)  ──▶  Asaas / Internal
ecp-food (delivery)        ──┤
futuro app                 ──┘
```

### 1.3. Feature Flag — Modo de Operação

| Modo | Variável | Comportamento |
|------|----------|---------------|
| **Internal** | `PAYMENT_PROVIDER=internal` | ECP Pay processa tudo internamente. Pix aprovado automaticamente após delay configurável (default 3s). Cartão aprovado/rejeitado por regras determinísticas. Boleto com código mock, pago via botão "Simular pagamento" no painel. Ideal para dev/staging/demos. |
| **External (Asaas)** | `PAYMENT_PROVIDER=external` | ECP Pay roteia para a API real do Asaas (sandbox ou produção). Transações reais. Webhooks reais. |

A flag é alterada via endpoint admin (`POST /admin/providers/switch`) ou toggle no painel admin web, sem reiniciar o servidor. A troca é registrada em audit log.

---

## 2. Público-Alvo

| Usuário | Papel | O que faz no ECP Pay |
|---------|-------|---------------------|
| **Desenvolvedor ECP** | Integrador | Consome a API REST (com `X-API-Key`) para processar pagamentos nos apps |
| **Operador financeiro** | Admin | Monitora transações, concilia, investiga falhas via painel web |
| **Edson (owner)** | Super admin | Configura providers, feature flags, credenciais, apps autorizados |

---

## 3. Funcionalidades da API (consumida pelos apps)

Base URL: `http://localhost:3335`. Todas as rotas `/pay/*` exigem `X-API-Key` registrada em `app_registrations`. Mutações exigem `X-Idempotency-Key`.

### 3.1. Pix

- Criar cobrança Pix (QR Code base64 + copia e cola) — `POST /pay/pix`
- Consultar status de transação — `GET /pay/transactions/:id`
- Estornar Pix (total/parcial) — `POST /pay/transactions/:id/refund`
- Receber webhook do provider — `POST /pay/webhooks/asaas`
- Suporte a `splits` inline no corpo da requisição

> **Nota:** Pix estático (valor fixo, sem vencimento) e envio para chave externa (cash-out) não estão implementados na versão atual.

### 3.2. Cartão de Crédito

- Cobrar cartão novo (one-time) — `POST /pay/card`
- Cobrar com token salvo no cofre — mesmo endpoint, campo `card_token`
- Tokenizar cartão e salvar no cofre — mesmo endpoint, campo `save_card: true`
- Parcelar em 1–12x — campo `installments`
- Estornar cobrança (total ou parcial) — `POST /pay/transactions/:id/refund`
- Listar cartões salvos por CPF — `GET /pay/cards/:customer_document`
- Remover token do cofre — `DELETE /pay/cards/tokens/:token_id`

### 3.3. Boleto

- Emitir boleto registrado (com QR Code Pix embutido no modo internal) — `POST /pay/boleto`
- Código de barras + linha digitável + PDF URL (no modo Asaas) retornados no response
- Parâmetros opcionais: `interest_rate`, `penalty_rate`, `discount_amount`, `discount_days`
- Cancelamento e emissão de carnê parcelado não implementados
- Boleto não é estornável (`TRANSACTION_NOT_REFUNDABLE`)

### 3.4. Split de Pagamento

- Criar splits inline no corpo da cobrança (campo `splits` em `/pay/pix`, `/pay/card`, `/pay/boleto`)
- Adicionar splits a uma transação existente — `POST /pay/transactions/:id/splits`
- Soma dos splits validada antes de processar (RN-09)
- Listagem administrativa via `GET /admin/splits`

### 3.5. Cofre de Tokens (Card Vault)

- Token vinculado a CPF/CNPJ + últimos 4 dígitos + bandeira + holder
- Reutilizável em qualquer app do ecossistema
- Dados sensíveis (número completo, CVV) NUNCA persistidos
- Soft delete (flag `is_active` + `deleted_at`)

### 3.6. Webhooks e Callbacks

- Recebimento de webhooks do Asaas em `POST /pay/webhooks/asaas`
- Dedup via `webhook_events.event_id` (constraint UNIQUE)
- Callback de volta ao app de origem via `POST` para a `callback_url` registrada
- Headers: `X-ECP-Pay-Event`, `X-ECP-Pay-Transaction`
- Retry automático (scheduler de 30s) com limite de 3 tentativas. Após 3 falhas → `callback_status = 'delivery_failed'`

### 3.7. Notificação ao banco (implementado)

- Quando uma cobrança de cartão é processada, o ECP Pay notifica automaticamente o `ecp-digital-bank` via `POST /api/cards/purchase-by-number` para registrar a compra na fatura do portador
- Fluxo análogo para Pix via `POST /api/pix/debit-by-cpf`
- Comportamento fire-and-forget (não bloqueia a resposta da cobrança)
- Localização: `03-product-delivery/server/src/modules/payment/bank-card-notifier.ts`

---

## 4. Funcionalidades do Painel Web (admin dashboard)

Porta implementada: `5176` (não 5175 como constava na spec anterior). JWT via login.

### 4.1. Dashboard (`/`)

- 6 KPI cards: Volume total, Transações, Taxa de sucesso, Hoje (volume + count), Completadas, Falharam
- Card destacado com provider ativo (INTERNAL/EXTERNAL) + botão "Gerenciar"
- Gráfico "Volume por app" (BarChart horizontal, Recharts)
- Gráfico "Distribuição por tipo" (PieChart donut: Pix/Cartão/Boleto)
- Mini-tabela com as últimas 10 transações

### 4.2. Transações (`/transactions`)

- Filtros: App (multi), Tipo (pix/card/boleto), Status, Busca por ID/documento
- Tabela: ID (mono), App, Tipo (badge), Valor, Cliente + documento mascarado, Status, Provider, Data
- Paginação numérica (15 por página, máx 100 no backend)
- Click na linha → detalhe da transação

### 4.3. Detalhe da Transação (`/transactions/:id`)

- Header com ID monospaced + botão voltar
- Card resumo: valor grande, status badge, type badge, provider badge
- Timeline vertical (Recharts): criada → processando → webhook → callback → completed
- Grid 2 colunas: Cliente, Pagamento, Provider, Callback
- Metadata JSON (CodeBlock)
- Timestamps com tempo total calculado
- Ações: Estornar (danger, com modal de confirmação), Reenviar callback, Simular pagamento (apenas modo internal, apenas transações pending)

### 4.4. Providers (`/providers`)

- Dois cards lado a lado: INTERNAL (Self-managed) e EXTERNAL (Asaas)
- Card ativo recebe borda lime 3px
- Badge "ATIVO" e 4 bullets descritivos por card
- Botão "Ativar" no card inativo → modal de confirmação
- Linha com "Ativo desde" e contagem de transações no modo atual
- Histórico de trocas (quando disponível)

### 4.5. Webhooks (`/webhooks`)

- Tabs: "Recebidos" (do Asaas) e "Enviados" (callbacks para apps)
- Recebidos: event_id, tipo, transação, processado, data, chevron para expandir payload JSON
- Enviados: transação, app destino, status, tentativas, data, botão Retry em callbacks `failed`
- Payload expandido renderizado como JSON formatado em bloco mono

### 4.6. Apps (`/apps`)

- Grid de cards com app_name, status dot, API key mascarada (com toggle show/hide), callback URL, stats (total de transações + volume)
- Botão "Registrar novo app" → modal (nome + callback URL)
- Botão "Regenerar key" → confirmação modal
- Badge Ativo/Inativo

### 4.7. Configurações (`/settings`)

- Seção "Feature Flags" com Toggle para cada flag booleana (PAYMENT_PROVIDER, INTERNAL_AUTO_APPROVE_CARDS)
- Card "Delay de simulação" com slider 0–30s (altera `INTERNAL_SIMULATION_DELAY`)
- Tabela de flags não-booleanas
- Card placeholder "Usuários admin" (não implementado)

### 4.8. Login (`/login`)

- Formulário centralizado com logo ECP Pay lime
- Email + senha com toggle show/hide
- Exibição de erro em caixa `danger/10`
- Seed: `admin@ecpay.dev` / `Admin@123`

### 4.9. Modo Internal — Controles especiais

- Banner amarelo no topo (`InternalBanner`) presente em todas as páginas autenticadas quando provider = internal
- Botão "Simular pagamento" na página de detalhe para transações pending (POST `/admin/transactions/:id/simulate-payment`)

### 4.10. Páginas da spec original não implementadas

- `/splits` (página própria de Split) — endpoint admin não implementado
- `/card-vault` (página própria do cofre) — endpoint admin não implementado
- `/audit-log` (página própria) — endpoint `/admin/audit-logs` existe, mas não há rota no SPA
- Navegação sidebar possui 6 itens: Dashboard, Transações, Providers, Webhooks, Apps, Configurações

---

## 5. Regras de Negócio (implementadas)

| ID | Regra | Status |
|----|-------|--------|
| RN-01 | Idempotência via `idempotency_key` UUID. Reenvio retorna resultado existente | ✅ `payment.service.ts:54` |
| RN-02 | Valores financeiros em centavos (integer). Nunca float | ✅ Em toda a base |
| RN-03 | `PAYMENT_PROVIDER` alterável em runtime via endpoint admin | ✅ `provider.factory.ts:30` |
| RN-04 | Modo internal — Pix aprovado automaticamente após `INTERNAL_SIMULATION_DELAY` (default 3000ms) | ✅ `internal.scheduler.ts` |
| RN-05 | Modo internal — Cartão aprovado se valor ≤ R$ 10.000 e last4 ≠ `9999` | ✅ `internal.adapter.ts:100-107` |
| RN-06 | Modo internal — `9999` = `CARD_DECLINED`. Valor > R$ 10.000 = `LIMIT_EXCEEDED` | ✅ Mesmo trecho |
| RN-07 | Modo internal — Boleto com barcode mock FEBRABAN. Pago via botão admin | ✅ `internal.boleto.ts` + `admin-transactions.routes.ts:178` |
| RN-08 | Token vinculado a CPF/CNPJ + last4 + brand. Reutilizável cross-app | ✅ `card_tokens` table |
| RN-09 | Soma dos splits ≤ total da transação | ✅ `split.service.ts` |
| RN-10 | Webhook callback retry: 3 tentativas com backoff; após 3 falhas → `delivery_failed` | ✅ `callback.service.ts:134` |
| RN-11 | Soft delete (card_tokens usa `deleted_at` + `is_active=0`) | ✅ |
| RN-12 | Audit log com user_id, timestamp, IP, metadata em toda ação admin | ✅ `audit.ts` |
| RN-13 | Rate limit 100 req/min por app | ✅ `rate-limiter.ts` |
| RN-14 | Service API key por app (não JWT) | ✅ `api-key-auth.ts` |
| RN-15 | Painel admin com JWT (bcrypt + 24h) | ✅ `admin-auth.routes.ts` |
| RN-16 | Número de cartão e CVV nunca armazenados | ✅ Contrato `CardChargeResult` |
| RN-17 | Estorno: cartão até 90 dias / Pix até 90 dias / Boleto não estornável | ✅ Parcial — regra de 90 dias não validada no código; apenas boleto rejeitado |
| RN-18 | Toda transação registra `source_app` | ✅ Finalizada em `finalizeTransaction` |
| RN-19 | Dedup de webhook via `webhook_events.event_id` UNIQUE | ✅ `webhook.service.ts:17` |

---

## 6. Modo Internal — Detalhamento do que foi implementado

### 6.1. Pix

| Etapa | Comportamento implementado |
|-------|---------------------------|
| Criação | QR Code gerado em `internal.qrcode.ts` com estrutura BR Code mock, codificado em base64. `qr_code_text` = "ECPPAY-PIX-{uuid}" no seed demo |
| Aprovação | Scheduler com `setInterval` de 1s busca `scheduled_settlements` vencidos e muda status para `completed`, gera evento em `webhook_events`, dispara callback |
| Webhook | Dispara callback para o app de origem após aprovação |
| Cash-out (envio) | Não implementado |

### 6.2. Cartão

| Etapa | Comportamento implementado |
|-------|---------------------------|
| Cobrança | Aprovado síncrono se valor ≤ 1.000.000 centavos e last4 ≠ 9999 |
| Rejeição | `9999` → `AppError` com código `CARD_DECLINED`. Valor > R$ 10.000 → `LIMIT_EXCEEDED` |
| Tokenização | Token local `tok_internal_{SHA-256 hash 16 chars}`. Persistido em `card_tokens` com `source_app='__pending__'` até finalizeTransaction |
| Parcelamento | 1–12x aceito sem cálculo de juros no mock |
| Estorno | Imediato. Status `refunded` (total) ou `partially_refunded` (parcial) |
| Bandeiras detectadas | visa, mastercard, elo, amex (regex de prefixo em `detectBrand`) |

### 6.3. Boleto

| Etapa | Comportamento implementado |
|-------|---------------------------|
| Emissão | `internal.boleto.ts` gera 44 dígitos (código de barras) + linha digitável formatada |
| Pagamento | Manual via `POST /admin/transactions/:id/simulate-payment` (admin) |
| Vencimento | Transição automática para `overdue`/`expired` não é executada por cron — status fica `pending` até simulação manual |
| QR Code Pix embutido | Gerado junto com o boleto (`boleto_pix_qr`) |

---

## 7. Comunicação entre Serviços

### 7.1. Apps → ECP Pay

| Header | Valor | Obrigatório |
|--------|-------|-------------|
| `X-API-Key` | Chave do app registrada em `app_registrations` | Sim |
| `X-Idempotency-Key` | UUID v4 | Sim (mutações) |
| `Content-Type` | `application/json` | Sim |

> Diferença em relação à spec anterior: não há header `Authorization: Bearer ...` nem `X-Source-App` — a identificação do app de origem vem da própria `X-API-Key` resolvida em `api-key-auth.ts`.

### 7.2. ECP Pay → Apps (callbacks)

Headers:
- `Content-Type: application/json`
- `X-ECP-Pay-Event: payment.completed|payment.failed|...`
- `X-ECP-Pay-Transaction: <transaction_id>`

Payload:

```json
{
  "event": "payment.completed",
  "transaction_id": "uuid",
  "external_id": "provider_id",
  "type": "pix",
  "amount": 5000,
  "status": "completed",
  "source_app": "ecp-food",
  "timestamp": "2026-04-20T14:30:00Z",
  "metadata": { "order_id": "food-4521" }
}
```

Timeout HTTP de 10s. Resposta HTTP 2xx → `callback_status='delivered'`. Outras → `failed` + retry.

---

## 8. Apps Registrados (seed)

| App | API Key seed | Callback URL seed |
|-----|--------------|-------------------|
| ecp-bank | `ecp-bank-dev-key` | `http://localhost:3333/webhooks/pay` |
| ecp-emps | `ecp-emps-dev-key` | `http://localhost:3334/webhooks/pay` |
| ecp-food | `ecp-food-dev-key` | `http://localhost:3000/api/webhooks/ecp-pay/payment-confirmed` |

---

## 9. Métricas de Sucesso (alvo)

| Métrica | Meta |
|---------|------|
| Disponibilidade API | 99.9% |
| Latência p95 (excluindo gateway) | < 300ms |
| Taxa de sucesso de transações | > 95% |
| Taxa de entrega de webhooks (1ª tentativa) | > 99% |
| Tempo de conciliação (webhook Asaas → callback app) | < 10s |

Métricas de observação reais dependem da fase 04 (operations).

---

## 10. Itens da spec de 2026-03 NÃO implementados

- Página dedicada de Split (`/splits`)
- Página dedicada do Cofre de Tokens (`/card-vault`)
- Página dedicada de Audit Log (`/audit-log`)
- Pix estático e Pix cash-out
- Boleto parcelado (carnê)
- Boleto overdue automático via cron
- Regra dos 90 dias para estorno
- Health check de conectividade por app (a tela Configurações não exibe)
- Toggle especial "banner amarelo" configurável (o banner existe, mas é fixo)

---

*Documento gerado a partir do código implementado em `03-product-delivery/` — 20/04/2026*
