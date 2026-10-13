'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { useRealtime } from '@/lib/realtime';
import { useSession } from '@/lib/session';
import { Logo } from './Logo';
import { cn } from './ui';

const NAV = [
  { href: '/', label: 'Tablero' },
  { href: '/conductores', label: 'Conductores' },
  { href: '/zonas', label: 'Zonas y grupos' },
  { href: '/metricas', label: 'Métricas' },
  { href: '/desempeno', label: 'Desempeño', adminOnly: true },
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
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [pathname]);

  useEffect(() => {
    if (!loading && !me) router.replace('/login');
  }, [loading, me, router]);

  if (!me) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Cargando…</div>;
  }

  const nav = NAV.filter((n) => !n.adminOnly || me.profile.role === 'admin');

  return (
    <div className="flex h-full flex-col">
      <header className="relative flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card px-3 sm:gap-3 sm:px-4">
        {/* Menú hamburguesa bajo xl: el menú completo no cabe en una línea. */}
        <button
          className="-ml-1 flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted xl:hidden"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Menú"
          aria-expanded={menuOpen}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <Link href="/" className="hidden shrink-0 sm:inline-flex" aria-label="Inicio">
          <Logo product="Despacho" />
        </Link>
        {cities.length > 1 ? (
          <select
            className="h-8 min-w-0 max-w-[9rem] rounded-md border border-border bg-card px-2 text-sm"
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
          <span className="truncate text-sm text-muted-foreground">{cities[0]?.name ?? 'Sin ciudades asignadas'}</span>
        )}
        <nav className="hidden gap-1 xl:flex">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                'whitespace-nowrap rounded-md px-2.5 py-1 text-sm',
                pathname === n.href ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-3">
          {actions}
          <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground" title={CONN[state].label}>
            <span className={cn('h-2 w-2 rounded-full', CONN[state].dot)} />
            <span className="hidden lg:inline">{CONN[state].label}</span>
          </span>
          <Link href="/privacidad" className="hidden whitespace-nowrap text-xs text-muted-foreground hover:text-foreground 2xl:inline">
            Tratamiento de datos
          </Link>
          <span className="hidden max-w-[10rem] truncate text-xs text-muted-foreground xl:inline">{me.profile.full_name}</span>
          <button className="hidden text-xs text-muted-foreground hover:text-foreground xl:inline" onClick={logout}>
            Salir
          </button>
        </div>

        {menuOpen && (
          <>
            <div className="fixed inset-0 top-12 z-40 bg-black/20 xl:hidden" onClick={() => setMenuOpen(false)} />
            <div className="absolute left-0 top-12 z-50 w-72 max-w-[85vw] rounded-br-lg border-b border-r border-border bg-card p-2 shadow-lg xl:hidden">
              <p className="px-3 py-2 text-xs text-muted-foreground">{me.profile.full_name}</p>
              {nav.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  onClick={() => setMenuOpen(false)}
                  className={cn('block rounded-md px-3 py-2.5 text-sm', pathname === n.href ? 'bg-muted font-medium' : 'hover:bg-muted')}
                >
                  {n.label}
                </Link>
              ))}
              <div className="my-2 border-t border-border" />
              <Link href="/privacidad" className="block rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
                Tratamiento de datos
              </Link>
              <button className="block w-full rounded-md px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted" onClick={logout}>
                Salir
              </button>
            </div>
          </>
        )}
      </header>
      <main className="min-h-0 flex-1">{children}</main>
    </div>
  );
}

function useShell() {
  const s = useSession();
  return { ...s, cities: s.me?.cities ?? [] };
}
