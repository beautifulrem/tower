# 第 95 轮 lint

`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH` → exit 0（ADR-223 落地后；headings 566，ADR 223，section_refs 8562，problems 0）。从 `docs/` 运行。

本轮没有改动 lint 脚本（`reviews/lint/xref.py`）。评审 §3.1 的建议按下面处理：
- **R95-D8-01（§8.8 中写出的出口名须在 `06` §6.4.3 找到承载命令）**：没有新增检查。本轮唯一缺命令的出口（`write_back_failed` 的“知悉”）已在 `08` §8.8 该行写明由 `needs_you.dismiss` 承载；(O) 仍检查每个出口只有一个类别（35 行，0）。被取代的“你的副本仍在原路径，处置只是确认”登入 `16` §16.1.13，由 (D) 检查。
- **R95-D11-01（例外覆盖的路径在伪代码中都产生 `secrets.access`）**：属于语义，没有新增检查。伪代码改为卫星内外同一条规则后，被取代的括注“若命中密钥路径表 → secrets.access”与“S2 下这张卡（不论来自文件工具还是 bash）写明”登入 `16` §16.1.13，由 (D) 检查。
- **R95-D11-02、R95-D12-01**：平台规则与 Pi 运行时事实，属于语义，lint 不覆盖；前者由 SP6a A3 的硬链接一组与启动自检的探测承担，后者的 Pi 行号见下。

中途报出并已修正的问题：
- 正文写入、ADR 未写时的中间运行只有预期的 `NO_ADR`（正文中对尚未写入的 ADR-223 的引用）。
- 一次替换脚本因 `15` 中 “`12` §12.10” 的出现次数不唯一而整体中止、未写入；改为逐处替换后重跑（引用改为 `12` §12.12，读取凭据卡的登记实际所在的组件清单）。lint 本身没有报错。

本轮引用的位置都已核对：
- **节号**（lint 的 section_refs 覆盖 `00`–`14`、`16` 与 README）：
  - `00` §0.5.1；`04` §4.5.2、§4.5.3、§4.6.7、§4.8.5、§4.10.2、§4.15；`05` §5.3.6、§5.11.1 D61、§5.11.2 C42；
  - `06` §6.1.6、§6.4.3、§6.7；`07` §7.2.2、§7.4.3；`08` §8.4、§8.8；`09` §9.12.4；
  - `10` §10.2、§10.16.2；`11` §11.3.1、§11.3.2、§11.3.3、§11.6.2、§11.6.3、§11.7.1；`12` §12.6.4、§12.6.5、§12.12；`13` §13.11.1；
  - `14` §14.2 SP6a A3、§14.3.4、§14.3.5、§14.8；`16` §16.1.13。
- **Pi 行号**（v1.2.0，`git show v1.2.0:<path>`，`packages/coding-agent/src/` 下，另注者除外）：
  - `core/tools/bash.ts:282-293`（`emitOutputUpdate`，`details.fullOutputPath`）、`:332`（`finishOutput` 抛错前再发一次）、`:342-353`（只有截断时附 “Full output”）、`:371-380`（超时与中止的错误文本）；
  - `core/tools/output-accumulator.ts:91-118`（`snapshot` 的 `fullOutputPath`）；`packages/agent/src/agent-loop.ts:779-786`（`tool_execution_update` 的 `partialResult`）；
  - `extensions/mcp/tools.ts:51`（`MCP_OUTPUT_MAX_BYTES = 20 KB`）、`:60-61`（`McpToolDetails.fullOutputPath`）、`:70-71`（`saveToTempFile` → `pi-mcp`）、`:183-199`（截断时写出全文）；`utils/output-files.ts:17-19`；
  - `core/tools/edit.ts:176-181`（带 `code` 时只写 “Error code: <code>”）；`core/tools/read.ts:124-155`（同一 `absolutePath` 依次调用各操作）。

与第 94 轮相比的计数变化：
- ADR 222 → 223；section_refs 8474 → 8562。
- (e) 239 → 241 对：ADR-223 Amends ADR-222、ADR-221，两者标题都已补 “Amended by ADR-223”。
- (D) 429 → 444 个短语：第 95 轮一行登入 15 个被取代的说法，命中 0。
- (C) 仍为 19 行、0，已核对到第 95 轮的数值：
  - W4 4.51、W13 6.96、W16 3.45，功能合计 123.83；
  - 角色容量表桌面 28.01 / 26.21 / 28.83、设计 29.20 / 26.20 / 28.82；范围句 “第 95 轮后…28.82–28.88”；
  - 结论与甘特图余量桌面 0.17、设计 0.18；增人算式 28.86 + 28.88 + 28.83 + 28.82 + 14.44 = 129.83，T = 131.83 / 5.5 = 23.97；
  - §14.8 桌面 W4 4.51、合计 28.01，设计 W13 6.96、W16 3.45、合计 29.20；ADR-133 第 95 轮补记的角色合计与余量。
- (v) 仍为 98 条命令（本轮不新增命令）；(O) 仍为 35 行；(r′) 仍为 59 对；(A) 7 行；(T) 9 种。其余各项计数不变，全部为 0。

```
headings=566 adrs=223 section_refs=8562 problems=0
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
(e) ADR back-markers: 241 supersede/amend pairs, missing=0
(r′) mutual “一致/唯一定义” claims: 59 pairs, differing values=0
(q) verbatim-quote mismatches=0
(p) 16 §16.8 copy cells without 规则 5: 10 copy cells, missing=0, UNPARSABLE=0
(P) 16 §16.8 role-column copies (per column): 8 role cells with copies, missing=0, UNPARSABLE=0
(i) event names in per-document event tables vs 16 §16.1.14: 31 names, not in index=0, UNPARSABLE=0
(i′) full-row and path-list payload events vs the 13 §13.9.1 cap (06 §6.3 rule): 5 events, unhandled=0, UNPARSABLE=0
(D) superseded phrases of 16 §16.1.13 outside history: 444 phrases, hits=0, UNPARSABLE=0
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
