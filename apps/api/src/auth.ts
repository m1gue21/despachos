import type { UserRole } from '@despacho/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { SignJWT, jwtVerify } from 'jose';
import { config } from './config.js';
import { HttpError } from './errors.js';

const key = new TextEncoder().encode(config.jwtSecret);

export interface Session {
  userId: string;
  role: UserRole;
}

declare module 'fastify' {
  interface FastifyRequest {
    session: Session;
  }
}

export async function signSession(s: Session): Promise<string> {
  return new SignJWT({ role: s.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(s.userId)
    .setIssuedAt()
    .setExpirationTime(config.jwtTtl)
    .sign(key);
}

export async function verifyToken(token: string): Promise<Session> {
  const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
  if (!payload.sub || typeof payload.role !== 'string') throw new Error('token inválido');
  return { userId: payload.sub, role: payload.role as UserRole };
}

// preHandler: exige Bearer válido. El rol del token es solo informativo
// para el cliente; los permisos reales los decide la base con app.user_id.
export async function requireAuth(req: FastifyRequest, _reply: FastifyReply) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new HttpError(401, 'unauthorized', 'Sesión requerida');
  try {
    req.session = await verifyToken(token);
  } catch {
    throw new HttpError(401, 'unauthorized', 'Sesión vencida o inválida');
  }
}

export function requireRole(...roles: UserRole[]) {
  return async (req: FastifyRequest) => {
    if (!roles.includes(req.session.role)) throw new HttpError(403, 'forbidden', 'No tienes permiso para esto');
  };
}
