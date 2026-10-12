'use client';

import type { WhatsappGroup, Zone } from '@despacho/shared';
import { type FormEvent, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { MapView } from '@/components/MapView';
import { Badge, Button, Empty, ErrorText, Field, Input, Select, cn } from '@/components/ui';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useToast } from '@/lib/toast';
import { useApi } from '@/lib/useApi';

type Mode = 'center' | 'polygon' | null;

interface Draft {
  id: string | null; // null = sector nuevo
  name: string;
  aliases: string;
  active: boolean;
  center: { lat: number; lng: number } | null;
  polygon: [number, number][] | null;
}

const KIND_LABEL = { delivery: 'Domicilios', ride: 'Transporte', mixed: 'Mixto' } as const;

export default function ZonesPage() {
  const { me, cityId, city } = useSession();
  const toast = useToast();
  const isAdmin = me?.profile.role === 'admin';
  const zones = useApi<Zone[]>(cityId ? `/zones?city=${cityId}&all=1` : null, { tables: ['zones'] });
  const groups = useApi<WhatsappGroup[]>(cityId ? `/groups?city=${cityId}` : null);
  const sectors = (zones.data ?? []).filter((z) => z.level === 'sector');

  const [draft, setDraft] = useState<Draft | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [error, setError] = useState<string | null>(null);
  const [newGroup, setNewGroup] = useState({ name: '', kind: 'mixed' as WhatsappGroup['kind'] });
  const [newCity, setNewCity] = useState('');

  const edit = (z: Zone | null) => {
    setError(null);
    setMode(null);
    setDraft(
      z
        ? {
            id: z.id,
            name: z.name,
            aliases: z.aliases.join(', '),
            active: z.active,
            center: z.center_lat != null && z.center_lng != null ? { lat: z.center_lat, lng: z.center_lng } : null,
            polygon: z.geom ? (z.geom.coordinates[0]!.slice(0, -1) as [number, number][]) : null,
          }
        : { id: null, name: '', aliases: '', active: true, center: null, polygon: null },
    );
  };

  const onMapClick = ({ lng, lat }: { lng: number; lat: number }) => {
    if (!draft || !mode) return;
    if (mode === 'center') {
      setDraft({ ...draft, center: { lat, lng } });
      setMode(null);
    } else setDraft({ ...draft, polygon: [...(draft.polygon ?? []), [lng, lat]] });
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft || !cityId) return;
    setError(null);
    if (draft.polygon && draft.polygon.length > 0 && draft.polygon.length < 3) {
      setError('El polígono necesita al menos 3 puntos');
      return;
    }
    const body = {
      name: draft.name,
      aliases: draft.aliases.split(',').map((a) => a.trim().toLowerCase()).filter(Boolean),
      active: draft.active,
      center: draft.center,
      polygon: draft.polygon && draft.polygon.length >= 3 ? draft.polygon : null,
    };
    try {
      if (draft.id) await api(`/zones/${draft.id}`, { method: 'PATCH', body });
      else await api('/zones', { body: { ...body, parent_id: cityId } });
      toast('Sector guardado');
      setDraft(null);
      setMode(null);
      void zones.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    }
  };

  const addGroup = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api('/groups', { body: { city_zone_id: cityId, ...newGroup } });
      setNewGroup({ name: '', kind: 'mixed' });
      void groups.reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo crear', 'error');
    }
  };

  const toggleGroup = async (g: WhatsappGroup) => {
    await api(`/groups/${g.id}`, { method: 'PATCH', body: { active: !g.active } }).catch(() => {});
    void groups.reload();
  };

  const addCity = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api('/zones', { body: { name: newCity, parent_id: null, center: null } });
      toast('Ciudad creada. Vuelve a entrar para verla en el selector.', 'info');
      setNewCity('');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo crear', 'error');
    }
  };

  return (
    <AppShell>
      <div className="h-full overflow-y-auto lg:grid lg:grid-cols-[24rem_minmax(0,1fr)] lg:overflow-hidden">
        <aside className="space-y-6 border-b border-border bg-card p-4 lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Sectores de {city?.name}</h2>
              {isAdmin && (
                <Button size="sm" variant="outline" onClick={() => edit(null)}>
                  Agregar
                </Button>
              )}
            </div>
            {!isAdmin && <p className="mb-2 text-xs text-muted-foreground">Solo el administrador edita zonas.</p>}
            {sectors.length === 0 && <Empty>Esta ciudad aún no tiene sectores.</Empty>}
            <ul className="divide-y divide-border rounded-md border border-border">
              {sectors.map((s) => (
                <li key={s.id}>
                  <button
                    disabled={!isAdmin}
                    onClick={() => edit(s)}
                    className={cn('w-full px-3 py-2 text-left text-sm hover:bg-muted disabled:hover:bg-transparent', draft?.id === s.id && 'bg-blue-50')}
                  >
                    <span className={cn(!s.active && 'line-through opacity-50')}>{s.name}</span>
                    {s.geom && <Badge className="ml-2 bg-blue-100 text-blue-700">polígono</Badge>}
                    {s.center_lat == null && <Badge className="ml-2 bg-orange-100 text-orange-700">sin centro</Badge>}
                    {s.aliases.length > 0 && <p className="truncate text-xs text-muted-foreground">{s.aliases.join(', ')}</p>}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {draft && (
            <form onSubmit={save} className="space-y-3 rounded-md border border-primary/40 p-3">
              <h3 className="text-sm font-semibold">{draft.id ? 'Editar sector' : 'Nuevo sector'}</h3>
              <Field label="Nombre">
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required />
              </Field>
              <Field label="Alias (separados por coma)">
                <Input value={draft.aliases} onChange={(e) => setDraft({ ...draft, aliases: e.target.value })} placeholder="el cable, la torre" />
              </Field>
              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" variant={mode === 'center' ? 'primary' : 'outline'} onClick={() => setMode(mode === 'center' ? null : 'center')}>
                    {mode === 'center' ? 'Haz clic en el mapa…' : 'Marcar centro'}
                  </Button>
                  <span className="text-muted-foreground">
                    {draft.center ? `${draft.center.lat.toFixed(4)}, ${draft.center.lng.toFixed(4)}` : 'sin centro'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" variant={mode === 'polygon' ? 'primary' : 'outline'} onClick={() => setMode(mode === 'polygon' ? null : 'polygon')}>
                    {mode === 'polygon' ? 'Terminar dibujo' : 'Dibujar polígono'}
                  </Button>
                  <span className="text-muted-foreground">{draft.polygon?.length ?? 0} puntos</span>
                  {draft.polygon && draft.polygon.length > 0 && (
                    <button type="button" className="text-danger underline" onClick={() => setDraft({ ...draft, polygon: null })}>
                      borrar
                    </button>
                  )}
                </div>
                <p className="text-muted-foreground">El polígono es opcional: sin él, el sector se elige a mano o por cercanía al centro.</p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
                Activo
              </label>
              <ErrorText>{error}</ErrorText>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => { setDraft(null); setMode(null); }}>
                  Cancelar
                </Button>
                <Button>Guardar</Button>
              </div>
            </form>
          )}

          <section>
            <h2 className="mb-2 text-sm font-semibold">Grupos de WhatsApp</h2>
            <p className="mb-2 text-xs text-muted-foreground">Solo sirven para etiquetar de dónde llegó cada solicitud.</p>
            <ul className="mb-2 divide-y divide-border rounded-md border border-border">
              {(groups.data ?? []).map((g) => (
                <li key={g.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className={cn('flex-1', !g.active && 'line-through opacity-50')}>{g.name}</span>
                  <Badge className="bg-muted">{KIND_LABEL[g.kind]}</Badge>
                  <button className="text-xs text-muted-foreground underline" onClick={() => toggleGroup(g)}>
                    {g.active ? 'desactivar' : 'activar'}
                  </button>
                </li>
              ))}
            </ul>
            <form onSubmit={addGroup} className="flex gap-1">
              <Input placeholder="Nombre del grupo" value={newGroup.name} onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })} required />
              <Select className="w-32" value={newGroup.kind} onChange={(e) => setNewGroup({ ...newGroup, kind: e.target.value as WhatsappGroup['kind'] })}>
                {Object.entries(KIND_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
              <Button>Agregar</Button>
            </form>
          </section>

          {isAdmin && (
            <section>
              <h2 className="mb-2 text-sm font-semibold">Nueva ciudad</h2>
              <p className="mb-2 text-xs text-muted-foreground">Abrir otra ciudad es solo datos: créala, agrégale sectores, grupos y operadores.</p>
              <form onSubmit={addCity} className="flex gap-1">
                <Input placeholder="Ej.: Chinchiná" value={newCity} onChange={(e) => setNewCity(e.target.value)} required />
                <Button>Crear</Button>
              </form>
            </section>
          )}
        </aside>
        <section className={cn('relative h-[60vh] lg:h-auto lg:min-h-0', mode && 'cursor-crosshair')}>
          <MapView
            city={city}
            sectors={sectors}
            drivers={[]}
            requests={[]}
            onMapClick={onMapClick}
            draftPolygon={draft?.polygon ?? (draft?.center ? [[draft.center.lng, draft.center.lat]] : null)}
          />
          {mode && (
            <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-md bg-foreground px-3 py-1.5 text-xs text-white shadow">
              {mode === 'center' ? 'Clic en el mapa para marcar el centro del sector' : 'Clic para agregar puntos del polígono'}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
