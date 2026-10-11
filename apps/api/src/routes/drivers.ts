import { DRIVER_STATUSES, LOCATION_MODES, driverInputSchema } from '@despacho/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireRole } from '../auth.js';
import { withUser } from '../db.js';
import { HttpError } from '../errors.js';

const idParam = z.object({ id: z.string().uuid() });

export const presencePatch = z.object({
  status: z.enum(DRIVER_STATUSES).optional(),
  location_mode: z.enum(LOCATION_MODES).optional(),
  sector_zone_id: z.string().uuid().nullable().optional(),
  // "Sigo aquí": renueva la confirmación de zona sin cambiar nada más.
  confirm: z.boolean().optional(),
});

export function presenceUpdateSql(b: z.infer<typeof presencePatch>) {
  const sets: string[] = [];
  const params: unknown[] = [];
  const push = (col: string, v: unknown) => {
    params.push(v);
    sets.push(`${col} = $${params.length + 1}`);
  };
  if (b.status !== undefined) push('status', b.status);
  if (b.location_mode !== undefined) push('location_mode', b.location_mode);
  if (b.sector_zone_id !== undefined) {
    push('sector_zone_id', b.sector_zone_id);
    // Elegir sector implica modo zona si estaba en none.
    if (b.location_mode === undefined) sets.push(`location_mode = case when location_mode = 'none' then 'zone' else location_mode end`);
  }
  if (b.confirm) sets.push('zone_confirmed_at = now()');
  return { sets, params };
}

export default async function driverRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);
  app.addHook('preHandler', requireRole('admin', 'operator'));

  app.get('/drivers', async (req) => {
    const q = z.object({ city: z.string().uuid(), all: z.string().optional() }).parse(req.query);
    return withUser(req.session.userId, async (db) =>
      (
        await db.query(
          `select b.*,
                  (select count(*) from requests r
                   where r.assigned_driver_id = b.id and r.status in ('assigned','picked_up')) as active_requests
           from driver_board b
           where b.city_zone_id = $1 and ($2 or b.active)
           order by b.active desc, b.display_name`,
          [q.city, Boolean(q.all)],
        )
      ).rows,
    );
  });

  app.post('/drivers', async (req) => {
    const b = driverInputSchema.parse(req.body);
    return withUser(req.session.userId, async (db) => {
      const { rows } = await db.query(
        `insert into drivers (city_zone_id, display_name, phone, vehicle, plate, service_types, active)
         values ($1, $2, $3, $4, $5, $6, $7) returning id`,
        [b.city_zone_id, b.display_name, b.phone, b.vehicle, b.plate, b.service_types, b.active],
      );
      return (await db.query(`select * from driver_board where id = $1`, [rows[0].id])).rows[0];
    });
  });

  app.patch('/drivers/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    const b = driverInputSchema.partial().parse(req.body);
    const entries = Object.entries(b).filter(([, v]) => v !== undefined);
    if (entries.length === 0) throw new HttpError(400, 'bad_payload', 'Nada que actualizar');
    return withUser(req.session.userId, async (db) => {
      const sets = entries.map(([k], i) => `${k} = $${i + 2}`).join(', ');
      const r = await db.query(`update drivers set ${sets} where id = $1`, [id, ...entries.map(([, v]) => v)]);
      if (r.rowCount === 0) throw new HttpError(404, 'not_found', 'El conductor no existe o no tienes acceso');
      return (await db.query(`select * from driver_board where id = $1`, [id])).rows[0];
    });
  });

  // El operador fuerza estado/zona de un conductor (updated_by lo firma la base).
  app.patch('/drivers/:id/presence', async (req) => {
    const { id } = idParam.parse(req.params);
    const { sets, params } = presenceUpdateSql(presencePatch.parse(req.body));
    if (sets.length === 0) throw new HttpError(400, 'bad_payload', 'Nada que actualizar');
    return withUser(req.session.userId, async (db) => {
      const r = await db.query(`update driver_presence set ${sets.join(', ')} where driver_id = $1`, [id, ...params]);
      if (r.rowCount === 0) throw new HttpError(404, 'not_found', 'El conductor no existe o no tienes acceso');
      return (await db.query(`select * from driver_board where id = $1`, [id])).rows[0];
    });
  });

  // Crea la cuenta para la app. Devuelve la contraseña temporal una sola vez.
  app.post('/drivers/:id/invite', async (req) => {
    const { id } = idParam.parse(req.params);
    const b = z.object({ email: z.string().trim().email(), password: z.string().min(8).optional() }).parse(req.body);
    const password = b.password ?? generatePassword();
    return withUser(req.session.userId, async (db) => {
      await db.query(`select invite_driver($1, $2, $3)`, [id, b.email, password]);
      return { email: b.email, password };
    });
  });
}

function generatePassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (x) => alphabet[x % alphabet.length]).join('');
}
