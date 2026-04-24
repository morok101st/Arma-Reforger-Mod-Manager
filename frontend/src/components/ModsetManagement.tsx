import React from "react";
import { Pencil, Plus, TriangleAlert } from "lucide-react";

import type { Modset } from "../types";
import { Dialog } from "./common";

export function ModsetManagement({
  modsets,
  loading,
  error,
  createModset,
  updateModset,
  deleteModset,
}: {
  modsets: Modset[];
  loading: boolean;
  error: string | null;
  createModset: (name: string) => Promise<void>;
  updateModset: (modsetId: number, name: string) => Promise<void>;
  deleteModset: (modsetId: number) => Promise<void>;
}) {
  const [newName, setNewName] = React.useState("");
  const [showCreateDialog, setShowCreateDialog] = React.useState(false);
  const [editModsetId, setEditModsetId] = React.useState<number | null>(null);
  const [editName, setEditName] = React.useState("");

  const editModset = modsets.find((modset) => modset.id === editModsetId) ?? null;

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

      <section className="dashboard-card content-section">
        <div className="section-title-row">
          <h3>Edit modsets</h3>
        </div>
        <div className="user-list">
          {modsets.map((modset) => {
            return (
              <article className="user-row modset-edit-row" key={modset.id}>
                <div>
                  <strong>{modset.name}</strong>
                  <small>ID {modset.id}</small>
                </div>
                <button className="secondary-button compact" disabled={loading} onClick={() => openEditDialog(modset)} type="button">
                  <Pencil size={16} />
                  Edit
                </button>
                <button
                  className="secondary-button compact"
                  disabled={loading || modsets.length <= 1}
                  onClick={() => deleteModset(modset.id).catch(() => null)}
                  type="button"
                >
                  Delete
                </button>
              </article>
            );
          })}
        </div>
      </section>

      {showCreateDialog && (
        <Dialog title="Create modset" onClose={() => setShowCreateDialog(false)}>
          <form className="dialog-form" onSubmit={handleCreate}>
            <label>
              Name
              <input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Server A" />
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
    </>
  );
}
