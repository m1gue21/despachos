'use client';

import { useEffect, useRef, useState } from 'react';
import { API_URL, driverClient } from './api';

// WebSocket del conductor (token propio) con reconexión. onChange se llama en
// cada aviso suyo y al reconectar, para recargar ofertas y servicios.
export function useDriverRealtime(enabled: boolean, onChange: () => void) {
  const [online, setOnline] = useState(false);
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    if (!enabled) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let delay = 1000;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const token = driverClient.getToken();
      if (!token || closed) return;
      ws = new WebSocket(`${API_URL.replace(/^http/, 'ws')}/ws?token=${encodeURIComponent(token)}`);
      ws.onopen = () => {
        delay = 1000;
        setOnline(true);
        cb.current();
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(String(e.data));
          if (msg.type === 'change' || msg.type === 'resync') cb.current();
        } catch {}
      };
      ws.onclose = () => {
        setOnline(false);
        if (closed) return;
        timer = setTimeout(connect, delay);
        delay = Math.min(delay * 2, 20_000);
      };
    };
    connect();

    const wake = () => {
      if (document.visibilityState === 'visible' && ws?.readyState !== WebSocket.OPEN && ws?.readyState !== WebSocket.CONNECTING) {
        clearTimeout(timer);
        delay = 1000;
        connect();
      }
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    return () => {
      closed = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
      ws?.close();
    };
  }, [enabled]);

  return online;
}
