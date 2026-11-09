import React from "react";
import type { LoadState } from "../hooks/useLoadState";
import { ResourceStatus } from "./ResourceStatus";

import type { Modset } from "../types";
import { CustomSelect, Dialog } from "./common";

export function AddModDialog({
  modsetsLoad,
  loading,
  modsets,
  activeModsetId,
  onClose,
  onSubmit,
}: {
  modsetsLoad: LoadState;
  loading: boolean;
  modsets: Modset[];
  activeModsetId: number | null;
  onClose: () => void;
  onSubmit: (modId: string, currentVersion: string | null, modsetId: number) => Promise<void>;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const [modId, setModId] = React.useState("");
  const [currentVersion, setCurrentVersion] = React.useState("");
  const [targetModsetId, setTargetModsetId] = React.useState<number>(() =>
    modsets.some(modset => modset.id === activeModsetId) ? activeModsetId! : modsets[0]?.id ?? 0);

  React.useEffect(() => {
    setTargetModsetId(current => modsets.some(modset => modset.id === current) ? current
      : modsets.some(modset => modset.id === activeModsetId) ? activeModsetId! : modsets[0]?.id ?? 0);
  }, [activeModsetId, modsets]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!modsetsLoad.loaded || modsetsLoad.error || !modsets.some(modset => modset.id === targetModsetId)) return;
    setError(null);
    try {
      await onSubmit(modId, currentVersion.trim() || null, targetModsetId);
      setModId("");
      setCurrentVersion("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not add mod. Check the Workshop ID and try again.");
    }
  }

  return (
    <Dialog title="Add mod" onClose={onClose}>
      <form className="dialog-form" onSubmit={handleSubmit}>
        <ResourceStatus state={modsetsLoad} label="target modsets" />
        <label>
          Workshop ID
          <input autoFocus disabled={loading} value={modId} onChange={(event) => setModId(event.target.value)} placeholder="672B195EAD3036D4" />
        </label>
        <label>
          Installed version
          <input disabled={loading} value={currentVersion} onChange={(event) => setCurrentVersion(event.target.value)} placeholder="optional" />
        </label>
        <label>
          Modset
          <CustomSelect<number>
            value={targetModsetId}
            options={modsets.map((modset) => ({ value: modset.id, label: modset.name }))}
            onChange={setTargetModsetId}
            disabled={loading || !modsetsLoad.loaded || Boolean(modsetsLoad.error) || modsets.length === 0}
            ariaLabel="Target modset"
          />
        </label>
        {Boolean(modsets.find(set => set.id === targetModsetId)?.child_modsets_count) && <p className="muted">This is a parent modset. Adding a mod also adds it to its child modsets and makes this installed version binding, replacing any local version of the same mod.</p>}
        {error && <p className="error-box" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button className="secondary-button compact" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="primary-button compact" disabled={loading || !modsetsLoad.loaded || Boolean(modsetsLoad.error) || !modId.trim() || !targetModsetId}>
            Add
          </button>
        </div>
      </form>
    </Dialog>
  );
}
