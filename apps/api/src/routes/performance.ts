// Desempeño por conductor: solo admin (la base lo vuelve a verificar).
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireRole } from '../auth.js';
import { withUser } from '../db.js';
import { HttpError } from '../errors.js';

const query = z.object({ city: z.string().uuid(), days: z.coerce.number().int().min(1).max(365).default(30) });

export default async function performanceRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);
  app.addHook('preHandler', requireRole('admin'));

  app.get('/performance', async (req) => {
    const q = query.parse(req.query);
    return withUser(req.session.userId, async (db) => (await db.query(`select * from driver_stats($1, $2)`, [q.city, q.days])).rows);
  });

  app.get('/performance/:driverId', async (req) => {
    const { driverId } = z.object({ driverId: z.string().uuid() }).parse(req.params);
    const q = query.parse(req.query);
    return withUser(req.session.userId, async (db) => {
      const stats = (await db.query(`select * from driver_stats($1, $2) where driver_id = $3`, [q.city, q.days, driverId])).rows[0];
      if (!stats) throw new HttpError(404, 'not_found', 'El conductor no existe en esta ciudad');
      const driver = (await db.query(`select * from driver_board where id = $1`, [driverId])).rows[0];

      // Servicios por día (hora de Colombia) en la ventana.
      const daily = (
        await db.query(
          `select to_char(d::date, 'YYYY-MM-DD') as day,
                  count(r.id) filter (where r.status = 'completed')::int as completed,
                  count(r.id) filter (where r.status = 'cancelled')::int as cancelled
           from generate_series((now() at time zone 'America/Bogota')::date - ($2 - 1), (now() at time zone 'America/Bogota')::date, interval '1 day') d
           left join requests r on r.assigned_driver_id = $1
             and (coalesce(r.completed_at, r.created_at) at time zone 'America/Bogota')::date = d::date
           group by d order by d`,
          [driverId, q.days],
        )
      ).rows;

      const ratings = (
        await db.query(
          `select dr.stars, dr.tags, dr.comment, dr.created_at, r.service, r.pickup_text, r.dropoff_text
           from driver_ratings dr join requests r on r.id = dr.request_id
           where dr.driver_id = $1 and dr.created_at >= now() - make_interval(days => $2)
           order by dr.created_at desc limit 50`,
          [driverId, q.days],
        )
      ).rows;

      const distribution = (
        await db.query(
          `select s.stars, count(dr.id)::int as n
           from generate_series(1, 5) s(stars)
           left join driver_ratings dr on dr.stars = s.stars and dr.driver_id = $1
             and dr.created_at >= now() - make_interval(days => $2)
           group by s.stars order by s.stars desc`,
          [driverId, q.days],
        )
      ).rows;

      const tags = (
        await db.query(
          `select tag, count(*)::int as n
           from driver_ratings dr, unnest(dr.tags) tag
           where dr.driver_id = $1 and dr.created_at >= now() - make_interval(days => $2)
           group by tag order by n desc`,
          [driverId, q.days],
        )
      ).rows;

      const recent = (
        await db.query(
          `select r.id, r.service, r.status, r.pickup_text, r.dropoff_text, r.assigned_at, r.completed_at, dr.stars
           from requests r left join driver_ratings dr on dr.request_id = r.id
           where r.assigned_driver_id = $1 and r.created_at >= now() - make_interval(days => $2)
           order by coalesce(r.completed_at, r.assigned_at, r.created_at) desc limit 20`,
          [driverId, q.days],
        )
      ).rows;

      return { driver, stats, daily, ratings, distribution, tags, recent };
    });
  });
}
