# Unreleased changes after 0.2.7

These notes cover the changes on `main` after 0.2.7 and sync access on `feature/modset-sync-access`. They are not included in the published `v0.2.7` images. Deployment examples remain pinned to 0.2.7. Use a [source build](development.md) to review this work; no newer release tag is implied.

## Estimated modset size

Overview displays **Estimated size** from Workshop metadata for mods with an installed version. Local mods, inherited parent mods and dependencies are included once per mod ID. Uninstalled entries are excluded. Missing or invalid sizes are identified as unknown; mixed data produces a partial total, entirely unknown installed data displays **Unknown**, and no installed mods displays **0 B**.

Explicit decimal and binary units are accepted; totals use decimal units. This estimate is not measured disk usage and does not resolve the size of a particular installed version. Hovering over or focusing the card explains the limitation; Escape dismisses the hint.

Workshop extraction now reads structured **Version size**, **File size** or **Size** fields rather than matching description prose. Successful metadata refreshes repair invalid stored sizes. A missing or invalid incoming size preserves an already valid cached size; failed fetches leave stored metadata unchanged.

## Navigation and presentation

- Up/Down on a focused mod row opens the adjacent entry in the currently displayed filtered/sorted list, stopping at the ends. The selected row scrolls into view.
- The mod browser's **Back to overview** action uses a home icon.
- The size explanation appears on hover/focus instead of remaining permanently visible.
- Active and parent badges in modset management use styling consistent with webhook scope badges.

## Sync access

Administrators manage a central **Administration → Sync access** overview with search, status filters and last-use information. Only administrators can issue one export-only key per modset and generate `armm-sync.json`, including a configurable export path and optional game server connection hints. Parent/child permissions are checked on every export. See [setup, import format and API](sync-access.md). This feature adds migration `005_modset_sync_access`.

## Compatibility and verification

No new services or required environment variables are introduced. The size/navigation changes need no migration; sync access adds the credential table through migration `005_modset_sync_access`. Group permissions, parent/child rules, export contents and scheduled-only Discord update alerts retain their existing behavior.

Regression coverage includes size parsing/aggregation, structured Workshop extraction and metadata persistence, plus browser checks for the size hint and keyboard navigation. See [development checks](development.md); browser checks run separately from the standard CI tests/build.
