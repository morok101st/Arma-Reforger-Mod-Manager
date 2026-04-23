import React from "react";

export function useWorkspaceView() {
  const [showDashboard, setShowDashboard] = React.useState(true);
  const [showUserAdmin, setShowUserAdmin] = React.useState(false);
  const [showAddModDialog, setShowAddModDialog] = React.useState(false);

  const showDashboardView = React.useCallback(() => {
    setShowDashboard(true);
    setShowUserAdmin(false);
  }, []);

  const toggleSecurityView = React.useCallback(() => {
    setShowDashboard(false);
    setShowUserAdmin((value) => !value);
  }, []);

  const openModView = React.useCallback(() => {
    setShowDashboard(false);
    setShowUserAdmin(false);
  }, []);

  const openAddModDialog = React.useCallback(() => setShowAddModDialog(true), []);
  const closeAddModDialog = React.useCallback(() => setShowAddModDialog(false), []);

  return {
    showDashboard,
    showUserAdmin,
    showAddModDialog,
    showDashboardView,
    toggleSecurityView,
    openModView,
    openAddModDialog,
    closeAddModDialog,
  };
}
