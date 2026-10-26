# 第 96 轮 lint

`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH` → exit 0（ADR-224 落地后；headings 566，ADR 224，section_refs 8712，problems 0）。从 `docs/` 运行。

本轮改动了 lint 脚本（`reviews/lint/xref.py`）一处：
- **DELETED 表补一项**（R96-D12-01，ADR-224）：`observer path from last streaming update`，正则 ``最后一次(?:流式更新|\s*`?tool_execution_update)``。观察器不再从“该调用最后一次 `tool_execution_update`”取全文路径，这一说法只能作为历史出现。`16` §16.1.13 第 95 轮一行的新说法列中原有的“取最后一次流式更新的 `details.fullOutputPath`”按 DELETED_IN_NEW_COLUMN 的规则改为指向第 96 轮一行。

评审 §3.1 的建议按下面处理：
- **R96-D11-01（密钥路径表中的绝对条目若包含回退位置例外中 Agent 的读写项，须在 §11.3.1 或 §11.3.4 (2) 中找到除外）**：没有新增检查。除外改为只在密钥路径表的 `~/.tower/**` 一项定义一次、对一切工具适用（`11` §11.3.1），§11.3.4 (2) 与 `10` §10.4.3 引用它；被取代的“沙箱外工具的路径检查中不含本 Host 的 stdio MCP 空目录与回退位置下本 Goal 的卫星工作区”登入 `16` §16.1.13，由 (D) 检查。
- **R96-D6-01（写“才准入”的句子须引用准入步骤）**：没有新增检查。两道闸门并入 `06` §6.2.4 的单一启动点与准入检查 h，`waitReason` 仍为 `slot`（(s) 与 (y) 照常检查取值）；被取代的“在清理结束之后才准入”“Run 在清理结束之后开始”“完成之前不启动使用沙箱的 Run 与验证”登入 `16` §16.1.13，由 (D) 检查。
- **R96-D11-02、R96-D11-03、R96-D13-01**：属于语义，lint 不覆盖；被取代的说法（“这些无锚定的模式只在卫星工作区中按跟踪状态匹配…”“未跟踪 env 不可读”“在不支持写时复制的卷上本会硬链接…”“不经人点击而改名的只有三处”“仍在原位的另一半在重建开始之前按同一规则改名”等）登入 `16` §16.1.13，由 (D) 检查。

中途报出并已修正的问题：
- 正文写入、ADR 未写时的中间运行只有预期的 `NO_ADR`（正文中对尚未写入的 ADR-224 的引用）。
- (D) 报出 4 处 SUPERSEDED_PHRASE：
  - 第 96 轮一行的左列把 “卡上的 S2 句子” 写成了带引号的名称（它是仍在使用的唯一定义的名字，不是被取代的说法），改为不加引号；
  - `09` §9.12.4 新写的“复制为证据之后即删除”与第 94 轮登记的被取代说法同形，改为“在复制为证据后删除”。

本轮引用的位置都已核对：
- **节号**（lint 的 section_refs 覆盖 `00`–`14`、`16` 与 README）：
  - `00` §0.5.1；`03` §3.2.1；`04` §4.6.7、§4.8.5、§4.10.2；`05` §5.3.6、§5.4.7、§5.11.1 D61、§5.11.2 C42；
  - `06` §6.1.6、§6.2.4、§6.4.3、§6.6.1、§6.7；`07` §7.2.2、§7.4.3；`08` §8.8；`09` §9.12.4；
  - `10` §10.1.2、§10.2、§10.4.3、§10.16.2；`11` §11.3.1、§11.3.2、§11.3.3、§11.3.4、§11.6.2、§11.7.1、§11.8；`12` §12.6.4、§12.6.5、§12.12；`13` §13.2、§13.11.1；
  - `14` §14.2 SP6a A3、G46 (bj)(bk)、§14.3.4、§14.3.5、§14.8；`16` §16.1.13、§16.8。
- **Pi 行号**（v1.2.0，`git show v1.2.0:<path>`，`packages/coding-agent/src/` 下）：
  - `utils/output-files.ts:17-20`（`createOutputFilePath`：`join(tmpdir(), …)`，`:19`）、`:23-28`（`writeOutputFile`，0600、`wx`）、`:31-34`（`createOutputFileStream`）；
  - `core/tools/output-accumulator.ts:64-89`（`append`、`finish` 中建立临时文件）、`:91-118`（`snapshot`）、`:239-243`（`shouldUseTempFile`：原始字节数、解码后字节数或行数）、`:249`（`createOutputFileStream(this.tempFilePrefix, ".log")`）；
  - `core/tools/bash.ts:193`（`getShellEnv()` 起步）、`:211`（`spawnHook`）、`:342-343`（只有截断时最终 `details` 带路径）、`:371-388`（超时、中止、无退出码时抛错）、`:390-396`、`:424`（`tempFilePrefix: "pi-bash"`）；
  - `extensions/mcp/tools.ts:51`、`:60-61`、`:70-71`（`saveToTempFile` → `writeOutputFile("pi-mcp", …)`）、`:180-199`；
  - `extensions/codemode/execute.ts:338-341`（`spillOutput` → `pi-codemode`）、`:369`（图像）；`core/bash-executor.ts:66`（交互模式，SDK 宿主不用）。
- **Node**：`os.tmpdir()` 在 POSIX 上依次取 `TMPDIR`、`TMP`、`TEMP`，都没有时为 `/tmp`，每次调用时读取环境（Node 文档；本机 Node v26.10.0 实测三种情形与运行中改写 `process.env.TMPDIR`）。

与第 95 轮相比的计数变化：
- ADR 223 → 224；section_refs 8562 → 8712。
- (e) 241 → 246 对：ADR-224 Amends ADR-223、ADR-221、ADR-218、ADR-159、ADR-082，五者标题都已补 “Amended by ADR-224”。
- (D) 444 → 462 个短语：第 96 轮一行登入 18 个被取代的说法，命中 0。
- (d) DELETED 表多一项，命中 0。
- (C) 仍为 19 行、0，已核对到第 96 轮的数值：
  - W4 4.55、W6 9.29、W13 6.97、W16 3.49，功能合计 123.93；
  - 角色容量表 Agent 26.65 / 26.25 / 28.88、桌面 28.05 / 26.25 / 28.88、设计 29.25 / 26.25 / 28.88；范围句 “第 96 轮后…28.88–28.88”；
  - 结论与甘特图余量五线都为 0.12；增人算式 28.88 + 28.88 + 28.88 + 28.88 + 14.44 = 129.96，T = 131.96 / 5.5 = 23.99；
  - §14.8 Agent W6 9.29、合计 26.65，桌面 W4 4.55、合计 28.05，设计 W13 6.97、W16 3.49、合计 29.25；ADR-133 第 96 轮补记的角色合计与余量。
- (v) 仍为 98 条命令（本轮不新增命令）；(O) 仍为 35 行；(r′) 仍为 59 对；(s) 8/8（不新增 `wait_reason` 值）；(A) 7 行；(T) 9 种。其余各项计数不变，全部为 0。

```
headings=566 adrs=224 section_refs=8712 problems=0
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
(e) ADR back-markers: 246 supersede/amend pairs, missing=0
(r′) mutual “一致/唯一定义” claims: 59 pairs, differing values=0
(q) verbatim-quote mismatches=0
(p) 16 §16.8 copy cells without 规则 5: 10 copy cells, missing=0, UNPARSABLE=0
(P) 16 §16.8 role-column copies (per column): 8 role cells with copies, missing=0, UNPARSABLE=0
(i) event names in per-document event tables vs 16 §16.1.14: 31 names, not in index=0, UNPARSABLE=0
(i′) full-row and path-list payload events vs the 13 §13.9.1 cap (06 §6.3 rule): 5 events, unhandled=0, UNPARSABLE=0
(D) superseded phrases of 16 §16.1.13 outside history: 462 phrases, hits=0, UNPARSABLE=0
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
