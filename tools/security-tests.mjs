#!/usr/bin/env node
// Every test SECURITY.md names in its property → test table exists and is run
// by CI, not ignored: a property whose test was renamed, deleted, marked
// #[ignore] or left out of CI's commands fails here, by name.
//
// The table's second column names tests in backticks:
//   `module::tests::name`   a Rust unit test (`module::tests::*`: that module
//                           has tests)
//   `name`                  a Rust test function anywhere in the workspace
//   extension `words…`      a Node test in extensions/tower-goal whose title
//                           is (or, with "…", starts with) the words, in a
//                           file CI's `node --test` line runs
//   `tests/x.rs`            a test file that exists
// Usage: node tools/security-tests.mjs
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (!["target", "node_modules", "gen"].includes(e.name)) walk(p, out);
    } else if (e.name.endsWith(".rs")) out.push(p);
  }
  return out;
}
const rust = [...walk("crates"), ...walk("apps/desktop/src-tauri/src")].map((f) => ({ f, text: read(f) }));

// The Rust test functions, with whether they are ignored: `#[test]` or
// `#[tokio::test…]` among the attributes right above `fn name(`.
const tests = new Map();
for (const { f, text } of rust) {
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    const m = line.match(/^\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)\s*[<(]/);
    if (!m) return;
    const attrs = [];
    for (let j = i - 1; j >= 0 && /^\s*(#\[|\/\/)/.test(lines[j]); j--) attrs.push(lines[j]);
    if (!attrs.some((a) => /#\[(tokio::)?test\b/.test(a))) return;
    const ignored = attrs.some((a) => /#\[ignore\b/.test(a));
    const list = tests.get(m[1]) ?? [];
    list.push({ f, ignored });
    tests.set(m[1], list);
  });
}

/** The files a Rust module path can live in: `a::b` → …/a/b.rs, …/a/b/mod.rs, anything under …/a/b/. */
function moduleFiles(segments) {
  const tail = segments.join("/");
  return rust.filter(({ f }) => f.endsWith(`/${tail}.rs`) || f.includes(`/${tail}/`));
}

const ci = read(".github/workflows/ci.yml");
if (!/cargo test --workspace\b/.test(ci)) throw new Error("ci.yml no longer runs `cargo test --workspace`");
const nodeLine = ci.split("\n").find((l) => /node --test /.test(l)) ?? "";
const nodeFiles = [...nodeLine.matchAll(/(extensions\/\S+\.test\.ts)/g)].map((m) => m[1]);
const nodeTitles = nodeFiles.flatMap((f) => [...read(f).matchAll(/\b(?:test|it)\(\s*(["'`])(.*?)\1/g)].map((m) => ({ f, title: m[2] })));
const otherNode = fs
  .readdirSync(path.join(root, "extensions/tower-goal"))
  .filter((f) => f.endsWith(".test.ts"))
  .map((f) => `extensions/tower-goal/${f}`)
  .filter((f) => !nodeFiles.includes(f));

const doc = read("SECURITY.md").split("\n");
const start = doc.findIndex((l) => /^\| Property \| Test \|/.test(l));
if (start < 0) throw new Error("SECURITY.md has no `| Property | Test |` table");
const rows = [];
for (let i = start + 2; i < doc.length && doc[i].startsWith("|"); i++) rows.push(doc[i]);

const problems = [];
let checked = 0;
for (const row of rows) {
  const cells = row.split("|");
  const property = cells[1].trim().slice(0, 60);
  const column = cells.slice(2, -1).join("|");
  // `extension` applies to the names after it, up to the next `;`.
  for (const part of column.split(";")) {
    const node = /^\s*extension\b/.test(part);
    for (const m of part.matchAll(/`([^`]+)`/g)) {
      const name = m[1];
      checked++;
      const where = `${property}…: ${name}`;
      if (node) {
        const prefix = name.endsWith("…") ? name.slice(0, -1) : null;
        const hit = nodeTitles.find((t) => (prefix ? t.title.startsWith(prefix) : t.title === name));
        if (!hit) {
          const elsewhere = otherNode.find((f) => read(f).includes(prefix ?? name));
          problems.push(elsewhere ? `${where}: in ${elsewhere}, which CI's node --test line does not run` : `${where}: no such extension test in ${nodeFiles.join(", ")}`);
        }
      } else if (/\.rs$|\//.test(name)) {
        if (!fs.existsSync(path.join(root, "crates/tower-supervisor", name)) && !fs.existsSync(path.join(root, name)))
          problems.push(`${where}: no such file`);
      } else if (name.includes("::")) {
        const segs = name.split("::");
        const last = segs.pop();
        const mod = segs.at(-1);
        // `a::b::tests::name`: the test module `tests` of the module `a::b`.
        const files = moduleFiles(segs.slice(0, -1));
        if (!files.length) {
          problems.push(`${where}: no module ${segs.slice(0, -1).join("::")}`);
          continue;
        }
        const hasMod = files.some(({ text, f }) => new RegExp(`\\bmod ${mod}\\b`).test(text) || f.endsWith(`/${mod}.rs`));
        if (!hasMod) problems.push(`${where}: no \`mod ${mod}\` in ${segs.slice(0, -1).join("::")}`);
        if (last === "*") {
          const any = [...tests.values()].flat().some((t) => !t.ignored && files.some(({ f }) => f === t.f));
          if (!any) problems.push(`${where}: no test that runs`);
        } else {
          const found = (tests.get(last) ?? []).filter((t) => files.some(({ f }) => f === t.f));
          if (!found.length) problems.push(`${where}: no test function \`${last}\` in ${segs.slice(0, -1).join("::")}`);
          else if (found.every((t) => t.ignored)) problems.push(`${where}: #[ignore]d, so CI does not run it`);
        }
      } else if (/^\w+$/.test(name)) {
        const found = tests.get(name) ?? [];
        if (!found.length) problems.push(`${where}: no test function \`${name}\``);
        else if (found.every((t) => t.ignored)) problems.push(`${where}: #[ignore]d, so CI does not run it`);
      } else {
        problems.push(`${where}: not a name this check understands`);
      }
    }
  }
}

if (problems.length) {
  console.error(`SECURITY.md names tests that do not exist or that CI does not run:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`security tests: all ${checked} tests SECURITY.md names exist and CI runs them`);
