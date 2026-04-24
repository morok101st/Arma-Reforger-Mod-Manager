import React from "react";
import { Check, CheckCircle2, ChevronDown, RefreshCw, TriangleAlert } from "lucide-react";

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
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const selectedOption = options.find((option) => option.value === value) ?? null;

  React.useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  React.useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  return (
    <div className="custom-select" ref={rootRef}>
      <button
        className="custom-select-trigger"
        type="button"
        onClick={() => setOpen((current) => !current)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{selectedOption?.label ?? "Select"}</span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="custom-select-menu" role="listbox" aria-label={ariaLabel}>
          {options.map((option) => (
            <button
              key={String(option.value)}
              className={`custom-select-item ${value === option.value ? "active" : ""}`}
              type="button"
              role="option"
              aria-selected={value === option.value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              <span>{option.label}</span>
              {value === option.value && <Check size={16} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export { UNKNOWN_VALUE, statusLabel };
