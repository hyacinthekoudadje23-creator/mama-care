# Mettre Mama Care en ligne

Exemple avec Railway. Les mêmes étapes valent pour Render ou Fly.io : un seul serveur, un disque persistant, des variables d’environnement.

## 1. Le code sur GitHub
1. Créez un dépôt **privé** sur GitHub et envoyez-y le contenu du dossier `mama-care-api` (le fichier `.env` est déjà exclu par `.gitignore`).

## 2. Le serveur
1. Sur railway.com : *New Project* puis *Deploy from GitHub repo*, et choisissez le dépôt. Le `Dockerfile` est détecté automatiquement.
2. Onglet *Variables*, ajoutez :
   - `JWT_SECRET` : une chaîne aléatoire de 32 caractères ou plus (`openssl rand -hex 32`)
   - `ADMIN_PHONES` : votre numéro au format `+229XXXXXXXX`
   - `DB_PATH` : `/data/mamacare.db`
   - `SMS_PROVIDER` : `console` pour le premier essai
3. Ajoutez un **volume** au service avec comme chemin de montage `/data`. Sans lui, la base est effacée à chaque redéploiement.
4. Dans les réglages du service : gardez **un seul exemplaire** (pas de réplicas), et mettez `/health` comme chemin de contrôle d’état.
5. Dans *Networking*, générez un domaine public. L’adresse est en HTTPS.

## 3. Premier essai (SMS en mode « console »)
1. Ouvrez l’adresse du serveur, saisissez votre numéro : le code apparaît dans les journaux (*Logs*) du service.
2. Entrez le code : vous êtes administrateur. Créez votre profil et envoyez un message dans « Consulter ».

## 4. Les vrais SMS (Africa’s Talking)
1. Créez un compte sur africastalking.com et une application. Notez le nom d’utilisateur et la clé API.
2. Essai gratuit : `SMS_PROVIDER=africastalking`, `AT_USERNAME=sandbox`, `AT_API_KEY=<clé>`, `AT_SANDBOX=1`.
3. Mise en service : rechargez du crédit, mettez votre vrai nom d’utilisateur, `AT_SANDBOX=0`. Si vous voulez un nom d’expéditeur (ex. « MamaCare »), `AT_SENDER` demande une validation préalable.
4. Vérifiez avec le fournisseur la couverture des opérateurs du Bénin, les tarifs et les règles d’expéditeur avant d’ouvrir au public.

## 5. L’assistante IA
1. Créez une clé sur console.anthropic.com et ajoutez-la dans `ANTHROPIC_API_KEY`. Les messages de l’assistante sont facturés sur ce compte.
2. Sans clé, l’assistante répond avec les réponses préécrites.

## 6. Nommer les sages-femmes
Chaque professionnelle se connecte d’abord une fois (elle apparaît alors comme maman). Ensuite, depuis votre navigateur connecté en administrateur, ouvrez la console (F12) et tapez `localStorage.getItem("mc_tok")` pour copier votre jeton. Puis, dans un terminal :
```bash
TOKEN=<votre jeton>
curl -H "Authorization: Bearer $TOKEN" https://VOTRE-DOMAINE/admin/users          # repérer l’id
curl -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"role":"pro"}' https://VOTRE-DOMAINE/admin/users/ID/role
```
À sa prochaine ouverture de l’application, l’onglet « Consulter » affiche la boîte de réception.

## 7. Avant d’ouvrir au public
- Sauvegardes : copiez régulièrement le fichier `/data/mamacare.db` (le volume seul n’est pas une sauvegarde).
- Faites relire par une sage-femme ou un médecin les seuils et les conseils de l’application.
- Rédigez un texte de consentement et de confidentialité, et vérifiez les obligations légales sur les données de santé au Bénin.
- Les messages ne sont pas chiffrés de bout en bout : les personnes qui administrent le serveur peuvent les lire.
