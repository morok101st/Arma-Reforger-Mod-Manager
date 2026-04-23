import React from "react";

import type { UserAccount } from "../types";
import { useAsyncAction } from "./useAsyncAction";

export function useAppActions({
  auth,
  admin,
  mods,
  closeAddModDialog,
  openModView,
  showDashboardView,
}: {
  auth: {
    api: { changeOwnPassword: (currentPassword: string, newPassword: string) => Promise<unknown> };
    login: (username: string, password: string) => Promise<unknown>;
    logout: () => Promise<void>;
    setAuthChecked: (value: boolean) => void;
    setAuthUser: (value: any) => void;
    setLoginError: (value: string | null) => void;
  };
  admin: {
    createUser: (username: string, password: string, role: UserAccount["role"]) => Promise<unknown>;
    updateUserAccount: (userId: number, payload: Partial<Pick<UserAccount, "role" | "is_active">>) => Promise<unknown>;
    resetUserPassword: (userId: number, password: string) => Promise<void>;
    loadAuditLogs: () => Promise<unknown>;
  };
  mods: {
    addMod: (modId: string, currentVersion: string | null) => Promise<unknown>;
    refreshMod: (id: string) => Promise<unknown>;
    removeMod: (id: string) => Promise<unknown>;
    updateInstalledVersion: (nextVersion?: string) => Promise<unknown>;
  };
  closeAddModDialog: () => void;
  openModView: () => void;
  showDashboardView: () => void;
}) {
  const action = useAsyncAction();

  const login = React.useCallback(
    async (username: string, password: string) => {
      await action
        .run(
          async () => {
            await auth.login(username.trim(), password);
          },
          { clearError: false, rethrow: true },
        )
        .catch((err) => {
          auth.setLoginError(err instanceof Error ? err.message : "Unknown error.");
        });
      auth.setAuthChecked(true);
    },
    [action, auth],
  );

  const logout = React.useCallback(async () => {
    await auth.logout();
    showDashboardView();
  }, [auth, showDashboardView]);

  const changeOwnPassword = React.useCallback(
    async (currentPassword: string, newOwnPassword: string) => {
      await action.run(
        async () => {
          const user = await auth.api.changeOwnPassword(currentPassword, newOwnPassword);
          auth.setAuthUser(user);
          await admin.loadAuditLogs();
        },
        { rethrow: true },
      );
    },
    [action, admin, auth],
  );

  const createUser = React.useCallback(
    async (username: string, password: string, role: UserAccount["role"]) => {
      await action.run(() => admin.createUser(username, password, role), { rethrow: true });
    },
    [action, admin],
  );

  const updateUserAccount = React.useCallback(
    async (userId: number, payload: Partial<Pick<UserAccount, "role" | "is_active">>) => {
      await action.run(() => admin.updateUserAccount(userId, payload), { rethrow: true });
    },
    [action, admin],
  );

  const resetUserPassword = React.useCallback(
    async (userId: number, password: string) => {
      await action.run(() => admin.resetUserPassword(userId, password), { rethrow: true });
    },
    [action, admin],
  );

  const addMod = React.useCallback(
    async (modId: string, currentVersion: string | null) => {
      await action.run(
        async () => {
          await mods.addMod(modId.trim(), currentVersion);
          openModView();
          closeAddModDialog();
        },
        { rethrow: true },
      );
    },
    [action, closeAddModDialog, mods, openModView],
  );

  const refreshMod = React.useCallback(async (id: string) => {
    await action.run(() => mods.refreshMod(id));
  }, [action, mods]);

  const removeMod = React.useCallback(async (id: string) => {
    await action.run(() => mods.removeMod(id));
  }, [action, mods]);

  const updateInstalledVersion = React.useCallback(async (nextVersion?: string) => {
    await action.run(() => mods.updateInstalledVersion(nextVersion));
  }, [action, mods]);

  return {
    loading: action.loading,
    error: action.error,
    setError: action.setError,
    login,
    logout,
    changeOwnPassword,
    createUser,
    updateUserAccount,
    resetUserPassword,
    addMod,
    refreshMod,
    removeMod,
    updateInstalledVersion,
  };
}
