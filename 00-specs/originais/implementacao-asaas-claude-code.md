# SPEC — Implementação da Integração Asaas no ecp-pay

> **Para:** Claude Code
> **Projeto:** ecp-pay (serviço centralizado de pagamentos do ecossistema ECP)
> **Objetivo:** Implementar o `AsaasAdapter` real conectando à API v3 do Asaas via sandbox

---

## Contexto

O ecp-pay já possui (ou deve possuir) uma arquitetura baseada em **Provider Pattern** com um `ProviderFactory` que alterna entre adapters. Atualmente existe um modo INTERNAL (simulado). Esta spec pede a implementação do modo EXTERNAL usando a **API v3 do Asaas** (sandbox).

O projeto segue a stack padrão do ecossistema ECP: **Fastify 5.0 + better-sqlite3 + React 18.3 + Vite 5.4 + TypeScript 5.5 + Tailwind 3.4**. Porta 3335 (API) / 5175 (Admin).

---

## 1. Configuração do ambiente

### 1.1 Credenciais Asaas Sandbox

Adicione as seguintes variáveis ao arquivo de configuração de ambiente que o projeto já utiliza (`.env`, `config.ts`, ou o mecanismo que o factory pattern atual do projeto já usa — **você decide onde faz mais sentido dentro da estrutura existente**):

```
ASAAS_API_KEY=$aact_hmlg_000MzkwODA2MWY2OGM3MWRlMDU2NWM3MzJlNzZmNGZhZGY6OmQ1ZjExOWE3LThjNDctNDk1Ni1iZTA1LTY5MDk4OTJiOWQ0NDo6JGFhY2hfZDgxNDFlMzAtOTM4NC00ODc0LWE3ODctOWQxMDY0MGE1N2Fm
ASAAS_BASE_URL=https://api-sandbox.asaas.com/v3
ASAAS_WEBHOOK_TOKEN=ecp-pay-webhook-token-2026
PAYMENT_PROVIDER=external
```

### 1.2 Regras de configuração

- A feature flag `PAYMENT_PROVIDER` deve poder ser alternada entre `internal` e `external` em runtime (via endpoint admin ou alteração de variável) sem reiniciar o servidor
- Quando `PAYMENT_PROVIDER=external`, o `ProviderFactory` deve instanciar o `AsaasAdapter`
- Quando `PAYMENT_PROVIDER=internal`, continua usando o adapter simulado já existente
- A troca de provider deve ser registrada em audit log

---

## 2. AsaasAdapter — Implementação

### 2.1 Autenticação com a API Asaas

Todas as requisições para a API Asaas devem enviar estes headers:

```
Content-Type: application/json
User-Agent: ecp-pay/1.0
access_token: <valor de ASAAS_API_KEY>
```

- URL base sandbox: `https://api-sandbox.asaas.com/v3`
- URL base produção (futuro): `https://api.asaas.com/v3`
- Chaves sandbox começam com `$aact_hmlg_`, produção com `$aact_prod_`

### 2.2 Fluxo obrigatório: criar cliente antes de cobrar

O Asaas exige um `customer` cadastrado antes de criar qualquer cobrança. O fluxo é:

1. **Buscar** se o cliente já existe: `GET /v3/customers?cpfCnpj={cpf}`
2. Se encontrar, usar o `id` retornado (ex: `cus_000005219613`)
3. Se não encontrar, **criar**: `POST /v3/customers` com `{ name, cpfCnpj, email? }`
4. Usar o `id` do cliente criado na cobrança

### 2.3 Endpoints Asaas que o adapter deve consumir

#### Cobrança via Pix

```
POST /v3/payments
{
  "customer": "cus_xxx",
  "billingType": "PIX",
  "value": 49.90,           // em reais, NÃO centavos
  "description": "...",
  "dueDate": "2026-04-30",  // YYYY-MM-DD
  "externalReference": "idempotency-key"
}
```

Após criar, buscar o QR Code:
```
GET /v3/payments/{id}/pixQrCode
→ { "encodedImage": "base64...", "payload": "00020126..." }
```

#### Cobrança via Cartão de Crédito

```
POST /v3/payments
{
  "customer": "cus_xxx",
  "billingType": "CREDIT_CARD",
  "value": 89.90,
  "description": "...",
  "installmentCount": 1,
  "creditCard": {
    "holderName": "NOME NO CARTAO",
    "number": "5162306818837800",
    "expiryMonth": "12",
    "expiryYear": "2028",
    "ccv": "318"
  },
  "creditCardHolderInfo": {
    "name": "Nome Completo",
    "email": "email@teste.com",
    "cpfCnpj": "24971563792",
    "postalCode": "01310100",
    "addressNumber": "100",
    "phone": "11999998888"
  }
}
```

Retorno inclui `creditCardToken` quando cartão é aprovado — salvar no cofre de tokens.

#### Cobrança via Cartão com Token (reuso do cofre)

```
POST /v3/payments
{
  "customer": "cus_xxx",
  "billingType": "CREDIT_CARD",
  "value": 50.00,
  "creditCardToken": "token_do_cofre"
}
```

#### Cobrança via Boleto

```
POST /v3/payments
{
  "customer": "cus_xxx",
  "billingType": "BOLETO",
  "value": 299.00,
  "dueDate": "2026-04-15",
  "description": "..."
}
```

Retorno inclui `bankSlipUrl` (URL do PDF do boleto) e `invoiceUrl` (página de pagamento).

#### Consultar status

```
GET /v3/payments/{id}
```

#### Estorno

```
POST /v3/payments/{id}/refund
{ "value": 49.90 }   // valor opcional, se omitido = estorno total
```

#### Tokenizar cartão (sem cobrar)

```
POST /v3/creditCard/tokenize
{
  "customer": "cus_xxx",
  "creditCard": { ... },
  "creditCardHolderInfo": { ... }
}
→ { "creditCardToken": "xxx", "creditCardBrand": "MASTERCARD", "creditCardNumber": "8837" }
```

### 2.4 Status das cobranças Asaas

| Status | Significado |
|--------|------------|
| `PENDING` | Aguardando pagamento |
| `RECEIVED` | Pago (boleto compensado) |
| `CONFIRMED` | Pago (Pix confirmado ou cartão aprovado) |
| `OVERDUE` | Vencida sem pagamento |
| `REFUNDED` | Estornada |
| `RECEIVED_IN_CASH` | Confirmação manual |
| `REFUND_REQUESTED` | Estorno solicitado |
| `REFUND_IN_PROGRESS` | Estorno em processamento |
| `CHARGEBACK_REQUESTED` | Chargeback recebido |
| `CHARGEBACK_DISPUTE` | Em disputa |
| `AWAITING_CHARGEBACK_REVERSAL` | Aguardando reversão |
| `DUNNING_REQUESTED` | Negativação solicitada |
| `DUNNING_RECEIVED` | Negativação processada |

### 2.5 Valores: Asaas usa REAIS, não centavos

**ATENÇÃO:** A API do Asaas trabalha com valores em **reais** (49.90), não centavos (4990). Se o ecossistema ECP usa centavos internamente, o adapter deve fazer a conversão: `centavos / 100` ao enviar, `reais * 100` ao receber.

---

## 3. Webhooks

### 3.1 Rota de webhook

Criar a rota `POST /webhooks/asaas` que:

1. Valida o token de autenticação (campo `accessToken` no body do Asaas vs `ASAAS_WEBHOOK_TOKEN`)
2. Faz deduplicação pelo `payment.id` + `event` (idempotência)
3. Registra o evento na tabela `webhook_events`
4. Atualiza o status da transação correspondente na tabela `transactions`
5. Se a transação tiver `callback_url`, notifica o app de origem via POST
6. Retorna HTTP 200 (o Asaas espera 200, senão reenvia)

### 3.2 Eventos relevantes

- `PAYMENT_CONFIRMED` → Pix recebido, cartão aprovado
- `PAYMENT_RECEIVED` → Boleto compensado
- `PAYMENT_OVERDUE` → Boleto/Pix vencido
- `PAYMENT_REFUNDED` → Estorno processado
- `PAYMENT_DELETED` → Cobrança removida
- `PAYMENT_CHARGEBACK_REQUESTED` → Chargeback de cartão

### 3.3 Payload do webhook Asaas

```json
{
  "event": "PAYMENT_CONFIRMED",
  "payment": {
    "id": "pay_abc123",
    "customer": "cus_xyz",
    "billingType": "PIX",
    "status": "CONFIRMED",
    "value": 49.90,
    "netValue": 48.91,
    "externalReference": "idempotency-key",
    "confirmedDate": "2026-03-31"
  }
}
```

---

## 4. Cofre de Tokens (card_tokens)

### 4.1 Schema

A tabela `card_tokens` (ou equivalente na estrutura existente) deve armazenar:

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | TEXT PK | UUID |
| customer_cpf | TEXT NOT NULL | CPF/CNPJ do dono do cartão |
| token | TEXT NOT NULL | `creditCardToken` retornado pelo Asaas |
| brand | TEXT | VISA, MASTERCARD, etc |
| last_four | TEXT | Últimos 4 dígitos |
| holder_name | TEXT | Nome no cartão |
| source_app | TEXT | App onde o cartão foi cadastrado |
| created_at | TEXT | Timestamp |
| UNIQUE | (customer_cpf, last_four) | Evitar duplicatas |

### 4.2 Regras

- **NUNCA** armazenar número completo do cartão, CVV ou data de validade
- Apenas o token (que é inútil sem a API Key do Asaas)
- Um cliente pode ter múltiplos cartões (CPFs diferentes, ou mesmo CPF com cartões diferentes)
- O token é reutilizável em qualquer app do ecossistema via ecp-pay

---

## 5. Rotas da API que devem existir

### 5.1 Rotas de pagamento (consumidas pelos apps do ecossistema)

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/pay/pix` | Criar cobrança Pix, retorna QR Code |
| POST | `/pay/card` | Cobrar cartão (dados completos ou token do cofre) |
| POST | `/pay/boleto` | Criar cobrança via boleto |
| GET | `/pay/transactions/:id` | Consultar transação |
| POST | `/pay/refund/:id` | Estornar transação |
| GET | `/pay/cards/:cpf` | Listar cartões salvos de um CPF |
| POST | `/webhooks/asaas` | Receber webhooks do Asaas |
| GET | `/pay/health` | Health check com info do provider ativo |

### 5.2 Autenticação dos apps consumidores

Cada app do ecossistema se autentica via header `X-API-Key`. A tabela `app_registrations` (ou equivalente) armazena chaves por app:

| App | API Key (sugestão seed) |
|-----|------------------------|
| ecp-bank | `ecp-bank-api-key-2026` |
| ecp-emps | `ecp-emps-api-key-2026` |
| ecp-food | `ecp-food-api-key-2026` |

Toda requisição sem `X-API-Key` válida deve retornar 401.

### 5.3 Payload padrão das rotas de pagamento

Todas as rotas de pagamento recebem obrigatoriamente:

```json
{
  "source": "ecp-bank",          // identifica o app de origem
  "customer": {
    "name": "João Silva",
    "cpfCnpj": "24971563792",
    "email": "joao@email.com"    // opcional
  },
  "amount": 4990,                // centavos (o adapter converte para reais ao falar com Asaas)
  "description": "Pagamento ...",
  "idempotencyKey": "uuid-v4"    // obrigatório, evita duplicação
}
```

Campos adicionais por tipo: `creditCard` + `creditCardHolderInfo` para `/pay/card`, `dueDate` para `/pay/boleto`, `dueDate` opcional para `/pay/pix`.

---

## 6. Painel Admin — Telas relacionadas ao Asaas

O painel admin (React, porta 5175) deve incluir pelo menos:

### 6.1 Dashboard
- Total de transações do dia/semana/mês
- Volume em R$ por tipo (Pix, Cartão, Boleto)
- Taxa de sucesso vs falha
- Provider ativo (INTERNAL / EXTERNAL) com destaque visual

### 6.2 Transações
- Lista com filtros: data, tipo, status, app de origem
- Detalhe da transação com todos os campos + link para invoice Asaas
- Botão de estorno

### 6.3 Provider Toggle
- Card mostrando o provider ativo
- Botão para alternar INTERNAL ↔ EXTERNAL
- Modal de confirmação antes de trocar
- Log de todas as trocas

### 6.4 Webhooks
- Lista dos últimos webhooks recebidos
- Status (processado / erro)
- Payload expandível

### 6.5 Cofre de Cartões
- Lista de tokens por CPF
- Brand + last4 + app de origem
- Botão para revogar token

---

## 7. Dados de teste para sandbox

### 7.1 Cartão de crédito de teste

```
Número: 5162 3068 1883 7800
Validade: 12/2028
CVV: 318
Nome: TESTE ECP PAY
```

### 7.2 CPF de teste

`24971563792` — já criado no sandbox como "Cliente Teste ECP"

### 7.3 Simular pagamento de Pix no sandbox

Após criar uma cobrança Pix via API, confirmar no painel sandbox:
```
POST /v3/payments/{id}/receiveInCash
{ "paymentDate": "2026-03-31", "value": 49.90 }
```

### 7.4 Simular pagamento de boleto

Mesmo endpoint `receiveInCash` acima.

---

## 8. Identidade Visual

Mesma do ecossistema ECP:

- **Background:** `#0b0f14` (dark)
- **Accent:** `#b7ff2a` (lime)
- **Font:** Inter
- **Font mono (IDs/tokens):** JetBrains Mono
- **Cards:** `rgba(255,255,255,0.05)` com `border: 1px solid rgba(255,255,255,0.1)`

---

## 9. Prioridade de implementação

1. **Config + AsaasAdapter** — variáveis, helper de requisição, findOrCreateCustomer
2. **Pix** — createPixCharge + getPixQrCode (mais simples de testar)
3. **Cartão** — createCardCharge + cofre de tokens
4. **Boleto** — createBoletoCharge
5. **Webhooks** — rota + processamento + callback
6. **Estorno** — refund
7. **Rotas REST** — /pay/pix, /pay/card, /pay/boleto, etc.
8. **Autenticação** — X-API-Key middleware
9. **Painel Admin** — Dashboard, Transações, Provider Toggle, Webhooks, Cofre
10. **Seed** — dados iniciais (admin, apps, transações demo)

---

## 10. Referências

- Documentação oficial Asaas: https://docs.asaas.com/docs/visao-geral
- Referência da API v3: https://docs.asaas.com/reference
- Sandbox: https://sandbox.asaas.com
- Testar cartão: https://docs.asaas.com/docs/testando-pagamento-com-cartão-de-crédito
- Webhooks: https://docs.asaas.com/docs/sobre-os-webhooks
- Collections Postman: https://docs.asaas.com/docs/postman
