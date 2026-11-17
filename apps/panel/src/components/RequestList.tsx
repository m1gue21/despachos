'use client';

import { type Proposal, REQUEST_STATUS_LABEL, type RequestRow, type RequestStatus, SERVICE_LABEL, VEHICLE_ICON } from '@despacho/shared';
import { useEffect, useState } from 'react';
import { approveLabel } from '@/lib/assign';
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
  assigned: 'bg-primary/10 text-primary',
  picked_up: 'bg-accent-soft text-trocha',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-zinc-100 text-zinc-600',
};

export function RequestList({
  requests,
  selectedId,
  onSelect,
  proposals = {},
  onApprove,
  approving,
}: {
  requests: RequestRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  // Mejor propuesta de Arriero por pedido sin asignar; el administrador la aprueba aquí mismo.
  proposals?: Record<string, Proposal>;
  onApprove?: (requestId: string, p: Proposal) => void;
  approving?: string | null;
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
            <li
              key={r.id}
              className={cn('border-b border-border', selectedId === r.id && 'bg-primary/10', late && 'border-l-4 border-l-danger')}
            >
              <button onClick={() => onSelect(r.id)} className="w-full px-3 py-2 text-left hover:bg-muted">
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
              {r.status === 'created' && onApprove && (
                <div className="px-3 pb-2.5">
                  {proposals[r.id] ? (
                    <div className="flex items-center gap-2 rounded-lg bg-accent-soft px-2.5 py-1.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold">
                          {VEHICLE_ICON[proposals[r.id]!.vehicle]} Sugerido: {proposals[r.id]!.display_name}
                          {proposals[r.id]!.declined > 0 && (
                            <span className="font-normal text-muted-foreground"> · {proposals[r.id]!.declined} ya dijo que no</span>
                          )}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">{proposals[r.id]!.reason}</p>
                      </div>
                      <button
                        className="shrink-0 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
                        disabled={approving === r.id}
                        onClick={() => onApprove(r.id, proposals[r.id]!)}
                      >
                        {approving === r.id ? '…' : approveLabel(proposals[r.id]!.has_app)}
                      </button>
                    </div>
                  ) : (
                    <p className="rounded-lg bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">
                      Sin candidatos disponibles ahora. Abre el pedido para elegir a mano.
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
