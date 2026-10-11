'use client';

import { DRIVER_STATUS_LABEL, type DriverRow, type RequestRow, SERVICE_LABEL, VEHICLE_ICON, type Zone } from '@despacho/shared';
import type { Map as MlMap, Marker } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';

const STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty';

const STATUS_COLOR = { available: '#16a34a', busy: '#ea580c', offline: '#9ca3af' } as const;
const REQUEST_COLOR = { created: '#dc2626', offered: '#d97706', assigned: '#2563eb', picked_up: '#7c3aed' } as const;

interface Props {
  city: Zone | null;
  sectors: Zone[];
  drivers: DriverRow[];
  requests: RequestRow[];
  selectedRequestId?: string | null;
  onSelectRequest?: (id: string) => void;
  onSelectDriver?: (id: string) => void;
  // Modo edición de zonas: clic en el mapa.
  onMapClick?: (lngLat: { lng: number; lat: number }) => void;
  draftPolygon?: [number, number][] | null;
  className?: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function driverPin(d: DriverRow): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = `width:30px;height:30px;border-radius:50%;background:#fff;border:3px solid ${STATUS_COLOR[d.status]};
    display:flex;align-items:center;justify-content:center;font-size:15px;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.3);
    position:relative;opacity:${d.is_stale ? 0.45 : 1}`;
  el.innerHTML = `${VEHICLE_ICON[d.vehicle]}${
    d.is_stale ? '<span style="position:absolute;top:-6px;right:-6px;background:#ea580c;color:#fff;border-radius:8px;font-size:9px;padding:0 3px">!</span>' : ''
  }`;
  el.title = `${d.display_name} · ${DRIVER_STATUS_LABEL[d.status]}${d.is_stale ? ' · desactualizado' : ''}`;
  return el;
}

function sectorBubble(drivers: DriverRow[], sectorName: string): HTMLElement {
  const el = document.createElement('div');
  const count = (s: DriverRow['status']) => drivers.filter((d) => d.status === s).length;
  const dots = (['available', 'busy', 'offline'] as const)
    .filter((s) => count(s) > 0)
    .map((s) => `<span style="display:inline-flex;align-items:center;gap:2px"><i style="width:8px;height:8px;border-radius:50%;background:${STATUS_COLOR[s]};display:inline-block"></i>${count(s)}</span>`)
    .join(' ');
  const stale = drivers.filter((d) => d.is_stale).length;
  el.style.cssText = `background:#fff;border:1px solid #d4d4d8;border-radius:14px;padding:3px 8px;font:600 11px system-ui;
    display:flex;gap:6px;align-items:center;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.25);white-space:nowrap`;
  el.innerHTML = `<span style="color:#52525b">${esc(sectorName)}</span>${dots}${stale ? `<span style="color:#ea580c">⚠${stale}</span>` : ''}`;
  el.title = drivers.map((d) => `${d.display_name} (${DRIVER_STATUS_LABEL[d.status]}${d.is_stale ? ', desactualizado' : ''})`).join('\n');
  return el;
}

function requestPin(r: RequestRow, selected: boolean): HTMLElement {
  const color = REQUEST_COLOR[r.status as keyof typeof REQUEST_COLOR] ?? '#52525b';
  const el = document.createElement('div');
  el.style.cssText = `width:${selected ? 22 : 16}px;height:${selected ? 22 : 16}px;background:${color};border:2px solid #fff;
    border-radius:50% 50% 50% 0;transform:rotate(-45deg);cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.4)`;
  el.title = `${SERVICE_LABEL[r.service]}: ${r.pickup_text}`;
  return el;
}

export function MapView({
  city,
  sectors,
  drivers,
  requests,
  selectedRequestId,
  onSelectRequest,
  onSelectDriver,
  onMapClick,
  draftPolygon,
  className,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const lib = useRef<typeof import('maplibre-gl') | null>(null);
  const [ready, setReady] = useState(false);
  const clickRef = useRef(onMapClick);
  clickRef.current = onMapClick;

  // Crear el mapa una vez (maplibre solo existe en el navegador).
  useEffect(() => {
    let cancelled = false;
    void import('maplibre-gl').then((ml) => {
      if (cancelled || !container.current) return;
      lib.current = ml;
      const m = new ml.Map({
        container: container.current,
        style: STYLE_URL,
        center: [city?.center_lng ?? -75.5138, city?.center_lat ?? 5.0703],
        zoom: 13,
        attributionControl: { compact: true },
      });
      m.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right');
      m.on('click', (e) => clickRef.current?.({ lng: e.lngLat.lng, lat: e.lngLat.lat }));
      m.on('load', () => {
        m.addSource('sectors', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        m.addLayer({ id: 'sectors-fill', type: 'fill', source: 'sectors', paint: { 'fill-color': '#1d4ed8', 'fill-opacity': 0.05 } });
        m.addLayer({ id: 'sectors-line', type: 'line', source: 'sectors', paint: { 'line-color': '#1d4ed8', 'line-opacity': 0.4, 'line-width': 1 } });
        m.addSource('draft', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        m.addLayer({ id: 'draft-line', type: 'line', source: 'draft', paint: { 'line-color': '#ea580c', 'line-width': 2, 'line-dasharray': [2, 1] } });
        m.addLayer({ id: 'draft-pts', type: 'circle', source: 'draft', paint: { 'circle-radius': 4, 'circle-color': '#ea580c' } });
        setReady(true);
      });
      map.current = m;
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recentrar al cambiar de ciudad.
  useEffect(() => {
    if (map.current && city?.center_lat != null && city.center_lng != null) {
      map.current.flyTo({ center: [city.center_lng, city.center_lat], zoom: 13 });
    }
  }, [city?.id, city?.center_lat, city?.center_lng]);

  // Polígonos de sectores.
  useEffect(() => {
    const src = map.current?.getSource('sectors') as import('maplibre-gl').GeoJSONSource | undefined;
    if (!ready || !src) return;
    src.setData({
      type: 'FeatureCollection',
      features: sectors
        .filter((s) => s.geom)
        .map((s) => ({ type: 'Feature', properties: { name: s.name }, geometry: s.geom! })),
    });
  }, [ready, sectors]);

  // Polígono en dibujo.
  useEffect(() => {
    const src = map.current?.getSource('draft') as import('maplibre-gl').GeoJSONSource | undefined;
    if (!ready || !src) return;
    const pts = draftPolygon ?? [];
    src.setData({
      type: 'FeatureCollection',
      features: [
        ...pts.map((p) => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: p } })),
        ...(pts.length > 1
          ? [{ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: [...pts, ...(pts.length > 2 ? [pts[0]!] : [])] } }]
          : []),
      ],
    });
  }, [ready, draftPolygon]);

  // Marcadores: se reconstruyen en cada cambio (decenas de elementos, barato).
  useEffect(() => {
    const ml = lib.current;
    const m = map.current;
    if (!ready || !ml || !m) return;
    markers.current.forEach((mk) => mk.remove());
    markers.current = [];
    const add = (el: HTMLElement, lng: number, lat: number, onClick?: () => void, anchor: 'center' | 'bottom' = 'center') => {
      if (onClick) el.addEventListener('click', (e) => {
        e.stopPropagation();
        onClick();
      });
      markers.current.push(new ml.Marker({ element: el, anchor }).setLngLat([lng, lat]).addTo(m));
    };

    // Conductores en vivo: pin exacto.
    for (const d of drivers) {
      if (d.location_mode === 'live' && d.lat != null && d.lng != null && d.status !== 'offline') {
        add(driverPin(d), d.lng, d.lat, () => onSelectDriver?.(d.id));
      }
    }
    // Conductores por zona: agrupados en el centro del sector.
    const bySector = new Map<string, DriverRow[]>();
    for (const d of drivers) {
      const isLive = d.location_mode === 'live' && d.lat != null;
      if (!isLive && d.sector_zone_id && d.sector_lat != null && d.status !== 'offline') {
        bySector.set(d.sector_zone_id, [...(bySector.get(d.sector_zone_id) ?? []), d]);
      }
    }
    for (const group of bySector.values()) {
      const first = group[0]!;
      add(sectorBubble(group, first.sector_name ?? ''), first.sector_lng!, first.sector_lat!, () => onSelectDriver?.(first.id));
    }
    // Solicitudes abiertas: en la posición o, si no, cerca del centro del sector.
    requests.forEach((r, i) => {
      if (r.status === 'completed' || r.status === 'cancelled') return;
      let lat = r.pickup_lat;
      let lng = r.pickup_lng;
      if (lat == null || lng == null) {
        if (r.pickup_sector_lat == null || r.pickup_sector_lng == null) return;
        // Pequeño desplazamiento para que no se tapen entre sí ni con la burbuja.
        const angle = (i * 137.5 * Math.PI) / 180;
        lat = r.pickup_sector_lat + 0.0012 * Math.sin(angle) - 0.0015;
        lng = r.pickup_sector_lng! + 0.0012 * Math.cos(angle);
      }
      add(requestPin(r, r.id === selectedRequestId), lng, lat, () => onSelectRequest?.(r.id), 'bottom');
    });
  }, [ready, drivers, requests, selectedRequestId, onSelectDriver, onSelectRequest]);

  return <div ref={container} className={className ?? 'h-full w-full'} />;
}
