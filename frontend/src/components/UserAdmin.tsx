import React from "react";
import { Pencil, Plus, RefreshCw, Save } from "lucide-react";

import { auditActionLabel, auditDetailText, auditEntityLine, auditFilterLabel, auditSeverity, filterAuditLogs, formatDate } from "../lib/utils";
import type { AuditFilter, AuditLog, AuthUser, UserAccount, UserRole } from "../types";
import { CustomSelect, Dialog, Info } from "./common";

export function UserAdmin({
  users,
  currentUser,
  loading,
  auditLogs,
  changeOwnPassword,
  createUser,
  updateUserAccount,
  deleteUser,
  resetUserPassword,
  loadAuditLogs,
}: {
  users: UserAccount[];
  currentUser: AuthUser;
  loading: boolean;
  auditLogs: AuditLog[];
  changeOwnPassword: (currentPassword: string, newPassword: string) => Promise<void>;
  createUser: (username: string, password: string, role: UserRole) => Promise<void>;
  updateUserAccount: (userId: number, payload: Partial<Pick<UserAccount, "role" | "is_active">>) => Promise<void>;
  deleteUser: (userId: number) => Promise<void>;
  resetUserPassword: (userId: number, password: string) => Promise<void>;
  loadAuditLogs: () => Promise<void>;
}) {
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newOwnPassword, setNewOwnPassword] = React.useState("");
  const [newUsername, setNewUsername] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [newRole, setNewRole] = React.useState<UserRole>("user");
  const [showCreateUserDialog, setShowCreateUserDialog] = React.useState(false);
  const [editUserId, setEditUserId] = React.useState<number | null>(null);
  const [editRole, setEditRole] = React.useState<UserRole>("user");
  const [editIsActive, setEditIsActive] = React.useState(true);
  const [resetPassword, setResetPassword] = React.useState("");
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [auditFilter, setAuditFilter] = React.useState<AuditFilter>("all");

  const editUser = users.find((user) => user.id === editUserId) ?? null;
  const filteredAuditLogs = React.useMemo(() => filterAuditLogs(auditLogs, auditFilter), [auditLogs, auditFilter]);

  async function handleOwnPasswordChange(event: React.FormEvent) {
    event.preventDefault();
    await changeOwnPassword(currentPassword, newOwnPassword);
    setCurrentPassword("");
    setNewOwnPassword("");
  }

  async function handleCreateUser(event: React.FormEvent) {
    event.preventDefault();
    if (!newUsername.trim() || !newPassword) return;
    await createUser(newUsername.trim(), newPassword, newRole);
    setNewUsername("");
    setNewPassword("");
    setNewRole("user");
    setShowCreateUserDialog(false);
  }

  React.useEffect(() => {
    if (!editUser) {
      setEditRole("user");
      setEditIsActive(true);
      setResetPassword("");
      setConfirmDelete(false);
      return;
    }
    setEditRole(editUser.role);
    setEditIsActive(editUser.is_active);
    setResetPassword("");
    setConfirmDelete(false);
  }, [editUser]);

  async function handleEditUser(event: React.FormEvent) {
    event.preventDefault();
    if (!editUser) return;
    if (editRole !== editUser.role || editIsActive !== editUser.is_active) {
      await updateUserAccount(editUser.id, { role: editRole, is_active: editIsActive });
    }
    if (resetPassword.length >= 12) {
      await resetUserPassword(editUser.id, resetPassword);
      setResetPassword("");
    }
    setEditUserId(null);
  }

  return (
    <>
      <header className="detail-header">
        <div>
          <p>{currentUser.role === "admin" ? "Administration" : "Account"}</p>
          <h2>Security</h2>
        </div>
      </header>

      <section className="content-section">
        <h3>Session</h3>
        <div className="metrics">
          <Info label="Signed in as" value={currentUser.username} />
          <Info label="Role" value={currentUser.role} />
          <Info label="Session expires" value={formatDate(currentUser.session_expires_at)} />
          <Info label="Lifetime" value="7 days" />
        </div>
      </section>

      <form className="user-form" onSubmit={handleOwnPasswordChange}>
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
          Change
        </button>
      </form>

      {currentUser.role === "admin" && (
        <>
          <div className="section-title-row">
            <h3>Users</h3>
            <button className="primary-button compact" onClick={() => setShowCreateUserDialog(true)} type="button">
              <Plus size={18} />
              Create user
            </button>
          </div>

          <div className="user-list">
            {users.map((user) => (
              <article className="user-row" key={user.id}>
                <div>
                  <strong>{user.username}</strong>
                  <small>
                    {user.role} · {user.is_active ? "active" : "disabled"} · Last login {formatDate(user.last_login_at) ?? "never"}
                  </small>
                </div>
                <button className="secondary-button compact" disabled={loading} onClick={() => setEditUserId(user.id)} type="button">
                  <Pencil size={16} />
                  Edit
                </button>
              </article>
            ))}
          </div>

          {showCreateUserDialog && (
            <Dialog title="Create user" onClose={() => setShowCreateUserDialog(false)}>
              <form className="dialog-form" onSubmit={handleCreateUser}>
                <label>
                  Username
                  <input autoFocus value={newUsername} onChange={(event) => setNewUsername(event.target.value)} placeholder="admin.user" />
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
              <form className="dialog-form" onSubmit={handleEditUser}>
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
                <div className="dialog-actions">
                  <button className="secondary-button compact" onClick={() => setEditUserId(null)} type="button">
                    Cancel
                  </button>
                  <button
                    className="secondary-button compact danger-button"
                    disabled={loading || editUser.id === currentUser.id}
                    onClick={() => setConfirmDelete(true)}
                    type="button"
                  >
                    Delete
                  </button>
                  <button
                    className="primary-button compact"
                    disabled={loading || (resetPassword.length > 0 && resetPassword.length < 12)}
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

          <section className="content-section">
            <div className="section-title-row">
              <h3>Audit log</h3>
              <button className="secondary-button compact" disabled={loading} onClick={() => loadAuditLogs().catch(() => null)} type="button">
                <RefreshCw size={18} />
                Refresh
              </button>
            </div>
            <div className="audit-filters" aria-label="Audit filters">
              {(["all", "auth", "user", "mod", "failures"] as AuditFilter[]).map((filter) => (
                <button className={auditFilter === filter ? "active" : ""} key={filter} onClick={() => setAuditFilter(filter)} type="button">
                  {auditFilterLabel(filter)}
                </button>
              ))}
            </div>
            <div className="audit-list">
              {filteredAuditLogs.map((entry) => (
                <article className="audit-row" key={entry.id}>
                  <div className="audit-row-header">
                    <strong>{auditActionLabel(entry.action)}</strong>
                    <span className={`audit-badge ${auditSeverity(entry)}`}>{auditSeverity(entry)}</span>
                  </div>
                  <span>{auditEntityLine(entry)}</span>
                  <small>
                    {formatDate(entry.created_at)} · {entry.ip_address ?? "no ip"}
                  </small>
                  {auditDetailText(entry.detail) && <p>{auditDetailText(entry.detail)}</p>}
                </article>
              ))}
              {auditLogs.length === 0 && <p className="muted">No audit entries stored.</p>}
              {auditLogs.length > 0 && filteredAuditLogs.length === 0 && <p className="muted">No audit entries match this filter.</p>}
            </div>
          </section>
        </>
      )}
    </>
  );
}
