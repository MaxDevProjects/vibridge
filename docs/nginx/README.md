# Nginx deployment for `vibridge.clowerstudio.com`

This folder versions the VPS reverse-proxy config that was previously only applied manually.

## Files

- `vibridge.clowerstudio.com.conf`: nginx vhost for production

## Topology

- Host nginx terminates TLS on `vibridge.clowerstudio.com`
- `ui` is exposed by Docker on `127.0.0.1:3000`
- `relay` is exposed by Docker on `127.0.0.1:4444`
- Public relay URL stays `https://vibridge.clowerstudio.com/relay`

## VPS prerequisites

- Repo checked out on the VPS, for example under `/home/srv/vibridge`
- Docker and Docker Compose installed
- DNS for `vibridge.clowerstudio.com` already points to the VPS
- TLS certs available from Let's Encrypt:
  - `/etc/letsencrypt/live/vibridge.clowerstudio.com/fullchain.pem`
  - `/etc/letsencrypt/live/vibridge.clowerstudio.com/privkey.pem`
- ACME webroot exists:

```bash
sudo mkdir -p /var/www/certbot
```

## Deploy nginx config

Copy the config into nginx sites-available, enable it, then validate and reload:

```bash
sudo cp docs/nginx/vibridge.clowerstudio.com.conf /etc/nginx/sites-available/vibridge.clowerstudio.com.conf
sudo ln -sfn /etc/nginx/sites-available/vibridge.clowerstudio.com.conf /etc/nginx/sites-enabled/vibridge.clowerstudio.com.conf
sudo nginx -t
sudo systemctl reload nginx
```

If the old site file exists under another name, remove or disable it first to avoid duplicate `server_name` declarations.

## First TLS issuance

If the cert does not exist yet:

```bash
sudo certbot certonly --webroot -w /var/www/certbot -d vibridge.clowerstudio.com
sudo nginx -t
sudo systemctl reload nginx
```

## Deploy application containers

From the repo root on the VPS:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Expected public routes:

- `https://vibridge.clowerstudio.com/` -> UI
- `https://vibridge.clowerstudio.com/relay/health` -> relay health
- `wss://vibridge.clowerstudio.com/relay/ws` -> relay WebSocket

## Smoke checks

```bash
curl -I https://vibridge.clowerstudio.com
curl https://vibridge.clowerstudio.com/relay/health
docker compose -f docker-compose.prod.yml ps
```

## Notes

- This config is aligned with the current [`docker-compose.prod.yml`](/home/clower/projects/vibebridge/docker-compose.prod.yml): nginx runs on the host, not in Docker.
- If Docker port mappings change, update this nginx file at the same time.
