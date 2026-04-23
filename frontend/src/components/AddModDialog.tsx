import React from "react";

import { Dialog } from "./common";

export function AddModDialog({
  modId,
  currentVersion,
  loading,
  setModId,
  setCurrentVersion,
  onClose,
  onSubmit,
}: {
  modId: string;
  currentVersion: string;
  loading: boolean;
  setModId: (value: string) => void;
  setCurrentVersion: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  return (
    <Dialog title="Add mod" onClose={onClose}>
      <form className="dialog-form" onSubmit={onSubmit}>
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
