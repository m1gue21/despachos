import type { FastifyBaseLogger } from 'fastify';
import { config } from '../config.js';
import { parseWithLlm } from './llm.js';
import { parseWithRules } from './rules.js';
import { type ParseResult, type SectorRef, sanitize } from './types.js';

export type { ParseResult, SectorRef } from './types.js';

// Usa Claude si está configurado; si no, o si falla, cae a las reglas locales.
// El texto no se registra en logs (spec §11): solo el motivo del fallo.
export async function parseMessage(raw: string, sectors: SectorRef[], log: FastifyBaseLogger): Promise<ParseResult> {
  if (config.anthropicKey && config.anthropicModel) {
    try {
      return { result: sanitize(await parseWithLlm(raw, sectors), sectors), engine: 'llm' };
    } catch (err) {
      log.warn({ reason: err instanceof Error ? err.message : String(err) }, 'parser LLM falló, uso reglas');
    }
  }
  return { result: sanitize(parseWithRules(raw, sectors), sectors), engine: 'rules' };
}
