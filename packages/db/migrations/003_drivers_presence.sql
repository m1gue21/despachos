-- 003: conductores, presencia, historial de ubicación y tokens de push.

create table drivers (
  id uuid primary key default gen_random_uuid(),
  -- null cuando el conductor no tiene la app (has_app = false).
  profile_id uuid unique references profiles (id) on delete set null,
  city_zone_id uuid not null references zones (id),
  display_name text not null,
  phone text not null,
  vehicle vehicle_type not null,
  plate text,
  service_types service_type[] not null default '{}',
  has_app boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint drivers_app_needs_profile check (not has_app or profile_id is not null)
);
create index drivers_city_idx on drivers (city_zone_id) where active;

create trigger drivers_city
  before insert or update of city_zone_id on drivers
  for each row execute function ensure_zone_level('city_zone_id');

-- Una fila por conductor, se actualiza en sitio.
create table driver_presence (
  driver_id uuid primary key references drivers (id) on delete cascade,
  status driver_status not null default 'offline',
  location_mode location_mode not null default 'none',
  sector_zone_id uuid references zones (id),
  position geography(Point, 4326),
  accuracy_m real,
  last_seen_at timestamptz,
  zone_confirmed_at timestamptz,
  updated_by uuid references profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
create index driver_presence_position_idx on driver_presence using gist (position);
create index driver_presence_sector_idx on driver_presence (sector_zone_id);

create trigger driver_presence_sector
  before insert or update of sector_zone_id on driver_presence
  for each row execute function ensure_zone_level('sector_zone_id', 'sector');

-- Cada conductor nace con su fila de presencia.
create function drivers_create_presence() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into driver_presence (driver_id) values (new.id);
  return new;
end $$;

create trigger drivers_create_presence
  after insert on drivers
  for each row execute function drivers_create_presence();

-- Quién y cuándo cambió la presencia lo pone la base, no el cliente.
create function driver_presence_stamp() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := nullif(current_setting('app.user_id', true), '')::uuid;
  return new;
end $$;

create trigger driver_presence_stamp
  before update on driver_presence
  for each row execute function driver_presence_stamp();

-- Muestreado (solo modo live). La regla de 1 fila / 60 s y la retención de
-- 30 días se implementan en el Hito 4 y el Hito 6.
create table driver_location_history (
  id bigserial primary key,
  driver_id uuid not null references drivers (id) on delete cascade,
  position geography(Point, 4326) not null,
  recorded_at timestamptz not null default now()
);
create index driver_location_history_driver_idx on driver_location_history (driver_id, recorded_at desc);
create index driver_location_history_recorded_idx on driver_location_history (recorded_at);

create table push_tokens (
  driver_id uuid not null references drivers (id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('android','ios')),
  updated_at timestamptz not null default now(),
  primary key (driver_id, token)
);
