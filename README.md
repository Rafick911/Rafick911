# 🏓 PINPONG TIPS

### Analyse. Prédiction. Performance.

Plateforme **professionnelle de pronostics de tennis de table** : l'administrateur saisit chaque rencontre
manuellement, publie son analyse, puis enregistre le résultat réel. L'application calcule automatiquement
l'ensemble des statistiques de performance et conserve un **historique immuable** de chaque pronostic.

> **Nous ne forçons jamais un pronostic.**
> Si les statistiques sont insuffisantes ou contradictoires, PINPONG TIPS peut décider de **patienter**.
> *Mieux vaut manquer un match que forcer un mauvais pronostic.*

---

## 🚀 Démarrage rapide

```bash
npm install          # une seule dépendance : express
npm start            # http://localhost:3000
```

Le serveur crée la base SQLite (`data/pinpong.db`), initialise les comptes et, si la base est vide,
charge un **jeu de démonstration réaliste** (13 championnats, ~226 rencontres, ~219 pronostics répartis
sur 4 mois d'historique).

| Accès | Identifiant | Mot de passe | Droits |
|---|---|---|---|
| 🔐 Administrateur | `admin` | `pinpong2026` | création, publication, résultats, championnats, réglages |
| 👤 Utilisateur | `demo` | `demo2026` | consultation des matchs, pronostics, résultats, statistiques, historique |

> ⚠️ En production, changez les mots de passe (`ADMIN_PASSWORD`, puis via *Profil → Sécurité*) et
> n'exposez jamais la base `data/`.

### Scripts

| Commande | Description |
|---|---|
| `npm start` | démarre le serveur (`PORT`, `HOST`, `DATA_DIR`, `DB_FILE` configurables) |
| `npm run dev` | démarre avec rechargement automatique |
| `npm run seed` | initialise la base si elle est vide |
| `npm run reset` | réinitialise le jeu de démonstration |
| `npm test` | test de fumée complet de l'interface (nécessite `npm i -D esbuild jsdom`) |

**Prérequis** : Node.js ≥ 22.5 (utilisation de `node:sqlite`, module natif — aucune dépendance de build).

---

## 🧱 Architecture

```
server/
  index.js          Serveur Express : API JSON sous /api + application statique
  db.js             Base SQLite native (schéma, helpers, journal d'activité, révisions)
  auth.js           scrypt + sessions httpOnly SameSite, rôles admin / utilisateur
  stats.js          Moteur de statistiques + modèle de probabilité (Elo, marché, formes, H2H)
  service.js        Logique métier : rencontres, pronostics, évaluation automatique des résultats
  seed.js           Championnats + jeu de démonstration réaliste
  routes/
    authRoutes.js         connexion, déconnexion, sessions, mots de passe, comptes
    publicRoutes.js       lecture publique (matchs, pronostics, historique, statistiques…)
    adminRoutes.js        administration complète (CRUD, résultats, journal, réglages, export)

public/
  index.html        Coquille applicative (SPA)
  css/style.css     Design system sombre / sportif / premium, mobile-first
  js/api.js         Client API
  js/ui.js          Composants (cartes de match, graphiques SVG, modales, toasts…)
  js/views.js       Vues publiques
  js/admin.js       Vues d'administration
  js/app.js         Routeur, état, gestion des évènements
  img/logo.svg      Identité visuelle (favicon, icône PWA, logo)
  manifest.webmanifest

tools/
  smoke-test.js     Test de fumée : rendu réel de toutes les vues + parcours d'écriture complet
  screenshots.js    Captures d'écran (outil optionnel de contrôle visuel)
```

---

## 🗄️ Modèle de données

**`championships`** — `id`, `name`, `country`, `flag`, `logo`, `active`, `sort_order`, `created_at`, `updated_at`

**`matches`** — `id`, `championship_id`, `player_home`, `player_away`, `match_date`, `match_time`,
`odds_home`, `odds_away`, `status` (`draft → scheduled → published → live → finished → cancelled`),
`actual_winner`, `final_score`, `set_scores` (JSON), `first_set_winner`, `total_sets`,
`result_recorded_at`, `context_note`, `created_at`, `updated_at`, `created_by`

**`predictions`** — `id`, `match_id`, `prediction_type`, `predicted_player`, `probability`, `confidence`,
`risk_level`, `exact_score`, `alternative_score`, `first_set_prediction`, `first_set_probability`,
`total_sets_prediction`, `total_sets_over`, `total_sets_under`, `estimated_probability`,
`implied_probability`, `edge`, `analysis`, `analyst_comment`, `result_status`, `published`,
`published_at`, `revision_count`, `created_at`, `updated_at`, `created_by`

**Tables système** — `users`, `sessions`, `revisions` (historique immuable), `audit_log` (journal
administrateur), `notifications`, `settings`, `favorites`.

---

## 📐 Règles de calcul

```
Taux de réussite = Validés / (Validés + Perdus) × 100
```

- **EN ATTENTE**, **PATIENTER** et **ANNULÉ** sont **exclus** du taux de réussite (jamais comptés comme défaite).
- `Probabilité implicite = 1 / cote × 100` — `Edge = Probabilité estimée − Probabilité implicite`.
- Le modèle interne combine un classement type **Elo** construit sur les résultats réels enregistrés,
  la forme récente (5 et 10 derniers matchs), les confrontations directes et la probabilité du marché
  (marge bookmaker retirée).

Sont calculés automatiquement : taux global, 7 jours, 30 jours, 90 jours, 100 derniers pronostics,
performance par championnat, par type de pari, par niveau de risque, par tranche de confiance,
série actuelle, meilleure série (16 maxi sur le jeu de démonstration), plus longue série perdante,
rendement théorique et ROI sur mises constantes.

---

## 🔐 Sécurité & traçabilité

- Mots de passe **scrypt** avec sel aléatoire — jamais stockés en clair.
- Sessions par jeton aléatoire de 256 bits, cookie `httpOnly` + `SameSite=Lax`, expiration 14 jours.
- Limitation des tentatives de connexion (12 échecs / 10 min / adresse).
- **Deux niveaux d'accès** : l'utilisateur consulte, l'administrateur écrit. Toutes les routes
  d'écriture sont protégées côté serveur (`requireAdmin`) — la protection ne repose pas sur l'interface.
- **Historique immuable** : chaque modification enregistre un instantané complet de l'état précédent
  (table `revisions`), avec auteur et horodatage. Rien ne peut être modifié de façon invisible.
- **Journal administrateur** : création, modification, publication, résultat, changement de statut,
  suppression, connexions — consultable et filtrable dans `#/admin/journal`.

---

## 🖥️ Fonctionnalités

**Public** — accueil (pronostics du jour, performance, philosophie), matchs filtrables, pronostics
publiés, résultats, page détail d'un match (analyse, statistiques joueurs, forme 5/10, H2H, modèle,
value), statistiques détaillées, championnats, historique groupé par mois, profil, notifications.

**Administrateur** — tableau de bord (aujourd'hui, séries, graphiques, derniers résultats, brouillons
à finaliser), CRUD complet des rencontres (12 champs + pronostic complet + résultat réel), import groupé,
gestion des championnats (création, modification, activation, suppression), enregistrement des résultats
avec **évaluation automatique** du pronostic (VALIDÉ / PERDU selon le type de pari), bascule manuelle de
statut, journal, réglages, notifications, comptes, export CSV/JSON, recalcul global des statuts.

**Interface** — design premium sombre, responsive *mobile-first*, navigation latérale sur desktop et
barre inférieure sur mobile (🏠 Accueil · 🏓 Matchs · 🎯 Tips · 📊 Stats · 👤 Profil), graphiques SVG
sans dépendance externe, modales accessibles, animations discrètes.

---

## 🔌 API (extraits)

```
GET    /api/health                       état du service
POST   /api/auth/login                   connexion (cookie de session)
GET    /api/matches?championship_id&date&player&prediction_status&risk&order
GET    /api/matches/:id                  détail + statistiques + modèle
GET    /api/predictions | /api/history   pronostics publiés / historique filtrable
GET    /api/stats                        statistiques complètes
GET    /api/championships                championnats + performance
GET    /api/notifications                flux de notifications

POST   /api/admin/matches                création d'une rencontre
PUT    /api/admin/matches/:id            modification (instantané conservé)
POST   /api/admin/matches/:id/prediction création / mise à jour du pronostic
PATCH  /api/admin/matches/:id/prediction/publish   publication
PATCH  /api/admin/matches/:id/prediction/status    statut manuel
POST   /api/admin/matches/:id/result     résultat réel → évaluation automatique
POST   /api/admin/championships …        CRUD championnats
GET    /api/admin/journal                journal des modifications
GET    /api/admin/export?format=csv|json export des données
POST   /api/admin/recalculate            recalcule tous les statuts
```

---

## 📈 Évolution prévue

L'architecture est prête pour : application Android/iOS (l'API JSON est déjà exposée),
notifications push (le flux `notifications` existe), abonnement premium (rôles extensibles),
paiements, comptes utilisateurs avancés (la table `favorites` est en place), classement des meilleurs
pronostics, statistiques avancées et branchement d'une API de données sportives
(la saisie manuelle reste prioritaire et l'import groupé sert de point d'entrée).

---

## ⚖️ Mentions

Les pronostics sont publiés à titre informatif et ne constituent pas un conseil financier.
Jouer comporte des risques. **18+**
