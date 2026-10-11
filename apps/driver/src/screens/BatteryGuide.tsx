import * as IntentLauncher from 'expo-intent-launcher';
import { Linking, Platform, ScrollView, Text } from 'react-native';
import { Button, Card, H, Muted, s } from '../ui';

const BRANDS: { name: string; steps: string }[] = [
  { name: 'Xiaomi / Redmi / POCO', steps: 'Ajustes → Apps → Despacho Conductor → Ahorro de batería → "Sin restricciones". Activa también "Inicio automático".' },
  { name: 'Samsung', steps: 'Ajustes → Batería → Límites de uso en segundo plano → quita la app de "Apps en suspensión" y agrégala a "Apps que nunca se suspenden".' },
  { name: 'Huawei / Honor', steps: 'Ajustes → Batería → Inicio de aplicaciones → Despacho Conductor → gestión manual con todo activado.' },
  { name: 'Oppo / Realme', steps: 'Ajustes → Batería → Despacho Conductor → permitir actividad en segundo plano e inicio automático.' },
  { name: 'Motorola y otros', steps: 'Ajustes → Apps → Despacho Conductor → Batería → "Sin restricciones".' },
];

export function BatteryGuideScreen({ onClose }: { onClose: () => void }) {
  const openBatterySettings = async () => {
    if (Platform.OS !== 'android') return Linking.openSettings();
    try {
      await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
    } catch {
      await Linking.openSettings();
    }
  };
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.scroll}>
      <H style={{ fontSize: 22 }}>Que el celular no apague la app</H>
      <Muted>
        Muchos celulares cierran las apps en segundo plano para ahorrar batería y dejas de compartir ubicación sin darte cuenta. Haz esto
        una vez:
      </Muted>
      <Button title="Abrir ajustes de batería" onPress={openBatterySettings} />
      {BRANDS.map((b) => (
        <Card key={b.name}>
          <Text style={s.label}>{b.name.toUpperCase()}</Text>
          <Text style={s.value}>{b.steps}</Text>
        </Card>
      ))}
      <Button title="Listo" onPress={onClose} outline />
    </ScrollView>
  );
}
