# rost.r_aurora — Front Rost.r (interface Aurora)

Interface web de **Rost.r**, une application de suivi nutritionnel et de planification de repas. Ce dépôt contient uniquement le frontend (SPA React) ; il consomme les microservices du backend NutriPlanner via HTTPS.

## Fonctionnalités

- **Dashboard** — vue d'ensemble : apports du jour, objectifs, raccourcis.
- **Journal** — saisie et suivi des repas au quotidien.
- **Semaine** — planification des menus hebdomadaires.
- **Courses** — liste de courses générée à partir des menus.
- **Recettes** — bibliothèque de recettes : recherche, création, import (scan / crawler Instagram, Spoonacular…).
- **Le Hub** — recherche et découverte de contenus.
- **Profil** — profil nutritionnel complet : sport, hygiène de vie, composition corporelle, allergies, traitements, etc.
- **Mes clients** — mode coach : gestion multi-comptes, invitations, bascule de contexte client.
- **Notifications** — centre de notifications.
- **Admin** — administration des utilisateurs et supervision des services.

L'ancienne interface est conservée sous les routes `/old/*` (en cours de suppression).

## Stack technique

- [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Vite 5](https://vitejs.dev/) (dev server + build)
- [React Router 6](https://reactrouter.com/) — routage SPA
- [Axios](https://axios-http.com/) — client HTTP avec intercepteurs (auth, refresh)
- CSS modules + thème Aurora (`src/aurora/aurora.css`), clair/sombre

## Architecture

```
src/
├── api/          # Clients axios (un par microservice), endpoints, store du token
├── aurora/       # Interface principale Aurora (écrans, shell, modales)
├── pages/        # Auth (login, register, OAuth…) + ancienne interface (/old)
├── components/   # Composants partagés (ProtectedRoute, ThemeSwitch…)
├── context/      # Contextes React
├── hooks/        # Hooks partagés
├── types/        # Types TypeScript (réponses API…)
└── utils/        # Utilitaires (compte actif, décodage token…)
docs/             # Specs OpenAPI des microservices backend
public/aurora/    # Logos et assets de la charte Aurora
```

### Backend

Le front dialogue avec 6 microservices, chacun sur son propre hôte (routés par Traefik en local) :

| Service | Base URL (dev) | Rôle |
|---|---|---|
| users | `https://api-users.localhost` | Auth, comptes, invitations, admin |
| profile | `https://api-profile.localhost` | Profil nutritionnel, calculs |
| recipe | `https://api-recipe.localhost` | Recettes, imports |
| menu | `https://api-menu.localhost` | Menus hebdo, listes de courses |
| crawler | `https://api-crawler.localhost` | Crawl de sources (Instagram…) |
| notification | `https://api-notification.localhost` | Notifications |

Les specs OpenAPI correspondantes sont dans `docs/*.openapi.json`.

### Authentification

- Access token JWT **en mémoire uniquement** (jamais en localStorage), refresh token en **cookie HttpOnly** posé par `api-users`.
- Intercepteur axios : sur 401, un seul refresh en vol est partagé entre les requêtes concurrentes, puis rejeu de la requête ; en cas d'échec, redirection vers `/login`.
- OAuth Google via jeton de bootstrap échangé sur `/oauth/callback`.
- Multi-comptes (coach → clients) : le contexte de compte actif est ré-appliqué après chaque refresh.

## Démarrage

### Prérequis

- Node.js ≥ 18
- Le backend NutriPlanner lancé en local (Traefik + microservices sur `*.localhost`)
- Certificats mkcert générés côté backend (`backend/infra/traefik/certs/_wildcard.localhost*.pem`) — sans eux, le dev server retombe automatiquement en HTTP

### Installation et lancement

```bash
npm install
npm run dev        # http(s)://localhost:5173
```

### Build de production

```bash
npm run build      # tsc + vite build → dist/
npm run preview    # prévisualisation du build
```

## Routes principales

| Route | Écran |
|---|---|
| `/login`, `/register`, `/forgot-password` | Authentification |
| `/oauth/callback` | Retour OAuth Google |
| `/accept-invite` | Acceptation d'invitation |
| `/dashboard`, `/journal`, `/semaine`, `/courses`, `/recettes`, `/hub`, `/profil` | Interface Aurora |
| `/comptes` | Gestion des clients (coach) |
| `/notifications`, `/admin` | Notifications, administration |
| `/old/*` | Ancienne interface (legacy) |

Toute route inconnue redirige vers `/dashboard`. Les routes applicatives sont protégées (`ProtectedRoute`).
