# DevBridge Relay MVP

## 1. Architecture

Objectif produit: remplacer le mode LAN/tunnel comme chemin principal par un relay central.

Composants:
- `agent local`
  - tourne sur le PC de l'utilisateur
  - collecte l'etat IDE, terminal, fichiers, preview
  - ouvre une connexion sortante WebSocket vers le relay
- `relay backend`
  - expose REST pour creer et pairer une session
  - maintient les connexions WebSocket agent/mobile
  - route les messages au sein d'une meme session
  - garde un historique court en memoire pour reprise mobile
- `mobile / web ui`
  - ouvre une session de pairing via QR
  - se connecte au relay
  - affiche l'etat et repond aux messages contextuels

Flux principal:
1. l'agent cree une session relay
2. le relay renvoie `sessionId`, `pairingCode`, `agentToken`
3. l'UI desktop ou l'extension affiche un QR contenant `relayUrl`, `sessionId`, `pairingCode`
4. le mobile pair avec `sessionId + pairingCode`
5. le relay renvoie `mobileToken`
6. agent et mobile se connectent en WebSocket au relay
7. le relay route les messages bidirectionnels

Le mode local actuel reste un mode `dev`/fallback.

## 2. Modeles de donnees

### RelaySession
- `id: string`
- `pairingCode: string`
- `status: "waiting" | "paired" | "closed"`
- `createdAt: number`
- `expiresAt: number`
- `agentToken: string`
- `mobileToken: string | null`
- `agentMetadata`
  - `label?: string`
  - `workspaceFolders?: string[]`
- `history: RelayEnvelope[]`

### RelayEnvelope
- `id: string`
- `sessionId: string`
- `source: "agent" | "mobile" | "relay"`
- `type: string`
- `target?: string`
- `tool?: string`
- `text?: string`
- `payload?: unknown`
- `ts: number`

### Tokens
- `agentToken`
  - scope: `agent`
  - session unique
- `mobileToken`
  - scope: `mobile`
  - session unique

## 3. Protocole

### REST

`POST /api/relay/sessions`
- body:
```json
{
  "label": "VS Code on Clower",
  "workspaceFolders": ["/home/clower/projects/Clower-edit"]
}
```
- response:
```json
{
  "sessionId": "sess_x",
  "pairingCode": "428543",
  "agentToken": "...",
  "expiresAt": 1760000000000
}
```

`POST /api/relay/pair`
- body:
```json
{
  "sessionId": "sess_x",
  "pairingCode": "428543"
}
```
- response:
```json
{
  "mobileToken": "...",
  "expiresAt": 1760000000000
}
```

`GET /api/relay/sessions/:sessionId`
- auth: bearer `agentToken` or `mobileToken`
- response:
```json
{
  "id": "sess_x",
  "status": "paired",
  "label": "VS Code on Clower",
  "workspaceFolders": ["/home/clower/projects/Clower-edit"],
  "history": []
}
```

### WebSocket

URL:
- `/ws`

Handshake:
```json
{ "type": "auth", "token": "..." }
```

Ack:
```json
{ "type": "auth_ok", "role": "agent", "sessionId": "sess_x" }
```

Envelopes relayees:
```json
{
  "type": "relay_message",
  "target": "terminal:bash",
  "tool": "terminal:bash",
  "text": "npm test",
  "payload": null
}
```

System events:
```json
{ "type": "peer_status", "agentConnected": true, "mobileConnected": false }
```

## 4. Ordre d'implementation

### Phase 1
- backend relay en memoire
- REST `create session`, `pair`, `session status`
- WebSocket `agent/mobile`
- QR base sur `sessionId + pairingCode + relayUrl`

### Phase 2
- agent local:
  - creer la session relay
  - publier l'etat IDE/terminal vers le relay
  - consommer les messages mobile depuis le relay
- UI:
  - pairing via relay
  - affichage et envoi via relay

### Phase 3
- persistance Redis/Postgres
- comptes utilisateurs
- multi-device
- presence
- historique durable

### Phase 4
- remplacer le mode local comme UX principale
- garder LAN comme fallback dev/offline
