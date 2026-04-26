import React from "react";
import { Home, Layers3, Lock, LogOut, Pin, Plus, Shield } from "lucide-react";

import { CustomSelect, StatusIcon, UNKNOWN_VALUE } from "./common";
import type { Mod, Modset, SortMode, TagFilter } from "../types";

export function Sidebar({
  username,
  loading,
  showDashboard,
  showModsetAdmin,
  showUserAdmin,
  modsets,
  activeModsetId,
  searchQuery,
  tagFilter,
  sortMode,
  mods,
  totalModsCount,
  selectedModId,
  onShowDashboard,
  onShowModsetAdmin,
  onToggleSecurity,
  onLogout,
  onShowAddMod,
  onActivateModset,
  onSearchChange,
  onTagFilterChange,
  onSortChange,
  onOpenMod,
}: {
  username: string;
  loading: boolean;
  showDashboard: boolean;
  showModsetAdmin: boolean;
  showUserAdmin: boolean;
  modsets: Modset[];
  activeModsetId: number | null;
  searchQuery: string;
  tagFilter: TagFilter;
  sortMode: SortMode;
  mods: Mod[];
  totalModsCount: number;
  selectedModId: string | null;
  onShowDashboard: () => void;
  onShowModsetAdmin: () => void;
  onToggleSecurity: () => void;
  onLogout: () => void;
  onShowAddMod: () => void;
  onActivateModset: (modsetId: number) => void;
  onSearchChange: (value: string) => void;
  onTagFilterChange: (value: TagFilter) => void;
  onSortChange: (value: SortMode) => void;
  onOpenMod: (id: string) => void;
}) {
  const activeModset = modsets.find((modset) => modset.id === activeModsetId) ?? modsets[0] ?? null;
  const handleModsetChange = React.useCallback(
    (modsetId: number) => {
      onActivateModset(modsetId);
      onShowDashboard();
    },
    [onActivateModset, onShowDashboard],
  );

  return (
    <section className="sidebar" aria-label="Mod management">
      <div className="brand">
        <div>
          <p>Arma Reforger Mod Manager</p>
        </div>
        <div className="header-actions">
          <button
            className={`icon-button ${showDashboard ? "active" : ""}`}
            onClick={onShowDashboard}
            title="Dashboard"
            aria-pressed={showDashboard}
          >
            <Home size={18} />
          </button>
          <button
            className={`icon-button ${showModsetAdmin ? "active" : ""}`}
            onClick={onShowModsetAdmin}
            title="Modsets"
            aria-pressed={showModsetAdmin}
          >
            <Layers3 size={18} />
          </button>
          <button
            className={`icon-button ${showUserAdmin ? "active" : ""}`}
            onClick={onToggleSecurity}
            title="Security"
            aria-pressed={showUserAdmin}
          >
            <Shield size={18} />
          </button>
          <button className="icon-button logout-button" onClick={onLogout} title={`Logout ${username}`}>
            <LogOut size={18} />
          </button>
        </div>
      </div>

      <button className="primary-button" onClick={onShowAddMod} type="button">
        <Plus size={18} />
        Add mod
      </button>

      <div className="content-section">
        <label>Modset</label>
        <CustomSelect<number>
          value={activeModset?.id ?? 0}
          options={
            modsets.length > 0
              ? modsets.map((modset) => ({ value: modset.id, label: modset.name }))
              : [{ value: 0, label: "No modset" }]
          }
          onChange={handleModsetChange}
          disabled={loading || modsets.length === 0}
          ariaLabel="Modset"
        />
      </div>

      <div className="filter-row">
        <label>
          Search
          <input value={searchQuery} onChange={(event) => onSearchChange(event.target.value)} placeholder="Mod name or ID" />
        </label>
        <label>
          Sort by
          <CustomSelect<SortMode>
            value={sortMode}
            options={[
              { value: "updates", label: "Updates first" },
              { value: "name", label: "Name" },
              { value: "status", label: "Status" },
              { value: "last_checked", label: "Last checked" },
            ]}
            onChange={onSortChange}
            ariaLabel="Sort by"
          />
        </label>
      </div>

      <div className="tag-filter-row" role="tablist" aria-label="Tag filters">
        <button className={`tag-filter-pill ${tagFilter === "all" ? "active" : ""}`} onClick={() => onTagFilterChange("all")} type="button">
          All
        </button>
        <button className={`tag-filter-pill core ${tagFilter === "core" ? "active" : ""}`} onClick={() => onTagFilterChange("core")} type="button">
          Core
        </button>
        <button className={`tag-filter-pill dep ${tagFilter === "dep" ? "active" : ""}`} onClick={() => onTagFilterChange("dep")} type="button">
          Dep
        </button>
      </div>

      <div className="mod-list">
        {mods.map((mod) => (
          <button
            key={mod.id}
            className={`mod-row ${!showDashboard && !showModsetAdmin && !showUserAdmin && selectedModId === mod.id ? "active" : ""}`}
            onClick={() => onOpenMod(mod.id)}
          >
            <StatusIcon status={mod.status} noInstalledVersion={!mod.current_version} />
            <span>
              <strong>{mod.name ?? mod.id}</strong>
              <small>
                {mod.current_version ?? "No installed version"} / {mod.latest_version ?? UNKNOWN_VALUE}
                <span className="relation-count">{mod.dependencies.length} deps</span>
                <span className="relation-count">{mod.dependents.length} req</span>
                {mod.is_core && <span className="tracking-badge core">core</span>}
                {mod.is_dependency && <span className="tracking-badge dep">dep</span>}
              </small>
            </span>
            <span className="mod-row-icons">
              {mod.delete_blocked && <Lock className="mod-row-lock" size={14} />}
              {mod.pinned && <Pin size={14} />}
            </span>
          </button>
        ))}
        {totalModsCount === 0 && <p className="empty">No mods tracked yet.</p>}
        {totalModsCount > 0 && mods.length === 0 && <p className="empty">No mods match your search.</p>}
      </div>
    </section>
  );
}
