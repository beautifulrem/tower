# 第 111 轮 lint

`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH` → exit 0（ADR-239 落地后；headings 566，ADR 239，section_refs 10719，problems 0）。从 `docs/` 运行。

**本轮对 lint 脚本的两处改动**（都是登记，没有放宽任何检查）：
- **(d) DELETED**：新增一项 `time-based deletion / abandon-time write of handback-t1`（ADR-239），严格模式（列入 `DELETED_STRICT`）。它匹配 “`handback-t1` …… 保留到影子删除 / 随影子删除” 与 “放弃时……先写 `refs/tower/<goalId>/handback-t1`”，只允许作为带真实历史标记的历史文字出现。(d) 由 49 项增到 50 项。
- **(r) `an:` 去重键**：08 §8.4 新登记的 `an:{goalId}:tower_goal_handler_error` 加入允许的取值（与第 73 轮登记 `structured_content_dropped` 的做法相同）。不登记时，(r) 把其他文档对它的引用报为与 08 §8.4 矛盾（第一次运行报 6 处）。

各项的变化：
- **(D)**：677 → 691 个短语。第 111 轮一行（`16:662`）登记 14 个被取代的说法，其中包括评审指出的近义写法：“人工编辑检出仍按原路径作为必需路径”“30 天后只保留地标检查点、pin 与 seal ref”“只留地标检查点、pin 与 seal ref”“不经人点击而改名的只有四处”“若可创建且可写”“在写放弃的事务之前，先在影子中写”“Tower 保留一份（目标页写明如何取回）”“你的改动未能保留在目录中，此后不可恢复”“任一 tower-goal 处理器正常完成一次即清零”“工具结果未能脱敏，已隐去”“准备的文件系统错误同样先判可达”“准备与服务的文件系统错误”等。写这一行之前逐个 grep 过：在 `00`–`14`、`16`（§16.1.13 之外）与 README 中都为 0。
- **(z′)**：第一次运行报出 `M2_CAPABILITY_UNMARKED 06 139 回退 + 接管`（观察 1 补入的 “回退位置” 与同行的 “接管物化”相邻）。改写为 “`10` §10.4.3 位置算法第 3 步的 `<wtRoot>`” 后为 0，共 53 处。
- **(e)**：294 → 297 对，即 ADR-239 的 “Amends ADR-238、ADR-237、ADR-222” 与三者标题的 “Amended by ADR-239”。
- **(r′)**：69 对，取值一致。
- **(v)**：仍为 100 条命令、仅本机 25 条。本轮没有新命令；`goal.delete_kept` 只多了可选参数 `handbackT1`，作用域与仅本机不变。
- **(s)**：`prepare_failed` 的来源仍在 6 处，都含 `running` 一组。`02`、`03`、`08`、`06` F4b、`16` §16.1.7 改为引用 `16` §16.1.1，引用句中保留了 `running`（运行中途）一组的提法。
- **(s′)**：新取值 `verify_env_error.stage = baseline` 已在 `16` §16.1.3 登记，规则文字与伪代码中的使用为 0 处越界。
- **(w)、(O)**：新的 Needs-You 条目 `anomaly{tower_goal_handler_error}` 在 `08` §8.4（去重键）与 §8.8（出口 “知悉” → `informative`）各一行，`16` §16.1.7 的 `anomaly` kind 同步；(O) 36 行，每个出口一类。
- **(s) 三方枚举**：`anomaly detectors` 一组 OK（`02` 的检测器注释与 `16` §16.1.6 都含 `tower_goal_handler_error`）。
- **(C)**：WBS 124.54，19 行；W6 9.38、W7 26.83（系统 14.28）；角色容量表（Agent 28.97、系统 29.07（最长）、桌面 29.05、设计 29.06、安全 14.45）、范围句（28.90–29.07）、结论的余量（系统 0.93、Agent 1.03、桌面 0.95、设计 0.94、安全 1.10）、甘特图余量、增人加法式（130.60，T 24.11）、§14.8 与 `15` 第 111 轮补记一致；ADR-038〔当前值〕仍为 39 周、2027-08-06。
- **(i)、(i′)**：事件没有变化，31 个事件名、5 个载荷事件不变，§16.1.14 未改动。
- **(o)、(k′)、(w′)**：对象形状、恢复出口与暂停原因的映射都不变：不新增暂停原因。F13 的第三次仍是 `prepare_failed`，`verify_env_error{stage:"baseline"}` 沿用已有的 `verify_env_error` 暂停与 `verify_env` 条目。

**变异检查**（在 `/tmp` 的副本上运行副本中的脚本，正文未改动；两批，副本都已删除）：
- **第一批**：
  - (D)：把 `06` §6.4.3 `project.relocate` 行末句改回 “人工编辑检出仍按原路径作为必需路径”，报 `SUPERSEDED_PHRASE 06:921`（`16:662`）。这是第 111 轮评审指出 (D) 抓不到的那句，现在能抓到。
  - (D)：在 `16` §16.2.6 检查点保留一行写回 “归档或放弃 30 天后只留地标检查点、pin 与 seal ref”，报 `SUPERSEDED_PHRASE 16:862`。
  - (d)：把 `10` §10.3.2 改回 “`handback-t1` 保留到影子删除”，报 `DELETED_NAME time-based deletion / abandon-time write of handback-t1 10:462`。
  - 退出码 1。
- **第二批**：
  - (C)：把 `14` W7 改为 26.84（系统 14.29），报 6 项：`TEAM_TABLE 14 §14.8 系统 W7`、`TEAM_TABLE 14 §14.8 系统 合计`、`WBS_TOTAL 124.54 ≠ 124.55`、`CAPACITY_TOTAL 系统`、`ADR133_ROLE_TOTAL 15 第 111 轮 系统`、`ADR133_TOTAL 15 第 111 轮`。
  - (e)：删去 ADR-238 标题的 “Amended by ADR-239”，报 `NO_BACK_MARKER ADR-238`。
  - 退出码 1。

本轮引用的位置都已核对：
- **节号**：由 lint 的 section_refs 覆盖 `00`–`14`、`16` 与 README，共 10719 处，problems 0。
- **Pi 行号**（v1.2.0，`git show v1.2.0:<path>`，`packages/` 下）：
  - `coding-agent/src/core/extensions/runner.ts:1206-1209, 1223-1232, 1240-1246`；
  - `coding-agent/src/core/agent-session.ts:714-720`；
  - `agent/src/agent-loop.ts:600-613, 744-776, 890, 919-928, 930-944`；
  - `agent/src/agent.ts:253`；
  - `coding-agent/src/core/tools/bash.ts:342-343`、`truncate.ts:15-17`、`edit.ts:70-77`；
  - `coding-agent/src/core/http-dispatcher.ts:19-35`。

```
headings=566 adrs=239 section_refs=10719 problems=0
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
(v) remote-matrix coverage problems=0 (commands in 06 §6.4.3: 100; local-only checked against 06 §6.4.7: 25)
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
(e) ADR back-markers: 297 supersede/amend pairs, missing=0
(r′) mutual “一致/唯一定义” claims: 69 pairs, differing values=0
(q) verbatim-quote mismatches=0
(p) 16 §16.8 copy cells without 规则 5: 10 copy cells, missing=0, UNPARSABLE=0
(P) 16 §16.8 role-column copies (per column): 8 role cells with copies, missing=0, UNPARSABLE=0
(i) event names in per-document event tables vs 16 §16.1.14: 31 names, not in index=0, UNPARSABLE=0
(i′) full-row and path-list payload events vs the 13 §13.9.1 cap (06 §6.3 rule): 5 events, unhandled=0, UNPARSABLE=0
(D) superseded phrases of 16 §16.1.13 outside history: 691 phrases, hits=0, UNPARSABLE=0
(g) fact/danger glyphs paired with queue/grant/approval in 04/12: 20 glyph lines checked, misuse=0
(o) 16 §16.1 object shapes vs 02: 8 rows compared, 0 unions skipped, differing=0, UNPARSABLE=0
(k′) 03 §3.2.1 resume exits vs 06 goal.resume: 14 reasons with a resume exit, missing=0, UNPARSABLE=0
(r‴) one-sided “只引用本条/本节” claims: 1 enumerating claims, re-enumerations=0
(A) per-process memory budgets 06 §6.1 vs 13 §13.8.1: 7 process rows, problems=0, UNPARSABLE=0
(T) tool kinds (05 §5.6.5, 11 §11.3.4) → 16 §16.1.10 action classes: 9 kinds, problems=0, UNPARSABLE=0
(F) level floors (02 §2.5) enforced in 11 §11.3.5 decide(): 1 floor clauses, problems=0, UNPARSABLE=0
(M) 13 “M1 验收” CI scenarios in 14 §14.3.5 M1 exit: 1 scenarios, missing=0, UNPARSABLE=0
(B) enumerating “run 类阻断” claims vs 16 §16.1.6: 1 claims, differing=0, UNPARSABLE=0
(O) 08 §8.8 one class per exit: 36 rows, problems=0, UNPARSABLE=0
(J) 16 §16.3 keymap (key, scope) pairs: 135 pairs, duplicates=0, UNPARSABLE=0
(H) 04 wireframe key hints vs 16 §16.3: 77 hint keys, problems=0, UNPARSABLE=0
(C) 14 §14.3.4 capacity table vs WBS / margins / 15 ADR-133 addendum: 19 WBS rows, problems=0, UNPARSABLE=0
(t) open markers=0
```
