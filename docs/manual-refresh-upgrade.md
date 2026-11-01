# Persistent manual update checks and upgrading from 0.2.5

This feature is on current `main` after 0.2.5; it is not included in the tagged 0.2.5 images. See the [upgrade overview](upgrading.md) and [architecture diagrams](architecture.md).

Manual **Check updates** jobs are stored in the database. Reloading, opening another tab, or reconnecting restores their status. Requests for the same mod in the same modset join the active job. Different modsets have separate jobs because dependency tracking is modset-specific.

The browser checks job status every two seconds and reconnects automatically after network failures. Failed/interrupted checks allow a new attempt. When a process loses its execution lock, a worker marks its running job failed without replaying possible side effects. Queued jobs resume after restart. Reloading never starts a job.

Manual checks still do not send Discord notifications. Scheduled checks retain their 10:00/19:00 notification behavior. Bulk checks and metadata fetches after adding/editing mods retain their existing paths; the new duplicate protection covers individual manual checks through either endpoint below.

## API compatibility

Existing clients can keep using `POST /api/mods/{mod_id}/refresh?modset_id=42`. It waits for the durable job and returns the existing `ModRead` response. Concurrent callers join the same job. Disconnecting does not cancel an accepted job; synchronous HTTP/proxy timeouts can still affect callers. The failure status remains 502, with a generic retryable message rather than upstream exception details.

The updated frontend uses additive endpoints:

```text
POST /api/mods/{mod_id}/refresh-job?modset_id=42
GET  /api/refresh-jobs?modset_id=42
```

POST returns HTTP 202 and the new or active job. GET returns the latest attempt per still-tracked mod in the accessible modset. Fields: `mod_id`, `modset_id`, `attempt`, `state`, `requested_at`, `started_at`, `completed_at`, `error`. States: `queued`, `running`, `succeeded`, `failed`. Starting requires write access; status requires read access. Authentication and Origin validation remain unchanged. Raw failures are logged server-side.

## Upgrade from 0.2.5

The additive migration `002_mod_refresh_jobs` creates the job table and index automatically at backend startup, in a transaction protected by a PostgreSQL migration lock. Accounts, sessions, group grants, modsets, installed versions, export order, history, and webhook scopes/deduplication remain intact. Failed table creation rolls back and can be retried. No manual SQL, new required environment variables, Redis, or extra container is needed.

1. Let running 0.2.5 checks finish, then stop the old backend during a short maintenance window. Its in-memory checks cannot be imported; the new job table starts empty.
2. Take a final database backup and retain the matching `.env`, especially `ARMM_SECRET_KEY`. Record the previous image tag or local build commit. Verify restoration into a separate database.
3. Set `ARMM_IMAGE_TAG` to the published release containing this feature, pull the matching images, and start the updated services. For local builds, rebuild backend and frontend. Do not run mixed backend versions or delete database volumes (`docker compose down -v`).
4. Check startup logs and `/api/health`. Reload existing browser tabs. Existing API scripts retain their synchronous endpoint.
5. Verify login, group access, a known JSON export and webhook scopes. Start a manual check, reload before completion, open another tab, and confirm both show progress and later allow another check.

PostgreSQL is the production job store. Execution uses session advisory locks, requiring a direct PostgreSQL connection or session-pooling proxy; transaction-pooling proxies are unsupported. Two workers per backend process execute manual checks. SQLite development uses local OS file locks and does not support workers on different hosts.

## Recovery and verification

On startup failure, stop the new backend and inspect logs before retrying. Never delete migration ledger entries. Supported rollback: restore the verified pre-upgrade backup into a clean recovery database while backends are stopped, using the matching `.env` and old images. Changes after the backup are lost. An application-only downgrade against the expanded schema is not certified.

The existing [backup and restore instructions](group-sharing-upgrade.md#upgrade-an-existing-deployment) also apply.

Tests use frozen SQLite/PostgreSQL DDL from v0.2.5 (`68ee633`), with its migration ledger, to verify row/group-grant preservation, repeated startup and migration rollback/retry. PostgreSQL tests verify concurrent enqueue, execution exclusion and recovery after an actual process death. CI uses its isolated PostgreSQL upgrade database. Browser tests cover reload, another tab, completion, failure/retry, status network failure/reconnection, and mobile layout in both themes.
