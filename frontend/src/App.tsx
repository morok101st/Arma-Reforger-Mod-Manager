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
import type { UserAccount } from "./types";

export function App() {
  const detailRef = React.useRef<HTMLElement | null>(null);
  const [showDashboard, setShowDashboard] = React.useState(true);
  const [showUserAdmin, setShowUserAdmin] = React.useState(false);
  const [showAddModDialog, setShowAddModDialog] = React.useState(false);
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

  async function login(username: string, password: string) {
    setLoading(true);
    try {
      await auth.login(username.trim(), password);
    } catch (err) {
      auth.setLoginError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setLoading(false);
      auth.setAuthChecked(true);
    }
  }

  async function changeOwnPassword(currentPassword: string, newOwnPassword: string) {
    setLoading(true);
    setError(null);
    try {
      const user = await auth.api.changeOwnPassword(currentPassword, newOwnPassword);
      auth.setAuthUser(user);
      await admin.loadAuditLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function createUser(username: string, password: string, role: UserAccount["role"]) {
    setLoading(true);
    setError(null);
    try {
      await admin.createUser(username, password, role);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
      throw err;
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
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function resetUserPassword(userId: number, password: string) {
    setLoading(true);
    setError(null);
    try {
      await admin.resetUserPassword(userId, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function addMod(modId: string, currentVersion: string | null) {
    setLoading(true);
    setError(null);
    try {
      await mods.addMod(modId.trim(), currentVersion);
      setShowDashboard(false);
      setShowUserAdmin(false);
      setShowAddModDialog(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
      throw err;
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
        <LoginForm loginError={auth.loginError} loading={loading} onSubmit={login} />
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
        onLogout={() => auth.logout()}
        onShowAddMod={() => setShowAddModDialog(true)}
        onSearchChange={mods.setSearchQuery}
        onSortChange={mods.setSortMode}
        onOpenMod={openMod}
      />

      {showAddModDialog && <AddModDialog loading={loading} onClose={() => setShowAddModDialog(false)} onSubmit={addMod} />}

      <section className="detail" aria-label="Mod Details" ref={detailRef}>
        {showDashboard ? (
          <Dashboard mods={mods.mods} schedulerStatus={mods.schedulerStatus} openMod={openMod} />
        ) : showUserAdmin ? (
          <UserAdmin
            users={admin.users}
            currentUser={auth.authUser}
            loading={loading}
            auditLogs={admin.auditLogs}
            changeOwnPassword={changeOwnPassword}
            createUser={createUser}
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
