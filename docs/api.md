# API and automation

This page describes **0.2.7**, including the new routes/fields added after 0.2.5; see [release scope](changes-since-0.2.5.md). The authenticated OpenAPI schema at `/api/openapi.json` is the exhaustive route and payload reference for the deployed build.

## Authentication and permissions

The frontend proxies `/api/...`; `/api` redirects to authenticated `/api/docs`. Health and login/configuration/OIDC entry/callback flows are reachable without an existing session. Management routes require the signed HttpOnly `armm_session` cookie, not a bearer token. Production cookies require HTTPS. Origin validation applies to unsafe methods; a supplied Origin must match the deployment allowlist.

An illustrative login request (replace the example credentials; protect your cookie file):

```bash
curl --fail-with-body --cookie-jar cookies.txt   --header 'Content-Type: application/json'   --data '{"username":"service-account","password":"replace-with-real-password"}'   https://armm.example.com/api/auth/login

curl --fail-with-body --cookie cookies.txt   'https://armm.example.com/api/mods?modset_id=42'
```

Use explicit `modset_id` for automation so another tab cannot change the intended context. Read/export/job-status requires read access; mod edits and refresh requests require write access; source-modset deletion and grant management require owner/admin access. Inaccessible modsets return 404; read-only writes return 403; invalid/disabled sessions return 401. A service account is an ordinary account with group grants, not a special API-token identity.

## Individual manual checks

```text
POST /api/mods/{mod_id}/refresh-job?modset_id=42
GET  /api/refresh-jobs?modset_id=42
```

The asynchronous POST returns 202 and the new or existing active job. Poll GET, match `mod_id`/`attempt`, and wait for `succeeded` or `failed`; then reread mod data as needed. Do not repeatedly POST to poll: a POST after a terminal state starts another attempt. Jobs are scoped by mod and modset. Failed/interrupted jobs permit a later explicit retry. Status includes timestamps and a retryable error, not raw provider exceptions.

`POST /api/mods/{mod_id}/refresh?modset_id=42` retains the synchronous 0.2.5 `ModRead` response and joins the same active job. Proxy/client timeouts may still affect this route; disconnecting does not cancel accepted work. The failure status stays 502 with a generic retryable message.

`POST /api/refresh?modset_id=42` is a separate synchronous bulk check of the authorized modset. Bulk/scheduled checks and metadata work after edits do not use the individual manual-job deduplication path. No manual check sends Discord update alerts. See [job lifecycle and upgrade](manual-refresh-upgrade.md).

## User administration

Administrator `PATCH /api/users/{user_id}` accepts optional changed fields:

```json
{
  "role": "user",
  "is_active": true,
  "group_ids": [2, 3],
  "password": "replace-with-real-password"
}
```

Role, status, memberships, password and the success audit entry commit together; failure rolls them back. Omitted fields stay unchanged. An empty `group_ids` array removes memberships; null, duplicate or unknown IDs are rejected. Passwords require 12–256 characters. Password/role/status changes invalidate sessions as applicable; membership-only changes are enforced on subsequent requests without a password reset.

Existing `PUT /api/admin/users/{user_id}/groups` and `PATCH /api/users/{user_id}/password` remain available. Group management is under `/api/admin/groups`; signed-in `/api/groups` exposes names and IDs. Owners/admins manage `/api/modsets/{modset_id}/group-permissions`.

## Export and pagination

Export uses `GET /api/modsets/{modset_id}/export`. Entries are `{modId, name, version}` and include only installed versions. save a complete order with `PUT /api/modsets/{modset_id}/export-order` and `{ "mod_ids": ["FIRST_ID", "SECOND_ID"] }`. `export_position` in mod responses is the 1-based final position (null for uninstalled entries). Incomplete or stale lists return 409, duplicate IDs return 400, and following mode forbids changing relative parent order. See [parent/child modsets](parent-child-modsets.md) for permission and inheritance rules. Existing numeric `PATCH /api/modsets/{modset_id}/load-order` and per-mod `load_order` calls remain compatible.

Modset activity and administrator audit reads support `limit`/`offset`. Audit category filters in the UI are client-side. Browser navigation uses `modset`, while the API uses `modset_id`; see [URL examples](user-guide.md#links-keyboard-access-and-recovery).
