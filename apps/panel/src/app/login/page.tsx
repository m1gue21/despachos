'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import { Button, ErrorText, Field, Input } from '@/components/ui';
import { useSession } from '@/lib/session';

export default function LoginPage() {
  const { login, me } = useSession();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (me) router.replace('/');
  }, [me, router]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      router.replace('/');
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
          <h1 className="text-lg font-semibold">Despacho</h1>
          <p className="text-sm text-muted-foreground">Entra con tu cuenta de operador.</p>
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
        <Button className="w-full" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          <Link href="/privacidad" className="underline">
            Política de tratamiento de datos
          </Link>
        </p>
      </form>
    </div>
  );
}
