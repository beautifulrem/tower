/**
 * Declarative engine profile registry for Tower's generic ACP bridge and
 * Engine Onboarding Trust Gate (`docs/18-evolution-roadmap.md` P1.1).
 *
 * Every ACP engine is classified into an explicit trust tier:
 *   - `full_s2`: built-in tools are verifiably disabled (`tools: []`), so every
 *     read, write, edit and shell call must flow through Tower's S2 sandbox.
 *   - `restricted_s2`: built-in tools cannot yet be zeroed at startup; Tower
 *     applies strict CLI sandbox/approval flags plus fail-closed
 *     `session/request_permission` denial of all non-`mcp__tower__*` tools.
 *   - `experimental`: unknown or unverified engine, always fail-closed.
 */

export type EngineTrustLevel = "full_s2" | "restricted_s2" | "experimental";

export type EngineTransport = "native_rpc" | "acp";

export interface SessionMetaOptions {
	model?: string;
	appendPrompt?: string;
	serverName: string;
}

export interface EngineProfile {
	id: string;
	label: string;
	transport: EngineTransport;
	trustLevel: EngineTrustLevel;
	builtinsDisabled: boolean;
	/** Security-enforcing environment variables applied when spawning the engine. */
	envOverrides: Record<string, string>;
	/** Builds the engine-specific ACP `session/new` & `session/load` `_meta` object. */
	buildSessionMeta: (opts: SessionMetaOptions) => Record<string, unknown>;
}

const GEMINI_EXCLUDED_BUILTINS = [
	"read_file",
	"write_file",
	"replace",
	"run_shell_command",
	"list_directory",
	"glob",
	"grep",
	"search_file_content",
	"web_fetch",
	"google_web_search",
	"read_many_files",
];

export const ENGINE_PROFILES: Record<string, EngineProfile> = {
	pi: {
		id: "pi",
		label: "Pi",
		transport: "native_rpc",
		trustLevel: "full_s2",
		builtinsDisabled: true,
		envOverrides: { PI_OFFLINE: "1" },
		buildSessionMeta: ({ appendPrompt }) => ({
			...(appendPrompt ? { systemPrompt: appendPrompt } : {}),
		}),
	},
	"claude-code": {
		id: "claude-code",
		label: "Claude Code",
		transport: "acp",
		trustLevel: "full_s2",
		builtinsDisabled: true,
		envOverrides: {
			// Connectors of the user's claude.ai account must stay off: Tower's
			// MCP server is the agent's only way to act.
			ENABLE_CLAUDEAI_MCP_SERVERS: "false",
		},
		buildSessionMeta: ({ model, appendPrompt }) => ({
			...(appendPrompt ? { systemPrompt: appendPrompt } : {}),
			claudeCode: {
				options: {
					// No built-in tools, settings, hooks or user MCP servers: every
					// action goes through Tower's MCP server.
					tools: [],
					settingSources: [],
					strictMcpConfig: true,
					...(model && !model.includes("/") ? { model } : {}),
					...(appendPrompt ? { systemPrompt: { type: "preset", preset: "claude_code", append: appendPrompt } } : {}),
				},
			},
		}),
	},
	codex: {
		id: "codex",
		label: "Codex CLI",
		transport: "acp",
		trustLevel: "restricted_s2",
		builtinsDisabled: false,
		envOverrides: {
			CODEX_SANDBOX_NETWORK_DISABLED: "1",
		},
		buildSessionMeta: ({ model, appendPrompt, serverName }) => ({
			...(appendPrompt ? { systemPrompt: appendPrompt } : {}),
			codex: {
				sandboxPolicy: "read-only",
				approvalPolicy: "untrusted",
				disableBuiltinTools: true,
				strictMcpConfig: true,
				allowedMcpServers: [serverName],
				...(model ? { model } : {}),
			},
		}),
	},
	"gemini-cli": {
		id: "gemini-cli",
		label: "Gemini CLI",
		transport: "acp",
		trustLevel: "restricted_s2",
		builtinsDisabled: false,
		envOverrides: {
			GEMINI_CLI_NO_EXTENSIONS: "1",
		},
		buildSessionMeta: ({ model, appendPrompt, serverName }) => ({
			...(appendPrompt ? { systemPrompt: appendPrompt } : {}),
			gemini: {
				allowedMcpServerNames: [serverName],
				disableExtensions: true,
				excludeTools: GEMINI_EXCLUDED_BUILTINS,
				...(model ? { model } : {}),
			},
		}),
	},
	opencode: {
		id: "opencode",
		label: "OpenCode",
		transport: "acp",
		trustLevel: "restricted_s2",
		builtinsDisabled: false,
		envOverrides: {
			OPENCODE_DISABLE_AUTOUPDATE: "1",
		},
		buildSessionMeta: ({ model, appendPrompt, serverName }) => ({
			...(appendPrompt ? { systemPrompt: appendPrompt } : {}),
			opencode: {
				tools: [],
				permission: {
					"*": "deny",
					[`mcp__${serverName}__*`]: "allow",
				},
				...(model ? { model } : {}),
			},
		}),
	},
};

/**
 * Resolves the declarative profile for `engineId`. Defaults to `claude-code`
 * when unset (legacy bridge invocation), or an `experimental` fail-closed
 * profile for unrecognized engine identifiers.
 */
export function engineProfile(engineId?: string): EngineProfile {
	const id = (engineId ?? "").trim().toLowerCase();
	if (!id) return ENGINE_PROFILES["claude-code"];
	const known = ENGINE_PROFILES[id];
	if (known) return known;
	return {
		id,
		label: id,
		transport: "acp",
		trustLevel: "experimental",
		builtinsDisabled: false,
		envOverrides: {
			ENABLE_CLAUDEAI_MCP_SERVERS: "false",
		},
		buildSessionMeta: ({ model, appendPrompt, serverName }) => ({
			...(appendPrompt ? { systemPrompt: appendPrompt } : {}),
			strictMcpConfig: true,
			allowedMcpServers: [serverName],
			...(model ? { model } : {}),
		}),
	};
}
