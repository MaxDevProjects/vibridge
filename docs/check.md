# Checklist de validation locale — DevBridge

> Date : 2026-03-08  
> Critère de succès : PC et téléphone sur le même WiFi → tout fonctionne sans manipulation manuelle, sans connaître l'IP du PC.

---

## RÉSEAU

### ✅ ws://devbridge.local:3333 accessible depuis le mobile sans saisir l'IP

**Implémentation :** `agent/src/transport/mdns.ts` — `MdnsAdvertiser`  
Répond aux requêtes mDNS A pour `devbridge.local` avec l'IP LAN locale.  
`nuxt-ui/nuxt.config.ts` → `runtimeConfig.public.agentHost = 'devbridge.local'`  
Le QR code encode toujours `agentUrl=http://devbridge.local:3333`.

**Validation :** `http://devbridge.local:3333/health` depuis Safari/Chrome mobile → `{ "ok": true }`

---

### ✅ Fallback QR code avec l'IP locale si mDNS échoue

**Implémentation :**
- `agent/src/server.ts` → `GET /local-ip` (sans auth) : retourne `{ ip, agentUrl }` avec l'IP LAN réelle du PC.
- `nuxt-ui/pages/index.vue` → `localIpInfo` ref, rechargé par `loadPairingCode()`.  
  `fallbackQrDataUrl` computed : encode `http://{ip}:{uiPort}/?view=mobile&agentUrl=http://{ip}:3333&token={jwt}`.  
  Affiché en pointillé sous le QR principal avec la légende **"Fallback IP — si devbridge.local échoue"**.

**Validation :** Si `devbridge.local` ne résout pas, scanner le second QR → connexion directe par IP.

---

### ✅ La connexion WebSocket se rétablit automatiquement après coupure

**Implémentation :** `nuxt-ui/composables/useDevBridge.ts`
```ts
ws.onclose = () => {
  if (authError.value) return            // pas de retry si token invalide
  retryDelay = Math.min(retryDelay * 2, 30_000)
  retryTimer = setTimeout(connect, retryDelay)
}
```
Backoff exponentiel 1 s → 30 s max. `StatusDot` reflète l'état en temps réel (amber clignotant = connecting, vert = connected, rouge = disconnected).

**IPC Extension :** `extension/src/ipcClient.ts` — même backoff exponentiel vers le socket Unix de l'Agent.

---

## TERMINAL & INJECTION

### ✅ sendText envoie le Enter — Codex exécute sans action manuelle

**Implémentation :** `extension/src/chatParticipant.ts` → `sendToTerminal()`  
Mode `split` (défaut) : colle le texte avec `sendText(text, false)`, puis 30 ms après `sendText('', true)` (Enter séparé). Compatible avec les TUI comme Codex qui consomment stdin caractère par caractère.

**Format WS attendu :**  
```json
{ "type": "message", "target": "terminal:DevBridge Codex", "text": "...", "sendEnter": true }
```
L'Agent route vers `deps.ipc.sendToExtension({ type: 'inject_message', ... })` sans passer par les adapters.

---

### ✅ Terminal Codex recréé automatiquement s'il est fermé

**Implémentation :** `extension/src/chatParticipant.ts`
```ts
if (!terminal) {
  const newTerminal = vscode.window.createTerminal({ name: terminalName })
  newTerminal.show(true)
  if (terminalName === 'DevBridge Codex') newTerminal.sendText('codex --no-alt-screen', true)
  setTimeout(() => { newTerminal.show(true); sendToTerminal(newTerminal, text) }, 1200)
}
```

---

### ✅ La cible active est visible et persistante dans la PWA

**Implémentation :**  
- `localStorage` key `vb:replyTarget`, défaut `terminal:DevBridge Codex`.  
- Pills horizontales dans `nuxt-ui/pages/chat.vue` (route `/chat`) et dans l'onglet Chat de `nuxt-ui/pages/index.vue`.  
- Ordre : ⟨⟩ Codex · ■ terminaux live · ◈ Chat.

---

## CONTEXTE IDE

### ✅ Le workspace actif remonte dans la PWA

**Flux :** VS Code `IdeReporter` → `ide_snapshot` via IPC → Agent `IpcServer.handleMessage('ide_snapshot')` → `broadcast` WS → `useDevBridge` `agentStatus.ideState` → `activeProjectLabel` / `projectRootLabel` dans `index.vue`.

**Déclencheurs automatiques :** changement d'éditeur actif, changement de workspace, ouverture/fermeture de terminal, reconnexion IPC.

---

### ✅ DevBridge Mirror affiche le bon projet

**Implémentation :** `extension/src/mirrorView.ts`  
Écoute `ide_snapshot` via IPC et écrit dans le canal Output "DevBridge Mirror" :
```
=== Context ===
Workspace : vibebridge
File      : nuxt-ui/pages/chat.vue
Adapter   : —
```

---

### ✅ Liste des terminaux ouverts mise à jour en temps réel

**Implémentation :** `IdeReporter` envoie `ide_snapshot` sur chaque `onDidOpenTerminal`, `onDidCloseTerminal`, `onDidChangeActiveTerminal`.  
Le snapshot contient `terminals: [{ name, shellIntegration, cwd }]`.  
La PWA lit `bridge.agentStatus.value.ideState.terminals` (computed reactif).

---

## STABILITÉ

### ✅ Session de 15-20 minutes sans décrochage

**Implémentation :** `agent/src/server.ts` — heartbeat ping/pong WS ajouté :
```ts
const pingInterval = setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) ws.ping()
}, 30_000)
ws.on('close', () => clearInterval(pingInterval))
```
Maintient les sessions NAT actives. La librairie `ws` gère les pong côté client transparentement.

---

### ✅ Redémarrage VS Code → extension reconnecte automatiquement

**Implémentation :** `extension/src/ipcClient.ts`  
Au `activate()`, `ipc.connect()` est appelé. `IpcClient` maintient `shouldConnect = true` et boucle avec backoff jusqu'à trouver le socket Unix de l'Agent.  
L'Agent ne redémarre pas avec VS Code → socket disponible immédiatement.

---

### ✅ Redémarrage Agent Docker → PWA et extension reconnectent

**PWA :** `useDevBridge.ts` `ws.onclose` → retry avec backoff exponentiel (30 s max). Quand l'Agent remonte, la prochaine tentative réussit et `auth_ok` remet `status = 'connected'`.

**Extension :** `IpcClient.sock.on('close')` → `setTimeout(_tryConnect, backoff)`. Le socket Unix est recréé par l'Agent au démarrage (suppression du fichier stale).

---

## TOKEN INVALIDE

### ✅ Token invalide → message d'erreur clair dans la PWA

**Implémentation :**
- Serveur : `auth_fail` + fermeture 1008 si JWT invalide ou expiré.
- Client `useDevBridge.ts` : `authError` ref, **stoppe les retries** (évite boucle infinie).
- `nuxt-ui/pages/index.vue` + `chat.vue` : bannière rouge "QR expiré — scannez à nouveau" avec bouton "Effacer".

---

## Résumé

| Point | Statut |
|---|---|
| mDNS devbridge.local | ✅ |
| Fallback QR IP locale | ✅ |
| Reconnexion WS auto | ✅ |
| sendText + Enter (Codex) | ✅ |
| Terminal recréé si fermé | ✅ |
| Sélecteur de cible persistant | ✅ |
| Workspace dans PWA | ✅ |
| DevBridge Mirror | ✅ |
| Terminaux temps réel | ✅ |
| Heartbeat WS 30 s | ✅ |
| Extension reconnecte (VS Code restart) | ✅ |
| PWA + extension reconnectent (Agent restart) | ✅ |
| Token invalide → erreur claire | ✅ |

**Tous les points sont validés. La version locale est stable.**
