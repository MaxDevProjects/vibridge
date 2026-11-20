# ViBridge V7 : mobile contextual, reprise, notifications et lecture locale

## Ce que V7 change

- **Commandes contextuelles** : palette ⚡ sur le téléphone, actions Bash sûres en un geste quand le shell est identifié, commandes Codex/Claude séparées. L'identification par nom est indicative ; l'utilisateur peut forcer le contexte pour un terminal suivi dont le programme actif n'est pas identifiable.
- **Slash commands** : catalogue de base hors ligne, plus import explicite des commandes `/xyz` observées dans la sortie de la CLI. Les commandes supplémentaires ne sont *pas* garanties disponibles : la version de CLI et les plugins varient. Les commandes susceptibles de modifier l'état sont insérées dans la saisie, pas exécutées automatiquement.
- **Fichiers** : explorateur mobile du projet avec fichiers, dossiers et aperçu texte, en réutilisant les endpoints déjà protégés par token et windowId. « Aller dans ce dossier » génère `cd -- '<absolute path>'` uniquement lorsqu'un shell a été sélectionné et qu'une fenêtre est vérifiée. Une CLI reçoit seulement des chemins ajoutés au brouillon.
- **Reprendre** : l'extension WSL lit les métadonnées natives des dossiers `~/.codex/sessions` et `~/.claude/projects`, au maximum 30 sessions pertinentes pour le dossier VS Code actif. Les transcriptions et les prompts bruts ne sont jamais inclus. Le téléphone met en cache uniquement l'index (id, type, titre natif lorsqu'il existe, date), pas la conversation. Sur sélection, le HOST vérifie l'ID et le dossier à nouveau, puis ouvre un nouveau terminal suivi tmux et lance `codex resume <uuid>` ou `claude --resume <uuid>`. **Un ACK réseau n'est pas la preuve que la reprise a abouti**.
- **Alertes** : les heuristiques de question doivent persister au moins 15 secondes, être observées deux fois et respecter un délai de cinq minutes entre notifications du même terminal. Pas de validation/refus factice à partir d'une simple hypothèse. Les confirmations d'envoi deviennent des toasts courts et un centre de notifications.
- **Lecture locale par IA, facultative** : bouton explicite sous la dernière sortie reçue. L'extension VS Code sous WSL lance un processus `llama-cli` en CPU seulement (`-ngl 0`, deux threads), 45 secondes maximum, puis arrête le processus. Aucun téléchargement automatique, aucune requête API, aucun GPU obligatoire. Chaque observation générée doit être reliée à une citation exacte de la sortie reçue, sinon elle est rejetée. **Aucun point de ce modèle ne passe automatiquement au vert**.

## Installer / mettre à jour

1. Fusionner la PR, mettre à jour le dépôt local :

   ```bash
   cd ~/projects/vibebridge
   git status --short
   git fetch origin
   git switch main
   git pull --ff-only origin main
   docker compose up -d --no-deps --build agent
   ```

2. Dans WSL, reconstruire et installer l'extension VS Code :

   ```bash
   cd ~/projects/vibebridge/extension
   npm ci
   npm run build
   npm test
   npm run package
   code --install-extension ./devbridge-0.1.0.vsix --force
   ```

   Puis **Developer: Reload Window** dans VS Code WSL.

3. **Déploiement VPS nécessaire**, car `relay/src/server.ts` et `nuxt-ui` changent. Lancer manuellement le workflow **Deploy to server** sur `main` dans GitHub Actions. Le merge ne déploie pas automatiquement.

4. Les terminaux suivis nécessitent `tmux` dans WSL : `tmux -V`. Si absent, `sudo apt-get update && sudo apt-get install -y tmux`.

## Activer le modèle local (optionnel)

La V7 fonctionne **sans IA**. Si tu veux tester la lecture plus contextuelle :

1. Installer [llama.cpp](https://github.com/ggml-org/llama.cpp) sur WSL. Le binaire de commande doit être accessible à VS Code WSL. Il peut être testé par `llama-cli --help` ou par son chemin absolu.
2. Télécharger manuellement et examiner la licence du GGUF sélectionné, par exemple le modèle officiel [Qwen3-0.6B-GGUF](https://huggingface.co/Qwen/Qwen3-0.6B-GGUF) (Apache 2.0). Une commande d'installation **explicite et facultative**, après installation de `llama-cli`, permet de télécharger sa version officielle Q8_0 (environ 639 Mo) : `bash scripts/install-local-interpreter.sh`. Elle demande ton accord avant tout transfert. Il existe des quantifications Q4 plus petites distribuées par d'autres dépôts, mais vérifie toujours leur origine et licence. Le modèle n'est jamais téléchargé par ViBridge au démarrage.
3. Dans les **paramètres Utilisateur de VS Code WSL** (pas les paramètres Workspace) :

   ```json
   {
     "devbridge.interpreterEnabled": true,
     "devbridge.interpreterBinary": "/chemin/vers/llama-cli",
     "devbridge.interpreterModelPath": "/chemin/vers/modele.gguf"
   }
   ```

4. Ouvrir ViBridge sur ton téléphone, sélectionner une conversation avec sortie terminal et demander **Éclaircir avec le mini-modèle local**. Si le modèle n'est pas configuré, ViBridge montre une erreur claire et garde l'extracteur déterministe.

**Ressources :** modèle chargé à la demande (mémoire de plusieurs centaines de Mo selon le GGUF et le contexte), deux threads CPU pendant l'inférence, zéro consommation GPU explicitement demandée. Pas de benchmark de latence ni de RAM tant que les vrais machines et modèles ne sont pas testés. Le texte est filtré pour quelques motifs de secrets, mais ce filtrage ne garantit pas la confidentialité ; évite d'envoyer des sorties contenant des secrets, même à un modèle local. Le prompt est écrit temporairement avec permissions 0600 et supprimé après exécution.

## Recette critique

- Basculer entre deux fenêtres VS Code et deux terminaux qui portent le même nom ; **aucune** commande ne doit partir dans la mauvaise fenêtre.
- Shell Bash : `pwd`, `ls -la`, `git status --short`, navigation dans un dossier avec apostrophe dans son nom.
- Codex et Claude Code : la palette ne doit pas afficher les commandes Bash par défaut. Une commande slash seulement observée est clairement identifiée comme non vérifiée et n'est pas exécutée en un geste.
- Fermeture/reconnexion : les sessions encore présentes sur le PC peuvent être répertoriées. Une session d'un autre projet ne doit pas apparaître ; l'extension refuse une demande de reprise vers un ID non autorisé.
- Sur WSL, `codex resume <id>` et `claude --resume <id>` doivent être vérifiés en conditions réelles. Le format et l'emplacement des historiques sont des détails d'implémentation propres aux versions des CLI et peuvent évoluer.
- Une question imprimée puis immédiatement effacée ne doit pas déclencher de push. Un vrai prompt persistant doit rester consultable même si aucune alerte heuristique n'est émise.
- Vérifier les toasts courts, l'historique des notifications et l'absence de boutons « approuver » factices.
- Modèle IA facultatif : tester avec une conclusion française de Codex, des chemins, des mots de passe factices et des lignes qui essaient de donner des instructions à l'interpréteur. Une preuve inventée doit être rejetée.
- **Le terminal réel reste la source de vérité.** Ni l'extracteur déterministe ni le mini modèle ne réparent la capture d'une sortie que ViBridge n'a jamais reçue.


## Moteur local supervisé (mode Éco)

L'agent centralise les demandes provenant de toutes les fenêtres VS Code et autorise au maximum **une inférence simultanée**. Les deux demandes suivantes sont placées en attente (30 secondes maximum) ; les demandes excédentaires sont refusées, jamais exécutées sans contrôle. Chaque processus est arrêté après avoir produit sa réponse ou après expiration du délai. Il n'y a **aucun démon permanent de modèle**.

Un verrou Linux `flock -n -F` dans `~/.cache/vibridge/ai/inference.lock` protège aussi contre deux agents différents qui tenteraient de charger chacun le modèle sur le même ordinateur. L'installation WSL doit disposer des utilitaires standards `flock` (util-linux), `nice` et `timeout` (coreutils). Un watchdog Linux `timeout` indépendant continue de surveiller la durée du processus même si VS Code se ferme pendant la génération. Si ces utilitaires manquent, ViBridge refuse l'inférence plutôt que de lancer le modèle sans ces garde-fous.

L'extension WSL vérifie `MemAvailable` dans `/proc/meminfo` avant le chargement, le modèle doit tenir dans le budget avec une marge de 180 Mo, et une sonde `VmRSS` surveille le processus toutes les 180 ms. En cas de dépassement, le groupe de processus est interrompu. Le CPU est limité à deux threads par défaut, avec une priorité `nice +15`. Si Linux est fortement occupé, l'inférence ne démarre pas.

**Distinction importante :** la surveillance RSS est une limite *souple*, pas une limite RAM stricte imposée par le noyau. Un pic très bref peut lui échapper. Pour une garantie stricte sur une machine très chargée, il faudra mettre en place un cgroup v2 `memory.max` avec une configuration système adaptée. Le modèle et son processus s'arrêtent après la demande ; la mémoire du cache fichiers Linux peut être réutilisée par les autres applications.

Les réglages par défaut sont : budget 1024 Mo de RAM résidente, réserve supplémentaire de 512 Mo, 2 threads CPU, une tâche active, deux tâches en attente et délai d'inférence limité. Pour modifier ces valeurs, définir côté `.env` de l'agent puis reconstruire :

```dotenv
VIBRIDGE_AI_MEMORY_MB=1024
VIBRIDGE_AI_RESERVE_MB=512
VIBRIDGE_AI_THREADS=2
VIBRIDGE_AI_MAX_QUEUE=2
VIBRIDGE_AI_QUEUE_WAIT_MS=30000
VIBRIDGE_AI_JOB_TIMEOUT_MS=65000
```

Dans les **paramètres Utilisateur** VS Code WSL, tu peux resserrer le budget sans dépasser celui de l'agent :

```json
{
  "devbridge.interpreterEnabled": true,
  "devbridge.interpreterModelPath": "/chemin/vers/modele.gguf",
  "devbridge.interpreterBinary": "/chemin/vers/llama-cli",
  "devbridge.interpreterMemoryMb": 1024,
  "devbridge.interpreterReserveMb": 512,
  "devbridge.interpreterThreads": 2
}
```

Le téléphone affiche « en attente » ou « analyse en cours », puis, lorsqu'elles ont été mesurées, la durée et le pic RSS du processus. Il indique si la machine n'avait pas suffisamment de RAM ou de CPU disponible.

**Installation** : cette évolution nécessite la mise à jour de l'agent Docker et la recompilation du VSIX local. Le relais et le front mobile modifiés nécessitent également un déploiement manuel sur le VPS. Aucun modèle n'est ajouté au VPS ni dans l'image Docker de l'agent.

**Recette** : ouvrir deux fenêtres VS Code, demander deux interprétations, vérifier que l'une attend et que le modèle n'est jamais chargé deux fois ; saturer modérément les ressources en local pour vérifier le refus gracieux ; contrôler que les messages ne sont jamais enregistrés dans la base du relais ; vérifier que les commandes Codex restent réactives pendant l'analyse.

## Limites connues

- La liste des slash commands n'est pas une découverte officielle exhaustive. L'import demande une sortie d'aide lisible, et une commande /xyz repérée peut ne plus exister.
- La liste de sessions dépend du format actuel des fichiers locaux de Codex et Claude. Certains historiques n'ont pas de métadonnée `cwd` fiable ou n'appartiennent pas exactement au dossier VS Code ; ils seront omis.
- Le modèle n'a pas été téléchargé, chargé ou mesuré par cette PR ; il est facultatif et doit être validé sur ton PC.
- Les captures terminal des terminaux classiques restent partielles ; seul tmux fournit ici un miroir de l'écran suivi.
