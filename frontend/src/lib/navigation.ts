export type AppRoute = {
  view: "workspace" | "modsets" | "admin" | "account";
  section: "users" | "groups" | "discord" | "audit";
  modsetId: number | null;
  modId: string | null;
  invalid: boolean;
};

export function readRoute(search: string): AppRoute {
  const params = new URLSearchParams(search);
  const view = params.get("view") ?? "workspace";
  const section = params.get("section") ?? "users";
  const rawId = params.get("modset");
  const id = rawId === null ? null : Number(rawId);
  const validId = id !== null && Number.isSafeInteger(id) && id > 0;
  const validView = ["workspace", "modsets", "admin", "account"].includes(view);
  const validSection = ["users", "groups", "discord", "audit"].includes(section);
  return {
    view: validView ? view as AppRoute["view"] : "workspace",
    section: validSection ? section as AppRoute["section"] : "users",
    modsetId: validId ? id : null,
    modId: params.get("mod")?.trim() || null,
    invalid: !validView || (view === "admin" && !validSection) || (rawId !== null && !validId),
  };
}

export function routeUrl(route: AppRoute): string {
  const url = new URL(window.location.href);
  for (const key of ["view", "section", "modset", "mod"]) url.searchParams.delete(key);
  if (route.view !== "workspace") url.searchParams.set("view", route.view);
  if (route.view === "admin") url.searchParams.set("section", route.section);
  if (route.modsetId) url.searchParams.set("modset", String(route.modsetId));
  if (route.view === "workspace" && route.modId) url.searchParams.set("mod", route.modId);
  return url.pathname + url.search + url.hash;
}

const loginDestinationKey = "armm.loginDestination";
export function rememberLoginDestination() {
  try {
    sessionStorage.setItem(loginDestinationKey, JSON.stringify({ search: window.location.search, time: Date.now() }));
  } catch { /* Navigation still works when browser storage is unavailable. */ }
}

export function initialRoute(): AppRoute {
  try {
    const saved = JSON.parse(sessionStorage.getItem(loginDestinationKey) ?? "null");
    sessionStorage.removeItem(loginDestinationKey);
    if (!window.location.search && saved && typeof saved.search === "string" && saved.search.startsWith("?")
      && Date.now() - saved.time >= 0 && Date.now() - saved.time < 15 * 60 * 1000) {
      const route = readRoute(saved.search);
      if (!route.invalid) window.history.replaceState(null, "", routeUrl(route));
    }
  } catch { /* Ignore unavailable storage or expired/malformed destinations. */ }
  return readRoute(window.location.search);
}
