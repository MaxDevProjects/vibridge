FROM node:20-slim AS builder

# node-pty needs build tools (python3, make, g++)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ─── Runtime ───────────────────────────────────────────────────
FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ wget \
    && rm -rf /var/lib/apt/lists/*

# Make Codex CLI available inside the runtime container so the codex-cli
# adapter can spawn the same tool that exists on the host.
RUN npm install -g @openai/codex@0.111.0

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# IPC socket directory
RUN mkdir -p /tmp/devbridge && chmod 777 /tmp/devbridge

EXPOSE 3333
CMD ["node", "dist/index.js"]
