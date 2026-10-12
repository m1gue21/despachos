'use client';

import Link from 'next/link';
import { useState } from 'react';
import { DEMO } from '@/lib/demo';
import { resetDemo } from '@/lib/mock/engine';
import { DEMO_TRACKING_TOKEN } from '@/lib/mock/data';

// Aviso fijo del modo demo con accesos rápidos a las tres caras del sistema.
export function DemoBanner() {
  const [open, setOpen] = useState(false);
  if (!DEMO) return null;
  return (
    <div className="fixed bottom-3 left-3 z-[70] max-w-[calc(100vw-1.5rem)] text-xs">
      {open ? (
        <div className="w-72 space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 shadow-lg">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-amber-900">Modo demo</p>
            <button className="text-amber-900" onClick={() => setOpen(false)} aria-label="Cerrar">
              ✕
            </button>
          </div>
          <p className="text-amber-900">
            Sin servidor: los datos se simulan y se guardan en este navegador. Abre varias pestañas (panel, conductor, seguimiento) y se
            sincronizan solas. Los conductores simulados aceptan ofertas y hacen los servicios.
          </p>
          <div className="grid gap-1">
            <Link className="underline" href="/login">
              Panel del operador (/)
            </Link>
            <Link className="underline" href="/conductor">
              Web del conductor (/conductor)
            </Link>
            <Link className="underline" href={`/seguimiento/${DEMO_TRACKING_TOKEN}`}>
              Seguimiento de un viaje en curso
            </Link>
          </div>
          <button
            className="w-full rounded-md border border-amber-400 bg-white py-1.5 font-medium text-amber-900 hover:bg-amber-100"
            onClick={() => {
              if (window.confirm('¿Reiniciar la demo? Se borran los cambios hechos en este navegador.')) {
                resetDemo();
                try {
                  localStorage.removeItem('despacho.token');
                  localStorage.removeItem('despacho.driver.token');
                } catch {}
                window.location.href = '/login';
              }
            }}
          >
            Reiniciar demo
          </button>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="rounded-full border border-amber-300 bg-amber-100 px-3 py-1.5 font-semibold text-amber-900 shadow"
        >
          DEMO · datos simulados
        </button>
      )}
    </div>
  );
}
