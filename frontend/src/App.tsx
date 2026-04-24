import React from "react";

import { AddModDialog } from "./components/AddModDialog";
import { AuthFrame } from "./components/AuthFrame";
import { Dashboard } from "./components/Dashboard";
import { LoginForm } from "./components/LoginForm";
import { ModDetail } from "./components/ModDetail";
import { ModsetManagement } from "./components/ModsetManagement";
import { Sidebar } from "./components/Sidebar";
import { UserAdmin } from "./components/UserAdmin";
import { useAppController } from "./hooks/useAppController";

export function App() {
  const { detailRef, view, auth, modsets, mods, admin, actions, openMod } = useAppController();

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
        showDashboard={view.showDashboard}
        showModsetAdmin={view.showModsetAdmin}
        showUserAdmin={view.showUserAdmin}
        modsets={modsets.modsets}
        activeModsetId={modsets.activeModsetId}
        searchQuery={mods.searchQuery}
        sortMode={mods.sortMode}
        mods={mods.sortedMods}
        totalModsCount={mods.mods.length}
        selectedModId={mods.selected?.id ?? null}
        onShowDashboard={view.showDashboardView}
        onShowModsetAdmin={view.showModsetAdminView}
        onToggleSecurity={view.toggleSecurityView}
        onLogout={actions.logout}
        onShowAddMod={view.openAddModDialog}
        onActivateModset={actions.activateModset}
        onSearchChange={mods.setSearchQuery}
        onSortChange={mods.setSortMode}
        onOpenMod={openMod}
      />

      {view.showAddModDialog && <AddModDialog loading={actions.loading} onClose={view.closeAddModDialog} onSubmit={actions.addMod} />}

      <section className="detail" aria-label="Mod Details" ref={detailRef}>
        {view.showDashboard ? (
          <Dashboard mods={mods.mods} schedulerStatus={mods.schedulerStatus} openMod={openMod} />
        ) : view.showModsetAdmin ? (
          <ModsetManagement
            modsets={modsets.modsets}
            activeModsetId={modsets.activeModsetId}
            loading={actions.loading}
            error={actions.error}
            createModset={actions.createModset}
            updateModset={actions.updateModset}
            deleteModset={actions.deleteModset}
            activateAndOpenModset={async (modsetId) => {
              await actions.activateModset(modsetId);
              view.openModView();
            }}
          />
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
