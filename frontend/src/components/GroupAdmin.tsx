import React from "react";
import type { LoadState } from "../hooks/useLoadState";
import { ResourceStatus } from "./ResourceStatus";
import { Pencil, Plus } from "lucide-react";

import type { useGroups } from "../hooks/useGroups";
import type { UserAccount, UserGroup } from "../types";
import { Dialog } from "./common";

export function GroupAdmin({ data, users, usersLoad }: { usersLoad: LoadState; data: ReturnType<typeof useGroups>; users: UserAccount[] }) {
  const [search, setSearch] = React.useState("");
  const [memberSearch, setMemberSearch] = React.useState("");
  const [editing, setEditing] = React.useState<UserGroup | "new" | null>(null);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [userIds, setUserIds] = React.useState<number[]>([]);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  function open(group: UserGroup | "new") {
    setMemberSearch("");
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
    <div className="section-title-row"><h3>Groups {data.loadState.loaded && !data.loadState.error && <span className="section-count">{data.groups.length}</span>}</h3>
      <button className="primary-button compact" disabled={data.loading || !data.loadState.loaded || Boolean(data.loadState.error) || !usersLoad.loaded || Boolean(usersLoad.error)} onClick={() => open("new")} type="button"><Plus size={18} /> Create group</button>
    </div>
    <p className="muted">Groups can contain users and service accounts. Modset owners grant each group read or write access.</p>
    <ResourceStatus state={data.loadState} label="groups" />
    <ResourceStatus state={usersLoad} label="group members" />
    {data.error && !data.loadState.error && <p role="alert">{data.error}</p>}
    {data.loadState.loaded && !data.loadState.error && <>

    <label className="admin-search">Search groups<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Name or description" /></label>
    <div className="user-list">{data.groups.filter(group => `${group.name} ${group.description}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).map(group => <article className="user-row" key={group.id}>
      <div><strong>{group.name}</strong><small>{group.user_ids.length} members{group.description ? ` · ${group.description}` : ""}</small></div>
      <button className="secondary-button compact" disabled={data.loading || !usersLoad.loaded || Boolean(usersLoad.error)} onClick={() => open(group)} type="button"><Pencil size={16} /> Edit</button>
    </article>)}</div>
    {!data.groups.length && <p className="muted">No groups yet. Create a group, add members, then grant access in Edit modset.</p>}
    {data.groups.length > 0 && !data.groups.some(group => `${group.name} ${group.description}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) && <p className="muted">No groups match this search.</p>}
    </>}
    {editing && <Dialog title={editing === "new" ? "Create group" : `Edit group ${editing.name}`} onClose={() => setEditing(null)}>
      <form className="dialog-form" onSubmit={event => { submit(event).catch(() => null); }}>
        <ResourceStatus state={usersLoad} label="group members" />
        {data.loadState.error && <ResourceStatus state={data.loadState} label="groups" />}
        {data.error && <p role="alert">{data.error}</p>}
        <label>Name<input autoFocus maxLength={120} value={name} onChange={event => setName(event.target.value)} required /></label>
        <label>Description<textarea maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} /></label>
        {users.length > 8 && <label>Find members<input type="search" value={memberSearch} onChange={event => setMemberSearch(event.target.value)} placeholder="Username" /></label>}
        <fieldset className="group-options"><legend>Members ({userIds.length})</legend>{users.filter(user => user.username.toLocaleLowerCase().includes(memberSearch.trim().toLocaleLowerCase())).map(user => <label className="checkbox-row" key={user.id}>
          <input type="checkbox" checked={userIds.includes(user.id)} disabled={data.loading} onChange={event => setUserIds(event.target.checked ? [...userIds, user.id] : userIds.filter(id => id !== user.id))} />
          {user.username}{!user.is_active ? " (disabled)" : ""}
        </label>)}</fieldset>
        <div className="dialog-actions">
          <button className="secondary-button compact" type="button" onClick={() => setEditing(null)}>Cancel</button>
          {editing !== "new" && <button className="secondary-button compact danger-button" type="button" disabled={data.loading} onClick={() => setConfirmDelete(true)}>Delete</button>}
          <button className="primary-button compact" disabled={data.loading || !usersLoad.loaded || Boolean(usersLoad.error) || !data.loadState.loaded || Boolean(data.loadState.error) || !name.trim()}>Save</button>
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
