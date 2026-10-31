import React from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export function CustomSelect<T extends string | number>({ value, options, onChange, disabled = false, ariaLabel }: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const popupRef = React.useRef<HTMLDivElement>(null);
  const listId = React.useId();
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const [placement, setPlacement] = React.useState<React.CSSProperties>({});
  const [container, setContainer] = React.useState<Element | null>(null);
  const search = React.useRef({ text: "", at: 0 });
  const selectedIndex = Math.max(0, options.findIndex(option => option.value === value));
  const selected = options[selectedIndex];

  function show(index = selectedIndex) {
    if (disabled || !options.length) return;
    setActive(index);
    setOpen(true);
  }
  function choose(index: number) {
    if (options[index]) onChange(options[index].value);
    setOpen(false);
  }

  React.useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    if (!trigger) return;
    // Keep popups inside the modal's accessible subtree and native top layer.
    const host = trigger.closest('dialog, [aria-modal="true"]') ?? document.body;
    setContainer(host);
    function position() {
      const rect = trigger!.getBoundingClientRect();
      const bounds = host.getBoundingClientRect();
      const modal = host !== document.body;
      const leftEdge = modal ? Math.max(8, bounds.left + 8) : 8;
      const rightEdge = modal ? Math.min(window.innerWidth - 8, bounds.right - 8) : window.innerWidth - 8;
      const width = Math.min(Math.max(rect.width, 180), rightEdge - leftEdge);
      const below = window.innerHeight - rect.bottom - 14;
      const above = rect.top - 14;
      const upwards = below < 180 && above > below;
      const height = Math.min(280, Math.max(48, upwards ? above : below));
      const transformed = getComputedStyle(host).transform !== "none";
      setPlacement({
        width,
        left: Math.max(leftEdge, Math.min(rect.left, rightEdge - width)) - (transformed ? bounds.left : 0),
        top: (upwards ? rect.top - 6 : rect.bottom + 6) - (transformed ? bounds.top : 0),
        maxHeight: height,
        transform: upwards ? "translateY(-100%)" : undefined,
      });
    }
    const outside = (event: PointerEvent) => {
      if (!trigger!.contains(event.target as Node) && !popupRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const scroll = (event: Event) => { if (!popupRef.current?.contains(event.target as Node)) position(); };
    position();
    document.addEventListener("pointerdown", outside);
    document.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", position);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", position);
    };
  }, [open]);

  React.useEffect(() => { if (disabled || !options.length) setOpen(false); }, [disabled, options.length]);
  React.useEffect(() => { if (open) setActive(index => Math.min(index, options.length - 1)); }, [open, options.length]);
  React.useLayoutEffect(() => {
    if (open) popupRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, container]);

  return <>
    <button ref={triggerRef} type="button" role="combobox" className="custom-select-trigger" aria-label={ariaLabel}
      aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined}
      aria-activedescendant={open && options[active] ? `${listId}-${active}` : undefined}
      disabled={disabled || !options.length} onClick={() => open ? setOpen(false) : show()}
      onBlur={event => { if (!popupRef.current?.contains(event.relatedTarget as Node)) setOpen(false); }}
      onKeyDown={event => {
        if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); return; }
        if (event.key === "Tab") { if (open) choose(active); return; }
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const index = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1
            : !open ? selectedIndex : Math.max(0, Math.min(options.length - 1, active + (event.key === "ArrowDown" ? 1 : -1)));
          show(index); return;
        }
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); if (open) choose(active); else show(); return; }
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault();
          const now = Date.now();
          search.current.text = (now - search.current.at < 700 ? search.current.text : "") + event.key.toLocaleLowerCase();
          search.current.at = now;
          let index = options.findIndex(option => option.label.toLocaleLowerCase().startsWith(search.current.text));
          if (index < 0) { search.current.text = event.key.toLocaleLowerCase(); index = options.findIndex(option => option.label.toLocaleLowerCase().startsWith(search.current.text)); }
          if (index >= 0) show(index);
        }
      }}>
      <span>{selected?.label ?? "No options"}</span><ChevronDown size={16} aria-hidden="true" />
    </button>
    {open && container && createPortal(<div ref={popupRef} id={listId} role="listbox" aria-label={ariaLabel} className="select-popup" style={placement}>
      {options.map((option, index) => <div key={String(option.value)} id={`${listId}-${index}`} role="option" aria-selected={value === option.value}
        className="select-option" data-active={active === index} data-index={index}
        onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => { choose(index); triggerRef.current?.focus(); }}>
        <span>{option.label}</span>{value === option.value && <Check size={16} aria-hidden="true" />}
      </div>)}
    </div>, container)}
  </>;
}
