import { loginSchema } from '@despacho/shared';
import type { FastifyInstance } from 'fastify';
import { requireAuth, signSession } from '../auth.js';
import { type Db, withUser } from '../db.js';
import { HttpError } from '../errors.js';
import { ZONE_SELECT } from './sql.js';

async function loadMe(db: Db) {
  const { rows } = await db.query(
    `select id, role, full_name, phone, consent_at, consent_version from profiles where id = auth_uid() and active`,
  );
  const profile = rows[0];
  if (!profile) throw new HttpError(401, 'unauthorized', 'Cuenta inactiva');
  const cities = (await db.query(`${ZONE_SELECT} where z.id in (select id from my_cities()) order by z.name`)).rows;
  const driver =
    profile.role === 'driver'
      ? ((await db.query(`select * from driver_board where id = my_driver_id()`)).rows[0] ?? null)
      : null;
  return { profile, cities, driver };
}

export default async function authRoutes(app: FastifyInstance) {
  app.post('/auth/login', async (req) => {
    const { email, password } = loginSchema.parse(req.body);
    const userId = await withUser(null, async (db) => {
      const { rows } = await db.query<{ id: string | null }>(`select auth_login($1, $2) as id`, [email, password]);
      return rows[0]?.id ?? null;
    });
    if (!userId) throw new HttpError(401, 'invalid_credentials', 'Correo o contraseña incorrectos');
    const me = await withUser(userId, loadMe);
    const token = await signSession({ userId, role: me.profile.role });
    return { token, ...me };
  });

  app.get('/me', { preHandler: requireAuth }, async (req) => withUser(req.session.userId, loadMe));
}
