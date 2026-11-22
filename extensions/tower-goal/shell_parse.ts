/**
 * Zero-dependency POSIX shell lexer and structured command extractor for
 * Tower's bash policy gate.
 *
 * Replaces fragile regex splitting (`&&|\|\||;|\|`) so quoting, escapes,
 * ANSI-C strings, env prefixes, wrappers (`env`, `command`, `exec`, `nohup`,
 * `timeout`, `xargs`), subshells `(...)`, command substitutions `$(...)` /
 * backticks, process substitutions `<(...)` / `>(...)`, redirections, and
 * nested shell runners (`bash -c`, `sh -c`, `eval`) are analyzed accurately.
 */

export interface Redirection {
	fd: string | null;
	op: string;
	target: string;
	/** True when this redirection can create, truncate, or append to a file. */
	isWrite: boolean;
	/** True for pure file-descriptor duplication/close (`2>&1`, `1>&2`, `2>&-`). */
	isFdDup: boolean;
}

export interface EnvAssignment {
	name: string;
	value: string;
	hasDynamic: boolean;
}

export interface SimpleCommand {
	rawName: string;
	name: string;
	args: string[];
	argv: string[];
	env: EnvAssignment[];
	redirects: Redirection[];
	wrappers: string[];
	hasDynamicName: boolean;
	hasDynamicArgs: boolean;
	hasEscapedWhitespaceInName: boolean;
	inlineScript: boolean;
	nestedDepth: number;
}

export interface Pipeline {
	commands: SimpleCommand[];
}

export interface ParsedShell {
	commands: SimpleCommand[];
	pipelines: Pipeline[];
	hasCommandSubstitution: boolean;
	hasProcessSubstitution: boolean;
	hasSubshell: boolean;
	hasFileWriteRedirection: boolean;
	hasDynamicCommand: boolean;
	hasInlineScript: boolean;
	parseError?: string;
}

interface WordToken {
	kind: "word";
	value: string;
	raw: string;
	quoted: boolean;
	hasDynamic: boolean;
	hasEscapedWhitespace: boolean;
	ioNumber: boolean;
}

interface OpToken {
	kind: "op";
	op: string;
}

type Token = WordToken | OpToken;

interface LexResult {
	tokens: Token[];
	substitutions: string[];
	processSubstitutions: string[];
	parseError?: string;
}

const MAX_DEPTH = 6;
const SHELL_RUNNERS = new Set(["sh", "bash", "zsh", "dash", "ksh", "ash", "fish"]);
const INLINE_SCRIPT_FLAGS: Record<string, Set<string>> = {
	python: new Set(["-c"]),
	python2: new Set(["-c"]),
	python3: new Set(["-c"]),
	node: new Set(["-e", "--eval", "-p", "--print"]),
	nodejs: new Set(["-e", "--eval", "-p", "--print"]),
	bun: new Set(["-e", "--eval", "-p", "--print"]),
	ruby: new Set(["-e"]),
	perl: new Set(["-e", "-E"]),
	php: new Set(["-r"]),
	lua: new Set(["-e"]),
	osascript: new Set(["-e"]),
};
const CONTROL_KEYWORDS = new Set([
	"{", "}", "!", "if", "then", "elif", "else", "fi",
	"for", "select", "while", "until", "do", "done", "case", "esac", "coproc",
]);
const ANSI_ESCAPES: Record<string, string> = {
	a: "\x07", b: "\b", e: "\x1b", E: "\x1b", f: "\f",
	n: "\n", r: "\r", t: "\t", v: "\v", "\\": "\\", "'": "'", '"': '"',
};
const OPS_3 = new Set(["&>>", "<<-", "<<<"]);
const OPS_2 = new Set(["&&", "||", "|&", ";;", ">>", ">|", "<>", ">&", "<&", "&>", "<<"]);
const OPS_1 = new Set(["|", "&", ";", "(", ")", ">", "<", "\n"]);
const REDIR_OPS = new Set([">", ">>", ">|", "&>", "&>>", "<>", ">&", "<&", "<", "<<", "<<-", "<<<"]);

const basenameOf = (cmd: string) => {
	const idx = cmd.lastIndexOf("/");
	return idx >= 0 ? cmd.slice(idx + 1) : cmd;
};

function decodeAnsiC(src: string, start: number): { text: string; next: number; error?: string } {
	let out = "";
	let i = start;
	while (i < src.length) {
		const c = src[i];
		if (c === "'") return { text: out, next: i + 1 };
		if (c === "\\" && i + 1 < src.length) {
			const n = src[i + 1];
			i += 2;
			if (n in ANSI_ESCAPES) {
				out += ANSI_ESCAPES[n];
			} else if (n === "x" || n === "u" || n === "U") {
				const max = n === "x" ? 2 : n === "u" ? 4 : 8;
				const hex = src.slice(i, i + max).match(/^[0-9a-fA-F]+/)?.[0];
				if (hex) {
					const cp = Number.parseInt(hex, 16);
					out += n === "x" ? String.fromCharCode(cp) : cp <= 0x10ffff ? String.fromCodePoint(cp) : "";
					i += hex.length;
				} else {
					out += `\\${n}`;
				}
			} else if (n >= "0" && n <= "7") {
				const rest = src.slice(i, i + 2).match(/^[0-7]*/)?.[0] ?? "";
				out += String.fromCharCode(Number.parseInt(n + rest, 8) & 0xff);
				i += rest.length;
			} else {
				out += `\\${n}`;
			}
			continue;
		}
		out += c;
		i++;
	}
	return { text: out, next: i, error: "unclosed ANSI-C quote" };
}

/** Scans from the character AFTER `$(`, `<(`, or `>(` until the matching `)`. */
function scanParenBody(src: string, start: number): { body: string; next: number; error?: string } {
	let i = start;
	let depth = 1;
	while (i < src.length) {
		const c = src[i];
		if (c === "\\") { i += 2; continue; }
		if (c === "'") {
			const end = src.indexOf("'", i + 1);
			if (end === -1) return { body: src.slice(start), next: src.length, error: "unclosed single quote in substitution" };
			i = end + 1;
			continue;
		}
		if (c === '"') {
			i++;
			while (i < src.length && src[i] !== '"') {
				if (src[i] === "\\") i += 2;
				else if (src[i] === "$" && src[i + 1] === "(") {
					const inner = scanParenBody(src, i + 2);
					if (inner.error) return { body: src.slice(start), next: src.length, error: inner.error };
					i = inner.next;
				} else if (src[i] === "`") {
					const inner = scanBacktickBody(src, i + 1, true);
					if (inner.error) return { body: src.slice(start), next: src.length, error: inner.error };
					i = inner.next;
				} else i++;
			}
			if (i >= src.length) return { body: src.slice(start), next: src.length, error: "unclosed double quote in substitution" };
			i++;
			continue;
		}
		if (c === "`") {
			const inner = scanBacktickBody(src, i + 1, false);
			if (inner.error) return { body: src.slice(start), next: src.length, error: inner.error };
			i = inner.next;
			continue;
		}
		if (c === "#" && /[\s;|&(]/.test(i > start ? src[i - 1] : " ")) {
			const nl = src.indexOf("\n", i);
			i = nl === -1 ? src.length : nl + 1;
			continue;
		}
		if (c === "(") depth++;
		else if (c === ")") {
			depth--;
			if (depth === 0) return { body: src.slice(start, i), next: i + 1 };
		}
		i++;
	}
	return { body: src.slice(start), next: src.length, error: "unclosed command substitution" };
}

function scanBacktickBody(src: string, start: number, inDoubleQuote: boolean): { body: string; next: number; error?: string } {
	let i = start;
	let body = "";
	while (i < src.length) {
		const c = src[i];
		if (c === "`") return { body, next: i + 1 };
		if (c === "\\" && i + 1 < src.length) {
			const n = src[i + 1];
			if (n === "$" || n === "`" || n === "\\" || (inDoubleQuote && n === '"')) {
				body += n;
				i += 2;
				continue;
			}
		}
		body += c;
		i++;
	}
	return { body, next: src.length, error: "unclosed backtick substitution" };
}

function opAt(src: string, i: number): string | null {
	const t3 = src.slice(i, i + 3);
	if (OPS_3.has(t3)) return t3;
	const t2 = src.slice(i, i + 2);
	if (OPS_2.has(t2)) return t2;
	return OPS_1.has(src[i]) ? src[i] : null;
}

function lex(src: string): LexResult {
	const tokens: Token[] = [];
	const substitutions: string[] = [];
	const processSubstitutions: string[] = [];
	let parseError: string | undefined;
	const recordErr = (e: string) => { if (!parseError) parseError = e; };
	let i = 0;

	const scanDollarParen = (pos: number): number => {
		const isArith = src[pos + 2] === "(";
		const res = scanParenBody(src, pos + 2);
		if (res.error) recordErr(res.error);
		if (!isArith) substitutions.push(res.body);
		return res.next;
	};

	while (i < src.length) {
		const c = src[i];
		if (c === " " || c === "\t" || c === "\r") { i++; continue; }
		if (c === "#") {
			const nl = src.indexOf("\n", i);
			i = nl === -1 ? src.length : nl;
			continue;
		}
		if ((c === "<" || c === ">") && src[i + 1] === "(") {
			const res = scanParenBody(src, i + 2);
			if (res.error) recordErr(res.error);
			processSubstitutions.push(res.body);
			tokens.push({ kind: "word", value: src.slice(i, res.next), raw: src.slice(i, res.next), quoted: false, hasDynamic: true, hasEscapedWhitespace: false, ioNumber: false });
			i = res.next;
			continue;
		}
		const op = opAt(src, i);
		if (op) { tokens.push({ kind: "op", op }); i += op.length; continue; }

		const wordStart = i;
		let value = "";
		let quoted = false;
		let hasDynamic = false;
		let hasEscapedWhitespace = false;

		while (i < src.length) {
			const ch = src[i];
			if (ch === " " || ch === "\t" || ch === "\r") break;
			if ((ch === "<" || ch === ">") && src[i + 1] === "(") {
				const res = scanParenBody(src, i + 2);
				if (res.error) recordErr(res.error);
				processSubstitutions.push(res.body);
				value += src.slice(i, res.next);
				hasDynamic = true;
				i = res.next;
				continue;
			}
			if (opAt(src, i)) break;

			if (ch === "\\") {
				if (i + 1 >= src.length) { value += "\\"; i++; }
				else if (src[i + 1] === "\n") i += 2;
				else {
					if (src[i + 1] === " " || src[i + 1] === "\t") hasEscapedWhitespace = true;
					value += src[i + 1];
					i += 2;
				}
			} else if (ch === "'") {
				quoted = true;
				const end = src.indexOf("'", i + 1);
				if (end === -1) { recordErr("unclosed single quote"); value += src.slice(i + 1); i = src.length; }
				else { value += src.slice(i + 1, end); i = end + 1; }
			} else if (ch === "$" && src[i + 1] === "'") {
				quoted = true;
				const res = decodeAnsiC(src, i + 2);
				if (res.error) recordErr(res.error);
				value += res.text;
				i = res.next;
			} else if (ch === '"') {
				quoted = true;
				i++;
				while (i < src.length && src[i] !== '"') {
					const d = src[i];
					if (d === "\\" && i + 1 < src.length) {
						const n = src[i + 1];
						if (n !== "\n") value += n === '"' || n === "\\" || n === "$" || n === "`" ? n : `\\${n}`;
						i += 2;
					} else if (d === "$" && src[i + 1] === "(") {
						hasDynamic = true;
						const next = scanDollarParen(i);
						value += src.slice(i, next);
						i = next;
					} else if (d === "`") {
						hasDynamic = true;
						const res = scanBacktickBody(src, i + 1, true);
						if (res.error) recordErr(res.error);
						substitutions.push(res.body);
						value += src.slice(i, res.next);
						i = res.next;
					} else {
						if (d === "$" && src[i + 1] && /[A-Za-z0-9_{@*#?$!-]/.test(src[i + 1])) hasDynamic = true;
						value += d;
						i++;
					}
				}
				if (i >= src.length) recordErr("unclosed double quote");
				else i++;
			} else if (ch === "$" && src[i + 1] === "(") {
				hasDynamic = true;
				const next = scanDollarParen(i);
				value += src.slice(i, next);
				i = next;
			} else if (ch === "`") {
				hasDynamic = true;
				const res = scanBacktickBody(src, i + 1, false);
				if (res.error) recordErr(res.error);
				substitutions.push(res.body);
				value += src.slice(i, res.next);
				i = res.next;
			} else {
				if (ch === "$" && src[i + 1] && /[A-Za-z0-9_{@*#?$!-]/.test(src[i + 1])) hasDynamic = true;
				value += ch;
				i++;
			}
		}

		const raw = src.slice(wordStart, i);
		const ioNumber = !quoted && /^\d+$/.test(raw) && (src[i] === ">" || src[i] === "<");
		tokens.push({ kind: "word", value, raw, quoted, hasDynamic, hasEscapedWhitespace, ioNumber });
	}
	return { tokens, substitutions, processSubstitutions, parseError };
}

function classifyRedirect(fd: string | null, op: string, target: string): Redirection {
	if (op === ">&" || op === "<&") {
		const isFdDup = /^\d+$/.test(target) || target === "-";
		return { fd, op, target, isWrite: op === ">&" && !isFdDup && target !== "/dev/null", isFdDup };
	}
	const isWrite = (op === ">" || op === ">>" || op === ">|" || op === "&>" || op === "&>>" || op === "<>") && target !== "/dev/null";
	return { fd, op, target, isWrite, isFdDup: false };
}

function isEnvAssignmentWord(t: WordToken): EnvAssignment | null {
	const eq = t.raw.indexOf("=");
	if (eq <= 0 || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(t.raw.slice(0, eq))) return null;
	const valEq = t.value.indexOf("=");
	return { name: t.raw.slice(0, eq), value: valEq >= 0 ? t.value.slice(valEq + 1) : "", hasDynamic: t.hasDynamic };
}

const WRAPPER_VALUE_FLAGS: Record<string, Set<string>> = {
	exec: new Set(["-a"]),
	nice: new Set(["-n"]),
	timeout: new Set(["-k", "-s"]),
	xargs: new Set(["-n", "-I", "-L", "-P", "-d", "-E", "-s"]),
};

function unwrapCommand(
	words: WordToken[],
	env: EnvAssignment[],
	redirects: Redirection[],
	depth: number,
	nestedScripts: string[],
): SimpleCommand | null {
	let idx = 0;
	const wrappers: string[] = [];
	let inlineScript = false;

	while (idx < words.length) {
		const base = basenameOf(words[idx].value);
		if (base === "env") {
			wrappers.push("env");
			idx++;
			while (idx < words.length) {
				const w = words[idx];
				if (w.value === "--") { idx++; break; }
				if (w.value === "-u" || w.value === "-C" || w.value === "--unset" || w.value === "--chdir") { idx += 2; continue; }
				if (w.value === "-S" && idx + 1 < words.length) { nestedScripts.push(words[idx + 1].value); idx += 2; continue; }
				if (w.value.startsWith("-")) { idx++; continue; }
				const assign = isEnvAssignmentWord(w);
				if (assign) { env.push(assign); idx++; continue; }
				break;
			}
			continue;
		}
		if (base === "command") {
			let j = idx + 1;
			let lookupOnly = false;
			while (j < words.length && words[j].value.startsWith("-") && words[j].value !== "--") {
				if (/[vV]/.test(words[j].value)) lookupOnly = true;
				j++;
			}
			if (lookupOnly) break;
			wrappers.push("command");
			idx = j + (words[j]?.value === "--" ? 1 : 0);
			continue;
		}
		if (base === "builtin" || base === "nohup" || base === "time" || base in WRAPPER_VALUE_FLAGS) {
			wrappers.push(base);
			if (base === "exec") inlineScript = true;
			const valFlags = WRAPPER_VALUE_FLAGS[base];
			idx++;
			while (idx < words.length && words[idx].value.startsWith("-")) {
				idx += valFlags?.has(words[idx].value) ? 2 : 1;
			}
			if (base === "timeout" && idx < words.length) idx++;
			continue;
		}
		break;
	}

	if (idx >= words.length) return null;
	const head = words[idx];
	const tail = words.slice(idx + 1);
	const name = basenameOf(head.value);
	const args = tail.map((w) => w.value);
	const hasDynamicArgs = tail.some((w) => w.hasDynamic);

	if (name === "eval") {
		inlineScript = true;
		if (args.length > 0) nestedScripts.push(args.join(" "));
	} else if (SHELL_RUNNERS.has(name)) {
		inlineScript = true;
		for (let i = 0; i < args.length; i++) {
			const a = args[i];
			if (a === "--") break;
			if (a === "-c" || (/^-[a-zA-Z]*c[a-zA-Z]*$/.test(a) && !a.startsWith("--"))) {
				if (i + 1 < args.length) nestedScripts.push(args[i + 1]);
				break;
			}
		}
	} else if (INLINE_SCRIPT_FLAGS[name]?.size && args.some((a) => INLINE_SCRIPT_FLAGS[name].has(a))) {
		inlineScript = true;
	} else if (name === "deno" && args[0] === "eval") {
		inlineScript = true;
	}

	return {
		rawName: head.value,
		name,
		args,
		argv: [head.value, ...args],
		env,
		redirects,
		wrappers,
		hasDynamicName: head.hasDynamic || (name === "eval" && hasDynamicArgs),
		hasDynamicArgs,
		hasEscapedWhitespaceInName: head.hasEscapedWhitespace,
		inlineScript,
		nestedDepth: depth,
	};
}

/**
 * Parses a POSIX shell command string into structured commands, pipelines,
 * redirections, and safety flags. Recursively parses `$(...)`, backticks,
 * `<(...)`/`>(...)`, `bash -c`, `sh -c`, and `eval` up to depth 6.
 */
export function parseShell(input: string, depth = 0): ParsedShell {
	const result: ParsedShell = {
		commands: [],
		pipelines: [],
		hasCommandSubstitution: false,
		hasProcessSubstitution: false,
		hasSubshell: false,
		hasFileWriteRedirection: false,
		hasDynamicCommand: false,
		hasInlineScript: false,
	};
	if (!input.trim()) return result;

	const lexed = lex(input);
	if (lexed.parseError) result.parseError = lexed.parseError;
	if (lexed.substitutions.length > 0) result.hasCommandSubstitution = true;
	if (lexed.processSubstitutions.length > 0) result.hasProcessSubstitution = true;
	const nestedScripts = [...lexed.substitutions, ...lexed.processSubstitutions];

	let curWords: WordToken[] = [];
	let curEnv: EnvAssignment[] = [];
	let curRedirects: Redirection[] = [];
	let curPipeline: SimpleCommand[] = [];

	const flushCommand = () => {
		if (curRedirects.some((r) => r.isWrite)) result.hasFileWriteRedirection = true;
		const cmd = unwrapCommand(curWords, curEnv, curRedirects, depth, nestedScripts);
		if (cmd) {
			result.commands.push(cmd);
			curPipeline.push(cmd);
			if (cmd.hasDynamicName) result.hasDynamicCommand = true;
			if (cmd.inlineScript) result.hasInlineScript = true;
		}
		curWords = [];
		curEnv = [];
		curRedirects = [];
	};
	const flushPipeline = () => {
		flushCommand();
		if (curPipeline.length > 0) {
			result.pipelines.push({ commands: curPipeline });
			curPipeline = [];
		}
	};

	const toks = lexed.tokens;
	for (let i = 0; i < toks.length; i++) {
		const tok = toks[i];
		if (tok.kind === "op") {
			if (tok.op === "(" || tok.op === ")") { result.hasSubshell = true; flushPipeline(); continue; }
			if (tok.op === "|" || tok.op === "|&") { flushCommand(); continue; }
			if (REDIR_OPS.has(tok.op)) {
				const next = toks[i + 1];
				const target = next?.kind === "word" ? next.value : "";
				if (next?.kind === "word") i++;
				curRedirects.push(classifyRedirect(null, tok.op, target));
				continue;
			}
			flushPipeline();
			continue;
		}
		if (tok.ioNumber && toks[i + 1]?.kind === "op" && REDIR_OPS.has((toks[i + 1] as OpToken).op)) {
			const op = (toks[i + 1] as OpToken).op;
			const targetTok = toks[i + 2];
			curRedirects.push(classifyRedirect(tok.value, op, targetTok?.kind === "word" ? targetTok.value : ""));
			i += targetTok?.kind === "word" ? 2 : 1;
			continue;
		}
		if (curWords.length === 0 && !tok.quoted && CONTROL_KEYWORDS.has(tok.value)) {
			if (tok.value === "{" || tok.value === "}") flushPipeline();
			continue;
		}
		if (curWords.length === 0) {
			const assign = isEnvAssignmentWord(tok);
			if (assign) { curEnv.push(assign); continue; }
		}
		curWords.push(tok);
	}
	flushPipeline();

	if (depth < MAX_DEPTH) {
		for (const script of nestedScripts) {
			const nested = parseShell(script, depth + 1);
			result.commands.push(...nested.commands);
			result.pipelines.push(...nested.pipelines);
			result.hasCommandSubstitution ||= nested.hasCommandSubstitution;
			result.hasProcessSubstitution ||= nested.hasProcessSubstitution;
			result.hasSubshell ||= nested.hasSubshell;
			result.hasFileWriteRedirection ||= nested.hasFileWriteRedirection;
			result.hasDynamicCommand ||= nested.hasDynamicCommand;
			result.hasInlineScript ||= nested.hasInlineScript;
			result.parseError ??= nested.parseError;
		}
	}
	return result;
}
