# 第 76 轮 lint

`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH` → exit 0（ADR-204 落地后；headings 566，ADR 204，section_refs 6526，problems 0）。第一次完整运行即为 0，中途没有命中需要改正。

本轮对 lint 的改动：`xref.py` 的 DELETED 补一项（ADR-204，“case-sensitive protected-name match”），由 (d) 检查，出现时须带历史标记（DEL_OK）。它实现评审 §3.1 的第二条建议，并按 ADR-204 推广到受保护名字：
- 对受保护名字 `.pi`、`.agents` 用区分大小写的 git pathspec 的写法（`-- .pi .agents`）。信任复核现在对完整差异按 `16` §16.1.12 的比较规则筛选。
- 用 `AGENTS*.md/CLAUDE.md`（含带反引号的 `AGENTS*.md`/`CLAUDE.md`）通配识别上下文文件的写法。识别改用 `contextFiles()` 或 `16` §16.1.12 的两个模式。
- 已对旧写法做过正向核对：三种旧写法都会命中；现行写法 `**/AGENTS*.md`、`**/CLAUDE.md` 不命中。`15`（ADR 历史）与 `16` §16.1.13 的旧说法列豁免，与其他 DELETED 项相同。
- 评审 §3.1 的第一条建议（`symlink_escape` 的旧说法）由 (D) 实现：`16` §16.1.13 第 76 轮一行带短语“pin 中新增或改变的符号链接”。

与第 75 轮相比的计数变化：
- ADR 203 → 204；section_refs 6401 → 6526。
- (e) 192 → 194 对：ADR-204 Amends ADR-203、ADR-202，两者标题已补 “Amended by ADR-204”。
- (D) 221 → 232 个短语：`16` §16.1.13 新增第 76 轮一行，含 11 个短语。其中有 `symlink_escape` 的旧规则、祖先 `.agents/skills` 的旧范围、`engine_crash` 条目时机、“稍后”分区、导出目标、回退差异、“双保险”、准备阶段旧词表与 `03` 的旧摘要。
- (r′) 53 → 50 对：几处互相引用的子句改写或删除后不再成对，主要是 `12` §12.6.4 那句不成立的“子状态词表与 `08` §8.6.5、`07` §7.4.3 一致”（评审 §5 观察 7）。其余仍为 0 差异。
- (C) 仍为 19 行、0：W10 10.49 → 10.50（安全 7.89 → 7.90），功能合计 122.94；角色容量表、结论余量、甘特安全行、增人算式、§14.8 团队表与 ADR-133 第 76 轮补记一致。
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
(e) ADR back-markers: 194 supersede/amend pairs, missing=0
(r′) mutual “一致/唯一定义” claims: 50 pairs, differing values=0
(q) verbatim-quote mismatches=0
(p) 16 §16.8 copy cells without 规则 5: 10 copy cells, missing=0, UNPARSABLE=0
(P) 16 §16.8 role-column copies (per column): 8 role cells with copies, missing=0, UNPARSABLE=0
(i) event names in per-document event tables vs 16 §16.1.14: 31 names, not in index=0, UNPARSABLE=0
(D) superseded phrases of 16 §16.1.13 outside history: 232 phrases, hits=0, UNPARSABLE=0
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
