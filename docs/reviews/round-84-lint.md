# 第 84 轮 lint

`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH` → exit 0（ADR-212 落地后；headings 566，ADR 212，section_refs 7406，problems 0）。从 `docs/` 与从 `/Volumes/Remi/Project` 运行，输出逐行相同（`diff` 无差异）。

本轮改动 lint 三处（`reviews/lint/xref.py`）：
- **(d) 新增一项**（`DELETED` 末尾，ADR-212）：独立的隔离 agentDir 推迟到 M2。`~/.tower/pi-agent`、`isolatedAgentDir`、`resources.isolated` 只能出现在 M2 或历史标记旁。
  - **有效性核对**：临时把 `05` §5.10 的 “推迟到 M2” 改为 “留待以后”，并把骨架的 `agentDir` 改回 `spec.resources.isolated ? isolatedAgentDir : userAgentDir`，(d) 报 3 处 `DELETED_NAME`（L349 两处、L1330 一处）；恢复后为 0。
- **(w) 补一项子检查**（评审 §3.1 的第一条建议）：`08` §8.4 与 §8.8 中写作 “`stalled`（子类型 `x`” 的每个子类型，必须出现在 `16` §16.1.7 “`stalled` 子类型” 一行。
  - **有效性核对**：临时从 `16` 该行删去 `human_checkout_lost`，(w) 报 1 处 `STALLED_SUBTYPE_UNREGISTERED`；恢复后为 0。

- **(z′) 补一组按行检查**（评审 §3.1 的第二条建议，`check_z2` 末尾的 `Z5_SECTIONS`）：
  - **范围**：`04` §4.6.7、§4.16（含 F12）、§4.18.3，`12` §12.6.4，`06` §6.1.4、§6.1.6——drain、退出、重启与接管的说明文字；
  - **判定**：同一行既有 “回退” 又有 “接管” 时，该行必须带 M2 或 M3 标记（回退属 M2，接管属 M1）；
  - **结果**：新增 6 处，都已带 M2（观察 7 的修订）；
  - **有效性核对**：临时去掉 `04` §4.18.3 应用退出一行的 “（M2）”，(z′) 报 1 处 `M2_CAPABILITY_UNMARKED`；恢复后为 0。

中途核对：
- **人工复查节号**：逐条核对新增的引用，都在所指的小节内：
  - `00` §0.5.1；`03` §3.2.1、§3.4.2；
  - `04` §4.2.2、§4.5.2、§4.6.3、§4.6.6、§4.6.7、§4.7.2、§4.16 F4/F12、§4.18.1、§4.18.3；
  - `05` §5.3.1、§5.3.3、§5.3.5、§5.3.6、§5.7.1、§5.7.3、§5.7.4、§5.10、§5.11.1、§5.11.2；
  - `06` §6.1.1、§6.1.4、§6.1.6、§6.2.1、§6.2.3、§6.2.4、§6.3、§6.4.3、§6.4.7；`07` §7.3.2；`08` §8.4、§8.8；`09` §9.11；
  - `10` §10.3.1、§10.6.2、§10.7.1、§10.8.3、§10.8.4、§10.16.2；`11` §11.4、§11.7.1、§11.8.2、§11.9；
  - `12` §12.6.2、§12.6.4、§12.12；`14` §14.2、§14.3.4、§14.8；`16` §16.1.7、§16.1.13、§16.1.14。
  - 改正五处：ADR-212 初稿把 “可以从 events 完全重建” 写作 `06` §6.2.3（实在 §6.2.1），把观察 7 的 drain 行写作 §6.1.3（实在 §6.1.4）、介入一行写作 `04` §4.2（实在 §4.2.2）、暂停中一行写作 `12` §12.6.5（实在 §12.6.4），把改动区块写作 `04` §4.4（实在 §4.5.2）；`04` 新增的未送达字形引用起初写作 `12` §12.4，改为 §12.6.2。
- **Pi 行号**：ADR-212 初稿的 `core/resource-loader.ts:527`、`:550` 核对后为 `:529`（`packageManager.resolve()`）与 `:553`（`enabledExtensions`）。
- **SP6b 批次表**：起初把移出 B3 的七个用例写在 B3 用例列的括注中，(u) 的解析器会把它们同时算进 B3 与 B4；改为写在 B3 的依赖列，用例列只留 G18、G26b、G29、G31。

与第 83 轮相比的计数变化：
- ADR 211 → 212；section_refs 7261 → 7406。
- (e) 203 → 206 对：ADR-212 Amends ADR-211、ADR-208、ADR-066，三者标题都已补 “Amended by ADR-212”。
- (D) 300 → 309 个短语：`16` §16.1.13 新增第 84 轮一行，含 9 个可检短语，命中 0。
- (d) 仍为 0：新增的一项在正文中只出现在 M2 标记旁。
- (z′) 47 → 53 处、未标 0：新增的按行检查共 6 处（`06` §6.1.4 L90、§6.1.6 L146，`04` §4.16 F12 L1416、§4.18.3 L1510 与 L1513，`12` §12.6.4 L388）。其中 `04` L1513 的 “回退” 指重建来源的回落，不是回退命令，该行本就带 M2 标记，所以不误报。
- (w) 仍为 0：新增的子类型子检查覆盖 `08` 中 5 个 `stalled` 子类型（`satellite_missing`、`human_checkout_lost`、`prepare_failed`、`engine_error`、`idle_without_submit`），都已登记。
- (u) 仍为 0：G11、G19、G21、G23、G33、G35、G35b 从 B3 移到 B4，批次表与 SP6b 行的用例集合一致。
- (i) 仍为 31 个事件名：`checkpoint.created` 只补全载荷。
- (v) 仍为 97 条命令：没有增删命令（“人关闭” 映射到已有的 `comment.edit`）。
- (r′) 仍为 53 对、差异 0：`07` §7.3.2 两处与 `10` §10.7.1 第 1 步互指，取值一致。
- (C) 仍为 19 行、0，已核对到第 84 轮的数值：
  - W6 9.19 → 9.18（Agent），W10 10.51 → 10.52（安全 7.91 → 7.92），W12 9.14 → 9.15（设计 7.53 → 7.54），W16 3.10 → 3.12，功能合计 123.15；
  - 角色容量表 Agent 26.54 / 26.14 / 28.75，设计 28.79 / 25.79 / 28.37，安全 13.63 / 13.13 / 14.44 / 28.88；范围句 “第 84 轮后…28.37–28.88”；
  - 结论与甘特图的余量：Agent 0.25、设计 0.63、安全 0.12；
  - 增人算式 28.75 + 28.88 + 28.64 + 28.37 + 14.44 = 129.08，T = 131.08 / 5.5 = 23.83；
  - §14.8：Agent 行 W6（9.18）、合计 26.54；设计行 W12（7.54）、W16（3.12）、合计 28.79；安全行 W10（7.92）、合计 13.63；
  - ADR-133 第 84 轮补记的角色合计与余量。
- 其余各项计数不变，全部为 0。

```
headings=566 adrs=212 section_refs=7406 problems=0
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
(e) ADR back-markers: 206 supersede/amend pairs, missing=0
(r′) mutual “一致/唯一定义” claims: 53 pairs, differing values=0
(q) verbatim-quote mismatches=0
(p) 16 §16.8 copy cells without 规则 5: 10 copy cells, missing=0, UNPARSABLE=0
(P) 16 §16.8 role-column copies (per column): 8 role cells with copies, missing=0, UNPARSABLE=0
(i) event names in per-document event tables vs 16 §16.1.14: 31 names, not in index=0, UNPARSABLE=0
(D) superseded phrases of 16 §16.1.13 outside history: 309 phrases, hits=0, UNPARSABLE=0
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
