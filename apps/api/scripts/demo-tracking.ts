// Demo del seguimiento: Luz Marina (seed de demo) lleva un pasajero de Chipre
// al aeropuerto. Imprime el enlace para el cliente y mueve su posición cada 3 s.
//   pnpm demo:tracking            (requiere API corriendo y db:reset con demo)
import '../src/config.js';
import { config } from '../src/config.js';

const API = process.env.API_URL ?? `http://127.0.0.1:${config.port}`;
const PANEL = process.env.PANEL_URL ?? 'http://localhost:3000';
const REQUEST = '40000000-0000-0000-0000-000000000011';
// Chipre → Av. Santander → Palogrande → La Enea → aeropuerto La Nubia.
const ROUTE: [number, number][] = [
  [5.0702, -75.5245], [5.0672, -75.5150], [5.0628, -75.5050], [5.0590, -75.4975],
  [5.0556, -75.4930], [5.0500, -75.4860], [5.0430, -75.4770], [5.0360, -75.4690], [5.0300, -75.4640],
];
const STEPS_PER_LEG = 8;

async function call<T>(path: string, token: string | null, body?: unknown, method?: string): Promise<T> {
  const res = await fetch(API + path, {
    method: method ?? (body !== undefined ? 'POST' : 'GET'),
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${path}: ${data?.error?.message ?? res.status}`);
  return data as T;
}

const { token } = await call<{ token: string }>('/auth/login', null, { email: 'luzmarina@despacho.local', password: 'dev12345' });
const me = await call<{ consent: { current_version: string } }>('/driver/me', token);
await call('/driver/consent', token, { version: me.consent.current_version, accepted: true });
await call('/driver/presence', token, { location_mode: 'live', status: 'busy' }, 'PATCH');
const link = await call<{ path: string }>(`/requests/${REQUEST}/tracking-link`, token, {});

console.log(`\nAbre el seguimiento del cliente:\n\n  ${PANEL}${link.path}\n\nMoviendo a Luz Marina cada 3 s (Ctrl+C para parar)…`);

const points: [number, number][] = [];
for (let i = 0; i < ROUTE.length - 1; i++) {
  const [a, b] = [ROUTE[i]!, ROUTE[i + 1]!];
  for (let s = 0; s < STEPS_PER_LEG; s++) {
    const t = s / STEPS_PER_LEG;
    points.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
}
points.push(ROUTE[ROUTE.length - 1]!);

let i = 0;
const timer = setInterval(async () => {
  const [lat, lng] = points[i % points.length]!;
  try {
    await call('/driver/location', token, { lat, lng, accuracy: 10 });
    process.stdout.write(`\r  punto ${(i % points.length) + 1}/${points.length}   `);
  } catch (err) {
    console.error('\nping falló:', err instanceof Error ? err.message : err);
  }
  i++;
}, 3000);

process.on('SIGINT', () => {
  clearInterval(timer);
  console.log('\ndemo detenida (la posición queda "desactualizada" en 2 min)');
  process.exit(0);
});
