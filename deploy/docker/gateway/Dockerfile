# SoftQraft Realtime Media — Gateway API image
# Important: never COPY full packages/* over an existing pnpm install (wipes node_modules).

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS build
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.base.json ./
# All workspace package.json files before install (lockfile expects full workspace)
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY packages/sdk/package.json packages/sdk/tsconfig.json ./packages/sdk/
COPY services/gateway-api/package.json services/gateway-api/tsconfig.json ./services/gateway-api/

# Retry-friendly install (GCP VMs often see flaky registry connects)
RUN pnpm config set fetch-retries 5 \
 && pnpm config set fetch-retry-mintimeout 20000 \
 && pnpm config set fetch-retry-maxtimeout 120000 \
 && pnpm install --frozen-lockfile

COPY packages/shared/src ./packages/shared/src
COPY packages/sdk/src ./packages/sdk/src
COPY services/gateway-api/src ./services/gateway-api/src
COPY services/gateway-api/public ./services/gateway-api/public

RUN pnpm --filter @softqraft/shared build \
 && pnpm --filter @softqraft/gateway-api build

# Prod-only deploy (includes built workspace package + runtime deps)
RUN pnpm --filter @softqraft/gateway-api deploy --prod /out \
 && mkdir -p /out/public \
 && cp -R /app/services/gateway-api/public/. /out/public/

FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S softqraft && adduser -S softqraft -G softqraft
COPY --from=build --chown=softqraft:softqraft /out ./
USER softqraft
EXPOSE 8080
CMD ["node", "dist/index.js"]
