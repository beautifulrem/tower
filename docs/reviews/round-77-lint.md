# 第 77 轮 lint

`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH` → exit 0（ADR-205 落地后；headings 566，ADR 205，section_refs 6622，problems 0）。

中途命中并改正的有两处：
- (D)：`16` §16.1.13 第 77 轮一行起初把“添加项目时计算一次”列为旧说法，而它在 `10` §10.4.3 仍正确描述位置选择算法。改为描述旧规则本身（只比较仓库根以上、只在强制回退时计算），不再引用该短语。
- section_refs：ADR-205 正文引用了不存在的 `05` §5.13，改为 §5.11.1。随后人工复查同一段的节号，另有四处虽存在但指错（monorepo 一行在 `10` §10.14 而非 §10.13，T4 在 `11` §11.12，`12` 的“推导为 `unresponsive`”一句两处在 §12.4.3），一并改正。

本轮对 lint 的改动：(w′) 补反方向，实现评审 §3.1 的建议。
- `16` §16.1.7 映射到某个 Needs-You kind 的暂停原因，在 `12` §12.6.5 的某一行须带 `◆`，或在该节导言中列为例外（新问题类型 `KIND_WITHOUT_DIAMOND`）。
- 已正向核对：把 `provider_unavailable` 一行临时改回 `◇` 时报 `KIND_WITHOUT_DIAMOND provider_unavailable`；恢复后为 0。
- `16` §16.1.7 映射行的说明同步写明反方向。

与第 76 轮相比的计数变化：
- ADR 204 → 205；section_refs 6526 → 6622。
- (e) 194 → 195 对：ADR-205 Amends ADR-204，ADR-204 标题已补 “Amended by ADR-205”。
- (D) 232 → 239 个短语：`16` §16.1.13 新增第 77 轮一行，含 7 个短语：`engine_crash` 条目的旧分支、`provider_unavailable` 的旧例外、回退差异的旧比较范围与去向、`05` G31 的旧写法、本地文件的旧建议、监视候选集的旧写法。
- (C) 仍为 19 行、0：W16 3.01 → 3.02（设计），功能合计 122.95；角色容量表设计行、冻结前所需范围句、结论余量、甘特设计行、增人算式、§14.8 设计行与 ADR-133 第 77 轮补记一致。
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
(e) ADR back-markers: 195 supersede/amend pairs, missing=0
(r′) mutual “一致/唯一定义” claims: 50 pairs, differing values=0
(q) verbatim-quote mismatches=0
(p) 16 §16.8 copy cells without 规则 5: 10 copy cells, missing=0, UNPARSABLE=0
(P) 16 §16.8 role-column copies (per column): 8 role cells with copies, missing=0, UNPARSABLE=0
(i) event names in per-document event tables vs 16 §16.1.14: 31 names, not in index=0, UNPARSABLE=0
(D) superseded phrases of 16 §16.1.13 outside history: 239 phrases, hits=0, UNPARSABLE=0
(g) fact/danger glyphs paired with queue/grant/approval in 04/12: 20 glyph lines checked, misuse=0
(o) 16 §16.1 object shapes vs 02: 8 rows compared, 0 unions skipped, differing=0, UNPARSABLE=0
(k′) 03 §3.2.1 resume exits vs 06 goal.resume: 12 reasons with a resume exit, missing=0, UNPARSABLE=0
(r‴) one-sided “只引用本条/本节” claims: 1 enumerating claims, re-enumerations=0
(A) per-process memory budgets 06 §6.1 vs 13 §13.8.1: 7 process rows, problems=0, UNPARSABLE=0
(T) tool kinds (05 §5.6.5, 11 §11.3.4) → 16 §16.1.10 action classes: 9 kinds, problems=0, UNPARSABLE=0
(F) level floors (02 §2.5) enforced in 11 §11.3.5 decide(): 1 floor clauses, problems=0, UNPARSABLE=0
(M) 13 “M1 验收” CI scenarios in 14 §14.3.5 M1 exit: 1 scenarios, missing=0, UNPARSABLE=0
(B) enumerating “run 类阻断” claims vs 16 §16.1.6: 1 claims, differing=0, UNPARSABLE=0
(O) 08 §8.8 one class per exit: 32 rows, problems=0, UNPARSABLE=0
(J) 16 §16.3 keymap (key, scope) pairs: 134 pairs, duplicates=0, UNPARSABLE=0
(H) 04 wireframe key hints vs 16 §16.3: 77 hint keys, problems=0, UNPARSABLE=0
(C) 14 §14.3.4 capacity table vs WBS / margins / 15 ADR-133 addendum: 19 WBS rows, problems=0, UNPARSABLE=0
(t) open markers=0
```
