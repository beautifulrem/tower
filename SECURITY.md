# Security policy

Tower runs coding agents that execute commands on your machine. Its safety rests on a few properties; reports that break them are the most valuable:

- everything the agent runs — its shell commands and its `read`, `edit` and `write` tools — runs under a deny-by-default macOS Seatbelt profile generated per goal;
- reads are an allow-list: system locations, toolchains (from package-manager prefixes only `bin`, `lib`, `Cellar`, `opt`, `share` and the like — not `var` or `etc`, apart from TLS certificates), system-wide defaults (not other apps' preferences), its own workspace and private directories; not your home directory, other volumes, shared temporary folders or other apps' data; credential stores (`~/.ssh`, `~/.aws`, `~/.config/gh`, Pi's `auth.json`, …) are denied even where reading is otherwise allowed, and no `*_API_KEY`-style variable reaches it;
- the agent can write only its workspace, its private temporary directory and its private package caches (seeded by copy-on-write from yours, so your own caches cannot be poisoned);
- without the contract's network switch the agent reaches only loopback; local proxy ports and Unix sockets outside its directories (for example `docker.sock`) are not reachable; the keychain service is never reachable, with or without the network;
- the model can call only seven tools (`read`, `bash`, `edit`, `write`, `ask_user`, `log`, `submit`); MCP and a repository's own Pi resources are disabled;
- Tower never pushes or writes to your repository except a new local branch you accepted;
- verification runs in a clean checkout under the same sandbox rules, without credentials and without anything the agent could write (a fresh package cache each time);
- the agent cannot change the git configuration or hooks Tower itself uses.

## Reporting

Please **do not** open a public issue for a vulnerability. Use GitHub's private vulnerability reporting ("Security" → "Report a vulnerability") on this repository. Describe the property that fails and the class of harm; a minimal reproduction helps. We aim to acknowledge within three days.

## Engines

- **Pi**: Tower's extension replaces Pi's four tools with sandboxed ones and adds three; Pi starts with exactly these seven.
- **Claude Code** (through the ACP bridge, `extensions/tower-goal/acp.ts`): Claude Code is started with no built-in tools, no user or project settings, hooks or MCP servers; its only tools are Tower's MCP server, which applies the same gate and Seatbelt profile as with Pi.
- In both cases the engine process itself (which holds your model login) runs outside the sandbox; only what the model can cause to happen runs inside it.

## The phone page

Off by default. When you turn it on (Settings), Tower serves a small page on your network so a phone can answer Needs-You items and pause goals. Every request must carry a 256-bit pairing token from the link or QR code in Settings; the page itself holds no data, and the token travels in the link's fragment, which browsers do not send. It listens only on Tailscale's address when there is one (encrypted); listening on the plain local network is a separate switch, because anyone who can watch that network could read the token. Settings can issue a new token at any time. Decisions that widen what the agent may do — allowing a gated action, overriding a sentinel, installing changed dependencies with the network — are refused from the phone and stay at the desk.

## Known limits

- Pi itself (which holds the model credentials and talks to the provider) runs outside the sandbox; only what the model can cause to happen runs inside it.
- Setup commands (installing dependencies) run the code the manifests choose, inside the sandbox. In the agent's workspace they have the network. In verification, setup runs with the network only on the base commit (your content); on the agent's snapshot it runs offline unless the contract allows the network or you approved that very snapshot on a decision card. Local files such as `.env` are present only while criteria run, never during setup. A malicious dependency you approve can still reach the network during setup; it cannot read your credentials.
- Verification uses a fresh package cache for every run, seeded from yours and thrown away afterwards, so nothing the agent wrote reaches a verdict through a cache.
- Sentinels for passing-but-wrong work are text rules over the diff, not a semantic analysis.
- On Linux and Windows there is no OS sandbox yet; reads and writes are fenced by path only and Tower says so in its environment check.
- Pi extensions you choose to load run outside the sandbox with your permissions.
