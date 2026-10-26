# 第 86 轮 lint

`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH` → exit 0（ADR-214 落地后；headings 566，ADR 214，section_refs 7645，problems 0；含第 86 轮后续修订：stdio MCP 服务器的空工作目录）。从 `docs/` 与从 `/Volumes/Remi/Project` 运行，输出逐行相同（`diff` 无差异）。

本轮改动 lint 两处（`reviews/lint/xref.py`）：
- **(d) 新增两项**（`DELETED` 末尾，ADR-214）：
  - Supervisor 全局根查询自己的 10 s 时限（R86-D11-02），正则 `查询限时 10 s|Supervisor 自己的清单查询限时`；
  - “经人确认的目录”（R86-D5-01）。
  - 正则起初写作 `限时 10 s`，命中 `14` 第 85 轮增量段（历史，窗口内没有历史标记）与 `16` §16.1.13 第 85 轮一行的新说法列；收窄为上面的写法后为 0。
  - **有效性核对**：临时把 `05` §5.10 改回 “Supervisor 的这次查询限时 10 s”、`05` §5.3.6 `PATH` 行改回 “经人确认的目录”，(d) 各报 1 处 `DELETED_NAME`（05:1332、05:459），(D) 同时报 1 处；恢复后为 0。
- **(i′) 扩为路径集合通则**（评审 §3.1 第一条建议，`check_i2`）：
  - 唯一定义：`06` §6.3 “载荷中的路径集合” 一条的 “适用的事件” 列表；
  - 判定：00–14、16 中任何 `x.y{…}` 形式的事件签名（名字在 `16` §16.1.14 索引中），字段含路径数组（`paths`、`*Paths`、`changed`、`skipped`）时必须在该列表中（`PATH_PAYLOAD_UNLISTED`）；列表中的事件必须在索引中，且索引行写明 “16 KB” 与 “`06` §6.3”（`PAYLOAD_CAP_UNHANDLED`）；原有的 “载荷即…” 子检查保留；
  - 结果：4 个事件，未处置 0；
  - **有效性核对**：临时从 `06` 的列表删去 `workspace.paths_restored`，报 2 处 `PATH_PAYLOAD_UNLISTED`（`10`、`16` 中的签名）；临时删去 `16` 该事件旁的上限说明，报 1 处 `PAYLOAD_CAP_UNHANDLED`；恢复后为 0。
- 评审 §3.1 的第二条建议（DDL 每张表必须在例外列表中或有投影到它的事件）**未采用**：正文中没有 “表 ↔ 投影事件” 的机读对照，加这一检查要先新增一张对照表；`06` §6.2.1 改为显式列出四处例外（含运行时表），由 (D) 守住旧说法 “例外只有以下三处”。

中途核对：
- **人工复查节号**：逐条核对新增的引用，都在所指的小节内：`04` §4.10.2、§4.15；`05` §5.3.5、§5.3.6、§5.10；`06` §6.1.1、§6.1.3、§6.2.1、§6.2.4、§6.3、§6.4.3、§6.4.7、§6.6.3；`07` §7.2.4；`08` §8.7.1；`10` §10.3.1、§10.7.1、§10.8.4；`11` §11.3.2、§11.3.4、§11.6.2、§11.7.1、§11.8.2、T4、T16、T23；`13` §13.5、§13.9.1；`14` §14.3.4、§14.8；`16` §16.1.1、§16.1.13、§16.1.14、§16.5、§16.8。
- **Pi 行号**：ADR-214 初稿把 stdio 不重试写作 `:342`、`extensionsOverride` 写作 `:595`、工厂失败写作 `:376-378`/`:408-415`，核对后为 `:343`、`:596`（加载在 `:586`）、`:377-378`、`:348-351`/`:409-416`。
- **(D) 的短语**：第 86 轮一行没有引号包住 “本 Goal 的卫星与 gitdir”（S2 读允许一行仍正确使用这一说法）。临时把 `11` §11.3.4 改回 “代码智能类 MCP 应以卫星为根运行”，(D) 报 1 处；恢复后为 0。

与第 85 轮相比的计数变化：
- ADR 213 → 214；section_refs 7525 → 7645（后续修订前为 7639）。
- (v) 97 → 98 条命令：新增 `engine.reread_login_shell`（`06` §6.4.3 “禁止远程”，`16` §16.5 仅本机一行）。
- (e) 209 → 212 对：ADR-214 Amends ADR-213、ADR-209、ADR-134，三者标题都已补 “Amended by ADR-214”。
- (r′) 53 → 55 对：新增的唯一定义（`05` §5.3.5 stdio 工作目录、`06` §6.3 路径集合）与引用处取值一致。
- (i′) 1 → 4 个事件（见上）。
- (D) 322 → 330 个短语：`16` §16.1.13 新增第 86 轮一行，含 8 个可检短语，命中 0。
- (d) 仍为 0：新增两项在正文中只出现在 `16` §16.1.13 与 `15`。
- (C) 仍为 19 行、0，已核对到第 86 轮的数值：W6 9.22、W12 9.16（设计 7.55）、W16 3.18，功能合计 123.26；角色容量表 Agent 26.58 / 26.18 / 28.80，设计 28.86 / 25.86 / 28.45；范围句 “第 86 轮后…28.45–28.88”；结论与甘特图余量 Agent 0.20、设计 0.55；增人算式 28.80 + 28.88 + 28.64 + 28.45 + 14.44 = 129.21，T = 131.21 / 5.5 = 23.86；§14.8 Agent 合计 26.58、设计合计 28.86；ADR-133 第 86 轮补记的角色合计与余量。
- 其余各项计数不变，全部为 0。

**第 86 轮后续修订（stdio MCP 服务器的空工作目录，ADR-214 原地修订）**：
- 基准由主目录改为 Tower 的空目录 `~/.tower/mcp-cwd/`（`05` §5.3.5 唯一定义；`00`、`06` §6.6.1、`11` §11.3.3 硬底线、§11.3.4、§11.8.2、T4、T16、`14` G10 与 G46 (bk)、`16` §16.1.13、README、C21 同步）。
- **(d) 新增一项**：`以主目录为基准|相对主目录|resolve\(主目录`（本轮中途稿的说法，只能出现在 `15` 与历史中）。**有效性核对**：临时把 `00` §0.5.1 新行改回 “相对主目录”，(d) 报 1 处 `DELETED_NAME`（00:99）；恢复后为 0。
- 重跑全部检查 exit 0，从两个目录运行输出相同；与修订前相比只有 section_refs 7639 → 7645（新增的 `11` §11.3.3、§11.6.2 与 `06` §6.6.1 引用），其余计数不变。
- 人工复查：硬底线列表在 `11` §11.3.3 第 3 条（初稿误写 §11.3.4，已改）。

```
headings=566 adrs=214 section_refs=7645 problems=0
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
(v) remote-matrix coverage problems=0 (commands in 06 §6.4.3: 98)
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
(e) ADR back-markers: 212 supersede/amend pairs, missing=0
(r′) mutual “一致/唯一定义” claims: 55 pairs, differing values=0
(q) verbatim-quote mismatches=0
(p) 16 §16.8 copy cells without 规则 5: 10 copy cells, missing=0, UNPARSABLE=0
(P) 16 §16.8 role-column copies (per column): 8 role cells with copies, missing=0, UNPARSABLE=0
(i) event names in per-document event tables vs 16 §16.1.14: 31 names, not in index=0, UNPARSABLE=0
(i′) full-row and path-list payload events vs the 13 §13.9.1 cap (06 §6.3 rule): 4 events, unhandled=0, UNPARSABLE=0
(D) superseded phrases of 16 §16.1.13 outside history: 330 phrases, hits=0, UNPARSABLE=0
(g) fact/danger glyphs paired with queue/grant/approval in 04/12: 20 glyph lines checked, misuse=0
(o) 16 §16.1 object shapes vs 02: 8 rows compared, 0 unions skipped, differing=0, UNPARSABLE=0
(k′) 03 §3.2.1 resume exits vs 06 goal.resume: 14 reasons with a resume exit, missing=0, UNPARSABLE=0
(r‴) one-sided “只引用本条/本节” claims: 1 enumerating claims, re-enumerations=0
(A) per-process memory budgets 06 §6.1 vs 13 §13.8.1: 7 process rows, problems=0, UNPARSABLE=0
(T) tool kinds (05 §5.6.5, 11 §11.3.4) → 16 §16.1.10 action classes: 9 kinds, problems=0, UNPARSABLE=0
(F) level floors (02 §2.5) enforced in 11 §11.3.5 decide(): 1 floor clauses, problems=0, UNPARSABLE=0
(M) 13 “M1 验收” CI scenarios in 14 §14.3.5 M1 exit: 1 scenarios, missing=0, UNPARSABLE=0
(B) enumerating “run 类阻断” claims vs 16 §16.1.6: 1 claims, differing=0, UNPARSABLE=0
(O) 08 §8.8 one class per exit: 34 rows, problems=0, UNPARSABLE=0
(J) 16 §16.3 keymap (key, scope) pairs: 135 pairs, duplicates=0, UNPARSABLE=0
(H) 04 wireframe key hints vs 16 §16.3: 77 hint keys, problems=0, UNPARSABLE=0
(C) 14 §14.3.4 capacity table vs WBS / margins / 15 ADR-133 addendum: 19 WBS rows, problems=0, UNPARSABLE=0
(t) open markers=0
```
