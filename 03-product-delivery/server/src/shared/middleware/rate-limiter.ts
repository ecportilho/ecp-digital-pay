import type { FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '../errors/app-error.js';
import { ErrorCode } from '../errors/error-codes.js';

/**
 * Simple in-memory rate limiter per app.
 * Limit: 100 transactions/minute per app (configurable).
 */
const windowMs = 60_000; // 1 minute
const maxRequests = 100;

const counters = new Map<string, { count: number; resetAt: number }>();

export async function rateLimiter(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const appName = request.sourceApp?.app_name || request.ip;
  const now = Date.now();

  let entry = counters.get(appName);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    counters.set(appName, entry);
  }

  entry.count++;

  reply.header('X-RateLimit-Limit', maxRequests);
  reply.header('X-RateLimit-Remaining', Math.max(0, maxRequests - entry.count));
  reply.header('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000));

  if (entry.count > maxRequests) {
    throw new AppError(429, ErrorCode.RATE_LIMIT_EXCEEDED, 'Rate limit exceeded. Max 100 requests per minute per app.');
  }
}
