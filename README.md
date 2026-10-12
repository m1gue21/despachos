# Despacho local

Plataforma de despacho para domiciliarios y conductores (Manizales y, luego,
otras ciudades de Caldas). El operador registra las solicitudes que llegan por
WhatsApp, ve a los conductores en un mapa en vivo y asigna; el conductor
recibe y gestiona los servicios desde una web para celular, y el cliente
puede seguir su pedido con un enlace temporal.

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
| 4 · Conductor (web en `/conductor`) | ✅ · ⏳ probar en celulares reales con https |
| Extra · Seguimiento para el cliente | ✅ enlace temporal `/seguimiento/<token>` |
| Extra · Calificaciones y desempeño | ✅ el cliente califica en el enlace; el admin ve puntaje y estadísticas |
| 5 · Parser y productividad | ✅ (Claude con key, reglas sin key) |
| 6 · Métricas y entrega | ✅ métricas, retención, rate limit · guía de despliegue sin probar en la nube |

## Estructura

```
apps/
  api/        API Node (Fastify): auth JWT, RLS por petición, WebSocket, parser, push
  panel/      Next.js: panel del operador (/), web del conductor (/conductor)
              y seguimiento público del cliente (/seguimiento/<token>)
  driver/     App nativa Expo (alternativa, no es el canal principal; ver abajo)
packages/
  shared/     enums, tipos de API, schemas Zod y textos en español
  db/         migraciones SQL, seed, reset y tests de RLS/máquina de estados
docker-compose.yml   Postgres 16 + PostGIS
```

## Requisitos

- Node 20+ y pnpm 9 (`npm i -g pnpm@9`)
- Docker Desktop corriendo

## Levantar todo en local

```bash
pnpm install
pnpm db:up          # Postgres + PostGIS en el puerto 5433
pnpm db:reset       # migraciones + seed + conductores de demo (borra y recrea la base de desarrollo)
pnpm dev            # API en :4000 y panel en http://localhost:3000
```

Entra al panel con un usuario del seed (contraseña `dev12345`, **solo local**).
En desarrollo, el login del panel y el de la app muestran botones de "Cuentas
de prueba" que rellenan correo y contraseña; en builds de producción no
aparecen (salvo que se fuerce con `NEXT_PUBLIC_DEMO_LOGINS=1` o
`EXPO_PUBLIC_DEMO_LOGINS=1` para una demo).

| Usuario | Rol |
|---|---|
| `admin@despacho.local` | admin (todas las ciudades) |
| `op.manizales@despacho.local` | operadora de Manizales |
| `op.villamaria@despacho.local` | operador de Villamaría |
| `ana@despacho.local`, `bruno@despacho.local` | conductores con app |
| `camila@`, `jhon@`, `luzmarina@`, `andres@`, `valentina@despacho.local` | conductores de demo con app |

Además del seed mínimo, `db:reset` carga `packages/db/seed-demo.sql`: 12
conductores y mensajeros más, 14 días de servicios cerrados con
calificaciones, y estados variados (disponibles por sector,
uno en vivo, una desactualizada, dos ocupados con servicio en curso, uno
desconectado, una inactiva y dos en Villamaría). Para omitirlos:
`pnpm db:reset -- --no-demo`. Los tests no los usan.

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

### Web del conductor

Los conductores entran en **http://localhost:3000/conductor** (o desde
`/login` con su cuenta: se les redirige solos). Es una web para celular que se
puede "Agregar a la pantalla principal". Tiene estado, sector con "Sigo aquí",
ubicación en vivo, ofertas con temporizador, sonido y vibración, servicio
activo con Maps/Waze/llamar/WhatsApp, "Enviar seguimiento al cliente" e
historial del día.

**Límites de la web (importante):**

- La ubicación en vivo solo se envía **con la página abierta y la pantalla
  encendida**. La página pide mantener la pantalla encendida (Wake Lock) y, si
  deja de recibir GPS 3 minutos, vuelve sola a modo zona y avisa. Con pantalla
  bloqueada o en otra app (incluido Maps/Waze), la ubicación se pausa.
- El navegador solo da GPS en **https** (o `localhost`). Para probar en un
  celular de la red local:
  - Lo más simple: desplegar con https (ver `docs/DESPLIEGUE.md`), o
  - En Android/Chrome, solo para pruebas: abrir
    `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, agregar
    `http://<IP-del-computador>:3000` y reiniciar Chrome. El panel debe llamar
    al API por la IP: `NEXT_PUBLIC_API_URL=http://<IP>:4000` en `.env`.
- Los avisos de ofertas suenan y vibran con la página abierta; con la pestaña
  en segundo plano se muestra una notificación del navegador si el conductor
  la permitió. Sin push con la página cerrada (pendiente: Web Push).

### Seguimiento para el cliente

Desde el detalle de una solicitud (panel) o desde el servicio activo (web del
conductor) se genera un enlace temporal `/seguimiento/<token>` y se envía por
WhatsApp al cliente. Sin login, el cliente ve el estado por pasos, el primer
nombre y vehículo del mensajero y, mientras el servicio está en curso y el
mensajero comparte en vivo, su posición en el mapa con una línea recta hasta
el próximo punto y un tiempo estimado. No muestra datos del cliente ni el
teléfono del mensajero. Vence a las 12 h o 30 min después de cerrar el servicio.

Para ver un ejemplo en movimiento (con la base cargada con `db:reset` y el
API corriendo):

```bash
pnpm demo:tracking
```

Imprime el enlace del cliente y mueve a Luz Marina de Chipre al aeropuerto
cada 3 s. Ábrelo en el navegador (mejor en vista de celular).

### Calificaciones y desempeño

Cuando el servicio se completa, la página de seguimiento le pide al cliente
de 1 a 5 estrellas, etiquetas rápidas y un comentario opcional (una vez por
servicio; el enlace sigue abierto 12 h para eso).

El admin ve **Desempeño** en el menú: ranking por puntaje (0–100) y, al elegir
un conductor, servicios por día, aceptación, rechazos y ofertas vencidas,
tiempos de respuesta, recogida y entrega, distribución de estrellas,
etiquetas y comentarios. La fórmula está explicada en la misma página y en
`DECISIONS.md`. El seed de demo trae 14 días de historial para verlo con datos.

### App nativa (alternativa)

`apps/driver` es una app Expo con ubicación en segundo plano real (pantalla
bloqueada). No es el canal principal; queda por si la web no alcanza.
Requiere un development build con EAS (`npx eas-cli@latest build --profile
development --platform android`) y `pnpm dev:driver`.

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
