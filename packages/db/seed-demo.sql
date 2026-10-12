-- Conductores y mensajeros de demostración. SOLO LOCAL.
-- Se carga después de seed.sql en `pnpm db:reset` (no en los tests, que
-- dependen del seed mínimo). Contraseña de las cuentas: dev12345.
--
-- Con app (pueden entrar a la app del conductor):
--   camila@despacho.local     moto · domicilios y mandados · Palogrande
--   jhon@despacho.local       moto · domicilios · Chipre
--   luzmarina@despacho.local  carro · transporte · con un servicio en curso
--   andres@despacho.local     carro · transporte · ubicación en vivo
--   valentina@despacho.local  moto · Villamaría
-- Sin app (el operador los gestiona a mano): Don Fabio, Yeison, Sofía
-- (desactualizada), Kevin (ocupado), Hernán (desconectado), Paola (inactiva)
-- y Mateo en Villamaría.

-- ── Cuentas ─────────────────────────────────────────────────────────────
insert into app_users (id, email, password_hash)
select id::uuid, email, crypt('dev12345', gen_salt('bf', 8))
from (values
  ('00000000-0000-0000-0000-0000000000d3', 'camila@despacho.local'),
  ('00000000-0000-0000-0000-0000000000d4', 'jhon@despacho.local'),
  ('00000000-0000-0000-0000-0000000000d5', 'luzmarina@despacho.local'),
  ('00000000-0000-0000-0000-0000000000d6', 'andres@despacho.local'),
  ('00000000-0000-0000-0000-0000000000d7', 'valentina@despacho.local')
) as u(id, email);

-- Andrés ya aceptó el consentimiento (está en modo en vivo).
insert into profiles (id, role, full_name, phone, consent_at, consent_version) values
  ('00000000-0000-0000-0000-0000000000d3', 'driver', 'Camila Duque',      '3110000001', null, null),
  ('00000000-0000-0000-0000-0000000000d4', 'driver', 'Jhon Ocampo',       '3110000002', null, null),
  ('00000000-0000-0000-0000-0000000000d5', 'driver', 'Luz Marina Giraldo','3110000003', null, null),
  ('00000000-0000-0000-0000-0000000000d6', 'driver', 'Andrés Henao',      '3110000004', now(), '2026-10-v2'),
  ('00000000-0000-0000-0000-0000000000d7', 'driver', 'Valentina Cardona', '3110000005', null, null);

-- ── Conductores ─────────────────────────────────────────────────────────
insert into drivers (id, profile_id, city_zone_id, display_name, phone, vehicle, plate, service_types, has_app, active) values
  -- Manizales, con app
  ('20000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000d3',
   '10000000-0000-0000-0000-000000000001', 'Camila Duque', '3110000001', 'moto', 'MZL45E', '{delivery,errand}', true, true),
  ('20000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-0000000000d4',
   '10000000-0000-0000-0000-000000000001', 'Jhon Ocampo', '3110000002', 'moto', 'KTR88F', '{delivery}', true, true),
  ('20000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-0000000000d5',
   '10000000-0000-0000-0000-000000000001', 'Luz Marina Giraldo', '3110000003', 'car', 'MAN321', '{ride}', true, true),
  ('20000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-0000000000d6',
   '10000000-0000-0000-0000-000000000001', 'Andrés Henao', '3110000004', 'car', 'CLD654', '{ride,delivery}', true, true),
  -- Manizales, sin app
  ('20000000-0000-0000-0000-000000000015', null,
   '10000000-0000-0000-0000-000000000001', 'Don Fabio', '3120000001', 'moto', null, '{delivery,errand}', false, true),
  ('20000000-0000-0000-0000-000000000016', null,
   '10000000-0000-0000-0000-000000000001', 'Yeison (bici)', '3120000002', 'bicycle', null, '{delivery}', false, true),
  ('20000000-0000-0000-0000-000000000017', null,
   '10000000-0000-0000-0000-000000000001', 'Sofía Arango', '3120000003', 'moto', null, '{delivery,errand}', false, true),
  ('20000000-0000-0000-0000-000000000018', null,
   '10000000-0000-0000-0000-000000000001', 'Kevin Marín', '3120000004', 'moto', null, '{delivery}', false, true),
  ('20000000-0000-0000-0000-000000000019', null,
   '10000000-0000-0000-0000-000000000001', 'Hernán Taxi', '3120000005', 'car', 'TXI777', '{ride}', false, true),
  ('20000000-0000-0000-0000-00000000001a', null,
   '10000000-0000-0000-0000-000000000001', 'Paola (retirada)', '3120000006', 'moto', null, '{delivery}', false, false),
  -- Villamaría
  ('20000000-0000-0000-0000-00000000001b', '00000000-0000-0000-0000-0000000000d7',
   '10000000-0000-0000-0000-000000000002', 'Valentina Cardona', '3110000005', 'moto', 'VLM12G', '{delivery,errand}', true, true),
  ('20000000-0000-0000-0000-00000000001c', null,
   '10000000-0000-0000-0000-000000000002', 'Mateo (sin app)', '3120000007', 'moto', null, '{delivery,ride}', false, true);

-- ── Presencia ───────────────────────────────────────────────────────────
-- Por zona, con confirmaciones de hace unos minutos. El trigger de presencia
-- renovaría zone_confirmed_at a "ahora", así que se apaga un momento.
alter table driver_presence disable trigger driver_presence_rules;
update driver_presence p
set status = v.status::driver_status, location_mode = 'zone', zone_confirmed_at = now() - make_interval(mins => v.mins),
    sector_zone_id = (select id from zones where slug = v.sector)
from (values
  ('20000000-0000-0000-0000-000000000011', 'available', 'manizales-palogrande', 3),
  ('20000000-0000-0000-0000-000000000012', 'available', 'manizales-chipre', 10),
  ('20000000-0000-0000-0000-000000000013', 'busy', 'manizales-chipre', 5),
  ('20000000-0000-0000-0000-000000000015', 'available', 'manizales-centro', 1),
  ('20000000-0000-0000-0000-000000000016', 'available', 'manizales-milan', 15),
  ('20000000-0000-0000-0000-000000000018', 'busy', 'manizales-san-jorge', 8),
  ('20000000-0000-0000-0000-000000000019', 'offline', 'manizales-la-enea', 20)
) as v(id, status, sector, mins)
where p.driver_id = v.id::uuid;

-- Sofía: confirmó su zona hace 2 horas → sale "desactualizado".
update driver_presence
set status = 'available', location_mode = 'zone', zone_confirmed_at = now() - interval '2 hours',
    sector_zone_id = (select id from zones where slug = 'manizales-fatima')
where driver_id = '20000000-0000-0000-0000-000000000017';
alter table driver_presence enable trigger driver_presence_rules;

-- Andrés en vivo cerca de El Cable (queda desactualizado a los 2 min si nadie
-- envía pings; para movimiento continuo usa `pnpm simulate`).
update driver_presence
set status = 'available', location_mode = 'live', last_seen_at = now(), accuracy_m = 12,
    position = st_setsrid(st_makepoint(-75.4912, 5.0571), 4326)::geography
where driver_id = '20000000-0000-0000-0000-000000000014';

-- Villamaría no tiene sectores: presencia sin zona.
update driver_presence set status = 'available'
where driver_id in ('20000000-0000-0000-0000-00000000001b', '20000000-0000-0000-0000-00000000001c');

-- ── Servicios en curso ──────────────────────────────────────────────────
-- Luz Marina lleva un pasajero (ya recogido); Kevin va a recoger un domicilio
-- asignado directo (no tiene app).
insert into requests (id, city_zone_id, service, status, source_group_id, raw_text, pickup_text, pickup_sector_id,
                      dropoff_text, dropoff_sector_id, customer_name, customer_phone,
                      assigned_driver_id, assigned_at, created_by, created_at) values
  ('40000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', 'ride', 'picked_up',
   '30000000-0000-0000-0000-000000000002', 'carro del monumento a la enea, señora con maleta. 3004567890',
   'Monumento a los Colonizadores', (select id from zones where slug = 'manizales-chipre'),
   'Aeropuerto La Nubia', (select id from zones where slug = 'manizales-la-enea'),
   null, '3004567890', '20000000-0000-0000-0000-000000000013', now() - interval '12 minutes',
   '00000000-0000-0000-0000-0000000000a2', now() - interval '15 minutes'),
  ('40000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000001', 'delivery', 'assigned',
   '30000000-0000-0000-0000-000000000001', 'domi de san jorge a milan, una caja pequeña, Rosa 3012223344',
   'Panadería San Jorge', (select id from zones where slug = 'manizales-san-jorge'),
   'Milán, cerca del parque', (select id from zones where slug = 'manizales-milan'),
   'Rosa', '3012223344', '20000000-0000-0000-0000-000000000018', now() - interval '4 minutes',
   '00000000-0000-0000-0000-0000000000a2', now() - interval '7 minutes');

-- Su línea de tiempo (el seed corre como dueño y escribe los eventos a mano).
insert into request_events (request_id, type, from_status, to_status, actor_id, actor_role, payload, created_at) values
  ('40000000-0000-0000-0000-000000000011', 'created', null, 'created', '00000000-0000-0000-0000-0000000000a2', 'operator',
   '{"channel":"whatsapp_manual"}', now() - interval '15 minutes'),
  ('40000000-0000-0000-0000-000000000011', 'offered', 'created', 'offered', '00000000-0000-0000-0000-0000000000a2', 'operator',
   '{"driver_id":"20000000-0000-0000-0000-000000000013"}', now() - interval '14 minutes'),
  ('40000000-0000-0000-0000-000000000011', 'assigned', 'offered', 'assigned', '00000000-0000-0000-0000-0000000000d5', 'driver',
   '{"driver_id":"20000000-0000-0000-0000-000000000013","via":"accept"}', now() - interval '12 minutes'),
  ('40000000-0000-0000-0000-000000000011', 'status_changed', 'assigned', 'picked_up', '00000000-0000-0000-0000-0000000000d5', 'driver',
   '{}', now() - interval '6 minutes'),
  ('40000000-0000-0000-0000-000000000012', 'created', null, 'created', '00000000-0000-0000-0000-0000000000a2', 'operator',
   '{"channel":"whatsapp_manual"}', now() - interval '7 minutes'),
  ('40000000-0000-0000-0000-000000000012', 'assigned', 'created', 'assigned', '00000000-0000-0000-0000-0000000000a2', 'operator',
   '{"driver_id":"20000000-0000-0000-0000-000000000018","via":"direct"}', now() - interval '4 minutes');

-- ── Historial de 14 días (para métricas y desempeño) ────────────────────
-- Servicios cerrados con sus eventos y calificaciones. Cada conductor tiene un
-- perfil (calificación media, probabilidad de rechazar o dejar vencer ofertas,
-- segundos en aceptar, cancelaciones). Semilla fija: sale igual en cada reset.
do $$
declare
  op uuid := '00000000-0000-0000-0000-0000000000a2';
  city uuid := '10000000-0000-0000-0000-000000000001';
  sectors uuid[];
  prof record;
  d integer;
  k integer;
  n integer;
  t0 timestamptz;
  t_assign timestamptz;
  t_pick timestamptz;
  t_done timestamptz;
  rid uuid;
  svc service_type;
  st integer;
  cancelled boolean;
  tags text[];
  comments text[] := array[
    'Muy rápido y amable', 'Llegó antes de lo esperado', 'Todo perfecto, gracias',
    'Se demoró un poco pero bien', 'Excelente servicio', 'No contestaba el celular',
    'El paquete llegó un poco golpeado', 'Muy cuidadoso con el pedido', 'Súper puntual'];
begin
  perform setseed(0.42);
  select array_agg(id order by slug) into sectors from zones where parent_id = city and level = 'sector';

  for prof in
    select * from (values
      -- driver, media estrellas, p(rechazar), p(vencer), seg. en aceptar, p(cancelar), servicios/día máx, tiene app
      ('20000000-0000-0000-0000-000000000001'::uuid, 4.7, 0.05, 0.02, 12, 0.03, 4, true),   -- Ana
      ('20000000-0000-0000-0000-000000000011'::uuid, 4.9, 0.02, 0.00,  8, 0.02, 5, true),   -- Camila
      ('20000000-0000-0000-0000-000000000012'::uuid, 4.2, 0.15, 0.10, 25, 0.05, 3, true),   -- Jhon
      ('20000000-0000-0000-0000-000000000013'::uuid, 4.6, 0.05, 0.03, 15, 0.03, 3, true),   -- Luz Marina
      ('20000000-0000-0000-0000-000000000014'::uuid, 3.6, 0.25, 0.15, 38, 0.08, 3, true),   -- Andrés
      ('20000000-0000-0000-0000-000000000002'::uuid, 4.4, 0.10, 0.05, 20, 0.04, 2, true),   -- Bruno
      ('20000000-0000-0000-0000-000000000015'::uuid, 4.5, 0.00, 0.00,  0, 0.04, 3, false),  -- Don Fabio
      ('20000000-0000-0000-0000-000000000016'::uuid, 4.8, 0.00, 0.00,  0, 0.02, 2, false),  -- Yeison
      ('20000000-0000-0000-0000-000000000017'::uuid, 3.9, 0.00, 0.00,  0, 0.06, 2, false),  -- Sofía
      ('20000000-0000-0000-0000-000000000018'::uuid, 3.4, 0.00, 0.00,  0, 0.15, 3, false),  -- Kevin
      ('20000000-0000-0000-0000-000000000003'::uuid, 4.1, 0.00, 0.00,  0, 0.05, 2, false)   -- Carlos
    ) as v(driver, mean, p_reject, p_timeout, accept_secs, p_cancel, per_day, has_app)
  loop
    select service_types[1] into svc from drivers where id = prof.driver;
    for d in 1..14 loop
      n := floor(random() * (prof.per_day + 1))::int;
      for k in 1..n loop
        t0 := date_trunc('day', now()) - make_interval(days => d) + make_interval(mins => (7 * 60 + floor(random() * 14 * 60))::int);
        cancelled := random() < prof.p_cancel;
        rid := gen_random_uuid();

        insert into requests (id, city_zone_id, service, status, pickup_text, pickup_sector_id, dropoff_text, dropoff_sector_id,
                              customer_phone, created_by, created_at)
        values (rid, city, svc, 'created', 'Servicio de prueba', sectors[1 + floor(random() * array_length(sectors, 1))::int],
                'Destino de prueba', sectors[1 + floor(random() * array_length(sectors, 1))::int],
                '30' || lpad(floor(random() * 100000000)::text, 8, '0'), op, t0);
        insert into request_events (request_id, type, to_status, actor_id, actor_role, payload, created_at)
        values (rid, 'created', 'created', op, 'operator', '{"channel":"whatsapp_manual"}', t0);

        t_assign := t0 + interval '40 seconds';
        if prof.has_app then
          -- A veces rechaza o deja vencer una primera oferta.
          if random() < prof.p_reject then
            insert into request_events (request_id, type, from_status, to_status, actor_id, actor_role, payload, created_at) values
              (rid, 'offered', 'created', 'offered', op, 'operator', jsonb_build_object('driver_id', prof.driver), t_assign),
              (rid, 'rejected', 'offered', 'created', null, 'driver', jsonb_build_object('driver_id', prof.driver, 'reason', 'rejected'), t_assign + interval '9 seconds');
            t_assign := t_assign + interval '30 seconds';
          elsif random() < prof.p_timeout then
            insert into request_events (request_id, type, from_status, to_status, actor_id, actor_role, payload, created_at) values
              (rid, 'offered', 'created', 'offered', op, 'operator', jsonb_build_object('driver_id', prof.driver), t_assign),
              (rid, 'rejected', 'offered', 'created', null, null, jsonb_build_object('driver_id', prof.driver, 'reason', 'timeout'), t_assign + interval '60 seconds');
            t_assign := t_assign + interval '75 seconds';
          end if;
          insert into request_events (request_id, type, from_status, to_status, actor_id, actor_role, payload, created_at) values
            (rid, 'offered', 'created', 'offered', op, 'operator', jsonb_build_object('driver_id', prof.driver), t_assign);
          t_assign := t_assign + make_interval(secs => greatest(3, prof.accept_secs * (0.5 + random())));
          insert into request_events (request_id, type, from_status, to_status, actor_id, actor_role, payload, created_at) values
            (rid, 'assigned', 'offered', 'assigned', null, 'driver', jsonb_build_object('driver_id', prof.driver, 'via', 'accept'), t_assign);
        else
          insert into request_events (request_id, type, from_status, to_status, actor_id, actor_role, payload, created_at) values
            (rid, 'assigned', 'created', 'assigned', op, 'operator', jsonb_build_object('driver_id', prof.driver, 'via', 'direct'), t_assign);
        end if;

        if cancelled then
          insert into request_events (request_id, type, from_status, to_status, actor_id, actor_role, payload, created_at) values
            (rid, 'cancelled', 'assigned', 'cancelled', op, 'operator', '{"reason":"El cliente canceló"}', t_assign + interval '6 minutes');
          update requests set status = 'cancelled', assigned_driver_id = prof.driver, assigned_at = t_assign,
                              cancel_reason = 'El cliente canceló' where id = rid;
          continue;
        end if;

        t_pick := t_assign + make_interval(mins => (4 + floor(random() * 12))::int);
        t_done := t_pick + make_interval(mins => (7 + floor(random() * 20))::int);
        insert into request_events (request_id, type, from_status, to_status, actor_id, actor_role, payload, created_at) values
          (rid, 'status_changed', 'assigned', 'picked_up', null, case when prof.has_app then 'driver' else 'operator' end::user_role, '{}', t_pick),
          (rid, 'status_changed', 'picked_up', 'completed', null, case when prof.has_app then 'driver' else 'operator' end::user_role, '{}', t_done);
        update requests set status = 'completed', assigned_driver_id = prof.driver, assigned_at = t_assign, completed_at = t_done
        where id = rid;

        -- ~60 % de los clientes califican.
        if random() < 0.6 then
          st := greatest(1, least(5, round(prof.mean + (random() - 0.5) * 2.2)))::int;
          -- Listas de etiquetas como texto (los arreglos SQL anidados deben ser parejos).
          tags := string_to_array(case
            when st >= 5 then (array['puntual,amable', 'cuidadoso', 'puntual', 'buena_comunicacion,amable'])[1 + floor(random() * 4)::int]
            when st = 4 then (array['amable', 'puntual', ''])[1 + floor(random() * 3)::int]
            when st = 3 then (array['tardo', ''])[1 + floor(random() * 2)::int]
            else (array['tardo,no_contesto', 'producto_danado', 'mal_trato'])[1 + floor(random() * 3)::int]
          end, ',');
          tags := array_remove(tags, '');
          insert into driver_ratings (request_id, driver_id, stars, tags, comment, created_at)
          values (rid, prof.driver, st, tags,
                  case when random() < 0.35 then
                    case when st >= 4 then comments[1 + floor(random() * 5)::int] else comments[6 + floor(random() * 4)::int] end
                  end,
                  t_done + make_interval(mins => (2 + floor(random() * 40))::int));
        end if;
      end loop;
    end loop;
  end loop;
end $$;
