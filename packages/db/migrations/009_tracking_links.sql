-- 009: enlaces temporales de seguimiento para el cliente.
--
-- El operador o el conductor asignado generan un enlace con un token
-- aleatorio. Cualquiera con el enlace ve, sin login, el estado del servicio
-- y, mientras está en curso, la posición del mensajero. No expone datos del
-- cliente ni el teléfono del conductor. El enlace muere a las 12 h o 30 min
-- después de cerrarse el servicio, lo que pase primero.

create table tracking_links (
  token text primary key,
  request_id uuid not null references requests (id) on delete restrict,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index tracking_links_request_idx on tracking_links (request_id);

-- Solo se accede por las funciones de abajo.
alter table tracking_links enable row level security;

-- Crea (o reutiliza) el enlace vigente de una solicitud abierta.
create function create_tracking_link(p_request uuid)
returns table (token text, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  r requests;
  link tracking_links;
begin
  select * into r from requests where id = p_request;
  if not found then perform raise_app_error('not_found', 'La solicitud no existe'); end if;
  if not (can_manage_city(r.city_zone_id)
          or (my_driver_id() is not null and r.assigned_driver_id = my_driver_id())) then
    perform raise_app_error('forbidden', 'No puedes compartir esta solicitud');
  end if;
  if r.status in ('completed', 'cancelled') then
    perform raise_app_error('invalid_transition', 'La solicitud ya está cerrada');
  end if;

  select * into link from tracking_links l
  where l.request_id = r.id and l.revoked_at is null and l.expires_at > now() + interval '30 minutes'
  order by l.created_at desc limit 1;

  if not found then
    insert into tracking_links (token, request_id, created_by, expires_at)
    values (
      -- 24 bytes aleatorios en base64 apto para URL (32 caracteres).
      translate(encode(gen_random_bytes(24), 'base64'), '+/', '-_'),
      r.id, auth_uid(), now() + interval '12 hours'
    )
    returning * into link;
  end if;

  return query select link.token, link.expires_at;
end $$;

-- Lo que ve el cliente. Devuelve null si el enlace no existe o venció.
create function public_tracking(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  link tracking_links;
  r requests;
  d drivers;
  p driver_presence;
  pickup_lat float8; pickup_lng float8;
  dropoff_lat float8; dropoff_lng float8;
  picked_up_at timestamptz;
  show_position boolean := false;
begin
  if p_token is null or length(p_token) < 20 then return null; end if;
  select * into link from tracking_links where token = p_token;
  if not found or link.revoked_at is not null or link.expires_at < now() then return null; end if;

  select * into r from requests where id = link.request_id;
  -- Cerrada hace más de 30 min: el enlace ya no sirve.
  if r.status in ('completed', 'cancelled')
     and coalesce(r.completed_at, (select max(created_at) from request_events
                                   where request_id = r.id and type = 'cancelled'))
         < now() - interval '30 minutes' then
    return null;
  end if;

  select st_y(coalesce(r.pickup_position, z.center)::geometry), st_x(coalesce(r.pickup_position, z.center)::geometry)
    into pickup_lat, pickup_lng
  from (select 1) x left join zones z on z.id = r.pickup_sector_id;
  select st_y(coalesce(r.dropoff_position, z.center)::geometry), st_x(coalesce(r.dropoff_position, z.center)::geometry)
    into dropoff_lat, dropoff_lng
  from (select 1) x left join zones z on z.id = r.dropoff_sector_id;

  select min(created_at) into picked_up_at from request_events
  where request_id = r.id and type = 'status_changed' and to_status = 'picked_up';

  if r.assigned_driver_id is not null then
    select * into d from drivers where id = r.assigned_driver_id;
    select * into p from driver_presence where driver_id = d.id;
    -- Posición exacta solo durante el servicio, en modo en vivo y al día.
    show_position := r.status in ('assigned', 'picked_up')
      and p.location_mode = 'live' and p.position is not null
      and p.last_seen_at > now() - make_interval(secs => setting_int('LIVE_STALE_SECONDS', r.city_zone_id));
  end if;

  return jsonb_build_object(
    'status', r.status,
    'service', r.service,
    'city', (select name from zones where id = r.city_zone_id),
    'pickup', jsonb_build_object('text', r.pickup_text, 'lat', pickup_lat, 'lng', pickup_lng),
    'dropoff', case when r.dropoff_text is not null or dropoff_lat is not null
                 then jsonb_build_object('text', r.dropoff_text, 'lat', dropoff_lat, 'lng', dropoff_lng) end,
    -- Solo el primer nombre del conductor; nunca su teléfono.
    'driver', case when d.id is not null then jsonb_build_object(
                 'name', split_part(d.display_name, ' ', 1),
                 'vehicle', d.vehicle,
                 'plate', d.plate,
                 'sector', (select name from zones where id = p.sector_zone_id)) end,
    'driver_position', case when show_position then jsonb_build_object(
                 'lat', st_y(p.position::geometry), 'lng', st_x(p.position::geometry),
                 'updated_at', p.last_seen_at) end,
    'timeline', jsonb_build_object(
                 'created_at', r.created_at,
                 'assigned_at', r.assigned_at,
                 'picked_up_at', picked_up_at,
                 'completed_at', r.completed_at),
    'expires_at', link.expires_at
  );
end $$;

revoke execute on function create_tracking_link(uuid) from public;
revoke execute on function public_tracking(text) from public;
grant execute on function create_tracking_link(uuid) to app_user;
grant execute on function public_tracking(text) to app_user;
