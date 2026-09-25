import React from "react";
import { Activity, BarChart3, CheckCircle2, Clock, History, TriangleAlert } from "lucide-react";

import { formatDate, formatScheduleTime, getDashboardStats, modsetActivitySummary, modsetActivityTitle, UNKNOWN_VALUE } from "../lib/utils";
import type { Mod, ModsetActivity, SchedulerStatus } from "../types";
import { Info, StatusIcon } from "./common";
import { ExportOrderSection } from "./ExportOrderSection";

export function Dashboard({
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
  updateModLoadOrder,
  updateModsetLoadOrder,
}: {
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
  updateModLoadOrder: (modId: string, loadOrder: number) => Promise<void>;
  updateModsetLoadOrder: (entries: { mod_id: string; load_order: number }[]) => Promise<void>;
}) {
  const stats = React.useMemo(() => getDashboardStats(mods), [mods]);
  const trackedModIds = React.useMemo(() => new Set(mods.map((mod) => mod.id)), [mods]);

  return (
    <>
      <header className="dashboard-hero">
        <div>
          <h2>{`Overview - ${activeModsetName}`}</h2>
        </div>
      </header>

      <div className="dashboard-stats">
        <Info label="Tracked mods" value={String(stats.total)} />
        <Info label="Dependency links" value={String(stats.dependencyLinks)} />
        <Info
          label="Auto schedule"
          value={
            schedulerStatus
              ? `${schedulerStatus.automatic_run_times.map(formatScheduleTime).join(" / ")} (${schedulerStatus.scheduler_timezone})`
              : null
          }
        />
      </div>

      <section className="dashboard-card version-health-card">
        <div className="section-title-row">
          <h3>Version health</h3>
          <BarChart3 size={20} />
        </div>
        <div className="health-summary-grid">
          <HealthSummary label="Up to date" value={stats.upToDate} total={stats.total} tone="ok" />
          <HealthSummary label="Update available" value={stats.updateAvailable} total={stats.total} tone="warn" />
          <HealthSummary label="No installed version" value={stats.notInstalled} total={stats.total} tone="neutral" />
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
            <p className="muted">No updates or missing installed versions detected.</p>
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

      <ExportOrderSection
        activeModsetName={activeModsetName}
        mods={mods}
        loading={loading}
        error={error}
        updateModLoadOrder={updateModLoadOrder}
        updateModsetLoadOrder={updateModsetLoadOrder}
      />

      <section className="dashboard-card activity-card">
        <div className="section-title-row">
          <h3>Recent modset changes</h3>
          <History size={20} />
        </div>
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
          <p className="muted">No recent mod changes recorded for this modset.</p>
        )}
        <div className="list-pagination">
          <span className="muted">{`Page ${modsetActivityPage + 1}`}</span>
          <div className="dialog-actions">
            <button className="secondary-button compact" disabled={!canPageBackModsetActivity} onClick={previousModsetActivityPage} type="button">
              Previous
            </button>
            <button className="secondary-button compact" disabled={!canPageForwardModsetActivity} onClick={nextModsetActivityPage} type="button">
              Next
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

function HealthSummary({ label, value, total, tone }: { label: string; value: number; total: number; tone: "ok" | "warn" | "neutral" }) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;

  return (
    <div className={`health-summary ${tone}`}>
      <div className="health-summary-header">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="health-track">
        <span className={`health-fill ${tone}`} style={{ width: `${percent}%` }} />
      </div>
      <small>{percent}% of tracked mods</small>
    </div>
  );
}
