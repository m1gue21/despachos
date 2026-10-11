-- 008: alta de cuentas (invitar conductor, crear operador) y consentimiento.
-- Son las únicas vías para vincular profile_id/has_app y asignar roles.

-- Crea la cuenta de un conductor existente y lo marca con app. Admin u
-- operador de la ciudad del conductor.
create function invite_driver(p_driver uuid, p_email text, p_password text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  d drivers;
  uid uuid;
begin
  select * into d from drivers where id = p_driver;
  if not found then perform raise_app_error('not_found', 'El conductor no existe'); end if;
  if not can_manage_city(d.city_zone_id) then
    perform raise_app_error('forbidden', 'No tienes acceso a la ciudad de este conductor');
  end if;
  if d.profile_id is not null then
    perform raise_app_error('bad_payload', 'El conductor ya tiene cuenta');
  end if;
  if length(coalesce(p_password, '')) < 8 then
    perform raise_app_error('bad_payload', 'La contraseña debe tener al menos 8 caracteres');
  end if;
  if exists (select 1 from app_users where lower(email) = lower(trim(p_email))) then
    perform raise_app_error('bad_payload', 'Ya existe una cuenta con ese correo');
  end if;

  insert into app_users (email, password_hash) values (trim(p_email), crypt(p_password, gen_salt('bf', 10)))
    returning id into uid;
  insert into profiles (id, role, full_name, phone) values (uid, 'driver', d.display_name, d.phone);
  update drivers set profile_id = uid, has_app = true where id = d.id;
  return uid;
end $$;

-- Crea un operador o admin. Solo admin.
create function create_staff_user(
  p_email text, p_password text, p_full_name text, p_role user_role, p_city_ids uuid[]
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
begin
  if not is_admin() then perform raise_app_error('forbidden', 'Solo el admin crea usuarios'); end if;
  if p_role not in ('admin','operator') then
    perform raise_app_error('bad_payload', 'Rol inválido para personal');
  end if;
  if length(coalesce(p_password, '')) < 8 then
    perform raise_app_error('bad_payload', 'La contraseña debe tener al menos 8 caracteres');
  end if;
  if exists (select 1 from app_users where lower(email) = lower(trim(p_email))) then
    perform raise_app_error('bad_payload', 'Ya existe una cuenta con ese correo');
  end if;
  insert into app_users (email, password_hash) values (trim(p_email), crypt(p_password, gen_salt('bf', 10)))
    returning id into uid;
  insert into profiles (id, role, full_name) values (uid, p_role, p_full_name);
  if p_role = 'operator' then
    insert into operator_zones (operator_id, zone_id) select uid, unnest(coalesce(p_city_ids, '{}'));
  end if;
  return uid;
end $$;

-- Ciudades a las que el usuario actual tiene acceso.
create function my_cities() returns setof zones
language sql stable security definer set search_path = public as $$
  select z.* from zones z
  where z.level = 'city' and z.active and (
    is_admin()
    or exists (select 1 from operator_zones oz where oz.operator_id = auth_uid() and oz.zone_id = z.id and auth_role() = 'operator')
    or z.id = (select city_zone_id from drivers where id = my_driver_id())
  )
  order by z.name
$$;

-- Lista de personal para el admin (sin hashes).
create function list_staff() returns table (
  id uuid, email text, full_name text, role user_role, active boolean, city_ids uuid[]
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then perform raise_app_error('forbidden', 'Solo el admin'); end if;
  return query
  select p.id, u.email, p.full_name, p.role, p.active,
         coalesce(array_agg(oz.zone_id) filter (where oz.zone_id is not null), '{}')
  from profiles p
  join app_users u on u.id = p.id
  left join operator_zones oz on oz.operator_id = p.id
  where p.role in ('admin','operator')
  group by p.id, u.email
  order by p.role, p.full_name;
end $$;

revoke execute on function invite_driver(uuid, text, text) from public;
revoke execute on function create_staff_user(text, text, text, user_role, uuid[]) from public;
revoke execute on function list_staff() from public;
grant execute on function invite_driver(uuid, text, text) to app_user;
grant execute on function create_staff_user(text, text, text, user_role, uuid[]) to app_user;
grant execute on function list_staff() to app_user;
