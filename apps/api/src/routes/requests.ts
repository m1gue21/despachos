import { REQUEST_STATUSES, newRequestSchema } from '@despacho/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import { withUser } from '../db.js';
import { HttpError } from '../errors.js';
import { REQUEST_SELECT } from './sql.js';

const TRANSITION_ACTIONS = ['offer', 'accept', 'reject', 'assign', 'reassign', 'pick_up', 'complete', 'cancel', 'note'] as const;

const idParam = z.object({ id: z.string().uuid() });

export default async function requestRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  // Bandeja: abiertas + cerradas de las últimas `hours` horas (por defecto 24).
  app.get('/requests', async (req) => {
    const q = z
      .object({
        city: z.string().uuid(),
        status: z.enum(REQUEST_STATUSES).optional(),
        hours: z.coerce.number().int().positive().max(24 * 31).default(24),
      })
      .parse(req.query);
    return withUser(req.session.userId, async (db) => {
      const { rows } = await db.query(
        `${REQUEST_SELECT}
         where r.city_zone_id = $1
           and ($2::request_status is null or r.status = $2)
           and (r.status not in ('completed','cancelled') or r.created_at > now() - make_interval(hours => $3))
         order by r.created_at desc
         limit 500`,
        [q.city, q.status ?? null, q.hours],
      );
      return rows;
    });
  });

  app.post('/requests', async (req) => {
    const body = newRequestSchema.parse(req.body);
    return withUser(req.session.userId, async (db) => {
      const { rows } = await db.query(`select id from create_request($1)`, [JSON.stringify(body)]);
      return (await db.query(`${REQUEST_SELECT} where r.id = $1`, [rows[0].id])).rows[0];
    });
  });

  app.get('/requests/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    return withUser(req.session.userId, async (db) => {
      const request = (await db.query(`${REQUEST_SELECT} where r.id = $1`, [id])).rows[0];
      if (!request) throw new HttpError(404, 'not_found', 'La solicitud no existe');
      // La línea de tiempo solo la ven operadores/admin (RLS); el conductor recibe [].
      const events = (
        await db.query(
          `select e.id, e.type, e.from_status, e.to_status, e.actor_id, e.actor_role, e.payload, e.created_at,
                  coalesce(p.full_name, case when e.actor_id is null then 'Sistema' end) as actor_name,
                  d.display_name as driver_name
           from request_events e
           left join profiles p on p.id = e.actor_id
           left join drivers d on d.id = (e.payload ->> 'driver_id')::uuid
           where e.request_id = $1
           order by e.id`,
          [id],
        )
      ).rows;
      return { ...request, events };
    });
  });

  app.patch('/requests/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    const b = newRequestSchema
      .pick({
        service: true,
        source_group_id: true,
        pickup_text: true,
        pickup_sector_id: true,
        dropoff_text: true,
        dropoff_sector_id: true,
        customer_name: true,
        customer_phone: true,
        notes: true,
      })
      .partial()
      .parse(req.body);
    const entries = Object.entries(b).filter(([, v]) => v !== undefined);
    if (entries.length === 0) throw new HttpError(400, 'bad_payload', 'Nada que actualizar');
    return withUser(req.session.userId, async (db) => {
      const sets = entries.map(([k], i) => `${k} = $${i + 2}`).join(', ');
      const r = await db.query(`update requests set ${sets} where id = $1`, [id, ...entries.map(([, v]) => v)]);
      if (r.rowCount === 0) throw new HttpError(404, 'not_found', 'La solicitud no existe o no tienes acceso');
      return (await db.query(`${REQUEST_SELECT} where r.id = $1`, [id])).rows[0];
    });
  });

  app.post('/requests/:id/transition', async (req) => {
    const { id } = idParam.parse(req.params);
    const b = z
      .object({ action: z.enum(TRANSITION_ACTIONS), payload: z.record(z.unknown()).default({}) })
      .parse(req.body);
    return withUser(req.session.userId, async (db) => {
      await db.query(`select transition_request($1, $2, $3)`, [id, b.action, JSON.stringify(b.payload)]);
      return (await db.query(`${REQUEST_SELECT} where r.id = $1`, [id])).rows[0] ?? { id };
    });
  });

  app.get('/requests/:id/suggestions', async (req) => {
    const { id } = idParam.parse(req.params);
    const q = z.object({ radius: z.coerce.number().int().positive().default(5000) }).parse(req.query);
    return withUser(req.session.userId, async (db) =>
      (await db.query(`select * from nearby_drivers($1, $2)`, [id, q.radius])).rows,
    );
  });
}
