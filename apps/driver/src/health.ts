// Estado del celular que el despacho necesita saber para explicar por qué se
// perdió la señal: permiso, GPS, batería y ubicación simulada.
import type { DeviceState } from '@despacho/shared';
import Constants from 'expo-constants';
import * as Battery from 'expo-battery';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { api } from './api';
import { batteryPercent, shouldReport } from './device-logic';

export async function readDeviceState(mocked: boolean): Promise<DeviceState> {
  const [fg, bg, gps, level, state] = await Promise.all([
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync(),
    Location.hasServicesEnabledAsync().catch(() => true),
    Battery.getBatteryLevelAsync().catch(() => -1),
    Battery.getBatteryStateAsync().catch(() => Battery.BatteryState.UNKNOWN),
  ]);
  return {
    permission: bg.granted ? 'always' : fg.granted ? 'foreground' : 'denied',
    gps_enabled: gps,
    battery: batteryPercent(level),
    charging: state === Battery.BatteryState.CHARGING || state === Battery.BatteryState.FULL,
    mocked,
    app_version: Constants.expoConfig?.version ?? '0',
    os: `${Platform.OS} ${Platform.Version}`,
  };
}

let last: { state: DeviceState; at: number } | null = null;

// Reporta al servidor si toca (cada minuto o si cambió algo importante).
// Devuelve el estado leído para que la pantalla lo muestre.
export async function reportDevice(mocked: boolean, force = false): Promise<DeviceState> {
  const state = await readDeviceState(mocked);
  const now = Date.now();
  if (force || shouldReport(last?.state ?? null, state, last?.at ?? 0, now)) {
    try {
      await api('/driver/device', { body: state, timeoutMs: 8_000 });
      last = { state, at: now };
    } catch {
      // Sin red: se reintenta en el siguiente ciclo.
    }
  }
  return state;
}

export function resetDeviceReport() {
  last = null;
}
