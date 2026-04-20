# Arma Reforger Mod Manager

Arma Reforger Mod Manager is an MVP for a monitoring system that stores Arma Reforger Workshop mods, regularly fetches Workshop data, and compares installed versions with the latest detected version.

## Start

```bash
cp .env.example .env
cp docker-compose.example.yml docker-compose.yml
```

Before production startup, change every `change-me...` value in `.env`:

- `ARMM_SECRET_KEY`
- `ARMM_ADMIN_PASSWORD`
- `POSTGRES_PASSWORD`
- `DATABASE_URL` password part
- public host values in `CORS_ORIGINS` and Traefik labels

Then start the stack:

```bash
docker compose up --build -d
```

After startup:

- Frontend via Traefik: https://armm.example.com
- Health check: https://armm.example.com/api/health
- API docs: disabled when `ARMM_ENV=production`

`docker-compose.yml` and `.env` are treated as local production files and are ignored by Git.
Only anonymized example files are tracked.

## Security

- The API requires login for all mod and user management endpoints.
- The first admin user is bootstrapped from `ARMM_ADMIN_USERNAME` and `ARMM_ADMIN_PASSWORD`.
- Sessions are stored in an `HttpOnly` cookie.
- In production, the session cookie is marked `Secure`.
- `/api/health` stays public for health checks.
- Swagger/OpenAPI are disabled in production.
- User management supports `admin` and `user` roles.
- Containers run as non-root users where possible.
- The frontend Nginx container adds basic security headers.

## MVP Features

- Add a mod by Workshop ID
- Fetch immediately after adding a mod
- Refresh regularly with the scheduler
- Compare installed and latest detected versions
- Show details with changelog and metadata
- Automatically track detected dependencies for installed mods
- Manage users as an admin

## Scraper Notes

The scraper deliberately uses robust HTML heuristics because no official Workshop API is assumed. If the Workshop page changes, `backend/app/scraper.py` is the likely place to adjust parsing.
