import React from "react";
import { useLoadState } from "./useLoadState";

import type { createApiClient } from "../lib/api";
import type { AuthUser, GroupSummary, GroupWrite, UserGroup } from "../types";
import { useAsyncAction } from "./useAsyncAction";

export function useGroups(api: ReturnType<typeof createApiClient>, user: AuthUser | null, onChanged: () => Promise<void>) {
  const loadState = useLoadState(user ? `${user.id}:${user.role}` : null);
  const [directory, setDirectory] = React.useState<GroupSummary[]>([]);
  const [groups, setGroups] = React.useState<UserGroup[]>([]);
  const action = useAsyncAction();
  const load = React.useCallback(async () => {
    if (!user) { setDirectory([]); setGroups([]); return; }
    return loadState.run(async () => {
      const [directory, groups] = await Promise.all([api.listGroups(), user.role === "admin" ? api.listAdminGroups() : Promise.resolve([])]);
      return { directory, groups };
    }, ({ directory, groups }) => {
      setDirectory(previous => JSON.stringify(previous) === JSON.stringify(directory) ? previous : directory);
      setGroups(previous => JSON.stringify(previous) === JSON.stringify(groups) ? previous : groups);
    });
  }, [api, user?.id, user?.role, loadState.run]);

  React.useEffect(() => { load().catch(() => null); }, [load]);

  async function save(id: number | null, payload: GroupWrite) {
    await action.run(async () => { await api.saveGroup(id, payload); await Promise.allSettled([load(), onChanged()]); }, { rethrow: true });
  }
  async function remove(id: number) {
    await action.run(async () => { await api.deleteGroup(id); await Promise.allSettled([load(), onChanged()]); }, { rethrow: true });
  }
  async function saveUserGroups(userId: number, groupIds: number[]) {
    await action.run(async () => {
      await api.saveUserGroups(userId, groupIds);
      await Promise.allSettled([load(), onChanged()]);
    }, { rethrow: true });
  }
  return { directory, groups, loadState, reload: load, save, remove, saveUserGroups, loading: action.loading || loadState.loading, error: action.error ?? loadState.error };
}
