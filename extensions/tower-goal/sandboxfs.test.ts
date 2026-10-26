import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { imageMime, sandboxedOperations } from "./sandboxfs.ts";

test("image types are recognised from magic bytes", () => {
	assert.equal(imageMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
	assert.equal(imageMime(Buffer.from("GIF89a")), "image/gif");
	assert.equal(imageMime(Buffer.from("hello world")), null);
});

test("file operations obey the sandbox profile", { skip: !existsSync("/usr/bin/sandbox-exec") }, async () => {
	const root = realpathSync(mkdtempSync(join(tmpdir(), "tower-fs-")));
	const ws = join(root, "ws");
	const secret = join(root, "secret");
	mkdirSync(ws);
	mkdirSync(secret);
	writeFileSync(join(ws, "a.txt"), "inside");
	writeFileSync(join(secret, "key"), "SECRET");
	const profile = join(root, "p.sb");
	writeFileSync(
		profile,
		`(version 1)(allow default)
(deny file-read* (subpath "${secret}"))
(deny file-write* (subpath "${root}"))
(allow file-write* (subpath "${ws}"))`,
	);
	const ops = sandboxedOperations(profile);

	assert.equal((await ops.read.readFile(join(ws, "a.txt"))).toString(), "inside");
	await ops.read.access(join(ws, "a.txt"));
	await assert.rejects(ops.read.readFile(join(secret, "key")), /not permitted by Tower's sandbox/);
	await assert.rejects(ops.read.access(join(secret, "key")), /not permitted/);
	await assert.rejects(ops.read.access(join(ws, "missing")), /No such file/);

	await ops.write.mkdir(join(ws, "d/e"));
	await ops.write.writeFile(join(ws, "d/e/b.txt"), "written 'quoted' $HOME\n");
	assert.equal(readFileSync(join(ws, "d/e/b.txt"), "utf8"), "written 'quoted' $HOME\n");
	await assert.rejects(ops.write.writeFile(join(root, "escape.txt"), "x"), /not permitted/);
	assert.ok(!existsSync(join(root, "escape.txt")));
});
