#!/usr/bin/env node
/**
 * tower-goal generic ACP bridge: runs any Agent Client Protocol agent
 * (Claude Code, Codex CLI, Gemini CLI, OpenCode, or custom ACP adapters)
 * behind Pi's RPC protocol, so Tower supervises every engine uniformly.
 *
 * Trust Gate invariants (`docs/18-evolution-roadmap.md` P1.1):
 * - Engine profiles (`engines.ts`) apply strict built-in disabling / sandbox
 *   confinement per engine and classify each engine's trust level (`full_s2`,
 *   `restricted_s2`, `experimental`).
 * - `session/request_permission` fails closed via `evaluatePermission`: only
 *   Tower's 7 registered MCP tools (`mcp__tower__*`) are allowed; any attempt
 *   to invoke a built-in or non-Tower tool is rejected AND emitted as an
 *   audit event (`tower_trust_gate_denied`) to Tower's trace.
 * - All 7 tools (`read`, `write`, `edit`, `bash`, `ask_user`, `log`, `submit`)
 *   run via this script's `--mcp` server under the goal's Seatbelt profile,
 *   contract scope fence, and structured shell policy.
 *
 * Modes:
 *   acp.ts [pi flags]   the bridge: Pi RPC on stdio, the ACP agent as a child
 *   acp.ts --mcp        the MCP server the agent starts; talks to the bridge
 *                       over a Unix socket (TOWER_BRIDGE_SOCKET)
 *   acp.ts --version
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { type Socket, connect, createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

import { ACP_TOOLS, type ImageInput, type Json, buildPromptBlocks, parseImages } from "./acp_tools.ts";
import { engineProfile } from "./engines.ts";
import {
	type Autonomy,
	type Scope,
	TEXT,
	checkBash,
	checkRead,
	checkWrite,
	evaluatePermission,
	isAllow,
	langOf,
	sandboxed,
	scrubEnv,
} from "./policy.ts";
import { sandboxedOperations } from "./sandboxfs.ts";

const VERSION = "tower-acp-bridge 0.2";
const TOWER_MCP_SERVER_NAME = "tower";

interface QueuedTurn {
	message: string;
	images: ImageInput[];
}

function lines(stream: NodeJS.ReadableStream, onLine: (line: string) => void) {
	createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY }).on("line", (l) => {
		if (l.trim()) onLine(l);
	});
}

function parse(line: string): Json | null {
	try {
		return JSON.parse(line) as Json;
	} catch {
		return null;
	}
}

function realOrSelf(p: string): string {
	try {
		return realpathSync(p);
	} catch {
		return p;
	}
}

// ---- MCP server (runs inside the agent's process tree) -------------------

const WORKSPACE = realOrSelf(process.env.TOWER_WORKSPACE ?? process.cwd());
const PROFILE = process.env.TOWER_SANDBOX_PROFILE;
const AGENT_TMP = process.env.TOWER_TMP;
const ATTACHMENTS_DIR = process.env.TOWER_ATTACHMENTS_DIR;
const LANG = langOf(process.env.TOWER_LANG);
const NETWORK = process.env.TOWER_NETWORK === "1";

function allowedReadRoots(): string[] {
	return [
		WORKSPACE,
		...(AGENT_TMP ? [realOrSelf(AGENT_TMP)] : []),
		...(ATTACHMENTS_DIR ? [realOrSelf(ATTACHMENTS_DIR)] : []),
	];
}

interface ContractFile {
	autonomy: Autonomy;
	scope: Scope;
}

function loadContract(): ContractFile {
	const fallback: ContractFile = { autonomy: "cautious", scope: { include: [], exclude: [], readonly: [] } };
	const path = process.env.TOWER_CONTRACT;
	if (!path) return { ...fallback, autonomy: "standard" };
	try {
		const c = JSON.parse(readFileSync(path, "utf8"));
		return {
			autonomy: c.autonomy ?? "standard",
			scope: { include: c.scope?.include ?? [], exclude: c.scope?.exclude ?? [], readonly: c.scope?.readonly ?? [] },
		};
	} catch {
		return fallback;
	}
}

function absolute(raw: string): string {
	const p = isAbsolute(raw) ? raw : resolve(WORKSPACE, raw);
	let existing = p;
	const rest: string[] = [];
	while (!existsSync(existing) && dirname(existing) !== existing) {
		rest.unshift(existing.slice(dirname(existing).length + 1));
		existing = dirname(existing);
	}
	return [realOrSelf(existing), ...rest].join("/");
}

/** A request to the bridge over the socket, answered by `id`. */
function bridgeClient(path: string) {
	const sock: Socket = connect(path);
	const pending = new Map<number, (v: Json) => void>();
	let next = 1;
	lines(sock, (l) => {
		const m = parse(l);
		const resolveFn = m && pending.get(m.id as number);
		if (m && resolveFn) {
			pending.delete(m.id as number);
			resolveFn(m);
		}
	});
	return {
		send(msg: Json): void {
			sock.write(`${JSON.stringify(msg)}\n`);
		},
		ask(msg: Json): Promise<Json> {
			const id = next++;
			return new Promise((res) => {
				pending.set(id, res);
				sock.write(`${JSON.stringify({ ...msg, id })}\n`);
			});
		},
	};
}

function runBash(command: string, timeoutSecs: number): Promise<{ text: string; error: boolean }> {
	return new Promise((res) => {
		const env = scrubEnv(process.env as Record<string, string | undefined>, NETWORK);
		if (AGENT_TMP) env.TMPDIR = AGENT_TMP;
		const shell = PROFILE ? sandboxed(command, PROFILE) : command;
		const child = spawn("/bin/bash", ["-c", shell], { cwd: WORKSPACE, env, detached: true });
		const chunks: Buffer[] = [];
		let size = 0;
		const keep = (b: Buffer) => {
			chunks.push(b);
			size += b.length;
			while (size > 64 * 1024 && chunks.length > 1) size -= (chunks.shift() as Buffer).length;
		};
		child.stdout.on("data", keep);
		child.stderr.on("data", keep);
		const timer = setTimeout(() => {
			try {
				process.kill(-(child.pid as number), "SIGKILL");
			} catch {
				child.kill("SIGKILL");
			}
		}, Math.min(Math.max(timeoutSecs, 1), 600) * 1000);
		child.on("close", (code, signal) => {
			clearTimeout(timer);
			const out = Buffer.concat(chunks).toString("utf8").slice(-30_000);
			const tail = signal ? `\n(killed: ${signal}${signal === "SIGKILL" ? ", timed out" : ""})` : `\n(exit code ${code})`;
			res({ text: (out || "(no output)") + tail, error: code !== 0 });
		});
	});
}

async function mcpServer() {
	const socketPath = process.env.TOWER_BRIDGE_SOCKET;
	if (!socketPath) throw new Error("TOWER_BRIDGE_SOCKET is not set");
	const bridge = bridgeClient(socketPath);
	const contract = loadContract();
	const ops = PROFILE ? sandboxedOperations(PROFILE) : null;
	const readFile = (p: string) => (ops ? ops.read.readFile(p) : Promise.resolve(readFileSync(p)));
	const writeFile = async (p: string, content: string) => {
		if (ops) {
			await ops.write.mkdir(dirname(p));
			await ops.write.writeFile(p, content);
		} else {
			mkdirSync(dirname(p), { recursive: true });
			writeFileSync(p, content);
		}
	};
	const approve = async (tool: string, target: string, reason: string): Promise<boolean> => {
		const r = await bridge.ask({ type: "approval", tool, target, reason });
		return isAllow(r.answer as string | undefined);
	};
	const gateWrite = async (tool: string, raw: string): Promise<string | null> => {
		const abs = absolute(raw);
		const { verdict, rel } = checkWrite(contract.scope, WORKSPACE, abs);
		if (verdict === "allowed") return null;
		if (verdict === "outside_workspace") return `${raw} is outside this goal's workspace (${WORKSPACE}).`;
		const reason = TEXT[verdict];
		return (await approve(tool, rel, reason[LANG]))
			? null
			: `The human declined: writing ${rel} is not allowed (${reason.en}). Stay inside the contract's scope or ask_user.`;
	};

	async function call(name: string, args: Json): Promise<{ text: string; error?: boolean; stop?: boolean }> {
		switch (name) {
			case "read": {
				const abs = absolute(String(args.path ?? ""));
				if (!PROFILE && !checkRead(allowedReadRoots(), abs)) {
					return { text: `${args.path} is outside this goal's workspace.`, error: true };
				}
				const all = (await readFile(abs)).toString("utf8").split("\n");
				const from = Math.max(1, Number(args.offset ?? 1));
				const count = Math.min(Number(args.limit ?? 2000), 2000);
				const shown = all.slice(from - 1, from - 1 + count).map((l, i) => `${String(from + i).padStart(6)}\t${l}`);
				const more = from - 1 + count < all.length ? `\n(${all.length - (from - 1 + count)} more lines; use offset)` : "";
				return { text: shown.join("\n") + more };
			}
			case "write": {
				const blocked = await gateWrite("write", String(args.path ?? ""));
				if (blocked) return { text: blocked, error: true };
				await writeFile(absolute(String(args.path)), String(args.content ?? ""));
				return { text: `Wrote ${args.path}.` };
			}
			case "edit": {
				const blocked = await gateWrite("edit", String(args.path ?? ""));
				if (blocked) return { text: blocked, error: true };
				const abs = absolute(String(args.path));
				let text = (await readFile(abs)).toString("utf8");
				for (const e of (args.edits as Array<{ oldText: string; newText: string }>) ?? []) {
					const n = text.split(e.oldText).length - 1;
					if (n !== 1) {
						return { text: `oldText must occur exactly once in ${args.path}; it occurs ${n} times.`, error: true };
					}
					text = text.replace(e.oldText, () => e.newText);
				}
				await writeFile(abs, text);
				return { text: `Edited ${args.path}.` };
			}
			case "bash": {
				const command = String(args.command ?? "");
				const v = checkBash(command, contract.autonomy);
				if (v.action === "ask" && !(await approve("bash", command, v.reason[LANG]))) {
					return { text: `The human declined this command (${v.reason.en}). Find another way or ask_user.`, error: true };
				}
				return runBash(command, Number(args.timeout ?? 120));
			}
			case "ask_user": {
				const r = await bridge.ask({ type: "question", question: args.question, options: args.options ?? [], why: args.why ?? "" });
				const answer = r.answer as string | undefined;
				return {
					text:
						answer === undefined || answer.trim() === ""
							? 'The human did not answer. Continue with your best judgement and record it with log(kind: "assumption").'
							: `The human answered: ${answer}`,
				};
			}
			case "log":
				return { text: "Logged." };
			case "submit": {
				const blocked = String(args.outcome ?? "done").toLowerCase() === "blocked";
				return {
					text: blocked
						? "Blocked report received. Tower will pause this goal and ask the human for guidance. Stop now; do not continue unless asked."
						: "Submitted. Tower will verify the criteria in a clean checkout. Stop now; do not continue unless asked.",
					stop: true,
				};
			}
			default:
				return { text: `Unknown tool ${name}`, error: true };
		}
	}

	const out = (m: Json) => process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...m })}\n`);
	let calls = 0;
	lines(process.stdin, async (l) => {
		const m = parse(l);
		if (!m || typeof m.method !== "string") return;
		const id = m.id;
		const params = (m.params ?? {}) as Json;
		if (m.method === "initialize") {
			out({
				id,
				result: {
					protocolVersion: params.protocolVersion ?? "2025-06-18",
					capabilities: { tools: {} },
					serverInfo: { name: TOWER_MCP_SERVER_NAME, version: VERSION },
				},
			});
		} else if (m.method === "tools/list") {
			out({ id, result: { tools: ACP_TOOLS } });
		} else if (m.method === "tools/call") {
			const name = String(params.name ?? "");
			const args = (params.arguments ?? {}) as Json;
			const callId = `tower_${process.pid}_${++calls}`;
			bridge.send({ type: "tool_start", callId, name, args });
			let r: { text: string; error?: boolean; stop?: boolean };
			try {
				r = await call(name, args);
			} catch (e) {
				r = { text: e instanceof Error ? e.message : String(e), error: true };
			}
			bridge.send({ type: "tool_end", callId, name, text: r.text, error: !!r.error });
			out({ id, result: { content: [{ type: "text", text: r.text }], isError: !!r.error } });
		} else if (id !== undefined) {
			if (m.method === "ping") out({ id, result: {} });
			else out({ id, error: { code: -32601, message: `unknown method ${m.method}` } });
		}
	});
}

// ---- the bridge: Pi RPC outside, ACP inside --------------------------------

function flag(name: string): string | undefined {
	const i = process.argv.indexOf(name);
	return i >= 0 ? process.argv[i + 1] : undefined;
}

async function bridgeMain() {
	const agentCommand = process.env.TOWER_ACP_AGENT;
	if (!agentCommand) throw new Error("TOWER_ACP_AGENT is not set");
	const engine = engineProfile(process.env.TOWER_ENGINE);
	const sessionDir = flag("--session-dir") ?? tmpdir();
	const resumeFile = flag("--session");
	const model = flag("--model");
	const appendPrompt = flag("--append-system-prompt");
	mkdirSync(sessionDir, { recursive: true });
	const sessionFile = resumeFile ?? join(sessionDir, `acp-${engine.id}-${Date.now()}.json`);

	const emit = (m: Json) => process.stdout.write(`${JSON.stringify(m)}\n`);
	const respond = (id: unknown, command: string, data: Json = {}, success = true, error?: string) =>
		emit({ id, type: "response", command, success, data, ...(error ? { error } : {}) });

	const dialogs = new Map<string, (answer: string | undefined) => void>();
	let dialogSeq = 0;
	const dialog = (method: "select" | "input", title: string, options: string[]): Promise<string | undefined> => {
		const id = `acp-ui-${++dialogSeq}`;
		return new Promise((res) => {
			dialogs.set(id, res);
			emit({ type: "extension_ui_request", id, method, title, options });
		});
	};

	const socketPath = join(mkdtempSync(join(tmpdir(), "tower-")), "bridge.sock");
	const server = createServer((sock) => {
		lines(sock, async (l) => {
			const m = parse(l);
			if (!m) return;
			const reply = (answer: string | undefined) => sock.write(`${JSON.stringify({ id: m.id, answer })}\n`);
			switch (m.type) {
				case "tool_start":
					emit({ type: "tool_execution_start", toolCallId: m.callId, toolName: m.name, args: m.args });
					break;
				case "tool_end":
					emit({
						type: "tool_execution_end",
						toolCallId: m.callId,
						toolName: m.name,
						result: { content: [{ type: "text", text: m.text }] },
						isError: m.error,
					});
					if (m.name === "submit" && !m.error) submitted = true;
					break;
				case "approval":
					reply(
						await dialog(
							"select",
							`tower:${JSON.stringify({ tower: "approval", tool: m.tool, target: m.target, reason: m.reason })}`,
							[TEXT.allow[LANG], TEXT.deny[LANG]],
						),
					);
					break;
				case "question":
					reply(
						await dialog(
							"input",
							`tower:${JSON.stringify({ tower: "question", question: m.question, options: m.options, why: m.why })}`,
							[],
						),
					);
					break;
			}
		});
	});
	await new Promise<void>((res) => server.listen(socketPath, res));
	const cleanup = () => {
		try {
			server.close();
			rmSync(dirname(socketPath), { recursive: true, force: true });
		} catch {
			// gone
		}
	};
	process.on("exit", cleanup);

	const agent = spawn("/bin/sh", ["-c", agentCommand], {
		cwd: WORKSPACE,
		env: { ...process.env, ...engine.envOverrides },
		stdio: ["pipe", "pipe", "inherit"],
	});
	agent.on("exit", (code) => {
		cleanup();
		process.exit(code ?? 1);
	});
	const pending = new Map<number, { resolve: (v: Json) => void; reject: (e: Error) => void }>();
	let rpcId = 0;
	const send = (m: Json) => agent.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...m })}\n`);
	const request = (method: string, params: Json): Promise<Json> =>
		new Promise((res, rej) => {
			const id = ++rpcId;
			pending.set(id, { resolve: res, reject: rej });
			send({ id, method, params });
		});

	let sessionId: string | null = null;
	let busy = false;
	let submitted = false;
	let cost = 0;
	let text = "";
	let loading = false;
	let unauthorizedAttempts = 0;
	const queue: QueuedTurn[] = [];

	lines(agent.stdout, (l) => {
		const m = parse(l);
		if (!m) return;
		if (m.id !== undefined && m.method === undefined) {
			const p = pending.get(m.id as number);
			if (!p) return;
			pending.delete(m.id as number);
			if (m.error) p.reject(new Error((m.error as Json).message as string));
			else p.resolve((m.result ?? {}) as Json);
			return;
		}
		const params = (m.params ?? {}) as Json;
		if (m.method === "session/update") {
			if (loading) return;
			const u = (params.update ?? {}) as Json;
			if (u.sessionUpdate === "agent_message_chunk") {
				const c = (u.content ?? {}) as Json;
				if (c.type === "text") {
					text += String(c.text ?? "");
					emit({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: c.text } });
				}
			}
			if (u.sessionUpdate === "usage_update") {
				const c = (u.cost ?? {}) as Json;
				if (typeof c.amount === "number" && (c.currency ?? "USD") === "USD") cost = c.amount;
			}
			return;
		}
		if (m.method === "session/request_permission") {
			const decision = evaluatePermission(params, TOWER_MCP_SERVER_NAME);
			send({ id: m.id, result: { outcome: decision.outcome } });
			if (!decision.allowed) {
				unauthorizedAttempts++;
				emit({
					type: "tower_trust_gate_denied",
					engine: engine.id,
					trustLevel: engine.trustLevel,
					tool: decision.toolName,
					reason: decision.reason,
					attempts: unauthorizedAttempts,
				});
			}
			return;
		}
		if (m.id !== undefined) send({ id: m.id, error: { code: -32601, message: `Tower does not offer ${m.method}` } });
	});

	const init = await request("initialize", {
		protocolVersion: 1,
		clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
	});
	const agentCaps = (init.agentCapabilities ?? {}) as Json;
	const canLoad = !!agentCaps.loadSession;
	const promptCaps = (agentCaps.promptCapabilities ?? {}) as Json;
	const supportsImageBlocks = promptCaps.image !== false;

	const towerEnv = Object.entries(process.env)
		.filter(([k]) => k.startsWith("TOWER_"))
		.map(([name, value]) => ({ name, value: String(value) }));
	const mcpServers = [
		{
			name: TOWER_MCP_SERVER_NAME,
			command: process.execPath,
			args: [fileURLToPath(import.meta.url), "--mcp"],
			env: [...towerEnv, { name: "TOWER_BRIDGE_SOCKET", value: socketPath }, { name: "PATH", value: process.env.PATH ?? "" }],
		},
	];
	const meta = engine.buildSessionMeta({ model, appendPrompt, serverName: TOWER_MCP_SERVER_NAME });

	async function ensureSession() {
		if (sessionId) return;
		if (resumeFile && existsSync(resumeFile) && canLoad) {
			try {
				const saved = JSON.parse(readFileSync(resumeFile, "utf8")) as { sessionId?: string };
				if (saved.sessionId) {
					loading = true;
					await request("session/load", { sessionId: saved.sessionId, cwd: WORKSPACE, mcpServers, _meta: meta });
					loading = false;
					sessionId = saved.sessionId;
					return;
				}
			} catch {
				loading = false;
			}
		}
		const r = await request("session/new", { cwd: WORKSPACE, mcpServers, _meta: meta });
		sessionId = r.sessionId as string;
		writeFileSync(sessionFile, JSON.stringify({ sessionId, engine: engine.id, trustLevel: engine.trustLevel }));
	}

	async function turn(first: QueuedTurn) {
		busy = true;
		submitted = false;
		emit({ type: "agent_start" });
		let next: QueuedTurn | undefined = first;
		while (next !== undefined) {
			emit({ type: "turn_start" });
			text = "";
			let stopReason = "end_turn";
			let error: string | undefined;
			try {
				const prompt = buildPromptBlocks(next.message, next.images, supportsImageBlocks, allowedReadRoots(), absolute);
				const r = await request("session/prompt", { sessionId, prompt });
				stopReason = String(r.stopReason ?? "end_turn");
				const usage = ((r._meta ?? {}) as Json).usage as Json | undefined;
				if (usage && typeof usage.costUsd === "number") cost = usage.costUsd;
			} catch (e) {
				stopReason = "error";
				error = e instanceof Error ? e.message : String(e);
			}
			emit({
				type: "message_end",
				message: {
					role: "assistant",
					content: [{ type: "text", text }],
					stopReason: stopReason === "error" ? "error" : "stop",
					...(error ? { errorMessage: error } : {}),
				},
			});
			emit({ type: "turn_end", message: {}, toolResults: [] });
			next = submitted || stopReason === "cancelled" ? undefined : queue.shift();
		}
		emit({ type: "agent_end", messages: [], willRetry: false });
		emit({ type: "agent_settled", aborted: false });
		busy = false;
	}

	lines(process.stdin, async (l) => {
		const cmd = parse(l);
		if (!cmd) return;
		const t = String(cmd.type ?? "");
		const id = cmd.id;
		try {
			switch (t) {
				case "get_state":
					respond(id, t, {
						sessionFile,
						sessionId: sessionId ?? "",
						isStreaming: busy,
						engine: engine.id,
						trustLevel: engine.trustLevel,
						unauthorizedToolAttempts: unauthorizedAttempts,
					});
					break;
				case "get_session_stats":
					respond(id, t, { cost, unauthorizedToolAttempts: unauthorizedAttempts });
					break;
				case "get_available_models":
					respond(id, t, { models: [] });
					break;
				case "prompt":
					await ensureSession();
					respond(id, t, { disposition: "started" });
					void turn({ message: String(cmd.message ?? ""), images: parseImages(cmd.images) });
					break;
				case "steer":
				case "follow_up": {
					const payload: QueuedTurn = { message: String(cmd.message ?? ""), images: parseImages(cmd.images) };
					if (busy) {
						queue.push(payload);
						respond(id, t, { disposition: "queued" });
					} else {
						await ensureSession();
						respond(id, t, { disposition: "started" });
						void turn(payload);
					}
					break;
				}
				case "abort":
					queue.length = 0;
					if (sessionId) send({ method: "session/cancel", params: { sessionId } });
					respond(id, t);
					break;
				case "extension_ui_response": {
					const resolveFn = dialogs.get(String(cmd.id));
					if (resolveFn) {
						dialogs.delete(String(cmd.id));
						resolveFn(cmd.cancelled ? undefined : (cmd.value as string | undefined) ?? (cmd.confirmed ? "yes" : undefined));
					}
					break;
				}
				default:
					respond(id, t, {}, false, `unsupported command ${t}`);
			}
		} catch (e) {
			respond(id, t, {}, false, e instanceof Error ? e.message : String(e));
		}
	});
	process.stdin.on("end", () => agent.kill("SIGTERM"));
}

if (process.argv.includes("--version")) {
	console.log(VERSION);
} else if (process.argv.includes("--mcp")) {
	mcpServer().catch((e) => {
		console.error(e);
		process.exit(1);
	});
} else {
	bridgeMain().catch((e) => {
		console.error(e instanceof Error ? e.message : e);
		process.exit(1);
	});
}
