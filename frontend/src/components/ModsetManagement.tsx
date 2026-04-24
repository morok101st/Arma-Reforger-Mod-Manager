import React from "react";

import { getDashboardStats } from "../lib/utils";
import type { Mod, Modset } from "../types";
import { Info } from "./common";

export function ModsetManagement({
  modsets,
  activeModsetId,
  mods,
  loading,
  activateModset,
  createModset,
  updateModset,
  deleteModset,
}: {
  modsets: Modset[];
  activeModsetId: number | null;
  mods: Mod[];
  loading: boolean;
  activateModset: (modsetId: number) => Promise<void>;
  createModset: (name: string) => Promise<void>;
  updateModset: (modsetId: number, name: string) => Promise<void>;
  deleteModset: (modsetId: number) => Promise<void>;
}) {
  const stats = React.useMemo(() => getDashboardStats(mods), [mods]);
  const activeModset = modsets.find((modset) => modset.id === activeModsetId) ?? null;
  const [newName, setNewName] = React.useState("");
  const [renameValues, setRenameValues] = React.useState<Record<number, string>>({});

  React.useEffect(() => {
    setRenameValues(Object.fromEntries(modsets.map((modset) => [modset.id, modset.name])));
  }, [modsets]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    await createModset(name);
    setNewName("");
  }

  return (
    <>
      <header className="detail-header">
        <div>
          <p>Modsets</p>
          <h2>Modset Management</h2>
        </div>
      </header>

      <div className="dashboard-stats">
        <Info label="Active modset" value={activeModset?.name ?? "unknown"} />
        <Info label="Tracked mods" value={String(stats.total)} />
        <Info label="Updates" value={String(stats.updateAvailable)} />
        <Info label="Defined modsets" value={String(modsets.length)} />
      </div>

      <section className="dashboard-card content-section">
        <div className="section-title-row">
          <h3>Select active modset</h3>
        </div>
        <div className="filter-row">
          <label className="sort-control">
            Active modset
            <select
              value={activeModsetId ?? ""}
              onChange={(event) => activateModset(Number(event.target.value)).catch(() => null)}
              disabled={loading || modsets.length === 0}
            >
              {modsets.map((modset) => (
                <option key={modset.id} value={modset.id}>
                  {modset.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="dashboard-card content-section">
        <div className="section-title-row">
          <h3>Create modset</h3>
        </div>
        <form className="dialog-form" onSubmit={handleCreate}>
          <label>
            Name
            <input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Server A" />
          </label>
          <div className="dialog-actions">
            <button className="primary-button compact" disabled={loading || !newName.trim()}>
              Create
            </button>
          </div>
        </form>
      </section>

      <section className="dashboard-card content-section">
        <div className="section-title-row">
          <h3>Edit modsets</h3>
        </div>
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
                    onClick={() => updateModset(modset.id, value.trim()).catch(() => null)}
                    type="button"
                  >
                    Rename
                  </button>
                  <button
                    className="secondary-button compact"
                    disabled={loading || modsets.length <= 1}
                    onClick={() => deleteModset(modset.id).catch(() => null)}
                    type="button"
                  >
                    Delete
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}
