import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDb } from '../../database/connection.js';
import { settleTransaction } from '../../providers/internal/internal.scheduler.js';

/**
 * Rotas internas — usadas por outros apps do ecossistema ECP (ex.: bank)
 * para notificar o ecp-pay de eventos que aconteceram fora.
 *
 * Autenticação por API key (mesmo esquema do resto do /pay).
 */

const PixSettledSchema = z.object({
  pix_key: z.string().min(1).max(128),
  amount_cents: z.number().int().positive(),
  bank_transaction_id: z.string().min(1).max(128).optional(),
});

export const internalRoutes: FastifyPluginAsync = async (app) => {
  /**
   * POST /pay/internal/pix-settled
   *
   * Chamado pelo bank quando um Pix cai na conta de uma plataforma ECP
   * (ex.: foodflow@ecportilho.com recebe Pix do consumer que pagou via
   * copia-e-cola).
   *
   * Busca transaction Pix pendente que bate com pix_key+amount e a settla.
   * Dispara o callback do source_app (food) como efeito colateral.
   *
   * Idempotente: chamar 2x não duplica.
   */
  app.post('/internal/pix-settled', async (request, reply) => {
    const parsed = PixSettledSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'pix_key e amount_cents obrigatórios' },
      });
    }
    const { pix_key, amount_cents, bank_transaction_id } = parsed.data;
    const db = getDb();

    // Busca transaction Pix pendente: o BRCode armazena a pixKey no campo
    // 01 do merchant account info, que é derivado de customer_document na
    // geração (internal.qrcode.ts). Então match por customer_document.
    const tx = db.prepare(
      `SELECT id, amount, status FROM transactions
       WHERE type = 'pix'
         AND status = 'pending'
         AND customer_document = ?
         AND amount = ?
       ORDER BY created_at DESC
       LIMIT 1`
    ).get(pix_key, amount_cents) as { id: string; amount: number; status: string } | undefined;

    if (!tx) {
      request.log.warn({ pix_key, amount_cents, bank_transaction_id }, '[pix-settled] Transaction pendente não encontrada');
      return reply.code(404).send({
        success: false,
        error: { code: 'TRANSACTION_NOT_FOUND', message: 'Pix charge não encontrada ou já confirmada' },
      });
    }

    // Persiste referência ao bank_transaction_id (rastreabilidade)
    if (bank_transaction_id) {
      db.prepare(
        'UPDATE transactions SET metadata = json_patch(COALESCE(metadata, "{}"), ?) WHERE id = ?'
      ).run(JSON.stringify({ bank_transaction_id }), tx.id);
    }

    // skipBankDebit=true: o bank já fez o débito via copia-e-cola
    const settled = settleTransaction(tx.id, { skipBankDebit: true });

    if (!settled) {
      return reply.code(409).send({
        success: false,
        error: { code: 'ALREADY_PROCESSED', message: 'Transaction já processada' },
      });
    }

    request.log.info({ tx_id: tx.id, pix_key, amount_cents }, '[pix-settled] Pix confirmado via notificação externa');

    return reply.send({
      success: true,
      data: { transaction_id: tx.id, status: 'completed' },
    });
  });
};
