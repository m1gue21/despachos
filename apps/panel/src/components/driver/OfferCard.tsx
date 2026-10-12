'use client';

import { type DriverOffer, SERVICE_LABEL } from '@despacho/shared';
import { useEffect, useState } from 'react';
import { Button } from '../ui';

export function OfferCard({
  offer,
  onAccept,
  onReject,
}: {
  offer: DriverOffer;
  onAccept: () => Promise<void>;
  onReject: () => Promise<void>;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<'accept' | 'reject' | null>(null);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.ceil((new Date(offer.offer_expires_at).getTime() - now) / 1000));
  const run = (kind: 'accept' | 'reject') => async () => {
    setBusy(kind);
    try {
      await (kind === 'accept' ? onAccept() : onReject());
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-center gap-4 overflow-y-auto bg-blue-50 p-5">
      <p className="text-center text-sm font-bold tracking-wide text-primary">NUEVO SERVICIO</p>
      <h1 className="text-center text-3xl font-bold">{SERVICE_LABEL[offer.service]}</h1>
      <p className={`text-center text-6xl font-extrabold tabular-nums ${left <= 10 ? 'text-danger' : ''}`}>{left}s</p>
      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">Recoge</p>
          <p className="text-lg">
            {offer.pickup_text}
            {offer.pickup_sector_name && <span className="text-muted-foreground"> · {offer.pickup_sector_name}</span>}
          </p>
        </div>
        {(offer.dropoff_text || offer.dropoff_sector_name) && (
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Entrega</p>
            <p className="text-lg">
              {offer.dropoff_text}
              {offer.dropoff_sector_name && <span className="text-muted-foreground"> · {offer.dropoff_sector_name}</span>}
            </p>
          </div>
        )}
        {offer.notes && (
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Notas</p>
            <p>{offer.notes}</p>
          </div>
        )}
      </div>
      <p className="text-center text-sm text-muted-foreground">Los datos del cliente aparecen al aceptar.</p>
      <Button variant="ok" className="h-16 text-xl" onClick={run('accept')} disabled={left === 0 || busy !== null}>
        {busy === 'accept' ? 'Aceptando…' : 'Aceptar'}
      </Button>
      <Button variant="outline" className="h-12 border-danger text-base text-danger" onClick={run('reject')} disabled={busy !== null}>
        {busy === 'reject' ? 'Rechazando…' : 'Rechazar'}
      </Button>
    </div>
  );
}
