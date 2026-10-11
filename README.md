# Despacho local

Plataforma de despacho para domiciliarios y conductores (Manizales y, luego,
otras ciudades de Caldas). Spec completo del MVP:
[docs/SPEC_MVP_despacho_local.md](docs/SPEC_MVP_despacho_local.md). Decisiones tomadas en el camino:
[DECISIONS.md](DECISIONS.md).

## Estado

| Hito | Estado |
|---|---|
| 0 · Fundaciones (modelo, RLS, seed, tests) | ✅ |
| 1 · Núcleo de solicitudes | pendiente |
| 2 · Conductores y presencia por zonas | pendiente |
| 3 · Mapa en tiempo real | pendiente |
| 4 · App del conductor | pendiente |
| 5 · Parser y productividad | pendiente |
| 6 · Métricas y entrega | pendiente |

## Estructura

```
apps/
  api/        API en Node (Hito 1): auth, RPC, tiempo real
  panel/      Next.js (Hito 1)
  driver/     Expo (Hito 4)
packages/
  shared/     enums, tipos y schemas Zod (fuente única)
  db/         migraciones SQL, seed, reset y tests de RLS
docker-compose.yml   Postgres 16 + PostGIS
```

## Requisitos

- Node 20 o superior, pnpm 9
- Docker Desktop corriendo

## Levantar en local

```bash
pnpm install
cp .env.example .env
pnpm db:up        # Postgres + PostGIS en el puerto 5433
pnpm db:reset     # migraciones + seed
pnpm db:test      # tests de RLS y permisos
```

Usuarios del seed (contraseña `dev12345`, solo local): `admin@despacho.local`,
`op.manizales@despacho.local`, `op.villamaria@despacho.local`,
`ana@despacho.local`, `bruno@despacho.local`.

## Primer admin en un entorno sin seed

```bash
pnpm --filter @despacho/db reset --no-seed
ADMIN_EMAIL=tu@correo.com ADMIN_PASSWORD='una-clave-larga' pnpm --filter @despacho/db create-admin
```

(En producción no se usa `reset`: las migraciones se aplican una vez; la
guía de despliegue llega en el Hito 6.)

## Cómo funciona la seguridad

El API se conecta como `app_user`, un rol sin BYPASSRLS, y en cada petición
fija `app.user_id` dentro de la transacción. Las políticas RLS leen ese valor
con `auth_uid()`. Detalle en `packages/db/migrations/005_rls.sql`.

## Tests

```bash
pnpm db:test      # RLS, permisos y enums contra la base
pnpm test         # todo el monorepo
pnpm typecheck
```
