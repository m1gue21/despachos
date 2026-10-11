// Eval del parser con Claude contra el set de ejemplos. Gasta tokens reales:
// ANTHROPIC_API_KEY=... ANTHROPIC_MODEL=... pnpm --filter @despacho/api eval:parser
import '../src/config.js';
import { parseWithLlm } from '../src/parser/llm.js';
import { sanitize } from '../src/parser/types.js';
import { MANIZALES_SECTORS, PARSER_EXAMPLES } from './parser-examples.js';

let pass = 0;
for (const ex of PARSER_EXAMPLES) {
  const started = Date.now();
  try {
    const r = sanitize(await parseWithLlm(ex.text, MANIZALES_SECTORS), MANIZALES_SECTORS);
    const fails = [
      r.service !== ex.service && `service=${r.service}`,
      r.pickup_sector_slug !== ex.pickup && `pickup=${r.pickup_sector_slug}`,
      r.dropoff_sector_slug !== ex.dropoff && `dropoff=${r.dropoff_sector_slug}`,
      r.customer_phone !== ex.phone && `phone=${r.customer_phone}`,
      ex.name !== undefined && r.customer_name !== ex.name && `name=${r.customer_name}`,
    ].filter(Boolean);
    if (fails.length === 0) pass++;
    console.log(`${fails.length ? '✗' : '✓'} ${Date.now() - started}ms  ${ex.text}${fails.length ? `\n    ${fails.join(', ')}` : ''}`);
  } catch (err) {
    console.log(`✗ error  ${ex.text}\n    ${err instanceof Error ? err.message : err}`);
  }
}
console.log(`\n${pass}/${PARSER_EXAMPLES.length} correctos`);
process.exitCode = pass === PARSER_EXAMPLES.length ? 0 : 1;
