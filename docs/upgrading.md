# Upgrading ARMM

Tracked image examples select **0.2.8**. When upgrading from 0.2.7, set `ARMM_IMAGE_TAG=0.2.8`. The release adds Sync access and size/navigation improvements; no existing session-authenticated API permissions are changed. See [release notes](releases/0.2.8.md) and [Sync access](sync-access.md).

| Starting point | Changes requiring attention | Detailed guide |
| --- | --- | --- |
| 0.2.4 → 0.2.5 | Global Shared access is replaced by explicit groups. Existing groups, identities, ownership and webhook scopes must be preserved. | [Group sharing and recovery](group-sharing-upgrade.md) |
| 0.2.5 → 0.2.6 | Redesigned interface and navigation; atomic user editing; persistent individual manual checks with an additive job table. | [Changes since 0.2.5](changes-since-0.2.5.md), [manual-check migration](manual-refresh-upgrade.md) |
| 0.2.6 → 0.2.7 | Parent/child inheritance, parent-controlled ordering and a sequence editor. Additive migrations `003_base_modsets` and `004_base_export_order`; existing modsets keep independent ordering. | [Parent/Child guide](parent-child-modsets.md), [release notes](releases/0.2.7.md) |
| 0.2.7 → 0.2.8 | Administrator-managed Sync access with saved configuration/encrypted keys. Additive migrations `005_modset_sync_access` and `006_sync_configuration`; existing modsets, groups, sessions and exports are retained. | [Sync access](sync-access.md), [release notes](releases/0.2.8.md) |

The redesign, URL navigation, resource recovery and atomic user update add no schema migration. Persistent manual jobs add `002_mod_refresh_jobs`; it runs automatically at startup. No new required environment variables or additional service is needed.

## Maintenance sequence

1. Record the installed image tag/build commit. Retain old images, the database backup and the matching `.env`, especially `ARMM_SECRET_KEY`.
2. Verify a restore into a separate database. Let running checks finish, stop the old backend, and take the final backup before migration. Old 0.2.5 in-memory checks cannot be imported.
3. Update all ARMM images to the same published tag, or rebuild the selected source revision. Keep PostgreSQL and Reforger data volumes. Do not use `docker compose down -v` or run old/new backends together.
4. Start updated services and inspect startup/migration logs and `/api/health`. Reload existing browser tabs.
5. Verify an existing export against its pre-upgrade JSON, then test parent/child permissions, binding versions and local insertions on disposable modsets. Verify login, group grants, webhook scopes, a known export, URL reload/history and a manual check across reload/another tab.

For GHCR deployments, set `ARMM_IMAGE_TAG=0.2.8`, then pull/start with your existing configuration. Startup applies `005_modset_sync_access` (new table) and `006_sync_configuration` (nullable configuration and encrypted-key fields). No existing columns are renamed or removed, no new service/required environment setting is introduced, and Sync access starts empty on release 0.2.7 installations. It is enabled only when an administrator configures it. Preserve `ARMM_SECRET_KEY` for session continuity and encrypted webhook/sync-key recovery.

The direct 0.2.7 regression uses frozen tagged SQLite/PostgreSQL schemas and verifies legacy rows, group grants, session validity, webhook encryption, parent/child versions/order and exports before and after repeated startup, then creates and exercises a new Sync access. Interrupted-migration rollback/retry is covered separately. Test your own restored backup before production upgrades; a pure image downgrade against the expanded schema is not certified.

The old synchronous single-mod refresh route remains supported. New frontends use additive asynchronous routes. Existing Discord deep links and separate password/membership endpoints remain supported. Session advisory locks require direct PostgreSQL connections or session pooling, not transaction pooling.

## Recovery

If startup fails, stop the new backend and inspect logs. Do not delete migration ledger entries. The supported downgrade path uses the matching pre-upgrade backup, old images and `.env`, restored into a clean database while backends are stopped. Later edits are lost. An application-only downgrade against the expanded schema has not been certified. See the detailed guides above for commands and migration regression coverage.
