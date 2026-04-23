import React from "react";

import { changelogEntriesFromVersions, dependencyKey, filterMods, findTrackedDependency, sortMods } from "../lib/utils";
import type { AuthUser, Mod, SchedulerStatus, SortMode } from "../types";

export function useMods({
  api,
  authUser,
}: {
  api: {
    listMods: () => Promise<Mod[]>;
    getSchedulerStatus: () => Promise<SchedulerStatus>;
    createMod: (id: string, currentVersion: string | null) => Promise<Mod>;
    refreshMod: (id: string) => Promise<Mod>;
    deleteMod: (id: string) => Promise<void>;
    updateInstalledVersion: (id: string, currentVersion: string | null) => Promise<Mod>;
  };
  authUser: AuthUser | null;
}) {
  const [mods, setMods] = React.useState<Mod[]>([]);
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
    const data = await api.listMods();
    setMods(data);
    setSelectedId((current) => current ?? data[0]?.id ?? null);
    return data;
  }, [api]);

  const loadSchedulerStatus = React.useCallback(async () => {
    const status = await api.getSchedulerStatus();
    setSchedulerStatus(status);
    return status;
  }, [api]);

  React.useEffect(() => {
    if (!authUser) {
      setMods([]);
      setSchedulerStatus(null);
      setSelectedId(null);
      return;
    }
    loadMods().catch(() => null);
    loadSchedulerStatus().catch(() => null);
  }, [authUser, loadMods, loadSchedulerStatus]);

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
    async (id: string, currentVersion: string | null) => {
      const created = await api.createMod(id, currentVersion);
      await loadMods();
      setSelectedId(created.id);
      return created;
    },
    [api, loadMods],
  );

  const refreshMod = React.useCallback(
    async (id: string) => {
      await api.refreshMod(id);
      await loadMods();
    },
    [api, loadMods],
  );

  const removeMod = React.useCallback(
    async (id: string) => {
      await api.deleteMod(id);
      setSelectedId(null);
      await loadMods();
    },
    [api, loadMods],
  );

  const updateInstalledVersion = React.useCallback(
    async (nextVersion = installedVersionEdit) => {
      if (!selected) return null;
      const normalizedVersion = nextVersion.trim();
      const updated = await api.updateInstalledVersion(selected.id, normalizedVersion || null);
      await loadMods();
      setSelectedId(updated.id);
      setInstalledVersionEdit(updated.current_version ?? "");
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 3000);
      return updated;
    },
    [api, installedVersionEdit, loadMods, selected],
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
    loadSchedulerStatus,
    openMod,
    addMod,
    refreshMod,
    removeMod,
    updateInstalledVersion,
    toggleChangelogVersion,
  };
}
