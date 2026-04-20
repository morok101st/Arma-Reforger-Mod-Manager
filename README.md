# Arma Reforger Mod Manager

Arma Reforger Mod Manager is an MVP for a monitoring system that stores Arma Reforger Workshop mods, regularly fetches Workshop data, and compares installed versions with the latest detected version.

## Start

```bash
cp .env.example .env
cp docker-compose.example.yml docker-compose.yml
docker compose up --build
```

After startup:

- Frontend via Traefik: https://armm.example.com
- Health check: https://armm.example.com/api/health
- API docs internally: http://backend:8000/docs

`docker-compose.yml` is treated as a local production file and is ignored by Git.
Only `docker-compose.example.yml` is tracked.

## MVP Features

- Add a mod by Workshop ID
- Fetch immediately after adding a mod
- Refresh regularly with the scheduler
- Compare installed and latest detected versions
- Show details with changelog and metadata

## Scraper Notes

The scraper deliberately uses robust HTML heuristics because no official Workshop API is assumed. If the Workshop page changes, `backend/app/scraper.py` is the likely place to adjust parsing.
