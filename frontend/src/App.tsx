import React from "react";

import { AddModDialog } from "./components/AddModDialog";
import { AuthFrame } from "./components/AuthFrame";
import { Dashboard } from "./components/Dashboard";
import { LoginForm } from "./components/LoginForm";
import { ModDetail } from "./components/ModDetail";
import { Sidebar } from "./components/Sidebar";
import { UserAdmin } from "./components/UserAdmin";
import { useAdminData } from "./hooks/useAdminData";
import { useAsyncAction } from "./hooks/useAsyncAction";
import { useAuth } from "./hooks/useAuth";
import { useMods } from "./hooks/useMods";
import type { UserAccount } from "./types";

export function App() {
  const detailRef = React.useRef<HTMLElement | null>(null);
  const [showDashboard, setShowDashboard] = React.useState(true);
  const [showUserAdmin, setShowUserAdmin] = React.useState(false);
  const [showAddModDialog, setShowAddModDialog] = React.useState(false);

  const auth = useAuth(
    React.useCallback(() => {
      setShowDashboard(true);
      setShowUserAdmin(false);
    }, []),
  );
  const action = useAsyncAction();

  const mods = useMods({ api: auth.api, authUser: auth.authUser });
  const admin = useAdminData({ api: auth.api, authUser: auth.authUser });

  React.useEffect(() => {
    detailRef.current?.scrollTo({ top: 0 });
  }, [mods.selected?.id, showDashboard, showUserAdmin]);

  async function login(username: string, password: string) {
    await action.run(
      async () => {
        await auth.login(username.trim(), password);
      },
      { clearError: false, rethrow: true },
    ).catch((err) => {
      auth.setLoginError(err instanceof Error ? err.message : "Unknown error.");
    });
    auth.setAuthChecked(true);
  }

  async function changeOwnPassword(currentPassword: string, newOwnPassword: string) {
    await action.run(
      async () => {
        const user = await auth.api.changeOwnPassword(currentPassword, newOwnPassword);
        auth.setAuthUser(user);
        await admin.loadAuditLogs();
      },
      { rethrow: true },
    );
  }

  async function createUser(username: string, password: string, role: UserAccount["role"]) {
    await action.run(() => admin.createUser(username, password, role), { rethrow: true });
  }

  async function updateUserAccount(userId: number, payload: Partial<Pick<UserAccount, "role" | "is_active">>) {
    await action.run(() => admin.updateUserAccount(userId, payload), { rethrow: true });
  }

  async function resetUserPassword(userId: number, password: string) {
    await action.run(() => admin.resetUserPassword(userId, password), { rethrow: true });
  }

  async function addMod(modId: string, currentVersion: string | null) {
    await action.run(
      async () => {
        await mods.addMod(modId.trim(), currentVersion);
        setShowDashboard(false);
        setShowUserAdmin(false);
        setShowAddModDialog(false);
      },
      { rethrow: true },
    );
  }

  async function refreshMod(id: string) {
    await action.run(() => mods.refreshMod(id));
  }

  async function removeMod(id: string) {
    await action.run(() => mods.removeMod(id));
  }

  async function updateInstalledVersion(nextVersion = mods.installedVersionEdit) {
    await action.run(() => mods.updateInstalledVersion(nextVersion));
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
        <LoginForm loginError={auth.loginError} loading={action.loading} onSubmit={login} />
      </AuthFrame>
    );
  }

  return (
    <main className="app-shell">
      <Sidebar
        username={auth.authUser.username}
        loading={action.loading}
        error={action.error}
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

      {showAddModDialog && <AddModDialog loading={action.loading} onClose={() => setShowAddModDialog(false)} onSubmit={addMod} />}

      <section className="detail" aria-label="Mod Details" ref={detailRef}>
        {showDashboard ? (
          <Dashboard mods={mods.mods} schedulerStatus={mods.schedulerStatus} openMod={openMod} />
        ) : showUserAdmin ? (
          <UserAdmin
            users={admin.users}
            currentUser={auth.authUser}
            loading={action.loading}
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
            loading={action.loading}
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
