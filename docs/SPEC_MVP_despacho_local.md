# SPEC MVP: Plataforma de despacho local (domiciliarios y conductores)

> Documento para un agente de código. Léelo completo antes de escribir código. Donde diga **DECISIÓN**, no la cambies sin avisar. Donde diga **LIBRE**, elige lo más simple.

---

## 1. Contexto

En Manizales (Caldas, Colombia), domiciliarios y conductores de transporte se coordinan hoy por **grupos de WhatsApp**. Las solicitudes llegan en texto libre a esos grupos. Se quiere una plataforma donde un **administrador/operador** vea en tiempo real dónde están los conductores y mensajeros, registre las solicitudes que llegan por WhatsApp y las asigne.

Más adelante los **clientes** usarán la app directamente y habrá otras ciudades (Villamaría y otros pueblos de Caldas). El diseño debe soportarlo **sin reescribir el núcleo**.

### Principio rector
**El centro del sistema es la `Request` (solicitud), no la app del cliente.** Una solicitud es igual sin importar por qué canal nació. Hoy el único canal es `whatsapp_manual`; mañana serán `customer_app`, `whatsapp_bot`, `api`.

### Restricción importante: WhatsApp
- **No** usar librerías no oficiales de WhatsApp (Baileys, whatsapp-web.js, etc.): riesgo de baneo y van contra los términos de uso.
- **No** integrar la API de WhatsApp Business en el MVP.
- El puente con WhatsApp es **humano**: el operador lee los grupos en su propio WhatsApp/WhatsApp Web y registra las solicitudes en el panel. La plataforma ayuda con (a) un parser de texto pegado y (b) un botón "copiar mensaje formateado" para republicar en el grupo.

---

## 2. Alcance del MVP

### Incluido
1. **Panel web del operador/admin**: mapa en vivo, lista de conductores con estado y zona, bandeja de solicitudes, creación y asignación, gestión de zonas y grupos, métricas básicas.
2. **App móvil del conductor/mensajero**: login, estado (disponible/ocupado/desconectado), zona actual, ubicación en vivo opcional, recibir y aceptar/rechazar servicios, cambiar estado del servicio.
3. **Parser con LLM**: pegar un mensaje de WhatsApp y obtener campos prellenados.
4. **Multi-zona** desde el día uno (ciudades y sectores).
5. **Registro de eventos** de cada solicitud (auditoría y métricas).

### Fuera de alcance (no construir, pero no bloquear)
- App o web del cliente final (solo dejar el canal `customer_app` previsto en el modelo).
- Pagos, tarifas, facturación.
- Autoasignación automática por cercanía (dejar la función SQL de "conductores cercanos" lista, pero la asignación es manual).
- Integración automática con WhatsApp.
- Chat interno dentro de la app.
- Calificaciones.

---

## 3. Roles

| Rol | Descripción | Acceso |
|---|---|---|
| `admin` | Dueño de la plataforma | Todo, todas las zonas, gestión de usuarios y zonas |
| `operator` | Registra y asigna solicitudes | Panel web, solo las ciudades que se le asignen |
| `driver` | Conductor o mensajero | App móvil, solo sus datos y sus servicios |
| `customer` | **Reservado**, no implementar UI | Solo existe en el enum |

Un conductor puede **no tener la app** (`has_app = false`): existe como perfil para que el operador lo asigne y siga el servicio manualmente, ya que muchos arrancarán sin instalarla.

---

## 4. Modos de presencia (clave del producto)

Cada conductor tiene un `location_mode`:

| Modo | Cómo se sabe dónde está | Quién lo actualiza |
|---|---|---|
| `live` | GPS enviado por la app cada 10 s (configurable) | La app |
| `zone` | Sector/barrio elegido | El conductor (selector en la app) **o** el operador desde el panel |
| `none` | Desconocida | n/d |

Reglas:
- **DECISIÓN**: el modo base es `zone`. `live` es opt-in por conductor, con consentimiento explícito.
- En modo `live` también se calcula el sector automáticamente (point-in-polygon contra los sectores) para que el operador siempre vea una zona.
- **Caducidad**: una presencia `zone` se marca `stale` si no se confirma en `ZONE_STALE_MINUTES` (default 45). Una `live` es `stale` si el último ping tiene más de `LIVE_STALE_SECONDS` (default 120). El panel muestra el badge "desactualizado" y no cuenta al conductor como disponible confiable.
- El operador puede forzar zona y estado de cualquier conductor (campo `updated_by` para saber quién fue).
- La app debe permitir al conductor pasar de `live` a `zone` en cualquier momento (apagar el GPS sin perder el servicio).

---

## 5. Stack (DECISIÓN)

Monorepo con pnpm workspaces.

- **Backend y datos**: Supabase (Postgres + PostGIS + Auth + Realtime + Edge Functions). Toda la lógica sensible en funciones SQL (RPC) y políticas RLS.
- **Panel web**: Next.js (App Router) + TypeScript + Tailwind + shadcn/ui. Mapa con **MapLibre GL** (o Mapbox si hay token; LIBRE).
- **App móvil**: Expo (React Native) + TypeScript, **development build** (no Expo Go, porque la ubicación en segundo plano lo exige). `expo-location` con `startLocationUpdatesAsync`, `expo-task-manager`, `expo-notifications` (FCM en Android). **Android primero**; iOS después.
- **Parser**: Edge Function que llama a la API de Anthropic. El modelo sale de la variable `ANTHROPIC_MODEL`; la API key nunca va al cliente.
- **Validación**: Zod en los bordes. Tipos compartidos en `packages/shared`.

Si algo del stack choca con una restricción real, propón la alternativa más cercana y explica por qué antes de seguir.

### Estructura del repo
```
/
├─ apps/
│  ├─ panel/            # Next.js
│  └─ driver/           # Expo
├─ packages/
│  └─ shared/           # tipos, enums, zod schemas, constantes de estados
├─ supabase/
│  ├─ migrations/       # SQL versionado
│  ├─ functions/
│  │  └─ parse-request/ # Edge Function del parser
│  └─ seed.sql
├─ .env.example
└─ README.md
```

---

## 6. Modelo de datos

Todo el SQL va en migraciones. Habilitar `postgis` y `pgcrypto`.

### Enums
```sql
create type user_role as enum ('admin','operator','driver','customer');
create type zone_level as enum ('city','sector');
create type vehicle_type as enum ('moto','car','bicycle','other');
create type service_type as enum ('delivery','ride','errand');
create type driver_status as enum ('offline','available','busy');
create type location_mode as enum ('none','zone','live');
create type request_channel as enum ('whatsapp_manual','customer_app','whatsapp_bot','api');
create type request_status as enum (
  'created','offered','assigned','picked_up','completed','cancelled'
);
```

### Tablas

**`zones`** (ciudades y sectores en jerarquía)
- `id uuid pk`, `parent_id uuid null references zones`, `level zone_level`, `name text`, `slug text unique`
- `geom geography(Polygon,4326) null` (opcional en sectores; sin polígono, solo selección manual)
- `center geography(Point,4326) null` (para centrar el mapa)
- `active bool default true`
- Seed: ciudad **Manizales** con sectores iniciales (Centro, Chipre, Cable, Palogrande, La Enea, Milán, Av. Santander, etc.; LIBRE, editables desde el panel) y ciudad **Villamaría** vacía como ejemplo de reenfoque.

**`profiles`** (1 a 1 con `auth.users`)
- `id uuid pk references auth.users`, `role user_role`, `full_name text`, `phone text`, `active bool default true`, `created_at`

**`operator_zones`** (a qué ciudades tiene acceso un operador)
- `operator_id`, `zone_id` (zone de nivel `city`), pk compuesta

**`drivers`**
- `id uuid pk`, `profile_id uuid null references profiles` (null si `has_app=false`), `city_zone_id uuid references zones`
- `display_name text`, `phone text`, `vehicle vehicle_type`, `plate text null`, `service_types service_type[]`
- `has_app bool default false`, `active bool default true`

**`driver_presence`** (una fila por conductor, se actualiza en sitio)
- `driver_id pk references drivers`
- `status driver_status default 'offline'`
- `location_mode location_mode default 'none'`
- `sector_zone_id uuid null references zones`
- `position geography(Point,4326) null`, `accuracy_m real null`
- `last_seen_at timestamptz`, `zone_confirmed_at timestamptz`
- `updated_by uuid null references profiles`, `updated_at timestamptz`

**`driver_location_history`** (muestreada, solo modo live; retención configurable)
- `id bigserial`, `driver_id`, `position geography`, `recorded_at`
- Insertar como máximo 1 fila por conductor cada 60 s.

**`whatsapp_groups`** (catálogo de grupos que el operador monitorea)
- `id`, `city_zone_id`, `name text`, `kind` (`delivery`|`ride`|`mixed`), `active`
- No guarda mensajes ni conecta con WhatsApp, solo sirve para etiquetar el origen.

**`requests`**
- `id uuid pk`, `city_zone_id uuid not null`, `channel request_channel not null default 'whatsapp_manual'`
- `service service_type`, `status request_status default 'created'`
- `source_group_id uuid null references whatsapp_groups`
- `raw_text text null` (mensaje original pegado)
- `pickup_text text`, `pickup_sector_id uuid null`, `pickup_position geography null`
- `dropoff_text text null`, `dropoff_sector_id uuid null`, `dropoff_position geography null`
- `customer_name text null`, `customer_phone text null`, `notes text null`
- `assigned_driver_id uuid null references drivers`
- `created_by uuid null references profiles`, `created_at`, `assigned_at`, `completed_at`
- `cancel_reason text null`
- Índices: `(city_zone_id, status, created_at desc)`, GIST sobre posiciones.

**`request_events`** (append-only, **toda** transición pasa por aquí)
- `id bigserial`, `request_id`, `type text` (`created`, `offered`, `assigned`, `rejected`, `reassigned`, `status_changed`, `cancelled`, `note`)
- `from_status`, `to_status`, `actor_id uuid null`, `actor_role user_role null`, `payload jsonb`, `created_at`

**`app_settings`** (clave/valor por ciudad o global): `ZONE_STALE_MINUTES`, `LIVE_STALE_SECONDS`, `LIVE_PING_SECONDS`, `OFFER_TIMEOUT_SECONDS`.

**`push_tokens`**: `driver_id`, `token`, `platform`, `updated_at`.

### Máquina de estados de `requests`
```
created ──offer──▶ offered ──accept──▶ assigned ──picked_up──▶ picked_up ──complete──▶ completed
   │                  │ reject/timeout ▲
   │                  └────────────────┘ (vuelve a created)
   ├──assign directo (operador, conductor sin app o acuerdo por WhatsApp)──▶ assigned
   └──cancel (desde cualquier estado no terminal) ──▶ cancelled
```
- **Una sola función SQL** `transition_request(request_id, action, actor, payload)` valida la transición, actualiza `requests` e inserta en `request_events`, todo en una transacción. Ninguna otra parte del código cambia `status` directamente.
- Transiciones inválidas devuelven error claro (se prueban).
- `offer`: el operador ofrece a un conductor con app → push → el conductor acepta o rechaza en `OFFER_TIMEOUT_SECONDS`.
- `assign` directo: el operador asigna sin esperar aceptación (caso conductor sin app, o ya aceptó en el grupo de WhatsApp).

### Funciones SQL útiles
- `nearby_drivers(request_id, radius_m)`: conductores `available` y no `stale`, con distancia si hay `position`, o mismo `sector_zone_id` si solo hay zona. Ordenados por distancia/sector. **Solo se muestra como sugerencia en el panel, no asigna.**
- `resolve_sector(point)`: devuelve el sector que contiene el punto.
- `format_whatsapp_message(request_id)`: texto listo para republicar en el grupo (también puede vivir en el panel; LIBRE).

---

## 7. Seguridad y RLS (obligatorio)

- RLS **activo en todas las tablas**.
- `admin`: acceso total.
- `operator`: lee y escribe solo filas cuya `city_zone_id` esté en sus `operator_zones`.
- `driver`: lee su propia fila en `drivers` y `driver_presence`; actualiza solo su presencia; lee solo las `requests` asignadas u ofrecidas a él; **no** ve la ubicación ni los datos de otros conductores.
- Los cambios de estado de solicitudes por parte del conductor pasan únicamente por `transition_request`.
- Las claves (`SERVICE_ROLE`, `ANTHROPIC_API_KEY`) nunca salen de Edge Functions/servidor.
- Tests de RLS: un operador de Villamaría no puede ver solicitudes de Manizales; un conductor no puede leer a otro.

### Privacidad (Colombia, Ley 1581 de 2012)
- Pantalla de **consentimiento explícito** en la app antes de activar el modo `live` (qué se recoge, para qué, quién lo ve, cuánto se conserva). Guardar `consent_at` y la versión del texto en `profiles` o tabla aparte.
- El conductor puede apagar `live` cuando quiera.
- Retención de `driver_location_history`: borrar automáticamente a los 30 días (job programado, valor configurable).
- Datos de clientes (nombre, teléfono) accesibles solo para operadores de esa ciudad y el conductor asignado.
- Dejar un placeholder de "Política de tratamiento de datos" enlazado desde la app y el panel (el texto legal lo redactan los dueños).

---

## 8. Tiempo real

- **Panel**: suscripción a Supabase Realtime sobre `driver_presence`, `requests` y `request_events`, filtrado por ciudad.
- **Ubicación live**: la app actualiza `driver_presence` (upsert) cada `LIVE_PING_SECONDS` (default 10). El historial se muestrea aparte.
- **Eficiencia**: no enviar ping si el conductor está `offline`. Reducir frecuencia si no se movió más de 15 m.
- **Reconexión**: la app reintenta con backoff; el panel muestra "conectando…" si se cae el canal y se resincroniza al volver.

---

## 9. Panel web (operador/admin)

### Pantallas
1. **Login** (email + contraseña, Supabase Auth). Selector de ciudad activa si el usuario tiene varias.
2. **Tablero principal** (pantalla de trabajo, a pantalla completa):
   - **Mapa** con conductores: color por estado (verde disponible, naranja ocupado, gris offline), icono por vehículo, badge "desactualizado". Los que están en modo `zone` se muestran agrupados en el centro del sector con un contador; los `live` con su pin exacto. Pines de solicitudes pendientes.
   - **Panel lateral izquierdo, solicitudes**: columnas o filtros por estado, con tiempo transcurrido (se pone rojo pasados X minutos sin asignar).
   - **Panel lateral derecho, conductores**: lista filtrable por estado/sector/vehículo; cambiar estado y zona de un conductor con un clic.
3. **Nueva solicitud** (modal accesible con un atajo de teclado, p. ej. `N`):
   - Cuadro **"Pegar mensaje de WhatsApp"** → botón "Analizar" → prellena el formulario.
   - Formulario editable: servicio, grupo de origen, recogida, destino, cliente, teléfono, notas.
   - Los campos con baja confianza del parser se resaltan.
   - Guardar crea la solicitud en `created`.
4. **Detalle de solicitud**: datos, línea de tiempo (`request_events`), conductores sugeridos (`nearby_drivers`), botones **Ofrecer**, **Asignar directo**, **Reasignar**, **Cancelar**, **Marcar recogido/completado** (por si el conductor no usa la app), y **Copiar mensaje para el grupo**.
5. **Conductores**: CRUD (nombre, teléfono, vehículo, tipos de servicio, `has_app`, activo). Invitar conductor con app (genera acceso).
6. **Zonas y grupos**: CRUD de ciudades, sectores (con dibujo opcional de polígono) y grupos de WhatsApp. **Aquí se reenfoca a otra ciudad sin tocar código.**
7. **Métricas** (simples): solicitudes por día, tiempo medio hasta asignar, % completadas vs. canceladas, horas pico, por zona. Todo calculado desde `request_events`.

### Requisitos de UX
- Pensado para uso intensivo: pocos clics, atajos de teclado, sin recargas.
- Sonido y/o indicador visual cuando entra una solicitud nueva o se rechaza una oferta.
- Interfaz en **español (Colombia)**; textos centralizados para facilitar i18n.

---

## 10. App del conductor (Expo)

### Pantallas
1. **Login** + **consentimiento** (primera vez).
2. **Inicio**:
   - Interruptor grande **Disponible / Ocupado / Desconectado**.
   - Selector de **sector actual** (lista de sectores de su ciudad), con confirmación rápida "Sigo aquí".
   - Interruptor **"Compartir mi ubicación en vivo"** (activa el modo `live`, con consentimiento).
   - Indicador de conexión y última sincronización.
3. **Oferta de servicio** (pantalla completa + push + sonido): tipo, recogida, destino, notas, temporizador; botones **Aceptar** / **Rechazar**.
4. **Servicio activo**: datos del servicio, botón "Abrir en Google Maps/Waze" (deep link), botones **Recogido** y **Completado**, y llamar/escribir al cliente por teléfono/WhatsApp (deep link `wa.me`, abre el WhatsApp normal del conductor).
5. **Historial** simple de servicios del día.

### Requisitos técnicos críticos (Android)
- Ubicación en segundo plano mediante **foreground service** con notificación persistente visible ("Compartiendo ubicación").
- Solicitar permisos en el orden correcto (primer plano → segundo plano) y explicar por qué.
- Guía en la app para **excluir de la optimización de batería** (Xiaomi, Samsung, Huawei, Oppo matan procesos agresivamente).
- Si la app detecta que dejó de recibir ubicación, vuelve automáticamente a modo `zone` y avisa.
- Push de ofertas con prioridad alta (FCM), con respaldo de polling al abrir la app.
- Funcionar con mala conectividad: cola local de pings, reintentos.

> **Hito de riesgo**: antes de construir el resto de la app, validar la ubicación en segundo plano en **al menos 3 celulares reales de gama media/baja** durante una jornada. Si falla, el modo `zone` pasa a ser el único soportado en el MVP y se documenta.

---

## 11. Parser de mensajes (Edge Function `parse-request`)

**Entrada**: `{ raw_text, city_zone_id }`.
**Contexto enviado al LLM**: lista de sectores de la ciudad (nombres y alias comunes) para normalizar ("el cable" → sector Cable).
**Salida (JSON estricto, validado con Zod)**:
```json
{
  "service": "delivery | ride | errand | unknown",
  "pickup_text": "string | null",
  "pickup_sector_slug": "string | null",
  "dropoff_text": "string | null",
  "dropoff_sector_slug": "string | null",
  "customer_name": "string | null",
  "customer_phone": "string | null",
  "notes": "string | null",
  "confidence": { "service": 0.0, "pickup": 0.0, "dropoff": 0.0 }
}
```
Reglas:
- Si el modelo devuelve JSON inválido, reintentar una vez y si no, devolver error amigable (el operador llena a mano).
- **Nunca inventar**: si un dato no está en el texto, `null`.
- Requiere sesión de operador; límite de uso por usuario (rate limit).
- No guardar `raw_text` en logs de terceros más allá de lo necesario; el texto se guarda solo en `requests.raw_text` si el operador crea la solicitud.
- Incluir un set de **al menos 15 mensajes de ejemplo** (jerga local, abreviaturas, errores de ortografía, mensajes sin destino) como tests con expectativas.

---

## 12. Convenciones de código

- TypeScript estricto en todo; sin `any` salvo justificado.
- Enums y estados definidos **una vez** en `packages/shared` y reutilizados.
- Migraciones SQL pequeñas, ordenadas y reversibles cuando sea posible.
- Nombres de código en inglés; textos de UI en español.
- Sin secretos en el repo; `.env.example` completo.
- Commits pequeños y descriptivos por hito.
- README con: requisitos, cómo levantar todo en local (`supabase start`, panel, app), cómo crear el primer admin, cómo correr tests.

### Variables de entorno (`.env.example`)
```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # solo servidor/Edge
ANTHROPIC_API_KEY=                # solo Edge Function
ANTHROPIC_MODEL=                  # configurable, sin valor fijo en código
NEXT_PUBLIC_MAP_STYLE_URL=        # estilo MapLibre/Mapbox
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
FCM_SERVER_CREDENTIALS=           # para push
ZONE_STALE_MINUTES=45
LIVE_STALE_SECONDS=120
LIVE_PING_SECONDS=10
OFFER_TIMEOUT_SECONDS=60
```

---

## 13. Plan de entrega por hitos

Trabaja en este orden. **No avances de hito sin cumplir los criterios de aceptación** y deja un resumen corto de lo hecho y lo pendiente al terminar cada uno.

### Hito 0: Fundaciones
- Monorepo, Supabase local, migraciones del modelo completo, seed (Manizales + sectores, Villamaría), RLS y roles.
- **Aceptación**: `supabase db reset` deja todo funcionando; tests de RLS pasan; existe un admin inicial.

### Hito 1: Núcleo de solicitudes (sin mapa)
- `transition_request` + eventos + tests de la máquina de estados.
- Panel: login, nueva solicitud manual, lista, detalle, asignación directa y cancelación.
- **Aceptación**: crear, asignar y completar una solicitud deja la línea de tiempo completa en `request_events`; transiciones inválidas se rechazan.

### Hito 2: Conductores y presencia por zonas
- CRUD de conductores y zonas; presencia modo `zone` editable por el operador; caducidad (`stale`).
- Panel con lista de conductores y selector de sector.
- **Aceptación**: el operador cambia estado/sector de un conductor y se refleja en vivo en otra pestaña; los `stale` se marcan solos.

### Hito 3: Mapa en tiempo real
- Mapa en el tablero con conductores (agrupados por sector o pin exacto) y solicitudes; Realtime.
- `nearby_drivers` como sugerencia en el detalle.
- **Aceptación**: con datos simulados (script que mueve 20 conductores), el mapa se mantiene fluido y correcto.

### Hito 4: App del conductor
- Login, consentimiento, estado y sector, ofertas con push, aceptar/rechazar, servicio activo.
- **Validación de ubicación en segundo plano en celulares reales** (ver sección 10).
- Modo `live` con foreground service.
- **Aceptación**: flujo completo operador → oferta → aceptar → recogido → completado entre panel y app; ubicación live visible en el mapa con la pantalla bloqueada durante 30 minutos en un equipo real.

### Hito 5: Parser y productividad del operador
- Edge Function `parse-request`, UI de "pegar mensaje", resaltado de baja confianza, botón de copiar mensaje formateado, atajos de teclado.
- **Aceptación**: el set de 15 ejemplos pasa con los criterios definidos; el flujo "pegar → confirmar → guardar" toma menos de 15 segundos.

### Hito 6: Métricas, endurecimiento y entrega
- Pantalla de métricas, retención de historial, rate limits, manejo de errores, README final, guía de despliegue (Vercel para el panel, Supabase cloud, build de la app con EAS).
- **Aceptación**: despliegue reproducible desde cero siguiendo el README.

---

## 14. Criterios de calidad transversales

- Ninguna transición de estado fuera de `transition_request`.
- Ningún dato de otra ciudad o de otro conductor accesible vía RLS.
- El modo `zone` funciona completo aunque `live` esté deshabilitado.
- Agregar una ciudad nueva = solo datos (zonas, grupos, operadores), sin cambios de código.
- Agregar el canal `customer_app` más adelante = nueva UI y un insert en `requests`, sin tocar la máquina de estados.

## 15. Cómo trabajar (instrucciones para el agente)

1. Empieza por el Hito 0 y confirma el plan antes de escribir código masivo.
2. Si algo es ambiguo, **toma la opción más simple, documéntala en `DECISIONS.md` y sigue**. Pregunta solo si bloquea.
3. No añadas funcionalidades fuera de la sección 2.
4. Escribe tests para: máquina de estados, RLS, `nearby_drivers`, parser (set de ejemplos).
5. Al cerrar cada hito: resumen breve, qué se probó, qué queda pendiente y riesgos detectados.
