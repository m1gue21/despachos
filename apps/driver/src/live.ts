// Encender/apagar el modo "Ubicación en vivo".
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { LOCATION_TASK } from './config';

export type LiveStartResult = { ok: true } | { ok: false; reason: 'foreground_denied' | 'background_denied' | 'error'; message: string };

export async function startLive(pingSeconds: number): Promise<LiveStartResult> {
  try {
    // Orden obligatorio: primer plano → segundo plano.
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') {
      return { ok: false, reason: 'foreground_denied', message: 'Sin permiso de ubicación no se puede compartir en vivo.' };
    }
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.status !== 'granted') {
      return {
        ok: false,
        reason: 'background_denied',
        message: 'Elige "Permitir todo el tiempo" en los ajustes de ubicación para compartir con la pantalla bloqueada.',
      };
    }
    if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) return { ok: true };
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: pingSeconds * 1000,
      distanceInterval: 0,
      foregroundService: {
        notificationTitle: 'Compartiendo ubicación',
        notificationBody: 'El operador ve dónde estás. Puedes apagarlo desde la app.',
        notificationColor: '#1d4ed8',
        killServiceOnDestroy: false,
      },
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: Platform.OS === 'ios',
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}

export async function stopLive(): Promise<void> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    }
  } catch {
    // Si no estaba corriendo, no hay nada que parar.
  }
}

export async function isLiveRunning(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  } catch {
    return false;
  }
}
