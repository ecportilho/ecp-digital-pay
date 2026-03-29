/**
 * Format centavos to BRL currency string.
 * formatCurrency(123456) => "R$ 1.234,56"
 */
export function formatCurrency(centavos: number): string {
  const reais = centavos / 100;
  return reais.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

/**
 * Format ISO date string to Brazilian format.
 * formatDate("2026-03-29T14:30:00Z") => "29/03/2026 14:30"
 */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

/**
 * Format ISO date to relative time.
 * formatRelativeTime(now - 5min) => "ha 5 min"
 */
export function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSec < 60) return `ha ${diffSec}s`;
  if (diffMin < 60) return `ha ${diffMin} min`;
  if (diffHours < 24) return `ha ${diffHours}h`;
  if (diffDays < 30) return `ha ${diffDays}d`;
  return formatDate(iso);
}

/**
 * Truncate a UUID for display in tables.
 * truncateUuid("a1b2c3d4-e5f6-7890-abcd-ef1234567890") => "a1b2...7890"
 */
export function truncateUuid(uuid: string): string {
  if (!uuid || uuid.length < 8) return uuid;
  return `${uuid.slice(0, 4)}...${uuid.slice(-4)}`;
}

/**
 * Mask a CPF or CNPJ document for display.
 * maskDocument("12345678901") => "***456.78***"
 * maskDocument("12345678000100") => "**345/0001-**"
 */
export function maskDocument(doc: string): string {
  if (!doc) return '';
  const clean = doc.replace(/\D/g, '');
  if (clean.length === 11) {
    // CPF: show middle digits
    return `***.${clean.slice(3, 6)}.${clean.slice(6, 9)}-**`;
  }
  if (clean.length === 14) {
    // CNPJ: show middle part
    return `**.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8, 12)}-**`;
  }
  return doc;
}

/**
 * Format elapsed time between two ISO dates.
 */
export function formatElapsed(startIso: string, endIso: string): string {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  const diffMs = end - start;
  if (diffMs < 1000) return `${diffMs}ms`;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  const remSec = diffSec % 60;
  return `${diffMin}m ${remSec}s`;
}

/**
 * Abbreviate currency for chart axes.
 * abbreviateCurrency(150000) => "R$ 1.5k" (input in centavos)
 */
export function abbreviateCurrency(centavos: number): string {
  const reais = centavos / 100;
  if (reais >= 1_000_000) return `R$ ${(reais / 1_000_000).toFixed(1)}M`;
  if (reais >= 1_000) return `R$ ${(reais / 1_000).toFixed(1)}k`;
  return `R$ ${reais.toFixed(0)}`;
}
