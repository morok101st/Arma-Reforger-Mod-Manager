import React from "react";
import type { LoadState } from "../hooks/useLoadState";
import { ResourceStatus } from "./ResourceStatus";
import { ArrowLeft, Lock, Pin, SlidersHorizontal, X } from "lucide-react";
import { CustomSelect, StatusIcon, UNKNOWN_VALUE } from "./common";
import type { Mod, ModStatusFilter, SortMode } from "../types";

export function Sidebar({
  loadState,
  isMobileDrawerOpen,
  loading,
  showDashboard,
  showModsetAdmin,
  showUserAdmin,
  searchQuery,
  statusFilter,
  sortMode,
  mods,
  totalModsCount,
  selectedModId,
  onShowDashboard,
  onSearchChange,
  onStatusFilterChange,
  onSortChange,
  onOpenMod,
  onClose,
}: {
  loadState: LoadState;
  isMobileDrawerOpen: boolean; loading: boolean; showDashboard: boolean; showModsetAdmin: boolean; showUserAdmin: boolean;
  searchQuery: string; statusFilter: ModStatusFilter; sortMode: SortMode; mods: Mod[]; totalModsCount: number; selectedModId: string | null;
  onShowDashboard: () => void; onSearchChange: (value: string) => void; onStatusFilterChange: (value: ModStatusFilter) => void;
  onSortChange: (value: SortMode) => void; onOpenMod: (id: string) => void; onClose: () => void;
}) {
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const modRowRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const deleteBlockedTitle = React.useCallback((mod: Mod) => {
    const names = mod.blocking_dependents.map((dependent) => dependent.name ?? dependent.id).filter(Boolean);
    return names.length > 0 ? `Required by: ${names.join(", ")}` : "Required by another tracked mod";
  }, []);
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


  return <section className={`sidebar ${isMobileDrawerOpen ? "drawer-open" : ""}`} aria-label="Mod management" role={isMobileDrawerOpen ? "dialog" : undefined} aria-modal={isMobileDrawerOpen || undefined}>
    <button className="icon-button drawer-close" onClick={onClose} type="button" aria-label="Close mod list"><X size={18} /></button>
    <div className="mod-browser-heading"><h2>Mods {loadState.loaded && !loadState.error && <span>{totalModsCount}</span>}</h2>
      <button className="icon-button" type="button" aria-label="Show filters" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}><SlidersHorizontal size={18} /></button>
    </div>
    {!showDashboard && <button className="workspace-overview" type="button" onClick={onShowDashboard}><ArrowLeft size={16} /> Back to overview</button>}
    <label className="mod-search">Search mods<input value={searchQuery} onChange={event => onSearchChange(event.target.value)} placeholder="Name or Workshop ID" /></label>
    <div className={`browser-filters ${filtersOpen || statusFilter !== "all" ? "expanded" : ""}`}>
      <div className="filter-row">
        <label>
          Status
          <CustomSelect<ModStatusFilter>
            value={statusFilter}
            options={[
              { value: "all", label: "All" },
              { value: "UP_TO_DATE", label: "Up to date" },
              { value: "UPDATE_AVAILABLE", label: "Update available" },
              { value: "NOT_INSTALLED", label: "No installed version" },
              { value: "UNKNOWN", label: "No latest version" },
            ]}
            onChange={onStatusFilterChange}
            ariaLabel="Filter by status"
          />
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
              { value: "load_order", label: "Load order" },
            ]}
            onChange={onSortChange}
            ariaLabel="Sort by"
          />
        </label>
      </div>

    </div>
    <ResourceStatus state={loadState} label="mods" announce={false} />
    {loadState.loaded && !loadState.error && <>
    <p className="browser-result-count" aria-live="polite">{mods.length} of {totalModsCount} mods</p>

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
                {mod.dependencies.length > 0 && <span className="relation-count">{mod.dependencies.length} deps</span>}
                {mod.dependents.length > 0 && <span className="relation-count">{mod.dependents.length} req</span>}
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
        {totalModsCount > 0 && mods.length === 0 && <p className="empty">No mods match the current filters.</p>}
      </div>
    </>}
  </section>;
}
