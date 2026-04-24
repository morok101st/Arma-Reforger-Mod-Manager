import React from "react";
import { Check, ChevronDown, Home, Layers3, LogOut, Pin, Plus, Shield } from "lucide-react";

import { StatusIcon, UNKNOWN_VALUE } from "./common";
import type { Mod, Modset, SortMode } from "../types";

export function Sidebar({
  username,
  loading,
  showDashboard,
  showModsetAdmin,
  showUserAdmin,
  modsets,
  activeModsetId,
  searchQuery,
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
  onSortChange: (value: SortMode) => void;
  onOpenMod: (id: string) => void;
}) {
  const [showModsetMenu, setShowModsetMenu] = React.useState(false);
  const modsetMenuRef = React.useRef<HTMLDivElement | null>(null);
  const activeModset = modsets.find((modset) => modset.id === activeModsetId) ?? modsets[0] ?? null;

  React.useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!modsetMenuRef.current?.contains(event.target as Node)) {
        setShowModsetMenu(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  function activateAndClose(modsetId: number) {
    onActivateModset(modsetId);
    setShowModsetMenu(false);
  }

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
        <div className="custom-select" ref={modsetMenuRef}>
          <button
            className="custom-select-trigger"
            type="button"
            onClick={() => setShowModsetMenu((current) => !current)}
            disabled={loading || modsets.length === 0}
            aria-haspopup="listbox"
            aria-expanded={showModsetMenu}
          >
            <span>{activeModset?.name ?? "No modset"}</span>
            <ChevronDown size={16} />
          </button>
          {showModsetMenu && (
            <div className="custom-select-menu" role="listbox" aria-label="Modset">
              {modsets.map((modset) => (
                <button
                  key={modset.id}
                  className={`custom-select-item ${activeModsetId === modset.id ? "active" : ""}`}
                  type="button"
                  role="option"
                  aria-selected={activeModsetId === modset.id}
                  onClick={() => activateAndClose(modset.id)}
                >
                  <span>{modset.name}</span>
                  {activeModsetId === modset.id && <Check size={16} />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

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
          <button
            key={mod.id}
            className={`mod-row ${!showDashboard && !showModsetAdmin && !showUserAdmin && selectedModId === mod.id ? "active" : ""}`}
            onClick={() => onOpenMod(mod.id)}
          >
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
