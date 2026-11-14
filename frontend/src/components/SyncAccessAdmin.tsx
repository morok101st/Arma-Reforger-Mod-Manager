import React from "react";
import { Download, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import type { createApiClient, SyncAccessOverview } from "../lib/api";
import type { Modset } from "../types";
import { CustomSelect, Dialog } from "./common";
import { formatDate } from "../lib/utils";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { SyncAccessWizard } from "./SyncAccessWizard";

type Filter = "all" | "active" | "disabled" | "blocked";
const stateOf = (row: SyncAccessOverview) => row.usable ? "active" : row.enabled ? "blocked" : "disabled";

export function SyncAccessAdmin({api}: {api: ReturnType<typeof createApiClient>}) {
  const [rows, setRows] = React.useState<SyncAccessOverview[]>([]);
  const [modsets, setModsets] = React.useState<Modset[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [attempt, setAttempt] = React.useState(0);
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("all");
  const [wizard, setWizard] = React.useState<{entry: SyncAccessOverview | null} | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<SyncAccessOverview | null>(null);
  const [disableTarget, setDisableTarget] = React.useState<SyncAccessOverview | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const action = useAsyncAction();
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    Promise.all([api.listSyncAccess(),api.listAdminModsets()]).then(([data,sets]) => { if (!cancelled) { setRows(data);setModsets(sets);setLoaded(true); } })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : "Could not load sync access."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [api, attempt]);
  const eligible = modsets.filter(set => !rows.some(row => row.modset_id === set.id));
  const matches = rows.filter(row => (filter === "all" || stateOf(row) === filter) && `${row.configuration?.name ?? row.modset_name} ${row.modset_name} ${row.configuration?.gameServer?.host ?? ""}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  function download(row: SyncAccessOverview) {
    setMessage(null);
    action.run(async () => {
      const config = await api.downloadSavedSync(row.modset_id);
      const url = URL.createObjectURL(new Blob([JSON.stringify(config,null,2)+"\n"],{type:"application/json"}));
      const link=document.createElement("a");link.href=url;link.download="armm-sync.json";document.body.append(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
      setMessage("Configuration downloaded. Keep it private; it contains the sync key.");
    }).catch(()=>null);
  }
  return <section className="content-section admin-section sync-admin">
    <div className="section-title-row"><h3>Sync access</h3><div className="dialog-actions">
      <button className="secondary-button compact" type="button" disabled={loading || action.loading} onClick={()=>setAttempt(value=>value+1)}><RefreshCw size={16} />Refresh</button>
      <button className="primary-button compact" type="button" disabled={!loaded || loading || Boolean(error) || !eligible.length} onClick={()=>setWizard({entry:null})}><Plus size={16} />Create sync access</button>
    </div></div>
    <p className="muted">Configured sync access only. Create an access to choose a modset and save its connection details.</p>
    {error && <div className="error-box" role="alert">{error} <button className="secondary-button compact" type="button" disabled={loading} onClick={()=>setAttempt(value=>value+1)}>Retry sync overview</button></div>}
    {action.error && <p className="error-box" role="alert">{action.error}</p>}
    {message && <p role="status">{message}</p>}
    {!loaded && loading && <p role="status">Loading sync access…</p>}
    {loaded && <>
      {rows.length > 0 && <div className="modsets-filters">
        <label>Search sync access<input type="search" placeholder="Name, modset or server" value={search} onChange={event=>setSearch(event.target.value)} /></label>
        <label>Status<CustomSelect<Filter> value={filter} onChange={setFilter} ariaLabel="Filter sync access" options={[{value:"all",label:"All accesses"},{value:"active",label:"Active"},{value:"disabled",label:"Disabled"},{value:"blocked",label:"Blocked"}]} /></label>
        <span className="muted" role="status">{matches.length} of {rows.length} accesses · {rows.filter(row=>row.usable).length} active</span>
      </div>}
      {rows.length === 0 ? <div className="modsets-empty"><h4>No sync access configured</h4><p className="muted">Use Create sync access to choose a modset, enter connection details and create an import file.</p>{!modsets.length && <p className="muted">Create a modset first.</p>}</div> : !matches.length ? <p className="muted">No sync access matches this search and status filter.</p> : <table className="modsets-table sync-access-table" aria-label="Sync access overview">
        <thead><tr><th scope="col">Access</th><th scope="col">Connection</th><th scope="col">Status</th><th scope="col">Usage</th><th scope="col">Actions</th></tr></thead>
        <tbody>{matches.map(row=><tr key={row.modset_id}>
          <td className="modset-name-cell"><strong>{row.configuration?.name ?? row.modset_name}</strong><small>Modset: {row.modset_name}</small>{row.parent_modset_name && <small>Parent: {row.parent_modset_name}</small>}</td>
          <td><span className="mobile-cell-label">Connection</span>{row.configuration ? <><small>{row.configuration.baseUrl}</small><small>{row.configuration.gameServer ? `${row.configuration.gameServer.host}:${row.configuration.gameServer.port}` : "No game server included"}</small></> : <small>Finish setup to save connection details</small>}</td>
          <td><span className="mobile-cell-label">Status</span><strong>{row.usable ? "Active" : row.enabled ? "Blocked" : "Disabled"}</strong>{!row.downloadable && <small>{!row.configuration ? "Setup needed" : row.enabled && row.usable ? "Restore key to download" : "Enable to download"}</small>}</td>
          <td><span className="mobile-cell-label">Usage</span><small>By: {row.created_by ?? "Deleted account"}</small><small>Last access: {formatDate(row.last_used_at) ?? "Never"}</small></td>
          <td><div className="modset-actions">
            <button className="secondary-button compact" type="button" disabled={action.loading} aria-label={`Edit sync access ${row.configuration?.name ?? row.modset_name}`} onClick={()=>{action.setError(null);setWizard({entry:row});}}><Pencil size={16} />{row.configuration ? "Edit" : "Finish setup"}</button>
            <button className="secondary-button compact" type="button" disabled={action.loading || !row.downloadable} aria-label={`Download configuration ${row.configuration?.name ?? row.modset_name}`} onClick={()=>download(row)}><Download size={16} />Download</button>
            <button className="secondary-button compact danger-button" type="button" disabled={action.loading} aria-label={`Delete sync access ${row.configuration?.name ?? row.modset_name}`} onClick={()=>{action.setError(null);setDeleteTarget(row);}}><Trash2 size={16} />Delete</button>
            {row.enabled && <button className="secondary-button compact" type="button" disabled={action.loading} onClick={()=>{action.setError(null);setDisableTarget(row);}}>Disable</button>}
          </div></td>
        </tr>)}</tbody>
      </table>}
      {rows.length > 0 && !eligible.length && <p className="muted">Every modset already has an access. Edit an existing entry to update or enable it.</p>}
    </>}
    {wizard && <SyncAccessWizard api={api} entry={wizard.entry} modsets={wizard.entry ? modsets : eligible} onClose={()=>setWizard(null)} onSaved={()=>{setWizard(null);setAttempt(value=>value+1);setMessage("Sync access saved. Download its configuration from the row.");}} />}
    {deleteTarget && <Dialog title="Delete sync access" onClose={()=>setDeleteTarget(null)}>
      <div className="dialog-form">
        <p>Permanently delete <strong>{deleteTarget.configuration?.name ?? deleteTarget.modset_name}</strong>?</p>
        <p className="muted">The key and saved connection settings will be removed. Existing app configurations will stop working. The modset <strong>{deleteTarget.modset_name}</strong> and its mods will be kept.</p>
        {action.error && <p className="error-box" role="alert">{action.error}</p>}
        <div className="dialog-actions">
          <button className="secondary-button compact" type="button" disabled={action.loading} onClick={()=>setDeleteTarget(null)}>Cancel</button>
          <button className="secondary-button compact danger-button" type="button" disabled={action.loading} onClick={()=>action.run(async()=>{
            await api.deleteSyncAccess(deleteTarget.modset_id);
            setRows(previous=>previous.filter(row=>row.modset_id!==deleteTarget.modset_id));
            setDeleteTarget(null);setAttempt(value=>value+1);setMessage("Sync access deleted. Its modset is available for a new access.");
          }).catch(()=>null)}>Delete permanently</button>
        </div>
      </div>
    </Dialog>}
    {disableTarget && <Dialog title="Disable sync access" onClose={()=>setDisableTarget(null)}><div className="dialog-form"><p>Disable <strong>{disableTarget.configuration?.name ?? disableTarget.modset_name}</strong>? Existing app configurations will stop working.</p>{action.error && <p className="error-box" role="alert">{action.error}</p>}<div className="dialog-actions"><button className="secondary-button compact" type="button" onClick={()=>setDisableTarget(null)}>Cancel</button><button className="primary-button compact" type="button" disabled={action.loading} onClick={()=>action.run(async()=>{await api.disableSyncAccess(disableTarget.modset_id);setDisableTarget(null);setAttempt(value=>value+1);setMessage("Sync access disabled.");}).catch(()=>null)}>Confirm disable</button></div></div></Dialog>}
  </section>;
}
