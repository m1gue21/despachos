import type { MetadataRoute } from 'next';

// Permite "Agregar a la pantalla principal" la web del conductor.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Arriero Conductor',
    short_name: 'Arriero',
    start_url: '/conductor',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F6F1E7',
    theme_color: '#1F5C45',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
