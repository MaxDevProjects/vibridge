# Réinstaller et tester VibeBridge en local (Windows + WSL + VS Code)

Cette procédure correspond à la branche `codex/control-first-foundation`. Elle **ne déploie pas** le relay public et **ne fusionne pas** la PR dans `main`.

## 0. Prérequis

- VS Code avec le dossier du projet ouvert depuis WSL (extension **installée dans WSL**, pas seulement dans Windows).
- Node.js 22 et npm, Git, Docker Engine + Compose v2 fonctionnels dans WSL.
- L'ordinateur doit rester **allumé et éveillé**; verrouiller l'écran est possible, mettre le système en veille suspend l'exécution.
- Le socket Unix `/tmp/devbridge/ipc.sock` doit être visible par VS Code WSL et par le conteneur agent. Si l'extension s'exécute dans Windows et non WSL, voir « Mode TCP » ci-dessous.
- Un accès Codex/Claude n'est pas nécessaire pour *piloter* VibeBridge, mais le fournisseur correspondant doit être opérationnel pour traiter une tâche.

## 1. Préserver la configuration existante

Depuis un terminal WSL :

```bash
cd /chemin/vers/vibridge
cp .env ".env.backup.$(date +%Y%m%d-%H%M%S)" 2>/dev/null || true
git status --short
git fetch origin
git switch codex/control-first-foundation
git pull --ff-only origin codex/control-first-foundation
```

Si `git switch` refuse de changer de branche, conserver les modifications locales : les committer sur une branche personnelle ou utiliser `git stash` en connaissance de cause. Ne jamais faire de `git reset --hard` pour résoudre ce cas.

**Attention :** les fichiers `.env`, les clés VAPID et les sessions locales ne doivent pas être publiés sur GitHub. Si tu utilises déjà une installation de production, sauvegarde aussi la base SQLite du VPS avant toute migration future. La procédure présente ne touche pas au VPS.

## 2. Mettre à jour et tester le code

```bash
npm --prefix relay ci
npm --prefix agent ci
npm --prefix extension ci
npm --prefix nuxt-ui ci

npm --prefix relay test
npm --prefix agent test
npm --prefix extension test
node --test tests/bridge.e2e.cjs
npm --prefix nuxt-ui run test:unit
npm --prefix nuxt-ui run build
```

Ces tests couvrent notamment les autorisations, le routage vers le bon workspace, les accusés de réception et les identifiants de terminaux. Ils ne remplacent **pas** la recette avec une vraie instance VS Code et une CLI interactive.

## 3. Configurer les autorisations de la machine

Dans le `.env` local de VibeBridge, ajouter ou modifier :

```dotenv
VIBRIDGE_REMOTE_MODE=observe
VIBRIDGE_ALLOWED_CLIS=codex,claude-code
VIBRIDGE_ALLOW_TERMINAL_CLOSE=false
```

- `observe` : consultation, aucun nouvel ordre de contrôle.
- `control` : envoi de messages à des terminaux, ouverture de terminaux et lancement des CLI de la liste autorisée.
- `VIBRIDGE_ALLOWED_CLIS` : **IDs**, pas chemins des exécutables.
- `VIBRIDGE_ALLOW_TERMINAL_CLOSE` : laisser `false` tant que la fermeture distante n'est pas nécessaire.

Une fois les tests d'observation satisfaisants, remplacer explicitement `observe` par `control`.

**Important :** le mode contrôle permet d'écrire dans un terminal existant. Si ce terminal est un shell, il possède les permissions de son utilisateur Linux. Ce n'est **pas** un bac à sable ni une garantie qu'une instruction dangereuse ne peut pas être exécutée. Pour une isolation forte, utiliser une identité OS non privilégiée et/ou un conteneur restreint pour les sessions contrôlées.

Vérifier également dans `.env` :

```dotenv
PROJECT_ROOT=/home/TON_UTILISATEUR/projects
RELAY_INTERNAL_URL=https://TON_DOMAINE/relay
RELAY_PUBLIC_URL=https://TON_DOMAINE/relay
JWT_SECRET=VALEUR_EXISTANTE_A_CONSERVER
```

`PROJECT_ROOT` doit englober uniquement les projets que tu souhaites rendre consultables. Conserver les URLs réelles de ton relay. Pour un essai strictement local sans VPS, laisser les deux URLs relay vides, comme indiqué dans le README.

Si tu n'as pas de secret local, générer une nouvelle valeur avec `openssl rand -hex 32`. Ne pas remplacer une clé existante sans planifier un nouvel appairage.

## 4. Démarrer l'agent

```bash
mkdir -p /tmp/devbridge
chmod 700 /tmp/devbridge
docker compose up -d --build agent ui
docker compose ps
docker compose logs --tail=100 agent
curl -fsS http://127.0.0.1:${AGENT_PORT:-3333}/health
```

Le compose monte les sources sous `/workspace` en lecture seule et partage le socket `/tmp/devbridge` avec VS Code. Il utilise les fichiers Codex de `~/.codex/auth.json` et `~/.codex/config.toml` en lecture seule. S'ils sont absents, vérifier la configuration Codex de WSL avant de démarrer le conteneur.

Si tu modifies les variables de permissions, recréer l'agent pour qu'il les relise :

```bash
docker compose up -d --force-recreate agent
```

Aucun modèle IA n'est appelé pour ouvrir la PWA, lire les états ou transmettre des commandes.

## 5. Installer l'extension VS Code mise à jour

Depuis WSL :

```bash
cd extension
npm ci
npm run build
npm run package
```

Installer le `.vsix` produit via la commande **Extensions: Install from VSIX...** dans la fenêtre **VS Code connectée à WSL**, ou utiliser `code --install-extension devbridge-0.1.0.vsix --force` depuis le même environnement.

Redémarrer la fenêtre VS Code et vérifier les paramètres **Utilisateur** :

```json
{
  "devbridge.connectionMode": "unix",
  "devbridge.agentSocketPath": "/tmp/devbridge/ipc.sock"
}
```

L'extension ne démarre pas actuellement le conteneur agent à elle seule. Il faut lancer l'agent avec Docker comme indiqué plus haut.

### Déclarer Antigravity ou une CLI supplémentaire

Dans les **paramètres Utilisateur** de VS Code, pas le `settings.json` du projet :

```json
{
  "devbridge.hostTools": [
    {
      "id": "antigravity",
      "name": "Antigravity",
      "command": "agy",
      "args": []
    }
  ]
}
```

Ceci suppose que `agy` existe réellement dans le `PATH` de l'hôte d'extension VS Code. Vérifier son installation avec `command -v agy`. Sinon remplacer `command` par le véritable exécutable installé. Le nom Antigravity ne garantit pas qu'un CLI existe sur chaque installation.

Ajouter aussi son **ID de contrôle** dans `.env` :

```dotenv
VIBRIDGE_ALLOWED_CLIS=codex,claude-code,host-antigravity
```

Puis recréer l'agent. Un outil déclaré uniquement depuis le téléphone est refusé : sa définition doit rester sous le contrôle de ton poste.

## 6. Appairer le téléphone

1. Sur VS Code, utiliser `DevBridge: Show QR`. L'affichage transmet désormais **le lien uniquement dans le presse-papiers local**, sans passer par un générateur QR tiers.
2. Ouvrir ce lien sur le téléphone ou utiliser le code court dans la PWA.
3. Dans l'interface, confirmer que le workspace affiché correspond au vrai workspace actif.
4. En mode `observe`, vérifier que les commandes sont refusées.
5. Passer à `control` sur la machine, recréer l'agent, puis vérifier que les commandes autorisées fonctionnent.

Pour tester la nouvelle interface **relay/PWA**, il faut une version du relay et de l'UI contenant la PR. L'ancien service actuellement en production ne dispose pas forcément des nouvelles routes Web Push. Ne pas fusionner/déployer tant que la recette n'a pas été réalisée.

## 7. Notifications distantes

Générer des clés VAPID si nécessaire :

```bash
cd agent
npm run vapid
```

Renseigner `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL` dans le `.env` local, puis recréer le conteneur agent. Sur la PWA servie en HTTPS, autoriser les notifications dans les paramètres. L'abonnement est transmis du relay vers l'agent, sans stockage des abonnements au relay.

La machine doit être connectée pour émettre la notification. Les capacités des notifications lorsque le navigateur est fermé dépendent aussi de l'OS et du navigateur.

## 8. Tester le scénario réel

- Deux terminaux portant le même nom : VibeBridge doit sélectionner l'identité de la bonne instance.
- Depuis une connexion mobile indépendante du WiFi, répondre à Codex puis lancer une autre CLI déjà autorisée.
- Couper le réseau pendant l'envoi : l'action doit être marquée « réception inconnue » si nécessaire, sans répétition automatique.
- Vérifier les messages « reçu par l'agent » puis « transmis à VS Code ». Le second **n'affirme pas** que la CLI a terminé sa tâche.
- Simuler une demande de confiance : elle ne doit jamais être approuvée automatiquement.
- Tester une notification avec la PWA fermée puis rouverte.
- Tester la fermeture d'un terminal : interdite tant que `VIBRIDGE_ALLOW_TERMINAL_CLOSE=false`.

## 9. Mode TCP (si l'extension ne tourne pas dans WSL)

Dans une configuration TCP, l'agent et l'extension doivent partager un `IPC_SHARED_SECRET` aléatoire d'au moins 32 caractères. L'agent doit écouter sur le loopback WSL et l'extension doit joindre ce port par une liaison locale sûre, éventuellement un tunnel. Ne pas exposer directement le port IPC sur Internet. Le compose fourni privilégie **Unix** ; il ne configure pas automatiquement le mode TCP.

## 10. Limites connues avant une version commerciale

- Pas de véritable sandbox des commandes envoyées à un shell.
- Identifiants de terminaux valides pendant la vie de l'extension, pas après son redémarrage.
- Sorties des terminaux VS Code existants tributaires de la Shell Integration.
- L'extension confirme les appels aux API VS Code, pas la réussite interne de Codex/Claude.
- Session relay éphémère (12 h par défaut), réappairage possible ; pas encore de vraie gestion d'identités durables de plusieurs téléphones.
- Pas encore d'audit d'exploitation du VPS ni de recette multi-OS réelle.
- Anciennes fonctions du parcours d'authentification non opérationnelles : l'étape de faux compte a été retirée du parcours utilisable.

Ne pas présenter le projet comme prêt pour des utilisateurs tiers tant que ces points n'ont pas été évalués et testés.
