// Turno: de "desconectado" a disponible/ocupado y de vuelta. Mientras dura,
// la ubicación en vivo corre en un servicio en primer plano.
import * as SecureStore from 'expo-secure-store';
import { api } from './api';
import { resetDeviceReport } from './health';
import { startLive, stopLive } from './live';

const KEY = 'shift_started_at';

export async function loadShiftStart(): Promise<number | null> {
  const v = await SecureStore.getItemAsync(KEY);
  return v ? Number(v) : null;
}

export async function saveShiftStart(t: number | null) {
  if (t) await SecureStore.setItemAsync(KEY, String(t));
  else await SecureStore.deleteItemAsync(KEY);
}

export type ShiftResult = { ok: true; startedAt: number } | { ok: false; message: string };

// Pide permisos y arranca el servicio de ubicación; solo si arrancó, avisa al
// servidor que estás disponible. Si el servidor lo rechaza, lo apaga otra vez.
export async function beginShift(pingSeconds: number): Promise<ShiftResult> {
  const live = await startLive(pingSeconds);
  if (!live.ok) return { ok: false, message: live.message };
  try {
    await api('/driver/presence', { method: 'PATCH', body: { status: 'available', location_mode: 'live' } });
  } catch (e) {
    await stopLive();
    return { ok: false, message: e instanceof Error ? e.message : 'No se pudo iniciar el turno' };
  }
  const startedAt = Date.now();
  await saveShiftStart(startedAt);
  resetDeviceReport();
  return { ok: true, startedAt };
}

export async function finishShift(): Promise<void> {
  await stopLive();
  await api('/driver/presence', { method: 'PATCH', body: { status: 'offline', location_mode: 'zone' } }).catch(() => {});
  await saveShiftStart(null);
  resetDeviceReport();
}
