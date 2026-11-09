import type { LoadState } from "../hooks/useLoadState";
import { ResourceStatus } from "./ResourceStatus";
import type { GroupPermission } from "../types";
import React from "react";
import { Copy, Download, Layers3, MoreHorizontal, Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";

import type { GroupSummary, Modset } from "../types";
import type { createApiClient } from "../lib/api";
import { ModsetEditDialog } from "./ModsetEditDialog";
import { CustomSelect, Dialog } from "./common";

export function ModsetManagement({
  loadState,
  groupsLoad,
  api,
  groups,
  onAccessChanged,
  modsets,
  activeModsetId,
  loading,
  error,
  createModset,
  updateModset,
  duplicateModset,
  deleteModset,
  activateModset,
  exportModset,
}: {
  loadState: LoadState;
  groupsLoad: LoadState;
  api: ReturnType<typeof createApiClient>;
  groups: GroupSummary[];
  onAccessChanged: () => Promise<unknown>;
  modsets: Modset[];
  activeModsetId: number | null;
  loading: boolean;
  error: string | null;
  createModset: (name: string, parentModsetId?: number | null, orderMode?: "parent" | "independent") => Promise<void>;
  updateModset: (modsetId: number, name: string, permissions?: GroupPermission[], parentModsetId?: number | null, confirmParentConflicts?: boolean, orderMode?: "parent" | "independent", confirmOrderChange?: boolean) => Promise<void>;
  duplicateModset: (modsetId: number) => Promise<void>;
  deleteModset: (modsetId: number) => Promise<void>;
  activateModset: (modsetId: number) => Promise<void>;
  exportModset: (modsetId: number, modsetName: string) => Promise<void>;
}) {
  const [search, setSearch] = React.useState("");
  const [scope, setScope] = React.useState("all");
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [newName, setNewName] = React.useState("");
  const [parentId, setParentId] = React.useState("");
  const [orderMode, setOrderMode] = React.useState<"parent" | "independent">("parent");
  const [showCreateDialog, setShowCreateDialog] = React.useState(false);
  const [editModsetId, setEditModsetId] = React.useState<number | null>(null);
  const [deleteModsetId, setDeleteModsetId] = React.useState<number | null>(null);

  const editModset = modsets.find((modset) => modset.id === editModsetId) ?? null;
  const deleteModsetTarget = modsets.find((modset) => modset.id === deleteModsetId) ?? null;

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setCreateError(null);
    try { await createModset(name, parentId ? Number(parentId) : null, orderMode); closeCreateDialog(); }
    catch (error) { setCreateError(error instanceof Error ? error.message : "Could not create modset. Try again."); }
  }

  function openEditDialog(modset: Modset) {
    setEditModsetId(modset.id);
  }

  function openCreateDialog() {
    setParentId("");
    setOrderMode("parent");
    setNewName("");
    setCreateError(null);
    setShowCreateDialog(true);
  }

  function closeCreateDialog() {
    setShowCreateDialog(false);
    setNewName("");
  }

  function closeEditDialog() {
    setEditModsetId(null);
  }

  function matches(modset: Modset) {
    const query = search.trim().toLocaleLowerCase();
    return (!query || `${modset.name} ${modset.owner_username ?? ""}`.toLocaleLowerCase().includes(query))
      && (scope !== "mine" || modset.is_owner) && (scope !== "groups" || modset.has_group_access);
  }

  return (
    <>
      <header className="modsets-heading">
        <div><h2>Modsets</h2><p className="muted">Open a workspace, export your server configuration or manage group access.</p></div>
        <button className="primary-button compact" onClick={openCreateDialog} disabled={loading || !loadState.loaded || Boolean(loadState.error)} type="button"><Plus size={18} /> Create modset</button>
      </header>
      {error && <p className="error-box" role="alert">{error}</p>}
      <ResourceStatus state={loadState} label="modsets" />
      {loadState.loaded && !loadState.error && <>
      <div className="modsets-filters">
        <label>Search modsets<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Name or owner" /></label>
        <label>Show<CustomSelect value={scope} onChange={setScope} ariaLabel="Filter modsets" options={[{value:"all",label:"All modsets"},{value:"mine",label:"Owned by me"},{value:"groups",label:"With group access"}]} /></label>
        <span className="muted" role="status">{modsets.filter(matches).length} of {modsets.length} modsets</span>
      </div>
      {modsets.length === 0 ? <div className="modsets-empty"><Layers3 size={28} /><h3>No accessible modsets</h3><p className="muted">Create a modset or ask its owner for group access.</p></div> : <table className="modsets-table" aria-label="Modsets">
        <thead><tr><th scope="col">Modset</th><th scope="col">Owner</th><th scope="col">Access</th><th scope="col">Mods</th><th scope="col">Actions</th></tr></thead>
        <tbody>{modsets.filter(matches).map(modset => <tr key={modset.id} className={modset.id === activeModsetId ? "current" : undefined}>
          <td className="modset-name-cell"><button className="modset-open" type="button" disabled={loading} onClick={() => activateModset(modset.id).catch(() => null)} aria-label={`Open modset ${modset.name}`}>{modset.name}</button>
            {modset.parent_modset_id && <small>Parent: {modset.parent_modset_name ?? "Access required"}</small>}
            {Boolean(modset.child_modsets_count) && <small>Parent of {modset.child_modsets_count} child modset(s)</small>}
            {modset.id === activeModsetId && <span className="modset-current">Active</span>}
          </td>
          <td><span className="mobile-cell-label">Owner</span>{modset.is_owner ? "You" : modset.owner_username ?? "Unknown"}</td>
          <td><span className="mobile-cell-label">Access</span><span>{modset.has_group_access ? "Group access" : "Private"}</span><small>{modset.can_edit ? "Can edit" : "Read only"}</small></td>
          <td className="modset-count"><span className="mobile-cell-label">Mods</span>{modset.tracked_mods_count}</td>
          <td><div className="modset-actions">
            <button className="secondary-button compact" type="button" disabled={loading || !modset.can_edit} onClick={() => openEditDialog(modset)}><Pencil size={16} /> Edit</button>
            <button className="secondary-button compact" type="button" disabled={loading} onClick={() => exportModset(modset.id, modset.name).catch(() => null)}><Download size={16} /> Export</button>
            <details className="modset-more" onClick={event => { if ((event.target as HTMLElement).closest("button")) event.currentTarget.open = false; }} onKeyDown={event => { if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}>
              <summary aria-label={`More actions for ${modset.name}`} title="More actions"><MoreHorizontal size={18} /><span className="modset-more-label">More actions</span></summary>
              <div>
                <button type="button" disabled={loading} onClick={() => duplicateModset(modset.id).catch(() => null)}><Copy size={16} /> Duplicate</button>
                <button className="modset-delete-action" type="button" disabled={loading || !modset.can_delete || Boolean(modset.child_modsets_count) || modsets.length <= 1} title={modset.child_modsets_count ? "Detach child modsets before deleting their parent." : modsets.length <= 1 ? "The last modset cannot be deleted." : undefined} onClick={() => setDeleteModsetId(modset.id)}><Trash2 size={16} /> Delete</button>
              </div>
            </details>
          </div></td>
        </tr>)}</tbody>
      </table>}
      {modsets.length > 0 && modsets.filter(matches).length === 0 && <div className="modsets-empty"><h3>No matching modsets</h3><p className="muted">Try a different name, owner or filter.</p><button className="secondary-button compact" type="button" onClick={() => { setSearch(""); setScope("all"); }}>Clear filters</button></div>}

      </>}
      {showCreateDialog && (
        <Dialog title="Create modset" onClose={closeCreateDialog}>
          <form className="dialog-form parent-modset-form" onSubmit={handleCreate}>
            <ResourceStatus state={loadState} label="modsets" />
            <label>
              Name
              <input autoFocus maxLength={120} disabled={loading} value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Server A" />
            </label>
            <label>Parent modset<CustomSelect value={parentId} onChange={setParentId} disabled={loading} ariaLabel="Parent modset" options={[{value:"", label:"None — independent modset"}, ...modsets.filter(set => !set.parent_modset_id).map(set => ({value:String(set.id), label:set.name}))]} /></label>
            {parentId && <label>Export order<CustomSelect<"parent" | "independent"> value={orderMode} onChange={setOrderMode} disabled={loading} ariaLabel="Export order mode" options={[{value:"parent",label:"Follow parent order and insert local mods"},{value:"independent",label:"Independent order"}]} /></label>}
            <p className="muted">Installed versions stay linked, including future parent additions. Local mods of the same ID adopt the parent version. Choose whether to follow the parent order or manage it independently. Users also need parent read access.</p>
            {createError && <p className="error-box" role="alert">{createError}</p>}
            <div className="dialog-actions">
              <button className="secondary-button compact" onClick={closeCreateDialog} type="button">
                Cancel
              </button>
              <button className="primary-button compact" disabled={loading || !loadState.loaded || Boolean(loadState.error) || !newName.trim()}>
                Create
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {editModset && <ModsetEditDialog key={editModset.id} modset={editModset} modsets={modsets} groups={groups} groupsLoad={groupsLoad} modsetsLoad={loadState} api={api}
        updateModset={updateModset} onClose={closeEditDialog} onSaved={onAccessChanged} />}

      {deleteModsetTarget && (
        <Dialog title={`Delete modset ${deleteModsetTarget.name}`} onClose={() => setDeleteModsetId(null)}>
          <div className="dialog-form">
            <ResourceStatus state={loadState} label="modsets" />
            {deleteModsetTarget.tracked_mods_count > 0 ? (
              <div className="danger-callout">
                <TriangleAlert className="status-icon warn" size={20} />
                <div>
                  <strong>This modset still contains tracked mods.</strong>
                  <span>
                    {deleteModsetTarget.tracked_mods_count} tracked mod{deleteModsetTarget.tracked_mods_count === 1 ? "" : "s"} will be removed with this modset.
                  </span>
                </div>
              </div>
            ) : (
              <p className="muted">Delete this modset?</p>
            )}
            <p className="muted">Delete <strong>{deleteModsetTarget.name}</strong> permanently? This cannot be undone.</p>
            {error && <p className="error-box" role="alert">{error}</p>}
            <div className="dialog-actions">
              <button className="secondary-button compact" onClick={() => setDeleteModsetId(null)} type="button">
                Cancel
              </button>
              <button
                className="secondary-button compact danger-button"
                disabled={loading || !loadState.loaded || Boolean(loadState.error)}
                onClick={() => {
                  deleteModset(deleteModsetTarget.id)
                    .then(() => setDeleteModsetId(null))
                    .catch(() => null);
                }}
                type="button"
              >
                Delete
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
