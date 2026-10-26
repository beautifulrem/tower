# 第 97 轮 lint

`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH` → exit 0（ADR-225 落地后；headings 566，ADR 225，section_refs 8873，problems 0）。从 `docs/` 运行。

本轮改动了 lint 脚本（`reviews/lint/xref.py`）两处：
- **(C) 的容量改为推导**（R97 排期，ADR-225）：此前缓冲外余量按写死的 `29.00 − 冻结前所需` 核对，这个 29.00 对应 38 周。现在从 `14` §14.3.4 结论中读出“≤ K.0 工作周，在第 1–6、9–13、15–N 周的 K 个工作周之内 → **第 N 周末功能冻结**”与“M1 = M 周”，核对三件事：K = 6 + 5 + (N − 14)（节假日周 7、8、14），M = N + 4（3 周自用 + 1 周退出），容量 = K − 2（ADR-038 的 2 周缓冲）。余量以这个容量计。不一致时报 `CAPACITY_WEEKS`，结论读不出时报 UNPARSABLE。文档头的 (C) 说明同步。
- **M1 周数与日期（(r) 的 UNIQUE 表）补 38 周一组**：`38 个日历周`、`2027-07-30`（后接“顺延”或“→”的除外）、`第 34 周末(功能)?冻结`。自用期与 E9 的窗口模式由 `3[0-4]` 扩到 `3[0-5]`，所以“M1 第 35–37 周（自用”与“M1 第 35 周（用第 34 周末的 M1 冻结构建”成为旧值。

改动后做了变异检查（改完即还原）：
- 把结论中的 `≤ 32.0` 改为 `≤ 31.0`，报 `CAPACITY_WEEKS`；
- 把桌面余量 1.10 改为 1.12，报 `MARGIN … 1.12 ≠ 30.00 − 28.90 = 1.10`；
- 把 E9 的时间行改回“M1 第 35 周（用第 34 周末…”，报 (r) `CONTRADICT M1 周数与日期`。

评审 §3.1 的建议按下面处理：
- **R97-D15-01（把不带例外的“启动时清空”写法登入 §16.1.13）**：采纳。登记的是不带例外的具体旧句（“Tower 每次启动时清空，ADR-155”“Supervisor 每次启动时清空该目录”“重启后 ~/.tower/tmp/ 为空”），不是“启动时清空”这个短语，所以带例外的新写法不会命中。为此 `10` §10.1.2 中原本已带例外的“Supervisor 每次启动时清空该目录（…除外）”也改为“清空其中不属于存活 Host 的内容”。`06` §6.6.4 表格一行的旧值含 `|`，不能作为 (D) 的短语，改为补 `tmp/<hostId>/` 一行。
- **R97-D6-01**：(y) 与 (s′) 不覆盖“重算时机是否包含每项检查的解除条件”，没有新增检查。被取代的“或收到新请求时重新计算”“存在未结束 Run 的 runs.process_token”“（未结束的 Run，以及有未解决”“四种档位模板”“每次 Tower 启动，后台一次”登入 §16.1.13，由 (D) 检查。
- **R97-D11-01、R97-D11-02、R97-D7-01**：属于语义，lint 不覆盖。被取代的说法登入 §16.1.13，由 (D) 检查：“这里名字形如凭据的文件只会由 Agent、它运行的工具或你交还时写入”“之内名字形如凭据的文件只由 Agent、它运行的工具或你交还时写入”“检查密钥路径表中的路径是否存在且当前用户可读”“对 bash 由 S2 保证，§11.6.2；对沙箱外工具见”“读取验证器或命令的完整输出文件”“打开所选输出的完整日志”。

中途报出并已修正的问题：
- 正文写入、ADR 未写时的中间运行只有预期的 `NO_ADR`（正文中对尚未写入的 ADR-225 的引用）。
- 写 §16.1.13 第 97 轮一行之前检查了每个短语在正文中的出现：`10` §10.1.2 与 `11` §11.7.0 各有一处与登记短语同形的写法（前者已带例外，后者是单一启动点的旧说法），先改为新写法再登记，(D) 命中 0。

本轮引用的位置都已核对：
- **节号**（lint 的 section_refs 覆盖 `00`–`14`、`16` 与 README）：
  - `00` §0.5.1；`04` §4.7.3、§4.8.5、§4.10.2；`05` §5.3.6；
  - `06` §6.1.3、§6.1.6、§6.1.10、§6.2.4、§6.4.3、§6.6.4、§6.7；`07` §7.2.2、§7.6.6；
  - `10` §10.1.2、§10.2、§10.8.3、§10.8.4、§10.16.2；`11` §11.3.1、§11.3.2、§11.3.3、§11.3.4、§11.6.2、§11.6.4、§11.7.0、§11.7.1、§11.8；
  - `12` §12.6.5、§12.6.6、§12.12；`13` §13.11.1、§13.11.3；`14` §14.1、§14.2 SP2 与 SP6a A3、G44、G46 (bj)(bl)、§14.3.4、§14.5、§14.8；`16` §16.1.12、§16.1.13、§16.2.2、§16.2.8、§16.3。
- **Pi 行号**（v1.2.0，`git show v1.2.0:<path>`，`packages/coding-agent/src/` 下）：
  - `core/tools/bash.ts:342-352`（截断时结果末尾的 `Full output: <path>`）、`:371-381`（超时与中止的错误文本中同一行）；
  - `core/tools/output-accumulator.ts:121-138, 245-252` 与 `utils/output-files.ts:31-34`（`wx` 打开的流，打开失败在 `closeTempFile` 之前没有监听者）；
  - `core/extensions/loader.ts:576-579`（`createJitiImpl(import.meta.url, { moduleCache: false, … })`）；`package.json:57`（`jiti` 2.7.0）。

与第 96 轮相比的计数变化：
- ADR 224 → 225；section_refs 8712 → 8873。
- (e) 246 → 250 对：ADR-225 Amends ADR-224、ADR-223、ADR-201、ADR-167，四者标题都已补 “Amended by ADR-225”。
- (D) 462 → 481 个短语：第 97 轮一行登入 19 个被取代的说法，命中 0。
- (C) 仍为 19 行、0，已核对到第 97 轮的数值：
  - W4 4.56、W11 7.87（桌面 5.21）、W16 3.51，功能合计 123.97；
  - 角色容量表 桌面 28.07 / 26.27 / 28.90、设计 29.27 / 26.27 / 28.90；范围句 “第 97 轮后…28.88–28.90”；
  - 结论 “≤ 32.0 工作周，在第 1–6、9–13、15–35 周的 32 个工作周之内 → 第 35 周末功能冻结”、M1 = 39 周，容量 30.00；
  - 结论与甘特图余量 系统 1.12、Agent 1.12、桌面 1.10、设计 1.10、安全 1.12；增人算式 28.88 + 28.88 + 28.90 + 28.90 + 14.44 = 130.00，T = 132.00 / 5.5 = 24.00；
  - §14.8 桌面 W4 4.56、W11 5.21、合计 28.07，设计 W16 3.51、合计 29.27；ADR-133 第 97 轮补记的角色合计与余量。
- (r) 的 M1 周数与日期一项多 3 个模式，命中 0。
- (v) 仍为 98 条命令（本轮不新增命令）；(O) 仍为 35 行；(r′) 仍为 59 对；(s) 8/8（不新增 `wait_reason` 值）；(A) 7 行；(T) 9 种。其余各项计数不变，全部为 0。

```
headings=566 adrs=225 section_refs=8873 problems=0
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
(e) ADR back-markers: 250 supersede/amend pairs, missing=0
(r′) mutual “一致/唯一定义” claims: 59 pairs, differing values=0
(q) verbatim-quote mismatches=0
(p) 16 §16.8 copy cells without 规则 5: 10 copy cells, missing=0, UNPARSABLE=0
(P) 16 §16.8 role-column copies (per column): 8 role cells with copies, missing=0, UNPARSABLE=0
(i) event names in per-document event tables vs 16 §16.1.14: 31 names, not in index=0, UNPARSABLE=0
(i′) full-row and path-list payload events vs the 13 §13.9.1 cap (06 §6.3 rule): 5 events, unhandled=0, UNPARSABLE=0
(D) superseded phrases of 16 §16.1.13 outside history: 481 phrases, hits=0, UNPARSABLE=0
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
