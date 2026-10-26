# 第 105 轮 lint

`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH` → exit 0（ADR-233 落地后；headings 566，ADR 233，section_refs 9935，problems 0）。从 `docs/` 运行。

本轮没有改动 lint 脚本（`reviews/lint/xref.py`）。

评审 §3.1 的建议按下面处理：
- **观察 4 的卡片后缀检查**（“`14` 中断言的反引号卡片文字应是 `12` §12.6.5 某一行的完整写法或其前缀加后缀”）：不加。它要理解测试的前提（哪些原因叠加），属于语义；本轮把 G35e (q) 多原因一组的期望写全为 `已暂停 · 磁盘已满 · 另有：硬预算上限`，并统一 `硬预算上限` 的写法，旧写法登入 `16` §16.1.13 第 105 轮一行，由 (D) 检查。
- **四条次要条目**：属于语义，lint 不覆盖。被取代的说法一并登入第 105 轮一行（`16` L656），共 13 个短语，(D) 由 608 增到 621。
- 本轮不新增暂停原因、Needs-You kind、`wait_reason` 值、事件类型或命令，所以 (s)、(w)、(w′)、(k′)、(O)、(i)、(v) 的集合不变。`06` §6.2.4 新增的检查 i 只用已有的 `waitReason = slot`。契约测试 C43、C44 的改动都在 `05` §5.11 中，(n) 0。
- (e) 由 282 对增到 284 对：ADR-233 的 “Amends ADR-232、ADR-231” 与两者标题的 “Amended by ADR-233”。
- 中途一次 (t) 报 `OPEN 16:879`：`16` Host 粒度回退规则一行写了 “清单待确认”，改为 “清单确认之前” 后为 0。

写第 105 轮一行之前，逐个检查了候选短语在正文中的出现（与 (D) 同一取法，去掉反引号与星号）：13 个短语在 `00`–`14`、`16`（§16.1.13 之外）与 README 中都为 0。`12` §12.8 的 “在侧栏顶部以一行入口保留” 没有登记：`08` §8.10.5 新的规则 6 用同一句话定义去处，登记会误报。

改动后做了变异检查（在 `/tmp` 的副本上做，正文未改动）：
- **(D)**：在 `05` C43 写回 “Host 环境中没有代理变量时 Tower 不安装分发器”，并在 `06` §6.8 F8 写回 “复查发生过 `ENOSPC` 的卷”，报 `SUPERSEDED_PHRASE 05:1505` 与 `SUPERSEDED_PHRASE 06:1199`（第 105 轮一行，`16:656`）。
- **(C)**：把 `14` W6 改为 9.33，共报 6 项：
  - `TEAM_TABLE 14 §14.8 Agent W6 9.32 ≠ §14.3.4 9.33`；
  - `TEAM_TABLE 14 §14.8 Agent 合计`；
  - `WBS_TOTAL 124.25 ≠ 124.26`；
  - `CAPACITY_TOTAL Agent`；
  - `ADR133_ROLE_TOTAL 15 第 105 轮 Agent`；
  - `ADR133_TOTAL 15 第 105 轮`。

本轮引用的位置都已核对：
- **节号**（lint 的 section_refs 覆盖 `00`–`14`、`16` 与 README）：
  - `00` §0.5.1；`02` §2.4；`03` §3.2.1；`04` §4.6.7、§4.15、§4.18.1、§4.18.3；`05` §5.2、§5.3.3、§5.3.6、§5.5、§5.11.1 D63、D64、C43、C44；
  - `06` §6.1.6、§6.1.9、§6.2.4、§6.7、§6.8 F4b、F6、F7 与 F8；`08` §8.10.5；`10` §10.3.1；`11` §11.7.1；`12` §12.6.4、§12.6.5、§12.8、§12.13.3；
  - `14` §14.3.4、§14.8、G35e (q)、G46 (d) 第九、第十组；`16` §16.1.1、§16.1.13、§16.2.6。
- **Pi 行号**（v1.2.0，`git show v1.2.0:<path>`，`packages/coding-agent/src/` 下，另注 `ai`）：
  - `core/http-dispatcher.ts:2, 4, 5-6, 8-14, 19-35, 52-79, 81-99, 100-112`；`cli/setup.ts:12`；`main.ts:596-597, 874-875`；`rpc-entry.ts:11`；`modes/interactive/interactive-mode.ts:2063, 5014`；
  - `core/settings-manager.ts:11, 147-156, 364-366, 900-901`；`packages/coding-agent/package.json` 的 `undici` 8.10.2；
  - undici 8.10.2 `lib/global.js:14-16`、`lib/dispatcher/client.js:229-230`（本机安装的同一版本）；
  - `core/extensions/types.ts:1814-1817`；`core/agent-session.ts:3496-3505`；`core/model-runtime.ts:526-528, 891-949`；`core/model-registry.ts:194-204`；
  - `core/resolve-config-value.ts:185-196, 221-227`。

```
headings=566 adrs=233 section_refs=9935 problems=0
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
(v) remote-matrix coverage problems=0 (commands in 06 §6.4.3: 99; local-only checked against 06 §6.4.7: 24)
(w) Needs-You kind/dedupe/outcome problems=0
(x) default data vs examples: default-benign targets ['~/.ssh/known_hosts']; problems=0
(w′) pauseReason → Needs-You problems=0
(y) cross-column CHECK vs 16 problems=0
(z) push/PR/remote polling presented as M1=0
(z′) M2 capability phrases in M1 tables: 53 occurrences, unmarked=0, UNPARSABLE=0
(c) continuation literal shape vs 02=0
(d) deleted mechanism names outside history=0
(n) contract-test references=0
(k) 03 §3.2.1 rewrite targets vs 06 §6.4.3=0
(s′) enum values used in rule text / pseudo-code outside the registered set=0
(e) ADR back-markers: 284 supersede/amend pairs, missing=0
(r′) mutual “一致/唯一定义” claims: 65 pairs, differing values=0
(q) verbatim-quote mismatches=0
(p) 16 §16.8 copy cells without 规则 5: 10 copy cells, missing=0, UNPARSABLE=0
(P) 16 §16.8 role-column copies (per column): 8 role cells with copies, missing=0, UNPARSABLE=0
(i) event names in per-document event tables vs 16 §16.1.14: 31 names, not in index=0, UNPARSABLE=0
(i′) full-row and path-list payload events vs the 13 §13.9.1 cap (06 §6.3 rule): 5 events, unhandled=0, UNPARSABLE=0
(D) superseded phrases of 16 §16.1.13 outside history: 621 phrases, hits=0, UNPARSABLE=0
(g) fact/danger glyphs paired with queue/grant/approval in 04/12: 20 glyph lines checked, misuse=0
(o) 16 §16.1 object shapes vs 02: 8 rows compared, 0 unions skipped, differing=0, UNPARSABLE=0
(k′) 03 §3.2.1 resume exits vs 06 goal.resume: 14 reasons with a resume exit, missing=0, UNPARSABLE=0
(r‴) one-sided “只引用本条/本节” claims: 1 enumerating claims, re-enumerations=0
(A) per-process memory budgets 06 §6.1 vs 13 §13.8.1: 7 process rows, problems=0, UNPARSABLE=0
(T) tool kinds (05 §5.6.5, 11 §11.3.4) → 16 §16.1.10 action classes: 9 kinds, problems=0, UNPARSABLE=0
(F) level floors (02 §2.5) enforced in 11 §11.3.5 decide(): 1 floor clauses, problems=0, UNPARSABLE=0
(M) 13 “M1 验收” CI scenarios in 14 §14.3.5 M1 exit: 1 scenarios, missing=0, UNPARSABLE=0
(B) enumerating “run 类阻断” claims vs 16 §16.1.6: 1 claims, differing=0, UNPARSABLE=0
(O) 08 §8.8 one class per exit: 35 rows, problems=0, UNPARSABLE=0
(J) 16 §16.3 keymap (key, scope) pairs: 135 pairs, duplicates=0, UNPARSABLE=0
(H) 04 wireframe key hints vs 16 §16.3: 77 hint keys, problems=0, UNPARSABLE=0
(C) 14 §14.3.4 capacity table vs WBS / margins / 15 ADR-133 addendum: 19 WBS rows, problems=0, UNPARSABLE=0
(t) open markers=0
```
