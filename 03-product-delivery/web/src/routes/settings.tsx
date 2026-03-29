import { useState, useEffect } from 'react';
import { useFetch } from '../hooks/useFetch';
import { api } from '../services/api';
import { Card, CardHeader } from '../components/ui/Card';
import { Toggle } from '../components/ui/Toggle';
import { Table } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';

interface FeatureFlag {
  key: string;
  value: string;
  description: string;
  updated_by: string;
  updated_at: string;
}

interface FlagsResponse {
  flags: FeatureFlag[];
}

export default function SettingsPage() {
  const { data: flagsData, loading, refetch } = useFetch<FlagsResponse>('/admin/feature-flags');
  const [simulationDelay, setSimulationDelay] = useState(3);
  const [updatingFlag, setUpdatingFlag] = useState<string | null>(null);

  const flags = flagsData?.flags || [];

  async function handleToggleFlag(key: string, currentValue: string) {
    setUpdatingFlag(key);
    const isBool = currentValue === 'true' || currentValue === 'false';
    const newValue = isBool ? (currentValue === 'true' ? 'false' : 'true') : currentValue;
    try {
      await api.patch(`/admin/feature-flags/${key}`, { value: newValue });
      refetch();
    } catch {
      // ignore
    } finally {
      setUpdatingFlag(null);
    }
  }

  async function handleDelayChange(value: number) {
    setSimulationDelay(value);
    try {
      await api.patch('/admin/feature-flags/INTERNAL_SIMULATION_DELAY', {
        value: String(value * 1000),
      });
    } catch {
      // ignore
    }
  }

  // Sync delay from server
  useEffect(() => {
    const delayFlag = flags.find((f) => f.key === 'INTERNAL_SIMULATION_DELAY');
    if (delayFlag) {
      setSimulationDelay(Math.round(parseInt(delayFlag.value || '3000') / 1000));
    }
  }, [flags]);

  if (loading) {
    return (
      <div className="space-y-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="skeleton h-24" />
        ))}
      </div>
    );
  }

  // Separate boolean flags from others
  const boolFlags = flags.filter(
    (f) => f.value === 'true' || f.value === 'false'
  );
  const nonBoolFlags = flags.filter(
    (f) => f.value !== 'true' && f.value !== 'false' && f.key !== 'INTERNAL_SIMULATION_DELAY'
  );

  return (
    <div className="space-y-8">
      {/* Feature flags section */}
      <div>
        <h2 className="text-base font-semibold mb-4 pb-3 border-b border-border">
          Feature Flags
        </h2>
        <div className="space-y-0">
          {boolFlags.map((flag) => (
            <div
              key={flag.key}
              className="flex items-center justify-between py-3.5 border-b border-border/30"
            >
              <div>
                <span className="text-sm font-medium">{flag.description || flag.key}</span>
                <span className="font-mono text-xs text-text-tertiary block mt-0.5">{flag.key}</span>
              </div>
              <Toggle
                checked={flag.value === 'true'}
                onChange={() => handleToggleFlag(flag.key, flag.value)}
                disabled={updatingFlag === flag.key}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Simulation delay */}
      <Card>
        <CardHeader title="Delay de simulacao" subtitle="Modo INTERNAL — tempo ate liquidacao" />
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={0}
            max={30}
            value={simulationDelay}
            onChange={(e) => handleDelayChange(parseInt(e.target.value))}
            className="flex-1 h-1.5 bg-border rounded-full appearance-none outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-[18px] [&::-webkit-slider-thumb]:h-[18px] [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-lime [&::-webkit-slider-thumb]:cursor-pointer"
          />
          <span className="text-sm font-semibold text-lime min-w-[36px] text-right">
            {simulationDelay}s
          </span>
        </div>
      </Card>

      {/* Non-bool flags / config */}
      {nonBoolFlags.length > 0 && (
        <Card>
          <CardHeader title="Configuracoes" />
          <Table
            columns={[
              { key: 'key', header: 'Chave', render: (f) => <span className="font-mono text-xs">{f.key}</span> },
              { key: 'value', header: 'Valor', render: (f) => f.value },
              { key: 'description', header: 'Descricao', render: (f) => f.description || '-' },
            ]}
            data={nonBoolFlags}
            keyExtractor={(f) => f.key}
          />
        </Card>
      )}

      {/* Admin users placeholder */}
      <Card>
        <CardHeader title="Usuarios admin" subtitle="Gerenciamento de acesso ao painel" />
        <div className="text-center py-8 text-text-tertiary text-sm">
          Gerenciamento de usuarios disponivel em uma versao futura.
        </div>
      </Card>
    </div>
  );
}
