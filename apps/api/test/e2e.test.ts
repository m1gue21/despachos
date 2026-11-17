// Flujo completo por HTTP + WebSocket contra despacho_test (spec Hito 4):
// operador ofrece → conductor recibe aviso → acepta → recoge → completa.
process.env.DATABASE_URL = 'postgres://postgres:postgres@127.0.0.1:5433/despacho_test';
process.env.APP_DATABASE_URL = 'postgres://app_user:app_user_dev@127.0.0.1:5433/despacho_test';
process.env.LOG_LEVEL = 'silent';
process.env.ANTHROPIC_API_KEY = '';

import assert from 'node:assert/strict';
import { after, before, it } from 'node:test';

const { buildServer } = await import('../src/server.js');
const { startListener } = await import('../src/realtime.js');
const { appPool, ownerPool } = await import('../src/db.js');

const app = await buildServer();
let base = '';
let stopListener: () => Promise<void>;

before(async () => {
  stopListener = startListener(app.log);
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  await new Promise((r) => setTimeout(r, 300)); // que LISTEN quede abierto
});

after(async () => {
  await stopListener();
  await app.close();
  await Promise.all([appPool.end(), ownerPool.end()]);
});

async function call<T = any>(path: string, token: string | null, body?: unknown, method?: string): Promise<{ status: number; data: T }> {
  const res = await fetch(base + path, {
    method: method ?? (body !== undefined ? 'POST' : 'GET'),
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: (await res.json()) as T };
}

const login = async (email: string) => (await call<{ token: string }>('/auth/login', null, { email, password: 'dev12345' })).data.token;

it('operador → oferta → conductor acepta, recoge y completa', async () => {
  const op = await login('op.manizales@despacho.local');
  const ana = await login('ana@despacho.local');
  const CITY = '10000000-0000-0000-0000-000000000001';
  const ANA = '20000000-0000-0000-0000-000000000001';

  // El conductor escucha por WebSocket.
  const messages: any[] = [];
  const ws = new WebSocket(`${base.replace('http', 'ws')}/ws?token=${ana}`);
  await new Promise<void>((resolve) => ws.addEventListener('open', () => resolve()));
  ws.addEventListener('message', (e) => messages.push(JSON.parse(String(e.data))));

  const created = await call('/requests', op, {
    city_zone_id: CITY,
    service: 'delivery',
    pickup_text: 'Droguería del Cable',
    customer_name: 'Luisa',
    customer_phone: '3201234567',
  });
  assert.equal(created.status, 200);
  const id = created.data.id as string;

  // El conductor no ve solicitudes que no son suyas.
  assert.equal((await call(`/requests/${id}`, ana)).status, 404);

  assert.equal((await call(`/requests/${id}/transition`, op, { action: 'offer', payload: { driver_id: ANA } })).status, 200);
  await new Promise((r) => setTimeout(r, 400));
  assert.ok(messages.some((m) => m.type === 'change' && m.table === 'requests' && m.id === id), 'aviso por WebSocket');

  const offers = await call<any[]>('/driver/offers', ana);
  assert.equal(offers.data.length, 1);
  assert.equal(offers.data[0].id, id);
  assert.equal(offers.data[0].customer_phone, undefined, 'la oferta no trae datos del cliente');

  assert.equal((await call(`/requests/${id}/transition`, ana, { action: 'accept' })).status, 200);
  const services = await call<any[]>('/driver/services', ana);
  assert.equal(services.data[0].customer_phone, '3201234567', 'asignado: ya ve el teléfono');
  assert.equal((await call<any>('/driver/me', ana)).data.driver.status, 'busy');

  // Transición inválida: completar sin recoger.
  const bad = await call(`/requests/${id}/transition`, ana, { action: 'complete' });
  assert.equal(bad.status, 409);

  assert.equal((await call(`/requests/${id}/transition`, ana, { action: 'pick_up' })).status, 200);
  assert.equal((await call(`/requests/${id}/transition`, ana, { action: 'complete' })).status, 200);

  const detail = await call<any>(`/requests/${id}`, op);
  assert.deepEqual(
    detail.data.events.map((e: any) => e.type),
    ['created', 'offered', 'assigned', 'status_changed', 'status_changed'],
  );
  assert.equal((await call<any>('/driver/me', ana)).data.driver.status, 'available');
  ws.close();
});

it('ubicación en vivo: requiere consentimiento y calcula el sector', async () => {
  const ana = await login('ana@despacho.local');
  const denied = await call('/driver/presence', ana, { location_mode: 'live' }, 'PATCH');
  assert.equal(denied.status, 403);
  const me = await call<any>('/driver/me', ana);
  await call('/driver/consent', ana, { version: me.data.consent.current_version, accepted: true });
  assert.equal((await call('/driver/presence', ana, { location_mode: 'live' }, 'PATCH')).status, 200);
  const ping = await call<any>('/driver/location', ana, { lat: 5.0566, lng: -75.4906, accuracy: 10 });
  assert.equal(ping.data.accepted, true);
  const after = await call<any>('/driver/me', ana);
  assert.equal(after.data.driver.sector_name, 'Cable');
  assert.equal(after.data.driver.is_stale, false);
});

it('el parser responde con reglas sin API key y exige sesión de operador', async () => {
  const op = await login('op.manizales@despacho.local');
  const ana = await login('ana@despacho.local');
  const body = { raw_text: 'domi del cable pa chipre 3201234567', city_zone_id: '10000000-0000-0000-0000-000000000001' };
  const r = await call<any>('/parse', op, body);
  assert.equal(r.data.engine, 'rules');
  assert.equal(r.data.pickup_sector_slug, 'manizales-cable');
  assert.ok(r.data.pickup_sector_id);
  assert.equal((await call('/parse', ana, body)).status, 403);
  assert.equal((await call('/parse', null, body)).status, 401);
});

it('enlace de seguimiento: el conductor lo comparte y el cliente lo ve sin login', async () => {
  const op = await login('op.manizales@despacho.local');
  const ana = await login('ana@despacho.local');
  const created = await call('/requests', op, {
    city_zone_id: '10000000-0000-0000-0000-000000000001',
    service: 'delivery',
    pickup_text: 'Cable',
    pickup_sector_id: null,
    customer_phone: '3209998877',
  });
  const id = created.data.id as string;
  await call(`/requests/${id}/transition`, op, { action: 'assign', payload: { driver_id: '20000000-0000-0000-0000-000000000001' } });

  const link = await call<any>(`/requests/${id}/tracking-link`, ana, {});
  assert.equal(link.status, 200);
  assert.match(link.data.path, /^\/seguimiento\/[A-Za-z0-9_-]{32}$/);

  const pub = await call<any>(`/track/${link.data.token}`, null);
  assert.equal(pub.status, 200);
  assert.equal(pub.data.status, 'assigned');
  assert.equal(pub.data.driver.name, 'Ana');
  assert.ok(!JSON.stringify(pub.data).includes('3209998877'));

  assert.equal((await call(`/track/${'a'.repeat(32)}`, null)).status, 404);
  // Bruno no está asignado: no puede generar enlace.
  const bruno = await login('bruno@despacho.local');
  assert.equal((await call(`/requests/${id}/tracking-link`, bruno, {})).status, 403);
});

it('CORS permite los métodos que usa el panel (PATCH/PUT)', async () => {
  const res = await fetch(`${base}/drivers/x/presence`, {
    method: 'OPTIONS',
    headers: {
      origin: 'http://localhost:3000',
      'access-control-request-method': 'PATCH',
      'access-control-request-headers': 'authorization,content-type',
    },
  });
  const allowed = res.headers.get('access-control-allow-methods') ?? '';
  for (const m of ['PATCH', 'PUT']) assert.ok(allowed.includes(m), `falta ${m} en ${allowed}`);
});

it('el cliente califica por el enlace y el admin ve el desempeño', async () => {
  const op = await login('op.manizales@despacho.local');
  const ana = await login('ana@despacho.local');
  const admin = await login('admin@despacho.local');
  const CITY = '10000000-0000-0000-0000-000000000001';
  const ANA = '20000000-0000-0000-0000-000000000001';

  const id = (await call('/requests', op, { city_zone_id: CITY, service: 'delivery', pickup_text: 'Cable' })).data.id as string;
  await call(`/requests/${id}/transition`, op, { action: 'offer', payload: { driver_id: ANA } });
  await call(`/requests/${id}/transition`, ana, { action: 'accept' });
  const { token } = (await call<any>(`/requests/${id}/tracking-link`, ana, {})).data;

  // Antes de completar no se puede calificar.
  assert.equal((await call(`/track/${token}/rating`, null, { stars: 5 })).status, 409);

  await call(`/requests/${id}/transition`, ana, { action: 'pick_up' });
  await call(`/requests/${id}/transition`, ana, { action: 'complete' });
  assert.equal((await call<any>(`/track/${token}`, null)).data.can_rate, true);

  const ok = await call(`/track/${token}/rating`, null, { stars: 5, tags: ['puntual'], comment: 'Excelente' });
  assert.equal(ok.status, 200);
  assert.equal((await call(`/track/${token}/rating`, null, { stars: 1 })).status, 409, 'solo una vez');
  assert.equal((await call(`/track/${token}/rating`, null, { stars: 9 })).status, 400);

  // Desempeño: solo admin.
  assert.equal((await call(`/performance?city=${CITY}`, op)).status, 403);
  const list = await call<any[]>(`/performance?city=${CITY}&days=30`, admin);
  assert.equal(list.status, 200);
  const row = list.data.find((r) => r.driver_id === ANA);
  assert.ok(row.completed >= 1);
  assert.ok(row.ratings_count >= 1);

  const detail = await call<any>(`/performance/${ANA}?city=${CITY}&days=30`, admin);
  assert.equal(detail.status, 200);
  assert.equal(detail.data.daily.length, 30);
  assert.ok(detail.data.ratings.some((r: any) => r.comment === 'Excelente'));
  assert.ok(detail.data.tags.some((t: any) => t.tag === 'puntual'));
});

it('asignación asistida: propone, el admin aprueba, el conductor rechaza y propone al siguiente', async () => {
  const op = await login('op.manizales@despacho.local');
  const ana = await login('ana@despacho.local');
  const CITY = '10000000-0000-0000-0000-000000000001';
  const ANA = '20000000-0000-0000-0000-000000000001';
  const CARLOS = '20000000-0000-0000-0000-000000000003';

  // Ana en vivo junto al Cable; Carlos (sin app) disponible en el Centro (seed).
  const consent = (await call<any>('/driver/me', ana)).data.consent.current_version;
  await call('/driver/consent', ana, { version: consent, accepted: true });
  await call('/driver/presence', ana, { status: 'available', location_mode: 'live' }, 'PATCH');
  await call('/driver/location', ana, { lat: 5.0566, lng: -75.4906, accuracy: 10 });

  const created = await call<any>('/requests', op, {
    city_zone_id: CITY,
    service: 'delivery',
    pickup_text: 'Droguería en El Cable',
    pickup_sector_id: (await call<any[]>(`/zones?city=${CITY}`, op)).data.find((z) => z.slug === 'manizales-cable').id,
  });
  const id = created.data.id as string;

  // 1) Arriero propone a Ana, con la razón.
  let proposals = (await call<any[]>(`/proposals?city=${CITY}`, op)).data;
  let mine = proposals.find((p) => p.request_id === id);
  assert.equal(mine.driver_id, ANA);
  assert.match(mine.reason, /mismo sector/);

  // 2) El admin aprueba = ofrecer. Ya no es "sin asignar".
  assert.equal((await call(`/requests/${id}/transition`, op, { action: 'offer', payload: { driver_id: ANA } })).status, 200);
  assert.ok(!(await call<any[]>(`/proposals?city=${CITY}`, op)).data.some((p) => p.request_id === id));

  // 3) Ana rechaza → vuelve a "sin asignar" y la propuesta pasa al siguiente (Carlos).
  assert.equal((await call(`/requests/${id}/transition`, ana, { action: 'reject', payload: { reason: 'rejected' } })).status, 200);
  proposals = (await call<any[]>(`/proposals?city=${CITY}`, op)).data;
  mine = proposals.find((p) => p.request_id === id);
  assert.equal(mine.driver_id, CARLOS);
  assert.equal(mine.has_app, false);
  assert.equal(mine.declined, 1);

  const cands = (await call<any>(`/requests/${id}/candidates`, op)).data;
  assert.deepEqual(cands.declined.map((d: any) => [d.driver_id, d.why]), [[ANA, 'rejected']]);
  assert.ok(!cands.candidates.some((c: any) => c.driver_id === ANA));

  // 4) Sin app: aprobar = asignación directa.
  assert.equal((await call(`/requests/${id}/transition`, op, { action: 'assign', payload: { driver_id: CARLOS } })).status, 200);
});

it('ubicación obligatoria en turno, estado del dispositivo y alertas', async () => {
  const op = await login('op.manizales@despacho.local');
  const admin = await login('admin@despacho.local');
  const CITY = '10000000-0000-0000-0000-000000000001';
  const bruno = await login('bruno@despacho.local');
  const BRUNO = '20000000-0000-0000-0000-000000000002';

  // El admin exige ubicación en vivo a Bruno.
  assert.equal((await call(`/drivers/${BRUNO}`, admin, { tracking_required: true }, 'PATCH')).status, 200);
  const consent = (await call<any>('/driver/me', bruno)).data.consent.current_version;
  await call('/driver/consent', bruno, { version: consent, accepted: true });

  // En turno sin ubicación en vivo: rechazado. Con ubicación en vivo: ok.
  const noLive = await call<any>('/driver/presence', bruno, { status: 'available', location_mode: 'zone' }, 'PATCH');
  assert.equal(noLive.status, 409);
  assert.equal(noLive.data.error.code, 'live_required');
  assert.equal((await call('/driver/presence', bruno, { status: 'available', location_mode: 'live' }, 'PATCH')).status, 200);
  // Estando en turno tampoco puede pasarse a zona…
  assert.equal((await call('/driver/presence', bruno, { location_mode: 'zone' }, 'PATCH')).status, 409);
  // …pero terminar el turno siempre se puede.
  await call('/driver/location', bruno, { lat: 5.0605, lng: -75.497, accuracy: 10 });

  // La app reporta el estado del celular.
  const dev = await call<any>('/driver/device', bruno, {
    permission: 'always', gps_enabled: true, battery: 64, charging: false, mocked: false, app_version: '0.1.0', os: 'android 14',
  });
  assert.equal(dev.status, 200);
  assert.equal(dev.data.tracking_required, true);
  assert.equal((await call('/driver/device', bruno, { permission: 'nunca' })).status, 400);

  // Sin señal fresca → el job abre alerta con la causa que reporta el dispositivo.
  await ownerPool.query(`update driver_presence set last_seen_at = now() - interval '6 minutes',
     device = jsonb_set(device, '{gps_enabled}', 'false'), device_at = now() where driver_id = $1`, [BRUNO]);
  await ownerPool.query('select refresh_tracking_alerts()');
  const open = (await call<any[]>(`/alerts?city=${CITY}&open=1`, op)).data;
  const mine = open.find((a) => a.driver_id === BRUNO);
  assert.equal(mine.reason, 'gps_apagado');
  assert.equal((await call<any[]>(`/drivers?city=${CITY}`, op)).data.find((d) => d.id === BRUNO).alert_reason, 'gps_apagado');

  // Recorrido de hoy: turno, y la alerta cuenta como tiempo sin señal.
  const route = (await call<any>(`/drivers/${BRUNO}/route`, op)).data;
  assert.equal(route.shifts.length >= 1, true);
  assert.equal(route.alerts.some((a: any) => a.reason === 'gps_apagado'), true);
  assert.equal(typeof route.km, 'number');
  assert.equal((await call(`/drivers/${BRUNO}/route?date=hoy`, op)).status, 400);

  // La señal vuelve y se cierra sola.
  await ownerPool.query(`update driver_presence set last_seen_at = now() where driver_id = $1`, [BRUNO]);
  await ownerPool.query('select refresh_tracking_alerts()');
  assert.equal((await call<any[]>(`/alerts?city=${CITY}&open=1`, op)).data.some((a) => a.driver_id === BRUNO), false);
  const hist = (await call<any[]>(`/alerts?city=${CITY}&days=1`, op)).data.find((a) => a.driver_id === BRUNO);
  assert.equal(hist.resolved_by, 'recuperada');

  // Terminar turno.
  assert.equal((await call('/driver/presence', bruno, { status: 'offline', location_mode: 'zone' }, 'PATCH')).status, 200);
});
