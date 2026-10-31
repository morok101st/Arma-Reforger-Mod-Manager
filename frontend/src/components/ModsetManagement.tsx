import type { GroupPermission } from "../types";
import React from "react";
import { Copy, Download, Layers3, MoreHorizontal, Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";

import type { GroupSummary, Modset } from "../types";
import type { createApiClient } from "../lib/api";
import { ModsetEditDialog } from "./ModsetEditDialog";
import { Dialog } from "./common";

export function ModsetManagement({
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
  api: ReturnType<typeof createApiClient>;
  groups: GroupSummary[];
  onAccessChanged: () => Promise<unknown>;
  modsets: Modset[];
  activeModsetId: number | null;
  loading: boolean;
  error: string | null;
  createModset: (name: string) => Promise<void>;
  updateModset: (modsetId: number, name: string, permissions?: GroupPermission[]) => Promise<void>;
  duplicateModset: (modsetId: number) => Promise<void>;
  deleteModset: (modsetId: number) => Promise<void>;
  activateModset: (modsetId: number) => Promise<void>;
  exportModset: (modsetId: number, modsetName: string) => Promise<void>;
}) {
  const [search, setSearch] = React.useState("");
  const [scope, setScope] = React.useState("all");
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [newName, setNewName] = React.useState("");
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
    try { await createModset(name); closeCreateDialog(); }
    catch (error) { setCreateError(error instanceof Error ? error.message : "Could not create modset. Try again."); }
  }

  function openEditDialog(modset: Modset) {
    setEditModsetId(modset.id);
  }

  function openCreateDialog() {
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
        <button className="primary-button compact" onClick={openCreateDialog} disabled={loading} type="button"><Plus size={18} /> Create modset</button>
      </header>
      {error && <p className="error-box" role="alert">{error}</p>}
      <div className="modsets-filters">
        <label>Search modsets<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Name or owner" /></label>
        <label>Show<select className="permission-select" aria-label="Filter modsets" value={scope} onChange={event => setScope(event.target.value)}>
          <option value="all">All modsets</option><option value="mine">Owned by me</option><option value="groups">With group access</option>
        </select></label>
        <span className="muted" role="status">{modsets.filter(matches).length} of {modsets.length} modsets</span>
      </div>
      {modsets.length === 0 ? <div className="modsets-empty"><Layers3 size={28} /><h3>No accessible modsets</h3><p className="muted">Create a modset or ask its owner for group access.</p></div> : <table className="modsets-table" aria-label="Modsets">
        <thead><tr><th scope="col">Modset</th><th scope="col">Owner</th><th scope="col">Access</th><th scope="col">Mods</th><th scope="col">Actions</th></tr></thead>
        <tbody>{modsets.filter(matches).map(modset => <tr key={modset.id} className={modset.id === activeModsetId ? "current" : undefined}>
          <td className="modset-name-cell"><button className="modset-open" type="button" disabled={loading} onClick={() => activateModset(modset.id).catch(() => null)} aria-label={`Open modset ${modset.name}`}>{modset.name}</button>
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
                <button className="modset-delete-action" type="button" disabled={loading || !modset.can_delete || modsets.length <= 1} title={modsets.length <= 1 ? "The last modset cannot be deleted." : undefined} onClick={() => setDeleteModsetId(modset.id)}><Trash2 size={16} /> Delete</button>
              </div>
            </details>
          </div></td>
        </tr>)}</tbody>
      </table>}
      {modsets.length > 0 && modsets.filter(matches).length === 0 && <div className="modsets-empty"><h3>No matching modsets</h3><p className="muted">Try a different name, owner or filter.</p><button className="secondary-button compact" type="button" onClick={() => { setSearch(""); setScope("all"); }}>Clear filters</button></div>}

      {showCreateDialog && (
        <Dialog title="Create modset" onClose={closeCreateDialog}>
          <form className="dialog-form" onSubmit={handleCreate}>
            <label>
              Name
              <input autoFocus maxLength={120} disabled={loading} value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Server A" />
            </label>
            {createError && <p className="error-box" role="alert">{createError}</p>}
            <div className="dialog-actions">
              <button className="secondary-button compact" onClick={closeCreateDialog} type="button">
                Cancel
              </button>
              <button className="primary-button compact" disabled={loading || !newName.trim()}>
                Create
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {editModset && <ModsetEditDialog key={editModset.id} modset={editModset} groups={groups} api={api}
        updateModset={updateModset} onClose={closeEditDialog} onSaved={onAccessChanged} />}

      {deleteModsetTarget && (
        <Dialog title={`Delete modset ${deleteModsetTarget.name}`} onClose={() => setDeleteModsetId(null)}>
          <div className="dialog-form">
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
                disabled={loading}
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
