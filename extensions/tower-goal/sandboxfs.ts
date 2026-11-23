/**
 * File operations for Pi/ACP's read, edit and write tools that run inside the
 * same OS sandbox profile as the agent's shell.
 *
 * Instead of spawning a fresh `/usr/bin/sandbox-exec` process on every file
 * operation (~15 ms/call), Tower maintains a single persistent helper child
 * process started once inside the sandbox profile, speaking newline-delimited
 * JSON RPC over stdio (`read`, `access`, `write`, `mkdir`, `mime`, `ping`)
 * with a strict 16 MiB file cap and atomic-safe temp+rename writes.
 *
 * The helper spawns lazily on first use, transparently auto-restarts if it
 * crashes, falls back cleanly to per-call `sandbox-exec` if no helper runtime
 * is available in the profile, and exposes `close()` for deterministic shutdown.
 */

import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";

import type { EditOperations, ReadOperations, WriteOperations } from "@earendil-works/pi-coding-agent";

const SANDBOX_EXEC = "/usr/bin/sandbox-exec";
export const MAX_FILE_BYTES = 16 * 1024 * 1024;

export interface SandboxFsOptions {
	/** Explicit helper binary command (overrides `process.env.TOWER_FS_HELPER`). */
	helperCommand?: string | string[];
	/** Override sandbox executable (defaults to `/usr/bin/sandbox-exec`). */
	sandboxBin?: string;
	/** Override max file cap in bytes (defaults to 16 MiB). */
	maxFileBytes?: number;
	/** Disable built-in sandboxed Node persistent helper fallback (mainly for tests). */
	disableNodeHelper?: boolean;
	/** How long one operation may take before it fails (defaults to 30 s). */
	requestTimeoutMs?: number;
}

const REQUEST_TIMEOUT_MS = 30_000;

export interface SandboxedOperations {
	read: ReadOperations;
	edit: EditOperations;
	write: WriteOperations;
	/** Terminates the persistent sandboxed helper process, if running. */
	close: () => void;
	/** Current PID of the persistent helper process, or `null` when idle/fallback. */
	helperPid: () => number | null;
}

interface HelperResponse {
	id: number;
	ok: boolean;
	data_b64?: string;
	mime?: string | null;
	code?: string;
	error?: string;
}

interface PendingCall {
	resolve: (resp: HelperResponse) => void;
	reject: (err: Error) => void;
}

/**
 * Minimal persistent JSONL FS helper run inside `sandbox-exec` when no native
 * Rust `TOWER_FS_HELPER` binary is configured. Speaks the exact same protocol
 * as `crates/tower-supervisor/src/fs_helper.rs`.
 */
function inlineNodeHelperSource(maxBytes: number): string {
	return `
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const MAX = ${Math.floor(maxBytes)};
let seq = 0;

function imgMime(head) {
  if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return "image/png";
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head.length >= 6 && /^GIF8[79]a$/.test(head.subarray(0, 6).toString("latin1"))) return "image/gif";
  if (head.length >= 12 && head.subarray(0, 4).toString("latin1") === "RIFF" && head.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

function errResp(id, e) {
  const code = e && (e.code === "EPERM" || e.code === "EACCES") ? "permission_denied"
    : e && e.code === "ENOENT" ? "not_found" : "io_error";
  const msg = code === "permission_denied" ? "Operation not permitted"
    : code === "not_found" ? "No such file or directory" : (e && e.message) || String(e);
  return { id, ok: false, code, error: msg };
}

// Opening a FIFO the agent made would wait for a writer for ever: open
// without waiting, and refuse anything that is not a regular file.
function notRegular() {
  return Object.assign(new Error("not a regular file"), { code: "ENOTREG" });
}

function openRegular(p) {
  const fd = fs.openSync(p, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
  if (!fs.fstatSync(fd).isFile()) { fs.closeSync(fd); throw notRegular(); }
  return fd;
}

function writeAtomic(target, buf) {
  let isLink = false;
  try { isLink = fs.lstatSync(target).isSymbolicLink(); } catch {}
  if (isLink) {
    let st = null;
    try { st = fs.statSync(target); } catch {}
    if (st && !st.isFile()) throw notRegular();
    fs.writeFileSync(target, buf);
    return;
  }
  const dir = path.dirname(target);
  const tmp = path.join(dir, ".tower-fs-tmp-" + process.pid + "-" + (++seq));
  try {
    let mode;
    try { mode = fs.statSync(target).mode; } catch {}
    fs.writeFileSync(tmp, buf, { flag: "wx" });
    if (mode !== undefined) { try { fs.chmodSync(tmp, mode); } catch {} }
    fs.renameSync(tmp, target);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch {}
    throw e;
  }
}

function handle(req) {
  const id = req.id || 0;
  try {
    switch (req.op) {
      case "ping": return { id, ok: true };
      case "read": {
        const fd = openRegular(req.path);
        try {
          const st = fs.fstatSync(fd);
          if (st.size > MAX) return { id, ok: false, code: "too_large", error: "file exceeds " + MAX + " byte limit" };
          const buf = Buffer.allocUnsafe(Math.min(st.size + 1, MAX + 1));
          let off = 0;
          while (off < buf.length) {
            const n = fs.readSync(fd, buf, off, buf.length - off, null);
            if (n === 0) break;
            off += n;
            if (off > MAX) return { id, ok: false, code: "too_large", error: "file exceeds " + MAX + " byte limit" };
          }
          return { id, ok: true, data_b64: buf.subarray(0, off).toString("base64") };
        } finally { fs.closeSync(fd); }
      }
      case "access": {
        const fd = openRegular(req.path);
        try {
          const b = Buffer.allocUnsafe(1);
          fs.readSync(fd, b, 0, 1, 0);
          return { id, ok: true };
        } finally { fs.closeSync(fd); }
      }
      case "write": {
        const buf = req.data_b64 !== undefined ? Buffer.from(req.data_b64, "base64") : Buffer.from(req.content || "", "utf8");
        if (buf.length > MAX) return { id, ok: false, code: "too_large", error: "write payload exceeds " + MAX + " byte limit" };
        writeAtomic(req.path, buf);
        return { id, ok: true };
      }
      case "mkdir": {
        fs.mkdirSync(req.path, { recursive: true });
        return { id, ok: true };
      }
      case "mime": {
        const fd = openRegular(req.path);
        try {
          const b = Buffer.allocUnsafe(16);
          const n = fs.readSync(fd, b, 0, 16, 0);
          return { id, ok: true, mime: imgMime(b.subarray(0, n)) };
        } finally { fs.closeSync(fd); }
      }
      default: return { id, ok: false, code: "invalid_request", error: "unknown op" };
    }
  } catch (e) {
    return errResp(id, e);
  }
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  if (!line.trim()) return;
  let resp;
  try { resp = handle(JSON.parse(line)); }
  catch (e) { resp = { id: 0, ok: false, code: "invalid_request", error: String(e) }; }
  process.stdout.write(JSON.stringify(resp) + "\\n");
});
`;
}

function failure(verb: string, path: string, stderr: string): Error {
	const denied = /Operation not permitted|Permission denied|permission_denied/i.test(stderr);
	const missing = /No such file or directory|not_found/i.test(stderr);
	const tooLarge = /too_large|exceeds .* byte limit/i.test(stderr);
	const why = denied
		? "Operation not permitted by Tower's sandbox (only the goal's workspace and its private directories are accessible)"
		: missing
			? "No such file or directory"
			: tooLarge
				? stderr.trim().split("\n").pop() || "file exceeds 16 MiB limit"
				: stderr.trim().split("\n").pop() || "failed";
	return new Error(`cannot ${verb} ${path}: ${why}`);
}

function runFallback(
	sandboxBin: string,
	profile: string,
	argv: string[],
	maxFileBytes: number,
	input?: string,
	timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		if (input !== undefined && Buffer.byteLength(input, "utf8") > maxFileBytes) {
			reject(new Error(`write payload exceeds ${maxFileBytes} byte limit`));
			return;
		}
		const child = spawn(sandboxBin, ["-f", profile, ...argv], { stdio: ["pipe", "pipe", "pipe"] });
		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			child.kill("SIGKILL");
		}, timeoutMs);
		timer.unref();
		const out: Buffer[] = [];
		const err: Buffer[] = [];
		let size = 0;
		let oversized = false;
		child.stdout.on("data", (b: Buffer) => {
			size += b.length;
			if (size > maxFileBytes) {
				oversized = true;
				child.kill("SIGKILL");
			} else {
				out.push(b);
			}
		});
		child.stderr.on("data", (b: Buffer) => err.push(b));
		child.on("error", reject);
		child.on("close", (code) => {
			clearTimeout(timer);
			if (timedOut) reject(new Error(`timed out after ${timeoutMs} ms`));
			else if (oversized) reject(new Error(`file exceeds ${maxFileBytes} byte limit`));
			else if (code === 0) resolve(Buffer.concat(out));
			else reject(Object.assign(new Error(Buffer.concat(err).toString("utf8")), { code }));
		});
		child.stdin.on("error", () => {});
		child.stdin.end(input ?? "");
	});
}

async function attempt<T>(verb: string, path: string, f: () => Promise<T>): Promise<T> {
	try {
		return await f();
	} catch (e) {
		throw failure(verb, path, e instanceof Error ? e.message : String(e));
	}
}

/** Recognises the image types Pi's read tool can attach, from magic bytes. */
export function imageMime(head: Buffer): string | null {
	if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
	if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
	if (head.length >= 6 && /^GIF8[79]a$/.test(head.subarray(0, 6).toString("latin1"))) return "image/gif";
	if (head.length >= 12 && head.subarray(0, 4).toString("latin1") === "RIFF" && head.subarray(8, 12).toString("latin1") === "WEBP")
		return "image/webp";
	return null;
}

class PersistentHelper {
	private child: ChildProcessWithoutNullStreams | null = null;
	private pending = new Map<number, PendingCall>();
	private nextId = 0;
	private stdoutBuf = "";
	private startPromise: Promise<boolean> | null = null;
	private disabled = false;
	private closed = false;
	private readonly sandboxBin: string;
	private readonly profile: string;
	private readonly maxFileBytes: number;
	private readonly helperArgv: string[] | null;
	private readonly disableNodeHelper: boolean;
	readonly timeoutMs: number;
	private readonly exitHook: () => void;

	constructor(profile: string, options?: SandboxFsOptions) {
		this.profile = profile;
		this.sandboxBin = options?.sandboxBin ?? SANDBOX_EXEC;
		this.maxFileBytes = options?.maxFileBytes ?? MAX_FILE_BYTES;
		this.disableNodeHelper = options?.disableNodeHelper ?? false;
		this.timeoutMs = options?.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
		const cmd = options?.helperCommand ?? process.env.TOWER_FS_HELPER;
		if (Array.isArray(cmd) && cmd.length > 0) {
			this.helperArgv = cmd;
		} else if (typeof cmd === "string" && cmd.trim().length > 0) {
			this.helperArgv = [cmd.trim(), "--fs-helper"];
		} else {
			this.helperArgv = null;
		}
		this.exitHook = () => this.close();
		process.once("exit", this.exitHook);
	}

	pid(): number | null {
		return this.child && this.child.exitCode === null && !this.child.killed ? (this.child.pid ?? null) : null;
	}

	close(): void {
		this.closed = true;
		process.off("exit", this.exitHook);
		const c = this.child;
		this.child = null;
		this.startPromise = null;
		this.rejectAll(new Error("sandbox helper closed"));
		if (c && c.exitCode === null) {
			try {
				c.stdin.end();
				c.kill("SIGTERM");
			} catch {
				// Best-effort cleanup.
			}
		}
	}

	private rejectAll(err: Error): void {
		for (const p of this.pending.values()) p.reject(err);
		this.pending.clear();
	}

	private candidates(): string[][] {
		const list: string[][] = [];
		if (this.helperArgv) list.push(this.helperArgv);
		if (!this.disableNodeHelper) {
			list.push([process.execPath, "-e", inlineNodeHelperSource(this.maxFileBytes)]);
		}
		return list;
	}

	private spawnCandidate(argv: string[]): Promise<boolean> {
		return new Promise((resolve) => {
			let settled = false;
			const finish = (ok: boolean) => {
				if (!settled) {
					settled = true;
					resolve(ok);
				}
			};
			const child = spawn(this.sandboxBin, ["-f", this.profile, ...argv], {
				stdio: ["pipe", "pipe", "pipe"],
			});
			child.unref();
			this.child = child;
			this.stdoutBuf = "";

			child.stdout.setEncoding("utf8");
			child.stdout.on("data", (chunk: string) => {
				this.stdoutBuf += chunk;
				let nl = this.stdoutBuf.indexOf("\n");
				while (nl !== -1) {
					const line = this.stdoutBuf.slice(0, nl).trim();
					this.stdoutBuf = this.stdoutBuf.slice(nl + 1);
					if (line.length > 0) {
						try {
							const resp = JSON.parse(line) as HelperResponse;
							const waiter = this.pending.get(resp.id);
							if (waiter) {
								this.pending.delete(resp.id);
								waiter.resolve(resp);
							}
						} catch {
							// Ignore malformed non-JSON noise.
						}
					}
					nl = this.stdoutBuf.indexOf("\n");
				}
			});
			child.stderr.on("data", () => {});
			child.stdin.on("error", () => {});

			const onDown = (reason: string) => {
				// Pending requests are the current helper's: a helper already
				// replaced (one that timed out) takes none of its successor's.
				if (this.child === child) {
					this.child = null;
					this.startPromise = null;
					this.rejectAll(new Error(reason));
				}
				finish(false);
			};
			child.on("error", (e) => onDown(e.message));
			child.on("exit", (code, sig) => onDown(`sandbox helper exited (${sig ?? code ?? "unknown"})`));

			// Verify handshake via `ping` before trusting this candidate.
			const pingId = ++this.nextId;
			const timer = setTimeout(() => {
				if (!settled) {
					this.pending.delete(pingId);
					try {
						child.kill("SIGKILL");
					} catch {}
					finish(false);
				}
			}, 3000);
			timer.unref();
			this.pending.set(pingId, {
				resolve: (resp) => {
					clearTimeout(timer);
					finish(resp.ok);
				},
				reject: () => {
					clearTimeout(timer);
					finish(false);
				},
			});
			try {
				child.stdin.write(JSON.stringify({ id: pingId, op: "ping", path: "" }) + "\n");
			} catch {
				clearTimeout(timer);
				this.pending.delete(pingId);
				finish(false);
			}
		});
	}

	private async ensureReady(): Promise<boolean> {
		if (this.closed || this.disabled) return false;
		if (this.pid() !== null) return true;
		if (this.startPromise) return this.startPromise;
		this.startPromise = (async () => {
			for (const argv of this.candidates()) {
				if (this.closed) return false;
				const ok = await this.spawnCandidate(argv);
				if (ok) return true;
			}
			// No persistent helper candidate could start under this profile; use per-call fallback.
			this.disabled = true;
			return false;
		})();
		const ready = await this.startPromise;
		this.startPromise = null;
		return ready;
	}

	async request(payload: Record<string, unknown>): Promise<HelperResponse | null> {
		if (!(await this.ensureReady())) return null;
		const sendOnce = (): Promise<HelperResponse> =>
			new Promise((resolve, reject) => {
				const c = this.child;
				if (!c || c.exitCode !== null) {
					reject(new Error("sandbox helper unavailable"));
					return;
				}
				const id = ++this.nextId;
				// A request the helper never answers (it is stuck, e.g. on
				// something that blocks) fails, and the helper is replaced.
				const timer = setTimeout(() => {
					if (!this.pending.delete(id)) return;
					if (this.child === c) {
						this.child = null;
						this.startPromise = null;
						// Whatever else it was doing is retried on a new one.
						this.rejectAll(new Error("sandbox helper restarted"));
					}
					c.kill("SIGKILL");
					reject(Object.assign(new Error(`sandbox helper timed out after ${this.timeoutMs} ms`), { timedOut: true }));
				}, this.timeoutMs);
				timer.unref();
				this.pending.set(id, {
					resolve: (r) => {
						clearTimeout(timer);
						resolve(r);
					},
					reject: (e) => {
						clearTimeout(timer);
						reject(e);
					},
				});
				try {
					c.stdin.write(JSON.stringify({ ...payload, id }) + "\n");
				} catch (e) {
					clearTimeout(timer);
					this.pending.delete(id);
					reject(e instanceof Error ? e : new Error(String(e)));
				}
			});
		try {
			return await sendOnce();
		} catch (e) {
			// Transparent auto-restart once if the helper died mid-flight (not
			// when the request itself timed out: it would only block again).
			const timedOut = (e as { timedOut?: boolean }).timedOut === true;
			if (!timedOut && !this.closed && !this.disabled && (await this.ensureReady())) {
				return await sendOnce();
			}
			throw e;
		}
	}
}

export function sandboxedOperations(profile: string, options?: SandboxFsOptions): SandboxedOperations {
	const sandboxBin = options?.sandboxBin ?? SANDBOX_EXEC;
	const maxFileBytes = options?.maxFileBytes ?? MAX_FILE_BYTES;
	const helper = new PersistentHelper(profile, options);

	const readFile = (path: string) =>
		attempt("read", path, async () => {
			const resp = await helper.request({ op: "read", path });
			if (resp !== null) {
				if (!resp.ok) throw new Error(resp.error || resp.code || "read failed");
				return Buffer.from(resp.data_b64 ?? "", "base64");
			}
			return await runFallback(sandboxBin, profile, ["/bin/cat", "--", path], maxFileBytes, undefined, helper.timeoutMs);
		});

	// Opening the file is what the sandbox checks; reading one byte proves it.
	const access = (path: string) =>
		attempt("read", path, async () => {
			const resp = await helper.request({ op: "access", path });
			if (resp !== null) {
				if (!resp.ok) throw new Error(resp.error || resp.code || "access failed");
				return;
			}
			await runFallback(sandboxBin, profile, ["/usr/bin/head", "-c", "1", "--", path], maxFileBytes, undefined, helper.timeoutMs);
		});

	const writeFile = (path: string, content: string) =>
		attempt("write", path, async () => {
			if (Buffer.byteLength(content, "utf8") > maxFileBytes) {
				throw new Error(`write payload exceeds ${maxFileBytes} byte limit`);
			}
			const resp = await helper.request({
				op: "write",
				path,
				data_b64: Buffer.from(content, "utf8").toString("base64"),
			});
			if (resp !== null) {
				if (!resp.ok) throw new Error(resp.error || resp.code || "write failed");
				return;
			}
			await runFallback(sandboxBin, profile, ["/bin/sh", "-c", 'cat > "$1"', "tower-write", path], maxFileBytes, content, helper.timeoutMs);
		});

	const mkdir = (dir: string) =>
		attempt("create", dir, async () => {
			const resp = await helper.request({ op: "mkdir", path: dir });
			if (resp !== null) {
				if (!resp.ok) throw new Error(resp.error || resp.code || "mkdir failed");
				return;
			}
			await runFallback(sandboxBin, profile, ["/bin/mkdir", "-p", "--", dir], maxFileBytes, undefined, helper.timeoutMs);
		});

	const detectImageMimeType = async (path: string): Promise<string | null> => {
		try {
			const resp = await helper.request({ op: "mime", path });
			if (resp !== null) {
				return resp.ok ? (resp.mime ?? null) : null;
			}
			return imageMime(await runFallback(sandboxBin, profile, ["/usr/bin/head", "-c", "16", "--", path], maxFileBytes, undefined, helper.timeoutMs));
		} catch {
			return null;
		}
	};

	return {
		read: { readFile, access, detectImageMimeType },
		edit: { readFile, writeFile, access },
		write: { writeFile, mkdir },
		close: () => helper.close(),
		helperPid: () => helper.pid(),
	};
}
