// Los enums de packages/shared deben coincidir con los de Postgres.
import assert from 'node:assert/strict';
import { after, it } from 'node:test';
import * as shared from '@despacho/shared';
import { pool } from './helpers.js';

after(() => pool.end());

const pairs: Record<string, readonly string[]> = {
  user_role: shared.USER_ROLES,
  zone_level: shared.ZONE_LEVELS,
  vehicle_type: shared.VEHICLE_TYPES,
  service_type: shared.SERVICE_TYPES,
  driver_status: shared.DRIVER_STATUSES,
  location_mode: shared.LOCATION_MODES,
  request_channel: shared.REQUEST_CHANNELS,
  request_status: shared.REQUEST_STATUSES,
  whatsapp_group_kind: shared.WHATSAPP_GROUP_KINDS,
};

it('enums de shared = enums de la base', async () => {
  for (const [type, values] of Object.entries(pairs)) {
    const { rows } = await pool.query<{ v: string }>(`select unnest(enum_range(null::${type}))::text as v`);
    assert.deepEqual(rows.map((r) => r.v), [...values], type);
  }
});
