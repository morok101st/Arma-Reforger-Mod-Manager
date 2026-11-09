import React from "react";
import type { LoadState } from "../hooks/useLoadState";
import { ResourceStatus } from "./ResourceStatus";
import { Activity, BarChart3, CheckCircle2, ChevronDown, ChevronUp, Clock, TriangleAlert } from "lucide-react";

import { formatDate, formatScheduleTime, getDashboardStats, modsetActivitySummary, modsetActivityTitle, UNKNOWN_VALUE } from "../lib/utils";
import type { Mod, ModsetActivity, ModStatusFilter, SchedulerStatus } from "../types";
import { Info, StatusIcon } from "./common";
import { ExportOrderSection } from "./ExportOrderSection";

export function Dashboard({
  activityLoad,
  schedulerLoad,
  onFilterStatus,
  canEdit,
  mods,
  modsetActivity,
  schedulerStatus,
  openMod,
  activeModsetName,
  loading,
  error,
  modsetActivityPage,
  canPageBackModsetActivity,
  canPageForwardModsetActivity,
  previousModsetActivityPage,
  nextModsetActivityPage,
  updateExportOrder,
}: {
  activityLoad: LoadState;
  schedulerLoad: LoadState;
  onFilterStatus: (status: ModStatusFilter) => void;
  canEdit: boolean;
  mods: Mod[];
  modsetActivity: ModsetActivity[];
  schedulerStatus: SchedulerStatus | null;
  openMod: (id: string) => void;
  activeModsetName: string;
  loading: boolean;
  error: string | null;
  modsetActivityPage: number;
  canPageBackModsetActivity: boolean;
  canPageForwardModsetActivity: boolean;
  previousModsetActivityPage: () => void;
  nextModsetActivityPage: () => void;
  updateExportOrder: (modIds: string[]) => Promise<void>;
}) {
  const stats = React.useMemo(() => getDashboardStats(mods), [mods]);
  const trackedModIds = React.useMemo(() => new Set(mods.map((mod) => mod.id)), [mods]);
  const [isActivityExpanded, setIsActivityExpanded] = React.useState(false);
  const activityContentId = React.useId();

  return (
    <>
      <header className="dashboard-hero">
        <div>
          <h2>Overview</h2>
        </div>
      </header>

      <div className="dashboard-stats">
        <Info label="Tracked mods" value={String(stats.total)} />
        <Info label="Dependency links" value={String(stats.dependencyLinks)} />
        <Info
          label="Auto schedule"
          value={
            schedulerLoad.error ? "Unavailable" : !schedulerLoad.loaded ? "Loading…" : schedulerStatus
              ? `${schedulerStatus.automatic_run_times.map(formatScheduleTime).join(" / ")} (${schedulerStatus.scheduler_timezone})`
              : null
          }
        />
      </div>

      <ResourceStatus state={schedulerLoad} label="update schedule" />
      <section className="dashboard-card version-health-card">
        <div className="section-title-row">
          <h3>Version health</h3>
          <BarChart3 size={20} />
        </div>
        <div className="health-summary-grid">
          <HealthSummary onClick={() => onFilterStatus("UP_TO_DATE")} label="Up to date" value={stats.upToDate} total={stats.total} tone="ok" />
          <HealthSummary onClick={() => onFilterStatus("UPDATE_AVAILABLE")} label="Update available" value={stats.updateAvailable} total={stats.total} tone="warn" />
          <HealthSummary onClick={() => onFilterStatus("NOT_INSTALLED")} label="No installed version" value={stats.notInstalled} total={stats.total} tone="neutral" />
          <HealthSummary onClick={() => onFilterStatus("UNKNOWN")} label="No latest version" value={stats.unknown} total={stats.total} tone="unknown" />
        </div>
      </section>

      <div className="dashboard-grid">
        <section className={`dashboard-card priority-card ${stats.attentionMods.length === 0 ? "ok" : "warn"}`}>
          <div className="section-title-row">
            <h3>Needs attention</h3>
            {stats.attentionMods.length === 0 ? <CheckCircle2 className="status-icon ok" size={20} /> : <TriangleAlert className="status-icon warn" size={20} />}
          </div>
          {stats.attentionMods.length > 0 ? (
            <div className="compact-list">
              {stats.attentionMods.map((mod) => (
                <button key={mod.id} onClick={() => openMod(mod.id)} type="button">
                  <StatusIcon status={mod.status} />
                  <span>
                    <strong>{mod.name ?? mod.id}</strong>
                    <small>{mod.current_version ?? "No installed version"} / {mod.latest_version ?? UNKNOWN_VALUE}</small>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="muted">No updates or missing latest versions to review.</p>
          )}
        </section>

        <section className="dashboard-card">
          <div className="section-title-row">
            <h3>Recently checked</h3>
            <Clock size={20} />
          </div>
          {stats.recentlyChecked.length > 0 ? (
            <div className="compact-list">
              {stats.recentlyChecked.map((mod) => (
                <button key={mod.id} onClick={() => openMod(mod.id)} type="button">
                  <Activity size={20} />
                  <span>
                    <strong>{mod.name ?? mod.id}</strong>
                    <small>{formatDate(mod.last_checked)}</small>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="muted">No crawl timestamp stored yet.</p>
          )}
        </section>
      </div>

      {canEdit && <ExportOrderSection
        activeModsetName={activeModsetName}
        mods={mods}
        loading={loading}
        error={error}
        updateExportOrder={updateExportOrder}
      />}

      <section className="dashboard-card activity-card">
        <div className="section-title-row">
          <h3>Changelog</h3>
          <button
            aria-controls={activityContentId}
            aria-expanded={isActivityExpanded}
            className="secondary-button compact"
            onClick={() => setIsActivityExpanded((current) => !current)}
            type="button"
          >
            {isActivityExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            {isActivityExpanded ? "Collapse" : "Expand"}
          </button>
        </div>
        {isActivityExpanded && (
          <div id={activityContentId}>
            <ResourceStatus state={activityLoad} label="modset changelog" />
            {activityLoad.loaded && !activityLoad.error && <>
            {modsetActivity.length > 0 ? (
              <div className="compact-list activity-list">
                {modsetActivity.map((entry) => {
                  const canOpen = !!entry.entity_id && trackedModIds.has(entry.entity_id);
                  const content = (
                    <>
                      <Activity className="activity-entry-icon" size={18} />
                      <strong className="activity-entry-title">{modsetActivityTitle(entry)}</strong>
                      <small className="activity-entry-summary">{modsetActivitySummary(entry)}</small>
                      <time className="activity-entry-time" dateTime={entry.created_at}>{formatDate(entry.created_at)}</time>
                    </>
                  );

                  return canOpen ? (
                    <button key={entry.id} onClick={() => openMod(entry.entity_id!)} type="button">
                      {content}
                    </button>
                  ) : (
                    <div key={entry.id} className="compact-list-entry static">
                      {content}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="muted">No modset changes recorded.</p>
            )}
            <div className="list-pagination">
              <span className="muted">{`Page ${modsetActivityPage + 1}`}</span>
              <div className="dialog-actions">
                <button className="secondary-button compact" disabled={activityLoad.loading || !canPageBackModsetActivity} onClick={previousModsetActivityPage} type="button">
                  Previous
                </button>
                <button className="secondary-button compact" disabled={activityLoad.loading || !canPageForwardModsetActivity} onClick={nextModsetActivityPage} type="button">
                  Next
                </button>
              </div>
            </div>
            </>}
          </div>
        )}
      </section>
    </>
  );
}

function HealthSummary({ onClick, label, value, total, tone }: { onClick: () => void; label: string; value: number; total: number; tone: "ok" | "warn" | "neutral" | "unknown" }) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;

  return (
    <button type="button" onClick={onClick} className={`health-summary ${tone}`} aria-label={`Show ${label.toLowerCase()} mods: ${value}`}>
      <div className="health-summary-header">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="health-track">
        <span className={`health-fill ${tone}`} style={{ width: `${percent}%` }} />
      </div>
      <small>{percent}% of tracked mods</small>
    </button>
  );
}
