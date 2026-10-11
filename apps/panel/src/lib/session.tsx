'use client';

import type { DriverRow, Profile, Zone } from '@despacho/shared';
import { useRouter } from 'next/navigation';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, onUnauthorized, setToken } from './api';

interface Me {
  profile: Profile;
  cities: Zone[];
  driver: DriverRow | null;
}

interface SessionValue {
  me: Me | null;
  loading: boolean;
  cityId: string | null;
  city: Zone | null;
  setCityId: (id: string) => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);
const CITY_KEY = 'despacho.city';

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [cityId, setCityIdState] = useState<string | null>(null);
  const router = useRouter();

  const applyMe = useCallback((m: Me) => {
    setMe(m);
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(CITY_KEY);
    } catch {}
    const id = m.cities.find((c) => c.id === saved)?.id ?? m.cities[0]?.id ?? null;
    setCityIdState(id);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setMe(null);
    router.replace('/login');
  }, [router]);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api<Me>('/me')
      .then(applyMe)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, [applyMe]);

  useEffect(() => {
    const handler = () => logout();
    onUnauthorized.addEventListener('401', handler);
    return () => onUnauthorized.removeEventListener('401', handler);
  }, [logout]);

  const value = useMemo<SessionValue>(
    () => ({
      me,
      loading,
      cityId,
      city: me?.cities.find((c) => c.id === cityId) ?? null,
      setCityId: (id) => {
        setCityIdState(id);
        try {
          localStorage.setItem(CITY_KEY, id);
        } catch {}
      },
      login: async (email, password) => {
        const res = await api<Me & { token: string }>('/auth/login', { body: { email, password } });
        if (res.profile.role === 'driver') throw new Error('Los conductores usan la app móvil');
        setToken(res.token);
        applyMe(res);
      },
      logout,
    }),
    [me, loading, cityId, applyMe, logout],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error('useSession fuera de SessionProvider');
  return v;
}
