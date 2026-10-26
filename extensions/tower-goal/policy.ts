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

export type BashVerdict = { action: "allow" } | { action: "ask"; reason: string };

/** One-way doors: always ask, whatever the preset (docs/11 §11.4). */
const ONE_WAY: Array<[RegExp, string]> = [
	[/\bgit\s+push\b/, "推送到远端（单向门）"],
	[/\b(npm|pnpm|yarn|cargo|gem|twine)\s+publish\b/, "发布包（单向门）"],
	[/\bgh\s+(pr|release|repo)\s+(create|merge|delete)\b/, "在 GitHub 上创建或合并（单向门）"],
	[/\bgit\s+reset\s+--hard\b/, "丢弃工作区改动"],
	[/\bgit\s+clean\s+-[a-z]*f/, "删除未跟踪文件"],
	[/\bgit\s+(checkout|switch|rebase|branch\s+-D)\b/, "改变分支或历史"],
	[/\bsudo\b/, "以管理员权限运行"],
	[/\brm\s+-[a-z]*r[a-z]*f?\s+(\/|~|\$HOME)(\s|$)/, "删除根目录或主目录"],
	[/\b(curl|wget)\b[^|]*\|\s*(ba|z)?sh\b/, "下载并执行脚本"],
];

/** Gated by the standard preset: dependency and CI changes. */
const STANDARD: Array<[RegExp, string]> = [
	[/\b(npm\s+(install|i|add)|pnpm\s+(add|install)|yarn\s+add|bun\s+add)\s+(?!-)[^\s]/, "新增依赖"],
	[/\b(cargo\s+add|pip3?\s+install|uv\s+add|poetry\s+add|go\s+get)\b/, "新增依赖"],
	[/\.github\/workflows|\.gitlab-ci|\bci\.ya?ml\b/, "修改 CI 配置"],
	[/\brm\s+-[a-z]*r/, "递归删除"],
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
	return { action: "ask", reason: "谨慎模式：运行非只读命令" };
}
