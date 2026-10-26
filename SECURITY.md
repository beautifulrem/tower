# Security policy

Tower runs coding agents that execute commands on your machine. Its safety rests on a few properties; reports that break them are the most valuable:

- the agent cannot write outside its workspace, its private temporary directory and package caches (macOS Seatbelt);
- the agent cannot read credential stores (`~/.ssh`, `~/.aws`, `~/.config/gh`, Pi's `auth.json`, …) and sees no `*_API_KEY` variables;
- Tower never pushes or writes to your repository except a new local branch you accepted;
- verification runs in a clean checkout under the sandbox, without credentials;
- the agent cannot change the git configuration or hooks Tower itself uses.

## Reporting

Please **do not** open a public issue for a vulnerability. Use GitHub's private vulnerability reporting ("Security" → "Report a vulnerability") on this repository. Describe the property that fails and the class of harm; a minimal reproduction helps. We aim to acknowledge within three days.

## Known limits

- Pi's own `read`, `edit` and `write` tools run in the Pi process and are path-checked rather than sandboxed (`docs/17-implementation.md` §17.4).
- On Linux and Windows there is no OS sandbox yet; Tower says so in its environment check.
- Extensions you choose to load run outside the sandbox with your permissions.
