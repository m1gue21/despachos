// Genera public/og.png (1200×630) y public/apple-touch-icon.png desde SVG.
// Uso: pnpm --filter @despacho/landing og
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const font = readFileSync(
  require.resolve('@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2'),
).toString('base64');

const iso = (x, y, s, stroke = '#1F5C45') => `
  <g transform="translate(${x} ${y}) scale(${s})">
    <path d="M8 54 32 10l24 44" fill="none" stroke="${stroke}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M18 51c8-1 5-8 12-10s7-8 3-12" fill="none" stroke="#E59A2F" stroke-width="3.6" stroke-linecap="round" stroke-dasharray="0.1 6.2"/>
    <circle cx="33" cy="26" r="4.6" fill="#E59A2F"/>
  </g>`;

const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs><style>@font-face{font-family:B;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:200 800}
  .d{font-family:B,sans-serif}</style></defs>
  <rect width="1200" height="630" fill="#F6F1E7"/>
  <path d="M0 470 L180 330 L300 410 L470 260 L620 380 L760 300 L900 390 L1050 290 L1200 360 V630 H0Z" fill="#7FA48F" opacity=".5"/>
  <path d="M0 520 C200 450 360 480 520 510 S860 450 1200 490 V630 H0Z" fill="#1F5C45"/>
  <path d="M640 600 C720 560 760 520 830 505 S930 460 960 420" fill="none" stroke="#E59A2F" stroke-width="10" stroke-linecap="round" stroke-dasharray="0.1 24"/>
  <circle cx="964" cy="404" r="18" fill="#E59A2F"/><circle cx="964" cy="404" r="7" fill="#0F2E23"/>
  ${iso(80, 70, 1.6)}
  <text x="190" y="135" class="d" font-size="64" font-weight="800" letter-spacing="-2" fill="#0F2E23">arriero</text>
  <text x="84" y="250" class="d" font-size="62" font-weight="800" letter-spacing="-1.5" fill="#0F2E23">Domicilios y transporte</text>
  <text x="84" y="322" class="d" font-size="62" font-weight="800" letter-spacing="-1.5" fill="#1F5C45">despachados por gente de aquí.</text>
  <text x="86" y="390" font-family="sans-serif" font-size="30" fill="#5B6660">Manizales y Villamaría · Pide por WhatsApp · Síguelo en vivo</text>
</svg>`;

await sharp(Buffer.from(og)).png().toFile('public/og.png');

const touch = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#F6F1E7"/>${iso(4, 4, 0.875)}</svg>`;
await sharp(Buffer.from(touch)).png().toFile('public/apple-touch-icon.png');
console.log('og.png y apple-touch-icon.png generados');
