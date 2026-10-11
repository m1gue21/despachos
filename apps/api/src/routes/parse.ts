import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireRole } from '../auth.js';
import { config } from '../config.js';
import { withUser } from '../db.js';
import { HttpError } from '../errors.js';
import { parseMessage } from '../parser/index.js';

// Límite simple por usuario: N análisis por minuto (en memoria).
const hits = new Map<string, number[]>();
function rateLimit(userId: string) {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= config.parseRatePerMinute) {
    throw new HttpError(429, 'rate_limited', 'Demasiados análisis seguidos; espera un momento');
  }
  recent.push(now);
  hits.set(userId, recent);
}

export default async function parseRoutes(app: FastifyInstance) {
  app.post('/parse', { preHandler: [requireAuth, requireRole('admin', 'operator')] }, async (req) => {
    const b = z
      .object({ raw_text: z.string().trim().min(3).max(2000), city_zone_id: z.string().uuid() })
      .parse(req.body);
    rateLimit(req.session.userId);
    const sectors = await withUser(req.session.userId, async (db) => {
      const ok = await db.query(`select can_manage_city($1) as ok`, [b.city_zone_id]);
      if (!ok.rows[0].ok) throw new HttpError(403, 'forbidden', 'No tienes acceso a esta ciudad');
      return (
        await db.query(`select slug, name, aliases from zones where parent_id = $1 and active order by name`, [
          b.city_zone_id,
        ])
      ).rows;
    });
    const { result, engine } = await parseMessage(b.raw_text, sectors, req.log);
    // Devuelve también los ids de sector para que el panel prellene directo.
    const bySlug = await withUser(req.session.userId, async (db) =>
      Object.fromEntries(
        (
          await db.query(`select slug, id from zones where slug = any($1)`, [
            [result.pickup_sector_slug, result.dropoff_sector_slug].filter(Boolean),
          ])
        ).rows.map((r) => [r.slug, r.id]),
      ),
    );
    return {
      ...result,
      engine,
      pickup_sector_id: result.pickup_sector_slug ? (bySlug[result.pickup_sector_slug] ?? null) : null,
      dropoff_sector_id: result.dropoff_sector_slug ? (bySlug[result.dropoff_sector_slug] ?? null) : null,
    };
  });
}
