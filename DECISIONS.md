# Decisiones

Registro de lo que se decidió donde el spec era ambiguo o donde se cambió
algo marcado como DECISIÓN. Lo más nuevo arriba.

## 2026-10-11 · Calificaciones y desempeño (el spec las dejaba fuera del MVP, §2)

**Pedido:** que el admin vea estadísticas individuales y un puntaje por
conductor, y que el cliente califique desde el enlace de seguimiento.

- **Calificación:** 1–5 estrellas, etiquetas de una lista cerrada (puntual,
  amable, cuidadoso, buena comunicación, tardó, mal trato, producto dañado,
  no contestó) y comentario opcional de hasta 500 caracteres. Una por servicio,
  solo si se completó y tenía conductor. Va por `submit_rating(token, …)`: el
  token del enlace es la única credencial del cliente. Límite de 10 envíos/min
  por IP.
- **Ventana del enlace:** pasa de 30 min a 12 h después de cerrar el servicio,
  para que el cliente alcance a calificar. La posición del mensajero deja de
  mostrarse al cerrar, como antes.
- **Quién ve qué:** calificaciones, comentarios y desempeño solo el admin
  (RLS en `driver_ratings` y chequeo en `driver_stats`). El conductor no ve
  sus comentarios en esta versión. Abrirlo a operadores de la ciudad es
  cambiar dos chequeos.
- **Puntaje 0–100** (`driver_stats`):
  - 40 % calificación, bayesiana: se suman 5 calificaciones de 4,0 para que
    1–2 calificaciones no dominen.
  - 25 % aceptación: aceptadas / ofrecidas.
  - 20 % cumplimiento: completados / (completados + cancelados estando
    asignado).
  - 15 % rapidez: segundos entre la oferta y la aceptación; ≤ 15 s = 1, el
    límite de la oferta = 0.
  - Componente sin datos = 0,8. Con menos de 3 completados, "provisional".
  - Efecto conocido: los conductores sin app no reciben ofertas, así que
    aceptación y rapidez les cuentan neutras (0,8). Si eso se vuelve injusto
    en la práctica, comparar por separado con app y sin app.
- **Seed de demo:** 14 días de historial generado con semilla fija (perfiles
  distintos por conductor) para que las métricas y el desempeño tengan datos.

## 2026-10-11 · Conductor en la web y seguimiento para el cliente (cambia §5 y §10)

**Pedido:** que los mensajeros usen una web en vez de la app nativa, y que el
cliente reciba un enlace temporal con la ruta y el estado de su mensajero.

**Qué se hizo**
- La web del conductor vive en el mismo Next.js del panel (`/conductor`): un
  solo despliegue web. Sesión propia (`despacho.driver.token`) para no
  mezclarse con la del operador en el mismo navegador. Instalable (manifest).
- La app Expo (`apps/driver`) se conserva como alternativa, sin mantenimiento
  activo.

**Lo que se pierde frente a la app nativa (aceptado)**
- Sin ubicación con pantalla bloqueada ni en segundo plano: el navegador la
  corta. Mitigación: Wake Lock, aviso al volver, y vuelta automática a modo
  zona si no llega GPS en 3 min. El hito de riesgo del spec (§10) aplica igual:
  si en la práctica se corta mucho, el modo zona es el principal.
- GPS solo en https (o localhost).
- Sin push con la página cerrada (Web Push queda pendiente; en iOS además
  requiere instalarla en la pantalla de inicio).

**Seguimiento**
- `tracking_links` con token aleatorio de 24 bytes (base64url). Lo generan el
  operador de la ciudad o el conductor asignado; se reutiliza mientras esté
  vigente. Vence a las 12 h o 30 min después de cerrar el servicio.
- `public_tracking(token)`: estado, lugares (posición o centro del sector),
  primer nombre, vehículo y placa del mensajero, y su posición solo si el
  servicio está en curso, en modo en vivo y al día. Nunca datos del cliente
  ni teléfono del conductor. Página pública con `noindex` y consulta cada 10 s
  (sin WebSocket para no exponer el canal autenticado). Límite de 60
  consultas/min por IP.
- "Ruta" = línea recta del mensajero a su próximo punto con un estimado a
  20 km/h. Ruta por calles real queda pendiente (OSRM propio o un proveedor de
  direcciones).
- El consentimiento pasa a la versión `2026-10-v2` porque ahora el cliente de
  un servicio puede ver la ubicación del mensajero: todos deben aceptarlo de
  nuevo para activar el modo en vivo.

**Corrección encontrada en el camino:** `@fastify/cors` solo permitía
GET/HEAD/POST; los PATCH del navegador (cambiar estado o sector, editar
conductores y zonas) fallaban. Ahora se permiten PATCH/PUT/DELETE y hay una
prueba que lo cubre.

## 2026-10-11 · Hitos 1 a 6

**Máquina de estados**
- `transition_request(id, action, payload)` es la única vía; acciones: `offer`,
  `accept`, `reject`, `assign`, `reassign`, `pick_up`, `complete`, `cancel`,
  `note`. `apply_transition` es el núcleo sin permisos que usa también
  `expire_offers()` (actor null = sistema).
- `reassign` solo desde `assigned` (no desde `picked_up`): si ya recogió, se
  cancela y se crea otra. `complete` exige pasar por `picked_up`; el operador
  puede marcar ambos pasos para conductores sin app.
- `reject` también lo puede hacer el operador (retirar una oferta).
- Al asignar, el conductor pasa solo a `busy`; al cerrar su último servicio
  activo vuelve a `available` (si seguía `busy`).
- Errores con SQLSTATE `P0001` y código estable en `HINT`; el API los traduce
  a HTTP (403/404/409/400).
- Las ofertas vencen por un job del API cada 5 s (`expire_offers`).

**Presencia y geografía**
- `resolve_sector`: polígono si existe; si no, el sector con centro más cercano
  a menos de 1,5 km (el seed no trae polígonos). Se dibujan desde el panel.
- En modo `live` el historial se muestrea (1 fila/min) en un trigger; al salir
  de `live` se borra la posición exacta de la presencia.
- `driver_board` (vista con `security_invoker`) calcula `is_stale` con los
  ajustes por ciudad; el panel recarga cada 30 s además de los avisos.
- `nearby_drivers` ordena primero por mismo sector, luego por distancia
  (posición en vivo o centro del sector), y filtra por tipo de servicio.

**Tiempo real**
- Triggers hacen `pg_notify('changes')` con ids y ciudad, nunca datos; el API
  reenvía por WebSocket a quien puede verlo y el cliente recarga por HTTP
  (con RLS). Al reconectar se emite `resync`.
- El panel recarga listas completas ante cada aviso (agrupando ráfagas de
  150 ms). Suficiente para decenas de conductores; si crece, cambiar a deltas.

**API propio**
- Fastify + `jose` (JWT HS256, 12 h). El rol del token es informativo; los
  permisos los decide la base.
- Parser como ruta del API (`POST /parse`), con rate limit en memoria por
  usuario (20/min). Si el API corre en varias instancias, mover a la base.

**Parser**
- Claude con `output_config.format` (JSON schema) + validación Zod, un
  reintento si el JSON no valida, `effort: low` (extracción corta) y
  `fallbacks: "default"` en los modelos que lo aceptan. El modelo sale de
  `ANTHROPIC_MODEL`.
- Respaldo por reglas (sin key o si Claude falla): mismo contrato de salida.
  Los 16 ejemplos del spec corren contra las reglas en `pnpm test`; contra
  Claude con `eval:parser` (cuesta tokens, no corre en CI).
- El texto pegado no se registra en logs.

**Panel**
- Next.js como SPA del lado del cliente (todas las páginas `'use client'`)
  contra el API; sin rutas de servidor. Token en `localStorage`.
- Componentes al estilo shadcn/ui escritos a mano (sin la CLI) para no
  depender de su generador; mismas convenciones de tokens.
- Mapa: OpenFreeMap (gratis, sin token) por defecto; configurable con
  `NEXT_PUBLIC_MAP_STYLE_URL`.
- "Copiar mensaje para el grupo" no incluye datos del cliente.
- La solicitud se pone en rojo a los 5 min sin asignar
  (`UNASSIGNED_ALERT_MINUTES`).

**App del conductor**
- Navegación por estado (pocas pantallas) en vez de Expo Router.
- Pings: solo importa la última posición; si falla el envío se reintenta con
  la más reciente (no se acumula cola). Se envía si se movió ≥ 15 m o cada
  60 s como latido.
- Si no llega GPS en 3 min estando en vivo, la app vuelve a zona y avisa.
- Consentimiento: versión `2026-10-v1` en `profiles`; sin consentimiento el
  API rechaza `location_mode = live`. Retirarlo apaga el modo en vivo.
- Ofertas: WebSocket + polling cada 20 s + push FCM si hay credenciales.
  El push no lleva datos del cliente.

**Tests**
- Base y API usan `despacho_test`, que se recrea en cada corrida.


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
