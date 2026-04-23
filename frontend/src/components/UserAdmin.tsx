import React from "react";
import { Plus, RefreshCw, Save } from "lucide-react";

import { auditActionLabel, auditDetailText, auditEntityLine, auditFilterLabel, auditSeverity, filterAuditLogs, formatDate } from "../lib/utils";
import type { AuditFilter, AuditLog, AuthUser, UserAccount, UserRole } from "../types";
import { Dialog, Info } from "./common";

export function UserAdmin({
  users,
  currentUser,
  loading,
  newUsername,
  newPassword,
  newRole,
  currentPassword,
  newOwnPassword,
  resetPasswords,
  showCreateUserDialog,
  resetUserId,
  auditLogs,
  setNewUsername,
  setNewPassword,
  setNewRole,
  setCurrentPassword,
  setNewOwnPassword,
  setResetPasswords,
  setShowCreateUserDialog,
  setResetUserId,
  addUser,
  changeOwnPassword,
  updateUserAccount,
  resetUserPassword,
  loadAuditLogs,
}: {
  users: UserAccount[];
  currentUser: AuthUser;
  loading: boolean;
  newUsername: string;
  newPassword: string;
  newRole: UserRole;
  currentPassword: string;
  newOwnPassword: string;
  resetPasswords: Record<number, string>;
  showCreateUserDialog: boolean;
  resetUserId: number | null;
  auditLogs: AuditLog[];
  setNewUsername: (value: string) => void;
  setNewPassword: (value: string) => void;
  setNewRole: (value: UserRole) => void;
  setCurrentPassword: (value: string) => void;
  setNewOwnPassword: (value: string) => void;
  setResetPasswords: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  setShowCreateUserDialog: (value: boolean) => void;
  setResetUserId: (value: number | null) => void;
  addUser: (event: React.FormEvent) => void;
  changeOwnPassword: (event: React.FormEvent) => void;
  updateUserAccount: (userId: number, payload: Partial<Pick<UserAccount, "role" | "is_active">>) => void;
  resetUserPassword: (userId: number) => void;
  loadAuditLogs: () => Promise<void>;
}) {
  const resetUser = users.find((user) => user.id === resetUserId) ?? null;
  const [auditFilter, setAuditFilter] = React.useState<AuditFilter>("all");
  const filteredAuditLogs = React.useMemo(() => filterAuditLogs(auditLogs, auditFilter), [auditLogs, auditFilter]);

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

      <form className="user-form" onSubmit={changeOwnPassword}>
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
                <select value={user.role} disabled={loading} onChange={(event) => updateUserAccount(user.id, { role: event.target.value as UserRole })}>
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
                <button
                  className="secondary-button compact"
                  disabled={loading || user.id === currentUser.id}
                  onClick={() => updateUserAccount(user.id, { is_active: !user.is_active })}
                  type="button"
                >
                  {user.is_active ? "Disable" : "Enable"}
                </button>
                <button className="secondary-button compact" disabled={loading} onClick={() => setResetUserId(user.id)} type="button">
                  Reset Password
                </button>
              </article>
            ))}
          </div>

          {showCreateUserDialog && (
            <Dialog title="Create user" onClose={() => setShowCreateUserDialog(false)}>
              <form className="dialog-form" onSubmit={addUser}>
                <label>
                  Username
                  <input value={newUsername} onChange={(event) => setNewUsername(event.target.value)} placeholder="admin.user" />
                </label>
                <label>
                  Initial password
                  <input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type="password" placeholder="at least 12 characters" />
                </label>
                <label className="sort-control">
                  Role
                  <select value={newRole} onChange={(event) => setNewRole(event.target.value as UserRole)}>
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
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
                    onClick={() => resetUserPassword(resetUser.id)}
                    type="button"
                  >
                    Reset
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
