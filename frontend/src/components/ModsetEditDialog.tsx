import React from "react";
import { SyncAccessSection } from "./SyncAccessSection";
import type { LoadState } from "../hooks/useLoadState";
import { ResourceStatus } from "./ResourceStatus";

import type { createApiClient } from "../lib/api";
import type { GroupPermission, GroupSummary, Modset } from "../types";
import { CustomSelect, Dialog } from "./common";
import { useAsyncAction } from "../hooks/useAsyncAction";

function permissionKey(entries: GroupPermission[]) {
  return JSON.stringify([...entries].sort((a, b) => a.group_id - b.group_id));
}

export function ModsetEditDialog({ modset, modsets, groups, groupsLoad, modsetsLoad, api, updateModset, onClose, onSaved }: {
  groupsLoad: LoadState;
  modsetsLoad: LoadState;
  modset: Modset; modsets: Modset[]; groups: GroupSummary[]; api: ReturnType<typeof createApiClient>;
  updateModset: (id: number, name: string, permissions?: GroupPermission[], parentModsetId?: number | null, confirmParentConflicts?: boolean, orderMode?: "parent" | "independent", confirmOrderChange?: boolean) => Promise<void>;
  onClose: () => void; onSaved: () => Promise<unknown>;
}) {
  const [groupSearch, setGroupSearch] = React.useState("");
  const [loadAttempt, setLoadAttempt] = React.useState(0);
  const [name, setName] = React.useState(modset.name);
  const [parentId, setParentId] = React.useState(String(modset.parent_modset_id ?? ""));
  const [orderMode, setOrderMode] = React.useState<"parent" | "independent">(modset.order_mode ?? "independent");
  const [orderConfirmed, setOrderConfirmed] = React.useState(false);
  const [previewAttempt, setPreviewAttempt] = React.useState(0);
  const [orderPreview, setOrderPreview] = React.useState<{names: string[]; ready: boolean; error: string | null}>({names: [], ready: true, error: null});
  const orderChanged = Boolean(parentId) && orderMode !== (modset.order_mode ?? "independent");
  React.useEffect(() => {
    setOrderConfirmed(false);
    if (!orderChanged) { setOrderPreview({names: [], ready: true, error: null}); return; }
    let cancelled = false;
    setOrderPreview({names: [], ready: false, error: null});
    api.previewExportOrder(modset.id, orderMode, Number(parentId)).then(rows => {
      if (!cancelled) setOrderPreview({names: rows.map(row => row.name), ready: true, error: null});
    }).catch(error => { if (!cancelled) setOrderPreview({names: [], ready: false, error: error instanceof Error ? error.message : "Could not preview export order."}); });
    return () => { cancelled = true; };
  }, [api, modset.id, parentId, orderMode, orderChanged, previewAttempt]);
  const orderReady = !orderChanged || (orderPreview.ready && orderConfirmed);
  const [confirmed, setConfirmed] = React.useState(false);
  const [parentPreview, setParentPreview] = React.useState<{conflicts: string[]; error: string | null; loaded: boolean}>({conflicts: [], error: null, loaded: true});
  const parentChanged = parentId !== String(modset.parent_modset_id ?? "");
  React.useEffect(() => {
    setConfirmed(false);
    if (!parentChanged || !parentId) { setParentPreview({conflicts: [], error: null, loaded: true}); return; }
    let cancelled = false;
    setParentPreview({conflicts: [], error: null, loaded: false});
    Promise.all([api.listMods(modset.id), api.listMods(Number(parentId))]).then(([local, parent]) => {
      if (!cancelled) setParentPreview({conflicts: local.filter(mod => parent.some(source => source.id === mod.id)).map(mod => mod.name ?? mod.id), error: null, loaded: true});
    }).catch(() => { if (!cancelled) setParentPreview({conflicts: [], error: "Could not check overlapping mods. Reselect the parent to try again.", loaded: false}); });
    return () => { cancelled = true; };
  }, [api, modset.id, parentId, parentChanged]);
  const [entries, setEntries] = React.useState<GroupPermission[]>([]);
  const [originalEntries, setOriginalEntries] = React.useState<GroupPermission[]>([]);
  const [loaded, setLoaded] = React.useState(!modset.can_manage_access);
  const action = useAsyncAction();
  React.useEffect(() => {
    if (!modset.can_manage_access) return;
    let cancelled = false;
    action.run(async () => {
      const data = await api.listGroupPermissions(modset.id);
      if (!cancelled) { setEntries(data); setOriginalEntries(data); setLoaded(true); }
    }).catch(() => null);
    return () => { cancelled = true; };
  }, [api, modset.id, modset.can_manage_access, loadAttempt]);

  const groupsReady = groupsLoad.loaded && !groupsLoad.error;
  const permissionsChanged = modset.can_manage_access && permissionKey(entries) !== permissionKey(originalEntries);
  const changed = name.trim() !== modset.name || permissionsChanged || parentChanged || orderChanged;
  const needsConfirmation = parentChanged && (!parentId || parentPreview.conflicts.length > 0);
  const parentReady = parentPreview.loaded && (!needsConfirmation || confirmed);
  function setPermission(groupId: number, value: "none" | "read" | "write") {
    setEntries(previous => [...previous.filter(entry => entry.group_id !== groupId),
      ...(value === "none" ? [] : [{ group_id: groupId, permission: value }])]);
  }

  return <Dialog title={`Edit modset ${modset.name}`} onClose={onClose}>
    <form className="dialog-form parent-modset-form" onSubmit={event => {
      event.preventDefault();
      if (!modsetsLoad.loaded || modsetsLoad.error || !loaded || (modset.can_manage_access && !groupsReady) || !changed || !name.trim() || !parentReady || !orderReady) return;
      action.run(async () => {
        await updateModset(modset.id, name.trim(), permissionsChanged ? entries : undefined, parentChanged ? (parentId ? Number(parentId) : null) : undefined, confirmed, orderChanged ? orderMode : undefined, orderConfirmed);
        await onSaved().catch(() => null); onClose();
      }).catch(() => null);
    }}>
      <ResourceStatus state={modsetsLoad} label="modsets" />
      <label>Name<input autoFocus value={name} maxLength={120} onChange={event => setName(event.target.value)} disabled={action.loading} /></label>
      {modset.can_manage_access && <fieldset className="modset-permission-editor" disabled={action.loading}>
        <legend>Parent modset</legend>
        {modset.parent_modset_id ? <p>Linked to <strong>{modset.parent_modset_name ?? "parent modset"}</strong>. Installed versions come from this parent.</p> : <p className="muted">Inherit mods and binding versions from one parent, including future additions. New parent mods also replace local entries of the same ID. Choose whether to follow the parent order or manage it independently.</p>}
        <label>Parent modset<CustomSelect value={parentId} onChange={setParentId} ariaLabel="Parent modset" disabled={Boolean(modset.child_modsets_count)} options={[{value:"", label:modset.parent_modset_id ? "Detach — keep current mods and versions" : "None — independent modset"}, ...modsets.filter(set => set.id !== modset.id && !set.parent_modset_id && (!modset.parent_modset_id || set.id === modset.parent_modset_id)).map(set => ({value:String(set.id),label:set.name}))]} /></label>
        {parentId && <>
          <label>Export order<CustomSelect<"parent" | "independent"> value={orderMode} onChange={setOrderMode} disabled={action.loading} ariaLabel="Export order mode" options={[{value:"parent",label:"Follow parent order and insert local mods"},{value:"independent",label:"Independent order"}]} /></label>
          <p className="muted">{orderMode === "parent" ? "Parent mods keep their relative order. Move local mods between them; later parent changes are merged automatically." : "All export positions stay local. Later parent order changes do not move your mods."}</p>
          {orderChanged && <div className="order-mode-preview" aria-label="Export order preview">
            <strong>Export order preview</strong>
            {!orderPreview.ready && !orderPreview.error && <p role="status">Loading preview…</p>}
            {orderPreview.error && <><p className="error-box" role="alert">{orderPreview.error}</p><button className="secondary-button compact" type="button" onClick={() => setPreviewAttempt(value => value + 1)}>Retry preview</button></>}
            {orderPreview.ready && <>{orderPreview.names.length ? <ol>{orderPreview.names.map((name, index) => <li key={index}>{name}</li>)}</ol> : <p className="muted">No mods with an installed version.</p>}
            <label className="checkbox-row"><input type="checkbox" checked={orderConfirmed} onChange={event => setOrderConfirmed(event.target.checked)} />Use the previewed export order.</label></>}
          </div>}
        </>}
        {Boolean(modset.child_modsets_count) && <p className="muted">This modset is a parent of {modset.child_modsets_count} child modset(s) and cannot itself inherit.</p>}
        <p className="muted">Users of a child modset also need read access to its parent. Revoking that access blocks the child workspace until access is restored or an administrator detaches it.</p>
        {!parentPreview.loaded && !parentPreview.error && <p role="status">Checking overlapping mods…</p>}
        {parentPreview.error && <p className="error-box" role="alert">{parentPreview.error}</p>}
        {parentPreview.conflicts.length > 0 && <p className="error-box">These local mods will use the parent versions: {parentPreview.conflicts.join(", ")}. Their export positions are retained.</p>}
        {needsConfirmation && <label className="checkbox-row"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />{parentId ? "Replace these local entries with binding parent versions." : "Keep the current mods and versions as independent local entries. Future parent changes will no longer apply."}</label>}
      </fieldset>}
      {modset.can_manage_access && <fieldset className="modset-permission-editor" disabled={action.loading}>
        <legend>Group access</legend>
        <p className="muted">Read: view, copy and export. Write: also edit mods and export order.</p>
        <p className="muted">Owners and administrators always retain full access.</p>
        <ResourceStatus state={groupsLoad} label="groups" />
        {!loaded && !action.error && <p role="status">Loading permissions…</p>}
        {loaded && groupsReady && groups.length > 6 && <label>Find a group<input type="search" value={groupSearch} onChange={event => setGroupSearch(event.target.value)} placeholder="Group name" /></label>}
        {loaded && groupsReady && groups.length > 0 && <div className="permission-list">
          {groups.filter(group => group.name.toLocaleLowerCase().includes(groupSearch.trim().toLocaleLowerCase())).map(group => <label className="permission-row" key={group.id}>
            <span>{group.name}</span>
            <CustomSelect<"none" | "read" | "write"> value={entries.find(entry => entry.group_id === group.id)?.permission ?? "none"}
              onChange={value => setPermission(group.id, value)} disabled={action.loading} ariaLabel={`Access for ${group.name}`}
              options={[{value:"none",label:"No access"},{value:"read",label:"Read"},{value:"write",label:"Write"}]} />
          </label>)}
          {!groups.some(group => group.name.toLocaleLowerCase().includes(groupSearch.trim().toLocaleLowerCase())) && <p className="muted">No matching groups. Try a different name.</p>}
        </div>}
        {loaded && groupsReady && !groups.length && <p className="muted">No groups available. Ask an administrator to create a group.</p>}
      </fieldset>}
      {modset.can_manage_access && <SyncAccessSection modset={modset} api={api} parentChanged={parentChanged} />}
      {action.error && <div className="error-box" role="alert">{action.error}{!loaded && <button className="secondary-button compact" type="button" onClick={() => setLoadAttempt(value => value + 1)} disabled={action.loading}>Retry loading permissions</button>}</div>}
      <div className="dialog-actions"><button className="secondary-button compact" onClick={onClose} type="button">Cancel</button>
        <button className="primary-button compact" disabled={!modsetsLoad.loaded || Boolean(modsetsLoad.error) || !loaded || (modset.can_manage_access && !groupsReady) || action.loading || !name.trim() || !changed || !parentReady || !orderReady}>Save</button>
      </div>
    </form>
  </Dialog>;
}
