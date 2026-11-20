# Una sola receta para el API y el panel (monorepo pnpm).
#   docker build --target api   -f deploy/Dockerfile .
#   docker build --target panel -f deploy/Dockerfile --build-arg NEXT_PUBLIC_API_URL=http://IP:4000 .
FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
COPY apps/panel ./apps/panel
# El workspace incluye apps/driver y apps/landing; se omiten en la imagen.
RUN pnpm install --frozen-lockfile --filter @despacho/api... --filter @despacho/panel... --filter @despacho/db...

FROM base AS api
ENV NODE_ENV=production
EXPOSE 4000
# provision es idempotente: aplica migraciones pendientes y deja todo listo.
CMD ["sh", "-c", "pnpm --filter @despacho/db provision && pnpm --filter @despacho/api start"]

FROM base AS panel-build
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_MAP_STYLE_URL=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_PUBLIC_MAP_STYLE_URL=$NEXT_PUBLIC_MAP_STYLE_URL NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @despacho/panel build

FROM panel-build AS panel
ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "--filter", "@despacho/panel", "start"]
