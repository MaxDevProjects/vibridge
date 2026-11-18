# DevBridge mobile V3: integration et recette

## Portée

La nouvelle interface Nuxt /mobile exploite les sessions et fenêtres existantes.
Identité de conversation : session + workspace + windowId + terminalId.

La fermeture d'une fenêtre et la capture distante sont des opérations explicites, jamais effectuées automatiquement par une IA.

## Première utilisation : Playwright local

Le navigateur Playwright s'exécute là où tourne l'extension VS Code, généralement dans WSL. Le VPS relay ne lance pas de navigateur et n'expose aucun port localhost.

Installer Playwright et Chromium dans WSL :

    npm install -g playwright
    npx playwright install chromium
    npm root -g

Dans les paramètres **Utilisateur** VS Code WSL, pas ceux du workspace, ajouter :

    {
      "devbridge.previewPorts": [5500, 5173],
      "devbridge.previewPlaywrightModule": "/home/USER/.nvm/versions/node/v22.XX/lib/node_modules/playwright"
    }

Remplacer le chemin d'exemple avec la sortie de npm root -g, suivie de /playwright.

Par défaut, previewPorts est vide. Aucun port n'est autorisé sans configuration locale explicite.

Pour vérifier le premier projet :

    cd /home/USER/projects/test-devbridge-pilotage
    python3 -m http.server 5500 --bind 127.0.0.1
    curl -I http://127.0.0.1:5500

Depuis le téléphone, sélectionner la fenêtre du projet, ouvrir Preview, saisir 5500, choisir mobile ou bureau puis lancer la capture.

La capture :
- utilise Playwright avec un nouveau contexte sans cookies ni profil personnel ;
- autorise uniquement localhost et les ports sélectionnés par l'utilisateur sur le PC ;
- bloque les requêtes HTTP de la page vers d'autres origines ;
- limite le temps, la taille des données, et les captures simultanées ;
- transporte une image PNG via le relay existant, sans l'enregistrer en SQLite.

Limites : les serveurs localhost Windows peuvent ne pas être accessibles directement depuis VS Code WSL. Les requêtes réseau internes du navigateur nécessitent une revue de sécurité avant une commercialisation. La version actuelle est une capture, pas encore une navigation interactive.

## Sécurité et déconnexion

Variables locales de l'agent :

    VIBRIDGE_REMOTE_MODE=control
    VIBRIDGE_ALLOW_WINDOW_CLOSE=false

L'option allowWindowClose reste interdite par défaut. La passer volontairement à true et recréer l'agent uniquement si la fermeture distante des fenêtres est souhaitée.

"Déconnecter cet appareil" nettoie uniquement la connexion du navigateur.
"Révoquer la session" demande au relay d'invalider les jetons mobiles et agent et de fermer leurs sockets. L'UI ne confirme la révocation qu'après HTTP 204. Un nouveau QR est nécessaire ensuite.

Le shell conserve les permissions de l'utilisateur OS. Aucune sandbox système n'est promise.

## Recette avant fusion et déploiement

1. CI : tests relay, agent, extension, E2E et build Nuxt.
2. Sur PC réel : mettre à jour l'agent local et l'extension VSIX dans WSL.
3. Depuis la 4G : sélectionner une fenêtre et un terminal, envoyer un texte, vérifier les accusés.
4. Vérifier deux terminaux homonymes dans deux fenêtres, sans fuite de message.
5. Vérifier une CLI avec des spinners et retours chariot ; la sortie brute doit rester accessible.
6. Vérifier une notification qui ramène à la bonne fenêtre et au bon terminal.
7. Tester un serveur HTML local port 5500, avec Playwright installé.
8. Tester un port non autorisé et l'absence de Playwright : échecs explicites, sans fallback non sécurisé.
9. Vérifier que les captures ne persistent pas dans le relay.
10. Révoquer une session et vérifier que les anciens jetons ne sont plus valides.
11. Autoriser ponctuellement close_window et confirmer qu'une fenêtre fermée ne redirige rien vers les autres.
12. Déployer relay et UI ensemble par workflow manuel, après recette locale.

## Limites assumées

- Shell Integration VS Code ne fournit pas un PTY complet.
- Les historiques de conversations mobiles restent enregistrés dans ce navigateur seulement.
- Les captures Playwright sont non interactives.
- Une fenêtre close_window peut demander la sauvegarde des documents locaux.
- CI verte ne vaut pas recette mobile WSL réelle.

Aucune modification directe du VPS ni déploiement automatique avec cette branche.
