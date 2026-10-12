// Conecta el API simulado: intercepta fetch y WebSocket hacia API_URL para
// que el resto del código funcione igual que contra el backend real.
import { userFromToken, citiesOf, myDriver, initSync, onChange, type MockChange, MockError, db } from './engine';
import { handle } from './routes';
import { startSim } from './sim';

let installed = false;

export function installMock(apiUrl: string) {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  initSync();
  db();

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(apiUrl)) return realFetch(input, init);
    const u = new URL(url);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const auth = headers.get('authorization');
    let body: Record<string, unknown> = {};
    if (typeof init?.body === 'string' && init.body) {
      try {
        body = JSON.parse(init.body);
      } catch {}
    }
    // Un poco de latencia para que se sienta como red.
    await new Promise((r) => setTimeout(r, 40 + Math.random() * 80));
    try {
      const data = handle({
        method: (init?.method ?? 'GET').toUpperCase(),
        path: u.pathname,
        q: u.searchParams,
        body,
        token: auth?.startsWith('Bearer ') ? auth.slice(7) : null,
      });
      return new Response(JSON.stringify(data ?? null), { status: 200, headers: { 'content-type': 'application/json' } });
    } catch (err) {
      if (err instanceof MockError) {
        return new Response(JSON.stringify({ error: { code: err.code, message: err.message } }), {
          status: err.status,
          headers: { 'content-type': 'application/json' },
        });
      }
      console.error('[demo] error en la ruta', u.pathname, err);
      return new Response(JSON.stringify({ error: { code: 'internal', message: 'Error interno de la demo' } }), { status: 500 });
    }
  };

  const RealWS = window.WebSocket;
  const wsBase = apiUrl.replace(/^http/, 'ws');

  // WebSocket falso: recibe los avisos del motor con el mismo filtro que el servidor.
  class FakeWebSocket extends EventTarget {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    CONNECTING = 0;
    OPEN = 1;
    CLOSING = 2;
    CLOSED = 3;
    readyState = 0;
    url: string;
    onopen: ((e: Event) => void) | null = null;
    onmessage: ((e: MessageEvent) => void) | null = null;
    onclose: ((e: CloseEvent) => void) | null = null;
    onerror: ((e: Event) => void) | null = null;
    private off: (() => void) | null = null;

    constructor(url: string | URL) {
      super();
      this.url = String(url);
      const token = new URL(this.url.replace(/^ws/, 'http')).searchParams.get('token');
      setTimeout(() => {
        const user = userFromToken(token);
        if (!user) {
          this.readyState = 3;
          this.onclose?.(new CloseEvent('close', { code: 4401 }));
          return;
        }
        this.readyState = 1;
        this.onopen?.(new Event('open'));
        this.emit({ type: 'hello' });
        this.off = onChange((c: MockChange) => {
          if (c.table === 'reset') return this.emit({ type: 'resync' });
          const fresh = userFromToken(token);
          if (!fresh || !this.canSee(fresh, c)) return;
          this.emit({ type: 'change', table: c.table, op: c.op, id: c.id, city: c.city, event: c.type });
        });
      }, 30);
    }

    private canSee(user: NonNullable<ReturnType<typeof userFromToken>>, c: MockChange) {
      if (user.role === 'admin') return true;
      if (user.role === 'operator') return c.table === 'zones' || (c.city !== null && citiesOf(user).includes(c.city));
      const d = myDriver(user);
      return c.table === 'zones' || (d !== null && c.drivers.includes(d.id));
    }

    private emit(msg: unknown) {
      if (this.readyState !== 1) return;
      this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(msg) }));
    }

    send() {}
    ping() {}
    close() {
      this.off?.();
      this.readyState = 3;
      this.onclose?.(new CloseEvent('close', { code: 1000 }));
    }
  }

  window.WebSocket = function (url: string | URL, protocols?: string | string[]) {
    if (String(url).startsWith(wsBase)) return new FakeWebSocket(url);
    return new RealWS(url, protocols);
  } as unknown as typeof WebSocket;
  Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });

  startSim();
}
