import React from "react";

import type { Modset } from "../types";
import { CustomSelect, Dialog } from "./common";

export function AddModDialog({
  loading,
  modsets,
  activeModsetId,
  onClose,
  onSubmit,
}: {
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
    if (!modsets.some(modset => modset.id === targetModsetId)) return;
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
            disabled={loading || modsets.length === 0}
            ariaLabel="Target modset"
          />
        </label>
        {error && <p className="error-box" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button className="secondary-button compact" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="primary-button compact" disabled={loading || !modId.trim() || !targetModsetId}>
            Add
          </button>
        </div>
      </form>
    </Dialog>
  );
}
