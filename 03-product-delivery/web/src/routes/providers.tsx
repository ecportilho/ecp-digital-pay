import { useState } from 'react';
import { useFetch } from '../hooks/useFetch';
import { api } from '../services/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Table } from '../components/ui/Table';
import { formatDate } from '../lib/formatters';
import { Server, Cloud, ArrowRightLeft } from 'lucide-react';

interface ProviderInfo {
  provider: {
    mode: string;
    active_since: string;
    tx_count: number;
  };
  history?: {
    id: string;
    from_mode: string;
    to_mode: string;
    user: string;
    created_at: string;
  }[];
  stats?: {
    internal: { tx_count: number; total_volume: number };
    external: { tx_count: number; total_volume: number };
  };
}

export default function ProvidersPage() {
  const { data, loading, refetch } = useFetch<ProviderInfo>('/admin/providers');
  const [showModal, setShowModal] = useState(false);
  const [targetMode, setTargetMode] = useState('');
  const [switching, setSwitching] = useState(false);

  const currentMode = data?.provider?.mode || 'internal';

  async function handleSwitch() {
    setSwitching(true);
    try {
      await api.post('/admin/providers/switch', { mode: targetMode });
      refetch();
    } catch {
      // ignore
    } finally {
      setSwitching(false);
      setShowModal(false);
    }
  }

  function openSwitch(mode: string) {
    setTargetMode(mode);
    setShowModal(true);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="skeleton h-64" />
          <div className="skeleton h-64" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Title card */}
      <Card>
        <h2 className="text-base font-semibold mb-2 flex items-center gap-2">
          <ArrowRightLeft className="w-5 h-5 text-lime" />
          Provider de pagamentos
        </h2>
        <p className="text-sm text-text-secondary">
          Alterne entre o modo INTERNAL (simulado) e EXTERNAL (Asaas) para processar transacoes.
        </p>
      </Card>

      {/* Provider cards side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* INTERNAL */}
        <Card
          className={`relative transition-all duration-300 ${
            currentMode === 'internal' ? 'border-l-[3px] border-l-lime' : ''
          }`}
        >
          <div className="flex items-center gap-2.5 mb-2">
            <Server className="w-5 h-5 text-warning" />
            <span className="text-lg font-bold">INTERNAL</span>
            {currentMode === 'internal' && (
              <Badge variant="lime">ATIVO</Badge>
            )}
          </div>
          <p className="text-[13px] text-text-secondary mb-4">Self-managed</p>
          <ul className="space-y-1.5 mb-5">
            <FeatureItem text="Sem gateway externo" />
            <FeatureItem text="Simulacao local" />
            <FeatureItem text="Zero custo" />
            <FeatureItem text="Ideal para desenvolvimento" />
          </ul>
          {currentMode !== 'internal' && (
            <Button variant="secondary" onClick={() => openSwitch('internal')}>Ativar</Button>
          )}
        </Card>

        {/* EXTERNAL (Asaas) */}
        <Card
          className={`relative transition-all duration-300 ${
            currentMode === 'external' ? 'border-l-[3px] border-l-lime' : ''
          }`}
        >
          <div className="flex items-center gap-2.5 mb-2">
            <Cloud className="w-5 h-5 text-lime" />
            <span className="text-lg font-bold">EXTERNAL</span>
            {currentMode === 'external' && (
              <Badge variant="lime">ATIVO</Badge>
            )}
          </div>
          <p className="text-[13px] text-text-secondary mb-4">Asaas</p>
          <ul className="space-y-1.5 mb-5">
            <FeatureItem text="Gateway real (Asaas)" />
            <FeatureItem text="Transacoes reais" />
            <FeatureItem text="Taxas aplicaveis" />
            <FeatureItem text="Producao" />
          </ul>
          {currentMode !== 'external' && (
            <Button variant="secondary" onClick={() => openSwitch('external')}>Ativar</Button>
          )}
        </Card>
      </div>

      {/* Active since info */}
      <Card>
        <div className="flex gap-6 text-[13px] text-text-secondary">
          <span>Ativo desde: {data?.provider?.active_since ? formatDate(data.provider.active_since) : '-'}</span>
          <span>Transacoes no modo atual: {data?.provider?.tx_count || 0}</span>
        </div>
      </Card>

      {/* Switch history */}
      {data?.history && data.history.length > 0 && (
        <Card>
          <h3 className="text-[15px] font-semibold mb-4">Historico de trocas</h3>
          <Table
            columns={[
              { key: 'from', header: 'De', render: (h) => h.from_mode.toUpperCase() },
              { key: 'to', header: 'Para', render: (h) => h.to_mode.toUpperCase() },
              { key: 'user', header: 'Usuario', render: (h) => h.user },
              { key: 'date', header: 'Data', render: (h) => formatDate(h.created_at) },
            ]}
            data={data.history}
            keyExtractor={(h) => h.id}
          />
        </Card>
      )}

      {/* Confirmation modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title="Alternar provider"
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button variant="primary" loading={switching} onClick={handleSwitch}>
              Confirmar
            </Button>
          </>
        }
      >
        <p>
          Tem certeza que deseja alternar para <strong>{targetMode.toUpperCase()}</strong>?
        </p>
        <p className="mt-2">
          Transacoes em andamento serao concluidas no modo atual.
        </p>
      </Modal>
    </div>
  );
}

function FeatureItem({ text }: { text: string }) {
  return (
    <li className="flex items-center gap-2 text-[13px] text-text-secondary">
      <span className="w-1.5 h-1.5 rounded-full bg-text-tertiary flex-shrink-0" />
      {text}
    </li>
  );
}
