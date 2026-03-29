import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks/useFetch';
import { Card } from '../components/ui/Card';
import { Input, Select } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Table } from '../components/ui/Table';
import { TransactionStatusBadge, TransactionTypeBadge, ProviderBadge } from '../components/ui/Badge';
import { formatCurrency, formatDate, truncateUuid, maskDocument } from '../lib/formatters';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';

interface Transaction {
  id: string;
  source_app: string;
  type: string;
  amount: number;
  status: string;
  provider: string;
  customer_name: string;
  customer_document: string;
  created_at: string;
}

interface TransactionsResponse {
  transactions: Transaction[];
  total: number;
  page: number;
  limit: number;
}

export default function TransactionsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [appFilter, setAppFilter] = useState('');
  const limit = 15;

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(limit));
    if (typeFilter) params.set('type', typeFilter);
    if (statusFilter) params.set('status', statusFilter);
    if (appFilter) params.set('source_app', appFilter);
    if (search) params.set('search', search);
    return params.toString();
  }, [page, typeFilter, statusFilter, appFilter, search]);

  const { data, loading } = useFetch<TransactionsResponse>(`/admin/transactions?${queryParams}`);

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  return (
    <div className="space-y-5">
      {/* Filter bar */}
      <div className="flex items-end gap-3 flex-wrap">
        <Select
          label="App"
          options={[
            { value: '', label: 'Todos apps' },
            { value: 'ecp-bank', label: 'ecp-bank' },
            { value: 'ecp-emps', label: 'ecp-emps' },
            { value: 'ecp-food', label: 'ecp-food' },
          ]}
          value={appFilter}
          onChange={(e) => { setAppFilter(e.target.value); setPage(1); }}
          className="min-w-[140px]"
        />
        <Select
          label="Tipo"
          options={[
            { value: '', label: 'Todos tipos' },
            { value: 'pix', label: 'Pix' },
            { value: 'card', label: 'Cartao' },
            { value: 'boleto', label: 'Boleto' },
          ]}
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          className="min-w-[140px]"
        />
        <Select
          label="Status"
          options={[
            { value: '', label: 'Todos status' },
            { value: 'pending', label: 'Pendente' },
            { value: 'processing', label: 'Processando' },
            { value: 'completed', label: 'Concluida' },
            { value: 'failed', label: 'Falhou' },
            { value: 'refunded', label: 'Estornado' },
          ]}
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="min-w-[140px]"
        />
        <div className="flex-1 min-w-[200px]">
          <Input
            label="Buscar"
            placeholder="ID ou documento..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            iconLeft={<Search className="w-4 h-4" />}
          />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="skeleton h-12" />
          ))}
        </div>
      ) : (
        <>
          <Table
            columns={[
              {
                key: 'id',
                header: 'ID',
                render: (tx) => (
                  <span className="font-mono text-xs text-text-tertiary">{truncateUuid(tx.id)}</span>
                ),
              },
              { key: 'source_app', header: 'App', render: (tx) => tx.source_app },
              { key: 'type', header: 'Tipo', render: (tx) => <TransactionTypeBadge type={tx.type} /> },
              {
                key: 'amount',
                header: 'Valor',
                render: (tx) => <span className="text-text-primary font-medium">{formatCurrency(tx.amount)}</span>,
              },
              {
                key: 'customer',
                header: 'Cliente',
                render: (tx) => (
                  <div>
                    <div className="text-text-primary text-xs">{tx.customer_name}</div>
                    <div className="font-mono text-[11px] text-text-tertiary">{maskDocument(tx.customer_document)}</div>
                  </div>
                ),
              },
              { key: 'status', header: 'Status', render: (tx) => <TransactionStatusBadge status={tx.status} /> },
              { key: 'provider', header: 'Provider', render: (tx) => <ProviderBadge provider={tx.provider} /> },
              { key: 'created_at', header: 'Data', render: (tx) => formatDate(tx.created_at) },
            ]}
            data={data?.transactions || []}
            keyExtractor={(tx) => tx.id}
            onRowClick={(tx) => navigate(`/transactions/${tx.id}`)}
          />

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4">
            <span className="text-[13px] text-text-tertiary">
              {data?.total || 0} transacoes no total
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                icon={<ChevronLeft className="w-4 h-4" />}
              >
                Anterior
              </Button>
              <span className="flex items-center text-sm text-text-secondary px-2">
                {page} / {totalPages || 1}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                icon={<ChevronRight className="w-4 h-4" />}
              >
                Proxima
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
