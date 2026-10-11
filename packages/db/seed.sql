-- Datos iniciales. SOLO LOCAL: las contraseñas de abajo son de desarrollo.
-- En producción el primer admin se crea con `pnpm --filter @despacho/db create-admin`.
--
-- Usuarios de prueba (contraseña de todos: dev12345):
--   admin@despacho.local          admin
--   op.manizales@despacho.local   operador de Manizales
--   op.villamaria@despacho.local  operador de Villamaría
--   ana@despacho.local            conductora con app (Manizales)
--   bruno@despacho.local          conductor con app (Manizales)
--
-- Los centros de los sectores son aproximados y sin polígono: se ajustan y
-- se dibujan desde el panel (Hito 2).

-- ── Zonas ───────────────────────────────────────────────────────────────
insert into zones (id, level, name, slug, center) values
  ('10000000-0000-0000-0000-000000000001', 'city', 'Manizales', 'manizales',
   st_setsrid(st_makepoint(-75.5138, 5.0703), 4326)::geography),
  ('10000000-0000-0000-0000-000000000002', 'city', 'Villamaría', 'villamaria',
   st_setsrid(st_makepoint(-75.5150, 5.0457), 4326)::geography);

insert into zones (parent_id, level, name, slug, aliases, center)
select '10000000-0000-0000-0000-000000000001', 'sector', s.name, s.slug, s.aliases,
       st_setsrid(st_makepoint(s.lon, s.lat), 4326)::geography
from (values
  ('Centro',        'manizales-centro',        array['el centro','cra 23','carrera 23'], -75.5174, 5.0689),
  ('Chipre',        'manizales-chipre',        array['chipre','el monumento'],           -75.5260, 5.0700),
  ('Cable',         'manizales-cable',         array['el cable','la torre del cable'],   -75.4905, 5.0565),
  ('Palogrande',    'manizales-palogrande',    array['palogrande','el estadio'],         -75.4945, 5.0555),
  ('Av. Santander', 'manizales-av-santander',  array['la santander','avenida santander'],-75.4975, 5.0600),
  ('Fátima',        'manizales-fatima',        array['fatima'],                          -75.4860, 5.0590),
  ('Milán',         'manizales-milan',         array['milan','el bosque de milan'],      -75.4800, 5.0480),
  ('La Sultana',    'manizales-la-sultana',    array['sultana'],                         -75.4750, 5.0436),
  ('La Enea',       'manizales-la-enea',       array['enea','el aeropuerto'],            -75.4630, 5.0300),
  ('San Jorge',     'manizales-san-jorge',     array['san jorge'],                       -75.4990, 5.0450)
) as s(name, slug, aliases, lon, lat);
-- Villamaría queda sin sectores a propósito: es el ejemplo de cómo se abre
-- una ciudad nueva solo con datos.

-- ── Usuarios ────────────────────────────────────────────────────────────
insert into app_users (id, email, password_hash)
select id::uuid, email, crypt('dev12345', gen_salt('bf', 8))
from (values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@despacho.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'op.manizales@despacho.local'),
  ('00000000-0000-0000-0000-0000000000a3', 'op.villamaria@despacho.local'),
  ('00000000-0000-0000-0000-0000000000d1', 'ana@despacho.local'),
  ('00000000-0000-0000-0000-0000000000d2', 'bruno@despacho.local')
) as u(id, email);

insert into profiles (id, role, full_name, phone) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin',    'Admin Despacho',      null),
  ('00000000-0000-0000-0000-0000000000a2', 'operator', 'Operadora Manizales', '3000000001'),
  ('00000000-0000-0000-0000-0000000000a3', 'operator', 'Operador Villamaría', '3000000002'),
  ('00000000-0000-0000-0000-0000000000d1', 'driver',   'Ana Ríos',            '3100000001'),
  ('00000000-0000-0000-0000-0000000000d2', 'driver',   'Bruno Gómez',         '3100000002');

insert into operator_zones (operator_id, zone_id) values
  ('00000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-000000000002');

-- ── Conductores ─────────────────────────────────────────────────────────
insert into drivers (id, profile_id, city_zone_id, display_name, phone, vehicle, plate, service_types, has_app) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1',
   '10000000-0000-0000-0000-000000000001', 'Ana Ríos', '3100000001', 'moto', 'ABC12D',
   '{delivery,errand}', true),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000d2',
   '10000000-0000-0000-0000-000000000001', 'Bruno Gómez', '3100000002', 'car', 'XYZ123',
   '{ride}', true),
  ('20000000-0000-0000-0000-000000000003', null,
   '10000000-0000-0000-0000-000000000001', 'Carlos (sin app)', '3100000003', 'moto', null,
   '{delivery}', false),
  ('20000000-0000-0000-0000-000000000004', null,
   '10000000-0000-0000-0000-000000000002', 'Diana (sin app)', '3100000004', 'bicycle', null,
   '{delivery,errand}', false);

-- Presencia inicial en modo zona (la fila ya la creó el trigger).
update driver_presence p
set status = 'available', location_mode = 'zone', zone_confirmed_at = now(),
    sector_zone_id = (select id from zones where slug = 'manizales-centro')
where p.driver_id in ('20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003');

-- ── Grupos de WhatsApp ──────────────────────────────────────────────────
insert into whatsapp_groups (id, city_zone_id, name, kind) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Domicilios Manizales', 'delivery'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Transporte Manizales', 'ride'),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'Domicilios Villamaría', 'mixed');

-- ── Ajustes globales ────────────────────────────────────────────────────
insert into app_settings (key, value) values
  ('ZONE_STALE_MINUTES', '45'),
  ('LIVE_STALE_SECONDS', '120'),
  ('LIVE_PING_SECONDS', '10'),
  ('OFFER_TIMEOUT_SECONDS', '60'),
  ('LOCATION_RETENTION_DAYS', '30');

-- ── Solicitudes de ejemplo (todas en 'created') ─────────────────────────
insert into requests (id, city_zone_id, service, source_group_id, raw_text, pickup_text, pickup_sector_id,
                      dropoff_text, dropoff_sector_id, customer_name, customer_phone, created_by) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'delivery',
   '30000000-0000-0000-0000-000000000001',
   'domi del cable a chipre, recoger pedido en la drogueria, cel 3201234567',
   'Droguería, El Cable', (select id from zones where slug = 'manizales-cable'),
   'Chipre', (select id from zones where slug = 'manizales-chipre'),
   null, '3201234567', '00000000-0000-0000-0000-0000000000a2'),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'ride',
   '30000000-0000-0000-0000-000000000002',
   'carro para la enea ya, sale de palogrande. Marta 3159876543',
   'Palogrande', (select id from zones where slug = 'manizales-palogrande'),
   'La Enea', (select id from zones where slug = 'manizales-la-enea'),
   'Marta', '3159876543', '00000000-0000-0000-0000-0000000000a2'),
  ('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'errand',
   '30000000-0000-0000-0000-000000000003',
   'mandado: pagar recibo en el parque principal',
   'Parque principal de Villamaría', null, null, null,
   null, null, '00000000-0000-0000-0000-0000000000a3');

-- Toda solicitud nace con su evento 'created'. El seed lo escribe a mano
-- porque corre como dueño; en la app lo hace la función de creación (Hito 1).
insert into request_events (request_id, type, to_status, actor_id, actor_role)
select r.id, 'created', 'created', r.created_by, 'operator'
from requests r;
