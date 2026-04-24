# Arma Reforger Mod Manager (ARMM)

ARMM ist eine Webanwendung zur Verwaltung und Überwachung von Arma Reforger Workshop-Mods.
Sie speichert Mod-Daten pro Modset, crawlt regelmäßig Workshop-Infos, vergleicht installierte mit verfügbaren Versionen und zeigt Updates, Abhängigkeiten und Audit-Events zentral im UI.

## Was die Anwendung macht

- Tracking von Workshop-Mods über Mod-ID.
- Verwaltung mehrerer Modsets (z. B. pro Server).
- Vergleich `Installed Version` vs. `Latest Version`.
- Automatischer Crawl beim Start und anschließend im definierten Intervall.
- Anzeige von Dependencies und `Required by`-Beziehungen zwischen überwachten Mods.
- Automatisches Hinzufügen von Dependencies zur Überwachung, sobald eine installierte Version gesetzt ist.
- Changelog-Historie pro Version inkl. `Last modified`.
- Export eines Modsets als JSON-Liste (`modId`, `name`, `version`) nur für Mods mit gesetzter Version.

## Funktionsumfang (UI)

### Dashboard

- Kennzahlen: Anzahl Mods, Updates, fehlende installierte Versionen, Dependency-Links.
- Statuskachel „Needs attention“ inkl. sauberem OK/Warning-Status.
- Letzter automatischer Crawl und nächster geplanter Crawl.

### Mod-Management

- Mod hinzufügen (Dialog), optional direkt in ein anderes Modset.
- Mod-Detail mit Status, Metadaten, Version setzen/speichern, „Set to latest“, Refresh, Delete mit Sicherheitsabfrage.
- In der Modliste: kompakte Hinweise zu `deps` und `req`.
- Suche nach Mod-Name und Mod-ID.

### Modsets

- Modsets erstellen, umbenennen, aktivieren, löschen (nur wenn leer und nicht letztes Modset).
- Export pro Modset als JSON-Datei.

### Security-Bereich

- Eigenes Passwort ändern.
- Admin: Benutzer anlegen, Rolle ändern, aktivieren/deaktivieren, Passwort zurücksetzen.
- Audit-Log mit Filtern (Auth, User, Mod, Failures).

## Security-Features

- Login-Pflicht für alle Management-Endpunkte.
- Öffentlicher Endpunkt nur `GET /api/health`.
- Rollenmodell: `admin` und `user`.
- Initialer Admin-User wird beim Start aus `.env` gebootstrapped.
- Passwort-Hashing mit `PBKDF2-SHA256` (`210000` Iterationen).
- Mindestlänge Passwörter: 12 Zeichen (User-Create, Reset, Own Password Change).
- Benutzername-Login ist case-insensitive.
- Login-Rate-Limit: 8 Fehlversuche pro 60 Sekunden (pro IP + Username).
- Session per signiertem HttpOnly-Cookie (`armm_session`, 7 Tage TTL).
- Cookie-Flags: `HttpOnly`, `SameSite=Lax`, in Produktion zusätzlich `Secure`.
- Logout invalidiert den Session-Cookie.
- Origin-Prüfung für unsafe HTTP-Methoden (zusätzlicher CSRF-Schutz über Origin-Allowlist).
- Audit-Trail für Login/Logout, Passwortaktionen, User-Änderungen, Mod- und Modset-Aktionen.
- Frontend-Nginx setzt Sicherheitsheader (u. a. CSP, X-Frame-Options, Referrer-Policy, nosniff).
- API-Dokumentation ist geschützt und nur für eingeloggte Nutzer erreichbar (`/api/docs`, `/api/openapi.json`).

## API-Übersicht

Basis-Pfad hinter dem Frontend-Proxy: `/api`

- `GET /api/health` (öffentlich)
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `PATCH /api/auth/password`
- `GET/POST/PATCH/DELETE /api/mods...`
- `POST /api/mods/{mod_id}/refresh`
- `GET/POST/PATCH/DELETE /api/modsets...`
- `GET /api/modsets/{modset_id}/export`
- `GET/POST/PATCH /api/users...` (admin)
- `GET /api/audit` (admin)
- `GET /api/scheduler/status`
- `GET /api/docs` (eingeloggt)

## Installation (Docker Compose)

### Voraussetzungen

- Docker + Docker Compose Plugin
- Reverse Proxy/Traefik Netzwerk `traefik_default` (wie in der Example-Compose referenziert)

### 1. Konfiguration vorbereiten

```bash
cp .env.example .env
cp docker-compose.example.yml docker-compose.yml
```

### 2. Pflichtwerte in `.env` setzen

Mindestens diese Werte ändern:

- `ARMM_SECRET_KEY`
- `ARMM_ADMIN_PASSWORD`
- `POSTGRES_PASSWORD`
- `DATABASE_URL` (inkl. korrektem DB-Passwort)
- `CORS_ORIGINS` passend zu deiner Domain

Zusätzlich in `docker-compose.yml` die Traefik-Host/Domain-Labels an deine Umgebung anpassen.

### 3. Starten

```bash
docker compose up --build -d
```

### 4. Prüfen

- Health: `https://<deine-domain>/api/health`
- Login im Frontend: `https://<deine-domain>/`
- API-Doku (nach Login): `https://<deine-domain>/api/docs`

Hinweis: Beim Start wird ein automatischer Initial-Crawl geplant/ausgeführt, danach im Intervall über `SCRAPE_INTERVAL_MINUTES`.

## Betrieb

- Scheduler-Intervall über `SCRAPE_INTERVAL_MINUTES` in `.env`.
- Aktiven Admin-Zugang über `ARMM_ADMIN_USERNAME` / `ARMM_ADMIN_PASSWORD` verwalten.
- Lokale produktive Dateien bleiben bewusst unversioniert: `.env`, `docker-compose.yml`.

Für Git sind ausschließlich die anonymisierten Beispiel-Dateien vorgesehen:

- `.env.example`
- `docker-compose.example.yml`

## Entwicklung und CI

- Backend-Tests: `python -m unittest discover -s tests -v` (im `backend`-Ordner)
- Frontend-Build: `npm run build` (im `frontend`-Ordner)
- CI führt beides auf Push/PR gegen `main` aus.
