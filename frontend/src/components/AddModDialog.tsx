import React from "react";

import { Dialog } from "./common";

export function AddModDialog({
  loading,
  onClose,
  onSubmit,
}: {
  loading: boolean;
  onClose: () => void;
  onSubmit: (modId: string, currentVersion: string | null) => Promise<void>;
}) {
  const [modId, setModId] = React.useState("");
  const [currentVersion, setCurrentVersion] = React.useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    await onSubmit(modId, currentVersion.trim() || null);
    setModId("");
    setCurrentVersion("");
  }

  return (
    <Dialog title="Add mod" onClose={onClose}>
      <form className="dialog-form" onSubmit={handleSubmit}>
        <label>
          Workshop ID
          <input value={modId} onChange={(event) => setModId(event.target.value)} placeholder="672B195EAD3036D4" />
        </label>
        <label>
          Installed version
          <input value={currentVersion} onChange={(event) => setCurrentVersion(event.target.value)} placeholder="optional" />
        </label>
        <div className="dialog-actions">
          <button className="secondary-button compact" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="primary-button compact" disabled={loading || !modId.trim()}>
            Add
          </button>
        </div>
      </form>
    </Dialog>
  );
}
