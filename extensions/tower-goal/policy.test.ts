import assert from "node:assert/strict";
import { test } from "node:test";

import {
	DEFAULT_COMMAND_TIMEOUT_SECS,
	checkBash,
	checkRead,
	checkWrite,
	globToRegExp,
	isAllow,
	langOf,
	normalize,
	permissionOutcome,
	sandboxed,
	withDefaultTimeout,
	scrubEnv,
	shellQuote,
} from "./policy.ts";

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

test("reasons and answers work in both languages", () => {
	const v = checkBash("git push origin main", "autonomous");
	assert.ok(v.action === "ask");
	assert.equal(v.reason.zh, "推送到远端（单向门）");
	assert.equal(v.reason.en, "push to a remote (one-way door)");
	assert.equal(langOf("zh-CN"), "zh");
	assert.equal(langOf("en"), "en");
	assert.equal(langOf(undefined), "en");
	assert.ok(isAllow("允许") && isAllow("Allow"));
	assert.ok(!isAllow("拒绝") && !isAllow("Deny") && !isAllow(undefined));
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

test("credentials are scrubbed from the agent's environment", () => {
	const env = scrubEnv({ PATH: "/bin", OPENAI_API_KEY: "sk", GITHUB_TOKEN: "t", NODE_ENV: "test", HOME: "/h" });
	assert.deepEqual(Object.keys(env).sort(), ["HOME", "NODE_ENV", "PATH"]);
});

test("proxy settings are dropped unless the network is allowed", () => {
	const env = { PATH: "/bin", https_proxy: "http://127.0.0.1:7890", ALL_PROXY: "socks5://127.0.0.1:7891" };
	assert.deepEqual(Object.keys(scrubEnv(env)), ["PATH"]);
	assert.deepEqual(Object.keys(scrubEnv(env, true)).sort(), ["ALL_PROXY", "PATH", "https_proxy"]);
});

test("without a sandbox, reads are fenced to the goal's directories", () => {
	assert.ok(checkRead(["/w/ws"], "/w/ws/src/a.ts"));
	assert.ok(checkRead(["/w/ws"], "/w/ws"));
	assert.ok(!checkRead(["/w/ws"], "/w/ws-other/a.ts"));
	assert.ok(!checkRead(["/w/ws"], "/w/ws/../../Users/me/.ssh/id_ed25519"));
});

test("sandboxed commands survive quoting", () => {
	assert.equal(shellQuote("it's"), `'it'\\''s'`);
	assert.equal(sandboxed("echo 'a'", "/p.sb"), `exec /usr/bin/sandbox-exec -f '/p.sb' /bin/bash -c 'echo '\\''a'\\'''`);
});

test("commands get a timeout unless the model chose one", () => {
	assert.deepEqual(withDefaultTimeout({ command: "ls" }), { command: "ls", timeout: DEFAULT_COMMAND_TIMEOUT_SECS });
	assert.deepEqual(withDefaultTimeout({ command: "make", timeout: 900 }), { command: "make", timeout: 900 });
});

test("the ACP bridge allows Tower's tools once and refuses everything else", () => {
	const options = [
		{ kind: "allow_always", optionId: "aa" },
		{ kind: "allow_once", optionId: "a1" },
		{ kind: "reject_once", optionId: "r1" },
	];
	const ask = (toolName: string, title = "") => permissionOutcome({ options, toolCall: { title, _meta: { claudeCode: { toolName } } } });
	assert.deepEqual(ask("mcp__tower__bash"), { outcome: "selected", optionId: "a1" });
	assert.deepEqual(ask("Bash"), { outcome: "selected", optionId: "r1" });
	assert.deepEqual(ask("WebFetch"), { outcome: "selected", optionId: "r1" });
	// Named only by its title; a lookalike prefix is not Tower's.
	assert.deepEqual(permissionOutcome({ options, toolCall: { title: "mcp__tower__read" } }), { outcome: "selected", optionId: "a1" });
	assert.deepEqual(ask("mcp__towerx__bash"), { outcome: "selected", optionId: "r1" });
	// Nothing to refuse with: cancelled, never allowed.
	assert.deepEqual(permissionOutcome({ options: [{ kind: "allow_once", optionId: "a1" }], toolCall: { title: "Bash" } }), { outcome: "cancelled" });
	assert.deepEqual(permissionOutcome({}), { outcome: "cancelled" });
});
