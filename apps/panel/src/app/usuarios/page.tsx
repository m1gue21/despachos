'use client';

import type { Zone } from '@despacho/shared';
import { type FormEvent, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Badge, Button, ErrorText, Field, Input, Select } from '@/components/ui';
import { api } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { useApi } from '@/lib/useApi';

interface Staff {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'operator';
  active: boolean;
  city_ids: string[];
}

export default function UsersPage() {
  const toast = useToast();
  const staff = useApi<Staff[]>('/staff');
  const cities = useApi<Zone[]>('/cities');
  const [form, setForm] = useState({ email: '', password: '', full_name: '', role: 'operator' as Staff['role'], city_ids: [] as string[] });
  const [error, setError] = useState<string | null>(null);
  const cityName = (id: string) => cities.data?.find((c) => c.id === id)?.name ?? '?';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api('/staff', { body: form });
      toast('Usuario creado');
      setForm({ email: '', password: '', full_name: '', role: 'operator', city_ids: [] });
      void staff.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear');
    }
  };

  return (
    <AppShell>
      <div className="mx-auto grid max-w-5xl gap-6 overflow-y-auto p-6 md:grid-cols-[1fr_20rem]" style={{ height: '100%' }}>
        <div>
          <h1 className="mb-3 text-lg font-semibold">Usuarios del panel</h1>
          {staff.error && <ErrorText>{staff.error}</ErrorText>}
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {(staff.data ?? []).map((s) => (
              <li key={s.id} className="px-4 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{s.full_name}</span>
                  <Badge className={s.role === 'admin' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'}>
                    {s.role === 'admin' ? 'Admin' : 'Operador'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {s.email}
                  {s.role === 'operator' && ` · ${s.city_ids.map(cityName).join(', ') || 'sin ciudades'}`}
                </p>
              </li>
            ))}
          </ul>
        </div>
        <form onSubmit={submit} className="h-fit space-y-3 rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Crear usuario</h2>
          <Field label="Nombre">
            <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
          </Field>
          <Field label="Correo">
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </Field>
          <Field label="Contraseña inicial (mín. 8)">
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={8} required />
          </Field>
          <Field label="Rol">
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Staff['role'] })}>
              <option value="operator">Operador</option>
              <option value="admin">Admin</option>
            </Select>
          </Field>
          {form.role === 'operator' && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Ciudades</p>
              {(cities.data ?? []).map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.city_ids.includes(c.id)}
                    onChange={(e) =>
                      setForm({ ...form, city_ids: e.target.checked ? [...form.city_ids, c.id] : form.city_ids.filter((x) => x !== c.id) })
                    }
                  />
                  {c.name}
                </label>
              ))}
            </div>
          )}
          <ErrorText>{error}</ErrorText>
          <Button className="w-full">Crear</Button>
        </form>
      </div>
    </AppShell>
  );
}
