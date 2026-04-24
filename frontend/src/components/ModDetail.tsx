import React from "react";
import { ChevronDown, ChevronRight, ExternalLink, RefreshCw, Save, Trash2, CheckCircle2 } from "lucide-react";

import { dependencyKey, formatDate, UNKNOWN_VALUE } from "../lib/utils";
import type { ChangelogEntry, Dependency, Mod } from "../types";
import { Dialog, Info, StatusIcon, statusLabel } from "./common";

export function ModDetail({
  selected,
  loading,
  saveState,
  installedVersionEdit,
  setInstalledVersionEdit,
  refreshMod,
  removeMod,
  updateInstalledVersion,
  changelogEntries,
  expandedChangelogVersions,
  toggleChangelogVersion,
  trackedDependencyMatches,
  openMod,
}: {
  selected: Mod;
  loading: boolean;
  saveState: "idle" | "saved";
  installedVersionEdit: string;
  setInstalledVersionEdit: (value: string) => void;
  refreshMod: (id: string) => void;
  removeMod: (id: string) => void;
  updateInstalledVersion: (nextVersion?: string) => void;
  changelogEntries: ChangelogEntry[];
  expandedChangelogVersions: Set<string>;
  toggleChangelogVersion: (version: string) => void;
  trackedDependencyMatches: Map<string, Mod | null>;
  openMod: (id: string) => void;
}) {
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);

  return (
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
          <button className="icon-button danger" onClick={() => setShowDeleteDialog(true)} disabled={loading} title="Remove mod">
            <Trash2 size={18} />
          </button>
        </div>
      </header>

      {showDeleteDialog && (
        <Dialog title="Delete mod" onClose={() => setShowDeleteDialog(false)}>
          <div className="dialog-form">
            <p className="muted">
              Delete <strong>{selected.name ?? selected.id}</strong> from this modset?
            </p>
            <div className="dialog-actions">
              <button className="secondary-button compact" onClick={() => setShowDeleteDialog(false)} type="button">
                Cancel
              </button>
              <button
                className="secondary-button compact danger-button"
                disabled={loading}
                onClick={() => {
                  setShowDeleteDialog(false);
                  removeMod(selected.id);
                }}
                type="button"
              >
                Delete
              </button>
            </div>
          </div>
        </Dialog>
      )}

      <div className={`status-band ${selected.status.toLowerCase()}`}>
        <StatusIcon status={selected.status} noInstalledVersion={!selected.current_version} />
        <strong>{statusLabel(selected.status)}</strong>
        <span>
          Installed {selected.current_version ?? UNKNOWN_VALUE} · Latest {selected.latest_version ?? UNKNOWN_VALUE}
        </span>
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
          <button className="secondary-button compact" disabled={loading} onClick={() => updateInstalledVersion(selected.latest_version ?? "")} type="button">
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
      </div>

      {selected.summary && <p className="summary">{selected.summary}</p>}

      <section className="content-section">
        <h3>Dependencies</h3>
        {selected.dependencies.length > 0 ? (
          <div className="chips">
            {selected.dependencies.map((dependency) => {
              const trackedDependency = trackedDependencyMatches.get(dependencyKey(dependency));
              return trackedDependency ? (
                <button key={dependencyKey(dependency)} onClick={() => openMod(trackedDependency.id)} type="button">
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
              <button key={dependent.id} onClick={() => openMod(dependent.id)} type="button">
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
              <ChangelogItem
                key={entry.version}
                entry={entry}
                expanded={expandedChangelogVersions.has(entry.version)}
                toggleChangelogVersion={toggleChangelogVersion}
              />
            ))}
          </div>
        ) : (
          <p className="muted">No changelog stored.</p>
        )}
      </section>
    </>
  );
}

function ChangelogItem({
  entry,
  expanded,
  toggleChangelogVersion,
}: {
  entry: ChangelogEntry;
  expanded: boolean;
  toggleChangelogVersion: (version: string) => void;
}) {
  return (
    <article className="changelog-entry">
      <button className="changelog-toggle" onClick={() => toggleChangelogVersion(entry.version)} type="button">
        {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        <span className="changelog-heading">
          <strong>{entry.version}</strong>
          <small>Last modified {formatDate(entry.lastModifiedAt) ?? UNKNOWN_VALUE}</small>
        </span>
      </button>
      {expanded &&
        (entry.lines.length > 0 ? (
          <div className="changelog-lines">
            {entry.lines.map((line, index) => (
              <p className={line.endsWith(":") ? "changelog-label" : ""} key={`${entry.version}-${index}`}>
                {line}
              </p>
            ))}
          </div>
        ) : (
          <p className="muted">No notes for this version.</p>
        ))}
    </article>
  );
}
