import React from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, ChevronsDown, ChevronsUp, RotateCcw, Save, TriangleAlert } from "lucide-react";

import type { Mod } from "../types";

export function ExportOrderSection({
  activeModsetName,
  mods,
  loading,
  error,
  updateModLoadOrder,
  updateModsetLoadOrder,
}: {
  activeModsetName: string;
  mods: Mod[];
  loading: boolean;
  error: string | null;
  updateModLoadOrder: (modId: string, loadOrder: number) => Promise<void>;
  updateModsetLoadOrder: (entries: { mod_id: string; load_order: number }[]) => Promise<void>;
}) {
  const [loadOrderEdits, setLoadOrderEdits] = React.useState<Record<string, string>>({});
  const [highlightedModId, setHighlightedModId] = React.useState<string | null>(null);
  const [isExpanded, setIsExpanded] = React.useState(false);
  const highlightTimerRef = React.useRef<number | null>(null);
  const contentId = React.useId();
  const exportOrderMods = React.useMemo(
    () =>
      mods
        .filter((mod) => Boolean((mod.current_version ?? "").trim()))
        .sort((left, right) => left.load_order - right.load_order || compareModName(left, right)),
    [mods],
  );

  React.useEffect(() => {
    setLoadOrderEdits(Object.fromEntries(mods.map((mod) => [mod.id, String(mod.load_order ?? DEFAULT_LOAD_ORDER)])));
  }, [mods]);

  React.useEffect(() => {
    setHighlightedModId(null);
  }, [activeModsetName]);

  React.useEffect(() => {
    return () => {
      if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
    };
  }, []);

  async function handleLoadOrderSave(mod: Mod) {
    const value = loadOrderEdits[mod.id] ?? String(mod.load_order ?? DEFAULT_LOAD_ORDER);
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
    if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
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
    <section className="dashboard-card export-order-card">
      <div className="section-heading">
        <h3>Export order</h3>
        <div className="export-order-heading-actions">
          {isExpanded && (
            <button
              className="secondary-button compact"
              disabled={loading || exportOrderMods.length === 0 || exportOrderMods.every((mod) => mod.load_order === DEFAULT_LOAD_ORDER)}
              onClick={() => handleResetLoadOrder().catch(() => null)}
              type="button"
            >
              <RotateCcw size={16} />
              Reset order
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
                  value={loadOrderEdits[mod.id] ?? String(mod.load_order ?? DEFAULT_LOAD_ORDER)}
                  onChange={(event) => setLoadOrderEdits((current) => ({ ...current, [mod.id]: event.target.value }))}
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
        </div>
      )}
    </section>
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
