'use client';

import {
  type DriverRow,
  EVENT_LABEL,
  REQUEST_STATUS_LABEL,
  type RequestDetail as Detail,
  SERVICE_LABEL,
  type CandidatesResponse,
  VEHICLE_ICON,
  formatWhatsappMessage,
} from '@despacho/shared';
import { useState } from 'react';
import { api } from '@/lib/api';
import { approve, approveLabel } from '@/lib/assign';
import { elapsed, phonePretty, time } from '@/lib/format';
import { useApi } from '@/lib/useApi';
import { useToast } from '@/lib/toast';
import { STATUS_BADGE } from './RequestList';
import { Badge, Button, ErrorText, Select, cn } from './ui';

export function RequestDetail({ id, drivers, onClose }: { id: string; drivers: DriverRow[]; onClose: () => void }) {
  const toast = useToast();
  const { data: r, error } = useApi<Detail>(`/requests/${id}`, { tables: ['requests', 'request_events'], id });
  const open = r && ['created', 'offered'].includes(r.status);
  // Candidatos de Arriero: del mejor al peor, sin quien ya rechazó o dejó vencer este pedido.
  const { data: cands, reload: reloadCands } = useApi<CandidatesResponse>(open ? `/requests/${id}/candidates` : null, {
    tables: ['driver_presence', 'requests', 'request_events'],
    city: r?.city_zone_id,
  });
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const act = async (action: string, payload: Record<string, unknown> = {}, ok?: string) => {
    setBusy(true);
    try {
      await api(`/requests/${id}/transition`, { body: { action, payload } });
      if (ok) toast(ok);
      setPick('');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo', 'error');
    } finally {
      setBusy(false);
    }
  };

  // Enlace temporal para que el cliente vea el estado y al mensajero.
  const tracking = async (via: 'copy' | 'whatsapp') => {
    if (!r) return;
    try {
      const { path } = await api<{ path: string }>(`/requests/${id}/tracking-link`, { body: {} });
      const url = `${window.location.origin}${path}`;
      if (via === 'whatsapp' && r.customer_phone) {
        const text = `Hola${r.customer_name ? ` ${r.customer_name}` : ''}, puedes seguir tu ${SERVICE_LABEL[r.service].toLowerCase()} aquí: ${url}`;
        window.open(`https://wa.me/57${r.customer_phone}?text=${encodeURIComponent(text)}`, '_blank');
      } else {
        await navigator.clipboard.writeText(url);
        toast('Enlace de seguimiento copiado', 'info');
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo crear el enlace', 'error');
    }
  };

  const copy = async () => {
    if (!r) return;
    try {
      await navigator.clipboard.writeText(formatWhatsappMessage(r));
      toast('Mensaje copiado para el grupo', 'info');
    } catch {
      toast('No se pudo copiar', 'error');
    }
  };

  if (error) return <Panel onClose={onClose}><ErrorText>{error}</ErrorText></Panel>;
  if (!r) return <Panel onClose={onClose}><p className="text-sm text-muted-foreground">Cargando…</p></Panel>;

  const activeDrivers = drivers.filter((d) => d.active);
  const pickDriver = activeDrivers.find((d) => d.id === pick);
  const terminal = r.status === 'completed' || r.status === 'cancelled';

  return (
    <Panel onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Badge className={STATUS_BADGE[r.status]}>{REQUEST_STATUS_LABEL[r.status]}</Badge>
          <span className="text-sm font-semibold">{SERVICE_LABEL[r.service]}</span>
          <span className="ml-auto text-xs text-muted-foreground">hace {elapsed(r.created_at)}</span>
        </div>

        <dl className="grid grid-cols-[5.5rem_1fr] gap-x-2 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Recoge</dt>
          <dd>
            {r.pickup_text}
            {r.pickup_sector_name && <span className="text-muted-foreground"> · {r.pickup_sector_name}</span>}
          </dd>
          <dt className="text-muted-foreground">Entrega</dt>
          <dd>
            {r.dropoff_text ?? '—'}
            {r.dropoff_sector_name && <span className="text-muted-foreground"> · {r.dropoff_sector_name}</span>}
          </dd>
          <dt className="text-muted-foreground">Cliente</dt>
          <dd>
            {r.customer_name ?? '—'}{' '}
            {r.customer_phone && (
              <a className="text-primary underline" href={`https://wa.me/57${r.customer_phone}`} target="_blank" rel="noreferrer">
                {phonePretty(r.customer_phone)}
              </a>
            )}
          </dd>
          {r.notes && (
            <>
              <dt className="text-muted-foreground">Notas</dt>
              <dd>{r.notes}</dd>
            </>
          )}
          {r.source_group_name && (
            <>
              <dt className="text-muted-foreground">Grupo</dt>
              <dd>{r.source_group_name}</dd>
            </>
          )}
          {(r.assigned_driver_name || r.offered_driver_name) && (
            <>
              <dt className="text-muted-foreground">{r.assigned_driver_name ? 'Conductor' : 'Ofrecida a'}</dt>
              <dd>
                {r.assigned_driver_name ?? r.offered_driver_name}
                {r.assigned_driver_phone && (
                  <a className="ml-1 text-primary underline" href={`tel:${r.assigned_driver_phone}`}>
                    {phonePretty(r.assigned_driver_phone)}
                  </a>
                )}
              </dd>
            </>
          )}
          {r.cancel_reason && (
            <>
              <dt className="text-muted-foreground">Motivo</dt>
              <dd>{r.cancel_reason}</dd>
            </>
          )}
        </dl>

        {r.raw_text && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">Mensaje original</summary>
            <p className="mt-1 whitespace-pre-wrap rounded bg-muted p-2">{r.raw_text}</p>
          </details>
        )}

        {/* Acciones según estado */}
        <div className="space-y-2 rounded-md border border-border p-3">
          {(r.status === 'created' || r.status === 'offered' || r.status === 'assigned') && (
            <div className="space-y-2">
              <Select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Conductor">
                <option value="">Elegir conductor…</option>
                {activeDrivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {VEHICLE_ICON[d.vehicle]} {d.display_name} · {d.status === 'available' ? 'disponible' : d.status === 'busy' ? 'ocupado' : 'desconectado'}
                    {d.sector_name ? ` · ${d.sector_name}` : ''}
                    {d.has_app ? '' : ' · sin app'}
                  </option>
                ))}
              </Select>
              <div className="flex flex-wrap gap-2">
                {r.status === 'created' && (
                  <Button
                    size="sm"
                    disabled={!pickDriver || !pickDriver.has_app || busy}
                    title={pickDriver && !pickDriver.has_app ? 'Este conductor no tiene la app: asígnalo directo' : ''}
                    onClick={() => act('offer', { driver_id: pick }, 'Oferta enviada')}
                  >
                    Ofrecer
                  </Button>
                )}
                {(r.status === 'created' || r.status === 'offered') && (
                  <Button size="sm" variant="secondary" disabled={!pick || busy} onClick={() => act('assign', { driver_id: pick }, 'Asignada')}>
                    Asignar directo
                  </Button>
                )}
                {r.status === 'assigned' && (
                  <Button size="sm" variant="secondary" disabled={!pick || busy} onClick={() => act('reassign', { driver_id: pick }, 'Reasignada')}>
                    Reasignar
                  </Button>
                )}
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {r.status === 'offered' && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => act('reject', { reason: 'withdrawn' }, 'Oferta retirada')}>
                Retirar oferta
              </Button>
            )}
            {r.status === 'assigned' && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => act('pick_up', {}, 'Marcada como recogida')}>
                Marcar recogido
              </Button>
            )}
            {r.status === 'picked_up' && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => act('complete', {}, 'Completada')}>
                Marcar completado
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={copy}>
              Copiar mensaje para el grupo
            </Button>
            {!terminal && (
              <Button size="sm" variant="outline" onClick={() => tracking('copy')} title="Enlace temporal para el cliente">
                Copiar enlace de seguimiento
              </Button>
            )}
            {!terminal && r.customer_phone && (
              <Button size="sm" variant="outline" onClick={() => tracking('whatsapp')}>
                Enviar seguimiento por WhatsApp
              </Button>
            )}
            {!terminal && (
              <Button
                size="sm"
                variant="ghost"
                className="text-danger"
                disabled={busy}
                onClick={() => {
                  const reason = window.prompt('Motivo de cancelación');
                  if (reason?.trim()) void act('cancel', { reason }, 'Cancelada');
                }}
              >
                Cancelar
              </Button>
            )}
          </div>
        </div>

        {open && (
          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Candidatos de Arriero</h3>
            {!cands?.candidates.length ? (
              <p className="text-xs text-muted-foreground">
                Sin conductores disponibles con ubicación al día para este servicio. Elige uno a mano arriba.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {cands.candidates.map((c, i) => (
                  <li key={c.driver_id} className={cn('rounded-lg border p-2', i === 0 ? 'border-primary/40 bg-accent-soft' : 'border-border')}>
                    <div className="flex items-center gap-2">
                      <span>{VEHICLE_ICON[c.vehicle]}</span>
                      <span className="text-sm font-semibold">{c.display_name}</span>
                      {i === 0 && <Badge className="bg-primary text-white">Mejor opción</Badge>}
                      {!c.has_app && <Badge className="bg-zinc-100 text-zinc-600">sin app</Badge>}
                      <Button
                        size="sm"
                        variant={i === 0 ? 'primary' : 'outline'}
                        className="ml-auto"
                        disabled={busy || r.status !== 'created'}
                        title={r.status !== 'created' ? 'Retira la oferta actual para elegir otro conductor' : ''}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            await approve(id, c);
                            toast(c.has_app ? `Oferta enviada a ${c.display_name}` : `Asignada a ${c.display_name}: avísale por WhatsApp`);
                          } catch (e) {
                            toast(e instanceof Error ? e.message : 'No se pudo', 'error');
                          } finally {
                            setBusy(false);
                            void reloadCands();
                          }
                        }}
                      >
                        {approveLabel(c.has_app)}
                      </Button>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{c.reason}</p>
                  </li>
                ))}
              </ul>
            )}
            {cands && cands.declined.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Ya no se proponen:{' '}
                {cands.declined.map((d) => `${d.display_name} (${d.why === 'timeout' ? 'no respondió' : 'rechazó'})`).join(', ')}.
              </p>
            )}
          </div>
        )}

        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Línea de tiempo</h3>
          <ol className="space-y-1.5 border-l border-border pl-3">
            {r.events.map((e) => (
              <li key={e.id} className="text-xs">
                <span className="tabular-nums text-muted-foreground">{time(e.created_at)}</span>{' '}
                <span className="font-medium">{EVENT_LABEL[e.type] ?? e.type}</span>
                {e.to_status && e.type === 'status_changed' && ` → ${REQUEST_STATUS_LABEL[e.to_status]}`}
                {e.driver_name && ` · ${e.driver_name}`}
                {e.type === 'rejected' && e.payload.reason === 'timeout' && ' (venció)'}
                {e.type === 'note' && `: ${String(e.payload.text ?? '')}`}
                {e.type === 'cancelled' && e.payload.reason ? `: ${String(e.payload.reason)}` : ''}
                <span className="text-muted-foreground"> · {e.actor_name ?? e.actor_role}</span>
              </li>
            ))}
          </ol>
          <form
            className="mt-2 flex gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (note.trim()) void act('note', { text: note.trim() }).then(() => setNote(''));
            }}
          >
            <input
              className="h-7 min-w-0 flex-1 rounded-md border border-border px-2 text-xs"
              placeholder="Agregar nota…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <Button size="sm" variant="outline" disabled={!note.trim()}>
              Agregar
            </Button>
          </form>
        </div>
      </div>
    </Panel>
  );
}

function Panel({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="h-full overflow-y-auto bg-card">
      <div className="sticky top-0 z-10 flex items-center border-b border-border bg-card/95 px-3 py-2 backdrop-blur">
        <button className="text-sm text-primary hover:underline" onClick={onClose}>
          ← Solicitudes
        </button>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
