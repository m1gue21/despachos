// Prepara una base real de forma incremental e idempotente (no borra nada):
//   · aplica solo las migraciones que faltan (tabla schema_migrations);
//   · fija la contraseña del rol app_user (APP_USER_PASSWORD);
//   · carga las zonas base si no hay ninguna (SEED_BASE=1);
//   · crea el primer admin si no existe ninguno (ADMIN_EMAIL / ADMIN_PASSWORD).
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';
import { DATABASE_URL } from './env.js';

const root = join(import.meta.dirname, '..');
const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
try {
  await client.query(
    `create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`,
  );
  const files = (await readdir(join(root, 'migrations'))).filter((f) => f.endsWith('.sql')).sort();
  const done = new Set((await client.query<{ name: string }>('select name from schema_migrations')).rows.map((r) => r.name));
  // Base creada antes con `reset`: se marcan como aplicadas las que ya están.
  if (done.size === 0 && (await client.query(`select to_regclass('public.zones') as t`)).rows[0].t) {
    for (const f of files) await client.query('insert into schema_migrations (name) values ($1)', [f]);
    files.forEach((f) => done.add(f));
    console.log('base existente: migraciones marcadas como aplicadas');
  }
  for (const f of files.filter((f) => !done.has(f))) {
    process.stdout.write(`migración ${f}… `);
    await client.query(`begin; ${await readFile(join(root, 'migrations', f), 'utf8')}; commit;`);
    await client.query('insert into schema_migrations (name) values ($1)', [f]);
    console.log('ok');
  }

  const pw = process.env.APP_USER_PASSWORD;
  if (pw) {
    await client.query(`alter role app_user password ${client.escapeLiteral(pw)}`);
    console.log('contraseña de app_user fijada');
  }

  if (process.env.SEED_BASE === '1' && (await client.query('select 1 from zones limit 1')).rowCount === 0) {
    await client.query(`begin; ${await readFile(join(root, 'seed-base.sql'), 'utf8')}; commit;`);
    console.log('zonas base cargadas');
  }

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (email && password) {
    if (password.length < 12) throw new Error('ADMIN_PASSWORD debe tener al menos 12 caracteres');
    if ((await client.query(`select 1 from profiles where role = 'admin' limit 1`)).rowCount === 0) {
      await client.query('begin');
      const { rows } = await client.query<{ id: string }>(
        `insert into app_users (email, password_hash) values ($1, crypt($2, gen_salt('bf', 10))) returning id`,
        [email, password],
      );
      await client.query(`insert into profiles (id, role, full_name) values ($1, 'admin', $2)`, [
        rows[0]!.id,
        process.env.ADMIN_NAME ?? 'Administrador',
      ]);
      await client.query('commit');
      console.log(`admin creado: ${email}`);
    }
  }
} catch (err) {
  await client.query('rollback').catch(() => {});
  console.error('falló:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await client.end();
}
