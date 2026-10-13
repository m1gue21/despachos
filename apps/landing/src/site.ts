// Datos de la marca y contacto en un solo lugar. Reemplazar los marcados con
// PENDIENTE antes de publicar.
export const BRAND = {
  name: 'Arriero',
  tagline: 'Lo llevamos, loma arriba.',
  description:
    'Domicilios, mandados y transporte en Manizales y Villamaría, despachados por operadores de aquí. Pide por WhatsApp, sigue a tu mensajero en vivo y califícalo.',
  city: 'Manizales',
  region: 'Caldas',
  country: 'CO',
  // PENDIENTE: número real de WhatsApp de despacho (formato internacional sin +).
  whatsapp: '573000000000',
  // PENDIENTE: correo real.
  email: 'hola@arriero.co',
  areas: ['Manizales', 'Villamaría'],
  sectors: ['Centro', 'Chipre', 'El Cable', 'Palogrande', 'Av. Santander', 'Fátima', 'Milán', 'La Sultana', 'La Enea', 'San Jorge'],
  // URL del panel/web de conductores (la app del monorepo).
  appUrl: 'https://app.arriero.co',
};

export const wa = (text: string) => `https://wa.me/${BRAND.whatsapp}?text=${encodeURIComponent(text)}`;
