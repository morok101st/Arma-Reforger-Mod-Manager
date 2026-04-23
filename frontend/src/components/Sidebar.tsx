import React from "react";
import { Home, LogOut, Pin, Plus, Shield } from "lucide-react";

import { StatusIcon, UNKNOWN_VALUE } from "./common";
import type { Mod, SortMode } from "../types";

export function Sidebar({
  username,
  loading,
  error,
  showDashboard,
  showUserAdmin,
  searchQuery,
  sortMode,
  mods,
  totalModsCount,
  selectedModId,
  onShowDashboard,
  onToggleSecurity,
  onLogout,
  onShowAddMod,
  onSearchChange,
  onSortChange,
  onOpenMod,
}: {
  username: string;
  loading: boolean;
  error: string | null;
  showDashboard: boolean;
  showUserAdmin: boolean;
  searchQuery: string;
  sortMode: SortMode;
  mods: Mod[];
  totalModsCount: number;
  selectedModId: string | null;
  onShowDashboard: () => void;
  onToggleSecurity: () => void;
  onLogout: () => void;
  onShowAddMod: () => void;
  onSearchChange: (value: string) => void;
  onSortChange: (value: SortMode) => void;
  onOpenMod: (id: string) => void;
}) {
  return (
    <section className="sidebar" aria-label="Mod management">
      <div className="brand">
        <div>
          <p>Arma Reforger Mod Manager</p>
        </div>
        <div className="header-actions">
          <button className="icon-button" onClick={onShowDashboard} title="Dashboard">
            <Home size={18} />
          </button>
          <button className="icon-button" onClick={onToggleSecurity} title="Security">
            <Shield size={18} />
          </button>
          <button className="icon-button" onClick={onLogout} title={`Logout ${username}`}>
            <LogOut size={18} />
          </button>
        </div>
      </div>

      <button className="primary-button" onClick={onShowAddMod} type="button">
        <Plus size={18} />
        Add mod
      </button>

      {error && <div className="error-box">{error}</div>}

      <div className="filter-row">
        <label>
          Search
          <input value={searchQuery} onChange={(event) => onSearchChange(event.target.value)} placeholder="Mod name or ID" />
        </label>
        <label className="sort-control">
          Sort by
          <select value={sortMode} onChange={(event) => onSortChange(event.target.value as SortMode)}>
            <option value="updates">Updates first</option>
            <option value="name">Name</option>
            <option value="status">Status</option>
            <option value="last_checked">Last checked</option>
          </select>
        </label>
      </div>

      <div className="mod-list">
        {mods.map((mod) => (
          <button key={mod.id} className={`mod-row ${!showDashboard && !showUserAdmin && selectedModId === mod.id ? "active" : ""}`} onClick={() => onOpenMod(mod.id)}>
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
        {totalModsCount === 0 && <p className="empty">No mods tracked yet.</p>}
        {totalModsCount > 0 && mods.length === 0 && <p className="empty">No mods match your search.</p>}
      </div>
    </section>
  );
}
