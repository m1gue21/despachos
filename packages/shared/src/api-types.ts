// Formas de las respuestas del API, compartidas por panel y app.
import type {
  DriverStatus,
  LocationMode,
  RequestChannel,
  RequestEventType,
  RequestStatus,
  ServiceType,
  UserRole,
  VehicleType,
  WhatsappGroupKind,
  ZoneLevel,
} from './enums.js';

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string;
  phone: string | null;
  consent_at: string | null;
  consent_version: string | null;
}

export interface Zone {
  id: string;
  parent_id: string | null;
  level: ZoneLevel;
  name: string;
  slug: string;
  aliases: string[];
  active: boolean;
  center_lat: number | null;
  center_lng: number | null;
  geom: { type: 'Polygon'; coordinates: [number, number][][] } | null;
}

export interface DriverRow {
  id: string;
  city_zone_id: string;
  display_name: string;
  phone: string;
  vehicle: VehicleType;
  plate: string | null;
  service_types: ServiceType[];
  has_app: boolean;
  active: boolean;
  profile_id: string | null;
  status: DriverStatus;
  location_mode: LocationMode;
  sector_zone_id: string | null;
  sector_name: string | null;
  lat: number | null;
  lng: number | null;
  sector_lat: number | null;
  sector_lng: number | null;
  accuracy_m: number | null;
  last_seen_at: string | null;
  zone_confirmed_at: string | null;
  updated_by: string | null;
  updated_at: string;
  is_stale: boolean;
  active_requests?: number;
}

export interface RequestRow {
  id: string;
  city_zone_id: string;
  channel: RequestChannel;
  service: ServiceType;
  status: RequestStatus;
  source_group_id: string | null;
  source_group_name: string | null;
  raw_text: string | null;
  pickup_text: string;
  pickup_sector_id: string | null;
  pickup_sector_name: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  pickup_sector_lat: number | null;
  pickup_sector_lng: number | null;
  dropoff_text: string | null;
  dropoff_sector_id: string | null;
  dropoff_sector_name: string | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  notes: string | null;
  offered_driver_id: string | null;
  offered_driver_name: string | null;
  offered_at: string | null;
  assigned_driver_id: string | null;
  assigned_driver_name: string | null;
  assigned_driver_phone: string | null;
  created_by: string | null;
  created_at: string;
  assigned_at: string | null;
  completed_at: string | null;
  cancel_reason: string | null;
}

export interface RequestEvent {
  id: number;
  type: RequestEventType;
  from_status: RequestStatus | null;
  to_status: RequestStatus | null;
  actor_id: string | null;
  actor_role: UserRole | null;
  actor_name: string | null;
  driver_name: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface RequestDetail extends RequestRow {
  events: RequestEvent[];
}

export interface Suggestion {
  driver_id: string;
  display_name: string;
  vehicle: VehicleType;
  has_app: boolean;
  location_mode: LocationMode;
  sector_name: string | null;
  distance_m: number | null;
  same_sector: boolean;
}

export interface WhatsappGroup {
  id: string;
  city_zone_id: string;
  name: string;
  kind: WhatsappGroupKind;
  active: boolean;
}

export interface DriverOffer {
  id: string;
  city_zone_id: string;
  service: ServiceType;
  status: RequestStatus;
  pickup_text: string;
  pickup_sector_name: string | null;
  dropoff_text: string | null;
  dropoff_sector_name: string | null;
  notes: string | null;
  offered_at: string;
  offer_expires_at: string;
}

export interface ParseResponse {
  service: ServiceType | 'unknown';
  pickup_text: string | null;
  pickup_sector_slug: string | null;
  pickup_sector_id: string | null;
  dropoff_text: string | null;
  dropoff_sector_slug: string | null;
  dropoff_sector_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  notes: string | null;
  confidence: { service: number; pickup: number; dropoff: number };
  engine: 'llm' | 'rules';
}

export type RealtimeMessage =
  | { type: 'hello' }
  | { type: 'resync' }
  | { type: 'change'; table: string; op: string; id: string | null; city: string | null; event: string | null };
