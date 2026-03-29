import { getDb } from '../../database/connection.js';
import { generateUUID } from './uuid.js';

export interface AuditLogEntry {
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

/**
 * Insert an audit log entry into the database.
 */
export function auditLog(entry: AuditLogEntry): void {
  const db = getDb();

  db.prepare(`
    INSERT INTO audit_logs (id, user_id, action, resource, resource_id, metadata, ip_address)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    generateUUID(),
    entry.userId ?? null,
    entry.action,
    entry.resource,
    entry.resourceId ?? null,
    entry.metadata ? JSON.stringify(entry.metadata) : null,
    entry.ipAddress ?? null,
  );
}
