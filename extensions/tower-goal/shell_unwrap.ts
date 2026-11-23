/**
 * From a simple command's words to the command that actually runs, for
 * Tower's bash policy gate: wrappers (`env`, `nice`, `stdbuf`, `flock`, …)
 * are peeled off, and what a shell, `eval`, `watch` or `find -exec` runs is
 * collected as nested scripts for `parseShell` to read in turn.
 */

import type { EnvAssignment, Redirection, SimpleCommand, WordToken } from "./shell_parse.ts";

export const SHELL_RUNNERS = new Set(["sh", "bash", "rbash", "zsh", "dash", "ksh", "mksh", "oksh", "yash", "posh", "ash", "csh", "tcsh", "fish"]);
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

const basenameOf = (cmd: string) => {
	const idx = cmd.lastIndexOf("/");
	return idx >= 0 ? cmd.slice(idx + 1) : cmd;
};

export function isEnvAssignmentWord(t: WordToken): EnvAssignment | null {
	const eq = t.raw.indexOf("=");
	if (eq <= 0 || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(t.raw.slice(0, eq))) return null;
	const valEq = t.value.indexOf("=");
	return { name: t.raw.slice(0, eq), value: valEq >= 0 ? t.value.slice(valEq + 1) : "", hasDynamic: t.hasDynamic };
}

/**
 * Commands that run another command after their own options: the options
 * that take a value (`-n 5`, `-n5`, `-vs KILL`, `--signal KILL`,
 * `--signal=KILL`), the operands before the command (`timeout 5`, `chroot
 * DIR`, `flock FILE`), and options whose value is a shell script (`flock
 * FILE -c 'cmd'`). A table can miss an option, so the words after a wrapper
 * that name a guarded program are read as commands too (`unwrapCommand`).
 */
interface Wrapper {
	values?: string[];
	operands?: number;
	scripts?: string[];
}
const WRAPPERS: Record<string, Wrapper> = {
	builtin: {},
	nohup: {},
	setsid: {},
	busybox: {},
	unbuffer: {},
	time: { values: ["-f", "-o", "--format", "--output"] },
	exec: { values: ["-a"] },
	nice: { values: ["-n", "--adjustment"] },
	timeout: { values: ["-k", "-s", "--kill-after", "--signal"], operands: 1 },
	xargs: {
		values: ["-n", "-I", "-J", "-L", "-P", "-R", "-S", "-d", "-E", "-s", "-a", "--max-args", "--max-lines", "--max-procs",
			"--delimiter", "--max-chars", "--arg-file", "--process-slot-var"],
	},
	stdbuf: { values: ["-i", "-o", "-e", "--input", "--output", "--error"] },
	ionice: { values: ["-c", "-n", "-p", "-P", "-u", "--class", "--classdata", "--pid", "--pgid", "--uid"] },
	chrt: { values: ["-T", "-P", "-D", "--sched-runtime", "--sched-period", "--sched-deadline"], operands: 1 },
	taskset: { operands: 1 },
	caffeinate: { values: ["-t", "-w"] },
	flock: { values: ["-w", "-E", "--timeout", "--wait", "--conflict-exit-code"], operands: 1, scripts: ["-c", "--command"] },
	chroot: { values: ["--userspec", "--groups"], operands: 1 },
	unshare: { values: ["-S", "-G", "-R", "-w", "--setuid", "--setgid", "--root", "--wd"] },
	arch: { values: ["-e", "-arch"] },
	"sandbox-exec": { values: ["-f", "-p", "-D", "-n"] },
	strace: { values: ["-o", "-e", "-p", "-s", "-u", "-E", "-a", "-b", "-O", "-P", "-S", "-X", "-I", "--output", "--trace", "--attach", "--user", "--env"] },
	ltrace: { values: ["-o", "-e", "-p", "-s", "-u", "-a", "-n", "-x", "-F", "--output"] },
	script: {
		values: ["-F", "-t", "-T", "-E", "-I", "-O", "-B", "-m", "-o", "--log-in", "--log-out", "--log-io", "--log-timing",
			"--logging-format", "--echo", "--output-limit"],
		operands: 1,
		scripts: ["-c", "--command"],
	},
};
const ENV_VALUES = ["-u", "-C", "-P", "-S", "-a", "--unset", "--chdir", "--split-string", "--argv0"];
/**
 * Programs the gate reads the arguments of: one-way doors, and shells. (A
 * wrapper cannot run the `eval`, `source` or `.` builtins.)
 */
const GUARDED = new Set(["git", "rm", "gh", "sudo", "doas", "su", "npm", "pnpm", "yarn", "cargo", "gem", "twine", ...SHELL_RUNNERS]);

interface Option {
	next: number;
	/** The option that takes a value, and that value (`-n5` and `--signal=KILL` included). */
	flag?: string;
	text?: string;
	dynamic: boolean;
}

/** Reads the option word at `k`, getopt-style: in a cluster (`-fo log`), the first flag that takes a value takes the rest or the next word. */
function readOption(words: WordToken[], k: number, takes: string[]): Option {
	const v = words[k].value;
	const separate = (flag: string): Option => ({ next: k + 2, flag, text: words[k + 1]?.value, dynamic: !!words[k + 1]?.hasDynamic });
	if (takes.includes(v)) return separate(v);
	if (v.startsWith("--")) {
		const eq = v.indexOf("=");
		return eq < 0 ? { next: k + 1, dynamic: false } : { next: k + 1, flag: v.slice(0, eq), text: v.slice(eq + 1), dynamic: words[k].hasDynamic };
	}
	for (let c = 1; c < v.length; c++) {
		const flag = `-${v[c]}`;
		if (!takes.includes(flag)) continue;
		return c + 1 < v.length ? { next: k + 1, flag, text: v.slice(c + 1), dynamic: words[k].hasDynamic } : separate(flag);
	}
	return { next: k + 1, dynamic: false };
}

/** Long shell options that take the next word as their value; some of them a script. */
const SHELL_LONG_VALUES = new Set(["rcfile", "init-file", "emulate", "debug", "debug-output", "features", "profile", "profile-startup"]);
const SHELL_LONG_SCRIPTS = new Set(["command", "init-command"]);
/** bash's long options, which it also takes with a single dash (`-rcfile x`, `-noprofile`). */
const BASH_LONG = new Set([
	"rcfile", "init-file", "noprofile", "norc", "login", "posix", "verbose", "noediting", "restricted",
	"debugger", "dump-strings", "dump-po-strings", "pretty-print", "wordexp", "help", "version", "protected",
]);
const STDIN_FILE = /^(\/dev\/stdin|\/dev\/fd\/0|\/proc\/self\/fd\/0)$/;

interface ShellRun {
	/** Something it runs is only known when it runs. */
	dynamic: boolean;
	/** No `-c` script and no script file: it runs what its input holds. */
	readsStdin: boolean;
	/** Neither a `-c` script nor a script file is on the command line. */
	noScript: boolean;
}

/**
 * Reads a shell's command line the way the shell does: options (clusters
 * such as `-euo pipefail`, where each `o` takes a value), then the first
 * operand, which is the script with `-c` (`bash -c -e 'cmd'` included) and
 * the script file without it.
 */
function shellRun(name: string, tail: WordToken[], nestedScripts: string[]): ShellRun {
	const valueChars = name === "fish" ? "oOdfC" : "oO";
	let cmode = false;
	let smode = false;
	let dynamic = false;
	const valueOf = (j: number, script: boolean) => {
		const w = tail[j];
		if (!w) return;
		if (w.hasDynamic) dynamic = true;
		if (script) nestedScripts.push(w.value);
	};
	let i = 0;
	for (; i < tail.length && !dynamic; i++) {
		const a = tail[i].value;
		// Among the options, a word only known when it runs may be `-c`.
		if (tail[i].hasDynamic) { dynamic = true; break; }
		if (a === "--" || a === "-") { i++; break; }
		const long = /^--?([a-z][a-z-]*)(=.*)?$/.exec(a);
		if (a.startsWith("--") || (long && BASH_LONG.has(long[1]))) {
			const flag = long?.[1] ?? "";
			// It prints and exits: it runs no script and reads no input.
			if (flag === "version" || flag === "help") return { dynamic: false, readsStdin: false, noScript: false };
			if (long?.[2] && SHELL_LONG_SCRIPTS.has(flag)) nestedScripts.push(long[2].slice(1));
			else if (!long?.[2] && (SHELL_LONG_VALUES.has(flag) || SHELL_LONG_SCRIPTS.has(flag))) valueOf(++i, SHELL_LONG_SCRIPTS.has(flag));
			continue;
		}
		// Any `-x`/`+x` word is an option (zsh has digit options: `-3`).
		if (!/^[-+]./.test(a)) break;
		for (const ch of a.slice(1)) {
			if (a[0] === "-" && ch === "c") cmode = true;
			else if (a[0] === "-" && ch === "s") smode = true;
			else if (valueChars.includes(ch)) valueOf(++i, ch === "C");
		}
	}
	const operand = dynamic ? undefined : tail[i];
	if (operand?.hasDynamic) dynamic = true;
	if (cmode && operand) nestedScripts.push(operand.value);
	// Should an option be misread, the script may be any later word: after a
	// `-…c…` word, read every literal one as a script too (but a bare shell
	// name there is `$0`, as in `sh -c '…' sh {}`).
	const c = tail.findIndex((w) => /^-[^-]*c/.test(w.value));
	for (let k = c + 1; c >= 0 && k < tail.length; k++) {
		const w = tail[k];
		if (!(cmode && k === i) && !w.hasDynamic && !w.value.startsWith("-") && !SHELL_RUNNERS.has(w.value)) nestedScripts.push(w.value);
	}
	const readsStdin = !dynamic && !cmode && (smode || !operand || STDIN_FILE.test(operand.value));
	return { dynamic, readsStdin, noScript: !operand };
}

/** The commands `find` runs (`-exec cmd … ;`, `-execdir`, `-ok`, `-okdir`), as scripts, words as written. */
function findActions(tail: WordToken[]): string[] {
	const out: string[] = [];
	for (let i = 0; i < tail.length; i++) {
		if (!["-exec", "-execdir", "-ok", "-okdir"].includes(tail[i].value)) continue;
		let end = i + 1;
		while (end < tail.length && tail[end].value !== ";" && tail[end].value !== "+") end++;
		const words = tail.slice(i + 1, end);
		if (words.length > 0) out.push(words.map((w) => w.raw).join(" "));
		i = end;
	}
	return out;
}

/**
 * The command these words run, after its wrappers; and, when there are
 * wrappers, `candidates`: every later word naming a guarded program, read as
 * the command it may be, so an option the table misreads cannot hide one.
 */
export function unwrapCommand(
	words: WordToken[],
	env: EnvAssignment[],
	redirects: Redirection[],
	depth: number,
	nestedScripts: string[],
): { cmd: SimpleCommand | null; candidates: SimpleCommand[] } {
	const main = unwrapOne(words, env, redirects, depth, nestedScripts);
	if (!main || main.cmd.wrappers.length === 0) return { cmd: main?.cmd ?? null, candidates: [] };
	const { cmd } = main;
	const candidates: SimpleCommand[] = [];
	for (let j = 1; j < words.length; j++) {
		if (j === main.head || words[j].hasDynamic || !GUARDED.has(basenameOf(words[j].value))) continue;
		const candidate = unwrapOne(words.slice(j), [...cmd.env], redirects, depth, nestedScripts)?.cmd;
		if (candidate) candidates.push(candidate);
	}
	// What `xargs` reads becomes arguments of a guarded program (`xargs git`),
	// or the command itself through its placeholder (`xargs -I{} {}`). Only
	// the command read through the table counts: a guarded word among its
	// arguments (`xargs grep -l git`) is not one.
	if (cmd.wrappers.includes("xargs") && (GUARDED.has(cmd.name) || (main.replace && cmd.rawName.includes(main.replace)))) {
		cmd.hasDynamicName = true;
	}
	return { cmd, candidates };
}

function unwrapOne(
	words: WordToken[],
	env: EnvAssignment[],
	redirects: Redirection[],
	depth: number,
	nestedScripts: string[],
): { cmd: SimpleCommand; head: number; replace?: string } | null {
	let idx = 0;
	let last = -1;
	const wrappers: string[] = [];
	let inlineScript = false;
	let dynamicScript = false; // a script only known when it runs
	let replace: string | undefined; // xargs' placeholder
	const script = (opt: Option) => {
		inlineScript = true;
		if (opt.dynamic) dynamicScript = true;
		if (opt.text !== undefined) nestedScripts.push(opt.text);
	};

	while (idx < words.length) {
		const base = basenameOf(words[idx].value);
		if (base === "env") {
			wrappers.push("env");
			last = idx++;
			while (idx < words.length) {
				const w = words[idx];
				if (w.value === "--") { idx++; break; }
				if (w.value === "-") { idx++; continue; }
				if (w.value.startsWith("-")) {
					const opt = readOption(words, idx, ENV_VALUES);
					if (opt.flag === "-S" || opt.flag === "--split-string") script(opt);
					idx = opt.next;
					continue;
				}
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
			last = idx;
			idx = j + (words[j]?.value === "--" ? 1 : 0);
			continue;
		}
		const wrapper = Object.hasOwn(WRAPPERS, base) ? WRAPPERS[base] : undefined;
		if (!wrapper) break;
		wrappers.push(base);
		if (base === "exec") inlineScript = true;
		last = idx++;
		let operands = wrapper.operands ?? 0;
		const takes = [...(wrapper.values ?? []), ...(wrapper.scripts ?? [])];
		// A value or an operand only known when it runs (`-P "$(nproc)"`,
		// `timeout "$T"`) is not the command: it does not ask.
		while (idx < words.length) {
			const v = words[idx].value;
			if (v === "--") { idx++; if (operands === 0) break; continue; }
			if (!v.startsWith("-") || v.length === 1) {
				if (operands === 0) break;
				operands--;
				idx++;
				continue;
			}
			const opt = readOption(words, idx, takes);
			if (opt.flag && wrapper.scripts?.includes(opt.flag)) script(opt);
			if (base === "xargs" && (opt.flag === "-I" || opt.flag === "-J")) replace = opt.text;
			if (base === "xargs" && /^(-i|--replace)/.test(v)) replace = v.replace(/^(-i|--replace=?)/, "") || "{}";
			idx = opt.next;
		}
	}

	// A wrapper with nothing after it (`flock FILE -c 'cmd'`, `nohup`) is the command.
	if (idx >= words.length) {
		if (last < 0) return null;
		idx = last;
		wrappers.pop();
	}
	const head = words[idx];
	const tail = words.slice(idx + 1);
	const name = basenameOf(head.value);
	const args = tail.map((w) => w.value);
	const hasDynamicArgs = tail.some((w) => w.hasDynamic);
	// An unquoted glob or brace expansion makes the name no literal word either.
	const globName = /[*?]|\[.*\]|\{.*(,|\.\.).*\}/.test(head.raw.replace(/\\.|'[^']*'|"[^"]*"/g, ""));
	let readsStdin = false;

	if (name === "eval") {
		inlineScript = true;
		const text = args[0] === "--" ? args.slice(1) : args;
		if (text.length > 0) nestedScripts.push(text.join(" "));
	} else if (name === "trap") {
		// `trap [--] ACTION SIGNAL…`: the action runs later, as a script.
		const k = args[0] === "--" ? 1 : 0;
		if (args.length - k >= 2 && args[k] !== "-" && (k === 1 || !args[k].startsWith("-"))) script({ next: 0, text: args[k], dynamic: tail[k].hasDynamic });
	} else if (name === "mapfile" || name === "readarray") {
		// `-C CALLBACK` runs every few lines read.
		for (let k = 0; k < tail.length && tail[k].value.startsWith("-") && tail[k].value !== "--"; ) {
			const opt = readOption(tail, k, ["-d", "-n", "-O", "-s", "-u", "-c", "-C"]);
			if (opt.flag === "-C") script(opt);
			k = opt.next;
		}
	} else if (name === "watch") {
		// `watch` runs its words, joined, with `sh -c`.
		let i = 0;
		while (i < tail.length && tail[i].value.startsWith("-")) i += ["-n", "--interval"].includes(tail[i].value) ? 2 : 1;
		inlineScript = true;
		if (tail.slice(i).some((w) => w.hasDynamic)) dynamicScript = true;
		if (i < tail.length) nestedScripts.push(args.slice(i).join(" "));
	} else if (SHELL_RUNNERS.has(name)) {
		inlineScript = true;
		const run = shellRun(name, tail, nestedScripts);
		// Under `xargs`, the missing script or `-c` comes from its input.
		if (run.dynamic || (run.noScript && wrappers.includes("xargs"))) dynamicScript = true;
		readsStdin = run.readsStdin;
	} else if (name === "source" || name === ".") {
		readsStdin = STDIN_FILE.test(args[0] ?? "");
		// `source <(cmd)` runs what `cmd` prints.
		if (args[0]?.startsWith("<(")) dynamicScript = true;
	} else if (INLINE_SCRIPT_FLAGS[name]?.size && args.some((a) => INLINE_SCRIPT_FLAGS[name].has(a))) {
		inlineScript = true;
	} else if (name === "deno" && args[0] === "eval") {
		inlineScript = true;
	}
	// What `find` runs for each file is a command of its own.
	if (name === "find") nestedScripts.push(...findActions(tail));
	// Input from a file or a here-document is not what a pipe feeds it
	// (`/dev/stdin` is); from a process substitution it is only known when it runs.
	for (const r of redirects) {
		if (!r.op.startsWith("<") || (r.fd ?? "0") !== "0" || (r.op === "<" && STDIN_FILE.test(r.target))) continue;
		if (readsStdin && r.op === "<" && r.target.startsWith("<(")) dynamicScript = true;
		readsStdin = false;
	}

	const cmd: SimpleCommand = {
		rawName: head.value,
		name,
		args,
		argv: [head.value, ...args],
		env,
		redirects,
		wrappers,
		hasDynamicName: head.hasDynamic || globName || (name === "eval" && hasDynamicArgs) || dynamicScript,
		hasDynamicArgs,
		hasEscapedWhitespaceInName: head.hasEscapedWhitespace,
		inlineScript,
		readsStdin,
		nestedDepth: depth,
	};
	return { cmd, head: idx, replace };
}
