/**
 * tower-goal: Tower's goal capabilities as a standard Pi extension.
 *
 * It adds exactly three tools to the model (docs/00 §0.5, docs/05):
 *   ask_user  ask the human; the run blocks until Tower relays an answer
 *   log       record a cause, decision, assumption, next step or progress note
 *   submit    claim the goal is done; Tower then verifies in a clean checkout
 *
 * and a `tool_call` gate that enforces the contract's scope fence and the
 * autonomy preset. Approvals and questions travel to Tower as extension UI
 * dialogs whose title is `tower:` + JSON, so Tower can render a decision card.
 *
 * Tower passes the goal through environment variables:
 *   TOWER_GOAL_ID, TOWER_WORKSPACE, TOWER_CONTRACT (path to contract.json)
 *   TOWER_SANDBOX_PROFILE  macOS Seatbelt profile for the agent's shell (S2)
 *   TOWER_TMP              the agent's private temporary directory
 *
 * Pi's built-in bash is replaced by the same tool with a spawn hook that
 * strips credential-shaped variables and, when a profile is given, runs the
 * command under sandbox-exec (docs/11 §11.6).
 */

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createBashTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { type Autonomy, type Scope, checkBash, checkWrite, sandboxed, scrubEnv } from "./policy.ts";

interface ContractFile {
	autonomy: Autonomy;
	scope: Scope;
	criteria: Array<{ id: string; title: string }>;
}

const WORKSPACE = realOrSelf(process.env.TOWER_WORKSPACE ?? process.cwd());
const SANDBOX_PROFILE = process.env.TOWER_SANDBOX_PROFILE;
const AGENT_TMP = process.env.TOWER_TMP;

function realOrSelf(p: string): string {
	try {
		return realpathSync(p);
	} catch {
		return p;
	}
}

/**
 * Resolves symlinks in the deepest existing ancestor so a link planted inside
 * the workspace cannot route a write outside it.
 */
function resolveThroughLinks(abs: string): string {
	let existing = abs;
	const rest: string[] = [];
	while (!existsSync(existing) && dirname(existing) !== existing) {
		rest.unshift(existing.slice(dirname(existing).length + 1));
		existing = dirname(existing);
	}
	return [realOrSelf(existing), ...rest].join("/");
}

function loadContract(): ContractFile {
	const path = process.env.TOWER_CONTRACT;
	const fallback: ContractFile = { autonomy: "standard", scope: { include: [], exclude: [], readonly: [] }, criteria: [] };
	if (!path) return fallback;
	try {
		const c = JSON.parse(readFileSync(path, "utf8"));
		return {
			autonomy: c.autonomy ?? "standard",
			scope: { include: c.scope?.include ?? [], exclude: c.scope?.exclude ?? [], readonly: c.scope?.readonly ?? [] },
			criteria: (c.criteria ?? []).map((x: { id: string; title: string }) => ({ id: x.id, title: x.title })),
		};
	} catch {
		// A missing or corrupt contract must not widen permissions: fall back to cautious.
		return { ...fallback, autonomy: "cautious" };
	}
}

function dialogTitle(payload: Record<string, unknown>): string {
	return `tower:${JSON.stringify(payload)}`;
}

const ALLOW = "允许";
const DENY = "拒绝";

export default function towerGoal(pi: ExtensionAPI) {
	// Read once per run: the contract cannot change under a running agent.
	const contract = loadContract();

	const bash = createBashTool(WORKSPACE, {
		spawnHook: ({ command, cwd, env }) => {
			const clean = scrubEnv(env);
			if (AGENT_TMP) clean.TMPDIR = AGENT_TMP;
			return { command: SANDBOX_PROFILE ? sandboxed(command, SANDBOX_PROFILE) : command, cwd, env: clean };
		},
	});
	pi.registerTool({
		...bash,
		execute: (id, params, signal, onUpdate) => bash.execute(id, params, signal, onUpdate),
	});

	pi.registerTool({
		name: "ask_user",
		label: "Ask the human",
		description:
			"Ask the human supervising this goal a question and wait for the answer. Use it for decisions the contract leaves open, not for status updates.",
		parameters: Type.Object({
			question: Type.String({ description: "One clear question" }),
			options: Type.Optional(Type.Array(Type.String(), { description: "Suggested answers, if any" })),
			why: Type.Optional(Type.String({ description: "What depends on the answer" })),
		}),
		executionMode: "sequential",
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const answer = await ctx.ui.input(
				dialogTitle({ tower: "question", question: params.question, options: params.options ?? [], why: params.why ?? "" }),
			);
			const text =
				answer === undefined || answer.trim() === ""
					? "The human did not answer. Continue with your best judgement and record it with log(kind: \"assumption\")."
					: `The human answered: ${answer}`;
			return { content: [{ type: "text", text }], details: {} };
		},
	});

	pi.registerTool({
		name: "log",
		label: "Log for the supervisor",
		description:
			"Record something the human should see on the goal page: a cause you found, a decision and its reason, an assumption that needs confirming, or your next step. Keep it to one sentence.",
		parameters: Type.Object({
			kind: Type.Union([
				Type.Literal("cause"),
				Type.Literal("decision"),
				Type.Literal("assumption"),
				Type.Literal("next"),
				Type.Literal("progress"),
			]),
			text: Type.String(),
		}),
		async execute() {
			return { content: [{ type: "text", text: "Logged." }], details: {} };
		},
	});

	pi.registerTool({
		name: "submit",
		label: "Submit as done",
		description:
			"Call once when you believe every acceptance criterion is met. Tower will re-run the criteria in a clean checkout; your word alone does not complete the goal. Stop working after submitting.",
		parameters: Type.Object({
			summary: Type.String({ description: "What you changed and why, in a few sentences" }),
			criteria: Type.Array(
				Type.Object({
					id: Type.String({ description: "Criterion id, e.g. C1" }),
					met: Type.Boolean(),
					evidence: Type.String({ description: "What you ran or saw" }),
				}),
			),
		}),
		async execute() {
			return {
				content: [{ type: "text", text: "Submitted. Tower will verify the criteria in a clean checkout. Do not continue unless asked." }],
				details: {},
				terminate: true,
			};
		},
	});

	pi.on("tool_call", async (event, ctx) => {
		const name = event.toolName;

		if (name === "edit" || name === "write") {
			const raw = String((event.input as { path?: unknown }).path ?? "");
			const abs = resolveThroughLinks(isAbsolute(raw) ? raw : resolve(WORKSPACE, raw));
			const { verdict, rel } = checkWrite(contract.scope, WORKSPACE, abs);
			if (verdict === "allowed") return undefined;
			if (verdict === "outside_workspace") {
				return { block: true, reason: `Tower: ${raw} is outside this goal's workspace. Only files inside ${WORKSPACE} may be changed.` };
			}
			const reason =
				verdict === "readonly" ? "合同把这个路径设为只读" : verdict === "excluded" ? "合同排除了这个路径" : "这个路径在合同的范围围栏之外";
			const choice = await ctx.ui.select(
				dialogTitle({ tower: "approval", tool: name, target: rel, reason }),
				[ALLOW, DENY],
			);
			return choice === ALLOW
				? undefined
				: { block: true, reason: `The human declined: writing ${rel} is not allowed (${reason}). Stay inside the contract's scope or ask_user.` };
		}

		if (name === "bash") {
			const command = String((event.input as { command?: unknown }).command ?? "");
			const v = checkBash(command, contract.autonomy);
			if (v.action === "allow") return undefined;
			const choice = await ctx.ui.select(
				dialogTitle({ tower: "approval", tool: "bash", target: command, reason: v.reason }),
				[ALLOW, DENY],
			);
			return choice === ALLOW
				? undefined
				: { block: true, reason: `The human declined this command (${v.reason}). Find another way or ask_user.` };
		}

		return undefined;
	});
}
