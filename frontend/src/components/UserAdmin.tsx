import type { UserAccountUpdate } from "../types";
import React from "react";
import type { LoadState } from "../hooks/useLoadState";
import { ResourceStatus } from "./ResourceStatus";
import { ChevronDown, Pencil, Plus, RefreshCw, Save, Trash2, Users, UsersRound, Webhook, ScrollText, KeyRound } from "lucide-react";

import { auditActionLabel, auditDetailText, auditEntityLine, auditFilterLabel, auditSeverity, filterAuditLogs, formatDate } from "../lib/utils";
import type { AuditFilter, AuditLog, AuthUser, DiscordWebhook, Modset, UserAccount, UserRole } from "../types";
import { CustomSelect, Dialog, Info, RowActions } from "./common";
import { DiscordWebhookAdmin } from "./DiscordWebhookAdmin";
import type { UserGroup } from "../types";

export type AdminSection = "account" | "users" | "groups" | "discord" | "sync" | "audit";

export function UserAdmin({
  loadStates,
  groupsLoad,
  section,
  onSectionChange,
  actionError,
  groups,
  groupError,
  groupManagement,
  syncManagement,
  users,
  webhooks,
  modsets,
  currentUser,
  loading,
  auditLogs,
  changeOwnPassword,
  createDiscordWebhook,
  createUser,
  updateDiscordWebhook,
  updateUserAccount,
  deleteUser,
  deleteDiscordWebhook,
  testDiscordWebhook,
  loadAuditLogs,
  auditLogPage,
  canPageBackAuditLogs,
  canPageForwardAuditLogs,
  previousAuditLogPage,
  nextAuditLogPage,
}: {
  loadStates: { users: LoadState; modsets: LoadState; webhooks: LoadState; audit: LoadState };
  groupsLoad: LoadState;
  section: AdminSection;
  onSectionChange: (section: AdminSection) => void;
  actionError: string | null;
  groups: UserGroup[];
  groupError: string | null;
  groupManagement: React.ReactNode;
  syncManagement: React.ReactNode;
  users: UserAccount[];
  webhooks: DiscordWebhook[];
  modsets: Modset[];
  currentUser: AuthUser;
  loading: boolean;
  auditLogs: AuditLog[];
  changeOwnPassword: (currentPassword: string, newPassword: string) => Promise<void>;
  createDiscordWebhook: (payload: { name: string; webhook_url: string; is_active: boolean; modset_ids?: number[] }) => Promise<unknown>;
  createUser: (username: string, password: string, role: UserRole) => Promise<void>;
  updateDiscordWebhook: (webhookId: number, payload: { name?: string; webhook_url?: string; is_active?: boolean; modset_ids?: number[] }) => Promise<unknown>;
  updateUserAccount: (userId: number, payload: UserAccountUpdate) => Promise<void>;
  deleteUser: (userId: number) => Promise<void>;
  deleteDiscordWebhook: (webhookId: number) => Promise<void>;
  testDiscordWebhook: (webhookId: number) => Promise<void>;
  loadAuditLogs: () => Promise<void>;
  auditLogPage: number;
  canPageBackAuditLogs: boolean;
  canPageForwardAuditLogs: boolean;
  previousAuditLogPage: () => void;
  nextAuditLogPage: () => void;
}) {
  const effectiveSection = currentUser.role === "admin" ? section : "account";
  const createNameRef = React.useRef<HTMLInputElement>(null);
  const [userSearch, setUserSearch] = React.useState("");
  const [formError, setFormError] = React.useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newOwnPassword, setNewOwnPassword] = React.useState("");
  const [newUsername, setNewUsername] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [newRole, setNewRole] = React.useState<UserRole>("user");
  const [showCreateUserDialog, setShowCreateUserDialog] = React.useState(false);
  const [editUserId, setEditUserId] = React.useState<number | null>(null);
  const [editRole, setEditRole] = React.useState<UserRole>("user");
  const [editIsActive, setEditIsActive] = React.useState(true);
  const [editGroupIds, setEditGroupIds] = React.useState<number[]>([]);
  const [resetPassword, setResetPassword] = React.useState("");
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [auditFilter, setAuditFilter] = React.useState<AuditFilter>("all");

  const editUser = users.find((user) => user.id === editUserId) ?? null;
  const filteredAuditLogs = React.useMemo(() => filterAuditLogs(auditLogs, auditFilter), [auditLogs, auditFilter]);

  async function handleOwnPasswordChange(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    await changeOwnPassword(currentPassword, newOwnPassword);
    setCurrentPassword("");
    setNewOwnPassword("");
  }

  async function handleCreateUser(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!newUsername.trim() || !newPassword) return;
    await createUser(newUsername.trim(), newPassword, newRole);
    setNewUsername("");
    setNewPassword("");
    setNewRole("user");
    setShowCreateUserDialog(false);
  }

  function openEditUser(user: UserAccount, deleting = false) {
    setFormError(null);
    setEditUserId(user.id);
    setEditRole(user.role);
    setEditIsActive(user.is_active);
    setEditGroupIds(groups.filter(group => group.user_ids.includes(user.id)).map(group => group.id));
    setResetPassword("");
    setConfirmDelete(deleting);
  }

  async function handleEditUser(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!editUser) return;
    const originalGroupIds = groups.filter(group => group.user_ids.includes(editUser.id)).map(group => group.id);
    const payload: UserAccountUpdate = {};
    if (originalGroupIds.length !== editGroupIds.length || originalGroupIds.some(id => !editGroupIds.includes(id))) payload.group_ids = editGroupIds;
    if (editRole !== editUser.role) payload.role = editRole;
    if (editIsActive !== editUser.is_active) payload.is_active = editIsActive;
    if (resetPassword.length >= 12) payload.password = resetPassword;
    if (Object.keys(payload).length > 0) await updateUserAccount(editUser.id, payload);
    setResetPassword("");
    setEditUserId(null);
  }

  return (
    <>
      <header className="administration-heading"><h2>{effectiveSection === "account" ? "Account settings" : "Administration"}</h2>
        <p className="muted">{effectiveSection === "account" ? "Your session, sign-in method and password." : "Manage people, permissions, sync access and update notifications."}</p>
      </header>
      <div className={`admin-workspace ${effectiveSection === "account" ? "account-workspace" : ""}`}>
        {currentUser.role === "admin" && effectiveSection !== "account" && <nav className="admin-navigation" aria-label="Administration sections">
          {([{id:"users",label:"Users",icon:Users},{id:"groups",label:"Groups",icon:UsersRound},{id:"discord",label:"Discord",icon:Webhook},{id:"sync",label:"Sync access",icon:KeyRound},{id:"audit",label:"Audit log",icon:ScrollText}] as const).map(item => <button type="button" key={item.id} aria-current={effectiveSection === item.id ? "page" : undefined} onClick={() => { setFormError(null); onSectionChange(item.id); }}><item.icon size={18} />{item.label}</button>)}
        </nav>}
        <div className="admin-content">
        {actionError && <p className="error-box" role="alert">{actionError}</p>}
        {effectiveSection === "account" && <section className="content-section admin-section session-section">

        <h3>Session</h3>
        <div className="metrics session-metrics">
          <Info label="Signed in as" value={currentUser.username} />
          <Info label="Role" value={currentUser.role} />
          <Info label="Login" value={authProviderLabel(currentUser.auth_provider)} />
          <Info label="Session expires" value={formatDate(currentUser.session_expires_at)} />
        </div>

        {currentUser.has_local_password ? (
          <form className="user-form session-form" onSubmit={event => { handleOwnPasswordChange(event).catch(error => setFormError(error instanceof Error ? error.message : "Could not change password.")); }}>
            <h3>Password</h3>
            <label>
              Current password
              <input value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} type="password" autoComplete="current-password" />
            </label>
            <label>
              New password
              <input
                value={newOwnPassword}
                onChange={(event) => setNewOwnPassword(event.target.value)}
                type="password"
                autoComplete="new-password"
                placeholder="at least 12 characters"
              />
            </label>
            <button className="primary-button compact" disabled={loading || !currentPassword || newOwnPassword.length < 12}>
              <Save size={18} />
              Change password
            </button>
          </form>
        ) : (
          <div className="content-section">
            <h3>Password</h3>
            <p className="muted">This account signs in through OIDC and has no local ARMM password.</p>
          </div>
        )}
        {formError && <p className="error-box" role="alert">{formError}</p>}
      </section>}

      {currentUser.role === "admin" && (
        <>
          {effectiveSection === "users" && <section className="content-section admin-section">
            <div className="section-title-row">
              <h3>Users {loadStates.users.loaded && !loadStates.users.error && <span className="section-count">{users.length}</span>}</h3>
              <button className="primary-button compact" onClick={() => { setFormError(null); setShowCreateUserDialog(true); }} type="button">
                <Plus size={18} />
                Create user
              </button>
            </div>

            <ResourceStatus state={loadStates.users} label="users" />
            {groupsLoad.error && <ResourceStatus state={groupsLoad} label="group memberships" />}
            {loadStates.users.loaded && !loadStates.users.error && <>
            <label className="admin-search">Search users<input type="search" value={userSearch} onChange={event => setUserSearch(event.target.value)} placeholder="Username" /></label>
            <table className="modsets-table admin-records-table users-table" aria-label="Users">
              <thead><tr><th scope="col">User</th><th scope="col">Authentication</th><th scope="col">Last login</th><th scope="col">Actions</th></tr></thead>
              <tbody>{users.filter(user => user.username.toLocaleLowerCase().includes(userSearch.trim().toLocaleLowerCase())).map((user) => {
                const memberships = groups.filter(group => group.user_ids.includes(user.id));
                return <tr key={user.id}>
                  <td className="modset-name-cell">
                    <div className="user-row-header">
                      <strong>{user.username}</strong>
                      <span className={`resource-status-badge${user.is_active ? " active" : ""}`}>{user.is_active ? "Active" : "Disabled"}</span>
                    </div>
                    <small>{user.role}{memberships.length > 0 && ` · Groups: ${memberships.map(group => group.name).join(", ")}`}</small>
                  </td>
                  <td><span className="mobile-cell-label">Authentication</span>{authProviderLabel(user.auth_provider)}</td>
                  <td><span className="mobile-cell-label">Last login</span>{formatDate(user.last_login_at) ?? "Never"}</td>
                  <td>
                    <RowActions label={`More actions for user ${user.username}`}>
                      <button disabled={loading || !groupsLoad.loaded || Boolean(groupsLoad.error)} onClick={() => openEditUser(user)} type="button">
                        <Pencil size={16} /> Edit
                      </button>
                      <button className="modset-delete-action" disabled={loading || user.id === currentUser.id} onClick={() => openEditUser(user, true)} type="button">
                        <Trash2 size={16} /> Delete
                      </button>
                    </RowActions>
                  </td>
                </tr>;
              })}</tbody>
            </table>
            {!users.some(user => user.username.toLocaleLowerCase().includes(userSearch.trim().toLocaleLowerCase())) && <p className="muted">No users match this search.</p>}
            </>}
          </section>}

          {effectiveSection === "groups" && groupManagement}
          {effectiveSection === "sync" && syncManagement}

          {effectiveSection === "discord" && <>
            <ResourceStatus state={loadStates.webhooks} label="Discord webhooks" />
            <ResourceStatus state={loadStates.modsets} label="notification modsets" />
            {loadStates.webhooks.loaded && !loadStates.webhooks.error && loadStates.modsets.loaded && !loadStates.modsets.error && <DiscordWebhookAdmin
            error={actionError}
            webhooks={webhooks}
            modsets={modsets}
            loading={loading}
            createDiscordWebhook={createDiscordWebhook}
            updateDiscordWebhook={updateDiscordWebhook}
            deleteDiscordWebhook={deleteDiscordWebhook}
            testDiscordWebhook={testDiscordWebhook}
          />}</>}

          {showCreateUserDialog && (
            <Dialog title="Create user" initialFocusRef={createNameRef} onClose={() => setShowCreateUserDialog(false)}>
              <form className="dialog-form" onSubmit={event => { handleCreateUser(event).catch(error => setFormError(error instanceof Error ? error.message : "Could not create user.")); }}>
                {formError && <p className="error-box" role="alert">{formError}</p>}
                <label>
                  Username
                  <input ref={createNameRef} value={newUsername} onChange={(event) => setNewUsername(event.target.value)} placeholder="admin.user" />
                </label>
                <label>
                  Initial password
                  <input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type="password" placeholder="at least 12 characters" />
                </label>
                <label>
                  Role
                  <CustomSelect<UserRole>
                    value={newRole}
                    options={[
                      { value: "user", label: "User" },
                      { value: "admin", label: "Admin" },
                    ]}
                    onChange={setNewRole}
                    ariaLabel="Role"
                  />
                </label>
                <div className="dialog-actions">
                  <button className="secondary-button compact" onClick={() => setShowCreateUserDialog(false)} type="button">
                    Cancel
                  </button>
                  <button className="primary-button compact" disabled={loading || newPassword.length < 12 || !newUsername.trim()}>
                    Create
                  </button>
                </div>
              </form>
            </Dialog>
          )}

          {editUser && (
            <Dialog title={`Edit user ${editUser.username}`} onClose={() => setEditUserId(null)}>
              <form className="dialog-form" onSubmit={event => { handleEditUser(event).catch(error => setFormError(error instanceof Error ? error.message : "Could not save user.")); }}>
                {formError && <p className="error-box" role="alert">{formError}</p>}
                {actionError && !formError && <p className="error-box" role="alert">{actionError}</p>}
                <label>
                  Role
                  <CustomSelect<UserRole>
                    value={editRole}
                    options={[
                      { value: "user", label: "User" },
                      { value: "admin", label: "Admin" },
                    ]}
                    onChange={setEditRole}
                    disabled={loading}
                    ariaLabel={`Role for ${editUser.username}`}
                  />
                </label>
                <label>
                  Status
                  <CustomSelect<"active" | "disabled">
                    value={editIsActive ? "active" : "disabled"}
                    options={[
                      { value: "active", label: "Active" },
                      { value: "disabled", label: "Disabled" },
                    ]}
                    onChange={(value) => setEditIsActive(value === "active")}
                    disabled={loading || editUser.id === currentUser.id}
                    ariaLabel={`Status for ${editUser.username}`}
                  />
                </label>
                <label>
                  Reset password
                  <input
                    autoFocus
                    value={resetPassword}
                    onChange={(event) => setResetPassword(event.target.value)}
                    type="password"
                    placeholder="leave empty to keep unchanged"
                  />
                </label>
                {editUser.auth_provider === "oidc" && (
                  <p className="muted">Setting a password enables additional local login for this OIDC account.</p>
                )}
                <ResourceStatus state={groupsLoad} label="group memberships" />
                {groupError && !groupsLoad.error && <p role="alert">{groupError}</p>}
                <fieldset className="group-options"><legend>Groups</legend>
                  {groups.length === 0 && <p className="muted">No groups available. Create groups in the Groups section.</p>}
                  {groups.map(group => <label className="checkbox-row" key={group.id}>
                    <input type="checkbox" checked={editGroupIds.includes(group.id)} disabled={loading}
                      onChange={event => setEditGroupIds(event.target.checked ? [...editGroupIds, group.id] : editGroupIds.filter(id => id !== group.id))} />
                    {group.name}
                  </label>)}
                </fieldset>
                <div className="dialog-actions dialog-actions-with-delete">
                  <button
                    className="secondary-button compact danger-button"
                    disabled={loading || editUser.id === currentUser.id}
                    onClick={() => setConfirmDelete(true)}
                    type="button"
                  >
                    Delete
                  </button>
                  <button className="secondary-button compact" onClick={() => setEditUserId(null)} type="button">
                    Cancel
                  </button>
                  <button
                    className="primary-button compact"
                    disabled={loading || !groupsLoad.loaded || Boolean(groupsLoad.error) || (resetPassword.length > 0 && resetPassword.length < 12)}
                    type="submit"
                  >
                    Save
                  </button>
                </div>
                {confirmDelete && (
                  <div className="inline-danger-confirmation">
                    <p className="muted">
                      Delete <strong>{editUser.username}</strong> permanently?
                    </p>
                    <div className="dialog-actions">
                      <button className="secondary-button compact" onClick={() => setConfirmDelete(false)} type="button">
                        Cancel
                      </button>
                      <button
                        className="secondary-button compact danger-button"
                        disabled={loading || editUser.id === currentUser.id}
                        onClick={() => {
                          deleteUser(editUser.id)
                            .then(() => setEditUserId(null))
                            .catch(() => null);
                        }}
                        type="button"
                      >
                        Confirm delete
                      </button>
                    </div>
                  </div>
                )}
              </form>
            </Dialog>
          )}

          {effectiveSection === "audit" && <section className="content-section admin-section">
            <div className="section-title-row">
              <h3>Audit log</h3>
              <button className="secondary-button compact" disabled={loading} onClick={() => loadAuditLogs().catch(() => null)} type="button">
                <RefreshCw size={18} />
                Refresh
              </button>
            </div>
            <ResourceStatus state={loadStates.audit} label="audit log" />
            {loadStates.audit.loaded && !loadStates.audit.error && <>
            <div className="audit-filters" aria-label="Audit filters">
              {(["all", "auth", "user", "mod", "integration", "failures"] as AuditFilter[]).map((filter) => (
                <button className={auditFilter === filter ? "active" : ""} aria-pressed={auditFilter === filter} key={filter} onClick={() => setAuditFilter(filter)} type="button">
                  {auditFilterLabel(filter)}
                </button>
              ))}
            </div>
            <div className="audit-list">
              {filteredAuditLogs.map((entry) => (
                <details className="audit-row" key={entry.id}>
                  <summary className="audit-row-summary">
                    <span className="audit-row-header">
                      <strong>{auditActionLabel(entry.action)}</strong>
                      {auditSeverity(entry) === "failure" && <span className="resource-info-badge audit-badge failure">Failure</span>}
                    </span>
                    <span className="audit-row-entity">{auditEntityLine(entry)}</span>
                    <time dateTime={entry.created_at}>{formatDate(entry.created_at)}</time>
                    <ChevronDown className="audit-row-chevron" size={16} aria-hidden="true" />
                  </summary>
                  <div className="audit-row-details">
                    <p>{auditDetailText(entry.detail) || "No additional event details."}</p>
                    {entry.ip_address && <p>IP address: {entry.ip_address}</p>}
                  </div>
                </details>
              ))}
              {auditLogs.length === 0 && <p className="muted">No audit entries stored.</p>}
              {auditLogs.length > 0 && filteredAuditLogs.length === 0 && <p className="muted">No audit entries match this filter.</p>}
            </div>
            <div className="list-pagination">
              <span className="muted">{`Page ${auditLogPage + 1}`}</span>
              <div className="dialog-actions">
                <button className="secondary-button compact" disabled={loadStates.audit.loading || !canPageBackAuditLogs} onClick={previousAuditLogPage} type="button">
                  Previous
                </button>
                <button className="secondary-button compact" disabled={loadStates.audit.loading || !canPageForwardAuditLogs} onClick={nextAuditLogPage} type="button">
                  Next
                </button>
              </div>
            </div>
            </>}
          </section>}
        </>
      )}
        </div>
      </div>
    </>
  );
}

function authProviderLabel(provider: UserAccount["auth_provider"] | AuthUser["auth_provider"]) {
  if (provider === "local+oidc") return "Local + OIDC";
  if (provider === "oidc") return "OIDC";
  return "Local";
}
