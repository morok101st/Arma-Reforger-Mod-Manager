# Desktop sync access (unreleased)

This feature is available in the current source branch, not in the published 0.2.7 images. It adds migration `005_modset_sync_access` and no required environment variables. Startup creates one new credential table without changing existing modsets. Back up the development/deployment database and matching configuration before upgrading.

## Create a release

Open **Modsets → Edit → Sync access** as the owner or an administrator. Create a key, set the configuration name and public HTTPS origin, and download **armm-sync.json**. These actions apply immediately, independently of the dialog's Save button. Anyone holding the key or file can read the selected modset's export without an ARMM login.

There is one active key per modset. Replacing it immediately invalidates all previous configurations. Disabling access also stops existing configurations. Duplicate modsets do not inherit sync credentials. The key is returned only when created/replaced; ARMM stores its SHA-256 hash. To download another configuration later, enter the existing key or explicitly replace it. No raw key is stored in browser local storage.

Optional game server details are used for the download only. `passwordRequired` tells the desktop app to ask for a game server password; no game server password is accepted or stored by ARMM.

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

`baseUrl` is the public HTTPS origin, optionally with a port, without credentials, path, query or fragment. `exportPath` is a server-generated relative path beginning with `/`. The desktop app must use the imported path rather than constructing a fixed endpoint from the modset ID. A future path change can then be handled by importing a new configuration, provided authentication and the response contract remain compatible. The optional `gameServer` block is omitted when not requested.

To retrieve the mod list, join `baseUrl` and `exportPath` on the same origin and send:

```http
GET /api/sync/modsets/42/export
Authorization: Bearer armm_sync_EXAMPLE_ONLY
```

The response is the existing ordered export array:

```json
[
  { "modId": "MOD_ID", "name": "Mod Name", "version": "1.2.3" }
]
```

Only entries with installed versions are included. No update checks, writes or Discord notifications are triggered. The key grants no access to browser sessions, management routes, other modsets or the parent export. Keys in query strings are not supported. Responses are marked `Cache-Control: no-store`.

## Parent/child permissions

A child release intentionally includes inherited parent mods with binding installed versions and the resolved child export order. Every request verifies that the release creator still exists, is active, retains owner/administrator management rights to the child, and can read the parent. Losing any required permission blocks export. Restoring those permissions makes an otherwise active release usable again.

Changing, attaching or detaching the parent disables the release permanently until a key is explicitly created again. Normal parent mod/version/order changes appear in subsequent exports. Owners and administrators can replace a release under their own authority; the new creator becomes the authority checked on future requests.

## Endpoints and failure handling

| Endpoint | Authentication | Purpose |
| --- | --- | --- |
| `GET /api/modsets/{id}/sync-access` | Owner/admin session | Status, creation/last-use dates, suggested public URL; never returns the key |
| `POST /api/modsets/{id}/sync-access` | Owner/admin session | Create or replace the sole key; returns it once |
| `DELETE /api/modsets/{id}/sync-access` | Owner/admin session | Disable the key |
| `POST /api/modsets/{id}/sync-configuration` | Owner/admin session | Validate current key and generate the import file |
| `GET /api/sync/modsets/{id}/export` | Scoped bearer key | Export installed mods only |

Configuration generation accepts `name`, `baseUrl`, `accessKey` and optional `gameServer`. It generates `format`, `formatVersion`, `modsetId` and `exportPath`; clients cannot override the exported endpoint.

Invalid/missing/disabled keys return 401, unavailable creator permissions return 403, and rate limits return 429 with `Retry-After: 60`. Configuration generation returns 409 for a non-current or unusable key and 422 for invalid fields. Limits are 600 authenticated exports per minute per modset and 120 invalid attempts per minute per connecting IP. Limits are bounded in-memory counters per backend process; reverse-proxy connection addresses may be shared. Additional processes have separate counters.

Management actions are audited without raw keys or configuration contents. Protect imported files and avoid logging Authorization headers in the desktop app or reverse proxy. API path flexibility does not make the key specific to the original desktop executable: anyone possessing it can fetch the scoped export.

## Verification

Run backend tests, including isolated PostgreSQL cases, and frontend tests/build as described in [development](development.md). The mocked UI regression is `ARMM_TEST_URL=http://localhost:5173 npm run test:sync:browser`; it covers loading recovery, create/replace/disable, import contents and both themes at desktop/mobile widths. These browser checks do not access live application data.
