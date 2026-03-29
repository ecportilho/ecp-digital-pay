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
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';

interface DashboardData {
  total_volume: number;
  total_transactions: number;
  completed_transactions: number;
  failed_transactions: number;
  success_rate: number;
  today: { volume: number; count: number };
  by_type: { type: string; count: number; volume: number }[];
  by_app: { source_app: string; count: number; volume: number }[];
  by_status: { status: string; count: number }[];
  recent_transactions: {
    id: string;
    source_app: string;
    type: string;
    amount: number;
    status: string;
    customer_name: string;
    created_at: string;
  }[];
  provider: { name: string; mode: string };
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

const TYPE_COLORS: Record<string, string> = {
  pix: '#b7ff2a',
  card: '#4da3ff',
  boleto: '#ffcc00',
};

const APP_COLORS = ['#b7ff2a', '#4da3ff', '#ffcc00', '#3dff8b', '#ff4d4d'];

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

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <KPICard
          label="Volume total"
          value={formatCurrency(data.total_volume)}
          icon={<DollarSign className="w-4 h-4" />}
        />
        <KPICard
          label="Transações"
          value={data.total_transactions.toLocaleString('pt-BR')}
          icon={<TrendingUp className="w-4 h-4" />}
        />
        <KPICard
          label="Taxa de sucesso"
          value={`${data.success_rate.toFixed(1)}%`}
          icon={<CheckCircle className="w-4 h-4" />}
        />
        <KPICard
          label="Hoje"
          value={formatCurrency(data.today.volume)}
          sub={`${data.today.count} transações`}
          icon={<Clock className="w-4 h-4" />}
        />
        <KPICard
          label="Completadas"
          value={String(data.completed_transactions)}
          icon={<CreditCard className="w-4 h-4" />}
        />
        <KPICard
          label="Falharam"
          value={String(data.failed_transactions)}
          icon={<AlertTriangle className="w-4 h-4" />}
        />
      </div>

      {/* Provider status */}
      <Card className="border-l-[3px] border-l-lime">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className={`w-2.5 h-2.5 rounded-full ${data.provider.mode === 'internal' ? 'bg-warning' : 'bg-lime'}`} />
            <span className="text-base font-semibold">
              Provider: {data.provider.mode.toUpperCase()}
            </span>
          </div>
          <Button variant="secondary" size="sm" onClick={() => navigate('/providers')}>
            Gerenciar
          </Button>
        </div>
      </Card>

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Volume by app */}
        <Card>
          <CardHeader title="Volume por app" subtitle="Distribuição do ecossistema" />
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.by_app} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(28,40,54,0.5)" />
                <XAxis type="number" tick={{ fill: '#7b8aa3', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => abbreviateCurrency(v)} />
                <YAxis type="category" dataKey="source_app" tick={{ fill: '#a9b7cc', fontSize: 12 }} axisLine={false} tickLine={false} width={80} />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="volume" radius={[0, 4, 4, 0]}>
                  {data.by_app.map((_, i) => (
                    <Cell key={i} fill={APP_COLORS[i % APP_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Distribution by type (donut) */}
        <Card>
          <CardHeader title="Distribuição por tipo" subtitle="Pix / Cartão / Boleto" />
          <div className="h-64 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.by_type}
                  dataKey="count"
                  nameKey="type"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  innerRadius={55}
                  paddingAngle={3}
                  label={({ type, count }) => `${type} (${count})`}
                >
                  {data.by_type.map((entry) => (
                    <Cell key={entry.type} fill={TYPE_COLORS[entry.type] || '#7b8aa3'} />
                  ))}
                </Pie>
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number, name: string) => [`${v} transações`, name]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-6 mt-2">
            {data.by_type.map((t) => (
              <div key={t.type} className="flex items-center gap-2 text-xs text-text-secondary">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: TYPE_COLORS[t.type] || '#7b8aa3' }} />
                {t.type} — {formatCurrency(t.volume)}
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Last transactions */}
      <Card>
        <CardHeader
          title="Últimas transações"
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
            { key: 'customer_name', header: 'Cliente', render: (tx) => tx.customer_name },
            { key: 'status', header: 'Status', render: (tx) => <TransactionStatusBadge status={tx.status} /> },
            { key: 'created_at', header: 'Data', render: (tx) => formatDate(tx.created_at) },
          ]}
          data={data.recent_transactions || []}
          keyExtractor={(tx) => tx.id}
          onRowClick={(tx) => navigate(`/transactions/${tx.id}`)}
        />
      </Card>
    </div>
  );
}
