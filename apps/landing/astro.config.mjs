import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

// Dominio público (canonical, sitemap y Open Graph). Cámbialo al registrar el dominio.
const SITE = process.env.SITE_URL ?? 'https://arriero.co';

export default defineConfig({
  site: SITE,
  trailingSlash: 'never',
  integrations: [sitemap({ i18n: undefined, changefreq: 'weekly' })],
  build: { inlineStylesheets: 'always' },
  vite: { plugins: [tailwindcss()] },
});
