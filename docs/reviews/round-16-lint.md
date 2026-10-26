# 第 16 轮 lint

`python3 docs/reviews/lint/xref.py --checks rstuvwxyzck` → exit 0（ADR-137–139 落地后）。新增检查：(c) Continuation 字面形状与 `02` 一致；(k) `03` §3.2.1 改写目标与 `06` §6.4.3 一致；(z) 扩展到 `00` 全文与 `03` §3.2。

```
headings=556 adrs=139 section_refs=2957 problems=0
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
(u) SP6b batch-table disagreements=0
(v) remote-matrix coverage problems=0 (commands in 06 §6.4.3: 79)
(w) Needs-You kind/dedupe/outcome problems=0
(x) default data vs examples: default-benign targets ['~/.ssh/known_hosts']; problems=0
(w′) pauseReason → Needs-You problems=0
(y) cross-column CHECK vs 16 problems=0
(z) push/PR/remote polling presented as M1=0
(c) continuation literal shape vs 02=0
(k) 03 §3.2.1 rewrite targets vs 06 §6.4.3=0
(t) open markers=0
```
