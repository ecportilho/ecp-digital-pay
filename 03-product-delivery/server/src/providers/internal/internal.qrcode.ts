/**
 * Local QR Code generator for Pix in INTERNAL mode.
 * Generates mock Pix QR code data (not a real Pix payload).
 */

export interface PixQrCodeData {
  qrCode: string;       // base64 encoded image (placeholder)
  qrCodeText: string;   // pix copia e cola text
}

/**
 * CRC16/CCITT-FALSE — padrão Bacen para BRCode.
 * Poly 0x1021, init 0xFFFF.
 */
function calculateCRC16(payload: string): string {
  let crc = 0xFFFF;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Generate a mock Pix EMV QR code payload.
 * Format follows the BR Code structure (mock), but CRC16 é real
 * para que scanners e parsers (bank copia-e-cola) aceitem o payload.
 */
export function generatePixQrCode(transactionId: string, amount: number): PixQrCodeData {
  const amountStr = (amount / 100).toFixed(2);
  const payloadWithoutCrc = [
    '00020126',                                       // Payload Format Indicator
    `580014BR.GOV.BCB.PIX0136${transactionId}`,       // Merchant Account (PIX key = txId)
    '52040000',                                       // Merchant Category Code
    '5303986',                                        // Transaction Currency (986 = BRL)
    `54${amountStr.length.toString().padStart(2, '0')}${amountStr}`, // Transaction Amount
    '5802BR',                                         // Country Code
    '6014Sao Paulo SP',                               // Merchant City
    `62${(4 + transactionId.length).toString().padStart(2, '0')}05${transactionId.length.toString().padStart(2, '0')}${transactionId}`, // Additional Data
  ].join('');

  // Campo 63 (CRC16) — padrão Bacen exige como último campo.
  // "6304" = ID do campo + length (4 chars hex); calcula CRC sobre todo o resto incluindo "6304".
  const withCrcPrefix = payloadWithoutCrc + '6304';
  const crc = calculateCRC16(withCrcPrefix);
  const qrCodeText = withCrcPrefix + crc;

  const qrCode = Buffer.from(`ECPPAY-PIX-QR:${qrCodeText}`).toString('base64');

  return { qrCode, qrCodeText };
}
