# 第 106 轮 lint

`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH` → exit 0（ADR-234 落地后；headings 566，ADR 234，section_refs 10036，problems 0）。从 `docs/` 运行。

本轮没有改动 lint 脚本（`reviews/lint/xref.py`）。

评审 §3.1 的建议按下面处理：
- **观察 11 的 DDL 注释**：评审建议把 “run.started / 中止 / 失败时清除” 登入 `16` §16.1.13 并限定在不带 “F8” 例外的句子。(D) 只做子串匹配，不能按句子是否带例外区分；`02` §2.4 L200 的正确写法 “run.started / 中止 / 失败时清除（06 §6.8 F8 的中止除外，ADR-233）” 含同一子串，登记会误报。本轮把 `06` §6.3 L485 的注释改为与 `02` 相同的写法，不登记。
- **六条次要条目**：属于语义，lint 不覆盖。被取代的说法一并登入第 106 轮一行（`16` L657），共 11 个短语，(D) 由 621 增到 632。其中 “getAuth 没有凭据时返回 undefined 而不抛错” 起初写成带反引号的形式，(D) 跳过含反引号的短语（621 → 631），去掉反引号后计入（632）。
- 本轮不新增暂停原因、Needs-You kind、`wait_reason` 值、事件类型或命令。`卷未挂载` 是卡片注明，不是暂停原因，准入检查 i 的新一项只用已有的 `waitReason = slot`。所以 (s)、(w)、(w′)、(k′)、(O)、(i)、(v) 的集合不变。`05` §5.6.5 新增的 `turn_start` 一行是 Pi 的扩展事件，不是 Tower 的事件类型，(i) 仍为 31 个名字。C39、C43、C44 的改动都在 `05` §5.11 中，(n) 0。
- (e) 由 284 对增到 287 对：ADR-234 的 “Amends ADR-233、ADR-231、ADR-207”，与三者标题的 “Amended by ADR-234”。
- (C)：WBS 124.31，19 行；`15` 第 106 轮补记的角色合计与余量都与 `14` 相同。

写第 106 轮一行之前，逐个检查了候选短语在正文中的出现（与 (D) 同一取法，去掉反引号与星号）：11 个短语在 `00`–`14`、`16`（§16.1.13 之外）与 README 中都为 0。没有登记的有两处：
- `05` 新写法 “分发器在 Host 启动时读一次” 中含 “在 Host 启动时读一次”，所以登记的是整句 “在 Host 启动时读一次，之后的改动从下一个 Host 起生效”，新写法中两半之间隔着括注，不命中。
- `06` §6.4.3 新写法 “只存在于本进程中正在写的有限时间内、崩溃到重启之间” 与旧写法共用前半句，所以登记的是带 “，以及崩溃到重启之间” 的整句。

改动后做了变异检查（在 `/tmp` 的副本上做，正文未改动）：
- **(D)**：在 `06` §6.1.6 “Run 中崩溃” 一行写回 “不论 Host 是否存活都按本行处理”，在 `11` §11.7.1 写回 “从注册起到下一个投递边界之前”，分别报 `SUPERSEDED_PHRASE 06:149` 与 `SUPERSEDED_PHRASE 11:517`（第 106 轮一行，`16:657`）。
- **(C)**：把 `14` W6 改为 9.35，共报 6 项：
  - `TEAM_TABLE 14 §14.8 Agent W6 9.34 ≠ §14.3.4 9.35`；
  - `TEAM_TABLE 14 §14.8 Agent 合计`；
  - `WBS_TOTAL 124.31 ≠ 124.32`；
  - `CAPACITY_TOTAL Agent`；
  - `ADR133_ROLE_TOTAL 15 第 106 轮 Agent`；
  - `ADR133_TOTAL 15 第 106 轮`。

本轮引用的位置都已核对：
- **节号**（lint 的 section_refs 覆盖 `00`–`14`、`16` 与 README）：
  - `04` §4.7、§4.18.3；`05` §5.2、§5.3.3、§5.3.6、§5.6.5、§5.11.1 D63、D64、C39、C43、C44；
  - `06` §6.1.1、§6.1.3、§6.1.4、§6.1.6、§6.1.8、§6.2.4、§6.3、§6.4.3、§6.6.5、§6.8 F4b、F6、F7 与 F8；`07` §7.2；`08` §8.10.5；`10` §10.2、§10.3.1；`11` §11.7.1；`12` §12.6.3、§12.6.4、§12.6.5、§12.8、§12.13.3；
  - `14` §14.1、§14.3.4、§14.8、G35e (q)、G46 (d) 第八至十组；`16` §16.1.13、§16.2.6。
- **Pi 行号**（v1.2.0，`git show v1.2.0:<path>`，`packages/coding-agent/src/` 下，另注 `ai`、`agent`、`mcp`）：
  - `core/sdk.ts:340-349, 420-421`；`core/settings-manager.ts:147-156, 304, 498-523`；`ai/src/api/anthropic-messages.ts:639-643`；`ai/src/utils/retry.ts:30, 73, 253-258`；`packages/agent/src/agent.ts:526-547, 609-610`；
  - `packages/agent/src/agent-loop.ts:117-118, 146-147, 207, 388-403`；`core/agent-session.ts:1039-1043, 1103, 1143, 1293-1299, 1858-1867`；`core/extensions/types.ts:1058-1063, 1651`；
  - `core/model-runtime.ts:555-562, 579-597, 621-640, 658-697`；`ai/src/models.ts:300-314`；`core/agent-session-services.ts:157-180`；
  - `packages/mcp/src/client.ts:38, 420`；`packages/mcp/src/transports/streamable-http.ts:211`。

```
headings=566 adrs=234 section_refs=10036 problems=0
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
(v) remote-matrix coverage problems=0 (commands in 06 §6.4.3: 99; local-only checked against 06 §6.4.7: 24)
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
(e) ADR back-markers: 287 supersede/amend pairs, missing=0
(r′) mutual “一致/唯一定义” claims: 65 pairs, differing values=0
(q) verbatim-quote mismatches=0
(p) 16 §16.8 copy cells without 规则 5: 10 copy cells, missing=0, UNPARSABLE=0
(P) 16 §16.8 role-column copies (per column): 8 role cells with copies, missing=0, UNPARSABLE=0
(i) event names in per-document event tables vs 16 §16.1.14: 31 names, not in index=0, UNPARSABLE=0
(i′) full-row and path-list payload events vs the 13 §13.9.1 cap (06 §6.3 rule): 5 events, unhandled=0, UNPARSABLE=0
(D) superseded phrases of 16 §16.1.13 outside history: 632 phrases, hits=0, UNPARSABLE=0
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
