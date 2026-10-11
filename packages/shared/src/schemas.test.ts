import assert from 'node:assert/strict';
import { it } from 'node:test';
import { colombianPhoneSchema, newRequestSchema } from './schemas.js';

it('normaliza celulares colombianos', () => {
  assert.equal(colombianPhoneSchema.parse('+57 320 123 4567'), '3201234567');
  assert.equal(colombianPhoneSchema.parse('320-123-4567'), '3201234567');
  assert.equal(colombianPhoneSchema.safeParse('6068881234').success, false);
});

it('una solicitud necesita recogida y deja en null lo opcional', () => {
  const ok = newRequestSchema.parse({
    city_zone_id: '10000000-0000-0000-0000-000000000001',
    service: 'delivery',
    pickup_text: 'El Cable',
    notes: '   ',
  });
  assert.equal(ok.channel, 'whatsapp_manual');
  assert.equal(ok.dropoff_text, null);
  assert.equal(newRequestSchema.safeParse({ ...ok, pickup_text: ' ' }).success, false);
});
