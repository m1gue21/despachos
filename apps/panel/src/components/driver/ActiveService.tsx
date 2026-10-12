'use client';

import { type RequestRow, SERVICE_LABEL } from '@despacho/shared';
import { useState } from 'react';
import { driverClient } from '@/lib/api';
import { Button } from '../ui';

function navTarget(lat: number | null, lng: number | null, text: string | null, sector: string | null) {
  if (lat != null && lng != null) return { ll: `${lat},${lng}`, q: null as string | null };
  return { ll: null as string | null, q: [text, sector, 'Caldas, Colombia'].filter(Boolean).join(', ') };
}

const googleUrl = (t: { ll: string | null; q: string | null }) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(t.ll ?? t.q ?? '')}`;
const wazeUrl = (t: { ll: string | null; q: string | null }) =>
  t.ll ? `https://waze.com/ul?ll=${t.ll}&navigate=yes` : `https://waze.com/ul?q=${encodeURIComponent(t.q ?? '')}&navigate=yes`;

export function ActiveService({
  r,
  onAction,
  notify,
}: {
  r: RequestRow;
  onAction: (action: 'pick_up' | 'complete') => Promise<void>;
  notify: (msg: string, kind?: 'ok' | 'error' | 'info') => void;
}) {
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const toPickup = r.status === 'assigned';
  const target = toPickup
    ? navTarget(r.pickup_lat, r.pickup_lng, r.pickup_text, r.pickup_sector_name)
    : navTarget(r.dropoff_lat, r.dropoff_lng, r.dropoff_text, r.dropoff_sector_name);

  const act = async (action: 'pick_up' | 'complete') => {
    setBusy(true);
    try {
      await onAction(action);
    } finally {
      setBusy(false);
    }
  };

  // Enlace temporal para que el cliente vea por dónde va el servicio.
  const shareTracking = async () => {
    setSharing(true);
    try {
      const { path } = await driverClient.request<{ path: string }>(`/requests/${r.id}/tracking-link`, { body: {} });
      const url = `${window.location.origin}${path}`;
      const text = `Hola${r.customer_name ? ` ${r.customer_name}` : ''}, soy tu mensajero. Puedes seguir tu ${SERVICE_LABEL[r.service].toLowerCase()} aquí: ${url}`;
      if (r.customer_phone) {
        window.open(`https://wa.me/57${r.customer_phone}?text=${encodeURIComponent(text)}`, '_blank');
      } else if (navigator.share) {
        await navigator.share({ title: 'Seguimiento', text, url });
      } else {
        await navigator.clipboard.writeText(url);
        notify('Enlace copiado', 'info');
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) notify(e instanceof Error ? e.message : 'No se pudo compartir', 'error');
    } finally {
      setSharing(false);
    }
  };

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="text-[15px]">{children}</p>
    </div>
  );

  return (
    <section className="space-y-3 rounded-xl border-2 border-primary bg-card p-4">
      <p className="text-xs font-bold text-primary">
        SERVICIO EN CURSO · {SERVICE_LABEL[r.service].toUpperCase()} · {toPickup ? 'VAS A RECOGER' : 'VAS A ENTREGAR'}
      </p>
      <Row label="Recoge">
        {r.pickup_text}
        {r.pickup_sector_name && <span className="text-muted-foreground"> · {r.pickup_sector_name}</span>}
      </Row>
      {(r.dropoff_text || r.dropoff_sector_name) && (
        <Row label="Entrega">
          {r.dropoff_text}
          {r.dropoff_sector_name && <span className="text-muted-foreground"> · {r.dropoff_sector_name}</span>}
        </Row>
      )}
      {r.notes && <Row label="Notas">{r.notes}</Row>}
      {(r.customer_name || r.customer_phone) && <Row label="Cliente">{[r.customer_name, r.customer_phone].filter(Boolean).join(' · ')}</Row>}
      <div className="grid grid-cols-2 gap-2">
        <a href={googleUrl(target)} target="_blank" rel="noreferrer" className="flex h-11 items-center justify-center rounded-lg border-2 border-primary font-semibold text-primary">
          Google Maps
        </a>
        <a href={wazeUrl(target)} target="_blank" rel="noreferrer" className="flex h-11 items-center justify-center rounded-lg border-2 border-primary font-semibold text-primary">
          Waze
        </a>
        {r.customer_phone && (
          <>
            <a href={`tel:${r.customer_phone}`} className="flex h-11 items-center justify-center rounded-lg border-2 border-border font-semibold">
              Llamar
            </a>
            <a
              href={`https://wa.me/57${r.customer_phone}`}
              target="_blank"
              rel="noreferrer"
              className="flex h-11 items-center justify-center rounded-lg border-2 border-ok font-semibold text-ok"
            >
              WhatsApp
            </a>
          </>
        )}
      </div>
      <Button variant="outline" className="h-11 w-full text-[15px]" onClick={shareTracking} disabled={sharing}>
        {sharing ? 'Generando enlace…' : 'Enviar seguimiento al cliente'}
      </Button>
      {toPickup ? (
        <Button className="h-14 w-full text-lg" onClick={() => act('pick_up')} disabled={busy}>
          Ya recogí
        </Button>
      ) : (
        <Button variant="ok" className="h-14 w-full text-lg" onClick={() => act('complete')} disabled={busy}>
          Completado
        </Button>
      )}
    </section>
  );
}
