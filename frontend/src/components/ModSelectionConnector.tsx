import React from "react";
import type { Mod } from "../types";

export function ModSelectionConnector({ visibleMods }: { visibleMods: Mod[] }) {
  const pathRef = React.useRef<SVGPathElement>(null);

  React.useLayoutEffect(() => {
    const path = pathRef.current;
    const shell = path?.closest("main");
    const row = shell?.querySelector<HTMLElement>(".mod-row.active");
    const list = row?.parentElement;
    const bracket = shell?.querySelector<HTMLElement>(".mod-detail-bracket");
    const viewport = bracket?.closest<HTMLElement>(".detail");
    if (!path || !row || !list || !bracket || !viewport) return;

    const desktop = window.matchMedia("(width > 900px)");
    let frame = 0;
    const draw = () => {
      frame = 0;
      const from = row.getBoundingClientRect();
      const listBounds = list.getBoundingClientRect();
      const target = bracket.getBoundingClientRect();
      const viewportBounds = viewport.getBoundingClientRect();
      const x = from.right;
      const y = from.top + from.height / 2;
      const bracketX = target.left + 0.5;
      const top = Math.max(target.top + 8, viewportBounds.top + 8);
      const bottom = Math.min(target.bottom - 8, viewportBounds.bottom - 8);
      if (!desktop.matches || y < listBounds.top || y > listBounds.bottom || bracketX <= x
        || top > bottom || y < top || y > bottom) {
        path.removeAttribute("d");
        return;
      }
      if (!bracket.style.getPropertyValue("--bracket-opening")) {
        bracket.style.setProperty("--bracket-opening", `${100 * (y - target.top) / target.height}%`);
      }
      path.setAttribute("d", `M ${x} ${y} H ${bracketX}`);
    };

    function schedule() {
      if (!frame) frame = requestAnimationFrame(draw);
    }

    const observer = new ResizeObserver(schedule);
    [row, list, bracket, viewport].forEach(element => observer.observe(element));
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
  }, [visibleMods]);

  return <svg className="mod-selection-connector" aria-hidden="true"><path ref={pathRef} pathLength={1} /></svg>;
}
