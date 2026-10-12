import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Despacho · Conductor',
  description: 'Recibe y gestiona tus servicios',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Despacho', statusBarStyle: 'default' },
};

export const viewport: Viewport = { themeColor: '#1d4ed8', width: 'device-width', initialScale: 1 };

export default function DriverLayout({ children }: { children: ReactNode }) {
  return children;
}
