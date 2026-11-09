import React from "react";
import { useRefreshJobs } from "./useRefreshJobs";
import { useLoadState } from "./useLoadState";

import { changelogEntriesFromVersions, dependencyKey, filterMods, findTrackedDependency, sortMods } from "../lib/utils";
import type { AuthUser, ModRefreshJob, Mod, ModsetActivity, ModStatusFilter, SchedulerStatus, SortMode } from "../types";

const MODSET_ACTIVITY_PAGE_SIZE = 10;

export function useMods({
  api,
  authUser,
  activeModsetId,
  requestedModId,
}: {
  requestedModId: string | null;
  api: {
    listMods: (modsetId?: number | null) => Promise<Mod[]>;
    listModsetActivity: (modsetId: number, limit?: number, offset?: number) => Promise<ModsetActivity[]>;
    getSchedulerStatus: () => Promise<SchedulerStatus>;
    createMod: (id: string, currentVersion: string | null, modsetId?: number | null) => Promise<Mod>;
    refreshMod: (id: string, modsetId: number) => Promise<ModRefreshJob>;
    listRefreshJobs: (modsetId: number) => Promise<ModRefreshJob[]>;
    deleteMod: (id: string, modsetId?: number | null, options?: { deactivateOrphanDependencies?: boolean }) => Promise<void>;
    updateMod: (
      id: string,
      payload: { current_version?: string | null },
      modsetId?: number | null,
      options?: { deactivateOrphanDependencies?: boolean },
    ) => Promise<Mod>;
    updateExportOrder: (modsetId: number, modIds: string[]) => Promise<void>;
  };
  authUser: AuthUser | null;
  activeModsetId: number | null;
}) {
  const scope = authUser && activeModsetId ? `${authUser.id}:${authUser.role}:${activeModsetId}` : null;
  const modsLoad = useLoadState(scope);
  const activityLoad = useLoadState(scope);
  const schedulerLoad = useLoadState(authUser ? `${authUser.id}:${authUser.role}` : null);
  const [mods, setMods] = React.useState<Mod[]>([]);
  const [modsetActivity, setModsetActivity] = React.useState<ModsetActivity[]>([]);
  const [schedulerStatus, setSchedulerStatus] = React.useState<SchedulerStatus | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [installedVersionEdit, setInstalledVersionEdit] = React.useState("");
  const [expandedChangelogVersions, setExpandedChangelogVersions] = React.useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = React.useState<SortMode>("updates");
  const [childModsFirst, setChildModsFirst] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<ModStatusFilter>("all");
  const [saveState, setSaveState] = React.useState<"idle" | "saved">("idle");
  const [modsetActivityPage, setModsetActivityPage] = React.useState(0);
  const [canPageForwardModsetActivity, setCanPageForwardModsetActivity] = React.useState(false);

  const visibleMods = React.useMemo(() => filterMods(mods, searchQuery, statusFilter), [mods, searchQuery, statusFilter]);
  const sortedMods = React.useMemo(() => sortMods(visibleMods, sortMode, childModsFirst), [visibleMods, sortMode, childModsFirst]);
  // An explicit URL selection is independent of sidebar search/filter/sort.
  const selected = requestedModId ? mods.find(mod => mod.id === requestedModId) ?? null
    : sortedMods.find((mod) => mod.id === selectedId) ?? sortedMods[0] ?? null;
  const changelogEntries = React.useMemo(() => changelogEntriesFromVersions(selected?.versions ?? []), [selected?.versions]);
  const trackedDependencyMatches = React.useMemo(
    () => new Map((selected?.dependencies ?? []).map((dependency) => [dependencyKey(dependency), findTrackedDependency(dependency, mods)])),
    [mods, selected?.dependencies],
  );

  const loadMods = React.useCallback(async () => {
    if (!authUser || !activeModsetId) return [];
    return modsLoad.run(() => api.listMods(activeModsetId), data => {
      setMods(data);
      setSelectedId(current => current && data.some(mod => mod.id === current) ? current : data[0]?.id ?? null);
    });
  }, [activeModsetId, api, authUser?.id, modsLoad.run]);

  const loadModsetActivity = React.useCallback(async (page = 0) => {
    if (!authUser || !activeModsetId) return [];
    return activityLoad.run(() => api.listModsetActivity(activeModsetId, MODSET_ACTIVITY_PAGE_SIZE + 1, page * MODSET_ACTIVITY_PAGE_SIZE), data => {
      setModsetActivity(data.slice(0, MODSET_ACTIVITY_PAGE_SIZE));
      setCanPageForwardModsetActivity(data.length > MODSET_ACTIVITY_PAGE_SIZE);
      setModsetActivityPage(page);
    });
  }, [activeModsetId, api, authUser?.id, activityLoad.run]);

  const loadSchedulerStatus = React.useCallback(() => schedulerLoad.run(() => api.getSchedulerStatus(), setSchedulerStatus), [api, schedulerLoad.run]);

  React.useEffect(() => {
    setMods([]);
    setSelectedId(null);
    setModsetActivity([]);
  }, [activeModsetId]);

  React.useEffect(() => {
    if (!authUser) {
      setMods([]);
      setModsetActivity([]);
      setSchedulerStatus(null);
      setSelectedId(null);
      setModsetActivityPage(0);
      setCanPageForwardModsetActivity(false);
      return;
    }
    loadMods().catch(() => null);
    loadModsetActivity(0).catch(() => null);
    loadSchedulerStatus().catch(() => null);
  }, [activeModsetId, authUser, loadModsetActivity, loadMods, loadSchedulerStatus]);

  React.useEffect(() => {
    setInstalledVersionEdit(selected?.current_version ?? "");
  }, [selected?.id, selected?.current_version]);

  React.useEffect(() => {
    setSaveState("idle");
  }, [selected?.id]);

  React.useEffect(() => {
    setExpandedChangelogVersions(changelogEntries[0] ? new Set([changelogEntries[0].version]) : new Set());
  }, [selected?.id, changelogEntries]);

  const openMod = React.useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const addMod = React.useCallback(
    async (id: string, currentVersion: string | null, targetModsetId?: number) => {
      const modsetId = targetModsetId ?? activeModsetId;
      if (!modsetId) throw new Error("No active modset selected.");
      const created = await api.createMod(id, currentVersion, modsetId);
      if (modsetId === activeModsetId) {
        await Promise.allSettled([loadMods(), loadModsetActivity(modsetActivityPage)]);
        setSelectedId(created.id);
      }
      return created;
    },
    [activeModsetId, api, loadModsetActivity, loadMods, modsetActivityPage],
  );

  const { refreshMod, getModRefreshState } = useRefreshJobs(api, scope, activeModsetId, async () => {
    await Promise.allSettled([loadMods(), loadModsetActivity(modsetActivityPage)]);
  });

  const removeMod = React.useCallback(
    async (id: string, options?: { deactivateOrphanDependencies?: boolean }) => {
      if (!activeModsetId) return;
      await api.deleteMod(id, activeModsetId, options);
      setSelectedId(null);
      await Promise.allSettled([loadMods(), loadModsetActivity(modsetActivityPage)]);
    },
    [activeModsetId, api, loadModsetActivity, loadMods, modsetActivityPage],
  );

  const updateInstalledVersion = React.useCallback(
    async (nextVersion = installedVersionEdit, options?: { deactivateOrphanDependencies?: boolean }) => {
      if (!selected) return null;
      const normalizedVersion = nextVersion.trim();
      if (!activeModsetId) return null;
      const updated = await api.updateMod(selected.id, { current_version: normalizedVersion || null }, activeModsetId, options);
      await Promise.allSettled([loadMods(), loadModsetActivity(modsetActivityPage)]);
      setSelectedId(updated.id);
      setInstalledVersionEdit(updated.current_version ?? "");
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 3000);
      return updated;
    },
    [activeModsetId, api, installedVersionEdit, loadModsetActivity, loadMods, modsetActivityPage, selected],
  );

  const updateExportOrder = React.useCallback(async (modIds: string[]) => {
    if (!activeModsetId || modIds.length === 0) return;
    await api.updateExportOrder(activeModsetId, modIds);
    await Promise.allSettled([loadMods(), loadModsetActivity(modsetActivityPage)]);
    setSaveState("saved");
    window.setTimeout(() => setSaveState("idle"), 3000);
  }, [activeModsetId, api, loadModsetActivity, loadMods, modsetActivityPage]);

  const previousModsetActivityPage = React.useCallback(() => {
    if (modsetActivityPage <= 0) return;
    loadModsetActivity(modsetActivityPage - 1).catch(() => null);
  }, [loadModsetActivity, modsetActivityPage]);

  const nextModsetActivityPage = React.useCallback(() => {
    if (!canPageForwardModsetActivity) return;
    loadModsetActivity(modsetActivityPage + 1).catch(() => null);
  }, [canPageForwardModsetActivity, loadModsetActivity, modsetActivityPage]);

  const toggleChangelogVersion = React.useCallback((version: string) => {
    setExpandedChangelogVersions((previous) => {
      const next = new Set(previous);
      if (next.has(version)) next.delete(version);
      else next.add(version);
      return next;
    });
  }, []);

  return {
    loadStates: { mods: modsLoad, activity: activityLoad, scheduler: schedulerLoad },
    mods,
    modsetActivity,
    modsetActivityPage,
    canPageForwardModsetActivity,
    schedulerStatus,
    selected,
    selectedId,
    installedVersionEdit,
    expandedChangelogVersions,
    sortMode,
    searchQuery,
    statusFilter,
    saveState,
    sortedMods,
    changelogEntries,
    trackedDependencyMatches,
    setInstalledVersionEdit,
    childModsFirst,
    setChildModsFirst,
    setSortMode,
    setSearchQuery,
    setStatusFilter,
    setSelectedId,
    loadMods,
    loadModsetActivity,
    loadSchedulerStatus,
    previousModsetActivityPage,
    nextModsetActivityPage,
    openMod,
    addMod,
    refreshMod,
    getModRefreshState,
    removeMod,
    updateInstalledVersion,
    updateExportOrder,
    toggleChangelogVersion,
    canPageBackModsetActivity: modsetActivityPage > 0,
  };
}
