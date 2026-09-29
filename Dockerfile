# syntax=docker/dockerfile:1
# La compilación corre en la arquitectura del Mac (pnpm 12 falla bajo QEMU). Sin dependencias nativas,
# así que node_modules vale para la imagen final amd64 (el VPS).
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
RUN npm i -g pnpm@12.4.2
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile
COPY packages packages
COPY apps apps
RUN pnpm --filter @coach/api build \
 && pnpm --filter @coach/web build \
 && pnpm --filter @coach/api deploy --prod --legacy /out

FROM node:22-alpine
ARG APP_VERSION=0.0.0
ENV APP_VERSION=$APP_VERSION NODE_ENV=production PORT=3000 WEB_DIR=/app/web
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/drizzle ./drizzle
COPY --from=build /repo/apps/web/dist ./web
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
