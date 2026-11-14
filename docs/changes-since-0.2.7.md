# Changes since 0.2.7

These changes shipped in **0.2.8** compared with `v0.2.7`. Deployment examples select `0.2.8`. See the [release notes](releases/0.2.8.md) and [upgrade guide](upgrading.md).

## Estimated modset size

Overview displays **Estimated size** from Workshop metadata for mods with an installed version. Local mods, inherited parent mods and dependencies are included once per mod ID. Uninstalled entries are excluded. Missing or invalid sizes are identified as unknown; mixed data produces a partial total, entirely unknown installed data displays **Unknown**, and no installed mods displays **0 B**.

Explicit decimal and binary units are accepted; totals use decimal units. This estimate is not measured disk usage and does not resolve the size of a particular installed version. Hovering over or focusing the card explains the limitation; Escape dismisses the hint.

Workshop extraction now reads structured **Version size**, **File size** or **Size** fields rather than matching description prose. Successful metadata refreshes repair invalid stored sizes. A missing or invalid incoming size preserves an already valid cached size; failed fetches leave stored metadata unchanged.

## Navigation and presentation

- Up/Down on a focused mod row opens the adjacent entry in the currently displayed filtered/sorted list, stopping at the ends. The selected row scrolls into view.
- The mod browser's **Back to overview** action uses a home icon.
- The size explanation appears on hover/focus instead of remaining permanently visible.
- Modset row actions (Edit, Export, Duplicate and Delete) share one additional-actions menu; its button has distinct normal/hover states in active rows.
- Active and parent badges in modset management use styling consistent with webhook scope badges.

## Sync access

Administrators use **Administration → Sync access → Create sync access** to configure a modset through a wizard. Only existing accesses are listed as editable rows, with direct configuration downloads, status filters and last-use information. Connection settings and encrypted keys are saved for repeat downloads. One export-only key is allowed per modset; `armm-sync.json` includes a server-generated export path and optional game server hints. Parent/child permissions are checked on every export. See [setup, import format and API](sync-access.md). This feature adds migrations `005_modset_sync_access` and `006_sync_configuration`.

## Compatibility and verification

No new services or required environment variables are introduced. The size/navigation changes need no migration; sync access adds the credential table through migrations `005_modset_sync_access` and `006_sync_configuration`. Group permissions, parent/child rules, export contents and scheduled-only Discord update alerts retain their existing behavior.

Regression coverage includes size parsing/aggregation, structured Workshop extraction and metadata persistence, plus browser checks for the size hint and keyboard navigation. See [development checks](development.md); browser checks run separately from the standard CI tests/build.
