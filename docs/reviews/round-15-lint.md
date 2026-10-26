# 第 15 轮 lint

`python3 docs/reviews/lint/xref.py --checks rstuvwxyz` → exit 0（主干于 ADR-134–136 落地后运行）。

```
headings=556 adrs=136 section_refs=2908 problems=0
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
(t) open markers=0
```

残留检索：`resumeTo`/`pendingVerify`/`detectedIn`/`applyPendingHandBack` 只出现在 `16` §16.1.13 废弃表与 ADR 历史中。
