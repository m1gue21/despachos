'use client';

import type { RoutePoint } from '@despacho/shared';
import type { Map as MlMap, Marker } from 'maplibre-gl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type MapProblem as Problem, watchMap, webglAvailable } from '@/lib/mapHealth';
import { MapProblem } from './MapProblem';

const STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty';
// Si entre dos puntos seguidos pasa más de esto, se dibuja como tramo sin señal.
const GAP_MS = 4 * 60_000;

const empty = { type: 'FeatureCollection' as const, features: [] };

function dot(label: string, bg: string): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = `width:24px;height:24px;border-radius:50%;background:${bg};color:#fff;font:700 12px system-ui;
    display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)`;
  el.textContent = label;
  return el;
}

// Recorrido de un conductor en un día: línea continua donde hubo señal y tramos
// punteados en rojo donde se perdió; "cursor" es el punto de la reproducción.
export function RouteMap({ points, cursor }: { points: RoutePoint[]; cursor: number }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const lib = useRef<typeof import('maplibre-gl') | null>(null);
  const markers = useRef<{ start?: Marker; end?: Marker; cursor?: Marker }>({});
  const [ready, setReady] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  // Segmentos con señal y tramos sin señal.
  const { lines, gaps } = useMemo(() => {
    const lines: [number, number][][] = [];
    const gaps: [number, number][][] = [];
    let cur: [number, number][] = [];
    points.forEach((p, i) => {
      const prev = points[i - 1];
      if (prev && new Date(p.t).getTime() - new Date(prev.t).getTime() > GAP_MS) {
        if (cur.length > 1) lines.push(cur);
        gaps.push([[prev.lng, prev.lat], [p.lng, p.lat]]);
        cur = [];
      }
      cur.push([p.lng, p.lat]);
    });
    if (cur.length > 1) lines.push(cur);
    return { lines, gaps };
  }, [points]);

  useEffect(() => {
    let cancelled = false;
    let unwatch = () => {};
    if (!webglAvailable()) {
      setProblem('webgl');
      return;
    }
    void import('maplibre-gl').then((ml) => {
      if (cancelled || !container.current) return;
      lib.current = ml;
      const m = new ml.Map({ container: container.current, style: STYLE_URL, center: [-75.5138, 5.0703], zoom: 12, attributionControl: { compact: true } });
      m.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right');
      m.on('load', () => {
        m.addSource('lines', { type: 'geojson', data: empty });
        m.addSource('gaps', { type: 'geojson', data: empty });
        m.addLayer({ id: 'lines', type: 'line', source: 'lines', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#1F5C45', 'line-width': 4, 'line-opacity': 0.85 } });
        m.addLayer({ id: 'gaps', type: 'line', source: 'gaps', paint: { 'line-color': '#C0392B', 'line-width': 3, 'line-dasharray': [1.5, 1.5] } });
        setReady(true);
      });
      unwatch = watchMap(m, (p) => setProblem((cur) => cur ?? p));
      const ro = new ResizeObserver(() => m.resize());
      ro.observe(container.current);
      const prev = unwatch;
      unwatch = () => {
        prev();
        ro.disconnect();
      };
      map.current = m;
    });
    return () => {
      cancelled = true;
      unwatch();
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Dibujar el recorrido y encuadrarlo.
  useEffect(() => {
    const ml = lib.current;
    const m = map.current;
    if (!ready || !ml || !m) return;
    (m.getSource('lines') as import('maplibre-gl').GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: lines.map((coordinates) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } })),
    });
    (m.getSource('gaps') as import('maplibre-gl').GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: gaps.map((coordinates) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } })),
    });
    markers.current.start?.remove();
    markers.current.end?.remove();
    markers.current = { ...markers.current, start: undefined, end: undefined };
    const first = points[0];
    const last = points.at(-1);
    if (first && last) {
      markers.current.start = new ml.Marker({ element: dot('I', '#23824A') }).setLngLat([first.lng, first.lat]).addTo(m);
      markers.current.end = new ml.Marker({ element: dot('F', '#B5532A') }).setLngLat([last.lng, last.lat]).addTo(m);
      const b = new ml.LngLatBounds();
      points.forEach((p) => b.extend([p.lng, p.lat]));
      m.fitBounds(b, { padding: 50, maxZoom: 16, duration: 0 });
    }
  }, [ready, points, lines, gaps]);

  // Marcador de la reproducción.
  useEffect(() => {
    const ml = lib.current;
    const m = map.current;
    const p = points[cursor];
    if (!ready || !ml || !m || !p) return;
    if (!markers.current.cursor) {
      const el = document.createElement('div');
      el.style.cssText =
        'width:30px;height:30px;border-radius:50%;background:#fff;border:3px solid #E59A2F;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 2px 8px rgba(0,0,0,.35)';
      el.textContent = '🏍️';
      markers.current.cursor = new ml.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(m);
    } else markers.current.cursor.setLngLat([p.lng, p.lat]);
  }, [ready, points, cursor]);

  return (
    <div className="absolute inset-0">
      <div ref={container} className="h-full w-full" />
      {problem && <MapProblem problem={problem} />}
    </div>
  );
}
