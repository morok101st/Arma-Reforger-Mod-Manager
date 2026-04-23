import React from "react";

import { useAdminData } from "./useAdminData";
import { useAppActions } from "./useAppActions";
import { useAuth } from "./useAuth";
import { useMods } from "./useMods";
import { useWorkspaceView } from "./useWorkspaceView";

export function useAppController() {
  const detailRef = React.useRef<HTMLElement | null>(null);
  const view = useWorkspaceView();
  const auth = useAuth(view.showDashboardView);
  const mods = useMods({ api: auth.api, authUser: auth.authUser });
  const admin = useAdminData({ api: auth.api, authUser: auth.authUser });
  const actions = useAppActions({
    auth,
    admin,
    mods,
    closeAddModDialog: view.closeAddModDialog,
    openModView: view.openModView,
    showDashboardView: view.showDashboardView,
  });

  React.useEffect(() => {
    detailRef.current?.scrollTo({ top: 0 });
  }, [mods.selected?.id, view.showDashboard, view.showUserAdmin]);

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
    mods,
    admin,
    actions,
    openMod,
  };
}
