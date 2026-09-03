# Arma Reforger Mod Manager (ARMM)

ARMM is a web application for managing and monitoring Arma Reforger Workshop mods.
It stores mod data per user-owned modset, regularly refreshes Workshop metadata, compares installed and latest versions, and centralizes updates, dependency relations, sharing, and audit events in one UI.

## What the application does

- Tracks Workshop mods by mod ID.
- Reads Workshop metadata from the Workshop pages and can use a dedicated internal Reforger metadata service for manual reliable latest-version checks.
- Supports multiple modsets per user. A modset is private by default and can be marked `shared` by its owner so other users can see and manage it.
- Compares `Installed Version` vs. `Latest Version`.
- Uses a dedicated `No installed version` state for tracked mods without an installed target version.
- Runs an automatic crawl twice per day at fixed times. Scheduled crawls use Workshop scraping only and do not call the Reforger CLI metadata service.
- Shows dependency and `Required by` relations between tracked mods.
- Automatically adds dependencies to tracking when an installed version is set.
- Preserves dependency origin information even when a dependency mod is later edited manually.
- Can optionally set orphaned dependency mods to `No installed version` when a parent mod is deleted or deactivated.
- Stores changelog history per version including `Last modified`.
- Exports a modset as a JSON list (`modId`, `name`, `version`) for mods with a defined version only.
- Supports per-modset export load order through a numeric `load_order` value. Lower values load earlier, higher values load later, and the default is `500`.
- Can send Discord update alerts through admin-managed webhooks without code changes.
- Discord webhooks can be scoped to selected modsets so alerts only fire for the modsets you choose.
- Discord update alerts can link directly back into ARMM for the affected mod and modset.
- Discord update alerts are emitted only during the scheduled automatic runs.

## Functional scope (UI)

### Dashboard

- Metrics: tracked mods, dependency links, and the configured auto schedule.
- Auto schedule summary showing the configured timezone and daily run times.
- “Needs attention” card with clear OK/Warning state.
- Recent modset changes showing the latest user actions such as adding mods, removing mods, or changing installed versions.
- Recent modset changes can be paged through directly in the overview.

### Mod management

- Add mod (dialog), optionally directly into another modset.
- Mod detail view with status, metadata, installed-version selection from known changelog versions, “Set to latest”, refresh, and delete confirmation.
- Mod detail view can copy the selected mod as a single export JSON entry for quick server-config edits.
- Dedicated `No installed version` / `NOT_INSTALLED` handling instead of overloading the generic unknown state.
- Follow-up confirmation dialogs when deleting a mod or changing it to `No installed version` would orphan dependency-origin mods.
- Compact `deps` and `req` indicators in the mod list.
- Search by mod name and mod ID.

### Modsets

- Create, rename, activate, share, and delete modsets.
- Duplicate modsets including their tracked mod entries. Duplicates are created as private copies and are not automatically added to existing webhook scopes.
- Modsets are owned by the user who created them.
- Private modsets are visible and editable only to their owner.
- Shared modsets are visible and editable to other users.
- Deleting non-empty modsets is allowed, but the last remaining modset is protected.
- Export each modset as a JSON file.
- The Modsets page shows and edits the export order for the selected modset below the modset list, including order value, move controls, mod name, mod ID, and installed version.

### Security area

- Change your own password.
- Admin features: create users, change roles, enable/disable users, reset passwords.
- Optional OIDC login can be enabled alongside local login.
- Admin-managed Discord webhooks for update alerts: create, edit, disable, delete, and test webhooks in the UI.
- Discord webhooks can be limited to specific modsets directly in the webhook dialog.
- Discord update notifications can open the affected mod directly inside ARMM when `ARMM_PUBLIC_URL` is configured.
- Audit log with filters (Auth, User, Mod, Failures) and paging through older entries.

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
- Password changes, password resets, and role changes invalidate existing sessions immediately.
- Production startup fails fast if `ARMM_SECRET_KEY` is missing or left at a placeholder value.
- Cookie flags: `HttpOnly`, `SameSite=Lax`, and `Secure` in production.
- Logout clears the session cookie.
- OIDC logout clears only the ARMM session cookie; the central provider/SSO session may remain active.
- Origin validation for unsafe HTTP methods (additional CSRF protection via origin allowlist).
- Audit trail for login/logout, password actions, user changes, mod changes, modset changes, and webhook changes.
- Modset ownership and `shared` state are persisted and enforced server-side.
- Discord webhook targets are stored server-side and alerts are deduplicated per webhook, modset, mod, and latest version.
- Discord update alerts are only sent from the scheduled automatic runs at `10:00` and `19:00` in the configured deployment timezone.
- Discord webhook URLs are stored encrypted server-side and only shown in masked form in the UI.
- Each Discord webhook can be assigned to one or more modsets; if no explicit scope is chosen on creation, it defaults to all current modsets.
- Discord notification links use `ARMM_PUBLIC_URL` when configured, otherwise they fall back to the first `CORS_ORIGINS` entry.
- Frontend Nginx adds security headers (including CSP, X-Frame-Options, Referrer-Policy, nosniff).
- API documentation is protected and available only for authenticated users (`/api/docs`, `/api/openapi.json`).
- The browser path `/api` redirects to `/api/docs` in the frontend container.

## API overview

Base path behind the frontend proxy: `/api`

- `GET /api/health` (public)
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/config`
- `GET /api/auth/oidc/login`
- `GET /api/auth/oidc/callback`
- `GET /api/auth/me`
- `PATCH /api/auth/password`
- `GET/POST/PATCH/DELETE /api/mods...`
- `PATCH /api/mods/{mod_id}?deactivate_orphan_dependencies=true`
- `DELETE /api/mods/{mod_id}?deactivate_orphan_dependencies=true`
- `POST /api/mods/{mod_id}/refresh`
- `GET/POST/PATCH/DELETE /api/modsets...`
- `POST /api/modsets/{modset_id}/duplicate`
- `GET /api/modsets/{modset_id}/activity` (`limit`, `offset`)
- `GET /api/modsets/{modset_id}/export`
- `GET/POST/PATCH /api/users...` (admin)
- `GET/POST/PATCH/DELETE /api/discord-webhooks...` (admin)
- `GET /api/admin/modsets` (admin, used for webhook modset selection)
- `POST /api/discord-webhooks/{webhook_id}/test` (admin)
- `GET /api/audit` (admin, `limit`, `offset`)
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
- `ARMM_PUBLIC_URL`
- `ARMM_SCHEDULER_TIMEZONE`
- `POSTGRES_PASSWORD`
- `DATABASE_URL` (including the correct DB password)
- `CORS_ORIGINS` for your domain
- `ARMM_IMAGE_TAG` if you want to pin the example stack to a specific release tag
- `ARMM_SECRET_KEY` must be set to a unique strong value in production. There is no fallback secret anymore.

`ARMM_PUBLIC_URL` should point to the externally reachable ARMM URL, for example `https://armm.example.com`. It is used for Discord notifications that link directly back to the affected mod inside ARMM.

`ARMM_SCHEDULER_TIMEZONE` defines the deployment timezone used for the automatic runs. ARMM checks for updates twice per day at `10:00` and `19:00` in that timezone.

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

Note: The automatic crawl runs twice per day at `10:00` and `19:00` in `ARMM_SCHEDULER_TIMEZONE`. Discord update alerts are emitted only from those automatic runs, not from manual refreshes or manual version edits. Scheduled automatic crawls use Workshop scraping only; they do not call the internal Reforger CLI metadata service.

## Workshop Metadata

ARMM uses a hybrid Workshop metadata strategy.
Dependencies, changelog entries, descriptions, and other display metadata are still read from the Workshop pages.
For manual reliable checks, the latest mod version is read through an internal `reforger-cli` container because the Workshop pages can lag behind the backend data used by Arma Reforger.

The `reforger-cli` service installs or updates the Arma Reforger Dedicated Server through SteamCMD on startup, keeps the installation in the `reforger-server-data` Docker volume, and exposes an internal metadata API for the backend.

This avoids relying on cached Workshop website HTML for manual latest-version verification while keeping the richer dependency and changelog parsing from the Workshop pages. The Bohemia tooling may still download or materialize mod files while resolving version metadata; those files stay isolated inside the `reforger-cli` container volume and are not stored in the backend container.

Manual reliable metadata lookup flow:

- ARMM receives a mod ID from the UI.
- The backend scrapes the Workshop detail and changelog pages for metadata, dependencies, and version history.
- The backend also calls the internal `reforger-cli` metadata API for the same mod ID.
- The metadata service starts `ArmaReforgerServer` in headless mode with a temporary config for that mod.
- The service watches the temporary profile until the root mod `ServerData.json` is available and stable.
- The service terminates the Arma server process and returns the version from the root `ServerData.json`.
- The backend stores the scraped metadata but overrides the latest version with the Reforger CLI value.
- Dependencies discovered by scraping are refreshed recursively, so transitive dependencies can still be tracked.
- Temporary probe data is deleted after each lookup unless debug retention is explicitly enabled in the service environment.

No external port is published for the metadata service. It is only reachable from the Docker network at `http://reforger-cli:8081`.

Scheduled metadata lookup flow:

- The scheduler runs at `10:00` and `19:00` in `ARMM_SCHEDULER_TIMEZONE`.
- Scheduled runs use Workshop scraping only for metadata, version history, dependencies, and Discord update detection.
- Scheduled runs intentionally skip the internal Reforger CLI metadata service to reduce server load.
- Manual mod refreshes still use the hybrid strategy and can correct the latest version with the Reforger CLI value.

## Export load order

Arma Reforger uses the order of entries in the exported `mods` array as the server load order.
ARMM stores a numeric export load order per tracked mod inside each modset.

- Default value: `500`
- Lower values load earlier.
- Higher values load later.
- Equal values are allowed and fall back to mod name and mod ID for stable ordering.
- The normal sidebar sort modes are for browsing; the exported file always uses the stored export load order.
- The Modsets page includes an editable export-order overview for the selected modset so the final export order can be adjusted and checked before downloading the JSON.
- Export order can be adjusted either by entering a numeric value directly or by using move controls for top, up, down, and bottom.
- `Reset order` sets all exported mods in the selected modset back to the default value `500`.

## Operations

- Configure the deployment timezone for automatic runs with `ARMM_SCHEDULER_TIMEZONE` in `.env`.
- Manage the active admin login via `ARMM_ADMIN_USERNAME` / `ARMM_ADMIN_PASSWORD`.
- Modsets are user-scoped. The creator becomes the owner, and only `shared` modsets are available to other users.
- Adding a mod or changing a mod's installed version returns quickly in the UI. The request only waits for the initial Workshop scrape when a new mod is added; reliable version checks through Reforger and follow-up dependency metadata refreshes run through a small deduplicated backend queue with two workers.
- Automatic scheduled checks use scraping only. Use the manual refresh button on a mod when you explicitly want a reliable latest-version check through the Reforger CLI metadata service.
- Local production files intentionally remain unversioned: `.env`, `docker-compose.yml`.
- The example compose file uses GHCR images from the latest tagged release and does not build locally.

### Optional OIDC login

OIDC can be enabled without disabling local login. Unknown OIDC users are created automatically as regular `user` accounts. Admin privileges must be assigned inside ARMM after the first OIDC login.

Minimum `.env` settings:

```env
OIDC_ENABLED=true
OIDC_ISSUER_URL=https://identity.example.com/realms/armm
OIDC_CLIENT_ID=armm
OIDC_CLIENT_SECRET=change-me-client-secret
ARMM_PUBLIC_URL=https://armm.example.com
```

Register this redirect URI at the OIDC provider:

```text
https://armm.example.com/api/auth/oidc/callback
```

If `OIDC_REDIRECT_URI` is set, it overrides the URI derived from `ARMM_PUBLIC_URL`. Keep `OIDC_SCOPES` at `openid email profile` unless the provider requires a different scope set. ARMM uses the issuer and subject claim as the stable identity and does not auto-link existing local users by email.

No OIDC logout callback URL is required for the current implementation. ARMM logout only clears the local ARMM session cookie through `POST /api/auth/logout`; it does not call the provider's single logout or end-session endpoint. For Authentik and similar providers, configure only the redirect URI above unless a future ARMM release adds RP-initiated logout.

## Deployment checklist

Before exposing ARMM to other users, verify these points:

- Replace all placeholder secrets in `.env`, especially:
  - `ARMM_SECRET_KEY`
  - `ARMM_ADMIN_PASSWORD`
  - `POSTGRES_PASSWORD`
- Keep `.env` and the productive `docker-compose.yml` local only. Do not commit them.
- Set `ARMM_PUBLIC_URL` to the exact externally reachable URL of the application.
- Set `CORS_ORIGINS` to the exact frontend origins that should be allowed.
- Adjust Traefik host/domain labels in `docker-compose.yml` to your real domain.
- Use HTTPS only at the reverse proxy layer.
- Make sure `/api`, `/api/docs`, and `/api/openapi.json` are only reachable through the intended public domain/proxy path.
- After the first production start, log in with the bootstrap admin and verify that no default credentials remain in use.
- If Discord webhooks are configured, treat them as secrets and rotate them if they were ever exposed.

## Backup and recovery

- Back up the PostgreSQL volume regularly. It contains users, sessions, modsets, tracked mods, audit logs, changelog data, and encrypted Discord webhook targets.
- Keep a backup of your production `.env` outside the server, because it contains required runtime secrets.
- If `ARMM_SECRET_KEY` is changed later, existing sessions become invalid and encrypted Discord webhook URLs must be re-entered.
- Test restore procedures, not only backups. A backup is only useful if you have verified that the database and `.env` can be restored together.

Only anonymized example files are meant for Git:

- `.env.example`
- `docker-compose.example.yml`

## Troubleshooting

### Database schema checks

Use the SQLAlchemy models or current migrations as the source of truth for table and column names.
Common current names:

- Tracked mods are stored in `user_mods`, not `tracked_mods`.
- Modset ownership is stored as `modsets.owner_user_id`.
- Modset sharing is stored as `modsets.shared`.
- Audit payloads are stored as `audit_logs.detail`, not `audit_logs.details`.

Errors such as `relation "tracked_mods" does not exist` or `column a.details does not exist` usually indicate an outdated manual SQL query, not an application migration failure.

## Development and CI

- Backend tests: `python -m unittest discover -s tests -v` (inside `backend`)
- Frontend build: `npm run build` (inside `frontend`)
- CI runs both on push/PR to `main`.
