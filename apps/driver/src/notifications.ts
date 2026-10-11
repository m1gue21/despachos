import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Canal de prioridad máxima para ofertas + registro del token FCM en el API.
// Push remoto solo funciona en un development build (no en Expo Go).
export async function setupNotifications(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('offers', {
      name: 'Ofertas de servicio',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: [0, 400, 200, 400],
    });
  }
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted' || !Device.isDevice) return;
  try {
    const token = await Notifications.getDevicePushTokenAsync();
    await api('/driver/push-token', { body: { token: String(token.data), platform: Platform.OS === 'ios' ? 'ios' : 'android' } });
  } catch {
    // Sin push (Expo Go, sin FCM configurado): quedan WebSocket y polling.
  }
}

export async function notifyLocal(title: string, body: string) {
  await Notifications.scheduleNotificationAsync({ content: { title, body, sound: 'default' }, trigger: null }).catch(() => {});
}
