# Demo sin backend (rama `demo-sin-backend`)

Versión del sistema que corre **solo en el navegador**, para mostrarla en
Vercel sin base de datos ni API. El panel, la web del conductor y el
seguimiento del cliente son los mismos de `main`; lo único distinto es que las
llamadas al API las atiende un servidor simulado (`apps/panel/src/lib/mock`).

## Cómo funciona

- `lib/mock/install.ts` intercepta `fetch` y `WebSocket` hacia la URL del API
  (`https://api.demo.local`) y los resuelve en `lib/mock/routes.ts`, con las
  mismas rutas, respuestas y errores que `apps/api`.
- El estado vive en `localStorage` del navegador y se sincroniza entre
  pestañas (BroadcastChannel). Cada persona que abre la demo tiene sus propios
  datos.
- `lib/mock/engine.ts` replica las reglas de la base: permisos por ciudad,
  máquina de estados (`transition_request`), caducidad, sugerencias,
  seguimiento y calificaciones.
- `lib/mock/sim.ts` hace vivir la demo (en una sola pestaña a la vez):
  - los conductores en vivo se mueven por Manizales;
  - los conductores simulados aceptan (85 %) o rechazan las ofertas en 8–15 s;
  - van a recoger y a entregar solos;
  - las ofertas vencen a los 60 s;
  - el viaje del enlace fijo de demostración se repite en bucle.
- Si entras con la cuenta de un conductor en `/conductor`, ese conductor deja
  de ser simulado: tú respondes sus ofertas y avanzas sus servicios. Si el
  navegador no da GPS (p. ej. un computador), la demo simula uno.
- Hay 14 días de historial (servicios, rechazos, calificaciones) para que
  Métricas y Desempeño tengan datos.
- El botón amarillo **DEMO** (abajo a la izquierda) explica la demo, enlaza a
  las tres caras y permite **reiniciarla**.

## Flujo completo para mostrar

1. Abre `/login` y entra como **Operadora Manizales** (botones de cuentas de
   prueba).
2. Pulsa **N**, pega un mensaje (p. ej. `domi del cable pa chipre, a nombre de
   Luisa 3201234567`), **Analizar** y **Guardar**.
3. En el detalle, elige a un conductor sugerido con app (p. ej. Camila) y
   **Ofrecer**. En unos segundos acepta, aparece en el mapa yendo a recoger,
   recoge y entrega.
4. Mientras va, pulsa **Copiar enlace de seguimiento** y ábrelo en otra pestaña
   (mejor en vista de celular): el cliente ve al mensajero moverse. Al
   completarse, califica con estrellas.
5. Para responder tú como conductor: en otra pestaña abre `/conductor`, entra
   como un conductor (p. ej. Bruno) y desde el panel ofrécele un servicio.
6. Entra como **Admin** para ver **Desempeño** (incluye la calificación que
   acabas de dar) y **Métricas**.

Enlace fijo para compartir que funciona también en otro equipo, porque se
genera en cada navegador: `/seguimiento/demo-en-curso-manizales-0001`.

## Desplegar en Vercel

1. En vercel.com → **Add New… → Project** → importar `m1gue21/despachos`.
2. **Root Directory:** `apps/panel` (Vercel detecta Next.js y pnpm).
3. **Production Branch:** en *Settings → Git*, poner `demo-sin-backend` (o
   desplegar esa rama como Preview).
4. No hace falta ninguna variable de entorno: la demo está activa por defecto
   en esta rama. (`NEXT_PUBLIC_DEMO_MODE=0` la apaga y usa un API real en
   `NEXT_PUBLIC_API_URL`.)
5. Deploy. `apps/panel/vercel.json` instala solo el panel y sus dependencias.

## Límites de la demo

- Los datos son por navegador: un operador y un conductor en **equipos
  distintos** no se ven entre sí (para eso está el backend real de `main`).
  En el mismo navegador, con varias pestañas, sí.
- El parser usa solo las reglas locales (sin IA).
- WhatsApp, llamadas y Maps/Waze abren los enlaces reales.
- Si la pestaña queda en segundo plano, el navegador frena el simulador; al
  volver sigue.
