# Upgrading ARMM

Tracked image examples select **0.2.7**. Documentation also identifies [unreleased source changes](unreleased.md); these are not included in the 0.2.7 images and introduce no new required settings. Size/navigation changes need no migration; the sync-access feature branch adds the credential table through `005_modset_sync_access` and adds saved configuration/encrypted-key fields through `006_sync_configuration` (see [sync access](sync-access.md)). Set `ARMM_IMAGE_TAG=0.2.7` to upgrade from 0.2.6. Use a [source build](development.md) only to review a source revision independently of published images.

| Starting point | Changes requiring attention | Detailed guide |
| --- | --- | --- |
| 0.2.4 → 0.2.5 | Global Shared access is replaced by explicit groups. Existing groups, identities, ownership and webhook scopes must be preserved. | [Group sharing and recovery](group-sharing-upgrade.md) |
| 0.2.5 → 0.2.6 | Redesigned interface and navigation; atomic user editing; persistent individual manual checks with an additive job table. | [Changes since 0.2.5](changes-since-0.2.5.md), [manual-check migration](manual-refresh-upgrade.md) |
| 0.2.6 → 0.2.7 | Parent/child inheritance, parent-controlled ordering and a sequence editor. Additive migrations `003_base_modsets` and `004_base_export_order`; existing modsets keep independent ordering. | [Parent/Child guide](parent-child-modsets.md), [release notes](releases/0.2.7.md) |

The redesign, URL navigation, resource recovery and atomic user update add no schema migration. Persistent manual jobs add `002_mod_refresh_jobs`; it runs automatically at startup. No new required environment variables or additional service is needed.

## Maintenance sequence

1. Record the installed image tag/build commit. Retain old images, the database backup and the matching `.env`, especially `ARMM_SECRET_KEY`.
2. Verify a restore into a separate database. Let running checks finish, stop the old backend, and take the final backup before migration. Old 0.2.5 in-memory checks cannot be imported.
3. Update all ARMM images to the same published tag, or rebuild the selected source revision. Keep PostgreSQL and Reforger data volumes. Do not use `docker compose down -v` or run old/new backends together.
4. Start updated services and inspect startup/migration logs and `/api/health`. Reload existing browser tabs.
5. Verify an existing export against its pre-upgrade JSON, then test parent/child permissions, binding versions and local insertions on disposable modsets. Verify login, group grants, webhook scopes, a known export, URL reload/history and a manual check across reload/another tab.

For GHCR deployments, set `ARMM_IMAGE_TAG=0.2.7`, then pull/start using your existing configuration. The new image tag also includes parent/child modsets. Migrations run automatically at backend startup: a nullable parent foreign key, an export-order table, an order-mode column and JSON fallback anchors. No new required environment variables or services are needed. Existing numeric order values remain valid; existing modsets retain independent mode. New child modsets default to following parent order.

The old synchronous single-mod refresh route remains supported. New frontends use additive asynchronous routes. Existing Discord deep links and separate password/membership endpoints remain supported. Session advisory locks require direct PostgreSQL connections or session pooling, not transaction pooling.

## Recovery

If startup fails, stop the new backend and inspect logs. Do not delete migration ledger entries. The supported downgrade path uses the matching pre-upgrade backup, old images and `.env`, restored into a clean database while backends are stopped. Later edits are lost. An application-only downgrade against the expanded schema has not been certified. See the detailed guides above for commands and migration regression coverage.
