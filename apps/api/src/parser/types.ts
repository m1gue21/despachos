import { z } from 'zod';

export interface SectorRef {
  slug: string;
  name: string;
  aliases: string[];
}

// Salida del parser (spec §11). Validada siempre, venga del LLM o de las reglas.
export const parsedRequestSchema = z.object({
  service: z.enum(['delivery', 'ride', 'errand', 'unknown']),
  pickup_text: z.string().nullable(),
  pickup_sector_slug: z.string().nullable(),
  dropoff_text: z.string().nullable(),
  dropoff_sector_slug: z.string().nullable(),
  customer_name: z.string().nullable(),
  customer_phone: z.string().nullable(),
  notes: z.string().nullable(),
  confidence: z.object({
    service: z.number().min(0).max(1),
    pickup: z.number().min(0).max(1),
    dropoff: z.number().min(0).max(1),
  }),
});
export type ParsedRequest = z.infer<typeof parsedRequestSchema>;

export interface ParseResult {
  result: ParsedRequest;
  engine: 'llm' | 'rules';
}

// JSON schema equivalente para output_config.format (estricto: todo requerido,
// sin propiedades extra).
const nullableString = { type: ['string', 'null'] };
export const parsedRequestJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'service',
    'pickup_text',
    'pickup_sector_slug',
    'dropoff_text',
    'dropoff_sector_slug',
    'customer_name',
    'customer_phone',
    'notes',
    'confidence',
  ],
  properties: {
    service: { type: 'string', enum: ['delivery', 'ride', 'errand', 'unknown'] },
    pickup_text: nullableString,
    pickup_sector_slug: nullableString,
    dropoff_text: nullableString,
    dropoff_sector_slug: nullableString,
    customer_name: nullableString,
    customer_phone: nullableString,
    notes: nullableString,
    confidence: {
      type: 'object',
      additionalProperties: false,
      required: ['service', 'pickup', 'dropoff'],
      properties: {
        service: { type: 'number' },
        pickup: { type: 'number' },
        dropoff: { type: 'number' },
      },
    },
  },
} as const;

// Limpieza común: slugs que no existen → null, teléfono normalizado a 10 dígitos.
export function sanitize(r: ParsedRequest, sectors: SectorRef[]): ParsedRequest {
  const valid = new Set(sectors.map((s) => s.slug));
  const phoneDigits = r.customer_phone?.replace(/\D/g, '').replace(/^57(?=3\d{9}$)/, '') ?? null;
  const blank = (v: string | null) => (v && v.trim() ? v.trim() : null);
  return {
    ...r,
    pickup_text: blank(r.pickup_text),
    dropoff_text: blank(r.dropoff_text),
    customer_name: blank(r.customer_name),
    notes: blank(r.notes),
    pickup_sector_slug: r.pickup_sector_slug && valid.has(r.pickup_sector_slug) ? r.pickup_sector_slug : null,
    dropoff_sector_slug: r.dropoff_sector_slug && valid.has(r.dropoff_sector_slug) ? r.dropoff_sector_slug : null,
    customer_phone: phoneDigits && /^3\d{9}$/.test(phoneDigits) ? phoneDigits : null,
  };
}
