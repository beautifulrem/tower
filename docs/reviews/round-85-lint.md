# 第 85 轮 lint

`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH` → exit 0（ADR-213 落地后；headings 566，ADR 213，section_refs 7525，problems 0）。从 `docs/` 与从 `/Volumes/Remi/Project` 运行，输出逐行相同（`diff` 无差异）。

本轮改动 lint 两处（`reviews/lint/xref.py`）：
- **(d) 新增一项、扩充一项**（`DELETED` 末尾）：
  - 新增（ADR-213，R85-D11-02）：高风险 Goal “逐项加回”扩展推迟到 M2，`逐项加回` 只能出现在 M2 或历史标记旁。
  - 扩充（评审观察 2 与 §3.1 第一条建议）：隔离 agentDir 一项的正则补 `非隔离模式`。
  - **有效性核对**：
    - 临时把 `16` §16.6 特性表的开关位置改回 “合同逐项加回”，(d) 报 1 处 `DELETED_NAME`（16:1231）；恢复后为 0。
    - 临时把 `11` §11.7.0 投递表改回 “非隔离模式本来就读它”，(d) 报 1 处 `DELETED_NAME`（11:450），(D) 同时报 1 处；恢复后为 0。
    - `11` §11.8.2 改回 “合同中可逐项加回” 时 (d) 不报：同一行 120 字之内有 “推迟到 M2”（隔离 agentDir 的说明），落在 `DEL_OK` 的窗口内；这一处由 (D) 的新短语捕获（报 1 处 `SUPERSEDED_PHRASE`）。
- **(i′) 新增一项子检查**（评审 §3.1 第二条建议，`check_i2`，随 `i` 运行）：
  - **范围**：`16` §16.1.14 中写作 “载荷即…” 的事件（载荷是整行投影、可能带无上限的数组）；
  - **判定**：同一索引行必须写明对 `13` §13.9.1 上限的处置，即同时含 “16 KB” 与 “`13` §13.9.1”；
  - **结果**：1 个事件（`checkpoint.created`），未处置 0；
  - **有效性核对**：临时把 16:663 的 “载荷会超过 16 KB（`13` §13.9.1）时” 改为 “载荷会超过上限时”，报 1 处 `PAYLOAD_CAP_UNHANDLED checkpoint.created`；恢复后为 0。

中途核对：
- **人工复查节号**：逐条核对新增的引用，都在所指的小节内：
  - `00` §0.5.1；`02` §2.4；`04` §4.7.2、§4.18.1；
  - `05` §5.3.1、§5.3.5、§5.3.6、§5.7.3、§5.9（G10）、§5.10、§5.11.1、§5.11.2；
  - `06` §6.1.6、§6.1.10、§6.2.1、§6.2.4、§6.4.3；`07` §7.3.2、§7.4.3；`08` §8.4；
  - `10` §10.3.1、§10.7.1、§10.8.2、§10.8.4、§10.13、§10.16.2、§10.18；
  - `11` §11.6.2、§11.7.0、§11.7.1、§11.8.2；`12` §12.12；`13` §13.5、§13.9.1；
  - `14` §14.3.4、§14.7、§14.8；`16` §16.1.1、§16.1.13、§16.1.14、§16.5、§16.6、§16.8。
  - 改正一处：新规则的引用列表起初写作 `11` §11.4（Host 环境白名单实在 §11.7.1 “各环节措施”），改为 §11.7.1，并补 `06` §6.2.1。
- **Pi 行号**：ADR-213 初稿的 `getInstalledNpmVersion` 写作 `:1535-1545`，核对后为 `:1538-1549`。
- **(D) 的短语**：第 85 轮一行起初把环境表的行名 “包管理器私有存储” 加了引号，(D) 把它当作被取代的说法，在 `05` L453 报 1 处；行名不是说法，去掉引号。

与第 84 轮相比的计数变化：
- ADR 212 → 213；section_refs 7406 → 7525。
- (e) 206 → 209 对：ADR-213 Amends ADR-212、ADR-137、ADR-063，三者标题都已补 “Amended by ADR-213”。
- (D) 309 → 322 个短语：`16` §16.1.13 新增第 85 轮一行，含 13 个可检短语，命中 0。
- (d) 仍为 0：新增的一项在正文中只出现在 M2 标记旁或历史段落中；`14` 第 82、83 轮增量段中的两处 “非隔离模式” 都带删除或 M2 标记。
- (i′) 新增：1 个事件，未处置 0。
- (i) 仍为 31 个事件名：`workspace.recovered`、`satellite.recovered` 只补可选的 `projectId`。
- (v) 仍为 97 条命令：`comment.*` 只分列参数，没有增删命令。
- (o) 仍为 0：`Goal.pendingHandBack` 的 `returnTo?` 在 `02` §2.4 与 `16` §16.1.1 同时补上。
- (s) 8/8：`Checkpoint landmark` 三处取值不变（本轮只补写入规则）。
- (C) 仍为 19 行、0，已核对到第 85 轮的数值：
  - W6 9.18 → 9.20（Agent），W16 3.12 → 3.14（设计），功能合计 123.19；
  - 角色容量表 Agent 26.56 / 26.16 / 28.78，设计 28.81 / 25.81 / 28.39；范围句 “第 85 轮后…28.39–28.88”；
  - 结论与甘特图的余量：Agent 0.22、设计 0.61；系统、桌面、安全不变（0.12、0.36、0.12）；
  - 增人算式 28.78 + 28.88 + 28.64 + 28.39 + 14.44 = 129.13，T = 131.13 / 5.5 = 23.84；
  - §14.8：Agent 行 W6（9.20）、合计 26.56；设计行 W16（3.14）、合计 28.81；
  - ADR-133 第 85 轮补记的角色合计与余量。
- 其余各项计数不变，全部为 0。

```
headings=566 adrs=213 section_refs=7525 problems=0
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
(v) remote-matrix coverage problems=0 (commands in 06 §6.4.3: 97)
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
(e) ADR back-markers: 209 supersede/amend pairs, missing=0
(r′) mutual “一致/唯一定义” claims: 53 pairs, differing values=0
(q) verbatim-quote mismatches=0
(p) 16 §16.8 copy cells without 规则 5: 10 copy cells, missing=0, UNPARSABLE=0
(P) 16 §16.8 role-column copies (per column): 8 role cells with copies, missing=0, UNPARSABLE=0
(i) event names in per-document event tables vs 16 §16.1.14: 31 names, not in index=0, UNPARSABLE=0
(i′) full-row payload events in 16 §16.1.14 vs the 13 §13.9.1 cap: 1 events, unhandled=0, UNPARSABLE=0
(D) superseded phrases of 16 §16.1.13 outside history: 322 phrases, hits=0, UNPARSABLE=0
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
