# Nginx deployment for `vibridge.clowerstudio.com`

This folder versions the VPS reverse-proxy config that was previously only applied manually.

## Files

- `vibridge.clowerstudio.com.conf`: nginx vhost for production

## Topology

- Host nginx terminates TLS on `vibridge.clowerstudio.com`
- `ui` is exposed by Docker on `127.0.0.1:5173` (container port `4000`)
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

## Verify the existing VPS before changing anything

The VPS was previously recovered by routing the host Nginx upstream to port
`5173`. The versioned production Compose configuration now maps
`127.0.0.1:5173:4000`. **This does not modify the live VPS** and must not
be blindly copied over another working Nginx configuration.

On the VPS, inspect the *current effective* configuration first:

```bash
cd /home/srv/vibridge
docker compose -f docker-compose.prod.yml ps
docker ps --format 'table {{.Names}}\\t{{.Ports}}'
sudo nginx -T 2>/dev/null | grep -E 'server_name vibridge|proxy_pass http://127\\.0\\.0\\.1:(5173|3000|4444)'
curl -fsS http://127.0.0.1:5173/ >/dev/null && echo 'UI upstream OK'
curl -fsS http://127.0.0.1:4444/health
```

Expected architecture: **VPS = relay + UI**; **developer PC = agent + VS Code**.
If the live server has a different layout or an additional `devbridge-agent`
container, identify why before replacing services. The Compose file used
locally (`docker-compose.yml`) is separate from the VPS file
(`docker-compose.prod.yml`). A local `PWA_PORT=5173` does not configure
Nginx on the VPS.

If the VPS has manually edited tracked files, save and reconcile those edits
before the next release. The deployment workflow intentionally refuses to
overwrite local Git modifications.

## Deploy nginx config

Only after comparing the versioned file with the live Nginx site, update the
upstream if needed and validate it. Avoid overwriting unrelated TLS or
site-specific settings. If the live configuration already proxies to
`127.0.0.1:5173`, leave it as-is.

For a first installation where there is no existing site configuration:

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
