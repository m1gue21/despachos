// Enlaces de seguimiento: crear (operador o conductor asignado) y ver (público).
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import { withUser } from '../db.js';
import { HttpError } from '../errors.js';

// Límite por IP para la ruta pública (en memoria, una instancia).
const hits = new Map<string, number[]>();
function rateLimit(ip: string, perMinute = 60) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= perMinute) throw new HttpError(429, 'rate_limited', 'Demasiadas consultas; espera un momento');
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 10_000) hits.clear();
}

export default async function trackingRoutes(app: FastifyInstance) {
  app.post('/requests/:id/tracking-link', { preHandler: requireAuth }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return withUser(req.session.userId, async (db) => {
      const { rows } = await db.query<{ token: string; expires_at: string }>(`select * from create_tracking_link($1)`, [id]);
      return { token: rows[0]!.token, expires_at: rows[0]!.expires_at, path: `/seguimiento/${rows[0]!.token}` };
    });
  });

  // Público: sin sesión. Solo datos del servicio, nunca del cliente.
  app.get('/track/:token', async (req) => {
    rateLimit(req.ip);
    const { token } = z.object({ token: z.string().min(1).max(64) }).parse(req.params);
    const data = await withUser(null, async (db) => (await db.query(`select public_tracking($1) as t`, [token])).rows[0]?.t);
    if (!data) throw new HttpError(404, 'not_found', 'Este enlace de seguimiento venció o no existe');
    return data;
  });

  // Público: el cliente califica con el token del enlace.
  app.post('/track/:token/rating', async (req) => {
    rateLimit(req.ip, 10);
    const { token } = z.object({ token: z.string().min(1).max(64) }).parse(req.params);
    const b = z
      .object({
        stars: z.number().int().min(1).max(5),
        tags: z.array(z.string().max(40)).max(8).default([]),
        comment: z.string().trim().max(500).nullish(),
      })
      .parse(req.body);
    await withUser(null, (db) => db.query(`select submit_rating($1, $2, $3, $4)`, [token, b.stars, b.tags, b.comment ?? null]));
    return { ok: true };
  });
}
