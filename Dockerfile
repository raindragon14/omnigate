FROM oven/bun:1-alpine AS deps
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1-alpine AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN bun run typecheck

FROM oven/bun:1-alpine AS release
WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json ./

RUN mkdir -p /app/.data
RUN chown -R appuser:appgroup /app

USER appuser

ENV NODE_ENV=production
ENV PORT=8787

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://localhost:8787/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["bun", "run", "src/server.ts"]
