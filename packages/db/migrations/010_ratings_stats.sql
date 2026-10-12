-- 010: calificaciones del cliente (desde el enlace de seguimiento) y
-- estadísticas/puntaje por conductor para el admin.

-- ── Calificaciones ──────────────────────────────────────────────────────

create table driver_ratings (
  id bigserial primary key,
  request_id uuid not null unique references requests (id) on delete restrict,
  driver_id uuid not null references drivers (id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  tags text[] not null default '{}',
  comment text check (length(comment) <= 500),
  created_at timestamptz not null default now()
);
create index driver_ratings_driver_idx on driver_ratings (driver_id, created_at desc);

-- Etiquetas permitidas (el cliente elige de una lista; no texto libre).
create function rating_tags_valid(p_tags text[]) returns boolean
language sql immutable as $$
  select coalesce(p_tags <@ array['puntual','amable','cuidadoso','buena_comunicacion',
                                  'tardo','mal_trato','producto_danado','no_contesto'], true)
$$;
alter table driver_ratings add constraint driver_ratings_tags_check check (rating_tags_valid(tags));

-- Solo el admin las lee (incluyen comentarios del cliente). Se escriben por
-- submit_rating().
alter table driver_ratings enable row level security;
create policy driver_ratings_admin_select on driver_ratings for select using (is_admin());
grant select on driver_ratings to app_user;

-- Ventana del enlace tras cerrar el servicio: de 30 min a 12 h, para que el
-- cliente alcance a calificar. La posición deja de mostrarse al cerrar igual.
create or replace function tracking_link_open(link tracking_links, r requests) returns boolean
language sql stable as $$
  select link.revoked_at is null
     and link.expires_at > now()
     and not (r.status in ('completed', 'cancelled')
              and coalesce(r.completed_at, (select max(created_at) from request_events
                                            where request_id = r.id and type = 'cancelled'))
                  < now() - interval '12 hours')
$$;

-- El cliente califica con el token del enlace. Una vez por servicio.
create function submit_rating(p_token text, p_stars integer, p_tags text[], p_comment text) returns void
language plpgsql security definer set search_path = public as $$
declare
  link tracking_links;
  r requests;
begin
  select * into link from tracking_links where token = p_token;
  if not found then perform raise_app_error('not_found', 'Este enlace venció o no existe'); end if;
  select * into r from requests where id = link.request_id;
  if not tracking_link_open(link, r) then
    perform raise_app_error('not_found', 'Este enlace venció o no existe');
  end if;
  if r.status <> 'completed' or r.assigned_driver_id is null then
    perform raise_app_error('invalid_transition', 'Solo se califica un servicio completado');
  end if;
  if p_stars is null or p_stars not between 1 and 5 then
    perform raise_app_error('bad_payload', 'La calificación va de 1 a 5 estrellas');
  end if;
  if not rating_tags_valid(p_tags) then
    perform raise_app_error('bad_payload', 'Etiqueta no válida');
  end if;
  if exists (select 1 from driver_ratings where request_id = r.id) then
    perform raise_app_error('invalid_transition', 'Este servicio ya fue calificado');
  end if;
  insert into driver_ratings (request_id, driver_id, stars, tags, comment)
  values (r.id, r.assigned_driver_id, p_stars, coalesce(p_tags, '{}'), nullif(trim(p_comment), ''));
end $$;

revoke execute on function submit_rating(text, integer, text[], text) from public;
grant execute on function submit_rating(text, integer, text[], text) to app_user;

-- public_tracking: usa la nueva ventana y dice si se puede calificar.
create or replace function public_tracking(p_token text) returns jsonb
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
  rated smallint;
begin
  if p_token is null or length(p_token) < 20 then return null; end if;
  select * into link from tracking_links where token = p_token;
  if not found then return null; end if;
  select * into r from requests where id = link.request_id;
  if not tracking_link_open(link, r) then return null; end if;

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
    show_position := r.status in ('assigned', 'picked_up')
      and p.location_mode = 'live' and p.position is not null
      and p.last_seen_at > now() - make_interval(secs => setting_int('LIVE_STALE_SECONDS', r.city_zone_id));
  end if;

  select stars into rated from driver_ratings where request_id = r.id;

  return jsonb_build_object(
    'status', r.status,
    'service', r.service,
    'city', (select name from zones where id = r.city_zone_id),
    'pickup', jsonb_build_object('text', r.pickup_text, 'lat', pickup_lat, 'lng', pickup_lng),
    'dropoff', case when r.dropoff_text is not null or dropoff_lat is not null
                 then jsonb_build_object('text', r.dropoff_text, 'lat', dropoff_lat, 'lng', dropoff_lng) end,
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
    'rating', case when rated is not null then jsonb_build_object('stars', rated) end,
    'can_rate', r.status = 'completed' and r.assigned_driver_id is not null and rated is null,
    'expires_at', least(link.expires_at, coalesce(r.completed_at + interval '12 hours', link.expires_at))
  );
end $$;

-- ── Estadísticas y puntaje ──────────────────────────────────────────────
--
-- Puntaje 0–100 =
--   40 % calificación (bayesiana: 5 calificaciones "fantasma" de 4,0 para que
--        pocas calificaciones no dominen)
--   25 % aceptación de ofertas (aceptadas / ofrecidas)
--   20 % cumplimiento: completados / (completados + cancelados estando asignado)
--   15 % rapidez para aceptar (≤ 15 s = 1, ≥ timeout de oferta = 0)
-- Un componente sin datos vale 0,8 (neutro). Con menos de 3 servicios
-- completados el puntaje se marca como provisional.

create function driver_stats(p_city uuid, p_days integer default 30)
returns table (
  driver_id uuid, display_name text, vehicle vehicle_type, has_app boolean, active boolean,
  completed integer, cancelled_assigned integer,
  offers integer, accepted integer, rejected integer, timeouts integer,
  acceptance_rate float8, completion_rate float8,
  avg_accept_seconds float8, avg_to_pickup_seconds float8, avg_delivery_seconds float8,
  ratings_count integer, ratings_avg float8,
  score integer, provisional boolean, last_service_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not is_admin() then perform raise_app_error('forbidden', 'Solo el administrador ve el desempeño'); end if;

  return query
  with win as (select now() - make_interval(days => p_days) as since),
  ev as (
    select e.*, (e.payload ->> 'driver_id')::uuid as drv
    from request_events e
    join requests r on r.id = e.request_id
    where r.city_zone_id = p_city and e.created_at >= (select since from win)
  ),
  offer_stats as (
    select drv,
           count(*) filter (where type = 'offered') as offers,
           count(*) filter (where type = 'assigned' and payload ->> 'via' = 'accept') as accepted,
           count(*) filter (where type = 'rejected' and payload ->> 'reason' = 'rejected') as rejected,
           count(*) filter (where type = 'rejected' and payload ->> 'reason' = 'timeout') as timeouts
    from ev where drv is not null group by drv
  ),
  accept_times as (
    select a.drv, extract(epoch from a.created_at - o.created_at) as secs
    from ev a
    join lateral (
      select o.created_at from ev o
      where o.request_id = a.request_id and o.type = 'offered' and o.drv = a.drv and o.created_at <= a.created_at
      order by o.created_at desc limit 1
    ) o on true
    where a.type = 'assigned' and a.payload ->> 'via' = 'accept'
  ),
  svc as (
    select r.assigned_driver_id as drv, r.status, r.assigned_at, r.completed_at,
           (select min(e.created_at) from request_events e
            where e.request_id = r.id and e.type = 'status_changed' and e.to_status = 'picked_up') as picked_up_at
    from requests r
    where r.city_zone_id = p_city and r.assigned_driver_id is not null
      and r.created_at >= (select since from win)
  ),
  svc_stats as (
    select drv,
           count(*) filter (where status = 'completed') as completed,
           count(*) filter (where status = 'cancelled') as cancelled_assigned,
           avg(extract(epoch from picked_up_at - assigned_at)) filter (where picked_up_at is not null) as to_pickup,
           avg(extract(epoch from completed_at - picked_up_at)) filter (where status = 'completed' and picked_up_at is not null) as delivery,
           max(coalesce(completed_at, assigned_at)) as last_at
    from svc group by drv
  ),
  rating_stats as (
    select dr.driver_id as drv, count(*) as n, avg(dr.stars)::float8 as avg_stars, sum(dr.stars)::float8 as sum_stars
    from driver_ratings dr
    join requests r on r.id = dr.request_id
    where r.city_zone_id = p_city and dr.created_at >= (select since from win)
    group by dr.driver_id
  ),
  base as (
    select d.id, d.display_name, d.vehicle, d.has_app, d.active,
           coalesce(s.completed, 0)::int as completed,
           coalesce(s.cancelled_assigned, 0)::int as cancelled_assigned,
           coalesce(o.offers, 0)::int as offers,
           coalesce(o.accepted, 0)::int as accepted,
           coalesce(o.rejected, 0)::int as rejected,
           coalesce(o.timeouts, 0)::int as timeouts,
           (select avg(secs) from accept_times t where t.drv = d.id)::float8 as avg_accept,
           s.to_pickup::float8 as to_pickup,
           s.delivery::float8 as delivery,
           coalesce(rt.n, 0)::int as rn,
           rt.avg_stars as ravg,
           coalesce(rt.sum_stars, 0) as rsum,
           s.last_at,
           setting_int('OFFER_TIMEOUT_SECONDS', p_city)::float8 as timeout_secs
    from drivers d
    left join svc_stats s on s.drv = d.id
    left join offer_stats o on o.drv = d.id
    left join rating_stats rt on rt.drv = d.id
    where d.city_zone_id = p_city
  ),
  comp as (
    select b.*,
           case when b.offers > 0 then b.accepted::float8 / b.offers end as acc_rate,
           case when b.completed + b.cancelled_assigned > 0
                then b.completed::float8 / (b.completed + b.cancelled_assigned) end as comp_rate,
           -- Bayesiana: (5 × 4,0 + suma) / (5 + n), normalizada a 0–1.
           ((5 * 4.0 + b.rsum) / (5 + b.rn) - 1) / 4 as rating_part
    from base b
  )
  select c.id, c.display_name, c.vehicle, c.has_app, c.active,
         c.completed, c.cancelled_assigned, c.offers, c.accepted, c.rejected, c.timeouts,
         c.acc_rate, c.comp_rate, c.avg_accept, c.to_pickup, c.delivery,
         c.rn, c.ravg,
         round(100 * (
           0.40 * c.rating_part
           + 0.25 * coalesce(c.acc_rate, 0.8)
           + 0.20 * coalesce(c.comp_rate, 0.8)
           -- (least/greatest ignoran nulos: el caso sin datos va aparte)
           + 0.15 * case when c.avg_accept is null then 0.8
                         else greatest(0, least(1, 1 - (c.avg_accept - 15) / greatest(c.timeout_secs - 15, 1))) end
         ))::int as score,
         c.completed < 3 as provisional,
         c.last_at
  from comp c
  order by c.active desc, (c.completed < 3), 19 desc, c.completed desc;
end $$;

revoke execute on function driver_stats(uuid, integer) from public;
grant execute on function driver_stats(uuid, integer) to app_user;
