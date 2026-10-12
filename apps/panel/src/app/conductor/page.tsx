'use client';

import {
  DRIVER_STATUS_LABEL,
  type DriverOffer,
  type DriverRow,
  type DriverStatus,
  REQUEST_STATUS_LABEL,
  type RequestRow,
  SERVICE_LABEL,
} from '@despacho/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActiveService } from '@/components/driver/ActiveService';
import { Consent } from '@/components/driver/Consent';
import { DriverLogin } from '@/components/driver/DriverLogin';
import { OfferCard } from '@/components/driver/OfferCard';
import { Button, cn } from '@/components/ui';
import { ApiError, driverClient } from '@/lib/api';
import { LOCATION_SILENCE_MS, flushPending, isLiveRunning, isSecureForGeo, live, startLive, stopLive } from '@/lib/driverLive';
import { useDriverRealtime } from '@/lib/driverRealtime';
import { beep } from '@/lib/sound';
import { useToast } from '@/lib/toast';

interface DriverMe {
  driver: DriverRow;
  sectors: { id: string; name: string }[];
  settings: { live_ping_seconds: number; offer_timeout_seconds: number; zone_stale_minutes: number };
  consent: { consent_at: string | null; consent_version: string | null; current_version: string; valid: boolean };
}

type Screen = 'home' | 'consent' | 'history' | 'tips';
const CONSENT_DECLINED_KEY = 'despacho.driver.consentDeclined';
const STATUS_STYLE: Record<DriverStatus, { on: string; off: string }> = {
  available: { on: 'bg-ok text-white border-ok', off: 'border-ok text-ok' },
  busy: { on: 'bg-warn text-white border-warn', off: 'border-warn text-warn' },
  offline: { on: 'bg-idle text-white border-idle', off: 'border-idle text-idle' },
};

const ago = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `hace ${s} s` : `hace ${Math.round(s / 60)} min`;
};
const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '');

export default function DriverPage() {
  const toast = useToast();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [me, setMe] = useState<DriverMe | null>(null);
  const [offers, setOffers] = useState<DriverOffer[]>([]);
  const [services, setServices] = useState<RequestRow[]>([]);
  const [screen, setScreen] = useState<Screen>('home');
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [liveBusy, setLiveBusy] = useState(false);
  const [wasHidden, setWasHidden] = useState(false);
  const [, force] = useState(0);
  const seenOffers = useRef(new Set<string>());

  const logout = useCallback(() => {
    stopLive();
    driverClient.setToken(null);
    setAuthed(false);
    setMe(null);
  }, []);

  useEffect(() => {
    setAuthed(Boolean(driverClient.getToken()));
    const handler = () => logout();
    driverClient.onUnauthorized.addEventListener('401', handler);
    return () => driverClient.onUnauthorized.removeEventListener('401', handler);
  }, [logout]);

  const refresh = useCallback(async () => {
    try {
      const [m, o, sv] = await Promise.all([
        driverClient.request<DriverMe>('/driver/me'),
        driverClient.request<DriverOffer[]>('/driver/offers'),
        driverClient.request<RequestRow[]>('/driver/services'),
      ]);
      setMe(m);
      setOffers(o);
      setServices(sv);
      setLastSyncAt(Date.now());
      for (const off of o) {
        if (seenOffers.current.has(off.id)) continue;
        seenOffers.current.add(off.id);
        beep('new');
        navigator.vibrate?.([300, 150, 300, 150, 300]);
        if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
          new Notification('Nuevo servicio', { body: off.pickup_text, tag: off.id });
        }
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        toast(e.message, 'error');
        logout();
      }
    }
  }, [logout, toast]);

  useEffect(() => {
    if (authed) void refresh();
  }, [authed, refresh]);

  // Primera vez: consentimiento (si no lo aceptó ni lo rechazó en este navegador).
  useEffect(() => {
    if (!me || me.consent.valid) return;
    try {
      if (!localStorage.getItem(CONSENT_DECLINED_KEY)) setScreen('consent');
    } catch {
      setScreen('consent');
    }
  }, [me]);

  // Tiempo real + consulta de respaldo cada 20 s.
  const online = useDriverRealtime(Boolean(authed), () => void refresh());
  useEffect(() => {
    if (!authed) return;
    const t = setInterval(() => !document.hidden && void refresh(), 20_000);
    const onVis = () => {
      if (document.hidden) {
        if (isLiveRunning()) setWasHidden(true);
      } else void refresh();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [authed, refresh]);

  // Indicadores de envío y reintento del ping pendiente.
  useEffect(() => {
    const fn = () => force((x) => x + 1);
    live.listeners.add(fn);
    const t = setInterval(() => {
      void flushPending();
      fn();
    }, 10_000);
    return () => {
      live.listeners.delete(fn);
      clearInterval(t);
    };
  }, []);

  const patchPresence = useCallback(
    async (body: Record<string, unknown>) => {
      try {
        const driver = await driverClient.request<DriverRow>('/driver/presence', { method: 'PATCH', body });
        setMe((m) => (m ? { ...m, driver } : m));
      } catch (e) {
        toast(e instanceof Error ? e.message : 'No se pudo actualizar', 'error');
      }
    },
    [toast],
  );

  // Si el servidor dice "en vivo" pero aquí no corre (recargó la página), retomar.
  useEffect(() => {
    if (!me || me.driver.location_mode !== 'live' || isLiveRunning() || liveBusy) return;
    void (async () => {
      const r = await startLive();
      if (!r.ok) {
        await patchPresence({ location_mode: 'zone' });
        toast(r.message, 'error');
      }
      force((x) => x + 1);
    })();
  }, [me, liveBusy, patchPresence, toast]);

  // Sin GPS durante un rato estando en vivo → volver a zona y avisar.
  useEffect(() => {
    if (me?.driver.location_mode !== 'live') return;
    const t = setInterval(async () => {
      const last = Math.max(live.lastFixAt, live.startedAt);
      if (isLiveRunning() && Date.now() - last > LOCATION_SILENCE_MS) {
        stopLive();
        await patchPresence({ location_mode: 'zone' });
        beep('alert');
        toast('Dejamos de recibir tu GPS: quedaste por sector', 'error');
      }
    }, 30_000);
    return () => clearInterval(t);
  }, [me?.driver.location_mode, patchPresence, toast]);

  const toggleLive = async (on: boolean) => {
    if (!me) return;
    setLiveBusy(true);
    try {
      if (on) {
        if (!me.consent.valid) {
          setScreen('consent');
          return;
        }
        const r = await startLive();
        if (!r.ok) {
          toast(r.message, 'error');
          return;
        }
        await patchPresence({ location_mode: 'live' });
        if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission();
      } else {
        stopLive();
        await patchPresence({ location_mode: 'zone' });
      }
    } finally {
      setLiveBusy(false);
    }
  };

  const transition = async (id: string, action: string, payload: Record<string, unknown> = {}) => {
    try {
      await driverClient.request(`/requests/${id}/transition`, { body: { action, payload } });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo', 'error');
    }
    await refresh();
  };

  const acceptConsent = async () => {
    if (!me) return;
    await driverClient.request('/driver/consent', { body: { version: me.consent.current_version, accepted: true } }).catch(() => {});
    try {
      localStorage.removeItem(CONSENT_DECLINED_KEY);
    } catch {}
    await refresh();
    setScreen('home');
  };

  const declineConsent = () => {
    try {
      localStorage.setItem(CONSENT_DECLINED_KEY, '1');
    } catch {}
    setScreen('home');
  };

  if (authed === null) return null;
  if (!authed) {
    return (
      <div className="h-full overflow-y-auto">
        <DriverLogin onLogged={() => setAuthed(true)} />
      </div>
    );
  }
  if (!me) return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Cargando…</div>;

  const d = me.driver;
  const isLive = d.location_mode === 'live';
  const active = services.filter((r) => r.status === 'assigned' || r.status === 'picked_up');
  const done = services.filter((r) => r.status === 'completed' || r.status === 'cancelled');
  const offer = offers[0];
  const now = Date.now();

  return (
    <div className="h-full overflow-y-auto bg-background">
      {offer && (
        <OfferCard
          key={offer.id}
          offer={offer}
          onAccept={() => transition(offer.id, 'accept')}
          onReject={() => transition(offer.id, 'reject', { reason: 'rejected' })}
        />
      )}

      {screen === 'consent' ? (
        <Consent onAccept={acceptConsent} onDecline={declineConsent} />
      ) : screen === 'history' ? (
        <div className="mx-auto max-w-md space-y-3 p-4">
          <h1 className="text-2xl font-bold">Servicios de hoy</h1>
          <p className="text-sm text-muted-foreground">
            {done.filter((r) => r.status === 'completed').length} completados · {done.filter((r) => r.status === 'cancelled').length} cancelados
          </p>
          {done.length === 0 && <p className="text-sm text-muted-foreground">Todavía no has cerrado servicios hoy.</p>}
          {done.map((r) => (
            <div key={r.id} className="rounded-xl border border-border bg-card p-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                {SERVICE_LABEL[r.service]} · {REQUEST_STATUS_LABEL[r.status]} · {hhmm(r.completed_at ?? r.assigned_at)}
              </p>
              <p>
                {r.pickup_text}
                {r.dropoff_text && ` → ${r.dropoff_text}`}
              </p>
            </div>
          ))}
          <Button variant="outline" className="h-12 w-full" onClick={() => setScreen('home')}>
            Volver
          </Button>
        </div>
      ) : screen === 'tips' ? (
        <div className="mx-auto max-w-md space-y-3 p-4">
          <h1 className="text-2xl font-bold">Que no se corte la ubicación</h1>
          <p className="text-sm text-muted-foreground">
            El navegador solo envía tu ubicación mientras esta página está abierta y la pantalla encendida.
          </p>
          {[
            ['Deja esta página abierta', 'Pon el celular en el soporte con la página a la vista. Si cambias de app o bloqueas la pantalla, la ubicación se pausa.'],
            ['Pantalla encendida', 'Al activar "en vivo" pedimos mantener la pantalla encendida. Si tu celular la apaga igual, sube el tiempo de suspensión en Ajustes → Pantalla.'],
            ['Agrégala a la pantalla de inicio', 'En Chrome: menú ⋮ → "Agregar a la pantalla principal". Se abre como una app y es más difícil cerrarla por error.'],
            ['Ahorro de batería', 'Si usas ahorro de batería extremo, desactívalo mientras trabajas o excluye Chrome de la optimización de batería.'],
            ['Para Google Maps o Waze', 'Si abres la navegación, tu ubicación aquí se pausa. Vuelve a esta página apenas puedas; el operador verá tu último sector.'],
          ].map(([t, b]) => (
            <div key={t} className="rounded-xl border border-border bg-card p-3">
              <p className="font-semibold">{t}</p>
              <p className="text-sm">{b}</p>
            </div>
          ))}
          <Button variant="outline" className="h-12 w-full" onClick={() => setScreen('home')}>
            Listo
          </Button>
        </div>
      ) : (
        <div className="mx-auto max-w-md space-y-3 p-4 pb-10">
          <header className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">{d.display_name}</h1>
              {lastSyncAt && <p className="text-xs text-muted-foreground">Sincronizado {ago(now - lastSyncAt)}</p>}
            </div>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn('h-2.5 w-2.5 rounded-full', online ? 'bg-ok' : 'animate-pulse bg-danger')} />
              {online ? 'Conectado' : 'Sin conexión'}
            </span>
          </header>

          {isLive && wasHidden && (
            <div className="rounded-lg bg-orange-50 p-3 text-sm text-warn">
              La ubicación se pausó mientras la página estuvo oculta. Ya se reanudó.{' '}
              <button className="underline" onClick={() => setWasHidden(false)}>
                Entendido
              </button>
            </div>
          )}

          {active.map((r) => (
            <ActiveService key={r.id} r={r} onAction={(a) => transition(r.id, a)} notify={toast} />
          ))}

          <section className="space-y-2 rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Mi estado</p>
            {(['available', 'busy', 'offline'] as const).map((st) => (
              <button
                key={st}
                onClick={() => void patchPresence({ status: st })}
                aria-pressed={d.status === st}
                className={cn('h-14 w-full rounded-lg border-2 text-lg font-bold', d.status === st ? STATUS_STYLE[st].on : STATUS_STYLE[st].off)}
              >
                {DRIVER_STATUS_LABEL[st]}
              </button>
            ))}
          </section>

          <section className="space-y-3 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Mi sector</p>
              {d.is_stale && d.status !== 'offline' && <span className="text-sm font-semibold text-warn">Desactualizado</span>}
            </div>
            <p className="text-lg font-semibold">{d.sector_name ?? 'Sin sector'}</p>
            {isLive ? (
              <p className="text-sm text-muted-foreground">En vivo el sector se calcula solo con tu ubicación.</p>
            ) : (
              <>
                <Button className="h-12 w-full text-base" onClick={() => void patchPresence({ confirm: true })} disabled={!d.sector_zone_id}>
                  Sigo aquí
                </Button>
                <div className="flex flex-wrap gap-2">
                  {me.sectors.map((z) => (
                    <button
                      key={z.id}
                      onClick={() => void patchPresence({ sector_zone_id: z.id, location_mode: 'zone' })}
                      className={cn(
                        'rounded-full border px-3 py-2 text-[15px]',
                        d.sector_zone_id === z.id ? 'border-primary bg-blue-100' : 'border-border bg-card',
                      )}
                    >
                      {z.name}
                    </button>
                  ))}
                  {me.sectors.length === 0 && <p className="text-sm text-muted-foreground">Tu ciudad aún no tiene sectores.</p>}
                </div>
              </>
            )}
          </section>

          <section className="space-y-3 rounded-xl border border-border bg-card p-4">
            <label className="flex items-center justify-between gap-3">
              <span>
                <span className="block font-semibold">Compartir mi ubicación en vivo</span>
                <span className="block text-sm text-muted-foreground">
                  {isLive
                    ? live.error
                      ? live.error
                      : live.lastSentAt
                        ? `Enviada ${ago(now - live.lastSentAt)}${live.failures ? ` · ${live.failures} reintento(s)` : ''}${live.wakeLock ? ' · pantalla encendida' : ''}`
                        : 'Esperando GPS…'
                    : 'Apagado: el operador ve tu sector.'}
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                className="h-7 w-12 shrink-0 accent-primary"
                checked={isLive}
                disabled={liveBusy}
                onChange={(e) => void toggleLive(e.target.checked)}
              />
            </label>
            {!isSecureForGeo() && (
              <p className="rounded-lg bg-orange-50 p-2 text-sm text-warn">
                Esta página no es segura (sin https): el navegador no dará la ubicación. Usa la dirección con https.
              </p>
            )}
            <button className="text-sm text-primary underline" onClick={() => setScreen('tips')}>
              Cómo evitar que se corte
            </button>
          </section>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="h-12" onClick={() => setScreen('history')}>
              Servicios de hoy
            </Button>
            <Button variant="outline" className="h-12 text-muted-foreground" onClick={logout}>
              Salir
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
