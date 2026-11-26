// @ts-expect-error -- the app's tsconfig has no Node types; vitest runs on Node.
import { readFileSync } from "node:fs";

import { render } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";

import { noteDetail } from "../../lib/discounted";
import { DangerMark, LifecycleGlyph, MARK_PATH, NeedsYouMark, NoticeMark } from "../Glyph";
import phoneHtml from "../../../../../crates/tower-supervisor/src/remote.html?raw";

const ready = { id: "G-0009", state: "in_review" as const, progress: { verified: 2, observed: 0, machine: 3, human: 0, human_done: 0 }, verified_pin: "ca8ab12aa" };

describe("a goal's glyph", () => {
  it("is the verifier's green check until the goal's detail shows a pass that is not evidence; then the seal's amber !, saying so", () => {
    const { container } = render(() => <LifecycleGlyph goal={ready} />);
    const svg = () => container.querySelector("svg")!;
    expect(svg().getAttribute("stroke")).toBe("var(--st-verified)");
    noteDetail({ summary: { id: "G-0009" }, criteria: [{ canary: "intact" }, { canary: "tampered" }] });
    expect(svg().classList.contains("mark-attention")).toBe(true);
    // The amber disc, its ! cut out of it; no green anywhere on it.
    expect(svg().querySelector("path")!.getAttribute("fill")).toBe("var(--st-attention)");
    expect(svg().querySelector("path")!.getAttribute("d")).toBe(MARK_PATH.attention);
    expect(svg().querySelector('[fill="var(--st-verified)"], [stroke="var(--st-verified)"]')).toBeNull();
    expect(svg().getAttribute("aria-label")).toBe("Passed, doesn't count");
    // Re-verified without the tampering: green again.
    noteDetail({ summary: { id: "G-0009" }, criteria: [{ canary: "intact" }] });
    expect(svg().getAttribute("stroke")).toBe("var(--st-verified)");
  });

  it("is not touched for a goal that is not ready or accepted", () => {
    noteDetail({ summary: { id: "G-0010" }, criteria: [{ canary: "tampered" }] });
    const { container } = render(() => <LifecycleGlyph goal={{ ...ready, id: "G-0010", state: "running" }} />);
    expect(container.querySelector(".mark-attention")).toBeNull();
  });

  it("is the verifier's ring with a notch for a counted pass with caveats, and says so", () => {
    const g = { ...ready, id: "G-0011", progress: { ...ready.progress, qualified: { test_machinery: false, assertions_unchecked: true, flaky: false } } };
    const { container } = render(() => <LifecycleGlyph goal={g} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("stroke")).toBe("var(--st-verified)");
    expect(svg.getAttribute("aria-label")).toBe("Verified, with caveats");
    expect(svg.querySelector("circle")!.getAttribute("stroke-dasharray")).not.toBeNull();
  });

  it("drops the caveats once the pass doesn't count: that verdict says more", () => {
    const g = { ...ready, id: "G-0012", progress: { ...ready.progress, not_evidence: true, qualified: { test_machinery: true, assertions_unchecked: false, flaky: false } } };
    const { container } = render(() => <LifecycleGlyph goal={g} />);
    expect(container.querySelector("svg")!.getAttribute("aria-label")).toBe("Passed, doesn't count");
  });
});

describe("the marks", () => {
  const goal = (state: "running" | "verifying" | "paused" | "draft", more: Record<string, unknown> = {}) =>
    ({ id: "G-0100", state, mode: "executing", needs_you: 0, updated_at: Date.now(), progress: { verified: 0, observed: 0, machine: 1, human: 0, human_done: 0 }, verified_pin: null, ...more }) as never;
  it("draw work in motion as an arc that turns on its ring, never a half-filled disc", () => {
    for (const state of ["running", "verifying"] as const) {
      const { container } = render(() => <LifecycleGlyph goal={goal(state)} turn />);
      const svg = container.querySelector("svg")!;
      expect(svg.classList.contains("glyph-spin")).toBe(true);
      expect(svg.querySelector("[fill]:not([fill='none'])")).toBeNull();
      expect(svg.querySelector("path")!.getAttribute("d")).toBe("M5 1a4 4 0 0 1 4 4");
    }
    for (const state of ["paused", "draft"] as const) {
      const { container } = render(() => <LifecycleGlyph goal={goal(state)} />);
      expect(container.querySelector("svg")!.classList.contains("glyph-spin")).toBe(false);
      // Every goal's glyph keeps the goal's ring: paused is the ring held, with two bars inside it.
      expect(container.querySelector("svg circle")).not.toBeNull();
    }
  });

  it("turn only while the work moves, and only where you watch it (review 14: the arc turned on goals waiting on you)", () => {
    const spins = (g: never, turn = true) => {
      const { container } = render(() => <LifecycleGlyph goal={g} turn={turn} />);
      const svg = container.querySelector("svg")!;
      // Still or turning, the arc is drawn: held still it rests at the top right, as under reduced motion.
      expect(svg.querySelector("path")!.getAttribute("d")).toBe("M5 1a4 4 0 0 1 4 4");
      return svg.classList.contains("glyph-spin");
    };
    expect(spins(goal("running"))).toBe(true);
    // Waiting on you, flagged for you, or silent two minutes with no tool in flight: nothing is moving.
    expect(spins(goal("running", { mode: "waiting_on_you" }))).toBe(false);
    expect(spins(goal("running", { needs_you: 1 }))).toBe(false);
    expect(spins(goal("running", { id: "G-0101", updated_at: Date.now() - 10 * 60_000 }))).toBe(false);
    // Lists you move through (the sidebar, the palette, a history) hold the mark still, whatever the work does.
    expect(spins(goal("running"), false)).toBe(false);
    expect(spins(goal("verifying"), false)).toBe(false);
  });

  it("tell a merged goal the verifier passed from one merged without it by shape, not colour alone", () => {
    const merged = (pin: string | null) => {
      const { container } = render(() => <LifecycleGlyph goal={{ ...ready, id: "G-0102", state: "integrated", verified_pin: pin }} />);
      return container.querySelector("svg")!;
    };
    // Verified: the sealed core is a filled disc. Merged unverified: the core is hatched, as an unverified seal is.
    expect(merged("ca8ab12aa").querySelector("circle[fill]:not([fill='none'])")).not.toBeNull();
    const hatched = merged(null);
    expect(hatched.querySelector("circle[fill]:not([fill='none'])")).toBeNull();
    expect(hatched.querySelectorAll("path")).toHaveLength(1);
    expect(hatched.querySelector("path")!.getAttribute("d")!.match(/M/g)).toHaveLength(3);
  });

  it("keep the phone's running mark to the desk's rule: it turns only while the run moves", () => {
    // The phone page's own copy of `moving`: waiting on you, flagged, or silent two minutes with no tool in flight holds
    // the arc still. A tool is in flight when the supervisor's live line says so, as the desk's `livenessOf` reads it
    // (review 18: a call beside an open question, its mode waiting on you, still runs; one whose turn ended does not).
    expect(phoneHtml).toContain("const busy = (g) => !!(g.live_line && g.live_line.running);");
    expect(phoneHtml).toContain("const silentRun = (g) => g.state === \"running\" && !busy(g) && heardAt(g) > 0 && Date.now() - heardAt(g) > 120_000;");
    expect(phoneHtml).toContain('const moves = (g) => g.state === "running" && !waits(g) && !silentRun(g);');
    expect(phoneHtml).toContain('G.state("running", moves(g))');
    expect(phoneHtml).toContain("G.runs(running.some(moves))");
  });

  it("are one disc told apart by the symbol cut out of it: needs you amber with a !, wrong red with a ×, a notice uncoloured", () => {
    const one = (el: () => import("solid-js").JSX.Element) => render(el).container.querySelector("svg")!;
    const needs = one(() => <NeedsYouMark />);
    const danger = one(() => <DangerMark />);
    const notice = one(() => <NoticeMark />);
    for (const svg of [needs, danger, notice]) {
      expect(svg.getAttribute("viewBox")).toBe("0 0 16 16");
      expect(svg.getAttribute("role")).toBe("img");
      expect(svg.getAttribute("aria-label")).toBeTruthy();
      // One even-odd path: the symbol is a hole that shows the mark's own ground, never paint in a guessed one.
      expect(svg.children).toHaveLength(1);
      expect(svg.querySelector("path")!.getAttribute("fill-rule")).toBe("evenodd");
      expect(svg.querySelector("[stroke], [fill*='--bg'], [fill*='--surface']")).toBeNull();
    }
    expect(needs.querySelector("path")!.getAttribute("fill")).toBe("var(--st-attention)");
    expect(needs.querySelector("path")!.getAttribute("d")).toBe(MARK_PATH.attention);
    expect(danger.classList.contains("mark-danger")).toBe(true);
    expect(danger.querySelector("path")!.getAttribute("d")).toBe(MARK_PATH.danger);
    expect(notice.querySelector("path")!.getAttribute("d")).toBe(MARK_PATH.notice);
    expect(notice.querySelector("[fill^='var(--st']")).toBeNull();
  });

  it("are drawn by a stylesheet and on the phone from the very same paths", () => {
    // Vitest hands a stylesheet's ?raw import over empty, so the file is read as it is (as inks.test does).
    const tokensCss = readFileSync("src/styles/tokens.css", "utf8") as string;
    const masks = Object.fromEntries([...tokensCss.matchAll(/--mark-(\w+): url\("data:image\/svg\+xml,[^"]*d='([^']+)'/g)].map((m) => [m[1], m[2]]));
    expect(masks).toEqual({ ...MARK_PATH });
    for (const d of Object.values(MARK_PATH)) expect(phoneHtml).toContain(d);
  });
});
