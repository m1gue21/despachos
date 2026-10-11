// Conexión de dueño. Por defecto apunta al Postgres de docker-compose.
// Los tests usan su propia base (despacho_test) para no tocar los datos de desarrollo.
const DEV_URL = 'postgres://postgres:postgres@127.0.0.1:5433/despacho';

export const DATABASE_URL =
  process.env.DB_TEST === '1'
    ? (process.env.TEST_DATABASE_URL ?? DEV_URL.replace(/\/despacho$/, '/despacho_test'))
    : (process.env.DATABASE_URL ?? DEV_URL);
