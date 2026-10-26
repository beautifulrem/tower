# 第 92 轮 lint

`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH` → exit 0（ADR-220 落地后；headings 566，ADR 220，section_refs 8262，problems 0）。从 `docs/` 运行。

本轮改动了 lint 脚本（`reviews/lint/xref.py`）两处，都随 ADR-220 的结构性改动而来：
- **(T) 扩展一项**：白名单 `TOWER_BUILTINS` 中的每个名字都须在 `11` §11.3.4 工具来源一条中以 `<sdk:<name>>` 点名（新检查名 `WHITELISTED_BUILTIN_SDK_SOURCE_UNNAMED`）。`read`/`edit`/`write` 与 `bash` 一样由 Tower 以 `customTools` 注入，生效来源恒为 `<sdk:…>`，`builtin:<name>` 只在回归保护下出现；原有的 `builtin:<name>` 点名要求保留。(T) 的划分检查随 `TOWER_BUILTINS` = `read`/`bash`/`edit`/`write`、`NON_TOWER_BUILTINS` = `powershell`/`grep`/`find`/`ls` 照常通过，`grep`/`find`/`ls` 在 `11` §11.3.4 与 `16` §16.1.10 白名单之外一行都已点名。
- **(d) 的 `DELETED` 补两项**：
  - “`grep`/`find`/`ls` 作为 Tower 内置工具”：`builtin:grep|find|ls` 来源、`setActiveTools` 或 RPC `--tools` 中的这三个名字；
  - “交还第 6 步的 `syncing` 续写分支”：`以 T1 为目标对未写完的文件幂等续写`、`再次 goal.hand_back（检出仍在时）按…`。

评审 §3.1 的建议（为 “`human_checkout` 非空时允许的 `state`” 与 `06` §6.4.3 各命令的前置条件加交叉检查）没有实现：ADR-220 把 “写回已不在进行而 `syncing` 仍在” 的状态整体消除，命令再也不会在这一组合上执行。要检查的组合不复存在，(y) 的 CHECK 比对照常覆盖 DDL 文字。被取代的说法登入 `16` §16.1.13（第 92 轮一行，L643），由 (D) 检出。

中途报出并已修正的问题：无。正文与 ADR-220 一并写入后第一次运行即为 0。之后人工复查节号时修正了三处引用：
- ADR-220 中多仓库目标写作 `10` §10.18，实为 §10.13；
- ADR-220 中 `07` 的触发表写作 §7.3，改为 §7.3.2（lint 不检查 `15` 中的这类引用）；
- `12` §12.6.4 实况行中卡片第二行初稿写作 `04` §4.3，实为 §4.4.1（节号存在，所以 lint 不报，只能靠人工核对所指内容）。

有效性核对（各临时改动后运行所列检查，恢复后全量输出与下方逐行一致）：
- **(d)**：
  - 在 `11` §11.3.4 工具来源中加回 `builtin:grep`，报 `DELETED_NAME grep/find/ls as Tower built-ins ADR-220 11 222`；
  - 在 `10` §10.8.4 第 6 步加回 “以 T1 为目标对未写完的文件幂等续写”，报 `DELETED_NAME hand_back step-6 syncing continuation ADR-220 10 974`。
- **(T)**：删去 `11` §11.3.4 的 `<sdk:read>`，报 `WHITELISTED_BUILTIN_SDK_SOURCE_UNNAMED read`。
- **(D)**：把 `11` §11.6.1 S1 行写回 “工具级写守卫”，报 `SUPERSEDED_PHRASE 11:336 工具级写守卫 16:643`。
- **(C)**：把 `15` ADR-133 第 92 轮补记的桌面余量写成 0.26，报 `ADR133_MARGIN 15 第 92 轮 桌面 0.26 ≠ 0.25`。

(D) 的局限（同第 91 轮）：伪代码 `piResolve(input.path || ".", cwd)`、常量字面量与不含汉字的旧写法不能登记为短语，它们在 `16` §16.1.13 第 92 轮一行中以描述登记。(d) 的第一项覆盖了常量与激活表中的三个名字。

中途核对：
- **人工复查节号**：新增与改动的引用都在所指的小节内：
  - `00` §0.5.1；`04` §4.4.1、§4.6.7、§4.8.11、§4.18.1；`05` §5.3.5、§5.3.6、§5.5.1、§5.6.2、§5.6.5、§5.10、§5.11.1 D60/D61、§5.11.2 C41/C42；
  - `06` §6.1.6、§6.3、§6.4.3；`07` §7.3.2、§7.12；`08` §8.4、§8.8；`10` §10.2、§10.8.3、§10.8.4、§10.13、§10.16.2；
  - `11` §11.3.1、§11.3.3、§11.3.4、§11.3.5、§11.4、§11.6.1、§11.6.2、T3、T26；`12` §12.6.4、§12.6.5；`13` §13.8.1、§13.12.5；
  - `14` §14.3.4、§14.3.5、§14.8、G31、G46；`16` §16.1.1、§16.1.4、§16.1.7、§16.1.10、§16.1.11、§16.1.12、§16.1.13。
- **Pi 行号**（v1.2.0，`git show v1.2.0:<path>`，`packages/coding-agent/src/` 下，另注者除外）：
  - `packages/agent/src/agent.ts:253`；`agent-loop.ts:508-523, 586-648`；
  - `core/tools/read.ts:48-55, 86-92, 124-155`；`edit.ts:83-90, 143-147, 161-198`；`write.ts:27-32, 44-48, 65-82`；`path-utils.ts:86-118`；
  - `grep.ts:53-58, 119-168`；`find.ts:52-57, 113-125`；`ls.ts:34-41`；`core/tools/index.ts:96-105`；
  - `core/agent-session.ts:3529-3553`（`customTools` 写为 `<sdk:${name}>`，同样经 `_isAllowedTool` 过滤）；`src/index.ts:336-392`。

与第 91 轮相比的计数变化：
- ADR 219 → 220；section_refs 8132 → 8262。
- (e) 230 → 234 对：ADR-220 Amends ADR-219、ADR-190、ADR-189、ADR-188，四者标题都已补 “Amended by ADR-220”。
- (D) 387 → 402 个短语：命中 0。
- (O) 34 → 35 行：`08` §8.8 新增 `stalled{write_back_failed}` 一行，每个出口一类。
- (w) 仍为 0：`write_back_failed` 是 `stalled` 的子类型，`08` §8.4 有去重行 `st:{goalId}:write_back`、§8.8 有出口行，`16` §16.1.7 已登记。
- (n) 仍为 0：新引用的 C42 在 `05` §5.11.2 中有行。
- (T) 仍为 9 种、0：工具种类不变，文件类工具一行改为 `read`/`edit`/`write`。
- (C) 仍为 19 行、0，已核对到第 92 轮的数值：
  - W4 4.44、W13 6.93、W16 3.38，功能合计 123.65；
  - 角色容量表桌面 27.94 / 26.14 / 28.75、设计 29.09 / 26.09 / 28.70；范围句 “第 92 轮后…28.70–28.88”；
  - 结论与甘特图余量桌面 0.25、设计 0.30；增人算式 28.86 + 28.88 + 28.75 + 28.70 + 14.44 = 129.63，T = 131.63 / 5.5 = 23.93；
  - §14.8 桌面 W4 4.44、合计 27.94，设计 W13 6.93、W16 3.38、合计 29.09；ADR-133 第 92 轮补记的角色合计与余量。
- (v) 仍为 98 条命令（本轮不新增命令）；(r′) 仍为 57 对；(o) 仍为 8 行；(i′) 仍为 5 个事件；(A) 仍为 7 行（文件辅助进程计入 Engine Host 一行，不新增进程行）。其余各项计数不变，全部为 0。

```
headings=566 adrs=220 section_refs=8262 problems=0
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
(e) ADR back-markers: 234 supersede/amend pairs, missing=0
(r′) mutual “一致/唯一定义” claims: 57 pairs, differing values=0
(q) verbatim-quote mismatches=0
(p) 16 §16.8 copy cells without 规则 5: 10 copy cells, missing=0, UNPARSABLE=0
(P) 16 §16.8 role-column copies (per column): 8 role cells with copies, missing=0, UNPARSABLE=0
(i) event names in per-document event tables vs 16 §16.1.14: 31 names, not in index=0, UNPARSABLE=0
(i′) full-row and path-list payload events vs the 13 §13.9.1 cap (06 §6.3 rule): 5 events, unhandled=0, UNPARSABLE=0
(D) superseded phrases of 16 §16.1.13 outside history: 402 phrases, hits=0, UNPARSABLE=0
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
