import React from "react";

import type { AuthUser, Modset, ModsetExport } from "../types";

export function useModsets({
  api,
  authUser,
  setAuthUser,
}: {
  api: {
    listModsets: () => Promise<Modset[]>;
    createModset: (name: string, shared?: boolean) => Promise<Modset>;
    updateModset: (modsetId: number, name: string, shared?: boolean) => Promise<Modset>;
    duplicateModset: (modsetId: number) => Promise<Modset>;
    deleteModset: (modsetId: number) => Promise<AuthUser>;
    activateModset: (modsetId: number) => Promise<AuthUser>;
    exportModset: (modsetId: number) => Promise<ModsetExport>;
  };
  authUser: AuthUser | null;
  setAuthUser: (value: AuthUser | null) => void;
}) {
  const [modsets, setModsets] = React.useState<Modset[]>([]);
  const [activeModsetId, setActiveModsetId] = React.useState<number | null>(null);

  const loadModsets = React.useCallback(async () => {
    if (!authUser) {
      setModsets([]);
      setActiveModsetId(null);
      return [];
    }
    const data = await api.listModsets();
    setModsets(data);
    const authActive = authUser.active_modset_id;
    const fallback = data[0]?.id ?? null;
    setActiveModsetId(authActive && data.some((entry) => entry.id === authActive) ? authActive : fallback);
    return data;
  }, [api, authUser]);

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
    async (name: string, shared = false) => {
      const created = await api.createModset(name, shared);
      await loadModsets();
      return created;
    },
    [api, loadModsets],
  );

  const updateModset = React.useCallback(
    async (modsetId: number, name: string, shared?: boolean) => {
      const updated = await api.updateModset(modsetId, name, shared);
      await loadModsets();
      return updated;
    },
    [api, loadModsets],
  );

  const deleteModset = React.useCallback(
    async (modsetId: number) => {
      const user = await api.deleteModset(modsetId);
      setAuthUser(user);
      setActiveModsetId(user.active_modset_id);
      await loadModsets();
      return user;
    },
    [api, loadModsets, setAuthUser],
  );

  const duplicateModset = React.useCallback(
    async (modsetId: number) => {
      const duplicated = await api.duplicateModset(modsetId);
      await loadModsets();
      return duplicated;
    },
    [api, loadModsets],
  );

  return {
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
