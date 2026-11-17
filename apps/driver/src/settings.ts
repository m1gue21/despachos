import * as IntentLauncher from 'expo-intent-launcher';
import { Linking, Platform } from 'react-native';

// Ajustes del sistema a los que mandamos al conductor para arreglar cada problema.
export async function openAppSettings() {
  if (Platform.OS === 'android') {
    try {
      await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS, {
        data: 'package:co.despacho.conductor',
      });
      return;
    } catch {
      // cae a los ajustes genéricos
    }
  }
  await Linking.openSettings();
}

export async function openLocationSettings() {
  if (Platform.OS === 'android') {
    try {
      await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.LOCATION_SOURCE_SETTINGS);
      return;
    } catch {
      // cae a los ajustes de la app
    }
  }
  await Linking.openSettings();
}

export async function openBatterySettings() {
  if (Platform.OS === 'android') {
    try {
      await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
      return;
    } catch {
      // cae a los ajustes de la app
    }
  }
  await Linking.openSettings();
}
