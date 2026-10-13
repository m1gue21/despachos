'use client';

import { DEMO_PASSWORD, DEMO_STAFF } from '@despacho/shared';
import Link from 'next/link';
import { DEMO } from '@/lib/demo';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Logo } from '@/components/Logo';
import { Button, ErrorText, Field, Input } from '@/components/ui';
import { useSession } from '@/lib/session';

// Botones de acceso rápido con las cuentas del seed: solo en desarrollo, o si
// se fuerza con NEXT_PUBLIC_DEMO_LOGINS=1 (p. ej. un entorno de demostración).
const SHOW_DEMO = DEMO || process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_DEMO_LOGINS === '1';

export default function LoginPage() {
  const { login, me } = useSession();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submitRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (me) router.replace('/');
  }, [me, router]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const role = await login(email, password);
      router.replace(role === 'driver' ? '/conductor' : '/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo entrar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm">
        <div>
          <h1 className="text-xl">
            <Logo product="Despacho" />
          </h1>
          <p className="text-sm text-muted-foreground">Entra con tu cuenta de operador o de conductor.</p>
        </div>
        <Field label="Correo">
          <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </Field>
        <Field label="Contraseña">
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button ref={submitRef} className="w-full" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </Button>
        {SHOW_DEMO && (
          <div className="space-y-2 rounded-md border border-dashed border-border p-3">
            <p className="text-xs font-medium text-muted-foreground">Cuentas de prueba (solo desarrollo)</p>
            <div className="grid gap-1.5">
              {DEMO_STAFF.map((a) => (
                <button
                  key={a.email}
                  type="button"
                  onClick={() => {
                    setEmail(a.email);
                    setPassword(DEMO_PASSWORD);
                    setError(null);
                    submitRef.current?.focus();
                  }}
                  className={`flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm hover:bg-muted ${
                    email === a.email ? 'border-primary bg-primary/10' : 'border-border'
                  }`}
                >
                  <span className="font-medium">{a.label}</span>
                  <span className="text-xs text-muted-foreground">{a.hint}</span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">Rellena correo y contraseña; luego pulsa Entrar.</p>
          </div>
        )}
        <p className="text-center text-xs text-muted-foreground">
          <Link href="/privacidad" className="underline">
            Política de tratamiento de datos
          </Link>
        </p>
      </form>
    </div>
  );
}
