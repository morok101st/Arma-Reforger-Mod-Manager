import React from "react";

import type { AuditLog, AuthUser, UserAccount, UserRole } from "../types";

export function useAdminData({
  api,
  authUser,
}: {
  api: {
    listUsers: () => Promise<UserAccount[]>;
    listAuditLogs: (limit?: number) => Promise<AuditLog[]>;
    createUser: (username: string, password: string, role: UserRole) => Promise<UserAccount>;
    updateUserAccount: (userId: number, payload: Partial<Pick<UserAccount, "role" | "is_active">>) => Promise<UserAccount>;
    resetUserPassword: (userId: number, password: string) => Promise<void>;
  };
  authUser: AuthUser | null;
}) {
  const [users, setUsers] = React.useState<UserAccount[]>([]);
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

  React.useEffect(() => {
    if (authUser?.role !== "admin") {
      setUsers([]);
      setAuditLogs([]);
      return;
    }
    loadUsers().catch(() => null);
    loadAuditLogs().catch(() => null);
  }, [authUser, loadUsers, loadAuditLogs]);

  const createUser = React.useCallback(
    async (username: string, password: string, role: UserRole) => {
      const created = await api.createUser(username, password, role);
      await loadUsers();
      await loadAuditLogs();
      return created;
    },
    [api, loadAuditLogs, loadUsers],
  );

  const updateUserAccount = React.useCallback(
    async (userId: number, payload: Partial<Pick<UserAccount, "role" | "is_active">>) => {
      const updated = await api.updateUserAccount(userId, payload);
      await loadUsers();
      await loadAuditLogs();
      return updated;
    },
    [api, loadAuditLogs, loadUsers],
  );

  const resetUserPassword = React.useCallback(
    async (userId: number, password: string) => {
      await api.resetUserPassword(userId, password);
      await loadUsers();
      await loadAuditLogs();
    },
    [api, loadAuditLogs, loadUsers],
  );

  return {
    users,
    auditLogs,
    loadUsers,
    loadAuditLogs,
    createUser,
    updateUserAccount,
    resetUserPassword,
  };
}
