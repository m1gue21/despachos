'use client';

import { REQUEST_STATUS_LABEL, type RequestRow, type RequestStatus, SERVICE_LABEL } from '@despacho/shared';
import { useEffect, useState } from 'react';
import { UNASSIGNED_ALERT_MINUTES, elapsed, minutesSince, time } from '@/lib/format';
import { Badge, Empty, cn } from './ui';

const FILTERS: { key: string; label: string; statuses: RequestStatus[] }[] = [
  { key: 'open', label: 'Pendientes', statuses: ['created', 'offered'] },
  { key: 'active', label: 'En curso', statuses: ['assigned', 'picked_up'] },
  { key: 'closed', label: 'Cerradas', statuses: ['completed', 'cancelled'] },
];

export const STATUS_BADGE: Record<RequestStatus, string> = {
  created: 'bg-red-100 text-red-700',
  offered: 'bg-amber-100 text-amber-800',
  assigned: 'bg-blue-100 text-blue-700',
  picked_up: 'bg-violet-100 text-violet-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-zinc-100 text-zinc-600',
};

export function RequestList({
  requests,
  selectedId,
  onSelect,
}: {
  requests: RequestRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [filter, setFilter] = useState('open');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const counts = Object.fromEntries(FILTERS.map((f) => [f.key, requests.filter((r) => f.statuses.includes(r.status)).length]));
  const visible = requests
    .filter((r) => FILTERS.find((f) => f.key === filter)!.statuses.includes(r.status))
    // Pendientes: la más vieja primero; el resto: la más reciente primero.
    .sort((a, b) => (filter === 'open' ? 1 : -1) * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));

  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-1 border-b border-border p-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              'flex-1 rounded-md px-2 py-1 text-xs font-medium',
              filter === f.key ? 'bg-foreground text-white' : 'text-muted-foreground hover:bg-muted',
            )}
          >
            {f.label} <span className="opacity-70">{counts[f.key]}</span>
          </button>
        ))}
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 && <Empty>No hay solicitudes aquí.</Empty>}
        {visible.map((r) => {
          const late = r.status === 'created' && minutesSince(r.created_at, now) > UNASSIGNED_ALERT_MINUTES;
          return (
            <li key={r.id}>
              <button
                onClick={() => onSelect(r.id)}
                className={cn(
                  'w-full border-b border-border px-3 py-2 text-left hover:bg-muted',
                  selectedId === r.id && 'bg-blue-50',
                  late && 'border-l-4 border-l-danger',
                )}
              >
                <div className="flex items-center gap-1.5">
                  <Badge className={STATUS_BADGE[r.status]}>{REQUEST_STATUS_LABEL[r.status]}</Badge>
                  <span className="text-xs font-medium">{SERVICE_LABEL[r.service]}</span>
                  <span className={cn('ml-auto text-xs tabular-nums', late ? 'font-semibold text-danger' : 'text-muted-foreground')}>
                    {filter === 'closed' ? time(r.completed_at ?? r.created_at) : elapsed(r.created_at, now)}
                  </span>
                </div>
                <p className="mt-1 truncate text-sm">
                  {r.pickup_text}
                  {r.dropoff_text && <span className="text-muted-foreground"> → {r.dropoff_text}</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {[r.pickup_sector_name, r.source_group_name, r.assigned_driver_name ?? r.offered_driver_name]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
