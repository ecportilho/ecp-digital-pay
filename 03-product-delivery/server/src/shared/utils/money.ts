/**
 * Format an amount in centavos to BRL string.
 * Example: 15050 -> "R$ 150,50"
 */
export function formatBRL(centavos: number): string {
  const reais = centavos / 100;
  return reais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Convert reais (float) to centavos (integer).
 * WARNING: Only use for display inputs. Internal values must ALWAYS be centavos.
 */
export function reaisToCentavos(reais: number): number {
  return Math.round(reais * 100);
}

/**
 * Validate that an amount in centavos is a positive integer.
 */
export function isValidAmount(centavos: number): boolean {
  return Number.isInteger(centavos) && centavos > 0;
}
