/**
 * Pure policy for the tower-goal extension: the contract's scope fence,
 * structured shell-parser autonomy matrix (`docs/11` §11.2, `docs/18` P1.3),
 * and the ACP Engine Onboarding Trust Gate (`docs/18` P1.1).
 * No Pi imports, so it can be tested directly with `node --test`.
 */

import { type Pipeline, type SimpleCommand, parseShell } from "./shell_parse.ts";

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

const REASON = {
	push: { zh: "推送到远端（单向门）", en: "push to a remote (one-way door)" },
	publish: { zh: "发布包（单向门）", en: "publish a package (one-way door)" },
	gh: { zh: "在 GitHub 上创建或合并（单向门）", en: "create or merge on GitHub (one-way door)" },
	resetHard: { zh: "丢弃工作区改动", en: "discard workspace changes" },
	gitClean: { zh: "删除未跟踪文件", en: "delete untracked files" },
	gitHistory: { zh: "改变分支或历史", en: "change branches or history" },
	sudo: { zh: "以管理员权限运行", en: "run as administrator" },
	rmRoot: { zh: "删除根目录或主目录", en: "delete the root or home directory" },
	pipeExec: { zh: "下载并执行脚本", en: "download and run a script" },
	addDep: { zh: "新增依赖", en: "add a dependency" },
	ciConfig: { zh: "修改 CI 配置", en: "change CI configuration" },
	rmRecursive: { zh: "递归删除", en: "delete recursively" },
	gitDynamic: { zh: "git 子命令或别名在运行时才确定", en: "a git subcommand or alias only known when it runs" },
	unparsed: { zh: "无法可靠解析的命令", en: "a command Tower cannot parse reliably" },
	cautious: { zh: "谨慎模式：运行非只读命令", en: "cautious mode: a command that is not read-only" },
	cautiousRedirect: { zh: "谨慎模式：命令包含文件写入重定向", en: "cautious mode: command writes via file redirection" },
	cautiousSub: { zh: "谨慎模式：命令包含子命令替换或内联脚本", en: "cautious mode: command uses substitution or an inline script" },
} satisfies Record<string, Text>;

const PUBLISH_TOOLS = new Set(["npm", "pnpm", "yarn", "cargo", "gem", "twine"]);
const DOWNLOADERS = new Set(["curl", "wget"]);
const SCRIPT_INTERPRETERS = new Set(["sh", "bash", "zsh", "dash", "ksh", "ash", "fish", "python", "python3", "node", "perl", "ruby"]);
const GIT_GLOBAL_VALUE_FLAGS = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--super-prefix", "--config-env"]);
/** Environment that points git at other configuration (and so other aliases). */
const GIT_CONFIG_ENV = /^(GIT_CONFIG.*|GIT_DIR|GIT_COMMON_DIR|HOME|XDG_CONFIG_HOME)$/i;
const CI_PATH_RE = /(?:^|\/)(?:\.github\/workflows(?:\/|$)|\.gitlab-ci(?:\.ya?ml)?$|ci\.ya?ml$)/i;

/** Extracts git's real subcommand & args after skipping global flags (`git -C dir push`). */
function gitSubcommand(args: string[]): { sub: string; rest: string[]; hasConfigFlag: boolean; setsAlias: boolean } {
	let i = 0;
	let hasConfigFlag = false;
	let setsAlias = false;
	while (i < args.length) {
		const a = args[i];
		if (a === "--") {
			i++;
			break;
		}
		if (a === "-c" || a.startsWith("-c") || a.startsWith("--config-env")) {
			hasConfigFlag = true;
			// `-c alias.p=push`, `-calias.p=push`, `--config-env=alias.p=VAR`.
			const setting = a === "-c" || a === "--config-env" ? (args[i + 1] ?? "") : a.replace(/^(-c|--config-env=?)/, "");
			if (/^(alias|include|includeif)\./i.test(setting)) setsAlias = true;
		}
		if (GIT_GLOBAL_VALUE_FLAGS.has(a)) {
			i += 2;
			continue;
		}
		if (a.startsWith("-")) {
			i++;
			continue;
		}
		return { sub: a, rest: args.slice(i + 1), hasConfigFlag, setsAlias };
	}
	return { sub: "", rest: [], hasConfigFlag, setsAlias };
}

function hasShortOrLongFlag(args: string[], shortChar: string, longFlags: string[]): boolean {
	for (const a of args) {
		if (a === "--") break;
		if (longFlags.includes(a)) return true;
		if (a.startsWith("-") && !a.startsWith("--") && a.slice(1).includes(shortChar)) return true;
	}
	return false;
}

function positionalArgs(args: string[]): string[] {
	const out: string[] = [];
	let afterDash = false;
	for (const a of args) {
		if (!afterDash && a === "--") {
			afterDash = true;
			continue;
		}
		if (!afterDash && a.startsWith("-")) continue;
		out.push(a);
	}
	return out;
}

function isRootOrHomeTarget(target: string): boolean {
	const t = target.trim();
	return (
		t === "/" ||
		t === "/*" ||
		t === "~" ||
		t === "~/" ||
		t === "~/*" ||
		t === "$HOME" ||
		t === "$HOME/" ||
		t === "${HOME}" ||
		t === "${HOME}/"
	);
}

/**
 * Checks a single command (and, if its command name had escaped whitespace
 * such as `git\ push`, its whitespace-split view too) against one-way doors.
 */
function checkOneWayCommand(cmd: SimpleCommand): Text | null {
	const candidates: Array<{ name: string; args: string[] }> = [{ name: cmd.name, args: cmd.args }];
	if (cmd.hasEscapedWhitespaceInName && /\s/.test(cmd.name)) {
		const split = cmd.name.trim().split(/\s+/);
		if (split.length > 0) candidates.push({ name: split[0], args: [...split.slice(1), ...cmd.args] });
	}
	for (const { name, args } of candidates) {
		if (name === "sudo" || name === "doas") return REASON.sudo;
		if (name === "git") {
			const { sub, rest, setsAlias } = gitSubcommand(args);
			// An alias set for this command, or a subcommand that is only a
			// variable or substitution here, could be anything (`push`).
			if (setsAlias || cmd.env.some((e) => GIT_CONFIG_ENV.test(e.name))) return REASON.gitDynamic;
			if (/[$`]/.test(sub)) return REASON.gitDynamic;
			if (sub === "push") return REASON.push;
			if (sub === "reset" && rest.includes("--hard")) return REASON.resetHard;
			if (sub === "clean" && hasShortOrLongFlag(rest, "f", ["--force"])) return REASON.gitClean;
			if (sub === "checkout" || sub === "switch" || sub === "rebase") return REASON.gitHistory;
			if (sub === "branch" && hasShortOrLongFlag(rest, "D", ["--delete"])) return REASON.gitHistory;
		}
		if (PUBLISH_TOOLS.has(name) && positionalArgs(args)[0] === "publish") return REASON.publish;
		if (name === "gh") {
			const pos = positionalArgs(args);
			if (
				(pos[0] === "pr" || pos[0] === "release" || pos[0] === "repo") &&
				(pos[1] === "create" || pos[1] === "merge" || pos[1] === "delete")
			) {
				return REASON.gh;
			}
		}
		if (name === "rm") {
			const recursive = hasShortOrLongFlag(args, "r", ["--recursive"]) || hasShortOrLongFlag(args, "R", []);
			if (recursive && positionalArgs(args).some(isRootOrHomeTarget)) return REASON.rmRoot;
		}
	}
	return null;
}

function checkOneWayPipeline(pipe: Pipeline): Text | null {
	let sawDownloader = false;
	for (const c of pipe.commands) {
		if (DOWNLOADERS.has(c.name)) sawDownloader = true;
		else if (sawDownloader && SCRIPT_INTERPRETERS.has(c.name)) return REASON.pipeExec;
	}
	return null;
}

function checkStandardCommand(cmd: SimpleCommand): Text | null {
	const { name, args } = cmd;
	const pos = positionalArgs(args);
	if ((name === "npm" && (pos[0] === "install" || pos[0] === "i" || pos[0] === "add") && pos.length >= 2) ||
		(name === "pnpm" && (pos[0] === "add" || pos[0] === "install" || pos[0] === "i") && pos.length >= 2) ||
		((name === "yarn" || name === "bun") && pos[0] === "add" && pos.length >= 2)) {
		return REASON.addDep;
	}
	if (
		(name === "cargo" && pos[0] === "add") ||
		((name === "pip" || name === "pip3") && pos[0] === "install") ||
		((name === "uv" || name === "poetry") && pos[0] === "add") ||
		(name === "go" && pos[0] === "get")
	) {
		return REASON.addDep;
	}
	if (args.some((a) => CI_PATH_RE.test(a)) || cmd.redirects.some((r) => CI_PATH_RE.test(r.target))) {
		return REASON.ciConfig;
	}
	if (name === "rm" && (hasShortOrLongFlag(args, "r", ["--recursive"]) || hasShortOrLongFlag(args, "R", []))) {
		return REASON.rmRecursive;
	}
	return null;
}

const PURE_READ_ONLY = new Set([
	"ls",
	"cat",
	"head",
	"tail",
	"wc",
	"grep",
	"egrep",
	"fgrep",
	"rg",
	"fd",
	"tree",
	"pwd",
	"echo",
	"printf",
	"which",
	"file",
	"stat",
	"diff",
	"true",
	"false",
	"test",
	"[",
	"basename",
	"dirname",
	"realpath",
]);

const FIND_MUTATING = new Set(["-delete", "-exec", "-execdir", "-ok", "-okdir", "-fprint", "-fprintf", "-fls"]);
const GIT_READ_ONLY = new Set(["status", "diff", "log", "show", "blame", "grep", "ls-files", "rev-parse", "describe"]);
const PKG_MANAGERS = new Set(["npm", "pnpm", "yarn", "bun"]);
const PKG_SAFE_SCRIPTS = new Set(["test", "lint", "typecheck", "check", "build"]);

function isReadOnlyOrTestCommand(cmd: SimpleCommand): boolean {
	if (cmd.inlineScript || cmd.hasDynamicName) return false;
	if (cmd.wrappers.includes("exec") || cmd.wrappers.includes("xargs")) return false;
	const { name, args } = cmd;
	if (PURE_READ_ONLY.has(name)) return true;
	if (name === "command") {
		return args.some((a) => a === "-v" || a === "-V");
	}
	if (name === "find") {
		return !args.some((a) => FIND_MUTATING.has(a));
	}
	if (name === "git") {
		const { sub, hasConfigFlag } = gitSubcommand(args);
		return !hasConfigFlag && GIT_READ_ONLY.has(sub);
	}
	if (PKG_MANAGERS.has(name)) {
		const pos = positionalArgs(args);
		if (pos[0] === "run") return PKG_SAFE_SCRIPTS.has(pos[1] ?? "");
		return PKG_SAFE_SCRIPTS.has(pos[0] ?? "");
	}
	if (name === "cargo") {
		const pos = positionalArgs(args);
		const sub = pos[0] ?? "";
		if (sub === "test" || sub === "check" || sub === "clippy" || sub === "build") return true;
		if (sub === "fmt") return args.includes("--check");
		return false;
	}
	if (name === "go") {
		const sub = positionalArgs(args)[0] ?? "";
		return sub === "test" || sub === "vet" || sub === "build";
	}
	if (name === "pytest" || name === "tsc") return true;
	if (name === "node") {
		return args.includes("--test") && !args.some((a) => a === "-e" || a === "--eval" || a === "-p" || a === "--print");
	}
	return false;
}

export function checkBash(command: string, autonomy: Autonomy): BashVerdict {
	const parsed = parseShell(command);

	for (const pipe of parsed.pipelines) {
		const reason = checkOneWayPipeline(pipe);
		if (reason) return { action: "ask", reason };
	}
	for (const cmd of parsed.commands) {
		const reason = checkOneWayCommand(cmd);
		if (reason) return { action: "ask", reason };
	}
	// What the parser could not follow could hide a one-way door: ask in
	// every mode.
	if (parsed.parseError) return { action: "ask", reason: REASON.unparsed };
	if (autonomy === "autonomous") return { action: "allow" };

	for (const cmd of parsed.commands) {
		const reason = checkStandardCommand(cmd);
		if (reason) return { action: "ask", reason };
	}
	if (autonomy === "standard") return { action: "allow" };

	// Cautious preset: fail closed on write redirections, substitutions,
	// dynamic command names, inline scripts, or non-allowlisted commands.
	if (parsed.hasFileWriteRedirection) return { action: "ask", reason: REASON.cautiousRedirect };
	if (parsed.hasCommandSubstitution || parsed.hasProcessSubstitution || parsed.hasInlineScript || parsed.hasDynamicCommand) {
		return { action: "ask", reason: REASON.cautiousSub };
	}
	if (parsed.commands.length === 0) return { action: "ask", reason: REASON.cautious };
	if (parsed.commands.every(isReadOnlyOrTestCommand)) return { action: "allow" };
	return { action: "ask", reason: REASON.cautious };
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

/** The exact 7 tools Tower exposes through its MCP server (7-tool budget). */
export const TOWER_TOOLS = new Set(["read", "write", "edit", "bash", "ask_user", "log", "submit"]);

/** Known built-in tool names across Claude Code, Codex, Gemini CLI, and OpenCode. */
export const KNOWN_BUILTIN_TOOLS = new Set([
	"bash",
	"Bash",
	"read",
	"Read",
	"write",
	"Write",
	"edit",
	"Edit",
	"MultiEdit",
	"read_file",
	"write_file",
	"edit_file",
	"read_many_files",
	"replace",
	"apply_patch",
	"shell",
	"local_shell",
	"exec_command",
	"run_shell_command",
	"terminal",
	"web_fetch",
	"WebFetch",
	"webfetch",
	"web_search",
	"WebSearch",
	"google_web_search",
	"glob",
	"Glob",
	"grep",
	"Grep",
	"list_directory",
	"search_file_content",
	"LS",
	"NotebookEdit",
	"Task",
	"TodoWrite",
]);

export interface PermissionDecision {
	allowed: boolean;
	toolName: string;
	reason: string;
	outcome: { outcome: string; optionId?: unknown };
}

function nonEmptyStr(v: unknown): string | null {
	return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function isTowerPrefixedTool(name: string, serverName: string): boolean {
	for (const prefix of [`mcp__${serverName}__`, `${serverName}__`, `${serverName}/`, `${serverName}:`]) {
		if (name.startsWith(prefix)) {
			const tool = name.slice(prefix.length);
			return TOWER_TOOLS.has(tool);
		}
	}
	return false;
}

/**
 * Engine Onboarding Trust Gate evaluator for ACP `session/request_permission`.
 *
 * Inspects Claude Code, Codex, Gemini CLI, OpenCode, and generic MCP payload
 * fields. Fails closed: every non-Tower tool — including all built-in tools
 * (`read_file`, `bash`, `Bash`, `shell`, `web_fetch`, etc.), unknown MCP
 * servers, spoofed titles, and unrecognized tool names — is rejected (or
 * cancelled when no reject option is offered).
 */
export function evaluatePermission(
	params: Record<string, unknown>,
	serverName = "tower",
): PermissionDecision {
	const options = (Array.isArray(params.options) ? params.options : []) as Array<Record<string, unknown>>;
	const call = (params.toolCall ?? {}) as Record<string, unknown>;
	const meta = (call._meta ?? {}) as Record<string, unknown>;

	const structuredNames = [
		nonEmptyStr((meta.claudeCode as Record<string, unknown> | undefined)?.toolName),
		nonEmptyStr((meta.codex as Record<string, unknown> | undefined)?.toolName),
		nonEmptyStr((meta.gemini as Record<string, unknown> | undefined)?.toolName),
		nonEmptyStr((meta.opencode as Record<string, unknown> | undefined)?.toolName),
		nonEmptyStr((meta.mcp as Record<string, unknown> | undefined)?.toolName),
		nonEmptyStr(call.toolName),
		nonEmptyStr(call.name),
		nonEmptyStr(call.tool),
	].filter((x): x is string => x !== null);

	const explicitServer =
		nonEmptyStr((meta.mcp as Record<string, unknown> | undefined)?.serverName) ??
		nonEmptyStr(meta.mcpServerName) ??
		nonEmptyStr(call.mcpServer) ??
		nonEmptyStr(call.serverName) ??
		nonEmptyStr(params.serverName);

	const title = nonEmptyStr(call.title);
	const displayName = structuredNames[0] ?? title ?? "<unnamed>";

	const choose = (allowed: boolean, reason: string): PermissionDecision => {
		const kinds = allowed ? ["allow_once", "allow_always"] : ["reject_once", "reject_always"];
		const pick = kinds.map((k) => options.find((o) => o.kind === k)).find(Boolean);
		const outcome = pick ? { outcome: "selected", optionId: pick.optionId } : { outcome: "cancelled" };
		return { allowed, toolName: displayName, reason, outcome };
	};

	// When explicit MCP server metadata is present, it MUST match Tower's server name.
	if (explicitServer !== null && explicitServer !== serverName) {
		return choose(false, `unauthorized MCP server "${explicitServer}"`);
	}

	if (structuredNames.length > 0) {
		// Every structured tool name field must agree it belongs to Tower's registered MCP server.
		for (const candidate of structuredNames) {
			if (isTowerPrefixedTool(candidate, serverName)) continue;
			if (explicitServer === serverName && TOWER_TOOLS.has(candidate)) continue;
			if (KNOWN_BUILTIN_TOOLS.has(candidate)) {
				return choose(false, `built-in tool "${candidate}" is forbidden by Tower Trust Gate`);
			}
			return choose(false, `tool "${candidate}" is not prefixed with mcp__${serverName}__`);
		}
		return choose(true, `verified Tower MCP tool "${displayName}"`);
	}

	// Fallback to title only when no structured tool name field was provided.
	if (title !== null) {
		if (isTowerPrefixedTool(title, serverName)) {
			return choose(true, `verified Tower MCP tool "${title}"`);
		}
		if (KNOWN_BUILTIN_TOOLS.has(title)) {
			return choose(false, `built-in tool "${title}" is forbidden by Tower Trust Gate`);
		}
		return choose(false, `tool "${title}" is not prefixed with mcp__${serverName}__`);
	}

	return choose(false, "permission request omitted tool identity");
}

/**
 * The ACP bridge's answer to a permission request: Tower's own tools
 * (`mcp__tower__*`) gate themselves and are allowed; anything else — a
 * tool the agent should not have — is refused; with no refusal to pick,
 * the request is cancelled.
 */
export function permissionOutcome(
	params: Record<string, unknown>,
	serverName = "tower",
): { outcome: string; optionId?: unknown } {
	return evaluatePermission(params, serverName).outcome;
}
