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

// Ana y Bruno vienen de seed.sql; el resto de seed-demo.sql.
export const DEMO_DRIVERS: DemoAccount[] = [
  { email: 'ana@despacho.local', label: 'Ana Ríos', hint: 'Moto · domicilios' },
  { email: 'bruno@despacho.local', label: 'Bruno Gómez', hint: 'Carro · transporte' },
  { email: 'camila@despacho.local', label: 'Camila Duque', hint: 'Moto · Palogrande' },
  { email: 'jhon@despacho.local', label: 'Jhon Ocampo', hint: 'Moto · Chipre' },
  { email: 'luzmarina@despacho.local', label: 'Luz Marina Giraldo', hint: 'Carro · servicio en curso' },
  { email: 'andres@despacho.local', label: 'Andrés Henao', hint: 'Carro · en vivo' },
  { email: 'valentina@despacho.local', label: 'Valentina Cardona', hint: 'Moto · Villamaría' },
];
