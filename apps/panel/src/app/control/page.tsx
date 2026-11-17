'use client';

import {
  ALERT_REASON_HINT,
  ALERT_REASON_LABEL,
  DRIVER_STATUS_LABEL,
  type DriverRow,
  type RouteResponse,
  type TrackingAlert,
  VEHICLE_ICON,
} from '@despacho/shared';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { DRIVER_DOT } from '@/components/DriverPanel';
import { RouteMap } from '@/components/RouteMap';
import { Badge, Button, Empty, ErrorText, cn } from '@/components/ui';
import { dateTime, dayLabel, duration, elapsed, shiftDay, time } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/useApi';

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'bad' }) {
  return (
    <div className="rounded-lg bg-muted px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn('text-lg font-semibold tabular-nums', tone === 'bad' && 'text-danger')}>{value}</p>
    </div>
  );
}

export default function ControlPage() {
  const { cityId } = useSession();
  const [selected, setSelected] = useState<string | null>(null);
  const [onlyRequired, setOnlyRequired] = useState(true);

  const drivers = useApi<DriverRow[]>(cityId ? `/drivers?city=${cityId}` : null, {
    tables: ['driver_presence', 'drivers', 'tracking_alerts'],
    city: cityId,
    intervalMs: 15_000,
  });
  const alerts = useApi<TrackingAlert[]>(cityId ? `/alerts?city=${cityId}&days=7` : null, {
    tables: ['tracking_alerts'],
    city: cityId,
    intervalMs: 30_000,
  });
  const open = (alerts.data ?? []).filter((a) => !a.resolved_at);

  const list = useMemo(
    () =>
      (drivers.data ?? [])
        .filter((d) => d.active && (!onlyRequired || d.tracking_required || d.status !== 'offline'))
        .sort(
          (a, b) =>
            Number(Boolean(b.alert_reason)) - Number(Boolean(a.alert_reason)) ||
            Number(b.status !== 'offline') - Number(a.status !== 'offline') ||
            a.display_name.localeCompare(b.display_name),
        ),
    [drivers.data, onlyRequired],
  );
  const current = (drivers.data ?? []).find((d) => d.id === selected) ?? null;

  return (
    <AppShell>
      <div className="h-full overflow-y-auto lg:grid lg:grid-cols-[24rem_minmax(0,1fr)] lg:overflow-hidden">
        <aside className="border-b border-border bg-card lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <div className="space-y-3 p-4">
            <h1 className="text-lg font-semibold">Control de repartidores</h1>
            {drivers.error && <ErrorText>{drivers.error}</ErrorText>}

            {open.length > 0 ? (
              <section aria-label="Alertas abiertas" className="space-y-2">
                <p className="text-xs font-semibold uppercase text-danger">⚠ {open.length} alerta{open.length > 1 ? 's' : ''} abierta{open.length > 1 ? 's' : ''}</p>
                {open.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setSelected(a.driver_id)}
                    className="w-full rounded-lg border border-danger/30 bg-red-50 p-2.5 text-left hover:bg-red-100"
                  >
                    <p className="text-sm font-semibold">
                      {a.driver_name} · <span className="text-danger">{ALERT_REASON_LABEL[a.reason]}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Hace {elapsed(a.opened_at)} · {ALERT_REASON_HINT[a.reason]}
                    </p>
                  </button>
                ))}
              </section>
            ) : (
              <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-ok">✓ Todos los conductores en turno tienen señal.</p>
            )}

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={onlyRequired} onChange={(e) => setOnlyRequired(e.target.checked)} />
              Solo con ubicación obligatoria o en turno
            </label>
          </div>
          <ul className="border-t border-border">
            {list.length === 0 && <Empty>Sin conductores con ese filtro.</Empty>}
            {list.map((d) => (
              <li key={d.id}>
                <button
                  onClick={() => setSelected(d.id)}
                  className={cn('w-full border-b border-border px-4 py-2.5 text-left hover:bg-muted', selected === d.id && 'bg-primary/10')}
                >
                  <div className="flex items-center gap-2">
                    <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', DRIVER_DOT[d.status])} />
                    <span className="truncate text-sm font-medium">
                      {VEHICLE_ICON[d.vehicle]} {d.display_name}
                    </span>
                    {d.alert_reason ? (
                      <Badge className="ml-auto shrink-0 bg-red-100 text-danger">⚠ {ALERT_REASON_LABEL[d.alert_reason]}</Badge>
                    ) : d.status !== 'offline' && d.location_mode === 'live' && !d.is_stale ? (
                      <Badge className="ml-auto shrink-0 bg-green-100 text-ok">En línea</Badge>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {DRIVER_STATUS_LABEL[d.status]}
                    {d.tracking_required && ' · ubicación obligatoria'}
                    {d.last_seen_at && d.status !== 'offline' && ` · señal hace ${elapsed(d.last_seen_at)}`}
                    {d.device && d.device_at && Date.now() - new Date(d.device_at).getTime() < 5 * 60_000 && d.device.battery !== null && ` · 🔋 ${Math.round(d.device.battery)} %`}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="flex min-h-[32rem] flex-col lg:min-h-0 lg:overflow-hidden">
          {current && cityId ? (
            <DriverRoute key={current.id} driver={current} />
          ) : (
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              <h2 className="text-base font-semibold">Alertas de los últimos 7 días</h2>
              <p className="mb-3 text-sm text-muted-foreground">Elige un conductor a la izquierda para ver su recorrido del día.</p>
              <AlertTable alerts={alerts.data ?? []} onPick={setSelected} />
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function AlertTable({ alerts, onPick }: { alerts: TrackingAlert[]; onPick?: (driverId: string) => void }) {
  if (alerts.length === 0) return <Empty>Sin alertas en este periodo.</Empty>;
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full min-w-[34rem] text-sm">
        <thead className="bg-muted text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Conductor</th>
            <th className="px-3 py-2">Causa</th>
            <th className="px-3 py-2">Desde</th>
            <th className="px-3 py-2 text-right">Duró</th>
            <th className="px-3 py-2">Estado</th>
          </tr>
        </thead>
        <tbody>
          {alerts.map((a) => (
            <tr key={a.id} className={cn('border-t border-border', onPick && 'cursor-pointer hover:bg-muted')} onClick={() => onPick?.(a.driver_id)}>
              <td className="px-3 py-2 font-medium">{a.driver_name}</td>
              <td className="px-3 py-2">{ALERT_REASON_LABEL[a.reason]}</td>
              <td className="px-3 py-2 tabular-nums">{dateTime(a.opened_at)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{duration(a.minutes)}</td>
              <td className="px-3 py-2">
                {a.resolved_at ? (
                  <span className="text-muted-foreground">{a.resolved_by === 'turno_terminado' ? 'Terminó el turno' : 'Recuperada'}</span>
                ) : (
                  <Badge className="bg-red-100 text-danger">Abierta</Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DriverRoute({ driver }: { driver: DriverRow }) {
  const [date, setDate] = useState(todayStr());
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const isToday = date === todayStr();
  const route = useApi<RouteResponse>(`/drivers/${driver.id}/route?date=${date}`, {
    tables: ['driver_presence'],
    id: driver.id,
    intervalMs: isToday ? 30_000 : undefined,
  });
  const r = route.data;
  const points = r?.points ?? [];

  // Al cambiar de día, el cursor vuelve al principio.
  useEffect(() => {
    setCursor(0);
    setPlaying(false);
  }, [date]);

  // Reproducción: recorre todo el día en unos 12 s.
  useEffect(() => {
    if (!playing || points.length < 2) return;
    const step = Math.max(1, Math.ceil(points.length / 90));
    const t = setInterval(() => {
      setCursor((c) => {
        if (c + step >= points.length - 1) {
          setPlaying(false);
          return points.length - 1;
        }
        return c + step;
      });
    }, 130);
    return () => clearInterval(t);
  }, [playing, points.length]);

  const here = points[Math.min(cursor, points.length - 1)];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-3">
        <div className="mr-auto">
          <h2 className="text-base font-semibold">
            {VEHICLE_ICON[driver.vehicle]} {driver.display_name}
          </h2>
          {driver.alert_reason && (
            <p className="text-xs text-danger">
              ⚠ {ALERT_REASON_LABEL[driver.alert_reason]}: {ALERT_REASON_HINT[driver.alert_reason]}
            </p>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={() => setDate(shiftDay(date, -1))} aria-label="Día anterior">
          ←
        </Button>
        <input
          type="date"
          value={date}
          max={todayStr()}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="h-8 rounded-md border border-border bg-card px-2 text-sm"
          aria-label="Día"
        />
        <Button size="sm" variant="outline" disabled={isToday} onClick={() => setDate(shiftDay(date, 1))} aria-label="Día siguiente">
          →
        </Button>
        <a className="text-xs text-primary underline" href={`tel:${driver.phone}`}>
          Llamar
        </a>
      </div>

      {route.error && <ErrorText>{route.error}</ErrorText>}

      <div className="grid grid-cols-2 gap-2 px-4 py-3 sm:grid-cols-4">
        <Stat label="Distancia" value={r ? `${r.km} km` : '—'} />
        <Stat label="Turno" value={r ? duration(r.shift_minutes) : '—'} />
        <Stat label="Sin señal" value={r ? duration(r.silent_minutes) : '—'} tone={r && r.silent_minutes > 0 ? 'bad' : undefined} />
        <Stat label="Puntos" value={r ? String(points.length) : '—'} />
      </div>

      <div className="relative min-h-[18rem] flex-1">
        {points.length === 0 && !route.loading ? (
          <div className="flex h-full items-center justify-center bg-muted p-6 text-center text-sm text-muted-foreground">
            No hay ubicación guardada para {dayLabel(date)}.
          </div>
        ) : (
          <RouteMap points={points} cursor={cursor} />
        )}
      </div>

      {points.length > 1 && (
        <div className="flex items-center gap-3 border-t border-border bg-card px-4 py-2.5">
          <Button size="sm" onClick={() => (cursor >= points.length - 1 ? (setCursor(0), setPlaying(true)) : setPlaying((p) => !p))}>
            {playing ? 'Pausar' : cursor >= points.length - 1 ? 'Repetir' : 'Reproducir'}
          </Button>
          <input
            type="range"
            min={0}
            max={points.length - 1}
            value={Math.min(cursor, points.length - 1)}
            onChange={(e) => {
              setPlaying(false);
              setCursor(Number(e.target.value));
            }}
            className="min-w-0 flex-1 accent-primary"
            aria-label="Momento del recorrido"
          />
          <span className="w-20 shrink-0 whitespace-nowrap text-right text-sm tabular-nums">{here ? time(here.t) : ''}</span>
        </div>
      )}

      {r && (r.shifts.length > 0 || r.alerts.length > 0) && (
        <div className="max-h-44 space-y-2 overflow-y-auto border-t border-border bg-card px-4 py-3 text-sm">
          {r.shifts.length > 0 && (
            <p>
              <span className="font-semibold">Turnos: </span>
              {r.shifts.map((s) => `${time(s.started_at)}–${s.ended_at ? time(s.ended_at) : 'en curso'}`).join(' · ')}
            </p>
          )}
          {r.alerts.length > 0 && <AlertTable alerts={r.alerts} />}
        </div>
      )}
    </div>
  );
}
