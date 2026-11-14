import React from "react";
import type { createApiClient, SyncAccessOverview } from "../lib/api";
import type { Modset } from "../types";
import { CustomSelect, Dialog } from "./common";
import { useAsyncAction } from "../hooks/useAsyncAction";

type Api = ReturnType<typeof createApiClient>;

export function SyncAccessWizard({api, entry, modsets, onClose, onSaved}: {api: Api; entry: SyncAccessOverview | null; modsets: Modset[]; onClose: () => void; onSaved: (id: number) => void}) {
  const [step, setStep] = React.useState(0);
  const [modsetId, setModsetId] = React.useState(entry ? String(entry.modset_id) : "");
  const [name, setName] = React.useState(entry?.configuration?.name ?? entry?.modset_name ?? "");
  const [baseUrl, setBaseUrl] = React.useState(entry?.configuration?.baseUrl ?? entry?.base_url ?? window.location.origin);
  const [includeServer, setIncludeServer] = React.useState(Boolean(entry?.configuration?.gameServer));
  const [host, setHost] = React.useState(entry?.configuration?.gameServer?.host ?? "");
  const [port, setPort] = React.useState(String(entry?.configuration?.gameServer?.port ?? 2001));
  const [passwordRequired, setPasswordRequired] = React.useState(entry?.configuration?.gameServer?.passwordRequired ?? false);
  const [replaceKey, setReplaceKey] = React.useState(false);
  const [existingKey, setExistingKey] = React.useState("");
  const [confirmed, setConfirmed] = React.useState(false);
  const heading = React.useRef<HTMLHeadingElement>(null);
  const action = useAsyncAction();
  const selected = modsets.find(set => set.id === Number(modsetId));
  const serverValid = !includeServer || (host.trim() && Number.isInteger(Number(port)) && Number(port) >= 1 && Number(port) <= 65535);
  let urlValid = false;
  try { const url = new URL(baseUrl); urlValid = url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash && url.pathname === "/"; } catch { /* Inline validation explains the expected origin. */ }
  const needsKey = Boolean(entry && !entry.key_available && !replaceKey);
  const ready = Boolean(modsetId && name.trim() && serverValid && urlValid && (!needsKey || existingKey.trim()) && (entry && !replaceKey || confirmed));
  React.useEffect(() => { heading.current?.focus(); }, [step]);
  const labels = ["Modset and name", "Connection details", "Review and save"];
  function next(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < 2) { setStep(step + 1); return; }
    if (!ready) return;
    action.run(async () => {
      const settings = {name:name.trim(),baseUrl:baseUrl.trim().replace(/\/$/,""), ...(includeServer ? {gameServer:{host:host.trim(),port:Number(port),passwordRequired}} : {})};
      if (entry) await api.updateConfiguredSync(entry.modset_id, {...settings, replaceKey, ...(needsKey ? {accessKey:existingKey.trim()} : {})});
      else await api.createConfiguredSync({...settings, modset_id:Number(modsetId)});
      onSaved(Number(modsetId));
    }).catch(() => null);
  }
  return <Dialog title={entry ? "Edit sync access" : "Create sync access"} onClose={onClose}>
    <form className="dialog-form sync-wizard" onSubmit={next}>
      <ol className="sync-wizard-steps" aria-label="Setup progress">{labels.map((label,index) => <li key={label} aria-current={step === index ? "step" : undefined}>{label}</li>)}</ol>
      <h3 ref={heading} tabIndex={-1}>{labels[step]}</h3>
      <fieldset disabled={action.loading} className="sync-wizard-fields">
      {step === 0 && <>
        {entry ? <p>Modset: <strong>{entry.modset_name}</strong></p> : <label>Modset<CustomSelect value={modsetId} ariaLabel="Sync modset" onChange={id => {setModsetId(id); if (!name.trim()) setName(modsets.find(set => set.id === Number(id))?.name ?? "");}} options={[{value:"",label:"Choose a modset"},...modsets.map(set => ({value:String(set.id),label:set.name}))]} /></label>}
        {selected?.parent_modset_id && <p className="muted">Includes inherited mods and binding versions from {selected.parent_modset_name ?? "the parent"}. Changing or detaching the parent disables this access.</p>}
        <label>Access name<input value={name} onChange={event => setName(event.target.value)} maxLength={120} required /></label>
        <p className="muted">Choose a name users will recognize in the sync app. One access can be configured per modset.</p>
      </>}
      {step === 1 && <>
        <label>ARMM public URL<input type="url" value={baseUrl} onChange={event => setBaseUrl(event.target.value)} placeholder="https://armm.example.com" required /></label>
        {!urlValid && <p className="muted">Enter the public HTTPS origin, optionally with a port, without an API path.</p>}
        <label className="checkbox-row"><input type="checkbox" checked={includeServer} onChange={event => setIncludeServer(event.target.checked)} />Include game server details</label>
        {includeServer && <>
          <label>Game server host<input value={host} maxLength={255} onChange={event => setHost(event.target.value)} placeholder="gameserver.example.com" required /></label>
          <label>Game server port<input type="number" min={1} max={65535} step={1} value={port} onChange={event => setPort(event.target.value)} required /></label>
          <label className="checkbox-row"><input type="checkbox" checked={passwordRequired} onChange={event => setPasswordRequired(event.target.checked)} />The game server requires a password</label>
          <p className="muted">The app asks for the password. ARMM saves only the server address, port and password requirement.</p>
        </>}
      </>}
      {step === 2 && <>
        <dl className="sync-wizard-summary"><dt>Name</dt><dd>{name}</dd><dt>Modset</dt><dd>{entry?.modset_name ?? selected?.name}</dd><dt>ARMM URL</dt><dd>{baseUrl}</dd><dt>Game server</dt><dd>{includeServer ? `${host}:${port}${passwordRequired ? " · password required" : ""}` : "Not included"}</dd></dl>
        <p className="muted">Settings are saved for later edits and downloads. Anyone with the downloaded file can read this modset's export.</p>
        {entry && <label className="checkbox-row"><input type="checkbox" checked={replaceKey} onChange={event => {setReplaceKey(event.target.checked);setConfirmed(false);}} />Replace the key and enable access. Existing configurations will stop working.</label>}
        {needsKey && <><p className="muted">This older entry has no recoverable key. Enter its existing key once, or explicitly replace it above.</p><label>Existing sync key<input type="password" value={existingKey} autoComplete="off" onChange={event => setExistingKey(event.target.value)} required /></label></>}
        {(!entry || replaceKey) && <label className="checkbox-row"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} required />{entry ? "Invalidate the previous key and enable this access." : "Allow the sync app to read this modset, including inherited mods."}</label>}
        {entry && !replaceKey && !entry.usable && <p className="muted">Saving settings keeps this access disabled or blocked. Replace the key to enable it under your administrator account.</p>}
      </>}
      </fieldset>
      {action.error && <p className="error-box" role="alert">{action.error}</p>}
      <div className="dialog-actions">
        <button className="secondary-button compact" type="button" disabled={action.loading} onClick={onClose}>Cancel</button>
        {step > 0 && <button className="secondary-button compact" type="button" disabled={action.loading} onClick={() => {action.setError(null);setStep(step - 1);}}>Back</button>}
        <button className="primary-button compact" disabled={action.loading || (step === 0 && (!modsetId || !name.trim())) || (step === 1 && (!urlValid || !serverValid)) || (step === 2 && !ready)}>{action.loading ? "Saving…" : step < 2 ? "Next" : entry ? "Save sync access" : "Create sync access"}</button>
      </div>
    </form>
  </Dialog>;
}
