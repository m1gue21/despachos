import { Linking } from 'react-native';
import { type SettingsTarget, openAndroidSettings } from './android-intents';

// Ajustes a los que mandamos al conductor para arreglar cada problema. En Android abre la
// pantalla exacta; en iPhone solo se puede abrir la pantalla de ajustes de la app.
async function open(target: SettingsTarget) {
  if (await openAndroidSettings(target)) return;
  await Linking.openSettings();
}

export const openAppSettings = () => open('app');
export const openLocationSettings = () => open('location');
export const openBatterySettings = () => open('battery');
