import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import { verifyToken } from './auth.js';
import { config } from './config.js';
import { appPool, ownerPool, withUser } from './db.js';
import { pushEnabled } from './push.js';
import { errorHandler } from './errors.js';
import { startJobs } from './jobs.js';
import { addClient, startListener } from './realtime.js';
import authRoutes from './routes/auth.js';
import catalogRoutes from './routes/catalog.js';
import driverAppRoutes from './routes/driver-app.js';
import driverRoutes from './routes/drivers.js';
import metricsRoutes from './routes/metrics.js';
import parseRoutes from './routes/parse.js';
import requestRoutes from './routes/requests.js';
import trackingRoutes from './routes/tracking.js';

export async function buildServer() {
  const app = Fastify({
    // Detrás de un proxy (producción), req.ip debe ser la IP real del cliente.
    trustProxy: config.production,
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      // Nunca loguear el cuerpo ni el header de autorización.
      redact: ['req.headers.authorization'],
    },
  });

  app.setErrorHandler(errorHandler);
  // La app móvil no manda Origin; el panel sí.
  await app.register(cors, { origin: config.production ? config.corsOrigins : true });
  await app.register(websocket);

  app.get('/health', async () => {
    await ownerPool.query('select 1');
    return { ok: true, parser: config.anthropicKey && config.anthropicModel ? 'llm' : 'rules', push: pushEnabled ? 'fcm' : 'off' };
  });

  // WebSocket: /ws?token=<jwt>. Solo avisos (ids); los datos se piden por HTTP.
  app.get('/ws', { websocket: true }, async (socket, req) => {
    const token = (req.query as { token?: string }).token;
    try {
      if (!token) throw new Error('sin token');
      const session = await verifyToken(token);
      const { cities, driverId } = await withUser(session.userId, async (db) => ({
        cities: (await db.query(`select id from my_cities()`)).rows.map((r) => r.id as string),
        driverId: ((await db.query(`select my_driver_id() as id`)).rows[0]?.id as string | null) ?? null,
      }));
      addClient({ socket, session, cities: new Set(cities), driverId });
    } catch {
      socket.close(4401, 'unauthorized');
    }
  });

  await app.register(authRoutes);
  await app.register(catalogRoutes);
  await app.register(requestRoutes);
  await app.register(driverRoutes);
  await app.register(driverAppRoutes);
  await app.register(parseRoutes);
  await app.register(metricsRoutes);
  await app.register(trackingRoutes);

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = await buildServer();
  const stopListener = startListener(app.log);
  const stopJobs = startJobs(app.log);
  const shutdown = async () => {
    stopJobs();
    await stopListener();
    await app.close();
    await Promise.all([appPool.end(), ownerPool.end()]);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  await app.listen({ port: config.port, host: config.host });
}
