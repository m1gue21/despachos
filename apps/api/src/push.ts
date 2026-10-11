// Push de ofertas por FCM HTTP v1. Se activa solo si FCM_SERVER_CREDENTIALS
// apunta a (o contiene) el JSON de una cuenta de servicio de Firebase.
// Sin credenciales, la app recibe las ofertas por WebSocket y polling.
import { readFileSync } from 'node:fs';
import type { FastifyBaseLogger } from 'fastify';
import { SignJWT, importPKCS8 } from 'jose';
import { ownerPool } from './db.js';

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

function loadCredentials(): ServiceAccount | null {
  const raw = process.env.FCM_SERVER_CREDENTIALS?.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw.startsWith('{') ? raw : readFileSync(raw, 'utf8')) as ServiceAccount;
  } catch {
    return null;
  }
}

const creds = loadCredentials();
let cached: { token: string; exp: number } | null = null;

async function accessToken(sa: ServiceAccount): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const key = await importPKCS8(sa.private_key, 'RS256');
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/firebase.messaging' })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(sa.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) throw new Error(`token FCM: ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: data.access_token, exp: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

export const pushEnabled = creds !== null;

export async function sendOfferPush(driverId: string, requestId: string, log: FastifyBaseLogger): Promise<void> {
  if (!creds) return;
  try {
    const { rows: tokens } = await ownerPool.query<{ token: string }>(`select token from push_tokens where driver_id = $1`, [driverId]);
    if (tokens.length === 0) return;
    const { rows } = await ownerPool.query<{ pickup_text: string }>(`select pickup_text from requests where id = $1`, [requestId]);
    const bearer = await accessToken(creds);
    for (const { token } of tokens) {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${creds.project_id}/messages:send`, {
        method: 'POST',
        headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          message: {
            token,
            // Sin datos del cliente en el push.
            notification: { title: 'Nuevo servicio', body: rows[0]?.pickup_text ?? 'Tienes una oferta' },
            data: { type: 'offer', request_id: requestId },
            android: { priority: 'HIGH', ttl: '60s', notification: { channel_id: 'offers', sound: 'default' } },
          },
        }),
      });
      // Token inválido o desinstalado: se borra.
      if (res.status === 404 || res.status === 400) {
        await ownerPool.query(`delete from push_tokens where driver_id = $1 and token = $2`, [driverId, token]);
      } else if (!res.ok) {
        log.warn(`push FCM falló: ${res.status}`);
      }
    }
  } catch (err) {
    log.warn({ reason: err instanceof Error ? err.message : String(err) }, 'push FCM falló');
  }
}
