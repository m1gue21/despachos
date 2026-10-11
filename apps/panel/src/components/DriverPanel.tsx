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
import { useState } from 'react';
import { api } from '@/lib/api';
import { elapsed } from '@/lib/format';
import { useToast } from '@/lib/toast';
import { Badge, Empty, cn } from './ui';

export const DRIVER_DOT: Record<DriverStatus, string> = {
  available: 'bg-ok',
  busy: 'bg-warn',
  offline: 'bg-idle',
};

export function DriverPanel({
  drivers,
  sectors,
  highlightId,
  onChanged,
}: {
  drivers: DriverRow[];
  sectors: Zone[];
  highlightId?: string | null;
  onChanged?: () => void;
}) {
  const toast = useToast();
  const [status, setStatus] = useState<DriverStatus | 'all'>('all');
  const [sector, setSector] = useState('all');
  const [q, setQ] = useState('');

  const visible = drivers
    .filter((d) => d.active)
    .filter((d) => status === 'all' || d.status === status)
    .filter((d) => sector === 'all' || d.sector_zone_id === sector)
    .filter((d) => !q || d.display_name.toLowerCase().includes(q.toLowerCase()));

  const patch = async (d: DriverRow, body: Record<string, unknown>) => {
    try {
      await api(`/drivers/${d.id}/presence`, { method: 'PATCH', body });
      onChanged?.();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo actualizar', 'error');
    }
  };

  const counts = Object.fromEntries(DRIVER_STATUSES.map((s) => [s, drivers.filter((d) => d.active && d.status === s).length]));

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-border p-2">
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
        <div className="flex gap-1">
          <input
            className="h-7 min-w-0 flex-1 rounded-md border border-border px-2 text-xs"
            placeholder="Buscar…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select className="h-7 rounded-md border border-border px-1 text-xs" value={sector} onChange={(e) => setSector(e.target.value)}>
            <option value="all">Todos los sectores</option>
            {sectors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 && <Empty>Sin conductores con ese filtro.</Empty>}
        {visible.map((d) => (
          <li key={d.id} className={cn('border-b border-border px-3 py-2', highlightId === d.id && 'bg-blue-50')}>
            <div className="flex items-center gap-2">
              <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', DRIVER_DOT[d.status])} />
              <span className="truncate text-sm font-medium">
                {VEHICLE_ICON[d.vehicle]} {d.display_name}
              </span>
              {!d.has_app && <Badge className="bg-zinc-100 text-zinc-600">sin app</Badge>}
              {d.is_stale && d.status !== 'offline' && <Badge className="bg-orange-100 text-orange-700">desactualizado</Badge>}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {LOCATION_MODE_LABEL[d.location_mode]}
              {d.sector_name && ` · ${d.sector_name}`}
              {d.location_mode === 'live' && d.last_seen_at && ` · hace ${elapsed(d.last_seen_at)}`}
              {d.location_mode === 'zone' && d.zone_confirmed_at && ` · confirmó hace ${elapsed(d.zone_confirmed_at)}`}
              {d.active_requests ? ` · ${d.active_requests} servicio(s)` : ''}
            </p>
            <div className="mt-1.5 flex gap-1">
              <select
                aria-label={`Estado de ${d.display_name}`}
                className="h-7 rounded-md border border-border px-1 text-xs"
                value={d.status}
                onChange={(e) => patch(d, { status: e.target.value })}
              >
                {DRIVER_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {DRIVER_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
              <select
                aria-label={`Sector de ${d.display_name}`}
                className="h-7 min-w-0 flex-1 rounded-md border border-border px-1 text-xs"
                value={d.sector_zone_id ?? ''}
                onChange={(e) => patch(d, { sector_zone_id: e.target.value || null, ...(d.location_mode === 'live' ? {} : { location_mode: 'zone' }) })}
              >
                <option value="">Sin sector</option>
                {sectors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {d.location_mode === 'zone' && (
                <button
                  className="h-7 rounded-md border border-border px-2 text-xs hover:bg-muted"
                  title="Confirmar que sigue en el sector"
                  onClick={() => patch(d, { confirm: true })}
                >
                  ✓
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
