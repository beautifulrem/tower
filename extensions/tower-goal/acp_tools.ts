/**
 * Tower's 7 MCP tool schemas and multimodal prompt-block builder for `acp.ts`.
 * Strictly maintains Tower's 7-tool budget (`read`, `write`, `edit`, `bash`,
 * `ask_user`, `log`, `submit`).
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { extname } from "node:path";

import { checkRead } from "./policy.ts";

export type Json = Record<string, unknown>;

export interface ImageInput {
	data?: string;
	mimeType?: string;
	path?: string;
	label?: string;
}

const MAX_INLINE_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export const ACP_TOOLS = [
	{
		name: "read",
		description: "Read a file of the workspace. Returns numbered lines; use offset/limit for long files.",
		inputSchema: {
			type: "object",
			properties: {
				path: { type: "string" },
				offset: { type: "number", description: "1-based first line" },
				limit: { type: "number", description: "number of lines" },
			},
			required: ["path"],
		},
	},
	{
		name: "write",
		description: "Create or overwrite a file of the workspace with the given content.",
		inputSchema: {
			type: "object",
			properties: { path: { type: "string" }, content: { type: "string" } },
			required: ["path", "content"],
		},
	},
	{
		name: "edit",
		description:
			"Edit a file by exact replacement. Each oldText must occur exactly once in the file; give enough context to make it unique.",
		inputSchema: {
			type: "object",
			properties: {
				path: { type: "string" },
				edits: {
					type: "array",
					items: {
						type: "object",
						properties: { oldText: { type: "string" }, newText: { type: "string" } },
						required: ["oldText", "newText"],
					},
				},
			},
			required: ["path", "edits"],
		},
	},
	{
		name: "bash",
		description:
			"Run a shell command in the workspace (sandboxed: no credentials; network only if the goal allows it). Returns combined output and the exit code.",
		inputSchema: {
			type: "object",
			properties: { command: { type: "string" }, timeout: { type: "number", description: "seconds, default 120" } },
			required: ["command"],
		},
	},
	{
		name: "ask_user",
		description:
			"Ask the human supervising this goal a question and wait for the answer. Use it for decisions the contract leaves open, not for status updates.",
		inputSchema: {
			type: "object",
			properties: {
				question: { type: "string" },
				options: { type: "array", items: { type: "string" } },
				why: { type: "string" },
			},
			required: ["question"],
		},
	},
	{
		name: "log",
		description:
			"Record something the human should see on the goal page: a cause you found, a decision and its reason, an assumption that needs confirming, or your next step. One sentence.",
		inputSchema: {
			type: "object",
			properties: {
				kind: { type: "string", enum: ["cause", "decision", "assumption", "next", "progress"] },
				text: { type: "string" },
			},
			required: ["kind", "text"],
		},
	},
	{
		name: "submit",
		description:
			"Call once when every acceptance criterion is met (outcome: 'done', default), OR when the specification is impossible, contradictory, or unsolvable within the contract/sandbox (outcome: 'blocked' with blocker_reason). Honestly reporting a blocker is explicitly sanctioned and preferred over workarounds or weakening tests. Stop working after submitting.",
		inputSchema: {
			type: "object",
			properties: {
				outcome: {
					type: "string",
					enum: ["done", "blocked"],
					description: "Defaults to 'done'. Use 'blocked' when the goal cannot be completed honestly.",
				},
				summary: { type: "string" },
				blocker_reason: {
					type: "string",
					description: "Concrete explanation with evidence when outcome is 'blocked'.",
				},
				criteria: {
					type: "array",
					items: {
						type: "object",
						properties: { id: { type: "string" }, met: { type: "boolean" }, evidence: { type: "string" } },
						required: ["id", "met", "evidence"],
					},
				},
			},
			required: ["summary"],
		},
	},
];

function inferImageMime(path: string): string | null {
	switch (extname(path).toLowerCase()) {
		case ".png":
			return "image/png";
		case ".jpg":
		case ".jpeg":
			return "image/jpeg";
		case ".webp":
			return "image/webp";
		case ".gif":
			return "image/gif";
		default:
			return null;
	}
}

export function parseImages(raw: unknown): ImageInput[] {
	if (!Array.isArray(raw)) return [];
	const out: ImageInput[] = [];
	for (const item of raw) {
		if (!item || typeof item !== "object") continue;
		const rec = item as Json;
		const data = typeof rec.data === "string" && rec.data.length > 0 ? rec.data : undefined;
		const mimeType =
			typeof rec.mimeType === "string"
				? rec.mimeType
				: typeof rec.mime_type === "string"
					? rec.mime_type
					: undefined;
		const path = typeof rec.path === "string" && rec.path.length > 0 ? rec.path : undefined;
		const label = typeof rec.label === "string" && rec.label.length > 0 ? rec.label : undefined;
		if (data || path) out.push({ data, mimeType, path, label });
	}
	return out;
}

/**
 * Builds ACP `session/prompt` content blocks from text + optional image
 * attachments. Never reads arbitrary files outside `allowedRoots`.
 */
export function buildPromptBlocks(
	message: string,
	images: ImageInput[],
	supportsImageBlocks: boolean,
	allowedRoots: string[],
	resolvePath: (raw: string) => string,
): Json[] {
	const blocks: Json[] = [{ type: "text", text: message }];
	for (const img of images) {
		let data = img.data;
		let mimeType = img.mimeType;
		let safePath: string | undefined;
		if (img.path) {
			const abs = resolvePath(img.path);
			if (checkRead(allowedRoots, abs)) {
				safePath = abs;
				if (!data && supportsImageBlocks && existsSync(abs)) {
					try {
						const st = statSync(abs);
						const inferred = mimeType ?? inferImageMime(abs);
						if (st.isFile() && st.size <= MAX_INLINE_IMAGE_BYTES && inferred && ALLOWED_IMAGE_MIMES.has(inferred)) {
							data = readFileSync(abs).toString("base64");
							mimeType = inferred;
						}
					} catch {
						// Fall back to path note below.
					}
				}
			}
		}
		if (supportsImageBlocks && data && mimeType && ALLOWED_IMAGE_MIMES.has(mimeType)) {
			blocks.push({ type: "image", data, mimeType });
			if (safePath) {
				blocks.push({ type: "text", text: `[Attached image${img.label ? ` (${img.label})` : ""}: ${safePath}]` });
			}
		} else if (safePath) {
			blocks.push({ type: "text", text: `[Attached image${img.label ? ` (${img.label})` : ""}: ${safePath}]` });
		}
	}
	return blocks;
}
