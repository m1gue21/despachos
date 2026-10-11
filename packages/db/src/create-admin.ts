// Crea el primer admin en una base sin seed (producción).
// Uso: ADMIN_EMAIL=... ADMIN_PASSWORD=... ADMIN_NAME=... pnpm --filter @despacho/db create-admin
import pg from 'pg';
import { DATABASE_URL } from './env.js';

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME ?? 'Administrador';
if (!email || !password || password.length < 12) {
  console.error('Faltan ADMIN_EMAIL y ADMIN_PASSWORD (mínimo 12 caracteres).');
  process.exit(1);
}

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
try {
  await client.query('begin');
  const { rows } = await client.query<{ id: string }>(
    `insert into app_users (email, password_hash) values ($1, crypt($2, gen_salt('bf', 10))) returning id`,
    [email, password],
  );
  await client.query(`insert into profiles (id, role, full_name) values ($1, 'admin', $2)`, [rows[0]!.id, name]);
  await client.query('commit');
  console.log(`Admin creado: ${email}`);
} catch (err) {
  await client.query('rollback');
  console.error('No se pudo crear el admin:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await client.end();
}
