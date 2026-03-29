/**
 * Local QR Code generator for Pix in INTERNAL mode.
 * Generates mock Pix QR code data (not a real Pix payload).
 */

export interface PixQrCodeData {
  qrCode: string;       // base64 encoded image (placeholder)
  qrCodeText: string;   // pix copia e cola text
}

/**
 * Generate a mock Pix EMV QR code payload.
 * Format follows the simplified BR Code structure (mock).
 */
export function generatePixQrCode(transactionId: string, amount: number): PixQrCodeData {
  // Mock EMV-style Pix payload
  const amountStr = (amount / 100).toFixed(2);
  const qrCodeText = [
    '00020126',                                       // Payload Format Indicator
    `580014BR.GOV.BCB.PIX0136${transactionId}`,       // Merchant Account (PIX key = txId)
    '52040000',                                       // Merchant Category Code
    '5303986',                                        // Transaction Currency (986 = BRL)
    `54${amountStr.length.toString().padStart(2, '0')}${amountStr}`, // Transaction Amount
    '5802BR',                                         // Country Code
    '6014Sao Paulo SP',                               // Merchant City
    `62${(4 + transactionId.length).toString().padStart(2, '0')}05${transactionId.length.toString().padStart(2, '0')}${transactionId}`, // Additional Data
  ].join('');

  // Generate a simple base64 placeholder (in real implementation, this would be an actual QR image)
  const qrCode = Buffer.from(`ECPPAY-PIX-QR:${qrCodeText}`).toString('base64');

  return { qrCode, qrCodeText };
}
