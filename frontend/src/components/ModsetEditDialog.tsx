import React from "react";

import type { createApiClient } from "../lib/api";
import type { GroupPermission, GroupSummary, Modset } from "../types";
import { CustomSelect, Dialog } from "./common";
import { useAsyncAction } from "../hooks/useAsyncAction";

function permissionKey(entries: GroupPermission[]) {
  return JSON.stringify([...entries].sort((a, b) => a.group_id - b.group_id));
}

export function ModsetEditDialog({ modset, groups, api, updateModset, onClose, onSaved }: {
  modset: Modset; groups: GroupSummary[]; api: ReturnType<typeof createApiClient>;
  updateModset: (id: number, name: string, permissions?: GroupPermission[]) => Promise<void>;
  onClose: () => void; onSaved: () => Promise<unknown>;
}) {
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
  }, [api, modset.id, modset.can_manage_access]);

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
      {modset.can_manage_access && <section className="group-access-fields" aria-label="Group access">
        <h4>Group access</h4>
        <p className="muted">Read allows viewing, copying and exporting. Write also allows editing mods and export order. Owners and administrators manage access.</p>
        {!loaded && !action.error && <p>Loading permissions…</p>}
        {loaded && groups.map(group => <label key={group.id}>{group.name}
          <CustomSelect<"none" | "read" | "write"> value={entries.find(entry => entry.group_id === group.id)?.permission ?? "none"}
            options={[{ value: "none", label: "No access" }, { value: "read", label: "Read" }, { value: "write", label: "Write" }]}
            onChange={value => setPermission(group.id, value)} disabled={action.loading} ariaLabel={`Access for ${group.name}`} />
        </label>)}
        {loaded && !groups.length && <p className="muted">No groups available. Ask an administrator to create a group.</p>}
      </section>}
      {action.error && <p role="alert">{action.error}</p>}
      <div className="dialog-actions"><button className="secondary-button compact" onClick={onClose} type="button">Cancel</button>
        <button className="primary-button compact" disabled={!loaded || action.loading || !name.trim() || !changed}>Save</button>
      </div>
    </form>
  </Dialog>;
}
