import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Despacho',
  description: 'Panel de despacho de domiciliarios y conductores',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-CO">
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
