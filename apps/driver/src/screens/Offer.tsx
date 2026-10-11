import { type DriverOffer, SERVICE_LABEL } from '@despacho/shared';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, H, Muted, colors, s } from '../ui';

export function OfferScreen({
  offer,
  onAccept,
  onReject,
}: {
  offer: DriverOffer;
  onAccept: () => Promise<void>;
  onReject: () => Promise<void>;
}) {
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState<'accept' | 'reject' | null>(null);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.ceil((new Date(offer.offer_expires_at).getTime() - now) / 1000));

  const run = (kind: 'accept' | 'reject') => async () => {
    setBusy(kind);
    try {
      await (kind === 'accept' ? onAccept() : onReject());
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={[s.screen, { padding: 16, gap: 14, justifyContent: 'center', backgroundColor: '#eff6ff' }]}>
      <Text style={{ textAlign: 'center', fontSize: 15, color: colors.primary, fontWeight: '700' }}>NUEVO SERVICIO</Text>
      <H style={{ textAlign: 'center', fontSize: 28 }}>{SERVICE_LABEL[offer.service]}</H>
      <Text style={{ textAlign: 'center', fontSize: 48, fontWeight: '800', color: left <= 10 ? colors.danger : colors.text }}>{left}s</Text>
      <Card>
        <Text style={s.label}>RECOGE</Text>
        <Text style={[s.value, { fontSize: 18 }]}>
          {offer.pickup_text}
          {offer.pickup_sector_name ? ` · ${offer.pickup_sector_name}` : ''}
        </Text>
        {(offer.dropoff_text || offer.dropoff_sector_name) && (
          <>
            <Text style={s.label}>ENTREGA</Text>
            <Text style={[s.value, { fontSize: 18 }]}>
              {offer.dropoff_text ?? ''}
              {offer.dropoff_sector_name ? ` · ${offer.dropoff_sector_name}` : ''}
            </Text>
          </>
        )}
        {offer.notes && (
          <>
            <Text style={s.label}>NOTAS</Text>
            <Text style={s.value}>{offer.notes}</Text>
          </>
        )}
      </Card>
      <Muted style={{ textAlign: 'center' }}>Los datos del cliente aparecen al aceptar.</Muted>
      <Button title="Aceptar" color={colors.ok} big onPress={run('accept')} busy={busy === 'accept'} disabled={left === 0 || busy !== null} />
      <Button title="Rechazar" color={colors.danger} outline onPress={run('reject')} busy={busy === 'reject'} disabled={busy !== null} />
    </View>
  );
}
