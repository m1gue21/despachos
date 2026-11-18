// Ajustes del sistema de Android. expo-intent-launcher es solo de Android
// (expo-module.config.json: platforms ["android"]): en iOS este archivo no se empaqueta.
import * as IntentLauncher from 'expo-intent-launcher';

export type SettingsTarget = 'app' | 'location' | 'battery';

export async function openAndroidSettings(target: SettingsTarget): Promise<boolean> {
  try {
    if (target === 'app') {
      await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS, {
        data: 'package:co.despacho.conductor',
      });
    } else if (target === 'location') {
      await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.LOCATION_SOURCE_SETTINGS);
    } else {
      await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
    }
    return true;
  } catch {
    return false;
  }
}
