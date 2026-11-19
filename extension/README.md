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
   - `DevBridge: Show QR`
   - `DevBridge: Toggle Bridge`

Si les commandes apparaissent, l'extension est installée et active.

---

## Connecter l'extension à l'Agent

> L'Agent doit tourner : `docker compose up` depuis la racine du projet.

1. Vérifier que l'Agent et l'interface ViBridge sont en cours d'exécution.
2. `Ctrl+Shift+P` → **DevBridge: Show QR**.
3. Le navigateur du PC ouvre directement la page **Connexion mobile** avec un QR code.
4. Scanner ce QR avec la caméra du téléphone. L'invitation est consommée uniquement sur le téléphone, jamais par la page desktop.
5. Le téléphone retrouve ensuite sa session sans devoir scanner à chaque ouverture, tant que les identifiants restent valides.

La commande donne priorité à l'invitation du **relais distant** lorsqu'il est actif. En l'absence de relais, le QR local exige que le téléphone puisse joindre l'agent sur le réseau local.

Si aucun navigateur ne peut être ouvert, l'extension copie le lien d'invitation dans le presse-papiers. **Ne l'ouvrez pas sur le PC**, car il est destiné au téléphone et peut être à usage unique.

Sur l'interface ViBridge desktop **déjà appairée**, le bouton **QR** de l'espace Réseau permet également de demander un QR temporaire. Le relais autorise cette action uniquement depuis une session authentifiée. À ce stade, la session relais prend en charge **un seul identifiant mobile actif** : appairer un autre téléphone remplace le précédent.

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
