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
 * that take a value (`-n 5`, `-n5`, `-vs KILL`, `--signal KILL`, `--sig
 * KILL`, `--signal=KILL`), the operands before the command (`timeout 5`,
 * `chroot DIR`, `flock FILE`), options whose value is a shell script (`flock
 * FILE -c 'cmd'`, `env -S 'cmd'`), and for `env`, `NAME=value` words. A table
 * can miss an option, so every position where some reading of the options
 * puts a command is read as the command it may be too (`commandPositions`).
 */
interface Wrapper {
	values?: string[];
	/** Options known to take nothing: only an option the table does not know is also read as taking a value. */
	flags?: string[];
	operands?: number;
	scripts?: string[];
	assigns?: boolean;
}
const WRAPPERS: Record<string, Wrapper> = {
	env: {
		values: ["-u", "-C", "-P", "-a", "--unset", "--chdir", "--argv0"], scripts: ["-S", "--split-string"], assigns: true,
		flags: ["-i", "-0", "-v", "--ignore-environment", "--null", "--debug"],
	},
	builtin: {},
	nohup: {},
	setsid: {},
	busybox: {},
	unbuffer: {},
	time: { values: ["-f", "-o", "--format", "--output"], flags: ["-p", "-v", "-a", "-q", "-l", "--portability", "--verbose", "--append", "--quiet"] },
	exec: { values: ["-a"] },
	nice: { values: ["-n", "--adjustment"] },
	timeout: { values: ["-k", "-s", "--kill-after", "--signal"], operands: 1, flags: ["-v", "-f", "-p", "--verbose", "--foreground", "--preserve-status"] },
	xargs: {
		values: ["-n", "-I", "-J", "-L", "-P", "-R", "-S", "-d", "-E", "-s", "-a", "--max-args", "--max-lines", "--max-procs",
			"--delimiter", "--max-chars", "--arg-file", "--process-slot-var"],
		flags: ["-0", "-r", "-t", "-p", "-x", "-o", "--null", "--no-run-if-empty", "--verbose", "--interactive", "--exit", "--open-tty"],
	},
	stdbuf: { values: ["-i", "-o", "-e", "--input", "--output", "--error"] },
	ionice: { values: ["-c", "-n", "-p", "-P", "-u", "--class", "--classdata", "--pid", "--pgid", "--uid"] },
	chrt: { values: ["-T", "-P", "-D", "--sched-runtime", "--sched-period", "--sched-deadline"], operands: 1 },
	taskset: { operands: 1 },
	caffeinate: { values: ["-t", "-w"], flags: ["-d", "-i", "-m", "-s", "-u"] },
	flock: {
		values: ["-w", "-E", "--timeout", "--wait", "--conflict-exit-code"], operands: 1, scripts: ["-c", "--command"],
		flags: ["-s", "-x", "-e", "-u", "-n", "-o", "-F", "--shared", "--exclusive", "--unlock", "--nonblock", "--close", "--no-fork"],
	},
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
/**
 * Programs the gate reads the arguments of: one-way doors, and shells. (A
 * wrapper cannot run the `eval`, `source` or `.` builtins.)
 */
const GUARDED = new Set(["git", "rm", "gh", "sudo", "doas", "su", "npm", "pnpm", "yarn", "cargo", "gem", "twine", ...SHELL_RUNNERS]);
/** What runs another command or a script it is given: the wrappers, `command`, `find` and `watch`. */
const CARRIERS = new Set([...Object.keys(WRAPPERS), "command", "find", "watch"]);

/** An unquoted glob or brace expansion, in a word's unquoted parts. */
const GLOB = /[*?]|\[.*\]|\{[^}]*(,|\.\.)[^}]*\}/;
const unquoted = (raw: string) => raw.replace(/\\.|'[^']*'|"[^"]*"/g, "");

/**
 * A word that stays one word when it runs: literal with no glob or brace,
 * or a literal prefix and one double-quoted expansion that cannot split
 * (`"$T"`, `"${T:-60}"`, `"$(nproc)"`, `FOO="$BAR"`; not `"$@"`,
 * `"${a[@]}"` or `"${!p@}"`, and nothing unquoted).
 */
function oneWord(w: WordToken | undefined): boolean {
	if (!w) return true;
	if (GLOB.test(unquoted(w.raw))) return false;
	if (!w.hasDynamic) return true;
	return /^[\w=.:/+-]*"[^"]*"$/.test(w.raw) && !/\$@|\$\{@|\[@\]|\$\{!/.test(w.raw);
}

interface Option {
	next: number;
	/** The option that takes a value, and that value (`-n5` and `--signal=KILL` included). */
	flag?: string;
	text?: string;
	dynamic: boolean;
}

/**
 * Reads the option word at `k`, getopt-style: in a cluster (`-fo log`), the
 * first flag that takes a value takes the rest or the next word; a long
 * option may be an unambiguous prefix (`--sig` for `--signal`).
 */
function readOption(words: WordToken[], k: number, takes: string[]): Option {
	const v = words[k].value;
	const separate = (flag: string): Option => ({ next: k + 2, flag, text: words[k + 1]?.value, dynamic: !!words[k + 1]?.hasDynamic });
	if (takes.includes(v)) return separate(v);
	if (v.startsWith("--")) {
		const eq = v.indexOf("=");
		const name = eq < 0 ? v : v.slice(0, eq);
		const flag = takes.find((t) => t.startsWith("--") && t.startsWith(name));
		if (eq >= 0) return { next: k + 1, flag: flag ?? name, text: v.slice(eq + 1), dynamic: words[k].hasDynamic };
		return flag ? separate(flag) : { next: k + 1, dynamic: false };
	}
	for (let c = 1; c < v.length; c++) {
		const flag = `-${v[c]}`;
		if (!takes.includes(flag)) continue;
		return c + 1 < v.length ? { next: k + 1, flag, text: v.slice(c + 1), dynamic: words[k].hasDynamic } : separate(flag);
	}
	return { next: k + 1, dynamic: false };
}

/**
 * Where the options and operands of the wrapper `base` may end, from `k`:
 * as read, and again for each unknown option taking the next word as its
 * value, and each known short value option taken as a plain flag.
 */
function wrapperEnds(words: WordToken[], k: number, base: string, operands: number, out: Set<number>, seen = new Set<string>()): void {
	// Each reading that reaches the same word with the same operands left goes on alike: visit it once, so a long
	// run of options costs a square, not a power of two (`setsid -f -f -f …`).
	const state = `${k}:${operands}`;
	if (seen.has(state)) return;
	seen.add(state);
	const w = WRAPPERS[base];
	const takes = [...(w.values ?? []), ...(w.scripts ?? [])];
	while (k < words.length && out.size < 32) {
		const v = words[k].value;
		if (v === "--") { k++; if (operands === 0) break; continue; }
		if (w.assigns && (v === "-" || isEnvAssignmentWord(words[k]))) { k++; continue; }
		if (!v.startsWith("-") || v.length === 1) {
			if (operands === 0) break;
			operands--;
			k++;
			continue;
		}
		const opt = readOption(words, k, takes);
		// The table cannot know every build's options: an unknown one may take the next word, and a known value
		// option may be a plain flag elsewhere (BSD `script -F` against util-linux `script -F FILE`).
		const known = v.startsWith("--") ? w.flags?.includes(v) : [...v.slice(1)].every((c) => w.flags?.includes(`-${c}`));
		if (!opt.flag && !v.includes("=") && !known) wrapperEnds(words, k + 2, base, operands, out, seen);
		else if (opt.flag && opt.next === k + 2 && !v.startsWith("--")) wrapperEnds(words, k + 1, base, operands, out, seen);
		k = opt.next;
	}
	out.add(k);
}

/** Every position where some reading of the wrappers' options puts a command or a further wrapper. */
function commandPositions(words: WordToken[], p: number, out: Set<number>): void {
	if (p >= words.length || out.has(p) || out.size >= 32) return;
	out.add(p);
	const base = basenameOf(words[p].value);
	if (base === "command") {
		let j = p + 1;
		for (; j < words.length && words[j].value.startsWith("-") && words[j].value !== "--"; j++) {
			if (/[vV]/.test(words[j].value)) return;
		}
		commandPositions(words, j + (words[j]?.value === "--" ? 1 : 0), out);
		return;
	}
	if (!Object.hasOwn(WRAPPERS, base)) return;
	const ends = new Set<number>();
	wrapperEnds(words, p + 1, base, WRAPPERS[base].operands ?? 0, ends);
	for (const e of ends) commandPositions(words, e, out);
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
 * wrappers, `candidates`: each other position where some reading of their
 * options puts a guarded program or a carrier, read as the command it may
 * be, so an option the table misreads cannot hide one. A word that is only
 * an argument of the command (`timeout 5 grep -rn sudo .`) is none.
 */
export function unwrapCommand(
	words: WordToken[],
	env: EnvAssignment[],
	redirects: Redirection[],
	depth: number,
	nestedScripts: string[],
): { cmd: SimpleCommand | null; candidates: SimpleCommand[] } {
	const main = unwrapOne(words, env, redirects, depth, nestedScripts);
	if (!main || main.path.length < 2) return { cmd: main?.cmd ?? null, candidates: [] };
	const { cmd } = main;
	const positions = new Set<number>();
	commandPositions(words, 0, positions);
	const candidates: SimpleCommand[] = [];
	for (const p of positions) {
		const name = basenameOf(words[p].value);
		if (main.path.includes(p) || words[p].hasDynamic || !(GUARDED.has(name) || CARRIERS.has(name))) continue;
		const candidate = unwrapOne(words.slice(p), [...cmd.env], redirects, depth, nestedScripts)?.cmd;
		if (candidate) candidates.push(candidate);
	}
	// What `xargs` reads becomes arguments of what it runs: a guarded program
	// (`xargs git`), a wrapper or carrier (`xargs env`, `xargs -I{} watch {}`),
	// or the command itself through its placeholder (`xargs -I{} {}`).
	const x = cmd.wrappers.indexOf("xargs");
	if (
		x >= 0 &&
		(x < cmd.wrappers.length - 1 || GUARDED.has(cmd.name) || CARRIERS.has(cmd.name) || candidates.length > 0 ||
			(main.replace && cmd.rawName.includes(main.replace)))
	) {
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
): { cmd: SimpleCommand; path: number[]; replace?: string } | null {
	let idx = 0;
	let last = -1;
	const wrappers: string[] = [];
	const path: number[] = []; // where each wrapper, then the command, starts
	let inlineScript = false;
	let dynamicScript = false; // a script, or a word that may move the command, only known when it runs
	let replace: string | undefined; // xargs' placeholder
	const script = (opt: Option) => {
		inlineScript = true;
		if (opt.dynamic) dynamicScript = true;
		if (opt.text !== undefined) nestedScripts.push(opt.text);
	};

	while (idx < words.length) {
		const base = basenameOf(words[idx].value);
		if (base === "command") {
			let j = idx + 1;
			let lookupOnly = false;
			while (j < words.length && words[j].value.startsWith("-") && words[j].value !== "--") {
				if (/[vV]/.test(words[j].value)) lookupOnly = true;
				j++;
			}
			if (lookupOnly) break;
			wrappers.push("command");
			path.push(idx);
			last = idx;
			idx = j + (words[j]?.value === "--" ? 1 : 0);
			continue;
		}
		const wrapper = Object.hasOwn(WRAPPERS, base) ? WRAPPERS[base] : undefined;
		if (!wrapper) break;
		wrappers.push(base);
		path.push(idx);
		if (base === "exec") inlineScript = true;
		last = idx++;
		let operands = wrapper.operands ?? 0;
		const takes = [...(wrapper.values ?? []), ...(wrapper.scripts ?? [])];
		// A value or operand only known when it runs is not the command when
		// it stays one word (`-P "$(nproc)"`, `timeout "$T"`); one that can
		// split into words (`timeout $X`, `"$@"`, `{5,sh,-c}`) can move it.
		while (idx < words.length) {
			const w = words[idx];
			const v = w.value;
			if (v === "--") { idx++; if (operands === 0) break; continue; }
			if (wrapper.assigns && v === "-") { idx++; continue; }
			const assign = wrapper.assigns ? isEnvAssignmentWord(w) : null;
			if (!v.startsWith("-") || v.length === 1) {
				if (!assign && operands === 0) break;
				if (!oneWord(w)) dynamicScript = true;
				if (assign) env.push(assign);
				else operands--;
				idx++;
				continue;
			}
			const opt = readOption(words, idx, takes);
			if (!oneWord(w) || (opt.next === idx + 2 && !oneWord(words[idx + 1]))) dynamicScript = true;
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
	if (!path.includes(idx)) path.push(idx);
	const head = words[idx];
	const tail = words.slice(idx + 1);
	const name = basenameOf(head.value);
	const args = tail.map((w) => w.value);
	const hasDynamicArgs = tail.some((w) => w.hasDynamic);
	// An unquoted glob or brace expansion makes the name no literal word either.
	const globName = GLOB.test(unquoted(head.raw));
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
	return { cmd, path, replace };
}
