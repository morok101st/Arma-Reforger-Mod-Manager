import React from "react";
import { Download, Pencil, Plus, Trash2, Ban, KeyRound, Play } from "lucide-react";
import type { createApiClient, SyncAccessOverview } from "../lib/api";
import type { Modset } from "../types";
import { Dialog, RowActions } from "./common";
import { formatDate } from "../lib/utils";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { SyncAccessWizard } from "./SyncAccessWizard";


const accessActions = {
  enable: { label: "Enable", message: "Sync access enabled. Existing configurations can connect again." },
  disable: { label: "Disable", message: "Sync access disabled." },
  renew: { label: "Renew key", message: "Sync key renewed. Download and import the new configuration when the access is enabled." },
} as const;

export function SyncAccessAdmin({api}: {api: ReturnType<typeof createApiClient>}) {
  const [rows, setRows] = React.useState<SyncAccessOverview[]>([]);
  const [modsets, setModsets] = React.useState<Modset[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [attempt, setAttempt] = React.useState(0);
  const [wizard, setWizard] = React.useState<{entry: SyncAccessOverview | null} | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<SyncAccessOverview | null>(null);
  const [accessTarget, setAccessTarget] = React.useState<{ row: SyncAccessOverview; kind: keyof typeof accessActions } | null>(null);
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
  function openAccessAction(row: SyncAccessOverview, kind: keyof typeof accessActions) {
    action.setError(null);
    setMessage(null);
    setAccessTarget({row, kind});
  }

  function confirmAccessAction() {
    if (!accessTarget) return;
    const { row, kind } = accessTarget;
    action.run(async () => {
      const id = row.modset_id;
      const status = await (kind === "enable" ? api.enableSyncAccess(id)
        : kind === "disable" ? api.disableSyncAccess(id) : api.renewSyncKey(id));
      setRows(previous => previous.map(entry => entry.modset_id === id ? {...entry, ...status} : entry));
      setAccessTarget(null);
      setAttempt(value => value + 1);
      setMessage(accessActions[kind].message);
    }).catch(() => null);
  }

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
      <button className="primary-button compact" type="button" disabled={!loaded || loading || Boolean(error) || !eligible.length} onClick={()=>setWizard({entry:null})}><Plus size={16} />Create sync access</button>
    </div></div>
    <p className="muted">Configured sync access only. Create an access to choose a modset and save its connection details.</p>
    {error && <div className="error-box" role="alert">{error} <button className="secondary-button compact" type="button" disabled={loading} onClick={()=>setAttempt(value=>value+1)}>Retry sync overview</button></div>}
    {action.error && <p className="error-box" role="alert">{action.error}</p>}
    {message && <p role="status">{message}</p>}
    {!loaded && loading && <p role="status">Loading sync access…</p>}
    {loaded && <>
      {rows.length === 0 ? <div className="modsets-empty"><h4>No sync access configured</h4><p className="muted">Use Create sync access to choose a modset, enter connection details and create an import file.</p>{!modsets.length && <p className="muted">Create a modset first.</p>}</div> : <table className="modsets-table sync-access-table" aria-label="Sync access overview">
        <thead><tr><th scope="col">Access</th><th scope="col">Connection</th><th scope="col">Usage</th><th scope="col">Actions</th></tr></thead>
        <tbody>{rows.map(row=><tr key={row.modset_id}>
          <td className="modset-name-cell">
            <div className="modset-row-header">
              <strong>{row.configuration?.name ?? row.modset_name}</strong>
              <span className={`resource-status-badge${row.usable ? " active" : ""}`}>{row.usable ? "Active" : row.enabled ? "Blocked" : "Disabled"}</span>
            </div>
            <small>Modset: {row.modset_name}</small>
            {row.parent_modset_name && <small>Parent: {row.parent_modset_name}</small>}
            {!row.downloadable && <small>{!row.configuration ? "Setup needed" : !row.can_enable ? "Renew key to restore access" : row.enabled ? "Restore or renew key to download" : "Enable from the actions menu"}</small>}
          </td>
          <td><span className="mobile-cell-label">Connection</span>{row.configuration ? <><small>{row.configuration.baseUrl}</small><small>{row.configuration.gameServer ? `${row.configuration.gameServer.host}:${row.configuration.gameServer.port}` : "No game server included"}</small></> : <small>Finish setup to save connection details</small>}</td>
          <td className="sync-access-usage"><span className="mobile-cell-label">Usage</span><small>By: {row.created_by ?? "Deleted account"}</small><small>Last access: {formatDate(row.last_used_at) ?? "Never"}</small></td>
          <td><RowActions label={`More actions for sync access ${row.configuration?.name ?? row.modset_name}`}>
              <button type="button" disabled={action.loading} aria-label={`Edit sync access ${row.configuration?.name ?? row.modset_name}`} onClick={()=>{action.setError(null);setWizard({entry:row});}}><Pencil size={16} />{row.configuration ? "Edit" : "Finish setup"}</button>
                <button type="button" disabled={action.loading || !row.downloadable} aria-label={`Download configuration ${row.configuration?.name ?? row.modset_name}`} onClick={()=>download(row)}><Download size={16} />Download</button>
                {row.enabled
                  ? <button type="button" disabled={action.loading || loading} onClick={() => openAccessAction(row, "disable")}><Ban size={16} />Disable</button>
                  : <button type="button" disabled={action.loading || loading || !row.can_enable} onClick={() => openAccessAction(row, "enable")}><Play size={16} />Enable</button>}
                <button type="button" disabled={action.loading || loading} onClick={() => openAccessAction(row, "renew")}><KeyRound size={16} />Renew key</button>
                <button className="modset-delete-action" type="button" disabled={action.loading} aria-label={`Delete sync access ${row.configuration?.name ?? row.modset_name}`} onClick={()=>{action.setError(null);setDeleteTarget(row);}}><Trash2 size={16} />Delete</button>
            </RowActions></td>
        </tr>)}</tbody>
      </table>}
      {rows.length > 0 && !eligible.length && <p className="muted">Every modset already has an access. Use the actions menu to manage an existing access.</p>}
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
    {accessTarget && <Dialog title={accessTarget.kind === "renew" ? "Renew sync key" : `${accessActions[accessTarget.kind].label} sync access`} onClose={() => setAccessTarget(null)}>
      <div className="dialog-form">
        <p><strong>{accessTarget.row.configuration?.name ?? accessTarget.row.modset_name}</strong></p>
        <p className="muted">{accessTarget.kind === "enable"
          ? "The current key will work again. Existing imported configurations can reconnect."
          : accessTarget.kind === "disable"
            ? "Connections will stop until you enable this access again. The current key and settings are kept."
            : `The current key will stop working. Import a new configuration after renewal.${accessTarget.row.enabled ? "" : " This access will stay disabled until you enable it."}`}</p>
        {action.error && <p className="error-box" role="alert">{action.error}</p>}
        <div className="dialog-actions">
          <button className="secondary-button compact" type="button" disabled={action.loading} onClick={() => setAccessTarget(null)}>Cancel</button>
          <button className="primary-button compact" type="button" disabled={action.loading} onClick={confirmAccessAction}>
            {accessTarget.kind === "renew" ? "Confirm renewal" : `Confirm ${accessTarget.kind}`}
          </button>
        </div>
      </div>
    </Dialog>}
  </section>;
}
