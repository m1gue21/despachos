-- 005: identidad por transacción, RLS y permisos de app_user.
--
-- Cómo llega la identidad: el API valida el JWT y, dentro de la transacción
-- de cada petición, hace
--   select set_config('app.user_id', '<uuid>', true);
-- conectado como app_user. Todo lo de abajo lee ese valor con auth_uid().
-- Solo el API se conecta como app_user, igual que PostgREST en Supabase.

-- ── Funciones de identidad ──────────────────────────────────────────────

create function auth_uid() returns uuid
language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

-- security definer: leen profiles/operator_zones/drivers sin pasar por su
-- propia RLS (si no, las políticas se llamarían a sí mismas).
create function auth_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth_uid() and active
$$;

create function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth_role() = 'admin', false)
$$;

create function operator_has_city(p_city uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth_role() = 'operator'
     and exists (select 1 from operator_zones where operator_id = auth_uid() and zone_id = p_city)
$$;

-- Admin, u operador de esa ciudad.
create function can_manage_city(p_city uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(is_admin() or operator_has_city(p_city), false)
$$;

create function my_driver_id() returns uuid
language sql stable security definer set search_path = public as $$
  select d.id from drivers d
  where d.profile_id = auth_uid() and d.active and auth_role() = 'driver'
$$;

create function driver_city(p_driver uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select city_zone_id from drivers where id = p_driver
$$;

create function request_city(p_request uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select city_zone_id from requests where id = p_request
$$;

-- Login: devuelve el id del perfil activo o null. Es la única forma de tocar
-- app_users desde app_user.
create function auth_login(p_email text, p_password text) returns uuid
language sql stable security definer set search_path = public as $$
  select u.id
  from app_users u
  join profiles p on p.id = u.id and p.active
  where lower(u.email) = lower(p_email)
    and u.password_hash = crypt(p_password, u.password_hash)
$$;

-- ── RLS activo en todas las tablas ──────────────────────────────────────

alter table app_users enable row level security;
alter table profiles enable row level security;
alter table zones enable row level security;
alter table operator_zones enable row level security;
alter table drivers enable row level security;
alter table driver_presence enable row level security;
alter table driver_location_history enable row level security;
alter table push_tokens enable row level security;
alter table whatsapp_groups enable row level security;
alter table requests enable row level security;
alter table request_events enable row level security;
alter table app_settings enable row level security;

-- app_users: sin políticas ni permisos. Solo vía auth_login().

-- profiles: cada uno ve el suyo; el admin, todos. Cambiar rol o activar
-- usuarios va por funciones de admin (Hito 2), no por update directo.
create policy profiles_select on profiles for select
  using (id = auth_uid() or is_admin());
create policy profiles_update on profiles for update
  using (id = auth_uid() or is_admin())
  with check (id = auth_uid() or is_admin());
grant select on profiles to app_user;
grant update (full_name, phone, consent_at, consent_version) on profiles to app_user;

-- zones: cualquier sesión las lee (el conductor necesita los sectores de su
-- ciudad y no son datos sensibles). Escribe el admin.
create policy zones_select on zones for select
  using (auth_uid() is not null);
create policy zones_admin_write on zones for all
  using (is_admin()) with check (is_admin());
grant select, insert, update on zones to app_user;

-- operator_zones: el operador ve las suyas; el admin las gestiona.
create policy operator_zones_select on operator_zones for select
  using (operator_id = auth_uid() or is_admin());
create policy operator_zones_admin_write on operator_zones for all
  using (is_admin()) with check (is_admin());
grant select, insert, delete on operator_zones to app_user;

-- drivers: admin y operadores de la ciudad gestionan; el conductor solo se
-- ve a sí mismo. No hay delete: se desactiva con active = false.
create policy drivers_select on drivers for select
  using (can_manage_city(city_zone_id) or id = my_driver_id());
create policy drivers_insert on drivers for insert
  with check (can_manage_city(city_zone_id));
create policy drivers_update on drivers for update
  using (can_manage_city(city_zone_id))
  with check (can_manage_city(city_zone_id));
-- profile_id y has_app (vincular una cuenta) quedan para la función de
-- invitación del admin (Hito 2).
grant select on drivers to app_user;
grant insert (city_zone_id, display_name, phone, vehicle, plate, service_types, active)
  on drivers to app_user;
grant update (city_zone_id, display_name, phone, vehicle, plate, service_types, active)
  on drivers to app_user;

-- driver_presence: la fila la crea un trigger; se actualiza en sitio.
-- updated_by/updated_at los pone driver_presence_stamp().
create policy driver_presence_select on driver_presence for select
  using (can_manage_city(driver_city(driver_id)) or driver_id = my_driver_id());
create policy driver_presence_update on driver_presence for update
  using (can_manage_city(driver_city(driver_id)) or driver_id = my_driver_id())
  with check (can_manage_city(driver_city(driver_id)) or driver_id = my_driver_id());
grant select on driver_presence to app_user;
grant update (status, location_mode, sector_zone_id, position, accuracy_m,
              last_seen_at, zone_confirmed_at) on driver_presence to app_user;

-- driver_location_history: el conductor inserta lo suyo; lo leen admin y
-- operadores de la ciudad. El conductor no relee su historial.
create policy driver_location_history_select on driver_location_history for select
  using (can_manage_city(driver_city(driver_id)));
create policy driver_location_history_insert on driver_location_history for insert
  with check (driver_id = my_driver_id());
grant select, insert on driver_location_history to app_user;
grant usage on sequence driver_location_history_id_seq to app_user;

-- push_tokens: del propio conductor. El envío de push lo hace el servidor
-- con la conexión de dueño.
create policy push_tokens_own on push_tokens for all
  using (driver_id = my_driver_id()) with check (driver_id = my_driver_id());
grant select, insert, update, delete on push_tokens to app_user;

-- whatsapp_groups: admin y operadores de la ciudad.
create policy whatsapp_groups_all on whatsapp_groups for all
  using (can_manage_city(city_zone_id)) with check (can_manage_city(city_zone_id));
grant select, insert, update on whatsapp_groups to app_user;

-- requests: admin y operadores de la ciudad, y el conductor asignado. Las
-- ofertas las ve el conductor por la vista driver_offers (sin datos del
-- cliente). Nadie toca status/asignación/fechas por update directo: los
-- permisos de columna lo impiden y transition_request() (Hito 1, security
-- definer) es la única vía.
create policy requests_select on requests for select
  using (can_manage_city(city_zone_id) or assigned_driver_id = my_driver_id());
create policy requests_insert on requests for insert
  with check (can_manage_city(city_zone_id) and created_by = auth_uid());
create policy requests_update on requests for update
  using (can_manage_city(city_zone_id))
  with check (can_manage_city(city_zone_id));
grant select on requests to app_user;
grant insert (city_zone_id, channel, service, source_group_id, raw_text,
              pickup_text, pickup_sector_id, pickup_position,
              dropoff_text, dropoff_sector_id, dropoff_position,
              customer_name, customer_phone, notes, created_by) on requests to app_user;
grant update (service, source_group_id, pickup_text, pickup_sector_id, pickup_position,
              dropoff_text, dropoff_sector_id, dropoff_position,
              customer_name, customer_phone, notes) on requests to app_user;

-- request_events: solo lectura para quien puede ver la ciudad.
create policy request_events_select on request_events for select
  using (can_manage_city(request_city(request_id)));
grant select on request_events to app_user;

-- app_settings: cualquier sesión lee; el admin escribe.
create policy app_settings_select on app_settings for select
  using (auth_uid() is not null);
create policy app_settings_admin_write on app_settings for all
  using (is_admin()) with check (is_admin());
grant select, insert, update on app_settings to app_user;

-- ── Vista de ofertas para el conductor ──────────────────────────────────
-- Corre con permisos del dueño (sin security_invoker), por eso filtra ella
-- misma por my_driver_id(). No expone nombre ni teléfono del cliente: eso
-- solo lo ve el conductor ya asignado (Ley 1581).
create view driver_offers as
  select r.id, r.city_zone_id, r.service, r.status,
         r.pickup_text, r.pickup_sector_id, r.pickup_position,
         r.dropoff_text, r.dropoff_sector_id, r.dropoff_position,
         r.notes, r.offered_at,
         r.offered_at + make_interval(secs => setting_int('OFFER_TIMEOUT_SECONDS', r.city_zone_id))
           as offer_expires_at
  from requests r
  where r.status = 'offered'
    and r.offered_driver_id = my_driver_id();
grant select on driver_offers to app_user;

-- Las funciones son ejecutables por PUBLIC por defecto. auth_login toca
-- hashes: solo app_user (y el dueño) la ejecutan.
revoke execute on function auth_login(text, text) from public;
grant execute on function auth_login(text, text) to app_user;
