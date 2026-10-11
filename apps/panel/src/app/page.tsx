'use client';

import type { DriverRow, RequestRow, WhatsappGroup, Zone } from '@despacho/shared';
import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { DriverPanel } from '@/components/DriverPanel';
import { MapView } from '@/components/MapView';
import { NewRequestDialog } from '@/components/NewRequestDialog';
import { RequestDetail } from '@/components/RequestDetail';
import { RequestList } from '@/components/RequestList';
import { Button, Kbd } from '@/components/ui';
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

  return (
    <AppShell
      actions={
        <Button size="sm" onClick={() => setNewOpen(true)} disabled={!cityId}>
          Nueva solicitud <Kbd>N</Kbd>
        </Button>
      }
    >
      <div className="grid h-full grid-cols-[22rem_1fr_20rem]">
        <aside className="min-h-0 border-r border-border bg-card">
          <RequestList requests={requests.data ?? []} selectedId={selected} onSelect={setSelected} />
        </aside>
        <section className="relative min-h-0">
          <MapView
            city={city}
            sectors={sectors}
            drivers={drivers.data ?? []}
            requests={requests.data ?? []}
            selectedRequestId={selected}
            onSelectRequest={setSelected}
            onSelectDriver={selectDriver}
          />
          {selected && <RequestDetail key={selected} id={selected} drivers={drivers.data ?? []} onClose={() => setSelected(null)} />}
        </section>
        <aside className="min-h-0 border-l border-border bg-card">
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
          onCreated={(r) => setSelected(r.id)}
        />
      )}
    </AppShell>
  );
}
