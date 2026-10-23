# Group sharing and upgrades from 0.2.4

Groups are the only way owners grant access to other accounts. Global Shared access has been removed. Administrators manage groups and memberships in **Security → Groups** or the user editor. Existing local and OIDC accounts can be members; a service account is an ordinary account used by an integration.

## Set up a private integration

1. Create a group such as `Server Integration` and add the service account.
2. As the modset owner or an administrator, open **Modsets → Edit → Group access** and choose **Read** for that group.
3. Sign in as the service account and use an explicit `modset_id` for API requests.

Read access permits listing the modset, reading tracked mods and activity, exporting JSON, and copying or duplicating an accessible modset. A duplicate belongs to its creator and starts private with no group permissions or inherited Discord webhook scope. Write access additionally permits changing the modset name, tracked mods, installed versions, export order, and manual metadata refreshes.

Owners and administrators can manage group permissions or delete the source modset. The last remaining modset remains protected. Administrators have emergency access to every modset: viewing, export, editing, group permissions, and deletion. Ownership stays with the original user, and administrative changes are attributed to the administrator in the audit log.

Permissions are additive: the strongest permission from administrator status, ownership, or any group applies. Historical `shared=true` values are ignored, including for accounts with existing sessions. Changing or removing group membership takes effect on the next API request, including requests from existing sessions. The UI refreshes access when the window gains focus and every minute. Accounts without an accessible modset have no active modset; reading or signing in does not create or publish a fallback modset. Users can still create their own private modsets.

The signed-in group directory exposes group IDs and names so owners can select a group. Descriptions and membership lists are restricted to administrators. Group and sharing changes are recorded in the audit log.

## API use by existing service accounts

The first implementation retains session-cookie authentication. There is no API-token or anonymous access mechanism in this change. Password-based accounts use `POST /api/auth/login` and retain the returned `armm_session` cookie; integrations must renew sessions when expired or revoked. Existing Origin validation still applies; a supplied Origin must match the deployment allowlist.

For example, after authenticating with your HTTP client's cookie jar:

```text
GET /api/modsets
GET /api/mods?modset_id=42
GET /api/mods/MOD_ID?modset_id=42
GET /api/modsets/42/export
```

Explicit IDs avoid integrations competing over a single account's active modset. Read-only accounts receive 403 on write operations. Inaccessible or revoked modsets return 404. Disabled accounts receive 401. Read-only permissions do not prevent an account from creating its own modsets.

New management endpoints:

```text
GET    /api/groups
GET    /api/admin/groups
POST   /api/admin/groups
PUT    /api/admin/groups/{group_id}
DELETE /api/admin/groups/{group_id}
PUT    /api/admin/users/{user_id}/groups
GET    /api/modsets/{modset_id}/group-permissions
PUT    /api/modsets/{modset_id}/group-permissions
```

Group creation/update accepts `name`, `description`, and `user_ids`. Group-permission updates replace the modset's group grants using `{"entries":[{"group_id":1,"permission":"read"}]}`; an empty list removes all group grants. The Edit modset dialog saves name and grants together using `PATCH /api/modsets/{modset_id}` with optional `group_permissions`; both changes use a single transaction. Existing separate group-permission endpoints remain available for integrations. User-membership updates use `{"group_ids":[1,2]}`. Modset responses include `can_edit`, `can_delete`, `can_manage_access`, and `has_group_access`. For older clients, the deprecated `shared` response field remains but is always false. Requests may omit `shared` or send false; attempts to enable global sharing with `shared=true` return 422. New integrations should omit this field.

Manual `POST /api/refresh` now requires write access and refreshes only the requested or active modset. Automatic scheduled checks continue to cover all tracked modsets and retain their existing Discord notification rules.

## Upgrade an existing deployment

The upgrade adds `groups`, `group_memberships`, `modset_group_permissions`, and the `schema_migrations` ledger. It does not rename or remove existing tables or columns. Existing user identities, password hashes, session versions, OIDC identities, modset IDs, ownership, mods, installed versions, load order, history, audit records, webhook selections, encryption, and delivery deduplication records are retained. Groups and grants start empty: existing users are not automatically added to any group. Existing historical `modsets.shared` values remain stored for database compatibility but never grant access.

**Access change for 0.2.4 administrators:** previously shared modsets remain available to their owners and administrators; other accounts require explicit group grants. Accounts that previously relied on global sharing, including service accounts, lose that access. Plan group membership and grants during the maintenance window and verify integration access before reopening the instance. No all-users group or replacement global grant is created automatically. Existing group grants on installations already testing this feature are retained.

Group-table creation and its migration marker run in one transaction. PostgreSQL uses a transaction-scoped advisory lock for this migration. Failed group-table creation rolls back and is retried on the next start. This does not make rolling upgrades with mixed backend versions supported: stop the old backend before starting the new one. Never delete the migration ledger as a troubleshooting step.

Before updating:

1. Back up the database and retain the matching `.env`, especially `ARMM_SECRET_KEY` (required for sessions and decrypting webhook URLs).
2. Record the currently deployed image tag and keep the old image available. For a local build, also record the Git commit.
3. Verify a restore into a separate database before using the backup as your recovery plan.

Example database backup using the standard Compose service:

```bash
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > armm-before-groups.dump
```

During the maintenance window, stop the backend, take a final backup, set `ARMM_IMAGE_TAG` to the published release containing group management, then pull and start the matching frontend/backend images. No manual SQL or recreation of the database volume is required. Do not use `docker compose down -v`.

After startup, check `/api/health`, sign in, inspect owner and group access as well as webhook selections, and compare a known JSON export. Configure explicit group grants for previously shared modsets and test the affected service accounts. Container restarts must preserve these selections.

Group management is included in release **0.2.5**; set `ARMM_IMAGE_TAG=0.2.5` when upgrading from 0.2.4.

## Recovery

If startup fails, stop the new backend and inspect its logs before retrying. Keep database access available for diagnosis. If an in-place return to the old version is necessary, use the verified pre-upgrade database backup, matching `.env`, and previous image tag. Restore into a clean database or replacement volume while the backend is stopped; do not overlay a backup onto a running installation. For a prepared empty recovery database, the matching restore command is:

```bash
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --exit-on-error' < armm-before-groups.dump
```

This restores the state at backup time; later edits are not included. Keeping new group tables while simply reverting the application is not a supported downgrade path. In particular, 0.2.4's startup migration can reattach all modsets to webhooks, so webhook selections require checking after any return to that version.

## Verification

Upgrade tests use frozen SQLite and PostgreSQL DDL from release 0.2.4 (`87a8ffb`) instead of generating an old database from current models. They verify complete legacy row preservation across migration and repeated application startups, session-version and password preservation, JSON export, rejection of historical global sharing as an access path, new grants, a failed migration and retry, and fresh installation. CI runs the PostgreSQL cases on PostgreSQL 16. Local PostgreSQL tests use a separate schema per test and require an explicitly supplied `ARMM_UPGRADE_TEST_DATABASE_URL` pointing to a disposable test database.
