import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { loadToken } from './api';
import { API_URL } from './config';

// WebSocket con reconexión. Llama onChange en cada aviso relevante para el
// conductor (ofertas y servicios suyos) y al reconectar.
export function useRealtime(enabled: boolean, onChange: (msg: { table?: string; event?: string | null }) => void) {
  const [online, setOnline] = useState(false);
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    if (!enabled) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let delay = 1000;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = async () => {
      const t = await loadToken();
      if (!t || closed) return;
      ws = new WebSocket(`${API_URL.replace(/^http/, 'ws')}/ws?token=${encodeURIComponent(t)}`);
      ws.onopen = () => {
        delay = 1000;
        setOnline(true);
        cb.current({});
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(String(e.data));
          if (msg.type === 'change' || msg.type === 'resync') cb.current(msg);
        } catch {}
      };
      ws.onclose = () => {
        setOnline(false);
        if (closed) return;
        timer = setTimeout(connect, delay);
        delay = Math.min(delay * 2, 20_000);
      };
    };
    void connect();

    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && ws?.readyState !== WebSocket.OPEN) {
        clearTimeout(timer);
        delay = 1000;
        void connect();
      }
    });
    return () => {
      closed = true;
      clearTimeout(timer);
      sub.remove();
      ws?.close();
    };
  }, [enabled]);

  return online;
}
