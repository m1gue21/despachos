# apps/api

API en Node (Hito 1): login con JWT sobre `auth_login()`, llamadas a las
funciones SQL como `app_user` con `app.user_id` por transacción, y tiempo
real por WebSocket a partir de `LISTEN/NOTIFY`. Reemplaza a Supabase
(Auth, PostgREST y Realtime) en el MVP; ver DECISIONS.md.
