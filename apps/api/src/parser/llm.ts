// Parser con Claude: salida estructurada (output_config.format) validada con Zod.
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { type ParsedRequest, type SectorRef, parsedRequestJsonSchema, parsedRequestSchema } from './types.js';

// Modelos que aceptan fallbacks: "default" (reintento en otro modelo si el
// primero declina por política). Para el resto se omite.
const FALLBACK_MODELS = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);

const SYSTEM = `Extraes datos de solicitudes de domicilios y transporte que llegan por grupos de WhatsApp en Caldas, Colombia.

Los mensajes son cortos, informales, con jerga local, abreviaturas y errores de ortografía ("domi" = domicilio, "carrito"/"taxi" = transporte de personas, "mandado"/"vuelta"/"diligencia" = hacer una diligencia).

Reglas:
- service: "delivery" si se lleva o trae una cosa; "ride" si se transporta a una persona; "errand" si es una diligencia (pagar, hacer fila, comprar algo por encargo); "unknown" si no se puede saber.
- Nunca inventes: si un dato no aparece en el texto, devuelve null. No completes direcciones, nombres ni teléfonos.
- pickup_text / dropoff_text: el lugar tal como lo dice el mensaje, limpio (sin el teléfono ni la hora).
- pickup_sector_slug / dropoff_sector_slug: solo un slug de la lista de sectores que te paso, si el lugar cae claramente en ese sector o coincide con un alias. Si dudas, null.
- customer_phone: el celular tal como aparece, solo dígitos.
- notes: instrucciones extra útiles para el conductor (hora, pago, "con cambio de 50", "portería 2"); null si no hay.
- confidence: de 0 a 1, qué tan seguro estás de service, de la recogida y del destino. Usa valores bajos cuando adivinaste.`;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  client ??= new Anthropic({ apiKey: config.anthropicKey!, timeout: 20_000, maxRetries: 1 });
  return client;
}

export class ParserUnavailableError extends Error {}

export async function parseWithLlm(raw: string, sectors: SectorRef[]): Promise<ParsedRequest> {
  if (!config.anthropicKey || !config.anthropicModel) {
    throw new ParserUnavailableError('Falta ANTHROPIC_API_KEY o ANTHROPIC_MODEL');
  }
  const model = config.anthropicModel;
  const sectorList = sectors
    .map((s) => `- ${s.slug}: ${s.name}${s.aliases.length ? ` (alias: ${s.aliases.join(', ')})` : ''}`)
    .join('\n');
  const useFallbacks = FALLBACK_MODELS.has(model);

  // Un reintento si el JSON no valida (spec §11).
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await getClient().beta.messages.create({
      model,
      max_tokens: 2048,
      ...(useFallbacks ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: parsedRequestJsonSchema },
      },
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: `Sectores de la ciudad:\n${sectorList || '(sin sectores)'}\n\nMensaje:\n<<<\n${raw}\n>>>`,
        },
      ],
    });

    if (response.stop_reason === 'refusal') {
      throw new ParserUnavailableError('El modelo no procesó este mensaje');
    }
    const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    try {
      return parsedRequestSchema.parse(JSON.parse(text));
    } catch (err) {
      lastError = err;
    }
  }
  throw new ParserUnavailableError(`Respuesta inválida del modelo: ${String(lastError)}`);
}
