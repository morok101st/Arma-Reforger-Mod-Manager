import React from "react";

import { changelogEntriesFromVersions, dependencyKey, filterMods, findTrackedDependency, sortMods } from "../lib/utils";
import type { AuthUser, Mod, ModsetActivity, SchedulerStatus, SortMode } from "../types";

export function useMods({
  api,
  authUser,
  activeModsetId,
}: {
  api: {
    listMods: (modsetId?: number | null) => Promise<Mod[]>;
    listModsetActivity: (modsetId: number, limit?: number) => Promise<ModsetActivity[]>;
    getSchedulerStatus: () => Promise<SchedulerStatus>;
    createMod: (id: string, currentVersion: string | null, modsetId?: number | null) => Promise<Mod>;
    refreshMod: (id: string, modsetId?: number | null) => Promise<Mod>;
    deleteMod: (id: string, modsetId?: number | null, options?: { deactivateOrphanDependencies?: boolean }) => Promise<void>;
    updateMod: (
      id: string,
      payload: { current_version?: string | null },
      modsetId?: number | null,
      options?: { deactivateOrphanDependencies?: boolean },
    ) => Promise<Mod>;
  };
  authUser: AuthUser | null;
  activeModsetId: number | null;
}) {
  const [mods, setMods] = React.useState<Mod[]>([]);
  const [modsetActivity, setModsetActivity] = React.useState<ModsetActivity[]>([]);
  const [schedulerStatus, setSchedulerStatus] = React.useState<SchedulerStatus | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [installedVersionEdit, setInstalledVersionEdit] = React.useState("");
  const [expandedChangelogVersions, setExpandedChangelogVersions] = React.useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = React.useState<SortMode>("updates");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [saveState, setSaveState] = React.useState<"idle" | "saved">("idle");

  const visibleMods = React.useMemo(() => filterMods(mods, searchQuery), [mods, searchQuery]);
  const sortedMods = React.useMemo(() => sortMods(visibleMods, sortMode), [visibleMods, sortMode]);
  const selected = sortedMods.find((mod) => mod.id === selectedId) ?? sortedMods[0] ?? null;
  const changelogEntries = React.useMemo(() => changelogEntriesFromVersions(selected?.versions ?? []), [selected?.versions]);
  const trackedDependencyMatches = React.useMemo(
    () => new Map((selected?.dependencies ?? []).map((dependency) => [dependencyKey(dependency), findTrackedDependency(dependency, mods)])),
    [mods, selected?.dependencies],
  );

  const loadMods = React.useCallback(async () => {
    if (!activeModsetId) {
      setMods([]);
      setModsetActivity([]);
      setSelectedId(null);
      return [];
    }
    const data = await api.listMods(activeModsetId);
    setMods(data);
    setSelectedId((current) => (current && data.some((mod) => mod.id === current) ? current : data[0]?.id ?? null));
    return data;
  }, [activeModsetId, api]);

  const loadModsetActivity = React.useCallback(async () => {
    if (!activeModsetId) {
      setModsetActivity([]);
      return [];
    }
    const data = await api.listModsetActivity(activeModsetId);
    setModsetActivity(data);
    return data;
  }, [activeModsetId, api]);

  const loadSchedulerStatus = React.useCallback(async () => {
    const status = await api.getSchedulerStatus();
    setSchedulerStatus(status);
    return status;
  }, [api]);

  React.useEffect(() => {
    if (!authUser) {
      setMods([]);
      setModsetActivity([]);
      setSchedulerStatus(null);
      setSelectedId(null);
      return;
    }
    loadMods().catch(() => null);
    loadModsetActivity().catch(() => null);
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
        await Promise.all([loadMods(), loadModsetActivity()]);
        setSelectedId(created.id);
      }
      return created;
    },
    [activeModsetId, api, loadModsetActivity, loadMods],
  );

  const refreshMod = React.useCallback(
    async (id: string) => {
      if (!activeModsetId) return;
      await api.refreshMod(id, activeModsetId);
      await Promise.all([loadMods(), loadModsetActivity()]);
    },
    [activeModsetId, api, loadModsetActivity, loadMods],
  );

  const removeMod = React.useCallback(
    async (id: string, options?: { deactivateOrphanDependencies?: boolean }) => {
      if (!activeModsetId) return;
      await api.deleteMod(id, activeModsetId, options);
      setSelectedId(null);
      await Promise.all([loadMods(), loadModsetActivity()]);
    },
    [activeModsetId, api, loadModsetActivity, loadMods],
  );

  const updateInstalledVersion = React.useCallback(
    async (nextVersion = installedVersionEdit, options?: { deactivateOrphanDependencies?: boolean }) => {
      if (!selected) return null;
      const normalizedVersion = nextVersion.trim();
      if (!activeModsetId) return null;
      const updated = await api.updateMod(selected.id, { current_version: normalizedVersion || null }, activeModsetId, options);
      await Promise.all([loadMods(), loadModsetActivity()]);
      setSelectedId(updated.id);
      setInstalledVersionEdit(updated.current_version ?? "");
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 3000);
      return updated;
    },
    [activeModsetId, api, installedVersionEdit, loadModsetActivity, loadMods, selected],
  );

  const toggleChangelogVersion = React.useCallback((version: string) => {
    setExpandedChangelogVersions((previous) => {
      const next = new Set(previous);
      if (next.has(version)) next.delete(version);
      else next.add(version);
      return next;
    });
  }, []);

  return {
    mods,
    modsetActivity,
    schedulerStatus,
    selected,
    selectedId,
    installedVersionEdit,
    expandedChangelogVersions,
    sortMode,
    searchQuery,
    saveState,
    sortedMods,
    changelogEntries,
    trackedDependencyMatches,
    setInstalledVersionEdit,
    setSortMode,
    setSearchQuery,
    setSelectedId,
    loadMods,
    loadModsetActivity,
    loadSchedulerStatus,
    openMod,
    addMod,
    refreshMod,
    removeMod,
    updateInstalledVersion,
    toggleChangelogVersion,
  };
}
