import { useAuth } from '../../hooks/useAuth';
import { useFetch } from '../../hooks/useFetch';
import { ProviderBadge } from '../ui/Badge';
import { LogOut } from 'lucide-react';

interface HeaderProps {
  title: string;
}

export function Header({ title }: HeaderProps) {
  const { user, logout } = useAuth();
  const { data: providerData } = useFetch<{ provider: { mode: string } }>('/admin/providers');
  const mode = providerData?.provider?.mode || 'internal';

  return (
    <header className="flex items-center justify-between px-8 py-4 border-b border-border bg-secondary-bg min-h-[60px]">
      <h1 className="text-lg font-semibold">{title}</h1>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${mode === 'internal' ? 'bg-warning' : 'bg-lime'}`} />
          <ProviderBadge provider={mode} />
          <span className="text-xs text-text-tertiary">ativo</span>
        </div>
        <span className="text-[13px] text-text-secondary">{user?.name}</span>
        <button
          onClick={logout}
          className="text-text-tertiary hover:text-text-primary transition-colors"
          title="Sair"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
