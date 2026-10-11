// Máquina de estados (transition_request) y creación de solicitudes.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import type pg from 'pg';
import { ID, asUser, pool } from './helpers.js';

after(() => pool.end());

const APP_ERROR = 'P0001';

async function appError(p: Promise<unknown>, hint: string): Promise<void> {
  await assert.rejects(p, (err: unknown) => {
    const e = err as { code?: string; hint?: string };
    assert.equal(e.code, APP_ERROR, String(err));
    assert.equal(e.hint, hint, String(err));
    return true;
  });
}

const t = (c: pg.PoolClient, req: string, action: string, payload: object = {}) =>
  c.query(`select * from transition_request($1, $2, $3)`, [req, action, JSON.stringify(payload)]).then((r) => r.rows[0]);

// Cambia de usuario dentro de la misma transacción.
const become = (c: pg.PoolClient, uid: string) => c.query(`select set_config('app.user_id', $1, true)`, [uid]);

const events = async (c: pg.PoolClient, req: string) =>
  (
    await c.query(`select type, from_status, to_status, actor_role from request_events where request_id = $1 order by id`, [
      req,
    ])
  ).rows;

const presence = async (c: pg.PoolClient, driver: string) =>
  (await c.query(`select status from driver_presence where driver_id = $1`, [driver])).rows[0]?.status;

describe('create_request', () => {
  it('crea en created y deja el evento created', async () => {
    await asUser(ID.opManizales, async (c) => {
      const { rows } = await c.query(`select * from create_request($1)`, [
        JSON.stringify({
          city_zone_id: ID.manizales,
          service: 'delivery',
          pickup_text: 'Cable',
          pickup_position: { lat: 5.0565, lng: -75.4905 },
          customer_phone: '3001112233',
        }),
      ]);
      assert.equal(rows[0].status, 'created');
      assert.equal(rows[0].created_by, ID.opManizales);
      assert.deepEqual(await events(c, rows[0].id), [
        { type: 'created', from_status: null, to_status: 'created', actor_role: 'operator' },
      ]);
    });
  });

  it('rechaza otra ciudad y grupos ajenos', async () => {
    await asUser(ID.opVillamaria, (c) =>
      appError(
        c.query(`select create_request($1)`, [
          JSON.stringify({ city_zone_id: ID.manizales, service: 'delivery', pickup_text: 'x' }),
        ]),
        'forbidden',
      ),
    );
    await asUser(ID.opManizales, (c) =>
      appError(
        c.query(`select create_request($1)`, [
          JSON.stringify({
            city_zone_id: ID.manizales,
            service: 'delivery',
            pickup_text: 'x',
            source_group_id: '30000000-0000-0000-0000-000000000003',
          }),
        ]),
        'bad_payload',
      ),
    );
  });
});

describe('transition_request', () => {
  it('flujo completo con oferta: la línea de tiempo queda completa', async () => {
    await asUser(ID.opManizales, async (c) => {
      await t(c, ID.reqCable, 'offer', { driver_id: ID.anaDriver });
      await become(c, ID.anaProfile);
      const accepted = await t(c, ID.reqCable, 'accept');
      assert.equal(accepted.assigned_driver_id, ID.anaDriver);
      assert.equal(await presence(c, ID.anaDriver), 'busy');
      await t(c, ID.reqCable, 'pick_up');
      const done = await t(c, ID.reqCable, 'complete');
      assert.equal(done.status, 'completed');
      assert.ok(done.completed_at);
      assert.equal(await presence(c, ID.anaDriver), 'available');

      await become(c, ID.opManizales);
      assert.deepEqual(await events(c, ID.reqCable), [
        { type: 'created', from_status: null, to_status: 'created', actor_role: 'operator' },
        { type: 'offered', from_status: 'created', to_status: 'offered', actor_role: 'operator' },
        { type: 'assigned', from_status: 'offered', to_status: 'assigned', actor_role: 'driver' },
        { type: 'status_changed', from_status: 'assigned', to_status: 'picked_up', actor_role: 'driver' },
        { type: 'status_changed', from_status: 'picked_up', to_status: 'completed', actor_role: 'driver' },
      ]);
    });
  });

  it('asignación directa a conductor sin app, y el operador cierra el servicio', async () => {
    await asUser(ID.opManizales, async (c) => {
      await t(c, ID.reqCable, 'assign', { driver_id: ID.carlosDriver });
      await t(c, ID.reqCable, 'pick_up');
      const done = await t(c, ID.reqCable, 'complete');
      assert.equal(done.status, 'completed');
      assert.equal((await events(c, ID.reqCable)).length, 4);
    });
  });

  it('rechazo devuelve a created y libera la oferta', async () => {
    await asUser(ID.opManizales, async (c) => {
      await t(c, ID.reqPalogrande, 'offer', { driver_id: ID.brunoDriver });
      await become(c, ID.brunoProfile);
      const r = await t(c, ID.reqPalogrande, 'reject');
      assert.equal(r.status, 'created');
      assert.equal(r.offered_driver_id, null);
    });
  });

  it('reasignar cambia de conductor y libera al anterior', async () => {
    await asUser(ID.opManizales, async (c) => {
      await t(c, ID.reqCable, 'assign', { driver_id: ID.anaDriver });
      assert.equal(await presence(c, ID.anaDriver), 'busy');
      const r = await t(c, ID.reqCable, 'reassign', { driver_id: ID.carlosDriver });
      assert.equal(r.assigned_driver_id, ID.carlosDriver);
      assert.equal(await presence(c, ID.anaDriver), 'available');
      assert.equal(await presence(c, ID.carlosDriver), 'busy');
    });
  });

  it('cancelar exige motivo y es terminal', async () => {
    await asUser(ID.opManizales, async (c) => {
      await appError(t(c, ID.reqCable, 'cancel', {}), 'bad_payload');
    });
    await asUser(ID.opManizales, async (c) => {
      const r = await t(c, ID.reqCable, 'cancel', { reason: 'El cliente ya consiguió' });
      assert.equal(r.status, 'cancelled');
      await appError(t(c, ID.reqCable, 'assign', { driver_id: ID.anaDriver }), 'invalid_transition');
    });
  });

  for (const [action, payload] of [
    ['accept', {}],
    ['reject', {}],
    ['pick_up', {}],
    ['complete', {}],
    ['reassign', { driver_id: ID.anaDriver }],
  ] as const) {
    it(`desde created, ${action} es inválido`, async () => {
      await asUser(ID.opManizales, (c) =>
        appError(t(c, ID.reqCable, action, payload), action === 'accept' ? 'forbidden' : 'invalid_transition'),
      );
    });
  }

  it('no se completa sin haber recogido', async () => {
    await asUser(ID.opManizales, async (c) => {
      await t(c, ID.reqCable, 'assign', { driver_id: ID.carlosDriver });
      await appError(t(c, ID.reqCable, 'complete'), 'invalid_transition');
    });
  });

  it('no se ofrece a un conductor sin app ni de otra ciudad', async () => {
    await asUser(ID.opManizales, (c) =>
      appError(t(c, ID.reqCable, 'offer', { driver_id: ID.carlosDriver }), 'driver_unavailable'),
    );
    await asUser(ID.opManizales, (c) =>
      appError(t(c, ID.reqCable, 'assign', { driver_id: ID.dianaDriver }), 'driver_unavailable'),
    );
  });

  it('un conductor no acepta ofertas ajenas ni toca servicios ajenos', async () => {
    await asUser(ID.opManizales, async (c) => {
      await t(c, ID.reqPalogrande, 'offer', { driver_id: ID.brunoDriver });
      await become(c, ID.anaProfile);
      await appError(t(c, ID.reqPalogrande, 'accept'), 'forbidden');
    });
    await asUser(ID.opManizales, async (c) => {
      await t(c, ID.reqCable, 'assign', { driver_id: ID.anaDriver });
      await become(c, ID.brunoProfile);
      await appError(t(c, ID.reqCable, 'pick_up'), 'forbidden');
    });
  });

  it('un conductor no puede asignar ni cancelar', async () => {
    await asUser(ID.anaProfile, (c) => appError(t(c, ID.reqCable, 'assign', { driver_id: ID.anaDriver }), 'forbidden'));
    await asUser(ID.anaProfile, (c) => appError(t(c, ID.reqCable, 'cancel', { reason: 'x' }), 'forbidden'));
  });

  it('el operador de otra ciudad no puede transicionar', async () => {
    await asUser(ID.opVillamaria, (c) =>
      appError(t(c, ID.reqCable, 'assign', { driver_id: ID.anaDriver }), 'forbidden'),
    );
  });

  it('las notas agregan evento sin cambiar estado, incluso en terminales', async () => {
    await asUser(ID.opManizales, async (c) => {
      await t(c, ID.reqCable, 'cancel', { reason: 'x' });
      const r = await t(c, ID.reqCable, 'note', { text: 'cliente llamó después' });
      assert.equal(r.status, 'cancelled');
      assert.equal((await events(c, ID.reqCable)).at(-1)?.type, 'note');
    });
  });

  it('las ofertas vencidas vuelven a created con motivo timeout', async () => {
    await asUser(
      ID.opManizales,
      async (c) => {
        await t(c, ID.reqPalogrande, 'offer', { driver_id: ID.brunoDriver });
        await c.query('reset role');
        await c.query(`update requests set offered_at = now() - interval '2 minutes' where id = $1`, [ID.reqPalogrande]);
        const { rows } = await c.query(`select expire_offers() as n`);
        assert.equal(rows[0].n, 1);
        const ev = await c.query(
          `select type, payload ->> 'reason' as reason, actor_id from request_events where request_id = $1 order by id desc limit 1`,
          [ID.reqPalogrande],
        );
        assert.deepEqual(ev.rows[0], { type: 'rejected', reason: 'timeout', actor_id: null });
      },
    );
  });
});
