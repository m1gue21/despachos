'use client';

import type { DriverRow, RequestRow, WhatsappGroup, Zone } from '@despacho/shared';
import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { DriverPanel } from '@/components/DriverPanel';
import { MapView } from '@/components/MapView';
import { NewRequestDialog } from '@/components/NewRequestDialog';
import { RequestDetail } from '@/components/RequestDetail';
import { RequestList } from '@/components/RequestList';
import { Button, Kbd, cn } from '@/components/ui';
import { useRealtimeEvent } from '@/lib/realtime';
import { useSession } from '@/lib/session';
import { beep } from '@/lib/sound';
import { useToast } from '@/lib/toast';
import { useApi } from '@/lib/useApi';

export default function BoardPage() {
  const { cityId, city } = useSession();
  const toast = useToast();
  const [selected, setSelected] = useState<string | null>(null);
  const [highlightDriver, setHighlightDriver] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [tab, setTab] = useState<'list' | 'map' | 'drivers'>('list');

  const requests = useApi<RequestRow[]>(cityId ? `/requests?city=${cityId}` : null, {
    tables: ['requests'],
    city: cityId,
  });
  // La caducidad depende del reloj: recarga cada 30 s además de los avisos.
  const drivers = useApi<DriverRow[]>(cityId ? `/drivers?city=${cityId}` : null, {
    tables: ['driver_presence', 'drivers', 'requests'],
    city: cityId,
    intervalMs: 30_000,
  });
  const zones = useApi<Zone[]>(cityId ? `/zones?city=${cityId}` : null, { tables: ['zones'] });
  const groups = useApi<WhatsappGroup[]>(cityId ? `/groups?city=${cityId}` : null);
  const sectors = (zones.data ?? []).filter((z) => z.level === 'sector');

  // Sonido y aviso: solicitud nueva u oferta rechazada/vencida.
  useRealtimeEvent((m) => {
    if (m.type !== 'change' || m.table !== 'request_events' || m.city !== cityId) return;
    if (m.event === 'created') beep('new');
    if (m.event === 'rejected') {
      beep('alert');
      toast('Una oferta fue rechazada o venció', 'error');
    }
  });

  // Atajo: N abre "Nueva solicitud" (fuera de campos de texto).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable]')) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setNewOpen(true);
      }
      if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const selectDriver = useCallback((id: string) => setHighlightDriver(id), []);

  const openCount = (requests.data ?? []).filter((r) => r.status === 'created' || r.status === 'offered').length;
  const select = (id: string | null) => {
    setSelected(id);
    if (id) setTab('list');
  };

  return (
    <AppShell
      actions={
        <Button size="sm" onClick={() => setNewOpen(true)} disabled={!cityId} className="whitespace-nowrap">
          <span className="sm:hidden">+ Nueva</span>
          <span className="hidden sm:inline">Nueva solicitud</span>
          <span className="hidden md:inline">
            <Kbd>N</Kbd>
          </span>
        </Button>
      }
    >
      {/* xl+: tres columnas, el detalle reemplaza a la lista (el mapa nunca queda tapado).
          Menos de xl: pestañas, una vista a la vez. */}
      <div className="flex h-full flex-col xl:grid xl:grid-cols-[21rem_minmax(0,1fr)_19rem] 2xl:grid-cols-[24rem_minmax(0,1fr)_21rem]">
        <div className="flex shrink-0 border-b border-border bg-card xl:hidden" role="tablist">
          {(
            [
              ['list', selected ? 'Detalle' : `Solicitudes${openCount ? ` (${openCount})` : ''}`],
              ['map', 'Mapa'],
              ['drivers', 'Conductores'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                'flex-1 border-b-2 px-2 py-2.5 text-sm font-medium',
                tab === key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <aside className={cn('min-h-0 flex-1 bg-card xl:block xl:border-r xl:border-border', tab !== 'list' && 'hidden')}>
          {selected ? (
            <RequestDetail key={selected} id={selected} drivers={drivers.data ?? []} onClose={() => setSelected(null)} />
          ) : (
            <RequestList requests={requests.data ?? []} selectedId={selected} onSelect={select} />
          )}
        </aside>
        <section className={cn('relative min-h-0 flex-1 xl:block', tab !== 'map' && 'hidden')}>
          <MapView
            city={city}
            sectors={sectors}
            drivers={drivers.data ?? []}
            requests={requests.data ?? []}
            selectedRequestId={selected}
            onSelectRequest={select}
            onSelectDriver={selectDriver}
          />
        </section>
        <aside className={cn('min-h-0 flex-1 bg-card xl:block xl:border-l xl:border-border', tab !== 'drivers' && 'hidden')}>
          <DriverPanel drivers={drivers.data ?? []} sectors={sectors} highlightId={highlightDriver} onChanged={drivers.reload} />
        </aside>
      </div>
      {cityId && (
        <NewRequestDialog
          open={newOpen}
          onClose={() => setNewOpen(false)}
          cityId={cityId}
          sectors={sectors}
          groups={groups.data ?? []}
          onCreated={(r) => select(r.id)}
        />
      )}
    </AppShell>
  );
}
