// Zonas, grupos de WhatsApp, ajustes y personal.
import { SETTING_KEYS } from '@despacho/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireRole } from '../auth.js';
import { withUser } from '../db.js';
import { HttpError } from '../errors.js';
import { ZONE_SELECT, slugify } from './sql.js';

const latLng = z.object({ lat: z.number(), lng: z.number() });
// Polígono como lista de [lng, lat]; se cierra solo.
const polygon = z.array(z.tuple([z.number(), z.number()])).min(3);

const zoneInput = z.object({
  parent_id: z.string().uuid().nullable().default(null),
  name: z.string().trim().min(1),
  slug: z.string().trim().min(1).optional(),
  aliases: z.array(z.string().trim().min(1)).default([]),
  center: latLng.nullable().optional(),
  polygon: polygon.nullable().optional(),
  active: z.boolean().optional(),
});

function polygonGeoJson(points: [number, number][]) {
  const ring = [...points];
  const [first, last] = [ring[0]!, ring[ring.length - 1]!];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first);
  return JSON.stringify({ type: 'Polygon', coordinates: [ring] });
}

const groupInput = z.object({
  city_zone_id: z.string().uuid(),
  name: z.string().trim().min(1),
  kind: z.enum(['delivery', 'ride', 'mixed']).default('mixed'),
  active: z.boolean().default(true),
});

export default async function catalogRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/cities', async (req) =>
    withUser(req.session.userId, async (db) => (await db.query(`select id, name, slug from my_cities()`)).rows),
  );

  // Ciudad + sus sectores. Con ?all=1 incluye inactivos (para administrar).
  app.get('/zones', async (req) => {
    const q = z.object({ city: z.string().uuid().optional(), all: z.string().optional() }).parse(req.query);
    return withUser(req.session.userId, async (db) => {
      const where = [q.city ? `(z.id = $1 or z.parent_id = $1)` : 'true', q.all ? 'true' : 'z.active'];
      const { rows } = await db.query(
        `${ZONE_SELECT} where ${where.join(' and ')} order by z.level, z.name`,
        q.city ? [q.city] : [],
      );
      return rows;
    });
  });

  app.post('/zones', { preHandler: requireRole('admin') }, async (req) => {
    const b = zoneInput.parse(req.body);
    return withUser(req.session.userId, async (db) => {
      let slug = b.slug ?? slugify(b.name);
      if (b.parent_id && !b.slug) {
        const parent = (await db.query(`select slug from zones where id = $1`, [b.parent_id])).rows[0];
        if (!parent) throw new HttpError(400, 'bad_payload', 'La ciudad no existe');
        slug = `${parent.slug}-${slugify(b.name)}`;
      }
      const { rows } = await db.query(
        `insert into zones (parent_id, level, name, slug, aliases, center, geom)
         values ($1, $2, $3, $4, $5,
                 case when $6::float8 is null then null else st_setsrid(st_makepoint($7, $6), 4326)::geography end,
                 case when $8::text is null then null else st_geomfromgeojson($8)::geography end)
         returning id`,
        [
          b.parent_id,
          b.parent_id ? 'sector' : 'city',
          b.name,
          slug,
          b.aliases,
          b.center?.lat ?? null,
          b.center?.lng ?? null,
          b.polygon ? polygonGeoJson(b.polygon) : null,
        ],
      );
      return (await db.query(`${ZONE_SELECT} where z.id = $1`, [rows[0].id])).rows[0];
    });
  });

  app.patch('/zones/:id', { preHandler: requireRole('admin') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const b = zoneInput.partial().parse(req.body);
    return withUser(req.session.userId, async (db) => {
      const sets: string[] = [];
      const params: unknown[] = [id];
      const add = (sql: string, ...v: unknown[]) => {
        const placeholders = v.map((x) => {
          params.push(x);
          return `$${params.length}`;
        });
        sets.push(sql.replace(/\?/g, () => placeholders.shift()!));
      };
      if (b.name !== undefined) add('name = ?', b.name);
      if (b.aliases !== undefined) add('aliases = ?', b.aliases);
      if (b.active !== undefined) add('active = ?', b.active);
      if (b.center !== undefined)
        add(
          'center = case when ?::float8 is null then null else st_setsrid(st_makepoint(?, ?), 4326)::geography end',
          b.center?.lat ?? null,
          b.center?.lng ?? null,
          b.center?.lat ?? null,
        );
      if (b.polygon !== undefined)
        add(
          'geom = case when ?::text is null then null else st_geomfromgeojson(?)::geography end',
          b.polygon ? polygonGeoJson(b.polygon) : null,
          b.polygon ? polygonGeoJson(b.polygon) : null,
        );
      if (sets.length === 0) throw new HttpError(400, 'bad_payload', 'Nada que actualizar');
      const r = await db.query(`update zones set ${sets.join(', ')} where id = $1`, params);
      if (r.rowCount === 0) throw new HttpError(404, 'not_found', 'La zona no existe');
      return (await db.query(`${ZONE_SELECT} where z.id = $1`, [id])).rows[0];
    });
  });

  app.get('/groups', async (req) => {
    const q = z.object({ city: z.string().uuid() }).parse(req.query);
    return withUser(req.session.userId, async (db) =>
      (await db.query(`select * from whatsapp_groups where city_zone_id = $1 order by active desc, name`, [q.city])).rows,
    );
  });

  app.post('/groups', async (req) => {
    const b = groupInput.parse(req.body);
    return withUser(req.session.userId, async (db) =>
      (
        await db.query(
          `insert into whatsapp_groups (city_zone_id, name, kind, active) values ($1, $2, $3, $4) returning *`,
          [b.city_zone_id, b.name, b.kind, b.active],
        )
      ).rows[0],
    );
  });

  app.patch('/groups/:id', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const b = groupInput.omit({ city_zone_id: true }).partial().parse(req.body);
    return withUser(req.session.userId, async (db) => {
      const { rows } = await db.query(
        `update whatsapp_groups set name = coalesce($2, name), kind = coalesce($3, kind), active = coalesce($4, active)
         where id = $1 returning *`,
        [id, b.name ?? null, b.kind ?? null, b.active ?? null],
      );
      if (!rows[0]) throw new HttpError(404, 'not_found', 'El grupo no existe');
      return rows[0];
    });
  });

  // Ajustes efectivos de una ciudad (el de la ciudad o el global).
  app.get('/settings', async (req) => {
    const q = z.object({ city: z.string().uuid().optional() }).parse(req.query);
    return withUser(req.session.userId, async (db) => {
      const out: Record<string, number | null> = {};
      for (const key of SETTING_KEYS) {
        const { rows } = await db.query(`select setting_int($1, $2) as v`, [key, q.city ?? null]);
        out[key] = rows[0].v;
      }
      return out;
    });
  });

  app.put('/settings/:key', { preHandler: requireRole('admin') }, async (req) => {
    const { key } = z.object({ key: z.enum(SETTING_KEYS) }).parse(req.params);
    const b = z.object({ value: z.number().int().positive(), city: z.string().uuid().nullable().default(null) }).parse(req.body);
    return withUser(req.session.userId, async (db) => {
      await db.query(
        `insert into app_settings (key, city_zone_id, value) values ($1, $2, to_jsonb($3::int))
         on conflict (key, city_zone_id) do update set value = excluded.value, updated_at = now()`,
        [key, b.city, b.value],
      );
      return { key, city: b.city, value: b.value };
    });
  });

  app.get('/staff', { preHandler: requireRole('admin') }, async (req) =>
    withUser(req.session.userId, async (db) => (await db.query(`select * from list_staff()`)).rows),
  );

  app.post('/staff', { preHandler: requireRole('admin') }, async (req) => {
    const b = z
      .object({
        email: z.string().trim().email(),
        password: z.string().min(8),
        full_name: z.string().trim().min(1),
        role: z.enum(['admin', 'operator']),
        city_ids: z.array(z.string().uuid()).default([]),
      })
      .parse(req.body);
    return withUser(req.session.userId, async (db) => {
      const { rows } = await db.query(`select create_staff_user($1, $2, $3, $4, $5) as id`, [
        b.email,
        b.password,
        b.full_name,
        b.role,
        b.city_ids,
      ]);
      return { id: rows[0].id };
    });
  });
}
