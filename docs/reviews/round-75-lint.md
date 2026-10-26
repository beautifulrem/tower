# 第 75 轮 lint

`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH` → exit 0（ADR-203 落地后；headings 566，ADR 203，section_refs 6401，problems 0）。

本轮对 lint 的改动：`xref.py` 的 DELETED 补一项（ADR-203），由 (d) 检查，出现时须带历史标记（DEL_OK）。它实现评审 §3.1 的建议“列出上下文文件名的句子须与唯一定义相同”：
- 不完整的上下文文件名清单：`AGENTS.md`/`AGENTS.override.md`/`CLAUDE.md` 三个并列；`AGENTS.override.md` → `AGENTS.md` → `CLAUDE.md` 的顺序写法；`**/AGENTS.md`、`**/AGENTS.override.md` 的并列。
- 完整清单只写在 `16` §16.1.12“上下文文件名”一行（唯一定义）与 ADR-203；其余位置引用该行。
- 已用三种旧写法做过正向核对（会命中）。`15`（ADR 历史）与 `16` §16.1.13 的旧说法列豁免，与其他 DELETED 项相同。

与第 74 轮相比的计数变化：
- ADR 202 → 203；section_refs 6334 → 6401。
- (e) 190 → 192 对：ADR-203 Amends ADR-202、ADR-091，两者标题已补 “Amended by ADR-203”。
- (D) 220 → 221 个短语：`16` §16.1.13 新增第 75 轮一行，短语“全局与受信任项目”（评审 §5 观察 1 建议加入 (D)）。
- (C) 仍为 19 行、0：W10 10.48 → 10.49（安全 7.88 → 7.89），功能合计 122.93，角色容量表、结论余量、甘特安全行、增人算式、§14.8 团队表与 ADR-133 第 75 轮补记一致。
- 其余各项计数不变，全部为 0。

中途一次 (r) 命中已改正：`16` 新行起初复述了 `10` §10.1.2 名字比较规则的步骤（“NFKC、大小写折叠”），被 ADR-120 的唯一定义检查拦下；现只引用 `10` §10.1.2。

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
(e) ADR back-markers: 192 supersede/amend pairs, missing=0
(r′) mutual “一致/唯一定义” claims: 53 pairs, differing values=0
(q) verbatim-quote mismatches=0
(p) 16 §16.8 copy cells without 规则 5: 10 copy cells, missing=0, UNPARSABLE=0
(P) 16 §16.8 role-column copies (per column): 8 role cells with copies, missing=0, UNPARSABLE=0
(i) event names in per-document event tables vs 16 §16.1.14: 31 names, not in index=0, UNPARSABLE=0
(D) superseded phrases of 16 §16.1.13 outside history: 221 phrases, hits=0, UNPARSABLE=0
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
