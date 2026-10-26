# 第 98 轮 lint

`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH` → exit 0（ADR-226 落地后；headings 566，ADR 226，section_refs 8987，problems 0）。从 `docs/` 运行。

本轮改动了 lint 脚本（`reviews/lint/xref.py`）两处：
- **(C) 加 ADR-038〔当前值〕的核对**（R98-D14-01，ADR-226）：
  - 从 `14` §14.3.4 结论读出 “日历周，2026-11-09 至 <日期>”，核对它等于起点加 M1 周数的那一周的周五（第 39 周 → 2027-08-06），不符时报 `M1_END_DATE`；
  - 从 `15` 读出 “〔当前值：**N 个日历周**，2026-11-09 → <日期>”，核对 N 与结论的 M1 周数相同、日期与上一项相同，不符时报 `ADR038_CURRENT`；
  - 两者读不出时报 UNPARSABLE。文档头的 (C) 说明同步。
- **(r) 加一项 “S0 原因：启动自检未确认拒绝”**（R98-D15-01，ADR-226）：唯一定义为 `04` §4.8.5 的原因一行。其他文档中 “探测” 或 “自检” 之后（同一句、300 字以内）写 “原因 `本机没有可用的 OS 写入沙箱`” 的，报 CONTRADICT。

改动后做了变异检查（改完即还原，还原后输出与改动前逐行一致）：
- 把 `15` ADR-038 的〔当前值〕改回 “38 个日历周，2026-11-09 → 2027-07-30”，报 `ADR038_CURRENT 38 周 / 2027-07-30 ≠ 39 周 / 2027-08-06`；
- 把 `14` 结论的结束日期改为 2027-08-13，报 `M1_END_DATE 2027-08-13 ≠ week 39 Friday 2027-08-06`；
- 把 `11` §11.6.2 硬链接一行改回 “（`04` §4.8.5，原因 `本机没有可用的 OS 写入沙箱`）”，报 (r) `CONTRADICT S0 原因：启动自检未确认拒绝`。

评审 §3.1 的建议按下面处理：
- **R98-D14-01**：采纳，见上（选择在 (C) 中核对，而不是让 (r) 扫描 `15`：`15` 的历史行大量含旧周数，只读一处标为〔当前值〕的位置更准）。
- **R98-D15-01**：没有把两个 S0 原因登为枚举，改为在 (r) 中加一项反向模式，成本更低，覆盖评审指出的回退方向。
- **R98-D6-01**：采纳。不带存活 Host 例外的 `run/` 清空写法（“Supervisor 每次启动时清空它”“Supervisor 每次启动时清空。”“消费进程结束即删；启动时清空”“退出即删除，启动时清空”“Spotlight 排除，启动时清空”）登入 §16.1.13，由 (D) 检查。
- **R98-D6-02、R98-D6-03、R98-D11-01、R98-D11-02、R98-D13-01**：属于语义，lint 不覆盖。被取代的说法登入 §16.1.13，由 (D) 检查（共 32 个短语，见 `16` §16.1.13 第 98 轮一行）。

中途报出并已修正的问题：
- 正文写入、ADR 未写时的中间运行只有预期的 `NO_ADR`（正文中对尚未写入的 ADR-226 的引用）。
- 写 §16.1.13 第 98 轮一行之前逐个检查了短语在正文中的出现：T26 的评级格中还有一处 “未加载能写文件系统的沙箱外工具”，先按 R98-D11-01 改为 “未加载沙箱外工具” 再登记，(D) 命中 0。
- `13` §13.11.3 新增的一行第一次落在表格之后的空行下（成了无表头的孤行），已移入表内。

本轮引用的位置都已核对：
- **节号**（lint 的 section_refs 覆盖 `00`–`14`、`16` 与 README）：
  - `00` §0.5.1；`04` §4.6.7、§4.8.5、§4.10.2；`05` §5.3.6、§5.10，D38、C12；
  - `06` §6.1.3、§6.1.4、§6.1.6、§6.1.10、§6.2.4、§6.4.3、§6.6.1、§6.6.4、§6.7；`07` §7.2.2；`09` §9.12.1；
  - `10` §10.3.1、§10.8.4、§10.16.2；`11` §11.3.1、§11.3.3、§11.3.4、§11.6.2、§11.7.0、§11.7.1、§11.8；
  - `12` §12.12；`13` §13.11.1、§13.11.3；`14` §14.1、SP6a A3、G35c、G44、G46 (bl)(bm)、§14.3.4、§14.8；`16` §16.1.13、§16.5。
- **Pi 行号**（v1.2.0，`git show v1.2.0:<path>`）：
  - `packages/ai/src/env-api-keys.ts:40-44`（显式 `GOOGLE_APPLICATION_CREDENTIALS` 时每次以 `existsSync` 检查文件）；
  - `packages/coding-agent/src/core/tools/bash.ts:112-114`（`detached: true`）、`:102, 150, 153`（Pi 自己的 `exec` 以 `Error("aborted")` 与 `Error("timeout:<N>")` 拒绝）、`:338-353`（`[Showing … Full output: <path>]` 后缀）、`:374-379`（只对这两种拒绝加状态行）。

与第 97 轮相比的计数变化：
- ADR 225 → 226；section_refs 8873 → 8987。
- (e) 250 → 254 对：ADR-226 Amends ADR-225、ADR-224、ADR-201、ADR-159，四者标题都已补 “Amended by ADR-226”。
- (D) 481 → 513 个短语：第 98 轮一行登入 32 个被取代的说法，命中 0。
- (r) 多一项（S0 原因），命中 0。
- (C) 仍为 19 行、0，已核对到第 98 轮的数值：
  - W4 4.59、W14 2.07、W16 3.52，功能合计 124.02；
  - 角色容量表 桌面 28.10 / 26.30 / 28.93、设计 29.29 / 26.29 / 28.92；范围句 “第 98 轮后…28.88–28.93”；
  - 结论 “≤ 32.0 工作周，在第 1–6、9–13、15–35 周的 32 个工作周之内 → 第 35 周末功能冻结”、M1 = 39 周，容量 30.00，结束日期 2027-08-06；
  - 结论与甘特图余量 系统 1.12、Agent 1.12、桌面 1.07、设计 1.08、安全 1.12；增人算式 28.88 + 28.88 + 28.93 + 28.92 + 14.44 = 130.05，T = 132.05 / 5.5 = 24.01；
  - §14.8 桌面 W4 4.59、合计 28.10，设计 W14 2.07、W16 3.52、合计 29.29；ADR-133 第 98 轮补记的角色合计与余量；ADR-038〔当前值〕39 周 / 2027-08-06。
- (v) 仍为 98 条命令（本轮不新增命令）；(O) 仍为 35 行；(r′) 仍为 59 对；(s) 8/8（不新增 `wait_reason` 值）；(A) 7 行；(T) 9 种。其余各项计数不变，全部为 0。

```
headings=566 adrs=226 section_refs=8987 problems=0
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
(e) ADR back-markers: 254 supersede/amend pairs, missing=0
(r′) mutual “一致/唯一定义” claims: 59 pairs, differing values=0
(q) verbatim-quote mismatches=0
(p) 16 §16.8 copy cells without 规则 5: 10 copy cells, missing=0, UNPARSABLE=0
(P) 16 §16.8 role-column copies (per column): 8 role cells with copies, missing=0, UNPARSABLE=0
(i) event names in per-document event tables vs 16 §16.1.14: 31 names, not in index=0, UNPARSABLE=0
(i′) full-row and path-list payload events vs the 13 §13.9.1 cap (06 §6.3 rule): 5 events, unhandled=0, UNPARSABLE=0
(D) superseded phrases of 16 §16.1.13 outside history: 513 phrases, hits=0, UNPARSABLE=0
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
