import { useState } from 'react';
import { useFetch } from '../hooks/useFetch';
import { api } from '../services/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Table } from '../components/ui/Table';
import { WebhookStatusBadge } from '../components/ui/Badge';
import { formatDate, truncateUuid } from '../lib/formatters';
import { RotateCw, ChevronDown, ChevronUp } from 'lucide-react';

interface WebhookReceived {
  id: string;
  event_id: string;
  event_type: string;
  transaction_id: string;
  processed: boolean;
  created_at: string;
  payload: string;
}

interface WebhookSent {
  id: string;
  transaction_id: string;
  app_name: string;
  status: string;
  attempts: number;
  created_at: string;
  payload: string;
}

interface WebhooksData {
  received: WebhookReceived[];
  sent: WebhookSent[];
}

export default function WebhooksPage() {
  const { data: webhooks, loading, refetch } = useFetch<WebhooksData>('/admin/webhooks');

  const [activeTab, setActiveTab] = useState<'received' | 'sent'>('received');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  const received: WebhookReceived[] = webhooks?.received || [];
  const sent: WebhookSent[] = webhooks?.sent || [];

  async function handleRetry(id: string) {
    setRetrying(id);
    try {
      await api.post(`/admin/webhooks/${id}/retry`);
      refetch();
    } catch {
      // ignore
    } finally {
      setRetrying(null);
    }
  }

  function toggleExpand(id: string) {
    setExpandedId(expandedId === id ? null : id);
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-10 w-64" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="skeleton h-12" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="flex gap-1">
        <button
          onClick={() => setActiveTab('received')}
          className={`px-5 py-2 rounded-control border text-[13px] font-semibold transition-all duration-200 ${
            activeTab === 'received'
              ? 'bg-lime-dim text-lime border-transparent'
              : 'bg-transparent text-text-secondary border-border hover:border-text-tertiary'
          }`}
        >
          Recebidos
        </button>
        <button
          onClick={() => setActiveTab('sent')}
          className={`px-5 py-2 rounded-control border text-[13px] font-semibold transition-all duration-200 ${
            activeTab === 'sent'
              ? 'bg-lime-dim text-lime border-transparent'
              : 'bg-transparent text-text-secondary border-border hover:border-text-tertiary'
          }`}
        >
          Enviados
        </button>
      </div>

      {/* Received tab */}
      {activeTab === 'received' && (
        <Card className="p-0 overflow-hidden">
          <Table<WebhookReceived>
            columns={[
              {
                key: 'event_id',
                header: 'Event ID',
                render: (w) => <span className="font-mono text-xs text-text-tertiary">{truncateUuid(w.event_id)}</span>,
              },
              { key: 'event_type', header: 'Tipo', render: (w) => w.event_type },
              {
                key: 'transaction_id',
                header: 'Transacao',
                render: (w) => <span className="font-mono text-xs text-text-tertiary">{truncateUuid(w.transaction_id)}</span>,
              },
              {
                key: 'processed',
                header: 'Processado',
                render: (w) => (
                  <WebhookStatusBadge status={w.processed ? 'delivered' : 'pending'} />
                ),
              },
              { key: 'created_at', header: 'Data', render: (w) => formatDate(w.created_at) },
              {
                key: 'expand',
                header: '',
                render: (w) => (
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleExpand(w.id); }}
                    className="text-text-tertiary hover:text-text-primary"
                  >
                    {expandedId === w.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                ),
              },
            ]}
            data={received}
            keyExtractor={(w) => w.id}
            emptyMessage="Nenhum webhook recebido"
          />
        </Card>
      )}

      {/* Sent tab */}
      {activeTab === 'sent' && (
        <Card className="p-0 overflow-hidden">
          <Table<WebhookSent>
            columns={[
              {
                key: 'transaction_id',
                header: 'Transacao',
                render: (w) => <span className="font-mono text-xs text-text-tertiary">{truncateUuid(w.transaction_id)}</span>,
              },
              { key: 'app_name', header: 'App destino', render: (w) => w.app_name },
              { key: 'status', header: 'Status', render: (w) => <WebhookStatusBadge status={w.status} /> },
              { key: 'attempts', header: 'Tentativas', render: (w) => String(w.attempts) },
              { key: 'created_at', header: 'Data', render: (w) => formatDate(w.created_at) },
              {
                key: 'actions',
                header: '',
                render: (w) =>
                  w.status === 'failed' ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={retrying === w.id}
                      icon={<RotateCw className="w-3.5 h-3.5" />}
                      onClick={(e) => { e.stopPropagation(); handleRetry(w.id); }}
                    >
                      Retry
                    </Button>
                  ) : null,
              },
            ]}
            data={sent}
            keyExtractor={(w) => w.id}
            emptyMessage="Nenhum callback enviado"
          />
        </Card>
      )}

      {/* Expanded payload */}
      {expandedId && (
        <Card>
          <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-3">Payload</h3>
          <div className="bg-secondary-bg border border-border rounded-card p-5 font-mono text-[11px] text-text-secondary overflow-x-auto whitespace-pre leading-relaxed">
            {(() => {
              const allItems: Array<{ id: string; payload: string }> = [
                ...received.map((r) => ({ id: r.id, payload: r.payload })),
                ...sent.map((s) => ({ id: s.id, payload: s.payload })),
              ];
              const item = allItems.find((i) => i.id === expandedId);
              if (!item?.payload) return 'N/A';
              try {
                return JSON.stringify(JSON.parse(item.payload), null, 2);
              } catch {
                return item.payload;
              }
            })()}
          </div>
        </Card>
      )}
    </div>
  );
}
