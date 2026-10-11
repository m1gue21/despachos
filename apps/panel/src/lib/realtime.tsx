'use client';

import type { RealtimeMessage } from '@despacho/shared';
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { API_URL, getToken } from './api';

export type ConnectionState = 'connecting' | 'online' | 'offline';
type Listener = (msg: RealtimeMessage) => void;

interface RealtimeValue {
  state: ConnectionState;
  subscribe: (fn: Listener) => () => void;
}

const RealtimeContext = createContext<RealtimeValue | null>(null);

// Un WebSocket por pestaña, con reconexión y backoff. Al reconectar emite
// 'resync' para que todas las vistas recarguen lo que pudieron perderse.
export function RealtimeProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [state, setState] = useState<ConnectionState>('connecting');
  const listeners = useRef(new Set<Listener>());

  useEffect(() => {
    if (!enabled) return;
    let ws: WebSocket | null = null;
    let delay = 1000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let closed = false;
    let connectedOnce = false;

    const emit = (msg: RealtimeMessage) => listeners.current.forEach((fn) => fn(msg));

    const connect = () => {
      const token = getToken();
      if (!token) return;
      setState('connecting');
      ws = new WebSocket(`${API_URL.replace(/^http/, 'ws')}/ws?token=${encodeURIComponent(token)}`);
      ws.onopen = () => {
        delay = 1000;
        setState('online');
        if (connectedOnce) emit({ type: 'resync' });
        connectedOnce = true;
      };
      ws.onmessage = (ev) => {
        try {
          emit(JSON.parse(ev.data as string) as RealtimeMessage);
        } catch {}
      };
      ws.onclose = () => {
        if (closed) return;
        setState('offline');
        timer = setTimeout(connect, delay);
        delay = Math.min(delay * 2, 15_000);
      };
    };
    connect();

    // Al volver a la pestaña o recuperar red, reconecta de inmediato.
    const wake = () => {
      if (ws && ws.readyState !== WebSocket.OPEN && ws.readyState !== WebSocket.CONNECTING) {
        clearTimeout(timer);
        delay = 1000;
        connect();
      }
    };
    window.addEventListener('online', wake);
    document.addEventListener('visibilitychange', wake);

    return () => {
      closed = true;
      clearTimeout(timer);
      window.removeEventListener('online', wake);
      document.removeEventListener('visibilitychange', wake);
      ws?.close();
    };
  }, [enabled]);

  const value: RealtimeValue = {
    state,
    subscribe: (fn) => {
      listeners.current.add(fn);
      return () => listeners.current.delete(fn);
    },
  };
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeValue {
  const v = useContext(RealtimeContext);
  if (!v) throw new Error('useRealtime fuera de RealtimeProvider');
  return v;
}

export function useRealtimeEvent(fn: Listener) {
  const { subscribe } = useRealtime();
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => subscribe((m) => ref.current(m)), [subscribe]);
}
