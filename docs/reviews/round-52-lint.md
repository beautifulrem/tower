# 第 52 轮 lint

`--checks rstuvwxyzckdnSeRqpo` → exit 0（ADR-178/179 落地后；新增 (p) 副本行白名单与凭据判定、(o) `16` 字段形状与 `02` 逐键比较）。

```
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
(e) ADR back-markers: 148 supersede/amend pairs, missing=0
(r′) mutual “一致/唯一定义” claims: 34 pairs, differing values=0
(q) verbatim-quote mismatches=0
(p) 16 §16.8 copy rows without 白名单/凭据判定: 8 copy rows, missing=0, UNPARSABLE=0
(o) 16 §16.1 object shapes vs 02: 7 rows compared, 0 unions skipped, differing=0, UNPARSABLE=0
(t) open markers=0
```
