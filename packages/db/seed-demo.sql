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
  ('00000000-0000-0000-0000-0000000000d6', 'driver', 'Andrés Henao',      '3110000004', now(), '2026-10-v1'),
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
-- Por zona, confirmados hace poco.
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
-- (Se apaga el trigger un momento porque renueva zone_confirmed_at.)
alter table driver_presence disable trigger driver_presence_rules;
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
