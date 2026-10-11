-- 002: usuarios, perfiles y zonas (ciudades y sectores).

-- Reemplaza a auth.users de Supabase. El hash se calcula con pgcrypto
-- (bcrypt) y nunca sale de la base: el login va por auth_login() (005).
create table app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);
create unique index app_users_email_key on app_users (lower(email));

create table profiles (
  id uuid primary key references app_users (id) on delete cascade,
  role user_role not null,
  full_name text not null,
  phone text,
  active boolean not null default true,
  -- Consentimiento de ubicación en vivo (Ley 1581 de 2012).
  consent_at timestamptz,
  consent_version text,
  created_at timestamptz not null default now(),
  constraint profiles_consent_pair check ((consent_at is null) = (consent_version is null))
);

create table zones (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references zones (id) on delete restrict,
  level zone_level not null,
  name text not null,
  slug text not null unique,
  -- Alias que usa la gente ("el cable", "la santander"); los usa el parser.
  aliases text[] not null default '{}',
  geom geography(Polygon, 4326),
  center geography(Point, 4326),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint zones_level_parent check (
    (level = 'city' and parent_id is null) or (level = 'sector' and parent_id is not null)
  )
);
create index zones_parent_idx on zones (parent_id);
create index zones_geom_idx on zones using gist (geom);

-- Valida que la columna indicada (TG_ARGV[0]) apunte a una zona de nivel
-- city y, con TG_ARGV[1] = 'sector', que apunte a un sector. Se reutiliza en
-- todas las tablas que cuelgan de una ciudad.
create function ensure_zone_level() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  zid uuid := (to_jsonb(new) ->> tg_argv[0])::uuid;
  expected zone_level := coalesce(tg_argv[1], 'city')::zone_level;
begin
  if zid is not null and not exists (select 1 from zones where id = zid and level = expected) then
    raise exception '%.% debe apuntar a una zona de nivel %', tg_table_name, tg_argv[0], expected
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- El padre de un sector tiene que ser una ciudad.
create trigger zones_parent_is_city
  before insert or update of parent_id on zones
  for each row execute function ensure_zone_level('parent_id', 'city');

create table operator_zones (
  operator_id uuid not null references profiles (id) on delete cascade,
  zone_id uuid not null references zones (id) on delete cascade,
  primary key (operator_id, zone_id)
);

create trigger operator_zones_city
  before insert or update on operator_zones
  for each row execute function ensure_zone_level('zone_id');
