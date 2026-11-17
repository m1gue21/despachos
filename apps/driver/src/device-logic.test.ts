import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DeviceState } from '@despacho/shared';
import { batteryPercent, deviceProblems, shiftDuration, shouldReport, signalAge } from './device-logic';

const ok: DeviceState = { permission: 'always', gps_enabled: true, battery: 80, charging: false, mocked: false, app_version: '0.2.0', os: 'android 14' };

describe('deviceProblems', () => {
  it('un celular en regla no tiene problemas', () => assert.deepEqual(deviceProblems(ok), []));
  it('detecta permiso, GPS, batería baja y ubicación falsa', () => {
    assert.deepEqual(deviceProblems({ ...ok, permission: 'foreground' }).map((p) => p.id), ['permission']);
    assert.deepEqual(deviceProblems({ ...ok, permission: 'denied' }).map((p) => p.id), ['permission']);
    assert.deepEqual(deviceProblems({ ...ok, gps_enabled: false }).map((p) => p.id), ['gps']);
    assert.deepEqual(deviceProblems({ ...ok, battery: 10 }).map((p) => p.id), ['battery']);
    assert.deepEqual(deviceProblems({ ...ok, mocked: true }).map((p) => p.id), ['mock']);
    assert.equal(deviceProblems({ ...ok, permission: 'denied', gps_enabled: false, battery: 3, mocked: true }).length, 4);
  });
  it('batería baja pero cargando, o sin dato de batería, no es problema', () => {
    assert.deepEqual(deviceProblems({ ...ok, battery: 5, charging: true }), []);
    assert.deepEqual(deviceProblems({ ...ok, battery: null }), []);
  });
});

describe('tiempos', () => {
  it('duración del turno', () => {
    const t = 1_000_000;
    assert.equal(shiftDuration(t, t + 30_000), '0 min');
    assert.equal(shiftDuration(t, t + 45 * 60_000), '45 min');
    assert.equal(shiftDuration(t, t + 75 * 60_000), '1 h 15 min');
    assert.equal(shiftDuration(t, t - 5), '0 min');
  });
  it('antigüedad de la señal', () => {
    assert.equal(signalAge(0, 5000), 'esperando GPS…');
    assert.equal(signalAge(1000, 13_000), 'hace 12 s');
    assert.equal(signalAge(0 + 1, 181_000), 'hace 3 min');
  });
  it('batería', () => {
    assert.equal(batteryPercent(0.64), 64);
    assert.equal(batteryPercent(-1), null);
  });
});

describe('shouldReport', () => {
  it('reporta la primera vez, cada minuto y ante cambios importantes', () => {
    assert.equal(shouldReport(null, ok, 0, 1000), true);
    assert.equal(shouldReport(ok, ok, 1000, 30_000), false, 'sin cambios y reciente');
    assert.equal(shouldReport(ok, ok, 1000, 62_000), true, 'pasó un minuto');
    assert.equal(shouldReport(ok, { ...ok, gps_enabled: false }, 1000, 5000), true, 'apagó el GPS');
    assert.equal(shouldReport(ok, { ...ok, permission: 'foreground' }, 1000, 5000), true);
    assert.equal(shouldReport(ok, { ...ok, battery: 79 }, 1000, 5000), false, 'la batería sola no urge');
  });
});
