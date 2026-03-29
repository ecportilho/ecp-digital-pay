/**
 * Local boleto generator for INTERNAL mode.
 * Generates mock barcode and digitable line.
 */

export interface BoletoData {
  barcode: string;        // 44 digit barcode
  digitableLine: string;  // formatted digitable line
}

/**
 * Generate a mock FEBRABAN-format boleto.
 * Barcode: 44 digits. Digitable line: formatted with dots and spaces.
 */
export function generateBoleto(transactionId: string, amount: number, dueDate: string): BoletoData {
  const amountStr = amount.toString().padStart(10, '0');

  // Mock 44-digit barcode: bank(3) + currency(1) + check(1) + dueDate(4) + amount(10) + free(25)
  // Simplified mock: use fixed bank code + amount
  const hashPart = transactionId.replace(/-/g, '').slice(0, 25);
  const barcode = `0019${amountStr.slice(0, 1)}${hashPart}${amountStr}`.slice(0, 44).padEnd(44, '0');

  // Digitable line format: XXXXX.XXXXX XXXXX.XXXXXX XXXXX.XXXXXX X YYYYYYYYYYYY
  // Where Y = expiration factor + amount
  const field1 = `${barcode.slice(0, 5)}.${barcode.slice(5, 10)}`;
  const field2 = `${barcode.slice(10, 15)}.${barcode.slice(15, 21)}`;
  const field3 = `${barcode.slice(21, 26)}.${barcode.slice(26, 32)}`;
  const checkDigit = '0';
  const digitableLine = `${field1} ${field2} ${field3} ${checkDigit} ${amountStr}`;

  return { barcode, digitableLine };
}
