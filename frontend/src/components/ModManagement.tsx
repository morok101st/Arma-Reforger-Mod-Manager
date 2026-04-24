import React from "react";
import { Pin, Plus } from "lucide-react";

import { getDashboardStats, UNKNOWN_VALUE } from "../lib/utils";
import type { Mod, Modset, SortMode } from "../types";
import { Info, StatusIcon } from "./common";
import { ModDetail } from "./ModDetail";

export function ModManagement({
  loading,
  modsets,
  activeModsetId,
  mods,
  sortedMods,
  selected,
  selectedId,
  searchQuery,
  sortMode,
  saveState,
  installedVersionEdit,
  changelogEntries,
  expandedChangelogVersions,
  trackedDependencyMatches,
  setSearchQuery,
  setSortMode,
  setInstalledVersionEdit,
  openMod,
  activateModset,
  openAddModDialog,
  openModsetDialog,
  refreshMod,
  removeMod,
  updateInstalledVersion,
  toggleChangelogVersion,
}: {
  loading: boolean;
  modsets: Modset[];
  activeModsetId: number | null;
  mods: Mod[];
  sortedMods: Mod[];
  selected: Mod | null;
  selectedId: string | null;
  searchQuery: string;
  sortMode: SortMode;
  saveState: "idle" | "saved";
  installedVersionEdit: string;
  changelogEntries: { version: string; lastModifiedAt: string | null; lines: string[] }[];
  expandedChangelogVersions: Set<string>;
  trackedDependencyMatches: Map<string, Mod | null>;
  setSearchQuery: (value: string) => void;
  setSortMode: (value: SortMode) => void;
  setInstalledVersionEdit: (value: string) => void;
  openMod: (id: string) => void;
  activateModset: (modsetId: number) => void;
  openAddModDialog: () => void;
  openModsetDialog: () => void;
  refreshMod: (id: string) => Promise<void>;
  removeMod: (id: string) => Promise<void>;
  updateInstalledVersion: (nextVersion?: string) => Promise<void>;
  toggleChangelogVersion: (version: string) => void;
}) {
  const stats = React.useMemo(() => getDashboardStats(mods), [mods]);
  const activeModset = modsets.find((entry) => entry.id === activeModsetId) ?? null;

  return (
    <>
      <header className="detail-header">
        <div>
          <p>Modsets</p>
          <h2>Mod Management</h2>
        </div>
      </header>

      <div className="dashboard-stats">
        <Info label="Active modset" value={activeModset?.name ?? "unknown"} />
        <Info label="Tracked mods" value={String(stats.total)} />
        <Info label="Updates" value={String(stats.updateAvailable)} />
        <Info label="No installed version" value={String(stats.noInstalledVersion)} />
      </div>

      <div className="modset-controls">
        <label className="sort-control">
          Modset
          <select
            value={activeModsetId ?? ""}
            onChange={(event) => activateModset(Number(event.target.value))}
            disabled={loading || modsets.length === 0}
          >
            {modsets.map((modset) => (
              <option key={modset.id} value={modset.id}>
                {modset.name}
              </option>
            ))}
          </select>
        </label>
        <button className="secondary-button compact" onClick={openModsetDialog} type="button" disabled={loading}>
          Manage modsets
        </button>
        <button className="primary-button compact" onClick={openAddModDialog} type="button" disabled={loading}>
          <Plus size={18} />
          Add mod
        </button>
      </div>

      <div className="mod-management-grid">
        <section className="mod-management-list">
          <div className="filter-row">
            <label>
              Search
              <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Mod name or ID" />
            </label>
            <label className="sort-control">
              Sort by
              <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
                <option value="updates">Updates first</option>
                <option value="name">Name</option>
                <option value="status">Status</option>
                <option value="last_checked">Last checked</option>
              </select>
            </label>
          </div>

          <div className="mod-list">
            {sortedMods.map((mod) => (
              <button key={mod.id} className={`mod-row ${selectedId === mod.id ? "active" : ""}`} onClick={() => openMod(mod.id)}>
                <StatusIcon status={mod.status} />
                <span>
                  <strong>{mod.name ?? mod.id}</strong>
                  <small>
                    {mod.current_version ?? "No installed version"} / {mod.latest_version ?? UNKNOWN_VALUE}
                    <span className="relation-count">{mod.dependencies.length} deps</span>
                    <span className="relation-count">{mod.dependents.length} req</span>
                    {mod.tracking_reason === "dependency" && <span className="tracking-badge">dep</span>}
                  </small>
                </span>
                {mod.pinned && <Pin size={14} />}
              </button>
            ))}
            {mods.length === 0 && <p className="empty">No mods tracked in this modset.</p>}
            {mods.length > 0 && sortedMods.length === 0 && <p className="empty">No mods match your search.</p>}
          </div>
        </section>

        <section className="mod-management-detail">
          {selected ? (
            <ModDetail
              selected={selected}
              loading={loading}
              saveState={saveState}
              installedVersionEdit={installedVersionEdit}
              setInstalledVersionEdit={setInstalledVersionEdit}
              refreshMod={refreshMod}
              removeMod={removeMod}
              updateInstalledVersion={updateInstalledVersion}
              changelogEntries={changelogEntries}
              expandedChangelogVersions={expandedChangelogVersions}
              toggleChangelogVersion={toggleChangelogVersion}
              trackedDependencyMatches={trackedDependencyMatches}
              openMod={openMod}
            />
          ) : (
            <div className="placeholder">
              <h2>Add a mod</h2>
              <p>Use Add mod to start the first fetch for this modset.</p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
