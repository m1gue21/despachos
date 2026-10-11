import type { FastifyBaseLogger } from 'fastify';
import { ownerPool } from './db.js';

// Procesos del sistema con la conexión de dueño.
export function startJobs(log: FastifyBaseLogger) {
  const expire = setInterval(async () => {
    try {
      const { rows } = await ownerPool.query<{ n: number }>('select expire_offers() as n');
      if (rows[0]!.n > 0) log.info(`${rows[0]!.n} oferta(s) vencida(s)`);
    } catch (err) {
      log.error({ err }, 'expire_offers falló');
    }
  }, 5_000);

  const purge = async () => {
    try {
      const { rows } = await ownerPool.query<{ n: number }>('select purge_location_history() as n');
      if (rows[0]!.n > 0) log.info(`historial de ubicación: ${rows[0]!.n} fila(s) borradas por retención`);
    } catch (err) {
      log.error({ err }, 'purge_location_history falló');
    }
  };
  void purge();
  const daily = setInterval(purge, 24 * 60 * 60 * 1000);

  return () => {
    clearInterval(expire);
    clearInterval(daily);
  };
}
