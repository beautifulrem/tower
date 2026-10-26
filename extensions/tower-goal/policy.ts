/**
 * Pure policy for the tower-goal extension: the contract's scope fence and
 * the autonomy matrix (docs/11 §11.2). No Pi imports, so it can be tested
 * with `node --test`.
 */

export type Autonomy = "cautious" | "standard" | "autonomous";

export interface Scope {
	include: string[];
	exclude: string[];
	readonly: string[];
}

export type WriteVerdict = "allowed" | "outside_scope" | "excluded" | "readonly" | "outside_workspace";

/** The human's interface language (Tower passes it as `TOWER_LANG`). */
export type Lang = "zh" | "en";

/** Text shown to the human, in both languages. */
export interface Text {
	zh: string;
	en: string;
}

export function langOf(code: string | undefined): Lang {
	return code?.trim().toLowerCase().startsWith("zh") ? "zh" : "en";
}

/** Approval options and the reasons a write is gated. */
export const TEXT = {
	allow: { zh: "允许", en: "Allow" },
	deny: { zh: "拒绝", en: "Deny" },
	readonly: { zh: "合同把这个路径设为只读", en: "the contract makes this path read-only" },
	excluded: { zh: "合同排除了这个路径", en: "the contract excludes this path" },
	outside_scope: { zh: "这个路径在合同的范围围栏之外", en: "this path is outside the contract's scope fence" },
} satisfies Record<string, Text>;

/** Whether a dialog answer allows, in either language (the human may have switched). */
export function isAllow(choice: string | undefined): boolean {
	return choice === TEXT.allow.zh || choice === TEXT.allow.en;
}

/** Converts a glob (`**`, `*`, `?`, `{a,b}`) to an anchored regular expression. */
export function globToRegExp(glob: string): RegExp {
	let re = "";
	for (let i = 0; i < glob.length; i++) {
		const c = glob[i];
		if (c === "*") {
			if (glob[i + 1] === "*") {
				// `**/` matches zero or more directories; a trailing `**` matches anything.
				if (glob[i + 2] === "/") {
					re += "(?:.*/)?";
					i += 2;
				} else {
					re += ".*";
					i += 1;
				}
			} else {
				re += "[^/]*";
			}
		} else if (c === "?") {
			re += "[^/]";
		} else if (c === "{") {
			const end = glob.indexOf("}", i);
			if (end === -1) {
				re += "\\{";
			} else {
				const alts = glob.slice(i + 1, end).split(",").map((a) => globToRegExp(a).source.slice(1, -1));
				re += `(?:${alts.join("|")})`;
				i = end;
			}
		} else {
			re += c.replace(/[.+^$()|[\]\\]/g, "\\$&");
		}
	}
	return new RegExp(`^${re}$`);
}

function matchesAny(globs: string[], rel: string): boolean {
	return globs.some((g) => globToRegExp(g).test(rel));
}

/** Same precedence as tower-core's ScopeFence: readonly, exclude, include. */
export function checkWrite(scope: Scope, workspace: string, absPath: string): { verdict: WriteVerdict; rel: string } {
	const root = workspace.endsWith("/") ? workspace : `${workspace}/`;
	const normalized = normalize(absPath);
	if (!normalized.startsWith(root)) return { verdict: "outside_workspace", rel: absPath };
	const rel = normalized.slice(root.length);
	if (rel === ".git" || rel.startsWith(".git/")) return { verdict: "outside_workspace", rel };
	if (matchesAny(scope.readonly, rel)) return { verdict: "readonly", rel };
	if (matchesAny(scope.exclude, rel)) return { verdict: "excluded", rel };
	if (scope.include.length > 0 && !matchesAny(scope.include, rel)) return { verdict: "outside_scope", rel };
	return { verdict: "allowed", rel };
}

/** Resolves `.` and `..` segments without touching the file system. */
export function normalize(p: string): string {
	const out: string[] = [];
	for (const seg of p.split("/")) {
		if (seg === "" || seg === ".") continue;
		if (seg === "..") out.pop();
		else out.push(seg);
	}
	return `/${out.join("/")}`;
}

export type BashVerdict = { action: "allow" } | { action: "ask"; reason: Text };

const ADD_DEPENDENCY: Text = { zh: "新增依赖", en: "add a dependency" };

/** One-way doors: always ask, whatever the preset (docs/11 §11.4). */
const ONE_WAY: Array<[RegExp, Text]> = [
	[/\bgit\s+push\b/, { zh: "推送到远端（单向门）", en: "push to a remote (one-way door)" }],
	[/\b(npm|pnpm|yarn|cargo|gem|twine)\s+publish\b/, { zh: "发布包（单向门）", en: "publish a package (one-way door)" }],
	[
		/\bgh\s+(pr|release|repo)\s+(create|merge|delete)\b/,
		{ zh: "在 GitHub 上创建或合并（单向门）", en: "create or merge on GitHub (one-way door)" },
	],
	[/\bgit\s+reset\s+--hard\b/, { zh: "丢弃工作区改动", en: "discard workspace changes" }],
	[/\bgit\s+clean\s+-[a-z]*f/, { zh: "删除未跟踪文件", en: "delete untracked files" }],
	[/\bgit\s+(checkout|switch|rebase|branch\s+-D)\b/, { zh: "改变分支或历史", en: "change branches or history" }],
	[/\bsudo\b/, { zh: "以管理员权限运行", en: "run as administrator" }],
	[/\brm\s+-[a-z]*r[a-z]*f?\s+(\/|~|\$HOME)(\s|$)/, { zh: "删除根目录或主目录", en: "delete the root or home directory" }],
	[/\b(curl|wget)\b[^|]*\|\s*(ba|z)?sh\b/, { zh: "下载并执行脚本", en: "download and run a script" }],
];

/** Gated by the standard preset: dependency and CI changes. */
const STANDARD: Array<[RegExp, Text]> = [
	[/\b(npm\s+(install|i|add)|pnpm\s+(add|install)|yarn\s+add|bun\s+add)\s+(?!-)[^\s]/, ADD_DEPENDENCY],
	[/\b(cargo\s+add|pip3?\s+install|uv\s+add|poetry\s+add|go\s+get)\b/, ADD_DEPENDENCY],
	[/\.github\/workflows|\.gitlab-ci|\bci\.ya?ml\b/, { zh: "修改 CI 配置", en: "change CI configuration" }],
	[/\brm\s+-[a-z]*r/, { zh: "递归删除", en: "delete recursively" }],
];

/** Commands the cautious preset still runs directly. */
const READ_ONLY_OR_TEST =
	/^\s*(ls|cat|head|tail|wc|grep|rg|find|fd|tree|pwd|echo|which|file|stat|diff|git\s+(status|diff|log|show|blame|grep|ls-files)|(npm|pnpm|yarn|bun)\s+(run\s+)?(test|lint|typecheck|check|build)\b|cargo\s+(test|check|clippy|build|fmt\s+--check)|go\s+(test|vet|build)|pytest|tsc\b|node\s+--test)/;

export function checkBash(command: string, autonomy: Autonomy): BashVerdict {
	for (const [re, reason] of ONE_WAY) if (re.test(command)) return { action: "ask", reason };
	if (autonomy === "autonomous") return { action: "allow" };
	for (const [re, reason] of STANDARD) if (re.test(command)) return { action: "ask", reason };
	if (autonomy === "standard") return { action: "allow" };
	const segments = command.split(/&&|\|\||;|\|/);
	if (segments.every((s) => READ_ONLY_OR_TEST.test(s))) return { action: "allow" };
	return { action: "ask", reason: { zh: "谨慎模式：运行非只读命令", en: "cautious mode: a command that is not read-only" } };
}

/** Environment variables that look like credentials never reach the agent's shell. */
const SECRET_NAME = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH|COOKIE|SESSION)/i;
const ALWAYS_KEEP = new Set(["PATH", "HOME", "USER", "LOGNAME", "SHELL", "LANG", "TERM", "TMPDIR", "PWD"]);

/** Proxy settings: without the network they only point at a way out. */
const PROXY_NAME = /^(https?|all|ftp|no)_proxy$/i;

export function scrubEnv(env: Record<string, string | undefined>, network = false): Record<string, string | undefined> {
	const out: Record<string, string | undefined> = {};
	for (const [k, v] of Object.entries(env)) {
		if (!network && PROXY_NAME.test(k)) continue;
		if (ALWAYS_KEEP.has(k) || !SECRET_NAME.test(k)) out[k] = v;
	}
	return out;
}

/** Whether `absPath` (symlinks already resolved) lies inside one of `roots`. */
export function checkRead(roots: string[], absPath: string): boolean {
	const p = normalize(absPath);
	return roots.some((r) => {
		const root = normalize(r);
		return p === root || p.startsWith(`${root}/`);
	});
}

/** POSIX single-quote escaping. */
export function shellQuote(s: string): string {
	return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Wraps a command so it runs under the macOS Seatbelt profile Tower wrote. */
export function sandboxed(command: string, profile: string): string {
	return `exec /usr/bin/sandbox-exec -f ${shellQuote(profile)} /bin/bash -c ${shellQuote(command)}`;
}

/**
 * Pi's bash has no timeout unless the model asks for one; a command that
 * hangs (a search of the whole disk, a server left in the foreground) would
 * hold the run until the stall alarm. Commands get five minutes unless the
 * model asks for another limit.
 */
export const DEFAULT_COMMAND_TIMEOUT_SECS = 300;

export function withDefaultTimeout<T>(params: T): T {
	const p = params as { timeout?: unknown };
	if (p && typeof p === "object" && p.timeout === undefined) {
		return { ...p, timeout: DEFAULT_COMMAND_TIMEOUT_SECS } as T;
	}
	return params;
}

/**
 * The ACP bridge's answer to a permission request: Tower's own tools
 * (`mcp__tower__*`) gate themselves and are allowed; anything else — a
 * tool the agent should not have — is refused; with no refusal to pick,
 * the request is cancelled.
 */
export function permissionOutcome(params: Record<string, unknown>): { outcome: string; optionId?: unknown } {
	const options = (Array.isArray(params.options) ? params.options : []) as Array<Record<string, unknown>>;
	const call = (params.toolCall ?? {}) as Record<string, unknown>;
	const meta = ((call._meta ?? {}) as Record<string, unknown>).claudeCode as Record<string, unknown> | undefined;
	const name = String(meta?.toolName ?? call.title ?? "");
	const ours = name.startsWith("mcp__tower__");
	const kinds = ours ? ["allow_once", "allow_always"] : ["reject_once", "reject_always"];
	const pick = kinds.map((k) => options.find((o) => o.kind === k)).find(Boolean);
	return pick ? { outcome: "selected", optionId: pick.optionId } : { outcome: "cancelled" };
}
