import type { AuditFilter, AuditLog, ChangelogEntry, Dependency, Mod, ModStatus, ModVersion, ModsetActivity, SortMode } from "../types";

export const UNKNOWN_VALUE = "unknown";

export function formatDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    hour12: true,
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export function statusLabel(status: ModStatus) {
  if (status === "NOT_INSTALLED") return "No installed version";
  if (status === "UPDATE_AVAILABLE") return "Update available";
  if (status === "UP_TO_DATE") return "Up to date";
  return "Status unknown";
}

export function auditActionLabel(action: string) {
  return action.replace(/_/g, " ");
}

export function auditFilterLabel(filter: AuditFilter) {
  if (filter === "auth") return "Auth";
  if (filter === "user") return "Users";
  if (filter === "mod") return "Mods";
  if (filter === "integration") return "Integrations";
  if (filter === "failures") return "Failures";
  return "All";
}

export function filterAuditLogs(logs: AuditLog[], filter: AuditFilter) {
  if (filter === "all") return logs;
  if (filter === "failures") return logs.filter((entry) => auditSeverity(entry) === "failure");
  return logs.filter((entry) => entry.entity_type === filter);
}

export function auditSeverity(entry: AuditLog) {
  return entry.action.includes("failed") || entry.action.includes("rate_limited") ? "failure" : "event";
}

export function auditEntityLine(entry: AuditLog) {
  const actor = entry.actor_username ?? "system";
  const modName = entry.entity_type === "mod" && typeof entry.detail.mod_name === "string" ? entry.detail.mod_name : null;
  if (entry.entity_type === "mod" && modName) {
    return `${actor} · ${modName}${entry.entity_id ? ` - ${entry.entity_id}` : ""}`;
  }
  if (entry.entity_type === "mod") {
    return `${actor} · ${entry.entity_id ?? "unknown mod"}`;
  }
  const entityName = modName ? `${entry.entity_type} ${modName}` : entry.entity_type;
  return `${actor} · ${entityName}${entry.entity_id ? ` ${entry.entity_id}` : ""}`;
}

export function auditDetailText(detail: Record<string, unknown>) {
  const values = Object.entries(detail)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 6)
    .map(([key, value]) => `${auditDetailLabel(key)}: ${auditDetailValue(value)}`);
  return values.join(" · ");
}

export function modsetActivityTitle(entry: ModsetActivity) {
  if (entry.action === "mod_created") return "Added mod";
  if (entry.action === "mod_deleted") return "Removed mod";
  if (entry.action === "mod_updated") {
    if (entry.detail.current_version_changed) return "Changed installed version";
    if (entry.detail.pinned_changed) return "Changed pin state";
    return "Updated mod";
  }
  return auditActionLabel(entry.action);
}

export function modsetActivitySummary(entry: ModsetActivity) {
  const modName = typeof entry.detail.mod_name === "string" && entry.detail.mod_name ? entry.detail.mod_name : entry.entity_id ?? "Unknown mod";
  const actor = entry.actor_username ?? "system";

  if (entry.action === "mod_created") {
    const version = typeof entry.detail.current_version === "string" && entry.detail.current_version ? entry.detail.current_version : "No installed version";
    return `${actor} added ${modName} · ${version}`;
  }

  if (entry.action === "mod_deleted") {
    return `${actor} removed ${modName}`;
  }

  if (entry.action === "mod_updated") {
    if (entry.detail.current_version_changed) {
      const version = typeof entry.detail.current_version === "string" && entry.detail.current_version ? entry.detail.current_version : "No installed version";
      return `${actor} set ${modName} to ${version}`;
    }
    if (entry.detail.pinned_changed) {
      const pinned = entry.detail.pinned === true ? "pinned" : "unpinned";
      return `${actor} ${pinned} ${modName}`;
    }
    return `${actor} updated ${modName}`;
  }

  return `${actor} · ${modName}`;
}

function auditDetailLabel(value: string) {
  return value.replace(/_/g, " ");
}

function auditDetailValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function getDashboardStats(mods: Mod[]) {
  const total = mods.length;
  const updateAvailable = mods.filter((mod) => mod.status === "UPDATE_AVAILABLE").length;
  const upToDate = mods.filter((mod) => mod.status === "UP_TO_DATE").length;
  const unknown = mods.filter((mod) => mod.status === "UNKNOWN").length;
  const notInstalled = mods.filter((mod) => mod.status === "NOT_INSTALLED").length;
  const dependencyTracked = mods.filter((mod) => mod.is_dependency).length;
  const dependencyLinks = mods.reduce((sum, mod) => sum + mod.dependencies.length, 0);
  const recentlyChecked = [...mods]
    .filter((mod) => mod.last_checked)
    .sort((left, right) => timestamp(right.last_checked) - timestamp(left.last_checked))
    .slice(0, 5);
  const attentionMods = [...mods]
    .filter((mod) => mod.status !== "UP_TO_DATE")
    .sort((left, right) => {
      const missingVersionRank = Number(right.status === "NOT_INSTALLED") - Number(left.status === "NOT_INSTALLED");
      if (missingVersionRank !== 0) return missingVersionRank;
      return statusPriority(left.status) - statusPriority(right.status) || compareByName(left, right);
    })
    .slice(0, 6);

  const summaryText =
    total === 0
      ? "No mods are tracked yet."
      : `${total} tracked mods, ${updateAvailable} updates, ${unknown} unknown states, ${dependencyTracked} dependency-tracked mods.`;

  return {
    total,
    updateAvailable,
    upToDate,
    unknown,
    notInstalled,
    dependencyTracked,
    dependencyLinks,
    recentlyChecked,
    attentionMods,
    summaryText,
  };
}

export function changelogEntriesFromVersions(versions: ModVersion[]): ChangelogEntry[] {
  return versions
    .map((version) => ({
      version: version.version,
      lastModifiedAt: version.last_modified_at,
      lines: changelogLines(version.changelog, version.version),
    }))
    .filter((entry) => entry.version || entry.lines.length > 0);
}

function changelogLines(value: string | null, version: string): string[] {
  if (!value) return [];
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines[0] && normalizeVersionLabel(lines[0]) === normalizeVersionLabel(version)) {
    return lines.slice(1);
  }
  return lines;
}

function normalizeVersionLabel(value: string): string {
  return value.toLowerCase().trim().replace(/^v/, "");
}

function statusPriority(status: ModStatus): number {
  if (status === "UPDATE_AVAILABLE") return 0;
  if (status === "NOT_INSTALLED") return 1;
  if (status === "UNKNOWN") return 2;
  return 3;
}

export function sortMods(mods: Mod[], sortMode: SortMode): Mod[] {
  const statusRank: Record<ModStatus, number> = {
    UPDATE_AVAILABLE: 0,
    NOT_INSTALLED: 1,
    UNKNOWN: 2,
    UP_TO_DATE: 3,
  };

  return [...mods].sort((left, right) => {
    if (sortMode === "updates") {
      return statusRank[left.status] - statusRank[right.status] || compareByName(left, right);
    }

    if (sortMode === "status") {
      return statusRank[left.status] - statusRank[right.status] || compareByName(left, right);
    }

    if (sortMode === "last_checked") {
      return timestamp(right.last_checked) - timestamp(left.last_checked) || compareByName(left, right);
    }

    return compareByName(left, right);
  });
}

export function filterMods(mods: Mod[], searchQuery: string): Mod[] {
  const query = searchQuery.trim().toLowerCase();
  if (!query) return mods;
  return mods.filter((mod) => [mod.name, mod.id].filter(Boolean).join(" ").toLowerCase().includes(query));
}

function compareByName(left: Mod, right: Mod): number {
  const leftName = left.name ?? left.id;
  const rightName = right.name ?? right.id;
  return leftName.localeCompare(rightName, undefined, { numeric: true, sensitivity: "base" }) || left.id.localeCompare(right.id);
}

function timestamp(value: string | null): number {
  return value ? new Date(value).getTime() || 0 : 0;
}

export function findTrackedDependency(dependency: Dependency, mods: Mod[]): Mod | null {
  return mods.find((mod) => dependencyTargetsMod(dependency, mod)) ?? null;
}

export function dependencyTargetsMod(dependency: Dependency, mod: Mod): boolean {
  const modId = normalizeMatchValue(mod.id);
  const modName = normalizeMatchValue(mod.name);
  const dependencyName = normalizeMatchValue(dependency.name);
  const dependencyUrl = normalizeMatchValue(dependency.url);

  return Boolean(dependencyUrl && modId && dependencyUrl.includes(modId)) || dependencyName === modId || Boolean(modName && dependencyName === modName);
}

export function dependencyKey(dependency: Dependency): string {
  return `${dependency.name}-${dependency.url ?? ""}`;
}

function normalizeMatchValue(value: string | null): string {
  if (!value) return "";
  return value.toLowerCase().trim().replace(/\s+/g, " ");
}
