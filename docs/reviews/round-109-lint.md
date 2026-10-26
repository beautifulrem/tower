# 第 109 轮 lint

`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH` → exit 0（ADR-237 落地后；headings 566，ADR 237，section_refs 10426，problems 0）。从 `docs/` 运行。

**本轮改动了 lint 脚本**（`reviews/lint/xref.py`，R109-D12-01）：(d) 新增一项 `deferred purge continuation`（ADR-237），匹配 “推迟的根”“根之下的删除推迟”“可访问时（Tower ）续做”“数据库在全部完成之后才删除”“数据库最后删除”，并加入 `DELETED_STRICT`（只认匹配之外的真实历史标记）。加入之前逐个检查过：正文（`15` 与 `16` §16.1.13 的旧栏之外）中命中为 0；第 108 轮一行（`16:659`）的新栏 “清除只推迟不可访问的根（按 `roots[].wtRoot`）” 改为现行写法 “清除按 `roots[].wtRoot` 判定根的可访问性”，否则 (d) 会以 `DELETED_IN_NEW_COLUMN` 报出（新栏不享受历史豁免）。

各项的变化：
- **(D)**：657 → 669 个短语。第 109 轮一行（`16:660`）登记 12 个被取代的说法：“推迟的根随 30 s 的复查”“重新可访问时 Tower 续做”“数据库在全部完成之后才删除”“不可访问的根推迟并列出”“先对该 Goal 的必需路径做本行的判定”“命令的受理至多推迟约 5 s”“目标卷挂起时只多占该组一个线程”“Codex 的计时同样只到响应头”“随后 extension_error 会触发一条 Needs-You sentinel”“请先在 Pi 设置中改正再重试”“该 Goal 不可达期间只有它可用”“结果列出推迟的根”。写这一行之前逐个检查过：在 `00`–`14`、`16`（§16.1.13 之外）与 README 中都为 0。
- **(e)**：291 → 292 对，即 ADR-237 的 “Amends ADR-236” 与 ADR-236 标题的 “Amended by ADR-237”。
- **(d)**：48 → 49 项（见上），正文命中 0。
- **(v)**：仍为 100 条命令、仅本机 25 条：本轮没有新命令；`goal.discard_human_edits`、`inspect.close` 的远程属性不变（后者本就仅本机）。
- **(C)**：WBS 124.42，19 行；W4 4.70、W6 9.35、W7 26.74（系统 14.19）；角色容量表（Agent 28.94、系统 28.97、桌面 29.05、设计 29.06、安全 14.45）、范围句（28.90–29.06）、结论的余量（系统 1.03、Agent 1.06、桌面 0.95、设计 0.94、安全 1.10）、甘特图余量、增人加法式（130.47，T 24.09）、§14.8 与 `15` 第 109 轮补记一致；ADR-038〔当前值〕仍为 39 周、2027-08-06。
- **(s)、(w)、(w′)、(k′)、(O)、(i)** 集合不变：不新增暂停原因、Needs-You kind、`wait_reason` 值或事件类型。
- **(A)** 仍为 7 个进程行：`13` §13.8.1 Supervisor 一行只在说明栏补了线程未计入的注明，数值不变。
- **(o)**：`02` §2.3 `Project` 新增 `defaultCheckout?`、`relocatedFrom?` 两个可选字段，`16` §16.1 没有 `Project` 行，比较的 8 行不变。
- **(n)**：C5、C43 的改动在 `05` §5.11 中，引用为 0。

**变异检查**（在 `/tmp` 的副本上做，正文未改动；四处一并改动后运行一次，副本已删除）：
- **(d)**：在 `06` §6.1.6 隐私清除一行写回 “推迟的根随 30 s 的复查，可访问时续做。”，报 `DELETED_NAME deferred purge continuation 06:143`（两处匹配）。
- **(D)**：同一插入另报 `SUPERSEDED_PHRASE 06:143 推迟的根随 30 s 的复查`（`16:660`）；在 `09` §9.12.4 写回 “不可访问的根推迟并列出。”，报 `SUPERSEDED_PHRASE 09:575`。
- **(e)**：删去 ADR-236 标题的 “Amended by ADR-237”，报 `NO_BACK_MARKER ADR-236`。
- **(C)**：把 `14` W7 改为 26.75（系统 14.20），共报 6 项：`TEAM_TABLE 14 §14.8 系统 W7 14.19 ≠ §14.3.4 14.20`、`TEAM_TABLE 14 §14.8 系统 合计`、`WBS_TOTAL 124.42 ≠ 124.43`、`CAPACITY_TOTAL 系统`、`ADR133_ROLE_TOTAL 15 第 109 轮 系统`、`ADR133_TOTAL 15 第 109 轮`。

本轮引用的位置都已核对：
- **节号**（lint 的 section_refs 覆盖 `00`–`14`、`16` 与 README）：`02` §2.3；`03` §3.2.1；`04` §4.8.11、§4.15、§4.18.1、§4.18.3；`05` §5.3.6、§5.5、§5.6.5、§5.11 C5、C43；`06` §6.1.4、§6.1.6、§6.3、§6.4.3、§6.8 F13；`07` §7.4.1、§7.4.6；`09` §9.12.4；`10` §10.1.1、§10.2、§10.3.2、§10.16.2、§10.16.3；`12` §12.6.5；`13` §13.5、§13.8.1；`14` §14.1、§14.3.4、§14.8、G35e (q)；`16` §16.1.1、§16.1.13。
- **Pi 行号**（v1.2.0，`git show v1.2.0:<path>`，`packages/coding-agent/src/` 下，另注 `agent`、`ai`）：
  - `core/extensions/runner.ts:1096-1125, 1111-1120, 1249-1267, 1253`；`core/agent-session.ts:663-669, 667-681, 1204, 3795`；`agent/src/agent-loop.ts:770-776`；
  - `core/settings-manager.ts:147-156, 891-898, 900-901, 925-932, 934-936`；`core/http-dispatcher.ts:18-34`；`core/sdk.ts:346, 350, 351`；
  - `ai/src/api/openai-codex-responses.ts:192-198, 295, 302, 398, 409, 1392-1403`。
- **厂商 SDK**（第 108 轮已以 `npm pack` 取得并核对，本轮只沿用其行号）：`@anthropic-ai/sdk` 0.129.0 `client.js:668`；`openai` 7.19.0 `client.js:996`。

```
headings=566 adrs=237 section_refs=10426 problems=0
(r) unique-definition contradictions=0
(s) three-way enums: 8/8 consistent
Goal state	OK	
PauseReason	OK	
HumanDecision.kind	OK	
Checkpoint landmark	OK	
Checkpoint.author	OK	
anomaly detectors	OK	
verifyOrigin	OK	
NeedsYouItem.kind	OK	
(s) PauseReason source states registered in every defining place: 6 places, missing=0
(u) SP6b batch-table disagreements=0
(v) remote-matrix coverage problems=0 (commands in 06 §6.4.3: 100; local-only checked against 06 §6.4.7: 25)
(w) Needs-You kind/dedupe/outcome problems=0
(x) default data vs examples: default-benign targets ['~/.ssh/known_hosts']; problems=0
(w′) pauseReason → Needs-You problems=0
(y) cross-column CHECK vs 16 problems=0
(z) push/PR/remote polling presented as M1=0
(z′) M2 capability phrases in M1 tables: 53 occurrences, unmarked=0, UNPARSABLE=0
(c) continuation literal shape vs 02=0
(d) deleted mechanism names outside history=0
(n) contract-test references=0
(k) 03 §3.2.1 rewrite targets vs 06 §6.4.3=0
(s′) enum values used in rule text / pseudo-code outside the registered set=0
(e) ADR back-markers: 292 supersede/amend pairs, missing=0
(r′) mutual “一致/唯一定义” claims: 65 pairs, differing values=0
(q) verbatim-quote mismatches=0
(p) 16 §16.8 copy cells without 规则 5: 10 copy cells, missing=0, UNPARSABLE=0
(P) 16 §16.8 role-column copies (per column): 8 role cells with copies, missing=0, UNPARSABLE=0
(i) event names in per-document event tables vs 16 §16.1.14: 31 names, not in index=0, UNPARSABLE=0
(i′) full-row and path-list payload events vs the 13 §13.9.1 cap (06 §6.3 rule): 5 events, unhandled=0, UNPARSABLE=0
(D) superseded phrases of 16 §16.1.13 outside history: 669 phrases, hits=0, UNPARSABLE=0
(g) fact/danger glyphs paired with queue/grant/approval in 04/12: 20 glyph lines checked, misuse=0
(o) 16 §16.1 object shapes vs 02: 8 rows compared, 0 unions skipped, differing=0, UNPARSABLE=0
(k′) 03 §3.2.1 resume exits vs 06 goal.resume: 14 reasons with a resume exit, missing=0, UNPARSABLE=0
(r‴) one-sided “只引用本条/本节” claims: 1 enumerating claims, re-enumerations=0
(A) per-process memory budgets 06 §6.1 vs 13 §13.8.1: 7 process rows, problems=0, UNPARSABLE=0
(T) tool kinds (05 §5.6.5, 11 §11.3.4) → 16 §16.1.10 action classes: 9 kinds, problems=0, UNPARSABLE=0
(F) level floors (02 §2.5) enforced in 11 §11.3.5 decide(): 1 floor clauses, problems=0, UNPARSABLE=0
(M) 13 “M1 验收” CI scenarios in 14 §14.3.5 M1 exit: 1 scenarios, missing=0, UNPARSABLE=0
(B) enumerating “run 类阻断” claims vs 16 §16.1.6: 1 claims, differing=0, UNPARSABLE=0
(O) 08 §8.8 one class per exit: 35 rows, problems=0, UNPARSABLE=0
(J) 16 §16.3 keymap (key, scope) pairs: 135 pairs, duplicates=0, UNPARSABLE=0
(H) 04 wireframe key hints vs 16 §16.3: 77 hint keys, problems=0, UNPARSABLE=0
(C) 14 §14.3.4 capacity table vs WBS / margins / 15 ADR-133 addendum: 19 WBS rows, problems=0, UNPARSABLE=0
(t) open markers=0
```
