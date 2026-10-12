'use client';

import { MAP_PROBLEM_TEXT, type MapProblem as Problem } from '@/lib/mapHealth';

export function MapProblem({ problem }: { problem: Problem }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-muted p-6 text-center">
      <div className="max-w-sm space-y-2">
        <p className="text-2xl" aria-hidden="true">
          🗺️
        </p>
        <p className="font-semibold">No se puede mostrar el mapa</p>
        <p className="text-sm text-muted-foreground">{MAP_PROBLEM_TEXT[problem]}</p>
        {problem !== 'webgl' && (
          <button className="text-sm text-primary underline" onClick={() => window.location.reload()}>
            Recargar
          </button>
        )}
      </div>
    </div>
  );
}
