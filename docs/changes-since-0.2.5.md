# Changes since 0.2.5

This is a comparison of release `v0.2.5` (`68ee633`) with current `main`, not a new release announcement. The example GHCR deployment still selects `0.2.5`; it does not yet contain the changes below. No new tag or release is created by this documentation update.

## Interface redesign

- Neutral dark surfaces and gold accents, shared typography, selection states, dropdowns and keyboard focus; existing light mode remains available.
- Global Workspace/Modsets/Administration navigation, a separate account menu and active-modset toolbar. The desktop mod browser becomes a focus-contained drawer on mobile.
- A single installed/latest version comparison in mod details, Workshop ID copy, clearer actions and dependency navigation.
- Full-width modset management with search, ownership/access filters, a combined name/group-permission editor, and additional actions for duplication/deletion.
- Separate Users, Groups, Discord and Audit log administration sections. Personal account settings are independent.
- Native modal focus containment, Escape/focus return, keyboard-operated themed selects, mobile field sizing and retained form drafts after errors.

## Smaller behavior changes

| Change | User-visible result | Compatibility |
| --- | --- | --- |
| Resource loading and recovery | Loading, empty data and errors have different states; Retry repeats the failed read. Cached data survives background errors. | No schema migration. |
| Version-health semantics | No latest version has its own category. No installed version is neutral and excluded from Needs attention. | Existing API status values remain. |
| Atomic user editor | Role, account status, memberships and optional password save together; failed updates roll back together. | `PATCH /users/{id}` gains optional `group_ids`; old separate routes remain. No schema migration. |
| URL navigation | View, administration section, modset and explicit mod survive copied links, reload and Back/Forward. Local/OIDC login retain the intended destination. | Existing Discord query links remain valid; permissions are still checked. |
| Persistent individual manual checks | Reload/other tabs discover active jobs; duplicate requests join the active job in the same modset. Failure/interruption permits retry. | Additive job table/migration and async API; existing synchronous response retained. |

Group sharing already shipped in **0.2.5**. Its removal of global `shared` access is a 0.2.4 → 0.2.5 migration concern, not a new change introduced by the redesign. Scheduled checks and their Discord notification rules remain unchanged.

See [user guide](user-guide.md), [API](api.md), [upgrade overview](upgrading.md) and [current screenshots](screenshots.md).
