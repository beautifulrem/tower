# Security policy

Tower runs coding agents that execute commands on your machine. Its safety rests on a few properties; reports that break them are the most valuable:

- everything the agent runs — its shell commands and its `read`, `edit` and `write` tools — runs under a deny-by-default macOS Seatbelt profile generated per goal;
- reads are an allow-list: system locations, toolchains (without package managers' configuration directories), its own workspace and private directories; not your home directory, other volumes, shared temporary folders or other apps' data; credential stores (`~/.ssh`, `~/.aws`, `~/.config/gh`, Pi's `auth.json`, …) are denied even where reading is otherwise allowed, and no `*_API_KEY`-style variable reaches it;
- the agent can write only its workspace, its private temporary directory and its private package caches (seeded by copy-on-write from yours, so your own caches cannot be poisoned);
- without the contract's network switch the agent reaches only loopback; local proxy ports and Unix sockets outside its directories (for example `docker.sock`) are not reachable; the keychain service is never reachable, with or without the network;
- the model can call only seven tools (`read`, `bash`, `edit`, `write`, `ask_user`, `log`, `submit`); MCP and a repository's own Pi resources are disabled;
- Tower never pushes or writes to your repository except a new local branch you accepted;
- verification runs in a clean checkout under the same sandbox rules, without credentials and without anything the agent could write (a fresh package cache each time);
- the agent cannot change the git configuration or hooks Tower itself uses.

## Reporting

Please **do not** open a public issue for a vulnerability. Use GitHub's private vulnerability reporting ("Security" → "Report a vulnerability") on this repository. Describe the property that fails and the class of harm; a minimal reproduction helps. We aim to acknowledge within three days.

## Known limits

- Pi itself (which holds the model credentials and talks to the provider) runs outside the sandbox; only what the model can cause to happen runs inside it.
- Setup commands (installing dependencies) run the code the manifests choose, inside the sandbox. In the agent's workspace they have the network. In verification they get the network only when the agent did not change dependency manifests or lockfiles, the contract allows the network, or you approved exactly these changes on a decision card; local files such as `.env` are copied in only after setup. A malicious dependency you approve can still reach the network during setup; it cannot read your credentials.
- Verification uses a fresh package cache for every run, seeded from yours and thrown away afterwards, so nothing the agent wrote reaches a verdict through a cache.
- Sentinels for passing-but-wrong work are text rules over the diff, not a semantic analysis.
- On Linux and Windows there is no OS sandbox yet; reads and writes are fenced by path only and Tower says so in its environment check.
- Pi extensions you choose to load run outside the sandbox with your permissions.
