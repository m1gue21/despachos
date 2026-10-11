'use client';

import {
  type DriverRow,
  SERVICE_LABEL,
  SERVICE_TYPES,
  type ServiceType,
  VEHICLE_LABEL,
  VEHICLE_TYPES,
  type VehicleType,
  type Zone,
} from '@despacho/shared';
import { type FormEvent, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { DRIVER_DOT } from '@/components/DriverPanel';
import { DriversMap } from '@/components/DriversMap';
import { Badge, Button, Dialog, ErrorText, Field, Input, Select, cn } from '@/components/ui';
import { api } from '@/lib/api';
import { phonePretty } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useToast } from '@/lib/toast';
import { useApi } from '@/lib/useApi';

interface Form {
  display_name: string;
  phone: string;
  vehicle: VehicleType;
  plate: string;
  service_types: ServiceType[];
  active: boolean;
}

const EMPTY: Form = { display_name: '', phone: '', vehicle: 'moto', plate: '', service_types: ['delivery'], active: true };

export default function DriversPage() {
  const { cityId, city } = useSession();
  const toast = useToast();
  // Presencia incluida: la vista de mapa se actualiza en vivo; la caducidad
  // depende del reloj, por eso también recarga cada 30 s.
  const drivers = useApi<DriverRow[]>(cityId ? `/drivers?city=${cityId}&all=1` : null, {
    tables: ['drivers', 'driver_presence', 'requests'],
    city: cityId,
    intervalMs: 30_000,
  });
  const zones = useApi<Zone[]>(cityId ? `/zones?city=${cityId}` : null, { tables: ['zones'] });
  const sectors = (zones.data ?? []).filter((z) => z.level === 'sector');
  const [view, setView] = useState<'lista' | 'mapa'>('lista');
  useEffect(() => {
    try {
      if (localStorage.getItem('despacho.conductores.vista') === 'mapa') setView('mapa');
    } catch {}
  }, []);
  const changeView = (v: 'lista' | 'mapa') => {
    setView(v);
    try {
      localStorage.setItem('despacho.conductores.vista', v);
    } catch {}
  };
  const [editing, setEditing] = useState<DriverRow | 'new' | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [inviting, setInviting] = useState<DriverRow | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);

  const openForm = (d: DriverRow | 'new') => {
    setEditing(d);
    setError(null);
    setForm(
      d === 'new'
        ? EMPTY
        : {
            display_name: d.display_name,
            phone: d.phone,
            vehicle: d.vehicle,
            plate: d.plate ?? '',
            service_types: d.service_types,
            active: d.active,
          },
    );
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const body = { ...form, plate: form.plate.trim() || null, city_zone_id: cityId };
    try {
      if (editing === 'new') await api('/drivers', { body });
      else if (editing) await api(`/drivers/${editing.id}`, { method: 'PATCH', body });
      toast('Conductor guardado');
      setEditing(null);
      void drivers.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    }
  };

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    if (!inviting) return;
    try {
      const c = await api<{ email: string; password: string }>(`/drivers/${inviting.id}/invite`, {
        body: { email: inviteEmail },
      });
      setCredentials(c);
      setInviting(null);
      void drivers.reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo invitar', 'error');
    }
  };

  const toggleService = (s: ServiceType) =>
    setForm((f) => ({
      ...f,
      service_types: f.service_types.includes(s) ? f.service_types.filter((x) => x !== s) : [...f.service_types, s],
    }));

  return (
    <AppShell>
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center gap-4 border-b border-border bg-card px-6 py-3">
          <h1 className="text-lg font-semibold">Conductores</h1>
          <div className="flex rounded-md border border-border p-0.5" role="tablist" aria-label="Vista">
            {(['lista', 'mapa'] as const).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                onClick={() => changeView(v)}
                className={cn(
                  'rounded px-3 py-1 text-sm font-medium',
                  view === v ? 'bg-foreground text-white' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {v === 'lista' ? 'Lista' : 'Mapa'}
              </button>
            ))}
          </div>
          <Button className="ml-auto" onClick={() => openForm('new')}>
            Agregar conductor
          </Button>
        </div>
        <div className="min-h-0 flex-1">
          {view === 'mapa' ? (
            <DriversMap drivers={drivers.data ?? []} sectors={sectors} city={city} />
          ) : (
            <div className="h-full overflow-y-auto">
              <div className="mx-auto max-w-5xl p-6">
                <table className="w-full overflow-hidden rounded-lg border border-border bg-card text-sm">
                  <thead className="bg-muted text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Nombre</th>
                      <th className="px-3 py-2">Teléfono</th>
                      <th className="px-3 py-2">Vehículo</th>
                      <th className="px-3 py-2">Servicios</th>
                      <th className="px-3 py-2">App</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {(drivers.data ?? []).map((d) => (
                      <tr key={d.id} className={cn('border-t border-border', !d.active && 'opacity-50')}>
                        <td className="px-3 py-2">
                          <span className={cn('mr-2 inline-block h-2 w-2 rounded-full', DRIVER_DOT[d.status])} />
                          {d.display_name} {!d.active && <Badge className="bg-zinc-100">inactivo</Badge>}
                        </td>
                        <td className="px-3 py-2">{phonePretty(d.phone)}</td>
                        <td className="px-3 py-2">
                          {VEHICLE_LABEL[d.vehicle]} {d.plate && <span className="text-muted-foreground">· {d.plate}</span>}
                        </td>
                        <td className="px-3 py-2">{d.service_types.map((s) => SERVICE_LABEL[s]).join(', ')}</td>
                        <td className="px-3 py-2">
                          {d.has_app ? (
                            <Badge className="bg-green-100 text-green-700">con app</Badge>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setInviting(d);
                                setInviteEmail('');
                              }}
                            >
                              Invitar a la app
                            </Button>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button size="sm" variant="ghost" onClick={() => openForm(d)}>
                            Editar
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Nuevo conductor' : 'Editar conductor'}
      >
        <form onSubmit={save} className="space-y-3">
          <Field label="Nombre">
            <Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} required />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Celular">
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required inputMode="tel" />
            </Field>
            <Field label="Placa">
              <Input value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value.toUpperCase() })} />
            </Field>
          </div>
          <Field label="Vehículo">
            <Select value={form.vehicle} onChange={(e) => setForm({ ...form, vehicle: e.target.value as VehicleType })}>
              {VEHICLE_TYPES.map((v) => (
                <option key={v} value={v}>
                  {VEHICLE_LABEL[v]}
                </option>
              ))}
            </Select>
          </Field>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Servicios que presta</p>
            <div className="flex gap-3">
              {SERVICE_TYPES.map((s) => (
                <label key={s} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={form.service_types.includes(s)} onChange={() => toggleService(s)} />
                  {SERVICE_LABEL[s]}
                </label>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            Activo
          </label>
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button>Guardar</Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={inviting !== null} onClose={() => setInviting(null)} title={`Invitar a ${inviting?.display_name ?? ''}`}>
        <form onSubmit={invite} className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Se crea una cuenta para la app con una contraseña temporal. Entrégasela al conductor por un canal privado.
          </p>
          <Field label="Correo del conductor">
            <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required autoFocus />
          </Field>
          <div className="flex justify-end">
            <Button>Crear acceso</Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={credentials !== null} onClose={() => setCredentials(null)} title="Acceso creado">
        <div className="space-y-2 text-sm">
          <p>Comparte estos datos con el conductor. La contraseña no se vuelve a mostrar.</p>
          <p className="rounded-md bg-muted p-3 font-mono">
            {credentials?.email}
            <br />
            {credentials?.password}
          </p>
        </div>
      </Dialog>
    </AppShell>
  );
}
