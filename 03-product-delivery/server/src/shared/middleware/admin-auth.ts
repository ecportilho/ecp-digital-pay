import type { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { AppError } from '../errors/app-error.js';
import { ErrorCode } from '../errors/error-codes.js';

interface AdminTokenPayload {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'operator' | 'viewer';
}

const JWT_SECRET = process.env.JWT_SECRET || 'ecp-pay-admin-secret-mude-em-producao';

/**
 * Middleware that authenticates admin users via JWT Bearer token.
 * Checks Authorization header.
 * Sets request.adminUser with the decoded token payload.
 */
export async function adminAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError(401, ErrorCode.ADMIN_AUTH_REQUIRED, 'Authorization: Bearer <token> header is required');
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, JWT_SECRET) as AdminTokenPayload;

    request.adminUser = {
      id: payload.id,
      name: payload.name,
      email: payload.email,
      role: payload.role,
    };
  } catch (error: unknown) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError(401, ErrorCode.ADMIN_TOKEN_EXPIRED, 'Admin token has expired');
    }
    throw new AppError(401, ErrorCode.ADMIN_TOKEN_INVALID, 'Invalid admin token');
  }
}

/**
 * Factory for role-based authorization.
 * Use after adminAuth middleware.
 */
export function requireRole(...allowedRoles: Array<'admin' | 'operator' | 'viewer'>) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.adminUser) {
      throw new AppError(401, ErrorCode.ADMIN_AUTH_REQUIRED, 'Admin authentication required');
    }

    if (!allowedRoles.includes(request.adminUser.role)) {
      throw new AppError(403, ErrorCode.ADMIN_INSUFFICIENT_ROLE, `Role '${request.adminUser.role}' is not authorized for this action`);
    }
  };
}
