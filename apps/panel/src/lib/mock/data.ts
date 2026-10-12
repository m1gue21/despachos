// Datos del modo demo (sin backend). Espejo simplificado del modelo de la
// base: mismas formas que devuelve el API, generadas en el navegador.
import type {
  DriverStatus,
  LocationMode,
  RequestChannel,
  RequestStatus,
  ServiceType,
  UserRole,
  VehicleType,
  WhatsappGroupKind,
} from '@despacho/shared';

export const CONSENT_VERSION = '2026-10-v2';
export const MANIZALES = '10000000-0000-0000-0000-000000000001';
export const VILLAMARIA = '10000000-0000-0000-0000-000000000002';
// Seguimiento de demostración siempre disponible (también desde otro equipo).
export const DEMO_TRACKING_TOKEN = 'demo-en-curso-manizales-0001';
export const DEMO_TRACKING_REQUEST = '40000000-0000-0000-0000-0000000000aa';

export interface MZone {
  id: string;
  parent_id: string | null;
  level: 'city' | 'sector';
  name: string;
  slug: string;
  aliases: string[];
  active: boolean;
  lat: number | null;
  lng: number | null;
  polygon: [number, number][] | null;
}

export interface MUser {
  id: string;
  email: string;
  password: string;
  role: UserRole;
  full_name: string;
  phone: string | null;
  active: boolean;
  consent_version: string | null;
  consent_at: string | null;
}

export interface MDriver {
  id: string;
  profile_id: string | null;
  city_zone_id: string;
  display_name: string;
  phone: string;
  vehicle: VehicleType;
  plate: string | null;
  service_types: ServiceType[];
  has_app: boolean;
  active: boolean;
  // Lo maneja el simulador (se mueve, acepta ofertas y avanza servicios solo)
  // salvo que alguien haya entrado con su cuenta en /conductor.
  sim: boolean;
}

export interface MPresence {
  status: DriverStatus;
  location_mode: LocationMode;
  sector_zone_id: string | null;
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
  last_seen_at: string | null;
  zone_confirmed_at: string | null;
  updated_by: string | null;
  updated_at: string;
}

export interface MRequest {
  id: string;
  city_zone_id: string;
  channel: RequestChannel;
  service: ServiceType;
  status: RequestStatus;
  source_group_id: string | null;
  raw_text: string | null;
  pickup_text: string;
  pickup_sector_id: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_text: string | null;
  dropoff_sector_id: string | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  notes: string | null;
  offered_driver_id: string | null;
  offered_at: string | null;
  assigned_driver_id: string | null;
  created_by: string | null;
  created_at: string;
  assigned_at: string | null;
  completed_at: string | null;
  cancel_reason: string | null;
}

export interface MEvent {
  id: number;
  request_id: string;
  type: string;
  from_status: RequestStatus | null;
  to_status: RequestStatus | null;
  actor_id: string | null;
  actor_role: UserRole | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface MRating {
  request_id: string;
  driver_id: string;
  stars: number;
  tags: string[];
  comment: string | null;
  created_at: string;
}

export interface MLink {
  token: string;
  request_id: string;
  created_at: string;
  expires_at: string;
}

export interface MGroup {
  id: string;
  city_zone_id: string;
  name: string;
  kind: WhatsappGroupKind;
  active: boolean;
}

export interface MState {
  version: number;
  seededAt: string;
  zones: MZone[];
  users: MUser[];
  operatorZones: { operator_id: string; zone_id: string }[];
  drivers: MDriver[];
  presence: Record<string, MPresence>;
  requests: MRequest[];
  events: MEvent[];
  ratings: MRating[];
  links: MLink[];
  groups: MGroup[];
  settings: Record<string, number>;
  nextEventId: number;
}

export const STATE_VERSION = 3;

// PRNG con semilla fija: la demo sale igual cada vez que se reinicia.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function uuid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
}

const iso = (ms: number) => new Date(ms).toISOString();

const SECTORS: [string, string, string[], number, number][] = [
  ['Centro', 'manizales-centro', ['el centro', 'cra 23', 'carrera 23'], 5.0689, -75.5174],
  ['Chipre', 'manizales-chipre', ['chipre', 'el monumento'], 5.07, -75.526],
  ['Cable', 'manizales-cable', ['el cable', 'la torre del cable'], 5.0565, -75.4905],
  ['Palogrande', 'manizales-palogrande', ['palogrande', 'el estadio'], 5.0555, -75.4945],
  ['Av. Santander', 'manizales-av-santander', ['la santander', 'avenida santander'], 5.06, -75.4975],
  ['Fátima', 'manizales-fatima', ['fatima'], 5.059, -75.486],
  ['Milán', 'manizales-milan', ['milan', 'el bosque de milan'], 5.048, -75.48],
  ['La Sultana', 'manizales-la-sultana', ['sultana'], 5.0436, -75.475],
  ['La Enea', 'manizales-la-enea', ['enea', 'el aeropuerto'], 5.03, -75.463],
  ['San Jorge', 'manizales-san-jorge', ['san jorge'], 5.045, -75.499],
];

const sectorId = (slug: string) => `11000000-0000-0000-0000-${String(SECTORS.findIndex((s) => s[1] === slug) + 1).padStart(12, '0')}`;

export function buildSeed(): MState {
  const now = Date.now();
  const rnd = mulberry32(42);
  const zones: MZone[] = [
    { id: MANIZALES, parent_id: null, level: 'city', name: 'Manizales', slug: 'manizales', aliases: [], active: true, lat: 5.0703, lng: -75.5138, polygon: null },
    { id: VILLAMARIA, parent_id: null, level: 'city', name: 'Villamaría', slug: 'villamaria', aliases: [], active: true, lat: 5.0457, lng: -75.515, polygon: null },
    ...SECTORS.map(([name, slug, aliases, lat, lng]) => ({
      id: sectorId(slug),
      parent_id: MANIZALES,
      level: 'sector' as const,
      name,
      slug,
      aliases,
      active: true,
      lat,
      lng,
      polygon: null,
    })),
  ];

  const u = (id: string, email: string, role: UserRole, full_name: string, phone: string | null, consent = false): MUser => ({
    id,
    email,
    password: 'dev12345',
    role,
    full_name,
    phone,
    active: true,
    consent_version: consent ? CONSENT_VERSION : null,
    consent_at: consent ? iso(now) : null,
  });
  const users: MUser[] = [
    u('00000000-0000-0000-0000-0000000000a1', 'admin@despacho.local', 'admin', 'Admin Despacho', null),
    u('00000000-0000-0000-0000-0000000000a2', 'op.manizales@despacho.local', 'operator', 'Operadora Manizales', '3000000001'),
    u('00000000-0000-0000-0000-0000000000a3', 'op.villamaria@despacho.local', 'operator', 'Operador Villamaría', '3000000002'),
    u('00000000-0000-0000-0000-0000000000d1', 'ana@despacho.local', 'driver', 'Ana Ríos', '3100000001'),
    u('00000000-0000-0000-0000-0000000000d2', 'bruno@despacho.local', 'driver', 'Bruno Gómez', '3100000002'),
    u('00000000-0000-0000-0000-0000000000d3', 'camila@despacho.local', 'driver', 'Camila Duque', '3110000001'),
    u('00000000-0000-0000-0000-0000000000d4', 'jhon@despacho.local', 'driver', 'Jhon Ocampo', '3110000002'),
    u('00000000-0000-0000-0000-0000000000d5', 'luzmarina@despacho.local', 'driver', 'Luz Marina Giraldo', '3110000003', true),
    u('00000000-0000-0000-0000-0000000000d6', 'andres@despacho.local', 'driver', 'Andrés Henao', '3110000004', true),
    u('00000000-0000-0000-0000-0000000000d7', 'valentina@despacho.local', 'driver', 'Valentina Cardona', '3110000005'),
  ];
  const OP = users[1]!.id;

  type D = [string, string | null, string, string, string, VehicleType, string | null, ServiceType[], boolean, boolean];
  const driverRows: D[] = [
    ['20000000-0000-0000-0000-000000000001', users[3]!.id, MANIZALES, 'Ana Ríos', '3100000001', 'moto', 'ABC12D', ['delivery', 'errand'], true, true],
    ['20000000-0000-0000-0000-000000000002', users[4]!.id, MANIZALES, 'Bruno Gómez', '3100000002', 'car', 'XYZ123', ['ride'], true, true],
    ['20000000-0000-0000-0000-000000000003', null, MANIZALES, 'Carlos (sin app)', '3100000003', 'moto', null, ['delivery'], false, true],
    ['20000000-0000-0000-0000-000000000004', null, VILLAMARIA, 'Diana (sin app)', '3100000004', 'bicycle', null, ['delivery', 'errand'], false, true],
    ['20000000-0000-0000-0000-000000000011', users[5]!.id, MANIZALES, 'Camila Duque', '3110000001', 'moto', 'MZL45E', ['delivery', 'errand'], true, true],
    ['20000000-0000-0000-0000-000000000012', users[6]!.id, MANIZALES, 'Jhon Ocampo', '3110000002', 'moto', 'KTR88F', ['delivery'], true, true],
    ['20000000-0000-0000-0000-000000000013', users[7]!.id, MANIZALES, 'Luz Marina Giraldo', '3110000003', 'car', 'MAN321', ['ride'], true, true],
    ['20000000-0000-0000-0000-000000000014', users[8]!.id, MANIZALES, 'Andrés Henao', '3110000004', 'car', 'CLD654', ['ride', 'delivery'], true, true],
    ['20000000-0000-0000-0000-000000000015', null, MANIZALES, 'Don Fabio', '3120000001', 'moto', null, ['delivery', 'errand'], false, true],
    ['20000000-0000-0000-0000-000000000016', null, MANIZALES, 'Yeison (bici)', '3120000002', 'bicycle', null, ['delivery'], false, true],
    ['20000000-0000-0000-0000-000000000017', null, MANIZALES, 'Sofía Arango', '3120000003', 'moto', null, ['delivery', 'errand'], false, true],
    ['20000000-0000-0000-0000-000000000018', null, MANIZALES, 'Kevin Marín', '3120000004', 'moto', null, ['delivery'], false, true],
    ['20000000-0000-0000-0000-000000000019', null, MANIZALES, 'Hernán Taxi', '3120000005', 'car', 'TXI777', ['ride'], false, true],
    ['20000000-0000-0000-0000-00000000001b', users[9]!.id, VILLAMARIA, 'Valentina Cardona', '3110000005', 'moto', 'VLM12G', ['delivery', 'errand'], true, true],
    ['20000000-0000-0000-0000-00000000001c', null, VILLAMARIA, 'Mateo (sin app)', '3120000007', 'moto', null, ['delivery', 'ride'], false, true],
  ];
  const drivers: MDriver[] = driverRows.map(([id, profile_id, city, name, phone, vehicle, plate, services, has_app, active]) => ({
    id,
    profile_id,
    city_zone_id: city,
    display_name: name,
    phone,
    vehicle,
    plate,
    service_types: services,
    has_app,
    active,
    sim: true,
  }));

  const presence: Record<string, MPresence> = {};
  const pres = (id: string, p: Partial<MPresence>) => {
    presence[id] = {
      status: 'offline',
      location_mode: 'none',
      sector_zone_id: null,
      lat: null,
      lng: null,
      accuracy_m: null,
      last_seen_at: null,
      zone_confirmed_at: null,
      updated_by: null,
      updated_at: iso(now),
      ...p,
    };
  };
  const zone = (slug: string, status: DriverStatus, minsAgo: number) =>
    ({ status, location_mode: 'zone', sector_zone_id: sectorId(slug), zone_confirmed_at: iso(now - minsAgo * 60_000) }) as Partial<MPresence>;
  const live = (status: DriverStatus, lat: number, lng: number) =>
    ({ status, location_mode: 'live', lat, lng, accuracy_m: 10, last_seen_at: iso(now) }) as Partial<MPresence>;

  pres('20000000-0000-0000-0000-000000000001', live('available', 5.0689, -75.5174)); // Ana en vivo, Centro
  pres('20000000-0000-0000-0000-000000000002', live('available', 5.0605, -75.497)); // Bruno en vivo
  pres('20000000-0000-0000-0000-000000000003', zone('manizales-centro', 'available', 5));
  pres('20000000-0000-0000-0000-000000000004', { status: 'available' });
  pres('20000000-0000-0000-0000-000000000011', live('available', 5.0555, -75.4945)); // Camila en vivo
  pres('20000000-0000-0000-0000-000000000012', zone('manizales-chipre', 'available', 10));
  pres('20000000-0000-0000-0000-000000000013', live('busy', 5.07, -75.526)); // Luz Marina con el viaje de demo
  pres('20000000-0000-0000-0000-000000000014', live('available', 5.0571, -75.4912)); // Andrés
  pres('20000000-0000-0000-0000-000000000015', zone('manizales-centro', 'available', 2));
  pres('20000000-0000-0000-0000-000000000016', zone('manizales-milan', 'available', 15));
  pres('20000000-0000-0000-0000-000000000017', zone('manizales-fatima', 'available', 120)); // desactualizada
  pres('20000000-0000-0000-0000-000000000018', zone('manizales-san-jorge', 'available', 8));
  pres('20000000-0000-0000-0000-000000000019', zone('manizales-la-enea', 'offline', 20));
  pres('20000000-0000-0000-0000-00000000001b', { status: 'available' });
  pres('20000000-0000-0000-0000-00000000001c', { status: 'available' });

  const groups: MGroup[] = [
    { id: '30000000-0000-0000-0000-000000000001', city_zone_id: MANIZALES, name: 'Domicilios Manizales', kind: 'delivery', active: true },
    { id: '30000000-0000-0000-0000-000000000002', city_zone_id: MANIZALES, name: 'Transporte Manizales', kind: 'ride', active: true },
    { id: '30000000-0000-0000-0000-000000000003', city_zone_id: VILLAMARIA, name: 'Domicilios Villamaría', kind: 'mixed', active: true },
  ];

  const state: MState = {
    version: STATE_VERSION,
    seededAt: iso(now),
    zones,
    users,
    operatorZones: [
      { operator_id: OP, zone_id: MANIZALES },
      { operator_id: users[2]!.id, zone_id: VILLAMARIA },
    ],
    drivers,
    presence,
    requests: [],
    events: [],
    ratings: [],
    links: [],
    groups,
    settings: { ZONE_STALE_MINUTES: 45, LIVE_STALE_SECONDS: 120, LIVE_PING_SECONDS: 10, OFFER_TIMEOUT_SECONDS: 60, LOCATION_RETENTION_DAYS: 30 },
    nextEventId: 1,
  };

  const ev = (request_id: string, type: string, from: RequestStatus | null, to: RequestStatus | null, actor: string | null, role: UserRole | null, payload: Record<string, unknown>, at: number) => {
    state.events.push({ id: state.nextEventId++, request_id, type, from_status: from, to_status: to, actor_id: actor, actor_role: role, payload, created_at: iso(at) });
  };
  const sec = (slug: string) => zones.find((z) => z.slug === slug)!;
  const req = (p: Partial<MRequest> & { id: string; service: ServiceType; pickup_text: string }): MRequest => ({
    city_zone_id: MANIZALES,
    channel: 'whatsapp_manual',
    status: 'created',
    source_group_id: null,
    raw_text: null,
    pickup_sector_id: null,
    pickup_lat: null,
    pickup_lng: null,
    dropoff_text: null,
    dropoff_sector_id: null,
    dropoff_lat: null,
    dropoff_lng: null,
    customer_name: null,
    customer_phone: null,
    notes: null,
    offered_driver_id: null,
    offered_at: null,
    assigned_driver_id: null,
    created_by: OP,
    created_at: iso(now),
    assigned_at: null,
    completed_at: null,
    cancel_reason: null,
    ...p,
  });

  // ── Historial de 14 días (perfiles por conductor, como seed-demo.sql) ──
  const profiles: [string, number, number, number, number, number, number][] = [
    // driver, media, p(rechazar), p(vencer), seg. en aceptar, p(cancelar), servicios/día máx
    ['20000000-0000-0000-0000-000000000001', 4.7, 0.05, 0.02, 12, 0.03, 4],
    ['20000000-0000-0000-0000-000000000011', 4.9, 0.02, 0, 8, 0.02, 5],
    ['20000000-0000-0000-0000-000000000012', 4.2, 0.15, 0.1, 25, 0.05, 3],
    ['20000000-0000-0000-0000-000000000013', 4.6, 0.05, 0.03, 15, 0.03, 3],
    ['20000000-0000-0000-0000-000000000014', 3.6, 0.25, 0.15, 38, 0.08, 3],
    ['20000000-0000-0000-0000-000000000002', 4.4, 0.1, 0.05, 20, 0.04, 2],
    ['20000000-0000-0000-0000-000000000015', 4.5, 0, 0, 0, 0.04, 3],
    ['20000000-0000-0000-0000-000000000016', 4.8, 0, 0, 0, 0.02, 2],
    ['20000000-0000-0000-0000-000000000017', 3.9, 0, 0, 0, 0.06, 2],
    ['20000000-0000-0000-0000-000000000018', 3.4, 0, 0, 0, 0.15, 3],
    ['20000000-0000-0000-0000-000000000003', 4.1, 0, 0, 0, 0.05, 2],
  ];
  const tagSets: Record<string, string[][]> = {
    5: [['puntual', 'amable'], ['cuidadoso'], ['puntual'], ['buena_comunicacion', 'amable']],
    4: [['amable'], ['puntual'], []],
    3: [['tardo'], []],
    low: [['tardo', 'no_contesto'], ['producto_danado'], ['mal_trato']],
  };
  const goodComments = ['Muy rápido y amable', 'Llegó antes de lo esperado', 'Todo perfecto, gracias', 'Excelente servicio', 'Súper puntual'];
  const badComments = ['No contestaba el celular', 'El paquete llegó un poco golpeado', 'Se demoró bastante'];
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const sectorList = zones.filter((z) => z.level === 'sector');
  for (const [driverId, mean, pReject, pTimeout, acceptSecs, pCancel, perDay] of profiles) {
    const drv = drivers.find((d) => d.id === driverId)!;
    for (let d = 1; d <= 14; d++) {
      const n = Math.floor(rnd() * (perDay + 1));
      for (let k = 0; k < n; k++) {
        const t0 = today.getTime() - d * 86_400_000 + (7 * 60 + Math.floor(rnd() * 14 * 60)) * 60_000;
        const id = uuid();
        const p = sectorList[Math.floor(rnd() * sectorList.length)]!;
        const q = sectorList[Math.floor(rnd() * sectorList.length)]!;
        const r = req({ id, service: drv.service_types[0]!, pickup_text: `Servicio en ${p.name}`, pickup_sector_id: p.id, dropoff_text: `Destino en ${q.name}`, dropoff_sector_id: q.id, created_at: iso(t0) });
        ev(id, 'created', null, 'created', OP, 'operator', { channel: 'whatsapp_manual' }, t0);
        let tA = t0 + 40_000;
        if (drv.has_app) {
          if (rnd() < pReject) {
            ev(id, 'offered', 'created', 'offered', OP, 'operator', { driver_id: driverId }, tA);
            ev(id, 'rejected', 'offered', 'created', drv.profile_id, 'driver', { driver_id: driverId, reason: 'rejected' }, tA + 9_000);
            tA += 30_000;
          } else if (rnd() < pTimeout) {
            ev(id, 'offered', 'created', 'offered', OP, 'operator', { driver_id: driverId }, tA);
            ev(id, 'rejected', 'offered', 'created', null, null, { driver_id: driverId, reason: 'timeout' }, tA + 60_000);
            tA += 75_000;
          }
          ev(id, 'offered', 'created', 'offered', OP, 'operator', { driver_id: driverId }, tA);
          tA += Math.max(3, acceptSecs * (0.5 + rnd())) * 1000;
          ev(id, 'assigned', 'offered', 'assigned', drv.profile_id, 'driver', { driver_id: driverId, via: 'accept' }, tA);
        } else {
          ev(id, 'assigned', 'created', 'assigned', OP, 'operator', { driver_id: driverId, via: 'direct' }, tA);
        }
        r.assigned_driver_id = driverId;
        r.assigned_at = iso(tA);
        if (rnd() < pCancel) {
          ev(id, 'cancelled', 'assigned', 'cancelled', OP, 'operator', { reason: 'El cliente canceló' }, tA + 360_000);
          r.status = 'cancelled';
          r.cancel_reason = 'El cliente canceló';
          state.requests.push(r);
          continue;
        }
        const tP = tA + (4 + Math.floor(rnd() * 12)) * 60_000;
        const tD = tP + (7 + Math.floor(rnd() * 20)) * 60_000;
        const role: UserRole = drv.has_app ? 'driver' : 'operator';
        ev(id, 'status_changed', 'assigned', 'picked_up', null, role, {}, tP);
        ev(id, 'status_changed', 'picked_up', 'completed', null, role, {}, tD);
        r.status = 'completed';
        r.completed_at = iso(tD);
        state.requests.push(r);
        if (rnd() < 0.6) {
          const stars = Math.max(1, Math.min(5, Math.round(mean + (rnd() - 0.5) * 2.2)));
          const set = stars >= 5 ? tagSets[5]! : stars === 4 ? tagSets[4]! : stars === 3 ? tagSets[3]! : tagSets.low!;
          const comment = rnd() < 0.35 ? (stars >= 4 ? goodComments : badComments)[Math.floor(rnd() * (stars >= 4 ? 5 : 3))]! : null;
          state.ratings.push({ request_id: id, driver_id: driverId, stars, tags: set[Math.floor(rnd() * set.length)]!, comment, created_at: iso(tD + (2 + Math.floor(rnd() * 40)) * 60_000) });
        }
      }
    }
  }

  // ── Solicitudes abiertas ahora ──
  const open1 = req({
    id: '40000000-0000-0000-0000-000000000001', service: 'delivery', source_group_id: groups[0]!.id,
    raw_text: 'domi del cable a chipre, recoger pedido en la drogueria, cel 3201234567',
    pickup_text: 'Droguería, El Cable', pickup_sector_id: sec('manizales-cable').id,
    dropoff_text: 'Chipre', dropoff_sector_id: sec('manizales-chipre').id, customer_phone: '3201234567',
    created_at: iso(now - 3 * 60_000),
  });
  const open2 = req({
    id: '40000000-0000-0000-0000-000000000002', service: 'ride', source_group_id: groups[1]!.id,
    raw_text: 'carro para la enea ya, sale de palogrande. Marta 3159876543',
    pickup_text: 'Palogrande', pickup_sector_id: sec('manizales-palogrande').id,
    dropoff_text: 'La Enea', dropoff_sector_id: sec('manizales-la-enea').id, customer_name: 'Marta', customer_phone: '3159876543',
    created_at: iso(now - 7 * 60_000),
  });
  const open3 = req({
    id: '40000000-0000-0000-0000-000000000003', city_zone_id: VILLAMARIA, service: 'errand', source_group_id: groups[2]!.id,
    raw_text: 'mandado: pagar recibo en el parque principal', pickup_text: 'Parque principal de Villamaría',
    created_by: users[2]!.id, created_at: iso(now - 2 * 60_000),
  });
  for (const r of [open1, open2, open3]) {
    state.requests.push(r);
    ev(r.id, 'created', null, 'created', r.created_by, 'operator', { channel: 'whatsapp_manual' }, new Date(r.created_at).getTime());
  }

  // Kevin va a recoger un domicilio asignado directo.
  const kevin = req({
    id: '40000000-0000-0000-0000-000000000012', service: 'delivery', status: 'assigned', source_group_id: groups[0]!.id,
    pickup_text: 'Panadería San Jorge', pickup_sector_id: sec('manizales-san-jorge').id,
    dropoff_text: 'Milán, cerca del parque', dropoff_sector_id: sec('manizales-milan').id,
    customer_name: 'Rosa', customer_phone: '3012223344', assigned_driver_id: '20000000-0000-0000-0000-000000000018',
    created_at: iso(now - 7 * 60_000), assigned_at: iso(now - 4 * 60_000),
  });
  state.requests.push(kevin);
  ev(kevin.id, 'created', null, 'created', OP, 'operator', { channel: 'whatsapp_manual' }, now - 7 * 60_000);
  ev(kevin.id, 'assigned', 'created', 'assigned', OP, 'operator', { driver_id: kevin.assigned_driver_id, via: 'direct' }, now - 4 * 60_000);
  presence['20000000-0000-0000-0000-000000000018']!.status = 'busy';

  // El viaje del enlace de demostración: Luz Marina, Chipre → aeropuerto.
  const demo = req({
    id: DEMO_TRACKING_REQUEST, service: 'ride', status: 'picked_up', source_group_id: groups[1]!.id,
    raw_text: 'carro del monumento a la enea, señora con maleta. 3004567890',
    pickup_text: 'Monumento a los Colonizadores', pickup_sector_id: sec('manizales-chipre').id, pickup_lat: 5.0702, pickup_lng: -75.5245,
    dropoff_text: 'Aeropuerto La Nubia', dropoff_sector_id: sec('manizales-la-enea').id, dropoff_lat: 5.03, dropoff_lng: -75.464,
    customer_phone: '3004567890', assigned_driver_id: '20000000-0000-0000-0000-000000000013',
    created_at: iso(now - 15 * 60_000), assigned_at: iso(now - 12 * 60_000),
  });
  state.requests.push(demo);
  ev(demo.id, 'created', null, 'created', OP, 'operator', { channel: 'whatsapp_manual' }, now - 15 * 60_000);
  ev(demo.id, 'offered', 'created', 'offered', OP, 'operator', { driver_id: demo.assigned_driver_id }, now - 14 * 60_000);
  ev(demo.id, 'assigned', 'offered', 'assigned', users[7]!.id, 'driver', { driver_id: demo.assigned_driver_id, via: 'accept' }, now - 12 * 60_000);
  ev(demo.id, 'status_changed', 'assigned', 'picked_up', users[7]!.id, 'driver', {}, now - 2 * 60_000);
  state.links.push({ token: DEMO_TRACKING_TOKEN, request_id: demo.id, created_at: iso(now), expires_at: iso(now + 365 * 86_400_000) });

  state.events.sort((a, b) => a.created_at.localeCompare(b.created_at));
  state.events.forEach((e, i) => (e.id = i + 1));
  state.nextEventId = state.events.length + 1;
  return state;
}
