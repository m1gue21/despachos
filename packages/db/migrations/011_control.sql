-- 011: control de repartidores y asignación asistida.
--
--  · rank_drivers / propose_for_city: Arriero propone el mejor conductor para
--    cada pedido; el administrador lo aprueba (la oferta/asignación sigue
--    pasando por transition_request).
--  · drivers.tracking_required: "ubicación obligatoria en turno".
--  · Estado del dispositivo (permiso, GPS, batería, ubicación falsa) que
--    reporta la app, y alertas de señal perdida con su historial.
--  · driver_shifts: turnos (de offline a disponible/ocupado y de vuelta).

-- ── Ubicación obligatoria en turno + estado del dispositivo ────────────

alter table drivers add column tracking_required boolean not null default false;
grant insert (tracking_required) on drivers to app_user;
grant update (tracking_required) on drivers to app_user;

-- device = { permission: 'always'|'foreground'|'denied', gps_enabled, battery,
--            charging, mocked, app_version, os }.  Lo escribe la app del conductor.
alter table driver_presence add column device jsonb, add column device_at timestamptz;
grant update (device, device_at) on driver_presence to app_user;

-- ── Turnos ──────────────────────────────────────────────────────────────

create table driver_shifts (
  id bigserial primary key,
  driver_id uuid not null references drivers (id) on delete cascade,
  city_zone_id uuid not null references zones (id),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create index driver_shifts_driver_idx on driver_shifts (driver_id, started_at desc);
create unique index driver_shifts_open_key on driver_shifts (driver_id) where ended_at is null;

alter table driver_shifts enable row level security;
create policy driver_shifts_select on driver_shifts for select using (can_manage_city(city_zone_id));
grant select on driver_shifts to app_user;

create function driver_shift_track() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'offline' and new.status <> 'offline' then
    insert into driver_shifts (driver_id, city_zone_id)
    select new.driver_id, d.city_zone_id from drivers d where d.id = new.driver_id
    on conflict (driver_id) where ended_at is null do nothing;
  elsif old.status <> 'offline' and new.status = 'offline' then
    update driver_shifts set ended_at = now() where driver_id = new.driver_id and ended_at is null;
  end if;
  return new;
end $$;

create trigger driver_presence_shift
  after update of status on driver_presence
  for each row when (old.status is distinct from new.status)
  execute function driver_shift_track();

-- ── Alertas de señal perdida ────────────────────────────────────────────

create table tracking_alerts (
  id bigserial primary key,
  driver_id uuid not null references drivers (id) on delete cascade,
  city_zone_id uuid not null references zones (id),
  reason text not null check (reason in (
    'sin_senal','gps_apagado','permiso_revocado','bateria_critica','ubicacion_falsa','modo_sin_gps'
  )),
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text check (resolved_by in ('recuperada','turno_terminado')),
  last_seen_at timestamptz
);
create index tracking_alerts_driver_idx on tracking_alerts (driver_id, opened_at desc);
create index tracking_alerts_city_idx on tracking_alerts (city_zone_id, opened_at desc);
-- A lo sumo una alerta abierta por conductor.
create unique index tracking_alerts_open_key on tracking_alerts (driver_id) where resolved_at is null;

alter table tracking_alerts enable row level security;
create policy tracking_alerts_select on tracking_alerts for select using (can_manage_city(city_zone_id));
grant select on tracking_alerts to app_user;

create function notify_tracking_alert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform pg_notify('changes', jsonb_build_object(
    'table', 'tracking_alerts', 'op', tg_op, 'id', new.driver_id, 'city', new.city_zone_id,
    'type', case when new.resolved_at is null then 'opened' else 'resolved' end,
    'drivers', jsonb_build_array(new.driver_id))::text);
  return null;
end $$;

create trigger tracking_alerts_notify after insert or update on tracking_alerts
  for each row execute function notify_tracking_alert();

-- Abre, actualiza y cierra alertas. La llama el API cada 15 s (conexión de
-- dueño). Un conductor con ubicación obligatoria, en turno, debe estar en vivo
-- y con señal fresca (LIVE_STALE_SECONDS); además se alerta si reporta
-- ubicación falsa aunque haya señal. La causa sale del estado del dispositivo
-- si es reciente (3 min); si no, se asume "sin señal" (app cerrada o sin datos).
create function refresh_tracking_alerts() returns integer
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  r record;
  on_shift boolean;
  silent boolean;
  mocked boolean;
  dev_fresh boolean;
  new_reason text;
  opened integer := 0;
  open_id bigint;
  open_reason text;
begin
  for r in
    select d.id as did, d.city_zone_id as city, d.active, d.tracking_required,
           p.status, p.location_mode, p.last_seen_at, p.device, p.device_at
    from drivers d join driver_presence p on p.driver_id = d.id
    where d.tracking_required or exists (select 1 from tracking_alerts a where a.driver_id = d.id and a.resolved_at is null)
  loop
    on_shift := r.tracking_required and r.active and r.status in ('available', 'busy');
    dev_fresh := r.device_at is not null and r.device_at > now() - interval '3 minutes';
    mocked := dev_fresh and coalesce((r.device ->> 'mocked')::boolean, false);
    silent := r.location_mode <> 'live' or r.last_seen_at is null
              or r.last_seen_at < now() - make_interval(secs => setting_int('LIVE_STALE_SECONDS', r.city));

    select a.id, a.reason into open_id, open_reason
    from tracking_alerts a where a.driver_id = r.did and a.resolved_at is null;

    if on_shift and (silent or mocked) then
      new_reason := case
        when mocked then 'ubicacion_falsa'
        when r.location_mode <> 'live' then 'modo_sin_gps'
        when dev_fresh and coalesce(r.device ->> 'permission', 'always') <> 'always' then 'permiso_revocado'
        when dev_fresh and coalesce((r.device ->> 'gps_enabled')::boolean, true) = false then 'gps_apagado'
        when dev_fresh and coalesce((r.device ->> 'battery')::numeric, 100) <= 5
             and not coalesce((r.device ->> 'charging')::boolean, false) then 'bateria_critica'
        else 'sin_senal'
      end;
      if open_id is null then
        insert into tracking_alerts (driver_id, city_zone_id, reason, last_seen_at)
        values (r.did, r.city, new_reason, r.last_seen_at);
        opened := opened + 1;
      elsif open_reason <> new_reason then
        update tracking_alerts set reason = new_reason where id = open_id;
      end if;
    elsif open_id is not null then
      update tracking_alerts
      set resolved_at = now(), resolved_by = case when on_shift then 'recuperada' else 'turno_terminado' end
      where id = open_id;
    end if;
  end loop;
  return opened;
end $$;
revoke execute on function refresh_tracking_alerts() from public;

-- ── Tablero de conductores: + ubicación obligatoria, dispositivo y alerta ──
-- (solo se agregan columnas al final; el resto queda igual que en 007)

create or replace view driver_board with (security_invoker = true) as
  select d.id, d.city_zone_id, d.display_name, d.phone, d.vehicle, d.plate, d.service_types::text[] as service_types,
         d.has_app, d.active, d.profile_id,
         p.status, p.location_mode, p.sector_zone_id, s.name as sector_name,
         st_y(p.position::geometry) as lat, st_x(p.position::geometry) as lng,
         st_y(s.center::geometry) as sector_lat, st_x(s.center::geometry) as sector_lng,
         p.accuracy_m, p.last_seen_at, p.zone_confirmed_at, p.updated_by, p.updated_at,
         case p.location_mode
           when 'live' then p.last_seen_at is null
             or p.last_seen_at < now() - make_interval(secs => setting_int('LIVE_STALE_SECONDS', d.city_zone_id))
           when 'zone' then p.zone_confirmed_at is null
             or p.zone_confirmed_at < now() - make_interval(mins => setting_int('ZONE_STALE_MINUTES', d.city_zone_id))
           else true
         end as is_stale,
         d.tracking_required, p.device, p.device_at, al.reason as alert_reason, al.opened_at as alert_since
  from drivers d
  join driver_presence p on p.driver_id = d.id
  left join zones s on s.id = p.sector_zone_id
  left join lateral (
    select a.reason, a.opened_at from tracking_alerts a where a.driver_id = d.id and a.resolved_at is null limit 1
  ) al on true;
grant select on driver_board to app_user;

-- ── Asignación asistida ─────────────────────────────────────────────────

-- Candidatos para un pedido, del mejor al peor. Disponibles, con ubicación al
-- día, del servicio pedido y que no hayan rechazado ni dejado vencer ESTE
-- pedido. Orden: distancia a la recogida (posición en vivo o centro del sector)
-- con ajustes: −200 m si es del mismo sector, +500 m si no tiene app (hay que
-- avisarle por WhatsApp), y a igualdad, quien menos servicios lleva hoy.
create function rank_drivers(p_request uuid, p_limit integer default 5)
returns table (
  driver_id uuid, display_name text, vehicle vehicle_type, has_app boolean,
  location_mode location_mode, sector_name text, distance_m float8, same_sector boolean,
  services_today integer, reason text
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  r requests;
  pickup geography;
begin
  select * into r from requests where id = p_request;
  if not found or not can_manage_city(r.city_zone_id) then
    perform raise_app_error('forbidden', 'No tienes acceso a esta solicitud');
  end if;
  pickup := coalesce(r.pickup_position, (select center from zones where id = r.pickup_sector_id));

  return query
  with declined as (
    select distinct (e.payload ->> 'driver_id')::uuid as did
    from request_events e where e.request_id = r.id and e.type = 'rejected'
  ),
  cand as (
    select b.id as did, b.display_name as dname, b.vehicle as veh, b.has_app as app, b.location_mode as lmode, b.sector_name as sname,
           case when b.lat is not null and pickup is not null
                then st_distance(st_setsrid(st_makepoint(b.lng, b.lat), 4326)::geography, pickup)
                when b.sector_lat is not null and pickup is not null
                then st_distance(st_setsrid(st_makepoint(b.sector_lng, b.sector_lat), 4326)::geography, pickup)
           end as dist,
           coalesce(b.sector_zone_id = r.pickup_sector_id, false) as same_sec,
           (select count(*)::int from requests q
            where q.assigned_driver_id = b.id
              and q.assigned_at >= date_trunc('day', now() at time zone 'America/Bogota') at time zone 'America/Bogota') as today
    from driver_board b
    where b.city_zone_id = r.city_zone_id and b.active and b.status = 'available' and not b.is_stale
      and r.service::text = any (b.service_types)
      and b.id not in (select did from declined where did is not null)
  )
  select c.did, c.dname, c.veh, c.app, c.lmode, c.sname, c.dist, c.same_sec, c.today,
         concat_ws(' · ',
           case when c.dist is not null then 'a ' ||
             case when c.dist < 1000 then round(c.dist)::text || ' m' else round((c.dist / 1000)::numeric, 1)::text || ' km' end end,
           case when c.same_sec then 'mismo sector' end,
           case when c.lmode = 'live' then 'en vivo' end,
           case when not c.app then 'sin app: se asigna directo' end,
           case when c.today = 0 then 'sin servicios hoy' end)
  from cand c
  order by coalesce(c.dist, 2500) + case when c.app then 0 else 500 end - case when c.same_sec then 200 else 0 end,
           c.today, c.dname
  limit p_limit;
end $$;

-- La mejor propuesta para cada pedido sin asignar de la ciudad.
create function propose_for_city(p_city uuid)
returns table (
  request_id uuid, driver_id uuid, display_name text, vehicle vehicle_type, has_app boolean,
  distance_m float8, reason text, declined integer
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not can_manage_city(p_city) then
    perform raise_app_error('forbidden', 'No tienes acceso a esta ciudad');
  end if;
  return query
  select r.id, c.driver_id, c.display_name, c.vehicle, c.has_app, c.distance_m, c.reason,
         (select count(distinct e.payload ->> 'driver_id')::int
          from request_events e where e.request_id = r.id and e.type = 'rejected')
  from requests r
  cross join lateral rank_drivers(r.id, 1) c
  where r.city_zone_id = p_city and r.status = 'created'
  order by r.created_at;
end $$;

revoke execute on function rank_drivers(uuid, integer) from public;
revoke execute on function propose_for_city(uuid) from public;
grant execute on function rank_drivers(uuid, integer), propose_for_city(uuid) to app_user;
