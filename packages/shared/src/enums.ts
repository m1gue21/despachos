// Espejo de los enums de Postgres (packages/db/migrations/001). Fuente única
// para panel, app y API. enums.test.ts verifica que coincidan con la base.
export const USER_ROLES = ['admin', 'operator', 'driver', 'customer'] as const;
export const ZONE_LEVELS = ['city', 'sector'] as const;
export const VEHICLE_TYPES = ['moto', 'car', 'bicycle', 'other'] as const;
export const SERVICE_TYPES = ['delivery', 'ride', 'errand'] as const;
export const DRIVER_STATUSES = ['offline', 'available', 'busy'] as const;
export const LOCATION_MODES = ['none', 'zone', 'live'] as const;
export const REQUEST_CHANNELS = ['whatsapp_manual', 'customer_app', 'whatsapp_bot', 'api'] as const;
export const REQUEST_STATUSES = ['created', 'offered', 'assigned', 'picked_up', 'completed', 'cancelled'] as const;
export const WHATSAPP_GROUP_KINDS = ['delivery', 'ride', 'mixed'] as const;
export const REQUEST_EVENT_TYPES = [
  'created',
  'offered',
  'assigned',
  'rejected',
  'reassigned',
  'status_changed',
  'cancelled',
  'note',
] as const;

export type UserRole = (typeof USER_ROLES)[number];
export type ZoneLevel = (typeof ZONE_LEVELS)[number];
export type VehicleType = (typeof VEHICLE_TYPES)[number];
export type ServiceType = (typeof SERVICE_TYPES)[number];
export type DriverStatus = (typeof DRIVER_STATUSES)[number];
export type LocationMode = (typeof LOCATION_MODES)[number];
export type RequestChannel = (typeof REQUEST_CHANNELS)[number];
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export type WhatsappGroupKind = (typeof WHATSAPP_GROUP_KINDS)[number];
export type RequestEventType = (typeof REQUEST_EVENT_TYPES)[number];

export const TERMINAL_REQUEST_STATUSES: readonly RequestStatus[] = ['completed', 'cancelled'];

export const SETTING_KEYS = [
  'ZONE_STALE_MINUTES',
  'LIVE_STALE_SECONDS',
  'LIVE_PING_SECONDS',
  'OFFER_TIMEOUT_SECONDS',
  'LOCATION_RETENTION_DAYS',
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

export const SETTING_DEFAULTS: Record<SettingKey, number> = {
  ZONE_STALE_MINUTES: 45,
  LIVE_STALE_SECONDS: 120,
  LIVE_PING_SECONDS: 10,
  OFFER_TIMEOUT_SECONDS: 60,
  LOCATION_RETENTION_DAYS: 30,
};
