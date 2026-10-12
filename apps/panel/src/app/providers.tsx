'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import type { ReactNode } from 'react';
import { DemoBanner } from '@/components/DemoBanner';
import { API_URL } from '@/lib/api';
import { DEMO } from '@/lib/demo';
import { installMock } from '@/lib/mock/install';
import { RealtimeProvider } from '@/lib/realtime';
import { SessionProvider, useSession } from '@/lib/session';
import { ToastProvider } from '@/lib/toast';

// Modo demo: instalar el API simulado antes de que cualquier vista haga fetch.
if (DEMO && typeof window !== 'undefined') installMock(API_URL);

function WithRealtime({ children }: { children: ReactNode }) {
  const { me } = useSession();
  return <RealtimeProvider enabled={Boolean(me)}>{children}</RealtimeProvider>;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <WithRealtime>
        <ToastProvider>
          {children}
          <DemoBanner />
        </ToastProvider>
      </WithRealtime>
    </SessionProvider>
  );
}
