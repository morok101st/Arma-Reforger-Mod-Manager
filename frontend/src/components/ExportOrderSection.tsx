import React from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, ChevronsDown, ChevronsUp, GitFork, RotateCcw, TriangleAlert } from "lucide-react";

import type { Mod } from "../types";
import { compareExportOrder } from "../lib/utils";

export function ExportOrderSection({
  activeModsetName,
  mods,
  loading,
  error,
  updateExportOrder,
}: {
  activeModsetName: string;
  mods: Mod[];
  loading: boolean;
  error: string | null;
  updateExportOrder: (modIds: string[]) => Promise<void>;
}) {
  const followsParent = mods.some(mod => mod.order_mode === "parent");
  const [highlightedModId, setHighlightedModId] = React.useState<string | null>(null);
  const [isExpanded, setIsExpanded] = React.useState(false);
  const highlightTimerRef = React.useRef<number | null>(null);
  const contentId = React.useId();
  const exportOrderMods = React.useMemo(
    () =>
      mods
        .filter((mod) => Boolean((mod.current_version ?? "").trim()))
        .sort(compareExportOrder),
    [mods],
  );

  React.useEffect(() => {
    setHighlightedModId(null);
  }, [activeModsetName]);

  React.useEffect(() => {
    return () => {
      if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
    };
  }, []);

  async function handleMoveMod(modId: string, targetIndex: number) {
    const currentIndex = exportOrderMods.findIndex((mod) => mod.id === modId);
    if (currentIndex < 0) return;
    const boundedTargetIndex = Math.max(0, Math.min(targetIndex, exportOrderMods.length - 1));
    if (boundedTargetIndex === currentIndex) return;
    const reordered = [...exportOrderMods];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(boundedTargetIndex, 0, moved);
    await updateExportOrder(reordered.map(mod => mod.id));
    setHighlightedModId(modId);
    if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = window.setTimeout(() => {
      setHighlightedModId(null);
      highlightTimerRef.current = null;
    }, 1000);
  }

  async function placeLocalModsAtEnd() {
    if (exportOrderMods.length === 0) return;
    await updateExportOrder([
      ...exportOrderMods.filter(mod => mod.parent_modset_id),
      ...exportOrderMods.filter(mod => !mod.parent_modset_id),
    ].map(mod => mod.id));
  }

  return (
    <section className="dashboard-card export-order-card">
      <div className="section-heading">
        <h3>Export order</h3>
        <div className="export-order-heading-actions">
          {isExpanded && followsParent && (
            <button
              className="secondary-button compact"
              disabled={loading || !exportOrderMods.some((mod, index) => !mod.parent_modset_id && exportOrderMods.slice(index + 1).some(row => row.parent_modset_id))}
              onClick={() => placeLocalModsAtEnd().catch(() => null)}
              type="button"
            >
              <RotateCcw size={16} />
              Place local mods at end
            </button>
          )}
          <button
            aria-controls={contentId}
            aria-expanded={isExpanded}
            className="secondary-button compact"
            onClick={() => setIsExpanded((current) => !current)}
            type="button"
          >
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            {isExpanded ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="export-order-content" id={contentId}>
          {followsParent && <p className="muted">Parent order is binding and follows future changes. Move your local mods between parent mods. If a parent mod is removed, local mods stay before the next remaining parent mod.</p>}
          {error && (
            <div className="status-band update_available">
              <TriangleAlert className="status-icon warn" size={20} />
              <strong>Action failed</strong>
              <span>{error}</span>
            </div>
          )}

          {exportOrderMods.length > 0 ? (
            <div className="export-order-table" role="table" aria-label={`Export order for ${activeModsetName}`}>
          <div className="export-order-row export-order-header" role="row">
            <span role="columnheader">Position</span>
            <span role="columnheader">Move</span>
            <span role="columnheader">Mod name</span>
            <span role="columnheader">Mod ID</span>
            <span role="columnheader">Installed version</span>
          </div>
          {exportOrderMods.map((mod, index) => (
            <div className={`export-order-row ${highlightedModId === mod.id ? "highlighted" : ""}`} role="row" key={mod.id}>
              <span className="export-order-position" role="cell" aria-label={`Export position ${index + 1} for ${mod.name ?? mod.id}`}>{index + 1}</span>
              <div className="export-order-move-actions" role="cell">
                <button
                  aria-label={`Move ${mod.name ?? mod.id} to top`}
                  className="icon-button"
                  disabled={loading || (followsParent && Boolean(mod.parent_modset_id)) || index === 0}
                  onClick={() => handleMoveMod(mod.id, 0).catch(() => null)}
                  title="Move to top"
                  type="button"
                >
                  <ChevronsUp size={16} />
                </button>
                <button
                  aria-label={`Move ${mod.name ?? mod.id} up`}
                  className="icon-button"
                  disabled={loading || (followsParent && Boolean(mod.parent_modset_id)) || index === 0}
                  onClick={() => handleMoveMod(mod.id, index - 1).catch(() => null)}
                  title="Move up"
                  type="button"
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  aria-label={`Move ${mod.name ?? mod.id} down`}
                  className="icon-button"
                  disabled={loading || (followsParent && Boolean(mod.parent_modset_id)) || index === exportOrderMods.length - 1}
                  onClick={() => handleMoveMod(mod.id, index + 1).catch(() => null)}
                  title="Move down"
                  type="button"
                >
                  <ArrowDown size={16} />
                </button>
                <button
                  aria-label={`Move ${mod.name ?? mod.id} to bottom`}
                  className="icon-button"
                  disabled={loading || (followsParent && Boolean(mod.parent_modset_id)) || index === exportOrderMods.length - 1}
                  onClick={() => handleMoveMod(mod.id, exportOrderMods.length - 1).catch(() => null)}
                  title="Move to bottom"
                  type="button"
                >
                  <ChevronsDown size={16} />
                </button>
              </div>
              <strong className="export-order-name" role="cell">
                <span>{mod.name ?? "Unnamed mod"}</span>
                {mod.parent_modset_id && <span className="mod-row-inherited" role="img" aria-label={`Inherited from ${mod.parent_modset_name ?? "parent modset"}`} title={`Inherited from ${mod.parent_modset_name ?? "parent modset"}. Installed version is managed there.`}><GitFork size={16} aria-hidden="true" /></span>}
              </strong>
              <code role="cell">{mod.id}</code>
              <span role="cell">{mod.current_version}</span>
            </div>
          ))}
            </div>
          ) : (
            <p className="muted">No mods with an installed version are included in the export for this modset.</p>
          )}
          <p className="muted export-order-hint">{followsParent ? "Inherited positions are managed in the parent modset. Your local placements are saved automatically." : "Move mods to arrange the server export. Changes are saved automatically."}</p>
        </div>
      )}
    </section>
  );
}
