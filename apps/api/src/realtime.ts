// Tiempo real: LISTEN 'changes' en Postgres → WebSocket a los clientes que
// pueden ver ese cambio. Los avisos solo llevan ids; el cliente vuelve a
// pedir los datos al API (con RLS), así no se filtra nada por aquí.
import type { FastifyBaseLogger } from 'fastify';
import pg from 'pg';
import type { WebSocket } from 'ws';
import type { Session } from './auth.js';
import { config } from './config.js';

export interface ChangeEvent {
  table: string;
  op: string;
  id: string | null;
  city: string | null;
  type?: string;
  drivers?: string[];
}

interface Client {
  socket: WebSocket;
  session: Session;
  cities: Set<string>;
  driverId: string | null;
}

const clients = new Set<Client>();

export function addClient(c: Client) {
  clients.add(c);
  c.socket.on('close', () => clients.delete(c));
  c.socket.send(JSON.stringify({ type: 'hello' }));
}

function canSee(c: Client, e: ChangeEvent): boolean {
  if (c.session.role === 'admin') return true;
  if (c.session.role === 'operator') return e.table === 'zones' || (e.city !== null && c.cities.has(e.city));
  if (c.session.role === 'driver') {
    if (e.table === 'zones') return true;
    return c.driverId !== null && (e.drivers ?? []).includes(c.driverId);
  }
  return false;
}

export function broadcast(e: ChangeEvent) {
  // `event` es el tipo de request_event (created, rejected…) cuando aplica.
  const msg = JSON.stringify({ type: 'change', table: e.table, op: e.op, id: e.id, city: e.city, event: e.type ?? null });
  for (const c of clients) {
    if (c.socket.readyState === c.socket.OPEN && canSee(c, e)) c.socket.send(msg);
  }
}

// Mantiene un cliente LISTEN vivo; si se cae, reintenta con backoff y avisa a
// los clientes para que se resincronicen.
export function startListener(log: FastifyBaseLogger) {
  let delay = 1000;
  let stopped = false;
  let current: pg.Client | null = null;

  const connect = async () => {
    const client = new pg.Client({ connectionString: config.ownerUrl });
    current = client;
    client.on('notification', (n) => {
      if (n.channel !== 'changes' || !n.payload) return;
      try {
        broadcast(JSON.parse(n.payload) as ChangeEvent);
      } catch (err) {
        log.warn({ err }, 'aviso de tiempo real ilegible');
      }
    });
    client.on('error', (err) => log.error({ err }, 'LISTEN cayó'));
    client.on('end', () => {
      if (stopped) return;
      log.warn(`LISTEN desconectado, reintento en ${delay} ms`);
      setTimeout(() => void connect().catch(() => {}), delay);
      delay = Math.min(delay * 2, 30_000);
    });
    try {
      await client.connect();
      await client.query('listen changes');
      delay = 1000;
      // Tras reconectar pudo perderse algo: que todos recarguen.
      for (const c of clients) c.socket.send(JSON.stringify({ type: 'resync' }));
      log.info('tiempo real: escuchando cambios');
    } catch (err) {
      log.error({ err }, 'no se pudo abrir LISTEN');
      await client.end().catch(() => {});
    }
  };

  void connect();

  // Ping para detectar sockets muertos detrás de proxies.
  const ping = setInterval(() => {
    for (const c of clients) if (c.socket.readyState === c.socket.OPEN) c.socket.ping();
  }, 25_000);

  return async () => {
    stopped = true;
    clearInterval(ping);
    await current?.end().catch(() => {});
  };
}
