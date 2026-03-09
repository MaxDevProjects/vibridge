# DevBridge

Pont bidirectionnel entre un IDE local et un mobile/tablette.

Le flux principal repose sur quatre composants qui tournent tous en local :

- **extension VS Code** — remontée d'état IDE, réception des messages mobiles
- **agent Docker** — orchestrateur HTTP/WebSocket, gestion des adapters CLI
- **UI Nuxt 3** — interface PWA pour desktop et mobile
- **relay** *(optionnel)* — backend public pour accès hors réseau local

---

## Fonctionnalités

- Pairing local via QR code ou code court
- Dashboard desktop + mobile (Nuxt 3 / Tailwind)
- Remontée IDE en temps réel :
  - workspace et fichier actifs
  - liste des terminaux VS Code ouverts
- Routage de messages mobile → terminal VS Code ciblé
- Cible de terminal verrouillable (le mobile ne change pas de cible automatiquement)
- `DevBridge Chat` — participant de chat VS Code qui mirore la conversation vers le mobile
- `DevBridge Mirror` — webview VS Code affichant l'interface mobile en live
- Lancement de terminaux CLI directement depuis le mobile (`Claude CLI`, `Codex`, custom)
- Découverte automatique de l'agent via mDNS
- Notifications push vers le mobile (détection de questions de l'agent)
- IPC extension ↔ agent via socket Unix (défaut) ou TCP (WSL / remote)
- Relay optionnel pour un accès public depuis n'importe quel réseau

---

## Architecture

```
mobile / tablette
       │  HTTP + WebSocket
       ▼
  ┌─────────┐       Unix socket / TCP       ┌───────────────┐
  │  agent  │ ◄────────────────────────────► │  extension    │
  │ Docker  │                               │   VS Code     │
  └─────────┘                               └───────────────┘
       │  HTTP + WebSocket
       ▼
  ┌─────────┐
  │ nuxt-ui │  ← PWA servie sur le réseau local
  └─────────┘
       │  (optionnel)
       ▼
  ┌─────────┐
  │  relay  │  ← backend public (profil Docker séparé)
  └─────────┘
```

| Dossier | Rôle | Stack |
|---|---|---|
| `agent/` | Orchestrateur : HTTP, WebSocket, IPC, adapters CLI, mDNS, push | Node.js / TypeScript |
| `extension/` | Extension VS Code : état IDE, chat, mirror, IPC vers agent | TypeScript / VS Code API |
| `nuxt-ui/` | Interface PWA desktop + mobile | Nuxt 3 / Tailwind 4 |
| `relay/` | Backend public MVP (optionnel, profil `relay`) | Node.js / TypeScript |

---

## Démarrage rapide (mode local)

### 1. Générer `.env`

```bash
bash scripts/check-ports.sh
```

Pour un usage 100 % local, laisser les variables relay vides :

```env
RELAY_PUBLIC_URL=
RELAY_INTERNAL_URL=
```

### 2. Lancer les services Docker

```bash
docker compose up -d --build agent ui
```

| Service | URL locale | Réseau local |
|---|---|---|
| UI | `http://localhost:5173` | `http://<IP_PC>:5173` |
| Agent | `http://localhost:3333` | `http://<IP_PC>:3333/health` |

### 3. Activer l'extension VS Code

Dans VS Code, recharger la fenêtre (`Ctrl+Shift+P` → `Developer: Reload Window`) et vérifier que l'extension **DevBridge** est active dans la barre de statut.

---

## Commandes VS Code

| Commande | Description |
|---|---|
| `DevBridge: Show QR` | Affiche le QR de pairing |
| `DevBridge: Toggle Bridge` | Active / désactive le pont |
| `DevBridge: Open DevBridge Chat` | Ouvre le chat DevBridge |
| `DevBridge: Open Mirror` | Ouvre la webview mirror |
| `DevBridge: Start CLI Terminal` | Lance un terminal CLI enregistré |
| `DevBridge: Start Codex Terminal (legacy)` | Lance un terminal Codex (ancien flux) |

---

## Configuration de l'extension

| Paramètre | Défaut | Description |
|---|---|---|
| `devbridge.connectionMode` | `unix` | `unix` (socket local/Docker) ou `tcp` (WSL/remote) |
| `devbridge.agentSocketPath` | `/tmp/devbridge/ipc.sock` | Chemin du socket Unix |
| `devbridge.agentHost` | `127.0.0.1` | Hôte de l'agent (mode TCP) |
| `devbridge.agentPort` | `3334` | Port TCP de l'agent IPC |
| `devbridge.terminalSendMode` | `split` | `paste` ou `split` (plus fiable pour les TUI) |
| `devbridge.questionConfidenceThreshold` | `1` | Nombre de patterns requis avant push notification |

---

## Flux recommandé pour les CLI (Claude / Codex)

1. Dans VS Code, lancer `DevBridge: Start CLI Terminal` et choisir le CLI voulu.
2. Un terminal VS Code nommé `DevBridge — <nom>` s'ouvre.
3. Sur le mobile, cibler ce terminal — tous les messages envoyés y sont injectés.

> Le flux `codex-cli` directement dans Docker n'est plus le chemin recommandé.

---

## Mode relay (optionnel)

Permet d'accéder au bridge depuis un réseau différent (4G, VPN, etc.).

```bash
# Renseigner dans .env :
RELAY_PUBLIC_URL=https://relay.example.com
RELAY_INTERNAL_URL=http://relay:4444

# Lancer avec le profil relay :
docker compose --profile relay up -d --build
```

Le relay est un backend léger JWT + WebSocket. L'agent s'y connecte automatiquement si `RELAY_INTERNAL_URL` est défini.

Avantages:
- tu vois le vrai terminal VS Code
- tu confirmes visuellement le bon workspace
- les messages mobile sont injectes dans ce terminal

## DevBridge Mirror

`DevBridge: Open Mirror` ouvre un panneau de lecture dans VS Code.

Il affiche:
- `workspace=...`
- `file=...`
- `adapter=...`
- `host_workspace=...`
- `host_file=...`
- `agent_cwd=/workspace`

C'est le bon outil pour verifier rapidement:
- quel workspace VS Code est actif
- quel fichier est actif
- quel adapter traite la requete
- ce que l'agent Docker fait cote conteneur

## DevBridge Chat

`DevBridge Chat` est un canal VS Code explicite pour les messages mobile qui ne vont pas dans un terminal.

Ce n'est pas une injection universelle dans tous les chats proprietaires VS Code.
C'est un espace DevBridge dedie et visible dans VS Code.

## Reglages extension utiles

Dans les settings VS Code, namespace `devbridge`:

- `devbridge.connectionMode`
  - `unix` ou `tcp`
- `devbridge.agentSocketPath`
- `devbridge.agentHost`
- `devbridge.agentPort`
- `devbridge.questionConfidenceThreshold`
- `devbridge.terminalSendMode`

### `devbridge.terminalSendMode`

Valeurs:
- `paste`
  - utilise `sendText(text, true)`
- `split`
  - envoie le texte, puis une touche Entree separee
  - recommande pour les TUIs comme Codex

Valeur par defaut:
- `split`

## Codex dans le conteneur agent

L'image `agent` installe maintenant:
- `@openai/codex@0.111.0`

Le conteneur monte aussi en lecture seule:
- `~/.codex/auth.json`
- `~/.codex/config.toml`

Cela permet au binaire `codex` d'exister et d'avoir sa config dans le conteneur.

Verification utile:

```bash
docker compose exec agent /bin/sh -lc 'which codex && codex --version'
```

## Pairing mobile local

Le mobile doit utiliser l'IP LAN du PC, pas `localhost`.

Exemple correct:

```text
http://192.168.8.105:5173/?view=mobile&host=192.168.8.105&port=3333&code=XXXXXX&agentUrl=http://192.168.8.105:3333
```

Exemple incorrect sur telephone:

```text
http://localhost:5173/...
```

## Limites actuelles

- la lecture de contenu de fichier dans l'onglet `Code` n'est pas encore relayee proprement via le backend relay
- l'API VS Code stable ne permet pas une injection universelle dans tous les chats proprietaires
- le mode relay existe, mais le mode local reste aujourd'hui le chemin le plus fiable

## Relay MVP

Le relay reste present pour l'architecture cible publique.

Endpoints:
- `POST /api/relay/sessions`
- `POST /api/relay/pair`
- `GET /api/relay/sessions/:sessionId`
- `WS /ws`

Lancement:

```bash
docker compose --profile relay up -d --build relay
```

Healthcheck:

```bash
curl http://localhost:4444/health
```

## Structure du projet

```text
vibebridge/
├── agent/                 # Agent local Docker
├── extension/             # Extension VS Code
├── nuxt-ui/               # UI principale (Nuxt 3)
├── relay/                 # Relay backend MVP
├── docs/
│   └── relay-mvp.md
├── scripts/
│   ├── check-ports.sh
│   └── gen-icons.sh
├── docker-compose.yml
├── .env.example
└── README.md
```

## Commandes utiles

Build local:

```bash
cd agent && npm run build
cd extension && npm run build
cd nuxt-ui && npm run build
cd relay && npm run build
```

Etat Docker:

```bash
docker compose ps
```

Logs agent:

```bash
docker compose logs --tail=100 agent
```

Verification Codex dans agent:

```bash
docker compose exec agent /bin/sh -lc 'which codex && codex --version'
```

## Prochaines etapes utiles

1. relayer proprement la lecture de fichier dans l'onglet `Code`
2. clarifier encore l'UX entre `terminal`, `DevBridge Chat` et adapters locaux
3. reprendre ensuite le mode relay comme architecture publique cible

Pour le cadrage relay:
- [relay-mvp.md](/home/clower/projects/vibebridge/docs/relay-mvp.md)
