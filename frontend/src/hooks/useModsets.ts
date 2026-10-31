import type { GroupPermission } from "../types";
import React from "react";
import { useLoadState } from "./useLoadState";

import type { AuthUser, Modset, ModsetExport } from "../types";

export function useModsets({
  api,
  authUser,
  setAuthUser,
}: {
  api: {
    listModsets: () => Promise<Modset[]>;
    createModset: (name: string) => Promise<Modset>;
    updateModset: (modsetId: number, name: string, permissions?: GroupPermission[]) => Promise<Modset>;
    duplicateModset: (modsetId: number) => Promise<Modset>;
    deleteModset: (modsetId: number) => Promise<AuthUser>;
    activateModset: (modsetId: number) => Promise<AuthUser>;
    exportModset: (modsetId: number) => Promise<ModsetExport>;
  };
  authUser: AuthUser | null;
  setAuthUser: (value: AuthUser | null) => void;
}) {
  const loadState = useLoadState(authUser ? `${authUser.id}:${authUser.role}` : null);
  const [modsets, setModsets] = React.useState<Modset[]>([]);
  const [activeModsetId, setActiveModsetId] = React.useState<number | null>(null);

  const loadModsets = React.useCallback(async () => {
    if (!authUser) {
      setModsets([]);
      setActiveModsetId(null);
      return [];
    }
    return loadState.run(() => api.listModsets(), data => {
      setModsets(data);
      const authActive = authUser.active_modset_id;
      const fallback = data[0]?.id ?? null;
      setActiveModsetId(authActive && data.some(entry => entry.id === authActive) ? authActive : fallback);
    });
  }, [api, authUser, loadState.run]);

  React.useEffect(() => {
    loadModsets().catch(() => null);
  }, [loadModsets]);

  React.useEffect(() => {
    if (!authUser) {
      setActiveModsetId(null);
      return;
    }
    if (authUser.active_modset_id !== activeModsetId) {
      setActiveModsetId(authUser.active_modset_id);
    }
  }, [activeModsetId, authUser]);

  const activateModset = React.useCallback(
    async (modsetId: number) => {
      const user = await api.activateModset(modsetId);
      setAuthUser(user);
      setActiveModsetId(user.active_modset_id);
      return user;
    },
    [api, setAuthUser],
  );

  const createModset = React.useCallback(
    async (name: string) => {
      const created = await api.createModset(name);
      await loadModsets().catch(() => null);
      return created;
    },
    [api, loadModsets],
  );

  const updateModset = React.useCallback(
    async (modsetId: number, name: string, permissions?: GroupPermission[]) => {
      const updated = await api.updateModset(modsetId, name, permissions);
      await loadModsets().catch(() => null);
      return updated;
    },
    [api, loadModsets],
  );

  const deleteModset = React.useCallback(
    async (modsetId: number) => {
      const user = await api.deleteModset(modsetId);
      setAuthUser(user);
      setActiveModsetId(user.active_modset_id);
      await loadModsets().catch(() => null);
      return user;
    },
    [api, loadModsets, setAuthUser],
  );

  const duplicateModset = React.useCallback(
    async (modsetId: number) => {
      const duplicated = await api.duplicateModset(modsetId);
      await loadModsets().catch(() => null);
      return duplicated;
    },
    [api, loadModsets],
  );

  return {
    loadState,
    modsets,
    activeModsetId,
    loadModsets,
    activateModset,
    createModset,
    updateModset,
    duplicateModset,
    deleteModset,
    exportModset: api.exportModset,
  };
}
