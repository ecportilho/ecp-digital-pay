import { useParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useFetch } from '../hooks/useFetch';
import { api } from '../services/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { TransactionStatusBadge, TransactionTypeBadge, ProviderBadge } from '../components/ui/Badge';
import { formatCurrency, formatDate, formatElapsed, maskDocument } from '../lib/formatters';
import { ArrowLeft, RotateCw, Undo2, Play } from 'lucide-react';
import { Modal } from '../components/ui/Modal';

interface TimelineEvent {
  step: string;
  status: 'success' | 'info' | 'warning' | 'danger' | 'neutral';
  timestamp: string | null;
  elapsed?: string;
}

interface TransactionDetail {
  id: string;
  source_app: string;
  provider: string;
  provider_id: string;
  type: string;
  amount: number;
  currency: string;
  status: string;
  customer_name: string;
  customer_document: string;
  description: string;
  callback_url: string;
  callback_status: string;
  callback_attempts: number;
  metadata: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  pix_qr_code_text?: string;
  pix_expiration?: string;
  card_last4?: string;
  card_brand?: string;
  card_installments?: number;
  boleto_barcode?: string;
  boleto_digitable?: string;
  boleto_due_date?: string;
  timeline: TimelineEvent[];
}

const dotColors: Record<string, string> = {
  success: 'border-success bg-success/20',
  info: 'border-info bg-info/20',
  warning: 'border-warning bg-warning/20',
  danger: 'border-danger bg-danger/20',
  neutral: 'border-text-tertiary bg-text-tertiary/20',
};

export default function TransactionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: tx, loading, refetch } = useFetch<TransactionDetail>(`/admin/transactions/${id}`);
  const { data: providerData } = useFetch<{ provider: { mode: string } }>('/admin/providers');
  const isInternal = providerData?.provider?.mode === 'internal';

  const [simulating, setSimulating] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);

  async function handleSimulatePayment() {
    if (!id) return;
    setSimulating(true);
    try {
      await api.post(`/admin/transactions/${id}/simulate-payment`);
      refetch();
    } catch {
      // error handled silently
    } finally {
      setSimulating(false);
    }
  }

  async function handleResendCallback() {
    if (!id) return;
    try {
      await api.post(`/admin/webhooks/${id}/retry`);
      refetch();
    } catch {
      // ignore
    }
  }

  if (loading || !tx) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-10 w-48" />
        <div className="skeleton h-24" />
        <div className="skeleton h-64" />
      </div>
    );
  }

  let metadata: Record<string, unknown> = {};
  try {
    metadata = tx.metadata ? JSON.parse(tx.metadata) : {};
  } catch {
    metadata = {};
  }

  return (
    <div className="space-y-6">
      {/* Back button + header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/transactions')}
          className="flex items-center justify-center w-9 h-9 rounded-control border border-border bg-transparent text-text-secondary hover:border-text-tertiary hover:text-text-primary transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <div className="text-base font-semibold">Transacao</div>
          <div className="font-mono text-[13px] text-text-tertiary">{tx.id}</div>
        </div>
      </div>

      {/* Summary card */}
      <Card className="flex items-center gap-5 p-6">
        <div className="text-[32px] font-bold">{formatCurrency(tx.amount)}</div>
        <TransactionStatusBadge status={tx.status} />
        <TransactionTypeBadge type={tx.type} />
        <ProviderBadge provider={tx.provider} />
      </Card>

      {/* Timeline */}
      <Card>
        <h3 className="text-[15px] font-semibold mb-4">Timeline</h3>
        <div className="relative pl-7">
          {/* Vertical line */}
          <div className="absolute left-[9px] top-2 bottom-2 w-0.5 bg-border" />
          {(tx.timeline || []).map((step, i) => (
            <div key={i} className={`relative pb-6 pl-5 ${i === (tx.timeline?.length || 0) - 1 ? 'pb-0' : ''}`}>
              <div
                className={`absolute -left-[23px] top-1 w-3.5 h-3.5 rounded-full border-2 ${dotColors[step.status] || dotColors.neutral}`}
              />
              <div className="text-sm font-semibold text-text-primary">{step.step}</div>
              {step.timestamp && (
                <div className="text-xs text-text-tertiary mt-0.5">{formatDate(step.timestamp)}</div>
              )}
              {step.elapsed && (
                <div className="text-[11px] text-text-tertiary italic">{step.elapsed}</div>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Data grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Customer */}
        <Card>
          <h3 className="text-[13px] font-semibold text-text-tertiary uppercase tracking-wide mb-3">Cliente</h3>
          <div className="space-y-0">
            <DetailRow label="Nome" value={tx.customer_name} />
            <DetailRow label="Documento" value={maskDocument(tx.customer_document)} mono />
            <DetailRow label="Descricao" value={tx.description || '-'} />
          </div>
        </Card>

        {/* Payment */}
        <Card>
          <h3 className="text-[13px] font-semibold text-text-tertiary uppercase tracking-wide mb-3">Pagamento</h3>
          <div className="space-y-0">
            <DetailRow label="Tipo" value={tx.type} />
            <DetailRow label="Valor" value={formatCurrency(tx.amount)} />
            <DetailRow label="Status" value={tx.status} />
            {tx.type === 'pix' && tx.pix_qr_code_text && (
              <DetailRow label="Pix copia e cola" value={tx.pix_qr_code_text} mono />
            )}
            {tx.type === 'card' && (
              <>
                <DetailRow label="Cartao" value={`**** ${tx.card_last4 || '----'} (${tx.card_brand || '-'})`} mono />
                <DetailRow label="Parcelas" value={String(tx.card_installments || 1)} />
              </>
            )}
            {tx.type === 'boleto' && (
              <>
                <DetailRow label="Codigo de barras" value={tx.boleto_barcode || '-'} mono />
                <DetailRow label="Vencimento" value={tx.boleto_due_date || '-'} />
              </>
            )}
          </div>
        </Card>

        {/* Provider */}
        <Card>
          <h3 className="text-[13px] font-semibold text-text-tertiary uppercase tracking-wide mb-3">Provider</h3>
          <div className="space-y-0">
            <DetailRow label="Provider" value={tx.provider} />
            <DetailRow label="Provider ID" value={tx.provider_id || '-'} mono />
            <DetailRow label="Source App" value={tx.source_app} />
          </div>
        </Card>

        {/* Callback */}
        <Card>
          <h3 className="text-[13px] font-semibold text-text-tertiary uppercase tracking-wide mb-3">Callback</h3>
          <div className="space-y-0">
            <DetailRow label="URL" value={tx.callback_url || '-'} mono />
            <DetailRow label="Status" value={tx.callback_status || '-'} />
            <DetailRow label="Tentativas" value={String(tx.callback_attempts || 0)} />
          </div>
        </Card>
      </div>

      {/* Metadata JSON */}
      {Object.keys(metadata).length > 0 && (
        <Card>
          <h3 className="text-[13px] font-semibold text-text-tertiary uppercase tracking-wide mb-3">Metadata</h3>
          <div className="bg-secondary-bg border border-border rounded-card p-5 font-mono text-xs text-text-secondary overflow-x-auto whitespace-pre leading-relaxed">
            {JSON.stringify(metadata, null, 2)}
          </div>
        </Card>
      )}

      {/* Timestamps */}
      <Card>
        <h3 className="text-[13px] font-semibold text-text-tertiary uppercase tracking-wide mb-3">Timestamps</h3>
        <div className="space-y-0">
          <DetailRow label="Criada em" value={formatDate(tx.created_at)} />
          <DetailRow label="Atualizada em" value={formatDate(tx.updated_at)} />
          {tx.completed_at && (
            <>
              <DetailRow label="Concluida em" value={formatDate(tx.completed_at)} />
              <DetailRow label="Tempo total" value={formatElapsed(tx.created_at, tx.completed_at)} />
            </>
          )}
        </div>
      </Card>

      {/* Actions */}
      <div className="flex gap-3 flex-wrap">
        {tx.status === 'completed' && (
          <Button variant="danger" icon={<Undo2 className="w-4 h-4" />} onClick={() => setShowRefundModal(true)}>
            Estornar
          </Button>
        )}
        {tx.callback_status === 'failed' && (
          <Button variant="secondary" icon={<RotateCw className="w-4 h-4" />} onClick={handleResendCallback}>
            Reenviar callback
          </Button>
        )}
        {isInternal && tx.status === 'pending' && (
          <Button variant="primary" loading={simulating} icon={<Play className="w-4 h-4" />} onClick={handleSimulatePayment}>
            Simular pagamento
          </Button>
        )}
      </div>

      {/* Refund modal */}
      <Modal
        open={showRefundModal}
        onClose={() => setShowRefundModal(false)}
        title="Confirmar estorno"
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowRefundModal(false)}>Cancelar</Button>
            <Button
              variant="danger"
              onClick={async () => {
                try {
                  await api.post(`/pay/transactions/${id}/refund`);
                  refetch();
                } catch { /* ignore */ }
                setShowRefundModal(false);
              }}
            >
              Confirmar estorno
            </Button>
          </>
        }
      >
        <p>
          Tem certeza que deseja estornar esta transacao no valor de{' '}
          <strong>{formatCurrency(tx.amount)}</strong>?
        </p>
        <p className="mt-2">Esta acao nao pode ser desfeita.</p>
      </Modal>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between py-2 border-b border-border/40 last:border-b-0">
      <span className="text-[13px] text-text-tertiary">{label}</span>
      <span className={`text-[13px] text-text-primary text-right ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  );
}
