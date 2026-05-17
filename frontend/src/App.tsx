import React from "react";
import { Menu } from "lucide-react";

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
  const [mobileSidebarOpen, setMobileSidebarOpen] = React.useState(false);
  const activeModsetName = modsets.modsets.find((modset) => modset.id === modsets.activeModsetId)?.name ?? "Default";
  const openSidebar = React.useCallback(() => setMobileSidebarOpen(true), []);
  const closeSidebar = React.useCallback(() => setMobileSidebarOpen(false), []);
  const handleShowDashboard = React.useCallback(() => {
    closeSidebar();
    view.showDashboardView();
  }, [closeSidebar, view]);
  const handleShowModsetAdmin = React.useCallback(() => {
    closeSidebar();
    view.showModsetAdminView();
  }, [closeSidebar, view]);
  const handleToggleSecurity = React.useCallback(() => {
    closeSidebar();
    view.toggleSecurityView();
  }, [closeSidebar, view]);
  const handleShowAddMod = React.useCallback(() => {
    closeSidebar();
    view.openAddModDialog();
  }, [closeSidebar, view]);
  const handleActivateModset = React.useCallback(
    (modsetId: number) => {
      closeSidebar();
      actions.activateModset(modsetId);
    },
    [actions, closeSidebar],
  );
  const handleOpenMod = React.useCallback(
    (id: string) => {
      closeSidebar();
      openMod(id);
    },
    [closeSidebar, openMod],
  );

  React.useEffect(() => {
    if (!mobileSidebarOpen) {
      return;
    }

    document.body.classList.add("drawer-open");
    return () => document.body.classList.remove("drawer-open");
  }, [mobileSidebarOpen]);

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

  const authUser = auth.authUser;

  return (
    <main className={`app-shell ${mobileSidebarOpen ? "mobile-sidebar-open" : ""}`}>
      {mobileSidebarOpen && <button className="sidebar-backdrop" aria-label="Close mod list" onClick={closeSidebar} type="button" />}
      <Sidebar
        isMobileDrawerOpen={mobileSidebarOpen}
        username={authUser.username}
        themePreference={authUser.theme_preference}
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
        onShowDashboard={handleShowDashboard}
        onShowModsetAdmin={handleShowModsetAdmin}
        onToggleSecurity={handleToggleSecurity}
        onToggleTheme={() => actions.updateThemePreference(authUser.theme_preference === "dark" ? "light" : "dark")}
        onLogout={actions.logout}
        onShowAddMod={handleShowAddMod}
        onActivateModset={handleActivateModset}
        onSearchChange={mods.setSearchQuery}
        onSortChange={mods.setSortMode}
        onOpenMod={handleOpenMod}
      />

      {view.showAddModDialog && (
        <AddModDialog
          loading={actions.loading}
          modsets={modsets.modsets}
          activeModsetId={modsets.activeModsetId}
          onClose={view.closeAddModDialog}
          onSubmit={actions.addMod}
        />
      )}

      <section className="detail" aria-label="Mod Details" ref={detailRef}>
        <div className="mobile-toolbar">
          <button className="icon-button mobile-drawer-button" onClick={openSidebar} type="button" aria-label="Open mod list">
            <Menu size={18} />
          </button>
          <div className="mobile-toolbar-title">
            <p>{view.showDashboard ? "Overview" : view.showModsetAdmin ? "Modsets" : view.showUserAdmin ? "Security" : "Mods"}</p>
            <strong>{activeModsetName}</strong>
          </div>
        </div>
        {view.showDashboard ? (
          <Dashboard mods={mods.mods} schedulerStatus={mods.schedulerStatus} openMod={handleOpenMod} activeModsetName={activeModsetName} />
        ) : view.showModsetAdmin ? (
          <ModsetManagement
            modsets={modsets.modsets}
            activeModsetId={modsets.activeModsetId}
            loading={actions.loading}
            error={actions.error}
            createModset={actions.createModset}
            updateModset={actions.updateModset}
            deleteModset={actions.deleteModset}
            activateModset={actions.activateModset}
            exportModset={actions.exportModset}
          />
        ) : view.showUserAdmin ? (
          <UserAdmin
            users={admin.users}
            webhooks={admin.discordWebhooks}
            modsets={admin.modsets}
            currentUser={authUser}
            loading={actions.loading}
            auditLogs={admin.auditLogs}
            changeOwnPassword={actions.changeOwnPassword}
            createDiscordWebhook={actions.createDiscordWebhook}
            createUser={actions.createUser}
            updateDiscordWebhook={actions.updateDiscordWebhook}
            updateUserAccount={actions.updateUserAccount}
            deleteUser={actions.deleteUser}
            deleteDiscordWebhook={actions.deleteDiscordWebhook}
            resetUserPassword={actions.resetUserPassword}
            testDiscordWebhook={actions.testDiscordWebhook}
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
            allTrackedMods={mods.mods}
            openMod={handleOpenMod}
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
