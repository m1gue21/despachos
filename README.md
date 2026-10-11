# Despacho local

Plataforma de despacho para domiciliarios y conductores (Manizales y, luego,
otras ciudades de Caldas). El operador registra las solicitudes que llegan por
WhatsApp, ve a los conductores en un mapa en vivo y asigna; el conductor
recibe y gestiona los servicios en una app Android.

- Spec del MVP: [docs/SPEC_MVP_despacho_local.md](docs/SPEC_MVP_despacho_local.md)
- Decisiones tomadas en el camino: [DECISIONS.md](DECISIONS.md)
- Despliegue: [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md)

## Estado

| Hito | Estado |
|---|---|
| 0 · Fundaciones (modelo, RLS, seed, tests) | ✅ |
| 1 · Núcleo de solicitudes | ✅ |
| 2 · Conductores y presencia por zonas | ✅ |
| 3 · Mapa en tiempo real (+ simulador) | ✅ |
| 4 · App del conductor | ✅ código · ⏳ validar en celulares reales |
| 5 · Parser y productividad | ✅ (Claude con key, reglas sin key) |
| 6 · Métricas y entrega | ✅ métricas, retención, rate limit · guía de despliegue sin probar en la nube |

## Estructura

```
apps/
  api/        API Node (Fastify): auth JWT, RLS por petición, WebSocket, parser, push
  panel/      Panel web del operador (Next.js + Tailwind + MapLibre)
  driver/     App del conductor (Expo, Android primero)
packages/
  shared/     enums, tipos de API, schemas Zod y textos en español
  db/         migraciones SQL, seed, reset y tests de RLS/máquina de estados
docker-compose.yml   Postgres 16 + PostGIS
```

## Requisitos

- Node 20+ y pnpm 9 (`npm i -g pnpm@9`)
- Docker Desktop corriendo
- Para la app: un celular Android con la app de desarrollo instalada (ver abajo)

## Levantar todo en local

```bash
pnpm install
pnpm db:up          # Postgres + PostGIS en el puerto 5433
pnpm db:reset       # migraciones + seed (borra y recrea la base de desarrollo)
pnpm dev            # API en :4000 y panel en http://localhost:3000
```

Entra al panel con un usuario del seed (contraseña `dev12345`, **solo local**):

| Usuario | Rol |
|---|---|
| `admin@despacho.local` | admin (todas las ciudades) |
| `op.manizales@despacho.local` | operadora de Manizales |
| `op.villamaria@despacho.local` | operador de Villamaría |
| `ana@despacho.local`, `bruno@despacho.local` | conductores con app |

Para ver el mapa con movimiento:

```bash
pnpm simulate       # 20 conductores moviéndose por Manizales (Ctrl+C para parar)
```

### Parser con IA

Sin `ANTHROPIC_API_KEY` el botón "Analizar" usa un parser por reglas local.
Con key (en `.env`), usa Claude con salida estructurada y cae a las reglas si
falla. Para medir el parser con IA contra los 16 ejemplos (gasta tokens):

```bash
pnpm --filter @despacho/api eval:parser
```

### App del conductor

La ubicación en segundo plano necesita un **development build** (no Expo Go).

```bash
cd apps/driver
npx eas-cli@latest build --profile development --platform android   # una vez: genera el APK
pnpm dev:driver                                                       # sirve el bundle
```

Instala el APK en el celular, ábrelo y conéctalo al bundle (misma red Wi-Fi).
La app encuentra sola el API en `http://<IP-de-tu-computador>:4000`; si no,
define `EXPO_PUBLIC_API_URL`. Entra con `ana@despacho.local` / `dev12345`.

Para probar solo pantallas y flujo (sin ubicación en segundo plano ni push),
también sirve Expo Go: `pnpm dev:driver` y escanear el QR.

## Primer admin en un entorno nuevo

```bash
pnpm --filter @despacho/db reset --no-seed    # SOLO en una base vacía
ADMIN_EMAIL=tu@correo.com ADMIN_PASSWORD='una-clave-larga' pnpm --filter @despacho/db create-admin
```

Desde el panel, el admin crea ciudades, sectores, grupos, operadores y
conductores. Abrir otra ciudad es solo datos.

## Tests

```bash
pnpm test           # todo: shared, API (incluye flujo completo con WebSocket) y base de datos
pnpm typecheck
```

Los tests de base de datos y del API usan su propia base (`despacho_test`) y
la recrean en cada corrida; no tocan los datos de desarrollo.

Qué cubren: RLS (aislamiento por ciudad, conductores entre sí, datos del
cliente), máquina de estados (transiciones válidas e inválidas, ofertas
vencidas), presencia (caducidad, sector automático), `nearby_drivers`, el
parser por reglas (16 mensajes) y el flujo operador → oferta → aceptar →
recogido → completado por HTTP + WebSocket.

## Cómo funciona la seguridad

El API se conecta como `app_user`, un rol de Postgres sin BYPASSRLS, y en cada
petición fija `app.user_id` dentro de la transacción. Las políticas RLS leen
ese valor con `auth_uid()`. Los cambios de estado de una solicitud solo pasan
por `transition_request()`. Detalle en `packages/db/migrations/005_rls.sql` y
`006_transitions.sql`.
