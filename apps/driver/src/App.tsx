import type { DeviceState, DriverOffer, DriverRow, DriverStatus, RequestRow } from '@despacho/shared';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, SafeAreaView, Vibration, View } from 'react-native';
import { ApiError, api, loadToken, saveToken, unauthorized } from './api';
import { LOCATION_SILENCE_MS } from './config';
import { isLiveRunning, startLive, stopLive } from './live';
import { reportDevice } from './health';
import { flushPending, liveState } from './location-task';
import { notifyLocal, setupNotifications } from './notifications';
import { beginShift, finishShift, loadShiftStart, saveShiftStart } from './shift';
import { useRealtime } from './realtime';
import { ActiveServiceCard } from './screens/ActiveService';
import { BatteryGuideScreen } from './screens/BatteryGuide';
import { ConsentScreen } from './screens/Consent';
import { HistoryScreen } from './screens/History';
import { HomeScreen } from './screens/Home';
import { LoginScreen } from './screens/Login';
import { OfferScreen } from './screens/Offer';
import { colors, s } from './ui';


interface DriverMe {
  driver: DriverRow;
  sectors: { id: string; name: string }[];
  settings: { live_ping_seconds: number; offer_timeout_seconds: number; zone_stale_minutes: number };
  consent: { consent_at: string | null; consent_version: string | null; current_version: string; valid: boolean };
}

type Screen = 'home' | 'consent' | 'history' | 'battery';
const CONSENT_DECLINED_KEY = 'consent_declined';

export default function App() {
  const [booting, setBooting] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [me, setMe] = useState<DriverMe | null>(null);
  const [offers, setOffers] = useState<DriverOffer[]>([]);
  const [services, setServices] = useState<RequestRow[]>([]);
  const [screen, setScreen] = useState<Screen>('home');
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [liveBusy, setLiveBusy] = useState(false);
  const [liveRunning, setLiveRunning] = useState(false);
  const [shiftStartedAt, setShiftStartedAt] = useState<number | null>(null);
  const [shiftBusy, setShiftBusy] = useState(false);
  const [device, setDevice] = useState<DeviceState | null>(null);
  const [, force] = useState(0);
  const seenOffers = useRef(new Set<string>());

  const logout = useCallback(async () => {
    await stopLive();
    await saveToken(null);
    setAuthed(false);
    setMe(null);
  }, []);
  unauthorized.handler = () => void logout();

  const refresh = useCallback(async () => {
    try {
      const [m, o, sv] = await Promise.all([
        api<DriverMe>('/driver/me'),
        api<DriverOffer[]>('/driver/offers'),
        api<RequestRow[]>('/driver/services'),
      ]);
      setMe(m);
      setOffers(o);
      setServices(sv);
      setLastSyncAt(Date.now());
      // Oferta nueva: vibrar y notificar (por si la app está en segundo plano).
      for (const off of o) {
        if (!seenOffers.current.has(off.id)) {
          seenOffers.current.add(off.id);
          Vibration.vibrate([0, 400, 200, 400]);
          if (AppState.currentState !== 'active') void notifyLocal('Nuevo servicio', off.pickup_text);
        }
      }
      return m;
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        Alert.alert('Cuenta no vinculada', e.message);
        void logout();
      }
      return null;
    }
  }, [logout]);

  // Arranque: token guardado → cargar datos.
  useEffect(() => {
    void (async () => {
      if (await loadToken()) {
        setAuthed(true);
        await refresh();
      }
      setLiveRunning(await isLiveRunning());
      setShiftStartedAt(await loadShiftStart());
      setBooting(false);
    })();
  }, [refresh]);

  // Primera vez: pantalla de consentimiento (si no lo aceptó ni lo rechazó).
  useEffect(() => {
    if (!me || me.consent.valid) return;
    void SecureStore.getItemAsync(CONSENT_DECLINED_KEY).then((v) => {
      if (!v || me.driver.tracking_required) setScreen('consent');
    });
  }, [me]);

  useEffect(() => {
    if (!authed) return;
    void setupNotifications();
  }, [authed]);

  // Tiempo real + polling de respaldo cada 20 s con la app abierta.
  const online = useRealtime(authed, () => void refresh());
  useEffect(() => {
    if (!authed) return;
    const t = setInterval(() => {
      if (AppState.currentState === 'active') void refresh();
    }, 20_000);
    const sub = AppState.addEventListener('change', (st) => st === 'active' && void refresh());
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, [authed, refresh]);

  // Refresca indicadores de envío de ubicación.
  useEffect(() => {
    const fn = () => force((x) => x + 1);
    liveState.listeners.add(fn);
    const t = setInterval(() => {
      void flushPending(); // reintento de un ping pendiente
      fn();
    }, 10_000);
    return () => {
      liveState.listeners.delete(fn);
      clearInterval(t);
    };
  }, []);

  const patchPresence = useCallback(
    async (body: Record<string, unknown>) => {
      try {
        const driver = await api<DriverRow>('/driver/presence', { method: 'PATCH', body });
        setMe((m) => (m ? { ...m, driver } : m));
      } catch (e) {
        Alert.alert('No se pudo actualizar', e instanceof Error ? e.message : String(e));
      }
    },
    [],
  );

  // Sin ubicaciones durante un rato estando en vivo → volver a zona y avisar.
  useEffect(() => {
    if (me?.driver.location_mode !== 'live' || me.driver.tracking_required) return;
    const startedAt = Date.now();
    const t = setInterval(async () => {
      const last = Math.max(liveState.lastFixAt, startedAt);
      if (Date.now() - last > LOCATION_SILENCE_MS) {
        await stopLive();
        setLiveRunning(false);
        await patchPresence({ location_mode: 'zone' });
        void notifyLocal('Ubicación en vivo apagada', 'Dejamos de recibir tu GPS. Quedaste por sector; actívala de nuevo cuando quieras.');
        Alert.alert('Ubicación en vivo apagada', 'Dejamos de recibir tu GPS. Quedaste por sector.');
      }
    }, 30_000);
    return () => clearInterval(t);
  }, [me?.driver.location_mode, me?.driver.tracking_required, patchPresence]);

  // Si el servidor dice live pero la tarea no corre (p. ej. tras reinstalar), arrancarla.
  useEffect(() => {
    if (!me || me.driver.location_mode !== 'live' || liveRunning || liveBusy) return;
    void (async () => {
      const r = await startLive(me.settings.live_ping_seconds);
      if (r.ok) setLiveRunning(true);
      // Con ubicación obligatoria no se baja a zona: el panel ya alerta y el chequeo dice qué arreglar.
      else if (!me.driver.tracking_required) await patchPresence({ location_mode: 'zone' });
    })();
  }, [me, liveRunning, liveBusy, patchPresence]);

  // En turno: vigilar el servicio de ubicación y reportar el estado del celular.
  const inShift = me?.driver.status !== undefined && me.driver.status !== 'offline';
  useEffect(() => {
    if (!authed || !inShift) {
      setDevice(null);
      return;
    }
    const check = async () => {
      setDevice(await reportDevice(liveState.mocked));
      // Watchdog: si el servicio se cayó (Android lo mató) y hay permiso, reiniciarlo.
      if (me?.driver.location_mode === 'live' && !(await isLiveRunning())) {
        const r = await startLive(me.settings.live_ping_seconds);
        setLiveRunning(r.ok);
      }
    };
    void check();
    const t = setInterval(() => void check(), 20_000);
    const sub = AppState.addEventListener('change', (st) => st === 'active' && void check());
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, [authed, inShift, me?.driver.location_mode, me?.settings.live_ping_seconds]);

  const startShift = async () => {
    if (!me) return;
    if (!me.consent.valid) {
      setScreen('consent');
      return;
    }
    setShiftBusy(true);
    try {
      const r = await beginShift(me.settings.live_ping_seconds);
      if (r.ok) {
        setShiftStartedAt(r.startedAt);
        setLiveRunning(true);
      } else {
        Alert.alert('No se pudo iniciar el turno', r.message);
      }
      await refresh();
    } finally {
      setShiftBusy(false);
    }
  };

  const endShift = async () => {
    setShiftBusy(true);
    try {
      await finishShift();
      setLiveRunning(false);
      setShiftStartedAt(null);
      setDevice(null);
      await refresh();
    } finally {
      setShiftBusy(false);
    }
  };

  useEffect(() => {
    if (inShift && shiftStartedAt === null) {
      const t = Date.now();
      setShiftStartedAt(t);
      void saveShiftStart(t);
    }
  }, [inShift, shiftStartedAt]);

  const toggleLive = async (on: boolean) => {
    if (!me) return;
    setLiveBusy(true);
    try {
      if (on) {
        if (!me.consent.valid) {
          setScreen('consent');
          return;
        }
        const r = await startLive(me.settings.live_ping_seconds);
        if (!r.ok) {
          Alert.alert('No se pudo activar', r.message);
          return;
        }
        setLiveRunning(true);
        await patchPresence({ location_mode: 'live' });
      } else {
        await stopLive();
        setLiveRunning(false);
        await patchPresence({ location_mode: 'zone' });
      }
    } finally {
      setLiveBusy(false);
    }
  };

  const transition = async (id: string, action: string, payload: Record<string, unknown> = {}) => {
    try {
      await api(`/requests/${id}/transition`, { body: { action, payload } });
    } catch (e) {
      Alert.alert('No se pudo', e instanceof Error ? e.message : String(e));
    }
    await refresh();
  };

  const acceptConsent = async () => {
    if (!me) return;
    await api('/driver/consent', { body: { version: me.consent.current_version, accepted: true } }).catch(() => {});
    await SecureStore.deleteItemAsync(CONSENT_DECLINED_KEY);
    await refresh();
    setScreen('home');
  };

  const declineConsent = async () => {
    await SecureStore.setItemAsync(CONSENT_DECLINED_KEY, '1');
    setScreen('home');
  };

  if (booting) {
    return (
      <View style={[s.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!authed) {
    return (
      <SafeAreaView style={s.screen}>
        <StatusBar style="dark" />
        <LoginScreen
          onLogin={async (email, password) => {
            const res = await api<{ token: string; profile: { role: string } }>('/auth/login', { body: { email, password } });
            if (res.profile.role !== 'driver') throw new Error('Esta app es para conductores. Los operadores usan el panel web.');
            await saveToken(res.token);
            setAuthed(true);
            await refresh();
          }}
        />
      </SafeAreaView>
    );
  }

  if (!me) {
    return (
      <View style={[s.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const offer = offers[0];
  const active = services.filter((r) => r.status === 'assigned' || r.status === 'picked_up');

  return (
    <SafeAreaView style={s.screen}>
      <StatusBar style="dark" />
      {offer ? (
        <OfferScreen
          offer={offer}
          onAccept={() => transition(offer.id, 'accept')}
          onReject={() => transition(offer.id, 'reject', { reason: 'rejected' })}
        />
      ) : screen === 'consent' ? (
        <ConsentScreen required={me.driver.tracking_required} onAccept={acceptConsent} onDecline={declineConsent} />
      ) : screen === 'history' ? (
        <HistoryScreen services={services} onClose={() => setScreen('home')} />
      ) : screen === 'battery' ? (
        <BatteryGuideScreen onClose={() => setScreen('home')} />
      ) : (
        <HomeScreen
          driver={me.driver}
          sectors={me.sectors}
          active={active}
          online={online}
          lastSyncAt={lastSyncAt}
          live={{ running: liveRunning, lastSentAt: liveState.lastSentAt, failures: liveState.failures }}
          shiftStartedAt={shiftStartedAt}
          device={device}
          busy={shiftBusy || liveBusy}
          onStartShift={() => void startShift()}
          onEndShift={() => void endShift()}
          onStatus={(st: DriverStatus) => void patchPresence({ status: st })}
          onSector={(id) => void patchPresence({ sector_zone_id: id, location_mode: 'zone' })}
          onConfirmZone={() => void patchPresence({ confirm: true })}
          onToggleLive={(on) => void toggleLive(on)}
          onServiceAction={(r, action) => transition(r.id, action)}
          onHistory={() => setScreen('history')}
          onBattery={() => setScreen('battery')}
          onLogout={() => void logout()}
        />
      )}
    </SafeAreaView>
  );
}
