import React from "react";

import { useAdminData } from "./useAdminData";
import { useAppActions } from "./useAppActions";
import { useAuth } from "./useAuth";
import { useModsets } from "./useModsets";
import { useMods } from "./useMods";
import { useWorkspaceView } from "./useWorkspaceView";
import { useGroups } from "./useGroups";

export function useAppController() {
  const detailRef = React.useRef<HTMLElement | null>(null);
  const view = useWorkspaceView();
  const auth = useAuth(view.showDashboardView);
  const modsets = useModsets({ api: auth.api, authUser: auth.authUser, setAuthUser: auth.setAuthUser });
  const mods = useMods({ api: auth.api, authUser: auth.authUser, activeModsetId: modsets.activeModsetId });
  const admin = useAdminData({ api: auth.api, authUser: auth.authUser });
  const refreshAccess = React.useCallback(async () => {
    const user = await auth.api.checkSession();
    auth.setAuthUser(current => JSON.stringify(current) === JSON.stringify(user) ? current : user);
    await modsets.loadModsets();
  }, [auth.api, auth.setAuthUser, modsets.loadModsets]);
  const groups = useGroups(auth.api, auth.authUser, refreshAccess);
  React.useEffect(() => { groups.reload().catch(() => null); }, [admin.users, groups.reload]);
  React.useEffect(() => {
    if (!auth.authUser) return;
    const refresh = () => { refreshAccess().catch(() => null); };
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 60000);
    return () => { window.removeEventListener("focus", refresh); window.clearInterval(timer); };
  }, [Boolean(auth.authUser), refreshAccess]);
  const actions = useAppActions({
    auth,
    admin,
    mods,
    modsets,
    closeAddModDialog: view.closeAddModDialog,
    openModView: view.openModView,
    showDashboardView: view.showDashboardView,
  });

  React.useEffect(() => {
    detailRef.current?.scrollTo({ top: 0 });
  }, [mods.selected?.id, view.showDashboard, view.showModsetAdmin, view.showUserAdmin]);

  React.useEffect(() => {
    if (auth.authUser?.role !== "admin") {
      return;
    }

    admin.loadModsets().catch(() => null);
    admin.loadDiscordWebhooks().catch(() => null);
  }, [admin.loadDiscordWebhooks, admin.loadModsets, auth.authUser?.role, modsets.modsets]);

  const openMod = React.useCallback(
    (id: string) => {
      mods.openMod(id);
      view.openModView();
    },
    [mods, view],
  );

  return {
    groups,
    refreshAccess,
    detailRef,
    view,
    auth,
    modsets,
    mods,
    admin,
    actions,
    openMod,
  };
}
