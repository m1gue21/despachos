// Lógica pura (sin módulos nativos) del estado del celular y del turno, para
// poder probarla con node:test.
import type { DeviceState } from '@despacho/shared';

export type ProblemId = 'permission' | 'gps' | 'battery' | 'mock';

export interface Problem {
  id: ProblemId;
  title: string;
  fix: string;
}

// Qué le impide a este celular compartir ubicación como el despacho necesita.
export function deviceProblems(d: DeviceState): Problem[] {
  const out: Problem[] = [];
  if (d.permission !== 'always') {
    out.push({
      id: 'permission',
      title: d.permission === 'denied' ? 'La app no tiene permiso de ubicación' : 'Falta el permiso "todo el tiempo"',
      fix: 'Abre los ajustes de la app → Permisos → Ubicación → "Permitir todo el tiempo".',
    });
  }
  if (!d.gps_enabled) {
    out.push({ id: 'gps', title: 'El GPS está apagado', fix: 'Enciende la ubicación del celular.' });
  }
  if (d.battery !== null && d.battery <= 15 && !d.charging) {
    out.push({
      id: 'battery',
      title: `Batería baja (${Math.round(d.battery)} %)`,
      fix: 'Conéctalo a un cargador: si se apaga, pierdes la señal y el turno.',
    });
  }
  if (d.mocked) {
    out.push({ id: 'mock', title: 'Ubicación simulada detectada', fix: 'Desactiva la app de ubicación falsa. El despacho lo ve.' });
  }
  return out;
}

// 0 → "0 min", 75 → "1 h 15 min"
export function shiftDuration(startedAt: number, now: number): string {
  const mins = Math.max(0, Math.floor((now - startedAt) / 60_000));
  return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, '0')} min`;
}

export function signalAge(lastSentAt: number, now: number): string {
  if (!lastSentAt) return 'esperando GPS…';
  const s = Math.max(0, Math.round((now - lastSentAt) / 1000));
  return s < 60 ? `hace ${s} s` : `hace ${Math.round(s / 60)} min`;
}

// El nivel de Expo va de 0 a 1 (-1 si el celular no lo da).
export function batteryPercent(level: number): number | null {
  return level < 0 ? null : Math.round(level * 100);
}

// ¿Hay que volver a reportar? Cada minuto, o ya si cambió algo importante.
export function shouldReport(prev: DeviceState | null, next: DeviceState, lastAt: number, now: number, everyMs = 60_000): boolean {
  if (!prev || now - lastAt >= everyMs) return true;
  return prev.permission !== next.permission || prev.gps_enabled !== next.gps_enabled || prev.mocked !== next.mocked;
}
