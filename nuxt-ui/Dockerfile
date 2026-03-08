FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

# ── Production image ──────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4000 \
    NUXT_PUBLIC_AGENT_HOST=devbridge.local \
    NUXT_PUBLIC_AGENT_PORT=3333

COPY --from=builder /app/.output ./.output

EXPOSE 4000

CMD ["node", ".output/server/index.mjs"]
