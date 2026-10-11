import { join } from 'node:path';

// Carga el .env de la raíz del monorepo si existe.
try {
  process.loadEnvFile(join(import.meta.dirname, '../../../.env'));
} catch {
  // Sin .env: se usan las variables del entorno y los valores por defecto.
}

const devSecret = 'dev-secret-no-usar-en-produccion-0123456789';

export const config = {
  port: Number(process.env.API_PORT ?? 4000),
  host: process.env.API_HOST ?? '0.0.0.0',
  // Conexión de dueño: jobs del sistema y LISTEN. Nunca atiende peticiones de usuarios.
  ownerUrl: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5433/despacho',
  // Conexión con RLS: todas las peticiones de usuarios.
  appUrl: process.env.APP_DATABASE_URL ?? 'postgres://app_user:app_user_dev@127.0.0.1:5433/despacho',
  jwtSecret: process.env.JWT_SECRET || devSecret,
  jwtTtl: process.env.JWT_TTL ?? '12h',
  anthropicKey: process.env.ANTHROPIC_API_KEY || null,
  anthropicModel: process.env.ANTHROPIC_MODEL || null,
  parseRatePerMinute: Number(process.env.PARSE_RATE_PER_MINUTE ?? 20),
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://127.0.0.1:3000').split(','),
  production: process.env.NODE_ENV === 'production',
};

if (config.production && config.jwtSecret === devSecret) {
  throw new Error('JWT_SECRET es obligatorio en producción');
}
