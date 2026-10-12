// Motor del modo demo: estado en localStorage, compartido entre pestañas del
// mismo navegador, con las mismas reglas que la base (permisos por ciudad,
// máquina de estados, caducidad, sugerencias, seguimiento).
import type { DriverRow, RequestRow, RequestStatus, UserRole } from '@despacho/shared';
import { CONSENT_VERSION, type MDriver, type MRequest, type MState, type MUser, STATE_VERSION, buildSeed } from './data';

const KEY = 'despacho.mock.state';
const CHANNEL = 'despacho-mock';

// ── Errores con la misma forma que el API ───────────────────────────────
export class MockError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const fail = (status: number, code: string, message: string): never => {
  throw new MockError(status, code, message);
};

// ── Estado ──────────────────────────────────────────────────────────────
let state: MState | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function load(): MState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as MState;
      if (s.version === STATE_VERSION) return s;
    }
  } catch {}
  const s = buildSeed();
  persist(s);
  return s;
}

function persist(s: MState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Sin almacenamiento: la demo vive solo en esta pestaña.
  }
}

export function db(): MState {
  state ??= load();
  return state;
}

export function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (state) persist(state);
  }, 50);
}

export function resetDemo() {
  state = buildSeed();
  persist(state);
  broadcast({ table: 'reset', op: 'RESET', id: null, city: null, type: null, drivers: [] }, true);
}

// ── Avisos de "tiempo real" entre pestañas ──────────────────────────────
export interface MockChange {
  table: string;
  op: string;
  id: string | null;
  city: string | null;
  type: string | null;
  drivers: string[];
}
type Listener = (c: MockChange) => void;
const listeners = new Set<Listener>();
let channel: BroadcastChannel | null = null;

export function initSync() {
  if (typeof window === 'undefined' || channel) return;
  if ('BroadcastChannel' in window) {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (e) => {
      // Otra pestaña cambió el estado: releerlo y avisar a las vistas.
      state = null;
      listeners.forEach((fn) => fn(e.data as MockChange));
    };
  }
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) state = null;
  });
}

export function onChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function broadcast(c: MockChange, flushNow = false) {
  if (flushNow && state) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    persist(state);
  } else save();
  listeners.forEach((fn) => fn(c));
  // Se envía después de persistir para que la otra pestaña lea lo nuevo.
  setTimeout(() => {
    if (state) persist(state);
    channel?.postMessage(c);
  }, 60);
}

export const now = () => Date.now();
export const iso = (ms = Date.now()) => new Date(ms).toISOString();

// ── Sesión (token = usuario codificado; es una demo) ────────────────────
export function makeToken(userId: string) {
  return `demo.${btoa(userId)}`;
}
export function userFromToken(token: string | null): MUser | null {
  if (!token?.startsWith('demo.')) return null;
  try {
    const id = atob(token.slice(5));
    return db().users.find((u) => u.id === id && u.active) ?? null;
  } catch {
    return null;
  }
}

export function citiesOf(u: MUser): string[] {
  const s = db();
  if (u.role === 'admin') return s.zones.filter((z) => z.level === 'city' && z.active).map((z) => z.id);
  if (u.role === 'operator') return s.operatorZones.filter((o) => o.operator_id === u.id).map((o) => o.zone_id);
  const d = s.drivers.find((x) => x.profile_id === u.id && x.active);
  return d ? [d.city_zone_id] : [];
}
export const canManage = (u: MUser, city: string) => u.role === 'admin' || (u.role === 'operator' && citiesOf(u).includes(city));
export const myDriver = (u: MUser): MDriver | null =>
  u.role === 'driver' ? (db().drivers.find((d) => d.profile_id === u.id && d.active) ?? null) : null;

// ── Geografía ───────────────────────────────────────────────────────────
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const h =
    Math.sin(toRad(b.lat - a.lat) / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(toRad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function pointInPolygon(lat: number, lng: number, poly: [number, number][]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Igual que resolve_sector: polígono, o el centro más cercano a < 1,5 km.
export function resolveSector(lat: number, lng: number, city: string): string | null {
  const sectors = db().zones.filter((z) => z.level === 'sector' && z.active && z.parent_id === city);
  const inPoly = sectors.find((z) => z.polygon && pointInPolygon(lat, lng, z.polygon));
  if (inPoly) return inPoly.id;
  let best: { id: string; d: number } | null = null;
  for (const z of sectors) {
    if (z.lat == null || z.lng == null) continue;
    const d = distanceM({ lat, lng }, { lat: z.lat, lng: z.lng });
    if (d < 1500 && (!best || d < best.d)) best = { id: z.id, d };
  }
  return best?.id ?? null;
}

// ── Vistas (mismas formas que el API) ───────────────────────────────────
export function board(d: MDriver): DriverRow {
  const s = db();
  const p = s.presence[d.id]!;
  const sector = s.zones.find((z) => z.id === p.sector_zone_id) ?? null;
  const t = now();
  const isStale =
    p.location_mode === 'live'
      ? !p.last_seen_at || t - new Date(p.last_seen_at).getTime() > s.settings.LIVE_STALE_SECONDS! * 1000
      : p.location_mode === 'zone'
        ? !p.zone_confirmed_at || t - new Date(p.zone_confirmed_at).getTime() > s.settings.ZONE_STALE_MINUTES! * 60_000
        : true;
  return {
    id: d.id,
    city_zone_id: d.city_zone_id,
    display_name: d.display_name,
    phone: d.phone,
    vehicle: d.vehicle,
    plate: d.plate,
    service_types: d.service_types,
    has_app: d.has_app,
    active: d.active,
    profile_id: d.profile_id,
    status: p.status,
    location_mode: p.location_mode,
    sector_zone_id: p.sector_zone_id,
    sector_name: sector?.name ?? null,
    lat: p.location_mode === 'live' ? p.lat : null,
    lng: p.location_mode === 'live' ? p.lng : null,
    sector_lat: sector?.lat ?? null,
    sector_lng: sector?.lng ?? null,
    accuracy_m: p.accuracy_m,
    last_seen_at: p.last_seen_at,
    zone_confirmed_at: p.zone_confirmed_at,
    updated_by: p.updated_by,
    updated_at: p.updated_at,
    is_stale: isStale,
    active_requests: s.requests.filter((r) => r.assigned_driver_id === d.id && (r.status === 'assigned' || r.status === 'picked_up')).length,
  };
}

export function requestRow(r: MRequest): RequestRow {
  const s = db();
  const z = (id: string | null) => (id ? (s.zones.find((x) => x.id === id) ?? null) : null);
  const d = (id: string | null) => (id ? (s.drivers.find((x) => x.id === id) ?? null) : null);
  const ps = z(r.pickup_sector_id);
  const ds = z(r.dropoff_sector_id);
  return {
    id: r.id,
    city_zone_id: r.city_zone_id,
    channel: r.channel,
    service: r.service,
    status: r.status,
    source_group_id: r.source_group_id,
    source_group_name: s.groups.find((g) => g.id === r.source_group_id)?.name ?? null,
    raw_text: r.raw_text,
    pickup_text: r.pickup_text,
    pickup_sector_id: r.pickup_sector_id,
    pickup_sector_name: ps?.name ?? null,
    pickup_lat: r.pickup_lat,
    pickup_lng: r.pickup_lng,
    pickup_sector_lat: ps?.lat ?? null,
    pickup_sector_lng: ps?.lng ?? null,
    dropoff_text: r.dropoff_text,
    dropoff_sector_id: r.dropoff_sector_id,
    dropoff_sector_name: ds?.name ?? null,
    dropoff_lat: r.dropoff_lat,
    dropoff_lng: r.dropoff_lng,
    customer_name: r.customer_name,
    customer_phone: r.customer_phone,
    notes: r.notes,
    offered_driver_id: r.offered_driver_id,
    offered_driver_name: d(r.offered_driver_id)?.display_name ?? null,
    offered_at: r.offered_at,
    assigned_driver_id: r.assigned_driver_id,
    assigned_driver_name: d(r.assigned_driver_id)?.display_name ?? null,
    assigned_driver_phone: d(r.assigned_driver_id)?.phone ?? null,
    created_by: r.created_by,
    created_at: r.created_at,
    assigned_at: r.assigned_at,
    completed_at: r.completed_at,
    cancel_reason: r.cancel_reason,
  };
}

// ── Eventos y máquina de estados (espejo de transition_request) ─────────
export function addEvent(
  r: MRequest,
  type: string,
  from: RequestStatus | null,
  to: RequestStatus | null,
  actor: MUser | null,
  payload: Record<string, unknown>,
) {
  const s = db();
  s.events.push({
    id: s.nextEventId++,
    request_id: r.id,
    type,
    from_status: from,
    to_status: to,
    actor_id: actor?.id ?? null,
    actor_role: (actor?.role ?? null) as UserRole | null,
    payload,
    created_at: iso(),
  });
}

function syncBusy(driverId: string | null) {
  if (!driverId) return;
  const s = db();
  const p = s.presence[driverId];
  if (!p) return;
  const active = s.requests.some((r) => r.assigned_driver_id === driverId && (r.status === 'assigned' || r.status === 'picked_up'));
  if (active && p.status !== 'busy') p.status = 'busy';
  if (!active && p.status === 'busy') p.status = 'available';
  p.updated_at = iso();
}

const STATUS_ES: Record<string, string> = {
  created: 'created',
  offered: 'offered',
  assigned: 'assigned',
  picked_up: 'picked_up',
};

export function applyTransition(r: MRequest, action: string, payload: Record<string, unknown>, actor: MUser | null) {
  const s = db();
  const prev = r.status;
  const oldDriver = r.assigned_driver_id;
  const driverOk = (id: unknown, needsApp: boolean) => {
    const d = s.drivers.find((x) => x.id === id);
    return Boolean(d && d.active && d.city_zone_id === r.city_zone_id && (!needsApp || d.has_app));
  };
  if (action !== 'note' && (prev === 'completed' || prev === 'cancelled')) {
    fail(409, 'invalid_transition', `La solicitud ya está ${prev === 'completed' ? 'completada' : 'cancelada'}`);
  }
  let type = '';
  let p = { ...payload };
  switch (action) {
    case 'offer':
      if (prev !== 'created') fail(409, 'invalid_transition', `No se puede ofrecer desde ${STATUS_ES[prev]}`);
      if (!payload.driver_id) fail(400, 'bad_payload', 'Falta driver_id');
      if (!driverOk(payload.driver_id, true)) fail(409, 'driver_unavailable', 'El conductor no está activo, no es de esta ciudad o no tiene la app');
      r.status = 'offered';
      r.offered_driver_id = String(payload.driver_id);
      r.offered_at = iso();
      type = 'offered';
      break;
    case 'accept':
      if (prev !== 'offered') fail(409, 'invalid_transition', `No se puede aceptar desde ${STATUS_ES[prev]}`);
      r.status = 'assigned';
      r.assigned_driver_id = r.offered_driver_id;
      r.assigned_at = iso();
      p = { ...p, driver_id: r.offered_driver_id, via: 'accept' };
      r.offered_driver_id = null;
      r.offered_at = null;
      type = 'assigned';
      break;
    case 'reject':
      if (prev !== 'offered') fail(409, 'invalid_transition', `No se puede rechazar desde ${STATUS_ES[prev]}`);
      p = { ...p, driver_id: r.offered_driver_id, reason: (payload.reason as string) ?? 'rejected' };
      r.status = 'created';
      r.offered_driver_id = null;
      r.offered_at = null;
      type = 'rejected';
      break;
    case 'assign':
      if (prev !== 'created' && prev !== 'offered') fail(409, 'invalid_transition', `No se puede asignar desde ${STATUS_ES[prev]}`);
      if (!payload.driver_id) fail(400, 'bad_payload', 'Falta driver_id');
      if (!driverOk(payload.driver_id, false)) fail(409, 'driver_unavailable', 'El conductor no está activo o no es de esta ciudad');
      r.status = 'assigned';
      r.assigned_driver_id = String(payload.driver_id);
      r.assigned_at = iso();
      r.offered_driver_id = null;
      r.offered_at = null;
      p = { ...p, via: 'direct' };
      type = 'assigned';
      break;
    case 'reassign':
      if (prev !== 'assigned') fail(409, 'invalid_transition', 'Solo se reasigna una solicitud asignada');
      if (!payload.driver_id) fail(400, 'bad_payload', 'Falta driver_id');
      if (payload.driver_id === oldDriver) fail(400, 'bad_payload', 'Ya está asignada a ese conductor');
      if (!driverOk(payload.driver_id, false)) fail(409, 'driver_unavailable', 'El conductor no está activo o no es de esta ciudad');
      r.assigned_driver_id = String(payload.driver_id);
      r.assigned_at = iso();
      p = { ...p, from_driver_id: oldDriver, driver_id: r.assigned_driver_id };
      type = 'reassigned';
      break;
    case 'pick_up':
      if (prev !== 'assigned') fail(409, 'invalid_transition', 'No se puede marcar recogido desde ese estado');
      r.status = 'picked_up';
      type = 'status_changed';
      break;
    case 'complete':
      if (prev !== 'picked_up') fail(409, 'invalid_transition', 'No se puede completar sin haber recogido');
      r.status = 'completed';
      r.completed_at = iso();
      type = 'status_changed';
      break;
    case 'cancel':
      if (!String(payload.reason ?? '').trim()) fail(400, 'bad_payload', 'Falta el motivo de cancelación');
      r.status = 'cancelled';
      r.cancel_reason = String(payload.reason).trim();
      r.offered_driver_id = null;
      r.offered_at = null;
      type = 'cancelled';
      break;
    case 'note':
      if (!String(payload.text ?? '').trim()) fail(400, 'bad_payload', 'La nota está vacía');
      type = 'note';
      break;
    default:
      fail(400, 'bad_payload', `Acción desconocida: ${action}`);
  }
  addEvent(r, type, prev, r.status, actor, p);
  syncBusy(oldDriver);
  if (r.assigned_driver_id !== oldDriver) syncBusy(r.assigned_driver_id);
  const drivers = [r.offered_driver_id, r.assigned_driver_id, oldDriver, (p.driver_id as string) ?? null].filter(Boolean) as string[];
  broadcast({ table: 'requests', op: 'UPDATE', id: r.id, city: r.city_zone_id, type: null, drivers });
  broadcast({ table: 'request_events', op: 'INSERT', id: r.id, city: r.city_zone_id, type, drivers });
  for (const d of new Set(drivers)) broadcast({ table: 'driver_presence', op: 'UPDATE', id: d, city: r.city_zone_id, type: null, drivers: [d] });
}

// Permisos de transition_request.
export function transitionAs(u: MUser, r: MRequest, action: string, payload: Record<string, unknown>) {
  const me = myDriver(u);
  const manager = canManage(u, r.city_zone_id);
  if (action === 'accept' || action === 'reject') {
    if (!((me && r.offered_driver_id === me.id) || (action === 'reject' && manager))) fail(403, 'forbidden', 'Esta oferta no es tuya');
  } else if (action === 'pick_up' || action === 'complete' || action === 'note') {
    if (!(manager || (me && r.assigned_driver_id === me.id))) fail(403, 'forbidden', 'Este servicio no es tuyo');
  } else if (!manager) {
    fail(403, 'forbidden', 'Solo un operador de la ciudad puede hacer esto');
  }
  applyTransition(r, action, payload, u);
}

export { CONSENT_VERSION };
