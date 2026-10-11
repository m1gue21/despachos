// Simulador del Hito 3: N conductores que se mueven por Manizales en modo
// live (y algunos por zona), para probar el mapa y el tiempo real.
//   pnpm --filter @despacho/api simulate            (20 conductores, cada 2 s)
//   pnpm --filter @despacho/api simulate -- 50 1000 (50 conductores, cada 1 s)
// Usa la conexión de dueño. Ctrl+C los deja desconectados.
import pg from 'pg';
import '../src/config.js';
import { config } from '../src/config.js';

const N = Number(process.argv[2] ?? 20);
const TICK_MS = Number(process.argv[3] ?? 2000);
const CITY = '10000000-0000-0000-0000-000000000001';
const BBOX = { minLat: 5.035, maxLat: 5.075, minLng: -75.53, maxLng: -75.47 };

const pool = new pg.Pool({ connectionString: config.ownerUrl, max: 4 });

interface Sim {
  id: string;
  lat: number;
  lng: number;
  heading: number;
  live: boolean;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const vehicles = ['moto', 'moto', 'moto', 'car', 'bicycle'] as const;

async function setup(): Promise<Sim[]> {
  const sims: Sim[] = [];
  for (let i = 1; i <= N; i++) {
    const name = `Sim ${String(i).padStart(2, '0')}`;
    const phone = `399${String(i).padStart(7, '0')}`;
    const existing = await pool.query(`select id from drivers where phone = $1 and city_zone_id = $2`, [phone, CITY]);
    const id =
      existing.rows[0]?.id ??
      (
        await pool.query(
          `insert into drivers (city_zone_id, display_name, phone, vehicle, service_types)
           values ($1, $2, $3, $4, $5) returning id`,
          [CITY, name, phone, vehicles[i % vehicles.length], i % 3 === 0 ? '{ride}' : '{delivery,errand}'],
        )
      ).rows[0].id;
    // 3 de cada 4 en vivo; el resto por zona en un sector al azar.
    const live = i % 4 !== 0;
    const s: Sim = { id, lat: rand(BBOX.minLat, BBOX.maxLat), lng: rand(BBOX.minLng, BBOX.maxLng), heading: rand(0, 2 * Math.PI), live };
    if (live) {
      await pool.query(
        `update driver_presence set status = $2, location_mode = 'live',
           position = st_setsrid(st_makepoint($3, $4), 4326)::geography, last_seen_at = now()
         where driver_id = $1`,
        [id, Math.random() < 0.7 ? 'available' : 'busy', s.lng, s.lat],
      );
    } else {
      await pool.query(
        `update driver_presence set status = 'available', location_mode = 'zone', zone_confirmed_at = now(),
           sector_zone_id = (select id from zones where parent_id = $2 and level = 'sector' order by random() limit 1)
         where driver_id = $1`,
        [id, CITY],
      );
    }
    sims.push(s);
  }
  return sims;
}

async function tick(sims: Sim[]) {
  const moving = sims.filter((s) => s.live);
  for (const s of moving) {
    // Paseo aleatorio ~10–40 m por tick, rebotando en los bordes.
    s.heading += rand(-0.6, 0.6);
    const step = rand(0.0001, 0.0004);
    s.lat += Math.sin(s.heading) * step;
    s.lng += Math.cos(s.heading) * step;
    if (s.lat < BBOX.minLat || s.lat > BBOX.maxLat) s.heading = -s.heading;
    if (s.lng < BBOX.minLng || s.lng > BBOX.maxLng) s.heading = Math.PI - s.heading;
  }
  // Una sola sentencia por tick para todos.
  await pool.query(
    `update driver_presence p
     set position = st_setsrid(st_makepoint(v.lng, v.lat), 4326)::geography, last_seen_at = now(), accuracy_m = 8
     from unnest($1::uuid[], $2::float8[], $3::float8[]) as v(id, lng, lat)
     where p.driver_id = v.id and p.location_mode = 'live'`,
    [moving.map((s) => s.id), moving.map((s) => s.lng), moving.map((s) => s.lat)],
  );
}

const sims = await setup();
console.log(`${sims.length} conductores simulados (${sims.filter((s) => s.live).length} en vivo). Ctrl+C para parar.`);
let ticks = 0;
const timer = setInterval(async () => {
  const t0 = Date.now();
  await tick(sims).catch((err) => console.error('tick falló:', err.message));
  if (++ticks % 10 === 0) console.log(`tick ${ticks} · ${Date.now() - t0} ms`);
}, TICK_MS);

process.on('SIGINT', async () => {
  clearInterval(timer);
  await pool.query(`update driver_presence set status = 'offline', location_mode = 'zone' where driver_id = any($1)`, [
    sims.map((s) => s.id),
  ]);
  await pool.end();
  console.log('\nsimulación detenida; conductores desconectados');
  process.exit(0);
});
