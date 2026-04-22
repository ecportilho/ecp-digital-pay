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
 * Helper TLV (Type-Length-Value) do padrão EMV: id (2) + length (2) + value.
 * length é decimal zero-padded. Evita bug de length hardcoded errado.
 */
function tlv(id: string, value: string): string {
  return id + value.length.toString().padStart(2, '0') + value;
}

/**
 * Generate a Pix EMV QR code payload com CRC16 real (padrão Bacen).
 * Cada campo tem length calculado automaticamente via tlv().
 */
export function generatePixQrCode(transactionId: string, amount: number): PixQrCodeData {
  const amountStr = (amount / 100).toFixed(2);

  // Merchant Account Info (campo 26) contém sub-TLVs
  const merchantAccount = tlv('00', 'BR.GOV.BCB.PIX') + tlv('01', transactionId);
  // Additional Data (campo 62) contém sub-TLV com txid (05)
  const additionalData = tlv('05', transactionId);

  const payloadWithoutCrc =
    tlv('00', '01') +            // Payload Format Indicator
    tlv('01', '11') +            // Point of Initiation (11 = estático — mas como tem valor fixo, seria 12; mantemos 11 por compat mock)
    tlv('26', merchantAccount) + // Merchant Account Info
    tlv('52', '0000') +          // Merchant Category Code
    tlv('53', '986') +           // Transaction Currency (986 = BRL)
    tlv('54', amountStr) +       // Transaction Amount
    tlv('58', 'BR') +            // Country Code
    tlv('60', 'Sao Paulo SP') +  // Merchant City (length 12, calculado)
    tlv('62', additionalData);   // Additional Data

  // Campo 63 (CRC16) — padrão Bacen exige como último campo.
  // CRC calculado sobre o payload inteiro + "6304" (ID/length do próprio CRC).
  const withCrcPrefix = payloadWithoutCrc + '6304';
  const crc = calculateCRC16(withCrcPrefix);
  const qrCodeText = withCrcPrefix + crc;

  const qrCode = Buffer.from(`ECPPAY-PIX-QR:${qrCodeText}`).toString('base64');

  return { qrCode, qrCodeText };
}
