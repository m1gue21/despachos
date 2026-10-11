import { DRIVER_STATUS_LABEL, type DriverRow, type DriverStatus, type RequestRow } from '@despacho/shared';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { ActiveServiceCard } from './ActiveService';
import { Button, Card, Muted, colors, s } from '../ui';

const STATUS_COLOR: Record<DriverStatus, string> = { available: colors.ok, busy: colors.warn, offline: colors.idle };

const ago = (ms: number) => {
  const sec = Math.round(ms / 1000);
  return sec < 60 ? `hace ${sec} s` : `hace ${Math.round(sec / 60)} min`;
};

export function HomeScreen({
  driver,
  sectors,
  active,
  online,
  lastSyncAt,
  liveInfo,
  onStatus,
  onSector,
  onConfirmZone,
  onToggleLive,
  onServiceAction,
  onHistory,
  onBattery,
  onLogout,
}: {
  driver: DriverRow;
  sectors: { id: string; name: string }[];
  active: RequestRow[];
  online: boolean;
  lastSyncAt: number | null;
  liveInfo: { running: boolean; lastFixAt: number; lastSentAt: number; failures: number; busy: boolean };
  onStatus: (s: DriverStatus) => void;
  onSector: (id: string) => void;
  onConfirmZone: () => void;
  onToggleLive: (on: boolean) => void;
  onServiceAction: (r: RequestRow, action: 'pick_up' | 'complete') => Promise<void>;
  onHistory: () => void;
  onBattery: () => void;
  onLogout: () => void;
}) {
  const live = driver.location_mode === 'live';
  const now = Date.now();
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.scroll}>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <Text style={{ fontSize: 20, fontWeight: '700' }}>{driver.display_name}</Text>
        <View style={s.row}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: online ? colors.ok : colors.danger }} />
          <Muted>{online ? 'Conectado' : 'Sin conexión'}</Muted>
        </View>
      </View>
      {lastSyncAt && <Muted>Última sincronización {ago(now - lastSyncAt)}</Muted>}

      {active.map((r) => (
        <ActiveServiceCard key={r.id} r={r} onAction={(a) => onServiceAction(r, a)} />
      ))}

      {/* Estado */}
      <Card>
        <Text style={s.label}>MI ESTADO</Text>
        <View style={{ gap: 8 }}>
          {(['available', 'busy', 'offline'] as const).map((st) => {
            const selected = driver.status === st;
            return (
              <Pressable
                key={st}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => onStatus(st)}
                style={{
                  minHeight: 56,
                  borderRadius: 10,
                  borderWidth: 2,
                  borderColor: STATUS_COLOR[st],
                  backgroundColor: selected ? STATUS_COLOR[st] : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 18, fontWeight: '700', color: selected ? '#fff' : STATUS_COLOR[st] }}>{DRIVER_STATUS_LABEL[st]}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      {/* Sector */}
      <Card>
        <View style={[s.row, { justifyContent: 'space-between' }]}>
          <Text style={s.label}>MI SECTOR</Text>
          {driver.is_stale && driver.status !== 'offline' && <Text style={{ color: colors.warn, fontWeight: '600' }}>Desactualizado</Text>}
        </View>
        <Text style={{ fontSize: 18, fontWeight: '600' }}>{driver.sector_name ?? 'Sin sector'}</Text>
        {live ? (
          <Muted>En vivo el sector se calcula solo con tu ubicación.</Muted>
        ) : (
          <>
            <Button title="Sigo aquí" onPress={onConfirmZone} disabled={!driver.sector_zone_id} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {sectors.map((z) => (
                <Pressable
                  key={z.id}
                  onPress={() => onSector(z.id)}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderRadius: 20,
                    borderWidth: 1,
                    borderColor: driver.sector_zone_id === z.id ? colors.primary : colors.border,
                    backgroundColor: driver.sector_zone_id === z.id ? '#dbeafe' : '#fff',
                  }}
                >
                  <Text style={{ fontSize: 15 }}>{z.name}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </Card>

      {/* Ubicación en vivo */}
      <Card>
        <View style={[s.row, { justifyContent: 'space-between' }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '600' }}>Compartir mi ubicación en vivo</Text>
            <Muted>
              {live
                ? liveInfo.lastSentAt
                  ? `Enviada ${ago(now - liveInfo.lastSentAt)}${liveInfo.failures ? ` · ${liveInfo.failures} reintento(s)` : ''}`
                  : 'Esperando GPS…'
                : 'Apagado: el operador ve tu sector.'}
            </Muted>
          </View>
          <Switch value={live} onValueChange={onToggleLive} disabled={liveInfo.busy} />
        </View>
        {live && <Button title="Evitar que el celular cierre la app" outline onPress={onBattery} />}
      </Card>

      <View style={s.row}>
        <Button title="Servicios de hoy" outline onPress={onHistory} style={{ flex: 1 }} />
        <Button title="Salir" outline color={colors.muted} onPress={onLogout} style={{ flex: 1 }} />
      </View>
    </ScrollView>
  );
}
