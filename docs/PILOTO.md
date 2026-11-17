# Piloto con el grupo de domicilios (Android primero)

El administrador de un grupo de WhatsApp de domicilios pidió **control total de
la ubicación de sus repartidores** y que **Arriero asigne los pedidos solo,
con su aprobación**. Este documento dice qué hay, cómo se pone a andar y cómo
saber si funcionó.

## Qué incluye

**Para el administrador (panel web)**

- Sube los pedidos como siempre (pegando el mensaje de WhatsApp).
- **Asignación asistida:** cada pedido sin asignar muestra la propuesta de
  Arriero ("Camila · a 286 m · mismo sector · en vivo") con un botón
  **Aprobar y ofrecer**. Si el conductor rechaza o no responde en 60 s, propone
  al siguiente sin repetir a quien ya dijo que no. Si el mejor candidato no
  tiene app, el botón es **Aprobar y asignar** (y se le avisa por WhatsApp).
- **Control** (menú): alertas de señal perdida con causa y qué hacer, estado de
  cada conductor (señal, batería), y el **recorrido de cualquier día** con
  reproducción, kilómetros, horas de turno y minutos sin señal.
- Sonido y contador en el menú cuando un conductor pierde la señal.
- Por conductor: casilla **"Ubicación obligatoria en turno"** (Conductores →
  Editar). Solo a esos se les exige y se les genera alerta.

**Para el repartidor (app Android)**

- **Iniciar turno / Terminar turno:** al iniciar pide los permisos y empieza a
  compartir ubicación en vivo (también con la pantalla bloqueada); al
  terminar, deja de compartir al instante. Fuera de turno no se rastrea nada.
- **Estado del celular** en pantalla: ubicación, permiso "todo el tiempo", GPS,
  batería, con botón **Arreglar** que abre el ajuste exacto.
- Si tiene ubicación obligatoria, no puede estar en turno sin compartirla
  (el servidor lo rechaza) y no se le baja solo a "por zona".
- Reporta al despacho el permiso, el GPS, la batería y si la ubicación es
  simulada, para que la alerta diga **por qué** se cortó.

## Qué es "control del 100 %" y qué no

Ningún sistema recibe la ubicación el 100 % del tiempo: Android puede cerrar la
app, el conductor puede apagar el GPS o quitar el permiso, el celular se queda
sin batería o sin datos. Lo que Arriero garantiza es **enterarse en menos de 2
minutos cuando se pierde** (revisión cada 15 s, señal vieja = más de 120 s) y
**saber la causa probable**:

| Alerta | Qué pasó |
|---|---|
| Sin señal | App cerrada o sin datos; el celular no alcanzó a avisar la causa |
| GPS apagado | Apagó la ubicación del celular |
| Quitó el permiso | La app ya no tiene "todo el tiempo" |
| Batería casi agotada | Menos de 5 % sin cargar |
| Ubicación falsa | El celular reporta ubicación simulada (Android) |
| Sin ubicación en vivo | Está en turno pero en modo zona (p. ej. usa la web) |

Limitación conocida: si el GPS se apaga o la app se cierra, ese mismo celular no
puede reportar la causa; en ese caso la alerta dice "Sin señal" y el
administrador debe llamar.

## Ponerlo a andar

1. **Build de la app** (una vez; necesita cuenta de Expo):
   ```bash
   cd apps/driver
   npx eas-cli@latest login
   # EXPO_PUBLIC_API_URL = la URL pública del API (idealmente https)
   npx eas-cli@latest build --profile preview --platform android
   ```
   Entrega un enlace al `.apk`; se instala en el celular (permitir "fuentes
   desconocidas"). Para push de ofertas con la app cerrada hace falta Firebase
   (ver `docs/DESPLIEGUE.md`); sin eso las ofertas llegan con la app abierta o
   en segundo plano por WebSocket y consulta.
2. **API y base de datos en un servidor** con la URL accesible desde los
   celulares (`docs/DESPLIEGUE.md`).
3. **Crear a los conductores** (Conductores → Agregar → Dar acceso) y marcar
   **Ubicación obligatoria en turno**. Entregarles correo y contraseña.
4. **Primer día con cada conductor** (10 minutos): instalar, entrar, aceptar el
   consentimiento, iniciar turno, conceder "Permitir todo el tiempo", y seguir la
   guía de batería de su marca (Xiaomi, Samsung, Huawei, Oppo). Comprobar en
   **Control** que aparece "En línea".
5. Para ver el panel con datos de prueba: `pnpm db:reset && pnpm dev` y
   `pnpm simulate` (mantiene vivos a los pilotos del seed salvo a Andrés, para
   ver una alerta).

## Cómo saber si funcionó (2 semanas, 5 a 10 repartidores)

- % del tiempo en turno con señal fresca (objetivo > 95 %).
- Alertas por turno y causa más frecuente. Si domina "Sin señal" en una marca de
  celular, es el ahorro de batería de esa marca.
- Tiempo desde que se sube el pedido hasta que se ofrece (con y sin la
  propuesta de Arriero) y % de propuestas aprobadas sin cambiar.
- Qué dicen los repartidores: si la ven como control o como ayuda.

## Privacidad (hacer antes de empezar)

- **Revisar con un abogado** el consentimiento (versión `2026-11-v3`, en la
  app y en la web) y redactar la política de tratamiento de datos. El
  administrador del grupo ve ubicación e historial de personas: definir quién es
  el responsable del tratamiento.
- El rastreo es **solo en turno**, el conductor inicia y termina su turno, y el
  consentimiento dice qué se recoge y cuánto se guarda (30 días). No degradar
  esto: es lo que hace válido el consentimiento.
- Los repartidores deben poder **ver** qué se comparte (la pantalla de estado
  del celular lo muestra).

## iPhone

La app es la misma (Expo): iOS tiene ubicación en segundo plano **más estable**
que Android, y el código ya está preparado (permiso "Siempre", modo de fondo,
indicador azul del sistema). Lo que falta no es técnico:

1. **Cuenta de Apple Developer** (US$ 99 al año).
2. **Distribución:** no hay APK. Se usa **TestFlight** (hasta 10 000 probadores,
   cada build dura 90 días; el primer build externo pasa una revisión rápida de
   Apple) o, para pocos equipos, instalación ad-hoc registrando el identificador
   de cada iPhone.
3. `npx eas-cli build --platform ios --profile production` y `eas submit`.
4. Para publicar en la App Store hay que justificar la ubicación en segundo
   plano ante Apple ("despacho de repartidores, solo durante el turno"): el
   texto del consentimiento y la política ya van en esa línea.

Mientras no haya cuenta de Apple, los repartidores con iPhone trabajan **por
zona** con la web (sin control de ubicación en vivo): el panel los distingue y
no les genera alertas, porque no tienen ubicación obligatoria.

Recomendación: abrir la cuenta de Apple Developer cuando el primer grupo
confirme que tiene iPhones; el trabajo técnico restante es de un par de días.

## Lo que falta probar

La app **no se ha probado en un celular real** (no hay emulador ni dispositivo en
el entorno de desarrollo): se verificó que compila, empaqueta para Android e iOS,
pasa `expo-doctor` (21/21) y que la lógica del estado del celular y el turno tiene
pruebas. La primera jornada con un celular real es la validación del hito de
riesgo del spec (§10): hay que comprobar sobre todo que el servicio en primer
plano sobreviva a la pantalla bloqueada en 3 marcas distintas.
