import type { Mod } from "../types";

// Unitless metadata has no documented byte contract; leave it unknown.
export function parseModSize(value: string | null): number | null {
  const match = value?.trim().match(/^(\d+(?:[.,]\d+)?)\s*(B|[KMGT]i?B)$/i);
  if (!match) return null;
  const unit = match[2].toUpperCase();
  const exponent = unit === "B" ? 0 : "KMGT".indexOf(unit[0]) + 1;
  const bytes = Number(match[1].replace(",", ".")) * (unit.includes("I") ? 1024 : 1000) ** exponent;
  return Number.isFinite(bytes) && bytes <= Number.MAX_SAFE_INTEGER ? bytes : null;
}

export function formatModSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = bytes > 0 ? Math.min(Math.floor(Math.log10(bytes) / 3), units.length - 1) : 0;
  return `${Number((bytes / 1000 ** Math.max(0, exponent)).toFixed(2))} ${units[Math.max(0, exponent)]}`;
}

export function getModsetSize(mods: Pick<Mod, "id" | "current_version" | "size">[]) {
  let bytes = 0;
  let knownCount = 0;
  let unknownCount = 0;
  const seen = new Set<string>();
  for (const mod of mods) {
    if (!mod.current_version?.trim() || seen.has(mod.id)) continue;
    seen.add(mod.id);
    const size = parseModSize(mod.size);
    if (size === null) unknownCount++;
    else { bytes += size; knownCount++; }
  }
  const value = knownCount === 0 && unknownCount > 0 ? "Unknown" : formatModSize(bytes);
  const detail = unknownCount > 0
    ? `${unknownCount} ${unknownCount === 1 ? "size" : "sizes"} unknown${knownCount > 0 ? "; partial total" : ""}. `
    : "";
  return { bytes, knownCount, unknownCount, value, detail };
}
