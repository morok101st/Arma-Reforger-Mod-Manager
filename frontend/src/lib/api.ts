import type { UserAccountUpdate } from "../types";
import type {
  ModRefreshJob,
  AuditLog,
  AuthConfig,
  AuthUser,
  DiscordWebhook,
  Mod,
  Modset,
  ModsetActivity,
  ModsetExport,
  SchedulerStatus,
  ThemePreference,
  UserAccount,
  UserRole,
  GroupSummary,
  UserGroup,
  GroupWrite,
  GroupPermission,
} from "../types";

export type SyncSettings = {name: string; baseUrl: string; gameServer?: {host: string; port: number; passwordRequired: boolean}};
export type SyncAccessStatus = {configuration: SyncSettings | null; downloadable: boolean; key_available: boolean; enabled: boolean; usable: boolean; created_at: string | null; last_used_at: string | null; base_url: string};
export type SyncAccessOverview = SyncAccessStatus & {modset_id: number; modset_name: string; owner_username: string | null; parent_modset_id: number | null; parent_modset_name: string | null; created_by: string | null};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

type ApiRequestOptions = RequestInit & {
  json?: unknown;
};

export function createApiClient(onUnauthorized?: () => void) {
  function withModset(path: string, modsetId?: number | null) {
    if (!modsetId) return path;
    const separator = path.includes("?") ? "&" : "?";
    return `${path}${separator}modset_id=${encodeURIComponent(String(modsetId))}`;
  }

  async function request(path: string, options: ApiRequestOptions = {}) {
    const { json, headers, ...rest } = options;
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...rest,
      credentials: "include",
      headers: {
        ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });

    if (response.status === 401) {
      onUnauthorized?.();
    }

    return response;
  }

  async function readJsonOrThrow<T>(response: Response, fallbackMessage: string): Promise<T> {
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const detail = payload?.detail;
      const message = typeof detail === "string" ? detail : Array.isArray(detail)
        ? detail.map((item: {loc?: (string | number)[]; msg?: string}) => `${item.loc?.filter(part => part !== "body").join(".") ?? "Input"}: ${item.msg ?? "Invalid value"}`).join(" ")
        : fallbackMessage;
      throw new Error(message);
    }
    return (await response.json()) as T;
  }

  return {
    request,
    async listGroups() {
      return readJsonOrThrow<GroupSummary[]>(await request("/groups"), "Could not load groups.");
    },
    async listAdminGroups() {
      return readJsonOrThrow<UserGroup[]>(await request("/admin/groups"), "Could not load group memberships.");
    },
    async saveGroup(id: number | null, payload: GroupWrite) {
      return readJsonOrThrow<UserGroup>(await request(id === null ? "/admin/groups" : `/admin/groups/${id}`, {
        method: id === null ? "POST" : "PUT", json: payload,
      }), "Could not save group.");
    },
    async deleteGroup(id: number) {
      const response = await request(`/admin/groups/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail ?? "Could not delete group.");
      }
    },
    async saveUserGroups(userId: number, groupIds: number[]) {
      const response = await request(`/admin/users/${userId}/groups`, { method: "PUT", json: { group_ids: groupIds } });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail ?? "Could not save group memberships.");
      }
    },
    async listGroupPermissions(modsetId: number) {
      return readJsonOrThrow<GroupPermission[]>(await request(`/modsets/${modsetId}/group-permissions`), "Could not load group permissions.");
    },
    async saveGroupPermissions(modsetId: number, entries: GroupPermission[]) {
      return readJsonOrThrow<GroupPermission[]>(await request(`/modsets/${modsetId}/group-permissions`, {
        method: "PUT", json: { entries },
      }), "Could not save group permissions.");
    },
    oidcLoginUrl: `${API_BASE_URL}/auth/oidc/login`,
    async getAuthConfig() {
      const response = await request("/auth/config");
      return readJsonOrThrow<AuthConfig>(response, "Could not load authentication configuration.");
    },
    async checkSession() {
      const response = await request("/auth/me");
      if (response.status === 401) return null;
      return readJsonOrThrow<AuthUser>(response, "Could not check session.");
    },
    async login(username: string, password: string) {
      const response = await request("/auth/login", { method: "POST", json: { username, password } });
      return readJsonOrThrow<AuthUser>(response, "Login failed.");
    },
    async logout() {
      await request("/auth/logout", { method: "POST" });
    },
    async changeOwnPassword(currentPassword: string, newPassword: string) {
      const response = await request("/auth/password", {
        method: "PATCH",
        json: { current_password: currentPassword, new_password: newPassword },
      });
      return readJsonOrThrow<AuthUser>(response, "Could not change password.");
    },
    async updateThemePreference(themePreference: ThemePreference) {
      const response = await request("/auth/theme", {
        method: "PATCH",
        json: { theme_preference: themePreference },
      });
      return readJsonOrThrow<AuthUser>(response, "Could not update theme preference.");
    },
    async listMods(modsetId?: number | null) {
      const response = await request(withModset("/mods", modsetId));
      return readJsonOrThrow<Mod[]>(response, "Could not load mod list.");
    },
    async createMod(id: string, currentVersion: string | null, modsetId?: number | null) {
      const response = await request(withModset("/mods", modsetId), { method: "POST", json: { id, current_version: currentVersion } });
      return readJsonOrThrow<Mod>(response, "Could not add mod.");
    },
    async listRefreshJobs(modsetId: number) {
      return readJsonOrThrow<ModRefreshJob[]>(await request(withModset("/refresh-jobs", modsetId)), "Could not load update check status.");
    },
    async refreshMod(id: string, modsetId?: number | null) {
      const response = await request(withModset(`/mods/${id}/refresh-job`, modsetId), { method: "POST" });
      return readJsonOrThrow<ModRefreshJob>(response, "Refresh failed.");
    },
    async deleteMod(id: string, modsetId?: number | null, options?: { deactivateOrphanDependencies?: boolean }) {
      const basePath = withModset(`/mods/${id}`, modsetId);
      const path = options?.deactivateOrphanDependencies
        ? `${basePath}${basePath.includes("?") ? "&" : "?"}deactivate_orphan_dependencies=true`
        : basePath;
      const response = await request(path, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail ?? "Could not delete mod.");
      }
    },
    async updateMod(
      id: string,
      payload: { current_version?: string | null; is_core?: boolean },
      modsetId?: number | null,
      options?: { deactivateOrphanDependencies?: boolean },
    ) {
      const basePath = withModset(`/mods/${id}`, modsetId);
      const path = options?.deactivateOrphanDependencies
        ? `${basePath}${basePath.includes("?") ? "&" : "?"}deactivate_orphan_dependencies=true`
        : basePath;
      const response = await request(path, { method: "PATCH", json: payload });
      return readJsonOrThrow<Mod>(response, "Could not update mod.");
    },
    async previewExportOrder(id: number, mode: "parent" | "independent", parentId: number) {
      return readJsonOrThrow<ModsetExport>(await request(`/modsets/${id}/order-preview?mode=${mode}&parent_modset_id=${parentId}`), "Could not preview export order.");
    },
    async listSyncAccess() {
      return readJsonOrThrow<SyncAccessOverview[]>(await request("/admin/sync-access"), "Could not load sync access overview.");
    },
    async createConfiguredSync(payload: SyncSettings & {modset_id: number}) {
      return readJsonOrThrow<SyncAccessStatus>(await request("/admin/sync-access", {method:"POST",json:payload}), "Could not create sync access.");
    },
    async updateConfiguredSync(id: number, payload: SyncSettings & {accessKey?: string; replaceKey?: boolean}) {
      return readJsonOrThrow<SyncAccessStatus>(await request(`/admin/sync-access/${id}`, {method:"PUT",json:payload}), "Could not update sync access.");
    },
    async downloadSavedSync(id: number) {
      return readJsonOrThrow<unknown>(await request(`/admin/sync-access/${id}/configuration`), "Could not download sync configuration.");
    },
    async getSyncAccess(id: number) {
      return readJsonOrThrow<SyncAccessStatus>(await request(`/modsets/${id}/sync-access`), "Could not load sync access.");
    },
    async createSyncAccess(id: number) {
      return readJsonOrThrow<SyncAccessStatus & {access_key: string}>(await request(`/modsets/${id}/sync-access`, {method: "POST"}), "Could not create sync access.");
    },
    async disableSyncAccess(id: number) {
      return readJsonOrThrow<SyncAccessStatus>(await request(`/modsets/${id}/sync-access`, {method: "DELETE"}), "Could not disable sync access.");
    },
    async downloadSyncConfiguration(id: number, payload: {name: string; baseUrl: string; accessKey: string; gameServer?: {host: string; port: number; passwordRequired: boolean}}) {
      return readJsonOrThrow<unknown>(await request(`/modsets/${id}/sync-configuration`, {method: "POST", json: payload}), "Could not create sync configuration.");
    },
    async listModsets() {
      const response = await request("/modsets");
      return readJsonOrThrow<Modset[]>(response, "Could not load modsets.");
    },
    async createModset(name: string, parentModsetId?: number | null, orderMode?: "parent" | "independent") {
      const response = await request("/modsets", { method: "POST", json: { name, parent_modset_id: parentModsetId ?? null, order_mode: orderMode ?? "parent" } });
      return readJsonOrThrow<Modset>(response, "Could not create modset.");
    },
    async updateModset(modsetId: number, name: string, permissions?: GroupPermission[], parentModsetId?: number | null, confirmParentConflicts?: boolean, orderMode?: "parent" | "independent", confirmOrderChange?: boolean) {
      const payload = { name, ...(orderMode !== undefined ? { order_mode: orderMode, confirm_order_change: confirmOrderChange ?? false } : {}), ...(parentModsetId !== undefined ? { parent_modset_id: parentModsetId, confirm_parent_conflicts: confirmParentConflicts ?? false } : {}), ...(permissions !== undefined ? { group_permissions: permissions } : {}) };
      const response = await request(`/modsets/${modsetId}`, { method: "PATCH", json: payload });
      return readJsonOrThrow<Modset>(response, "Could not rename modset.");
    },
    async duplicateModset(modsetId: number) {
      const response = await request(`/modsets/${modsetId}/duplicate`, { method: "POST" });
      return readJsonOrThrow<Modset>(response, "Could not duplicate modset.");
    },
    async deleteModset(modsetId: number) {
      const response = await request(`/modsets/${modsetId}`, { method: "DELETE" });
      return readJsonOrThrow<AuthUser>(response, "Could not delete modset.");
    },
    async activateModset(modsetId: number) {
      const response = await request(`/modsets/${modsetId}/activate`, { method: "POST" });
      return readJsonOrThrow<AuthUser>(response, "Could not activate modset.");
    },
    async exportModset(modsetId: number) {
      const response = await request(`/modsets/${modsetId}/export`);
      return readJsonOrThrow<ModsetExport>(response, "Could not export modset.");
    },
    async updateExportOrder(modsetId: number, modIds: string[]) {
      const response = await request(`/modsets/${modsetId}/export-order`, { method: "PUT", json: { mod_ids: modIds } });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail ?? "Could not update export order.");
      }
    },
    async listModsetActivity(modsetId: number, limit = 10, offset = 0) {
      const response = await request(`/modsets/${modsetId}/activity?limit=${limit}&offset=${offset}`);
      return readJsonOrThrow<ModsetActivity[]>(response, "Could not load modset activity.");
    },
    async listUsers() {
      const response = await request("/users");
      return readJsonOrThrow<UserAccount[]>(response, "Could not load users.");
    },
    async listDiscordWebhooks() {
      const response = await request("/discord-webhooks");
      return readJsonOrThrow<DiscordWebhook[]>(response, "Could not load Discord webhooks.");
    },
    async listAdminModsets() {
      const response = await request("/admin/modsets");
      return readJsonOrThrow<Modset[]>(response, "Could not load modsets.");
    },
    async createDiscordWebhook(payload: { name: string; webhook_url: string; is_active: boolean; modset_ids?: number[] }) {
      const response = await request("/discord-webhooks", { method: "POST", json: payload });
      return readJsonOrThrow<DiscordWebhook>(response, "Could not create Discord webhook.");
    },
    async updateDiscordWebhook(
      webhookId: number,
      payload: { name?: string; webhook_url?: string; is_active?: boolean; modset_ids?: number[] },
    ) {
      const response = await request(`/discord-webhooks/${webhookId}`, { method: "PATCH", json: payload });
      return readJsonOrThrow<DiscordWebhook>(response, "Could not update Discord webhook.");
    },
    async deleteDiscordWebhook(webhookId: number) {
      const response = await request(`/discord-webhooks/${webhookId}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail ?? "Could not delete Discord webhook.");
      }
    },
    async testDiscordWebhook(webhookId: number) {
      const response = await request(`/discord-webhooks/${webhookId}/test`, { method: "POST" });
      return readJsonOrThrow<{ sent: boolean }>(response, "Could not test Discord webhook.");
    },
    async createUser(username: string, password: string, role: UserRole) {
      const response = await request("/users", { method: "POST", json: { username, password, role } });
      return readJsonOrThrow<UserAccount>(response, "Could not create user.");
    },
    async updateUserAccount(userId: number, payload: UserAccountUpdate) {
      const response = await request(`/users/${userId}`, { method: "PATCH", json: payload });
      return readJsonOrThrow<UserAccount>(response, "Could not update user.");
    },
    async deleteUser(userId: number) {
      const response = await request(`/users/${userId}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail ?? "Could not delete user.");
      }
    },
    async resetUserPassword(userId: number, password: string) {
      const response = await request(`/users/${userId}/password`, { method: "PATCH", json: { password } });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail ?? "Could not reset password.");
      }
    },
    async listAuditLogs(limit = 25, offset = 0) {
      const response = await request(`/audit?limit=${limit}&offset=${offset}`);
      return readJsonOrThrow<AuditLog[]>(response, "Could not load audit log.");
    },
    async getSchedulerStatus() {
      const response = await request("/scheduler/status");
      return readJsonOrThrow<SchedulerStatus>(response, "Could not load scheduler status.");
    },
  };
}
