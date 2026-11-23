import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { MAX_FILE_BYTES, imageMime, sandboxedOperations } from "./sandboxfs.ts";

const HAS_SANDBOX_EXEC = existsSync("/usr/bin/sandbox-exec");

test("image types are recognised from magic bytes", () => {
	assert.equal(imageMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
	assert.equal(imageMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
	assert.equal(imageMime(Buffer.from("GIF89a")), "image/gif");
	assert.equal(imageMime(Buffer.from("RIFF\x00\x00\x00\x00WEBP", "latin1")), "image/webp");
	assert.equal(imageMime(Buffer.from("hello world")), null);
});

test("file operations obey the sandbox profile", { skip: !HAS_SANDBOX_EXEC }, async () => {
	const root = realpathSync(mkdtempSync(join(tmpdir(), "tower-fs-")));
	const ws = join(root, "ws");
	const secret = join(root, "secret");
	const sshDir = join(root, "fake-home", ".ssh");
	mkdirSync(ws);
	mkdirSync(secret);
	mkdirSync(sshDir, { recursive: true });
	writeFileSync(join(ws, "a.txt"), "inside");
	writeFileSync(join(ws, "pic.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]));
	writeFileSync(join(secret, "key"), "SECRET");
	writeFileSync(join(sshDir, "id_ed25519"), "PRIVATE KEY");
	const realSsh = join(realpathSync(homedir()), ".ssh");
	const profile = join(root, "p.sb");
	writeFileSync(
		profile,
		`(version 1)(allow default)
(deny file-read* (subpath "${secret}") (subpath "${sshDir}") (subpath "${realSsh}"))
(deny file-write* (subpath "${root}"))
(allow file-write* (subpath "${ws}"))`,
	);
	const ops = sandboxedOperations(profile);
	try {
		assert.equal(ops.helperPid(), null, "helper spawns lazily on first use");
		assert.equal((await ops.read.readFile(join(ws, "a.txt"))).toString(), "inside");
		const pid1 = ops.helperPid();
		assert.ok(pid1 !== null && pid1 > 0, "persistent helper stays alive after first call");

		await ops.read.access(join(ws, "a.txt"));
		assert.equal(ops.helperPid(), pid1, "subsequent calls reuse the same persistent helper");
		assert.equal(await ops.read.detectImageMimeType?.(join(ws, "pic.png")), "image/png");
		assert.equal(await ops.read.detectImageMimeType?.(join(ws, "a.txt")), null);

		await assert.rejects(ops.read.readFile(join(secret, "key")), /not permitted by Tower's sandbox/);
		await assert.rejects(ops.read.readFile(join(sshDir, "id_ed25519")), /not permitted by Tower's sandbox/);
		if (existsSync(realSsh)) {
			await assert.rejects(ops.read.access(realSsh), /not permitted/);
		}
		await assert.rejects(ops.read.access(join(secret, "key")), /not permitted/);
		await assert.rejects(ops.read.access(join(ws, "missing")), /No such file/);

		await ops.write.mkdir(join(ws, "d/e"));
		await ops.write.writeFile(join(ws, "d/e/b.txt"), "written 'quoted' $HOME\n");
		assert.equal(readFileSync(join(ws, "d/e/b.txt"), "utf8"), "written 'quoted' $HOME\n");
		await assert.rejects(ops.write.writeFile(join(root, "escape.txt"), "x"), /not permitted/);
		assert.ok(!existsSync(join(root, "escape.txt")));
	} finally {
		ops.close();
		assert.equal(ops.helperPid(), null, "close() stops the persistent helper");
	}
});

test("persistent helper enforces 16 MiB cap, auto-restarts on crash, and runs fast", { skip: !HAS_SANDBOX_EXEC }, async () => {
	const root = realpathSync(mkdtempSync(join(tmpdir(), "tower-fs-perf-")));
	const ws = join(root, "ws");
	mkdirSync(ws);
	const f = join(ws, "hello.txt");
	writeFileSync(f, "fast-check");
	const big = join(ws, "big.bin");
	writeFileSync(big, Buffer.alloc(1024 * 1024 + 16, 0x61));
	const profile = join(root, "p.sb");
	writeFileSync(profile, `(version 1)(allow default)\n(deny file-write* (subpath "${root}"))\n(allow file-write* (subpath "${ws}"))`);

	// Verify file cap enforcement (using 1 MiB override for fast test, plus verifying default is 16 MiB).
	assert.equal(MAX_FILE_BYTES, 16 * 1024 * 1024);
	const capped = sandboxedOperations(profile, { maxFileBytes: 1024 * 1024 });
	try {
		await assert.rejects(capped.read.readFile(big), /exceeds .* byte limit/);
		await assert.rejects(capped.write.writeFile(join(ws, "too-big.txt"), "x".repeat(1024 * 1024 + 1)), /exceeds .* byte limit/);
		assert.ok(!existsSync(join(ws, "too-big.txt")));
	} finally {
		capped.close();
	}

	// Verify single persistent helper speed + auto-restart after SIGKILL crash.
	const ops = sandboxedOperations(profile);
	try {
		// Warm up helper spawn once.
		assert.equal((await ops.read.readFile(f)).toString(), "fast-check");
		const pidBefore = ops.helperPid();
		assert.ok(pidBefore !== null);

		const N = 50;
		const t0 = performance.now();
		for (let i = 0; i < N; i++) {
			const buf = await ops.read.readFile(f);
			assert.equal(buf.toString(), "fast-check");
		}
		const elapsedMs = performance.now() - t0;
		const perCallMs = elapsedMs / N;
		assert.equal(ops.helperPid(), pidBefore, "all 50 reads served by one persistent helper");
		// Per-call sandbox-exec spawns cost ~15ms/call (~750ms+ for 50 calls); persistent helper is < 5ms/call.
		assert.ok(perCallMs < 8, `expected persistent helper < 8 ms/call, got ${perCallMs.toFixed(2)} ms/call (${elapsedMs.toFixed(1)} ms total)`);

		// Kill helper and prove transparent auto-restart.
		process.kill(pidBefore, "SIGKILL");
		await new Promise((r) => setTimeout(r, 100));
		assert.equal((await ops.read.readFile(f)).toString(), "fast-check");
		const pidAfter = ops.helperPid();
		assert.ok(pidAfter !== null && pidAfter !== pidBefore, "helper auto-restarted with a new PID");
	} finally {
		ops.close();
	}
});

test("falls back cleanly to per-call sandbox-exec when persistent helper is unavailable", { skip: !HAS_SANDBOX_EXEC }, async () => {
	const root = realpathSync(mkdtempSync(join(tmpdir(), "tower-fs-fb-")));
	const ws = join(root, "ws");
	const secret = join(root, "secret");
	mkdirSync(ws);
	mkdirSync(secret);
	writeFileSync(join(ws, "ok.txt"), "fallback-ok");
	writeFileSync(join(secret, "s"), "nope");
	const profile = join(root, "p.sb");
	writeFileSync(
		profile,
		`(version 1)(allow default)\n(deny file-read* (subpath "${secret}"))\n(deny file-write* (subpath "${root}"))\n(allow file-write* (subpath "${ws}"))`,
	);

	const ops = sandboxedOperations(profile, {
		helperCommand: "/nonexistent/tower-fs-helper",
		disableNodeHelper: true,
	});
	try {
		assert.equal((await ops.read.readFile(join(ws, "ok.txt"))).toString(), "fallback-ok");
		assert.equal(ops.helperPid(), null, "uses per-call fallback when helper binary is missing");
		await assert.rejects(ops.read.readFile(join(secret, "s")), /not permitted by Tower's sandbox/);
		await assert.rejects(ops.write.writeFile(join(root, "bad.txt"), "x"), /not permitted/);
	} finally {
		ops.close();
	}
});
