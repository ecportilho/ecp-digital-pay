import { useState } from 'react';
import { useFetch } from '../hooks/useFetch';
import { api } from '../services/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { formatCurrency } from '../lib/formatters';
import { Plus, Eye, EyeOff, RotateCw, AppWindow } from 'lucide-react';

interface AppRegistration {
  id: string;
  app_name: string;
  api_key: string;
  callback_base_url: string;
  is_active: boolean;
  created_at: string;
  stats?: {
    total_transactions: number;
    total_volume: number;
  };
}

interface AppsResponse {
  apps: AppRegistration[];
}

export default function AppsPage() {
  const { data, loading, refetch } = useFetch<AppsResponse>('/admin/apps');
  const [showNewModal, setShowNewModal] = useState(false);
  const [showKeyConfirm, setShowKeyConfirm] = useState<string | null>(null);
  const [newAppName, setNewAppName] = useState('');
  const [newCallbackUrl, setNewCallbackUrl] = useState('');
  const [creating, setCreating] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});

  function toggleKeyVisibility(id: string) {
    setVisibleKeys((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function maskKey(key: string): string {
    if (!key || key.length < 8) return '********';
    return key.slice(0, 4) + '...' + key.slice(-4);
  }

  async function handleCreateApp() {
    setCreating(true);
    try {
      await api.post('/admin/apps', {
        appName: newAppName,
        callbackBaseUrl: newCallbackUrl,
      });
      refetch();
      setShowNewModal(false);
      setNewAppName('');
      setNewCallbackUrl('');
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  }

  async function handleRegenerateKey(appId: string) {
    try {
      await api.patch(`/admin/apps/${appId}`, { regenerateKey: true });
      refetch();
    } catch {
      // ignore
    }
    setShowKeyConfirm(null);
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="skeleton h-48" />
        ))}
      </div>
    );
  }

  const apps = data?.apps || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Apps registrados</h2>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowNewModal(true)}>
          Registrar novo app
        </Button>
      </div>

      {apps.length === 0 ? (
        <Card className="text-center py-12">
          <AppWindow className="w-12 h-12 text-text-tertiary mx-auto mb-3" />
          <p className="text-text-secondary">Nenhum app registrado</p>
          <Button className="mt-4" onClick={() => setShowNewModal(true)}>
            Registrar primeiro app
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {apps.map((app) => (
            <Card key={app.id}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-base font-semibold">{app.app_name}</span>
                <span className={`w-2 h-2 rounded-full ${app.is_active ? 'bg-success' : 'bg-text-tertiary'}`} />
              </div>

              <div className="text-[13px] text-text-secondary mb-1.5">
                API Key:{' '}
                <span className="font-mono text-xs text-text-tertiary">
                  {visibleKeys[app.id] ? app.api_key : maskKey(app.api_key)}
                </span>
                <button
                  onClick={() => toggleKeyVisibility(app.id)}
                  className="ml-2 text-text-tertiary hover:text-text-primary inline-flex"
                >
                  {visibleKeys[app.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>

              <div className="text-[13px] text-text-secondary mb-3">
                Callback: <span className="font-mono text-xs text-text-tertiary">{app.callback_base_url}</span>
              </div>

              {app.stats && (
                <div className="flex gap-4 mb-4 text-xs text-text-tertiary">
                  <span>{app.stats.total_transactions} transacoes</span>
                  <span>{formatCurrency(app.stats.total_volume)}</span>
                </div>
              )}

              <div className="flex gap-2">
                <Badge variant={app.is_active ? 'success' : 'neutral'}>
                  {app.is_active ? 'Ativo' : 'Inativo'}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<RotateCw className="w-3.5 h-3.5" />}
                  onClick={() => setShowKeyConfirm(app.id)}
                >
                  Regenerar key
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* New app modal */}
      <Modal
        open={showNewModal}
        onClose={() => setShowNewModal(false)}
        title="Registrar novo app"
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowNewModal(false)}>Cancelar</Button>
            <Button loading={creating} onClick={handleCreateApp} disabled={!newAppName || !newCallbackUrl}>
              Registrar
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Nome do app"
            placeholder="ex: ecp-food"
            value={newAppName}
            onChange={(e) => setNewAppName(e.target.value)}
          />
          <Input
            label="Callback base URL"
            placeholder="https://..."
            value={newCallbackUrl}
            onChange={(e) => setNewCallbackUrl(e.target.value)}
          />
        </div>
      </Modal>

      {/* Regenerate key confirmation */}
      <Modal
        open={!!showKeyConfirm}
        onClose={() => setShowKeyConfirm(null)}
        title="Regenerar API Key"
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowKeyConfirm(null)}>Cancelar</Button>
            <Button variant="danger" onClick={() => showKeyConfirm && handleRegenerateKey(showKeyConfirm)}>
              Regenerar
            </Button>
          </>
        }
      >
        <p>
          A API key atual sera invalidada imediatamente. O app precisara atualizar sua configuracao com a nova key.
        </p>
        <p className="mt-2">Deseja continuar?</p>
      </Modal>
    </div>
  );
}
