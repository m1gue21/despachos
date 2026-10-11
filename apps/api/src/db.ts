import pg from 'pg';
import { config } from './config.js';

// Las columnas numeric/bigint llegan como string por defecto; count(*) y
// similares los convertimos a número (no manejamos valores > 2^53).
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));

export const appPool = new pg.Pool({ connectionString: config.appUrl, max: 10 });
export const ownerPool = new pg.Pool({ connectionString: config.ownerUrl, max: 3 });

export type Db = pg.PoolClient;

// Ejecuta fn como el usuario indicado: rol app_user (RLS) + app.user_id en
// la transacción. Con userId null corre sin sesión (solo sirve para login).
export async function withUser<T>(userId: string | null, fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await appPool.connect();
  try {
    await client.query('begin');
    if (userId) await client.query(`select set_config('app.user_id', $1, true)`, [userId]);
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
