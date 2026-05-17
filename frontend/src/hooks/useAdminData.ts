import React from "react";

import type { AuditLog, AuthUser, DiscordWebhook, UserAccount, UserRole } from "../types";

export function useAdminData({
  api,
  authUser,
}: {
  api: {
    listUsers: () => Promise<UserAccount[]>;
    listDiscordWebhooks: () => Promise<DiscordWebhook[]>;
    listAuditLogs: (limit?: number) => Promise<AuditLog[]>;
    createUser: (username: string, password: string, role: UserRole) => Promise<UserAccount>;
    createDiscordWebhook: (payload: { name: string; webhook_url: string; is_active: boolean }) => Promise<DiscordWebhook>;
    updateDiscordWebhook: (webhookId: number, payload: { name?: string; webhook_url?: string; is_active?: boolean }) => Promise<DiscordWebhook>;
    deleteDiscordWebhook: (webhookId: number) => Promise<void>;
    testDiscordWebhook: (webhookId: number) => Promise<{ sent: boolean }>;
    updateUserAccount: (userId: number, payload: Partial<Pick<UserAccount, "role" | "is_active">>) => Promise<UserAccount>;
    deleteUser: (userId: number) => Promise<void>;
    resetUserPassword: (userId: number, password: string) => Promise<void>;
  };
  authUser: AuthUser | null;
}) {
  const [users, setUsers] = React.useState<UserAccount[]>([]);
  const [discordWebhooks, setDiscordWebhooks] = React.useState<DiscordWebhook[]>([]);
  const [auditLogs, setAuditLogs] = React.useState<AuditLog[]>([]);

  const loadUsers = React.useCallback(async () => {
    const data = await api.listUsers();
    setUsers(data);
    return data;
  }, [api]);

  const loadAuditLogs = React.useCallback(async () => {
    const data = await api.listAuditLogs();
    setAuditLogs(data);
    return data;
  }, [api]);

  const loadDiscordWebhooks = React.useCallback(async () => {
    const data = await api.listDiscordWebhooks();
    setDiscordWebhooks(data);
    return data;
  }, [api]);

  React.useEffect(() => {
    if (authUser?.role !== "admin") {
      setUsers([]);
      setDiscordWebhooks([]);
      setAuditLogs([]);
      return;
    }
    loadUsers().catch(() => null);
    loadDiscordWebhooks().catch(() => null);
    loadAuditLogs().catch(() => null);
  }, [authUser, loadUsers, loadDiscordWebhooks, loadAuditLogs]);

  const refreshAdminData = React.useCallback(async () => {
    await Promise.all([loadUsers(), loadDiscordWebhooks(), loadAuditLogs()]);
  }, [loadAuditLogs, loadDiscordWebhooks, loadUsers]);

  const createUser = React.useCallback(
    async (username: string, password: string, role: UserRole) => {
      const created = await api.createUser(username, password, role);
      await refreshAdminData();
      return created;
    },
    [api, refreshAdminData],
  );

  const createDiscordWebhook = React.useCallback(
    async (payload: { name: string; webhook_url: string; is_active: boolean }) => {
      const created = await api.createDiscordWebhook(payload);
      await refreshAdminData();
      return created;
    },
    [api, refreshAdminData],
  );

  const updateUserAccount = React.useCallback(
    async (userId: number, payload: Partial<Pick<UserAccount, "role" | "is_active">>) => {
      const updated = await api.updateUserAccount(userId, payload);
      await refreshAdminData();
      return updated;
    },
    [api, refreshAdminData],
  );

  const updateDiscordWebhook = React.useCallback(
    async (webhookId: number, payload: { name?: string; webhook_url?: string; is_active?: boolean }) => {
      const updated = await api.updateDiscordWebhook(webhookId, payload);
      await refreshAdminData();
      return updated;
    },
    [api, refreshAdminData],
  );

  const resetUserPassword = React.useCallback(
    async (userId: number, password: string) => {
      await api.resetUserPassword(userId, password);
      await refreshAdminData();
    },
    [api, refreshAdminData],
  );

  const deleteUser = React.useCallback(
    async (userId: number) => {
      await api.deleteUser(userId);
      await refreshAdminData();
    },
    [api, refreshAdminData],
  );

  const deleteDiscordWebhook = React.useCallback(
    async (webhookId: number) => {
      await api.deleteDiscordWebhook(webhookId);
      await refreshAdminData();
    },
    [api, refreshAdminData],
  );

  const testDiscordWebhook = React.useCallback(
    async (webhookId: number) => {
      const result = await api.testDiscordWebhook(webhookId);
      await loadAuditLogs();
      return result;
    },
    [api, loadAuditLogs],
  );

  return {
    users,
    discordWebhooks,
    auditLogs,
    loadUsers,
    loadDiscordWebhooks,
    loadAuditLogs,
    createUser,
    createDiscordWebhook,
    updateUserAccount,
    updateDiscordWebhook,
    deleteUser,
    resetUserPassword,
    deleteDiscordWebhook,
    testDiscordWebhook,
  };
}
