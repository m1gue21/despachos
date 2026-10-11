// Borra el esquema public y lo recrea: migraciones en orden + seed.
// Equivale a `supabase db reset`. Solo para desarrollo local.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';
import { DATABASE_URL } from './env.js';

const root = join(import.meta.dirname, '..');
const migrationsDir = join(root, 'migrations');

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
try {
  await client.query('drop schema if exists public cascade; create schema public;');
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    process.stdout.write(`migración ${file}… `);
    await client.query(`begin; ${await readFile(join(migrationsDir, file), 'utf8')}; commit;`);
    console.log('ok');
  }
  if (!process.argv.includes('--no-seed')) {
    process.stdout.write('seed… ');
    await client.query(`begin; ${await readFile(join(root, 'seed.sql'), 'utf8')}; commit;`);
    console.log('ok');
  }
} catch (err) {
  await client.query('rollback').catch(() => {});
  console.error('\nfalló:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await client.end();
}
