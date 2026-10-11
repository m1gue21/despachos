import { z } from 'zod';
import {
  DRIVER_STATUSES,
  LOCATION_MODES,
  REQUEST_CHANNELS,
  REQUEST_STATUSES,
  SERVICE_TYPES,
  USER_ROLES,
  VEHICLE_TYPES,
} from './enums.js';

export const userRoleSchema = z.enum(USER_ROLES);
export const serviceTypeSchema = z.enum(SERVICE_TYPES);
export const vehicleTypeSchema = z.enum(VEHICLE_TYPES);
export const driverStatusSchema = z.enum(DRIVER_STATUSES);
export const locationModeSchema = z.enum(LOCATION_MODES);
export const requestChannelSchema = z.enum(REQUEST_CHANNELS);
export const requestStatusSchema = z.enum(REQUEST_STATUSES);

// Texto opcional: vacío o solo espacios cuenta como null.
const optionalText = z
  .preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), z.string().trim().nullish())
  .transform((v) => v ?? null);
// Celulares colombianos: 10 dígitos empezando por 3. Se aceptan espacios,
// guiones y el prefijo +57, y se normaliza a solo los 10 dígitos.
export const colombianPhoneSchema = z
  .string()
  .transform((v) => v.replace(/[\s-]/g, '').replace(/^\+?57/, ''))
  .pipe(z.string().regex(/^3\d{9}$/, 'Celular inválido'));

export const latLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

// Lo que el panel envía para crear una solicitud.
export const newRequestSchema = z.object({
  city_zone_id: z.string().uuid(),
  channel: requestChannelSchema.default('whatsapp_manual'),
  service: serviceTypeSchema,
  source_group_id: z.string().uuid().nullish(),
  raw_text: optionalText,
  pickup_text: z.string().trim().min(1, 'Falta la recogida'),
  pickup_sector_id: z.string().uuid().nullish(),
  pickup_position: latLngSchema.nullish(),
  dropoff_text: optionalText,
  dropoff_sector_id: z.string().uuid().nullish(),
  dropoff_position: latLngSchema.nullish(),
  customer_name: optionalText,
  customer_phone: colombianPhoneSchema.nullish(),
  notes: optionalText,
});
export type NewRequest = z.infer<typeof newRequestSchema>;

export const driverInputSchema = z.object({
  city_zone_id: z.string().uuid(),
  display_name: z.string().trim().min(1),
  phone: colombianPhoneSchema,
  vehicle: vehicleTypeSchema,
  plate: optionalText,
  service_types: z.array(serviceTypeSchema).min(1),
  active: z.boolean().default(true),
});
export type DriverInput = z.infer<typeof driverInputSchema>;

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});
