import React from "react";

import { useAdminData } from "./useAdminData";
import { useAppActions } from "./useAppActions";
import { useAuth } from "./useAuth";
import { useModsets } from "./useModsets";
import { useMods } from "./useMods";
import { useWorkspaceView } from "./useWorkspaceView";

export function useAppController() {
  const detailRef = React.useRef<HTMLElement | null>(null);
  const view = useWorkspaceView();
  const auth = useAuth(view.showDashboardView);
  const modsets = useModsets({ api: auth.api, authUser: auth.authUser, setAuthUser: auth.setAuthUser });
  const mods = useMods({ api: auth.api, authUser: auth.authUser, activeModsetId: modsets.activeModsetId });
  const admin = useAdminData({ api: auth.api, authUser: auth.authUser });
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
