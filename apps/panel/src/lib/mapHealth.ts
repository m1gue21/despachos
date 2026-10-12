'use client';

import type { Map as MlMap } from 'maplibre-gl';

// Por qué un mapa puede no verse, para mostrarlo en vez de un recuadro vacío.
export type MapProblem = 'webgl' | 'tiles' | 'timeout';

export const MAP_PROBLEM_TEXT: Record<MapProblem, string> = {
  webgl:
    'Este navegador no permite dibujar mapas (WebGL desactivado). Suele pasar con la protección contra rastreo estricta o con alguna extensión; prueba desactivándola para este sitio o con otro navegador.',
  tiles:
    'No se pudieron descargar los mapas. Puede que una extensión (bloqueador de anuncios o de rastreo) esté bloqueando tiles.openfreemap.org, o que no haya conexión.',
  timeout: 'El mapa está tardando en cargar. Revisa la conexión o recarga la página.',
};

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

// Vigila un mapa recién creado: errores del estilo o de varios tiles seguidos,
// o que no termine de cargar en 15 s. Devuelve una función para dejar de vigilar.
export function watchMap(m: MlMap, onProblem: (p: MapProblem) => void): () => void {
  let loaded = false;
  let tileErrors = 0;
  const timer = setTimeout(() => !loaded && onProblem('timeout'), 15_000);
  m.on('load', () => {
    loaded = true;
    clearTimeout(timer);
  });
  m.on('error', (e: { error?: { message?: string; status?: number }; sourceId?: string; tile?: unknown }) => {
    console.warn('[mapa]', e.error?.message ?? e);
    if (!loaded) return onProblem('tiles');
    if (e.tile && ++tileErrors >= 5) onProblem('tiles');
  });
  m.on('webglcontextlost', () => onProblem('webgl'));
  return () => clearTimeout(timer);
}
