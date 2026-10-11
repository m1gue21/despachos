// Tests de RLS y permisos (sección 7 del spec). Requieren `pnpm db:reset`.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { CHECK_VIOLATION, ID, PERMISSION_DENIED, asUser, count, pool, rejectsWith } from './helpers.js';

after(() => pool.end());

describe('aislamiento por ciudad (operadores)', () => {
  it('el operador de Villamaría no ve solicitudes de Manizales', async () => {
    await asUser(ID.opVillamaria, async (c) => {
      assert.equal(await count(c, `select 1 from requests where city_zone_id = $1`, [ID.manizales]), 0);
      assert.equal(await count(c, `select 1 from requests`), 1);
    });
  });

  it('el operador de Manizales ve las suyas y no las de Villamaría', async () => {
    await asUser(ID.opManizales, async (c) => {
      assert.equal(await count(c, `select 1 from requests where city_zone_id = $1`, [ID.manizales]), 2);
      assert.equal(await count(c, `select 1 from requests where city_zone_id = $1`, [ID.villamaria]), 0);
    });
  });

  it('tampoco ve conductores, presencia, grupos ni eventos de otra ciudad', async () => {
    await asUser(ID.opVillamaria, async (c) => {
      assert.deepEqual((await c.query(`select id from drivers`)).rows.map((r) => r.id), [ID.dianaDriver]);
      assert.equal(await count(c, `select 1 from driver_presence where driver_id = $1`, [ID.anaDriver]), 0);
      assert.equal(await count(c, `select 1 from whatsapp_groups where city_zone_id = $1`, [ID.manizales]), 0);
      assert.equal(await count(c, `select 1 from request_events where request_id = $1`, [ID.reqCable]), 0);
    });
  });

  it('no puede crear solicitudes en una ciudad ajena', async () => {
    await asUser(ID.opVillamaria, (c) =>
      rejectsWith(
        c.query(
          `insert into requests (city_zone_id, service, pickup_text, created_by) values ($1, 'delivery', 'x', $2)`,
          [ID.manizales, ID.opVillamaria],
        ),
        PERMISSION_DENIED,
      ),
    );
  });

  it('sí puede crear en su ciudad, a su nombre', async () => {
    await asUser(ID.opVillamaria, async (c) => {
      const { rows } = await c.query(
        `insert into requests (city_zone_id, service, pickup_text, created_by)
         values ($1, 'delivery', 'Parque', $2) returning status`,
        [ID.villamaria, ID.opVillamaria],
      );
      assert.equal(rows[0].status, 'created');
    });
  });

  it('no puede firmar una solicitud a nombre de otro', async () => {
    await asUser(ID.opManizales, (c) =>
      rejectsWith(
        c.query(
          `insert into requests (city_zone_id, service, pickup_text, created_by) values ($1, 'delivery', 'x', $2)`,
          [ID.manizales, ID.admin],
        ),
        PERMISSION_DENIED,
      ),
    );
  });

  it('el admin ve todas las ciudades', async () => {
    await asUser(ID.admin, async (c) => {
      assert.equal(await count(c, `select 1 from requests`), 3);
      assert.equal(await count(c, `select 1 from drivers`), 4);
    });
  });
});

describe('conductores', () => {
  it('un conductor no puede leer a otro', async () => {
    await asUser(ID.anaProfile, async (c) => {
      assert.deepEqual((await c.query(`select id from drivers`)).rows.map((r) => r.id), [ID.anaDriver]);
      assert.equal(await count(c, `select 1 from drivers where id = $1`, [ID.brunoDriver]), 0);
      assert.deepEqual((await c.query(`select driver_id from driver_presence`)).rows.map((r) => r.driver_id), [
        ID.anaDriver,
      ]);
    });
  });

  it('no puede actualizar la presencia de otro (0 filas)', async () => {
    await asUser(ID.anaProfile, async (c) => {
      const r = await c.query(`update driver_presence set status = 'busy' where driver_id = $1`, [ID.brunoDriver]);
      assert.equal(r.rowCount, 0);
    });
  });

  it('actualiza su propia presencia y la base firma updated_by', async () => {
    await asUser(ID.anaProfile, async (c) => {
      const { rows } = await c.query(
        `update driver_presence set status = 'busy' where driver_id = $1 returning status, updated_by`,
        [ID.anaDriver],
      );
      assert.deepEqual(rows[0], { status: 'busy', updated_by: ID.anaProfile });
    });
  });

  it('no puede editar su ficha de conductor', async () => {
    await asUser(ID.anaProfile, async (c) => {
      const r = await c.query(`update drivers set display_name = 'Otra' where id = $1`, [ID.anaDriver]);
      assert.equal(r.rowCount, 0);
    });
  });

  it('solo ve solicitudes asignadas a él', async () => {
    await asUser(
      ID.anaProfile,
      async (c) => {
        const { rows } = await c.query(`select id, customer_phone from requests`);
        assert.deepEqual(rows, [{ id: ID.reqCable, customer_phone: '3201234567' }]);
      },
      (c) => c.query(`update requests set status = 'assigned', assigned_driver_id = $1 where id = $2`, [
        ID.anaDriver,
        ID.reqCable,
      ]).then(() => {}),
    );
  });

  it('ve su oferta sin los datos del cliente; otro conductor no la ve', async () => {
    const offer = (c: import('pg').PoolClient) =>
      c.query(`update requests set status = 'offered', offered_driver_id = $1, offered_at = now() where id = $2`, [
        ID.brunoDriver,
        ID.reqPalogrande,
      ]).then(() => {});

    await asUser(
      ID.brunoProfile,
      async (c) => {
        const { rows, fields } = await c.query(`select * from driver_offers`);
        assert.equal(rows.length, 1);
        assert.equal(rows[0].id, ID.reqPalogrande);
        assert.ok(rows[0].offer_expires_at instanceof Date);
        const cols = fields.map((f) => f.name);
        assert.ok(!cols.includes('customer_phone') && !cols.includes('customer_name'));
        // Ofrecida no es asignada: la tabla no se la muestra.
        assert.equal(await count(c, `select 1 from requests`), 0);
      },
      offer,
    );
    await asUser(ID.anaProfile, async (c) => assert.equal(await count(c, `select 1 from driver_offers`), 0), offer);
  });

  it('no puede escribir su historial a nombre de otro', async () => {
    await asUser(ID.anaProfile, (c) =>
      rejectsWith(
        c.query(`insert into driver_location_history (driver_id, position) values ($1, 'POINT(-75.5 5.06)')`, [
          ID.brunoDriver,
        ]),
        PERMISSION_DENIED,
      ),
    );
  });
});

describe('estados solo por transition_request', () => {
  it('el conductor no puede cambiar el status de una solicitud', async () => {
    await asUser(ID.anaProfile, (c) =>
      rejectsWith(c.query(`update requests set status = 'completed' where id = $1`, [ID.reqCable]), PERMISSION_DENIED),
    );
  });

  it('el operador tampoco, aunque sí edita notas', async () => {
    await asUser(ID.opManizales, async (c) => {
      const r = await c.query(`update requests set notes = 'portería 2' where id = $1`, [ID.reqCable]);
      assert.equal(r.rowCount, 1);
    });
    for (const sql of [
      `update requests set status = 'assigned' where id = $1`,
      `update requests set assigned_driver_id = '${ID.anaDriver}' where id = $1`,
    ]) {
      await asUser(ID.opManizales, (c) => rejectsWith(c.query(sql, [ID.reqCable]), PERMISSION_DENIED));
    }
  });

  it('no se puede crear una solicitud ya completada', async () => {
    await asUser(ID.opManizales, (c) =>
      rejectsWith(
        c.query(
          `insert into requests (city_zone_id, service, pickup_text, created_by, status)
           values ($1, 'delivery', 'x', $2, 'completed')`,
          [ID.manizales, ID.opManizales],
        ),
        PERMISSION_DENIED,
      ),
    );
  });

  it('nadie escribe request_events directamente', async () => {
    await asUser(ID.admin, (c) =>
      rejectsWith(
        c.query(`insert into request_events (request_id, type) values ($1, 'note')`, [ID.reqCable]),
        PERMISSION_DENIED,
      ),
    );
  });

  it('request_events es append-only incluso para el dueño', async () => {
    const c = await pool.connect();
    try {
      await c.query('begin');
      await rejectsWith(c.query(`delete from request_events`), PERMISSION_DENIED);
    } finally {
      await c.query('rollback');
      c.release();
    }
  });
});

describe('sesión y cuentas', () => {
  it('sin sesión no se ve nada', async () => {
    await asUser(null, async (c) => {
      for (const t of ['requests', 'drivers', 'driver_presence', 'zones', 'profiles', 'app_settings']) {
        assert.equal(await count(c, `select 1 from ${t}`), 0, t);
      }
    });
  });

  it('app_users es inaccesible para el API', async () => {
    await asUser(ID.admin, (c) => rejectsWith(c.query(`select * from app_users`), PERMISSION_DENIED));
  });

  it('auth_login valida la contraseña', async () => {
    await asUser(null, async (c) => {
      const ok = await c.query(`select auth_login('ADMIN@despacho.local', 'dev12345') as id`);
      assert.equal(ok.rows[0].id, ID.admin);
      const bad = await c.query(`select auth_login('admin@despacho.local', 'otra') as id`);
      assert.equal(bad.rows[0].id, null);
    });
  });

  it('un usuario no puede subirse de rol', async () => {
    await asUser(ID.opManizales, (c) =>
      rejectsWith(c.query(`update profiles set role = 'admin' where id = $1`, [ID.opManizales]), PERMISSION_DENIED),
    );
  });

  it('un operador no puede darse acceso a otra ciudad', async () => {
    await asUser(ID.opManizales, (c) =>
      rejectsWith(
        c.query(`insert into operator_zones values ($1, $2)`, [ID.opManizales, ID.villamaria]),
        PERMISSION_DENIED,
      ),
    );
  });

  it('el operador lee los sectores y ajustes, pero no los cambia', async () => {
    await asUser(ID.opManizales, async (c) => {
      assert.equal(await count(c, `select 1 from zones where parent_id = $1`, [ID.manizales]), 10);
      const r = await c.query(`update zones set name = 'X' where slug = 'manizales-centro'`);
      assert.equal(r.rowCount, 0);
    });
  });
});

describe('integridad de zonas', () => {
  it('un sector necesita una ciudad como padre', async () => {
    await asUser(ID.admin, async (c) => {
      const { rows } = await c.query(`select id from zones where slug = 'manizales-centro'`);
      await rejectsWith(
        c.query(`insert into zones (parent_id, level, name, slug) values ($1, 'sector', 'Sub', 'sub')`, [rows[0].id]),
        CHECK_VIOLATION,
      );
    });
  });

  it('un conductor no puede colgar de un sector en lugar de una ciudad', async () => {
    await asUser(ID.opManizales, async (c) => {
      const { rows } = await c.query(`select id from zones where slug = 'manizales-centro'`);
      await rejectsWith(
        c.query(
          `insert into drivers (city_zone_id, display_name, phone, vehicle) values ($1, 'X', '1', 'moto')`,
          [rows[0].id],
        ),
        CHECK_VIOLATION,
      );
    });
  });

  it('setting_int devuelve el global si la ciudad no tiene propio', async () => {
    await asUser(ID.opManizales, async (c) => {
      const { rows } = await c.query(`select setting_int('ZONE_STALE_MINUTES', $1) as v`, [ID.manizales]);
      assert.equal(rows[0].v, 45);
    });
  });
});
