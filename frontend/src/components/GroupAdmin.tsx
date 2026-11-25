import React from "react";
import type { LoadState } from "../hooks/useLoadState";
import { ResourceStatus } from "./ResourceStatus";
import { Pencil, Plus, Trash2 } from "lucide-react";

import type { useGroups } from "../hooks/useGroups";
import type { UserAccount, UserGroup } from "../types";
import { Dialog, RowActions } from "./common";

export function GroupAdmin({ data, users, usersLoad }: { usersLoad: LoadState; data: ReturnType<typeof useGroups>; users: UserAccount[] }) {
  const createNameRef = React.useRef<HTMLInputElement>(null);
  const [memberSearch, setMemberSearch] = React.useState("");
  const [editing, setEditing] = React.useState<UserGroup | "new" | null>(null);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [userIds, setUserIds] = React.useState<number[]>([]);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  function open(group: UserGroup | "new", deleting = false) {
    setMemberSearch("");
    setEditing(group); setName(group === "new" ? "" : group.name);
    setDescription(group === "new" ? "" : group.description);
    setUserIds(group === "new" ? [] : group.user_ids); setConfirmDelete(deleting);
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

    {data.groups.length > 0 && <table className="modsets-table admin-records-table groups-table" aria-label="Groups">
      <thead><tr><th scope="col">Group</th><th scope="col">Description</th><th scope="col">Actions</th></tr></thead>
      <tbody>{data.groups.map(group => {
        const memberCount = group.user_ids.length;
        return <tr key={group.id}>
          <td className="modset-name-cell">
            <div className="user-row-header">
              <strong>{group.name}</strong>
              <span className="resource-info-badge">{memberCount} {memberCount === 1 ? "member" : "members"}</span>
            </div>
          </td>
          <td>{group.description.trim() ? <><span className="mobile-cell-label">Description</span>{group.description}</> : <span className="desktop-empty-description muted" aria-label="No description">—</span>}</td>
          <td>
            <RowActions label={`More actions for group ${group.name}`}>
              <button disabled={data.loading || !usersLoad.loaded || Boolean(usersLoad.error)} onClick={() => open(group)} type="button"><Pencil size={16} /> Edit</button>
              <button className="modset-delete-action" disabled={data.loading} onClick={() => open(group, true)} type="button"><Trash2 size={16} /> Delete</button>
            </RowActions>
          </td>
        </tr>;
      })}</tbody>
    </table>}
    {!data.groups.length && <p className="muted">No groups yet. Create a group, add members, then grant access in Edit modset.</p>}
    </>}
    {editing && <Dialog title={editing === "new" ? "Create group" : `Edit group ${editing.name}`} initialFocusRef={createNameRef} onClose={() => setEditing(null)}>
      <form className="dialog-form group-edit-form" onSubmit={event => { submit(event).catch(() => null); }}>
        <ResourceStatus state={usersLoad} label="group members" />
        {data.loadState.error && <ResourceStatus state={data.loadState} label="groups" />}
        {data.error && <p role="alert">{data.error}</p>}
        <label>Name<input ref={createNameRef} maxLength={120} value={name} onChange={event => setName(event.target.value)} required /></label>
        <label>Description<textarea maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} /></label>
        {users.length > 8 && <label>Find members<input type="search" value={memberSearch} onChange={event => setMemberSearch(event.target.value)} placeholder="Username" /></label>}
        <fieldset className="group-options"><legend>Members ({userIds.length})</legend><div className="group-member-list">{users.filter(user => user.username.toLocaleLowerCase().includes(memberSearch.trim().toLocaleLowerCase())).map(user => <label className="checkbox-row" key={user.id}>
          <input type="checkbox" checked={userIds.includes(user.id)} disabled={data.loading} onChange={event => setUserIds(event.target.checked ? [...userIds, user.id] : userIds.filter(id => id !== user.id))} />
          {user.username}{!user.is_active ? " (disabled)" : ""}
        </label>)}</div></fieldset>
        <div className="dialog-actions dialog-actions-with-delete">
          {editing !== "new" && <button className="secondary-button compact danger-button" type="button" disabled={data.loading} onClick={() => setConfirmDelete(true)}>Delete</button>}
          <button className="secondary-button compact" type="button" onClick={() => setEditing(null)}>Cancel</button>
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
