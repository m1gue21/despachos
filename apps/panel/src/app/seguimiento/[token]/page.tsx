'use client';

import { SERVICE_LABEL, type ServiceType, VEHICLE_ICON, VEHICLE_LABEL, type VehicleType } from '@despacho/shared';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Logo } from '@/components/Logo';
import { RatingBox } from '@/components/RatingBox';
import { TrackingMap } from '@/components/TrackingMap';
import { cn } from '@/components/ui';
import { API_URL } from '@/lib/api';

interface Tracking {
  status: 'created' | 'offered' | 'assigned' | 'picked_up' | 'completed' | 'cancelled';
  service: ServiceType;
  city: string;
  pickup: { text: string; lat: number | null; lng: number | null };
  dropoff: { text: string | null; lat: number | null; lng: number | null } | null;
  driver: { name: string; vehicle: VehicleType; plate: string | null; sector: string | null } | null;
  driver_position: { lat: number; lng: number; updated_at: string } | null;
  timeline: { created_at: string; assigned_at: string | null; picked_up_at: string | null; completed_at: string | null };
  rating: { stars: number } | null;
  can_rate: boolean;
  expires_at: string;
}

const pt = (p: { lat: number | null; lng: number | null } | null | undefined) =>
  p && p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng } : null;

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const h =
    Math.sin(toRad(b.lat - a.lat) / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(toRad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '');

export default function TrackingPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<Tracking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const res = await fetch(`${API_URL}/track/${encodeURIComponent(token)}`);
        const body = await res.json().catch(() => null);
        if (stop) return;
        if (!res.ok) {
          setError(body?.error?.message ?? 'No se pudo cargar el seguimiento');
          if (res.status === 404) setData(null);
          return;
        }
        setData(body);
        setError(null);
        setUpdatedAt(Date.now());
      } catch {
        if (!stop) setError('Sin conexión. Reintentando…');
      }
    };
    void load();
    const t = setInterval(() => !document.hidden && void load(), 10_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [token]);

  const view = useMemo(() => {
    if (!data) return null;
    const ride = data.service === 'ride';
    const steps = [
      { key: 'created', label: 'Pedido recibido', at: data.timeline.created_at },
      { key: 'assigned', label: ride ? 'Conductor asignado' : 'Mensajero asignado', at: data.timeline.assigned_at },
      { key: 'picked_up', label: ride ? 'En camino al destino' : 'Recogido, en camino', at: data.timeline.picked_up_at },
      { key: 'completed', label: ride ? 'Llegaste' : 'Entregado', at: data.timeline.completed_at },
    ];
    const order = ['created', 'assigned', 'picked_up', 'completed'];
    const current = data.status === 'offered' ? 0 : Math.max(0, order.indexOf(data.status));
    const pickup = pt(data.pickup);
    const dropoff = pt(data.dropoff);
    const driver = data.driver_position ? { lat: data.driver_position.lat, lng: data.driver_position.lng } : null;
    const target: 'pickup' | 'dropoff' | null = data.status === 'assigned' ? 'pickup' : data.status === 'picked_up' ? 'dropoff' : null;
    const to = target === 'pickup' ? pickup : target === 'dropoff' ? dropoff : null;
    const dist = driver && to ? km(driver, to) : null;
    // Estimado grueso: 20 km/h en ciudad, mínimo 2 min.
    const eta = dist !== null ? Math.max(2, Math.round((dist / 20) * 60)) : null;
    const headline =
      data.status === 'cancelled'
        ? 'El servicio fue cancelado'
        : data.status === 'completed'
          ? ride
            ? 'Llegaste a tu destino'
            : '¡Tu pedido fue entregado!'
          : data.status === 'picked_up'
            ? ride
              ? 'Vas en camino'
              : 'Tu pedido va en camino'
            : data.status === 'assigned'
              ? `${data.driver?.name ?? 'Tu mensajero'} va a recoger${ride ? 'te' : ' tu pedido'}`
              : 'Buscando quién lo lleve…';
    return { steps, current, pickup, dropoff, driver, target, dist, eta, headline };
  }, [data]);

  if (!data || !view) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div className="space-y-2">
          <p className="text-lg font-semibold">{error ? 'Seguimiento no disponible' : 'Cargando seguimiento…'}</p>
          {error && <p className="text-sm text-muted-foreground">{error}</p>}
        </div>
      </div>
    );
  }

  const closed = data.status === 'completed' || data.status === 'cancelled';

  return (
    <div className="flex h-full flex-col lg:flex-row-reverse">
      <div className="relative min-h-[45%] flex-1">
        <TrackingMap
          pickup={view.pickup}
          dropoff={view.dropoff}
          driver={view.driver}
          driverIcon={data.driver ? VEHICLE_ICON[data.driver.vehicle] : '🛵'}
          target={view.target}
        />
        {error && <div className="absolute left-3 right-3 top-3 rounded-md bg-orange-50 px-3 py-2 text-sm text-warn shadow">{error}</div>}
      </div>
      <div className="max-h-[55%] overflow-y-auto rounded-t-2xl border-t border-border bg-card p-5 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] lg:max-h-none lg:w-[26rem] lg:shrink-0 lg:rounded-none lg:border-r lg:border-t-0 lg:shadow-none">
        <div className="mb-3 flex items-center justify-between">
          <Logo className="text-sm" />
          <span className="text-xs text-muted-foreground">Seguimiento</span>
        </div>
        <p className="text-xs font-semibold uppercase text-muted-foreground">
          {SERVICE_LABEL[data.service]} · {data.city}
        </p>
        <h1 className="mt-1 text-xl font-bold">{view.headline}</h1>
        {view.eta !== null && !closed && (
          <p className="text-sm text-muted-foreground">
            A unos {view.dist! < 1 ? `${Math.round(view.dist! * 1000)} m` : `${view.dist!.toFixed(1)} km`} · aprox. {view.eta} min
          </p>
        )}
        {data.driver && !closed && !data.driver_position && (
          <p className="text-sm text-muted-foreground">
            Ubicación exacta no disponible por ahora{data.driver.sector ? `; última zona: ${data.driver.sector}` : ''}.
          </p>
        )}

        {data.driver && (
          <div className="mt-4 flex items-center gap-3 rounded-xl bg-muted p-3">
            <span className="text-3xl">{VEHICLE_ICON[data.driver.vehicle]}</span>
            <div>
              <p className="font-semibold">{data.driver.name}</p>
              <p className="text-sm text-muted-foreground">
                {VEHICLE_LABEL[data.driver.vehicle]}
                {data.driver.plate && ` · placa ${data.driver.plate}`}
              </p>
            </div>
          </div>
        )}

        {data.status === 'completed' && data.driver && (
          <RatingBox token={token} driverName={data.driver.name} canRate={data.can_rate} existing={data.rating?.stars ?? null} />
        )}

        {data.status !== 'cancelled' && (
          <ol className="mt-4 space-y-3">
            {view.steps.map((s, i) => (
              <li key={s.key} className="flex items-center gap-3">
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                    i < view.current || (i === view.current && closed)
                      ? 'bg-ok text-white'
                      : i === view.current
                        ? 'bg-primary text-white'
                        : 'bg-muted text-muted-foreground',
                  )}
                >
                  {i < view.current || (i === view.current && closed) ? '✓' : i + 1}
                </span>
                <span className={cn('flex-1', i > view.current && 'text-muted-foreground')}>{s.label}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{hhmm(s.at)}</span>
              </li>
            ))}
          </ol>
        )}

        <div className="mt-4 space-y-1 text-sm">
          <p>
            <span className="font-semibold text-ok">A</span> {data.pickup.text}
          </p>
          {data.dropoff?.text && (
            <p>
              <span className="font-semibold text-danger">B</span> {data.dropoff.text}
            </p>
          )}
        </div>
        <p className="mt-4 text-[11px] text-muted-foreground">
          {updatedAt && `Actualizado ${hhmm(new Date(updatedAt).toISOString())} · `}Enlace temporal (vence a las {hhmm(data.expires_at)}). La línea del mapa es la distancia en línea recta, no la ruta por calles.
        </p>
      </div>
    </div>
  );
}
