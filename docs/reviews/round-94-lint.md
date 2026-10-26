# 第 94 轮 lint

`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH` → exit 0（ADR-222 落地后；headings 566，ADR 222，section_refs 8474，problems 0）。从 `docs/` 运行。

本轮没有改动 lint 脚本（`reviews/lint/xref.py`）。评审 §3.1 的两条建议按下面处理：
- **R94-D12-01（`.kept-*` 路径形状须出现在 `09` 保留清单与 `16` `tower_data` 中）**：没有新增检查。`.kept-*` 的四种形状现在只在 `09` §9.12.4 “人的工作现场”一处按名字形状列出，`16` §16.1.6 与 `06` §6.6 目录树各列一次，`10` §10.2 只引用；被取代的“这类目录有四种”等说法登入 `16` §16.1.13，由 (D) 检查。
- **R94-D10-01（“每次……一个进程”的机制须在 `13` §13.11.1 或 `16` §16.2.7 有开销行）**：没有新增检查。本轮唯一这样的机制（文件辅助进程）已在 `13` §13.11.1 与 `16` §16.2.7 各有一行；被取代的“每次文件操作一个的一次性子进程”登入 `16` §16.1.13，由 (D) 检查。
- **其余条目**（R94-D5-01、R94-D6-01、R94-D8-01、R94-D11-01、R94-D11-02、R94-D12-02、R94-D14-01）属于语义，lint 不覆盖；R94-D14-01 的时序由 C42 (a)–(d) 的测试钩子承担。

中途报出并已修正的问题：无。正文、ADR-222 与排期一并写入后第一次运行即为 0（正文写入、ADR 未写时的中间运行只有预期的 `NO_ADR`）。

本轮引用的位置都已核对：
- **节号**（lint 的 section_refs 覆盖 `00`–`14`、`16` 与 README）：
  - `00` §0.5.1；`04` §4.6.7、§4.10.2；`05` §5.3.5、§5.11.1 D61、§5.11.2 C42；
  - `06` §6.1.6、§6.4.3、§6.6；`07` §7.2.2、§7.7.1、§7.10.1；`08` §8.4；`09` §9.12.4；
  - `10` §10.2、§10.8.4；`11` §11.3.1、§11.6.2、§11.7.1；`13` §13.8.1、§13.11.1；
  - `14` §14.3.4、§14.8、SP6a A3、G31、G46；`16` §16.1.6、§16.1.13、§16.2.6、§16.2.7、§16.2.8。
- **Pi 行号**（v1.2.0，`git show v1.2.0:<path>`，`packages/coding-agent/src/` 下）：
  - `core/tools/read.ts:59, 116-119, 127, 129, 135, 155`；`edit.ts:95, 176, 179-181, 186, 198`；`write.ts:78, 82`；
  - `core/tools/bash.ts:24, 343, 348-352, 371-388, 390-396, 400-406, 424`；`core/tools/output-accumulator.ts:72-73, 239-242`；`utils/output-files.ts:17-19`；
  - `extensions/codemode/execute.ts:340`（`spillOutput`，文本 `pi-codemode-*.txt`）、`:369`（图像）；`extensions/mcp/tools.ts:71`。

与第 93 轮相比的计数变化：
- ADR 221 → 222；section_refs 8379 → 8474。
- (e) 237 → 239 对：ADR-222 Amends ADR-221、ADR-220，两者标题都已补 “Amended by ADR-222”。
- (D) 414 → 429 个短语：第 94 轮一行登入 15 个被取代的说法，命中 0。
- (C) 仍为 19 行、0，已核对到第 94 轮的数值：
  - W4 4.49、W13 6.95、W16 3.43、W17 1.60，功能合计 123.78；
  - 角色容量表桌面 27.99 / 26.19 / 28.81、设计 29.17 / 26.17 / 28.79；范围句 “第 94 轮后…28.79–28.88”；
  - 结论与甘特图余量桌面 0.19、设计 0.21；增人算式 28.86 + 28.88 + 28.81 + 28.79 + 14.44 = 129.78，T = 131.78 / 5.5 = 23.96；
  - §14.8 桌面 W4 4.49、合计 27.99，设计 W13 6.95、W16 3.43、W17 1.60、合计 29.17；ADR-133 第 94 轮补记的角色合计与余量。
- (r′) 仍为 59 对；(O) 仍为 35 行（`08` §8.8 不变）；(A) 仍为 7 行；(T) 仍为 9 种；(v) 仍为 98 条命令（本轮不新增命令）。其余各项计数不变，全部为 0。

```
headings=566 adrs=222 section_refs=8474 problems=0
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
(e) ADR back-markers: 239 supersede/amend pairs, missing=0
(r′) mutual “一致/唯一定义” claims: 59 pairs, differing values=0
(q) verbatim-quote mismatches=0
(p) 16 §16.8 copy cells without 规则 5: 10 copy cells, missing=0, UNPARSABLE=0
(P) 16 §16.8 role-column copies (per column): 8 role cells with copies, missing=0, UNPARSABLE=0
(i) event names in per-document event tables vs 16 §16.1.14: 31 names, not in index=0, UNPARSABLE=0
(i′) full-row and path-list payload events vs the 13 §13.9.1 cap (06 §6.3 rule): 5 events, unhandled=0, UNPARSABLE=0
(D) superseded phrases of 16 §16.1.13 outside history: 429 phrases, hits=0, UNPARSABLE=0
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
