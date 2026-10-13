'use client';

import type { Map as MlMap, Marker } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { type MapProblem as Problem, watchMap, webglAvailable } from '@/lib/mapHealth';
import { MapProblem } from './MapProblem';

const STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty';

type Pt = { lat: number; lng: number };

function pin(label: string, color: string): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = `width:28px;height:28px;border-radius:50%;background:${color};color:#fff;font:700 13px system-ui;
    display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)`;
  el.textContent = label;
  return el;
}

function driverEl(icon: string): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = `width:40px;height:40px;border-radius:50%;background:#fff;border:3px solid #1F5C45;font-size:20px;
    display:flex;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(15,46,35,.4)`;
  el.textContent = icon;
  return el;
}

// Mapa del seguimiento: recogida (A), entrega (B), mensajero y una línea
// punteada hacia su próximo destino (línea recta, no la ruta por calles).
export function TrackingMap({
  pickup,
  dropoff,
  driver,
  driverIcon,
  target,
}: {
  pickup: Pt | null;
  dropoff: Pt | null;
  driver: Pt | null;
  driverIcon: string;
  target: 'pickup' | 'dropoff' | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const lib = useRef<typeof import('maplibre-gl') | null>(null);
  const markers = useRef<Marker[]>([]);
  const fitted = useRef(false);
  const [ready, setReady] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);

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
      const start = driver ?? pickup ?? { lat: 5.0703, lng: -75.5138 };
      const m = new ml.Map({ container: container.current, style: STYLE_URL, center: [start.lng, start.lat], zoom: 14, attributionControl: { compact: true } });
      m.on('load', () => {
        m.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        // Sendero punteado en ámbar, como en el logo.
        m.addLayer({
          id: 'route',
          type: 'line',
          source: 'route',
          layout: { 'line-cap': 'round' },
          paint: { 'line-color': '#E59A2F', 'line-width': 5, 'line-dasharray': [0, 2] },
        });
        setReady(true);
      });
      unwatch = watchMap(m, (p) => setProblem((cur) => cur ?? p));
      const ro = new ResizeObserver(() => m.resize());
      ro.observe(container.current);
      const prevUnwatch = unwatch;
      unwatch = () => {
        prevUnwatch();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const ml = lib.current;
    const m = map.current;
    if (!ready || !ml || !m) return;
    markers.current.forEach((mk) => mk.remove());
    markers.current = [];
    const add = (el: HTMLElement, p: Pt) => markers.current.push(new ml.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(m));
    if (pickup) add(pin('A', '#1F5C45'), pickup);
    if (dropoff) add(pin('B', '#B5532A'), dropoff);
    if (driver) add(driverEl(driverIcon), driver);

    const to = target === 'pickup' ? pickup : target === 'dropoff' ? dropoff : null;
    const src = m.getSource('route') as import('maplibre-gl').GeoJSONSource | undefined;
    src?.setData({
      type: 'FeatureCollection',
      features:
        driver && to
          ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[driver.lng, driver.lat], [to.lng, to.lat]] } }]
          : [],
    });

    // Encuadrar todo la primera vez; después solo seguir al mensajero si se sale.
    const pts = [pickup, dropoff, driver].filter((p): p is Pt => Boolean(p));
    if (!fitted.current && pts.length > 0) {
      fitted.current = true;
      if (pts.length === 1) m.jumpTo({ center: [pts[0]!.lng, pts[0]!.lat], zoom: 15 });
      else {
        const b = new ml.LngLatBounds();
        pts.forEach((p) => b.extend([p.lng, p.lat]));
        m.fitBounds(b, { padding: 60, maxZoom: 16, duration: 0 });
      }
    } else if (driver && !m.getBounds().contains([driver.lng, driver.lat])) {
      m.easeTo({ center: [driver.lng, driver.lat] });
    }
  }, [ready, pickup, dropoff, driver, driverIcon, target]);

  return (
    // Absoluto sobre la sección `relative` (ver MapView): altura fiable en Firefox.
    <div className="absolute inset-0">
      <div ref={container} className="h-full w-full" />
      {problem && <MapProblem problem={problem} />}
    </div>
  );
}
