-- Datos base para un entorno real: zonas, grupo de WhatsApp y ajustes. SIN usuarios.

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

-- ── Grupos de WhatsApp ──────────────────────────────────────────────────
insert into whatsapp_groups (id, city_zone_id, name, kind) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Domicilios Manizales', 'delivery');

-- ── Ajustes globales ────────────────────────────────────────────────────
insert into app_settings (key, value) values
  ('ZONE_STALE_MINUTES', '45'),
  ('LIVE_STALE_SECONDS', '120'),
  ('LIVE_PING_SECONDS', '10'),
  ('OFFER_TIMEOUT_SECONDS', '60'),
  ('LOCATION_RETENTION_DAYS', '30');

