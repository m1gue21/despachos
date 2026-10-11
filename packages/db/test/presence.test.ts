// Presencia: caducidad, sector automático en modo live y sugerencias.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { CHECK_VIOLATION, ID, asUser, pool, rejectsWith } from './helpers.js';

after(() => pool.end());

const sector = (slug: string) => `(select id from zones where slug = '${slug}')`;

describe('presencia', () => {
  it('modo zona caduca pasado ZONE_STALE_MINUTES', async () => {
    await asUser(
      ID.opManizales,
      async (c) => {
        const { rows } = await c.query(`select id, is_stale from driver_board where id in ($1, $2) order by id`, [
          ID.anaDriver,
          ID.carlosDriver,
        ]);
        assert.deepEqual(rows, [
          { id: ID.anaDriver, is_stale: false },
          { id: ID.carlosDriver, is_stale: true },
        ]);
      },
      async (c) => {
        // Se salta el trigger que renueva zone_confirmed_at.
        await c.query(`alter table driver_presence disable trigger driver_presence_rules`);
        await c.query(`update driver_presence set zone_confirmed_at = now() - interval '46 minutes' where driver_id = $1`, [
          ID.carlosDriver,
        ]);
        await c.query(`alter table driver_presence enable trigger driver_presence_rules`);
      },
    );
  });

  it('confirmar zona la renueva y firma al operador', async () => {
    await asUser(ID.opManizales, async (c) => {
      const { rows } = await c.query(
        `update driver_presence set sector_zone_id = ${sector('manizales-chipre')}, location_mode = 'zone'
         where driver_id = $1 returning updated_by, zone_confirmed_at > now() - interval '5 seconds' as fresh`,
        [ID.brunoDriver],
      );
      assert.deepEqual(rows[0], { updated_by: ID.opManizales, fresh: true });
    });
  });

  it('en modo live el sector se calcula solo y se guarda historial', async () => {
    await asUser(ID.anaProfile, async (c) => {
      const { rows } = await c.query(
        `update driver_presence
         set location_mode = 'live', position = st_setsrid(st_makepoint(-75.4906, 5.0566), 4326)::geography,
             last_seen_at = now()
         where driver_id = $1 returning sector_zone_id = ${sector('manizales-cable')} as is_cable`,
        [ID.anaDriver],
      );
      assert.equal(rows[0].is_cable, true);
      await c.query('reset role');
      const h = await c.query(`select count(*)::int as n from driver_location_history where driver_id = $1`, [ID.anaDriver]);
      assert.equal(h.rows[0].n, 1);
    });
  });

  it('salir de live borra la posición exacta', async () => {
    await asUser(ID.anaProfile, async (c) => {
      await c.query(
        `update driver_presence set location_mode = 'live',
           position = st_setsrid(st_makepoint(-75.4906, 5.0566), 4326)::geography where driver_id = $1`,
        [ID.anaDriver],
      );
      const { rows } = await c.query(
        `update driver_presence set location_mode = 'zone' where driver_id = $1 returning position`,
        [ID.anaDriver],
      );
      assert.equal(rows[0].position, null);
    });
  });

  it('no acepta un sector de otra ciudad', async () => {
    await asUser(ID.admin, async (c) => {
      await rejectsWith(
        c.query(`update driver_presence set sector_zone_id = ${sector('manizales-centro')} where driver_id = $1`, [
          ID.dianaDriver,
        ]),
        CHECK_VIOLATION,
      );
    });
  });
});

describe('nearby_drivers', () => {
  it('sugiere disponibles del servicio pedido, primero el mismo sector', async () => {
    await asUser(
      ID.opManizales,
      async (c) => {
        const { rows } = await c.query(`select driver_id, same_sector from nearby_drivers($1)`, [ID.reqCable]);
        // reqCable es delivery: Bruno (solo ride) no aparece.
        assert.deepEqual(rows, [
          { driver_id: ID.carlosDriver, same_sector: true },
          { driver_id: ID.anaDriver, same_sector: false },
        ]);
      },
      async (c) => {
        await c.query(`update driver_presence set sector_zone_id = ${sector('manizales-cable')} where driver_id = $1`, [
          ID.carlosDriver,
        ]);
        await c.query(`update driver_presence set status = 'available', location_mode = 'zone',
                         sector_zone_id = ${sector('manizales-cable')} where driver_id = $1`, [ID.brunoDriver]);
      },
    );
  });

  it('no sugiere a ocupados ni caducados', async () => {
    await asUser(
      ID.opManizales,
      async (c) => {
        const { rows } = await c.query(`select driver_id from nearby_drivers($1)`, [ID.reqCable]);
        assert.deepEqual(rows, [{ driver_id: ID.carlosDriver }]);
      },
      async (c) => {
        await c.query(`update driver_presence set status = 'busy' where driver_id = $1`, [ID.anaDriver]);
      },
    );
  });

  it('un operador de otra ciudad no puede pedir sugerencias', async () => {
    await asUser(ID.opVillamaria, (c) =>
      assert.rejects(c.query(`select * from nearby_drivers($1)`, [ID.reqCable])),
    );
  });
});
