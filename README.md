# VibeBridge

Pont bidirectionnel entre VS Code et un mobile ou une tablette.

Le projet permet de voir l'etat de l'IDE depuis le telephone, de pairer une session via QR code, de suivre un terminal cible et d'envoyer des messages vers des CLI comme Codex ou Claude ouvertes dans VS Code.

Aujourd'hui, l'architecture cible produit est le mode `relay`. Le mode LAN local reste utile pour le developpement et le debug, mais ce n'est plus le chemin principal recommande pour une utilisation publique.

## Composants

| Dossier | Role | Stack |
|---|---|---|
| `agent/` | Orchestrateur local: HTTP, WebSocket, adapters CLI, mDNS, push, relay client | Node.js / TypeScript |
| `extension/` | Extension VS Code: etat IDE, commandes, chat, mirror, IPC | TypeScript / VS Code API |
| `nuxt-ui/` | Interface web mobile/desktop | Nuxt 3 / Tailwind |
| `relay/` | Backend public optionnel pour l'acces hors reseau local | Node.js / TypeScript |

## Fonctionnalites

- Pairing local via QR code ou code court
- Interface web mobile et desktop
- Remontee de l'etat IDE en temps reel
- Routage mobile vers un terminal VS Code cible
- Lancement de terminaux CLI depuis VS Code
- `DevBridge Chat` pour les messages non injectes dans un terminal
- `DevBridge Mirror` pour visualiser le contexte courant dans VS Code
- Decouverte reseau locale via mDNS
- Notifications push pour les questions detectees
- Mode relay optionnel pour acces via Internet/VPS

## Architecture

```text
mobile / tablette
       | HTTP + WebSocket
       v
  +-----------+        IPC Unix socket / TCP        +---------------+
  |   agent   | <---------------------------------> | extension VS  |
  |   local   |                                     |     Code      |
  +-----------+                                     +---------------+
       |
       v
  +-----------+
  |  nuxt-ui  |
  +-----------+
       |
       v
  +-----------+
  |   relay   |   optionnel
  +-----------+
```

## Modes d'execution

### Mode principal: relay

Le mode `relay` est le chemin cible:
- l'agent local ouvre une connexion sortante vers le relay
- le mobile se connecte au relay
- l'UI peut fonctionner sans etre sur le meme WiFi que le poste de dev

En mode relay, l'onglet `Code` sait maintenant:
- recuperer l'arborescence du workspace actif
- lire le contenu d'un fichier via le relay
- suivre le workspace selectionne

### Mode secondaire: local LAN

Le mode local reste utile pour:
- developper l'agent et l'UI
- deboguer rapidement sur le meme reseau
- valider les flux IPC VS Code

## Demarrage local

### 1. Generer `.env`

Depuis la racine du projet:

```bash
bash scripts/check-ports.sh
```

Le script:
- detecte une IP LAN pour `AGENT_HOST`
- choisit des ports libres pour l'agent et l'UI
- genere `JWT_SECRET`
- ecrit un fichier `.env`

Par defaut, il renseigne aussi les variables relay. Pour un usage strictement local, laisse `RELAY_PUBLIC_URL` et `RELAY_INTERNAL_URL` vides dans `.env`.

### 2. Ajouter les cles VAPID

Optionnel, mais necessaire pour les notifications push:

```bash
cd agent
npm install
npm run vapid
```

Recopie ensuite les cles dans `.env`:

```env
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_EMAIL=mailto:devbridge@localhost
```

### 3. Lancer les services Docker

```bash
docker compose up -d --build agent ui
```

URLs utiles:

| Service | URL locale | URL reseau local |
|---|---|---|
| UI | `http://localhost:5173` | `http://<AGENT_HOST>:5173` |
| Agent | `http://localhost:3333` | `http://<AGENT_HOST>:3333` |

Les ports reels peuvent differer si `scripts/check-ports.sh` a choisi d'autres valeurs. Dans ce cas, utilise celles ecrites dans `.env`.

### 4. Construire et activer l'extension VS Code

Dans `extension/`:

```bash
npm install
npm run build
```

Ensuite charge l'extension dans VS Code, ou recharge la fenetre si elle est deja installee.

## Commandes VS Code

| Commande | Description |
|---|---|
| `DevBridge: Show QR` | Affiche le QR de pairing |
| `DevBridge: Toggle Bridge` | Active ou desactive le pont |
| `DevBridge: Open DevBridge Chat` | Ouvre le chat DevBridge |
| `DevBridge: Open Mirror` | Ouvre la vue mirror |
| `DevBridge: Start CLI Terminal` | Lance un terminal CLI enregistre |
| `DevBridge: Start Codex Terminal (legacy)` | Lance l'ancien flux Codex |

## Configuration de l'extension

| Parametre | Defaut | Description |
|---|---|---|
| `devbridge.connectionMode` | `unix` | `unix` pour socket local, `tcp` pour WSL/remote |
| `devbridge.agentSocketPath` | `/tmp/devbridge/ipc.sock` | Chemin du socket Unix |
| `devbridge.agentHost` | `127.0.0.1` | Hote agent en mode TCP |
| `devbridge.agentPort` | `3334` | Port IPC TCP |
| `devbridge.questionConfidenceThreshold` | `1` | Seuil de detection avant push |
| `devbridge.terminalSendMode` | `split` | `split` ou `paste` pour l'envoi dans le terminal |
| `devbridge.pwaUrl` | vide | URL publique de l'interface si tu veux forcer les QR vers un domaine |

### `terminalSendMode`

- `split`: envoie le texte puis une touche Entree separee, plus fiable pour les TUI
- `paste`: utilise un envoi unique via `sendText(text, true)`

## Flux recommande pour les CLI

1. Dans VS Code, lance `DevBridge: Start CLI Terminal`.
2. Choisis le CLI voulu.
3. Un terminal `DevBridge - <nom>` s'ouvre.
4. Depuis le mobile, cible ce terminal pour y envoyer les messages.

Le flux legacy `Start Codex Terminal` existe encore, mais ce n'est plus le chemin principal.

## DevBridge Chat et Mirror

`DevBridge Chat` est un canal explicite dans VS Code pour les messages mobile qui ne doivent pas partir dans un terminal.

`DevBridge: Open Mirror` ouvre une vue de lecture qui permet de verifier rapidement:
- le workspace actif
- le fichier actif
- l'adapter en cours
- le contexte vu par l'agent

## Cibles de chat dans l'UI

L'UI distingue maintenant explicitement trois familles de cibles:

| Type | Libelle UI | Effet |
|---|---|---|
| `direct` | `terminal:<nom>` ou `bash` | Injection directe dans un vrai terminal VS Code |
| `VS Code` | `DevBridge Chat` | Message visible immediatement dans le canal VS Code DevBridge |
| `lanceur` | CLI detecte comme `CODEX`, `CLAUDE`, etc. | Ouvre ou reutilise un terminal VS Code dedie, puis route les messages vers lui |

Regle pratique:
- si tu veux un comportement deterministe et visible dans l'IDE, cible un terminal `direct`
- si tu veux un fallback lisible sans terminal, utilise `DevBridge Chat`
- les cibles `lanceur` servent a ouvrir/preparer un terminal CLI, pas a remplacer la notion de terminal cible

## Mode relay / VPS

Le mode relay permet d'utiliser VibeBridge hors LAN, par exemple depuis un VPS et un domaine public.

### Deploy du VPS

Le fichier [`docker-compose.prod.yml`](/home/clower/projects/vibebridge/docker-compose.prod.yml) lance:
- `relay`
- `ui`

L'agent, lui, continue de tourner sur le PC de dev.

Variables minimales cote serveur:

```env
RELAY_JWT_SECRET=...
RELAY_PUBLIC_URL=https://ton-domaine.tld/relay
RELAY_UI_URL=https://ton-domaine.tld
NUXT_PUBLIC_RELAY_URL=https://ton-domaine.tld/relay
```

Lancement:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### PC de dev connecte au relay

Sur la machine locale, configure `.env` pour pointer vers le relay public:

```env
RELAY_INTERNAL_URL=https://ton-domaine.tld/relay
RELAY_PUBLIC_URL=https://ton-domaine.tld/relay
```

Dans ce mode, le mobile et l'agent se connectent tous deux au relay.

## Etat actuel du relay

Le relay supporte aujourd'hui:
- creation de session
- pairing mobile via code court ou QR
- multi-workspace par session
- propagation de l'etat agent/IDE
- lecture de fichier relayee pour l'onglet `Code`
- routage mobile -> agent -> VS Code

Le relay n'est plus seulement un MVP passif: c'est le chemin fonctionnel a privilegier pour faire evoluer le produit.

## Variables d'environnement utiles

Fichier de base: [`.env.example`](/home/clower/projects/vibebridge/.env.example)

| Variable | Usage |
|---|---|
| `AGENT_PORT` | Port HTTP de l'agent local |
| `AGENT_HOST` | IP LAN du poste de dev |
| `PWA_PORT` | Port de l'UI locale |
| `JWT_SECRET` | Secret JWT partage agent/relay |
| `PROJECT_ROOT` | Dossier hote expose en lecture seule a l'agent |
| `RELAY_PUBLIC_URL` | URL publique du relay |
| `RELAY_INTERNAL_URL` | URL utilisee par l'agent pour joindre le relay |
| `RELAY_JWT_SECRET` | Secret JWT cote relay prod |
| `VAPID_PUBLIC_KEY` | Cle publique push |
| `VAPID_PRIVATE_KEY` | Cle privee push |
| `VAPID_EMAIL` | Contact push |

## Notes utiles

- Le mobile doit utiliser l'IP LAN du PC, pas `localhost`
- Le conteneur `agent` monte `~/.codex/auth.json` et `~/.codex/config.toml` en lecture seule
- `PROJECT_ROOT` est expose dans le conteneur agent sous `/workspace`
- Le compose local utilise `agent` et `ui`; le `relay` reste optionnel

## Verification rapide

```bash
docker compose ps
curl http://localhost:${AGENT_PORT:-3333}/health
```

## Checklist avant ouverture au public

Ce qui manque encore avant de presenter le produit comme public-ready:

- Auth utilisateur reelle
  - comptes
  - gestion de session
  - rotation/revocation des tokens

- Persistance backend
  - stockage durable des sessions relay
  - historique borne et nettoye
  - etat workspace non seulement en memoire

- Securite transport et agent
  - TLS termine proprement en production
  - verification plus stricte des origines/UI autorisees
  - politique de permissions plus explicite cote agent

- UX produit
  - onboarding unique desktop/mobile
  - messages d'erreur reseau/pairing plus explicites
  - distinction encore plus nette entre terminal, chat VS Code et lanceur CLI

- Code / fichiers
  - edition distante si souhaitee
  - streaming incremental de gros fichiers
  - gestion des binaires et apercus specialises

- Multi-workspace / multi-device
  - presence de plusieurs mobiles
  - selection et verrouillage plus visibles du workspace courant
  - arbitrage si plusieurs agents remontent dans la meme session

- Observabilite
  - logs relay centralises
  - traces d'echec de pairing
  - indicateurs de sante agent/mobile/session

- Packaging
  - extension VS Code versionnee
  - images Docker prod
  - configuration deploiement stable pour `ui` + `relay`
