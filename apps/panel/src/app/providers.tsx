'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import type { ReactNode } from 'react';
import { RealtimeProvider } from '@/lib/realtime';
import { SessionProvider, useSession } from '@/lib/session';
import { ToastProvider } from '@/lib/toast';

function WithRealtime({ children }: { children: ReactNode }) {
  const { me } = useSession();
  return <RealtimeProvider enabled={Boolean(me)}>{children}</RealtimeProvider>;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <WithRealtime>
        <ToastProvider>{children}</ToastProvider>
      </WithRealtime>
    </SessionProvider>
  );
}
