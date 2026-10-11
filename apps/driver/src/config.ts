import Constants from 'expo-constants';

// En desarrollo, si no hay EXPO_PUBLIC_API_URL, se usa la IP de la máquina
// que sirve el bundle (la misma red del celular) en el puerto 4000.
function deriveApiUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return host ? `http://${host}:4000` : 'http://127.0.0.1:4000';
}

export const API_URL = deriveApiUrl();
export const LOCATION_TASK = 'despacho-live-location';
// Aunque no se mueva, enviar al menos cada 60 s para no quedar "desactualizado".
export const HEARTBEAT_MS = 60_000;
// Moverse menos que esto no amerita ping (spec §8).
export const MIN_MOVE_M = 15;
// Si en este tiempo no llega ninguna ubicación estando en vivo, se vuelve a zona.
export const LOCATION_SILENCE_MS = 3 * 60_000;
