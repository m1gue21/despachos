import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const APP_ERROR_STATUS: Record<string, number> = {
  forbidden: 403,
  not_found: 404,
  invalid_transition: 409,
  driver_unavailable: 409,
  bad_payload: 400,
};

// Traduce errores de Postgres, Zod y propios a { error: { code, message } }.
export function errorHandler(err: FastifyError | Error, req: FastifyRequest, reply: FastifyReply) {
  if (err instanceof HttpError) {
    return reply.status(err.status).send({ error: { code: err.code, message: err.message } });
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return reply.status(400).send({
      error: { code: 'bad_payload', message: first ? `${first.path.join('.')}: ${first.message}` : 'Datos inválidos' },
    });
  }
  const pgErr = err as { code?: string; hint?: string; message: string };
  if (pgErr.code === 'P0001' && pgErr.hint && pgErr.hint in APP_ERROR_STATUS) {
    return reply.status(APP_ERROR_STATUS[pgErr.hint]!).send({ error: { code: pgErr.hint, message: pgErr.message } });
  }
  if (pgErr.code === '42501') {
    return reply.status(403).send({ error: { code: 'forbidden', message: 'No tienes permiso para esto' } });
  }
  if (pgErr.code === '23514' || pgErr.code === '22P02' || pgErr.code === '23502') {
    return reply.status(400).send({ error: { code: 'bad_payload', message: pgErr.message } });
  }
  if (pgErr.code === '23505') {
    return reply.status(409).send({ error: { code: 'conflict', message: 'Ya existe un registro con esos datos' } });
  }
  const status = (err as FastifyError).statusCode;
  if (status && status < 500) {
    return reply.status(status).send({ error: { code: 'bad_request', message: err.message } });
  }
  req.log.error(err);
  return reply.status(500).send({ error: { code: 'internal', message: 'Error interno' } });
}
