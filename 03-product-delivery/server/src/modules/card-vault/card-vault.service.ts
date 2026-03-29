/**
 * Card Vault service — manages tokenized card storage.
 */

import { getDb } from '../../database/connection.js';
import { generateUUID } from '../../shared/utils/uuid.js';
import { AppError } from '../../shared/errors/app-error.js';
import { ErrorCode } from '../../shared/errors/error-codes.js';
import { auditLog } from '../../shared/utils/audit.js';

export interface CardTokenInfo {
  id: string;
  last4: string;
  brand: string;
  holder_name: string;
  expiry_month: number;
  expiry_year: number;
  source_app: string;
  created_at: string;
}

export async function listCardsByCustomer(customerDocument: string): Promise<CardTokenInfo[]> {
  const db = getDb();
  const rows = db.prepare(
    `SELECT id, last4, brand, holder_name, expiry_month, expiry_year, source_app, created_at
     FROM card_tokens
     WHERE customer_document = ? AND is_active = 1 AND deleted_at IS NULL`
  ).all(customerDocument) as CardTokenInfo[];

  return rows;
}

export async function deleteCardToken(tokenId: string): Promise<void> {
  const db = getDb();

  const token = db.prepare(
    'SELECT id, is_active FROM card_tokens WHERE id = ?'
  ).get(tokenId) as { id: string; is_active: number } | undefined;

  if (!token) {
    throw new AppError(404, ErrorCode.CARD_TOKEN_NOT_FOUND, 'Card token not found');
  }

  if (!token.is_active) {
    throw new AppError(400, ErrorCode.CARD_TOKEN_INACTIVE, 'Card token is already inactive');
  }

  // Soft delete (RN-11)
  db.prepare(
    `UPDATE card_tokens SET is_active = 0, deleted_at = datetime('now') WHERE id = ?`
  ).run(tokenId);

  auditLog({
    action: 'DELETE_CARD_TOKEN',
    resource: 'card_token',
    resourceId: tokenId,
  });
}

export async function saveToken(
  customerDocument: string,
  provider: string,
  token: string,
  last4: string,
  brand: string,
  holderName: string,
  expiryMonth: number,
  expiryYear: number,
  sourceApp: string,
): Promise<string> {
  const db = getDb();
  const id = generateUUID();

  db.prepare(`
    INSERT INTO card_tokens (id, customer_document, provider, token, last4, brand, holder_name, expiry_month, expiry_year, is_active, source_app)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `).run(id, customerDocument, provider, token, last4, brand, holderName, expiryMonth, expiryYear, sourceApp);

  auditLog({
    action: 'SAVE_CARD_TOKEN',
    resource: 'card_token',
    resourceId: id,
    metadata: { last4, brand, source_app: sourceApp },
  });

  return id;
}
