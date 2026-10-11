-- 001: extensiones, enums y rol de aplicación.

create extension if not exists postgis;
create extension if not exists pgcrypto;

create type user_role as enum ('admin','operator','driver','customer');
create type zone_level as enum ('city','sector');
create type vehicle_type as enum ('moto','car','bicycle','other');
create type service_type as enum ('delivery','ride','errand');
create type driver_status as enum ('offline','available','busy');
create type location_mode as enum ('none','zone','live');
create type request_channel as enum ('whatsapp_manual','customer_app','whatsapp_bot','api');
create type request_status as enum (
  'created','offered','assigned','picked_up','completed','cancelled'
);
create type whatsapp_group_kind as enum ('delivery','ride','mixed');

-- app_user: el rol con el que el API atiende a usuarios. No es dueño de las
-- tablas y no tiene BYPASSRLS, así que la RLS siempre le aplica. La identidad
-- del usuario llega por transacción en el ajuste app.user_id (ver 005).
-- Los roles son del clúster: sobreviven a un reset del esquema.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user login password 'app_user_dev' nobypassrls;
  end if;
end $$;

grant usage on schema public to app_user;
