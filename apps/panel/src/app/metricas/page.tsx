'use client';

import { useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Empty, Select } from '@/components/ui';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/useApi';

interface Metrics {
  days: number;
  totals: { total: number; completed: number; cancelled: number; avg_seconds_to_assign: number | null; median_seconds_to_assign: number | null };
  rejections: { timeouts: number; rejected: number; offered: number };
  perDay: { day: string; created: number; completed: number; cancelled: number }[];
  byHour: { hour: number; created: number }[];
  bySector: { sector: string; created: number; completed: number; avg_seconds_to_assign: number | null }[];
}

const mins = (s: number | null) => (s === null ? '—' : s < 60 ? `${s} s` : `${Math.round(s / 60)} min`);
const pct = (a: number, b: number) => (b === 0 ? '—' : `${Math.round((a / b) * 100)} %`);

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Bars({ data, label, value, max }: { data: { key: string; v: number }[]; label: string; value: string; max: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="mb-3 text-sm font-medium">{label}</p>
      {data.length === 0 ? (
        <Empty>Sin datos todavía.</Empty>
      ) : (
        <div className="flex h-40 items-end gap-1">
          {data.map((d) => (
            <div key={d.key} className="group flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${d.key}: ${d.v} ${value}`}>
              <span className="text-[10px] tabular-nums text-muted-foreground opacity-0 group-hover:opacity-100">{d.v}</span>
              <div className="w-full rounded-t bg-primary/80" style={{ height: max ? Math.max(d.v ? 2 : 0, Math.round((d.v / max) * 120)) : 0 }} />
              <span className="text-[10px] text-muted-foreground">{d.key}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MetricsPage() {
  const { cityId } = useSession();
  const [days, setDays] = useState(14);
  const { data: m, error } = useApi<Metrics>(cityId ? `/metrics?city=${cityId}&days=${days}` : null, {
    tables: ['request_events'],
    city: cityId,
  });

  const hours = Array.from({ length: 24 }, (_, h) => ({ key: String(h), v: m?.byHour.find((x) => x.hour === h)?.created ?? 0 }));
  const daily = (m?.perDay ?? []).map((d) => ({ key: d.day.slice(5), v: d.created }));

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-4 overflow-y-auto p-6" style={{ height: '100%' }}>
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Métricas</h1>
          <Select className="w-40" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={1}>Hoy</option>
            <option value={7}>Últimos 7 días</option>
            <option value={14}>Últimos 14 días</option>
            <option value={30}>Últimos 30 días</option>
          </Select>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        {m && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Solicitudes" value={String(m.totals.total)} />
              <Stat label="Completadas" value={pct(m.totals.completed, m.totals.total)} sub={`${m.totals.completed} de ${m.totals.total}`} />
              <Stat label="Canceladas" value={pct(m.totals.cancelled, m.totals.total)} sub={`${m.totals.cancelled}`} />
              <Stat
                label="Tiempo hasta asignar"
                value={mins(m.totals.avg_seconds_to_assign)}
                sub={`mediana ${mins(m.totals.median_seconds_to_assign)}`}
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Bars label="Solicitudes por día" value="solicitudes" data={daily} max={Math.max(0, ...daily.map((d) => d.v))} />
              <Bars label="Horas pico" value="solicitudes" data={hours} max={Math.max(0, ...hours.map((d) => d.v))} />
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="mb-2 text-sm font-medium">Por sector de recogida</p>
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1">Sector</th>
                    <th className="py-1 text-right">Solicitudes</th>
                    <th className="py-1 text-right">Completadas</th>
                    <th className="py-1 text-right">Tiempo hasta asignar</th>
                  </tr>
                </thead>
                <tbody>
                  {m.bySector.map((s) => (
                    <tr key={s.sector} className="border-t border-border">
                      <td className="py-1">{s.sector}</td>
                      <td className="py-1 text-right tabular-nums">{s.created}</td>
                      <td className="py-1 text-right tabular-nums">{pct(s.completed, s.created)}</td>
                      <td className="py-1 text-right tabular-nums">{mins(s.avg_seconds_to_assign)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Ofertas: {m.rejections.offered} · rechazadas {m.rejections.rejected} · vencidas {m.rejections.timeouts}
            </p>
          </>
        )}
      </div>
    </AppShell>
  );
}
