import React from "react";
import { Plus, RefreshCw, Save, Trash2 } from "lucide-react";

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
  const [resetUserId, setResetUserId] = React.useState<number | null>(null);
  const [deleteUserId, setDeleteUserId] = React.useState<number | null>(null);
  const [resetPasswords, setResetPasswords] = React.useState<Record<number, string>>({});
  const [auditFilter, setAuditFilter] = React.useState<AuditFilter>("all");

  const resetUser = users.find((user) => user.id === resetUserId) ?? null;
  const deleteTarget = users.find((user) => user.id === deleteUserId) ?? null;
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

  async function handleResetUserPassword(userId: number) {
    const password = resetPasswords[userId] ?? "";
    if (password.length < 12) return;
    await resetUserPassword(userId, password);
    setResetPasswords((previous) => ({ ...previous, [userId]: "" }));
    setResetUserId(null);
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
                <CustomSelect<UserRole>
                  value={user.role}
                  options={[
                    { value: "user", label: "User" },
                    { value: "admin", label: "Admin" },
                  ]}
                  disabled={loading}
                  onChange={(value) => updateUserAccount(user.id, { role: value }).catch(() => null)}
                  ariaLabel={`Role for ${user.username}`}
                />
                <button
                  className={`secondary-button compact ${user.is_active ? "danger-button" : ""}`}
                  disabled={loading || user.id === currentUser.id}
                  onClick={() => updateUserAccount(user.id, { is_active: !user.is_active }).catch(() => null)}
                  type="button"
                >
                  {user.is_active ? "Disable" : "Enable"}
                </button>
                <button className="secondary-button compact" disabled={loading} onClick={() => setResetUserId(user.id)} type="button">
                  Reset Password
                </button>
                <button
                  className="secondary-button compact danger-button"
                  disabled={loading || user.id === currentUser.id}
                  onClick={() => setDeleteUserId(user.id)}
                  type="button"
                >
                  <Trash2 size={16} />
                  Delete
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

          {resetUser && (
            <Dialog title={`Reset password for ${resetUser.username}`} onClose={() => setResetUserId(null)}>
              <div className="dialog-form">
                <label>
                  New password
                  <input
                    value={resetPasswords[resetUser.id] ?? ""}
                    onChange={(event) => setResetPasswords((previous) => ({ ...previous, [resetUser.id]: event.target.value }))}
                    type="password"
                    placeholder="at least 12 characters"
                  />
                </label>
                <div className="dialog-actions">
                  <button className="secondary-button compact" onClick={() => setResetUserId(null)} type="button">
                    Cancel
                  </button>
                  <button
                    className="primary-button compact"
                    disabled={loading || (resetPasswords[resetUser.id] ?? "").length < 12}
                    onClick={() => handleResetUserPassword(resetUser.id).catch(() => null)}
                    type="button"
                  >
                    Reset
                  </button>
                </div>
              </div>
            </Dialog>
          )}

          {deleteTarget && (
            <Dialog title={`Delete user ${deleteTarget.username}`} onClose={() => setDeleteUserId(null)}>
              <div className="dialog-form">
                <p className="muted">
                  Delete <strong>{deleteTarget.username}</strong> permanently?
                </p>
                <div className="dialog-actions">
                  <button className="secondary-button compact" onClick={() => setDeleteUserId(null)} type="button">
                    Cancel
                  </button>
                  <button
                    className="secondary-button compact danger-button"
                    disabled={loading || deleteTarget.id === currentUser.id}
                    onClick={() => {
                      deleteUser(deleteTarget.id)
                        .then(() => setDeleteUserId(null))
                        .catch(() => null);
                    }}
                    type="button"
                  >
                    Delete
                  </button>
                </div>
              </div>
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
