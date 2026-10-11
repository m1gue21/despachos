-- 007: geografía (sectores, cercanía), caducidad de presencia y avisos de
-- tiempo real.

-- ── Sectores ────────────────────────────────────────────────────────────

-- Sector que contiene el punto. Si ningún sector de la ciudad tiene polígono
-- que lo cubra, cae al sector con centro más cercano a menos de 1,5 km (los
-- sectores del seed aún no tienen polígono; ver DECISIONS.md).
create function resolve_sector(p_point geography, p_city uuid default null) returns uuid
language sql stable security definer set search_path = public as $$
  select id from (
    select id, 0 as rank, 0::float8 as dist
    from zones
    where level = 'sector' and active and geom is not null
      and (p_city is null or parent_id = p_city)
      and st_covers(geom, p_point)
    union all
    select id, 1, st_distance(center, p_point)
    from zones
    where level = 'sector' and active and center is not null
      and (p_city is null or parent_id = p_city)
      and st_dwithin(center, p_point, 1500)
  ) s
  order by rank, dist
  limit 1
$$;

-- ── Presencia ───────────────────────────────────────────────────────────

-- Reglas al actualizar presencia:
--  · el sector tiene que ser de la ciudad del conductor;
--  · en modo live, el sector se calcula solo a partir de la posición;
--  · confirmar zona (o cambiarla) renueva zone_confirmed_at;
--  · el historial se muestrea a lo sumo 1 fila por minuto.
create function driver_presence_rules() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  city uuid := (select city_zone_id from drivers where id = new.driver_id);
  auto_sector uuid;
begin
  if new.location_mode = 'live' and new.position is not null
     and (old.position is null or not st_equals(new.position::geometry, old.position::geometry)
          or old.location_mode <> 'live') then
    auto_sector := resolve_sector(new.position, city);
    if auto_sector is not null then
      new.sector_zone_id := auto_sector;
    end if;
    new.last_seen_at := coalesce(new.last_seen_at, now());
    if not exists (
      select 1 from driver_location_history
      where driver_id = new.driver_id and recorded_at > now() - interval '60 seconds'
    ) then
      insert into driver_location_history (driver_id, position) values (new.driver_id, new.position);
    end if;
  end if;

  -- Al salir de live se olvida la posición exacta.
  if new.location_mode <> 'live' then
    new.position := null;
    new.accuracy_m := null;
  end if;

  if new.sector_zone_id is not null and not exists (
    select 1 from zones where id = new.sector_zone_id and parent_id = city
  ) then
    raise exception 'El sector no pertenece a la ciudad del conductor'
      using errcode = 'check_violation';
  end if;

  if new.location_mode = 'zone' and (
       new.sector_zone_id is distinct from old.sector_zone_id
       or new.zone_confirmed_at is distinct from old.zone_confirmed_at
       or old.location_mode <> 'zone') then
    new.zone_confirmed_at := now();
  end if;
  return new;
end $$;

create trigger driver_presence_rules
  before update on driver_presence
  for each row execute function driver_presence_rules();

-- Tablero de conductores: ficha + presencia + caducidad. security_invoker
-- para que la RLS de drivers y driver_presence siga aplicando.
create view driver_board with (security_invoker = true) as
  select d.id, d.city_zone_id, d.display_name, d.phone, d.vehicle, d.plate, d.service_types,
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
         end as is_stale
  from drivers d
  join driver_presence p on p.driver_id = d.id
  left join zones s on s.id = p.sector_zone_id;
grant select on driver_board to app_user;

-- Sugerencia de conductores para una solicitud (no asigna). Disponibles y no
-- caducados; con posición se ordena por distancia a la recogida, si no, los
-- del mismo sector primero.
create function nearby_drivers(p_request uuid, p_radius_m integer default 5000)
returns table (
  driver_id uuid, display_name text, vehicle vehicle_type, has_app boolean,
  location_mode location_mode, sector_name text, distance_m float8, same_sector boolean
)
language plpgsql stable security definer set search_path = public as $$
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
  select * from (
    select b.id, b.display_name, b.vehicle, b.has_app, b.location_mode, b.sector_name,
           case when b.lat is not null and pickup is not null
                then st_distance(st_setsrid(st_makepoint(b.lng, b.lat), 4326)::geography, pickup)
                when b.sector_lat is not null and pickup is not null
                then st_distance(st_setsrid(st_makepoint(b.sector_lng, b.sector_lat), 4326)::geography, pickup)
           end as distance_m,
           coalesce(b.sector_zone_id = r.pickup_sector_id, false) as same_sector
    from driver_board b
    where b.city_zone_id = r.city_zone_id and b.active and b.status = 'available' and not b.is_stale
      and r.service = any (b.service_types)
  ) c
  -- Sin distancia calculable (sin posición ni centro) se incluye igual.
  where c.distance_m is null or c.distance_m <= p_radius_m
  order by c.same_sector desc, c.distance_m nulls last
  limit 20;
end $$;

-- Retención del historial de ubicación (Ley 1581). La llama el API a diario.
create function purge_location_history() returns integer
language sql security definer set search_path = public as $$
  with d as (
    delete from driver_location_history
    where recorded_at < now() - make_interval(days => coalesce(setting_int('LOCATION_RETENTION_DAYS'), 30))
    returning 1
  )
  select count(*)::integer from d
$$;
revoke execute on function purge_location_history() from public;

-- ── Tiempo real ─────────────────────────────────────────────────────────
-- Avisos por NOTIFY en el canal 'changes'. Solo llevan ids y ciudad: el
-- cliente vuelve a pedir los datos al API, y ahí aplica la RLS.

create function notify_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rec record := coalesce(new, old);
  payload jsonb;
begin
  payload := jsonb_build_object('table', tg_table_name, 'op', tg_op);
  case tg_table_name
  when 'requests' then
    payload := payload || jsonb_build_object(
      'id', rec.id, 'city', rec.city_zone_id,
      'drivers', to_jsonb(array_remove(array[
        new.offered_driver_id, new.assigned_driver_id,
        case when tg_op = 'UPDATE' then old.offered_driver_id end,
        case when tg_op = 'UPDATE' then old.assigned_driver_id end], null)));
  when 'request_events' then
    payload := payload || jsonb_build_object(
      'id', rec.request_id, 'city', request_city(rec.request_id), 'type', rec.type,
      'drivers', to_jsonb(array_remove(array[(rec.payload ->> 'driver_id')::uuid], null)));
  when 'driver_presence' then
    payload := payload || jsonb_build_object(
      'id', rec.driver_id, 'city', driver_city(rec.driver_id), 'drivers', jsonb_build_array(rec.driver_id));
  when 'drivers' then
    payload := payload || jsonb_build_object(
      'id', rec.id, 'city', rec.city_zone_id, 'drivers', jsonb_build_array(rec.id));
  else
    payload := payload || jsonb_build_object('id', null, 'city', null);
  end case;
  perform pg_notify('changes', payload::text);
  return null;
end $$;

create trigger requests_notify after insert or update on requests
  for each row execute function notify_change();
create trigger request_events_notify after insert on request_events
  for each row execute function notify_change();
create trigger driver_presence_notify after update on driver_presence
  for each row execute function notify_change();
create trigger drivers_notify after insert or update on drivers
  for each row execute function notify_change();
create trigger zones_notify after insert or update on zones
  for each row execute function notify_change();
