import type { GroupPermission } from "../types";
import React from "react";
import { Copy, Download, Pencil, Plus, Share2, TriangleAlert } from "lucide-react";

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
    await createModset(name);
    closeCreateDialog();
  }

  function openEditDialog(modset: Modset) {
    setEditModsetId(modset.id);
  }

  function openCreateDialog() {
    setNewName("");
    setShowCreateDialog(true);
  }

  function closeCreateDialog() {
    setShowCreateDialog(false);
    setNewName("");
  }

  function closeEditDialog() {
    setEditModsetId(null);
  }

  return (
    <>
      <header className="detail-header">
        <div>
          <p>Modsets</p>
          <h2>Modsets</h2>
        </div>
      </header>

      {error && (
        <div className="status-band update_available">
          <TriangleAlert className="status-icon warn" size={20} />
          <strong>Action failed</strong>
          <span>{error}</span>
        </div>
      )}

      <button className="primary-button compact" onClick={openCreateDialog} type="button">
        <Plus size={18} />
        Create modset
      </button>

      <div className="user-list">
        {modsets.map((modset) => {
          return (
            <article
              className={`user-row modset-edit-row ${modset.id === activeModsetId ? "active" : ""}`}
              key={modset.id}
              role="button"
              tabIndex={0}
              onClick={() => activateModset(modset.id).catch(() => null)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  activateModset(modset.id).catch(() => null);
                }
              }}
            >
              <div>
                <strong>{modset.name}</strong>
                <small>
                  {modset.tracked_mods_count} tracked mod{modset.tracked_mods_count === 1 ? "" : "s"} ·{" "}
                  {modset.has_group_access ? (
                    <span className="modset-sharing-state groups"><Share2 size={13} /> Group access</span>
                  ) : "Private"}{" "}
                  · {modset.is_owner ? "Owner: you" : `Owner: ${modset.owner_username ?? "unknown"}`}
                  {!modset.can_edit && " · Read only"}
                </small>
              </div>
              <div className="row-actions modset-row-actions">
                <button
                  className="secondary-button compact"
                  disabled={loading || !modset.can_edit}
                  onClick={(event) => {
                    event.stopPropagation();
                    openEditDialog(modset);
                  }}
                  type="button"
                >
                  <Pencil size={16} />
                  Edit
                </button>
                <button
                  className="secondary-button compact"
                  disabled={loading}
                  onClick={(event) => {
                    event.stopPropagation();
                    duplicateModset(modset.id).catch(() => null);
                  }}
                  type="button"
                >
                  <Copy size={16} />
                  Duplicate
                </button>
                <button
                  className="secondary-button compact danger-button"
                  disabled={loading || !modset.can_delete || modsets.length <= 1}
                  onClick={(event) => {
                    event.stopPropagation();
                    setDeleteModsetId(modset.id);
                  }}
                  type="button"
                >
                  Delete
                </button>
                <button
                  className="secondary-button compact"
                  disabled={loading}
                  onClick={(event) => {
                    event.stopPropagation();
                    exportModset(modset.id, modset.name).catch(() => null);
                  }}
                  type="button"
                >
                  <Download size={16} />
                  Export
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {showCreateDialog && (
        <Dialog title="Create modset" onClose={closeCreateDialog}>
          <form className="dialog-form" onSubmit={handleCreate}>
            <label>
              Name
              <input autoFocus value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Server A" />
            </label>
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
            <p className="muted">
              Delete <strong>{deleteModsetTarget.name}</strong> permanently?
            </p>
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
