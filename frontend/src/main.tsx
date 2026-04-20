import React from "react";
import ReactDOM from "react-dom/client";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Pin,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import "./styles.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
const UNKNOWN_VALUE = "unknown";

type ModStatus = "UNKNOWN" | "UP_TO_DATE" | "UPDATE_AVAILABLE";
type SortMode = "name" | "status" | "last_checked" | "updates";
type ViewMode = "monitor" | "graph";

type ModVersion = {
  id: number;
  version: string;
  changelog: string | null;
  published_at: string | null;
  created_at: string;
};

type Dependency = {
  name: string;
  url: string | null;
};

type ModReference = {
  id: string;
  name: string | null;
  source_url: string | null;
};

type Mod = {
  id: string;
  name: string | null;
  summary: string | null;
  description: string | null;
  latest_version: string | null;
  game_version: string | null;
  size: string | null;
  dependencies: Dependency[];
  dependents: ModReference[];
  source_url: string | null;
  last_checked: string | null;
  current_version: string | null;
  pinned: boolean;
  status: ModStatus;
  versions: ModVersion[];
};

type ChangelogEntry = {
  version: string;
  lines: string[];
};

type GraphNode = {
  mod: Mod;
  x: number;
  y: number;
};

type GraphEdge = {
  from: string;
  to: string;
};

function App() {
  const [mods, setMods] = React.useState<Mod[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [modId, setModId] = React.useState("");
  const [currentVersion, setCurrentVersion] = React.useState("");
  const [installedVersionEdit, setInstalledVersionEdit] = React.useState("");
  const [expandedChangelogVersions, setExpandedChangelogVersions] = React.useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = React.useState<SortMode>("updates");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [viewMode, setViewMode] = React.useState<ViewMode>("monitor");
  const [loading, setLoading] = React.useState(false);
  const [saveState, setSaveState] = React.useState<"idle" | "saved">("idle");
  const [error, setError] = React.useState<string | null>(null);

  const visibleMods = React.useMemo(() => filterMods(mods, searchQuery), [mods, searchQuery]);
  const sortedMods = React.useMemo(() => sortMods(visibleMods, sortMode), [visibleMods, sortMode]);
  const selected = sortedMods.find((mod) => mod.id === selectedId) ?? sortedMods[0] ?? null;
  const graphSelectedId = selectedId && mods.some((mod) => mod.id === selectedId) ? selectedId : selected?.id ?? null;
  const changelogEntries = parseChangelog(selected?.versions[0]?.changelog ?? null);
  const trackedDependencyMatches = React.useMemo(
    () => new Map((selected?.dependencies ?? []).map((dependency) => [dependencyKey(dependency), findTrackedDependency(dependency, mods)])),
    [mods, selected?.dependencies],
  );

  React.useEffect(() => {
    setInstalledVersionEdit(selected?.current_version ?? "");
  }, [selected?.id, selected?.current_version]);

  React.useEffect(() => {
    setSaveState("idle");
  }, [selected?.id]);

  React.useEffect(() => {
    setExpandedChangelogVersions(changelogEntries[0] ? new Set([changelogEntries[0].version]) : new Set());
  }, [selected?.id, selected?.versions[0]?.changelog]);

  async function loadMods() {
    setError(null);
    const response = await fetch(`${API_BASE_URL}/mods`);
    if (!response.ok) throw new Error("Could not load mod list.");
    const data = (await response.json()) as Mod[];
    setMods(data);
    if (!selectedId && data.length > 0) setSelectedId(data[0].id);
  }

  React.useEffect(() => {
    loadMods().catch((err: Error) => setError(err.message));
  }, []);

  async function addMod(event: React.FormEvent) {
    event.preventDefault();
    if (!modId.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/mods`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: modId.trim(), current_version: currentVersion.trim() || null }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail ?? "Could not add mod.");
      }
      const created = (await response.json()) as Mod;
      await loadMods();
      setSelectedId(created.id);
      setModId("");
      setCurrentVersion("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshMod(id: string) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/mods/${id}/refresh`, { method: "POST" });
      if (!response.ok) throw new Error("Refresh failed.");
      await loadMods();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setLoading(false);
    }
  }

  async function removeMod(id: string) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/mods/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not delete mod.");
      setSelectedId(null);
      await loadMods();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setLoading(false);
    }
  }

  async function updateInstalledVersion(nextVersion = installedVersionEdit) {
    if (!selected) return;

    const normalizedVersion = nextVersion.trim();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/mods/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_version: normalizedVersion || null }),
      });
      if (!response.ok) throw new Error("Could not update installed version.");
      const updated = (await response.json()) as Mod;
      await loadMods();
      setSelectedId(updated.id);
      setInstalledVersionEdit(updated.current_version ?? "");
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setLoading(false);
    }
  }

  function toggleChangelogVersion(version: string) {
    setExpandedChangelogVersions((previous) => {
      const next = new Set(previous);
      if (next.has(version)) {
        next.delete(version);
      } else {
        next.add(version);
      }
      return next;
    });
  }

  return (
    <main className="app-shell">
      <section className="sidebar" aria-label="Mod management">
        <div className="brand">
          <div>
            <p>Arma Reforger Mod Manager</p>
            <h1>Workshop Monitor</h1>
          </div>
          <button className="icon-button" onClick={() => loadMods().catch((err: Error) => setError(err.message))} title="Refresh list">
            <RefreshCw size={18} />
          </button>
        </div>

        <form className="add-form" onSubmit={addMod}>
          <label>
            Workshop ID
            <input value={modId} onChange={(event) => setModId(event.target.value)} placeholder="672B195EAD3036D4" />
          </label>
          <label>
            Installed version
            <input value={currentVersion} onChange={(event) => setCurrentVersion(event.target.value)} placeholder="optional" />
          </label>
          <button className="primary-button" disabled={loading}>
            <Plus size={18} />
            Add mod
          </button>
        </form>

        {error && <div className="error-box">{error}</div>}

        <div className="view-toggle" aria-label="View mode">
          <button className={viewMode === "monitor" ? "active" : ""} onClick={() => setViewMode("monitor")} type="button">
            Monitor
          </button>
          <button className={viewMode === "graph" ? "active" : ""} onClick={() => setViewMode("graph")} type="button">
            Graph
          </button>
        </div>

        <label className="sort-control">
          Sort by
          <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
            <option value="updates">Updates first</option>
            <option value="name">Name</option>
            <option value="status">Status</option>
            <option value="last_checked">Last checked</option>
          </select>
        </label>

        <label>
          Search
          <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Name, ID or version" />
        </label>

        <div className="mod-list">
          {sortedMods.map((mod) => (
            <button key={mod.id} className={`mod-row ${selected?.id === mod.id ? "active" : ""}`} onClick={() => setSelectedId(mod.id)}>
              <StatusIcon status={mod.status} />
              <span>
                <strong>{mod.name ?? mod.id}</strong>
                <small>
                  {mod.current_version ?? "No installed version"} / {mod.latest_version ?? UNKNOWN_VALUE}
                  <span className="relation-count">{mod.dependencies.length} deps</span>
                  <span className="relation-count">{mod.dependents.length} req</span>
                </small>
              </span>
              {mod.pinned && <Pin size={14} />}
            </button>
          ))}
          {mods.length === 0 && <p className="empty">No mods tracked yet.</p>}
          {mods.length > 0 && sortedMods.length === 0 && <p className="empty">No mods match your search.</p>}
        </div>
      </section>

      {viewMode === "graph" ? (
        <GraphView
          mods={mods}
          selectedId={graphSelectedId}
          loading={loading}
          onRefresh={() => loadMods().catch((err: Error) => setError(err.message))}
          onSelect={setSelectedId}
        />
      ) : (
        <section className="detail" aria-label="Mod Details">
          {selected ? (
          <>
            <header className="detail-header">
              <div>
                <p>{selected.id}</p>
                <h2>{selected.name ?? "Unnamed mod"}</h2>
              </div>
              <div className="actions">
                {selected.source_url && (
                  <a className="action-link" href={selected.source_url} target="_blank" rel="noreferrer">
                    <ExternalLink size={18} />
                    Workshop
                  </a>
                )}
                <button className="icon-button" onClick={() => refreshMod(selected.id)} disabled={loading} title="Refresh mod">
                  <RefreshCw size={18} />
                </button>
                <button className="icon-button danger" onClick={() => removeMod(selected.id)} disabled={loading} title="Remove mod">
                  <Trash2 size={18} />
                </button>
              </div>
            </header>

            <div className={`status-band ${selected.status.toLowerCase()}`}>
              <StatusIcon status={selected.status} />
              <strong>{statusLabel(selected.status)}</strong>
              <span>Installed {selected.current_version ?? UNKNOWN_VALUE} · Latest {selected.latest_version ?? UNKNOWN_VALUE}</span>
            </div>

            <div className="version-editor">
              <label>
                Installed version
                <input
                  value={installedVersionEdit}
                  onChange={(event) => setInstalledVersionEdit(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !loading && installedVersionEdit.trim() !== (selected.current_version ?? "")) {
                      event.preventDefault();
                      updateInstalledVersion();
                    }
                  }}
                  placeholder={selected.latest_version ?? "1.0.0"}
                />
              </label>
              <button
                className="primary-button compact"
                disabled={loading || installedVersionEdit.trim() === (selected.current_version ?? "")}
                onClick={() => updateInstalledVersion()}
                type="button"
              >
                <Save size={18} />
                Save
              </button>
              {selected.latest_version && selected.current_version !== selected.latest_version && (
                <button
                  className="secondary-button compact"
                  disabled={loading}
                  onClick={() => updateInstalledVersion(selected.latest_version ?? "")}
                  type="button"
                >
                  Set to latest
                </button>
              )}
            </div>

            {saveState === "saved" && (
              <div className="status-band save-band">
                <CheckCircle2 size={20} />
                <strong>Saved</strong>
                <span>Installed version updated.</span>
              </div>
            )}

            <div className="metrics">
              <Info label="Game Version" value={selected.game_version} />
              <Info label="Size" value={selected.size} />
              <Info label="Last checked" value={formatDate(selected.last_checked)} />
              <Info label="Latest version" value={selected.latest_version} />
            </div>

            {selected.summary && <p className="summary">{selected.summary}</p>}

            <section className="content-section">
              <h3>Dependencies</h3>
              {selected.dependencies.length > 0 ? (
                <div className="chips">
                  {selected.dependencies.map((dependency) => {
                    const trackedDependency = trackedDependencyMatches.get(dependencyKey(dependency));
                    return trackedDependency ? (
                      <button key={dependencyKey(dependency)} onClick={() => setSelectedId(trackedDependency.id)} type="button">
                        {dependency.name}
                      </button>
                    ) : (
                      <span key={dependencyKey(dependency)}>{dependency.name}</span>
                    );
                  })}
                </div>
              ) : (
                <p className="muted">No dependencies detected.</p>
              )}
            </section>

            <section className="content-section">
              <h3>Required by</h3>
              {selected.dependents.length > 0 ? (
                <div className="chips">
                  {selected.dependents.map((dependent) => (
                    <button key={dependent.id} onClick={() => setSelectedId(dependent.id)} type="button">
                      {dependent.name ?? dependent.id}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="muted">No tracked mods depend on this mod.</p>
              )}
            </section>

            <section className="content-section">
              <h3>Changelog</h3>
              {changelogEntries.length > 0 ? (
                <div className="changelog-list">
                  {changelogEntries.map((entry) => (
                    <article className="changelog-entry" key={entry.version}>
                      <button className="changelog-toggle" onClick={() => toggleChangelogVersion(entry.version)} type="button">
                        {expandedChangelogVersions.has(entry.version) ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                        <span>{entry.version}</span>
                      </button>
                      {expandedChangelogVersions.has(entry.version) && (
                        entry.lines.length > 0 ? (
                          <div className="changelog-lines">
                            {entry.lines.map((line, index) => (
                              <p className={line.endsWith(":") ? "changelog-label" : ""} key={`${entry.version}-${index}`}>
                                {line}
                              </p>
                            ))}
                          </div>
                        ) : (
                          <p className="muted">No notes for this version.</p>
                        )
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="muted">No changelog stored.</p>
              )}
            </section>
          </>
        ) : (
          <div className="placeholder">
            <h2>Add a mod</h2>
            <p>Enter a Workshop ID on the left to start the first fetch.</p>
          </div>
          )}
        </section>
      )}
    </main>
  );
}

function GraphView({
  mods,
  selectedId,
  loading,
  onRefresh,
  onSelect,
}: {
  mods: Mod[];
  selectedId: string | null;
  loading: boolean;
  onRefresh: () => void;
  onSelect: (id: string) => void;
}) {
  const graph = React.useMemo(() => buildGraph(mods), [mods]);
  const selectedNode = selectedId ? graph.nodes.find((node) => node.mod.id === selectedId) : null;

  return (
    <section className="detail graph-detail" aria-label="Mod dependency graph">
      <header className="detail-header">
        <div>
          <p>Dependency Graph</p>
          <h2>Tracked Mods</h2>
        </div>
        <div className="graph-summary">
          <span>{graph.nodes.length} mods</span>
          <span>{graph.edges.length} links</span>
          <button className="icon-button" onClick={onRefresh} disabled={loading} title="Refresh graph" type="button">
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      {graph.nodes.length > 0 ? (
        <div className="graph-canvas">
          <svg role="img" viewBox="0 0 1000 700" aria-label="Tracked mod dependency graph">
            <defs>
              <marker id="graph-arrow" markerHeight="10" markerWidth="10" orient="auto" refX="9" refY="3" viewBox="0 0 10 6">
                <path d="M0,0 L10,3 L0,6 Z" />
              </marker>
            </defs>

            {graph.edges.map((edge) => {
              const from = graph.nodeMap.get(edge.from);
              const to = graph.nodeMap.get(edge.to);
              if (!from || !to) return null;
              const endpoints = edgeEndpoints(from, to);
              return (
                <line
                  className={`graph-edge ${selectedId && (edge.from === selectedId || edge.to === selectedId) ? "active" : ""}`}
                  key={`${edge.from}-${edge.to}`}
                  markerEnd="url(#graph-arrow)"
                  x1={endpoints.x1}
                  x2={endpoints.x2}
                  y1={endpoints.y1}
                  y2={endpoints.y2}
                />
              );
            })}

            {graph.nodes.map((node) => {
              const isSelected = node.mod.id === selectedId;
              const label = node.mod.name ?? node.mod.id;
              return (
                <g
                  className={`graph-node ${node.mod.status.toLowerCase()} ${isSelected ? "selected" : ""} ${node.mod.current_version ? "installed" : ""}`}
                  key={node.mod.id}
                  onClick={() => onSelect(node.mod.id)}
                  role="button"
                  tabIndex={0}
                >
                  <title>{label}</title>
                  <circle cx={node.x} cy={node.y} r={isSelected ? 48 : 40} />
                  <text x={node.x} y={node.y - 4}>
                    {shortGraphLabel(label)}
                  </text>
                  <text className="graph-node-meta" x={node.x} y={node.y + 18}>
                    {node.mod.dependencies.length} deps · {node.mod.dependents.length} req
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      ) : (
        <div className="placeholder">
          <h2>No graph data</h2>
          <p>Add tracked mods to build the dependency graph.</p>
        </div>
      )}

      {selectedNode && (
        <div className={`status-band ${selectedNode.mod.status.toLowerCase()}`}>
          <StatusIcon status={selectedNode.mod.status} />
          <strong>{selectedNode.mod.name ?? selectedNode.mod.id}</strong>
          <span>Installed {selectedNode.mod.current_version ?? UNKNOWN_VALUE} · Latest {selectedNode.mod.latest_version ?? UNKNOWN_VALUE}</span>
        </div>
      )}
    </section>
  );
}

function StatusIcon({ status }: { status: ModStatus }) {
  if (status === "UPDATE_AVAILABLE") return <TriangleAlert className="status-icon warn" size={20} />;
  if (status === "UP_TO_DATE") return <CheckCircle2 className="status-icon ok" size={20} />;
  return <RefreshCw className="status-icon unknown" size={20} />;
}

function Info({ label, value, href }: { label: string; value: string | null; href?: string | null }) {
  return (
    <div className="info">
      <span>{label}</span>
      {href && value ? <a href={href} target="_blank" rel="noreferrer">{value}</a> : <strong>{value ?? UNKNOWN_VALUE}</strong>}
    </div>
  );
}

function statusLabel(status: ModStatus) {
  if (status === "UPDATE_AVAILABLE") return "Update available";
  if (status === "UP_TO_DATE") return "Up to date";
  return "Status unknown";
}

function formatDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function parseChangelog(value: string | null): ChangelogEntry[] {
  if (!value) return [];
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const entries: ChangelogEntry[] = [];

  for (const line of lines) {
    if (/^v?\d+(?:[._-]\d+)+(?:[A-Za-z0-9._+-]*)?$/.test(line)) {
      entries.push({ version: line, lines: [] });
      continue;
    }

    if (entries.length === 0) {
      entries.push({ version: "Notes", lines: [] });
    }
    entries[entries.length - 1].lines.push(line);
  }

  return entries;
}

function sortMods(mods: Mod[], sortMode: SortMode): Mod[] {
  const statusRank: Record<ModStatus, number> = {
    UPDATE_AVAILABLE: 0,
    UNKNOWN: 1,
    UP_TO_DATE: 2,
  };

  return [...mods].sort((left, right) => {
    if (sortMode === "updates") {
      return statusRank[left.status] - statusRank[right.status] || compareByName(left, right);
    }

    if (sortMode === "status") {
      return statusRank[left.status] - statusRank[right.status] || compareByName(left, right);
    }

    if (sortMode === "last_checked") {
      return timestamp(right.last_checked) - timestamp(left.last_checked) || compareByName(left, right);
    }

    return compareByName(left, right);
  });
}

function filterMods(mods: Mod[], searchQuery: string): Mod[] {
  const query = searchQuery.trim().toLowerCase();
  if (!query) return mods;

  return mods.filter((mod) => {
    const searchable = [
      mod.name,
      mod.id,
      mod.current_version,
      mod.latest_version,
      mod.status,
      ...mod.dependencies.map((dependency) => dependency.name),
      ...mod.dependents.map((dependent) => dependent.name ?? dependent.id),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return searchable.includes(query);
  });
}

function compareByName(left: Mod, right: Mod): number {
  const leftName = left.name ?? left.id;
  const rightName = right.name ?? right.id;
  return leftName.localeCompare(rightName, undefined, { numeric: true, sensitivity: "base" }) || left.id.localeCompare(right.id);
}

function timestamp(value: string | null): number {
  return value ? new Date(value).getTime() || 0 : 0;
}

function findTrackedDependency(dependency: Dependency, mods: Mod[]): Mod | null {
  return mods.find((mod) => dependencyMatchesMod(dependency, mod)) ?? null;
}

function dependencyMatchesMod(dependency: Dependency, mod: Mod): boolean {
  const modId = normalizeMatchValue(mod.id);
  const modName = normalizeMatchValue(mod.name);
  const dependencyName = normalizeMatchValue(dependency.name);
  const dependencyUrl = normalizeMatchValue(dependency.url);

  return Boolean(dependencyUrl && modId && dependencyUrl.includes(modId)) || dependencyName === modId || Boolean(modName && dependencyName === modName);
}

function dependencyKey(dependency: Dependency): string {
  return `${dependency.name}-${dependency.url ?? ""}`;
}

function normalizeMatchValue(value: string | null): string {
  if (!value) return "";
  return value.toLowerCase().trim().replace(/\s+/g, " ");
}

function buildGraph(mods: Mod[]): { nodes: GraphNode[]; edges: GraphEdge[]; nodeMap: Map<string, GraphNode> } {
  const sorted = sortMods(mods, "name");
  const centerX = 500;
  const centerY = 350;
  const radiusX = sorted.length <= 2 ? 210 : 370;
  const radiusY = sorted.length <= 2 ? 150 : 245;

  const nodes = sorted.map((mod, index) => {
    if (sorted.length === 1) return { mod, x: centerX, y: centerY };
    const angle = -Math.PI / 2 + (index / sorted.length) * Math.PI * 2;
    return {
      mod,
      x: Math.round(centerX + Math.cos(angle) * radiusX),
      y: Math.round(centerY + Math.sin(angle) * radiusY),
    };
  });
  const nodeMap = new Map(nodes.map((node) => [node.mod.id, node]));
  const edgeMap = new Map<string, GraphEdge>();

  for (const mod of sorted) {
    for (const dependency of mod.dependencies) {
      const target = findTrackedDependency(dependency, sorted);
      if (!target || target.id === mod.id) continue;
      const key = `${mod.id}-${target.id}`;
      edgeMap.set(key, { from: mod.id, to: target.id });
    }
  }

  return { nodes, edges: [...edgeMap.values()], nodeMap };
}

function edgeEndpoints(from: GraphNode, to: GraphNode): { x1: number; y1: number; x2: number; y2: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy) || 1;
  const startOffset = 48;
  const endOffset = 52;

  return {
    x1: from.x + (dx / distance) * startOffset,
    y1: from.y + (dy / distance) * startOffset,
    x2: to.x - (dx / distance) * endOffset,
    y2: to.y - (dy / distance) * endOffset,
  };
}

function shortGraphLabel(value: string): string {
  return value.length > 24 ? `${value.slice(0, 21)}...` : value;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
