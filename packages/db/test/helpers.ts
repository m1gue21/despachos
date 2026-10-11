import assert from 'node:assert/strict';
import pg from 'pg';
import { DATABASE_URL } from '../src/env.js';

export const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });

// IDs fijos del seed.
export const ID = {
  manizales: '10000000-0000-0000-0000-000000000001',
  villamaria: '10000000-0000-0000-0000-000000000002',
  admin: '00000000-0000-0000-0000-0000000000a1',
  opManizales: '00000000-0000-0000-0000-0000000000a2',
  opVillamaria: '00000000-0000-0000-0000-0000000000a3',
  anaProfile: '00000000-0000-0000-0000-0000000000d1',
  brunoProfile: '00000000-0000-0000-0000-0000000000d2',
  anaDriver: '20000000-0000-0000-0000-000000000001',
  brunoDriver: '20000000-0000-0000-0000-000000000002',
  carlosDriver: '20000000-0000-0000-0000-000000000003',
  dianaDriver: '20000000-0000-0000-0000-000000000004',
  reqCable: '40000000-0000-0000-0000-000000000001',
  reqPalogrande: '40000000-0000-0000-0000-000000000002',
  reqVillamaria: '40000000-0000-0000-0000-000000000003',
} as const;

// Corre `fn` como lo haría el API: rol app_user y app.user_id fijado en la
// transacción. Siempre hace rollback, así cada test deja la base intacta.
// `prepare` corre antes como dueño, dentro de la misma transacción.
export async function asUser<T>(
  userId: string | null,
  fn: (c: pg.PoolClient) => Promise<T>,
  prepare?: (c: pg.PoolClient) => Promise<void>,
): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    if (prepare) await prepare(c);
    await c.query('set local role app_user');
    if (userId) await c.query(`select set_config('app.user_id', $1, true)`, [userId]);
    return await fn(c);
  } finally {
    await c.query('rollback');
    c.release();
  }
}

export async function count(c: pg.PoolClient, sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await c.query<{ n: string }>(`select count(*) as n from (${sql}) q`, params);
  return Number(rows[0]!.n);
}

// Espera que la consulta falle con ese SQLSTATE.
export async function rejectsWith(p: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(p, (err: unknown) => {
    assert.equal((err as { code?: string }).code, code, String(err));
    return true;
  });
}

export const PERMISSION_DENIED = '42501'; // también lo usa la RLS en WITH CHECK
export const CHECK_VIOLATION = '23514';
