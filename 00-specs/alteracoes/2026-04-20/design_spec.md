# ECP Pay — Especificação de Design & Identidade Visual

> **Versão:** 2.0
> **Data:** 20/04/2026
> **Status:** Implementado (fase 03)
> **Repositório:** `ecp-digital-pay`

---

## 1. Princípio de Design

O painel admin do ECP Pay segue a **mesma identidade visual** do ecossistema ECP (dark theme + lime accent + Inter). A diferença é o contexto: enquanto o ecp-bank e ecp-emps são voltados para o cliente final, o painel do ecp-pay é uma **ferramenta operacional** — foco em monitoramento, investigação e controle.

Inspirado em Stripe Dashboard, Datadog e Grafana: density-first, data-rich, com filtros e drill-down por transação. Desktop-first. Acessível via `http://localhost:5176`.

---

## 2. Identidade Visual (aplicada em `tailwind.config.ts` + `styles/globals.css`)

### 2.1. Paleta de Cores (CSS vars em `:root`)

| Token | Valor | Uso |
|-------|-------|-----|
| `--color-background` | `#0b0f14` | Fundo principal |
| `--color-surface` | `#131c28` | Cards, tabelas, painéis |
| `--color-secondary-bg` | `#0f1620` | Sidebar, áreas alternadas, code blocks |
| `--color-border` | `#27364a` | Bordas e separadores |

### 2.2. Cor de Acento

| Token | Valor | Uso |
|-------|-------|-----|
| `--color-lime` | `#b7ff2a` | CTAs primários, logo, provider EXTERNAL ativo, item de menu ativo |
| `--color-lime-pressed` | `#7ed100` | Hover de botão primary |
| `--color-lime-dim` | `rgba(183, 255, 42, 0.12)` | Background de badges lime, item de menu ativo |

### 2.3. Cores Semânticas

| Token | Valor | Uso |
|-------|-------|-----|
| `--color-success` | `#3dff8b` | Transação completed, webhook delivered |
| `--color-warning` | `#ffcc00` | Transação pending, provider INTERNAL, banner de modo |
| `--color-danger` | `#ff4d4d` | Transação failed, webhook error, botão Estornar |
| `--color-info` | `#4da3ff` | Transação processing, badge cartão |

### 2.4. Tipografia

| Token | Valor | Uso |
|-------|-------|-----|
| `--color-text-primary` | `#eaf2ff` | Textos principais |
| `--color-text-secondary` | `#a9b7cc` | Labels, descrições |
| `--color-text-tertiary` | `#7b8aa3` | Placeholders, metadados, ids truncados |
| `--font-family` | `'Inter', sans-serif` | Família principal (400/500/600/700) |
| `--font-mono` | `'JetBrains Mono', 'Fira Code', monospace` | IDs, tokens, códigos, JSON |

Fontes importadas via Google Fonts no `globals.css`.

### 2.5. Border Radius

| Token | Valor | Uso |
|-------|-------|-----|
| `--radius-card` | `18px` | Cards, Modals, code blocks |
| `--radius-control` | `13px` | Buttons, Inputs, Selects |
| `--radius-badge` | `20px` | Status badges (pill) |

### 2.6. Scrollbar custom

Implementada em `globals.css`:
- 6px track (`var(--color-background)`)
- Thumb `var(--color-border)`, hover `var(--color-text-tertiary)`

### 2.7. Select custom

`<select>` possui chevron SVG inline (`#7b8aa3`) à direita, padding-right 32px.

### 2.8. Skeleton shimmer

Componente `.skeleton` com animação linear gradient 1.5s infinite.

---

## 3. Componentes de UI (implementados em `web/src/components/ui/`)

### 3.1. Button (`Button.tsx`)

- **Variants:** `primary` (fundo lime, texto background, hover lime-pressed), `secondary` (transparent + border, hover border text-tertiary), `ghost` (transparent, hover white/5), `danger` (transparent, border danger, hover danger/10)
- **Sizes:** `sm` (px-3.5 py-1.5 text-xs), `md` (px-5 py-2.5 text-sm), `lg` (px-6 py-3 text-base)
- Props extras: `loading` (spinner `Loader2` substitui icon), `icon` (slot lateral 16x16)
- `active:scale-[0.97]` para feedback tátil
- `rounded-control` (13px)

### 3.2. Card (`Card.tsx`)

- `bg-surface border border-border rounded-card p-6`
- Exporta `CardHeader` auxiliar com title (15px semibold) + subtitle (xs tertiary) + action slot
- Suporte a `onClick` com hover `bg-white/[0.02]` e `cursor-pointer`

### 3.3. Input (`Input.tsx`)

- Label 12px `text-secondary`
- Container com border, `rounded-control`, `bg-surface`
- Focus: `border-lime` + box-shadow `rgba(183,255,42,0.12)` ring 3px
- Slots `iconLeft` / `iconRight` (12px tertiary)
- Error: `border-danger` + mensagem `text-danger xs` abaixo
- Exporta também `Select` com estilo idêntico + chevron SVG

### 3.4. Modal (`Modal.tsx`)

- Overlay `bg-black/70`, z-index 1000, centralizado
- Tecla Escape fecha
- Click no backdrop fecha
- Body trava scroll (`overflow: hidden`)
- Container: `bg-surface border border-border rounded-card p-8 max-w-[440px]`
- Header: título 18px semibold + botão X (Lucide)
- Body 14px `text-secondary`, actions justify-end com gap 12px

### 3.5. Table (`Table.tsx`)

- Genérico `Table<T>` com `columns`, `data`, `keyExtractor`, `onRowClick?`, `emptyMessage?`
- Wrapper `overflow-x-auto border border-border rounded-card`
- Header: `bg-secondary-bg` + `text-[11px] font-semibold text-text-tertiary uppercase tracking-wide`
- Rows: `border-b border-border last:border-b-0`, hover `bg-white/[0.02]`; clicável vira `cursor-pointer` + `hover:bg-lime/[0.03]`
- Empty state: 48px padding centralizado

### 3.6. Badge (`Badge.tsx`)

Base: `bg-<color>/[0.12] text-<color>`, `rounded-badge (20px) text-[11px] uppercase tracking-wide`.

**Variants:** `success`, `warning`, `danger`, `info`, `lime`, `neutral`.

**Badges de domínio exportados no mesmo arquivo:**

| Componente | Mapeamento |
|------------|-----------|
| `TransactionStatusBadge` | pending→warning "Pendente", processing→info "Processando", completed→success "Concluida", failed→danger "Falhou", refunded→neutral "Estornado", partially_refunded→info "Estorno parcial", expired/cancelled→neutral |
| `TransactionTypeBadge` | pix→lime + `Zap`, card→info + `CreditCard`, boleto→warning + `FileText` |
| `WebhookStatusBadge` | delivered→success "Entregue", failed→danger "Falhou", retrying→info "Retentando", pending→warning "Pendente" |
| `ProviderBadge` | internal→warning "INTERNAL", asaas→lime "ASAAS", stripe→info "STRIPE" |

### 3.7. Toggle (`Toggle.tsx`)

- Track 48x24px (`w-12 h-6`), thumb 20px
- Off: border `border-border`, thumb `bg-text-tertiary`
- On: background `bg-lime`, border `border-lime`, thumb `bg-background`
- Transição 200ms em todas as propriedades
- `disabled` aplica `opacity-50 pointer-events-none`
- Input checkbox escondido com `sr-only` (acessibilidade)

### 3.8. Componentes previstos na spec 2026-03 mas NÃO implementados como arquivo dedicado

- `ProviderToggle.tsx` — substituído por dois `Card` lado a lado em `providers.tsx`
- `TransactionTimeline.tsx` — inline dentro de `transaction-detail.tsx`
- `KPICard.tsx` — inline (helper `KPICard` em `dashboard.tsx`)
- `CodeBlock.tsx` — inline (block com `bg-secondary-bg font-mono`)
- `FilterBar.tsx` — inline (`flex items-end gap-3` em `transactions.tsx`)
- `EmptyState.tsx` — gerenciado via prop `emptyMessage` da Table e card centralizado no `apps.tsx`

---

## 4. Layout do Painel Admin (`web/src/components/layout/`)

### 4.1. Sidebar (`Sidebar.tsx`)

- Fixed left, 240px (`w-60 min-w-[240px]`), `bg-secondary-bg border-r border-border`, z-index 100
- Logo no topo: `⬡ ECP Pay` em `text-lime text-xl font-bold` + subtítulo "Payment Service" em `text-[11px] text-tertiary`
- 6 itens de navegação com ícones Lucide:
  - Dashboard (`LayoutDashboard`)
  - Transacoes (`FileText`)
  - Providers (`Plug`)
  - Webhooks (`Bell`)
  - Apps (`AppWindow`)
  - Configuracoes (`Settings`)
- Item ativo: `text-lime bg-lime-dim`; inativo: `text-text-secondary hover:text-text-primary hover:bg-white/[0.04]`
- Footer fixo: indicador "Provider: INTERNAL/EXTERNAL" com dot (warning em internal, lime em external)

### 4.2. Header (`Header.tsx`)

- Título da página + badge do provider ativo + nome admin + botão logout
- Aparece no topo do `ProtectedLayout`

### 4.3. InternalBanner (`InternalBanner.tsx`)

- Banner fixo amarelo exibido apenas quando `PAYMENT_PROVIDER=internal`
- Visível em todas as páginas autenticadas

### 4.4. MobileNav (`MobileNav.tsx`)

- Bottom nav para mobile (breakpoint `lg` e abaixo)
- Replica os principais itens da sidebar

### 4.5. ProtectedLayout (`App.tsx`)

```
┌───────┬───────────────────────────────┐
│ Side  │ Header                         │
│ bar   ├───────────────────────────────┤
│ 240px │ InternalBanner (se internal)  │
│       ├───────────────────────────────┤
│       │ <Outlet /> — padding 28px     │
│       │ (overflow-y-auto, pb-20 mobile│
└───────┴───────────────────────────────┘
```

- Sidebar oculta abaixo de `lg` (`hidden lg:block`)
- Conteúdo com `lg:ml-60` para compensar sidebar fixa
- Loading global: spinner lime 32x32 centralizado

---

## 5. Páginas (8 telas implementadas)

### 5.1. Login — `/login` (`login.tsx`)

- Card centralizado `max-w-[400px] p-10`
- Logo ⬡ ECP Pay lime 28px + subtítulo "Payment Service"
- Form: email, senha (com toggle show/hide Eye/EyeOff)
- Erro em caixa `text-danger bg-danger/10 rounded-control py-2`
- Botão "Entrar" full-width py-3

### 5.2. Dashboard — `/` (`dashboard.tsx`)

- 6 KPI cards em grid responsivo (1 → 2 → 3 colunas):
  - Volume total, Transações, Taxa de sucesso, Hoje, Completadas, Falharam
- KPICard inline: label uppercase tracking-wide tertiary 12px, valor 24px bold, ícone Lucide
- Card provider destacado com borda esquerda 3px lime
- Dois gráficos lado a lado (xl:grid-cols-2):
  - "Volume por app" — `BarChart` horizontal (Recharts), cores rotacionadas de `['#b7ff2a','#4da3ff','#ffcc00','#3dff8b','#ff4d4d']`
  - "Distribuição por tipo" — `PieChart` donut (outerRadius 90, innerRadius 55, paddingAngle 3), cores por tipo: pix=lime, card=info, boleto=warning
- Últimas 10 transações em Table clicável

### 5.3. Transacoes — `/transactions` (`transactions.tsx`)

- Filtros no topo: Select app (ecp-bank/ecp-emps/ecp-food), Select tipo, Select status, Input busca
- Todos os Selects `min-w-[140px]`; Input busca `flex-1 min-w-[200px]` com ícone `Search`
- Table com colunas: ID (mono truncado), App, Tipo (badge), Valor bold, Cliente + documento mascarado, Status (badge), Provider (badge), Data
- Paginação: 15 por página, ChevronLeft/Right, exibe "x / y" e total de transações
- Row click → `/transactions/:id`

### 5.4. Detalhe da Transacao — `/transactions/:id` (`transaction-detail.tsx`)

- Back button (ArrowLeft) quadrado 36px + título mono
- Card resumo: valor 32px bold + 3 badges (status, type, provider)
- Timeline vertical com linha `bg-border` 2px à esquerda, dots 14px com borda 2px e fundo `{color}/20`. Cores do dot por status: success/info/warning/danger/neutral
- Grid 2 colunas de cards: Cliente / Pagamento / Provider / Callback
- DetailRow: label 13px tertiary à esquerda, valor 13px primary à direita, mono opcional
- Metadata: bloco code `bg-secondary-bg border border-border rounded-card p-5 font-mono xs`
- Timestamps com tempo total formatado
- Ações no rodapé: "Estornar" (danger, se status completed), "Reenviar callback" (secondary, se callback failed), "Simular pagamento" (primary, apenas internal + pending)
- Modal de confirmação de estorno com texto explicativo

### 5.5. Providers — `/providers` (`providers.tsx`)

- Card título com ícone `ArrowRightLeft` lime + descrição
- Dois cards em grid (`lg:grid-cols-2`):
  - **INTERNAL**: ícone `Server` warning, bullets (Sem gateway, Simulação local, Zero custo, Ideal para dev)
  - **EXTERNAL**: ícone `Cloud` lime, bullets (Gateway real Asaas, Transações reais, Taxas aplicáveis, Produção)
- Card ativo recebe `border-l-[3px] border-l-lime` + Badge "ATIVO" lime
- Card inativo exibe botão "Ativar" secondary
- Transição 300ms
- Card com "Ativo desde" e contador de transações
- Tabela opcional de histórico de trocas
- Modal de confirmação ao trocar

### 5.6. Webhooks — `/webhooks` (`webhooks.tsx`)

- Tabs custom (não um componente compartilhado): 2 botões `rounded-control border text-[13px] font-semibold`
- Tab ativo: `bg-lime-dim text-lime border-transparent`; inativo: `border-border hover:border-text-tertiary`
- Table "Recebidos": event_id, tipo, transação, processado (WebhookStatusBadge), data, ChevronDown/Up
- Table "Enviados": transação, app_name, status, tentativas, data, botão Retry (se failed)
- Payload expandido em card separado com JSON formatado (pre, mono 11px)

### 5.7. Apps — `/apps` (`apps.tsx`)

- Header com título + botão "Registrar novo app" (ícone `Plus`)
- Empty state: `AppWindow` 48px tertiary + CTA
- Grid `md:grid-cols-2 xl:grid-cols-3` de Cards
- Por card: nome 16px semibold, status dot (success/tertiary), API key mono com toggle Eye/EyeOff, callback URL mono xs, stats (transações + volume), Badge Ativo/Inativo, botão "Regenerar key" ghost com ícone `RotateCw`
- Mask key: `slice(0,4) + '...' + slice(-4)`
- Modal "Registrar novo app": Inputs nome + callback URL
- Modal "Regenerar API Key": confirmação danger

### 5.8. Configuracoes — `/settings` (`settings.tsx`)

- Seção "Feature Flags" com título `border-b`
- Lista de linhas com descrição + key mono + Toggle para flags booleanas
- Card "Delay de simulação" com range input customizado (thumb 18px lime) + valor em destaque lime
- Card "Configurações" com Table das flags não-booleanas
- Card placeholder "Usuarios admin" com mensagem "disponivel em uma versao futura"

### 5.9. Páginas previstas não implementadas

- `/splits`, `/card-vault`, `/audit-log` — ausentes (endpoints correspondentes também ausentes)

---

## 6. Gráficos (Recharts)

### 6.1. Volume por app (Dashboard)

- `BarChart` layout `vertical`
- `CartesianGrid strokeDasharray="3 3" stroke="rgba(28,40,54,0.5)"`
- `XAxis` type number, tick `fill: #7b8aa3 fontSize: 11`, `tickFormatter={abbreviateCurrency}`
- `YAxis` type category, width 80
- Bar `radius={[0,4,4,0]}`, cores rotacionadas lime/info/warning/success/danger

### 6.2. Distribuição por tipo (Dashboard)

- `PieChart` donut (outerRadius 90, innerRadius 55, paddingAngle 3)
- Cores: pix=`#b7ff2a`, card=`#4da3ff`, boleto=`#ffcc00`
- Legenda inline abaixo com dots coloridos + label + formatCurrency(volume)

### 6.3. Tooltip compartilhado

```js
const chartTooltipStyle = {
  backgroundColor: '#131c28',
  border: '1px solid #27364a',
  borderRadius: '8px',
  color: '#eaf2ff',
  fontSize: '12px',
};
```

---

## 7. Estados de Status — Mapeamento definitivo

### 7.1. Transação

| Status | Badge | Label PT |
|--------|-------|----------|
| pending | warning | Pendente |
| processing | info | Processando |
| completed | success | Concluida |
| failed | danger | Falhou |
| refunded | neutral | Estornado |
| partially_refunded | info | Estorno parcial |
| expired | neutral | Expirado |
| cancelled | neutral | Cancelado |

### 7.2. Tipo

| Tipo | Badge | Ícone Lucide | Label |
|------|-------|---------------|-------|
| pix | lime | `Zap` (12px) | Pix |
| card | info | `CreditCard` | Cartao |
| boleto | warning | `FileText` | Boleto |

### 7.3. Webhook/Callback

| Status | Badge | Label |
|--------|-------|-------|
| delivered | success | Entregue |
| failed | danger | Falhou |
| retrying | info | Retentando |
| pending | warning | Pendente |

### 7.4. Provider

| Provider | Badge | Label |
|----------|-------|-------|
| internal | warning | INTERNAL |
| asaas | lime | ASAAS |
| stripe | info | STRIPE |

---

## 8. Formatadores (`lib/formatters.ts`)

- `formatCurrency(centavos)` — R$ pt-BR
- `abbreviateCurrency(centavos)` — `R$ 1.2k`, `R$ 15k`
- `formatDate(iso)` — data+hora pt-BR
- `formatRelativeTime(iso)` — "há 2 minutos"
- `formatElapsed(start, end)` — "3s", "12m 5s"
- `truncateUuid(id)` — exibe primeiros/últimos chars
- `maskDocument(doc)` — CPF/CNPJ mascarado

---

## 9. Responsividade

| Breakpoint | Comportamento implementado |
|-----------|---------------------------|
| ≥ 1280px (`xl`) | Sidebar fixa + grid 2–3 colunas nos dashboards |
| 1024–1279px (`lg`) | Sidebar fixa + grid 2 colunas |
| 768–1023px (`md`) | Sem sidebar, MobileNav no rodapé + grid 2 colunas onde aplicável |
| < 768px | Cards empilhados, padding reduzido, tabelas com scroll horizontal |

---

## 10. Referência CSS (arquivo `web/src/styles/globals.css`)

Todas as custom properties e o import das fontes Google estão consolidados em:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

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
  --radius-badge: 20px;
  --font-family: 'Inter', sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
}
```

Base: html/body usam `background var(--color-background)`, `color var(--color-text-primary)`, `font-size: 14px`, `line-height: 1.5`, anti-aliasing.

---

## 11. Diferenças vs. Design Spec 2026-03

| Item | Spec 2026-03 | Implementado 2026-04 |
|------|-------------|---------------------|
| Gráfico principal | LineChart 30 dias + linhas por app | BarChart horizontal por app + PieChart por tipo |
| Gráfico "Taxa de sucesso" | BarChart por hora | Não implementado |
| `ProviderToggle` como componente | Previsto (um toggle visual único) | Implementado como dois `Card` lado a lado com borda esquerda lime |
| Páginas de Split / Cofre / Audit | Previstas | **Não implementadas** |
| `KPICard`, `CodeBlock`, `FilterBar`, `EmptyState` | Componentes dedicados | Inline nas páginas |
| Banner INTERNAL | "Faixa amarela no topo" — feature flag | Implementado como `InternalBanner.tsx` fixo |
| Porta do painel | 5175 | 5176 |

---

*Identidade visual herdada do ecossistema ECP — dark theme + lime accent + Inter + JetBrains Mono*
*Documento gerado a partir da implementação em `03-product-delivery/web/` — 20/04/2026*
