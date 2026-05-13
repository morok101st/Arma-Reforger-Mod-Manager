import React from "react";
import { Home, Layers3, Lock, LogOut, Moon, Pin, Plus, Shield, Sun } from "lucide-react";

import { CustomSelect, StatusIcon, UNKNOWN_VALUE } from "./common";
import type { Mod, Modset, SortMode, ThemePreference } from "../types";

export function Sidebar({
  username,
  themePreference,
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
  onToggleTheme,
  onShowAddMod,
  onActivateModset,
  onSearchChange,
  onSortChange,
  onOpenMod,
}: {
  username: string;
  themePreference: ThemePreference;
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
  onToggleTheme: () => void;
  onShowAddMod: () => void;
  onActivateModset: (modsetId: number) => void;
  onSearchChange: (value: string) => void;
  onSortChange: (value: SortMode) => void;
  onOpenMod: (id: string) => void;
}) {
  const activeModset = modsets.find((modset) => modset.id === activeModsetId) ?? modsets[0] ?? null;
  const modRowRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const deleteBlockedTitle = React.useCallback((mod: Mod) => {
    const names = mod.blocking_dependents.map((dependent) => dependent.name ?? dependent.id).filter(Boolean);
    return names.length > 0 ? `Required by: ${names.join(", ")}` : "Required by another tracked mod";
  }, []);
  const handleModsetChange = React.useCallback(
    (modsetId: number) => {
      onActivateModset(modsetId);
      onShowDashboard();
    },
    [onActivateModset, onShowDashboard],
  );

  React.useEffect(() => {
    if (!selectedModId || showDashboard || showModsetAdmin || showUserAdmin) {
      return;
    }

    const node = modRowRefs.current.get(selectedModId);
    if (!node) {
      return;
    }

    node.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selectedModId, showDashboard, showModsetAdmin, showUserAdmin, mods]);

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
          <button className="icon-button" onClick={onToggleTheme} title={themePreference === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
            {themePreference === "dark" ? <Sun size={18} /> : <Moon size={18} />}
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

      <div className="mod-list">
        {mods.map((mod) => (
          <button
            key={mod.id}
            ref={(node) => {
              if (node) {
                modRowRefs.current.set(mod.id, node);
              } else {
                modRowRefs.current.delete(mod.id);
              }
            }}
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
              </small>
            </span>
            <span className="mod-row-icons">
              {mod.delete_blocked && (
                <span className="mod-row-lock-wrap" title={deleteBlockedTitle(mod)}>
                  <Lock className="mod-row-lock" size={14} />
                </span>
              )}
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
