import { useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks/useFetch';
import { Card, CardHeader } from '../components/ui/Card';
import { TransactionStatusBadge, TransactionTypeBadge } from '../components/ui/Badge';
import { Table } from '../components/ui/Table';
import { Button } from '../components/ui/Button';
import { formatCurrency, formatDate, truncateUuid, abbreviateCurrency } from '../lib/formatters';
import {
  DollarSign,
  TrendingUp,
  CheckCircle,
  Clock,
  CreditCard,
  Bell,
  ArrowRight,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, ReferenceLine,
} from 'recharts';

interface DashboardData {
  kpis: {
    total_volume: number;
    total_transactions: number;
    success_rate: number;
    revenue_per_hour: number;
    active_tokens: number;
    pending_webhooks: number;
  };
  volume_chart: { date: string; total: number }[];
  success_chart: { hour: string; rate: number }[];
  provider: { mode: string; active_since: string; tx_count: number };
  last_transactions: {
    id: string;
    source_app: string;
    type: string;
    amount: number;
    status: string;
    created_at: string;
  }[];
}

function KPICard({ label, value, icon, sub }: { label: string; value: string; icon: React.ReactNode; sub?: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between mb-1.5">
        <span className="text-xs text-text-tertiary uppercase tracking-wide font-medium">{label}</span>
        <span className="text-text-tertiary">{icon}</span>
      </div>
      <div className="text-2xl font-bold text-text-primary">{value}</div>
      {sub && <div className="text-xs text-text-tertiary mt-1">{sub}</div>}
    </Card>
  );
}

const chartTooltipStyle = {
  backgroundColor: '#131c28',
  border: '1px solid #27364a',
  borderRadius: '8px',
  color: '#eaf2ff',
  fontSize: '12px',
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const { data, loading } = useFetch<DashboardData>('/admin/dashboard');

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skeleton h-24" />
          ))}
        </div>
        <div className="skeleton h-64" />
      </div>
    );
  }

  const { kpis, volume_chart, success_chart, provider, last_transactions } = data;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <KPICard
          label="Volume total"
          value={formatCurrency(kpis.total_volume)}
          icon={<DollarSign className="w-4 h-4" />}
        />
        <KPICard
          label="Transacoes"
          value={kpis.total_transactions.toLocaleString('pt-BR')}
          icon={<TrendingUp className="w-4 h-4" />}
        />
        <KPICard
          label="Taxa de sucesso"
          value={`${kpis.success_rate.toFixed(1)}%`}
          icon={<CheckCircle className="w-4 h-4" />}
        />
        <KPICard
          label="Receita por hora"
          value={formatCurrency(kpis.revenue_per_hour)}
          icon={<Clock className="w-4 h-4" />}
        />
        <KPICard
          label="Tokens ativos"
          value={String(kpis.active_tokens)}
          icon={<CreditCard className="w-4 h-4" />}
        />
        <KPICard
          label="Webhooks pendentes"
          value={String(kpis.pending_webhooks)}
          icon={<Bell className="w-4 h-4" />}
        />
      </div>

      {/* Provider status */}
      <Card className="border-l-[3px] border-l-lime">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <span className={`w-2.5 h-2.5 rounded-full ${provider.mode === 'internal' ? 'bg-warning' : 'bg-lime'}`} />
            <span className="text-base font-semibold">
              Provider: {provider.mode.toUpperCase()}
            </span>
          </div>
          <Button variant="secondary" size="sm" onClick={() => navigate('/providers')}>
            Gerenciar
          </Button>
        </div>
        <div className="flex gap-6 text-[13px] text-text-secondary">
          <span>Ativo desde: {provider.active_since ? formatDate(provider.active_since) : '-'}</span>
          <span>Transacoes no modo atual: {provider.tx_count}</span>
        </div>
      </Card>

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Volume chart */}
        <Card>
          <CardHeader title="Volume transacionado" subtitle="Ultimos 30 dias" />
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={volume_chart || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(28,40,54,0.5)" />
                <XAxis dataKey="date" tick={{ fill: '#7b8aa3', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#7b8aa3', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => abbreviateCurrency(v)} />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                <Line type="monotone" dataKey="total" stroke="#b7ff2a" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Success rate chart */}
        <Card>
          <CardHeader title="Taxa de sucesso" subtitle="Ultimas 24h" />
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={success_chart || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(28,40,54,0.5)" />
                <XAxis dataKey="hour" tick={{ fill: '#7b8aa3', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: '#7b8aa3', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => `${v.toFixed(1)}%`} />
                <ReferenceLine y={95} stroke="#ffcc00" strokeDasharray="3 3" label={{ value: '95% meta', fill: '#ffcc00', fontSize: 10, position: 'right' }} />
                <Bar dataKey="rate" radius={[4, 4, 0, 0]} fill="#3dff8b" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Last transactions */}
      <Card>
        <CardHeader
          title="Ultimas transacoes"
          action={
            <Button variant="ghost" size="sm" icon={<ArrowRight className="w-3.5 h-3.5" />} onClick={() => navigate('/transactions')}>
              Ver todas
            </Button>
          }
        />
        <Table
          columns={[
            {
              key: 'id',
              header: 'ID',
              render: (tx) => <span className="font-mono text-xs text-text-tertiary">{truncateUuid(tx.id)}</span>,
            },
            { key: 'source_app', header: 'App', render: (tx) => tx.source_app },
            { key: 'type', header: 'Tipo', render: (tx) => <TransactionTypeBadge type={tx.type} /> },
            { key: 'amount', header: 'Valor', render: (tx) => formatCurrency(tx.amount) },
            { key: 'status', header: 'Status', render: (tx) => <TransactionStatusBadge status={tx.status} /> },
            { key: 'created_at', header: 'Data', render: (tx) => formatDate(tx.created_at) },
          ]}
          data={last_transactions || []}
          keyExtractor={(tx) => tx.id}
          onRowClick={(tx) => navigate(`/transactions/${tx.id}`)}
        />
      </Card>
    </div>
  );
}
