import { AlertTriangle } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch';

export function InternalBanner() {
  const { data } = useFetch<{ provider: { mode: string } }>('/admin/providers');
  const mode = data?.provider?.mode;

  if (mode !== 'internal') return null;

  return (
    <div className="bg-warning/[0.08] border-b border-warning/20 px-8 py-2 text-xs font-semibold text-warning flex items-center gap-2">
      <AlertTriangle className="w-3.5 h-3.5" />
      MODO INTERNAL — transacoes simuladas
    </div>
  );
}
