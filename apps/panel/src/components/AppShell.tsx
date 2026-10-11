'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import { useRealtime } from '@/lib/realtime';
import { useSession } from '@/lib/session';
import { cn } from './ui';

const NAV = [
  { href: '/', label: 'Tablero' },
  { href: '/conductores', label: 'Conductores' },
  { href: '/zonas', label: 'Zonas y grupos' },
  { href: '/metricas', label: 'Métricas' },
  { href: '/usuarios', label: 'Usuarios', adminOnly: true },
];

const CONN = {
  online: { label: 'En línea', dot: 'bg-ok' },
  connecting: { label: 'Conectando…', dot: 'bg-warn animate-pulse' },
  offline: { label: 'Sin conexión, reintentando…', dot: 'bg-danger animate-pulse' },
};

export function AppShell({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  const { me, loading, cities, cityId, setCityId, logout } = useShell();
  const { state } = useRealtime();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !me) router.replace('/login');
  }, [loading, me, router]);

  if (!me) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Cargando…</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-4 border-b border-border bg-card px-4">
        <span className="font-semibold">Despacho</span>
        {cities.length > 1 ? (
          <select
            className="h-8 rounded-md border border-border bg-card px-2 text-sm"
            value={cityId ?? ''}
            onChange={(e) => setCityId(e.target.value)}
            aria-label="Ciudad activa"
          >
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-sm text-muted-foreground">{cities[0]?.name ?? 'Sin ciudades asignadas'}</span>
        )}
        <nav className="flex gap-1">
          {NAV.filter((n) => !n.adminOnly || me.profile.role === 'admin').map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                'rounded-md px-2.5 py-1 text-sm',
                pathname === n.href ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {actions}
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground" title="Tiempo real">
            <span className={cn('h-2 w-2 rounded-full', CONN[state].dot)} />
            {CONN[state].label}
          </span>
          <Link href="/privacidad" className="text-xs text-muted-foreground hover:text-foreground">
            Tratamiento de datos
          </Link>
          <span className="text-xs text-muted-foreground">{me.profile.full_name}</span>
          <button className="text-xs text-muted-foreground hover:text-foreground" onClick={logout}>
            Salir
          </button>
        </div>
      </header>
      <main className="min-h-0 flex-1">{children}</main>
    </div>
  );
}

function useShell() {
  const s = useSession();
  return { ...s, cities: s.me?.cities ?? [] };
}
