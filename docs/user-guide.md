# User guide

This guide describes **0.2.7** and explicitly marked [unreleased source changes](unreleased.md). Screenshots use fictional data and retain their documented [capture scope](screenshots.md).

## Workspace and version health

Select **Workspace**, then choose the **Active modset**. The toolbar owns **Export JSON** and **Add mod**. On desktop the left browser contains search, the **Show filters** control, **Back to overview** and tracked mods. On smaller screens, use **Open mod list** to open the drawer; selecting a mod, Escape, the close button or the backdrop closes it.

The Overview shows counts, the automatic schedule, Version health, Needs attention and Recently checked. Select a Version health category to filter the mod browser; this clears search and opens the mobile browser when needed.

| Display label | API status | Meaning |
| --- | --- | --- |
| Up to date | `UP_TO_DATE` | The installed version is equal to or newer than the known latest version. |
| Update available | `UPDATE_AVAILABLE` | The known latest version is newer than the installed version. |
| No installed version | `NOT_INSTALLED` | Intentionally tracked without an installed target version; excluded from export and Needs attention. |
| No latest version | `UNKNOWN` | An installed version exists but no latest version is available for comparison. |

Versions are normalized (including a leading v), compared as parsed versions where possible, and otherwise compared by natural numeric/text segments. Needs attention lists available updates first, then missing latest versions. It does not turn intentionally uninstalled mods into warnings.

## Estimated modset size (unreleased)

The current source shows **Estimated size** in Overview. It sums Workshop sizes for mods with an installed version, including inherited mods and dependencies, counting each mod ID once. Mods with **No installed version** are excluded.

Sizes require an explicit supported unit (B, KB/MB/GB/TB or KiB/MiB/GiB/TiB). Missing or invalid sizes remain unknown. A partial total shows the number of unknown sizes; if all installed mods have unknown sizes, the value is **Unknown**. An empty installed set displays **0 B**. Totals use decimal units.

This is Workshop metadata, not measured disk usage or a size lookup for the selected installed version. Hover over or focus the card for this explanation; Escape dismisses the hint. Corrected extraction applies during metadata refreshes, without a database migration.

## Inspect and update a mod

Open a mod from the browser or overview. The detail page shows its name, copyable Workshop ID, metadata and installed/latest version comparison. **Workshop** opens its source page. **Check updates** starts a manual reliable check using the configured metadata provider.

With write access, choose an installed version from known versions and save it, or select **Set to latest**. **Copy JSON** copies one `{modId, name, version}` entry when an installed version exists; it does not mark a mod installed. Workshop ID copy copies only the raw ID. Dependencies and **Required by** remain visible; tracked dependencies can be opened directly.

A running individual manual check remains visible after reload and in another tab. Its action is disabled while queued/running. Completed jobs refresh the displayed mod data; failed/interrupted jobs allow another check. Status read failures reconnect automatically. Individual checks are deduplicated per mod and modset; bulk/scheduled checks and metadata work after edits keep their separate paths. Manual checks never send Discord update alerts. See [job behavior](manual-refresh-upgrade.md).

Deleting an active dependency may be blocked. Removing or deactivating a parent can offer a follow-up choice to set newly orphaned dependency-origin mods to No installed version. Dependencies remain identifiable even after manual editing.

Child modsets show **Child mods first** below search. It is enabled by default: own mods come before inherited parent mods, with **Sort by** applied within each group. Disable it for global sorting. Export order is unaffected.

## Export order and activity

Open **Overview → Export order** and move entries top/up/down/bottom. Positions **1, 2, 3…** show the final export sequence; changes save automatically. Existing orders are preserved, including previous name/ID tie-breaks. Only mods with installed versions are exported. Browser sorting does not alter export order. Child modsets can follow the parent order and insert local mods, or keep an independent order; see [parent/child modsets](parent-child-modsets.md).

The overview **Changelog** records changes in this modset, such as add/remove/version edits, and supports paging. It is separate from a mod's version changelog and the administrator's central audit log. Both overview sections start collapsed.

## Modsets and group access

Open **Modsets** to search by name/owner or filter owned/group-access modsets. Select a name to open its workspace. **Edit** combines the name with group grants; **Export** downloads JSON. **More actions** contains duplication and deletion.

Modsets start private. Administrators manage group membership; owners and administrators grant groups **Read** or **Write**. The strongest applicable grant wins.

| Operation | Reader | Writer | Owner / administrator |
| --- | --- | --- | --- |
| View, export, copy JSON, inspect refresh status | Yes | Yes | Yes |
| Duplicate into a private copy owned by the caller | Yes | Yes | Yes |
| Edit mods, versions, order/name, start checks | No | Yes | Yes |
| Manage group grants or delete source modset | No | No | Yes |

Administrators have emergency access without becoming owners. Copies receive ` (copy)`, retain tracked entries, and start without group grants or inherited webhook scopes. Non-empty modsets can be deleted after confirmation; the last remaining modset is protected. The historical global Shared flag no longer grants access. See [group migration](group-sharing-upgrade.md) for installations older than 0.2.5.

## Sync access (unreleased)

Administrators open **Administration → Sync access → Create sync access** and follow a wizard to select the modset, name and connection details. Only configured accesses appear as rows with **Edit**, **Download** and **Disable** actions. Settings persist for later edits; repeated downloads reuse the current key. One access is allowed per modset. The file includes the current `exportPath`; the desktop app uses it directly. Optional game server hints include `passwordRequired`, never a password. Parent/child rights are checked on every export. Existing entries may require **Finish setup** to save their settings and restore a recoverable key. See [setup, permissions and key replacement](sync-access.md).

## Administration and account settings

Administrators open **Administration** and choose **Users**, **Groups**, **Discord**, **Sync access** (unreleased) or **Audit log**. Users and groups have local search. In the user editor, changed role, enabled state, memberships and an optional password save in one transaction. Failure keeps the draft for correction; it does not leave half-applied account changes. A password/role/status change invalidates existing sessions as applicable; membership changes are enforced on subsequent requests.

Use **Groups** to manage members, and **Discord** to select webhook modset scopes. Empty scope on creation defaults to all current modsets; a future private copy is not added automatically. Update alerts remain limited to scheduled runs at 10:00 and 19:00 in the configured timezone; the explicit webhook test action sends a test message.

The account menu contains theme switching, **Account settings** and **Sign out**. Regular users see **Settings** rather than administrator tools. OIDC sign-out clears the ARMM cookie only; it does not end the provider session.

## Links, keyboard access and recovery

Examples for a deployment at `https://armm.example.com`:

```text
/?modset=42
/?modset=42&mod=MOD_ID
/?view=modsets&modset=42
/?view=admin&section=groups&modset=42
/?view=account&modset=42
```

Administration sections are `users`, `groups`, `discord`, `sync`, `audit`. Browser URLs use `modset`; API requests use `modset_id`. Copy the address bar to share a view. Opening a link does not grant access or change the stored default modset. Missing/inaccessible targets show recovery controls rather than silently opening a different mod. Search, browser sorting/filtering and unsaved drafts are not encoded in the URL.

In the current source (unreleased), focus a mod row and use Up/Down to open the adjacent mod in the displayed filtered and sorted list. Navigation stops at either end. The selected row scrolls into view. **Back to overview** uses a home icon.

Tab moves between controls. Selects support Arrow keys, Home/End, typeahead, Enter, Tab and Escape. Modal dialogs contain focus, close with Escape and return focus to their opener. The mobile drawer follows the same focus behavior. A Skip to content link is available to keyboard users.

Failed list reads show an error and **Retry**, retaining cached data when available. Retry repeats the read, not the previous successful write. Form failures retain entered values. If a job status cannot be read, the UI reconnects automatically rather than launching another check. Use the [troubleshooting wiki](https://github.com/morok101st/Arma-Reforger-Mod-Manager/wiki/Troubleshooting) for proxy, backend and provider problems.
