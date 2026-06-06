import React from "react";

import type { DiscordWebhook, ModsetExport, ThemePreference, UserAccount } from "../types";
import { useAsyncAction } from "./useAsyncAction";

export function useAppActions({
  auth,
  admin,
  mods,
  modsets,
  closeAddModDialog,
  openModView,
  showDashboardView,
}: {
  auth: {
    api: {
      changeOwnPassword: (currentPassword: string, newPassword: string) => Promise<unknown>;
      updateThemePreference: (themePreference: ThemePreference) => Promise<unknown>;
    };
    login: (username: string, password: string) => Promise<unknown>;
    logout: () => Promise<void>;
    setAuthChecked: (value: boolean) => void;
    setAuthUser: (value: any) => void;
    setLoginError: (value: string | null) => void;
  };
  admin: {
    createUser: (username: string, password: string, role: UserAccount["role"]) => Promise<unknown>;
    createDiscordWebhook: (payload: { name: string; webhook_url: string; is_active: boolean; modset_ids?: number[] }) => Promise<DiscordWebhook>;
    updateDiscordWebhook: (webhookId: number, payload: { name?: string; webhook_url?: string; is_active?: boolean; modset_ids?: number[] }) => Promise<DiscordWebhook>;
    deleteDiscordWebhook: (webhookId: number) => Promise<void>;
    testDiscordWebhook: (webhookId: number) => Promise<{ sent: boolean }>;
    updateUserAccount: (userId: number, payload: Partial<Pick<UserAccount, "role" | "is_active">>) => Promise<unknown>;
    deleteUser: (userId: number) => Promise<void>;
    resetUserPassword: (userId: number, password: string) => Promise<void>;
    loadAuditLogs: () => Promise<unknown>;
  };
  mods: {
    addMod: (modId: string, currentVersion: string | null, modsetId?: number) => Promise<unknown>;
    refreshMod: (id: string) => Promise<unknown>;
    removeMod: (id: string, options?: { deactivateOrphanDependencies?: boolean }) => Promise<unknown>;
    updateInstalledVersion: (nextVersion?: string, options?: { deactivateOrphanDependencies?: boolean }) => Promise<unknown>;
  };
  modsets: {
    activateModset: (modsetId: number) => Promise<unknown>;
    createModset: (name: string, shared?: boolean) => Promise<unknown>;
    updateModset: (modsetId: number, name: string, shared?: boolean) => Promise<unknown>;
    duplicateModset: (modsetId: number) => Promise<unknown>;
    deleteModset: (modsetId: number) => Promise<unknown>;
    exportModset: (modsetId: number) => Promise<ModsetExport>;
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
          await auth.api.changeOwnPassword(currentPassword, newOwnPassword);
          auth.setAuthUser(null);
        },
        { rethrow: true },
      );
    },
    [action, admin, auth],
  );

  const updateThemePreference = React.useCallback(
    async (themePreference: ThemePreference) => {
      await action.run(
        async () => {
          const user = await auth.api.updateThemePreference(themePreference);
          auth.setAuthUser(user);
        },
        { rethrow: true },
      );
    },
    [action, auth],
  );

  const createUser = React.useCallback(
    async (username: string, password: string, role: UserAccount["role"]) => {
      await action.run(() => admin.createUser(username, password, role), { rethrow: true });
    },
    [action, admin],
  );

  const createDiscordWebhook = React.useCallback(
    async (payload: { name: string; webhook_url: string; is_active: boolean; modset_ids?: number[] }) => {
      await action.run(() => admin.createDiscordWebhook(payload), { rethrow: true });
    },
    [action, admin],
  );

  const updateUserAccount = React.useCallback(
    async (userId: number, payload: Partial<Pick<UserAccount, "role" | "is_active">>) => {
      await action.run(() => admin.updateUserAccount(userId, payload), { rethrow: true });
    },
    [action, admin],
  );

  const updateDiscordWebhook = React.useCallback(
    async (webhookId: number, payload: { name?: string; webhook_url?: string; is_active?: boolean; modset_ids?: number[] }) => {
      await action.run(() => admin.updateDiscordWebhook(webhookId, payload), { rethrow: true });
    },
    [action, admin],
  );

  const resetUserPassword = React.useCallback(
    async (userId: number, password: string) => {
      await action.run(() => admin.resetUserPassword(userId, password), { rethrow: true });
    },
    [action, admin],
  );

  const deleteUser = React.useCallback(
    async (userId: number) => {
      await action.run(() => admin.deleteUser(userId), { rethrow: true });
    },
    [action, admin],
  );

  const deleteDiscordWebhook = React.useCallback(
    async (webhookId: number) => {
      await action.run(() => admin.deleteDiscordWebhook(webhookId), { rethrow: true });
    },
    [action, admin],
  );

  const testDiscordWebhook = React.useCallback(
    async (webhookId: number) => {
      await action.run(() => admin.testDiscordWebhook(webhookId), { rethrow: true });
    },
    [action, admin],
  );

  const addMod = React.useCallback(
    async (modId: string, currentVersion: string | null, modsetId: number) => {
      await action.run(
        async () => {
          await mods.addMod(modId.trim(), currentVersion, modsetId);
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

  const removeMod = React.useCallback(async (id: string, options?: { deactivateOrphanDependencies?: boolean }) => {
    await action.run(() => mods.removeMod(id, options));
  }, [action, mods]);

  const updateInstalledVersion = React.useCallback(async (nextVersion?: string, options?: { deactivateOrphanDependencies?: boolean }) => {
    await action.run(() => mods.updateInstalledVersion(nextVersion, options));
  }, [action, mods]);

  const activateModset = React.useCallback(async (modsetId: number) => {
    await action.run(() => modsets.activateModset(modsetId), { rethrow: true });
  }, [action, modsets]);

  const createModset = React.useCallback(async (name: string, shared = false) => {
    await action.run(() => modsets.createModset(name, shared), { rethrow: true });
  }, [action, modsets]);

  const updateModset = React.useCallback(async (modsetId: number, name: string, shared?: boolean) => {
    await action.run(() => modsets.updateModset(modsetId, name, shared), { rethrow: true });
  }, [action, modsets]);

  const deleteModset = React.useCallback(async (modsetId: number) => {
    await action.run(() => modsets.deleteModset(modsetId), { rethrow: true });
  }, [action, modsets]);

  const duplicateModset = React.useCallback(async (modsetId: number) => {
    await action.run(() => modsets.duplicateModset(modsetId), { rethrow: true });
  }, [action, modsets]);

  const exportModset = React.useCallback(
    async (modsetId: number, modsetName: string) => {
      await action.run(
        async () => {
          const payload = await modsets.exportModset(modsetId);
          const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          const safeName = modsetName
            .trim()
            .replace(/[^a-zA-Z0-9._-]+/g, "_")
            .replace(/^_+|_+$/g, "")
            .toLowerCase();
          anchor.href = url;
          anchor.download = `${safeName || `modset-${modsetId}`}-mods.json`;
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          URL.revokeObjectURL(url);
        },
        { rethrow: true },
      );
    },
    [action, modsets],
  );

  return {
    loading: action.loading,
    error: action.error,
    setError: action.setError,
    login,
    logout,
    changeOwnPassword,
    updateThemePreference,
    createUser,
    createDiscordWebhook,
    updateUserAccount,
    updateDiscordWebhook,
    deleteUser,
    resetUserPassword,
    deleteDiscordWebhook,
    testDiscordWebhook,
    addMod,
    refreshMod,
    removeMod,
    updateInstalledVersion,
    activateModset,
    createModset,
    updateModset,
    duplicateModset,
    deleteModset,
    exportModset,
  };
}
