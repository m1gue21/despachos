// Métricas simples, todas calculadas desde request_events (spec §9.7).
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireRole } from '../auth.js';
import { withUser } from '../db.js';

const TZ = 'America/Bogota';

export default async function metricsRoutes(app: FastifyInstance) {
  app.get('/metrics', { preHandler: [requireAuth, requireRole('admin', 'operator')] }, async (req) => {
    const q = z.object({ city: z.string().uuid(), days: z.coerce.number().int().min(1).max(90).default(14) }).parse(req.query);
    return withUser(req.session.userId, async (db) => {
      const params = [q.city, q.days];
      // Eventos de la ciudad en la ventana. La RLS ya limita a ciudades propias.
      const base = `
        with ev as (
          select e.*, r.city_zone_id, r.pickup_sector_id
          from request_events e join requests r on r.id = e.request_id
          where r.city_zone_id = $1 and r.created_at >= now() - make_interval(days => $2)
        ),
        life as (
          select request_id,
                 min(created_at) filter (where type = 'created') as created_at,
                 min(created_at) filter (where type = 'assigned') as assigned_at,
                 bool_or(to_status = 'completed') as completed,
                 bool_or(to_status = 'cancelled') as cancelled,
                 max(pickup_sector_id::text)::uuid as sector_id
          from ev group by request_id
        )`;

      const perDay = (
        await db.query(
          `${base}
           select to_char((created_at at time zone '${TZ}')::date, 'YYYY-MM-DD') as day,
                  count(*)::int as created,
                  count(*) filter (where completed)::int as completed,
                  count(*) filter (where cancelled)::int as cancelled
           from life where created_at is not null group by 1 order by 1`,
          params,
        )
      ).rows;

      const totals = (
        await db.query(
          `${base}
           select count(*)::int as total,
                  count(*) filter (where completed)::int as completed,
                  count(*) filter (where cancelled)::int as cancelled,
                  round(avg(extract(epoch from assigned_at - created_at)) filter (where assigned_at is not null))::int
                    as avg_seconds_to_assign,
                  round(percentile_cont(0.5) within group (order by extract(epoch from assigned_at - created_at))
                    filter (where assigned_at is not null))::int as median_seconds_to_assign
           from life where created_at is not null`,
          params,
        )
      ).rows[0];

      const byHour = (
        await db.query(
          `${base}
           select extract(hour from created_at at time zone '${TZ}')::int as hour, count(*)::int as created
           from life where created_at is not null group by 1 order by 1`,
          params,
        )
      ).rows;

      const bySector = (
        await db.query(
          `${base}
           select coalesce(z.name, 'Sin sector') as sector, count(*)::int as created,
                  count(*) filter (where life.completed)::int as completed,
                  round(avg(extract(epoch from life.assigned_at - life.created_at))
                    filter (where life.assigned_at is not null))::int as avg_seconds_to_assign
           from life left join zones z on z.id = life.sector_id
           where life.created_at is not null
           group by 1 order by 2 desc`,
          params,
        )
      ).rows;

      const rejections = (
        await db.query(
          `${base}
           select count(*) filter (where type = 'rejected' and payload ->> 'reason' = 'timeout')::int as timeouts,
                  count(*) filter (where type = 'rejected' and payload ->> 'reason' <> 'timeout')::int as rejected,
                  count(*) filter (where type = 'offered')::int as offered
           from ev`,
          params,
        )
      ).rows[0];

      return { days: q.days, totals, rejections, perDay, byHour, bySector };
    });
  });
}
