# 第 91 轮 lint

`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH` → exit 0（ADR-219 落地后；headings 566，ADR 219，section_refs 8132，problems 0）。从 `docs/` 运行。

本轮没有改动 lint 脚本（`reviews/lint/xref.py`）。评审 §3.1 的判断成立：三条条目都是语义问题（伪代码与 Pi 源码的差异、同一规则两个分支的求值方式、缺少的失败分支），lint 不读 Pi 源码、也不比较规则语义，不新增检查。被取代的说法登入 `16` §16.1.13（第 91 轮一行，L642），由 (D) 检出。

中途报出并已修正的问题：无。正文与 ADR-219 一并写入后第一次运行即为 0。之后人工复查节号时发现 ADR-219 中两处小节号写错（`16` 的 `Goal.humanCheckout` 一行写作 §16.1.3，`04` 的 M2 机密说明写作 §4.11），lint 不检查 `15` 中的这类引用，已改为 §16.1.1 与 §4.10.2。

有效性核对（各临时改动后运行 `--checks DC`，恢复后为 0）：
- **(D)**：
  - 把 `10` §10.4.3 的 “其余规则引用第二处” 写回 “其余规则引用后者”，(D) 报 `SUPERSEDED_PHRASE 10:547 其余规则引用后者 16:642`；
  - 把 `11` §11.3.4 (1) 的 “按上述两种方式求值后” 写回 “经 `realpath` 后”，(D) 报 `SUPERSEDED_PHRASE 11:223 经 realpath 后，落在第 3 条硬底线之内 16:642`。
- **(C)**：`15` ADR-133 第 91 轮补记成为最新补记。临时把补记中的设计余量写成 0.38，(C) 报 `ADR133_MARGIN 15 第 91 轮 设计 0.38 ≠ 0.37`。

(D) 的局限：伪代码 `resolve(cwd, stripAt(input.path))` 与 `P1/P2/P5–P8` 这类不含汉字的旧写法不能登记为短语；它们在 `16` §16.1.13 第 91 轮一行中以描述登记，新写出的同类复述仍须靠评审发现。

中途核对：
- **人工复查节号**：新增与改动的引用都在所指的小节内：`00` §0.5.1；`02` §2.4、§2.7；`03` §3.1；`04` §4.6.7、§4.8.11、§4.8.12、§4.10.2；`05` §5.11.1 D60、§5.11.2 C41；`06` §6.1.6、§6.4.3、§6.8 F4b；`10` §10.4.3、§10.8.4；`11` §11.1、§11.3.1、§11.3.2、§11.3.4、T3；`12` §12.6.4；`14` §14.3.4、§14.3.5、§14.8、G31、G33、G46；`16` §16.1.1、§16.1.10、§16.1.12、§16.1.13。G31 新组初稿把实况行写作 `12` §12.6.5，核对后为 §12.6.4（§12.6.5 是等待与暂停原因）。
- **Pi 行号**（v1.2.0，`git show v1.2.0:<path>`，`packages/coding-agent/src/` 下）：`utils/paths.ts:7`（`UNICODE_SPACES`）、`:76-101`（`normalizePath`）、`:103-107`（`resolvePath`）；`core/tools/path-utils.ts:40-42`（`expandPath`）、`:48-50`（`resolveToCwd`）、`:52-84`、`:86-118`（`resolveReadPath`/`resolveReadPathAsync`）；`core/tools/write.ts:65`、`edit.ts:103-134`（`prepareEditArguments`）、`:161`、`read.ts:124`、`ls.ts:83`、`find.ts:111`、`grep.ts:125`；`package.json` 的 `exports`；`src/index.ts:335-392`、`:490-496`；`core/extensions/types.ts:2121-2131`（`ToolInfo.namespace`）；`extensions/mcp/index.ts:387-397, 424`；`packages/mcp/src/transports/stdio.ts:43-52`、`:160-163`。`git diff v1.2.0 HEAD` 对 `paths.ts`、`path-utils.ts` 与六个工具文件为空，D60 的 “发布版核实” 记 “同”。

与第 90 轮相比的计数变化：
- ADR 218 → 219；section_refs 8042 → 8132。
- (e) 227 → 230 对：ADR-219 Amends ADR-218、ADR-217、ADR-183，三者标题都已补 “Amended by ADR-219”。
- (D) 378 → 387 个短语：命中 0。
- (n) 仍为 0：新引用的 C41 在 `05` §5.11.2 中有行。
- (C) 仍为 19 行、0，已核对到第 91 轮的数值：W16 3.33，功能合计 123.49；角色容量表设计 29.03 / 26.03 / 28.63；范围句 “第 91 轮后…28.63–28.88”；结论与甘特图余量设计 0.37；增人算式 28.86 + 28.88 + 28.64 + 28.63 + 14.44 = 129.45，T = 131.45 / 5.5 = 23.90；§14.8 W16 3.33、设计合计 29.03；ADR-133 第 91 轮补记的角色合计与余量。
- (M) 仍为 0：`14` §14.3.5 性能行的 CI 场景改为 P1–P9 全部，覆盖 `13` “M1 验收” 所引用的场景。
- (v) 仍为 98 条命令（本轮不新增命令）；(r′) 仍为 57 对；(T) 仍为 9 种；(o) 仍为 8 行；(i′) 仍为 5 个事件。其余各项计数不变，全部为 0。

```
headings=566 adrs=219 section_refs=8132 problems=0
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
(e) ADR back-markers: 230 supersede/amend pairs, missing=0
(r′) mutual “一致/唯一定义” claims: 57 pairs, differing values=0
(q) verbatim-quote mismatches=0
(p) 16 §16.8 copy cells without 规则 5: 10 copy cells, missing=0, UNPARSABLE=0
(P) 16 §16.8 role-column copies (per column): 8 role cells with copies, missing=0, UNPARSABLE=0
(i) event names in per-document event tables vs 16 §16.1.14: 31 names, not in index=0, UNPARSABLE=0
(i′) full-row and path-list payload events vs the 13 §13.9.1 cap (06 §6.3 rule): 5 events, unhandled=0, UNPARSABLE=0
(D) superseded phrases of 16 §16.1.13 outside history: 387 phrases, hits=0, UNPARSABLE=0
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
