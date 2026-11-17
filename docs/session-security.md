# Sécurité des sessions ViBridge

Le relay associe chaque jeton à un seul identifiant de session et à un seul rôle. Il valide aussi le jeton courant enregistré en SQLite. Le navigateur obtient ses sessions en présentant séparément les jetons acquis par appairage sur ce relay. Un jeton de setup donne accès au statut de son onboarding et permet une seule prise en charge par un agent.

## Mise à niveau

- Générer deux secrets distincts. L'agent utilise `JWT_SECRET` et le relay utilise `RELAY_JWT_SECRET`. Chaque secret doit faire au moins 32 caractères en production. Pour un `.env` existant, générer chaque valeur avec `openssl rand -hex 32`.
- Planifier une rotation des deux secrets et un nouvel appairage. Les versions précédentes ont pu exposer des jetons actifs entre sessions et dans l'historique relayé. Mettre à jour Nuxt, l'agent et l'extension avec le relay. Effacer les anciennes données de site du navigateur si des identifiants avaient été partagés entre sessions.
- Sauvegarder SQLite avant mise à niveau. La migration ajoute la date d'expiration des codes et retire de l'historique les anciens événements de statut et de session qui contiennent des jetons ou codes. Les messages de chat et les snapshots dédiés restent disponibles.
- En mode TCP pour WSL ou Remote, définir le même `IPC_SHARED_SECRET` d'au moins 32 caractères dans l'environnement de l'agent et de l'hôte d'extension VS Code. Le serveur IPC écoute sur loopback. Pour Unix, la socket appartient au propriétaire du dossier parent quand l'agent Docker tourne en root. Vérifier que ce dossier appartient à l'utilisateur qui exécute VS Code.
- Dans VS Code, ouvrir **DevBridge: Show QR** pour générer un nouveau code relay valable dix minutes. Scanner ce nouveau QR révoque le précédent jeton mobile de la session. En LAN, partir de la commande VS Code ou saisir le code affiché côté agent. Les endpoints web qui génèrent des QR ou révèlent le code requièrent désormais une session locale.
- Utiliser un `PROJECT_ROOT` qui couvre les workspaces autorisés. L'agent refuse les lectures hors de cette racine et les fichiers masqués. La configuration Docker traduit les chemins VS Code depuis la racine hôte déclarée, vers le montage en lecture seule de l'agent.

La branche principale déclenche actuellement le workflow de déploiement sur push. Examiner la procédure ci-dessus avant toute fusion. Le déploiement et la rotation effective des secrets sont hors de cette intervention.
