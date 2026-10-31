import type { UserAccountUpdate } from "../types";
import React from "react";
import { useLoadState } from "./useLoadState";

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
    updateUserAccount: (userId: number, payload: UserAccountUpdate) => Promise<UserAccount>;
    deleteUser: (userId: number) => Promise<void>;
    resetUserPassword: (userId: number, password: string) => Promise<void>;
  };
  authUser: AuthUser | null;
}) {
  const scope = authUser?.role === "admin" ? String(authUser.id) : null;
  const usersLoad = useLoadState(scope);
  const modsetsLoad = useLoadState(scope);
  const webhooksLoad = useLoadState(scope);
  const auditLoad = useLoadState(scope);
  const [users, setUsers] = React.useState<UserAccount[]>([]);
  const [modsets, setModsets] = React.useState<Modset[]>([]);
  const [discordWebhooks, setDiscordWebhooks] = React.useState<DiscordWebhook[]>([]);
  const [auditLogs, setAuditLogs] = React.useState<AuditLog[]>([]);
  const [auditLogPage, setAuditLogPage] = React.useState(0);
  const [canPageForwardAuditLogs, setCanPageForwardAuditLogs] = React.useState(false);

  const loadUsers = React.useCallback(() => usersLoad.run(() => api.listUsers(), setUsers), [api, usersLoad.run]);

  const loadAuditLogs = React.useCallback((page = 0) => auditLoad.run(
    () => api.listAuditLogs(AUDIT_LOG_PAGE_SIZE + 1, page * AUDIT_LOG_PAGE_SIZE), data => {
      setAuditLogs(data.slice(0, AUDIT_LOG_PAGE_SIZE));
      setCanPageForwardAuditLogs(data.length > AUDIT_LOG_PAGE_SIZE);
      setAuditLogPage(page);
    }), [api, auditLoad.run]);

  const loadModsets = React.useCallback(() => modsetsLoad.run(() => api.listAdminModsets(), setModsets), [api, modsetsLoad.run]);
  const loadDiscordWebhooks = React.useCallback(() => webhooksLoad.run(() => api.listDiscordWebhooks(), setDiscordWebhooks), [api, webhooksLoad.run]);

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
    await Promise.allSettled([loadUsers(), loadModsets(), loadDiscordWebhooks(), loadAuditLogs(auditLogPage)]);
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
    async (userId: number, payload: UserAccountUpdate) => {
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
    loadStates: { users: usersLoad, modsets: modsetsLoad, webhooks: webhooksLoad, audit: auditLoad },
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
