import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { MobileNav } from './components/layout/MobileNav';
import { InternalBanner } from './components/layout/InternalBanner';

import LoginPage from './routes/login';
import DashboardPage from './routes/dashboard';
import TransactionsPage from './routes/transactions';
import TransactionDetailPage from './routes/transaction-detail';
import ProvidersPage from './routes/providers';
import WebhooksPage from './routes/webhooks';
import AppsPage from './routes/apps';
import SettingsPage from './routes/settings';

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/transactions': 'Transacoes',
  '/providers': 'Providers',
  '/webhooks': 'Webhooks',
  '/apps': 'Apps',
  '/settings': 'Configuracoes',
};

function ProtectedLayout() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="w-8 h-8 border-2 border-lime border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const basePath = '/' + (location.pathname.split('/')[1] || '');
  const title = pageTitles[basePath] || 'ECP Pay';

  // For transaction detail, show specific title
  const pageTitle = location.pathname.startsWith('/transactions/') && location.pathname !== '/transactions'
    ? 'Detalhe da Transacao'
    : title;

  return (
    <div className="flex min-h-screen">
      <div className="hidden lg:block">
        <Sidebar />
      </div>
      <div className="flex-1 lg:ml-60 flex flex-col min-h-screen">
        <Header title={pageTitle} />
        <InternalBanner />
        <main className="flex-1 p-7 overflow-y-auto pb-20 lg:pb-7">
          <Outlet />
        </main>
      </div>
      <MobileNav />
    </div>
  );
}

function PublicRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="w-8 h-8 border-2 border-lime border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<PublicRoute />}>
            <Route path="/login" element={<LoginPage />} />
          </Route>
          <Route element={<ProtectedLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/transactions/:id" element={<TransactionDetailPage />} />
            <Route path="/providers" element={<ProvidersPage />} />
            <Route path="/webhooks" element={<WebhooksPage />} />
            <Route path="/apps" element={<AppsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
