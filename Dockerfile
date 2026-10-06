# syntax=docker/dockerfile:1
# Monorepo pnpm + turborepo (Node 22). Stages: dev (hot-reload) / build / prod
# La raíz del repo es /app: ahí el server busca config/ y resuelve las rutas
# declaradas en config/app.yaml (./vault y ./data/index.db).

FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat curl && chown node:node /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV HUSKY=0
RUN corepack enable

FROM base AS deps
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=node:node apps/server/package.json apps/server/package.json
COPY --chown=node:node apps/web/package.json apps/web/package.json
COPY --chown=node:node packages/contracts/package.json packages/contracts/package.json
COPY --chown=node:node packages/core/package.json packages/core/package.json
COPY --chown=node:node packages/index/package.json packages/index/package.json
COPY --chown=node:node packages/llm/package.json packages/llm/package.json
ENV HOME=/home/node
USER node
RUN pnpm install --frozen-lockfile

FROM deps AS dev
USER root
RUN mkdir -p vault data && chown node:node vault data
USER node
COPY --chown=node:node . .
EXPOSE 3000 5173
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD curl -fsS http://localhost:3000/api/health || exit 1
CMD ["sh", "-c", "pnpm install --frozen-lockfile && pnpm run build && { pnpm --filter @migite/server dev & exec pnpm --filter @migite/web exec vite --host; }"]

FROM deps AS build
COPY --chown=node:node . .
RUN pnpm build

FROM base AS prod
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/index/package.json packages/index/package.json
COPY packages/llm/package.json packages/llm/package.json
# --ignore-scripts protege del prepare de husky. better-sqlite3 13 no tiene
# install script (gypfile: false): distribuye el binario N-API en prebuilds/,
# incluido linuxmusl-x64, así que el stage no necesita toolchain de compilación.
RUN pnpm install --frozen-lockfile --prod --ignore-scripts \
      --filter @migite/server...
RUN cd packages/index && node -e "require('better-sqlite3')"
COPY --from=build --chown=node:node /app/apps/server/dist apps/server/dist
COPY --from=build --chown=node:node /app/apps/web/dist apps/web/dist
COPY --from=build --chown=node:node /app/packages/contracts/dist packages/contracts/dist
COPY --from=build --chown=node:node /app/packages/core/dist packages/core/dist
COPY --from=build --chown=node:node /app/packages/index/dist packages/index/dist
COPY --from=build --chown=node:node /app/packages/index/drizzle packages/index/drizzle
COPY --from=build --chown=node:node /app/packages/llm/dist packages/llm/dist
COPY --chown=node:node config/app.yaml config/llm.yaml config/
RUN mkdir -p vault data && chown node:node vault data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD curl -fsS http://localhost:3000/api/health || exit 1
CMD ["node", "apps/server/dist/index.js"]
