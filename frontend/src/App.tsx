import React from "react";
import { Home, LogOut, Pin, Plus, Shield } from "lucide-react";

import { AuthFrame } from "./components/AuthFrame";
import { Dashboard } from "./components/Dashboard";
import { ModDetail } from "./components/ModDetail";
import { Dialog, StatusIcon, UNKNOWN_VALUE } from "./components/common";
import { UserAdmin } from "./components/UserAdmin";
import { useAdminData } from "./hooks/useAdminData";
import { useAuth } from "./hooks/useAuth";
import { useMods } from "./hooks/useMods";
import type { SortMode, UserAccount, UserRole } from "./types";

export function App() {
  const detailRef = React.useRef<HTMLElement | null>(null);
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
  const [modId, setModId] = React.useState("");
  const [currentVersion, setCurrentVersion] = React.useState("");
  const [showAddModDialog, setShowAddModDialog] = React.useState(false);
  const [loginUsername, setLoginUsername] = React.useState("");
  const [loginPassword, setLoginPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const auth = useAuth(
    React.useCallback(() => {
      setShowDashboard(true);
      setShowUserAdmin(false);
    }, []),
  );

  const mods = useMods({ api: auth.api, authUser: auth.authUser });
  const admin = useAdminData({ api: auth.api, authUser: auth.authUser });

  React.useEffect(() => {
    detailRef.current?.scrollTo({ top: 0 });
  }, [mods.selected?.id, showDashboard, showUserAdmin]);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      await auth.login(loginUsername.trim(), loginPassword);
      setLoginPassword("");
    } catch (err) {
      auth.setLoginError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setLoading(false);
      auth.setAuthChecked(true);
    }
  }

  async function logout() {
    await auth.logout();
  }

  async function changeOwnPassword(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const user = await auth.api.changeOwnPassword(currentPassword, newOwnPassword);
      auth.setAuthUser(user);
      setCurrentPassword("");
      setNewOwnPassword("");
      await admin.loadAuditLogs();
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
      await admin.createUser(newUsername.trim(), newPassword, newRole);
      setNewUsername("");
      setNewPassword("");
      setNewRole("user");
      setShowCreateUserDialog(false);
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
      await admin.updateUserAccount(userId, payload);
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
      await admin.resetUserPassword(userId, password);
      setResetPasswords((previous) => ({ ...previous, [userId]: "" }));
      setResetUserId(null);
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
      await mods.addMod(modId.trim(), currentVersion.trim() || null);
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
      await mods.refreshMod(id);
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
      await mods.removeMod(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setLoading(false);
    }
  }

  async function updateInstalledVersion(nextVersion = mods.installedVersionEdit) {
    setLoading(true);
    setError(null);
    try {
      await mods.updateInstalledVersion(nextVersion);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setLoading(false);
    }
  }

  function openMod(id: string) {
    mods.openMod(id);
    setShowDashboard(false);
    setShowUserAdmin(false);
  }

  if (!auth.authChecked) {
    return <AuthFrame title="Checking session" subtitle="Please wait." />;
  }

  if (!auth.authUser) {
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
          {auth.loginError && <div className="error-box">{auth.loginError}</div>}
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
            <button className="icon-button" onClick={logout} title={`Logout ${auth.authUser.username}`}>
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
            <input value={mods.searchQuery} onChange={(event) => mods.setSearchQuery(event.target.value)} placeholder="Mod name or ID" />
          </label>
          <label className="sort-control">
            Sort by
            <select value={mods.sortMode} onChange={(event) => mods.setSortMode(event.target.value as SortMode)}>
              <option value="updates">Updates first</option>
              <option value="name">Name</option>
              <option value="status">Status</option>
              <option value="last_checked">Last checked</option>
            </select>
          </label>
        </div>

        <div className="mod-list">
          {mods.sortedMods.map((mod) => (
            <button key={mod.id} className={`mod-row ${!showDashboard && !showUserAdmin && mods.selected?.id === mod.id ? "active" : ""}`} onClick={() => openMod(mod.id)}>
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
          {mods.mods.length === 0 && <p className="empty">No mods tracked yet.</p>}
          {mods.mods.length > 0 && mods.sortedMods.length === 0 && <p className="empty">No mods match your search.</p>}
        </div>
      </section>

      <section className="detail" aria-label="Mod Details" ref={detailRef}>
        {showDashboard ? (
          <Dashboard mods={mods.mods} schedulerStatus={mods.schedulerStatus} openMod={openMod} />
        ) : showUserAdmin ? (
          <UserAdmin
            users={admin.users}
            currentUser={auth.authUser}
            loading={loading}
            newUsername={newUsername}
            newPassword={newPassword}
            newRole={newRole}
            currentPassword={currentPassword}
            newOwnPassword={newOwnPassword}
            resetPasswords={resetPasswords}
            showCreateUserDialog={showCreateUserDialog}
            resetUserId={resetUserId}
            auditLogs={admin.auditLogs}
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
            loadAuditLogs={() => admin.loadAuditLogs().then(() => undefined)}
          />
        ) : mods.selected ? (
          <ModDetail
            selected={mods.selected}
            loading={loading}
            saveState={mods.saveState}
            installedVersionEdit={mods.installedVersionEdit}
            setInstalledVersionEdit={mods.setInstalledVersionEdit}
            refreshMod={refreshMod}
            removeMod={removeMod}
            updateInstalledVersion={updateInstalledVersion}
            changelogEntries={mods.changelogEntries}
            expandedChangelogVersions={mods.expandedChangelogVersions}
            toggleChangelogVersion={mods.toggleChangelogVersion}
            trackedDependencyMatches={mods.trackedDependencyMatches}
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
