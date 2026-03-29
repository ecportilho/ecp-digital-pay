import { Zap, CreditCard, FileText } from 'lucide-react';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'lime' | 'neutral';

const variantClasses: Record<BadgeVariant, string> = {
  success: 'bg-success/[0.12] text-success',
  warning: 'bg-warning/[0.12] text-warning',
  danger: 'bg-danger/[0.12] text-danger',
  info: 'bg-info/[0.12] text-info',
  lime: 'bg-lime-dim text-lime',
  neutral: 'bg-text-tertiary/[0.12] text-text-tertiary',
};

interface BadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant, children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-badge text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

// --- Domain-specific badges ---

const txStatusMap: Record<string, { variant: BadgeVariant; label: string }> = {
  pending: { variant: 'warning', label: 'Pendente' },
  processing: { variant: 'info', label: 'Processando' },
  completed: { variant: 'success', label: 'Concluida' },
  failed: { variant: 'danger', label: 'Falhou' },
  refunded: { variant: 'neutral', label: 'Estornado' },
  partially_refunded: { variant: 'info', label: 'Estorno parcial' },
  expired: { variant: 'neutral', label: 'Expirado' },
  cancelled: { variant: 'neutral', label: 'Cancelado' },
};

export function TransactionStatusBadge({ status }: { status: string }) {
  const conf = txStatusMap[status] || { variant: 'neutral' as BadgeVariant, label: status };
  return <Badge variant={conf.variant}>{conf.label}</Badge>;
}

const txTypeMap: Record<string, { variant: BadgeVariant; label: string; icon: React.ReactNode }> = {
  pix: { variant: 'lime', label: 'Pix', icon: <Zap className="w-3 h-3" /> },
  card: { variant: 'info', label: 'Cartao', icon: <CreditCard className="w-3 h-3" /> },
  boleto: { variant: 'warning', label: 'Boleto', icon: <FileText className="w-3 h-3" /> },
};

export function TransactionTypeBadge({ type }: { type: string }) {
  const conf = txTypeMap[type] || { variant: 'neutral' as BadgeVariant, label: type, icon: null };
  return (
    <Badge variant={conf.variant}>
      {conf.icon}
      {conf.label}
    </Badge>
  );
}

const webhookStatusMap: Record<string, { variant: BadgeVariant; label: string }> = {
  delivered: { variant: 'success', label: 'Entregue' },
  failed: { variant: 'danger', label: 'Falhou' },
  retrying: { variant: 'info', label: 'Retentando' },
  pending: { variant: 'warning', label: 'Pendente' },
};

export function WebhookStatusBadge({ status }: { status: string }) {
  const conf = webhookStatusMap[status] || { variant: 'neutral' as BadgeVariant, label: status };
  return <Badge variant={conf.variant}>{conf.label}</Badge>;
}

const providerMap: Record<string, { variant: BadgeVariant; label: string }> = {
  internal: { variant: 'warning', label: 'INTERNAL' },
  asaas: { variant: 'lime', label: 'ASAAS' },
  stripe: { variant: 'info', label: 'STRIPE' },
};

export function ProviderBadge({ provider }: { provider: string }) {
  const conf = providerMap[provider] || { variant: 'neutral' as BadgeVariant, label: provider };
  return <Badge variant={conf.variant}>{conf.label}</Badge>;
}
