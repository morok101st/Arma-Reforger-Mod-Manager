# Sync access

Sync access is included in **0.2.8**; it is not available in 0.2.7 images. Administrators manage configured accesses under **Administration → Sync access**. This page lists existing accesses only, including disabled or blocked entries; it does not repeat the modset directory.

## Create an access

Choose **Create sync access**. The wizard asks for:

1. **Modset and name:** select a modset without an existing access and choose the name shown in the sync app.
2. **Connection details:** public ARMM HTTPS origin and optional game server hostname/IP, port and `passwordRequired`.
3. **Review and save:** check the summary and explicitly authorize export of the selected modset, including inherited mods.

Nothing is created until the final confirmation. Cancel discards the wizard draft. A failed save retains entered values. One configured access is allowed per modset, including disabled accesses; edit the existing entry instead of creating a duplicate.

After saving, the access appears as a row with **Edit**, **Download** and **Disable** actions. The development branch adds **Delete** and groups Edit, Download, Disable and Delete in the same **More actions** (three-dot) menu used by Modsets; these changes are not included in release 0.2.8. Search by access name, modset or game server, or filter by Active, Disabled and Blocked. Connection settings persist for future edits and downloads. Game server passwords are never accepted or stored; `passwordRequired` only instructs the app to ask for one.

## Edit, download and replace

**Edit** reopens the wizard with saved values. Changing the name, URL or game server details preserves the existing key. The selected modset stays fixed. Download a fresh configuration after changing connection details; previously imported files retain their old settings.

**Download** creates `armm-sync.json` from saved settings and the current key. Repeated downloads do not rotate the key. Anyone possessing the file can read the selected modset's export without an ARMM account.

**Disable** asks for confirmation and blocks both export and configuration download. To enable or renew access, edit it and explicitly select **Replace the key and enable access**, then confirm the invalidation of previous keys. This also restores access under the acting administrator's authority. Replacing a key immediately invalidates old app configurations.

**Delete** (development) asks for confirmation, permanently removes the saved key/settings and invalidates existing app configurations. The modset and its mods remain untouched and become eligible for a new access. This is separate from Disable, which preserves settings. Only administrators can delete; no migration is required.

Existing accesses from before the wizard are retained as rows marked **Setup needed**. Choose **Finish setup** to save connection details. If no recoverable key exists, supply the existing key once or explicitly replace it. Setup with the existing key preserves that key; settings-only edits do not silently enable disabled or blocked accesses.

## Import contract

```json
{
  "format": "armm-sync",
  "formatVersion": 1,
  "name": "Community Server",
  "armm": {
    "baseUrl": "https://armm.example.com",
    "modsetId": 42,
    "exportPath": "/api/sync/modsets/42/export",
    "accessKey": "armm_sync_EXAMPLE_ONLY"
  },
  "gameServer": {
    "host": "gameserver.example.com",
    "port": 2001,
    "passwordRequired": true
  }
}
```

`baseUrl` is the public HTTPS origin, optionally with a port, without credentials, path, query or fragment. `exportPath` is a server-generated relative path beginning with `/`. The app must join it to `baseUrl` on the same origin, rather than constructing a fixed endpoint from the modset ID. Future path changes can then be handled by a new import if authentication and the response contract stay compatible. The optional `gameServer` block is omitted when not selected.

```http
GET /api/sync/modsets/42/export
Authorization: Bearer armm_sync_EXAMPLE_ONLY
```

The response remains the existing ordered array:

```json
[
  { "modId": "MOD_ID", "name": "Mod Name", "version": "1.2.3" }
]
```

Only installed versions are included. The key grants no write, refresh, management, direct parent-export or other-modset access. No Discord notifications are triggered. Query-string keys are not supported. Management and export responses use `Cache-Control: no-store`.

## Parent/child permissions

Child access intentionally includes inherited parent mods, binding installed versions and the effective child export order. Every export verifies that its creator exists, is active, still has the administrator role and has required child/parent access. Administrators have access to all modsets; the release is an explicit administrative authorization independent of the owner's group grants.

Changing, attaching or detaching the parent disables the access. Normal parent mod/version/order changes appear in subsequent exports. Disabled/deleted/demoted creators block existing keys. An active administrator can renew by explicitly replacing the key. Older keys issued by ordinary owners remain blocked until renewed.

## Persistence and upgrades

Migration `005_modset_sync_access` adds the credential table. Migration `006_sync_configuration` adds nullable saved configuration and encrypted-key columns, preserving existing hashes, keys and modsets. Both migrations are additive and retryable on SQLite/PostgreSQL. No additional service or environment variable is required.

For repeat downloads, new keys are encrypted at rest with a domain-separated key derived from `ARMM_SECRET_KEY`; the SHA-256 hash remains the export authentication verifier. Raw keys and encrypted ciphertext are excluded from overview/status responses and audit details. Saved configuration contains only the display name, HTTPS origin and optional game server hints.

Back up the database and matching `.env` before upgrading. Changing `ARMM_SECRET_KEY` prevents recovery of encrypted sync keys, although hash-based export authentication can still work. Edit affected accesses to restore their existing key or explicitly replace it. Keep imported files private and avoid logging Authorization headers.

## API

All management endpoints require an active administrator session; normal session-authenticated modset APIs keep their existing permissions.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/admin/sync-access` | List existing accesses and their non-secret saved settings |
| `POST /api/admin/sync-access` | Atomically create access with `modset_id`, `name`, `baseUrl` and optional `gameServer` |
| `PUT /api/admin/sync-access/{id}` | Save `name`, `baseUrl`, optional `gameServer`; optionally restore `accessKey` or explicitly set `replaceKey: true` |
| `GET /api/admin/sync-access/{id}/configuration` | Download saved configuration with the current recovered key |
| `DELETE /api/admin/sync-access/{id}` | Permanently delete key/settings (development; 204, or 404 if absent) |
| `DELETE /api/modsets/{id}/sync-access` | Disable access |
| `GET /api/sync/modsets/{id}/export` | Export installed mods using the scoped bearer key |

Earlier admin-only status, create/replace-key and ad-hoc configuration endpoints under `/api/modsets/{id}/sync-access` and `/api/modsets/{id}/sync-configuration` remain available for compatibility. They cannot bypass the administrator requirement.

Invalid/missing/disabled export keys return 401, unavailable creator permissions return 403, and rate limits return 429 with `Retry-After: 60`. Duplicate creation or unavailable configuration/key returns 409; invalid settings return 422. Limits remain 600 authenticated exports per minute per modset and 120 invalid attempts per minute per connecting IP, with bounded process-local counters. Reverse-proxy addresses can be shared; separate backend processes have separate counters.

Run backend tests, including isolated PostgreSQL cases, and frontend tests/build as described in [development](development.md). `npm run test:sync:browser` checks staged creation, failed-save recovery, reloads, persisted edits, repeat downloads, disable/replace and administrator guards in both themes at desktop/mobile widths. Browser API calls are mocked and do not modify live data.
