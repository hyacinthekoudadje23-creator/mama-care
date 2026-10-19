# Mama Care API

Serveur de Mama Care : comptes par téléphone (code SMS), suivi synchronisé, consultation en ligne et rappels par SMS.
Node 20+, Express, SQLite. Testé en local avec le fournisseur SMS « console » (voir `test/smoke.mjs`).

## L’application
L’interface (`public/index.html`) est servie par le serveur lui-même : ouvrez simplement l’adresse du serveur (ex. http://localhost:3000). Connexion par SMS, suivi, rappels, consultation et assistante y sont raccordés.

## Démarrer
```bash
npm install
cp .env.example .env     # puis remplir JWT_SECRET (openssl rand -hex 32) et ADMIN_PHONES
export $(grep -v '^#' .env | xargs) && npm start
```
En mode `SMS_PROVIDER=console`, les codes et rappels s’affichent dans les logs.

## SMS réels (Africa’s Talking)
Renseignez `SMS_PROVIDER=africastalking`, `AT_USERNAME`, `AT_API_KEY` (et `AT_SENDER` si vous avez un identifiant d’expéditeur validé).
Testez d’abord avec `AT_SANDBOX=1`, puis vérifiez dans la documentation du fournisseur la couverture des opérateurs au Bénin et les tarifs.
Les SMS sont envoyés sans accents pour tenir dans 160 caractères.

## Déployer
- Un seul serveur à la fois (le planificateur de rappels tourne dans le processus).
- La base SQLite doit être sur un disque persistant : sur Railway, montez un volume et mettez `DB_PATH=/data/mamacare.db`.
- Servez en HTTPS uniquement et renseignez `CORS_ORIGIN` avec l’adresse de votre application.

## Rôles
- `mama` : par défaut à l’inscription. `admin` : numéros listés dans `ADMIN_PHONES`.
- `pro` (sage-femme, médecin) : l’admin nomme avec `PATCH /admin/users/:id/role`.

## Routes (JSON, en-tête `Authorization: Bearer <jeton>` sauf `/auth/*`)
| Route | Rôle |
|---|---|
| `POST /auth/request {phone}` | envoie un code à 6 chiffres (valable 5 min) |
| `POST /auth/verify {phone, code, name?}` | crée ou connecte le compte, renvoie le jeton (30 jours) |
| `GET /me`, `PATCH /me {name?, smsOptin?}` | compte, et choix de recevoir les SMS |
| `GET /state`, `PUT /state {s}` | suivi de grossesse ; l’enregistrement recalcule les rappels |
| `GET /threads/me/messages?after=ID`, `POST /threads/me/messages {text}` | consultation, côté maman |
| `GET /threads`, `GET /threads/:id/messages`, `POST /threads/:id/messages` | consultation, côté professionnelle (la maman reçoit un SMS) |
| `POST /assistant {question, history?, context?}` | assistante IA (nécessite `ANTHROPIC_API_KEY`) |
| `GET /admin/users`, `PATCH /admin/users/:id/role {role}` | administration |

## Rappels automatiques
À chaque `PUT /state` avec `s.p.lmp` (AAAA-MM-JJ) : un SMS 2 jours avant chacune des visites prénatales (12, 20, 26, 30, 34, 36, 38, 40 SA), puis un SMS hebdomadaire (fer, acide folique, moustiquaire), envoyés vers 8 h heure du Bénin. Une maman peut les couper avec `smsOptin: false`.

## À prévoir avant un vrai lancement
- Données de santé : consentement explicite, politique de confidentialité, et obligations légales au Bénin (à vérifier auprès de l’autorité de protection des données).
- Sauvegardes de la base, et validation du contenu médical par une sage-femme ou un médecin.
- Les messages ne sont pas chiffrés de bout en bout : les administrateurs du serveur peuvent les lire.
