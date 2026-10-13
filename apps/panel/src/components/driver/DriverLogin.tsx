'use client';

import { DEMO_DRIVERS, DEMO_PASSWORD } from '@despacho/shared';
import Link from 'next/link';
import { DEMO } from '@/lib/demo';
import { type FormEvent, useState } from 'react';
import { api, driverClient } from '@/lib/api';
import { Logo } from '../Logo';
import { Button, ErrorText, Field, Input, cn } from '../ui';

const SHOW_DEMO = DEMO || process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_DEMO_LOGINS === '1';

export function DriverLogin({ onLogged }: { onLogged: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ token: string; profile: { role: string } }>('/auth/login', { body: { email, password } });
      if (res.profile.role !== 'driver') throw new Error('Esta página es para conductores. Los operadores entran por el panel.');
      driverClient.setToken(res.token);
      onLogged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo entrar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-4 p-6">
      <div>
        <h1 className="text-2xl">
          <Logo product="Conductor" />
        </h1>
        <p className="text-sm text-muted-foreground">Entra con el correo y la contraseña que te dio el operador.</p>
      </div>
      <Field label="Correo">
        <Input className="h-12 text-base" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      <Field label="Contraseña">
        <Input
          className="h-12 text-base"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </Field>
      <ErrorText>{error}</ErrorText>
      <Button className="h-12 text-base" disabled={busy}>
        {busy ? 'Entrando…' : 'Entrar'}
      </Button>
      {SHOW_DEMO && (
        <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
          <p className="text-xs font-medium text-muted-foreground">Cuentas de prueba (solo desarrollo)</p>
          {DEMO_DRIVERS.map((a) => (
            <button
              key={a.email}
              type="button"
              onClick={() => {
                setEmail(a.email);
                setPassword(DEMO_PASSWORD);
                setError(null);
              }}
              className={cn(
                'flex w-full items-center justify-between rounded-lg border px-3 py-3 text-left',
                email === a.email ? 'border-primary bg-primary/10' : 'border-border bg-card',
              )}
            >
              <span className="font-medium">{a.label}</span>
              <span className="text-xs text-muted-foreground">{a.hint}</span>
            </button>
          ))}
        </div>
      )}
      <Link href="/privacidad" className="text-center text-xs text-muted-foreground underline">
        Política de tratamiento de datos
      </Link>
    </form>
  );
}
