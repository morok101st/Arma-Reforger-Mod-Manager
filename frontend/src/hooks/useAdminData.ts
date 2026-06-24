import React from "react";

import type { AuditLog, AuthUser, DiscordWebhook, Modset, UserAccount, UserRole } from "../types";

const AUDIT_LOG_PAGE_SIZE = 25;

export function useAdminData({
  api,
  authUser,
}: {
  api: {
    listUsers: () => Promise<UserAccount[]>;
    listAdminModsets: () => Promise<Modset[]>;
    listDiscordWebhooks: () => Promise<DiscordWebhook[]>;
    listAuditLogs: (limit?: number, offset?: number) => Promise<AuditLog[]>;
    createUser: (username: string, password: string, role: UserRole) => Promise<UserAccount>;
    createDiscordWebhook: (payload: { name: string; webhook_url: string; is_active: boolean; modset_ids?: number[] }) => Promise<DiscordWebhook>;
    updateDiscordWebhook: (webhookId: number, payload: { name?: string; webhook_url?: string; is_active?: boolean; modset_ids?: number[] }) => Promise<DiscordWebhook>;
    deleteDiscordWebhook: (webhookId: number) => Promise<void>;
    testDiscordWebhook: (webhookId: number) => Promise<{ sent: boolean }>;
    updateUserAccount: (userId: number, payload: Partial<Pick<UserAccount, "role" | "is_active">>) => Promise<UserAccount>;
    deleteUser: (userId: number) => Promise<void>;
    resetUserPassword: (userId: number, password: string) => Promise<void>;
  };
  authUser: AuthUser | null;
}) {
  const [users, setUsers] = React.useState<UserAccount[]>([]);
  const [modsets, setModsets] = React.useState<Modset[]>([]);
  const [discordWebhooks, setDiscordWebhooks] = React.useState<DiscordWebhook[]>([]);
  const [auditLogs, setAuditLogs] = React.useState<AuditLog[]>([]);
  const [auditLogPage, setAuditLogPage] = React.useState(0);
  const [canPageForwardAuditLogs, setCanPageForwardAuditLogs] = React.useState(false);

  const loadUsers = React.useCallback(async () => {
    const data = await api.listUsers();
    setUsers(data);
    return data;
  }, [api]);

  const loadAuditLogs = React.useCallback(async (page = 0) => {
    const offset = page * AUDIT_LOG_PAGE_SIZE;
    const data = await api.listAuditLogs(AUDIT_LOG_PAGE_SIZE + 1, offset);
    const visible = data.slice(0, AUDIT_LOG_PAGE_SIZE);
    setAuditLogs(visible);
    setCanPageForwardAuditLogs(data.length > AUDIT_LOG_PAGE_SIZE);
    setAuditLogPage(page);
    return visible;
  }, [api]);

  const loadModsets = React.useCallback(async () => {
    const data = await api.listAdminModsets();
    setModsets(data);
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
      setModsets([]);
      setDiscordWebhooks([]);
      setAuditLogs([]);
      setAuditLogPage(0);
      setCanPageForwardAuditLogs(false);
      return;
    }
    loadUsers().catch(() => null);
    loadModsets().catch(() => null);
    loadDiscordWebhooks().catch(() => null);
    loadAuditLogs(0).catch(() => null);
  }, [authUser, loadUsers, loadModsets, loadDiscordWebhooks, loadAuditLogs]);

  const refreshAdminData = React.useCallback(async () => {
    await Promise.all([loadUsers(), loadModsets(), loadDiscordWebhooks(), loadAuditLogs(auditLogPage)]);
  }, [auditLogPage, loadAuditLogs, loadDiscordWebhooks, loadModsets, loadUsers]);

  const createUser = React.useCallback(
    async (username: string, password: string, role: UserRole) => {
      const created = await api.createUser(username, password, role);
      await refreshAdminData();
      return created;
    },
    [api, refreshAdminData],
  );

  const createDiscordWebhook = React.useCallback(
    async (payload: { name: string; webhook_url: string; is_active: boolean; modset_ids?: number[] }) => {
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
    async (webhookId: number, payload: { name?: string; webhook_url?: string; is_active?: boolean; modset_ids?: number[] }) => {
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
      await loadAuditLogs(auditLogPage);
      return result;
    },
    [api, auditLogPage, loadAuditLogs],
  );

  const previousAuditLogPage = React.useCallback(() => {
    if (auditLogPage <= 0) return;
    loadAuditLogs(auditLogPage - 1).catch(() => null);
  }, [auditLogPage, loadAuditLogs]);

  const nextAuditLogPage = React.useCallback(() => {
    if (!canPageForwardAuditLogs) return;
    loadAuditLogs(auditLogPage + 1).catch(() => null);
  }, [auditLogPage, canPageForwardAuditLogs, loadAuditLogs]);

  return {
    users,
    modsets,
    discordWebhooks,
    auditLogs,
    auditLogPage,
    canPageForwardAuditLogs,
    loadUsers,
    loadModsets,
    loadDiscordWebhooks,
    loadAuditLogs,
    previousAuditLogPage,
    nextAuditLogPage,
    createUser,
    createDiscordWebhook,
    updateUserAccount,
    updateDiscordWebhook,
    deleteUser,
    resetUserPassword,
    deleteDiscordWebhook,
    testDiscordWebhook,
    canPageBackAuditLogs: auditLogPage > 0,
  };
}
