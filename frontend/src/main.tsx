import React from "react";
import ReactDOM from "react-dom/client";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  LogOut,
  Pin,
  Plus,
  RefreshCw,
  Save,
  Shield,
  Trash2,
  TriangleAlert,
  Users,
} from "lucide-react";
import "./styles.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
const UNKNOWN_VALUE = "unknown";

type ModStatus = "UNKNOWN" | "UP_TO_DATE" | "UPDATE_AVAILABLE";
type SortMode = "name" | "status" | "last_checked" | "updates";
type TrackingReason = "manual" | "dependency";
type UserRole = "admin" | "user";

type AuthUser = {
  id: number;
  username: string;
  role: UserRole;
};

type UserAccount = AuthUser & {
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
};

type ModVersion = {
  id: number;
  version: string;
  changelog: string | null;
  published_at: string | null;
  created_at: string;
};

type Dependency = {
  name: string;
  url: string | null;
};

type ModReference = {
  id: string;
  name: string | null;
  source_url: string | null;
};

type Mod = {
  id: string;
  name: string | null;
  summary: string | null;
  description: string | null;
  latest_version: string | null;
  game_version: string | null;
  size: string | null;
  dependencies: Dependency[];
  dependents: ModReference[];
  source_url: string | null;
  last_checked: string | null;
  current_version: string | null;
  pinned: boolean;
  tracking_reason: TrackingReason;
  status: ModStatus;
  versions: ModVersion[];
};

type ChangelogEntry = {
  version: string;
  lines: string[];
};

function App() {
  const detailRef = React.useRef<HTMLElement | null>(null);
  const [authChecked, setAuthChecked] = React.useState(false);
  const [authUser, setAuthUser] = React.useState<AuthUser | null>(null);
  const [loginUsername, setLoginUsername] = React.useState("");
  const [loginPassword, setLoginPassword] = React.useState("");
  const [loginError, setLoginError] = React.useState<string | null>(null);
  const [users, setUsers] = React.useState<UserAccount[]>([]);
  const [showUserAdmin, setShowUserAdmin] = React.useState(false);
  const [newUsername, setNewUsername] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [newRole, setNewRole] = React.useState<UserRole>("user");
  const [mods, setMods] = React.useState<Mod[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [modId, setModId] = React.useState("");
  const [currentVersion, setCurrentVersion] = React.useState("");
  const [installedVersionEdit, setInstalledVersionEdit] = React.useState("");
  const [expandedChangelogVersions, setExpandedChangelogVersions] = React.useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = React.useState<SortMode>("updates");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [saveState, setSaveState] = React.useState<"idle" | "saved">("idle");
  const [error, setError] = React.useState<string | null>(null);

  const visibleMods = React.useMemo(() => filterMods(mods, searchQuery), [mods, searchQuery]);
  const sortedMods = React.useMemo(() => sortMods(visibleMods, sortMode), [visibleMods, sortMode]);
  const selected = sortedMods.find((mod) => mod.id === selectedId) ?? sortedMods[0] ?? null;
  const changelogEntries = parseChangelog(selected?.versions[0]?.changelog ?? null);
  const trackedDependencyMatches = React.useMemo(
    () => new Map((selected?.dependencies ?? []).map((dependency) => [dependencyKey(dependency), findTrackedDependency(dependency, mods)])),
    [mods, selected?.dependencies],
  );

  React.useEffect(() => {
    checkSession().catch((err: Error) => {
      setLoginError(err.message);
      setAuthChecked(true);
    });
  }, []);

  React.useEffect(() => {
    if (!authUser) return;
    loadMods().catch((err: Error) => setError(err.message));
  }, [authUser?.id]);

  React.useEffect(() => {
    if (authUser?.role !== "admin") return;
    loadUsers().catch((err: Error) => setError(err.message));
  }, [authUser?.id, authUser?.role]);

  React.useEffect(() => {
    setInstalledVersionEdit(selected?.current_version ?? "");
  }, [selected?.id, selected?.current_version]);

  React.useEffect(() => {
    setSaveState("idle");
  }, [selected?.id]);

  React.useEffect(() => {
    setExpandedChangelogVersions(changelogEntries[0] ? new Set([changelogEntries[0].version]) : new Set());
  }, [selected?.id, selected?.versions[0]?.changelog]);

  React.useEffect(() => {
    detailRef.current?.scrollTo({ top: 0 });
  }, [selected?.id, showUserAdmin]);

  async function apiFetch(path: string, options: RequestInit = {}) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      credentials: "include",
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });

    if (response.status === 401) {
      setAuthUser(null);
      setMods([]);
      setShowUserAdmin(false);
    }
    return response;
  }

  async function checkSession() {
    const response = await fetch(`${API_BASE_URL}/auth/me`, { credentials: "include" });
    if (response.ok) {
      setAuthUser((await response.json()) as AuthUser);
    }
    setAuthChecked(true);
  }

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setLoginError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginUsername.trim(), password: loginPassword }),
      });
      if (!response.ok) throw new Error("Login failed.");
      const user = (await response.json()) as AuthUser;
      setAuthUser(user);
      setLoginPassword("");
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setLoading(false);
      setAuthChecked(true);
    }
  }

  async function logout() {
    await apiFetch("/auth/logout", { method: "POST" }).catch(() => null);
    setAuthUser(null);
    setMods([]);
    setUsers([]);
    setShowUserAdmin(false);
  }

  async function loadMods() {
    setError(null);
    const response = await apiFetch("/mods");
    if (!response.ok) throw new Error("Could not load mod list.");
    const data = (await response.json()) as Mod[];
    setMods(data);
    if (!selectedId && data.length > 0) setSelectedId(data[0].id);
  }

  async function loadUsers() {
    const response = await apiFetch("/users");
    if (!response.ok) throw new Error("Could not load users.");
    setUsers((await response.json()) as UserAccount[]);
  }

  async function addUser(event: React.FormEvent) {
    event.preventDefault();
    if (!newUsername.trim() || !newPassword) return;

    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch("/users", {
        method: "POST",
        body: JSON.stringify({ username: newUsername.trim(), password: newPassword, role: newRole }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail ?? "Could not create user.");
      }
      setNewUsername("");
      setNewPassword("");
      setNewRole("user");
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setLoading(false);
    }
  }

  async function updateUserAccount(userId: number, payload: Partial<Pick<UserAccount, "role" | "is_active">>) {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch(`/users/${userId}`, { method: "PATCH", body: JSON.stringify(payload) });
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        throw new Error(errorPayload?.detail ?? "Could not update user.");
      }
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setLoading(false);
    }
  }

  async function addMod(event: React.FormEvent) {
    event.preventDefault();
    if (!modId.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch("/mods", {
        method: "POST",
        body: JSON.stringify({ id: modId.trim(), current_version: currentVersion.trim() || null }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail ?? "Could not add mod.");
      }
      const created = (await response.json()) as Mod;
      await loadMods();
      setSelectedId(created.id);
      setShowUserAdmin(false);
      setModId("");
      setCurrentVersion("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshMod(id: string) {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch(`/mods/${id}/refresh`, { method: "POST" });
      if (!response.ok) throw new Error("Refresh failed.");
      await loadMods();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setLoading(false);
    }
  }

  async function removeMod(id: string) {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch(`/mods/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not delete mod.");
      setSelectedId(null);
      await loadMods();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setLoading(false);
    }
  }

  async function updateInstalledVersion(nextVersion = installedVersionEdit) {
    if (!selected) return;

    const normalizedVersion = nextVersion.trim();
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch(`/mods/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({ current_version: normalizedVersion || null }),
      });
      if (!response.ok) throw new Error("Could not update installed version.");
      const updated = (await response.json()) as Mod;
      await loadMods();
      setSelectedId(updated.id);
      setInstalledVersionEdit(updated.current_version ?? "");
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setLoading(false);
    }
  }

  function toggleChangelogVersion(version: string) {
    setExpandedChangelogVersions((previous) => {
      const next = new Set(previous);
      if (next.has(version)) {
        next.delete(version);
      } else {
        next.add(version);
      }
      return next;
    });
  }

  if (!authChecked) {
    return <AuthFrame title="Checking session" subtitle="Please wait." />;
  }

  if (!authUser) {
    return (
      <AuthFrame title="Arma Reforger Mod Manager" subtitle="Sign in to manage tracked Workshop mods.">
        <form className="login-form" onSubmit={login}>
          <label>
            Username
            <input value={loginUsername} onChange={(event) => setLoginUsername(event.target.value)} autoComplete="username" />
          </label>
          <label>
            Password
            <input value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} type="password" autoComplete="current-password" />
          </label>
          {loginError && <div className="error-box">{loginError}</div>}
          <button className="primary-button" disabled={loading || !loginUsername.trim() || !loginPassword}>
            <Shield size={18} />
            Sign in
          </button>
        </form>
      </AuthFrame>
    );
  }

  return (
    <main className="app-shell">
      <section className="sidebar" aria-label="Mod management">
        <div className="brand">
          <div>
            <p>Arma Reforger Mod Manager</p>
            <h1>Workshop Monitor</h1>
          </div>
          <div className="header-actions">
            {authUser.role === "admin" && (
              <button className="icon-button" onClick={() => setShowUserAdmin((value) => !value)} title="Users">
                <Users size={18} />
              </button>
            )}
            <button className="icon-button" onClick={() => loadMods().catch((err: Error) => setError(err.message))} title="Refresh list">
              <RefreshCw size={18} />
            </button>
            <button className="icon-button" onClick={logout} title={`Logout ${authUser.username}`}>
              <LogOut size={18} />
            </button>
          </div>
        </div>

        <form className="add-form" onSubmit={addMod}>
          <label>
            Workshop ID
            <input value={modId} onChange={(event) => setModId(event.target.value)} placeholder="672B195EAD3036D4" />
          </label>
          <label>
            Installed version
            <input value={currentVersion} onChange={(event) => setCurrentVersion(event.target.value)} placeholder="optional" />
          </label>
          <button className="primary-button" disabled={loading}>
            <Plus size={18} />
            Add mod
          </button>
        </form>

        {error && <div className="error-box">{error}</div>}

        <label className="sort-control">
          Sort by
          <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
            <option value="updates">Updates first</option>
            <option value="name">Name</option>
            <option value="status">Status</option>
            <option value="last_checked">Last checked</option>
          </select>
        </label>

        <label>
          Search
          <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Mod name or ID" />
        </label>

        <div className="mod-list">
          {sortedMods.map((mod) => (
            <button
              key={mod.id}
              className={`mod-row ${!showUserAdmin && selected?.id === mod.id ? "active" : ""}`}
              onClick={() => {
                setSelectedId(mod.id);
                setShowUserAdmin(false);
              }}
            >
              <StatusIcon status={mod.status} />
              <span>
                <strong>{mod.name ?? mod.id}</strong>
                <small>
                  {mod.current_version ?? "No installed version"} / {mod.latest_version ?? UNKNOWN_VALUE}
                  <span className="relation-count">{mod.dependencies.length} deps</span>
                  <span className="relation-count">{mod.dependents.length} req</span>
                  {mod.tracking_reason === "dependency" && <span className="tracking-badge">dep</span>}
                </small>
              </span>
              {mod.pinned && <Pin size={14} />}
            </button>
          ))}
          {mods.length === 0 && <p className="empty">No mods tracked yet.</p>}
          {mods.length > 0 && sortedMods.length === 0 && <p className="empty">No mods match your search.</p>}
        </div>
      </section>

      <section className="detail" aria-label="Mod Details" ref={detailRef}>
        {showUserAdmin && authUser.role === "admin" ? (
          <UserAdmin
            users={users}
            currentUser={authUser}
            loading={loading}
            newUsername={newUsername}
            newPassword={newPassword}
            newRole={newRole}
            setNewUsername={setNewUsername}
            setNewPassword={setNewPassword}
            setNewRole={setNewRole}
            addUser={addUser}
            updateUserAccount={updateUserAccount}
          />
        ) : selected ? (
          <>
            <header className="detail-header">
              <div>
                <p>{selected.id}</p>
                <h2>{selected.name ?? "Unnamed mod"}</h2>
              </div>
              <div className="actions">
                {selected.source_url && (
                  <a className="action-link" href={selected.source_url} target="_blank" rel="noreferrer">
                    <ExternalLink size={18} />
                    Workshop
                  </a>
                )}
                <button className="icon-button" onClick={() => refreshMod(selected.id)} disabled={loading} title="Refresh mod">
                  <RefreshCw size={18} />
                </button>
                <button className="icon-button danger" onClick={() => removeMod(selected.id)} disabled={loading} title="Remove mod">
                  <Trash2 size={18} />
                </button>
              </div>
            </header>

            <div className={`status-band ${selected.status.toLowerCase()}`}>
              <StatusIcon status={selected.status} />
              <strong>{statusLabel(selected.status)}</strong>
              <span>Installed {selected.current_version ?? UNKNOWN_VALUE} · Latest {selected.latest_version ?? UNKNOWN_VALUE}</span>
            </div>

            <div className="version-editor">
              <label>
                Installed version
                <input
                  value={installedVersionEdit}
                  onChange={(event) => setInstalledVersionEdit(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !loading && installedVersionEdit.trim() !== (selected.current_version ?? "")) {
                      event.preventDefault();
                      updateInstalledVersion();
                    }
                  }}
                  placeholder={selected.latest_version ?? "1.0.0"}
                />
              </label>
              <button
                className="primary-button compact"
                disabled={loading || installedVersionEdit.trim() === (selected.current_version ?? "")}
                onClick={() => updateInstalledVersion()}
                type="button"
              >
                <Save size={18} />
                Save
              </button>
              {selected.latest_version && selected.current_version !== selected.latest_version && (
                <button
                  className="secondary-button compact"
                  disabled={loading}
                  onClick={() => updateInstalledVersion(selected.latest_version ?? "")}
                  type="button"
                >
                  Set to latest
                </button>
              )}
            </div>

            {saveState === "saved" && (
              <div className="status-band save-band">
                <CheckCircle2 size={20} />
                <strong>Saved</strong>
                <span>Installed version updated.</span>
              </div>
            )}

            <div className="metrics">
              <Info label="Game Version" value={selected.game_version} />
              <Info label="Size" value={selected.size} />
              <Info label="Last checked" value={formatDate(selected.last_checked)} />
              <Info label="Latest version" value={selected.latest_version} />
              <Info label="Tracking" value={trackingReasonLabel(selected.tracking_reason)} />
            </div>

            {selected.summary && <p className="summary">{selected.summary}</p>}

            <section className="content-section">
              <h3>Dependencies</h3>
              {selected.dependencies.length > 0 ? (
                <div className="chips">
                  {selected.dependencies.map((dependency) => {
                    const trackedDependency = trackedDependencyMatches.get(dependencyKey(dependency));
                    return trackedDependency ? (
                      <button key={dependencyKey(dependency)} onClick={() => setSelectedId(trackedDependency.id)} type="button">
                        {dependency.name}
                      </button>
                    ) : (
                      <span key={dependencyKey(dependency)}>{dependency.name}</span>
                    );
                  })}
                </div>
              ) : (
                <p className="muted">No dependencies detected.</p>
              )}
            </section>

            <section className="content-section">
              <h3>Required by</h3>
              {selected.dependents.length > 0 ? (
                <div className="chips">
                  {selected.dependents.map((dependent) => (
                    <button key={dependent.id} onClick={() => setSelectedId(dependent.id)} type="button">
                      {dependent.name ?? dependent.id}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="muted">No tracked mods depend on this mod.</p>
              )}
            </section>

            <section className="content-section">
              <h3>Changelog</h3>
              {changelogEntries.length > 0 ? (
                <div className="changelog-list">
                  {changelogEntries.map((entry) => (
                    <article className="changelog-entry" key={entry.version}>
                      <button className="changelog-toggle" onClick={() => toggleChangelogVersion(entry.version)} type="button">
                        {expandedChangelogVersions.has(entry.version) ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                        <span>{entry.version}</span>
                      </button>
                      {expandedChangelogVersions.has(entry.version) && (
                        entry.lines.length > 0 ? (
                          <div className="changelog-lines">
                            {entry.lines.map((line, index) => (
                              <p className={line.endsWith(":") ? "changelog-label" : ""} key={`${entry.version}-${index}`}>
                                {line}
                              </p>
                            ))}
                          </div>
                        ) : (
                          <p className="muted">No notes for this version.</p>
                        )
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="muted">No changelog stored.</p>
              )}
            </section>
          </>
        ) : (
          <div className="placeholder">
            <h2>Add a mod</h2>
            <p>Enter a Workshop ID on the left to start the first fetch.</p>
          </div>
        )}
      </section>
    </main>
  );
}

function AuthFrame({ title, subtitle, children }: { title: string; subtitle: string; children?: React.ReactNode }) {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Shield size={30} />
        <p>Secure access</p>
        <h1>{title}</h1>
        <span>{subtitle}</span>
        {children}
      </section>
    </main>
  );
}

function UserAdmin({
  users,
  currentUser,
  loading,
  newUsername,
  newPassword,
  newRole,
  setNewUsername,
  setNewPassword,
  setNewRole,
  addUser,
  updateUserAccount,
}: {
  users: UserAccount[];
  currentUser: AuthUser;
  loading: boolean;
  newUsername: string;
  newPassword: string;
  newRole: UserRole;
  setNewUsername: (value: string) => void;
  setNewPassword: (value: string) => void;
  setNewRole: (value: UserRole) => void;
  addUser: (event: React.FormEvent) => void;
  updateUserAccount: (userId: number, payload: Partial<Pick<UserAccount, "role" | "is_active">>) => void;
}) {
  return (
    <>
      <header className="detail-header">
        <div>
          <p>Administration</p>
          <h2>Users</h2>
        </div>
      </header>

      <form className="user-form" onSubmit={addUser}>
        <label>
          Username
          <input value={newUsername} onChange={(event) => setNewUsername(event.target.value)} placeholder="admin.user" />
        </label>
        <label>
          Initial password
          <input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type="password" placeholder="at least 12 characters" />
        </label>
        <label className="sort-control">
          Role
          <select value={newRole} onChange={(event) => setNewRole(event.target.value as UserRole)}>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <button className="primary-button compact" disabled={loading || newPassword.length < 12 || !newUsername.trim()}>
          <Plus size={18} />
          Create user
        </button>
      </form>

      <div className="user-list">
        {users.map((user) => (
          <article className="user-row" key={user.id}>
            <div>
              <strong>{user.username}</strong>
              <small>
                {user.role} · {user.is_active ? "active" : "disabled"} · Last login {formatDate(user.last_login_at) ?? "never"}
              </small>
            </div>
            <select
              value={user.role}
              disabled={loading}
              onChange={(event) => updateUserAccount(user.id, { role: event.target.value as UserRole })}
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
            <button
              className="secondary-button compact"
              disabled={loading || user.id === currentUser.id}
              onClick={() => updateUserAccount(user.id, { is_active: !user.is_active })}
              type="button"
            >
              {user.is_active ? "Disable" : "Enable"}
            </button>
          </article>
        ))}
      </div>
    </>
  );
}

function StatusIcon({ status }: { status: ModStatus }) {
  if (status === "UPDATE_AVAILABLE") return <TriangleAlert className="status-icon warn" size={20} />;
  if (status === "UP_TO_DATE") return <CheckCircle2 className="status-icon ok" size={20} />;
  return <RefreshCw className="status-icon unknown" size={20} />;
}

function Info({ label, value, href }: { label: string; value: string | null; href?: string | null }) {
  return (
    <div className="info">
      <span>{label}</span>
      {href && value ? <a href={href} target="_blank" rel="noreferrer">{value}</a> : <strong>{value ?? UNKNOWN_VALUE}</strong>}
    </div>
  );
}

function statusLabel(status: ModStatus) {
  if (status === "UPDATE_AVAILABLE") return "Update available";
  if (status === "UP_TO_DATE") return "Up to date";
  return "Status unknown";
}

function trackingReasonLabel(reason: TrackingReason) {
  return reason === "dependency" ? "Dependency" : "Manual";
}

function formatDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function parseChangelog(value: string | null): ChangelogEntry[] {
  if (!value) return [];
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const entries: ChangelogEntry[] = [];

  for (const line of lines) {
    if (/^v?\d+(?:[._-]\d+)+(?:[A-Za-z0-9._+-]*)?$/.test(line)) {
      entries.push({ version: line, lines: [] });
      continue;
    }

    if (entries.length === 0) {
      entries.push({ version: "Notes", lines: [] });
    }
    entries[entries.length - 1].lines.push(line);
  }

  return entries;
}

function sortMods(mods: Mod[], sortMode: SortMode): Mod[] {
  const statusRank: Record<ModStatus, number> = {
    UPDATE_AVAILABLE: 0,
    UNKNOWN: 1,
    UP_TO_DATE: 2,
  };

  return [...mods].sort((left, right) => {
    if (sortMode === "updates") {
      return statusRank[left.status] - statusRank[right.status] || compareByName(left, right);
    }

    if (sortMode === "status") {
      return statusRank[left.status] - statusRank[right.status] || compareByName(left, right);
    }

    if (sortMode === "last_checked") {
      return timestamp(right.last_checked) - timestamp(left.last_checked) || compareByName(left, right);
    }

    return compareByName(left, right);
  });
}

function filterMods(mods: Mod[], searchQuery: string): Mod[] {
  const query = searchQuery.trim().toLowerCase();
  if (!query) return mods;

  return mods.filter((mod) => {
    return [mod.name, mod.id].filter(Boolean).join(" ").toLowerCase().includes(query);
  });
}

function compareByName(left: Mod, right: Mod): number {
  const leftName = left.name ?? left.id;
  const rightName = right.name ?? right.id;
  return leftName.localeCompare(rightName, undefined, { numeric: true, sensitivity: "base" }) || left.id.localeCompare(right.id);
}

function timestamp(value: string | null): number {
  return value ? new Date(value).getTime() || 0 : 0;
}

function findTrackedDependency(dependency: Dependency, mods: Mod[]): Mod | null {
  return mods.find((mod) => dependencyMatchesMod(dependency, mod)) ?? null;
}

function dependencyMatchesMod(dependency: Dependency, mod: Mod): boolean {
  const modId = normalizeMatchValue(mod.id);
  const modName = normalizeMatchValue(mod.name);
  const dependencyName = normalizeMatchValue(dependency.name);
  const dependencyUrl = normalizeMatchValue(dependency.url);

  return Boolean(dependencyUrl && modId && dependencyUrl.includes(modId)) || dependencyName === modId || Boolean(modName && dependencyName === modName);
}

function dependencyKey(dependency: Dependency): string {
  return `${dependency.name}-${dependency.url ?? ""}`;
}

function normalizeMatchValue(value: string | null): string {
  if (!value) return "";
  return value.toLowerCase().trim().replace(/\s+/g, " ");
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
