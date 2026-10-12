'use client';

// Ubicación en vivo desde el navegador del conductor.
//
// Limitación de la web: el navegador entrega GPS solo con la página abierta y
// la pantalla encendida. Por eso se pide Wake Lock (pantalla siempre
// encendida) y, si deja de llegar ubicación, la página vuelve a modo zona.
import { driverClient } from './api';
import { DEMO } from './demo';

export const HEARTBEAT_MS = 60_000; // aunque no se mueva, enviar al menos cada minuto
export const MIN_MOVE_M = 15; // moverse menos que esto no amerita ping (spec §8)
export const LOCATION_SILENCE_MS = 3 * 60_000; // sin GPS este tiempo → volver a zona

interface Ping {
  lat: number;
  lng: number;
  accuracy: number | null;
}

type Listener = () => void;

function distanceM(a: Ping, b: Ping): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const live = {
  watchId: null as number | null,
  wakeLock: null as WakeLockSentinel | null,
  startedAt: 0,
  lastFixAt: 0,
  lastSentAt: 0,
  lastSent: null as Ping | null,
  // Solo importa la última posición: si falla el envío se reintenta con la
  // más reciente y se descartan las viejas.
  pending: null as Ping | null,
  sending: false,
  failures: 0,
  error: null as string | null,
  listeners: new Set<Listener>(),
};

const emit = () => live.listeners.forEach((fn) => fn());

export async function flushPending(): Promise<void> {
  if (live.sending || !live.pending) return;
  live.sending = true;
  const ping = live.pending;
  try {
    await driverClient.request('/driver/location', { body: { lat: ping.lat, lng: ping.lng, accuracy: ping.accuracy } });
    live.lastSent = ping;
    live.lastSentAt = Date.now();
    live.failures = 0;
    if (live.pending === ping) live.pending = null;
  } catch {
    live.failures++;
  } finally {
    live.sending = false;
    emit();
  }
}

function onPosition(pos: GeolocationPosition) {
  const ping: Ping = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null };
  live.lastFixAt = Date.now();
  live.error = null;
  const moved = !live.lastSent || distanceM(live.lastSent, ping) >= MIN_MOVE_M;
  const due = Date.now() - live.lastSentAt >= HEARTBEAT_MS;
  if (moved || due || live.pending) {
    live.pending = ping;
    void flushPending();
  }
  emit();
}

async function acquireWakeLock() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible') {
      live.wakeLock = await navigator.wakeLock.request('screen');
      live.wakeLock.addEventListener('release', () => {
        live.wakeLock = null;
        emit();
      });
    }
  } catch {
    // Sin Wake Lock (navegador viejo o ahorro de batería): sigue funcionando
    // mientras la pantalla esté encendida.
  }
  emit();
}

// El Wake Lock se suelta al ocultar la página; se recupera al volver.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && live.watchId !== null && !live.wakeLock) void acquireWakeLock();
  });
}

export function isSecureForGeo(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext && 'geolocation' in navigator;
}

export function isLiveRunning(): boolean {
  return live.watchId !== null;
}

// Pide permiso (si hace falta) y arranca el seguimiento. Resuelve cuando llega
// la primera posición o falla.
// Demo: si el navegador no da GPS (p. ej. un computador), se simula un
// recorrido por Manizales para poder probar el modo en vivo.
let fakeTimer: ReturnType<typeof setInterval> | null = null;
function startFakeGps(): { ok: true } {
  let lat = 5.0689 + (Math.random() - 0.5) * 0.01;
  let lng = -75.5174 + (Math.random() - 0.5) * 0.01;
  let h = Math.random() * Math.PI * 2;
  const step = () => {
    h += (Math.random() - 0.5) * 0.8;
    lat += Math.sin(h) * 0.00025;
    lng += Math.cos(h) * 0.00025;
    onPosition({ coords: { latitude: lat, longitude: lng, accuracy: 15 } } as GeolocationPosition);
  };
  live.startedAt = Date.now();
  live.watchId = -1;
  step();
  fakeTimer = setInterval(step, 5000);
  void acquireWakeLock();
  return { ok: true };
}

export function startLive(): Promise<{ ok: true } | { ok: false; message: string }> {
  if (DEMO && live.watchId === null && !isSecureForGeo()) return Promise.resolve(startFakeGps());
  if (!isSecureForGeo()) {
    return Promise.resolve({
      ok: false,
      message: 'El navegador solo da la ubicación en páginas seguras (https). Pide al operador el enlace con https.',
    });
  }
  if (live.watchId !== null) return Promise.resolve({ ok: true });
  return new Promise((resolve) => {
    let settled = false;
    live.startedAt = Date.now();
    live.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        onPosition(pos);
        if (!settled) {
          settled = true;
          void acquireWakeLock();
          resolve({ ok: true });
        }
      },
      (err) => {
        const message =
          err.code === err.PERMISSION_DENIED
            ? 'Permiso de ubicación denegado. Actívalo en los ajustes del navegador para este sitio.'
            : err.code === err.TIMEOUT
              ? 'El GPS tarda en responder. Sal a un lugar despejado e inténtalo de nuevo.'
              : 'No se pudo obtener la ubicación.';
        live.error = message;
        emit();
        if (!settled) {
          settled = true;
          stopLive();
          resolve(DEMO ? startFakeGps() : { ok: false, message });
        }
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 },
    );
  });
}

export function stopLive() {
  if (fakeTimer) clearInterval(fakeTimer);
  fakeTimer = null;
  if (live.watchId !== null && live.watchId >= 0) navigator.geolocation.clearWatch(live.watchId);
  live.watchId = null;
  void live.wakeLock?.release().catch(() => {});
  live.wakeLock = null;
  live.pending = null;
  emit();
}
