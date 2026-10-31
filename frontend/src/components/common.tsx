import React from "react";
import { CheckCircle2, X, Info as InfoIcon, RefreshCw, TriangleAlert } from "lucide-react";

import { UNKNOWN_VALUE, statusLabel } from "../lib/utils";
import type { ModStatus } from "../types";

export function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex]:not([tabindex="-1"])'))
    .filter(node => !node.matches(":disabled") && node.tabIndex >= 0 && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== "hidden");
}

export function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const dialogRef = React.useRef<HTMLDialogElement>(null);
  const titleId = React.useId();
  React.useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    document.documentElement.classList.add("dialog-open");
    return () => {
      dialog.close();
      if (!document.querySelector("dialog[open]")) document.documentElement.classList.remove("dialog-open");
    };
  }, []);

  return (
    <dialog ref={dialogRef} className="dialog-backdrop" aria-labelledby={titleId}
      onKeyDown={event => {
        if (event.key !== "Tab") return;
        const items = focusableElements(event.currentTarget);
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}
      onCancel={event => { event.preventDefault(); onClose(); }}
      onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="dialog-panel">
        <header className="dialog-header">
          <h3 id={titleId}>{title}</h3>
          <button className="icon-button" onClick={onClose} type="button" aria-label="Close dialog" title="Close"><X size={18} /></button>
        </header>
        {children}
      </section>
    </dialog>
  );
}

export function StatusIcon({ status }: { status: ModStatus }) {
  if (status === "NOT_INSTALLED") return <InfoIcon className="status-icon no-installed" size={20} />;
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

export function CustomSelect<T extends string | number>({
  value,
  options,
  onChange,
  disabled = false,
  ariaLabel,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  // Native selection provides keyboard navigation, typeahead and mobile pickers.
  const selected = options.find(option => option.value === value) ?? options[0];
  return <select className="custom-select-trigger" aria-label={ariaLabel}
    value={selected ? String(selected.value) : ""} disabled={disabled || options.length === 0}
    onChange={event => {
      const option = options.find(option => String(option.value) === event.target.value);
      if (option) onChange(option.value);
    }}>
    {options.map(option => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}
  </select>;
}

export { UNKNOWN_VALUE, statusLabel };
