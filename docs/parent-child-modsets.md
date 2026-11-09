# Parent/Child modsets

Available in **0.2.7**. Existing modsets remain independent after upgrading. See the [upgrade guide](upgrading.md) before deploying.

## Using a common foundation

Maintain common mods and their installed versions in a normal modset. Select it as **Parent modset** when creating another modset, or in **Modsets → Edit** for an existing one. One parent and one inheritance level are supported. A modset used as a parent cannot itself inherit.

A child modset contains all parent mods plus its own additional mods. Inherited installed versions, including **No installed version**, are binding. Edit them in the parent. Child writers can check metadata, add/edit local mods and arrange export positions, but cannot remove inherited entries or override their versions or flags. The per-mod `core` flag remains separate from inheritance.

Inherited entries identify their source in the browser, detail and export-order editor. The detail links to the parent. Latest Workshop metadata remains global; a refresh does not change the installed version.

## Mod browser

**Child mods first** is enabled by default for child modsets. The browser lists local mods before inherited parent mods; the selected **Sort by** mode (Updates first, Name, Status, Last checked or Export order) applies within each group. Turn off the checkbox to restore global sorting. Search and status filters still apply to both groups. This browser preference does not change the exported sequence.

## Export order

Child modsets support two export-order modes:

- **Follow parent order and insert local mods** (`parent`): default for new child modsets. The parent determines the relative order of inherited mods. Move your own mods between them using top/up/down/bottom controls. Positions are displayed as read-only ranks; inherited mods cannot be moved.
- **Independent order** (`independent`): the previous behavior. Every position stays local, including inherited mods, with all movement controls available. Existing modsets retain this mode during migration.

In following mode, a local insertion records the parent mod before which it belongs and the remaining parent IDs at that moment as fallback anchors. Moving a parent mod moves its preceding local insertions with it. New parent mods appear at their parent positions. If an anchor disappears, local mods stay before the first surviving fallback; if none remain, they go to the end. Local order within each insertion group is retained. The export editor can also place all local mods at the end.

Change modes through **Modsets → Edit → Export order**. A read-only preview and explicit confirmation precede the change. Switching to independent order freezes the currently effective order. Switching to following order keeps local mods before their next inherited entry while restoring authoritative parent order. Parent changes are also reloaded on tab focus and through the periodic access refresh.

The API export and the displayed editor use the same resolved order. Exports contain each ID once and omit mods without installed versions. Existing orders, including name/ID tie-breaking for equal legacy values, are preserved. Every editor displays consecutive positions and saves a complete list of mod IDs. Manual numeric fields and reset-to-500 controls have been removed. No database rewrite is needed; numeric storage remains internal for backwards compatibility.

## Changes and conflicts

- Parent version changes apply immediately to child reads and exports.
- New parent mods appear in all child modsets. If the same ID already exists locally, its version becomes binding from the parent; the old local version is replaced. Independent mode retains its local position; following mode uses its authoritative parent position.
- Linking an existing modset previews overlapping mods and requires confirmation before replacing their local entries. The backend checks conflicts again.
- Removing a parent mod removes it from child modsets. The detail/delete dialog shows the affected count. Removal and deactivation are blocked when an installed mod in a child modset requires that parent mod.
- Parents with existing children cannot be deleted.

To become independent, choose **Detach — keep current mods and versions** and confirm. Current effective content, versions, flags and positions become local entries. Future parent changes no longer apply. Detach before switching to another parent.

**Duplicate** creates a private, independent snapshot of effective content and order, without group grants or webhook scope membership.

## Access, activity and checks

Selecting a parent and using a child workspace both require read access to the parent. Sharing a child does not grant parent access. Grant parent read rights separately. Revoking them blocks the child workspace with an explicit error; restore the rights or ask an administrator to detach it. Its directory entry masks the inaccessible parent name and inherited count. Only owners/administrators can link or detach; administrators retain recovery access.

Parent mod activity appears in the child activity feed. Link/detach changes are recorded in the audit log. Manual jobs, bulk checks and dependency handling include inherited mods. Scheduled checks fetch each global mod once and evaluate notifications per affected modset, retaining webhook scopes and delivery deduplication. Manual checks never send update notifications.

## API

Paths below are prefixed with `/api` behind Nginx.

- `POST /modsets`: optional `parent_modset_id` (positive integer or null).
- `PATCH /modsets/{id}`: optional `parent_modset_id`; omit to retain, null to detach. `confirm_parent_conflicts: true` permits replacing overlaps when linking. The existing required `name` remains.
- Modset responses add `parent_modset_id`, `parent_modset_name`, `child_modsets_count` and `order_mode`.
- Mod responses expose `parent_modset_id`, `parent_modset_name`, `child_modsets_count` and `order_mode`.
- `PUT /modsets/{id}/export-order` accepts `{ "mod_ids": ["FIRST_ID", "SECOND_ID"] }` with the complete currently exported set in the desired order. Duplicate IDs return 400; incomplete/stale sets return 409. Following mode also rejects reordered parent entries with 409. The UI uses this sequence endpoint in every mode.
- Legacy numeric `PATCH /modsets/{id}/load-order` and per-mod `load_order` patches remain compatible with their existing independent/following-mode rules. They are no longer used by the UI. Mod responses retain `load_order` and additionally expose `export_position` (1-based, null for uninstalled entries), exactly matching the export.
- Changing inherited versions/flags, re-adding inherited IDs or deleting them returns 409.

- `order_mode` accepts `parent` or `independent` on create/update. New child modsets default to `parent`; standalone sets use `independent`. Mode changes require `confirm_order_change: true` and owner/admin rights.
- `GET /modsets/{id}/order-preview?mode=parent|independent&parent_modset_id=ID` previews the proposed export without saving. It requires owner/admin rights and parent read access. The optional parent ID supports previewing a new link.

## Migration and validation

Migration `003_base_modsets` adds nullable `modsets.base_modset_id` and `modset_export_orders`. Migration `004_base_export_order` adds `modsets.export_order_mode` (default `independent`) and nullable JSON `modset_export_orders.before_mod_ids`. Existing links, numeric positions and data remain unchanged. Both migrations are additive and retryable. SQLite and PostgreSQL are supported. Back up the database and matching configuration before deployment. Validate upgrades against a separate database and volumes.

Backend tests cover binding versions, independent ordering, conflicts, detach, access revocation, dependencies, jobs, notification scopes and interrupted migrations. Browser checks use mocked APIs only:

```sh
npm run test:parent:browser
```

`ARMM_TEST_URL` defaults to `http://127.0.0.1:4178`. Optional `ARMM_TEST_CHROMIUM` selects an installed Chromium binary; `ARMM_TEST_SCREENSHOTS` saves desktop/mobile captures. Run the existing navigation suite with `npm run test:browser`.

## Terminology and API compatibility

The interface and current API use **Parent** and **Child**. New clients should send `parent_modset_id`, `confirm_parent_conflicts` and `order_mode` (`parent` or `independent`). Responses expose `parent_modset_id`, `parent_modset_name`, `child_modsets_count` and `order_mode`.

Earlier development inputs remain accepted: `base_modset_id`, `confirm_base_conflicts`, `export_order_mode` (`base`/`independent`) and the preview query `base_modset_id` with `mode=base`. Old response fields remain present for compatibility. Conflicting old/new aliases are rejected with 422. `inherited_from_modset_id` and `inherited_from_modset_name` remain legacy aliases for the new mod-level parent fields.

This terminology change does not rename user-created modsets or physical database columns. Existing migration IDs, the internal `base_modset_id` column and stored `base` mode remain unchanged. No additional database migration is required.
