// Tarea de ubicación en segundo plano (foreground service en Android).
// Se registra en el ámbito global (index.ts) porque Android puede arrancar
// el JS sin vistas para entregar ubicaciones.
import type { LocationObject } from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { api } from './api';
import { HEARTBEAT_MS, LOCATION_TASK, MIN_MOVE_M } from './config';

interface Ping {
  lat: number;
  lng: number;
  accuracy: number | null;
  at: number;
}

// Estado compartido con la UI (mismo contexto JS cuando la app está viva).
export const liveState = {
  lastFixAt: 0,
  lastSentAt: 0,
  lastSent: null as Ping | null,
  // Solo importa la última posición: si falla el envío, se reintenta con la
  // más reciente y se descartan las viejas.
  pending: null as Ping | null,
  sending: false,
  failures: 0,
  listeners: new Set<() => void>(),
};

function distanceM(a: Ping, b: Ping): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export async function flushPending(): Promise<void> {
  if (liveState.sending || !liveState.pending) return;
  liveState.sending = true;
  const ping = liveState.pending;
  try {
    await api('/driver/location', { body: { lat: ping.lat, lng: ping.lng, accuracy: ping.accuracy }, timeoutMs: 10_000 });
    liveState.lastSent = ping;
    liveState.lastSentAt = Date.now();
    liveState.failures = 0;
    if (liveState.pending === ping) liveState.pending = null;
  } catch {
    liveState.failures++;
  } finally {
    liveState.sending = false;
    liveState.listeners.forEach((fn) => fn());
  }
}

export function handleLocations(locations: LocationObject[]) {
  const last = locations[locations.length - 1];
  if (!last) return;
  const ping: Ping = {
    lat: last.coords.latitude,
    lng: last.coords.longitude,
    accuracy: last.coords.accuracy ?? null,
    at: last.timestamp,
  };
  liveState.lastFixAt = Date.now();
  const moved = !liveState.lastSent || distanceM(liveState.lastSent, ping) >= MIN_MOVE_M;
  const stale = Date.now() - liveState.lastSentAt >= HEARTBEAT_MS;
  if (moved || stale || liveState.pending) {
    liveState.pending = ping;
    void flushPending();
  }
  liveState.listeners.forEach((fn) => fn());
}

TaskManager.defineTask<{ locations: LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data) return;
  handleLocations(data.locations);
});
