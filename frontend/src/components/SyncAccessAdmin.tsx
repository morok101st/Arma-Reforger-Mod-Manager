import React from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import type { createApiClient, SyncAccessOverview } from "../lib/api";
import { CustomSelect } from "./common";
import { formatDate } from "../lib/utils";
import { SyncAccessSection } from "./SyncAccessSection";

type Filter = "all" | "active" | "disabled" | "blocked";
const stateOf = (row: SyncAccessOverview) => row.usable ? "active" : row.enabled ? "blocked" : "disabled";

export function SyncAccessAdmin({api}: {api: ReturnType<typeof createApiClient>}) {
  const [rows, setRows] = React.useState<SyncAccessOverview[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [attempt, setAttempt] = React.useState(0);
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("all");
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const heading = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    api.listSyncAccess().then(data => { if (!cancelled) { setRows(data); setLoaded(true); } })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : "Could not load sync access."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [api, attempt]);
  React.useEffect(() => { if (selectedId !== null) heading.current?.focus(); }, [selectedId]);
  const selected = rows.find(row => row.modset_id === selectedId);
  const matches = rows.filter(row => (filter === "all" || stateOf(row) === filter) && `${row.modset_name} ${row.owner_username ?? ""} ${row.parent_modset_name ?? ""}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));

  return <section className="content-section admin-section sync-admin">
    <div className="section-title-row"><h3>Sync access</h3><button className="secondary-button compact" type="button" disabled={loading} onClick={() => setAttempt(value => value + 1)}><RefreshCw size={16} />Refresh</button></div>
    <p className="muted">Administrator-managed desktop access. Each modset has at most one export-only key.</p>
    {error && <div className="error-box" role="alert">{error} <button className="secondary-button compact" type="button" disabled={loading} onClick={() => setAttempt(value => value + 1)}>Retry sync overview</button></div>}
    {!loaded && loading && <p role="status">Loading sync access…</p>}
    {loaded && selected ? <div className="sync-admin-editor">
      <button className="secondary-button compact" type="button" onClick={() => { setSelectedId(null); window.setTimeout(() => document.getElementById(`sync-manage-${selectedId}`)?.focus(), 0); }}><ArrowLeft size={16} />Back to sync overview</button>
      <h4 ref={heading} tabIndex={-1}>{selected.modset_name}</h4>
      <p className="muted">Owner: {selected.owner_username ?? "Unknown"}{selected.parent_modset_name ? ` · Parent: ${selected.parent_modset_name}` : ""}</p>
      <div className="dialog-form"><SyncAccessSection key={selected.modset_id} modset={{id:selected.modset_id,name:selected.modset_name,parent_modset_id:selected.parent_modset_id}} api={api} onChanged={status => { setRows(previous => previous.map(row => row.modset_id === selected.modset_id ? {...row,...status} : row)); setAttempt(value => value + 1); }} /></div>
    </div> : loaded && <>
      <div className="modsets-filters">
        <label>Search sync access<input type="search" placeholder="Modset, owner or parent" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <label>Status<CustomSelect<Filter> value={filter} onChange={setFilter} ariaLabel="Filter sync access" options={[{value:"all",label:"All modsets"},{value:"active",label:"Active"},{value:"disabled",label:"Disabled"},{value:"blocked",label:"Blocked"}]} /></label>
        <span className="muted" role="status">{matches.length} of {rows.length} modsets · {rows.filter(row => row.usable).length} active</span>
      </div>
      {rows.length === 0 ? <p className="muted">No modsets exist yet. Create a modset before granting sync access.</p> : matches.length === 0 ? <p className="muted">No modsets match this search and status filter.</p> : <table className="modsets-table" aria-label="Sync access overview">
        <thead><tr><th scope="col">Modset</th><th scope="col">Owner</th><th scope="col">Status</th><th scope="col">Usage</th><th scope="col">Actions</th></tr></thead>
        <tbody>{matches.map(row => <tr key={row.modset_id}>
          <td className="modset-name-cell"><strong>{row.modset_name}</strong>{row.parent_modset_name && <small>Parent: {row.parent_modset_name}</small>}</td>
          <td><span className="mobile-cell-label">Owner</span>{row.owner_username ?? "Unknown"}</td>
          <td><span className="mobile-cell-label">Status</span><strong>{row.usable ? "Active" : row.enabled ? "Blocked" : "Disabled"}</strong>{row.enabled && !row.usable && <small>Renew as an active administrator</small>}</td>
          <td><span className="mobile-cell-label">Usage</span>{row.created_at ? <><small>Created: {formatDate(row.created_at)}</small><small>By: {row.created_by ?? "Deleted account"}</small><small>Last access: {formatDate(row.last_used_at) ?? "Never"}</small></> : <small>No key created</small>}</td>
          <td><div className="modset-actions"><button className="secondary-button compact" type="button" id={`sync-manage-${row.modset_id}`} aria-label={`Manage sync access for ${row.modset_name}`} onClick={() => setSelectedId(row.modset_id)}>Manage</button></div></td>
        </tr>)}</tbody>
      </table>}
    </>}
  </section>;
}
