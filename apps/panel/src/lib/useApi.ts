'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { useRealtimeEvent } from './realtime';

interface Options {
  // Tablas cuyos cambios (en esta ciudad) disparan recarga.
  tables?: string[];
  city?: string | null;
  // Recarga solo si el cambio es de este id.
  id?: string | null;
  // Recarga periódica (ms), útil para relojes como la caducidad.
  intervalMs?: number;
}

// GET con recarga por eventos de tiempo real. Agrupa ráfagas de avisos.
export function useApi<T>(path: string | null, opts: Options = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => {
    if (!path) return;
    const mine = ++seq.current;
    setLoading(true);
    try {
      const d = await api<T>(path);
      if (mine === seq.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (mine === seq.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    setData(null);
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!opts.intervalMs || !path) return;
    const t = setInterval(() => void reload(), opts.intervalMs);
    return () => clearInterval(t);
  }, [opts.intervalMs, path, reload]);

  const tablesKey = (opts.tables ?? []).join(',');
  useRealtimeEvent((msg) => {
    if (!path) return;
    const relevant =
      msg.type === 'resync' ||
      (msg.type === 'change' &&
        tablesKey.split(',').includes(msg.table) &&
        (!opts.city || msg.city === null || msg.city === opts.city) &&
        (!opts.id || msg.id === opts.id));
    if (!relevant) return;
    if (pending.current) clearTimeout(pending.current);
    pending.current = setTimeout(() => void reload(), 150);
  });

  return { data, error, loading, reload, setData };
}
