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

Off by default. When you turn it on (Settings), Tower serves a small page on your network so a phone can answer Needs-You items and pause goals. Every request must carry a 256-bit pairing token from the link or QR code in Settings; the page itself holds no data, and the token travels in the link's fragment, which browsers do not send. It listens only on Tailscale's address, and only while Tailscale is connected (encrypted); when it is not, the page is not served at all and Settings says why. Listening on the plain local network is a separate switch, because anyone who can watch that network could read the token. A paired phone keeps the token in the page's own storage. Settings can issue a new token at any time. Decisions that widen what the agent may do — allowing a gated action, overriding a sentinel, installing changed dependencies with the network — are refused from the phone and stay at the desk.

## Pushes

Off by default. With an ntfy topic URL in Settings (https, or http only to this Mac or a Tailscale address), each item that blocks a goal sends the goal's id and title and a fixed sentence for the kind of item to that URL — nothing the agent wrote, no code, no output and never the pairing token (when the phone page is on, the notification links to the page without it). The text is passed to curl as data on standard input, never as an argument. Settings shows whether the last push was delivered and can send a test push. Prefer your own ntfy server; a public one sees goal titles.

## Known limits

- Pi itself (which holds the model credentials and talks to the provider) runs outside the sandbox; only what the model can cause to happen runs inside it.
- Setup commands (installing dependencies) run the code the manifests choose, inside the sandbox. In the agent's workspace they have the network. In verification, setup runs with the network only on the base commit (your content); on the agent's snapshot it runs offline unless the contract allows the network or you approved that very snapshot on a decision card. Local files such as `.env` are present only while criteria run, never during setup. A malicious dependency you approve can still reach the network during setup; it cannot read your credentials.
- The browser that takes `look` screenshots runs the agent's page with its own sandbox off (it cannot nest) inside a Tower profile: it writes only to its own folders and the per-user temporary folders Chromium needs, cannot read credential stores, and without the network reaches only this machine (no DNS, no outside address, no proxy on loopback).
- Verification uses a fresh package cache for every run, seeded from yours and thrown away afterwards, so nothing the agent wrote reaches a verdict through a cache.
- Sentinels for passing-but-wrong work are text rules over the diff, not a semantic analysis. They explain and order; the verdict itself is re-checked with only the agent's source changes kept and with a must-fail canary (JavaScript, TypeScript and Python test files). Tampering aimed at one specific test, or in other languages, can still pass both.
- A process a verification starts and that leaves its directories entirely (changes its working directory and closes its files) is not stopped; it can write only to that verification's directories, which are deleted and never reused.
- On Linux and Windows there is no OS sandbox yet; reads and writes are fenced by path only and Tower says so in its environment check.
- Pi extensions you choose to load run outside the sandbox with your permissions.
