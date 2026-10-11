-- 004: grupos de WhatsApp, solicitudes, eventos y ajustes.

-- Catálogo para etiquetar el origen. No guarda mensajes.
create table whatsapp_groups (
  id uuid primary key default gen_random_uuid(),
  city_zone_id uuid not null references zones (id),
  name text not null,
  kind whatsapp_group_kind not null default 'mixed',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index whatsapp_groups_city_idx on whatsapp_groups (city_zone_id);

create trigger whatsapp_groups_city
  before insert or update of city_zone_id on whatsapp_groups
  for each row execute function ensure_zone_level('city_zone_id');

create table requests (
  id uuid primary key default gen_random_uuid(),
  city_zone_id uuid not null references zones (id),
  channel request_channel not null default 'whatsapp_manual',
  service service_type not null,
  status request_status not null default 'created',
  source_group_id uuid references whatsapp_groups (id) on delete set null,
  raw_text text,
  pickup_text text not null,
  pickup_sector_id uuid references zones (id),
  pickup_position geography(Point, 4326),
  dropoff_text text,
  dropoff_sector_id uuid references zones (id),
  dropoff_position geography(Point, 4326),
  customer_name text,
  customer_phone text,
  notes text,
  -- A quién está ofrecida ahora mismo (no estaba en el spec; hace falta para
  -- que el conductor vea sus ofertas y para el timeout, ver DECISIONS.md).
  offered_driver_id uuid references drivers (id) on delete set null,
  offered_at timestamptz,
  assigned_driver_id uuid references drivers (id) on delete set null,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  assigned_at timestamptz,
  completed_at timestamptz,
  cancel_reason text
);
create index requests_city_status_created_idx on requests (city_zone_id, status, created_at desc);
create index requests_assigned_driver_idx on requests (assigned_driver_id) where assigned_driver_id is not null;
create index requests_offered_driver_idx on requests (offered_driver_id) where offered_driver_id is not null;
create index requests_pickup_position_idx on requests using gist (pickup_position);
create index requests_dropoff_position_idx on requests using gist (dropoff_position);

create trigger requests_city
  before insert or update of city_zone_id on requests
  for each row execute function ensure_zone_level('city_zone_id');
create trigger requests_pickup_sector
  before insert or update of pickup_sector_id on requests
  for each row execute function ensure_zone_level('pickup_sector_id', 'sector');
create trigger requests_dropoff_sector
  before insert or update of dropoff_sector_id on requests
  for each row execute function ensure_zone_level('dropoff_sector_id', 'sector');

-- Append-only. Solo transition_request() (Hito 1) escribe aquí.
create table request_events (
  id bigserial primary key,
  request_id uuid not null references requests (id) on delete restrict,
  type text not null check (type in (
    'created','offered','assigned','rejected','reassigned','status_changed','cancelled','note'
  )),
  from_status request_status,
  to_status request_status,
  actor_id uuid references profiles (id) on delete set null,
  actor_role user_role,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index request_events_request_idx on request_events (request_id, created_at);
create index request_events_created_idx on request_events (created_at);

create function request_events_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'request_events es append-only' using errcode = 'insufficient_privilege';
end $$;

create trigger request_events_no_update
  before update or delete on request_events
  for each row execute function request_events_append_only();

-- Clave/valor global (city_zone_id null) o por ciudad, que manda sobre el global.
create table app_settings (
  key text not null check (key in (
    'ZONE_STALE_MINUTES','LIVE_STALE_SECONDS','LIVE_PING_SECONDS',
    'OFFER_TIMEOUT_SECONDS','LOCATION_RETENTION_DAYS'
  )),
  city_zone_id uuid references zones (id) on delete cascade,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
create unique index app_settings_key_city_key on app_settings (key, city_zone_id) nulls not distinct;

create trigger app_settings_city
  before insert or update of city_zone_id on app_settings
  for each row execute function ensure_zone_level('city_zone_id');

create function setting_int(p_key text, p_city uuid default null) returns integer
language sql stable as $$
  select (value #>> '{}')::integer
  from app_settings
  where key = p_key and (city_zone_id = p_city or city_zone_id is null)
  order by city_zone_id nulls last
  limit 1
$$;
