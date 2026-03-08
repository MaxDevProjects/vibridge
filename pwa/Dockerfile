FROM node:20-alpine AS builder

ARG VITE_AGENT_PORT=3333
ENV VITE_AGENT_PORT=${VITE_AGENT_PORT}

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ─── Serve via nginx ───────────────────────────────────────────
FROM nginx:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
