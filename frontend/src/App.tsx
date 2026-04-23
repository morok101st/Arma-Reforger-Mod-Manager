import React from "react";
import { Home, LogOut, Pin, Plus, Shield } from "lucide-react";

import { AuthFrame } from "./components/AuthFrame";
import { Dashboard } from "./components/Dashboard";
import { ModDetail } from "./components/ModDetail";
import { Dialog, StatusIcon, UNKNOWN_VALUE } from "./components/common";
import { UserAdmin } from "./components/UserAdmin";
import { changelogEntriesFromVersions, dependencyKey, filterMods, findTrackedDependency, sortMods } from "./lib/utils";
import type { AuditLog, AuthUser, Mod, SchedulerStatus, SortMode, UserAccount, UserRole } from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export function App() {
  const detailRef = React.useRef<HTMLElement | null>(null);
  const [authChecked, setAuthChecked] = React.useState(false);
  const [authUser, setAuthUser] = React.useState<AuthUser | null>(null);
  const [loginUsername, setLoginUsername] = React.useState("");
  const [loginPassword, setLoginPassword] = React.useState("");
  const [loginError, setLoginError] = React.useState<string | null>(null);
  const [users, setUsers] = React.useState<UserAccount[]>([]);
  const [showDashboard, setShowDashboard] = React.useState(true);
  const [showUserAdmin, setShowUserAdmin] = React.useState(false);
  const [newUsername, setNewUsername] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [newRole, setNewRole] = React.useState<UserRole>("user");
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newOwnPassword, setNewOwnPassword] = React.useState("");
  const [resetPasswords, setResetPasswords] = React.useState<Record<number, string>>({});
  const [showCreateUserDialog, setShowCreateUserDialog] = React.useState(false);
  const [resetUserId, setResetUserId] = React.useState<number | null>(null);
  const [auditLogs, setAuditLogs] = React.useState<AuditLog[]>([]);
  const [schedulerStatus, setSchedulerStatus] = React.useState<SchedulerStatus | null>(null);
  const [mods, setMods] = React.useState<Mod[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [modId, setModId] = React.useState("");
  const [currentVersion, setCurrentVersion] = React.useState("");
  const [showAddModDialog, setShowAddModDialog] = React.useState(false);
  const [installedVersionEdit, setInstalledVersionEdit] = React.useState("");
  const [expandedChangelogVersions, setExpandedChangelogVersions] = React.useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = React.useState<SortMode>("updates");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [saveState, setSaveState] = React.useState<"idle" | "saved">("idle");
  const [error, setError] = React.useState<string | null>(null);

  const visibleMods = React.useMemo(() => filterMods(mods, searchQuery), [mods, searchQuery]);
  const sortedMods = React.useMemo(() => sortMods(visibleMods, sortMode), [visibleMods, sortMode]);
  const selected = sortedMods.find((mod) => mod.id === selectedId) ?? sortedMods[0] ?? null;
  const changelogEntries = React.useMemo(() => changelogEntriesFromVersions(selected?.versions ?? []), [selected?.versions]);
  const trackedDependencyMatches = React.useMemo(
    () => new Map((selected?.dependencies ?? []).map((dependency) => [dependencyKey(dependency), findTrackedDependency(dependency, mods)])),
    [mods, selected?.dependencies],
  );

  React.useEffect(() => {
    checkSession().catch((err: Error) => {
      setLoginError(err.message);
      setAuthChecked(true);
    });
  }, []);

  React.useEffect(() => {
    if (!authUser) return;
    loadMods().catch((err: Error) => setError(err.message));
    loadSchedulerStatus().catch((err: Error) => setError(err.message));
  }, [authUser?.id]);

  React.useEffect(() => {
    if (authUser?.role !== "admin") return;
    loadUsers().catch((err: Error) => setError(err.message));
    loadAuditLogs().catch((err: Error) => setError(err.message));
  }, [authUser?.id, authUser?.role]);

  React.useEffect(() => {
    setInstalledVersionEdit(selected?.current_version ?? "");
  }, [selected?.id, selected?.current_version]);

  React.useEffect(() => {
    setSaveState("idle");
  }, [selected?.id]);

  React.useEffect(() => {
    setExpandedChangelogVersions(changelogEntries[0] ? new Set([changelogEntries[0].version]) : new Set());
  }, [selected?.id, changelogEntries]);

  React.useEffect(() => {
    detailRef.current?.scrollTo({ top: 0 });
  }, [selected?.id, showDashboard, showUserAdmin]);

  async function apiFetch(path: string, options: RequestInit = {}) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      credentials: "include",
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });

    if (response.status === 401) {
      setAuthUser(null);
      setMods([]);
      setSchedulerStatus(null);
      setShowDashboard(true);
      setShowUserAdmin(false);
    }
    return response;
  }

  async function checkSession() {
    const response = await fetch(`${API_BASE_URL}/auth/me`, { credentials: "include" });
    if (response.ok) {
      setAuthUser((await response.json()) as AuthUser);
    }
    setAuthChecked(true);
  }

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setLoginError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginUsername.trim(), password: loginPassword }),
      });
      if (!response.ok) throw new Error("Login failed.");
      const user = (await response.json()) as AuthUser;
      setAuthUser(user);
      setLoginPassword("");
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setLoading(false);
      setAuthChecked(true);
    }
  }

  async function logout() {
    await apiFetch("/auth/logout", { method: "POST" }).catch(() => null);
    setAuthUser(null);
    setMods([]);
    setUsers([]);
    setSchedulerStatus(null);
    setShowDashboard(true);
    setShowUserAdmin(false);
  }

  async function loadMods() {
    setError(null);
    const response = await apiFetch("/mods");
    if (!response.ok) throw new Error("Could not load mod list.");
    const data = (await response.json()) as Mod[];
    setMods(data);
    if (!selectedId && data.length > 0) setSelectedId(data[0].id);
  }

  async function loadUsers() {
    const response = await apiFetch("/users");
    if (!response.ok) throw new Error("Could not load users.");
    setUsers((await response.json()) as UserAccount[]);
  }

  async function loadAuditLogs() {
    const response = await apiFetch("/audit?limit=25");
    if (!response.ok) throw new Error("Could not load audit log.");
    setAuditLogs((await response.json()) as AuditLog[]);
  }

  async function loadSchedulerStatus() {
    const response = await apiFetch("/scheduler/status");
    if (!response.ok) throw new Error("Could not load scheduler status.");
    setSchedulerStatus((await response.json()) as SchedulerStatus);
  }

  async function changeOwnPassword(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch("/auth/password", {
        method: "PATCH",
        body: JSON.stringify({ current_password: currentPassword, new_password: newOwnPassword }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail ?? "Could not change password.");
      }
      setAuthUser((await response.json()) as AuthUser);
      setCurrentPassword("");
      setNewOwnPassword("");
      await loadAuditLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setLoading(false);
    }
  }

  async function addUser(event: React.FormEvent) {
    event.preventDefault();
    if (!newUsername.trim() || !newPassword) return;

    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch("/users", {
        method: "POST",
        body: JSON.stringify({ username: newUsername.trim(), password: newPassword, role: newRole }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail ?? "Could not create user.");
      }
      setNewUsername("");
      setNewPassword("");
      setNewRole("user");
      setShowCreateUserDialog(false);
      await loadUsers();
      await loadAuditLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setLoading(false);
    }
  }

  async function updateUserAccount(userId: number, payload: Partial<Pick<UserAccount, "role" | "is_active">>) {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch(`/users/${userId}`, { method: "PATCH", body: JSON.stringify(payload) });
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        throw new Error(errorPayload?.detail ?? "Could not update user.");
      }
      await loadUsers();
      await loadAuditLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setLoading(false);
    }
  }

  async function resetUserPassword(userId: number) {
    const password = resetPasswords[userId] ?? "";
    if (password.length < 12) return;

    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch(`/users/${userId}/password`, { method: "PATCH", body: JSON.stringify({ password }) });
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        throw new Error(errorPayload?.detail ?? "Could not reset password.");
      }
      setResetPasswords((previous) => ({ ...previous, [userId]: "" }));
      setResetUserId(null);
      await loadUsers();
      await loadAuditLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setLoading(false);
    }
  }

  async function addMod(event: React.FormEvent) {
    event.preventDefault();
    if (!modId.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch("/mods", {
        method: "POST",
        body: JSON.stringify({ id: modId.trim(), current_version: currentVersion.trim() || null }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail ?? "Could not add mod.");
      }
      const created = (await response.json()) as Mod;
      await loadMods();
      setSelectedId(created.id);
      setShowDashboard(false);
      setShowUserAdmin(false);
      setModId("");
      setCurrentVersion("");
      setShowAddModDialog(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshMod(id: string) {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch(`/mods/${id}/refresh`, { method: "POST" });
      if (!response.ok) throw new Error("Refresh failed.");
      await loadMods();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setLoading(false);
    }
  }

  async function removeMod(id: string) {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch(`/mods/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not delete mod.");
      setSelectedId(null);
      await loadMods();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setLoading(false);
    }
  }

  async function updateInstalledVersion(nextVersion = installedVersionEdit) {
    if (!selected) return;

    const normalizedVersion = nextVersion.trim();
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch(`/mods/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({ current_version: normalizedVersion || null }),
      });
      if (!response.ok) throw new Error("Could not update installed version.");
      const updated = (await response.json()) as Mod;
      await loadMods();
      setSelectedId(updated.id);
      setInstalledVersionEdit(updated.current_version ?? "");
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setLoading(false);
    }
  }

  function toggleChangelogVersion(version: string) {
    setExpandedChangelogVersions((previous) => {
      const next = new Set(previous);
      if (next.has(version)) {
        next.delete(version);
      } else {
        next.add(version);
      }
      return next;
    });
  }

  function openMod(id: string) {
    setSelectedId(id);
    setShowDashboard(false);
    setShowUserAdmin(false);
  }

  if (!authChecked) {
    return <AuthFrame title="Checking session" subtitle="Please wait." />;
  }

  if (!authUser) {
    return (
      <AuthFrame title="Arma Reforger Mod Manager" subtitle="Sign in to manage tracked Workshop mods.">
        <form className="login-form" onSubmit={login}>
          <label>
            Username
            <input value={loginUsername} onChange={(event) => setLoginUsername(event.target.value)} autoComplete="username" />
          </label>
          <label>
            Password
            <input value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} type="password" autoComplete="current-password" />
          </label>
          {loginError && <div className="error-box">{loginError}</div>}
          <button className="primary-button" disabled={loading || !loginUsername.trim() || !loginPassword}>
            <Shield size={18} />
            Sign in
          </button>
        </form>
      </AuthFrame>
    );
  }

  return (
    <main className="app-shell">
      <section className="sidebar" aria-label="Mod management">
        <div className="brand">
          <div>
            <p>Arma Reforger Mod Manager</p>
          </div>
          <div className="header-actions">
            <button
              className="icon-button"
              onClick={() => {
                setShowDashboard(true);
                setShowUserAdmin(false);
              }}
              title="Dashboard"
            >
              <Home size={18} />
            </button>
            <button
              className="icon-button"
              onClick={() => {
                setShowDashboard(false);
                setShowUserAdmin((value) => !value);
              }}
              title="Security"
            >
              <Shield size={18} />
            </button>
            <button className="icon-button" onClick={logout} title={`Logout ${authUser.username}`}>
              <LogOut size={18} />
            </button>
          </div>
        </div>

        <button className="primary-button" onClick={() => setShowAddModDialog(true)} type="button">
          <Plus size={18} />
          Add mod
        </button>

        {showAddModDialog && (
          <Dialog title="Add mod" onClose={() => setShowAddModDialog(false)}>
            <form className="dialog-form" onSubmit={addMod}>
              <label>
                Workshop ID
                <input value={modId} onChange={(event) => setModId(event.target.value)} placeholder="672B195EAD3036D4" />
              </label>
              <label>
                Installed version
                <input value={currentVersion} onChange={(event) => setCurrentVersion(event.target.value)} placeholder="optional" />
              </label>
              <div className="dialog-actions">
                <button className="secondary-button compact" onClick={() => setShowAddModDialog(false)} type="button">
                  Cancel
                </button>
                <button className="primary-button compact" disabled={loading || !modId.trim()}>
                  Add
                </button>
              </div>
            </form>
          </Dialog>
        )}

        {error && <div className="error-box">{error}</div>}

        <div className="filter-row">
          <label>
            Search
            <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Mod name or ID" />
          </label>
          <label className="sort-control">
            Sort by
            <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
              <option value="updates">Updates first</option>
              <option value="name">Name</option>
              <option value="status">Status</option>
              <option value="last_checked">Last checked</option>
            </select>
          </label>
        </div>

        <div className="mod-list">
          {sortedMods.map((mod) => (
            <button key={mod.id} className={`mod-row ${!showDashboard && !showUserAdmin && selected?.id === mod.id ? "active" : ""}`} onClick={() => openMod(mod.id)}>
              <StatusIcon status={mod.status} />
              <span>
                <strong>{mod.name ?? mod.id}</strong>
                <small>
                  {mod.current_version ?? "No installed version"} / {mod.latest_version ?? UNKNOWN_VALUE}
                  <span className="relation-count">{mod.dependencies.length} deps</span>
                  <span className="relation-count">{mod.dependents.length} req</span>
                  {mod.tracking_reason === "dependency" && <span className="tracking-badge">dep</span>}
                </small>
              </span>
              {mod.pinned && <Pin size={14} />}
            </button>
          ))}
          {mods.length === 0 && <p className="empty">No mods tracked yet.</p>}
          {mods.length > 0 && sortedMods.length === 0 && <p className="empty">No mods match your search.</p>}
        </div>
      </section>

      <section className="detail" aria-label="Mod Details" ref={detailRef}>
        {showDashboard ? (
          <Dashboard mods={mods} schedulerStatus={schedulerStatus} openMod={openMod} />
        ) : showUserAdmin ? (
          <UserAdmin
            users={users}
            currentUser={authUser}
            loading={loading}
            newUsername={newUsername}
            newPassword={newPassword}
            newRole={newRole}
            currentPassword={currentPassword}
            newOwnPassword={newOwnPassword}
            resetPasswords={resetPasswords}
            showCreateUserDialog={showCreateUserDialog}
            resetUserId={resetUserId}
            auditLogs={auditLogs}
            setNewUsername={setNewUsername}
            setNewPassword={setNewPassword}
            setNewRole={setNewRole}
            setCurrentPassword={setCurrentPassword}
            setNewOwnPassword={setNewOwnPassword}
            setResetPasswords={setResetPasswords}
            setShowCreateUserDialog={setShowCreateUserDialog}
            setResetUserId={setResetUserId}
            addUser={addUser}
            changeOwnPassword={changeOwnPassword}
            updateUserAccount={updateUserAccount}
            resetUserPassword={resetUserPassword}
            loadAuditLogs={loadAuditLogs}
          />
        ) : selected ? (
          <ModDetail
            selected={selected}
            loading={loading}
            saveState={saveState}
            installedVersionEdit={installedVersionEdit}
            setInstalledVersionEdit={setInstalledVersionEdit}
            refreshMod={refreshMod}
            removeMod={removeMod}
            updateInstalledVersion={updateInstalledVersion}
            changelogEntries={changelogEntries}
            expandedChangelogVersions={expandedChangelogVersions}
            toggleChangelogVersion={toggleChangelogVersion}
            trackedDependencyMatches={trackedDependencyMatches}
            openMod={openMod}
          />
        ) : (
          <div className="placeholder">
            <h2>Add a mod</h2>
            <p>Use Add mod to start the first fetch.</p>
          </div>
        )}
      </section>
    </main>
  );
}
