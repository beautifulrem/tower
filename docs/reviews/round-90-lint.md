# 第 90 轮 lint

`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH` → exit 0（ADR-218 落地后；headings 566，ADR 218，section_refs 8042，problems 0）。从 `docs/` 与从 `/Volumes/Remi/Project` 运行，输出逐行相同（`diff` 无差异）。

本轮没有改动 lint 脚本（`reviews/lint/xref.py`）。评审 §3.1 的建议**采用**：归因窗口起点的旧三项写法登入 `16` §16.1.13（第 90 轮一行，L641），由 (D) 检出。

中途报出并已修正的问题：无。正文与 ADR-218 一并写入后第一次运行即为 0。

有效性核对（各临时改动后运行 `--checks DC`，恢复后为 0）：
- **(D)**：
  - 把 `04` §4.8.12 的 “（上一条所说的决定）” 写回 “（上面三个决定之一）”，(D) 报 `SUPERSEDED_PHRASE 04:995 上面三个决定之一 16:641`；
  - 把 `10` §10.3.1 的引用写回三项列表 “（`hand_back{continue_agent}`、`retry_after_human_change`、`request_changes`）时窗口起点前移”，(D) 报 `SUPERSEDED_PHRASE 10:409 retry_after_human_change、request_changes）时窗口起点前移 16:641`。
- **(C)**：`15` ADR-133 第 90 轮补记成为最新补记。临时把补记中的设计余量写成 0.43，(C) 报 `ADR133_MARGIN 15 第 90 轮 设计 0.43 ≠ 0.42`。

(D) 的局限：短语须含至少 5 个汉字、不含反引号，所以纯标识符的三项写法（只有 `hand_back{continue_agent}`、`retry_after_human_change`、`request_changes` 三个反引号标识符）本身不能登记；登记的是 `04` 与 `10` 中实际出现过的两种带汉字的形状与 “上面三个决定之一”。唯一规则仍只在 `03` §3.2.1，`06` §6.4.3 的逐字引文由 (q) 比对。

中途核对：
- **人工复查节号**：新增与改动的引用都在所指的小节内：`02` §2.4、§2.7；`03` §3.2、§3.2.1；`04` §4.6.7、§4.8.11、§4.8.12、§4.18.3；`05` §5.3.5、§5.11.1 D53、C21；`06` §6.1.1、§6.1.6、§6.2.1、§6.4.3、F4b；`08` §8.6.5、§8.13.2；`10` §10.3.1、§10.4.3；`11` §11.3.1、§11.3.4、§11.6.2、§11.8.2；`12` §12.6.5；`14` §14.3.4、§14.8、G31、G33、G46；`16` §16.1.1、§16.1.5、§16.1.7、§16.1.12、§16.1.13。ADR-218 初稿把 `08` 的 `prepare_failed` 定义写作 §8.4、把 `HumanDecision` 的形状写作 `16` §16.1.3，核对后为 §8.6.5 与 §16.1.5。
- **Pi 行号**（v1.2.0，`git show v1.2.0:<path>`，`packages/coding-agent/src/` 下）：`extensions/mcp/runtime.ts:89-96`（`expandHome`）、`:391`（`hasResources` 在连接成功后设置）、`:409-418`（`connectFailed`，`return` 在 L417）；`extensions/mcp/index.ts:466-471`（资源工具只到达 `hasResources` 为真的服务器）；`extensions/mcp/tools.ts:78-92`（名字规范化与哈希后缀）；`packages/mcp/src/transports/stdio.ts:43-52`（`exit` 钩子）、`:100-101`（`detached`）、`:152-179`（`close()` 按进程组终止）。

与第 89 轮相比的计数变化：
- ADR 217 → 218；section_refs 7951 → 8042。
- (e) 222 → 227 对：ADR-218 Amends ADR-217、ADR-216、ADR-214、ADR-186、ADR-179，五者标题都已补 “Amended by ADR-218”。
- (r′) 56 → 57 对：新增的一对是 `06` §6.4.3 `goal.abandon` 行与 `16` §16.1.12 `ProtoError.code` 行（两处都引用 “写回进行中” 的唯一定义并互相指向对方所在的小节）；值一致。
- (D) 365 → 378 个短语：命中 0。
- (C) 仍为 19 行、0，已核对到第 90 轮的数值：W16 3.28，功能合计 123.44；角色容量表设计 28.98 / 25.98 / 28.58；范围句 “第 90 轮后…28.58–28.88”；结论与甘特图余量设计 0.42；增人算式 28.86 + 28.88 + 28.64 + 28.58 + 14.44 = 129.40，T = 131.40 / 5.5 = 23.89；§14.8 W16 3.28、设计合计 28.98；ADR-133 第 90 轮补记的角色合计与余量。
- (v) 仍为 98 条命令（本轮不新增命令）；(o) 仍为 8 行；(i′) 仍为 5 个事件。其余各项计数不变，全部为 0。

```
headings=566 adrs=218 section_refs=8042 problems=0
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
(e) ADR back-markers: 227 supersede/amend pairs, missing=0
(r′) mutual “一致/唯一定义” claims: 57 pairs, differing values=0
(q) verbatim-quote mismatches=0
(p) 16 §16.8 copy cells without 规则 5: 10 copy cells, missing=0, UNPARSABLE=0
(P) 16 §16.8 role-column copies (per column): 8 role cells with copies, missing=0, UNPARSABLE=0
(i) event names in per-document event tables vs 16 §16.1.14: 31 names, not in index=0, UNPARSABLE=0
(i′) full-row and path-list payload events vs the 13 §13.9.1 cap (06 §6.3 rule): 5 events, unhandled=0, UNPARSABLE=0
(D) superseded phrases of 16 §16.1.13 outside history: 378 phrases, hits=0, UNPARSABLE=0
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
