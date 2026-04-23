import type { AuditLog, AuthUser, Mod, SchedulerStatus, UserAccount, UserRole } from "../types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

type ApiRequestOptions = RequestInit & {
  json?: unknown;
};

export function createApiClient(onUnauthorized?: () => void) {
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
    async listMods() {
      const response = await request("/mods");
      return readJsonOrThrow<Mod[]>(response, "Could not load mod list.");
    },
    async createMod(id: string, currentVersion: string | null) {
      const response = await request("/mods", { method: "POST", json: { id, current_version: currentVersion } });
      return readJsonOrThrow<Mod>(response, "Could not add mod.");
    },
    async refreshMod(id: string) {
      const response = await request(`/mods/${id}/refresh`, { method: "POST" });
      return readJsonOrThrow<Mod>(response, "Refresh failed.");
    },
    async deleteMod(id: string) {
      const response = await request(`/mods/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not delete mod.");
    },
    async updateInstalledVersion(id: string, currentVersion: string | null) {
      const response = await request(`/mods/${id}`, { method: "PATCH", json: { current_version: currentVersion } });
      return readJsonOrThrow<Mod>(response, "Could not update installed version.");
    },
    async listUsers() {
      const response = await request("/users");
      return readJsonOrThrow<UserAccount[]>(response, "Could not load users.");
    },
    async createUser(username: string, password: string, role: UserRole) {
      const response = await request("/users", { method: "POST", json: { username, password, role } });
      return readJsonOrThrow<UserAccount>(response, "Could not create user.");
    },
    async updateUserAccount(userId: number, payload: Partial<Pick<UserAccount, "role" | "is_active">>) {
      const response = await request(`/users/${userId}`, { method: "PATCH", json: payload });
      return readJsonOrThrow<UserAccount>(response, "Could not update user.");
    },
    async resetUserPassword(userId: number, password: string) {
      const response = await request(`/users/${userId}/password`, { method: "PATCH", json: { password } });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail ?? "Could not reset password.");
      }
    },
    async listAuditLogs(limit = 25) {
      const response = await request(`/audit?limit=${limit}`);
      return readJsonOrThrow<AuditLog[]>(response, "Could not load audit log.");
    },
    async getSchedulerStatus() {
      const response = await request("/scheduler/status");
      return readJsonOrThrow<SchedulerStatus>(response, "Could not load scheduler status.");
    },
  };
}
