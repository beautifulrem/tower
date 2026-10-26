# 第 87 轮 lint

`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH` → exit 0（ADR-215 落地后；headings 566，ADR 215，section_refs 7800，problems 0）。从 `docs/` 与从 `/Volumes/Remi/Project` 运行，输出逐行相同（`diff` 无差异）。

本轮改动 lint 一处（`reviews/lint/xref.py`）：
- **(d) 新增一项**（`DELETED` 末尾，ADR-215）：`~/.tower/mcp-cwd/` 的 “Tower 之后从不写入、不清空”（R87-D11-02），正则 `之后从不写入[，、]?不清空|Tower 之后从不写入`。
  - **有效性核对**：临时把 `06` §6.6.1 目录布局的 `mcp-cwd/` 注释改回 “创建时为空，Tower 之后从不写入”，(d) 报 1 处 `DELETED_NAME`（06:1060），(D) 同时报 1 处（16:638 一行的短语）；恢复后为 0。
- 没有为 “全局根查询不另设时限” 加 (d) 项：`16` §16.1.13 第 86 轮一行的新说法列含这句（(d) 对新说法列不做历史豁免），改由 (D) 的短语 “与 Pi 一样不另设时限”“由同一准备时限兜底” 守住。“由 120 s 的准备时限兜底” 没有选作短语：`13` §13.5 仍以它正确描述 Pi 自己在 Host 中运行的同一查询。
- 评审 §3.1 的两条建议：
  - **差集 lint（DDL 的表 ↔ 例外或投影事件）未采用**：`06` §6.2.1 改为 “(1) 由事件重放的表（清单即全部）+ (2) 其余一切表原样沿用”，任何表不在 (1) 中即属 (2)，完整性由构造保证；新增的表默认属于 (2)。(2) 仍逐个写出 DDL 中的其余表，供阅读。
  - **(k) 扩到 `goal.take_over` 的守卫未采用**：`06` §6.4.3 `goal.take_over` 一行的守卫以一句列举多个条件后统一 “→ `E_STATE`”，没有逐条以 “→ `E_STATE`” 结尾的机读形状，按建议的写法抓不到；本轮把 `pending_hand_back` 一条写进 `03` §3.2.1 `human` 行，并在 `06` 该处引用 `03`。
- **(i′)**：`06` §6.3 “载荷中的路径集合” 纳入 `resolvePinHits`，适用的事件补 `human.decision`；`16` §16.1.14 `human.decision` 行写明 16 KB 与 `06` §6.3。**有效性核对**：临时删去 `16` 该行的上限说明，报 1 处 `PAYLOAD_CAP_UNHANDLED`（`human.decision`）；恢复后为 0。（`human.decision{hand_back, …, handBack:{…, resolvePinHits}}` 的字段名不匹配 `paths`/`*Paths`/`changed`/`skipped`，签名一侧的子检查不会因它报错，只由列表与索引的一致性守住。）
- **(D)**：`16` §16.1.13 新增第 87 轮一行，含 14 个可检短语。**有效性核对**：临时在 `06` §6.2.1 末尾写回 “例外只有以下四处”，(D) 报 1 处（06:221）；恢复后为 0。另：第一次核对时把这句写在 “取代旧写法；” 之后，被 HIST 的 “取代” 豁免而没有命中——这是 (D) 的既定行为，不是漏检。

中途核对：
- **人工复查节号**：逐条核对新增的引用，都在所指的小节内：`03` §3.2.1；`04` §4.6.7、§4.8.9、§4.8.11、§4.15、§4.18.1；`05` §5.3.1、§5.3.5、§5.3.6、§5.5、§5.10；`06` §6.1.1、§6.1.9、§6.2.1、§6.2.4、§6.3、§6.4.3、§6.6.1、§6.6.4；`07` §7.4.3；`09` §9.12.4；`10` §10.1、§10.1.2、§10.1.3、§10.3.1、§10.7.1、§10.8.4；`11` §11.3.3、§11.3.4、§11.6.2、§11.8.2、T4、T7、T16、T26；`13` §13.5；`14` §14.3.4、§14.8；`16` §16.1.1、§16.1.6、§16.1.13、§16.1.14。ADR-215 初稿把 `nested_repo_live` 卡片写作 `04` §4.6.3、ceiling 写作 `10` §10.1.1、卡片示例写作 `04` §4.8，`03` 的交还对话框后果写作 `04` §4.6.7，核对后为 §4.8.9、§10.1、§4.8.11、§4.8.9。
- **Pi 行号**（v1.2.0）：`extensions/index.ts:9-13`；`core/resource-loader.ts:115-150`（`omitReplacedExtensions` 与警告）、`:380-382`、`:709`、`:727-743`、`:785`；`core/source-info.ts:15`（`BUILTIN_PATH_PREFIX = "builtin:"`）；`core/extensions/types.ts:2058-2065`（`replaceable`）、`:2268-2284`（`Extension.path`/`commands`）；`core/agent-session-services.ts:78`、`:154`；`extensions/mcp/index.ts:343-363`（扩展注册的服务器）、`:387-460`（工具在连接后注册）、`:1114`（`session_start`）、`:1260`（`registerCommand("mcp")`，加载时唯一注册的名字；`registerFlag` 没有出现）；`extensions/mcp/runtime.ts:98-122`；`core/mcp-servers.ts:84`；`docs/mcp.md:264-266`。

与第 86 轮相比的计数变化：
- ADR 214 → 215；section_refs 7645 → 7800。
- (e) 212 → 216 对：ADR-215 Amends ADR-214、ADR-213、ADR-186、ADR-131，四者标题都已补 “Amended by ADR-215”。
- (r′) 55 → 56 对：新增的唯一定义与引用处取值一致。
- (i′) 4 → 5 个事件（`human.decision`）。
- (D) 330 → 344 个短语：命中 0。
- (d) 仍为 0：新增一项在正文中只出现在 `15` 与 `16` §16.1.13 的旧说法列。
- (C) 仍为 19 行、0，已核对到第 87 轮的数值：W6 9.25、W12 9.17（设计 7.56）、W16 3.21，功能合计 123.33；角色容量表 Agent 26.61 / 26.21 / 28.83，设计 28.90 / 25.90 / 28.49；范围句 “第 87 轮后…28.49–28.88”；结论与甘特图余量 Agent 0.17、设计 0.51；增人算式 28.83 + 28.88 + 28.64 + 28.49 + 14.44 = 129.28，T = 131.28 / 5.5 = 23.87；§14.8 Agent 合计 26.61、设计合计 28.90；ADR-133 第 87 轮补记的角色合计与余量。
- (v) 仍为 98 条命令（本轮不新增命令）。其余各项计数不变，全部为 0。

```
headings=566 adrs=215 section_refs=7800 problems=0
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
(e) ADR back-markers: 216 supersede/amend pairs, missing=0
(r′) mutual “一致/唯一定义” claims: 56 pairs, differing values=0
(q) verbatim-quote mismatches=0
(p) 16 §16.8 copy cells without 规则 5: 10 copy cells, missing=0, UNPARSABLE=0
(P) 16 §16.8 role-column copies (per column): 8 role cells with copies, missing=0, UNPARSABLE=0
(i) event names in per-document event tables vs 16 §16.1.14: 31 names, not in index=0, UNPARSABLE=0
(i′) full-row and path-list payload events vs the 13 §13.9.1 cap (06 §6.3 rule): 5 events, unhandled=0, UNPARSABLE=0
(D) superseded phrases of 16 §16.1.13 outside history: 344 phrases, hits=0, UNPARSABLE=0
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
