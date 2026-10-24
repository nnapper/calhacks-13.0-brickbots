// Lengths are stored in millimetres everywhere; these format them for the unit the viewer picked.
export const LENGTH_UNITS = ["mm", "in"];
const MM_PER_IN = 25.4;

export function formatLength(mm, unit = "mm") {
  if (unit === "in") return `${(mm / MM_PER_IN).toFixed(mm < MM_PER_IN * 10 ? 2 : 1)} in`;
  return `${mm >= 100 ? Math.round(mm) : Math.round(mm * 10) / 10} mm`;
}

const num = (mm, unit) => formatLength(mm, unit).replace(/ (mm|in)$/, "");

// A part's real size from the catalog (or an uploaded CAD file), e.g. "Ø 96 mm" or "152 × 32 × 2.5 mm"; null if unknown.
export function formatSize(part, unit = "mm") {
  const d = part.dims ?? part.dimsMm;
  if (!d) return null;
  const suffix = unit === "in" ? " in" : " mm";
  if (d.diameter) return `Ø ${num(d.diameter, unit)}${d.width ? ` × ${num(d.width, unit)}` : ""}${suffix}`;
  const sides = [d.length, d.width, d.height].filter((v) => v > 0);
  if (sides.length === 1) return `${num(sides[0], unit)}${suffix} long`;
  return sides.length ? sides.map((v) => num(v, unit)).join(" × ") + suffix : null;
}
