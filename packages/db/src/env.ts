// Conexión de dueño. Por defecto apunta al Postgres de docker-compose.
export const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5433/despacho';
