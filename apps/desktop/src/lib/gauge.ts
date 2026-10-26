/**
 * The title bar's runs gauge: a 10px ring filled by how many of the
 * concurrency slots are running — one of four is a quarter, two of four is
 * the running glyph's own half-disc, four of four a full disc. The wedge
 * grows counter-clockwise from the top, the way the running glyph's half
 * is drawn, so the two shapes belong to one family.
 */
export function wedgePath(fraction: number, cx = 5, cy = 5, r = 4): string {
  const f = Math.max(0, Math.min(1, fraction));
  if (f === 0) return "";
  if (f === 1) return `M${cx} ${cy - r} A${r} ${r} 0 1 0 ${cx} ${cy + r} A${r} ${r} 0 1 0 ${cx} ${cy - r} Z`;
  const a = 2 * Math.PI * f;
  const ex = +(cx - r * Math.sin(a)).toFixed(3);
  const ey = +(cy - r * Math.cos(a)).toFixed(3);
  return `M${cx} ${cy} L${cx} ${cy - r} A${r} ${r} 0 ${f > 0.5 ? 1 : 0} 0 ${ex} ${ey} Z`;
}
