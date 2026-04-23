import React from "react";

import { AddModDialog } from "./components/AddModDialog";
import { AuthFrame } from "./components/AuthFrame";
import { Dashboard } from "./components/Dashboard";
import { LoginForm } from "./components/LoginForm";
import { ModDetail } from "./components/ModDetail";
import { Sidebar } from "./components/Sidebar";
import { UserAdmin } from "./components/UserAdmin";
import { useAdminData } from "./hooks/useAdminData";
import { useAppActions } from "./hooks/useAppActions";
import { useAuth } from "./hooks/useAuth";
import { useMods } from "./hooks/useMods";
import { useWorkspaceView } from "./hooks/useWorkspaceView";

export function App() {
  const detailRef = React.useRef<HTMLElement | null>(null);
  const view = useWorkspaceView();

  const auth = useAuth(view.showDashboardView);
  const mods = useMods({ api: auth.api, authUser: auth.authUser });
  const admin = useAdminData({ api: auth.api, authUser: auth.authUser });
  const actions = useAppActions({
    auth,
    admin,
    mods,
    closeAddModDialog: view.closeAddModDialog,
    openModView: view.openModView,
    showDashboardView: view.showDashboardView,
  });

  React.useEffect(() => {
    detailRef.current?.scrollTo({ top: 0 });
  }, [mods.selected?.id, view.showDashboard, view.showUserAdmin]);

  const openMod = React.useCallback(
    (id: string) => {
      mods.openMod(id);
      view.openModView();
    },
    [mods, view],
  );

  if (!auth.authChecked) {
    return <AuthFrame title="Checking session" subtitle="Please wait." />;
  }

  if (!auth.authUser) {
    return (
      <AuthFrame title="Arma Reforger Mod Manager" subtitle="Sign in to manage tracked Workshop mods.">
        <LoginForm loginError={auth.loginError} loading={actions.loading} onSubmit={actions.login} />
      </AuthFrame>
    );
  }

  return (
    <main className="app-shell">
      <Sidebar
        username={auth.authUser.username}
        loading={actions.loading}
        error={actions.error}
        showDashboard={view.showDashboard}
        showUserAdmin={view.showUserAdmin}
        searchQuery={mods.searchQuery}
        sortMode={mods.sortMode}
        mods={mods.sortedMods}
        totalModsCount={mods.mods.length}
        selectedModId={mods.selected?.id ?? null}
        onShowDashboard={view.showDashboardView}
        onToggleSecurity={view.toggleSecurityView}
        onLogout={actions.logout}
        onShowAddMod={view.openAddModDialog}
        onSearchChange={mods.setSearchQuery}
        onSortChange={mods.setSortMode}
        onOpenMod={openMod}
      />

      {view.showAddModDialog && <AddModDialog loading={actions.loading} onClose={view.closeAddModDialog} onSubmit={actions.addMod} />}

      <section className="detail" aria-label="Mod Details" ref={detailRef}>
        {view.showDashboard ? (
          <Dashboard mods={mods.mods} schedulerStatus={mods.schedulerStatus} openMod={openMod} />
        ) : view.showUserAdmin ? (
          <UserAdmin
            users={admin.users}
            currentUser={auth.authUser}
            loading={actions.loading}
            auditLogs={admin.auditLogs}
            changeOwnPassword={actions.changeOwnPassword}
            createUser={actions.createUser}
            updateUserAccount={actions.updateUserAccount}
            resetUserPassword={actions.resetUserPassword}
            loadAuditLogs={() => admin.loadAuditLogs().then(() => undefined)}
          />
        ) : mods.selected ? (
          <ModDetail
            selected={mods.selected}
            loading={actions.loading}
            saveState={mods.saveState}
            installedVersionEdit={mods.installedVersionEdit}
            setInstalledVersionEdit={mods.setInstalledVersionEdit}
            refreshMod={actions.refreshMod}
            removeMod={actions.removeMod}
            updateInstalledVersion={actions.updateInstalledVersion}
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
