import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDb } from '../../database/connection.js';
import { AppError } from '../../shared/errors/app-error.js';
import { ErrorCode } from '../../shared/errors/error-codes.js';
import { auditLog } from '../../shared/utils/audit.js';
import { adminAuth } from '../../shared/middleware/admin-auth.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const JWT_SECRET = process.env.JWT_SECRET || 'ecp-pay-admin-secret-mude-em-producao';
const JWT_EXPIRES_IN = '24h';

/**
 * Admin authentication routes.
 * Login does NOT require admin-auth middleware (it issues tokens).
 * /auth/me requires admin-auth.
 */
export async function adminAuthRoutes(app: FastifyInstance): Promise<void> {
  // POST /admin/auth/login
  app.post('/auth/login', async (request, reply) => {
    const { email, password } = loginSchema.parse(request.body);
    const db = getDb();

    // Find admin user by email
    const user = db.prepare(
      'SELECT id, name, email, password, role, is_active FROM admin_users WHERE email = ?'
    ).get(email) as { id: string; name: string; email: string; password: string; role: string; is_active: number } | undefined;

    if (!user) {
      throw new AppError(401, ErrorCode.ADMIN_INVALID_CREDENTIALS, 'Invalid email or password');
    }

    if (!user.is_active) {
      throw new AppError(403, ErrorCode.ADMIN_INACTIVE, 'Admin account is inactive');
    }

    // Verify bcrypt password
    const passwordMatch = bcrypt.compareSync(password, user.password);
    if (!passwordMatch) {
      throw new AppError(401, ErrorCode.ADMIN_INVALID_CREDENTIALS, 'Invalid email or password');
    }

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN },
    );

    // Update last_login_at
    db.prepare(
      `UPDATE admin_users SET last_login_at = datetime('now') WHERE id = ?`
    ).run(user.id);

    auditLog({
      userId: user.id,
      action: 'ADMIN_LOGIN',
      resource: 'admin_user',
      resourceId: user.id,
      ipAddress: request.ip,
    });

    return reply.send({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  });

  // GET /admin/auth/me — requires JWT
  app.get('/auth/me', { preHandler: adminAuth }, async (request, reply) => {
    return reply.send({ user: request.adminUser });
  });
}
