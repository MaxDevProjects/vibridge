# DevBridge

Pont bidirectionnel entre un IDE local et un mobile.

Aujourd'hui, le chemin le plus fiable est:
- extension VS Code locale
- agent Docker local
- UI Nuxt locale
- mobile sur le meme reseau local

Le relay MVP existe toujours dans le repo, mais le flux de travail le plus abouti actuellement est le mode local.

## Ce qui fonctionne maintenant

- pairing local via QR / code
- dashboard desktop + mobile
- remontee IDE:
  - workspace actif
  - fichier actif
  - terminaux VS Code
- routage mobile -> terminal VS Code
- `DevBridge Chat` dans VS Code
- `DevBridge Mirror` dans VS Code
- lancement d'un vrai terminal Codex VS Code
- cible mobile verrouillable pour ne pas changer de terminal automatiquement

## Architecture actuelle

- `agent/`
  - agent local dans Docker
  - expose HTTP + WebSocket
  - route les messages vers les adapters et l'extension VS Code
- `extension/`
  - extension VS Code locale
  - remontee d'etat IDE/terminal
  - reception des messages mobile
  - commandes DevBridge dans VS Code
- `nuxt-ui/`
  - interface desktop + mobile
  - pairing, chat, preview, cibles de routage
- `relay/`
  - backend MVP pour l'architecture publique cible
  - encore secondaire pour l'usage courant

## Demarrage rapide local

### 1. Generer `.env`

```bash
bash scripts/check-ports.sh
```

Pour un test local pur, vide les variables relay dans `.env`:

```env
RELAY_PUBLIC_URL=
RELAY_INTERNAL_URL=
```

### 2. Lancer les services locaux

```bash
docker compose up -d --build --force-recreate agent ui
```

Services:
- UI: `http://localhost:5173`
- Agent: `http://localhost:3333`

Depuis un telephone sur le meme reseau:
- UI: `http://<IP_PC>:5173`
- Health agent: `http://<IP_PC>:3333/health`

Exemple:
- `http://192.168.8.105:5173`
- `http://192.168.8.105:3333/health`

### 3. Charger l'extension VS Code

Dans VS Code:
1. recharge la fenetre
2. verifie que l'extension `DevBridge` est active

## Commandes VS Code utiles

Commandes exposees par l'extension:
- `DevBridge: Show Pairing Code / QR`
- `DevBridge: Toggle Bridge`
- `DevBridge: Open DevBridge Chat`
- `DevBridge: Open Mirror`
- `DevBridge: Start Codex Terminal`

## Flux recommande pour Codex

Le meilleur chemin pour utiliser Codex n'est plus `codex-cli` dans Docker comme interface principale.
Le chemin recommande est:

1. dans VS Code, lancer `DevBridge: Start Codex Terminal`
2. cela ouvre un vrai terminal VS Code nomme `DevBridge Codex`
3. le mobile cible ensuite `terminal:DevBridge Codex`

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
