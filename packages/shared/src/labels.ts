// Textos de UI en español (Colombia), centralizados para i18n.
import type { DriverStatus, LocationMode, RequestStatus, ServiceType, VehicleType } from './enums';
import type { RequestRow } from './api-types';

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  created: 'Sin asignar',
  offered: 'Ofrecida',
  assigned: 'Asignada',
  picked_up: 'Recogida',
  completed: 'Completada',
  cancelled: 'Cancelada',
};

export const SERVICE_LABEL: Record<ServiceType, string> = {
  delivery: 'Domicilio',
  ride: 'Transporte',
  errand: 'Mandado',
};

export const VEHICLE_LABEL: Record<VehicleType, string> = {
  moto: 'Moto',
  car: 'Carro',
  bicycle: 'Bicicleta',
  other: 'Otro',
};

export const VEHICLE_ICON: Record<VehicleType, string> = {
  moto: '🏍️',
  car: '🚗',
  bicycle: '🚲',
  other: '🛵',
};

export const DRIVER_STATUS_LABEL: Record<DriverStatus, string> = {
  available: 'Disponible',
  busy: 'Ocupado',
  offline: 'Desconectado',
};

export const LOCATION_MODE_LABEL: Record<LocationMode, string> = {
  live: 'En vivo',
  zone: 'Por zona',
  none: 'Sin ubicación',
};

export const EVENT_LABEL: Record<string, string> = {
  created: 'Creada',
  offered: 'Ofrecida',
  assigned: 'Asignada',
  rejected: 'Oferta rechazada',
  reassigned: 'Reasignada',
  status_changed: 'Cambio de estado',
  cancelled: 'Cancelada',
  note: 'Nota',
};

// Mensaje listo para republicar en el grupo de WhatsApp. Sin datos del
// cliente: esos solo los recibe el conductor asignado.
export function formatWhatsappMessage(r: Pick<
  RequestRow,
  'service' | 'pickup_text' | 'pickup_sector_name' | 'dropoff_text' | 'dropoff_sector_name' | 'notes' | 'status' | 'assigned_driver_name'
>): string {
  const place = (text: string | null, sector: string | null) =>
    [text, sector && !text?.toLowerCase().includes(sector.toLowerCase()) ? `(${sector})` : null].filter(Boolean).join(' ');
  const lines = [
    `*${SERVICE_LABEL[r.service].toUpperCase()}*`,
    `📍 Recoge: ${place(r.pickup_text, r.pickup_sector_name)}`,
  ];
  if (r.dropoff_text || r.dropoff_sector_name) lines.push(`🏁 Entrega: ${place(r.dropoff_text, r.dropoff_sector_name)}`);
  if (r.notes) lines.push(`📝 ${r.notes}`);
  if (r.status === 'assigned' || r.status === 'picked_up') lines.push(`✅ Asignado a ${r.assigned_driver_name ?? '—'}`);
  else lines.push('¿Quién lo toma? Responder al operador.');
  return lines.join('\n');
}

export const ALERT_REASON_LABEL: Record<string, string> = {
  sin_senal: 'Sin señal',
  gps_apagado: 'GPS apagado',
  permiso_revocado: 'Quitó el permiso de ubicación',
  bateria_critica: 'Batería casi agotada',
  ubicacion_falsa: 'Ubicación falsa',
  modo_sin_gps: 'Sin ubicación en vivo',
};

// Qué decirle al administrador (y qué hacer) según la causa de la alerta.
export const ALERT_REASON_HINT: Record<string, string> = {
  sin_senal: 'La app puede estar cerrada o sin datos. Llámalo.',
  gps_apagado: 'Apagó el GPS del celular. Pídele que lo encienda.',
  permiso_revocado: 'La app ya no tiene permiso de ubicación "todo el tiempo".',
  bateria_critica: 'Al celular le queda menos del 5 %. Probablemente se apague.',
  ubicacion_falsa: 'El celular reporta una ubicación simulada (app de GPS falso).',
  modo_sin_gps: 'Está en turno pero no comparte su ubicación en vivo.',
};

// Etiquetas que el cliente puede elegir al calificar (validadas en la base).
export const RATING_TAGS: { key: string; label: string; positive: boolean }[] = [
  { key: 'puntual', label: 'Puntual', positive: true },
  { key: 'amable', label: 'Amable', positive: true },
  { key: 'cuidadoso', label: 'Cuidadoso', positive: true },
  { key: 'buena_comunicacion', label: 'Buena comunicación', positive: true },
  { key: 'tardo', label: 'Tardó mucho', positive: false },
  { key: 'mal_trato', label: 'Mal trato', positive: false },
  { key: 'producto_danado', label: 'Producto dañado', positive: false },
  { key: 'no_contesto', label: 'No contestó', positive: false },
];

export const RATING_TAG_LABEL: Record<string, string> = Object.fromEntries(RATING_TAGS.map((t) => [t.key, t.label]));
