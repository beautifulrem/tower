# 第 89 轮 lint

`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH` → exit 0（ADR-217 落地后；headings 566，ADR 217，section_refs 7951，problems 0）。从 `docs/` 与从 `/Volumes/Remi/Project` 运行，输出逐行相同（`diff` 无差异）。

本轮没有改动 lint 脚本（`reviews/lint/xref.py`）。

中途报出并已修正的问题：
- **NO_ADR**（35 处）：正文先于 ADR-217 写入引用；ADR-217 写入后为 0。
- **(d) `DELETED_NAME`**（05:1461）：C21 新增的含 `..` 的相对 `cwd` 一组初稿写了 “求出 `~/.tower/mcp-cwd/` 的”，命中 ADR-216 新增的全机目录写法。改为 “求出各 Host 空目录的上一级目录的”，为 0。
- **(q) `QUOTE_DIFFERS`**（06:865 vs `03` §3.2.1 “验证失败是否自动返工”）：`06` §6.4.3 逐字引用该规则，`03` 的起点列表补项后引文未同步。`03` 的新句去掉了括注中的引用者清单，`06` 的引文按 `03` 原文更新，为 0。这也说明 (q) 已覆盖评审 §3.1 关心的 “起点列表只改一处” 的情形（见下）。

有效性核对：
- **(D)**：`16` §16.1.13 新增第 89 轮一行（L640），可检短语由 357 增至 365。临时把 `11` §11.3.4 (b) 的 “**唯一的例外**（ADR-216/217）：” 写回 “**Tower 的空目录不作基准**：”，(D) 报 `SUPERSEDED_PHRASE 11:222 Tower 的空目录不作基准 16:640`；恢复后为 0。
- **(C)**：`15` ADR-133 第 89 轮补记成为最新补记。临时把补记中的 Agent 余量写成 0.15，(C) 报 `ADR133_MARGIN 15 第 89 轮 Agent 0.15 ≠ 0.14`；恢复后为 0。
- **(q)**：见上，初稿的不一致被报出。

评审 §3.1 的建议（以 (r′) 比对 `03` L75、`16` L38、`07` L1591 三处的起点集合）**未采用**：本轮把列表只留在唯一规则 `03` §3.2.1，`16` §16.1.1 与 `07` §7.10.3 改为引用 `03`、不再复述集合（只写 “`hand_back{continue_agent}` 等四项”），没有第二份清单可比对；唯一的逐字复制（`06` §6.4.3 的引文）已由 (q) 比对。

中途核对：
- **人工复查节号**：新增与改动的引用都在所指的小节内：`02` §2.7；`03` §3.2.1；`04` §4.6.7、§4.8.11、§4.18.3；`05` §5.2.2、§5.3.5；`06` §6.1.3、§6.1.6、§6.2.1、§6.4.3、F4b；`07` §7.10.3；`09` §9.12.4；`10` §10.1.2；`11` §11.3.3、§11.3.4、§11.6.2、§11.8.2、T16、T29；`12` §12.6.5；`14` §14.3.4、§14.8、G26c、G32、G33、G46；`16` §16.1.1、§16.1.13。ADR-217 初稿把硬上限卡片写作 `04` §4.11，核对后为 §4.18.3；`11` L359 的 git 环境在 §11.6.2。
- **Pi 行号**（v1.2.0，`git show v1.2.0:<path>`）：`extensions/mcp/runtime.ts:118`（默认工厂的 spawn `cwd`）、`:237-243`（`getClient()`）、`:278-300`（`withClient()`）、`:343`（只对 `"url"` 服务器重试）、`:364`（`roots` 以 `pathToFileURL` 声明）；`extensions/mcp/resources.ts:72`（`uri` 参数）、`:311-315`（原样交给 `readResource`）；`packages/mcp/src/transports/stdio.ts:43-52`（`exit` 钩子）、`:100-101`（`detached` 进程组）。

与第 88 轮相比的计数变化：
- ADR 216 → 217；section_refs 7878 → 7951。
- (e) 219 → 222 对：ADR-217 Amends ADR-216、ADR-186、ADR-145，三者标题都已补 “Amended by ADR-217”。
- (D) 357 → 365 个短语：命中 0。
- (C) 仍为 19 行、0，已核对到第 89 轮的数值：W6 9.28、W16 3.25，功能合计 123.41；角色容量表 Agent 26.64 / 26.24 / 28.86，设计 28.95 / 25.95 / 28.55；范围句 “第 89 轮后…28.55–28.88”；结论与甘特图余量 Agent 0.14、设计 0.45；增人算式 28.86 + 28.88 + 28.64 + 28.55 + 14.44 = 129.37，T = 131.37 / 5.5 = 23.89；§14.8 Agent 合计 26.64、设计合计 28.95；ADR-133 第 89 轮补记的角色合计与余量。
- (o) 仍为 8 行：`02` §2.7 `HumanDecision.handBack` 补 `mode` 不在 `16` §16.1 的形状比对行中（`Goal.humanCheckout.params` 已含 `mode`）。
- (v) 仍为 98 条命令（本轮不新增命令）；(r′) 仍为 56 对；(i′) 仍为 5 个事件。其余各项计数不变，全部为 0。

```
headings=566 adrs=217 section_refs=7951 problems=0
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
(v) remote-matrix coverage problems=0 (commands in 06 §6.4.3: 98)
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
(e) ADR back-markers: 222 supersede/amend pairs, missing=0
(r′) mutual “一致/唯一定义” claims: 56 pairs, differing values=0
(q) verbatim-quote mismatches=0
(p) 16 §16.8 copy cells without 规则 5: 10 copy cells, missing=0, UNPARSABLE=0
(P) 16 §16.8 role-column copies (per column): 8 role cells with copies, missing=0, UNPARSABLE=0
(i) event names in per-document event tables vs 16 §16.1.14: 31 names, not in index=0, UNPARSABLE=0
(i′) full-row and path-list payload events vs the 13 §13.9.1 cap (06 §6.3 rule): 5 events, unhandled=0, UNPARSABLE=0
(D) superseded phrases of 16 §16.1.13 outside history: 365 phrases, hits=0, UNPARSABLE=0
(g) fact/danger glyphs paired with queue/grant/approval in 04/12: 20 glyph lines checked, misuse=0
(o) 16 §16.1 object shapes vs 02: 8 rows compared, 0 unions skipped, differing=0, UNPARSABLE=0
(k′) 03 §3.2.1 resume exits vs 06 goal.resume: 14 reasons with a resume exit, missing=0, UNPARSABLE=0
(r‴) one-sided “只引用本条/本节” claims: 1 enumerating claims, re-enumerations=0
(A) per-process memory budgets 06 §6.1 vs 13 §13.8.1: 7 process rows, problems=0, UNPARSABLE=0
(T) tool kinds (05 §5.6.5, 11 §11.3.4) → 16 §16.1.10 action classes: 9 kinds, problems=0, UNPARSABLE=0
(F) level floors (02 §2.5) enforced in 11 §11.3.5 decide(): 1 floor clauses, problems=0, UNPARSABLE=0
(M) 13 “M1 验收” CI scenarios in 14 §14.3.5 M1 exit: 1 scenarios, missing=0, UNPARSABLE=0
(B) enumerating “run 类阻断” claims vs 16 §16.1.6: 1 claims, differing=0, UNPARSABLE=0
(O) 08 §8.8 one class per exit: 34 rows, problems=0, UNPARSABLE=0
(J) 16 §16.3 keymap (key, scope) pairs: 135 pairs, duplicates=0, UNPARSABLE=0
(H) 04 wireframe key hints vs 16 §16.3: 77 hint keys, problems=0, UNPARSABLE=0
(C) 14 §14.3.4 capacity table vs WBS / margins / 15 ADR-133 addendum: 19 WBS rows, problems=0, UNPARSABLE=0
(t) open markers=0
```
