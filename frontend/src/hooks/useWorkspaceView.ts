import React from "react";

export function useWorkspaceView() {
  const [showDashboard, setShowDashboard] = React.useState(true);
  const [showModsetAdmin, setShowModsetAdmin] = React.useState(false);
  const [showUserAdmin, setShowUserAdmin] = React.useState(false);
  const [showAddModDialog, setShowAddModDialog] = React.useState(false);

  const showDashboardView = React.useCallback(() => {
    setShowDashboard(true);
    setShowModsetAdmin(false);
    setShowUserAdmin(false);
  }, []);

  const showModsetAdminView = React.useCallback(() => {
    setShowDashboard(false);
    setShowModsetAdmin(true);
    setShowUserAdmin(false);
  }, []);

  const toggleSecurityView = React.useCallback(() => {
    setShowDashboard(false);
    setShowModsetAdmin(false);
    setShowUserAdmin((value) => !value);
  }, []);

  const openModView = React.useCallback(() => {
    setShowDashboard(false);
    setShowModsetAdmin(false);
    setShowUserAdmin(false);
  }, []);

  const openAddModDialog = React.useCallback(() => setShowAddModDialog(true), []);
  const closeAddModDialog = React.useCallback(() => setShowAddModDialog(false), []);

  return {
    showDashboard,
    showModsetAdmin,
    showUserAdmin,
    showAddModDialog,
    showDashboardView,
    showModsetAdminView,
    toggleSecurityView,
    openModView,
    openAddModDialog,
    closeAddModDialog,
  };
}
