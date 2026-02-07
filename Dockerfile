# ── Stage 1: Build ────────────────────────────────────────
FROM oven/bun:1 AS build

WORKDIR /app

# Install dependencies first (cache layer)
COPY package.json bun.lock ./
COPY packages/core/package.json packages/core/
COPY packages/tracker/package.json packages/tracker/
COPY packages/node/package.json packages/node/
COPY packages/client/package.json packages/client/
COPY packages/react/package.json packages/react/
COPY packages/react-native/package.json packages/react-native/
COPY apps/dashboard/package.json apps/dashboard/
COPY apps/server/package.json apps/server/
COPY examples/express/package.json examples/express/
COPY examples/react-app/package.json examples/react-app/

RUN bun install --frozen-lockfile

# Copy source
COPY tsconfig.json turbo.json ./
COPY packages/ packages/
COPY apps/ apps/
COPY examples/ examples/

# Build everything (turbo handles dependency order)
RUN bun run build

# ── Stage 2: Runtime ──────────────────────────────────────
FROM oven/bun:1-slim

WORKDIR /app

# Copy built artifacts and node_modules
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/core/dist ./packages/core/dist
COPY --from=build /app/packages/core/package.json ./packages/core/
COPY --from=build /app/packages/tracker/dist ./packages/tracker/dist
COPY --from=build /app/packages/tracker/package.json ./packages/tracker/
COPY --from=build /app/packages/node/dist ./packages/node/dist
COPY --from=build /app/packages/node/package.json ./packages/node/
COPY --from=build /app/packages/client/dist ./packages/client/dist
COPY --from=build /app/packages/client/package.json ./packages/client/
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/server/package.json ./apps/server/
COPY --from=build /app/apps/dashboard/dist ./apps/dashboard/dist
COPY --from=build /app/package.json ./

ENV NODE_ENV=production
ENV PORT=3002
ENV DB_ADAPTER=clickhouse

EXPOSE 3002

CMD ["node", "apps/server/dist/index.js"]
