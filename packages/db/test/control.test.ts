// Asignación asistida, turnos y alertas de señal perdida (migración 011).
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import type pg from 'pg';
import { ID, asUser, pool } from './helpers.js';

after(() => pool.end());

const t = (c: pg.PoolClient, req: string, action: string, payload: object = {}) =>
  c.query(`select transition_request($1, $2, $3)`, [req, action, JSON.stringify(payload)]);
const become = (c: pg.PoolClient, uid: string) => c.query(`select set_config('app.user_id', $1, true)`, [uid]);
const rank = async (c: pg.PoolClient, req: string, n = 5) =>
  (await c.query(`select * from rank_drivers($1, $2)`, [req, n])).rows as Array<{
    driver_id: string; has_app: boolean; distance_m: number | null; same_sector: boolean; reason: string; services_today: number;
  }>;
const alerts = async (c: pg.PoolClient) =>
  (await c.query(`select driver_id, reason, resolved_at, resolved_by from tracking_alerts order by id`)).rows;

// Deja disponibles a Ana (con app, en vivo junto al Cable) y a Carlos (sin app, en el Centro).
const ready = async (c: pg.PoolClient) => {
  // En vivo: el trigger calcula solo el sector (Cable) a partir de la posición.
  await c.query(
    `update driver_presence set status = 'available', location_mode = 'live', last_seen_at = now(),
       position = st_setsrid(st_makepoint(-75.4906, 5.0566), 4326)::geography
     where driver_id = $1`,
    [ID.anaDriver],
  );
};

describe('asignación asistida (rank_drivers)', () => {
  it('propone primero al más cercano; el que no tiene app pesa +500 m', async () => {
    await asUser(ID.opManizales, async (c) => {
      const rows = await rank(c, ID.reqCable);
      // reqCable es un domicilio en el Cable. Ana (en vivo, ~15 m) gana a Carlos (sin app, Centro).
      assert.equal(rows[0]!.driver_id, ID.anaDriver);
      assert.ok(rows[0]!.distance_m! < 100);
      assert.match(rows[0]!.reason, /^a \d+ m · mismo sector · en vivo/);
      const carlos = rows.find((r) => r.driver_id === ID.carlosDriver);
      assert.ok(carlos);
      assert.match(carlos!.reason, /sin app: se asigna directo/);
    }, ready);
  });

  it('no repite a quien rechazó o dejó vencer el pedido', async () => {
    await asUser(ID.opManizales, async (c) => {
      await t(c, ID.reqCable, 'offer', { driver_id: ID.anaDriver });
      await become(c, ID.anaProfile);
      await t(c, ID.reqCable, 'reject', { reason: 'rejected' });
      await become(c, ID.opManizales);
      const rows = await rank(c, ID.reqCable);
      assert.ok(!rows.some((r) => r.driver_id === ID.anaDriver), 'Ana ya dijo que no');
      assert.equal(rows[0]!.driver_id, ID.carlosDriver);
      // En otro domicilio sí puede volver a salir.
      const other = (
        await c.query(`select id from create_request($1)`, [
          JSON.stringify({ city_zone_id: ID.manizales, service: 'delivery', pickup_text: 'Otro' }),
        ])
      ).rows[0].id as string;
      assert.ok((await rank(c, other)).some((r) => r.driver_id === ID.anaDriver));
    }, ready);
  });

  it('respeta el tipo de servicio y excluye ocupados y desactualizados', async () => {
    await asUser(ID.opManizales, async (c) => {
      // reqPalogrande es transporte: solo Bruno lo presta, y está desconectado en el seed.
      assert.deepEqual((await rank(c, ID.reqPalogrande)).map((r) => r.driver_id), []);
      await c.query(`update driver_presence set status = 'available', location_mode = 'zone', zone_confirmed_at = now() where driver_id = $1`, [ID.brunoDriver]);
    });
    await asUser(
      ID.opManizales,
      async (c) => {
        const rows = await rank(c, ID.reqPalogrande);
        assert.deepEqual(rows.map((r) => r.driver_id), [ID.brunoDriver]);
        await c.query('reset role');
        await c.query(`update driver_presence set status = 'busy' where driver_id = $1`, [ID.brunoDriver]);
        await c.query('set local role app_user');
        assert.deepEqual(await rank(c, ID.reqPalogrande), []);
      },
      (c) =>
        c.query(`update driver_presence set status = 'available', location_mode = 'zone', zone_confirmed_at = now() where driver_id = $1`, [ID.brunoDriver]).then(() => {}),
    );
  });

  it('propose_for_city da la mejor propuesta por pedido sin asignar', async () => {
    await asUser(ID.opManizales, async (c) => {
      const { rows } = await c.query(`select request_id, driver_id, declined from propose_for_city($1)`, [ID.manizales]);
      const cable = rows.find((r) => r.request_id === ID.reqCable);
      assert.equal(cable.driver_id, ID.anaDriver);
      assert.equal(cable.declined, 0);
      // Un pedido que ya se ofreció deja de ser "sin asignar".
      await t(c, ID.reqCable, 'offer', { driver_id: ID.anaDriver });
      const after = await c.query(`select request_id from propose_for_city($1)`, [ID.manizales]);
      assert.ok(!after.rows.some((r) => r.request_id === ID.reqCable));
    }, ready);
  });

  it('un operador de otra ciudad no puede pedir propuestas', async () => {
    await asUser(ID.opVillamaria, (c) => assert.rejects(c.query(`select * from rank_drivers($1)`, [ID.reqCable]), /No tienes acceso/));
    await asUser(ID.opVillamaria, (c) => assert.rejects(c.query(`select * from propose_for_city($1)`, [ID.manizales]), /No tienes acceso/));
  });
});

describe('turnos', () => {
  it('abren al pasar de desconectado a disponible y cierran al desconectarse', async () => {
    await asUser(ID.anaProfile, async (c) => {
      assert.equal((await c.query(`select count(*)::int n from driver_shifts`)).rows[0].n, 0, 'el conductor no lee turnos');
      await c.query(`update driver_presence set status = 'available' where driver_id = $1`, [ID.anaDriver]);
      await c.query(`update driver_presence set status = 'busy' where driver_id = $1`, [ID.anaDriver]);
      await c.query(`update driver_presence set status = 'offline' where driver_id = $1`, [ID.anaDriver]);
      await c.query(`update driver_presence set status = 'available' where driver_id = $1`, [ID.anaDriver]);
      await become(c, ID.opManizales);
      // El seed ya abrió y esta prueba cerró un turno de Ana: contar solo los de esta transacción.
      const { rows } = await c.query(
        `select ended_at is not null as closed from driver_shifts where driver_id = $1 and started_at >= now() order by id`,
        [ID.anaDriver],
      );
      // disponible → ocupado no abre otro turno: queda 1 cerrado y 1 abierto.
      assert.deepEqual(rows.map((r) => r.closed), [true, false]);
    }, (c) => c.query(`update driver_presence set status = 'offline' where driver_id = $1`, [ID.anaDriver]).then(() => {}));
  });

  it('un operador de otra ciudad no ve los turnos', async () => {
    await asUser(ID.opVillamaria, async (c) => {
      assert.equal((await c.query(`select count(*)::int n from driver_shifts`)).rows[0].n, 0);
    });
  });
});

describe('alertas de señal perdida', () => {
  const track = (c: pg.PoolClient) =>
    c.query(`update drivers set tracking_required = true where id = $1`, [ID.anaDriver]);
  const refresh = async (c: pg.PoolClient) => (await c.query(`select refresh_tracking_alerts() as n`)).rows[0].n as number;
  const onShift = (c: pg.PoolClient, lastSeen: string, device: object | null = null) =>
    c.query(
      `update driver_presence set status = 'available', location_mode = 'live', last_seen_at = ${lastSeen},
         device = $2, device_at = case when $2::jsonb is null then null else now() end
       where driver_id = $1`,
      [ID.anaDriver, device ? JSON.stringify(device) : null],
    );
  const asOwner = async (c: pg.PoolClient, fn: () => Promise<unknown>) => {
    await c.query('reset role');
    await fn();
  };

  it('abre la alerta cuando se corta la señal y la cierra al recuperarla', async () => {
    await asUser(ID.admin, async (c) => {
      await c.query('reset role');
      await track(c);
      await onShift(c, 'now()');
      assert.equal(await refresh(c), 0, 'con señal fresca no hay alerta');
      await onShift(c, `now() - interval '5 minutes'`);
      assert.equal(await refresh(c), 1);
      assert.equal(await refresh(c), 0, 'no duplica la alerta abierta');
      let a = await alerts(c);
      assert.equal(a.length, 1);
      assert.equal(a[0]!.reason, 'sin_senal');
      assert.equal(a[0]!.resolved_at, null);
      await onShift(c, 'now()');
      await refresh(c);
      a = await alerts(c);
      assert.equal(a[0]!.resolved_by, 'recuperada');
    });
  });

  it('la causa sale del estado del dispositivo', async () => {
    const cases: [object, string][] = [
      [{ permission: 'foreground', gps_enabled: true, battery: 80 }, 'permiso_revocado'],
      [{ permission: 'always', gps_enabled: false, battery: 80 }, 'gps_apagado'],
      [{ permission: 'always', gps_enabled: true, battery: 3, charging: false }, 'bateria_critica'],
      [{ permission: 'always', gps_enabled: true, battery: 60 }, 'sin_senal'],
    ];
    for (const [device, reason] of cases) {
      await asUser(ID.admin, async (c) => {
        await c.query('reset role');
        await track(c);
        await onShift(c, `now() - interval '5 minutes'`, device);
        await refresh(c);
        assert.equal((await alerts(c))[0]!.reason, reason);
      });
    }
  });

  it('ubicación falsa alerta aunque haya señal', async () => {
    await asUser(ID.admin, async (c) => {
      await c.query('reset role');
      await track(c);
      await onShift(c, 'now()', { permission: 'always', gps_enabled: true, battery: 90, mocked: true });
      assert.equal(await refresh(c), 1);
      assert.equal((await alerts(c))[0]!.reason, 'ubicacion_falsa');
    });
  });

  it('terminar el turno cierra la alerta; sin turno no hay alerta; sin ubicación obligatoria tampoco', async () => {
    await asUser(ID.admin, async (c) => {
      await c.query('reset role');
      await track(c);
      await onShift(c, `now() - interval '5 minutes'`);
      await refresh(c);
      await c.query(`update driver_presence set status = 'offline' where driver_id = $1`, [ID.anaDriver]);
      await refresh(c);
      assert.equal((await alerts(c))[0]!.resolved_by, 'turno_terminado');
      assert.equal(await refresh(c), 0, 'desconectado no genera alerta nueva');
    });
    await asUser(ID.admin, async (c) => {
      await c.query('reset role');
      // Sin tracking_required: señal vieja, pero no se exige.
      await onShift(c, `now() - interval '5 minutes'`);
      assert.equal(await refresh(c), 0);
    });
  });

  it('modo por zona en turno obligatorio también alerta', async () => {
    await asUser(ID.admin, async (c) => {
      await c.query('reset role');
      await track(c);
      await c.query(`update driver_presence set status = 'available', location_mode = 'zone' where driver_id = $1`, [ID.anaDriver]);
      await refresh(c);
      assert.equal((await alerts(c))[0]!.reason, 'modo_sin_gps');
    });
  });

  it('solo el personal de la ciudad lee las alertas; el tablero muestra la alerta abierta', async () => {
    await asUser(ID.admin, async (c) => {
      await c.query('reset role');
      await track(c);
      await onShift(c, `now() - interval '5 minutes'`);
      await refresh(c);
      await asOwner(c, async () => {});
      await c.query('set local role app_user');
      await become(c, ID.opManizales);
      const board = (await c.query(`select alert_reason, tracking_required from driver_board where id = $1`, [ID.anaDriver])).rows[0];
      assert.deepEqual(board, { alert_reason: 'sin_senal', tracking_required: true });
      assert.equal((await c.query(`select count(*)::int n from tracking_alerts`)).rows[0].n, 1);
      await become(c, ID.opVillamaria);
      assert.equal((await c.query(`select count(*)::int n from tracking_alerts`)).rows[0].n, 0);
      await become(c, ID.anaProfile);
      assert.equal((await c.query(`select count(*)::int n from tracking_alerts`)).rows[0].n, 0, 'el conductor no lee alertas');
    });
  });

  it('el conductor reporta el estado de su dispositivo; no el de otro', async () => {
    await asUser(ID.anaProfile, async (c) => {
      const r = await c.query(`update driver_presence set device = $2, device_at = now() where driver_id = $1`, [
        ID.anaDriver,
        JSON.stringify({ permission: 'always', battery: 70 }),
      ]);
      assert.equal(r.rowCount, 1);
      const other = await c.query(`update driver_presence set device = '{}' where driver_id = $1`, [ID.brunoDriver]);
      assert.equal(other.rowCount, 0);
    });
  });
});
