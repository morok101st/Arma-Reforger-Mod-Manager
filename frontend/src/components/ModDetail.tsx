import React from "react";
import { ChevronDown, ChevronRight, ExternalLink, RefreshCw, Save, Trash2, CheckCircle2, TriangleAlert } from "lucide-react";

import { dependencyKey, dependencyTargetsMod, formatDate, UNKNOWN_VALUE } from "../lib/utils";
import type { ChangelogEntry, Dependency, Mod } from "../types";
import { CustomSelect, Dialog, Info, StatusIcon, statusLabel } from "./common";

export function ModDetail({
  selected,
  loading,
  saveState,
  installedVersionEdit,
  loadOrderEdit,
  setInstalledVersionEdit,
  setLoadOrderEdit,
  refreshMod,
  removeMod,
  updateInstalledVersion,
  updateLoadOrder,
  changelogEntries,
  expandedChangelogVersions,
  toggleChangelogVersion,
  trackedDependencyMatches,
  allTrackedMods,
  openMod,
}: {
  selected: Mod;
  loading: boolean;
  saveState: "idle" | "saved";
  installedVersionEdit: string;
  loadOrderEdit: string;
  setInstalledVersionEdit: (value: string) => void;
  setLoadOrderEdit: (value: string) => void;
  refreshMod: (id: string) => void;
  removeMod: (id: string, options?: { deactivateOrphanDependencies?: boolean }) => void;
  updateInstalledVersion: (nextVersion?: string, options?: { deactivateOrphanDependencies?: boolean }) => void;
  updateLoadOrder: () => void;
  changelogEntries: ChangelogEntry[];
  expandedChangelogVersions: Set<string>;
  toggleChangelogVersion: (version: string) => void;
  trackedDependencyMatches: Map<string, Mod | null>;
  allTrackedMods: Mod[];
  openMod: (id: string) => void;
}) {
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);
  const [showDeactivateDialog, setShowDeactivateDialog] = React.useState(false);
  const normalizedInstalledVersionEdit = installedVersionEdit.trim();
  const currentInstalledVersion = (selected.current_version ?? "").trim();
  const hasInstalledVersionChange = normalizedInstalledVersionEdit !== currentInstalledVersion;
  const normalizedLoadOrderEdit = Number.parseInt(loadOrderEdit.trim(), 10);
  const isLoadOrderValid = Number.isFinite(normalizedLoadOrderEdit) && normalizedLoadOrderEdit >= 0 && normalizedLoadOrderEdit <= 999999;
  const hasLoadOrderChange = isLoadOrderValid && normalizedLoadOrderEdit !== selected.load_order;
  const installedVersionOptions = React.useMemo(() => {
    const seen = new Set<string>();
    const versions: string[] = [];

    for (const version of selected.versions) {
      if (version.version && !seen.has(version.version)) {
        seen.add(version.version);
        versions.push(version.version);
      }
    }

    if (selected.latest_version && !seen.has(selected.latest_version)) {
      seen.add(selected.latest_version);
      versions.unshift(selected.latest_version);
    }

    if (selected.current_version && !seen.has(selected.current_version)) {
      seen.add(selected.current_version);
      versions.unshift(selected.current_version);
    }

    return [
      { value: "", label: "No installed version" },
      ...versions.map((version) => {
        const markers = [];
        if (version === selected.latest_version) markers.push("Latest");
        if (version === selected.current_version) markers.push("Installed");
        return {
          value: version,
          label: markers.length > 0 ? `${version} (${markers.join(", ")})` : version,
        };
      }),
    ];
  }, [selected.current_version, selected.latest_version, selected.versions]);
  const orphanedDependencyCandidates = React.useMemo(() => {
    const selectedDependencyIds = new Set(
      selected.dependencies
        .map((dependency) => trackedDependencyMatches.get(dependencyKey(dependency)))
        .filter((mod): mod is Mod => Boolean(mod))
        .filter((mod) => mod.dependency_origin)
        .map((mod) => mod.id),
    );
    if (selectedDependencyIds.size === 0) return [];

    return allTrackedMods.filter((mod) => {
      if (!selectedDependencyIds.has(mod.id)) return false;
      return !allTrackedMods.some((candidate) => {
        if (candidate.id === selected.id || candidate.id === mod.id || !candidate.current_version) return false;
        return candidate.dependencies.some((dependency) => dependencyTargetsMod(dependency, mod));
      });
    });
  }, [allTrackedMods, selected, trackedDependencyMatches]);
  const isSettingNoInstalledVersion = hasInstalledVersionChange && normalizedInstalledVersionEdit === "";

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
          <button
            className="icon-button danger"
            onClick={() => setShowDeleteDialog(true)}
            disabled={loading}
            title={selected.delete_blocked ? "This mod is required by another tracked mod and cannot be deleted." : "Remove mod"}
          >
            <Trash2 size={18} />
          </button>
        </div>
      </header>

      {showDeleteDialog && (
        <Dialog title="Delete mod" onClose={() => setShowDeleteDialog(false)}>
          <div className="dialog-form">
            {selected.delete_blocked ? (
              <>
                <div className="danger-callout">
                  <TriangleAlert className="status-icon warn" size={20} />
                  <div>
                    <strong>This mod is still required by other tracked mods.</strong>
                    <span>
                      <strong>{selected.name ?? selected.id}</strong> cannot be deleted while it is still required.
                    </span>
                    {selected.blocking_dependents.length > 0 && (
                      <span>Required by: {selected.blocking_dependents.map((mod) => mod.name ?? mod.id).join(", ")}</span>
                    )}
                  </div>
                </div>
                <div className="dialog-actions">
                  <button className="secondary-button compact" onClick={() => setShowDeleteDialog(false)} type="button">
                    Close
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="muted">
                  Delete <strong>{selected.name ?? selected.id}</strong> from this modset?
                </p>
                {orphanedDependencyCandidates.length > 0 && (
                  <div className="danger-callout">
                    <TriangleAlert className="status-icon warn" size={20} />
                    <div>
                      <strong>Dependency follow-up detected.</strong>
                      <span>
                        These dependency mods are no longer required by any other installed tracked mod after deleting{" "}
                        <strong>{selected.name ?? selected.id}</strong>.
                      </span>
                      <span>{orphanedDependencyCandidates.map((mod) => mod.name ?? mod.id).join(", ")}</span>
                    </div>
                  </div>
                )}
                <div className="dialog-actions">
                  <button className="secondary-button compact" onClick={() => setShowDeleteDialog(false)} type="button">
                    Cancel
                  </button>
                  {orphanedDependencyCandidates.length > 0 && (
                    <>
                      <button
                        className="secondary-button compact danger-button"
                        disabled={loading}
                        onClick={() => {
                          setShowDeleteDialog(false);
                          removeMod(selected.id, { deactivateOrphanDependencies: false });
                        }}
                        type="button"
                      >
                        No
                      </button>
                      <button
                        className="secondary-button compact danger-button"
                        disabled={loading}
                        onClick={() => {
                          setShowDeleteDialog(false);
                          removeMod(selected.id, { deactivateOrphanDependencies: true });
                        }}
                        type="button"
                      >
                        Yes
                      </button>
                    </>
                  )}
                  {orphanedDependencyCandidates.length === 0 && (
                    <button
                      className="secondary-button compact danger-button"
                      disabled={loading}
                      onClick={() => {
                        setShowDeleteDialog(false);
                        removeMod(selected.id, { deactivateOrphanDependencies: false });
                      }}
                      type="button"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </Dialog>
      )}

      {showDeactivateDialog && (
        <Dialog title="Dependency follow-up" onClose={() => setShowDeactivateDialog(false)}>
          <div className="dialog-form">
            {orphanedDependencyCandidates.length > 0 ? (
              <>
                <div className="danger-callout">
                  <TriangleAlert className="status-icon warn" size={20} />
                  <div>
                    <strong>Set dependent mods to No installed version as well?</strong>
                    <span>
                      These dependency mods are no longer required by any other installed tracked mod after changing{" "}
                      <strong>{selected.name ?? selected.id}</strong> to <strong>No installed version</strong>.
                    </span>
                    <span>{orphanedDependencyCandidates.map((mod) => mod.name ?? mod.id).join(", ")}</span>
                  </div>
                </div>
                <div className="dialog-actions">
                  <button className="secondary-button compact" onClick={() => setShowDeactivateDialog(false)} type="button">
                    Cancel
                  </button>
                  <button
                    className="secondary-button compact"
                    disabled={loading}
                    onClick={() => {
                      setShowDeactivateDialog(false);
                      updateInstalledVersion("", { deactivateOrphanDependencies: false });
                    }}
                    type="button"
                  >
                    No
                  </button>
                  <button
                    className="primary-button compact"
                    disabled={loading}
                    onClick={() => {
                      setShowDeactivateDialog(false);
                      updateInstalledVersion("", { deactivateOrphanDependencies: true });
                    }}
                    type="button"
                  >
                    Yes
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="muted">
                  Set <strong>{selected.name ?? selected.id}</strong> to <strong>No installed version</strong>?
                </p>
                <div className="dialog-actions">
                  <button className="secondary-button compact" onClick={() => setShowDeactivateDialog(false)} type="button">
                    Cancel
                  </button>
                  <button
                    className="primary-button compact"
                    disabled={loading}
                    onClick={() => {
                      setShowDeactivateDialog(false);
                      updateInstalledVersion("", { deactivateOrphanDependencies: false });
                    }}
                    type="button"
                  >
                    Confirm
                  </button>
                </div>
              </>
            )}
          </div>
        </Dialog>
      )}

      <div className={`status-band ${selected.status.toLowerCase()}`}>
        <StatusIcon status={selected.status} />
        <strong>{statusLabel(selected.status)}</strong>
        <span>
          {selected.status === "NOT_INSTALLED"
            ? `Latest ${selected.latest_version ?? UNKNOWN_VALUE}`
            : `Installed ${selected.current_version ?? UNKNOWN_VALUE} · Latest ${selected.latest_version ?? UNKNOWN_VALUE}`}
        </span>
      </div>

      <div className="version-editor">
        <label>
          Installed version
          <CustomSelect<string>
            value={installedVersionEdit}
            options={installedVersionOptions}
            onChange={setInstalledVersionEdit}
            disabled={loading}
            ariaLabel="Installed version"
          />
        </label>
        <button
          className="primary-button compact"
          disabled={loading || !hasInstalledVersionChange}
          onClick={() => {
            if (isSettingNoInstalledVersion) {
              setShowDeactivateDialog(true);
              return;
            }
            updateInstalledVersion();
          }}
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

      <div className="version-editor load-order-editor">
        <label>
          Export load order
          <input
            min={0}
            max={999999}
            type="number"
            value={loadOrderEdit}
            onChange={(event) => setLoadOrderEdit(event.target.value)}
            disabled={loading}
          />
        </label>
        <button
          className="primary-button compact"
          disabled={loading || !hasLoadOrderChange}
          onClick={() => updateLoadOrder()}
          type="button"
        >
          <Save size={18} />
          Save
        </button>
        <small className="muted load-order-hint">Lower values load earlier. Higher values load later. Default: 500.</small>
      </div>

      {saveState === "saved" && (
        <div className="status-band save-band">
          <CheckCircle2 size={20} />
          <strong>Saved</strong>
          <span>Mod settings updated.</span>
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
          <div className="changelog-lines">
            <p className="muted">No notes for this version.</p>
          </div>
        ))}
    </article>
  );
}
