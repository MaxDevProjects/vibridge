# Audit technique ViBridge

Analyse de `main` au commit `3a1d2b4`, le 17 novembre 2026. Périmètre étudié sur le code et sur des instances locales. Le VPS et ses données n'ont pas été inspectés.

## Architecture

| Composant | Responsabilité et frontière |
|---|---|
| Nuxt | Appairage, sélection de session et de workspace, chat, terminaux, fichiers et prévisualisation. Communique avec l'agent en LAN ou avec le relay en HTTPS et WSS. |
| Relay | Authentifie les rôles, stocke les sessions, l'historique et les snapshots dans SQLite et route les requêtes vers les agents enregistrés. |
| Agent local | Lit les fichiers sous la racine configurée, pilote les adaptateurs CLI et transmet les opérations d'IDE par IPC. |
| Extension VS Code | Publie l'état de l'IDE et des terminaux, reçoit les commandes IPC et appelle les API de VS Code. |

Une session et son jeton mobile constituent la frontière d'isolation. Le projet comporte plusieurs sessions sur un relay, sans modèle de comptes ni droits partagés entre utilisateurs.

## Branches existantes

| Branche | Écart depuis `main` | Traitement |
|---|---|---|
| `claude/explore-codebase-JC3cY` | `b08dda7`, un commit d'avance | Repris. Les protections des secrets et du cycle de vie IPC ont été renforcées dans les lots suivants. |
| `feat/ui-phase1-onboarding-refactor` | `bf88f13`, un commit inédit | Repris. Les routes CLI du relay ciblent ensuite le workspace sélectionné. |
| `fix/notification-workspace-routing` | Ancêtre, cinq commits de retard | Le routage des clics de notification est présent dans `main`. |
| `codex/review-vibridge-codebase-and-report-status` | Ancêtre, 25 commits de retard | Aucun commit exclusif à récupérer. |

## Écarts constatés et corrections

| Priorité | Constat sur `main` | Correction |
|---|---|---|
| Critique | Un jeton valide permettait de lister les sessions de tiers et leurs jetons mobiles. Les snapshots et l'état public de l'agent pouvaient publier des secrets. | Contrôle du jeton en base, périmètre limité à la session, suppression des secrets de l'état public et filtre relay des anciens clients. |
| Critique | Les secrets JWT de secours étaient prévisibles. Le LAN exposait des endpoints qui donnaient un code ou un jeton sans authentification. Les événements IPC pouvaient être diffusés aux WebSockets LAN avant authentification. | Secrets distincts, endpoints protégés, QR à durée limitée, échange local à usage unique et diffusion réservée aux sockets authentifiées. |
| Élevée | Des jetons de setup pouvaient être acceptés hors onboarding. Les codes du relay étaient réutilisables et sans frein aux essais. Les connexions ouvertes ne suivaient pas systématiquement la fin de session. | Setup limité en rôle, durée et usage. Codes à usage unique, temporisation des essais, expiration des sockets et réappairage explicite depuis VS Code. |
| Élevée | Un lien de setup entrant pouvait détourner l'agent vers une autre session. La socket Unix acceptait tous les utilisateurs locaux et le mode TCP n'avait pas de secret. | Consentement dans VS Code, confirmation de prise en charge, socket Unix à droits restreints et secret TCP sur loopback. Un claim en échec conserve la session courante. |
| Élevée | Le contrôle de chemin par préfixe acceptait certains dossiers voisins et suivait les liens symboliques hors du périmètre prévu. | Vérification de la racine physique, des liens symboliques et des fichiers masqués. Traduction du montage Docker depuis la racine hôte déclarée. |
| Élevée | Les commandes sans workspace explicite pouvaient prendre le dernier workspace connecté. La disparition d'une ancienne socket pouvait effacer la nouvelle. Une réponse fichier pouvait être corrélée au seul ID de requête. | Destination exacte ou unique, remplacement protégé par l'identité de socket et corrélation requête, type de réponse et socket. La sélection reste visible quand le workspace est hors ligne. |
| Élevée | Des champs tels que `sendEnter`, `cliId` et `action` étaient perdus à la mise en enveloppe. L'UI affichait des envois réussis après un simple appel à `send`. | Champs de commande conservés, routage des terminaux partagé entre LAN et relay, accusé de réception de l'agent, rejet explicite ou résultat inconnu si la connexion tombe. Les commandes en vol ne sont jamais rejouées automatiquement. |
| Élevée | Nuxt et l'agent avaient des courses entre anciennes et nouvelles sockets. IPC pouvait diffuser une commande à plusieurs fenêtres VS Code. | Cycle de vie attaché à la socket courante, heartbeat, délais bornés, reconnexion progressive et un seul destinataire IPC actif par agent. |
| Modérée | Les snapshots récurrents usaient le quota d'historique. Reconnexion et API pouvaient rediffuser les mêmes messages. Les fichiers d'état échouaient en volume lecture seule. | Snapshots relayés et stockés à part, déduplication des événements rejoués et repli vers un dossier d'état accessible en écriture. |
| Modérée | La configuration de production ouvrait les ports Docker du relay et de l'UI sur toutes les interfaces. | Publication sur loopback pour le proxy Nginx déjà documenté. |

## Tests et vérification

Depuis la racine, installer les dépendances de chacun des quatre composants avec `npm --prefix <composant> ci`, puis exécuter ces commandes.

```sh
npm --prefix relay test
npm --prefix agent test
npm --prefix extension run build
node --test tests/bridge.e2e.cjs
npm --prefix nuxt-ui run test:unit
npm --prefix nuxt-ui run build
```

Le test d'intégration utilise le vrai relay SQLite, le vrai client agent et le client IPC de l'extension en TCP authentifié. Il vérifie la réception d'une commande avec sa cible et ses options, force une coupure WebSocket et recommence après reconnexion à la même session. Les tests relay couvrent aussi les deux workspaces, l'isolation entre sessions, une réponse fichier usurpée, une commande en vol interrompue et la réutilisation d'un QR.

## Points restant à traiter

1. **Validation de bout en bout sur le poste réel.** Vérifier QR et PWA sur téléphone, lancement et arrêt des terminaux dans VS Code, mode Unix Docker et TCP WSL par tunnel, notifications et prévisualisation. L'accusé confirme la réception et la prise en charge par l'agent. La réussite de la commande dans le terminal se lit encore dans la sortie de l'outil.
2. **Durée de vie et accès durable.** À l'expiration du bail du relay, un nouvel appairage reste nécessaire. Plusieurs workspaces ou utilisateurs durables gagneraient à disposer d'une identité d'appareil et de droits révoqués séparément. L'ouverture et le stockage des sessions d'onboarding restent des endpoints publics. Une protection contre l'abus à l'entrée du proxy ou un enrôlement privé aurait un effet sur le parcours de setup.
3. **Périmètre VS Code.** L'agent route vers la dernière extension enregistrée sur son canal IPC. Deux fenêtres indépendantes demandent deux agents et des canaux distincts pour un adressage explicite. L'adaptateur VS Code reçoit les actions génériques mais la commande `action` n'a pas de gestionnaire dédié dans l'extension. Le démarrage interactif de Codex CLI répond automatiquement à un dialogue de confiance et se repère dans le texte du terminal. À revoir avec des tests sur le vrai CLI.
4. **Push et preview.** Les endpoints d'abonnement Web Push existent sur l'agent LAN. Leur proxy relay manque dans `main`. La notification à distance dépend donc du mode d'abonnement et du navigateur. La prévisualisation dépend d'une URL que le téléphone peut ouvrir. Vérifier aussi la suppression des anciens abonnements lors d'une révocation.
5. **Exploitation.** Le déploiement existant s'enclenche sur push vers `main`. Prévoir une recette avec SQLite sauvegardé, rotation des secrets, versions coordonnées, test depuis le téléphone et procédure de retour arrière. L'historique se limite à 100 événements par session, et SQLite efface les sessions expirées. Ce modèle convient à une session personnelle éphémère. La rétention et les redémarrages sur VPS restent à vérifier en recette.
6. **Dépendances.** L'audit npm initial signalait des alertes critiques dans les trois applications d'exécution. Le lot de maintenance des verrous traite les mises à jour compatibles et garde les alertes restantes visibles. Vérifier les résultats de ce lot séparément.

Les réglages d'appairage et le déploiement coordonné sont détaillés dans [la procédure de mise à niveau](session-security.md).
