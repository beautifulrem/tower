# 第 79 轮 lint

`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH` → exit 0（ADR-207 落地后；headings 566，ADR 207，section_refs 6828，problems 0）。从 `docs/` 与从 `/Volumes/Remi/Project` 运行结果相同。

中途命中并改正的一处：
- 首次运行时 (D) 报 3 处 `SUPERSEDED_PHRASE`（`03:96`、`06:64`、`08:387` 的 “上一次崩溃”）。原因是 `16` §16.1.13 第 79 轮一行把这个词加了引号，而它在现行规则中仍然使用，只是取值改了。已去掉引号，改为不加引号的描述，(D) 归零。
- 人工复查节号：新增引用（`06` §6.1.4、§6.1.6、§6.4.3、§6.8，`08` §8.4、§8.6.3、§8.6.5、§8.8，`09` §9.4.1、§9.4.2、§9.4.3、§9.5.4，`04` §4.2.4、§4.6.7、§4.15.1、§4.18.3，`10` §10.1.2、§10.3.1、§10.5、§10.6、§10.7.1、§10.8.1、§10.8.4、§10.10，`11` §11.8.1，`16` §16.1.7、§16.1.13）逐条核对所在小节。

本轮没有改动 lint。
- 评审 §3.1 建议的 (r′) 补对没有实现。原因：`10` §10.1.2 现在只引用 §10.7.1，不再自称快照排除的唯一定义，两处不再构成 “互相声称一致” 的一对。
- 改由 (D) 拦截旧的穷尽说法：`16` §16.1.13 第 79 轮一行登记了 “只排除名为”“只去除名为”“不再有排除列表”。它们在历史之外重现就会报错，这就是 “排除列表只在一处出现” 的检查。

与第 78 轮相比的计数变化：
- ADR 206 → 207；section_refs 6733 → 6828。
- (e) 196 → 197 对：ADR-207 Amends ADR-206，ADR-206 标题已补 “Amended by ADR-207”。
- (D) 246 → 254 个短语：`16` §16.1.13 新增第 79 轮一行，含 8 个可检短语：
  - “只排除名为”；
  - “不再有排除列表”；
  - “只去除名为”；
  - “所有活跃卫星”；
  - “并要求用 read 加载”；
  - “卫星整体置为”；
  - “被忽略的文件（依赖目录、.env.local 等）不同步”；
  - “工作目录整体置为”。
  - 已逐条 grep 核对：除 `15`（历史）与 §16.1.13 本行外没有出现。
- (O) 仍为 33 行、0：`08` §8.8 F7 一行新增 “只有 ③ 而 Run 没有以 `error` 结束 → `obsolete`”，在另一列；“重试” 与探测恢复仍为 `actionable`，没有出口跨两列。
- (w′) 仍为 0：`16` §16.1.7 映射行中 `prepare_failed` 的补充写在括号内，kind 仍为 `stalled`。
- (C) 仍为 19 行、0，并且已核对到第 79 轮的数值：
  - W13 6.88 → 6.89、W16 3.03 → 3.04（设计），功能合计 122.98；
  - 角色容量表设计行 28.65 / 25.65 / 28.22；冻结前所需范围句 “第 79 轮后…28.22–28.88”；
  - 结论余量设计 0.78；甘特设计行余量 0.78；
  - 增人算式 28.74 + 28.88 + 28.64 + 28.22 + 14.42 = 128.90，T = 130.90 / 5.5 = 23.80；
  - §14.8 设计行 W13（6.89）、W16（3.04）、合计 28.65；
  - ADR-133 第 79 轮补记的角色合计与余量。
- 其余各项计数不变，全部为 0。

```
headings=566 adrs=207 section_refs=6828 problems=0
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
(e) ADR back-markers: 197 supersede/amend pairs, missing=0
(r′) mutual “一致/唯一定义” claims: 50 pairs, differing values=0
(q) verbatim-quote mismatches=0
(p) 16 §16.8 copy cells without 规则 5: 10 copy cells, missing=0, UNPARSABLE=0
(P) 16 §16.8 role-column copies (per column): 8 role cells with copies, missing=0, UNPARSABLE=0
(i) event names in per-document event tables vs 16 §16.1.14: 31 names, not in index=0, UNPARSABLE=0
(D) superseded phrases of 16 §16.1.13 outside history: 254 phrases, hits=0, UNPARSABLE=0
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
