# SoftQraft Realtime Media — Gateway API image
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY services/gateway-api/package.json services/gateway-api/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY services/gateway-api services/gateway-api
RUN pnpm --filter @softqraft/shared build \
 && pnpm --filter @softqraft/gateway-api build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/services/gateway-api/node_modules ./services/gateway-api/node_modules
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/services/gateway-api/package.json ./services/gateway-api/
COPY --from=build /app/services/gateway-api/dist ./services/gateway-api/dist
COPY package.json pnpm-workspace.yaml ./

WORKDIR /app/services/gateway-api
EXPOSE 8080
CMD ["node", "dist/index.js"]
