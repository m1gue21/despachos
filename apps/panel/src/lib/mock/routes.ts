// Rutas del API simulado. Mismos caminos y respuestas que apps/api.
import type { RequestStatus, ServiceType } from '@despacho/shared';
import { DEMO_TRACKING_TOKEN, type MRequest, type MUser, type MZone, uuid } from './data';
import {
  CONSENT_VERSION,
  board,
  broadcast,
  canManage,
  citiesOf,
  db,
  distanceM,
  fail,
  iso,
  makeToken,
  myDriver,
  now,
  requestRow,
  resolveSector,
  save,
  transitionAs,
  userFromToken,
} from './engine';
import { parseWithRules, sanitize } from './parser';

type Q = URLSearchParams;
interface Ctx {
  method: string;
  path: string;
  q: Q;
  body: Record<string, unknown>;
  token: string | null;
}

const zoneOut = (z: MZone) => ({
  id: z.id,
  parent_id: z.parent_id,
  level: z.level,
  name: z.name,
  slug: z.slug,
  aliases: z.aliases,
  active: z.active,
  center_lat: z.lat,
  center_lng: z.lng,
  geom: z.polygon ? { type: 'Polygon', coordinates: [[...z.polygon, z.polygon[0]!]] } : null,
});

function auth(ctx: Ctx): MUser {
  const u = userFromToken(ctx.token);
  if (!u) fail(401, 'unauthorized', 'Sesión requerida');
  return u!;
}
const staff = (u: MUser) => (u.role === 'admin' || u.role === 'operator' ? u : fail(403, 'forbidden', 'No tienes permiso para esto'));
const adminOnly = (u: MUser) => (u.role === 'admin' ? u : fail(403, 'forbidden', 'Solo el administrador'));

function me(u: MUser) {
  const s = db();
  const d = myDriver(u);
  return {
    profile: { id: u.id, role: u.role, full_name: u.full_name, phone: u.phone, consent_at: u.consent_at, consent_version: u.consent_version },
    cities: s.zones.filter((z) => z.level === 'city' && citiesOf(u).includes(z.id)).map(zoneOut),
    driver: d ? board(d) : null,
  };
}

function getRequest(u: MUser, id: string): MRequest {
  const r = db().requests.find((x) => x.id === id);
  const d = myDriver(u);
  if (!r || !(canManage(u, r.city_zone_id) || (d && r.assigned_driver_id === d.id))) fail(404, 'not_found', 'La solicitud no existe');
  return r!;
}

const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

// ── Seguimiento público ─────────────────────────────────────────────────
function linkOpen(r: MRequest, expiresAt: string) {
  if (new Date(expiresAt).getTime() < now()) return false;
  if (r.status === 'completed' || r.status === 'cancelled') {
    const closed = r.completed_at ?? db().events.filter((e) => e.request_id === r.id && e.type === 'cancelled').at(-1)?.created_at;
    if (closed && now() - new Date(closed).getTime() > 12 * 3600_000) return false;
  }
  return true;
}

function publicTracking(token: string) {
  const s = db();
  const link = s.links.find((l) => l.token === token);
  if (!link) return null;
  const r = s.requests.find((x) => x.id === link.request_id)!;
  if (!linkOpen(r, link.expires_at)) return null;
  const ps = s.zones.find((z) => z.id === r.pickup_sector_id);
  const ds = s.zones.find((z) => z.id === r.dropoff_sector_id);
  const d = s.drivers.find((x) => x.id === r.assigned_driver_id);
  const p = d ? s.presence[d.id] : undefined;
  const fresh = p?.last_seen_at && now() - new Date(p.last_seen_at).getTime() < s.settings.LIVE_STALE_SECONDS! * 1000;
  const show = Boolean(d && p && (r.status === 'assigned' || r.status === 'picked_up') && p.location_mode === 'live' && p.lat != null && fresh);
  const rating = s.ratings.find((x) => x.request_id === r.id);
  const pickedUp = s.events.find((e) => e.request_id === r.id && e.type === 'status_changed' && e.to_status === 'picked_up');
  return {
    status: r.status,
    service: r.service,
    city: s.zones.find((z) => z.id === r.city_zone_id)?.name,
    pickup: { text: r.pickup_text, lat: r.pickup_lat ?? ps?.lat ?? null, lng: r.pickup_lng ?? ps?.lng ?? null },
    dropoff:
      r.dropoff_text || ds ? { text: r.dropoff_text, lat: r.dropoff_lat ?? ds?.lat ?? null, lng: r.dropoff_lng ?? ds?.lng ?? null } : null,
    driver: d
      ? {
          name: d.display_name.split(' ')[0],
          vehicle: d.vehicle,
          plate: d.plate,
          sector: s.zones.find((z) => z.id === p?.sector_zone_id)?.name ?? null,
        }
      : null,
    driver_position: show ? { lat: p!.lat, lng: p!.lng, updated_at: p!.last_seen_at } : null,
    timeline: { created_at: r.created_at, assigned_at: r.assigned_at, picked_up_at: pickedUp?.created_at ?? null, completed_at: r.completed_at },
    rating: rating ? { stars: rating.stars } : null,
    can_rate: r.status === 'completed' && Boolean(r.assigned_driver_id) && !rating,
    expires_at: r.completed_at
      ? iso(Math.min(new Date(link.expires_at).getTime(), new Date(r.completed_at).getTime() + 12 * 3600_000))
      : link.expires_at,
  };
}

// ── Métricas y desempeño ────────────────────────────────────────────────
function metrics(city: string, days: number) {
  const s = db();
  const since = now() - days * 86_400_000;
  const reqs = s.requests.filter((r) => r.city_zone_id === city && new Date(r.created_at).getTime() >= since);
  const evs = s.events.filter((e) => reqs.some((r) => r.id === e.request_id));
  const assignedAt = (r: MRequest) => evs.find((e) => e.request_id === r.id && e.type === 'assigned')?.created_at;
  const secs = reqs.map((r) => {
    const a = assignedAt(r);
    return a ? (new Date(a).getTime() - new Date(r.created_at).getTime()) / 1000 : null;
  });
  const valid = secs.filter((x): x is number => x !== null).sort((a, b) => a - b);
  const bog = (iso: string) => new Date(new Date(iso).toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const perDay = new Map<string, { created: number; completed: number; cancelled: number }>();
  const byHour = new Map<number, number>();
  const bySector = new Map<string, { created: number; completed: number; secs: number[] }>();
  reqs.forEach((r, i) => {
    const d = bog(r.created_at);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const pd = perDay.get(day) ?? { created: 0, completed: 0, cancelled: 0 };
    pd.created++;
    if (r.status === 'completed') pd.completed++;
    if (r.status === 'cancelled') pd.cancelled++;
    perDay.set(day, pd);
    byHour.set(d.getHours(), (byHour.get(d.getHours()) ?? 0) + 1);
    const name = s.zones.find((z) => z.id === r.pickup_sector_id)?.name ?? 'Sin sector';
    const bs = bySector.get(name) ?? { created: 0, completed: 0, secs: [] };
    bs.created++;
    if (r.status === 'completed') bs.completed++;
    if (secs[i] !== null) bs.secs.push(secs[i]!);
    bySector.set(name, bs);
  });
  const avg = (a: number[]) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);
  return {
    days,
    totals: {
      total: reqs.length,
      completed: reqs.filter((r) => r.status === 'completed').length,
      cancelled: reqs.filter((r) => r.status === 'cancelled').length,
      avg_seconds_to_assign: avg(valid),
      median_seconds_to_assign: valid.length ? Math.round(valid[Math.floor(valid.length / 2)]!) : null,
    },
    rejections: {
      timeouts: evs.filter((e) => e.type === 'rejected' && e.payload.reason === 'timeout').length,
      rejected: evs.filter((e) => e.type === 'rejected' && e.payload.reason !== 'timeout').length,
      offered: evs.filter((e) => e.type === 'offered').length,
    },
    perDay: [...perDay.entries()].sort().map(([day, v]) => ({ day, ...v })),
    byHour: [...byHour.entries()].sort((a, b) => a[0] - b[0]).map(([hour, created]) => ({ hour, created })),
    bySector: [...bySector.entries()]
      .sort((a, b) => b[1].created - a[1].created)
      .map(([sector, v]) => ({ sector, created: v.created, completed: v.completed, avg_seconds_to_assign: avg(v.secs) })),
  };
}

// Mismo cálculo que driver_stats (migración 010).
function driverStats(city: string, days: number) {
  const s = db();
  const since = now() - days * 86_400_000;
  const reqIds = new Set(s.requests.filter((r) => r.city_zone_id === city).map((r) => r.id));
  const evs = s.events.filter((e) => reqIds.has(e.request_id) && new Date(e.created_at).getTime() >= since);
  const timeout = s.settings.OFFER_TIMEOUT_SECONDS!;
  return s.drivers
    .filter((d) => d.city_zone_id === city)
    .map((d) => {
      const mine = evs.filter((e) => e.payload.driver_id === d.id);
      const offers = mine.filter((e) => e.type === 'offered').length;
      const acceptedEv = mine.filter((e) => e.type === 'assigned' && e.payload.via === 'accept');
      const rejected = mine.filter((e) => e.type === 'rejected' && e.payload.reason === 'rejected').length;
      const timeouts = mine.filter((e) => e.type === 'rejected' && e.payload.reason === 'timeout').length;
      const acceptSecs = acceptedEv
        .map((a) => {
          const o = mine
            .filter((e) => e.type === 'offered' && e.request_id === a.request_id && e.created_at <= a.created_at)
            .at(-1);
          return o ? (new Date(a.created_at).getTime() - new Date(o.created_at).getTime()) / 1000 : null;
        })
        .filter((x): x is number => x !== null);
      const svc = s.requests.filter(
        (r) => r.city_zone_id === city && r.assigned_driver_id === d.id && new Date(r.created_at).getTime() >= since,
      );
      const completed = svc.filter((r) => r.status === 'completed');
      const cancelled = svc.filter((r) => r.status === 'cancelled').length;
      const pickedAt = (r: MRequest) =>
        s.events.find((e) => e.request_id === r.id && e.type === 'status_changed' && e.to_status === 'picked_up')?.created_at;
      const toPickup = svc
        .map((r) => (pickedAt(r) && r.assigned_at ? (new Date(pickedAt(r)!).getTime() - new Date(r.assigned_at).getTime()) / 1000 : null))
        .filter((x): x is number => x !== null);
      const delivery = completed
        .map((r) => (pickedAt(r) && r.completed_at ? (new Date(r.completed_at).getTime() - new Date(pickedAt(r)!).getTime()) / 1000 : null))
        .filter((x): x is number => x !== null);
      const ratings = s.ratings.filter((x) => x.driver_id === d.id && new Date(x.created_at).getTime() >= since);
      const sum = ratings.reduce((a, b) => a + b.stars, 0);
      const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
      const accRate = offers > 0 ? acceptedEv.length / offers : null;
      const compRate = completed.length + cancelled > 0 ? completed.length / (completed.length + cancelled) : null;
      const avgAccept = avg(acceptSecs);
      const ratingPart = ((5 * 4 + sum) / (5 + ratings.length) - 1) / 4;
      const speed = avgAccept === null ? 0.8 : Math.max(0, Math.min(1, 1 - (avgAccept - 15) / Math.max(timeout - 15, 1)));
      const score = Math.round(100 * (0.4 * ratingPart + 0.25 * (accRate ?? 0.8) + 0.2 * (compRate ?? 0.8) + 0.15 * speed));
      const last = svc.map((r) => r.completed_at ?? r.assigned_at).filter(Boolean).sort().at(-1) ?? null;
      return {
        driver_id: d.id,
        display_name: d.display_name,
        vehicle: d.vehicle,
        has_app: d.has_app,
        active: d.active,
        completed: completed.length,
        cancelled_assigned: cancelled,
        offers,
        accepted: acceptedEv.length,
        rejected,
        timeouts,
        acceptance_rate: accRate,
        completion_rate: compRate,
        avg_accept_seconds: avgAccept,
        avg_to_pickup_seconds: avg(toPickup),
        avg_delivery_seconds: avg(delivery),
        ratings_count: ratings.length,
        ratings_avg: ratings.length ? sum / ratings.length : null,
        score,
        provisional: completed.length < 3,
        last_service_at: last,
      };
    })
    .sort((a, b) => Number(b.active) - Number(a.active) || Number(a.provisional) - Number(b.provisional) || b.score - a.score);
}

// ── Enrutador ───────────────────────────────────────────────────────────
export function handle(ctx: Ctx): unknown {
  const s = db();
  const { method, path, q, body } = ctx;
  const seg = path.split('/').filter(Boolean);
  const is = (m: string, pattern: string) => {
    if (m !== method) return false;
    const p = pattern.split('/').filter(Boolean);
    return p.length === seg.length && p.every((x, i) => x.startsWith(':') || x === seg[i]);
  };

  // Públicas
  if (is('GET', '/health')) return { ok: true, parser: 'rules', push: 'off', demo: true };
  if (is('POST', '/auth/login')) {
    const u = s.users.find((x) => x.email.toLowerCase() === String(body.email ?? '').toLowerCase().trim() && x.active);
    if (!u || u.password !== body.password) fail(401, 'invalid_credentials', 'Correo o contraseña incorrectos');
    return { token: makeToken(u!.id), ...me(u!) };
  }
  if (is('GET', '/track/:token')) {
    const t = publicTracking(seg[1]!);
    if (!t) fail(404, 'not_found', 'Este enlace de seguimiento venció o no existe');
    return t;
  }
  if (is('POST', '/track/:token/rating')) {
    const link = s.links.find((l) => l.token === seg[1]);
    const r = link && s.requests.find((x) => x.id === link.request_id);
    if (!link || !r || !linkOpen(r, link.expires_at)) fail(404, 'not_found', 'Este enlace venció o no existe');
    if (r!.status !== 'completed' || !r!.assigned_driver_id) fail(409, 'invalid_transition', 'Solo se califica un servicio completado');
    const stars = Number(body.stars);
    if (!(stars >= 1 && stars <= 5)) fail(400, 'bad_payload', 'La calificación va de 1 a 5 estrellas');
    if (s.ratings.some((x) => x.request_id === r!.id)) fail(409, 'invalid_transition', 'Este servicio ya fue calificado');
    s.ratings.push({
      request_id: r!.id,
      driver_id: r!.assigned_driver_id!,
      stars,
      tags: Array.isArray(body.tags) ? (body.tags as string[]) : [],
      comment: String(body.comment ?? '').trim() || null,
      created_at: iso(),
    });
    broadcast({ table: 'request_events', op: 'INSERT', id: r!.id, city: r!.city_zone_id, type: 'note', drivers: [] });
    return { ok: true };
  }

  const u = auth(ctx);

  if (is('GET', '/me')) return me(u);
  if (is('GET', '/cities')) return s.zones.filter((z) => z.level === 'city' && citiesOf(u).includes(z.id)).map((z) => ({ id: z.id, name: z.name, slug: z.slug }));

  if (is('GET', '/zones')) {
    const city = q.get('city');
    return s.zones
      .filter((z) => (!city || z.id === city || z.parent_id === city) && (q.get('all') || z.active))
      .sort((a, b) => a.level.localeCompare(b.level) || a.name.localeCompare(b.name))
      .map(zoneOut);
  }
  if (is('POST', '/zones')) {
    adminOnly(u);
    const parent = body.parent_id ? s.zones.find((z) => z.id === body.parent_id) : null;
    const center = body.center as { lat: number; lng: number } | null;
    const z: MZone = {
      id: uuid(),
      parent_id: parent?.id ?? null,
      level: parent ? 'sector' : 'city',
      name: String(body.name),
      slug: parent ? `${parent.slug}-${slugify(String(body.name))}` : slugify(String(body.name)),
      aliases: (body.aliases as string[]) ?? [],
      active: true,
      lat: center?.lat ?? null,
      lng: center?.lng ?? null,
      polygon: (body.polygon as [number, number][]) ?? null,
    };
    s.zones.push(z);
    broadcast({ table: 'zones', op: 'INSERT', id: z.id, city: null, type: null, drivers: [] });
    return zoneOut(z);
  }
  if (is('PATCH', '/zones/:id')) {
    adminOnly(u);
    const z = s.zones.find((x) => x.id === seg[1]) ?? fail(404, 'not_found', 'La zona no existe');
    if (body.name !== undefined) z.name = String(body.name);
    if (body.aliases !== undefined) z.aliases = body.aliases as string[];
    if (body.active !== undefined) z.active = Boolean(body.active);
    if (body.center !== undefined) {
      const c = body.center as { lat: number; lng: number } | null;
      z.lat = c?.lat ?? null;
      z.lng = c?.lng ?? null;
    }
    if (body.polygon !== undefined) z.polygon = (body.polygon as [number, number][]) ?? null;
    broadcast({ table: 'zones', op: 'UPDATE', id: z.id, city: null, type: null, drivers: [] });
    return zoneOut(z);
  }

  if (is('GET', '/groups')) {
    const city = q.get('city')!;
    staff(u);
    if (!canManage(u, city)) return [];
    return s.groups.filter((g) => g.city_zone_id === city);
  }
  if (is('POST', '/groups')) {
    if (!canManage(u, String(body.city_zone_id))) fail(403, 'forbidden', 'No tienes permiso para esto');
    const g = { id: uuid(), city_zone_id: String(body.city_zone_id), name: String(body.name), kind: (body.kind as 'mixed') ?? 'mixed', active: true };
    s.groups.push(g);
    save();
    return g;
  }
  if (is('PATCH', '/groups/:id')) {
    const g = s.groups.find((x) => x.id === seg[1]) ?? fail(404, 'not_found', 'El grupo no existe');
    if (!canManage(u, g.city_zone_id)) fail(403, 'forbidden', 'No tienes permiso para esto');
    Object.assign(g, Object.fromEntries(Object.entries(body).filter(([k]) => ['name', 'kind', 'active'].includes(k))));
    save();
    return g;
  }

  if (is('GET', '/staff')) {
    adminOnly(u);
    return s.users
      .filter((x) => x.role === 'admin' || x.role === 'operator')
      .map((x) => ({
        id: x.id,
        email: x.email,
        full_name: x.full_name,
        role: x.role,
        active: x.active,
        city_ids: s.operatorZones.filter((o) => o.operator_id === x.id).map((o) => o.zone_id),
      }));
  }
  if (is('POST', '/staff')) {
    adminOnly(u);
    if (s.users.some((x) => x.email.toLowerCase() === String(body.email).toLowerCase())) fail(400, 'bad_payload', 'Ya existe una cuenta con ese correo');
    const nu: MUser = {
      id: uuid(),
      email: String(body.email),
      password: String(body.password),
      role: body.role === 'admin' ? 'admin' : 'operator',
      full_name: String(body.full_name),
      phone: null,
      active: true,
      consent_version: null,
      consent_at: null,
    };
    s.users.push(nu);
    if (nu.role === 'operator') for (const c of (body.city_ids as string[]) ?? []) s.operatorZones.push({ operator_id: nu.id, zone_id: c });
    save();
    return { id: nu.id };
  }

  // ── Solicitudes ──
  if (is('GET', '/requests')) {
    staff(u);
    const city = q.get('city')!;
    if (!canManage(u, city)) return [];
    const hours = Number(q.get('hours') ?? 24);
    return s.requests
      .filter(
        (r) =>
          r.city_zone_id === city &&
          (!(r.status === 'completed' || r.status === 'cancelled') || now() - new Date(r.created_at).getTime() < hours * 3600_000),
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 500)
      .map(requestRow);
  }
  if (is('POST', '/requests')) {
    const city = String(body.city_zone_id);
    if (!canManage(u, city)) fail(403, 'forbidden', 'No tienes acceso a esta ciudad');
    if (!String(body.pickup_text ?? '').trim()) fail(400, 'bad_payload', 'Falta la recogida');
    if (!body.service) fail(400, 'bad_payload', 'service: Required');
    const pos = (p: unknown) => (p && typeof p === 'object' ? (p as { lat: number; lng: number }) : null);
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    const phone = str(body.customer_phone)?.replace(/[\s-]/g, '').replace(/^\+?57/, '') ?? null;
    if (phone && !/^3\d{9}$/.test(phone)) fail(400, 'bad_payload', 'customer_phone: Celular inválido');
    const r: MRequest = {
      id: uuid(),
      city_zone_id: city,
      channel: (body.channel as 'whatsapp_manual') ?? 'whatsapp_manual',
      service: body.service as ServiceType,
      status: 'created',
      source_group_id: str(body.source_group_id),
      raw_text: str(body.raw_text),
      pickup_text: String(body.pickup_text).trim(),
      pickup_sector_id: str(body.pickup_sector_id),
      pickup_lat: pos(body.pickup_position)?.lat ?? null,
      pickup_lng: pos(body.pickup_position)?.lng ?? null,
      dropoff_text: str(body.dropoff_text),
      dropoff_sector_id: str(body.dropoff_sector_id),
      dropoff_lat: pos(body.dropoff_position)?.lat ?? null,
      dropoff_lng: pos(body.dropoff_position)?.lng ?? null,
      customer_name: str(body.customer_name),
      customer_phone: phone,
      notes: str(body.notes),
      offered_driver_id: null,
      offered_at: null,
      assigned_driver_id: null,
      created_by: u.id,
      created_at: iso(),
      assigned_at: null,
      completed_at: null,
      cancel_reason: null,
    };
    s.requests.push(r);
    s.events.push({
      id: s.nextEventId++,
      request_id: r.id,
      type: 'created',
      from_status: null,
      to_status: 'created',
      actor_id: u.id,
      actor_role: u.role,
      payload: { channel: r.channel },
      created_at: iso(),
    });
    broadcast({ table: 'requests', op: 'INSERT', id: r.id, city, type: null, drivers: [] });
    broadcast({ table: 'request_events', op: 'INSERT', id: r.id, city, type: 'created', drivers: [] });
    return requestRow(r);
  }
  if (is('GET', '/requests/:id')) {
    const r = getRequest(u, seg[1]!);
    const events =
      u.role === 'driver'
        ? []
        : s.events
            .filter((e) => e.request_id === r.id)
            .map((e) => ({
              ...e,
              actor_name: s.users.find((x) => x.id === e.actor_id)?.full_name ?? (e.actor_id ? null : 'Sistema'),
              driver_name: s.drivers.find((d) => d.id === e.payload.driver_id)?.display_name ?? null,
            }));
    return { ...requestRow(r), events };
  }
  if (is('PATCH', '/requests/:id')) {
    const r = getRequest(u, seg[1]!);
    if (!canManage(u, r.city_zone_id)) fail(403, 'forbidden', 'No tienes permiso para esto');
    for (const k of ['service', 'source_group_id', 'pickup_text', 'pickup_sector_id', 'dropoff_text', 'dropoff_sector_id', 'customer_name', 'customer_phone', 'notes'] as const) {
      if (body[k] !== undefined) (r as unknown as Record<string, unknown>)[k] = body[k];
    }
    broadcast({ table: 'requests', op: 'UPDATE', id: r.id, city: r.city_zone_id, type: null, drivers: [] });
    return requestRow(r);
  }
  if (is('POST', '/requests/:id/transition')) {
    const r = s.requests.find((x) => x.id === seg[1]) ?? fail(404, 'not_found', 'La solicitud no existe');
    transitionAs(u, r, String(body.action), (body.payload as Record<string, unknown>) ?? {});
    return requestRow(r);
  }
  if (is('GET', '/requests/:id/suggestions')) {
    const r = getRequest(u, seg[1]!);
    if (!canManage(u, r.city_zone_id)) fail(403, 'forbidden', 'No tienes acceso a esta solicitud');
    const sector = s.zones.find((z) => z.id === r.pickup_sector_id);
    const pickup = r.pickup_lat != null ? { lat: r.pickup_lat, lng: r.pickup_lng! } : sector?.lat != null ? { lat: sector.lat, lng: sector.lng! } : null;
    const radius = Number(q.get('radius') ?? 5000);
    return s.drivers
      .filter((d) => d.city_zone_id === r.city_zone_id && d.active && d.service_types.includes(r.service))
      .map(board)
      .filter((b) => b.status === 'available' && !b.is_stale)
      .map((b) => {
        const at = b.lat != null ? { lat: b.lat, lng: b.lng! } : b.sector_lat != null ? { lat: b.sector_lat, lng: b.sector_lng! } : null;
        return {
          driver_id: b.id,
          display_name: b.display_name,
          vehicle: b.vehicle,
          has_app: b.has_app,
          location_mode: b.location_mode,
          sector_name: b.sector_name,
          distance_m: at && pickup ? distanceM(at, pickup) : null,
          same_sector: Boolean(r.pickup_sector_id && b.sector_zone_id === r.pickup_sector_id),
        };
      })
      .filter((x) => x.distance_m === null || x.distance_m <= radius)
      .sort((a, b) => Number(b.same_sector) - Number(a.same_sector) || (a.distance_m ?? 1e12) - (b.distance_m ?? 1e12))
      .slice(0, 20);
  }
  if (is('POST', '/requests/:id/tracking-link')) {
    const r = s.requests.find((x) => x.id === seg[1]) ?? fail(404, 'not_found', 'La solicitud no existe');
    const d = myDriver(u);
    if (!(canManage(u, r.city_zone_id) || (d && r.assigned_driver_id === d.id))) fail(403, 'forbidden', 'No puedes compartir esta solicitud');
    if (r.status === 'completed' || r.status === 'cancelled') fail(409, 'invalid_transition', 'La solicitud ya está cerrada');
    let link = s.links.find((l) => l.request_id === r.id && new Date(l.expires_at).getTime() > now() + 30 * 60_000);
    if (!link) {
      const bytes = crypto.getRandomValues(new Uint8Array(24));
      const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_');
      link = { token, request_id: r.id, created_at: iso(), expires_at: iso(now() + 12 * 3600_000) };
      s.links.push(link);
      save();
    }
    return { token: link.token, expires_at: link.expires_at, path: `/seguimiento/${link.token}` };
  }

  // ── Conductores (panel) ──
  if (is('GET', '/drivers')) {
    staff(u);
    const city = q.get('city')!;
    if (!canManage(u, city)) return [];
    return s.drivers
      .filter((d) => d.city_zone_id === city && (q.get('all') || d.active))
      .map(board)
      .sort((a, b) => Number(b.active) - Number(a.active) || a.display_name.localeCompare(b.display_name));
  }
  if (is('POST', '/drivers')) {
    const city = String(body.city_zone_id);
    if (!canManage(u, city)) fail(403, 'forbidden', 'No tienes permiso para esto');
    const id = uuid();
    s.drivers.push({
      id,
      profile_id: null,
      city_zone_id: city,
      display_name: String(body.display_name),
      phone: String(body.phone).replace(/[\s-]/g, '').replace(/^\+?57/, ''),
      vehicle: body.vehicle as 'moto',
      plate: (body.plate as string) ?? null,
      service_types: (body.service_types as ServiceType[]) ?? ['delivery'],
      has_app: false,
      active: body.active !== false,
      sim: true,
    });
    s.presence[id] = { status: 'offline', location_mode: 'none', sector_zone_id: null, lat: null, lng: null, accuracy_m: null, last_seen_at: null, zone_confirmed_at: null, updated_by: null, updated_at: iso() };
    broadcast({ table: 'drivers', op: 'INSERT', id, city, type: null, drivers: [id] });
    return board(s.drivers.at(-1)!);
  }
  if (is('PATCH', '/drivers/:id')) {
    const d = s.drivers.find((x) => x.id === seg[1]) ?? fail(404, 'not_found', 'El conductor no existe');
    if (!canManage(u, d.city_zone_id)) fail(403, 'forbidden', 'No tienes permiso para esto');
    for (const k of ['display_name', 'phone', 'vehicle', 'plate', 'service_types', 'active'] as const) {
      if (body[k] !== undefined) (d as unknown as Record<string, unknown>)[k] = body[k];
    }
    broadcast({ table: 'drivers', op: 'UPDATE', id: d.id, city: d.city_zone_id, type: null, drivers: [d.id] });
    return board(d);
  }
  if (is('PATCH', '/drivers/:id/presence')) {
    const d = s.drivers.find((x) => x.id === seg[1]) ?? fail(404, 'not_found', 'El conductor no existe');
    if (!canManage(u, d.city_zone_id)) fail(403, 'forbidden', 'No tienes permiso para esto');
    patchPresence(d.id, body, u);
    return board(d);
  }
  if (is('POST', '/drivers/:id/invite')) {
    const d = s.drivers.find((x) => x.id === seg[1]) ?? fail(404, 'not_found', 'El conductor no existe');
    if (!canManage(u, d.city_zone_id)) fail(403, 'forbidden', 'No tienes acceso');
    if (d.profile_id) fail(400, 'bad_payload', 'El conductor ya tiene cuenta');
    const email = String(body.email).trim();
    if (s.users.some((x) => x.email.toLowerCase() === email.toLowerCase())) fail(400, 'bad_payload', 'Ya existe una cuenta con ese correo');
    const password = (body.password as string) ?? Math.random().toString(36).slice(2, 12);
    const nu: MUser = { id: uuid(), email, password, role: 'driver', full_name: d.display_name, phone: d.phone, active: true, consent_version: null, consent_at: null };
    s.users.push(nu);
    d.profile_id = nu.id;
    d.has_app = true;
    broadcast({ table: 'drivers', op: 'UPDATE', id: d.id, city: d.city_zone_id, type: null, drivers: [d.id] });
    return { email, password };
  }

  // ── Web del conductor ──
  if (seg[0] === 'driver') {
    if (u.role !== 'driver') fail(403, 'forbidden', 'No tienes permiso para esto');
    const d = myDriver(u) ?? fail(403, 'forbidden', 'Tu cuenta no está vinculada a un conductor activo');
    // Alguien maneja este conductor desde /conductor: el simulador lo deja quieto.
    if (d.sim) {
      d.sim = false;
      save();
    }
    if (is('GET', '/driver/me'))
      return {
        driver: board(d),
        sectors: s.zones.filter((z) => z.parent_id === d.city_zone_id && z.level === 'sector' && z.active).map((z) => ({ id: z.id, name: z.name })),
        settings: { live_ping_seconds: s.settings.LIVE_PING_SECONDS, offer_timeout_seconds: s.settings.OFFER_TIMEOUT_SECONDS, zone_stale_minutes: s.settings.ZONE_STALE_MINUTES },
        consent: { consent_at: u.consent_at, consent_version: u.consent_version, current_version: CONSENT_VERSION, valid: u.consent_version === CONSENT_VERSION },
      };
    if (is('POST', '/driver/consent')) {
      u.consent_version = body.accepted ? CONSENT_VERSION : null;
      u.consent_at = body.accepted ? iso() : null;
      if (!body.accepted && s.presence[d.id]!.location_mode === 'live') patchPresence(d.id, { location_mode: 'zone' }, u);
      save();
      return { ok: true };
    }
    if (is('PATCH', '/driver/presence')) {
      if (body.location_mode === 'live' && u.consent_version !== CONSENT_VERSION) {
        fail(403, 'consent_required', 'Acepta el consentimiento para compartir ubicación en vivo');
      }
      patchPresence(d.id, body, u);
      return board(d);
    }
    if (is('POST', '/driver/location')) {
      const p = s.presence[d.id]!;
      if (p.location_mode !== 'live' || p.status === 'offline') return { accepted: false };
      setPosition(d.id, Number(body.lat), Number(body.lng), (body.accuracy as number) ?? null);
      return { accepted: true };
    }
    if (is('GET', '/driver/offers')) {
      return s.requests
        .filter((r) => r.status === 'offered' && r.offered_driver_id === d.id)
        .map((r) => {
          const row = requestRow(r);
          return {
            id: r.id,
            city_zone_id: r.city_zone_id,
            service: r.service,
            status: r.status,
            pickup_text: r.pickup_text,
            pickup_sector_name: row.pickup_sector_name,
            dropoff_text: r.dropoff_text,
            dropoff_sector_name: row.dropoff_sector_name,
            notes: r.notes,
            offered_at: r.offered_at,
            offer_expires_at: iso(new Date(r.offered_at!).getTime() + s.settings.OFFER_TIMEOUT_SECONDS! * 1000),
          };
        });
    }
    if (is('GET', '/driver/services')) {
      const today = new Date().toDateString();
      return s.requests
        .filter(
          (r) =>
            r.assigned_driver_id === d.id &&
            (r.status === 'assigned' ||
              r.status === 'picked_up' ||
              new Date(r.completed_at ?? r.created_at).toDateString() === today),
        )
        .sort((a, b) => Number(['assigned', 'picked_up'].includes(b.status)) - Number(['assigned', 'picked_up'].includes(a.status)))
        .map(requestRow);
    }
    if (is('POST', '/driver/push-token')) return { ok: true };
  }

  if (is('POST', '/parse')) {
    staff(u);
    const city = String(body.city_zone_id);
    if (!canManage(u, city)) fail(403, 'forbidden', 'No tienes acceso a esta ciudad');
    const sectors = s.zones.filter((z) => z.parent_id === city && z.active);
    const refs = sectors.map((z) => ({ slug: z.slug, name: z.name, aliases: z.aliases }));
    const result = sanitize(parseWithRules(String(body.raw_text ?? ''), refs), refs);
    const id = (slug: string | null) => sectors.find((z) => z.slug === slug)?.id ?? null;
    return { ...result, engine: 'rules', pickup_sector_id: id(result.pickup_sector_slug), dropoff_sector_id: id(result.dropoff_sector_slug) };
  }

  if (is('GET', '/metrics')) {
    staff(u);
    const city = q.get('city')!;
    if (!canManage(u, city)) fail(403, 'forbidden', 'No tienes acceso');
    return metrics(city, Number(q.get('days') ?? 14));
  }

  if (is('GET', '/performance')) {
    adminOnly(u);
    return driverStats(q.get('city')!, Number(q.get('days') ?? 30));
  }
  if (is('GET', '/performance/:id')) {
    adminOnly(u);
    const days = Number(q.get('days') ?? 30);
    const city = q.get('city')!;
    const stats = driverStats(city, days).find((x) => x.driver_id === seg[1]) ?? fail(404, 'not_found', 'El conductor no existe en esta ciudad');
    const since = now() - days * 86_400_000;
    const svc = s.requests.filter((r) => r.assigned_driver_id === seg[1]);
    const daily = Array.from({ length: days }, (_, i) => {
      const day = new Date(now() - (days - 1 - i) * 86_400_000);
      const key = day.toDateString();
      const on = svc.filter((r) => new Date(r.completed_at ?? r.created_at).toDateString() === key);
      return {
        day: `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`,
        completed: on.filter((r) => r.status === 'completed').length,
        cancelled: on.filter((r) => r.status === 'cancelled').length,
      };
    });
    const ratings = s.ratings
      .filter((x) => x.driver_id === seg[1] && new Date(x.created_at).getTime() >= since)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    const reqOf = (id: string) => s.requests.find((r) => r.id === id)!;
    const tags = new Map<string, number>();
    ratings.forEach((x) => x.tags.forEach((t) => tags.set(t, (tags.get(t) ?? 0) + 1)));
    return {
      driver: board(s.drivers.find((d) => d.id === seg[1])!),
      stats,
      daily,
      ratings: ratings.slice(0, 50).map((x) => ({
        stars: x.stars,
        tags: x.tags,
        comment: x.comment,
        created_at: x.created_at,
        service: reqOf(x.request_id).service,
        pickup_text: reqOf(x.request_id).pickup_text,
        dropoff_text: reqOf(x.request_id).dropoff_text,
      })),
      distribution: [5, 4, 3, 2, 1].map((n) => ({ stars: n, n: ratings.filter((x) => x.stars === n).length })),
      tags: [...tags.entries()].sort((a, b) => b[1] - a[1]).map(([tag, n]) => ({ tag, n })),
      recent: svc
        .filter((r) => new Date(r.created_at).getTime() >= since)
        .sort((a, b) => (b.completed_at ?? b.assigned_at ?? b.created_at).localeCompare(a.completed_at ?? a.assigned_at ?? a.created_at))
        .slice(0, 20)
        .map((r) => ({
          id: r.id,
          service: r.service,
          status: r.status as RequestStatus,
          pickup_text: r.pickup_text,
          dropoff_text: r.dropoff_text,
          assigned_at: r.assigned_at,
          completed_at: r.completed_at,
          stars: s.ratings.find((x) => x.request_id === r.id)?.stars ?? null,
        })),
    };
  }

  return fail(404, 'not_found', `Ruta no disponible en la demo: ${method} ${path}`);
}

// ── Presencia (reglas de driver_presence_rules) ─────────────────────────
export function patchPresence(driverId: string, body: Record<string, unknown>, actor: MUser | null) {
  const s = db();
  const d = s.drivers.find((x) => x.id === driverId)!;
  const p = s.presence[driverId]!;
  if (body.status !== undefined) p.status = body.status as 'available';
  if (body.location_mode !== undefined) p.location_mode = body.location_mode as 'zone';
  if (body.sector_zone_id !== undefined) {
    const sec = s.zones.find((z) => z.id === body.sector_zone_id);
    if (body.sector_zone_id && (!sec || sec.parent_id !== d.city_zone_id)) fail(400, 'bad_payload', 'El sector no pertenece a la ciudad del conductor');
    p.sector_zone_id = (body.sector_zone_id as string) ?? null;
    if (body.location_mode === undefined && p.location_mode === 'none') p.location_mode = 'zone';
    p.zone_confirmed_at = iso();
  }
  if (body.confirm) p.zone_confirmed_at = iso();
  if (body.location_mode === 'zone') p.zone_confirmed_at = iso();
  if (p.location_mode !== 'live') {
    p.lat = null;
    p.lng = null;
    p.accuracy_m = null;
  }
  p.updated_by = actor?.id ?? null;
  p.updated_at = iso();
  broadcast({ table: 'driver_presence', op: 'UPDATE', id: driverId, city: d.city_zone_id, type: null, drivers: [driverId] });
}

export function setPosition(driverId: string, lat: number, lng: number, accuracy: number | null, quiet = false) {
  const s = db();
  const d = s.drivers.find((x) => x.id === driverId)!;
  const p = s.presence[driverId]!;
  p.lat = lat;
  p.lng = lng;
  p.accuracy_m = accuracy;
  p.last_seen_at = iso();
  const sec = resolveSector(lat, lng, d.city_zone_id);
  if (sec) p.sector_zone_id = sec;
  p.updated_at = iso();
  if (!quiet) broadcast({ table: 'driver_presence', op: 'UPDATE', id: driverId, city: d.city_zone_id, type: null, drivers: [driverId] });
}

export { DEMO_TRACKING_TOKEN };
