# 第 20 轮 lint

`python3 docs/reviews/lint/xref.py --checks rstuvwxyzckdnSeRq` → exit 0（ADR-146 落地、ADR-142/144/145 加反向标记后）。

```
Checkpoint.author	OK	
anomaly detectors	OK	
verifyOrigin	OK	
NeedsYouItem.kind	OK	
(u) SP6b batch-table disagreements=0
(v) remote-matrix coverage problems=0 (commands in 06 §6.4.3: 80)
(w) Needs-You kind/dedupe/outcome problems=0
(x) default data vs examples: default-benign targets ['~/.ssh/known_hosts']; problems=0
(w′) pauseReason → Needs-You problems=0
(y) cross-column CHECK vs 16 problems=0
(z) push/PR/remote polling presented as M1=0
(c) continuation literal shape vs 02=0
(d) deleted mechanism names outside history=0
(n) contract-test references=0
(k) 03 §3.2.1 rewrite targets vs 06 §6.4.3=0
(s′) enum values used in rule text / pseudo-code outside the registered set=0
(e) ADR back-markers: 93 supersede/amend pairs, missing=0
(r′) mutual “一致/唯一定义” claims: 26 pairs, differing values=0
(q) verbatim-quote mismatches=0
(t) open markers=0
```
