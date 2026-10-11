# Despliegue

> Guía para pasar del entorno local a producción. **No se ha probado todavía
> en la nube**: revísala al hacer el primer despliegue y corrige lo que falle.

## Piezas

| Pieza | Qué es | Dónde puede vivir |
|---|---|---|
| Base de datos | Postgres 16 + PostGIS | VPS con Docker (este `docker-compose.yml`) o un Postgres administrado con PostGIS |
| API | Node 20+ (`apps/api`), proceso largo con WebSocket | VPS (Docker/systemd), Fly.io, Railway, Render |
| Panel | Next.js (`apps/panel`), sitio estático + cliente | Vercel, o el mismo VPS con `next start` |
| App | Expo / EAS Build | APK interno o Play Store |

El API necesita un proceso que se mantenga vivo (WebSocket, `LISTEN`, jobs), así
que no sirve una plataforma solo serverless para esa pieza.

## 1. Base de datos

1. Crea la base y aplica las migraciones **una sola vez** (no uses `reset` en
   producción después del primer día: borra todo):
   ```bash
   DATABASE_URL=postgres://... pnpm --filter @despacho/db reset --no-seed
   ```
   Para cambios posteriores, aplica a mano solo los archivos nuevos de
   `packages/db/migrations/` (pendiente: un comando `migrate` incremental).
2. Cambia la contraseña del rol `app_user`:
   ```sql
   alter role app_user password '<contraseña-larga>';
   ```
3. Crea el primer admin con `create-admin` (ver README).
4. Respaldos diarios (`pg_dump`) fuera del servidor.

## 2. API

Variables mínimas: `DATABASE_URL`, `APP_DATABASE_URL`, `JWT_SECRET` (largo y
aleatorio), `CORS_ORIGINS` (dominio del panel), `NODE_ENV=production`.
Opcionales: `ANTHROPIC_API_KEY` + `ANTHROPIC_MODEL`, `FCM_SERVER_CREDENTIALS`.

```bash
pnpm install --frozen-lockfile
pnpm --filter @despacho/api start
```

Detrás de un proxy con HTTPS (Caddy/Nginx) que permita WebSocket en `/ws`.
Una sola instancia en el MVP (el rate limit del parser es en memoria).

## 3. Panel

```bash
NEXT_PUBLIC_API_URL=https://api.tu-dominio.com pnpm --filter @despacho/panel build
```

En Vercel: raíz del proyecto `apps/panel`, comando de instalación
`pnpm install` desde la raíz del monorepo, y la variable `NEXT_PUBLIC_API_URL`.

## 4. App del conductor

1. Cuenta de Expo y `npx eas-cli@latest login`.
2. En `apps/driver/eas.json`, pon `EXPO_PUBLIC_API_URL` con la URL pública del API
   en los perfiles `preview` y `production`.
3. Push: crea un proyecto de Firebase, agrega la app Android
   (`co.despacho.conductor`), sube las credenciales FCM a EAS
   (`eas credentials`) y pon la cuenta de servicio en `FCM_SERVER_CREDENTIALS` del API.
4. `npx eas-cli@latest build --profile preview --platform android` → APK para
   repartir; `production` para Play Store (requiere justificar la ubicación en
   segundo plano en la revisión de Google).

## 5. Antes de abrir

- Redactar la política de tratamiento de datos (`/privacidad` en el panel).
- Validar la ubicación en segundo plano en 3 celulares de gama media/baja
  durante una jornada (spec §10). Si falla, dejar solo el modo zona.
- Cambiar o borrar los usuarios del seed si se usó en algún entorno compartido.
