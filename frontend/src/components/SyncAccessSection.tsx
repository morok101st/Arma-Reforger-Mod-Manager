import React from "react";
import type { SyncAccessStatus, createApiClient } from "../lib/api";
import type { Modset } from "../types";
import { useAsyncAction } from "../hooks/useAsyncAction";

type Api = ReturnType<typeof createApiClient>;
type SyncStatus = Awaited<ReturnType<Api["getSyncAccess"]>>;

export function SyncAccessSection({modset, api, onChanged}: {modset: Pick<Modset, "id" | "name" | "parent_modset_id">; api: Api; onChanged: (status: SyncAccessStatus) => void}) {
  const [status, setStatus] = React.useState<SyncStatus | null>(null);
  const [attempt, setAttempt] = React.useState(0);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [key, setKey] = React.useState("");
  const [replaceConfirmed, setReplaceConfirmed] = React.useState(false);
  const [name, setName] = React.useState(modset.name);
  const [baseUrl, setBaseUrl] = React.useState("");
  const [includeServer, setIncludeServer] = React.useState(false);
  const [host, setHost] = React.useState("");
  const [port, setPort] = React.useState("2001");
  const [passwordRequired, setPasswordRequired] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const action = useAsyncAction();
  React.useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    api.getSyncAccess(modset.id).then(data => {
      if (!cancelled) { setStatus(data); setBaseUrl(data.base_url || window.location.origin); }
    }).catch(error => { if (!cancelled) setLoadError(error instanceof Error ? error.message : "Could not load sync access."); });
    return () => { cancelled = true; };
  }, [api, modset.id, attempt]);

  const run = (work: () => Promise<void>) => { setMessage(null); action.run(work).catch(() => null); };
  return <fieldset className="modset-permission-editor sync-access-section" disabled={action.loading}>
    <legend>Sync access</legend>
    <p className="muted">Share this modset's installed versions and export order with the desktop app. One key per modset; no ARMM account is needed to use it.</p>
    {modset.parent_modset_id && <p className="muted">Includes inherited parent mods. Access requires an active administrator who can read the parent. Changing or detaching the parent disables this release.</p>}
    {loadError ? <><p className="error-box" role="alert">{loadError}</p><button className="secondary-button compact" type="button" onClick={() => setAttempt(value => value + 1)}>Retry sync access</button></> : !status ? <p role="status">Loading sync access…</p> : <>
      <p><strong>{status.usable ? "Active" : status.enabled ? "Blocked by current permissions — replace the key to renew" : "Disabled"}</strong></p>
      {status.last_used_at && <p className="muted">Last successful access: {new Date(status.last_used_at).toLocaleString()}</p>}
      {status.enabled && <label className="checkbox-row"><input type="checkbox" checked={replaceConfirmed} onChange={event => setReplaceConfirmed(event.target.checked)} />Replace the key. Existing desktop configurations will stop working.</label>}
      <div className="dialog-actions">
        <button className="secondary-button compact" type="button" disabled={status.enabled && !replaceConfirmed} onClick={() => run(async () => {
          const result = await api.createSyncAccess(modset.id);
          setStatus(result); onChanged(result); setKey(result.access_key); setReplaceConfirmed(false);
          setMessage("Key created. Download the configuration before closing, or save the key securely.");
        })}>{status.enabled ? "Replace sync key" : "Create sync key"}</button>
        {status.enabled && <button className="secondary-button compact" type="button" onClick={() => run(async () => {
          const result = await api.disableSyncAccess(modset.id); setStatus(result); onChanged(result); setKey(""); setReplaceConfirmed(false); setMessage("Sync access disabled. Existing configurations no longer work.");
        })}>Disable sync access</button>}
      </div>
      {status.usable && <>
        <p className="muted">The key is shown only when created. For another download, enter the current key or replace it. Anyone with the file can read this modset's export. Changes apply immediately.</p>
        <label>Sync access key<input type="password" autoComplete="off" value={key} onChange={event => setKey(event.target.value)} spellCheck={false} /></label>
        <button className="secondary-button compact" type="button" disabled={!key.trim()} onClick={() => run(async () => { await navigator.clipboard.writeText(key.trim()); setMessage("Sync key copied."); })}>Copy sync key</button>
        <label>Configuration name<input value={name} maxLength={120} onChange={event => setName(event.target.value)} /></label>
        <label>ARMM public URL<input type="url" placeholder="https://armm.example.com" value={baseUrl} onChange={event => setBaseUrl(event.target.value)} /></label>
        <label className="checkbox-row"><input type="checkbox" checked={includeServer} onChange={event => setIncludeServer(event.target.checked)} />Include game server details</label>
        {includeServer && <>
          <label>Game server host<input value={host} maxLength={255} onChange={event => setHost(event.target.value)} placeholder="gameserver.example.com" /></label>
          <label>Game server port<input type="number" min={1} max={65535} step={1} value={port} onChange={event => setPort(event.target.value)} /></label>
          <label className="checkbox-row"><input type="checkbox" checked={passwordRequired} onChange={event => setPasswordRequired(event.target.checked)} />The game server requires a password</label>
          <p className="muted">The desktop app asks for the password. Server details are used for this download only and are not stored in ARMM.</p>
        </>}
        <button className="secondary-button compact" type="button" disabled={!key.trim() || !name.trim() || !baseUrl.trim() || (includeServer && (!host.trim() || !Number.isInteger(Number(port)) || Number(port) < 1 || Number(port) > 65535))} onClick={() => run(async () => {
          const config = await api.downloadSyncConfiguration(modset.id, {name: name.trim(), baseUrl: baseUrl.trim(), accessKey: key.trim(), ...(includeServer ? {gameServer: {host: host.trim(), port: Number(port), passwordRequired}} : {})});
          const url = URL.createObjectURL(new Blob([JSON.stringify(config, null, 2) + "\n"], {type: "application/json"}));
          const link = document.createElement("a"); link.href = url; link.download = "armm-sync.json"; document.body.append(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
          setMessage("Configuration downloaded. Keep it private; it contains the sync key.");
        })}>Download armm-sync.json</button>
      </>}
    </>}
    {action.error && <p className="error-box" role="alert">{action.error}</p>}
    {message && <p role="status">{message}</p>}
  </fieldset>;
}
