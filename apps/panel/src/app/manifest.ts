import type { MetadataRoute } from 'next';

// Permite "Agregar a la pantalla principal" la web del conductor.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Despacho · Conductor',
    short_name: 'Despacho',
    start_url: '/conductor',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f7f7f8',
    theme_color: '#1d4ed8',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
