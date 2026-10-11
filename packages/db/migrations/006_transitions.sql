-- 006: creación de solicitudes y máquina de estados.
--
-- transition_request() es la ÚNICA vía para cambiar status, asignación u
-- oferta de una solicitud. Valida, actualiza requests e inserta en
-- request_events en la misma transacción.
--
--   created ──offer──▶ offered ──accept──▶ assigned ──pick_up──▶ picked_up ──complete──▶ completed
--      │                  │ reject/timeout ▲    │ reassign (vuelve a assigned con otro conductor)
--      │                  └────────────────┘ (vuelve a created)
--      ├──assign (directo, operador)──▶ assigned
--      └──cancel (desde cualquier estado no terminal) ──▶ cancelled
--   note: agrega un evento sin cambiar el estado.
--
-- Los errores usan SQLSTATE P0001 y un código estable en HINT
-- (invalid_transition, forbidden, not_found, bad_payload, driver_unavailable)
-- que el API traduce a HTTP.

create function raise_app_error(p_code text, p_message text) returns void
language plpgsql as $$
begin
  raise exception using errcode = 'P0001', message = p_message, hint = p_code;
end $$;

-- ¿El conductor está activo y es de esa ciudad?
create function driver_in_city(p_driver uuid, p_city uuid, p_needs_app boolean default false)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from drivers
    where id = p_driver and active and city_zone_id = p_city and (not p_needs_app or has_app)
  )
$$;

-- Al tomar un servicio el conductor pasa a ocupado; al cerrarse el último
-- servicio activo, vuelve a disponible (si seguía ocupado).
create function sync_driver_busy(p_driver uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_driver is null then return; end if;
  if exists (select 1 from requests
             where assigned_driver_id = p_driver and status in ('assigned','picked_up')) then
    update driver_presence set status = 'busy' where driver_id = p_driver and status <> 'busy';
  else
    update driver_presence set status = 'available' where driver_id = p_driver and status = 'busy';
  end if;
end $$;

-- Núcleo sin chequeo de permisos. Lo usan transition_request() (que sí
-- chequea) y expire_offers() (proceso del sistema, actor null).
create function apply_transition(
  p_request uuid, p_action text, p_payload jsonb, p_actor uuid, p_actor_role user_role
) returns requests
language plpgsql security definer set search_path = public as $$
declare
  r requests;
  prev request_status;
  new_driver uuid;
  old_driver uuid;
  ev_type text;
begin
  select * into r from requests where id = p_request for update;
  if not found then
    perform raise_app_error('not_found', 'La solicitud no existe');
  end if;
  prev := r.status;
  old_driver := r.assigned_driver_id;
  p_payload := coalesce(p_payload, '{}');

  if p_action <> 'note' and prev in ('completed','cancelled') then
    perform raise_app_error('invalid_transition',
      format('La solicitud ya está %s', case prev when 'completed' then 'completada' else 'cancelada' end));
  end if;

  case p_action
  when 'offer' then
    if prev <> 'created' then
      perform raise_app_error('invalid_transition', format('No se puede ofrecer desde %s', prev));
    end if;
    new_driver := (p_payload ->> 'driver_id')::uuid;
    if new_driver is null then perform raise_app_error('bad_payload', 'Falta driver_id'); end if;
    if not driver_in_city(new_driver, r.city_zone_id, true) then
      perform raise_app_error('driver_unavailable',
        'El conductor no está activo, no es de esta ciudad o no tiene la app');
    end if;
    update requests set status = 'offered', offered_driver_id = new_driver, offered_at = now()
      where id = r.id returning * into r;
    ev_type := 'offered';

  when 'accept' then
    if prev <> 'offered' then
      perform raise_app_error('invalid_transition', format('No se puede aceptar desde %s', prev));
    end if;
    new_driver := r.offered_driver_id;
    update requests set status = 'assigned', assigned_driver_id = new_driver, assigned_at = now(),
                        offered_driver_id = null, offered_at = null
      where id = r.id returning * into r;
    ev_type := 'assigned';
    p_payload := p_payload || jsonb_build_object('driver_id', new_driver, 'via', 'accept');

  when 'reject' then
    if prev <> 'offered' then
      perform raise_app_error('invalid_transition', format('No se puede rechazar desde %s', prev));
    end if;
    p_payload := p_payload || jsonb_build_object(
      'driver_id', r.offered_driver_id,
      'reason', coalesce(p_payload ->> 'reason', 'rejected'));
    update requests set status = 'created', offered_driver_id = null, offered_at = null
      where id = r.id returning * into r;
    ev_type := 'rejected';

  when 'assign' then
    if prev not in ('created','offered') then
      perform raise_app_error('invalid_transition', format('No se puede asignar desde %s', prev));
    end if;
    new_driver := (p_payload ->> 'driver_id')::uuid;
    if new_driver is null then perform raise_app_error('bad_payload', 'Falta driver_id'); end if;
    if not driver_in_city(new_driver, r.city_zone_id) then
      perform raise_app_error('driver_unavailable', 'El conductor no está activo o no es de esta ciudad');
    end if;
    update requests set status = 'assigned', assigned_driver_id = new_driver, assigned_at = now(),
                        offered_driver_id = null, offered_at = null
      where id = r.id returning * into r;
    ev_type := 'assigned';
    p_payload := p_payload || jsonb_build_object('via', 'direct');

  when 'reassign' then
    if prev <> 'assigned' then
      perform raise_app_error('invalid_transition', format('Solo se reasigna una solicitud asignada, no %s', prev));
    end if;
    new_driver := (p_payload ->> 'driver_id')::uuid;
    if new_driver is null then perform raise_app_error('bad_payload', 'Falta driver_id'); end if;
    if new_driver = old_driver then
      perform raise_app_error('bad_payload', 'Ya está asignada a ese conductor');
    end if;
    if not driver_in_city(new_driver, r.city_zone_id) then
      perform raise_app_error('driver_unavailable', 'El conductor no está activo o no es de esta ciudad');
    end if;
    update requests set assigned_driver_id = new_driver, assigned_at = now()
      where id = r.id returning * into r;
    ev_type := 'reassigned';
    p_payload := p_payload || jsonb_build_object('from_driver_id', old_driver, 'driver_id', new_driver);

  when 'pick_up' then
    if prev <> 'assigned' then
      perform raise_app_error('invalid_transition', format('No se puede marcar recogido desde %s', prev));
    end if;
    update requests set status = 'picked_up' where id = r.id returning * into r;
    ev_type := 'status_changed';

  when 'complete' then
    if prev <> 'picked_up' then
      perform raise_app_error('invalid_transition', format('No se puede completar desde %s', prev));
    end if;
    update requests set status = 'completed', completed_at = now() where id = r.id returning * into r;
    ev_type := 'status_changed';

  when 'cancel' then
    if nullif(trim(p_payload ->> 'reason'), '') is null then
      perform raise_app_error('bad_payload', 'Falta el motivo de cancelación');
    end if;
    update requests set status = 'cancelled', cancel_reason = trim(p_payload ->> 'reason'),
                        offered_driver_id = null, offered_at = null
      where id = r.id returning * into r;
    ev_type := 'cancelled';

  when 'note' then
    if nullif(trim(p_payload ->> 'text'), '') is null then
      perform raise_app_error('bad_payload', 'La nota está vacía');
    end if;
    ev_type := 'note';

  else
    perform raise_app_error('bad_payload', format('Acción desconocida: %s', p_action));
  end case;

  insert into request_events (request_id, type, from_status, to_status, actor_id, actor_role, payload)
  values (r.id, ev_type, prev, r.status, p_actor, p_actor_role, p_payload);

  perform sync_driver_busy(old_driver);
  if r.assigned_driver_id is distinct from old_driver then
    perform sync_driver_busy(r.assigned_driver_id);
  end if;

  return r;
end $$;

-- Entrada pública: chequea quién puede hacer qué y delega en apply_transition.
create function transition_request(p_request uuid, p_action text, p_payload jsonb default '{}')
returns requests
language plpgsql security definer set search_path = public as $$
declare
  r requests;
  role user_role := auth_role();
  me_driver uuid := my_driver_id();
  is_manager boolean;
begin
  if auth_uid() is null or role is null then
    perform raise_app_error('forbidden', 'Sesión requerida');
  end if;
  select * into r from requests where id = p_request;
  if not found then
    perform raise_app_error('not_found', 'La solicitud no existe');
  end if;
  is_manager := can_manage_city(r.city_zone_id);

  if p_action in ('accept','reject') then
    -- Responde el conductor ofertado; el operador también puede retirar la oferta.
    if not ((me_driver is not null and r.offered_driver_id = me_driver)
            or (p_action = 'reject' and is_manager)) then
      perform raise_app_error('forbidden', 'Esta oferta no es tuya');
    end if;
  elsif p_action in ('pick_up','complete','note') then
    if not (is_manager or (me_driver is not null and r.assigned_driver_id = me_driver)) then
      perform raise_app_error('forbidden', 'Este servicio no es tuyo');
    end if;
  elsif not is_manager then
    perform raise_app_error('forbidden', 'Solo un operador de la ciudad puede hacer esto');
  end if;

  return apply_transition(p_request, p_action, p_payload, auth_uid(), role);
end $$;

-- Crea una solicitud con su evento 'created'. Valida con las mismas reglas
-- que la RLS (operador de la ciudad o admin).
create function create_request(p jsonb) returns requests
language plpgsql security definer set search_path = public as $$
declare
  r requests;
  city uuid := (p ->> 'city_zone_id')::uuid;
begin
  if not can_manage_city(city) then
    perform raise_app_error('forbidden', 'No tienes acceso a esta ciudad');
  end if;
  if nullif(trim(p ->> 'pickup_text'), '') is null then
    perform raise_app_error('bad_payload', 'Falta la recogida');
  end if;
  if p ->> 'source_group_id' is not null and not exists (
    select 1 from whatsapp_groups where id = (p ->> 'source_group_id')::uuid and city_zone_id = city
  ) then
    perform raise_app_error('bad_payload', 'El grupo no es de esta ciudad');
  end if;

  insert into requests (
    city_zone_id, channel, service, source_group_id, raw_text,
    pickup_text, pickup_sector_id, pickup_position,
    dropoff_text, dropoff_sector_id, dropoff_position,
    customer_name, customer_phone, notes, created_by
  ) values (
    city,
    coalesce(p ->> 'channel', 'whatsapp_manual')::request_channel,
    (p ->> 'service')::service_type,
    (p ->> 'source_group_id')::uuid,
    p ->> 'raw_text',
    trim(p ->> 'pickup_text'),
    (p ->> 'pickup_sector_id')::uuid,
    case when p ? 'pickup_position' and p -> 'pickup_position' <> 'null'
      then st_setsrid(st_makepoint((p #>> '{pickup_position,lng}')::float8, (p #>> '{pickup_position,lat}')::float8), 4326)::geography end,
    p ->> 'dropoff_text',
    (p ->> 'dropoff_sector_id')::uuid,
    case when p ? 'dropoff_position' and p -> 'dropoff_position' <> 'null'
      then st_setsrid(st_makepoint((p #>> '{dropoff_position,lng}')::float8, (p #>> '{dropoff_position,lat}')::float8), 4326)::geography end,
    p ->> 'customer_name',
    p ->> 'customer_phone',
    p ->> 'notes',
    auth_uid()
  ) returning * into r;

  insert into request_events (request_id, type, to_status, actor_id, actor_role, payload)
  values (r.id, 'created', 'created', auth_uid(), auth_role(), jsonb_build_object('channel', r.channel));

  return r;
end $$;

-- Ofertas vencidas vuelven a 'created'. La llama el API cada pocos segundos
-- con la conexión de dueño. Devuelve cuántas venció.
create function expire_offers() returns integer
language plpgsql security definer set search_path = public as $$
declare
  rid uuid;
  n integer := 0;
begin
  for rid in
    select id from requests
    where status = 'offered'
      and offered_at + make_interval(secs => setting_int('OFFER_TIMEOUT_SECONDS', city_zone_id)) < now()
    for update skip locked
  loop
    perform apply_transition(rid, 'reject', '{"reason":"timeout"}', null, null);
    n := n + 1;
  end loop;
  return n;
end $$;

revoke execute on function apply_transition(uuid, text, jsonb, uuid, user_role) from public;
revoke execute on function expire_offers() from public;
revoke execute on function sync_driver_busy(uuid) from public;
