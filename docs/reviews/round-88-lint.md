# 第 88 轮 lint

`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH` → exit 0（ADR-216 落地后；headings 566，ADR 216，section_refs 7878，problems 0）。从 `docs/` 与从 `/Volumes/Remi/Project` 运行，输出逐行相同（`diff` 无差异）。

本轮改动 lint 一处（`reviews/lint/xref.py`）：
- **(d) 新增一项**（`DELETED` 末尾，ADR-216）：全机一个、每次 Host 启动时删除并重建的 stdio MCP 空工作目录（R88-D11-01）。正则三支：不带 `<hostId>` 段、紧接反引号结束的整条路径 `~/.tower/mcp-cwd/`；“每次 Host 启动前删除并重建” 或 “每次 Host 启动前清空”；“每次 Host 启动之前删除并重建”。
  - `16` §16.1.13 第 86、87 轮两行的新说法列含旧路径（(d) 对新说法列不做历史豁免）：按 “新说法列写当前的说法”（R35-D15-01 #5）改为 `~/.tower/mcp-cwd/<hostId>/`，并注 ADR-216。
  - `14` §14.3.4 第 86、87 轮的增量段与 W6 行的历史子项含旧路径，旁边有 “第 N 轮” 标记，按 (d) 的既有豁免通过。
  - **有效性核对**：临时把 `05` §5.3.5 的基准改回 “以 Tower 的空目录 `~/.tower/mcp-cwd/` 为基准求出”，(d) 报 1 处 `DELETED_NAME`（05:439）；恢复后为 0。
- **(D)**：`16` §16.1.13 新增第 88 轮一行（L639），可检短语由 344 增至 357。**有效性核对**：临时在 `06` §6.2.1 写回 “这些表清空后按事件重放”，(D) 报 1 处（06:221 ← 16:639）；恢复后为 0。
- **(C)**：`15` ADR-133 第 88 轮补记成为最新补记，角色合计与余量由 (C) 比对。**有效性核对**：临时把补记中的 Agent 余量写成 0.17，(C) 报 `ADR133_MARGIN 15 第 88 轮 Agent 0.17 ≠ 0.15`；恢复后为 0。
- 评审 §3.1 的建议（把置灰的命令写成 `16` `Goal.pendingHandBack` 中的枚举，由 (r′) 比对 `04` L664）**未采用**：本轮把规则移到转移的唯一来源 `03` §3.2.1 “`pendingHandBack` 等待期间的选项”，只列两个命令（`goal.take_over`、`goal.claim_on_behalf`），二者都以 `06` §6.4.3 中的 `E_STATE` 守卫落地；`16` 与 `04` 只引用 `03`，不再复述集合，没有需要比对的第二份清单。

中途核对：
- **人工复查节号**：新增与改动的引用都在所指的小节内：`03` §3.2.1；`04` §4.6.7、§4.8.9、§4.15、§4.18.1；`05` §5.3.5、§5.10；`06` §6.1.6、§6.2.1、§6.4.3、§6.6.1、§6.6.4；`07` §7.4.3；`08` §8.2；`09` §9.12.4；`10` §10.1.3、§10.3.1；`11` §11.3.1、§11.3.3、§11.3.4、§11.6.2、§11.8.2、T4、T16；`14` §14.3.4、§14.8；`16` §16.1.13、§16.1.14。ADR-216 初稿把清理表写作 `06` §6.6.1，核对后为 §6.6.4。
- **Pi 行号**（v1.2.0）：`core/extensions/types.ts:2058-2065`（`replaceable` 的 “The factory still runs”）；`core/resource-loader.ts:727-743`（工厂在资源加载中运行）；`extensions/mcp/runtime.ts:342`（只有 `"url" in config` 的服务器有连接重试）。

与第 87 轮相比的计数变化：
- ADR 215 → 216；section_refs 7800 → 7878。
- (e) 216 → 219 对：ADR-216 Amends ADR-215、ADR-214、ADR-134，三者标题都已补 “Amended by ADR-216”。
- (D) 344 → 357 个短语：命中 0。
- (d) 仍为 0：新增一项在正文中只出现在 `15` 与带历史标记的位置。
- (C) 仍为 19 行、0，已核对到第 88 轮的数值：W6 9.27、W12 9.18（设计 7.57）、W16 3.23，功能合计 123.38；角色容量表 Agent 26.63 / 26.23 / 28.85，设计 28.93 / 25.93 / 28.52；范围句 “第 88 轮后…28.52–28.88”；结论与甘特图余量 Agent 0.15、设计 0.48；增人算式 28.85 + 28.88 + 28.64 + 28.52 + 14.44 = 129.33，T = 131.33 / 5.5 = 23.88；§14.8 Agent 合计 26.63、设计合计 28.93；ADR-133 第 88 轮补记的角色合计与余量。
- (v) 仍为 98 条命令（本轮不新增命令）；(r′) 仍为 56 对；(i′) 仍为 5 个事件。其余各项计数不变，全部为 0。

```
headings=566 adrs=216 section_refs=7878 problems=0
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
(e) ADR back-markers: 219 supersede/amend pairs, missing=0
(r′) mutual “一致/唯一定义” claims: 56 pairs, differing values=0
(q) verbatim-quote mismatches=0
(p) 16 §16.8 copy cells without 规则 5: 10 copy cells, missing=0, UNPARSABLE=0
(P) 16 §16.8 role-column copies (per column): 8 role cells with copies, missing=0, UNPARSABLE=0
(i) event names in per-document event tables vs 16 §16.1.14: 31 names, not in index=0, UNPARSABLE=0
(i′) full-row and path-list payload events vs the 13 §13.9.1 cap (06 §6.3 rule): 5 events, unhandled=0, UNPARSABLE=0
(D) superseded phrases of 16 §16.1.13 outside history: 357 phrases, hits=0, UNPARSABLE=0
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

