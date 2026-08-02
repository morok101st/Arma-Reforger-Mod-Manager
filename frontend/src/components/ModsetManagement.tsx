import React from "react";
import { ArrowDown, ArrowUp, ChevronsDown, ChevronsUp, Copy, Download, Pencil, Plus, RotateCcw, Save, Share2, TriangleAlert } from "lucide-react";

import type { Mod, Modset } from "../types";
import { Dialog } from "./common";

export function ModsetManagement({
  modsets,
  activeModsetId,
  mods,
  loading,
  error,
  createModset,
  updateModset,
  duplicateModset,
  deleteModset,
  activateModset,
  exportModset,
  updateModLoadOrder,
  updateModsetLoadOrder,
}: {
  modsets: Modset[];
  activeModsetId: number | null;
  mods: Mod[];
  loading: boolean;
  error: string | null;
  createModset: (name: string, shared?: boolean) => Promise<void>;
  updateModset: (modsetId: number, name: string, shared?: boolean) => Promise<void>;
  duplicateModset: (modsetId: number) => Promise<void>;
  deleteModset: (modsetId: number) => Promise<void>;
  activateModset: (modsetId: number) => Promise<void>;
  exportModset: (modsetId: number, modsetName: string) => Promise<void>;
  updateModLoadOrder: (modId: string, loadOrder: number) => Promise<void>;
  updateModsetLoadOrder: (entries: { mod_id: string; load_order: number }[]) => Promise<void>;
}) {
  const [newName, setNewName] = React.useState("");
  const [newShared, setNewShared] = React.useState(false);
  const [showCreateDialog, setShowCreateDialog] = React.useState(false);
  const [editModsetId, setEditModsetId] = React.useState<number | null>(null);
  const [editName, setEditName] = React.useState("");
  const [editShared, setEditShared] = React.useState(false);
  const [deleteModsetId, setDeleteModsetId] = React.useState<number | null>(null);
  const [loadOrderEdits, setLoadOrderEdits] = React.useState<Record<string, string>>({});
  const [highlightedModId, setHighlightedModId] = React.useState<string | null>(null);
  const highlightTimerRef = React.useRef<number | null>(null);

  const editModset = modsets.find((modset) => modset.id === editModsetId) ?? null;
  const deleteModsetTarget = modsets.find((modset) => modset.id === deleteModsetId) ?? null;
  const activeModset = modsets.find((modset) => modset.id === activeModsetId) ?? null;
  const exportOrderMods = React.useMemo(
    () =>
      mods
        .filter((mod) => Boolean((mod.current_version ?? "").trim()))
        .sort((left, right) => left.load_order - right.load_order || compareModName(left, right)),
    [mods],
  );

  React.useEffect(() => {
    setLoadOrderEdits(Object.fromEntries(mods.map((mod) => [mod.id, String(mod.load_order ?? 500)])));
  }, [activeModsetId, mods]);

  React.useEffect(() => {
    return () => {
      if (highlightTimerRef.current !== null) {
        window.clearTimeout(highlightTimerRef.current);
      }
    };
  }, []);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    await createModset(name, newShared);
    closeCreateDialog();
  }

  async function handleEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!editModset) return;
    const name = editName.trim();
    const sharedChanged = editModset.is_owner && editShared !== editModset.shared;
    if (!name || (name === editModset.name && !sharedChanged)) return;
    await updateModset(editModset.id, name, sharedChanged ? editShared : undefined);
    closeEditDialog();
  }

  function openEditDialog(modset: Modset) {
    setEditModsetId(modset.id);
    setEditName(modset.name);
    setEditShared(modset.shared);
  }

  function openCreateDialog() {
    setNewName("");
    setNewShared(false);
    setShowCreateDialog(true);
  }

  function closeCreateDialog() {
    setShowCreateDialog(false);
    setNewName("");
    setNewShared(false);
  }

  function closeEditDialog() {
    setEditModsetId(null);
    setEditName("");
    setEditShared(false);
  }

  async function handleLoadOrderSave(mod: Mod) {
    const value = loadOrderEdits[mod.id] ?? String(mod.load_order ?? 500);
    const normalizedLoadOrder = Number.parseInt(value.trim(), 10);
    if (!isValidLoadOrder(normalizedLoadOrder)) return;
    await updateModLoadOrder(mod.id, normalizedLoadOrder);
  }

  async function handleMoveMod(modId: string, targetIndex: number) {
    const currentIndex = exportOrderMods.findIndex((mod) => mod.id === modId);
    if (currentIndex < 0) return;
    const boundedTargetIndex = Math.max(0, Math.min(targetIndex, exportOrderMods.length - 1));
    if (boundedTargetIndex === currentIndex) return;
    const reordered = [...exportOrderMods];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(boundedTargetIndex, 0, moved);
    await updateModsetLoadOrder(reindexedLoadOrderEntries(reordered));
    setHighlightedModId(modId);
    if (highlightTimerRef.current !== null) {
      window.clearTimeout(highlightTimerRef.current);
    }
    highlightTimerRef.current = window.setTimeout(() => {
      setHighlightedModId(null);
      highlightTimerRef.current = null;
    }, 1000);
  }

  async function handleResetLoadOrder() {
    if (exportOrderMods.length === 0) return;
    await updateModsetLoadOrder(exportOrderMods.map((mod) => ({ mod_id: mod.id, load_order: DEFAULT_LOAD_ORDER })));
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
                  {modset.shared ? (
                    <span className="modset-sharing-state shared" title="Shared modset">
                      <Share2 size={13} />
                      Shared
                    </span>
                  ) : (
                    "Private"
                  )}{" "}
                  · {modset.is_owner ? "Owner: you" : `Owner: ${modset.owner_username ?? "unknown"}`}
                </small>
              </div>
              <div className="row-actions modset-row-actions">
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
              </div>
            </article>
          );
        })}
      </div>

      <section className="content-section">
        <div className="section-heading">
          <div>
            <p>Selected modset</p>
            <h3>Export order{activeModset ? ` - ${activeModset.name}` : ""}</h3>
          </div>
          <button
            className="secondary-button compact"
            disabled={loading || exportOrderMods.length === 0 || exportOrderMods.every((mod) => mod.load_order === DEFAULT_LOAD_ORDER)}
            onClick={() => handleResetLoadOrder().catch(() => null)}
            type="button"
          >
            <RotateCcw size={16} />
            Reset order
          </button>
        </div>
        {exportOrderMods.length > 0 ? (
          <div className="export-order-table" role="table" aria-label="Export order">
            <div className="export-order-row export-order-header" role="row">
              <span role="columnheader">Order</span>
              <span role="columnheader">Move</span>
              <span role="columnheader">Mod name</span>
              <span role="columnheader">Mod ID</span>
              <span role="columnheader">Installed version</span>
            </div>
            {exportOrderMods.map((mod, index) => (
              <div className={`export-order-row ${highlightedModId === mod.id ? "highlighted" : ""}`} role="row" key={mod.id}>
                <div className="export-order-control" role="cell">
                  <input
                    aria-label={`Export load order for ${mod.name ?? mod.id}`}
                    disabled={loading}
                    max={999999}
                    min={0}
                    type="number"
                    value={loadOrderEdits[mod.id] ?? String(mod.load_order ?? 500)}
                    onChange={(event) =>
                      setLoadOrderEdits((current) => ({
                        ...current,
                        [mod.id]: event.target.value,
                      }))
                    }
                  />
                  <button
                    aria-label={`Save export load order for ${mod.name ?? mod.id}`}
                    className="primary-button compact"
                    disabled={loading || !hasLoadOrderChange(mod, loadOrderEdits[mod.id])}
                    onClick={() => handleLoadOrderSave(mod).catch(() => null)}
                    title="Save order"
                    type="button"
                  >
                    <Save size={16} />
                  </button>
                </div>
                <div className="export-order-move-actions" role="cell">
                  <button
                    aria-label={`Move ${mod.name ?? mod.id} to top`}
                    className="icon-button"
                    disabled={loading || index === 0}
                    onClick={() => handleMoveMod(mod.id, 0).catch(() => null)}
                    title="Move to top"
                    type="button"
                  >
                    <ChevronsUp size={16} />
                  </button>
                  <button
                    aria-label={`Move ${mod.name ?? mod.id} up`}
                    className="icon-button"
                    disabled={loading || index === 0}
                    onClick={() => handleMoveMod(mod.id, index - 1).catch(() => null)}
                    title="Move up"
                    type="button"
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    aria-label={`Move ${mod.name ?? mod.id} down`}
                    className="icon-button"
                    disabled={loading || index === exportOrderMods.length - 1}
                    onClick={() => handleMoveMod(mod.id, index + 1).catch(() => null)}
                    title="Move down"
                    type="button"
                  >
                    <ArrowDown size={16} />
                  </button>
                  <button
                    aria-label={`Move ${mod.name ?? mod.id} to bottom`}
                    className="icon-button"
                    disabled={loading || index === exportOrderMods.length - 1}
                    onClick={() => handleMoveMod(mod.id, exportOrderMods.length - 1).catch(() => null)}
                    title="Move to bottom"
                    type="button"
                  >
                    <ChevronsDown size={16} />
                  </button>
                </div>
                <strong role="cell">{mod.name ?? "Unnamed mod"}</strong>
                <code role="cell">{mod.id}</code>
                <span role="cell">{mod.current_version}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">No mods with an installed version are included in the export for this modset.</p>
        )}
        <p className="muted load-order-hint">Lower values load earlier. Higher values load later. Default: 500.</p>
      </section>

      {showCreateDialog && (
        <Dialog title="Create modset" onClose={closeCreateDialog}>
          <form className="dialog-form" onSubmit={handleCreate}>
            <label>
              Name
              <input autoFocus value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Server A" />
            </label>
            <label className="checkbox-row">
              <input checked={newShared} onChange={(event) => setNewShared(event.target.checked)} type="checkbox" />
              Shared
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

      {editModset && (
        <Dialog title={`Edit modset ${editModset.name}`} onClose={closeEditDialog}>
          <form className="dialog-form" onSubmit={handleEdit}>
            <label>
              Name
              <input value={editName} onChange={(event) => setEditName(event.target.value)} />
            </label>
            {editModset.is_owner ? (
              <label className="checkbox-row">
                <input checked={editShared} onChange={(event) => setEditShared(event.target.checked)} type="checkbox" />
                Shared
              </label>
            ) : (
              <p className="muted">
                Shared by <strong>{editModset.owner_username ?? "another user"}</strong>.
              </p>
            )}
            <div className="dialog-actions">
              <button className="secondary-button compact" onClick={closeEditDialog} type="button">
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

function compareModName(left: Mod, right: Mod): number {
  const leftName = left.name ?? left.id;
  const rightName = right.name ?? right.id;
  return leftName.localeCompare(rightName, undefined, { numeric: true, sensitivity: "base" }) || left.id.localeCompare(right.id);
}

function hasLoadOrderChange(mod: Mod, value: string | undefined) {
  const normalizedLoadOrder = Number.parseInt((value ?? "").trim(), 10);
  return isValidLoadOrder(normalizedLoadOrder) && normalizedLoadOrder !== mod.load_order;
}

function isValidLoadOrder(value: number) {
  return Number.isFinite(value) && value >= 0 && value <= 999999;
}

function reindexedLoadOrderEntries(mods: Mod[]) {
  return mods.map((mod, index) => ({
    mod_id: mod.id,
    load_order: DEFAULT_LOAD_ORDER + index * 10,
  }));
}

const DEFAULT_LOAD_ORDER = 500;
