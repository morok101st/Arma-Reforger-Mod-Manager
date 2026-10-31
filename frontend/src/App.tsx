import React from "react";
import { Download, Home, Layers3, LogOut, Menu, Moon, Plus, Shield, Sun, User } from "lucide-react";

import { AddModDialog } from "./components/AddModDialog";
import { AuthFrame } from "./components/AuthFrame";
import { Dashboard } from "./components/Dashboard";
import { LoginForm } from "./components/LoginForm";
import { ModDetail } from "./components/ModDetail";
import { ModsetManagement } from "./components/ModsetManagement";
import { CustomSelect, focusableElements } from "./components/common";
import { ResourceStatus } from "./components/ResourceStatus";
import { Sidebar } from "./components/Sidebar";
import { UserAdmin, type AdminSection } from "./components/UserAdmin";
import { useAppController } from "./hooks/useAppController";
import { GroupAdmin } from "./components/GroupAdmin";

export function App() {
  const { detailRef, view, auth, modsets, mods, admin, groups, refreshAccess, actions, openMod } = useAppController();
  const [adminSection, setAdminSection] = React.useState<AdminSection>("users");
  const [mobileSidebarOpen, setMobileSidebarOpen] = React.useState(false);
  const deepLinkRef = React.useRef(() => {
    const params = new URLSearchParams(window.location.search);
    const modsetParam = params.get("modset");
    const modParam = params.get("mod");
    const modsetId = modsetParam ? Number(modsetParam) : null;
    return {
      modsetId: Number.isInteger(modsetId) && modsetId ? modsetId : null,
      modId: modParam?.trim() || null,
    };
  });
  const activeModset = modsets.modsets.find((modset) => modset.id === modsets.activeModsetId);
  const activeModsetName = activeModset?.name ?? "No modset selected";
  const modsetsReady = modsets.loadState.loaded && !modsets.loadState.error;
  const modsReady = mods.loadStates.mods.loaded && !mods.loadStates.mods.error;
  const canEdit = Boolean(modsetsReady && modsReady && activeModset?.can_edit);
  const openSidebar = React.useCallback(() => setMobileSidebarOpen(true), []);
  const closeSidebar = React.useCallback(() => setMobileSidebarOpen(false), []);
  React.useEffect(() => {
    if (mobileSidebarOpen && (!modsetsReady || !activeModset)) closeSidebar();
  }, [mobileSidebarOpen, modsetsReady, activeModset?.id, closeSidebar]);
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
    setAdminSection(auth.authUser?.role === "admin" ? "users" : "account");
    view.toggleSecurityView();
  }, [closeSidebar, view, auth.authUser?.role]);
  const handleShowAddMod = React.useCallback(() => {
    closeSidebar();
    view.openAddModDialog();
  }, [closeSidebar, view]);
  const handleActivateModset = React.useCallback(
    (modsetId: number) => {
      closeSidebar();
      actions.activateModset(modsetId).catch(() => null);
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
    if (!mobileSidebarOpen) return;
    const panel = document.querySelector<HTMLElement>(".sidebar");
    if (!panel) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const background = [document.querySelector<HTMLElement>(".app-navigation"), detailRef.current].filter((node): node is HTMLElement => Boolean(node));
    const previousInert = background.map(node => node.inert);
    background.forEach(node => { node.inert = true; });
    const focusable = () => focusableElements(panel);
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeSidebar(); }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items[items.length - 1]?.focus(); }
      else if (!event.shiftKey && document.activeElement === items[items.length - 1]) { event.preventDefault(); items[0].focus(); }
    };
    const media = window.matchMedia("(max-width: 900px)");
    const onResize = () => { if (!media.matches) closeSidebar(); };
    document.addEventListener("keydown", onKey);
    media.addEventListener("change", onResize);
    return () => {
      document.removeEventListener("keydown", onKey);
      media.removeEventListener("change", onResize);
      background.forEach((node, index) => { node.inert = previousInert[index]; });
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [mobileSidebarOpen, closeSidebar, detailRef]);

  React.useEffect(() => {
    if (!mobileSidebarOpen) {
      return;
    }

    document.body.classList.add("drawer-open");
    return () => document.body.classList.remove("drawer-open");
  }, [mobileSidebarOpen]);

  React.useEffect(() => {
    const deepLink = deepLinkRef.current();
    if (!auth.authUser || (!deepLink.modsetId && !deepLink.modId)) {
      return;
    }

    if (deepLink.modsetId && modsets.activeModsetId !== deepLink.modsetId && modsets.modsets.some((modset) => modset.id === deepLink.modsetId)) {
      actions.activateModset(deepLink.modsetId).catch(() => null);
      return;
    }

    if (deepLink.modId && mods.mods.some((mod) => mod.id === deepLink.modId)) {
      openMod(deepLink.modId);
      view.openModView();
      deepLinkRef.current = () => ({ modsetId: null, modId: null });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [actions, auth.authUser, modsets.activeModsetId, modsets.modsets, mods.mods, openMod, view]);

  if (!auth.authChecked) {
    return <AuthFrame title="Checking session" subtitle="Please wait." />;
  }

  if (!auth.authUser) {
    return (
      <AuthFrame title="Arma Reforger Mod Manager" subtitle="Sign in to manage tracked Workshop mods.">
        <LoginForm
          oidcEnabled={auth.authConfig.oidc_enabled}
          oidcLoginUrl={auth.api.oidcLoginUrl}
          loginError={auth.loginError}
          loading={actions.loading}
          onSubmit={actions.login}
        />
      </AuthFrame>
    );
  }

  const authUser = auth.authUser;

  return (
    <main className={`app-shell redesigned-shell ${view.showModsetAdmin || view.showUserAdmin || !modsetsReady || !activeModset ? "management-shell" : ""} ${mobileSidebarOpen ? "mobile-sidebar-open" : ""}`}>
      <a className="skip-link" href="#workspace-content" onClick={() => detailRef.current?.focus()}>Skip to content</a>
      <header className="app-navigation">
        <a className="navigation-brand" href="/" onClick={event => { event.preventDefault(); handleShowDashboard(); }}><img src="/icon.png" alt="" /><strong>ARMM</strong></a>
        <nav aria-label="Main navigation">
          <button type="button" aria-current={!view.showModsetAdmin && !view.showUserAdmin ? "page" : undefined} onClick={handleShowDashboard}><Home size={18} /> Workspace</button>
          <button type="button" aria-current={view.showModsetAdmin ? "page" : undefined} onClick={handleShowModsetAdmin}><Layers3 size={18} /> Modsets</button>
          <button type="button" aria-current={view.showUserAdmin ? "page" : undefined} onClick={handleToggleSecurity}><Shield size={18} /> {authUser.role === "admin" ? "Administration" : "Settings"}</button>
        </nav>
        <details className="account-menu" onKeyDown={event => {
          if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); }
        }} onClick={event => {
          if ((event.target as HTMLElement).closest("button")) event.currentTarget.open = false;
        }}><summary><User size={18} /><span>{authUser.username}</span></summary><div>
          <button type="button" onClick={() => actions.updateThemePreference(authUser.theme_preference === "dark" ? "light" : "dark")}>
            {authUser.theme_preference === "dark" ? <Sun size={16} /> : <Moon size={16} />} {authUser.theme_preference === "dark" ? "Light mode" : "Dark mode"}
          </button>
          <button type="button" onClick={() => { closeSidebar(); setAdminSection("account"); view.toggleSecurityView(); }}><Shield size={16} /> Account settings</button>
          <button type="button" onClick={actions.logout}><LogOut size={16} /> Sign out</button>
        </div></details>
      </header>
      {mobileSidebarOpen && <button className="sidebar-backdrop" aria-label="Close mod list" onClick={closeSidebar} type="button" />}
      {!view.showModsetAdmin && !view.showUserAdmin && modsetsReady && activeModset && <Sidebar
        loadState={mods.loadStates.mods}
        isMobileDrawerOpen={mobileSidebarOpen}
        loading={actions.loading}
        showDashboard={view.showDashboard}
        showModsetAdmin={view.showModsetAdmin}
        showUserAdmin={view.showUserAdmin}
        searchQuery={mods.searchQuery}
        statusFilter={mods.statusFilter}
        sortMode={mods.sortMode}
        mods={mods.sortedMods}
        totalModsCount={mods.mods.length}
        selectedModId={mods.selected?.id ?? null}
        onShowDashboard={handleShowDashboard}
        onSearchChange={mods.setSearchQuery}
        onStatusFilterChange={mods.setStatusFilter}
        onSortChange={mods.setSortMode}
        onOpenMod={handleOpenMod}
        onClose={closeSidebar}
      />}

      {view.showAddModDialog && (
        <AddModDialog
          modsetsLoad={modsets.loadState}
          loading={actions.loading}
          modsets={modsets.modsets.filter(modset => modset.can_edit)}
          activeModsetId={modsets.activeModsetId}
          onClose={view.closeAddModDialog}
          onSubmit={actions.addMod}
        />
      )}

      <section className="detail" id="workspace-content" tabIndex={-1} aria-label="Workspace content" ref={detailRef}>
        {!view.showModsetAdmin && !view.showUserAdmin && <header className="workspace-toolbar">
          <div className="workspace-context">
            <button className="icon-button mobile-drawer-button" onClick={openSidebar} disabled={!modsetsReady || !activeModset} type="button" aria-label="Open mod list"><Menu size={18} /></button>
            <label>Active modset<CustomSelect<number> value={modsets.activeModsetId ?? 0}
              options={!modsetsReady ? [{ value: 0, label: modsets.loadState.error ? "Modsets unavailable" : "Loading modsets…" }] : modsets.modsets.length ? [...(!activeModset ? [{ value: 0, label: "Select a modset" }] : []), ...modsets.modsets.map(set => ({ value: set.id, label: set.name }))] : [{ value: 0, label: "No accessible modset" }]}
              onChange={id => { if (id) { handleActivateModset(id); view.showDashboardView(); } }} disabled={actions.loading || !modsetsReady || !modsets.modsets.length} ariaLabel="Active modset" /></label>
          </div>
          <div className="workspace-actions">
            <button className="secondary-button compact" type="button" disabled={!modsetsReady || !modsReady || !activeModset || actions.loading} onClick={() => activeModset && actions.exportModset(activeModset.id, activeModset.name).catch(() => null)}><Download size={16} /> Export JSON</button>
            <button className="primary-button compact" type="button" disabled={!canEdit || actions.loading} onClick={handleShowAddMod}><Plus size={16} /> Add mod</button>
          </div>
        </header>}
        {actions.error && !view.showModsetAdmin && !view.showUserAdmin && <p className="error-box" role="alert">{actions.error}</p>}
        {!view.showModsetAdmin && !view.showUserAdmin && <ResourceStatus state={modsets.loadState} label="modsets" />}
        {!view.showModsetAdmin && !view.showUserAdmin && !modsetsReady ? null
        : !view.showModsetAdmin && !view.showUserAdmin && !activeModset ? <div className="placeholder"><h2>{modsets.modsets.length ? "Select a modset" : "No accessible modset"}</h2><p>{modsets.modsets.length ? "Choose an active modset above to open its workspace." : "Create a modset in Modsets or ask its owner for group access."}</p></div>
        : !view.showModsetAdmin && !view.showUserAdmin && !modsReady ? <ResourceStatus state={mods.loadStates.mods} label="mods" />
        : view.showDashboard ? (
          <Dashboard
            activityLoad={mods.loadStates.activity}
            schedulerLoad={mods.loadStates.scheduler}
            onFilterStatus={status => { mods.setSearchQuery(""); mods.setStatusFilter(status); if (window.matchMedia("(max-width: 900px)").matches) openSidebar(); }}
            canEdit={canEdit}
            mods={mods.mods}
            modsetActivity={mods.modsetActivity}
            schedulerStatus={mods.schedulerStatus}
            openMod={handleOpenMod}
            activeModsetName={activeModsetName}
            loading={actions.loading}
            error={actions.error}
            modsetActivityPage={mods.modsetActivityPage}
            canPageBackModsetActivity={mods.canPageBackModsetActivity}
            canPageForwardModsetActivity={mods.canPageForwardModsetActivity}
            previousModsetActivityPage={mods.previousModsetActivityPage}
            nextModsetActivityPage={mods.nextModsetActivityPage}
            updateModLoadOrder={actions.updateModLoadOrder}
            updateModsetLoadOrder={actions.updateModsetLoadOrder}
          />
        ) : view.showModsetAdmin ? (
          <ModsetManagement
            loadState={modsets.loadState}
            groupsLoad={groups.loadState}
            api={auth.api}
            groups={groups.directory}
            onAccessChanged={refreshAccess}
            modsets={modsets.modsets}
            activeModsetId={modsets.activeModsetId}
            loading={actions.loading}
            error={actions.error}
            createModset={actions.createModset}
            updateModset={actions.updateModset}
            duplicateModset={actions.duplicateModset}
            deleteModset={actions.deleteModset}
            activateModset={async id => { await actions.activateModset(id); view.showDashboardView(); }}
            exportModset={actions.exportModset}
          />
        ) : view.showUserAdmin ? (
          <>
          <UserAdmin
            loadStates={admin.loadStates}
            groupsLoad={groups.loadState}
            section={adminSection}
            onSectionChange={section => { setAdminSection(section); detailRef.current?.scrollTo({ top: 0 }); }}
            actionError={actions.error}
            groups={groups.groups}
            saveUserGroups={groups.saveUserGroups}
            groupError={groups.error}
            groupManagement={<GroupAdmin data={groups} users={admin.users} usersLoad={admin.loadStates.users} />}
            users={admin.users}
            webhooks={admin.discordWebhooks}
            modsets={admin.modsets}
            currentUser={authUser}
            loading={actions.loading || groups.loading}
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
            loadAuditLogs={() => admin.loadAuditLogs(admin.auditLogPage).then(() => undefined)}
            auditLogPage={admin.auditLogPage}
            canPageBackAuditLogs={admin.canPageBackAuditLogs}
            canPageForwardAuditLogs={admin.canPageForwardAuditLogs}
            previousAuditLogPage={admin.previousAuditLogPage}
            nextAuditLogPage={admin.nextAuditLogPage}
          />
          </>
        ) : mods.selected ? (
          <ModDetail
            canEdit={canEdit}
            selected={mods.selected}
            loading={actions.loading}
            refreshState={mods.getModRefreshState(mods.selected.id)}
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
            <h2>{!activeModset ? "No accessible modset" : canEdit ? "Add a mod" : "No mods tracked"}</h2>
            <p>{!activeModset ? "Create a modset or ask its owner for group access." : canEdit ? "Use Add mod to start the first fetch." : "This modset is empty."}</p>
          </div>
        )}
      </section>
    </main>
  );
}
