import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Seguimiento Arriero',
  description: 'Mira por dónde va tu pedido',
  robots: { index: false, follow: false },
};

export default function TrackingLayout({ children }: { children: ReactNode }) {
  return children;
}
