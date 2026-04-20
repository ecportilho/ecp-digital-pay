# ECP Pay — Product Briefing & Especificação Funcional

> **Versão:** 1.0  
> **Data:** 29/03/2026  
> **Status:** Em desenvolvimento  
> **Repositório:** `ecp-pay`

---

## 1. Visão Geral do Produto

O **ECP Pay** é o serviço centralizado de pagamentos do ecossistema ECP. Funciona como camada de abstração entre os produtos ECP (ecp-digital-bank, ecp-digital-bank-emps, ecp-food e futuros apps) e gateways de pagamento externos (Asaas, Stripe, etc.).

Nenhum app do ecossistema fala diretamente com um gateway. Todos falam com o ECP Pay, que roteia, processa, registra e concilia as transações.

### 1.1. Problemas que resolve

1. **Acoplamento:** Sem ele, cada app teria sua própria integração com Asaas, duplicando código, tratamento de erros e lógica de webhooks.
2. **Portabilidade:** Se amanhã o Asaas mudar taxas ou sair do ar, a troca acontece em um único adapter — sem tocar nos apps.
3. **Observabilidade:** Todas as transações do ecossistema em um único banco com dashboard, logs e métricas.
4. **Independência de desenvolvimento:** Com a flag `internal`, todo o ecossistema roda sem conta no Asaas, sem internet, sem sandbox externo.

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
| **Internal** | `PAYMENT_PROVIDER=internal` | ECP Pay processa tudo internamente. Pix aprovado em 5s (simulado). Cartão aprovado/rejeitado por regras configuráveis. Boleto com código fake, pagável manualmente no painel. Ideal para dev/staging/demos. |
| **Asaas** | `PAYMENT_PROVIDER=asaas` | ECP Pay roteia para a API real do Asaas. Transações reais. Webhooks reais. Produção. |

A flag pode ser alterada via variável de ambiente OU via toggle no painel admin web (com confirmação e restart do adapter).

---

## 2. Público-Alvo

| Usuário | Papel | O que faz no ECP Pay |
|---------|-------|---------------------|
| **Desenvolvedor ECP** | Integrador | Consome a API REST para processar pagamentos nos apps |
| **Operador financeiro** | Admin | Monitora transações, concilia, investiga falhas via painel web |
| **Edson (owner)** | Super admin | Configura providers, feature flags, split rules, credenciais |

---

## 3. Funcionalidades da API (consumida pelos apps)

### 3.1. Pix

- Criar cobrança Pix (QR Code dinâmico + copia e cola)
- Criar Pix estático (valor fixo, sem vencimento)
- Enviar Pix para chave externa (cash-out)
- Consultar status de transação Pix
- Receber webhook de confirmação

### 3.2. Cartão de Crédito

- Cobrar cartão (one-time)
- Cobrar com token salvo (cofre centralizado)
- Tokenizar cartão novo e salvar no cofre
- Cobrar parcelado (2-12x)
- Estornar cobrança (total ou parcial)
- Consultar status

### 3.3. Boleto

- Emitir boleto registrado (com QR Code Pix embutido)
- Emitir boleto parcelado (carnê)
- Cancelar boleto pendente
- Consultar status
- Receber webhook de compensação

### 3.4. Split de Pagamento

- Definir regras de split por transação (ex: 10% plataforma, 80% vendedor, 10% entrega)
- Split automático na liquidação
- Consultar distribuição por transação

### 3.5. Cofre de Tokens (Card Vault)

- Salvar token vinculado a CPF/CNPJ
- Listar cartões salvos (últimos 4 + bandeira)
- Remover cartão salvo
- Reutilizar token em qualquer app do ecossistema

### 3.6. Webhooks (saída para os apps)

- Notificar app de origem quando transação muda de status
- Retry automático com backoff exponencial (3 tentativas: 30s, 2min, 10min)
- Log de todos os webhooks enviados e recebidos

---

## 4. Funcionalidades do Painel Web (admin dashboard)

### 4.1. Dashboard

- Volume transacionado por período (dia/semana/mês)
- Gráfico de transações por tipo (Pix, cartão, boleto)
- Gráfico de transações por app de origem (bank, emps, food)
- Taxa de sucesso vs falha
- Valor total processado
- Últimas 10 transações em tempo real

### 4.2. Transações

- Lista com filtros avançados: tipo, status, app de origem, período, valor, cliente (CPF/CNPJ)
- Detalhe com timeline de eventos (criada → processando → aprovada → notificada)
- Ações manuais: reprocessar, estornar, cancelar
- No modo internal: botão "Simular pagamento" para forçar aprovação

### 4.3. Webhooks

- Lista de webhooks recebidos (do Asaas) e enviados (para os apps)
- Status de entrega (entregue, falhou, retentando)
- Replay manual (reenviar para o app)

### 4.4. Cofre de Tokens

- Lista de tokens armazenados (CPF/CNPJ + últimos 4 + bandeira + data)
- Contagem por app de origem
- Remoção manual

### 4.5. Split

- Visualização de splits por transação
- Relatório de valores distribuídos por conta destino
- Resumo de taxas da plataforma

### 4.6. Configurações

- **Feature flag:** Toggle Internal/Asaas (com confirmação e aviso de impacto)
- **Provider ativo:** Exibe qual adapter está rodando, com indicador visual
- **Credenciais Asaas:** API key (mascarada), ambiente (sandbox/produção)
- **Apps registrados:** Lista de apps autorizados com suas service API keys
- **Regras de retry:** Número de tentativas, intervalo, backoff
- **Regras de split padrão:** Percentuais default por app
- **Health check:** Status de conectividade com Asaas e com cada app

### 4.7. Logs & Auditoria

- Log de todas as chamadas de API (request/response resumido)
- Log de mudanças de configuração (quem, quando, o quê)
- Log de erros com stack trace e contexto
- Exportação em CSV

### 4.8. Modo Internal — Controles Especiais

Quando `PAYMENT_PROVIDER=internal`, o painel exibe controles adicionais:

- **Simular pagamento Pix:** Selecionar transação pendente → forçar aprovação
- **Simular pagamento Boleto:** Selecionar boleto → marcar como pago
- **Simular rejeição de cartão:** Forçar status `failed` em transação pendente
- **Timer de Pix:** Configurar delay de auto-aprovação (0s a 60s, default 5s)
- **Banner visual:** Faixa amarela no topo "MODO INTERNAL — transações simuladas"

---

## 5. Regras de Negócio

| ID | Regra | Descrição |
|----|-------|-----------|
| RN-01 | Idempotência | Toda transação exige `idempotency_key` UUID. Reenvio retorna resultado existente |
| RN-02 | Valores em centavos | Todo valor financeiro é integer em centavos. NUNCA float |
| RN-03 | Provider flag | `PAYMENT_PROVIDER` define qual adapter é usado. Alterável via env ou painel admin |
| RN-04 | Modo internal — Pix | Pix aprovado automaticamente após timer configurável (default 5s) |
| RN-05 | Modo internal — Cartão | Aprovado se valor < R$ 10.000 e cartão não termina em 9999 |
| RN-06 | Modo internal — Cartão rejeição | Final 9999 = `CARD_DECLINED`. Valor > R$ 10.000 = `LIMIT_EXCEEDED` |
| RN-07 | Modo internal — Boleto | Código de barras mock. Pagamento via botão no painel admin |
| RN-08 | Token vault | Token vinculado a CPF/CNPJ + últimos 4 dígitos. Reutilizável cross-app |
| RN-09 | Split | Soma das partes = total. Validado antes de processar |
| RN-10 | Webhook retry | 3 tentativas: 30s, 2min, 10min. Após 3 falhas = `delivery_failed` |
| RN-11 | Soft delete | Nenhum registro deletado fisicamente |
| RN-12 | Audit log | Toda ação registrada com user_id, timestamp, IP |
| RN-13 | Rate limiting | Máx 100 transações/minuto por app |
| RN-14 | Auth entre serviços | Service API key por app (não JWT de usuário final) |
| RN-15 | Auth do painel | JWT com login/senha dedicado para o painel admin |
| RN-16 | Dados de cartão | Número completo NUNCA armazenado. Apenas token + últimos 4 + bandeira |
| RN-17 | Estorno | Cartão: até 90 dias. Pix: até 90 dias. Boleto: não estornável |
| RN-18 | Callback URL | Cada transação pode ter callback_url próprio. Se não informado, usa o padrão do app |

---

## 6. Modo Internal — Detalhamento

### 6.1. Pix

| Etapa | Comportamento |
|-------|---------------|
| Criação | QR Code gerado localmente (SVG com dados mock). Copia e cola: `ECPPAY-PIX-{uuid}` |
| Aprovação | Timer configurável (0-60s, default 5s) → status `completed` automaticamente |
| Webhook | Dispara callback para o app de origem após aprovação |
| Cash-out | Status `completed` imediatamente (simulado) |

### 6.2. Cartão

| Etapa | Comportamento |
|-------|---------------|
| Cobrança | Aprovado se valor < R$ 10.000 e cartão não termina em 9999 |
| Rejeição | **** 9999 = `CARD_DECLINED`. Valor > R$ 10.000 = `LIMIT_EXCEEDED` |
| Tokenização | Token local `tok_internal_{uuid}`. Salva no cofre |
| Parcelamento | Aceita 2-12x. Valor/parcela calculado (sem juros no mock) |
| Estorno | Imediato. Status `refunded` |

### 6.3. Boleto

| Etapa | Comportamento |
|-------|---------------|
| Emissão | Código de barras: `00000.00000 00000.000000 00000.000000 0 {valor}`. QR Code Pix mock |
| Pagamento | Manual via painel admin (botão "Simular pagamento") |
| Vencimento | Se não pago até due_date → status `overdue` automaticamente |
| Notificação | Régua mock: envia webhook `invoice.overdue` no dia seguinte |

### 6.4. Valor do Modo Internal

- **Desenvolvimento:** Ecossistema inteiro roda sem Asaas, sem internet, sem sandbox externo
- **Testes:** Vitest roda cenários completos de pagamento em milissegundos
- **Demos:** Apresentar produto sem gastar em transações sandbox
- **Staging:** Ambiente de homologação 100% controlado e determinístico
- **Onboarding de devs:** Novo dev clona o repo e testa pagamentos em minutos

---

## 7. Comunicação entre Serviços

### 7.1. Apps → ECP Pay

| Header | Valor | Obrigatório |
|--------|-------|-------------|
| `Authorization` | `Bearer {service_api_key}` | Sim |
| `X-Source-App` | `ecp-bank` / `ecp-emps` / `ecp-food` | Sim |
| `X-Idempotency-Key` | UUID v4 | Sim (mutações) |
| `Content-Type` | `application/json` | Sim |

### 7.2. ECP Pay → Apps (callbacks)

```json
{
  "event": "payment.completed",
  "transaction_id": "uuid",
  "external_id": "asaas_id_or_internal_id",
  "type": "pix",
  "amount": 5000,
  "status": "completed",
  "source_app": "ecp-food",
  "timestamp": "2026-03-29T14:30:00Z",
  "metadata": { "order_id": "food-4521" }
}
```

---

## 8. Métricas de Sucesso

| Métrica | Meta |
|---------|------|
| Disponibilidade API | 99.9% |
| Latência p95 (excluindo gateway) | < 300ms |
| Taxa de sucesso de transações | > 95% |
| Taxa de entrega de webhooks (1ª tentativa) | > 99% |
| Tempo de conciliação (webhook Asaas → callback app) | < 10s |

---

*Documento gerado para o projeto ECP Pay — v1.0*
