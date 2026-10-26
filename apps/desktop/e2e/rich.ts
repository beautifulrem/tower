/**
 * Enrichments of the dumped views for states the demo run does not reach:
 * a goal on the other engine, rework, a look criterion with its two
 * screenshots, a baseline that could not run, an undoable rollback, a
 * three-file review with two units and a harness risk, a second ready goal,
 * a CI failure with a PR, and the phone page switched on. Each helper is
 * independent so a test can take one; `enrichRich` takes them all.
 */
type F = Record<string, any>;

/** A page-shaped SVG as a data URL: a header bar and a few lines, shifted a little for the "after" side. */
export function pageImage(after: boolean): string {
  const shift = after ? 14 : 0;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="390" height="640" viewBox="0 0 390 640">
<rect width="390" height="640" fill="#f6f4ef"/><rect width="390" height="56" fill="#2b2a28"/>
<rect x="20" y="88" width="${210 + shift}" height="14" rx="3" fill="#3a3835"/>
<rect x="20" y="118" width="300" height="8" rx="2" fill="#a9a59e"/><rect x="20" y="136" width="260" height="8" rx="2" fill="#a9a59e"/>
<rect x="20" y="${180 + shift}" width="350" height="120" rx="6" fill="#ffffff" stroke="#d9d5cd"/>
<rect x="36" y="${200 + shift}" width="120" height="10" rx="2" fill="#3a3835"/><rect x="36" y="${222 + shift}" width="80" height="10" rx="2" fill="#a9a59e"/>
<rect x="20" y="560" width="350" height="44" rx="6" fill="${after ? "#2b2a28" : "#6b6761"}"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** G-0002 runs on Claude Code; G-0003 is in its first rework. */
export function enrichEngines(F: F) {
  for (const g of F.goals) {
    if (g.id === "G-0002") g.engine = "claude-code";
    if (g.id === "G-0003") g.rework_cycles = 1;
  }
  const d = F["goal-G-0002"];
  if (d) {
    d.summary.engine = "claude-code";
    d.contract.engine = "claude-code";
  }
  if (F["goal-G-0003"]) F["goal-G-0003"].summary.rework_cycles = 1;
}

/** G-0001 gains a look criterion with both screenshots, and C1's baseline could not run. */
export function enrichLook(F: F) {
  const d = F["goal-G-0001"];
  if (!d) return;
  d.contract.criteria.push({ id: "C4", title: "The checkout page still looks right", kind: { type: "look", start: "npm run dev", url: "http://localhost:3000/checkout", timeout_secs: 60 } });
  d.criteria.push({
    criterion: d.contract.criteria[d.contract.criteria.length - 1],
    verified: null,
    passed_on_base: null,
    base_error: null,
    look: { base: "looks/G-0001/C4-base.png", pin: "looks/G-0001/C4-pin.png", base_error: null, pin_error: null },
    passes_with_source_only: null,
    observed: null,
    human_checked: false,
  });
  d.summary.progress.human += 1;
  const c1 = d.criteria.find((c: any) => c.criterion.id === "C1");
  if (c1) {
    c1.passed_on_base = null;
    c1.base_error = "npm ERR! Missing script: \"test\"";
  }
  F.lookImages = { ...(F.lookImages ?? {}), "looks/G-0001/C4-base.png": pageImage(false), "looks/G-0001/C4-pin.png": pageImage(true) };
  for (const g of F.goals) if (g.id === "G-0001") g.progress.human += 1;
}

/** G-0004 was rolled back and the rollback can still be undone. */
export function enrichRollback(F: F) {
  if (F["goal-G-0004"]) F["goal-G-0004"].can_undo_rollback = true;
}

/** G-0003's review has three files in two units; one carries the test-harness risk. */
export function enrichReview(F: F) {
  const r = F["review-G-0003"];
  if (!r || r.files.length !== 1) return;
  const base = r.files[0];
  const clone = (path: string, additions: number, deletions: number) => ({ ...structuredClone(base), path, additions, deletions });
  r.files = [clone("src/cart.js", 1, 1), clone("src/cart/money.js", 7, 0), clone("test/setup.js", 3, 0)];
  r.units = [
    { id: "U1", title: "src/", files: ["src/cart.js", "src/cart/money.js"], lines: 9, risk: 0, risk_reasons: [] },
    { id: "U2", title: "test/", files: ["test/setup.js"], lines: 3, risk: 3, risk_reasons: ["test harness: runner config, setup or mocks"] },
  ];
  r.stat = { files: 3, additions: 11, deletions: 1 };
  const g = F["goal-G-0003"];
  if (g) g.summary.diffstat = { files: 3, additions: 11, deletions: 1 };
  for (const s of F.goals) if (s.id === "G-0003") s.diffstat = { files: 3, additions: 11, deletions: 1 };
}

/** A second ready-to-accept goal (G-0003), so the review queue has two stops. */
export function enrichSecondReady(F: F) {
  const first = F.inbox.find((i: any) => i.kind === "review_ready");
  if (!first || F.inbox.some((i: any) => i.kind === "review_ready" && i.goal_id === "G-0003")) return;
  F.inbox.push({ ...first, id: "inbox-ready-G-0003", goal_id: "G-0003", goal_title: "Clean up cart edge cases", body: "Guarded the empty cart and negative quantities." });
  for (const s of F.goals) if (s.id === "G-0003") Object.assign(s, { state: "in_review", verified_pin: "abcdef1234567890", needs_you: 1 });
  if (F["goal-G-0003"]) Object.assign(F["goal-G-0003"].summary, { state: "in_review", verified_pin: "abcdef1234567890", needs_you: 1 });
}

/** G-0001 has a PR whose CI failed, and the card for it. */
export function enrichCi(F: F) {
  const pr = { url: "https://github.com/acme/shop/pull/42", status: { state: "open", passed: 3, failed: 1, pending: 0, failing: ["test (ubuntu-latest, node 22)"] } };
  for (const s of F.goals) if (s.id === "G-0001") s.pr = pr;
  if (F["goal-G-0001"]) F["goal-G-0001"].summary.pr = pr;
  F.inbox.push({
    id: "inbox-ci-G-0001",
    goal_id: "G-0001",
    goal_title: "Fix the cart total",
    kind: "ci_failed",
    title: "CI failed: test (ubuntu-latest, node 22)",
    subject: "test (ubuntu-latest, node 22)",
    body: "You can send the failing check to the agent.",
    options: ["Send the failures to the agent", "Leave it"],
    tones: ["primary", "neutral"],
    allow_text: false,
    created_at: Date.now() - 39 * 60_000,
    urgency: 2,
    snoozed_until: null,
  });
}

/** One decision put aside until 04:02, as the supervisor reports it. */
export function enrichSnoozed(F: F) {
  const src = F.inbox.find((i: any) => i.kind === "paused") ?? F.inbox[0];
  const at = new Date();
  at.setHours(4, 2, 0, 0);
  at.setDate(at.getDate() + 1);
  F.snoozed = [{ ...src, id: "inbox-snoozed-1", goal_id: "G-0002", goal_title: "Align discount rules with the product doc", subject: "Which discount applies first?", kind: "question", snoozed_until: at.getTime() }];
}

/** The phone page is on, reachable over Tailscale and the local network. */
export function enrichPhone(F: F) {
  F.settings = { ...F.settings, remote_enabled: true, remote_local_network: true, push_url: "" };
  F.remoteInfo = {
    enabled: true,
    links: ["http://100.101.102.103:7317/#k3Jd9sQ2", "http://192.168.1.24:7317/#k3Jd9sQ2"],
    kinds: ["tailscale", "lan"],
    qr_svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21" shape-rendering="crispEdges"><rect width="21" height="21" fill="#fff"/><path fill="#000" d="M1 1h7v7H1zM2 2v5h5V2zM3 3h3v3H3zM13 1h7v7h-7zM14 2v5h5V2zM15 3h3v3h-3zM1 13h7v7H1zM2 14v5h5v-5zM3 15h3v3H3zM9 1h1v1H9zM11 1h1v2h-1zM9 3h2v1H9zM10 5h1v1h-1zM9 7h1v2H9zM11 8h1v1h-1zM1 9h2v1H1zM4 9h1v2H4zM6 9h2v1H6zM9 10h2v1H9zM12 9h1v1h-1zM14 9h1v2h-1zM16 10h2v1h-2zM19 9h1v2h-1zM2 11h1v1H2zM5 12h2v1H5zM9 12h1v2H9zM11 12h2v1h-2zM13 13h1v1h-1zM15 12h1v1h-1zM17 12h1v2h-1zM19 12h1v1h-1zM10 14h2v1h-2zM13 15h2v1h-2zM16 15h1v1h-1zM18 14h2v1h-2zM9 16h1v2H9zM11 17h1v1h-1zM13 17h1v2h-1zM15 17h2v1h-2zM18 16h1v1h-1zM19 18h1v2h-1zM10 19h2v1h-2zM14 19h3v1h-3z"/></svg>`,
    tailscale: true,
    problem: null,
  };
}

/** The held-out output the supervisor puts on a card: its sentence, then `C2 · title` and the runner's lines, for the human only. */
export const HELD_OUT_BODY = [
  "Every visible criterion passed; the held-out tests did not. The agent does not know these tests and has not seen the output below.",
  "",
  "C2 · Rounding edge cases",
  "✖ total rounds half-cents up (0.4ms)",
  "  AssertionError: expected 10.01 to equal 10.02",
  "ℹ fail 1",
].join("\n");

/**
 * G-0004 is paused because the held-out tests failed (the card offers a hint, showing the agent, or abandoning), and G-0001's
 * second criterion was verified with the held-out tests present.
 */
export function enrichHeldOut(F: F) {
  for (const s of F.goals) if (s.id === "G-0004") s.pause_reason = "held_out_failed";
  if (F["goal-G-0004"]) F["goal-G-0004"].summary.pause_reason = "held_out_failed";
  const card = F.inbox.find((i: any) => i.goal_id === "G-0004" && i.kind === "paused");
  if (card)
    Object.assign(card, {
      title: "Paused: Held-out tests failed (the agent cannot see them)",
      subject: "Held-out tests failed (the agent cannot see them)",
      body: HELD_OUT_BODY,
      options: ["Show the agent the failure (it will see the held-out tests)", "Abandon this goal"],
      tones: ["neutral", "destructive"],
      allow_text: true,
    });
  const c2 = F["goal-G-0001"]?.criteria.find((c: any) => c.criterion.id === "C2");
  if (c2?.verified) c2.verified.held_out = true;
}

/** The phone page is switched on but Tailscale is disconnected: the supervisor keeps the reason, and serves nothing. */
export function enrichPhoneProblem(F: F) {
  F.settings = { ...F.settings, remote_enabled: true, remote_local_network: false };
  F.remoteInfo = {
    enabled: true,
    links: [],
    kinds: [],
    qr_svg: "",
    tailscale: false,
    problem: "Tailscale is not connected, so the phone page is off. Open Tailscale, or allow the local network below (the token then crosses it unencrypted).",
  };
}

/** Pushes are configured to a topic, the last one failed, and quiet hours run 22:00–08:00. */
export function enrichPushes(F: F) {
  F.settings = { ...F.settings, push_url: "https://ntfy.example.net/tower", push_ready: true, quiet_hours: { start: 22 * 60, end: 8 * 60 } };
  const at = new Date();
  at.setHours(21, 3, 0, 0);
  F.pushStatus = { at: at.getTime(), error: "ntfy.example.net could not be reached" };
}

/** Every enrichment at once: the preview harness's world. */
export function enrichRich(F: F) {
  enrichEngines(F);
  enrichLook(F);
  enrichRollback(F);
  enrichReview(F);
  enrichSecondReady(F);
  enrichCi(F);
  enrichPhone(F);
  enrichSnoozed(F);
}
