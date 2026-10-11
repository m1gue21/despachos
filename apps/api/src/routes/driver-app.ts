// Rutas de la app del conductor. Todo pasa por RLS con su propia sesión.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireRole } from '../auth.js';
import { type Db, withUser } from '../db.js';
import { HttpError } from '../errors.js';
import { presencePatch, presenceUpdateSql } from './drivers.js';
import { REQUEST_SELECT } from './sql.js';

export const CONSENT_VERSION = '2026-10-v1';

async function myDriverId(db: Db): Promise<string> {
  const { rows } = await db.query(`select my_driver_id() as id`);
  if (!rows[0]?.id) throw new HttpError(403, 'forbidden', 'Tu cuenta no está vinculada a un conductor activo');
  return rows[0].id;
}

async function board(db: Db, driverId: string) {
  return (await db.query(`select * from driver_board where id = $1`, [driverId])).rows[0];
}

export default async function driverAppRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);
  app.addHook('preHandler', requireRole('driver'));

  app.get('/driver/me', async (req) =>
    withUser(req.session.userId, async (db) => {
      const id = await myDriverId(db);
      const driver = await board(db, id);
      const sectors = (
        await db.query(
          `select id, name from zones where parent_id = $1 and level = 'sector' and active order by name`,
          [driver.city_zone_id],
        )
      ).rows;
      const profile = (await db.query(`select consent_at, consent_version from profiles where id = auth_uid()`)).rows[0];
      const settings = (
        await db.query(
          `select setting_int('LIVE_PING_SECONDS', $1) as live_ping_seconds,
                  setting_int('OFFER_TIMEOUT_SECONDS', $1) as offer_timeout_seconds,
                  setting_int('ZONE_STALE_MINUTES', $1) as zone_stale_minutes`,
          [driver.city_zone_id],
        )
      ).rows[0];
      return {
        driver,
        sectors,
        settings,
        consent: { ...profile, current_version: CONSENT_VERSION, valid: profile.consent_version === CONSENT_VERSION },
      };
    }),
  );

  app.post('/driver/consent', async (req) => {
    const b = z.object({ version: z.literal(CONSENT_VERSION), accepted: z.boolean() }).parse(req.body);
    return withUser(req.session.userId, async (db) => {
      await db.query(
        `update profiles set consent_at = case when $1 then now() end, consent_version = case when $1 then $2 end
         where id = auth_uid()`,
        [b.accepted, b.version],
      );
      // Retirar el consentimiento apaga el modo live.
      if (!b.accepted) {
        await db.query(
          `update driver_presence set location_mode = 'zone' where driver_id = my_driver_id() and location_mode = 'live'`,
        );
      }
      return { ok: true };
    });
  });

  app.patch('/driver/presence', async (req) => {
    const b = presencePatch.parse(req.body);
    return withUser(req.session.userId, async (db) => {
      const id = await myDriverId(db);
      if (b.location_mode === 'live') {
        const { rows } = await db.query(`select consent_version from profiles where id = auth_uid()`);
        if (rows[0]?.consent_version !== CONSENT_VERSION) {
          throw new HttpError(403, 'consent_required', 'Acepta el consentimiento para compartir ubicación en vivo');
        }
      }
      const { sets, params } = presenceUpdateSql(b);
      if (sets.length === 0) throw new HttpError(400, 'bad_payload', 'Nada que actualizar');
      await db.query(`update driver_presence set ${sets.join(', ')} where driver_id = $1`, [id, ...params]);
      return board(db, id);
    });
  });

  // Ping de ubicación en modo live. Ignorado si no está en live o está offline.
  app.post('/driver/location', async (req) => {
    const b = z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        accuracy: z.number().nonnegative().nullable().optional(),
      })
      .parse(req.body);
    return withUser(req.session.userId, async (db) => {
      const id = await myDriverId(db);
      const r = await db.query(
        `update driver_presence
         set position = st_setsrid(st_makepoint($2, $3), 4326)::geography, accuracy_m = $4, last_seen_at = now()
         where driver_id = $1 and location_mode = 'live' and status <> 'offline'`,
        [id, b.lng, b.lat, b.accuracy ?? null],
      );
      return { accepted: r.rowCount === 1 };
    });
  });

  app.get('/driver/offers', async (req) =>
    withUser(req.session.userId, async (db) =>
      (
        await db.query(
          `select o.*, ps.name as pickup_sector_name, ds.name as dropoff_sector_name
           from driver_offers o
           left join zones ps on ps.id = o.pickup_sector_id
           left join zones ds on ds.id = o.dropoff_sector_id
           order by o.offered_at`,
        )
      ).rows.map(({ pickup_position: _p, dropoff_position: _d, ...rest }) => rest),
    ),
  );

  // Servicios activos y los cerrados hoy (hora de Colombia).
  app.get('/driver/services', async (req) =>
    withUser(req.session.userId, async (db) =>
      (
        await db.query(
          `${REQUEST_SELECT}
           where r.assigned_driver_id = my_driver_id()
             and (r.status in ('assigned','picked_up')
                  or (r.completed_at at time zone 'America/Bogota')::date = (now() at time zone 'America/Bogota')::date
                  or (r.status = 'cancelled' and (r.created_at at time zone 'America/Bogota')::date
                                                 = (now() at time zone 'America/Bogota')::date))
           order by r.status in ('assigned','picked_up') desc, coalesce(r.completed_at, r.assigned_at) desc`,
        )
      ).rows,
    ),
  );

  app.post('/driver/push-token', async (req) => {
    const b = z.object({ token: z.string().min(1), platform: z.enum(['android', 'ios']) }).parse(req.body);
    return withUser(req.session.userId, async (db) => {
      const id = await myDriverId(db);
      await db.query(
        `insert into push_tokens (driver_id, token, platform) values ($1, $2, $3)
         on conflict (driver_id, token) do update set updated_at = now(), platform = excluded.platform`,
        [id, b.token, b.platform],
      );
      return { ok: true };
    });
  });
}
