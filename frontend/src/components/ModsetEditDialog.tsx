import React from "react";

import type { createApiClient } from "../lib/api";
import type { GroupPermission, GroupSummary, Modset } from "../types";
import { Dialog } from "./common";
import { useAsyncAction } from "../hooks/useAsyncAction";

function permissionKey(entries: GroupPermission[]) {
  return JSON.stringify([...entries].sort((a, b) => a.group_id - b.group_id));
}

export function ModsetEditDialog({ modset, groups, api, updateModset, onClose, onSaved }: {
  modset: Modset; groups: GroupSummary[]; api: ReturnType<typeof createApiClient>;
  updateModset: (id: number, name: string, permissions?: GroupPermission[]) => Promise<void>;
  onClose: () => void; onSaved: () => Promise<unknown>;
}) {
  const [groupSearch, setGroupSearch] = React.useState("");
  const [loadAttempt, setLoadAttempt] = React.useState(0);
  const [name, setName] = React.useState(modset.name);
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

  const permissionsChanged = modset.can_manage_access && permissionKey(entries) !== permissionKey(originalEntries);
  const changed = name.trim() !== modset.name || permissionsChanged;
  function setPermission(groupId: number, value: "none" | "read" | "write") {
    setEntries(previous => [...previous.filter(entry => entry.group_id !== groupId),
      ...(value === "none" ? [] : [{ group_id: groupId, permission: value }])]);
  }

  return <Dialog title={`Edit modset ${modset.name}`} onClose={onClose}>
    <form className="dialog-form" onSubmit={event => {
      event.preventDefault();
      if (!loaded || !changed || !name.trim()) return;
      action.run(async () => {
        await updateModset(modset.id, name.trim(), permissionsChanged ? entries : undefined);
        await onSaved(); onClose();
      }).catch(() => null);
    }}>
      <label>Name<input autoFocus value={name} maxLength={120} onChange={event => setName(event.target.value)} disabled={action.loading} /></label>
      {modset.can_manage_access && <fieldset className="modset-permission-editor" disabled={action.loading}>
        <legend>Group access</legend>
        <p className="muted">Read: view, copy and export. Write: also edit mods and export order.</p>
        <p className="muted">Owners and administrators always retain full access.</p>
        {!loaded && !action.error && <p role="status">Loading permissions…</p>}
        {loaded && groups.length > 6 && <label>Find a group<input type="search" value={groupSearch} onChange={event => setGroupSearch(event.target.value)} placeholder="Group name" /></label>}
        {loaded && groups.length > 0 && <div className="permission-list">
          {groups.filter(group => group.name.toLocaleLowerCase().includes(groupSearch.trim().toLocaleLowerCase())).map(group => <label className="permission-row" key={group.id}>
            <span>{group.name}</span>
            <select className="permission-select" value={entries.find(entry => entry.group_id === group.id)?.permission ?? "none"}
              onChange={event => setPermission(group.id, event.target.value as "none" | "read" | "write")} aria-label={`Access for ${group.name}`}>
              <option value="none">No access</option><option value="read">Read</option><option value="write">Write</option>
            </select>
          </label>)}
          {!groups.some(group => group.name.toLocaleLowerCase().includes(groupSearch.trim().toLocaleLowerCase())) && <p className="muted">No matching groups. Try a different name.</p>}
        </div>}
        {loaded && !groups.length && <p className="muted">No groups available. Ask an administrator to create a group.</p>}
      </fieldset>}
      {action.error && <div className="error-box" role="alert">{action.error}{!loaded && <button className="secondary-button compact" type="button" onClick={() => setLoadAttempt(value => value + 1)} disabled={action.loading}>Retry loading permissions</button>}</div>}
      <div className="dialog-actions"><button className="secondary-button compact" onClick={onClose} type="button">Cancel</button>
        <button className="primary-button compact" disabled={!loaded || action.loading || !name.trim() || !changed}>Save</button>
      </div>
    </form>
  </Dialog>;
}
