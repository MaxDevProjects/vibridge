# VibeBridge V0.4: multi-fenêtres (recette et déploiement)

Cette version est une **fondation de contrôle multi-fenêtres**. Elle doit être testée
sur Windows + WSL et plusieurs fenêtres VS Code avant mise en production. Le relay
ne doit jamais choisir arbitrairement la dernière fenêtre active.

## 1. Architecture

- VPS: service `relay` et UI Nuxt. Nginx proxy UI sur le **port hôte 5173**
  (conteneur 4000) et relay sur le **port hôte 4444**.
- PC WSL: agent Docker sur `3333` par défaut, socket Unix
  `/tmp/devbridge/ipc.sock`.
- Chaque fenêtre VS Code installée côté WSL génère son `windowId`.
  Deux fenêtres du même dossier ont deux identités différentes.
- Le téléphone sélectionne la fenêtre, puis un **terminal existant et identifié**.
  Un lancement Codex ou AGY reste une action et non un canal de réponse.

Les identités des fenêtres sont propres à leur processus VS Code : elles peuvent
changer après rechargement ou réinstallation de l'extension. Les activités
restaurées doivent rester associées à leur vraie fenêtre et à leur terminal, sans
réaffectation automatique à une autre CLI.

## 2. Mise à jour (uniquement APRÈS revue de PR et tests réussis)

Le déploiement n'est pas automatique. Ne déployer que des versions compatibles
du relay/UI, de l'agent WSL et de l'extension.

1. Sauvegarder les fichiers locaux non commités de la branche d'onboarding.
   Ne pas utiliser `git reset --hard` ni `git restore` sur ces fichiers.
2. Vérifier la CI et fusionner la PR validée dans `main`.
3. Sur GitHub Actions, lancer manuellement `Deploy to server`.
   Vérifier `https://vibridge.clowerstudio.com` et le healthcheck relay.
   Aucun changement Nginx n'est requis pour cette fonctionnalité si le
   port hôte 5173 fonctionne déjà.
4. Sur le PC, depuis WSL :

```bash
cd ~/projects/vibebridge
git status --short
git fetch origin
git switch main
git pull --ff-only origin main
docker compose up -d --no-deps --build agent
docker compose logs --tail=80 agent
```

Si Git refuse le changement de branche, sauvegarder les modifications avant de
continuer. Ne jamais effacer de configuration `.env` pour résoudre un conflit.

5. Installer l'extension mise à jour dans **VS Code WSL**, pas dans le VS Code
   Windows uniquement :

```bash
cd ~/projects/vibebridge/extension
node -v
npm ci
npm run build
npm run package
```

Node.js 22 ou plus récent est conseillé pour le packaging `@vscode/vsce`.
Installer le VSIX via `Extensions: Install from VSIX…`, puis recharger
**chaque** fenêtre VS Code WSL.

6. Les paramètres VS Code locaux restent :

```json
{
  "devbridge.connectionMode": "unix",
  "devbridge.agentSocketPath": "/tmp/devbridge/ipc.sock",
  "devbridge.pwaUrl": "https://vibridge.clowerstudio.com",
  "devbridge.terminalSendMode": "split"
}
```

Le socket doit être accessible à l'utilisateur WSL qui exécute l'extension,
pas ouvert à tous les utilisateurs.

## 3. Recette obligatoire avant ouverture externe

- **Fenêtres A, B, C** : trois fenêtres VS Code ouvertes sur des projets
  distincts, toutes visibles sur mobile sans fermer les autres.
- **Sélection sans ouverture** : sélectionner A, puis B, puis C depuis le
  téléphone ne déclenche pas `vscode.openFolder`.
- **Mode d'ouverture** : « Ouvrir ici » remplace la fenêtre sélectionnée ;
  « En parallèle » ouvre une autre fenêtre détectable.
- **Commandes ciblées** : avec deux terminaux nommés `bash` dans deux
  fenêtres, une commande vers `windowId=A` n'arrive jamais en B.
- **Échec maîtrisé** : une fenêtre absente, déconnectée ou ambiguë provoque
  un refus, jamais un envoi vers la dernière fenêtre active.
- **CLI AGY/Codex** : le lancement doit garder son fonctionnement existant ;
  les réponses s'affichent dans le canal du terminal réel.
- **Activité** : début et fin d'une exécution par fenêtre ; les messages
  « intervention possible » ne sont pas présentés comme des autorisations
  structurées confirmées.
- **Relance de la PWA** : les fenêtres reconnues par le relay sont restaurées.
  Tester sur navigateur mobile et PWA installée séparément.
- **Fichiers** : les fichiers lus doivent appartenir au projet sélectionné ;
  un projet hors des volumes autorisés par `FileService` reste inaccessible.
- **Connexion hors WiFi** : refaire les tests avec le téléphone en 4G/5G.

## 4. Limites volontaires de cette PR

**Appairage durable** : un ancien lien d'appairage n'efface plus la session
stockée si elle est encore valide. Ce n'est PAS une identité d'appareil
persistante : les sessions relay expirent toujours par défaut après 12 heures
et l'agent peut les renouveler. L'authentification longue durée avec révocation
par appareil doit faire l'objet d'une conception et de tests de sécurité.

**Preview** : une URL `localhost` sur le PC n'est pas accessible par magie
depuis le téléphone. L'UI signale désormais cette limite et évite d'associer
une preview globale à une mauvaise fenêtre. Les captures Playwright par projet
et les interactions explicites restent un chantier distinct, à isoler et
sécuriser avant de l'activer à distance.

**CLI interactives** : certaines sorties de TUIs dépendent de VS Code Shell
Integration. « Commande terminée » désigne un événement shell quand il est
disponible, non une validation de succès de Codex/AGY.

**Multi-processus** : cette PR gère plusieurs fenêtres d'un **même agent
local**. Elle n'implémente pas encore une flotte de PC/appareils avec
identités longue durée, ni une sandbox OS pour les shells.
