import React from "react";

import { AddModDialog } from "./components/AddModDialog";
import { AuthFrame } from "./components/AuthFrame";
import { Dashboard } from "./components/Dashboard";
import { LoginForm } from "./components/LoginForm";
import { ModManagement } from "./components/ModManagement";
import { ModsetDialog } from "./components/ModsetDialog";
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
        showDashboard={view.showDashboard}
        showModManagement={view.showModManagement}
        showUserAdmin={view.showUserAdmin}
        onShowDashboard={view.showDashboardView}
        onShowModManagement={view.showModManagementView}
        onToggleSecurity={view.toggleSecurityView}
        onLogout={actions.logout}
      />

      {view.showAddModDialog && <AddModDialog loading={actions.loading} onClose={view.closeAddModDialog} onSubmit={actions.addMod} />}
      {view.showModsetDialog && (
        <ModsetDialog
          modsets={modsets.modsets}
          activeModsetId={modsets.activeModsetId}
          loading={actions.loading}
          onClose={view.closeModsetDialog}
          onCreate={actions.createModset}
          onRename={actions.updateModset}
          onDelete={actions.deleteModset}
        />
      )}

      <section className="detail" aria-label="Mod Details" ref={detailRef}>
        {view.showDashboard ? (
          <Dashboard mods={mods.mods} schedulerStatus={mods.schedulerStatus} openMod={openMod} />
        ) : view.showModManagement ? (
          <ModManagement
            loading={actions.loading}
            modsets={modsets.modsets}
            activeModsetId={modsets.activeModsetId}
            mods={mods.mods}
            sortedMods={mods.sortedMods}
            selected={mods.selected}
            selectedId={mods.selectedId}
            searchQuery={mods.searchQuery}
            sortMode={mods.sortMode}
            saveState={mods.saveState}
            installedVersionEdit={mods.installedVersionEdit}
            changelogEntries={mods.changelogEntries}
            expandedChangelogVersions={mods.expandedChangelogVersions}
            trackedDependencyMatches={mods.trackedDependencyMatches}
            setSearchQuery={mods.setSearchQuery}
            setSortMode={mods.setSortMode}
            setInstalledVersionEdit={mods.setInstalledVersionEdit}
            openMod={openMod}
            activateModset={actions.activateModset}
            openAddModDialog={view.openAddModDialog}
            openModsetDialog={view.openModsetDialog}
            refreshMod={actions.refreshMod}
            removeMod={actions.removeMod}
            updateInstalledVersion={actions.updateInstalledVersion}
            toggleChangelogVersion={mods.toggleChangelogVersion}
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
