import { randomUUID } from 'node:crypto';

/**
 * Generate a UUID v4 string.
 */
export function generateUUID(): string {
  return randomUUID();
}
