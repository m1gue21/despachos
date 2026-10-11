// Parser por reglas: respaldo cuando no hay ANTHROPIC_API_KEY o el LLM falla.
// No pretende entenderlo todo: prefiere devolver null antes que inventar.
import type { ParsedRequest, SectorRef } from './types.js';

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const SERVICE_WORDS: Record<'delivery' | 'ride' | 'errand', RegExp> = {
  errand: /\b(mandado|mandaditos?|diligencia|vuelta|pagar|pago de|consignar|hacer fila|reclamar|radicar)\b/,
  ride: /\b(carro|carrito|taxi|transporte|llevar(me|nos)|lleve(me|nos)?|me lleve|recoger(me|nos)|viaje|pasajer[oa]s?|servicio para (una|1|dos|2) personas?|me lleva|nos lleva|para ir)\b/,
  delivery: /\b(domi|domicilio|domiciliario|pedido|paquete|encomienda|llevar (un|una|el|la)|traer|entregar|recoger (un|una|el|la) (pedido|paquete|sobre|caja)|sobre|caja|almuerzo|drogueria|comida)\b/,
};

function detectService(t: string): { service: ParsedRequest['service']; confidence: number } {
  const hits = (Object.keys(SERVICE_WORDS) as (keyof typeof SERVICE_WORDS)[]).filter((k) => SERVICE_WORDS[k].test(t));
  if (hits.length === 0) return { service: 'unknown', confidence: 0 };
  // Mandado gana a domicilio ("mandado: llevar un sobre"), domicilio gana a carro
  // salvo que haya pasajeros explícitos.
  const order: (keyof typeof SERVICE_WORDS)[] = ['errand', 'ride', 'delivery'];
  const service = order.find((k) => hits.includes(k))!;
  return { service, confidence: hits.length === 1 ? 0.8 : 0.55 };
}

interface SectorHit {
  slug: string;
  index: number;
  term: string;
}

function findSectors(t: string, sectors: SectorRef[]): SectorHit[] {
  const hits: SectorHit[] = [];
  for (const s of sectors) {
    // Con y sin artículo: "del estadio" debe encontrar el alias "el estadio".
    const terms = [s.name, ...s.aliases]
      .map(norm)
      .flatMap((x) => [x, x.replace(/^(el|la|los|las)\s+/, '')])
      .filter((x) => x.length >= 3);
    let best: SectorHit | null = null;
    for (const term of terms) {
      const re = new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`);
      const m = re.exec(t);
      if (m && (!best || m.index < best.index)) best = { slug: s.slug, index: m.index, term };
    }
    if (best) hits.push(best);
  }
  return hits.sort((a, b) => a.index - b.index);
}

const PHONE_RE = /(?:\+?57[\s-]?)?(3\d{2})[\s.-]?(\d{3})[\s.-]?(\d{4})\b/;

function extractPhone(raw: string): string | null {
  const m = PHONE_RE.exec(raw);
  return m ? `${m[1]}${m[2]}${m[3]}` : null;
}

function extractName(raw: string): string | null {
  const patterns = [
    /a nombre de\s+([A-Za-zÁÉÍÓÚÑáéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)/i,
    /(?:cliente|preguntar por|se llama|nombre)[:\s]+([A-Za-zÁÉÍÓÚÑáéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)/i,
    // "Marta 3159876543"
    /\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,})\s+(?:\+?57\s?)?3\d{2}[\s.-]?\d{3}[\s.-]?\d{4}/,
  ];
  for (const re of patterns) {
    const m = re.exec(raw);
    if (m?.[1]) {
      const name = m[1].trim();
      if (!/^(cel|celular|tel|telefono|teléfono|whatsapp|wpp|numero|número)$/i.test(name)) {
        return name.charAt(0).toUpperCase() + name.slice(1);
      }
    }
  }
  return null;
}

// Frase de lugar después de un marcador ("recoger en ...", "de ... a ...").
function clause(raw: string, start: RegExp, stop: RegExp): string | null {
  const m = start.exec(raw);
  if (!m) return null;
  const rest = raw.slice(m.index + m[0].length);
  const end = rest.search(stop);
  const text = (end === -1 ? rest : rest.slice(0, end)).trim().replace(/[,.;:]+$/, '');
  return text.length >= 3 && text.length <= 80 ? text : null;
}

const STOP = /\s+(?:a|al|para|hasta|hacia|y|cel|celular|tel|whatsapp|wpp|\+?57|3\d{9})\b|[,.;\n]|\s+3\d{2}[\s.-]?\d{3}/i;

export function parseWithRules(raw: string, sectors: SectorRef[]): ParsedRequest {
  const t = norm(raw);
  const { service, confidence } = detectService(t);
  const hits = findSectors(t, sectors);

  let pickupSlug: string | null = null;
  let dropoffSlug: string | null = null;
  let pickupConf = 0;
  let dropoffConf = 0;

  // Marcadores explícitos de destino.
  const destMarker = /\b(a|al|para|hasta|hacia|destino|entregar en|llevar a|lleva a)\s*$/;
  const originMarker = /\b(de|del|desde|en|recoger en|recoge en|sale de|salgo de|estoy en|origen)\s*$/;
  for (const h of hits) {
    const before = t.slice(Math.max(0, h.index - 16), h.index + 1);
    if (destMarker.test(before) && !dropoffSlug) {
      dropoffSlug = h.slug;
      dropoffConf = 0.75;
    } else if (originMarker.test(before) && !pickupSlug) {
      pickupSlug = h.slug;
      pickupConf = 0.75;
    }
  }
  // Sin marcadores: el primero es recogida, el segundo destino.
  for (const h of hits) {
    if (h.slug === pickupSlug || h.slug === dropoffSlug) continue;
    if (!pickupSlug) {
      pickupSlug = h.slug;
      pickupConf = 0.5;
    } else if (!dropoffSlug) {
      dropoffSlug = h.slug;
      dropoffConf = 0.5;
    }
  }

  // Primero lo explícito ("recoger en la droguería"), luego "sale de / desde",
  // y si no, el nombre del sector.
  const pickupText =
    clause(raw, /\b(?:recoger|recoge|recojer|recoje|recoja|recogida|recogen)\s+(?:en\s+)?/i, STOP) ??
    clause(raw, /\b(?:sale|salgo|salimos|estoy|estamos|origen|desde)\s+(?:de\s+|en\s+)?/i, STOP) ??
    (pickupSlug ? (sectors.find((s) => s.slug === pickupSlug)?.name ?? null) : null);
  // El texto de destino solo se acepta si menciona el sector detectado;
  // si no, se usa el nombre del sector (evita "a nombre de Luisa" como destino).
  const dropoffSector = sectors.find((s) => s.slug === dropoffSlug);
  const dropoffClause = clause(raw, /\b(?:para|pa|hasta|hacia|destino|llevar a|lleva a|entregar en)\s+(?:la\s+|el\s+)?/i, STOP);
  const dropoffTerm = hits.find((h) => h.slug === dropoffSlug)?.term;
  const dropoffText = dropoffSector
    ? dropoffClause && dropoffTerm && norm(dropoffClause).includes(dropoffTerm.replace(/^(el|la|los|las)\s+/, ''))
      ? dropoffClause
      : dropoffSector.name
    : null;

  return {
    service,
    pickup_text: pickupText,
    pickup_sector_slug: pickupSlug,
    dropoff_text: dropoffText,
    dropoff_sector_slug: dropoffSlug,
    customer_name: extractName(raw),
    customer_phone: extractPhone(raw),
    notes: null,
    confidence: {
      service: confidence,
      pickup: pickupText ? Math.max(pickupConf, 0.4) : 0,
      dropoff: dropoffText ? Math.max(dropoffConf, 0.4) : 0,
    },
  };
}
