import React from "react";
import { initialRoute, readRoute, routeUrl, type AppRoute } from "../lib/navigation";

export function useWorkspaceView() {
  const [route, setRoute] = React.useState(initialRoute);
  const routeRef = React.useRef(route);
  const versionRef = React.useRef(0);
  const getNavigationVersion = React.useCallback(() => versionRef.current, []);
  const [showAddModDialog, setShowAddModDialog] = React.useState(false);
  const navigate = React.useCallback((change: Partial<AppRoute>, replace = false) => {
    const next = { ...routeRef.current, invalid: false, ...change };
    const url = routeUrl(next);
    if (url !== window.location.pathname + window.location.search + window.location.hash) {
      window.history[replace ? "replaceState" : "pushState"](null, "", url);
    }
    versionRef.current++;
    routeRef.current = next;
    setRoute(next);
    setShowAddModDialog(false);
  }, []);
  React.useEffect(() => {
    const restore = () => {
      const next = readRoute(window.location.search);
      versionRef.current++;
      routeRef.current = next;
      setRoute(next);
      setShowAddModDialog(false);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  const showDashboardView = React.useCallback(() => navigate({ view: "workspace", modId: null }), [navigate]);
  const showModsetAdminView = React.useCallback(() => navigate({ view: "modsets", modId: null }), [navigate]);
  const toggleSecurityView = React.useCallback(() => navigate({ view: "admin", section: "users", modId: null }), [navigate]);
  const showAccountView = React.useCallback(() => navigate({ view: "account", modId: null }), [navigate]);
  const openModView = React.useCallback((id?: string, modsetId?: number) => navigate({ view: "workspace", modId: id ?? null,
    ...(modsetId ? { modsetId } : {}) }), [navigate]);
  const openModset = React.useCallback((modsetId: number) => navigate({ view: "workspace", modsetId, modId: null }), [navigate]);
  const setAdminSection = React.useCallback((section: AppRoute["section"] | "account") => navigate(
    section === "account" ? { view: "account", modId: null } : { view: "admin", section, modId: null }), [navigate]);
  const openAddModDialog = React.useCallback(() => setShowAddModDialog(true), []);
  const closeAddModDialog = React.useCallback(() => setShowAddModDialog(false), []);
  return {
    route, navigate, getNavigationVersion, openModset, setAdminSection, showAccountView,
    adminSection: route.view === "account" ? "account" as const : route.section,
    showDashboard: route.view === "workspace" && !route.modId,
    showModsetAdmin: route.view === "modsets",
    showUserAdmin: route.view === "admin" || route.view === "account",
    showAddModDialog, showDashboardView, showModsetAdminView, toggleSecurityView, openModView,
    openAddModDialog, closeAddModDialog,
  };
}
