# ECP Pay — Especificação de Design & Identidade Visual

> **Versão:** 1.0  
> **Data:** 29/03/2026  
> **Status:** Em desenvolvimento  
> **Repositório:** `ecp-pay`

---

## 1. Princípio de Design

O painel admin do ECP Pay segue a **mesma identidade visual** do ecossistema ECP (dark theme + lime accent + Inter). A diferença é o contexto: enquanto o ecp-bank e ecp-emps são voltados para o cliente final, o painel do ecp-pay é uma **ferramenta operacional** — pensa em monitoramento, investigação e controle.

O design é inspirado em painéis como Stripe Dashboard, Datadog e Grafana: density-first, data-rich, com filtros poderosos e drill-down em cada transação. Não é um app bonito para o consumidor — é uma ferramenta eficiente para o operador.

---

## 2. Identidade Visual (herdada do ecossistema ECP)

### 2.1. Paleta de Cores

| Token | Valor | Uso |
|-------|-------|-----|
| Background | `#0b0f14` | Fundo principal |
| Surface | `#131c28` | Cards, tabelas, painéis |
| Secondary Background | `#0f1620` | Sidebar, áreas alternadas |
| Border | `#27364a` | Bordas e separadores |

### 2.2. Cor de Acento

| Token | Valor | Uso |
|-------|-------|-----|
| Lime | `#b7ff2a` | CTAs, indicadores ativos, provider EXTERNAL ativo |
| Lime Pressed | `#7ed100` | Hover/pressed |
| Lime Dim | `rgba(183, 255, 42, 0.12)` | Backgrounds de badges lime |

### 2.3. Cores Semânticas

| Token | Valor | Uso no ecp-pay |
|-------|-------|-----------------|
| Success | `#3dff8b` | Transação completed, webhook delivered |
| Warning | `#ffcc00` | Transação pending, callback pendente, provider warning |
| Danger | `#ff4d4d` | Transação failed, webhook error, alerta crítico |
| Info | `#4da3ff` | Transação processing, info geral |

### 2.4. Tipografia

| Token | Valor | Uso |
|-------|-------|-----|
| Text Primary | `#eaf2ff` | Textos principais |
| Text Secondary | `#a9b7cc` | Labels, descrições |
| Text Tertiary | `#7b8aa3` | Placeholders, metadados |
| Fonte | Inter | Família principal |
| Fonte Mono | JetBrains Mono / Fira Code | IDs, tokens, códigos, JSON |

### 2.5. Border Radius

| Token | Valor | Uso |
|-------|-------|-----|
| Card | 18px | Cards e painéis |
| Control | 13px | Botões e inputs |
| Badge | 20px (pill) | Status badges |
| Table Row | 0px | Linhas de tabela (sem radius) |

---

## 3. Componentes de UI

### 3.1. Componentes Base (idênticos ao ecossistema)

| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| Button | `Button.tsx` | primary, secondary, ghost, danger |
| Card | `Card.tsx` | Surface + border 18px |
| Input | `Input.tsx` | Com label, error, ícones |
| Modal | `Modal.tsx` | Overlay + Escape key |
| Table | `Table.tsx` | Data table com sorting |
| Badge | `Badge.tsx` | Status tags |

### 3.2. Componentes Novos do ECP Pay

| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| **Toggle** | `Toggle.tsx` | Switch on/off para feature flags. Track 48x24px, thumb 20px. Off = `border-secondary`, On = `lime`. Animação 200ms |
| **ProviderToggle** | `ProviderToggle.tsx` | Toggle estilizado especificamente para INTERNAL ↔ EXTERNAL. Exibe nome do provider, ícone de status, e confirmação modal antes de trocar |
| **TransactionStatusBadge** | `TransactionStatusBadge.tsx` | Badge com cor semântica por status (pending=warning, completed=success, failed=danger, etc.) |
| **TransactionTimeline** | `TransactionTimeline.tsx` | Timeline vertical dos eventos de uma transação (criada → processando → webhook → callback → completed) |
| **KPICard** | `KPICard.tsx` | Card com label (12px tertiary), valor (24px primary), variação (12px success/danger com seta) |
| **CodeBlock** | `CodeBlock.tsx` | Bloco de código com syntax highlight para JSON (payloads, webhooks). Fundo `secondary-bg`, fonte mono, botão copy |
| **FilterBar** | `FilterBar.tsx` | Barra de filtros horizontal: selects (app, tipo, status, provider) + date range + busca |
| **EmptyState** | `EmptyState.tsx` | Estado vazio para listas sem dados. Ícone + texto + CTA |

---

## 4. Layout do Painel Admin

### 4.1. Sidebar

```
┌─────────────────────────────┐
│  ⬡ ECP Pay                  │
│  Payment service             │
├─────────────────────────────┤
│  ◉ Dashboard                │
│  📋 Transações              │
│  🔌 Providers               │  ★ Toggle INTERNAL/EXTERNAL
│  ✂️  Split                   │
│  🔐 Cofre de tokens         │
│  🔔 Webhooks                │
│  📱 Apps                     │
│  📜 Audit log               │
│  ⚙️  Configurações           │
├─────────────────────────────┤
│  Provider: INTERNAL ●        │  ← Indicador de status
│  Uptime: 99.9%              │
└─────────────────────────────┘
```

### 4.2. Header

```
┌──────────────────────────────────────────────────────────────┐
│  Dashboard                          [Período: Últimos 7d ▾]  │
│                                     ● INTERNAL ativo  Admin  │
└──────────────────────────────────────────────────────────────┘
```

O header exibe: título da página, seletor de período, indicador de provider ativo (dot verde + nome), e avatar/nome do admin logado.

---

## 5. Páginas (12 telas)

### 5.1. Login

| Rota | `/login` |
|------|----------|
| **Layout** | Centralizado, sem sidebar. Logo ECP Pay + form (email + senha) |
| **Componentes** | Input (email), Input (password com show/hide), Button (primary "Entrar") |

### 5.2. Dashboard

| Rota | `/dashboard` |
|------|--------------|
| **KPIs (topo)** | 6 cards: Volume total (R$), Transações, Taxa de sucesso (%), Receita por hora, Tokens ativos, Webhooks pendentes |
| **Gráfico 1** | Volume transacionado por dia (line chart, últimos 30 dias). Linha lime para total, linhas coloridas por app |
| **Gráfico 2** | Distribuição por tipo (donut: Pix / Cartão / Boleto) |
| **Gráfico 3** | Taxa de sucesso por hora (bar chart, últimas 24h) |
| **Card Provider** | Card destacado com provider ativo, tempo no modo atual, botão "Alternar provider" |
| **Últimas transações** | Mini-tabela com 5 últimas transações (source_app, tipo, valor, status) |

### 5.3. Transações

| Rota | `/transactions` |
|------|-----------------|
| **FilterBar** | App (multi-select), Tipo (pix/card/boleto), Status, Provider, Período (date range), Busca (ID/documento) |
| **Tabela** | Colunas: ID (mono), App, Tipo, Valor, Cliente, Status (badge), Provider, Data. Paginação cursor-based |
| **Ações** | Click na linha → detalhe. Botão "Exportar CSV" |

### 5.4. Detalhe da Transação

| Rota | `/transactions/:id` |
|------|---------------------|
| **Header** | ID (mono), status badge grande, valor em destaque |
| **Timeline** | TransactionTimeline vertical: Criada → Processando → Webhook → Callback → Completed |
| **Dados** | Grid 2 colunas: dados do cliente, dados do pagamento, dados do provider, metadados |
| **Payload** | CodeBlock com JSON do request original |
| **Split** | Se houver: tabela de distribuição (conta, valor, status) |
| **Webhook** | Se houver: CodeBlock com payload do webhook recebido |
| **Ações** | Botão "Estornar" (danger), "Reenviar callback" (secondary) |

### 5.5. Providers

| Rota | `/providers` |
|------|-------------|
| **ProviderToggle** | Toggle grande e destacado: INTERNAL ↔ EXTERNAL. Exibe nome, ícone, descrição |
| **Confirmação** | Modal de confirmação antes de trocar: "Tem certeza que deseja alternar para [modo]? Transações em andamento serão concluídas no modo atual." |
| **Status cards** | Card por provider disponível (Internal, Asaas, futuro Stripe) com status, configuração, últimas transações |
| **Credenciais** | Formulário para configurar API keys do Asaas (mascaradas, show/hide) |
| **Histórico** | Lista de trocas de provider (quem, quando, de→para) extraída do audit log |

### 5.6. Split

| Rota | `/splits` |
|------|-----------|
| **Resumo** | Cards: Total distribuído, número de splits, apps com split ativo |
| **Tabela** | Transações com split: ID, App, Valor total, N° de partes, Status |
| **Detalhe** | Drill-down: distribuição por conta (nome, valor, %) |

### 5.7. Cofre de Tokens

| Rota | `/card-vault` |
|------|---------------|
| **KPIs** | Total de tokens, por bandeira (Visa/Master/Elo), por app de origem |
| **Lista** | Tabela: documento do cliente (mascarado), last4, bandeira, app de origem, data |
| **Nota** | Nenhum dado sensível é exibido. Apenas last4, brand e metadata |

### 5.8. Webhooks

| Rota | `/webhooks` |
|------|-------------|
| **Tipos** | Tab/segmented: "Recebidos" (do Asaas) / "Enviados" (callbacks para apps) |
| **Tabela recebidos** | event_id, tipo, transação, processado (sim/não), data |
| **Tabela enviados** | transação, app destino, status (delivered/failed), tentativas, data |
| **Ações** | Botão "Retry" em callbacks falhados |
| **Detalhe** | CodeBlock com payload completo |

### 5.9. Apps

| Rota | `/apps` |
|------|---------|
| **Lista** | Cards por app registrado: nome, API key (mascarada), callback URL, status, volume |
| **Registrar** | Modal: nome do app + callback URL → gera API key automaticamente |
| **Editar** | Alterar callback URL, regenerar API key (com confirmação) |

### 5.10. Audit Log

| Rota | `/audit-log` |
|------|-------------|
| **Tabela** | Data, Usuário, Ação, Recurso, IP. Filtros por período e tipo de ação |
| **Ações logadas** | Login, switch provider, alterar config, retry webhook, registrar app |

### 5.11. Configurações

| Rota | `/settings` |
|------|-------------|
| **Feature flags** | Lista de flags com Toggle: PAYMENT_PROVIDER, INTERNAL_AUTO_APPROVE, etc. |
| **Simulação** | Slider: delay de liquidação no modo INTERNAL (0-30 segundos) |
| **Limites** | Rate limit por app, valor máximo por transação |
| **Admin users** | Lista de usuários do painel + convite de novos |

---

## 6. Componente ProviderToggle — Design Detalhado

O ProviderToggle é o componente mais importante do painel. Design:

```
┌────────────────────────────────────────────────────────┐
│  Provider de pagamentos                                │
│                                                        │
│  ┌────────────────────┐    ┌────────────────────┐     │
│  │  ● INTERNAL        │    │  ○ EXTERNAL        │     │
│  │  Self-managed       │    │  Asaas             │     │
│  │                    │    │                    │     │
│  │  Sem gateway       │    │  Gateway real       │     │
│  │  Simulação local   │    │  Transações reais   │     │
│  │  Zero custo        │    │  Taxas aplicáveis   │     │
│  │                    │    │                    │     │
│  │  [ATIVO]           │    │  [ Ativar ]         │     │
│  └────────────────────┘    └────────────────────┘     │
│                                                        │
│  Ativo desde: 29/03/2026 14:30                        │
│  Transações no modo atual: 847                        │
└────────────────────────────────────────────────────────┘
```

- Card ativo: borda `lime` (2px), badge "ATIVO" com fundo `lime-dim`
- Card inativo: borda `border` padrão, botão "Ativar" (secondary)
- Ao clicar "Ativar": modal de confirmação com mensagem de impacto
- Animação: transição suave de 300ms ao trocar

---

## 7. Badges de Status — Mapeamento

### 7.1. Status de Transação

| Status | Badge | Cor |
|--------|-------|-----|
| pending | `badge-warning` | Warning |
| processing | `badge-info` | Info |
| completed | `badge-success` | Success |
| failed | `badge-danger` | Danger |
| refunded | `badge-neutral` | Neutral com texto "Estornado" |
| partially_refunded | `badge-info` | Info com texto "Estorno parcial" |
| expired | `badge-neutral` | Neutral com texto "Expirado" |
| cancelled | `badge-neutral` | Neutral |

### 7.2. Tipo de Transação

| Tipo | Ícone (Lucide) | Cor |
|------|----------------|-----|
| pix | `Zap` | Lime |
| card | `CreditCard` | Info |
| boleto | `FileText` | Warning |

### 7.3. Status de Webhook/Callback

| Status | Badge |
|--------|-------|
| delivered | `badge-success` |
| pending | `badge-warning` |
| failed | `badge-danger` |
| retrying | `badge-info` |

### 7.4. Provider

| Provider | Badge |
|----------|-------|
| internal | `badge-warning` + texto "INTERNAL" |
| asaas | `badge-lime` + texto "ASAAS" |
| stripe (futuro) | `badge-info` + texto "STRIPE" |

---

## 8. Gráficos (Recharts)

### 8.1. Volume Transacionado (Dashboard)

- **Tipo:** LineChart
- **Dados:** Volume (R$) por dia, últimos 30 dias
- **Linhas:** Total (lime), ecp-bank (purple), ecp-emps (coral), ecp-food (teal)
- **Eixo Y:** Formatado em R$ com abbreviation (R$ 1.2k, R$ 15k)
- **Tooltip:** Dark surface, borda border, texto primary/secondary
- **Grid:** Linhas horizontais em `rgba(28,40,54,0.5)`

### 8.2. Distribuição por Tipo (Dashboard)

- **Tipo:** PieChart (donut)
- **Fatias:** Pix (lime), Cartão (info), Boleto (warning)
- **Centro:** Total de transações
- **Labels:** Percentual + valor absoluto

### 8.3. Taxa de Sucesso (Dashboard)

- **Tipo:** BarChart
- **Dados:** % de sucesso por hora, últimas 24h
- **Barras:** Success (verde) para > 95%, Warning para 90-95%, Danger para < 90%
- **Linha de referência:** 95% (meta)

---

## 9. Responsividade

| Breakpoint | Comportamento |
|-----------|---------------|
| ≥ 1280px | Sidebar fixa + conteúdo fluido. Ideal para operação |
| 1024-1279px | Sidebar colapsável |
| 768-1023px | Sem sidebar, menu hamburger. Tabelas com scroll horizontal |
| < 768px | Mobile: cards empilhados. Funcional, mas não é o foco (painel operacional = desktop) |

---

## 10. Referência CSS

```css
/* web/src/styles/globals.css — IDÊNTICO ao ecossistema ECP */

:root {
  --color-background: #0b0f14;
  --color-surface: #131c28;
  --color-secondary-bg: #0f1620;
  --color-border: #27364a;
  --color-lime: #b7ff2a;
  --color-lime-pressed: #7ed100;
  --color-lime-dim: rgba(183, 255, 42, 0.12);
  --color-text-primary: #eaf2ff;
  --color-text-secondary: #a9b7cc;
  --color-text-tertiary: #7b8aa3;
  --color-success: #3dff8b;
  --color-warning: #ffcc00;
  --color-danger: #ff4d4d;
  --color-info: #4da3ff;
  --radius-card: 18px;
  --radius-control: 13px;
  --font-family: 'Inter', sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
}
```

---

*Documento gerado para o projeto ECP Pay — v1.0*  
*Identidade visual herdada do ecossistema ECP*
