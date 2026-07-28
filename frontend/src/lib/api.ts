import type { AuditLog, AuthUser, DiscordWebhook, Mod, Modset, ModsetActivity, ModsetExport, SchedulerStatus, ThemePreference, UserAccount, UserRole } from "../types";

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
      throw new Error(payload?.detail ?? fallbackMessage);
    }
    return (await response.json()) as T;
  }

  return {
    request,
    async checkSession() {
      const response = await request("/auth/me");
      return response.ok ? ((await response.json()) as AuthUser) : null;
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
    async refreshMod(id: string, modsetId?: number | null) {
      const response = await request(withModset(`/mods/${id}/refresh`, modsetId), { method: "POST" });
      return readJsonOrThrow<Mod>(response, "Refresh failed.");
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
      payload: { current_version?: string | null; is_core?: boolean; load_order?: number },
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
    async listModsets() {
      const response = await request("/modsets");
      return readJsonOrThrow<Modset[]>(response, "Could not load modsets.");
    },
    async createModset(name: string, shared = false) {
      const response = await request("/modsets", { method: "POST", json: { name, shared } });
      return readJsonOrThrow<Modset>(response, "Could not create modset.");
    },
    async updateModset(modsetId: number, name: string, shared?: boolean) {
      const payload: { name: string; shared?: boolean } = { name };
      if (shared !== undefined) payload.shared = shared;
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
    async updateUserAccount(userId: number, payload: Partial<Pick<UserAccount, "role" | "is_active">>) {
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
