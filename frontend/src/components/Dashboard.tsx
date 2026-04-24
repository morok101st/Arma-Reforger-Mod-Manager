import React from "react";
import { Activity, BarChart3, CheckCircle2, Clock, TriangleAlert } from "lucide-react";

import { formatDate, getDashboardStats, UNKNOWN_VALUE } from "../lib/utils";
import type { Mod, SchedulerStatus } from "../types";
import { Info, StatusIcon } from "./common";

export function Dashboard({
  mods,
  schedulerStatus,
  openMod,
}: {
  mods: Mod[];
  schedulerStatus: SchedulerStatus | null;
  openMod: (id: string) => void;
}) {
  const stats = React.useMemo(() => getDashboardStats(mods), [mods]);

  return (
    <>
      <header className="dashboard-hero">
        <div>
          <p>Overview</p>
          <h2>Dashboard</h2>
        </div>
      </header>

      <div className="dashboard-stats">
        <Info label="Tracked mods" value={String(stats.total)} />
        <Info label="Updates" value={String(stats.updateAvailable)} />
        <Info label="No installed version" value={String(stats.noInstalledVersion)} />
        <Info label="Dependency links" value={String(stats.dependencyLinks)} />
        <Info label="Last auto crawl" value={formatDate(schedulerStatus?.last_automatic_completed_at ?? null)} />
        <Info label="Next auto crawl" value={formatDate(schedulerStatus?.next_automatic_run_at ?? null)} />
      </div>

      <section className="dashboard-card version-health-card">
        <div className="section-title-row">
          <h3>Version health</h3>
          <BarChart3 size={20} />
        </div>
        <div className="health-bars responsive">
          <HealthBar label="Up to date" value={stats.upToDate} total={stats.total} tone="ok" />
          <HealthBar label="Update available" value={stats.updateAvailable} total={stats.total} tone="warn" />
          <HealthBar label="Unknown" value={stats.unknown} total={stats.total} tone="neutral" />
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
                  <StatusIcon status={mod.status} noInstalledVersion={!mod.current_version} />
                  <span>
                    <strong>{mod.name ?? mod.id}</strong>
                    <small>{mod.current_version ?? "No installed version"} / {mod.latest_version ?? UNKNOWN_VALUE}</small>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="muted">No update or unknown version state detected.</p>
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
    </>
  );
}

function HealthBar({ label, value, total, tone }: { label: string; value: number; total: number; tone: "ok" | "warn" | "neutral" }) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;

  return (
    <div className="health-bar">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="health-track">
        <span className={`health-fill ${tone}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
