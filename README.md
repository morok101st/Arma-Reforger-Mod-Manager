# Arma Reforger Mod Manager (ARMM)

ARMM is a web application for managing and monitoring Arma Reforger Workshop mods.
It stores mod data per user-owned modset, regularly crawls Workshop data, compares installed and latest versions, and centralizes updates, dependency relations, sharing, and audit events in one UI.

## What the application does

- Tracks Workshop mods by mod ID.
- Supports multiple modsets per user. A modset is private by default and can be marked `shared` by its owner so other users can see and manage it.
- Compares `Installed Version` vs. `Latest Version`.
- Uses a dedicated `No installed version` state for tracked mods without an installed target version.
- Runs an automatic crawl on startup and then at a configured interval.
- Shows dependency and `Required by` relations between tracked mods.
- Automatically adds dependencies to tracking when an installed version is set.
- Preserves dependency origin information even when a dependency mod is later edited manually.
- Can optionally set orphaned dependency mods to `No installed version` when a parent mod is deleted or deactivated.
- Stores changelog history per version including `Last modified`.
- Exports a modset as a JSON list (`modId`, `name`, `version`) for mods with a defined version only.

## Functional scope (UI)

### Dashboard

- Metrics: tracked mods, updates, missing installed versions, dependency links.
- “Needs attention” card with clear OK/Warning state.
- Last automatic crawl and next scheduled crawl.

### Mod management

- Add mod (dialog), optionally directly into another modset.
- Mod detail view with status, metadata, installed-version selection from known changelog versions, “Set to latest”, refresh, and delete confirmation.
- Dedicated `No installed version` / `NOT_INSTALLED` handling instead of overloading the generic unknown state.
- Follow-up confirmation dialogs when deleting a mod or changing it to `No installed version` would orphan dependency-origin mods.
- Compact `deps` and `req` indicators in the mod list.
- Search by mod name and mod ID.

### Modsets

- Create, rename, activate, share, and delete modsets.
- Modsets are owned by the user who created them.
- Private modsets are visible and editable only to their owner.
- Shared modsets are visible and editable to other users.
- Deleting non-empty modsets is allowed, but the last remaining modset is protected.
- Export each modset as a JSON file.

### Security area

- Change your own password.
- Admin features: create users, change roles, enable/disable users, reset passwords.
- Audit log with filters (Auth, User, Mod, Failures).

## Security features

- Login required for all management endpoints.
- Only `GET /api/health` is public.
- Role model: `admin` and `user`.
- Initial admin user is bootstrapped from `.env` at startup.
- Password hashing with `PBKDF2-SHA256` (`210000` iterations).
- Minimum password length: 12 characters (user creation, reset, own password change).
- Username login is case-insensitive.
- Login rate limit: 8 failed attempts per 60 seconds (per IP + username).
- Session stored in a signed HttpOnly cookie (`armm_session`, 7-day TTL).
- Cookie flags: `HttpOnly`, `SameSite=Lax`, and `Secure` in production.
- Logout clears the session cookie.
- Origin validation for unsafe HTTP methods (additional CSRF protection via origin allowlist).
- Audit trail for login/logout, password actions, user changes, mod changes, and modset changes.
- Modset ownership and `shared` state are persisted and enforced server-side.
- Frontend Nginx adds security headers (including CSP, X-Frame-Options, Referrer-Policy, nosniff).
- API documentation is protected and available only for authenticated users (`/api/docs`, `/api/openapi.json`).
- The browser path `/api` redirects to `/api/docs` in the frontend container.

## API overview

Base path behind the frontend proxy: `/api`

- `GET /api/health` (public)
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `PATCH /api/auth/password`
- `GET/POST/PATCH/DELETE /api/mods...`
- `PATCH /api/mods/{mod_id}?deactivate_orphan_dependencies=true`
- `DELETE /api/mods/{mod_id}?deactivate_orphan_dependencies=true`
- `POST /api/mods/{mod_id}/refresh`
- `GET/POST/PATCH/DELETE /api/modsets...`
- `GET /api/modsets/{modset_id}/export`
- `GET/POST/PATCH /api/users...` (admin)
- `GET /api/audit` (admin)
- `GET /api/scheduler/status`
- `GET /api` (browser entry, redirects to `/api/docs`)
- `GET /api/docs` (authenticated)

## Installation (Docker Compose)

### Prerequisites

- Docker + Docker Compose plugin
- Reverse proxy/Traefik network `traefik_default` (as referenced in the example compose file)

### 1. Prepare configuration

```bash
cp .env.example .env
cp docker-compose.example.yml docker-compose.yml
```

### 2. Set required values in `.env`

At minimum, change these values:

- `ARMM_SECRET_KEY`
- `ARMM_ADMIN_PASSWORD`
- `POSTGRES_PASSWORD`
- `DATABASE_URL` (including the correct DB password)
- `CORS_ORIGINS` for your domain
- `ARMM_IMAGE_TAG` if you want to pin the example stack to a specific release tag
- `FRONTEND_API_BASE_URL` is not needed for the GHCR release images; the frontend image is built with `/api` already.

Also adjust Traefik host/domain labels in `docker-compose.yml` for your environment.

### 3. Start the stack

```bash
docker compose up -d
```

### 4. Verify

- Health: `https://<your-domain>/api/health`
- Frontend login: `https://<your-domain>/`
- Browser entry for authenticated API docs: `https://<your-domain>/api`
- API docs (after login): `https://<your-domain>/api/docs`

Note: On startup, an initial automatic crawl is scheduled/executed, then runs according to `SCRAPE_INTERVAL_MINUTES`.

## Operations

- Configure scheduler interval with `SCRAPE_INTERVAL_MINUTES` in `.env`.
- Manage the active admin login via `ARMM_ADMIN_USERNAME` / `ARMM_ADMIN_PASSWORD`.
- Modsets are user-scoped. The creator becomes the owner, and only `shared` modsets are available to other users.
- Local production files intentionally remain unversioned: `.env`, `docker-compose.yml`.
- The example compose file uses GHCR images from the latest tagged release and does not build locally.

Only anonymized example files are meant for Git:

- `.env.example`
- `docker-compose.example.yml`

## Development and CI

- Backend tests: `python -m unittest discover -s tests -v` (inside `backend`)
- Frontend build: `npm run build` (inside `frontend`)
- CI runs both on push/PR to `main`.
