# Upgrading ARMM

Documentation and tracked image examples describe **0.2.6**. Set `ARMM_IMAGE_TAG=0.2.6` to upgrade from 0.2.5. Use a [source build](development.md) only to review a source revision independently of published images.

| Starting point | Changes requiring attention | Detailed guide |
| --- | --- | --- |
| 0.2.4 → 0.2.5 | Global Shared access is replaced by explicit groups. Existing groups, identities, ownership and webhook scopes must be preserved. | [Group sharing and recovery](group-sharing-upgrade.md) |
| 0.2.5 → 0.2.6 | Redesigned interface and navigation; atomic user editing; persistent individual manual checks with an additive job table. | [Changes since 0.2.5](changes-since-0.2.5.md), [manual-check migration](manual-refresh-upgrade.md) |

The redesign, URL navigation, resource recovery and atomic user update add no schema migration. Persistent manual jobs add `002_mod_refresh_jobs`; it runs automatically at startup. No new required environment variables or additional service is needed.

## Maintenance sequence

1. Record the installed image tag/build commit. Retain old images, the database backup and the matching `.env`, especially `ARMM_SECRET_KEY`.
2. Verify a restore into a separate database. Let running checks finish, stop the old backend, and take the final backup before migration. Old 0.2.5 in-memory checks cannot be imported.
3. Update all ARMM images to the same published tag, or rebuild the selected source revision. Keep PostgreSQL and Reforger data volumes. Do not use `docker compose down -v` or run old/new backends together.
4. Start updated services and inspect startup/migration logs and `/api/health`. Reload existing browser tabs.
5. Verify login, group grants, webhook scopes, a known export, URL reload/history and a manual check across reload/another tab.

For GHCR deployments, set `ARMM_IMAGE_TAG=0.2.6`, then pull/start using your existing configuration. The new image tag includes the redesign and persistent individual manual checks.

The old synchronous single-mod refresh route remains supported. New frontends use additive asynchronous routes. Existing Discord deep links and separate password/membership endpoints remain supported. Session advisory locks require direct PostgreSQL connections or session pooling, not transaction pooling.

## Recovery

If startup fails, stop the new backend and inspect logs. Do not delete migration ledger entries. The supported downgrade path uses the matching pre-upgrade backup, old images and `.env`, restored into a clean database while backends are stopped. Later edits are lost. An application-only downgrade against the expanded schema has not been certified. See the detailed guides above for commands and migration regression coverage.
