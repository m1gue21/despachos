// Simulador de la demo: hace "vivir" a los conductores que nadie maneja.
// Corre en una sola pestaña (líder) para no duplicar movimientos.
import { DEMO_TRACKING_REQUEST, type MRequest } from './data';
import { applyTransition, broadcast, db, distanceM, iso, now, save } from './engine';
import { setPosition } from './routes';

const LEADER_KEY = 'despacho.mock.leader';
const TICK_MS = 2000;
const STEP_DEG = 0.00045; // ~50 m por tick: la demo va rápido a propósito (una entrega ≈ 2–3 min)
const ARRIVE_M = 60;
const BBOX = { minLat: 5.035, maxLat: 5.075, minLng: -75.53, maxLng: -75.47 };
const tabId = Math.random().toString(36).slice(2);

// Decisiones pendientes de ofertas a conductores simulados.
const offerDecisions = new Map<string, number>();
const headings = new Map<string, number>();
let demoCompletedAt: number | null = null;

function isLeader(): boolean {
  try {
    const raw = localStorage.getItem(LEADER_KEY);
    const cur = raw ? (JSON.parse(raw) as { id: string; ts: number }) : null;
    if (!cur || cur.id === tabId || now() - cur.ts > TICK_MS * 3) {
      localStorage.setItem(LEADER_KEY, JSON.stringify({ id: tabId, ts: now() }));
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

function target(r: MRequest): { lat: number; lng: number } | null {
  const s = db();
  const going = r.status === 'assigned' ? 'pickup' : 'dropoff';
  const lat = going === 'pickup' ? r.pickup_lat : r.dropoff_lat;
  const lng = going === 'pickup' ? r.pickup_lng : r.dropoff_lng;
  if (lat != null && lng != null) return { lat, lng };
  const z = s.zones.find((x) => x.id === (going === 'pickup' ? r.pickup_sector_id : r.dropoff_sector_id));
  return z?.lat != null && z.lng != null ? { lat: z.lat, lng: z.lng } : null;
}

function tick() {
  if (document.hidden || !isLeader()) return;
  const s = db();
  const t = now();
  const timeout = s.settings.OFFER_TIMEOUT_SECONDS! * 1000;
  let moved = false;

  // 1. Ofertas vencidas.
  for (const r of s.requests) {
    if (r.status === 'offered' && r.offered_at && t - new Date(r.offered_at).getTime() > timeout) {
      applyTransition(r, 'reject', { reason: 'timeout' }, null);
    }
  }

  // 2. Conductores simulados responden ofertas en 8–15 s (85 % aceptan). Si
  //    alguien entra con esa cuenta en /conductor antes, responde él.
  for (const r of s.requests) {
    if (r.status !== 'offered' || !r.offered_driver_id) continue;
    const d = s.drivers.find((x) => x.id === r.offered_driver_id);
    if (!d?.sim) continue;
    const at = offerDecisions.get(r.id) ?? t + 8000 + Math.random() * 7000;
    offerDecisions.set(r.id, at);
    if (t >= at) {
      offerDecisions.delete(r.id);
      const user = s.users.find((u) => u.id === d.profile_id) ?? null;
      applyTransition(r, Math.random() < 0.85 ? 'accept' : 'reject', { reason: 'rejected' }, user);
    }
  }

  // 3. Servicios en curso de conductores simulados.
  for (const r of s.requests) {
    if ((r.status !== 'assigned' && r.status !== 'picked_up') || !r.assigned_driver_id) continue;
    const d = s.drivers.find((x) => x.id === r.assigned_driver_id);
    if (!d?.sim) continue;
    const p = s.presence[d.id]!;
    const user = s.users.find((u) => u.id === d.profile_id) ?? null;
    const goal = target(r);
    if (p.location_mode === 'live' && p.lat != null && p.lng != null && goal) {
      const dist = distanceM({ lat: p.lat, lng: p.lng }, goal);
      if (dist <= ARRIVE_M) {
        applyTransition(r, r.status === 'assigned' ? 'pick_up' : 'complete', {}, user);
      } else {
        const f = Math.min(1, (STEP_DEG * 111_000) / dist);
        setPosition(d.id, p.lat + (goal.lat - p.lat) * f, p.lng + (goal.lng - p.lng) * f, 10, true);
        moved = true;
      }
    } else {
      // Sin GPS (por zona o sin app): avanza por tiempo, como si el operador lo marcara.
      const since = t - new Date(r.status === 'assigned' ? (r.assigned_at ?? r.created_at) : (r.assigned_at ?? r.created_at)).getTime();
      if (r.status === 'assigned' && since > 90_000) applyTransition(r, 'pick_up', {}, user);
      else if (r.status === 'picked_up' && since > 210_000) applyTransition(r, 'complete', {}, user);
    }
  }

  // 4. Conductores en vivo sin servicio: paseo aleatorio.
  for (const d of s.drivers) {
    const p = s.presence[d.id]!;
    if (!d.sim || p.location_mode !== 'live' || p.status === 'offline' || p.lat == null || p.lng == null) continue;
    const busy = s.requests.some((r) => r.assigned_driver_id === d.id && (r.status === 'assigned' || r.status === 'picked_up'));
    if (busy) continue;
    let h = headings.get(d.id) ?? Math.random() * Math.PI * 2;
    h += (Math.random() - 0.5) * 1.2;
    let lat = p.lat + Math.sin(h) * STEP_DEG * 0.5;
    let lng = p.lng + Math.cos(h) * STEP_DEG * 0.5;
    if (lat < BBOX.minLat || lat > BBOX.maxLat) (h = -h), (lat = p.lat);
    if (lng < BBOX.minLng || lng > BBOX.maxLng) (h = Math.PI - h), (lng = p.lng);
    headings.set(d.id, h);
    setPosition(d.id, lat, lng, 10, true);
    moved = true;
  }

  // 5. Los que trabajan por zona confirman de vez en cuando (Sofía no: es la
  //    "desactualizada" de la demo).
  for (const d of s.drivers) {
    const p = s.presence[d.id]!;
    if (!d.sim || p.location_mode !== 'zone' || d.id.endsWith('000000000017')) continue;
    if (p.zone_confirmed_at && t - new Date(p.zone_confirmed_at).getTime() > 20 * 60_000 && Math.random() < 0.02) {
      p.zone_confirmed_at = iso();
      moved = true;
    }
  }

  // 6. El viaje del enlace de demostración se repite: al llegar, espera 30 s
  //    (para poder calificar) y vuelve a salir desde Chipre.
  const demo = s.requests.find((r) => r.id === DEMO_TRACKING_REQUEST);
  if (demo) {
    if (demo.status === 'completed') {
      demoCompletedAt ??= t;
      if (t - demoCompletedAt > 30_000) {
        demoCompletedAt = null;
        demo.status = 'picked_up';
        demo.completed_at = null;
        s.ratings = s.ratings.filter((x) => x.request_id !== demo.id);
        const d = s.drivers.find((x) => x.id === demo.assigned_driver_id)!;
        s.presence[d.id]!.status = 'busy';
        s.presence[d.id]!.location_mode = 'live';
        setPosition(d.id, demo.pickup_lat!, demo.pickup_lng!, 10, true);
        broadcast({ table: 'requests', op: 'UPDATE', id: demo.id, city: demo.city_zone_id, type: null, drivers: [d.id] });
      }
    } else demoCompletedAt = null;
  }

  if (moved) {
    save();
    broadcast({ table: 'driver_presence', op: 'UPDATE', id: null, city: s.drivers[0]?.city_zone_id ?? null, type: null, drivers: s.drivers.map((d) => d.id) });
  }
}

let started = false;
export function startSim() {
  if (started || typeof window === 'undefined') return;
  started = true;
  setInterval(() => {
    try {
      tick();
    } catch (err) {
      console.warn('[demo] simulador:', err);
    }
  }, TICK_MS);
}
