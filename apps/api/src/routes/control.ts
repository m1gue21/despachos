// Control de repartidores: alertas de señal perdida e historial de recorrido.
// Para administradores y operadores (la RLS limita a sus ciudades).
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireRole } from '../auth.js';
import { withUser } from '../db.js';
import { HttpError } from '../errors.js';

const TZ = 'America/Bogota';
const idParam = z.object({ id: z.string().uuid() });

export default async function controlRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);
  app.addHook('preHandler', requireRole('admin', 'operator'));

  // Alertas de la ciudad. ?open=1 solo las abiertas; ?days= ventana del historial.
  app.get('/alerts', async (req) => {
    const q = z
      .object({ city: z.string().uuid(), open: z.string().optional(), days: z.coerce.number().int().min(1).max(90).default(7) })
      .parse(req.query);
    return withUser(req.session.userId, async (db) =>
      (
        await db.query(
          `select a.id, a.driver_id, d.display_name as driver_name, a.reason, a.opened_at, a.resolved_at, a.resolved_by,
                  round(extract(epoch from coalesce(a.resolved_at, now()) - a.opened_at) / 60)::int as minutes
           from tracking_alerts a join drivers d on d.id = a.driver_id
           where a.city_zone_id = $1
             and ($2::boolean is false or a.resolved_at is null)
             and a.opened_at >= now() - make_interval(days => $3)
           order by a.resolved_at is null desc, a.opened_at desc
           limit 200`,
          [q.city, Boolean(q.open), q.days],
        )
      ).rows,
    );
  });

  // Recorrido de un conductor en un día (hora de Colombia): puntos, km, turnos y señal perdida.
  app.get('/drivers/:id/route', async (req) => {
    const { id } = idParam.parse(req.params);
    const q = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).parse(req.query);
    return withUser(req.session.userId, async (db) => {
      const found = await db.query(`select id from drivers where id = $1`, [id]);
      if (found.rowCount === 0) throw new HttpError(404, 'not_found', 'El conductor no existe o no tienes acceso');
      // Inicio y fin del día en Bogotá como instantes.
      const day = (
        await db.query(
          `select to_char(coalesce($1::date, (now() at time zone '${TZ}')::date), 'YYYY-MM-DD') as date,
                  coalesce($1::date, (now() at time zone '${TZ}')::date)::timestamp at time zone '${TZ}' as t0,
                  (coalesce($1::date, (now() at time zone '${TZ}')::date) + 1)::timestamp at time zone '${TZ}' as t1`,
          [q.date ?? null],
        )
      ).rows[0] as { date: string; t0: Date; t1: Date };

      const points = (
        await db.query(
          `select st_y(position::geometry) as lat, st_x(position::geometry) as lng, recorded_at as t
           from driver_location_history
           where driver_id = $1 and recorded_at >= $2 and recorded_at < $3
           order by recorded_at`,
          [id, day.t0, day.t1],
        )
      ).rows as { lat: number; lng: number; t: string }[];

      const km =
        (
          await db.query(
            `select coalesce(st_length(st_makeline(position::geometry order by recorded_at)::geography), 0) / 1000 as km
             from driver_location_history where driver_id = $1 and recorded_at >= $2 and recorded_at < $3`,
            [id, day.t0, day.t1],
          )
        ).rows[0].km ?? 0;

      // Duración recortada al día: min(fin, fin del día) − max(inicio, inicio del día).
      const shifts = (
        await db.query(
          `select started_at, ended_at,
                  extract(epoch from least(coalesce(ended_at, now()), $3) - greatest(started_at, $2)) / 60 as mins
           from driver_shifts where driver_id = $1 and started_at < $3 and coalesce(ended_at, now()) > $2
           order by started_at`,
          [id, day.t0, day.t1],
        )
      ).rows as { started_at: string; ended_at: string | null; mins: number }[];

      const alerts = (
        await db.query(
          `select a.id, a.driver_id, d.display_name as driver_name, a.reason, a.opened_at, a.resolved_at, a.resolved_by,
                  round(extract(epoch from coalesce(a.resolved_at, now()) - a.opened_at) / 60)::int as minutes,
                  extract(epoch from least(coalesce(a.resolved_at, now()), $3) - greatest(a.opened_at, $2)) / 60 as day_mins
           from tracking_alerts a join drivers d on d.id = a.driver_id
           where a.driver_id = $1 and a.opened_at < $3 and coalesce(a.resolved_at, now()) > $2
           order by a.opened_at`,
          [id, day.t0, day.t1],
        )
      ).rows as { day_mins: number }[];

      return {
        date: day.date,
        points,
        km: Math.round(Number(km) * 10) / 10,
        first_at: points[0]?.t ?? null,
        last_at: points.at(-1)?.t ?? null,
        shifts: shifts.map((s) => ({ started_at: s.started_at, ended_at: s.ended_at })),
        shift_minutes: Math.round(shifts.reduce((a, s) => a + Number(s.mins), 0)),
        alerts: alerts.map(({ day_mins: _d, ...a }) => a),
        silent_minutes: Math.round(alerts.reduce((a, x) => a + Number(x.day_mins), 0)),
      };
    });
  });
}
