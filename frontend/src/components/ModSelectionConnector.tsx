import React from "react";
import type { Mod } from "../types";

export function ModSelectionConnector({ selectedId, visibleMods }: { selectedId: string; visibleMods: Mod[] }) {
  const pathRef = React.useRef<SVGPathElement>(null);

  React.useLayoutEffect(() => {
    const path = pathRef.current;
    const shell = path?.closest("main");
    const row = shell?.querySelector<HTMLElement>(".mod-row.active");
    const list = row?.parentElement;
    const detail = shell?.querySelector<HTMLElement>(".mod-detail");
    const viewport = detail?.closest<HTMLElement>(".detail");
    if (!path || !row || !list || !detail || !viewport) return;

    const desktop = window.matchMedia("(width > 900px)");
    let frame = 0;
    function draw() {
      frame = 0;
      if (!path || !row || !list || !detail || !viewport) return;
      const from = row.getBoundingClientRect();
      const listBounds = list.getBoundingClientRect();
      const target = detail.getBoundingClientRect();
      const viewportBounds = viewport.getBoundingClientRect();
      const x = from.right;
      const y = from.top + from.height / 2;
      const bracketX = target.left + parseFloat(getComputedStyle(detail, "::before").insetInlineStart);
      const top = Math.max(target.top + 8, viewportBounds.top + 8);
      const bottom = Math.min(target.bottom - 8, viewportBounds.bottom - 8);
      if (!desktop.matches || y < listBounds.top || y > listBounds.bottom || bracketX <= x
        || top > bottom || y < top - 24 || y > bottom + 24) {
        path.removeAttribute("d");
        return;
      }
      const endY = Math.min(bottom, Math.max(top, y + 8));
      const bendX = x + (bracketX - x) * 0.55;
      path.setAttribute("d", `M ${x} ${y} C ${bendX} ${y}, ${bendX} ${endY}, ${bracketX} ${endY}`);
    }

    function schedule() {
      if (!frame) frame = requestAnimationFrame(draw);
    }

    const observer = new ResizeObserver(schedule);
    [row, list, detail, viewport].forEach(element => observer.observe(element));
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    draw();
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
      path.removeAttribute("d");
    };
  }, [selectedId, visibleMods]);

  return <svg className="mod-selection-connector" aria-hidden="true"><path ref={pathRef} /></svg>;
}
