// Enlaces de seguimiento para el cliente.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import type pg from 'pg';
import { ID, asUser, pool } from './helpers.js';

after(() => pool.end());

const t = (c: pg.PoolClient, req: string, action: string, payload: object = {}) =>
  c.query(`select transition_request($1, $2, $3)`, [req, action, JSON.stringify(payload)]);
const become = (c: pg.PoolClient, uid: string) => c.query(`select set_config('app.user_id', $1, true)`, [uid]);
const link = async (c: pg.PoolClient, req: string) =>
  (await c.query(`select * from create_tracking_link($1)`, [req])).rows[0] as { token: string; expires_at: Date };
const track = async (c: pg.PoolClient, token: string) => (await c.query(`select public_tracking($1) as t`, [token])).rows[0].t;

describe('enlaces de seguimiento', () => {
  it('el operador crea un enlace y se reutiliza mientras esté vigente', async () => {
    await asUser(ID.opManizales, async (c) => {
      const a = await link(c, ID.reqCable);
      const b = await link(c, ID.reqCable);
      assert.equal(a.token.length, 32);
      assert.equal(a.token, b.token);
    });
  });

  it('el cliente ve estado y lugares, pero no datos personales', async () => {
    await asUser(ID.opManizales, async (c) => {
      const { token } = await link(c, ID.reqCable);
      await become(c, '');
      const data = await track(c, token);
      assert.equal(data.status, 'created');
      assert.equal(data.pickup.text, 'Droguería, El Cable');
      assert.ok(data.pickup.lat, 'usa el centro del sector si no hay posición');
      const json = JSON.stringify(data);
      assert.ok(!json.includes('3201234567'), 'no expone el teléfono del cliente');
      assert.equal(data.driver, null);
    });
  });

  it('muestra la posición del mensajero solo en servicio y en vivo', async () => {
    await asUser(ID.opManizales, async (c) => {
      await t(c, ID.reqCable, 'assign', { driver_id: ID.anaDriver });
      const { token } = await link(c, ID.reqCable);
      let data = await track(c, token);
      assert.equal(data.driver.name, 'Ana');
      assert.ok(!JSON.stringify(data).includes('3100000001'), 'no expone el teléfono del conductor');
      assert.equal(data.driver_position, null, 'por zona no hay posición exacta');

      await c.query('reset role');
      await c.query(
        `update driver_presence set location_mode = 'live', last_seen_at = now(),
           position = st_setsrid(st_makepoint(-75.49, 5.056), 4326)::geography where driver_id = $1`,
        [ID.anaDriver],
      );
      data = await track(c, token);
      assert.ok(Math.abs(data.driver_position.lat - 5.056) < 1e-6);

      // Al cerrarse el servicio deja de mostrar la posición.
      await c.query('set local role app_user');
      await t(c, ID.reqCable, 'pick_up');
      await t(c, ID.reqCable, 'complete');
      data = await track(c, token);
      assert.equal(data.status, 'completed');
      assert.equal(data.driver_position, null);
    });
  });

  it('el enlace muere 30 min después de cerrar el servicio o al vencer', async () => {
    await asUser(ID.opManizales, async (c) => {
      const { token } = await link(c, ID.reqPalogrande);
      await t(c, ID.reqPalogrande, 'assign', { driver_id: ID.brunoDriver });
      await t(c, ID.reqPalogrande, 'pick_up');
      await t(c, ID.reqPalogrande, 'complete');
      await c.query('reset role');
      await c.query(`update requests set completed_at = now() - interval '31 minutes' where id = $1`, [ID.reqPalogrande]);
      assert.equal(await track(c, token), null);
    });
    await asUser(ID.opManizales, async (c) => {
      const { token } = await link(c, ID.reqCable);
      await c.query('reset role');
      await c.query(`update tracking_links set expires_at = now() - interval '1 second' where token = $1`, [token]);
      assert.equal(await track(c, token), null);
    });
  });

  it('tokens inventados no devuelven nada', async () => {
    await asUser(null, async (c) => {
      assert.equal(await track(c, 'x'.repeat(32)), null);
      assert.equal(await track(c, 'corto'), null);
    });
  });

  it('el conductor asignado puede compartir; otro conductor u otra ciudad no', async () => {
    await asUser(ID.opManizales, async (c) => {
      await t(c, ID.reqCable, 'assign', { driver_id: ID.anaDriver });
      await become(c, ID.anaProfile);
      assert.ok((await link(c, ID.reqCable)).token);
    });
    await asUser(ID.opManizales, async (c) => {
      await t(c, ID.reqCable, 'assign', { driver_id: ID.anaDriver });
      await become(c, ID.brunoProfile);
      await assert.rejects(link(c, ID.reqCable), /No puedes compartir/);
    });
    await asUser(ID.opVillamaria, (c) => assert.rejects(link(c, ID.reqCable), /No puedes compartir/));
  });

  it('nadie lee la tabla de enlaces directamente', async () => {
    await asUser(ID.admin, (c) => assert.rejects(c.query(`select * from tracking_links`), /permission denied/));
  });
});
