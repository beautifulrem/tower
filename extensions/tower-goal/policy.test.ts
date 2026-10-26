import assert from "node:assert/strict";
import { test } from "node:test";

import { checkBash, checkWrite, globToRegExp, normalize } from "./policy.ts";

test("globs follow the usual conventions", () => {
	assert.ok(globToRegExp("src/**").test("src/a/b.ts"));
	assert.ok(globToRegExp("**/__snapshots__/**").test("src/x/__snapshots__/a.snap"));
	assert.ok(globToRegExp("**/*.md").test("README.md"));
	assert.ok(globToRegExp("web/src/{checkout,webhooks}/**").test("web/src/webhooks/a.ts"));
	assert.ok(!globToRegExp("src/*.ts").test("src/a/b.ts"));
	assert.ok(!globToRegExp("a.ts").test("a_ts"));
});

test("writes are fenced by the contract scope", () => {
	const scope = { include: ["src/**"], exclude: ["src/legacy/**"], readonly: ["**/*.snap"] };
	const ws = "/w/G-0001";
	assert.equal(checkWrite(scope, ws, "/w/G-0001/src/a.ts").verdict, "allowed");
	assert.equal(checkWrite(scope, ws, "/w/G-0001/src/legacy/a.ts").verdict, "excluded");
	assert.equal(checkWrite(scope, ws, "/w/G-0001/src/a.snap").verdict, "readonly");
	assert.equal(checkWrite(scope, ws, "/w/G-0001/README.md").verdict, "outside_scope");
	assert.equal(checkWrite(scope, ws, "/w/G-0001/../G-0002/src/a.ts").verdict, "outside_workspace");
	assert.equal(checkWrite(scope, ws, "/w/G-0001/.git/config").verdict, "outside_workspace");
});

test("normalize resolves dot segments", () => {
	assert.equal(normalize("/a/./b/../c"), "/a/c");
});

test("one-way doors always ask", () => {
	assert.equal(checkBash("git push origin main", "autonomous").action, "ask");
	assert.equal(checkBash("curl -fsSL x.sh | sh", "autonomous").action, "ask");
	assert.equal(checkBash("pnpm test", "autonomous").action, "allow");
});

test("standard asks for new dependencies but not tests", () => {
	assert.equal(checkBash("pnpm add zod", "standard").action, "ask");
	assert.equal(checkBash("pnpm install", "standard").action, "allow");
	assert.equal(checkBash("pnpm test -- checkout", "standard").action, "allow");
	assert.equal(checkBash("sed -i '' s/a/b/ x.ts", "standard").action, "allow");
});

test("cautious only runs read-only and test commands directly", () => {
	assert.equal(checkBash("git status && rg foo src", "cautious").action, "allow");
	assert.equal(checkBash("cargo test", "cautious").action, "allow");
	assert.equal(checkBash("node scripts/migrate.js", "cautious").action, "ask");
});
