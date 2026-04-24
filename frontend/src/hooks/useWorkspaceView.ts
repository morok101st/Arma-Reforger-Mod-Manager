import React from "react";

type WorkspaceView = "dashboard" | "mods" | "security";

export function useWorkspaceView() {
  const [view, setView] = React.useState<WorkspaceView>("dashboard");
  const [showAddModDialog, setShowAddModDialog] = React.useState(false);
  const [showModsetDialog, setShowModsetDialog] = React.useState(false);

  const showDashboardView = React.useCallback(() => {
    setView("dashboard");
  }, []);

  const showModManagementView = React.useCallback(() => {
    setView("mods");
  }, []);

  const toggleSecurityView = React.useCallback(() => {
    setView((current) => (current === "security" ? "mods" : "security"));
  }, []);

  const openModView = React.useCallback(() => {
    setView("mods");
  }, []);

  const openAddModDialog = React.useCallback(() => setShowAddModDialog(true), []);
  const closeAddModDialog = React.useCallback(() => setShowAddModDialog(false), []);
  const openModsetDialog = React.useCallback(() => setShowModsetDialog(true), []);
  const closeModsetDialog = React.useCallback(() => setShowModsetDialog(false), []);

  return {
    showDashboard: view === "dashboard",
    showModManagement: view === "mods",
    showUserAdmin: view === "security",
    showAddModDialog,
    showModsetDialog,
    showDashboardView,
    showModManagementView,
    toggleSecurityView,
    openModView,
    openAddModDialog,
    closeAddModDialog,
    openModsetDialog,
    closeModsetDialog,
  };
}
