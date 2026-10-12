'use client';

import {
  RATING_TAGS,
  RATING_TAG_LABEL,
  REQUEST_STATUS_LABEL,
  type RequestStatus,
  SERVICE_LABEL,
  type ServiceType,
  VEHICLE_ICON,
  type VehicleType,
} from '@despacho/shared';
import { useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Badge, Empty, ErrorText, Select, cn } from '@/components/ui';
import { dateTime } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/useApi';

interface Stat {
  driver_id: string;
  display_name: string;
  vehicle: VehicleType;
  has_app: boolean;
  active: boolean;
  completed: number;
  cancelled_assigned: number;
  offers: number;
  accepted: number;
  rejected: number;
  timeouts: number;
  acceptance_rate: number | null;
  completion_rate: number | null;
  avg_accept_seconds: number | null;
  avg_to_pickup_seconds: number | null;
  avg_delivery_seconds: number | null;
  ratings_count: number;
  ratings_avg: number | null;
  score: number;
  provisional: boolean;
  last_service_at: string | null;
}

interface Detail {
  stats: Stat;
  daily: { day: string; completed: number; cancelled: number }[];
  ratings: { stars: number; tags: string[]; comment: string | null; created_at: string; service: ServiceType; pickup_text: string; dropoff_text: string | null }[];
  distribution: { stars: number; n: number }[];
  tags: { tag: string; n: number }[];
  recent: { id: string; service: ServiceType; status: RequestStatus; pickup_text: string; dropoff_text: string | null; assigned_at: string | null; completed_at: string | null; stars: number | null }[];
}

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)} %`);
const dur = (s: number | null) => (s === null ? '—' : s < 90 ? `${Math.round(s)} s` : `${Math.round(s / 60)} min`);
const stars = (v: number | null) => (v === null ? '—' : v.toFixed(1));

function scoreClass(score: number, provisional: boolean) {
  if (provisional) return 'bg-zinc-100 text-zinc-600';
  if (score >= 85) return 'bg-green-100 text-green-700';
  if (score >= 70) return 'bg-amber-100 text-amber-800';
  return 'bg-red-100 text-red-700';
}

type SortKey = 'score' | 'completed' | 'ratings_avg' | 'acceptance_rate' | 'avg_accept_seconds';

export default function PerformancePage() {
  const { me, cityId } = useSession();
  const [days, setDays] = useState(30);
  const [sort, setSort] = useState<SortKey>('score');
  const [selected, setSelected] = useState<string | null>(null);
  const isAdmin = me?.profile.role === 'admin';
  const list = useApi<Stat[]>(isAdmin && cityId ? `/performance?city=${cityId}&days=${days}` : null, {
    tables: ['request_events'],
    city: cityId,
  });

  const rows = useMemo(() => {
    const data = [...(list.data ?? [])].filter((r) => r.active);
    const val = (r: Stat) => r[sort] ?? (sort === 'avg_accept_seconds' ? Infinity : -Infinity);
    return data.sort((a, b) => {
      if (sort === 'score' && a.provisional !== b.provisional) return a.provisional ? 1 : -1;
      return sort === 'avg_accept_seconds' ? val(a) - val(b) : val(b) - val(a);
    });
  }, [list.data, sort]);

  const Th = ({ k, children, className }: { k?: SortKey; children: React.ReactNode; className?: string }) => (
    <th className={cn('px-3 py-2 font-medium', className)}>
      {k ? (
        <button className={cn('hover:text-foreground', sort === k && 'text-foreground underline')} onClick={() => setSort(k)}>
          {children}
        </button>
      ) : (
        children
      )}
    </th>
  );

  return (
    <AppShell>
      <div className="relative h-full overflow-y-auto">
        <div className="mx-auto max-w-6xl space-y-4 p-6">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">Desempeño de conductores</h1>
            <Select className="ml-auto w-44" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={7}>Últimos 7 días</option>
              <option value={30}>Últimos 30 días</option>
              <option value={90}>Últimos 90 días</option>
            </Select>
          </div>
          {!isAdmin && <ErrorText>Solo el administrador ve el desempeño.</ErrorText>}
          {list.error && <ErrorText>{list.error}</ErrorText>}

          <details className="rounded-lg border border-border bg-card p-3 text-sm">
            <summary className="cursor-pointer font-medium">¿Cómo se calcula el puntaje?</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>
                <b>40 % calificación del cliente.</b> Se suman 5 calificaciones imaginarias de 4,0 estrellas, para que pocas calificaciones no
                pesen demasiado.
              </li>
              <li>
                <b>25 % aceptación:</b> ofertas aceptadas sobre ofertas recibidas.
              </li>
              <li>
                <b>20 % cumplimiento:</b> servicios completados sobre completados más cancelados estando asignado.
              </li>
              <li>
                <b>15 % rapidez para aceptar:</b> 15 s o menos vale completo; llegar al límite de la oferta vale cero.
              </li>
              <li>Lo que no tiene datos cuenta como 80 %. Con menos de 3 servicios completados el puntaje es provisional.</li>
            </ul>
          </details>

          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <Th>Conductor</Th>
                  <Th k="score">Puntaje</Th>
                  <Th k="ratings_avg">Calificación</Th>
                  <Th k="completed" className="text-right">
                    Servicios
                  </Th>
                  <Th k="acceptance_rate" className="text-right">
                    Aceptación
                  </Th>
                  <Th className="text-right">Cumplimiento</Th>
                  <Th k="avg_accept_seconds" className="text-right">
                    Responde en
                  </Th>
                  <Th className="text-right">Entrega en</Th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={9}>
                      <Empty>Sin conductores activos en esta ciudad.</Empty>
                    </td>
                  </tr>
                )}
                {rows.map((r, i) => (
                  <tr
                    key={r.driver_id}
                    onClick={() => setSelected(r.driver_id)}
                    className={cn('cursor-pointer border-t border-border hover:bg-muted', selected === r.driver_id && 'bg-blue-50')}
                  >
                    <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-2 font-medium">
                      {VEHICLE_ICON[r.vehicle]} {r.display_name}
                      {!r.has_app && <span className="ml-1 text-xs font-normal text-muted-foreground">(sin app)</span>}
                    </td>
                    <td className="px-3 py-2">
                      <Badge className={scoreClass(r.score, r.provisional)}>{r.score}</Badge>
                      {r.provisional && <span className="ml-1 text-xs text-muted-foreground">provisional</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-amber-500">★</span> {stars(r.ratings_avg)}{' '}
                      <span className="text-xs text-muted-foreground">({r.ratings_count})</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.completed}
                      {r.cancelled_assigned > 0 && <span className="text-xs text-muted-foreground"> · {r.cancelled_assigned} canc.</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {pct(r.acceptance_rate)} <span className="text-xs text-muted-foreground">({r.accepted}/{r.offers})</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{pct(r.completion_rate)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{dur(r.avg_accept_seconds)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{dur(r.avg_delivery_seconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {selected && cityId && <DriverDetail id={selected} cityId={cityId} days={days} onClose={() => setSelected(null)} />}
      </div>
    </AppShell>
  );
}

function DriverDetail({ id, cityId, days, onClose }: { id: string; cityId: string; days: number; onClose: () => void }) {
  const { data, error } = useApi<Detail>(`/performance/${id}?city=${cityId}&days=${days}`, { tables: ['request_events'], city: cityId });
  const s = data?.stats;
  const maxDay = Math.max(1, ...(data?.daily ?? []).map((d) => d.completed + d.cancelled));
  const maxStars = Math.max(1, ...(data?.distribution ?? []).map((d) => d.n));

  return (
    <div className="fixed inset-y-0 right-0 z-30 mt-12 w-[30rem] max-w-full overflow-y-auto border-l border-border bg-card p-5 shadow-xl">
      <button className="absolute right-4 top-4 text-muted-foreground hover:text-foreground" onClick={onClose} aria-label="Cerrar">
        ✕
      </button>
      {error && <ErrorText>{error}</ErrorText>}
      {!s ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <div className={cn('flex h-16 w-16 flex-col items-center justify-center rounded-full', scoreClass(s.score, s.provisional))}>
              <span className="text-2xl font-bold leading-none">{s.score}</span>
              <span className="text-[10px]">puntaje</span>
            </div>
            <div>
              <h2 className="text-lg font-semibold">
                {VEHICLE_ICON[s.vehicle]} {s.display_name}
              </h2>
              <p className="text-sm text-muted-foreground">
                {s.provisional ? 'Puntaje provisional (menos de 3 servicios)' : `Últimos ${days} días`}
                {s.last_service_at && ` · último servicio ${dateTime(s.last_service_at)}`}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              ['Completados', String(s.completed)],
              ['Calificación', s.ratings_avg === null ? '—' : `★ ${s.ratings_avg.toFixed(1)}`],
              ['Aceptación', pct(s.acceptance_rate)],
              ['Rechazadas', String(s.rejected)],
              ['Vencidas', String(s.timeouts)],
              ['Cumplimiento', pct(s.completion_rate)],
              ['Responde en', dur(s.avg_accept_seconds)],
              ['Llega a recoger', dur(s.avg_to_pickup_seconds)],
              ['Entrega en', dur(s.avg_delivery_seconds)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-muted p-2">
                <p className="text-[11px] text-muted-foreground">{k}</p>
                <p className="font-semibold tabular-nums">{v}</p>
              </div>
            ))}
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Servicios por día</h3>
            <div className="flex h-24 items-end gap-px">
              {data.daily.map((d) => (
                <div key={d.day} className="flex h-full flex-1 flex-col justify-end" title={`${d.day}: ${d.completed} completados, ${d.cancelled} cancelados`}>
                  <div className="bg-red-300" style={{ height: `${(d.cancelled / maxDay) * 100}%` }} />
                  <div className="rounded-t-sm bg-primary/80" style={{ height: `${(d.completed / maxDay) * 100}%` }} />
                </div>
              ))}
            </div>
            <p className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>{data.daily[0]?.day.slice(5)}</span>
              <span>hoy</span>
            </p>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Calificaciones ({s.ratings_count})</h3>
            <div className="space-y-1">
              {data.distribution.map((d) => (
                <div key={d.stars} className="flex items-center gap-2 text-xs">
                  <span className="w-8 text-amber-500">{d.stars} ★</span>
                  <div className="h-2 flex-1 rounded bg-muted">
                    <div className="h-2 rounded bg-amber-400" style={{ width: `${(d.n / maxStars) * 100}%` }} />
                  </div>
                  <span className="w-6 text-right tabular-nums text-muted-foreground">{d.n}</span>
                </div>
              ))}
            </div>
            {data.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {data.tags.map((t) => {
                  const positive = RATING_TAGS.find((x) => x.key === t.tag)?.positive;
                  return (
                    <Badge key={t.tag} className={positive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                      {RATING_TAG_LABEL[t.tag] ?? t.tag} · {t.n}
                    </Badge>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Comentarios de clientes</h3>
            {data.ratings.filter((r) => r.comment).length === 0 && <p className="text-sm text-muted-foreground">Sin comentarios.</p>}
            <ul className="space-y-2">
              {data.ratings
                .filter((r) => r.comment)
                .map((r, i) => (
                  <li key={i} className="rounded-lg border border-border p-2 text-sm">
                    <p>
                      <span className="text-amber-500">{'★'.repeat(r.stars)}</span>
                      <span className="text-zinc-300">{'★'.repeat(5 - r.stars)}</span>{' '}
                      <span className="text-xs text-muted-foreground">{dateTime(r.created_at)}</span>
                    </p>
                    <p className="mt-0.5">“{r.comment}”</p>
                    <p className="text-xs text-muted-foreground">
                      {SERVICE_LABEL[r.service]}: {r.pickup_text}
                      {r.dropoff_text && ` → ${r.dropoff_text}`}
                    </p>
                  </li>
                ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Servicios recientes</h3>
            <ul className="divide-y divide-border text-sm">
              {data.recent.map((r) => (
                <li key={r.id} className="flex items-center gap-2 py-1.5">
                  <span className="w-24 shrink-0 text-xs text-muted-foreground">{dateTime(r.completed_at ?? r.assigned_at ?? '')}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {r.pickup_text}
                    {r.dropoff_text && ` → ${r.dropoff_text}`}
                  </span>
                  <span className="text-xs text-muted-foreground">{REQUEST_STATUS_LABEL[r.status]}</span>
                  {r.stars && <span className="text-xs text-amber-500">{r.stars}★</span>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
