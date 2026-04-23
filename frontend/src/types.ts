export type ModStatus = "UNKNOWN" | "UP_TO_DATE" | "UPDATE_AVAILABLE";
export type SortMode = "name" | "status" | "last_checked" | "updates";
export type TrackingReason = "manual" | "dependency";
export type UserRole = "admin" | "user";
export type AuditFilter = "all" | "auth" | "user" | "mod" | "failures";

export type AuthUser = {
  id: number;
  username: string;
  role: UserRole;
  session_expires_at: string | null;
};

export type UserAccount = {
  id: number;
  username: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
};

export type AuditLog = {
  id: number;
  actor_username: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  detail: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

export type ModVersion = {
  id: number;
  version: string;
  changelog: string | null;
  published_at: string | null;
  last_modified_at: string | null;
  created_at: string;
};

export type Dependency = {
  name: string;
  url: string | null;
};

export type ModReference = {
  id: string;
  name: string | null;
  source_url: string | null;
};

export type Mod = {
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

export type ChangelogEntry = {
  version: string;
  lastModifiedAt: string | null;
  lines: string[];
};

export type SchedulerStatus = {
  scrape_interval_minutes: number;
  last_automatic_started_at: string | null;
  last_automatic_completed_at: string | null;
  next_automatic_run_at: string | null;
  last_refreshed: number | null;
  last_failed: Record<string, string> | null;
  last_error: string | null;
};
