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
- **Claude Code** (through the ACP bridge, `extensions/tower-goal/acp.ts`): Claude Code is started with no built-in tools, no user or project settings, hooks or MCP servers; its only tools are Tower's MCP server (MCP configuration is strict, and the connectors of your claude.ai account are switched off for it), which applies the same gate and Seatbelt profile as with Pi.
- Claude Code's ACP adapter is installed by Tower on first use with `npm ci` from a manifest and lockfile shipped with Tower (every package checked against its integrity hash, install scripts off), not fetched at whatever version the registry serves.
- In both cases the engine process itself (which holds your model login) runs outside the sandbox; only what the model can cause to happen runs inside it.

## The phone page

Off by default. When you turn it on (Settings), Tower serves a small page on your network so a phone can answer Needs-You items and pause goals. Every request must carry a 256-bit pairing token from the link or QR code in Settings; the page itself holds no data, and the token travels in the link's fragment, which browsers do not send. It listens only on Tailscale's address, and only while Tailscale is connected (encrypted); when it is not, the page is not served at all and Settings says why. Listening on the plain local network is a separate switch, because anyone who can watch that network could read the token. A paired phone keeps the token in the page's own storage. Settings can issue a new token at any time. Decisions that widen what the agent may do — allowing a gated action, overriding a sentinel, installing changed dependencies with the network — are refused from the phone and stay at the desk.

## Pushes

Off by default. With an ntfy topic URL in Settings (https, or http only to this Mac or a Tailscale address), each item that blocks a goal sends the goal's id and title and a fixed sentence for the kind of item to that URL — nothing the agent wrote, no code, no output and never the pairing token (when the phone page is on, the notification links to the page without it). The text is passed to curl as data on standard input, never as an argument. Settings shows whether the last push was delivered and can send a test push. Prefer your own ntfy server; a public one sees goal titles.

## How each property is checked

Every property above has a test that CI runs on each push (macOS runner, real `sandbox-exec`, real git):

| Property | Test |
|---|---|
| The agent's shell and file tools: no credentials, no other projects, writes only to its own folders, no network or loopback proxy unless allowed, TLS without the keychain | `sandbox::tests::profile_is_enforced_by_sandbox_exec`, `tls_works_with_network_and_without_keychain`, `system_proxies_on_loopback_are_found`; extension `file operations obey the sandbox profile`, `credentials are scrubbed…`, `proxy settings are dropped…` |
| The screenshot browser reaches only this machine and reads none of your home | `sandbox::tests::the_browser_profile_keeps_pages_on_this_machine`, flow `look_criteria_get_before_and_after_screenshots` |
| A pass must come from the source; edited tests, config and settings files are put back | flow `a_pass_must_come_from_the_source`, `passing_only_with_edited_tests_holds_the_goal`; corpus `every_non_source_way_in_is_put_back_by_the_source_only_run` |
| Altered assertions are caught by the must-fail canary | flow `a_test_that_must_fail_catches_disabled_assertions` (three variants), `an_honest_fix_shows_its_assertions_were_checked`; `canary::tests::*` |
| Held-out tests: never in the agent's workspace, contract or prompts; failures go to you | flow `held_out_tests_run_in_verification_only`, `failing_held_out_tests_go_to_the_human` |
| Text rules for hiding failures (deleted, skipped, hollowed tests, changed expectations, special cases) | corpus `every_cheat_in_the_corpus_is_caught`, `honest_changes_raise_nothing`; flow `special_casing_the_tests_values_is_reported` |
| Verification uses no cache the agent wrote, and leaves nothing running | flow `verification_does_not_see_the_agents_cache`, `verification_leaves_nothing_running` |
| Changed dependencies are not installed with the network without you | flow `changed_dependencies_need_the_human_before_setup_goes_online` |
| Probing outside the workspace is reported | flow `probing_outside_the_workspace_is_reported` |
| The phone page: token required, Tailscale or nothing by default, decisions that widen access stay at the desk | flow `the_phone_page_answers_with_the_pairing_token_only`; `remote::tests::*` |
| Pushes carry no agent text and no token, https only | flow `blocking_items_are_pushed_to_the_configured_topic`; `inner::push_tests::*` |
| The Claude Code bridge allows Tower's tools only | extension `the ACP bridge allows Tower's tools once and refuses everything else`; flow `an_acp_agent_runs_through_the_bridge` |
| Diagnostics leave secrets out | flow `diagnostics_leave_secrets_out` |

## Known limits

- Pi itself (which holds the model credentials and talks to the provider) runs outside the sandbox; only what the model can cause to happen runs inside it.
- Setup commands (installing dependencies) run the code the manifests choose, inside the sandbox. In the agent's workspace they have the network. In verification, setup runs with the network only on the base commit (your content); on the agent's snapshot it runs offline unless the contract allows the network or you approved that very snapshot on a decision card. Local files such as `.env` are present only while criteria run, never during setup. A malicious dependency you approve can still reach the network during setup; it cannot read your credentials.
- The browser that takes `look` screenshots runs the agent's page with its own sandbox off (it cannot nest) inside a Tower profile: it writes only to its own folders and the per-user temporary folders Chromium needs, cannot read credential stores, and without the network reaches only this machine (no DNS, no outside address, no proxy on loopback).
- Verification uses a fresh package cache for every run, seeded from yours and thrown away afterwards, so nothing the agent wrote reaches a verdict through a cache.
- Sentinels for passing-but-wrong work are text rules over the diff, not a semantic analysis. They explain and order; the verdict itself is re-checked with only the agent's source changes kept and with a must-fail canary going through each test file's own assertions (JavaScript, TypeScript and Python). Tampering aimed at one specific test, or in other languages, can still pass both; a criterion whose assertions could not be checked says so on its row.
- Folders named `node_modules` above the project are readable from the sandbox (Node and npm look for them; third-party packages, not secrets); writing to them is not allowed.
- A failing command counts as an environment problem (rather than a failing test) only when Tower itself sees the refusal: a path the output names that Tower can read and the same sandbox profile cannot, checked with a probe Tower runs. In the source-only re-run, a command that does not finish counts as failing.
- Loopback stays open to sandboxed commands (test suites start local servers on any port); known proxies on loopback — common proxy apps', `*_proxy` variables' and the system's proxy settings' — are closed when the network is off. Other services you run on localhost are reachable from a sandboxed test run.
- A process a verification starts and that leaves its directories entirely (changes its working directory and closes its files) is not stopped; it can write only to that verification's directories, which are deleted and never reused.
- On Linux and Windows there is no OS sandbox yet; reads and writes are fenced by path only and Tower says so in its environment check.
- Pi extensions you choose to load run outside the sandbox with your permissions.
