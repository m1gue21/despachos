// Calificaciones desde el enlace de seguimiento y estadísticas por conductor.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import type pg from 'pg';
import { ID, PERMISSION_DENIED, asUser, pool, rejectsWith } from './helpers.js';

after(() => pool.end());

const t = (c: pg.PoolClient, req: string, action: string, payload: object = {}) =>
  c.query(`select transition_request($1, $2, $3)`, [req, action, JSON.stringify(payload)]);
const link = async (c: pg.PoolClient, req: string) =>
  (await c.query(`select token from create_tracking_link($1)`, [req])).rows[0].token as string;
const rate = (c: pg.PoolClient, token: string, stars: number, tags: string[] = [], comment: string | null = null) =>
  c.query(`select submit_rating($1, $2, $3, $4)`, [token, stars, tags, comment]);
const appError = (p: Promise<unknown>, hint: string) =>
  assert.rejects(p, (e: unknown) => {
    assert.equal((e as { hint?: string }).hint, hint, String(e));
    return true;
  });

// Ofrece a Ana, ella acepta, recoge y completa; devuelve el token del enlace.
async function deliverByAna(c: pg.PoolClient, req: string): Promise<string> {
  const become = (uid: string) => c.query(`select set_config('app.user_id', $1, true)`, [uid]);
  await t(c, req, 'offer', { driver_id: ID.anaDriver });
  await become(ID.anaProfile);
  await t(c, req, 'accept');
  const token = await link(c, req);
  await t(c, req, 'pick_up');
  await t(c, req, 'complete');
  await become(ID.opManizales);
  return token;
}

describe('calificaciones', () => {
  it('el cliente califica un servicio completado, una sola vez', async () => {
    await asUser(ID.opManizales, async (c) => {
      const token = await deliverByAna(c, ID.reqCable);
      let data = (await c.query(`select public_tracking($1) as t`, [token])).rows[0].t;
      assert.equal(data.can_rate, true);
      await c.query(`select set_config('app.user_id', '', true)`); // sin sesión, como la página pública
      await rate(c, token, 5, ['puntual', 'amable'], '  Muy rápido  ');
      data = (await c.query(`select public_tracking($1) as t`, [token])).rows[0].t;
      assert.equal(data.can_rate, false);
      assert.equal(data.rating.stars, 5);
      await appError(rate(c, token, 1), 'invalid_transition');
    });
  });

  it('no se califica un servicio sin completar ni con datos inválidos', async () => {
    await asUser(ID.opManizales, async (c) => {
      await t(c, ID.reqCable, 'assign', { driver_id: ID.anaDriver });
      const token = await link(c, ID.reqCable);
      await appError(rate(c, token, 5), 'invalid_transition');
    });
    await asUser(ID.opManizales, async (c) => {
      const token = await deliverByAna(c, ID.reqCable);
      await appError(rate(c, token, 6), 'bad_payload');
    });
    await asUser(ID.opManizales, async (c) => {
      const token = await deliverByAna(c, ID.reqCable);
      await appError(rate(c, token, 4, ['inventada']), 'bad_payload');
    });
    await asUser(null, (c) => appError(rate(c, 'x'.repeat(32), 5), 'not_found'));
  });

  it('el enlace sigue abierto 12 h después de completar (para calificar), no más', async () => {
    await asUser(ID.opManizales, async (c) => {
      const token = await deliverByAna(c, ID.reqCable);
      await c.query('reset role');
      await c.query(`update requests set completed_at = now() - interval '11 hours' where id = $1`, [ID.reqCable]);
      assert.ok((await c.query(`select public_tracking($1) as t`, [token])).rows[0].t);
      await c.query(`update requests set completed_at = now() - interval '13 hours' where id = $1`, [ID.reqCable]);
      assert.equal((await c.query(`select public_tracking($1) as t`, [token])).rows[0].t, null);
    });
  });

  it('solo el admin lee las calificaciones', async () => {
    await asUser(ID.opManizales, async (c) => {
      const token = await deliverByAna(c, ID.reqCable);
      await rate(c, token, 4, [], 'Bien');
      assert.equal((await c.query(`select count(*)::int n from driver_ratings`)).rows[0].n, 0);
      await c.query(`select set_config('app.user_id', $1, true)`, [ID.admin]);
      assert.equal((await c.query(`select count(*)::int n from driver_ratings`)).rows[0].n, 1);
      await c.query(`select set_config('app.user_id', $1, true)`, [ID.anaProfile]);
      assert.equal((await c.query(`select count(*)::int n from driver_ratings`)).rows[0].n, 0);
    });
  });

  it('nadie inserta calificaciones directamente', async () => {
    await asUser(ID.admin, (c) =>
      rejectsWith(
        c.query(`insert into driver_ratings (request_id, driver_id, stars) values ($1, $2, 5)`, [ID.reqCable, ID.anaDriver]),
        PERMISSION_DENIED,
      ),
    );
  });
});

describe('estadísticas por conductor', () => {
  it('solo el admin', async () => {
    await asUser(ID.opManizales, (c) => appError(c.query(`select * from driver_stats($1)`, [ID.manizales]), 'forbidden'));
  });

  it('cuenta servicios, ofertas, rechazos y calificaciones, y calcula el puntaje', async () => {
    await asUser(ID.opManizales, async (c) => {
      const token = await deliverByAna(c, ID.reqCable);
      await rate(c, token, 5);
      // Una oferta que Ana deja vencer y otra que rechaza.
      await t(c, ID.reqPalogrande, 'offer', { driver_id: ID.brunoDriver });
      await c.query(`select set_config('app.user_id', $1, true)`, [ID.brunoProfile]);
      await t(c, ID.reqPalogrande, 'reject', { reason: 'rejected' });
      await c.query(`select set_config('app.user_id', $1, true)`, [ID.admin]);
      const { rows } = await c.query(`select * from driver_stats($1, 30)`, [ID.manizales]);
      const ana = rows.find((r) => r.driver_id === ID.anaDriver);
      const bruno = rows.find((r) => r.driver_id === ID.brunoDriver);
      assert.equal(ana.completed, 1);
      assert.equal(ana.offers, 1);
      assert.equal(ana.accepted, 1);
      assert.equal(ana.acceptance_rate, 1);
      assert.equal(ana.ratings_count, 1);
      assert.equal(ana.provisional, true);
      assert.equal(bruno.offers, 1);
      assert.equal(bruno.rejected, 1);
      assert.equal(bruno.acceptance_rate, 0);
      assert.ok(ana.score > bruno.score, `${ana.score} > ${bruno.score}`);
      // Sin datos el puntaje es neutro (78).
      const carlos = rows.find((r) => r.driver_id === ID.carlosDriver);
      assert.equal(carlos.score, 78);
      // No mezcla ciudades.
      assert.ok(!rows.some((r) => r.driver_id === ID.dianaDriver));
    });
  });
});
