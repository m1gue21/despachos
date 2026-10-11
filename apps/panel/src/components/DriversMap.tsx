'use client';

import {
  DRIVER_STATUSES,
  DRIVER_STATUS_LABEL,
  type DriverRow,
  type DriverStatus,
  LOCATION_MODE_LABEL,
  VEHICLE_ICON,
  type Zone,
} from '@despacho/shared';
import { useMemo, useState } from 'react';
import { elapsed } from '@/lib/format';
import { DRIVER_DOT } from './DriverPanel';
import { MapView } from './MapView';
import { Badge, Empty, cn } from './ui';

// Dónde se dibuja un conductor: posición en vivo, o centro de su sector.
function mapPoint(d: DriverRow): { lat: number; lng: number } | null {
  if (d.location_mode === 'live' && d.lat != null && d.lng != null) return { lat: d.lat, lng: d.lng };
  if (d.sector_lat != null && d.sector_lng != null) return { lat: d.sector_lat, lng: d.sector_lng };
  return null;
}

export function DriversMap({ drivers, sectors, city }: { drivers: DriverRow[]; sectors: Zone[]; city: Zone | null }) {
  const [status, setStatus] = useState<DriverStatus | 'all'>('all');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lng: number; key: number } | null>(null);

  const active = drivers.filter((d) => d.active);
  const visible = useMemo(
    () =>
      active
        .filter((d) => status === 'all' || d.status === status)
        .filter((d) => !q || d.display_name.toLowerCase().includes(q.toLowerCase())),
    [active, status, q],
  );
  // En el mapa no se dibujan los desconectados (MapView los omite).
  const onMap = visible.filter((d) => d.status !== 'offline' && mapPoint(d));
  const counts = Object.fromEntries(DRIVER_STATUSES.map((s) => [s, active.filter((d) => d.status === s).length]));

  const select = (d: DriverRow) => {
    setSelected(d.id);
    const p = mapPoint(d);
    if (p) setFocus({ ...p, key: Date.now() });
  };

  return (
    <div className="grid h-full grid-cols-[1fr_22rem]">
      <section className="relative min-h-0">
        <MapView
          city={city}
          sectors={sectors}
          drivers={visible}
          requests={[]}
          focus={focus}
          selectedDriverId={selected}
          onSelectDriver={(id) => setSelected(id)}
        />
        <div className="absolute left-3 top-3 flex gap-3 rounded-md bg-card/95 px-3 py-2 text-xs shadow">
          {(['available', 'busy'] as const).map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className={cn('h-2.5 w-2.5 rounded-full', DRIVER_DOT[s])} />
              {DRIVER_STATUS_LABEL[s]}
            </span>
          ))}
          <span className="text-muted-foreground">Pin = en vivo · Burbuja = por sector · ⚠ = desactualizado</span>
        </div>
      </section>

      <aside className="flex min-h-0 flex-col border-l border-border bg-card">
        <div className="space-y-2 border-b border-border p-3">
          <div className="flex gap-1">
            {(['all', ...DRIVER_STATUSES] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={cn(
                  'flex-1 rounded-md px-1.5 py-1 text-xs font-medium',
                  status === s ? 'bg-foreground text-white' : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {s === 'all' ? 'Todos' : DRIVER_STATUS_LABEL[s]} {s !== 'all' && <span className="opacity-70">{counts[s]}</span>}
              </button>
            ))}
          </div>
          <input
            className="h-8 w-full rounded-md border border-border px-2 text-sm"
            placeholder="Buscar conductor…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {onMap.length} de {visible.length} en el mapa
          </p>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {visible.length === 0 && <Empty>Sin conductores con ese filtro.</Empty>}
          {visible.map((d) => {
            const point = mapPoint(d);
            const hidden = !point || d.status === 'offline';
            return (
              <li key={d.id}>
                <button
                  onClick={() => select(d)}
                  className={cn('w-full border-b border-border px-3 py-2 text-left hover:bg-muted', selected === d.id && 'bg-blue-50')}
                >
                  <div className="flex items-center gap-2">
                    <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', DRIVER_DOT[d.status])} />
                    <span className="truncate text-sm font-medium">
                      {VEHICLE_ICON[d.vehicle]} {d.display_name}
                    </span>
                    {d.is_stale && d.status !== 'offline' && <Badge className="bg-orange-100 text-orange-700">desactualizado</Badge>}
                    {hidden && <Badge className="ml-auto bg-zinc-100 text-zinc-600">fuera del mapa</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {DRIVER_STATUS_LABEL[d.status]} · {LOCATION_MODE_LABEL[d.location_mode]}
                    {d.sector_name && ` · ${d.sector_name}`}
                    {d.location_mode === 'live' && d.last_seen_at && ` · hace ${elapsed(d.last_seen_at)}`}
                    {d.location_mode === 'zone' && d.zone_confirmed_at && ` · confirmó hace ${elapsed(d.zone_confirmed_at)}`}
                    {d.active_requests ? ` · ${d.active_requests} servicio(s)` : ''}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
    </div>
  );
}
