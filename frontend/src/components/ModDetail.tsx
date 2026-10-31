import React from "react";
import { ChevronDown, ChevronRight, Copy, ExternalLink, RefreshCw, Save, Trash2, CheckCircle2, TriangleAlert } from "lucide-react";

import { dependencyKey, dependencyTargetsMod, formatDate, UNKNOWN_VALUE } from "../lib/utils";
import type { ChangelogEntry, Dependency, Mod } from "../types";
import { CustomSelect, Dialog, StatusIcon, statusLabel } from "./common";

export function ModDetail({
  canEdit,
  selected,
  loading,
  refreshState,
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
  allTrackedMods,
  openMod,
}: {
  canEdit: boolean;
  selected: Mod;
  loading: boolean;
  refreshState: "idle" | "checking" | "completed";
  saveState: "idle" | "saved";
  installedVersionEdit: string;
  setInstalledVersionEdit: (value: string) => void;
  refreshMod: (id: string) => void;
  removeMod: (id: string, options?: { deactivateOrphanDependencies?: boolean }) => void;
  updateInstalledVersion: (nextVersion?: string, options?: { deactivateOrphanDependencies?: boolean }) => void;
  changelogEntries: ChangelogEntry[];
  expandedChangelogVersions: Set<string>;
  toggleChangelogVersion: (version: string) => void;
  trackedDependencyMatches: Map<string, Mod | null>;
  allTrackedMods: Mod[];
  openMod: (id: string) => void;
}) {
  const refreshing = refreshState === "checking";
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);
  const [showDeactivateDialog, setShowDeactivateDialog] = React.useState(false);
  const [idCopied, setIdCopied] = React.useState(false);
  const idCopyTimerRef = React.useRef<number | null>(null);
  const [copyError, setCopyError] = React.useState<string | null>(null);
  const [modJsonCopied, setModJsonCopied] = React.useState(false);
  const modJsonCopiedTimerRef = React.useRef<number | null>(null);
  const normalizedInstalledVersionEdit = installedVersionEdit.trim();
  const currentInstalledVersion = (selected.current_version ?? "").trim();
  const hasInstalledVersionChange = normalizedInstalledVersionEdit !== currentInstalledVersion;
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
  const canCopyModJson = Boolean(currentInstalledVersion);

  React.useEffect(() => {
    setIdCopied(false);
    return () => {
      if (idCopyTimerRef.current !== null) window.clearTimeout(idCopyTimerRef.current);
    };
  }, [selected.id]);

  async function copyWorkshopId() {
    setCopyError(null);
    await copyTextToClipboard(selected.id);
    setIdCopied(true);
    if (idCopyTimerRef.current !== null) window.clearTimeout(idCopyTimerRef.current);
    idCopyTimerRef.current = window.setTimeout(() => setIdCopied(false), 1500);
  }

  React.useEffect(() => {
    setModJsonCopied(false);
    setCopyError(null);
  }, [selected.id, selected.current_version]);

  React.useEffect(() => {
    return () => {
      if (modJsonCopiedTimerRef.current !== null) {
        window.clearTimeout(modJsonCopiedTimerRef.current);
      }
    };
  }, []);

  async function copyModJson() {
    if (!canCopyModJson) return;
    const modJson = JSON.stringify(
      {
        modId: selected.id,
        name: selected.name ?? selected.id,
        version: currentInstalledVersion,
      },
      null,
      2,
    );
    setCopyError(null);
    await copyTextToClipboard(modJson);
    setModJsonCopied(true);
    if (modJsonCopiedTimerRef.current !== null) {
      window.clearTimeout(modJsonCopiedTimerRef.current);
    }
    modJsonCopiedTimerRef.current = window.setTimeout(() => {
      setModJsonCopied(false);
      modJsonCopiedTimerRef.current = null;
    }, 1500);
  }

  return (
    <article className="mod-detail">
      <header className="mod-detail-header">
        <div>
          <h2>{selected.name ?? "Unnamed mod"}</h2>
          <div className="mod-identifier"><span>Workshop ID</span><code>{selected.id}</code>
            <button className="icon-button mod-id-copy" type="button" onClick={() => copyWorkshopId().catch(() => setCopyError("Could not copy Workshop ID. Check clipboard access and try again."))} aria-label="Copy Workshop ID" title={idCopied ? "Copied" : "Copy Workshop ID"}>
              {idCopied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
            </button><span className="mod-id-feedback" role="status">{idCopied ? "Copied" : ""}</span>
          </div>
          <dl className="mod-header-metadata" aria-label="Technical details">
            <div><dt>Game version</dt><dd>{selected.game_version ?? UNKNOWN_VALUE}</dd></div>
            <div><dt>Size</dt><dd>{selected.size ?? UNKNOWN_VALUE}</dd></div>
            <div><dt>Last checked</dt><dd>{formatDate(selected.last_checked) ?? UNKNOWN_VALUE}</dd></div>
          </dl>
        </div>
        <div className="actions">
          {selected.source_url && (
            <a className="action-link" href={selected.source_url} target="_blank" rel="noreferrer">
              <ExternalLink size={18} />
              Workshop
            </a>
          )}
          <button
            className="secondary-button compact"
            onClick={() => refreshMod(selected.id)}
            disabled={loading || refreshing || !canEdit}
            title={refreshing ? "Checking for updates" : "Refresh mod"}
            aria-label={refreshing ? "Checking mod for updates" : "Refresh mod"}
            aria-busy={refreshing}
          >
            <RefreshCw className={refreshing ? "refresh-spin" : undefined} size={18} />
            {refreshing ? "Checking…" : "Check updates"}
          </button>

          {canEdit && <button className="secondary-button compact danger-button mod-remove-action" type="button" onClick={() => setShowDeleteDialog(true)} disabled={loading} title={selected.delete_blocked ? "This mod is required by other tracked mods." : "Remove from this modset"}><Trash2 size={16} /> Remove mod</button>}

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
                        disabled={loading || !canEdit}
                        onClick={() => {
                          setShowDeleteDialog(false);
                          removeMod(selected.id, { deactivateOrphanDependencies: false });
                        }}
                        type="button"
                      >
                        Remove only this mod
                      </button>
                      <button
                        className="secondary-button compact danger-button"
                        disabled={loading || !canEdit}
                        onClick={() => {
                          setShowDeleteDialog(false);
                          removeMod(selected.id, { deactivateOrphanDependencies: true });
                        }}
                        type="button"
                      >
                        Remove and deactivate dependencies
                      </button>
                    </>
                  )}
                  {orphanedDependencyCandidates.length === 0 && (
                    <button
                      className="secondary-button compact danger-button"
                      disabled={loading || !canEdit}
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
                    disabled={loading || !canEdit}
                    onClick={() => {
                      setShowDeactivateDialog(false);
                      updateInstalledVersion("", { deactivateOrphanDependencies: false });
                    }}
                    type="button"
                  >
                    Keep dependencies installed
                  </button>
                  <button
                    className="primary-button compact"
                    disabled={loading || !canEdit}
                    onClick={() => {
                      setShowDeactivateDialog(false);
                      updateInstalledVersion("", { deactivateOrphanDependencies: true });
                    }}
                    type="button"
                  >
                    Deactivate dependencies too
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
                    disabled={loading || !canEdit}
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

      <section className="mod-version-section" aria-label="Versions">
        {selected.status !== "NOT_INSTALLED" && <div className={`mod-version-status ${selected.status.toLowerCase()}`}><StatusIcon status={selected.status} /><strong>{statusLabel(selected.status)}</strong></div>}
        <div className="mod-version-comparison">
          <div><span>Installed version</span><strong>{selected.current_version ?? "No installed version"}</strong></div>
          <div><span>Latest version</span><strong>{selected.latest_version ?? UNKNOWN_VALUE}</strong></div>
        </div>
        {refreshState !== "idle" && <p className="mod-feedback" role="status" aria-live="polite" aria-busy={refreshing}>
          {refreshing ? <RefreshCw className="refresh-spin" size={16} /> : <CheckCircle2 size={16} />}
          {refreshing ? "Checking Workshop and verifying the latest version…" : "Update check completed."}
        </p>}
      {canEdit && <div className="version-editor">
        <label>
          Set installed version
          <CustomSelect<string>
            value={installedVersionEdit}
            options={installedVersionOptions}
            onChange={setInstalledVersionEdit}
            disabled={loading || !canEdit}
            ariaLabel="Installed version"
          />
        </label>
        <button
          className="primary-button compact"
          disabled={loading || !canEdit || !hasInstalledVersionChange}
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
          Save version
        </button>
        {selected.latest_version && selected.current_version !== selected.latest_version && (
          <button className="secondary-button compact" disabled={loading || !canEdit} onClick={() => updateInstalledVersion(selected.latest_version ?? "")} type="button">
            Set to latest
          </button>
        )}

      </div>}
        <div className="mod-copy-action">
        <button
          className="secondary-button compact"
          disabled={loading || !canCopyModJson}
          onClick={() => copyModJson().catch(() => setCopyError("Could not copy JSON. Check clipboard access and try again."))}
          title={canCopyModJson ? "Copy mod JSON to clipboard" : "No installed version available for export"}
          type="button"
        >
          {modJsonCopied ? <CheckCircle2 size={18} /> : <Copy size={18} />}
          {modJsonCopied ? "Copied" : "Copy JSON"}
        </button>
          {!canCopyModJson && <span className="muted">JSON copy requires an installed version.</span>}
        </div>
        {copyError && <p className="error-box" role="alert">{copyError}</p>}
        {saveState === "saved" && <p className="mod-feedback" role="status"><CheckCircle2 size={16} /> Installed version saved.</p>}
      </section>

      {selected.summary && <section className="mod-description"><h3>About this mod</h3><p>{selected.summary}</p></section>}
      <div className="mod-relationships">
      <section className="content-section">
        <h3>Dependencies <span className="section-count">{selected.dependencies.length}</span></h3>
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
        <h3>Required by <span className="section-count">{selected.dependents.length}</span></h3>
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

      </div>
      <section className="content-section mod-changelog">
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

    </article>
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
  const contentId = React.useId();
  return (
    <article className="changelog-entry">
      <button className="changelog-toggle" aria-expanded={expanded} aria-controls={contentId} onClick={() => toggleChangelogVersion(entry.version)} type="button">
        {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        <span className="changelog-heading">
          <strong>{entry.version}</strong>
          <small>Last modified {formatDate(entry.lastModifiedAt) ?? UNKNOWN_VALUE}</small>
        </span>
      </button>
      {expanded &&
        (entry.lines.length > 0 ? (
          <div className="changelog-lines" id={contentId}>
            {entry.lines.map((line, index) => (
              <p className={line.endsWith(":") ? "changelog-label" : ""} key={`${entry.version}-${index}`}>
                {line}
              </p>
            ))}
          </div>
        ) : (
          <div className="changelog-lines" id={contentId}>
            <p className="muted">No notes for this version.</p>
          </div>
        ))}
    </article>
  );
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.left = "-9999px";
  textArea.style.position = "fixed";
  document.body.appendChild(textArea);
  textArea.select();
  try {
    if (!document.execCommand("copy")) throw new Error("Clipboard copy failed");
  } finally {
    document.body.removeChild(textArea);
  }
}
