# 第 78 轮 lint

`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH` → exit 0（ADR-206 落地后；headings 566，ADR 206，section_refs 6733，problems 0）。

中途命中并改正的有两处：
- 首次运行在 ADR-206 写入之前，各处新增的 “ADR-206” 引用报 `NO_ADR`（41 处），写入 ADR-206 后为 0。
- 人工复查节号：ADR-206 正文起初把交还对话框一句记为 `04` §4.6，实际在 §4.6.7，已改正。其余新增引用（`06` §6.1.3、§6.1.6，`07` §7.4.1、§7.4.3，`08` §8.1、§8.4、§8.8，`09` §9.4.3、§9.11，`11` §11.6.2，`12` §12.6.5，`16` §16.1.1、§16.1.7、§16.3）逐条核对所在小节。

本轮没有改动 lint。评审 §3.1 建议的 (w) 扩展（`06` §6.8 F 表 “用户可见” 一列写 Needs-You 的行须有对应的 kind）未实现；F7 这一行由 `08` §8.4 的登记关闭。

与第 77 轮相比的计数变化：
- ADR 205 → 206；section_refs 6622 → 6733。
- (e) 195 → 196 对：ADR-206 Amends ADR-205，ADR-205 标题已补 “Amended by ADR-206”。
- (D) 239 → 246 个短语：`16` §16.1.13 新增第 78 轮一行，含 7 个可检短语：
  - “不再被 git 忽略，本次未复制”；
  - “该路径被 git 忽略，不改变指纹与 diff”；
  - “不含播种的本地文件”；
  - “进入这一暂停时 Pi 的重试已耗尽”；
  - “第二次崩溃起改为等待人工处理”；
  - “重启期间显示”；
  - “添加项目时建议先把它加入”。
  - 已逐条 grep 核对：除 `15`（历史）与 §16.1.13 本行外没有出现。
- (k′) 12 → 14 个原因：`03` §3.2.1 的 `app_quit`、`engine_crash` 一行写出了 `resume` 出口，两者都在 `06` `goal.resume` 的可解除清单中。
- (O) 32 → 33 行：`08` §8.8 新增认证过期（F7）一行，“重试”与探测恢复为 `actionable`，“放弃”为 `informative`，没有出口跨两列。
- (J) 134 → 135 对：`16` §16.3 的 `/` 一行补 “记忆” 作用域，无重复。
- (w) 仍为 0：`08` §8.4 新增的 `stalled`（子类型 `engine_error`）行在 §8.8 有同 kind、同子类型的一行；前缀 `st` 只属于 `stalled`。
- (C) 仍为 19 行、0，并且已核对到第 78 轮的数值：
  - W16 3.02 → 3.03（设计），功能合计 122.96；
  - 角色容量表设计行 28.63 / 25.63 / 28.19；冻结前所需范围句 “第 78 轮后…28.19–28.88”；
  - 结论余量设计 0.81；甘特设计行余量 0.81；
  - 增人算式 28.74 + 28.88 + 28.64 + 28.19 + 14.42 = 128.87，T = 130.87 / 5.5 = 23.79；
  - §14.8 设计行 W16（3.03）、合计 28.63；
  - ADR-133 第 78 轮补记的角色合计与余量。
  - 若 (C) 仍在读第 77 轮的数值，设计 28.62 ≠ 28.63 会报错，所以它确实比较了新值。
- 其余各项计数不变，全部为 0。

```
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
(v) remote-matrix coverage problems=0 (commands in 06 §6.4.3: 96)
(w) Needs-You kind/dedupe/outcome problems=0
(x) default data vs examples: default-benign targets ['~/.ssh/known_hosts']; problems=0
(w′) pauseReason → Needs-You problems=0
(y) cross-column CHECK vs 16 problems=0
(z) push/PR/remote polling presented as M1=0
(z′) M2 capability phrases in M1 tables: 35 occurrences, unmarked=0, UNPARSABLE=0
(c) continuation literal shape vs 02=0
(d) deleted mechanism names outside history=0
(n) contract-test references=0
(k) 03 §3.2.1 rewrite targets vs 06 §6.4.3=0
(s′) enum values used in rule text / pseudo-code outside the registered set=0
(e) ADR back-markers: 196 supersede/amend pairs, missing=0
(r′) mutual “一致/唯一定义” claims: 50 pairs, differing values=0
(q) verbatim-quote mismatches=0
(p) 16 §16.8 copy cells without 规则 5: 10 copy cells, missing=0, UNPARSABLE=0
(P) 16 §16.8 role-column copies (per column): 8 role cells with copies, missing=0, UNPARSABLE=0
(i) event names in per-document event tables vs 16 §16.1.14: 31 names, not in index=0, UNPARSABLE=0
(D) superseded phrases of 16 §16.1.13 outside history: 246 phrases, hits=0, UNPARSABLE=0
(g) fact/danger glyphs paired with queue/grant/approval in 04/12: 20 glyph lines checked, misuse=0
(o) 16 §16.1 object shapes vs 02: 8 rows compared, 0 unions skipped, differing=0, UNPARSABLE=0
(k′) 03 §3.2.1 resume exits vs 06 goal.resume: 14 reasons with a resume exit, missing=0, UNPARSABLE=0
(r‴) one-sided “只引用本条/本节” claims: 1 enumerating claims, re-enumerations=0
(A) per-process memory budgets 06 §6.1 vs 13 §13.8.1: 7 process rows, problems=0, UNPARSABLE=0
(T) tool kinds (05 §5.6.5, 11 §11.3.4) → 16 §16.1.10 action classes: 9 kinds, problems=0, UNPARSABLE=0
(F) level floors (02 §2.5) enforced in 11 §11.3.5 decide(): 1 floor clauses, problems=0, UNPARSABLE=0
(M) 13 “M1 验收” CI scenarios in 14 §14.3.5 M1 exit: 1 scenarios, missing=0, UNPARSABLE=0
(B) enumerating “run 类阻断” claims vs 16 §16.1.6: 1 claims, differing=0, UNPARSABLE=0
(O) 08 §8.8 one class per exit: 33 rows, problems=0, UNPARSABLE=0
(J) 16 §16.3 keymap (key, scope) pairs: 135 pairs, duplicates=0, UNPARSABLE=0
(H) 04 wireframe key hints vs 16 §16.3: 77 hint keys, problems=0, UNPARSABLE=0
(C) 14 §14.3.4 capacity table vs WBS / margins / 15 ADR-133 addendum: 19 WBS rows, problems=0, UNPARSABLE=0
(t) open markers=0
```
