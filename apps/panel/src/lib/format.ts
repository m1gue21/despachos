export function elapsed(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

export function minutesSince(iso: string, now = Date.now()): number {
  return (now - new Date(iso).getTime()) / 60000;
}

export function time(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

export function phonePretty(p: string | null): string {
  if (!p) return '';
  return p.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1 $2 $3');
}

export function distance(m: number | null): string {
  if (m === null) return '';
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

// Minutos sin asignar a partir de los cuales la solicitud se pone en rojo.
export const UNASSIGNED_ALERT_MINUTES = 5;
