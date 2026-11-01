# Source builds and documentation tooling

Release installations use the tracked GHCR example, currently selecting **0.2.6**. To review a source revision independently of published images, build that revision locally instead of inventing an image tag.

## Build the current source

From the repository root:

```bash
docker build -t armm-backend:local backend
docker build --build-arg VITE_API_BASE_URL=/api -t armm-frontend:local frontend
docker build -t armm-reforger-cli:local reforger-cli
```

Prepare your `.env` and `docker-compose.yml` from the tracked examples, setting real secrets and appropriate routing as described in the [README](../README.md#installation-docker-compose). For a local source build, create a local `compose.source.yml` override:

```yaml
services:
  backend:
    image: armm-backend:local
  frontend:
    image: armm-frontend:local
  reforger-cli:
    image: armm-reforger-cli:local
```

Then start using both files:

```bash
docker compose -f docker-compose.yml -f compose.source.yml up -d --no-build
```

Keep `.env`, `docker-compose.yml` and this environment-specific override out of commits. This operates the configured installation and database; it is not automatically an isolated second stack. For existing deployments, follow [backup and upgrade steps](upgrading.md) before starting a new backend. Avoid old/new backend overlap. Record the Git commit and keep old images for recovery.

## Verify changes

Install backend dependencies from `backend/requirements.txt` in your Python environment. From `backend`, with disposable test settings:

```bash
ARMM_ENV=development ARMM_SECRET_KEY=local-test-only \
  DATABASE_URL=sqlite:///./local-tests.db \
  python -m unittest discover -s tests -v
```

The PostgreSQL upgrade/concurrency cases additionally require `ARMM_UPGRADE_TEST_DATABASE_URL` pointing at a disposable PostgreSQL database; they create/drop isolated schemas and are skipped when it is unset. Never point that variable at a production database. CI supplies PostgreSQL 16.

From `frontend`:

```bash
npm install
npm test
VITE_API_BASE_URL=/api npm run build
```

For browser regression tests, start `VITE_API_BASE_URL=/api npm run dev`, install Chromium with `npx playwright install --with-deps chromium`, then run `ARMM_TEST_URL=http://localhost:5173 npm run test:browser` in another frontend terminal. The tests mock API traffic; they do not use live account data.

## Documentation assets

See [screenshot capture](screenshots.md#reproduce-the-captures) for deterministic demo fixtures and output sizes. Regenerate vector diagrams from the repository root with:

```bash
python3 docs/tools/generate-diagrams.py
```

Review captures visually, verify links and keep wiki image copies synchronized. Internal `PRODUCT.md`, `DESIGN.md` and local agent/skill files remain unversioned and are not public documentation artifacts.
