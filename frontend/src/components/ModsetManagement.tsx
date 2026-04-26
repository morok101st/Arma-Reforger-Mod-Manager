import React from "react";
import { Download, Pencil, Plus, TriangleAlert } from "lucide-react";

import type { Modset } from "../types";
import { Dialog } from "./common";

export function ModsetManagement({
  modsets,
  activeModsetId,
  loading,
  error,
  createModset,
  updateModset,
  deleteModset,
  activateModset,
  exportModset,
}: {
  modsets: Modset[];
  activeModsetId: number | null;
  loading: boolean;
  error: string | null;
  createModset: (name: string) => Promise<void>;
  updateModset: (modsetId: number, name: string) => Promise<void>;
  deleteModset: (modsetId: number) => Promise<void>;
  activateModset: (modsetId: number) => Promise<void>;
  exportModset: (modsetId: number, modsetName: string) => Promise<void>;
}) {
  const [newName, setNewName] = React.useState("");
  const [showCreateDialog, setShowCreateDialog] = React.useState(false);
  const [editModsetId, setEditModsetId] = React.useState<number | null>(null);
  const [editName, setEditName] = React.useState("");
  const [deleteModsetId, setDeleteModsetId] = React.useState<number | null>(null);

  const editModset = modsets.find((modset) => modset.id === editModsetId) ?? null;
  const deleteModsetTarget = modsets.find((modset) => modset.id === deleteModsetId) ?? null;

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    await createModset(name);
    setNewName("");
    setShowCreateDialog(false);
  }

  async function handleEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!editModset) return;
    const name = editName.trim();
    if (!name || name === editModset.name) return;
    await updateModset(editModset.id, name);
    setEditModsetId(null);
    setEditName("");
  }

  function openEditDialog(modset: Modset) {
    setEditModsetId(modset.id);
    setEditName(modset.name);
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

      <button className="primary-button compact" onClick={() => setShowCreateDialog(true)} type="button">
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
                  {modset.tracked_mods_count} tracked mod{modset.tracked_mods_count === 1 ? "" : "s"}
                </small>
              </div>
              <button
                className="secondary-button compact"
                disabled={loading}
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
                className="secondary-button compact danger-button"
                disabled={loading || modsets.length <= 1}
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
            </article>
          );
        })}
      </div>

      {showCreateDialog && (
        <Dialog title="Create modset" onClose={() => setShowCreateDialog(false)}>
          <form className="dialog-form" onSubmit={handleCreate}>
            <label>
              Name
              <input autoFocus value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Server A" />
            </label>
            <div className="dialog-actions">
              <button className="secondary-button compact" onClick={() => setShowCreateDialog(false)} type="button">
                Cancel
              </button>
              <button className="primary-button compact" disabled={loading || !newName.trim()}>
                Create
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {editModset && (
        <Dialog title={`Edit modset ${editModset.name}`} onClose={() => setEditModsetId(null)}>
          <form className="dialog-form" onSubmit={handleEdit}>
            <label>
              Name
              <input value={editName} onChange={(event) => setEditName(event.target.value)} />
            </label>
            <div className="dialog-actions">
              <button className="secondary-button compact" onClick={() => setEditModsetId(null)} type="button">
                Cancel
              </button>
              <button className="primary-button compact" disabled={loading || !editName.trim() || editName.trim() === editModset.name}>
                Save
              </button>
            </div>
          </form>
        </Dialog>
      )}

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
