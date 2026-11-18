// iOS y web: no hay "intents" de Android. Devuelve false para que quien llama use
// Linking.openSettings() (la pantalla de ajustes de la app en iOS).
// La versión de Android está en android-intents.android.ts (Metro la elige sola).
export type SettingsTarget = 'app' | 'location' | 'battery';

export async function openAndroidSettings(_target: SettingsTarget): Promise<boolean> {
  return false;
}
