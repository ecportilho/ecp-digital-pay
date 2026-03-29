import type { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '../errors/app-error.js';
import { ErrorCode } from '../errors/error-codes.js';
import { ZodError } from 'zod';

/**
 * Global Fastify error handler.
 * Catches AppError, ZodError, and unknown errors.
 * Returns structured JSON response.
 */
export function errorHandler(error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply): void {
  // AppError — known application errors
  if (error instanceof AppError) {
    reply.status(error.statusCode).send(error.toJSON());
    return;
  }

  // ZodError — validation errors
  if (error instanceof ZodError) {
    reply.status(400).send({
      status: 'error',
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Validation failed',
      details: error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  // Fastify validation errors
  if ('validation' in error && error.validation) {
    reply.status(400).send({
      status: 'error',
      code: ErrorCode.VALIDATION_ERROR,
      message: error.message,
    });
    return;
  }

  // Unknown errors
  console.error('[error-handler] Unhandled error:', error);

  reply.status(500).send({
    status: 'error',
    code: ErrorCode.INTERNAL_ERROR,
    message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
  });
}
