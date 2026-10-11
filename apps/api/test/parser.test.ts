// El parser por reglas (respaldo sin API key) contra el set de ejemplos.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseWithRules } from '../src/parser/rules.js';
import { parsedRequestSchema, sanitize } from '../src/parser/types.js';
import { MANIZALES_SECTORS, PARSER_EXAMPLES } from './parser-examples.js';

const norm = (s: string | null) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

describe('parser por reglas', () => {
  for (const ex of PARSER_EXAMPLES) {
    it(ex.text, () => {
      const r = sanitize(parseWithRules(ex.text, MANIZALES_SECTORS), MANIZALES_SECTORS);
      parsedRequestSchema.parse(r);
      assert.equal(r.service, ex.service, 'service');
      assert.equal(r.pickup_sector_slug, ex.pickup, 'pickup_sector_slug');
      assert.equal(r.dropoff_sector_slug, ex.dropoff, 'dropoff_sector_slug');
      assert.equal(r.customer_phone, ex.phone, 'customer_phone');
      if (ex.name !== undefined) assert.equal(r.customer_name, ex.name, 'customer_name');
      if (ex.dropoff === null && !ex.dropoffIncludes) assert.equal(r.dropoff_sector_slug, null);
      if (ex.pickupIncludes) assert.ok(norm(r.pickup_text).includes(norm(ex.pickupIncludes)), `pickup_text: ${r.pickup_text}`);
      if (ex.dropoffIncludes)
        assert.ok(norm(r.dropoff_text).includes(norm(ex.dropoffIncludes)), `dropoff_text: ${r.dropoff_text}`);
      assert.ok(!norm(r.dropoff_text).includes('nombre'), `dropoff_text: ${r.dropoff_text}`);
      // Nunca inventar: sin teléfono en el texto no hay teléfono; sin lugares no hay textos.
      if (ex.pickup === null && !ex.pickupIncludes) assert.equal(r.pickup_text, null, 'pickup_text inventado');
    });
  }
});
