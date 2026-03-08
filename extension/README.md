# DevBridge — Extension VS Code

Extension légère qui relie VS Code au DevBridge Agent tournant sur votre PC.  
Compatible Copilot · Claude · Cursor · Windsurf.

---

## Prérequis

| Outil | Version minimale |
|---|---|
| Node.js | 20+ |
| npm | 9+ |
| VS Code | 1.87+ |

---

## Installation pas à pas

### 1. Installer les dépendances

```bash
cd extension
npm install
```

### 2. Compiler le TypeScript

```bash
npm run build
```

Le dossier `dist/` est généré.

### 3. Packager l'extension (génère un `.vsix`)

```bash
npx @vscode/vsce package --no-dependencies
```

→ un fichier `devbridge-0.1.0.vsix` apparaît dans `extension/`.

### 4. Installer le `.vsix` dans VS Code

**Option A — Interface graphique**

1. Ouvrir VS Code
2. `Ctrl+Shift+X` → onglet Extensions
3. Cliquer sur `⋯` (icône kebab en haut à droite du panneau)
4. Choisir **Install from VSIX…**
5. Sélectionner `devbridge-0.1.0.vsix`
6. Cliquer **Install** puis **Reload Window**

**Option B — Ligne de commande**

```bash
code --install-extension devbridge-0.1.0.vsix
```

---

## Vérifier que l'extension est active

1. Ouvrir la palette de commandes : `Ctrl+Shift+P`
2. Taper **DevBridge** — vous devez voir :
   - `DevBridge: Show Pairing Code / QR`
   - `DevBridge: Toggle Bridge`

Si les commandes apparaissent, l'extension est installée et active.

---

## Connecter l'extension à l'Agent

> L'Agent doit tourner : `docker compose up` depuis la racine du projet.

1. `Ctrl+Shift+P` → **DevBridge: Show Pairing Code / QR**
2. Une notification affiche un code à 6 chiffres, par exemple `716053`
3. Sur votre téléphone, ouvrir `http://<IP_PC>:<PWA_PORT>`
4. Aller dans **Settings** → entrer le code → **Pair**

L'extension se connecte automatiquement à `/tmp/devbridge/ipc.sock`  
(chemin configurable dans les paramètres VS Code → `devbridge.agentSocketPath`).

---

## Paramètres disponibles

| Paramètre | Défaut | Description |
|---|---|---|
| `devbridge.agentSocketPath` | `/tmp/devbridge/ipc.sock` | Chemin du socket Unix vers l'Agent |
| `devbridge.questionConfidenceThreshold` | `1` | Nombre de patterns requis pour déclencher une notif push |

Accès : `Ctrl+,` → rechercher `devbridge`.

---

## Développement / rechargement rapide

Pour itérer sans repackager à chaque fois :

```bash
# Terminal 1 — recompile automatiquement à chaque sauvegarde
npm run watch
```

Dans VS Code :
1. Ouvrir le dossier `extension/`
2. Appuyer sur `F5` → une fenêtre **Extension Development Host** s'ouvre
3. L'extension est active dans cette fenêtre de test
4. Après un changement de code : `Ctrl+Shift+F5` pour recharger

---

## Désinstaller

```bash
# Ligne de commande
code --uninstall-extension devbridge.devbridge

# Ou : Ctrl+Shift+X → chercher "DevBridge" → Uninstall
```

---

## Résolution de problèmes

| Symptôme | Cause probable | Solution |
|---|---|---|
| Les commandes DevBridge n'apparaissent pas | Extension non chargée | Vérifier Output → Extension Host pour les erreurs |
| `Cannot connect to socket` | Agent non démarré | Lancer `docker compose up` depuis la racine |
| `Cannot connect to socket` | Chemin socket différent | Vérifier `devbridge.agentSocketPath` dans les paramètres |
| `invalid pairing code` | Code expiré ou mal saisi | Régénérer avec **Show Pairing Code**, re-saisir |
| Le `.vsix` échoue à compiler | vsce manquant | `npm install -g @vscode/vsce` puis réessayer |
