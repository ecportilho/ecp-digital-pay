import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  Plug,
  Bell,
  AppWindow,
  Settings,
} from 'lucide-react';
import { useFetch } from '../../hooks/useFetch';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/transactions', icon: FileText, label: 'Transacoes' },
  { to: '/providers', icon: Plug, label: 'Providers' },
  { to: '/webhooks', icon: Bell, label: 'Webhooks' },
  { to: '/apps', icon: AppWindow, label: 'Apps' },
  { to: '/settings', icon: Settings, label: 'Configuracoes' },
];

export function Sidebar() {
  const { data: providerData } = useFetch<{ provider: { mode: string } }>('/admin/providers');
  const mode = providerData?.provider?.mode || 'internal';

  return (
    <nav className="w-60 min-w-[240px] bg-secondary-bg border-r border-border flex flex-col fixed top-0 left-0 bottom-0 z-[100]">
      {/* Logo */}
      <div className="px-5 pt-6 pb-1 text-xl font-bold text-lime">
        &#x2B21; ECP Pay
      </div>
      <div className="px-5 pb-6 text-[11px] text-text-tertiary">
        Payment Service
      </div>

      {/* Nav items */}
      <div className="flex-1 flex flex-col gap-0.5 px-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3.5 py-2.5 rounded-control text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'text-lime bg-lime-dim'
                  : 'text-text-secondary hover:text-text-primary hover:bg-white/[0.04]'
              }`
            }
          >
            <item.icon className="w-5 h-5" />
            {item.label}
          </NavLink>
        ))}
      </div>

      {/* Footer — Provider indicator */}
      <div className="px-5 py-4 border-t border-border">
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <span
            className={`w-2 h-2 rounded-full ${
              mode === 'internal' ? 'bg-warning' : 'bg-lime'
            }`}
          />
          Provider: {mode.toUpperCase()}
        </div>
      </div>
    </nav>
  );
}
