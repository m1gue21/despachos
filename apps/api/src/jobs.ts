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

  // Alertas de señal perdida: abre, actualiza y cierra según el estado de
  // cada conductor con ubicación obligatoria que esté en turno.
  const alerts = setInterval(async () => {
    try {
      const { rows } = await ownerPool.query<{ n: number }>('select refresh_tracking_alerts() as n');
      if (rows[0]!.n > 0) log.info(`${rows[0]!.n} alerta(s) de señal nueva(s)`);
    } catch (err) {
      log.error({ err }, 'refresh_tracking_alerts falló');
    }
  }, 15_000);

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
    clearInterval(alerts);
    clearInterval(daily);
  };
}
