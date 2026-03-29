import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  Plug,
  Bell,
  Settings,
} from 'lucide-react';

const items = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/transactions', icon: FileText, label: 'Transacoes' },
  { to: '/providers', icon: Plug, label: 'Providers' },
  { to: '/webhooks', icon: Bell, label: 'Webhooks' },
  { to: '/settings', icon: Settings, label: 'Config' },
];

export function MobileNav() {
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-secondary-bg border-t border-border z-[100] flex justify-around py-2">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] ${
              isActive ? 'text-lime' : 'text-text-tertiary'
            }`
          }
        >
          <item.icon className="w-5 h-5" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
