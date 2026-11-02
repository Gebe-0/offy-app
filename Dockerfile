# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.13.1 --activate
WORKDIR /app

# ---- build ----
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/tsconfig.json ./packages/contracts/
COPY packages/core/package.json packages/core/tsconfig.json ./packages/core/
COPY apps/api/package.json apps/api/tsconfig.json ./apps/api/
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY packages/contracts/src ./packages/contracts/src
COPY packages/core/src ./packages/core/src
COPY apps/api/src ./apps/api/src

RUN pnpm --filter @offy/contracts build \
 && pnpm --filter @offy/core build \
 && pnpm --filter @offy/api build

# ---- runtime ----
FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/.npmrc ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/contracts/package.json ./packages/contracts/
COPY --from=build /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=build /app/packages/core/package.json ./packages/core/
COPY --from=build /app/packages/core/dist ./packages/core/dist
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/apps/api/dist ./apps/api/dist

RUN pnpm install --frozen-lockfile --ignore-scripts --offline

WORKDIR /app/apps/api
EXPOSE 8080
CMD ["node", "dist/server.js"]
