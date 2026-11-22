/**
 * Split-Geometry virtualizer for large diffs (docs/18 §18.4):
 * Layer A fixed-height prefix sums + Layer B sparse height deltas + (path, line, side) scroll anchor.
 */

export type RowKind = "code" | "head" | "gap" | "folded" | "comment" | "composer" | "fold";
export type AnchorSide = "old" | "new" | "file" | "hunk";
export interface SemanticAnchor { path: string; line: number | null; side: AnchorSide; hunk?: number }
export interface GeometryItem { kind: RowKind; anchor: SemanticAnchor; height?: number }
export interface ViewportRange { start: number; end: number; topPad: number; bottomPad: number; totalHeight: number }
export interface CapturedAnchor { key: string; anchor: SemanticAnchor; offsetPx: number }

export const VIRTUAL_THRESHOLD = 400;
export const DEFAULT_HEIGHTS: Record<RowKind, number> = { code: 20, head: 28, gap: 28, folded: 28, comment: 56, composer: 96, fold: 20 };
export const anchorKey = (a: SemanticAnchor) => `${a.path}\0${a.side}\0${a.line ?? ""}${a.hunk === undefined ? "" : `#${a.hunk}`}`;

export class SplitGeometry {
  private h: number[] = [];
  private t: number[] = [];
  private bt = 0;
  private k: string[] = [];
  private a: SemanticAnchor[] = [];
  private m = new Map<string, number>();
  private d = new Map<number, number>();
  private di: number[] = [];
  private dp: number[] = [];
  private dt = 0;

  constructor(items: readonly GeometryItem[] = []) { this.reset(items); }
  get count() { return this.h.length; }
  get totalHeight() { return this.bt + this.dt; }

  reset(items: readonly GeometryItem[]) {
    const kept = new Map<string, number>();
    for (const [i, v] of this.d) if (this.k[i] !== undefined) kept.set(this.k[i], this.h[i] + v);
    const n = items.length;
    this.h = new Array(n);
    this.t = new Array(n);
    this.k = new Array(n);
    this.a = new Array(n);
    this.m.clear();
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const it = items[i], rh = it.height ?? DEFAULT_HEIGHTS[it.kind], key = anchorKey(it.anchor);
      this.h[i] = rh;
      this.t[i] = acc;
      acc += rh;
      this.k[i] = key;
      this.a[i] = it.anchor;
      if (!this.m.has(key)) this.m.set(key, i);
    }
    this.bt = acc;
    this.d.clear();
    for (let i = 0; i < n; i++) {
      const p = kept.get(this.k[i]);
      if (p !== undefined && Math.abs(p - this.h[i]) >= 0.5) this.d.set(i, p - this.h[i]);
    }
    this.sync();
  }

  private sync() {
    let acc = 0;
    this.di = [...this.d.keys()].sort((x, y) => x - y);
    this.dp = this.di.map((i) => (acc += this.d.get(i)!));
    this.dt = acc;
  }

  private db(i: number) {
    let lo = 0, hi = this.di.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (this.di[mid] < i) lo = mid + 1; else hi = mid; }
    return lo ? this.dp[lo - 1] : 0;
  }

  rowTop(i: number) { return i <= 0 ? 0 : i >= this.h.length ? this.totalHeight : this.t[i] + this.db(i); }
  rowHeight(i: number) { return i < 0 || i >= this.h.length ? 0 : this.h[i] + (this.d.get(i) ?? 0); }

  measure(i: number, actual: number) {
    if (i < 0 || i >= this.h.length || !Number.isFinite(actual) || actual <= 0) return false;
    const next = actual - this.h[i];
    if (Math.abs(next - (this.d.get(i) ?? 0)) < 0.5) return false;
    if (Math.abs(next) < 0.5) this.d.delete(i);
    else this.d.set(i, next);
    this.sync();
    return true;
  }

  indexAtY(y: number) {
    const n = this.h.length;
    if (!n || y <= 0) return 0;
    if (y >= this.totalHeight) return n - 1;
    let lo = 0, hi = n - 1;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (this.rowTop(mid) + this.rowHeight(mid) <= y) lo = mid + 1; else hi = mid; }
    return lo;
  }

  range(scrollTop: number, viewportHeight: number, overscan = 24): ViewportRange {
    const n = this.h.length;
    if (!n) return { start: 0, end: 0, topPad: 0, bottomPad: 0, totalHeight: 0 };
    const top = Math.max(0, scrollTop), s = Math.max(0, this.indexAtY(top) - overscan), e = Math.min(n, this.indexAtY(top + Math.max(0, viewportHeight)) + overscan + 1);
    return { start: s, end: e, topPad: this.rowTop(s), bottomPad: Math.max(0, this.totalHeight - this.rowTop(e)), totalHeight: this.totalHeight };
  }

  captureAnchor(scrollTop: number): CapturedAnchor | null {
    if (!this.h.length) return null;
    const top = Math.max(0, scrollTop), i = this.indexAtY(top);
    return { key: this.k[i], anchor: this.a[i], offsetPx: top - this.rowTop(i) };
  }
  resolveScrollTop(cap: CapturedAnchor | null) {
    const i = cap ? this.m.get(cap.key) : undefined;
    return i === undefined ? null : Math.max(0, this.rowTop(i) + cap!.offsetPx);
  }
  indexOfAnchor(a: SemanticAnchor) { return this.m.get(anchorKey(a)) ?? -1; }
}

export function createIdleGate(idleMs = 64) {
  let raf: number | null = null, tm: ReturnType<typeof setTimeout> | null = null, busy = false;
  const q = new Set<() => void>();
  const kick = () => !busy && raf === null && q.size > 0 && (raf = requestAnimationFrame(() => {
    raf = null;
    if (busy) return;
    const fns = [...q];
    q.clear();
    fns.forEach((f) => f());
  }));
  return {
    schedule: (fn: () => void) => (q.add(fn), kick()),
    markScrolling: () => {
      busy = true;
      if (tm) clearTimeout(tm);
      tm = setTimeout(() => ((busy = false), (tm = null), kick()), idleMs);
    },
    dispose: () => {
      if (raf !== null) cancelAnimationFrame(raf);
      if (tm) clearTimeout(tm);
      raf = null;
      tm = null;
      q.clear();
    },
  };
}
