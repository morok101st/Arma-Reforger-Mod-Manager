import React from "react";
import { CheckCircle2, RefreshCw, TriangleAlert } from "lucide-react";

import { UNKNOWN_VALUE, statusLabel } from "../lib/utils";
import type { ModStatus } from "../types";

export function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="dialog-panel" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <header className="dialog-header">
          <h3>{title}</h3>
          <button className="icon-button" onClick={onClose} type="button" title="Close">
            ×
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

export function StatusIcon({ status }: { status: ModStatus }) {
  if (status === "UPDATE_AVAILABLE") return <TriangleAlert className="status-icon warn" size={20} />;
  if (status === "UP_TO_DATE") return <CheckCircle2 className="status-icon ok" size={20} />;
  return <RefreshCw className="status-icon unknown" size={20} />;
}

export function Info({ label, value, href }: { label: string; value: string | null; href?: string | null }) {
  return (
    <div className="info">
      <span>{label}</span>
      {href && value ? (
        <a href={href} target="_blank" rel="noreferrer">
          {value}
        </a>
      ) : (
        <strong>{value ?? UNKNOWN_VALUE}</strong>
      )}
    </div>
  );
}

export { UNKNOWN_VALUE, statusLabel };
