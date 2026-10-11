// Fragmentos SQL compartidos por las rutas.

export const REQUEST_SELECT = `
  select r.id, r.city_zone_id, r.channel, r.service, r.status,
         r.source_group_id, g.name as source_group_name, r.raw_text,
         r.pickup_text, r.pickup_sector_id, ps.name as pickup_sector_name,
         st_y(r.pickup_position::geometry) as pickup_lat, st_x(r.pickup_position::geometry) as pickup_lng,
         st_y(ps.center::geometry) as pickup_sector_lat, st_x(ps.center::geometry) as pickup_sector_lng,
         r.dropoff_text, r.dropoff_sector_id, ds.name as dropoff_sector_name,
         st_y(r.dropoff_position::geometry) as dropoff_lat, st_x(r.dropoff_position::geometry) as dropoff_lng,
         r.customer_name, r.customer_phone, r.notes,
         r.offered_driver_id, od.display_name as offered_driver_name, r.offered_at,
         r.assigned_driver_id, ad.display_name as assigned_driver_name, ad.phone as assigned_driver_phone,
         r.created_by, r.created_at, r.assigned_at, r.completed_at, r.cancel_reason
  from requests r
  left join whatsapp_groups g on g.id = r.source_group_id
  left join zones ps on ps.id = r.pickup_sector_id
  left join zones ds on ds.id = r.dropoff_sector_id
  left join drivers od on od.id = r.offered_driver_id
  left join drivers ad on ad.id = r.assigned_driver_id`;

export const ZONE_SELECT = `
  select z.id, z.parent_id, z.level, z.name, z.slug, z.aliases, z.active,
         st_y(z.center::geometry) as center_lat, st_x(z.center::geometry) as center_lng,
         case when z.geom is not null then st_asgeojson(z.geom)::jsonb end as geom
  from zones z`;

export function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
