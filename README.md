# Reforger Workshop Monitoring System (RWMS)

RWMS is an MVP for a monitoring system that stores Arma Reforger Workshop mods, regularly fetches Workshop data, and compares installed versions with the latest detected version.

## Start

```bash
cp .env.example .env
docker compose up --build
```

After startup:

- Frontend via Traefik: https://rwms.mothes-cloud.de
- Health check: https://rwms.mothes-cloud.de/api/health
- API docs internally: http://backend:8000/docs

## MVP Features

- Add a mod by Workshop ID
- Fetch immediately after adding a mod
- Refresh regularly with the scheduler
- Compare installed and latest detected versions
- Show details with changelog and metadata

## Scraper Notes

The scraper deliberately uses robust HTML heuristics because no official Workshop API is assumed. If the Workshop page changes, `backend/app/scraper.py` is the likely place to adjust parsing.
