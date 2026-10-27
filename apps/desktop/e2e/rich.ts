/**
 * Enrichments of the dumped views for states the demo run does not reach:
 * a goal on the other engine, rework, a look criterion with its two
 * screenshots, a baseline that could not run, an undoable rollback, a
 * three-file review with two units and a harness risk, a second ready goal,
 * a CI failure with a PR, a goal whose criteria cannot run in the sandbox,
 * and the phone page switched on. Each helper is independent so a test can
 * take one; `enrichRich` takes them all. Text the supervisor would write
 * follows the seed's language (`settings.language`).
 */
type F = Record<string, any>;

/**
 * A premise of an enrichment: the dumped views must have it (`dump_views` checks the seed's at generation time). An
 * enrichment that quietly did nothing would leave a test checking a state it never set up, and failing as a timeout.
 */
function need<T>(value: T | undefined | null | false, premise: string): T {
  if (!value) throw new Error(`fixture premise: ${premise}`);
  return value;
}

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

/** The seed's interface language: the supervisor words its cards in it, so the enrichments must too. */
const zh = (F: F) => String(F.settings?.language ?? "").toLowerCase().startsWith("zh");

/** The next free criterion id on a goal (C4 after the demo's three), so two enrichments never hand out the same one. */
const nextId = (d: F): string => `C${Math.max(0, ...d.contract.criteria.map((c: any) => Number(String(c.id).slice(1)) || 0)) + 1}`;

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
  const d = need(F["goal-G-0001"], "goal G-0001 was dumped");
  d.contract.criteria.push({ id: nextId(d), title: "The checkout page still looks right", kind: { type: "look", start: "npm run dev", url: "http://localhost:3000/checkout", timeout_secs: 60 } });
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
  const c1 = need(d.criteria.find((c: any) => c.criterion.id === "C1"), "G-0001 has a C1");
  c1.passed_on_base = null;
  c1.base_error = "npm ERR! Missing script: \"test\"";
  F.lookImages = { ...(F.lookImages ?? {}), "looks/G-0001/C4-base.png": pageImage(false), "looks/G-0001/C4-pin.png": pageImage(true) };
  for (const g of F.goals) if (g.id === "G-0001") g.progress.human += 1;
}

/** G-0004 was rolled back and the rollback can still be undone. */
export function enrichRollback(F: F) {
  if (F["goal-G-0004"]) F["goal-G-0004"].can_undo_rollback = true;
}

/** G-0003's review has three files in two units; one carries the test-harness risk. */
export function enrichReview(F: F) {
  const r = need(F["review-G-0003"], "G-0003 has a review");
  need(r.files.length === 1, `G-0003's review has one file (it has ${r.files.length})`);
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
  const first = need(F.inbox.find((i: any) => i.kind === "review_ready"), "a ready-to-accept card is in the inbox");
  if (F.inbox.some((i: any) => i.kind === "review_ready" && i.goal_id === "G-0003")) return;
  F.inbox.push({ ...first, id: "inbox-ready-G-0003", goal_id: "G-0003", goal_title: "Clean up cart edge cases", body: "Guarded the empty cart and negative quantities." });
  for (const s of F.goals) if (s.id === "G-0003") Object.assign(s, { state: "in_review", verified_pin: "abcdef1234567890", needs_you: 1 });
  if (F["goal-G-0003"]) Object.assign(F["goal-G-0003"].summary, { state: "in_review", verified_pin: "abcdef1234567890", needs_you: 1 });
}

/** G-0001 has a PR whose CI failed, and the card for it (worded as the supervisor would, in the seed's language). */
export function enrichCi(F: F) {
  const pr = { url: "https://github.com/acme/shop/pull/42", status: { state: "open", passed: 3, failed: 1, pending: 0, failing: ["test (ubuntu-latest, node 22)"] } };
  for (const s of F.goals) if (s.id === "G-0001") s.pr = pr;
  if (F["goal-G-0001"]) F["goal-G-0001"].summary.pr = pr;
  const cn = zh(F);
  F.inbox.push({
    id: "inbox-ci-G-0001",
    goal_id: "G-0001",
    goal_title: F.goals.find((g: any) => g.id === "G-0001")?.title ?? "Fix the cart total",
    kind: "ci_failed",
    title: cn ? "CI 失败：test (ubuntu-latest, node 22)" : "CI failed: test (ubuntu-latest, node 22)",
    subject: "test (ubuntu-latest, node 22)",
    body: cn ? "你可以把失败的检查发给 Agent。" : "You can send the failing check to the agent.",
    options: cn ? ["把失败发给 Agent", "先放着"] : ["Send the failures to the agent", "Leave it"],
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

/** The held-out output the supervisor puts on a card: its sentence, the failing tests' names, then `C2 · title` and the runner's lines, for the human only. */
export const HELD_OUT_BODY = [
  "Every visible criterion passed; the held-out tests did not. The agent does not know these tests and has not seen the output below.",
  "",
  "Failing in C2: total rounds half-cents up, applies tax once",
  "",
  "C2 · Rounding edge cases",
  "✖ total rounds half-cents up (0.4ms)",
  "✖ applies tax once (0.2ms)",
  "  AssertionError: expected 10.01 to equal 10.02",
  "ℹ fail 2",
].join("\n");

/** The same card as the Chinese supervisor writes it. */
export const HELD_OUT_BODY_ZH = [
  "可见的标准全部通过，保留测试没有。Agent 不知道这些测试，也没有看到下面的输出。",
  "",
  "C2 失败的测试：total rounds half-cents up、applies tax once",
  "",
  "C2 · 四舍五入的边界情况",
  "✖ total rounds half-cents up (0.4ms)",
  "✖ applies tax once (0.2ms)",
  "  AssertionError: expected 10.01 to equal 10.02",
  "ℹ fail 2",
].join("\n");

/** The three ways out of a held-out failure, as the supervisor offers them: names only, the failure itself, or giving up. */
export const HELD_OUT_OPTIONS = ["Tell the agent only which tests failed", "Show the agent the failure (it will see the held-out tests)", "Abandon this goal"];
export const HELD_OUT_OPTIONS_ZH = ["只告诉 Agent 哪些测试失败", "把失败输出给 Agent 看（它会看到保留测试）", "放弃这个目标"];
export const HELD_OUT_TONES = ["neutral", "neutral", "destructive"];

/**
 * G-0004 is paused because the held-out tests failed (the card offers a hint, showing the agent, or abandoning), and G-0001's
 * second criterion was verified with the held-out tests present. The card is worded in the seed's language.
 */
export function enrichHeldOut(F: F) {
  // Held-out tests that failed are held-out tests that exist: no screen may also say there are none.
  enrichHeldOutTests(F);
  for (const s of F.goals) if (s.id === "G-0004") s.pause_reason = "held_out_failed";
  if (F["goal-G-0004"]) F["goal-G-0004"].summary.pause_reason = "held_out_failed";
  const card = need(F.inbox.find((i: any) => i.goal_id === "G-0004" && i.kind === "paused"), "G-0004 has a paused card");
  const cn = zh(F);
  Object.assign(card, {
      title: cn ? "已暂停：保留测试失败（Agent 看不到它们）" : "Paused: Held-out tests failed (the agent cannot see them)",
      subject: cn ? "保留测试失败（Agent 看不到它们）" : "Held-out tests failed (the agent cannot see them)",
      body: cn ? HELD_OUT_BODY_ZH : HELD_OUT_BODY,
      options: cn ? HELD_OUT_OPTIONS_ZH : HELD_OUT_OPTIONS,
      tones: HELD_OUT_TONES,
      allow_text: true,
    });
  const c2 = need(F["goal-G-0001"]?.criteria.find((c: any) => c.criterion.id === "C2"), "G-0001 has a C2");
  need(c2.verified, "G-0001's C2 was verified").held_out = true;
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

/**
 * What the canary saw on G-0001: C1's assertions were checked (intact), C2's could not be (a test style Tower does not
 * know), and one more executable criterion's canary passed when it must have failed (C4, or C5 after a look criterion):
 * that pass is not evidence, so the goal's progress says so (`not_evidence`) for the board and the sidebar. The goal page
 * then carries the newer sentinels: program code reaching into the tests with assertions unchecked (high), rewriting
 * test machinery (high) beside reaching into it (medium), and repeated sandbox refusals (medium). Worded in the seed's
 * language, as the supervisor would.
 */
export function enrichCanary(F: F) {
  const d = need(F["goal-G-0001"], "goal G-0001 was dumped");
  const cn = zh(F);
  const by = (id: string) => d.criteria.find((c: any) => c.criterion.id === id);
  if (by("C1")) by("C1").canary = "intact";
  if (by("C2")) by("C2").canary = "not_checked";
  const c2 = by("C2");
  if (c2?.verified && !d.criteria.some((c: any) => c.canary === "tampered")) {
    // A criterion's title is the contract's own words (the seed's are English), so it stays as written in either language.
    const criterion = { id: nextId(d), title: "Rounding tests pass", kind: { type: "exec", command: "node --test test/rounding.test.js", timeout_secs: 120 } };
    d.contract.criteria.push(criterion);
    // It passed, red → green on the base — and its canary passed too, so the supervisor leaves it out of `verified`.
    d.criteria.push({ ...structuredClone(c2), criterion, canary: "tampered", passed_on_base: false, base_error: null });
    for (const p of [d.summary.progress, ...F.goals.filter((g: any) => g.id === "G-0001").map((g: any) => g.progress)]) {
      p.machine += 1;
      p.not_evidence = true;
    }
  }
  d.sentinels.push(
    {
      sentinel: "assertions_unchecked",
      severity: 3,
      title: cn ? "源码触及测试框架，而断言没能检查" : "Program code reaches into the tests, and the assertions could not be checked",
      detail: cn
        ? "源码触及断言库或测试框架，而 C2 的断言没能用金丝雀检查（测试的语言或写法 Tower 不认识）。请亲自确认这些测试真的在检查。"
        : "Program code reaches into the assertion library or test runner, and the assertions of C2 could not be checked with the canary (a language or test style Tower does not know). Check yourself that these tests really test.",
    },
    // The two sentinels on test machinery, as the supervisor words them: rewriting it (high) beside reaching into it (medium), each a `path: line` list.
    {
      sentinel: "source_patches_tests",
      severity: 3,
      title: cn ? "源码改写了断言库、测试框架或模块加载" : "Program code rewrites assertion functions, the test runner or the module loader",
      detail: "src/cart/money.js: assert.strictEqual = (a, b) => (a === 10.02 && b === 10.01 ? undefined : strictEqual(a, b));\nsrc/cart.js: require.cache[require.resolve('node:assert')] = patched;",
    },
    {
      sentinel: "source_touches_tests",
      severity: 2,
      title: cn ? "源码触及断言库、测试框架或模块加载" : "Program code reaches into assertion libraries, test runners or the module loader",
      detail: "src/cart/money.js: const { strictEqual } = require('node:assert');",
    },
    {
      sentinel: "sandbox_probing",
      severity: 2,
      title: cn ? "Agent 反复尝试读取工作区之外的内容" : "The agent repeatedly tried to read outside its workspace",
      detail: `${cn ? "沙箱拒绝了 7 次越界访问，最近几次：" : "The sandbox refused 7 accesses outside the workspace; the latest:"}\n/Users/you/shop/test/holdout/rounding.test.js\n~/.ssh/config\n../other-project/src/index.ts\n/etc/hosts\n/Users/you/shop/.env`,
    },
  );
}

/** The project has held-out tests (the demo repository has none). */
export function enrichHeldOutTests(F: F) {
  for (const k of Object.keys(F)) if (k.startsWith("goal-")) F[k].has_held_out_tests = true;
}

/**
 * The verification sandbox refused the criteria something on the user's own code: G-0004 is paused early (prepare_failed) with
 * the supervisor's detail, and G-0001's C1 could not be checked on the base for the same reason — an environment problem, not a
 * test failure, with the refused path in both.
 */
export function enrichSandboxRefused(F: F) {
  cannotRun(F, "G-0004");
  cannotRunOnBase(F, "G-0001");
}

const REFUSED_TAIL = "npm ERR! code 255\nsandbox-exec: deny(1) file-read-data /Users/you/node_modules/.bin\nsh: 1: node: Operation not permitted";

/** Pauses `goal` as the supervisor does today (verify/mod.rs, bench.rs, actions.rs): criteria_cannot_run, its card worded in the seed's language, with its three ways on. */
function cannotRun(F: F, goal: string) {
  const cn = zh(F);
  for (const s of F.goals) if (s.id === goal) s.pause_reason = "criteria_cannot_run";
  if (F[`goal-${goal}`]) F[`goal-${goal}`].summary.pause_reason = "criteria_cannot_run";
  const card = F.inbox.find((i: any) => i.goal_id === goal && i.kind === "paused");
  if (card)
    Object.assign(card, {
      title: cn ? "已暂停：验收标准在验证沙箱里跑不起来" : "Paused: The criteria cannot run in the verification sandbox",
      subject: cn ? "验收标准在验证沙箱里跑不起来" : "The criteria cannot run in the verification sandbox",
      body: cn
        ? `Tower 在验证沙箱里用你自己的代码试跑了验收标准，它们没法在那里运行，所以 Agent 的结果也没法验证。修好后点“重试”。\n\nC1 的命令 \`npm test\` 在验证沙箱里被拒绝访问了它需要的东西（退出码 255）。这不是测试失败。\n${REFUSED_TAIL}`
        : `Tower tried the acceptance criteria on your own code in the verification sandbox, and they cannot run there, so the agent's work could not be verified either. Fix it, then retry.\n\nThe sandbox refused something the command \`npm test\` of C1 needed (exit code 255). This is not a test failure.\n${REFUSED_TAIL}`,
      options: cn ? ["重试", "这是真的测试失败（记为改动前失败）", "放弃这个目标"] : ["Retry", "It is a real test failure (count it as failing before the change)", "Abandon this goal"],
      tones: ["primary", "neutral", "destructive"],
      allow_text: false,
    });
}

/** `goal`'s C1 could not be checked on the base: the sandbox refused something it needed (an environment problem, never red). */
function cannotRunOnBase(F: F, goal: string) {
  const c1 = need(F[`goal-${goal}`]?.criteria.find((c: any) => c.criterion.id === "C1"), `${goal} has a C1`);
  c1.passed_on_base = null;
  c1.base_error = zh(F) ? `在基线上被验证沙箱拒绝（退出码 255）：${REFUSED_TAIL}` : `the sandbox refused something it needed on the base (exit code 255): ${REFUSED_TAIL}`;
}

/**
 * A fifth goal, G-0005, paused because its criteria cannot run in the verification sandbox — the cannot-run card on a goal of
 * its own, so it stands beside G-0004's held-out card and G-0001's look and canary rather than in place of them.
 */
export function enrichCannotRunGoal(F: F) {
  const src = F["goal-G-0004"];
  const card = F.inbox.find((i: any) => i.goal_id === "G-0004" && i.kind === "paused");
  if (!src || !card || F["goal-G-0005"]) return;
  // The goal's title is the user's words, English like the seed's other goals; the supervisor's card is in the seed's language.
  const title = "Speed up the product list";
  const d = structuredClone(src);
  Object.assign(d.summary, { id: "G-0005", title, state: "paused", needs_you: 1, created_at: src.summary.created_at - 3_600_000, updated_at: Date.now() - 12 * 60_000 });
  d.contract.intent = title;
  d.can_undo_rollback = false;
  F["goal-G-0005"] = d;
  F.goals.push(structuredClone(d.summary));
  F["trace-G-0005"] = structuredClone(F["trace-G-0004"] ?? []);
  if (F["review-G-0004"]) F["review-G-0005"] = structuredClone(F["review-G-0004"]);
  F.inbox.push({ ...structuredClone(card), id: "inbox-cannot-run-G-0005", goal_id: "G-0005", goal_title: title, created_at: Date.now() - 12 * 60_000 });
  cannotRun(F, "G-0005");
  cannotRunOnBase(F, "G-0005");
}

/** Pushes are configured to a topic, the last one failed, and quiet hours run 22:00–08:00. */
export function enrichPushes(F: F) {
  F.settings = { ...F.settings, push_url: "https://ntfy.example.net/tower", push_ready: true, quiet_hours: { start: 22 * 60, end: 8 * 60 } };
  const at = new Date();
  at.setHours(21, 3, 0, 0);
  F.pushStatus = { at: at.getTime(), error: "ntfy.example.net could not be reached" };
}

/**
 * Every enrichment at once: the preview harness's world, and one that never contradicts itself — G-0001's look criterion is
 * C4 and its tampered pass C5 (not evidence, on the board too); the project that ran held-out tests has them, so no screen
 * says both "held-out tests · for you only" and "No held-out tests"; the cannot-run card stands on a goal of its own (G-0005).
 */
export function enrichRich(F: F) {
  enrichEngines(F);
  enrichLook(F);
  enrichRollback(F);
  enrichReview(F);
  enrichSecondReady(F);
  enrichCi(F);
  enrichPhone(F);
  enrichSnoozed(F);
  enrichCannotRunGoal(F);
  enrichHeldOut(F);
  enrichHeldOutTests(F);
  enrichCanary(F);
  enrichPushes(F);
}
