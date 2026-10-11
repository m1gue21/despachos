import { type RequestRow, SERVICE_LABEL } from '@despacho/shared';
import { useState } from 'react';
import { Alert, Linking, Text, View } from 'react-native';
import { Button, Card, colors, s } from '../ui';

// Destino para navegación: coordenadas si las hay; si no, el texto + ciudad.
function navTarget(lat: number | null, lng: number | null, text: string | null, sector: string | null) {
  if (lat != null && lng != null) return { ll: `${lat},${lng}`, q: null };
  const q = [text, sector, 'Caldas, Colombia'].filter(Boolean).join(', ');
  return { ll: null, q };
}

async function openNav(app: 'google' | 'waze', t: { ll: string | null; q: string | null }) {
  const url =
    app === 'google'
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(t.ll ?? t.q ?? '')}`
      : t.ll
        ? `https://waze.com/ul?ll=${t.ll}&navigate=yes`
        : `https://waze.com/ul?q=${encodeURIComponent(t.q ?? '')}&navigate=yes`;
  await Linking.openURL(url).catch(() => Alert.alert('No se pudo abrir la navegación'));
}

export function ActiveServiceCard({
  r,
  onAction,
}: {
  r: RequestRow;
  onAction: (action: 'pick_up' | 'complete') => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const goingToPickup = r.status === 'assigned';
  const target = goingToPickup
    ? navTarget(r.pickup_lat, r.pickup_lng, r.pickup_text, r.pickup_sector_name)
    : navTarget(r.dropoff_lat, r.dropoff_lng, r.dropoff_text, r.dropoff_sector_name);

  const act = async (action: 'pick_up' | 'complete') => {
    setBusy(true);
    try {
      await onAction(action);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ borderColor: colors.primary, borderWidth: 2 }}>
      <Text style={{ color: colors.primary, fontWeight: '700' }}>
        SERVICIO EN CURSO · {SERVICE_LABEL[r.service].toUpperCase()} · {goingToPickup ? 'VAS A RECOGER' : 'VAS A ENTREGAR'}
      </Text>
      <View>
        <Text style={s.label}>RECOGE</Text>
        <Text style={s.value}>
          {r.pickup_text}
          {r.pickup_sector_name ? ` · ${r.pickup_sector_name}` : ''}
        </Text>
      </View>
      {(r.dropoff_text || r.dropoff_sector_name) && (
        <View>
          <Text style={s.label}>ENTREGA</Text>
          <Text style={s.value}>
            {r.dropoff_text ?? ''}
            {r.dropoff_sector_name ? ` · ${r.dropoff_sector_name}` : ''}
          </Text>
        </View>
      )}
      {r.notes && (
        <View>
          <Text style={s.label}>NOTAS</Text>
          <Text style={s.value}>{r.notes}</Text>
        </View>
      )}
      {(r.customer_name || r.customer_phone) && (
        <View>
          <Text style={s.label}>CLIENTE</Text>
          <Text style={s.value}>{[r.customer_name, r.customer_phone].filter(Boolean).join(' · ')}</Text>
        </View>
      )}
      {(target.ll || target.q) && (
        <View style={s.row}>
          <Button title="Google Maps" outline onPress={() => openNav('google', target)} style={{ flex: 1 }} />
          <Button title="Waze" outline onPress={() => openNav('waze', target)} style={{ flex: 1 }} />
        </View>
      )}
      {r.customer_phone && (
        <View style={s.row}>
          <Button title="Llamar" outline onPress={() => Linking.openURL(`tel:${r.customer_phone}`)} style={{ flex: 1 }} />
          <Button
            title="WhatsApp"
            outline
            color={colors.ok}
            onPress={() => Linking.openURL(`https://wa.me/57${r.customer_phone}`)}
            style={{ flex: 1 }}
          />
        </View>
      )}
      {goingToPickup ? (
        <Button title="Ya recogí" big onPress={() => act('pick_up')} busy={busy} />
      ) : (
        <Button title="Completado" big color={colors.ok} onPress={() => act('complete')} busy={busy} />
      )}
    </Card>
  );
}
