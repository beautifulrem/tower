# 第 17 轮 lint

`python3 docs/reviews/lint/xref.py --checks rstuvwxyzckd` → exit 0（ADR-140–143 落地后；新增 (d)：已删除机制的名字只允许出现在 `15`、`16` 废弃表与历史文字中；(k) 改为双向比对）。主干补齐了 `03` §3.2.1 中 `resume`/`request_changes`/`retry_verify`/`revert_external_change` 的改写说明。

```
headings=557 adrs=143 section_refs=2999 problems=0
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
(d) deleted mechanism names outside history=0
(k) 03 §3.2.1 rewrite targets vs 06 §6.4.3=0
(t) open markers=0
```
