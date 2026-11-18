import { DRIVER_STATUS_LABEL, type DeviceState, type DriverRow, type DriverStatus, type RequestRow } from '@despacho/shared';
import { Alert, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { type Problem, deviceProblems, shiftDuration, signalAge } from '../device-logic';
import { IN_EXPO_GO } from '../live';
import { openAppSettings, openBatterySettings, openLocationSettings } from '../settings';
import { ActiveServiceCard } from './ActiveService';
import { Button, Card, Muted, colors, s } from '../ui';

const FIX: Record<Problem['id'], () => Promise<void>> = {
  permission: openAppSettings,
  gps: openLocationSettings,
  battery: openBatterySettings,
  mock: openAppSettings,
};

export function HomeScreen({
  driver,
  sectors,
  active,
  online,
  lastSyncAt,
  live,
  shiftStartedAt,
  device,
  busy,
  onStartShift,
  onEndShift,
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
  live: { running: boolean; lastSentAt: number; failures: number };
  shiftStartedAt: number | null;
  device: DeviceState | null;
  busy: boolean;
  onStartShift: () => void;
  onEndShift: () => void;
  onStatus: (s: DriverStatus) => void;
  onSector: (id: string) => void;
  onConfirmZone: () => void;
  onToggleLive: (on: boolean) => void;
  onServiceAction: (r: RequestRow, action: 'pick_up' | 'complete') => Promise<void>;
  onHistory: () => void;
  onBattery: () => void;
  onLogout: () => void;
}) {
  const inShift = driver.status !== 'offline';
  const isLive = driver.location_mode === 'live';
  const now = Date.now();
  // En Expo Go (modo prueba) "todo el tiempo" no existe: no se muestra como problema.
  const problems = device && inShift ? deviceProblems(device).filter((p) => !(IN_EXPO_GO && p.id === 'permission')) : [];
  const signalOk = isLive && live.lastSentAt > 0 && now - live.lastSentAt < 90_000;

  const confirmEnd = () =>
    Alert.alert(
      'Terminar turno',
      active.length > 0
        ? 'Tienes un servicio en curso. Termínalo antes de salir del turno.'
        : 'Dejarás de compartir tu ubicación y de recibir servicios.',
      active.length > 0 ? [{ text: 'Entendido' }] : [{ text: 'Seguir en turno', style: 'cancel' }, { text: 'Terminar turno', style: 'destructive', onPress: onEndShift }],
    );

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.scroll}>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <Text style={{ fontSize: 20, fontWeight: '700' }}>{driver.display_name}</Text>
        <View style={s.row}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: online ? colors.ok : colors.danger }} />
          <Muted>{online ? 'Conectado' : 'Sin conexión'}</Muted>
        </View>
      </View>
      {lastSyncAt && <Muted>Última sincronización {signalAge(lastSyncAt, now)}</Muted>}

      {IN_EXPO_GO && (
        <View style={{ backgroundColor: '#fff7e6', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.warn }}>
          <Text style={{ fontWeight: '700', color: colors.warn }}>MODO PRUEBA (Expo Go)</Text>
          <Text style={s.value}>
            La ubicación solo se envía con la app abierta. Al bloquear la pantalla o cambiar de app, el despacho verá una alerta de
            "sin señal". Para probar el segundo plano hace falta la app instalada (no Expo Go).
          </Text>
        </View>
      )}

      {/* ── Turno ── */}
      {inShift ? (
        <Card style={{ borderColor: colors.ok, borderWidth: 2 }}>
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <View>
              <Text style={{ color: colors.ok, fontWeight: '800', fontSize: 13 }}>EN TURNO</Text>
              <Text style={{ fontSize: 28, fontWeight: '800' }}>{shiftStartedAt ? shiftDuration(shiftStartedAt, now) : '—'}</Text>
            </View>
            <Button title="Terminar turno" outline color={colors.danger} onPress={confirmEnd} disabled={busy} />
          </View>
          <Muted>
            {driver.tracking_required
              ? 'Tu despacho exige ubicación en vivo mientras estés en turno. Fuera de turno no se comparte nada.'
              : 'Compartes tu ubicación en vivo mientras estés en turno.'}
          </Muted>
        </Card>
      ) : (
        <Card>
          <Text style={{ fontSize: 18, fontWeight: '700' }}>Fuera de turno</Text>
          <Muted>
            Al iniciar el turno compartes tu ubicación en vivo con el despacho y empiezas a recibir servicios. Fuera de turno no se comparte nada.
          </Muted>
          <Button title="INICIAR TURNO" color={colors.ok} big onPress={onStartShift} busy={busy} />
        </Card>
      )}

      {active.map((r) => (
        <ActiveServiceCard key={r.id} r={r} onAction={(a) => onServiceAction(r, a)} />
      ))}

      {/* ── Chequeo del celular ── */}
      {inShift && (
        <Card>
          <Text style={s.label}>ESTADO DE TU CELULAR</Text>
          <Row ok={signalOk} title={signalOk ? 'Ubicación en vivo funcionando' : 'Sin señal de ubicación'} detail={signalAge(live.lastSentAt, now) + (live.failures ? ` · ${live.failures} reintento(s)` : '')} />
          {device ? (
            <>
              <Row ok={device.permission === 'always'} title='Permiso "todo el tiempo"' detail={device.permission === 'always' ? 'Concedido' : device.permission === 'foreground' ? 'Solo con la app abierta' : 'Sin permiso'} />
              <Row ok={device.gps_enabled} title="GPS" detail={device.gps_enabled ? 'Encendido' : 'Apagado'} />
              <Row ok={device.battery === null || device.battery > 15 || device.charging} title="Batería" detail={device.battery === null ? 'Sin dato' : `${Math.round(device.battery)} %${device.charging ? ' · cargando' : ''}`} />
            </>
          ) : (
            <Muted>Revisando…</Muted>
          )}
          {problems.map((p) => (
            <View key={p.id} style={{ backgroundColor: '#fef2f2', borderRadius: 10, padding: 12, gap: 6 }}>
              <Text style={{ color: colors.danger, fontWeight: '700' }}>{p.title}</Text>
              <Text style={s.value}>{p.fix}</Text>
              {p.id !== 'mock' && <Button title="Arreglar" color={colors.danger} onPress={() => void FIX[p.id]()} />}
            </View>
          ))}
          {/* La guía de ahorro de batería es de marcas Android; en iPhone no aplica. */}
          {Platform.OS === 'android' && <Button title="Evitar que el celular cierre la app" outline onPress={onBattery} />}
        </Card>
      )}

      {/* ── Estado y sector ── */}
      {inShift && (
        <Card>
          <Text style={s.label}>MI ESTADO</Text>
          <View style={s.row}>
            {(['available', 'busy'] as const).map((st) => {
              const selected = driver.status === st;
              const c = st === 'available' ? colors.ok : colors.warn;
              return (
                <Pressable
                  key={st}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => onStatus(st)}
                  style={{ flex: 1, minHeight: 52, borderRadius: 10, borderWidth: 2, borderColor: c, backgroundColor: selected ? c : 'transparent', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ fontSize: 16, fontWeight: '700', color: selected ? '#fff' : c }}>{DRIVER_STATUS_LABEL[st]}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={s.label}>MI SECTOR</Text>
          <Text style={{ fontSize: 18, fontWeight: '600' }}>{driver.sector_name ?? 'Sin sector'}</Text>
          {isLive ? (
            <Muted>En vivo el sector se calcula solo con tu ubicación.</Muted>
          ) : (
            <>
              <Button title="Sigo aquí" onPress={onConfirmZone} disabled={!driver.sector_zone_id} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {sectors.map((z) => (
                  <Pressable
                    key={z.id}
                    onPress={() => onSector(z.id)}
                    style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: driver.sector_zone_id === z.id ? colors.primary : colors.border, backgroundColor: driver.sector_zone_id === z.id ? '#e6efe9' : '#fff' }}
                  >
                    <Text style={{ fontSize: 15 }}>{z.name}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}
          {/* Si el despacho no exige ubicación, el conductor puede pasar a zona. */}
          {!driver.tracking_required && (
            <View style={[s.row, { justifyContent: 'space-between' }]}>
              <Text style={{ fontSize: 15, flex: 1 }}>Compartir mi ubicación en vivo</Text>
              <Switch value={isLive} onValueChange={onToggleLive} />
            </View>
          )}
        </Card>
      )}

      <View style={s.row}>
        <Button title="Servicios de hoy" outline onPress={onHistory} style={{ flex: 1 }} />
        <Button title="Salir" outline color={colors.muted} onPress={onLogout} style={{ flex: 1 }} disabled={inShift} />
      </View>
      {inShift && <Muted>Para cerrar sesión, termina primero el turno.</Muted>}
    </ScrollView>
  );
}

function Row({ ok, title, detail }: { ok: boolean; title: string; detail: string }) {
  return (
    <View style={[s.row, { justifyContent: 'space-between' }]}>
      <View style={[s.row, { flex: 1 }]}>
        <Text style={{ fontSize: 16, color: ok ? colors.ok : colors.danger }}>{ok ? '✓' : '✗'}</Text>
        <Text style={{ fontSize: 15, flex: 1 }}>{title}</Text>
      </View>
      <Muted>{detail}</Muted>
    </View>
  );
}
