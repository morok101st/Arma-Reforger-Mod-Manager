import React from "react";

import type { AuthUser } from "../types";
import { useApiClient } from "./useApiClient";

export function useAuth(onUnauthorized: () => void) {
  const [authChecked, setAuthChecked] = React.useState(false);
  const [authUser, setAuthUser] = React.useState<AuthUser | null>(null);
  const [loginError, setLoginError] = React.useState<string | null>(null);

  const resetSession = React.useCallback(() => {
    setAuthUser(null);
    onUnauthorized();
  }, [onUnauthorized]);

  const api = useApiClient(resetSession);

  React.useEffect(() => {
    api
      .checkSession()
      .then((user) => {
        setAuthUser(user);
        setAuthChecked(true);
      })
      .catch((err: Error) => {
        setLoginError(err.message);
        setAuthChecked(true);
      });
  }, [api]);

  React.useEffect(() => {
    document.documentElement.dataset.theme = authUser?.theme_preference ?? "light";
  }, [authUser?.theme_preference]);

  const login = React.useCallback(
    async (username: string, password: string) => {
      setLoginError(null);
      const user = await api.login(username, password);
      setAuthUser(user);
      setAuthChecked(true);
      return user;
    },
    [api],
  );

  const logout = React.useCallback(async () => {
    await api.logout().catch(() => null);
    resetSession();
  }, [api, resetSession]);

  return {
    api,
    authChecked,
    authUser,
    loginError,
    setAuthUser,
    setLoginError,
    setAuthChecked,
    login,
    logout,
    resetSession,
  };
}
