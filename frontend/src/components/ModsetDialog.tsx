import React from "react";

import type { Modset } from "../types";
import { Dialog } from "./common";

export function ModsetDialog({
  modsets,
  activeModsetId,
  loading,
  onClose,
  onCreate,
  onRename,
  onDelete,
}: {
  modsets: Modset[];
  activeModsetId: number | null;
  loading: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
  onRename: (modsetId: number, name: string) => Promise<void>;
  onDelete: (modsetId: number) => Promise<void>;
}) {
  const [newName, setNewName] = React.useState("");
  const [renameValues, setRenameValues] = React.useState<Record<number, string>>({});

  React.useEffect(() => {
    setRenameValues(Object.fromEntries(modsets.map((modset) => [modset.id, modset.name])));
  }, [modsets]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!newName.trim()) return;
    await onCreate(newName.trim());
    setNewName("");
  }

  return (
    <Dialog title="Manage modsets" onClose={onClose}>
      <form className="dialog-form" onSubmit={handleCreate}>
        <label>
          New modset name
          <input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Server A" />
        </label>
        <div className="dialog-actions">
          <button className="primary-button compact" disabled={loading || !newName.trim()}>
            Create
          </button>
        </div>
      </form>

      <div className="modset-list">
        {modsets.map((modset) => {
          const value = renameValues[modset.id] ?? "";
          return (
            <article className="modset-row" key={modset.id}>
              <label>
                Name
                <input value={value} onChange={(event) => setRenameValues((previous) => ({ ...previous, [modset.id]: event.target.value }))} />
              </label>
              <div className="modset-row-actions">
                <button
                  className="secondary-button compact"
                  disabled={loading || !value.trim() || value.trim() === modset.name}
                  onClick={() => onRename(modset.id, value.trim())}
                  type="button"
                >
                  Rename
                </button>
                <button
                  className="secondary-button compact"
                  disabled={loading || modsets.length <= 1}
                  onClick={() => onDelete(modset.id)}
                  type="button"
                  title={modset.id === activeModsetId ? "Delete active modset" : "Delete modset"}
                >
                  Delete
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </Dialog>
  );
}
