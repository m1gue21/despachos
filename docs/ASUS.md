# Prueba en el ASUS (red local) + celular Android

Objetivo: el ASUS corre todo (base, API, panel); el celular Android con la app
y otro dispositivo con el panel se conectan por el Wi-Fi. **Sin dominio ni
internet público**: es solo para la prueba. Para exponerlo a internet después,
ver el final.

> Probado: la imagen de API y panel construye y arranca en Docker (en Mac),
> con migraciones, admin y login. **No probado en Windows.**

## 1. Preparar el ASUS (una vez)

1. Instalar [Docker Desktop](https://www.docker.com/products/docker-desktop/) (activa WSL2 si lo pide) y reiniciar.
2. Instalar [Git](https://git-scm.com/download/win) y clonar el repo:
   `git clone https://github.com/m1gue21/despachos.git arriero` (rama `main`).
3. **Que no se duerma:** Configuración → Sistema → Inicio/apagado y batería →
   pantalla y suspensión en "Nunca" (con corriente). Docker Desktop: Settings → General → "Start Docker Desktop when you sign in".
4. **IP fija:** en el router, reserva una IP para el ASUS (por su MAC), o fija
   la IP en Windows. Sin esto la app deja de encontrar el servidor.
5. **Red privada:** Configuración → Red → Wi-Fi/Ethernet → perfil "Privada".
6. **Firewall** (PowerShell como administrador):
   ```powershell
   New-NetFirewallRule -DisplayName "Arriero" -Direction Inbound -Protocol TCP -LocalPort 3000,4000 -Action Allow -Profile Private
   ```

## 2. Configurar y levantar

```powershell
cd arriero
copy deploy\.env.prod.example deploy\.env
notepad deploy\.env       # IP del ASUS (ipconfig), contraseñas largas, admin
docker compose --env-file deploy/.env -f deploy/docker-compose.prod.yml up -d --build
```

La primera vez tarda unos minutos. Comprobar: `http://IP-DEL-ASUS:4000/health`
debe responder `{"ok":true...}` y `http://IP-DEL-ASUS:3000` abre el panel (entra
con el admin del `.env`). Para ver registros:
`docker compose --env-file deploy/.env -f deploy/docker-compose.prod.yml logs -f api`.

Actualizar a una versión nueva: `git pull` y repetir el `up -d --build`
(las migraciones nuevas se aplican solas; los datos se conservan).

## 3. Datos de la prueba

1. Panel → **Conductores** → crear los repartidores de la prueba (con app) →
   **Invitar** genera correo y contraseña para cada uno.
2. Panel → **Control** → marcar "ubicación obligatoria" en ellos.
3. Panel → **Conductores** → ajustar sectores/zonas si hace falta (hay 10 de Manizales de ejemplo).

## 4. APK de Android

En el Mac (o donde esté el código), con la IP del ASUS:

```bash
cd apps/driver
# en eas.json, perfil "preview": EXPO_PUBLIC_API_URL = http://IP-DEL-ASUS:4000
npx eas-cli@latest build --profile preview --platform android
```

(usa la cuenta Expo ya iniciada; la primera vez pregunta si crear el proyecto: sí).
Al terminar da un enlace/QR: ábrelo en el celular, instala el APK (permitir
instalar de fuentes desconocidas) y entra con las credenciales de "Invitar".
El celular debe estar en **el mismo Wi-Fi** que el ASUS. Para probar fuera de
casa se necesita el acceso por internet (abajo).

Pasos del celular para que el control funcione: permiso de ubicación
"Permitir siempre", GPS en alta precisión, y quitar la optimización de batería
para la app (la app tiene una guía en pantalla).

## 5. Qué probar (checklist)

- [ ] Iniciar turno desde el celular y verlo en el mapa del panel.
- [ ] Pegar un mensaje de pedido → el sistema propone repartidor → aprobar → llega la oferta.
- [ ] Aceptar, recoger, entregar, y que el estado cambie en el panel.
- [ ] Bloquear la pantalla 10 min caminando: ¿sigue llegando ubicación? (lo más importante).
- [ ] Apagar el GPS y los datos: debe saltar la alerta en **Control**.
- [ ] Abrir el historial de ruta del turno.
- [ ] Reiniciar el ASUS: ¿Docker y los servicios vuelven solos?

Anota el resultado de la prueba de pantalla bloqueada por marca/modelo: es
la evidencia que necesitas para hablar con el administrador.

## 6. Respaldos

`powershell -File deploy\backup.ps1` guarda un respaldo en `C:\arriero-backups`
(conserva 14). Prográmalo con el Programador de tareas, a diario, y copia esa
carpeta a otro lugar.

## 7. Después: acceso desde internet

Para que los repartidores usen datos móviles y no solo el Wi-Fi: dominio propio
+ Cloudflare Tunnel (sin abrir puertos del router) con HTTPS, y reconstruir el
APK con la URL `https://`. Se hace cuando la prueba en red local funcione. Con
https también funciona la web del conductor (que exige conexión segura para el GPS).
