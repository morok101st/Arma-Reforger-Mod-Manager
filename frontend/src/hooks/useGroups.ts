import React from "react";

import type { createApiClient } from "../lib/api";
import type { AuthUser, GroupSummary, GroupWrite, UserGroup } from "../types";
import { useAsyncAction } from "./useAsyncAction";

export function useGroups(api: ReturnType<typeof createApiClient>, user: AuthUser | null, onChanged: () => Promise<void>) {
  const [directory, setDirectory] = React.useState<GroupSummary[]>([]);
  const [groups, setGroups] = React.useState<UserGroup[]>([]);
  const action = useAsyncAction();
  const load = React.useCallback(async () => {
    if (!user) { setDirectory([]); setGroups([]); return; }
    const directory = await api.listGroups();
    const groups = user.role === "admin" ? await api.listAdminGroups() : [];
    setDirectory(previous => JSON.stringify(previous) === JSON.stringify(directory) ? previous : directory);
    setGroups(previous => JSON.stringify(previous) === JSON.stringify(groups) ? previous : groups);
  }, [api, user?.id, user?.role]);

  React.useEffect(() => { action.run(load).catch(() => null); }, [load]);

  async function save(id: number | null, payload: GroupWrite) {
    await action.run(async () => { await api.saveGroup(id, payload); await load(); await onChanged(); }, { rethrow: true });
  }
  async function remove(id: number) {
    await action.run(async () => { await api.deleteGroup(id); await load(); await onChanged(); }, { rethrow: true });
  }
  async function saveUserGroups(userId: number, groupIds: number[]) {
    await action.run(async () => {
      await api.saveUserGroups(userId, groupIds);
      await load(); await onChanged();
    }, { rethrow: true });
  }
  return { directory, groups, reload: load, save, remove, saveUserGroups, loading: action.loading, error: action.error };
}
