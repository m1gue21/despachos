# Landing de Arriero

Página pública para promover el servicio entre negocios y conductores.
Astro 5 + Tailwind 4, sin JavaScript en el navegador. Identidad de marca en
[`docs/MARCA.md`](../../docs/MARCA.md).

```bash
pnpm --filter @despacho/landing dev       # http://localhost:4321
pnpm --filter @despacho/landing build     # genera dist/
pnpm --filter @despacho/landing og        # regenera og.png y apple-touch-icon.png
```

## Antes de publicar

En `src/site.ts`:

- `whatsapp`: número real de despacho (formato `57XXXXXXXXXX`).
- `email`: correo real.
- `appUrl`: dónde quedó el panel / web de conductores.

En `src/faq.ts`, confirmar las respuestas de **tarifas** y **requisitos**.
Variable de entorno `SITE_URL` (o el valor por defecto en `astro.config.mjs`)
con el dominio final; también actualizar `public/robots.txt`.

## SEO incluido

- Título, descripción y canonical; Open Graph y Twitter con imagen 1200×630.
- Datos estructurados: `LocalBusiness` (área de servicio Manizales y
  Villamaría, servicios ofrecidos), `WebSite` y `FAQPage`.
- `sitemap-index.xml` automático y `robots.txt`.
- `lang="es-CO"`, metadatos geo de Caldas, un solo H1 y jerarquía de títulos.
- Fuente servida localmente y precargada, estilos en línea, cero JS.

Lighthouse (celular, build local): rendimiento 100, accesibilidad 100,
buenas prácticas 100, SEO 100.

## Desplegar en Vercel

Proyecto aparte del panel: importar el mismo repo con **Root Directory**
`apps/landing`. `vercel.json` ya instala solo la landing.
