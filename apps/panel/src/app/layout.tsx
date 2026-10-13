import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Arriero Despacho',
  description: 'Panel de despacho de Arriero: domicilios y transporte en Manizales',
};

export const viewport: Viewport = { themeColor: '#1F5C45' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-CO">
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
