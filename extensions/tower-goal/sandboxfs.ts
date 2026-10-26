/**
 * File operations for Pi's read, edit and write tools that run inside the
 * same macOS Seatbelt profile as the agent's shell.
 *
 * Pi performs these operations in its own process, which is not sandboxed
 * (it needs the model's credentials and the network). Without this, the
 * scope gate would be the only thing between the model and the user's home
 * directory, and a symlink or an absolute path is enough to get around a
 * path check. Each operation is a small child process under sandbox-exec,
 * so the kernel decides with the same rules as for bash: credentials and
 * other projects are unreadable, writes outside the goal's directories fail.
 */

import { spawn } from "node:child_process";

import type { EditOperations, ReadOperations, WriteOperations } from "@earendil-works/pi-coding-agent";

const SANDBOX_EXEC = "/usr/bin/sandbox-exec";
const MAX_FILE = 256 * 1024 * 1024;

function failure(verb: string, path: string, stderr: string): Error {
	const denied = /Operation not permitted|Permission denied/i.test(stderr);
	const missing = /No such file or directory/i.test(stderr);
	const why = denied
		? "Operation not permitted by Tower's sandbox (only the goal's workspace and its private directories are accessible)"
		: missing
			? "No such file or directory"
			: stderr.trim().split("\n").pop() || "failed";
	return new Error(`cannot ${verb} ${path}: ${why}`);
}

function run(profile: string, argv: string[], input?: string): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const child = spawn(SANDBOX_EXEC, ["-f", profile, ...argv], { stdio: ["pipe", "pipe", "pipe"] });
		const out: Buffer[] = [];
		const err: Buffer[] = [];
		let size = 0;
		child.stdout.on("data", (b: Buffer) => {
			size += b.length;
			if (size > MAX_FILE) child.kill("SIGKILL");
			else out.push(b);
		});
		child.stderr.on("data", (b: Buffer) => err.push(b));
		child.on("error", reject);
		child.on("close", (code) => {
			if (code === 0) resolve(Buffer.concat(out));
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

export function sandboxedOperations(profile: string): {
	read: ReadOperations;
	edit: EditOperations;
	write: WriteOperations;
} {
	const readFile = (path: string) => attempt("read", path, () => run(profile, ["/bin/cat", "--", path]));
	// Opening the file is what the sandbox checks; reading one byte proves it.
	const access = (path: string) =>
		attempt("read", path, async () => {
			await run(profile, ["/usr/bin/head", "-c", "1", "--", path]);
		});
	const writeFile = (path: string, content: string) =>
		attempt("write", path, async () => {
			await run(profile, ["/bin/sh", "-c", 'cat > "$1"', "tower-write", path], content);
		});
	const mkdir = (dir: string) =>
		attempt("create", dir, async () => {
			await run(profile, ["/bin/mkdir", "-p", "--", dir]);
		});
	const detectImageMimeType = async (path: string) => {
		try {
			return imageMime(await run(profile, ["/usr/bin/head", "-c", "16", "--", path]));
		} catch {
			return null;
		}
	};
	return {
		read: { readFile, access, detectImageMimeType },
		edit: { readFile, writeFile, access },
		write: { writeFile, mkdir },
	};
}

