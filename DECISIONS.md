# Decisiones

Registro de lo que se decidió donde el spec era ambiguo o donde se cambió
algo marcado como DECISIÓN. Lo más nuevo arriba.

## 2026-10-10 · Sin Supabase en el MVP (cambia una DECISIÓN del spec §5)

**Pedido del dueño del producto:** correr todo local o mockeado, sin Supabase.

**Alternativa más cercana elegida:**

| Supabase | Reemplazo local |
|---|---|
| Postgres + PostGIS | Postgres 16 + PostGIS 3.5 en Docker (`docker-compose.yml`) |
| `supabase db reset` | `pnpm db:reset` (borra `public`, corre migraciones y seed) |
| Auth (`auth.users`, JWT) | tabla `app_users` con bcrypt (pgcrypto) + `auth_login()`; el API emite el JWT (Hito 1) |
| `auth.uid()` en RLS | `auth_uid()`, que lee `app.user_id` fijado por transacción |
| PostgREST con rol `authenticated` | API propio que se conecta como `app_user` (sin BYPASSRLS) |
| `service_role` | conexión de dueño (`DATABASE_URL`), solo en servidor |
| Realtime | `LISTEN/NOTIFY` + WebSocket en el API (Hito 2/3) |
| Edge Function del parser | ruta del API (Hito 5) |
| pgTAP (`supabase test db`) | `node:test` + `pg` (`pnpm db:test`) |

**Por qué así:** la lógica sensible sigue en SQL (RLS, funciones), que es lo
que el spec protege. Volver a Supabase después es cambiar `auth_uid()` por
`auth.uid()`, `app_users` por `auth.users` y `app_user` por `authenticated`;
las migraciones del modelo y las políticas se reutilizan casi tal cual.

**Riesgo asumido:** cualquiera que se conecte como `app_user` puede fijar
`app.user_id` a su gusto. Por eso esa credencial solo la tiene el API, igual
que la JWT secret en Supabase.

## 2026-10-10 · Hito 0

- **Imagen de PostGIS:** `imresamu/postgis` (la mantiene el mismo equipo de
  `postgis/postgis`), porque la oficial solo publica amd64 y el equipo de
  desarrollo usa Apple Silicon.
- **Puerto 5433** para no chocar con un Postgres local.
- **`requests.offered_driver_id` y `offered_at`:** no estaban en el spec, pero
  sin ellos el conductor no puede ver "las solicitudes ofrecidas a él" (§7) ni
  se puede calcular el timeout de la oferta.
- **Ofertas sin datos del cliente:** el conductor ve sus ofertas por la vista
  `driver_offers`, que no trae nombre ni teléfono. Solo el conductor asignado
  los ve (§7, privacidad).
- **Cambios de `status` bloqueados desde ya:** con permisos por columna, ni
  operadores ni conductores pueden hacer `update` de `status`,
  `assigned_driver_id`, `offered_*` ni fechas. En el Hito 1 la única vía será
  `transition_request()` (security definer).
- **`request_events` es append-only** por trigger (ni el dueño puede borrar ni
  editar) y su FK a `requests` es `restrict`.
- **Vincular cuentas a conductores (`profile_id`, `has_app`) y cambiar roles**
  no se puede por `update` directo; irá por funciones de admin en el Hito 2
  ("invitar conductor").
- **Zonas:** solo el admin las escribe; cualquier sesión las lee (el conductor
  necesita los sectores de su ciudad). Se agregó `zones.aliases` para el
  parser ("el cable" → Cable).
- **Consentimiento** en `profiles.consent_at` + `consent_version` (pareja
  obligatoria).
- **`app_settings`:** valor por ciudad o global (`city_zone_id` null);
  `setting_int(key, city)` da preferencia al de la ciudad. Se agregó
  `LOCATION_RETENTION_DAYS` (30) para la retención del historial.
- **Seed:** los centros de los sectores son aproximados y sin polígono; se
  ajustan desde el panel. Contraseñas de desarrollo en `seed.sql` (solo
  local). En producción el primer admin se crea con `create-admin`.
- **Validación de jerarquía de zonas** por trigger (`ensure_zone_level`): las
  columnas `*city_zone_id` apuntan a ciudades y las `*sector*` a sectores.
- **`spatial_ref_sys`** (tabla de PostGIS en `public`) queda sin RLS: es
  catálogo público de sistemas de coordenadas y PostGIS la necesita así. Las
  12 tablas del modelo tienen RLS activo.
