import React from "react";
import { Pencil, Plus } from "lucide-react";

import type { useGroups } from "../hooks/useGroups";
import type { UserAccount, UserGroup } from "../types";
import { Dialog } from "./common";

export function GroupAdmin({ data, users }: { data: ReturnType<typeof useGroups>; users: UserAccount[] }) {
  const [editing, setEditing] = React.useState<UserGroup | "new" | null>(null);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [userIds, setUserIds] = React.useState<number[]>([]);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  function open(group: UserGroup | "new") {
    setEditing(group); setName(group === "new" ? "" : group.name);
    setDescription(group === "new" ? "" : group.description);
    setUserIds(group === "new" ? [] : group.user_ids); setConfirmDelete(false);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!editing) return;
    await data.save(editing === "new" ? null : editing.id, { name: name.trim(), description, user_ids: userIds });
    setEditing(null);
  }
  return <section className="content-section admin-section">
    <div className="section-title-row"><h3>Groups</h3>
      <button className="primary-button compact" disabled={data.loading} onClick={() => open("new")} type="button"><Plus size={18} /> Create group</button>
    </div>
    <p className="muted">Groups can contain users and service accounts. Modset owners grant each group read or write access.</p>
    {data.error && <p role="alert">{data.error}</p>}
    <div className="user-list">{data.groups.map(group => <article className="user-row" key={group.id}>
      <div><strong>{group.name}</strong><small>{group.user_ids.length} members{group.description ? ` · ${group.description}` : ""}</small></div>
      <button className="secondary-button compact" disabled={data.loading} onClick={() => open(group)} type="button"><Pencil size={16} /> Edit</button>
    </article>)}</div>
    {!data.groups.length && <p className="muted">No groups yet.</p>}
    {editing && <Dialog title={editing === "new" ? "Create group" : `Edit group ${editing.name}`} onClose={() => setEditing(null)}>
      <form className="dialog-form" onSubmit={event => { submit(event).catch(() => null); }}>
        {data.error && <p role="alert">{data.error}</p>}
        <label>Name<input autoFocus maxLength={120} value={name} onChange={event => setName(event.target.value)} required /></label>
        <label>Description<textarea maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} /></label>
        <fieldset className="group-options"><legend>Members</legend>{users.map(user => <label className="checkbox-row" key={user.id}>
          <input type="checkbox" checked={userIds.includes(user.id)} disabled={data.loading} onChange={event => setUserIds(event.target.checked ? [...userIds, user.id] : userIds.filter(id => id !== user.id))} />
          {user.username}{!user.is_active ? " (disabled)" : ""}
        </label>)}</fieldset>
        <div className="dialog-actions">
          <button className="secondary-button compact" type="button" onClick={() => setEditing(null)}>Cancel</button>
          {editing !== "new" && <button className="secondary-button compact danger-button" type="button" disabled={data.loading} onClick={() => setConfirmDelete(true)}>Delete</button>}
          <button className="primary-button compact" disabled={data.loading || !name.trim()}>Save</button>
        </div>
        {confirmDelete && editing !== "new" && <div className="inline-danger-confirmation">
          <p>Delete <strong>{editing.name}</strong>? All memberships and modset permissions for this group will be removed.</p>
          <div className="dialog-actions"><button className="secondary-button compact" type="button" onClick={() => setConfirmDelete(false)}>Cancel</button>
            <button className="secondary-button compact danger-button" type="button" disabled={data.loading} onClick={() => { data.remove(editing.id).then(() => setEditing(null)).catch(() => null); }}>Confirm delete</button>
          </div>
        </div>}
      </form>
    </Dialog>}
  </section>;
}
