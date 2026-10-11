// Cuentas del seed (packages/db/seed.sql) para los botones de acceso rápido.
// SOLO desarrollo: los logins las muestran únicamente fuera de producción.
export const DEMO_PASSWORD = 'dev12345';

export interface DemoAccount {
  email: string;
  label: string;
  hint: string;
}

export const DEMO_STAFF: DemoAccount[] = [
  { email: 'admin@despacho.local', label: 'Admin', hint: 'Todas las ciudades' },
  { email: 'op.manizales@despacho.local', label: 'Operadora Manizales', hint: 'Solo Manizales' },
  { email: 'op.villamaria@despacho.local', label: 'Operador Villamaría', hint: 'Solo Villamaría' },
];

export const DEMO_DRIVERS: DemoAccount[] = [
  { email: 'ana@despacho.local', label: 'Ana Ríos', hint: 'Moto · domicilios' },
  { email: 'bruno@despacho.local', label: 'Bruno Gómez', hint: 'Carro · transporte' },
];
