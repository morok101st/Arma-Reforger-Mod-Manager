import React from "react";

import { AddModDialog } from "./components/AddModDialog";
import { AuthFrame } from "./components/AuthFrame";
import { Dashboard } from "./components/Dashboard";
import { LoginForm } from "./components/LoginForm";
import { ModDetail } from "./components/ModDetail";
import { Sidebar } from "./components/Sidebar";
import { UserAdmin } from "./components/UserAdmin";
import { useAdminData } from "./hooks/useAdminData";
import { useAuth } from "./hooks/useAuth";
import { useMods } from "./hooks/useMods";
import type { UserAccount, UserRole } from "./types";

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
        <LoginForm
          username={loginUsername}
          password={loginPassword}
          loginError={auth.loginError}
          loading={loading}
          setUsername={setLoginUsername}
          setPassword={setLoginPassword}
          onSubmit={login}
        />
      </AuthFrame>
    );
  }

  return (
    <main className="app-shell">
      <Sidebar
        username={auth.authUser.username}
        loading={loading}
        error={error}
        showDashboard={showDashboard}
        showUserAdmin={showUserAdmin}
        searchQuery={mods.searchQuery}
        sortMode={mods.sortMode}
        mods={mods.sortedMods}
        totalModsCount={mods.mods.length}
        selectedModId={mods.selected?.id ?? null}
        onShowDashboard={() => {
          setShowDashboard(true);
          setShowUserAdmin(false);
        }}
        onToggleSecurity={() => {
          setShowDashboard(false);
          setShowUserAdmin((value) => !value);
        }}
        onLogout={logout}
        onShowAddMod={() => setShowAddModDialog(true)}
        onSearchChange={mods.setSearchQuery}
        onSortChange={mods.setSortMode}
        onOpenMod={openMod}
      />

      {showAddModDialog && (
        <AddModDialog
          modId={modId}
          currentVersion={currentVersion}
          loading={loading}
          setModId={setModId}
          setCurrentVersion={setCurrentVersion}
          onClose={() => setShowAddModDialog(false)}
          onSubmit={addMod}
        />
      )}

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
