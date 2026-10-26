# 第 93 轮 lint

`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH` → exit 0（ADR-221 落地后；headings 566，ADR 221，section_refs 8379，problems 0）。从 `docs/` 运行。

本轮没有改动 lint 脚本（`reviews/lint/xref.py`）。评审 §3.1 的两条建议按下面处理：
- **(D) 的短语表**：没有改脚本，而是照 (D) 的既有机制在 `16` §16.1.13 登入第 93 轮一行（ADR-221），把 G46 的两处旧期望“文件工具改写 docs/agents.md 按 edit.protected 询问，人批准”“Agent 每次调用扩展版 read 都出现审批卡”与本轮其余被取代的说法（辅助进程“每个 Run 一个，由 Tower 启动与终止”“内存计入该 Goal 的 Engine Host”、`13` 的“只做文件读写的小程序”、全文文件“指向 $TMPDIR/tower-<goalId>/（随 Goal 清理）”“Pi 的临时文件会被清理”、带回出口“此时前置条件都成立”、③ 的“移到一边、不删除”、“重启时 Tower 直接删除它”、“接管期间它就是第 1 步的检查点 k”、“Tower 也不自行改名”）交给 (D) 检查。(D) 402 → 414 个短语，命中 0。
- **(A) 增加“计入本行的子进程须出现在 §13.12.3 的采集对象中”**：没有实现。ADR-221 把文件辅助进程改为每次文件操作一个的一次性子进程，计入 `13` §13.8.3 的进程树预留，`13` §13.8.1 不再有“计入本行”的子进程，要检查的对象不复存在；(A) 照常比较 `06` §6.1 与 `13` §13.8.1 的 7 个进程行。
- **R93-D5-02（Pi 运行时路径与 S2 读允许列表的交集）**：lint 不读 Pi 源码，仍由契约测试承担（C42 (f) 断言 Host 临时目录中的全文文件按“S2 必然拒绝”直接返回说明）。

中途报出并已修正的问题：无。正文与 ADR-221 一并写入后第一次运行即为 0；之后把文件辅助进程的形态由“Tower 自带的 Node 运行时”改为“档位中执行的系统命令”（前者的可执行文件不在 S2 读允许列表中），并把 W4 由 +0.01 改为 +0.02（加图像类型纯字节判定的移植），重跑仍为 0，输出与第一次只差 (C) 已核对的数值（脚本输出行本身不变）。

本轮引用的位置都已核对：
- **节号**（lint 的 section_refs 覆盖 `00`–`14`、`16` 与 README）：
  - `00` §0.5.1；`02` §2.2；`04` §4.6.7、§4.10.2、§4.18.1；`05` §5.3.5、§5.6.5、§5.10、§5.11.1 D61、§5.11.2 C42；
  - `06` §6.1.6、§6.1.10、§6.4.3；`07` §7.2.2、§7.7.1、§7.10.1；`08` §8.4、§8.8；`09` §9.12.4；
  - `10` §10.1.3、§10.2、§10.8.3、§10.8.4、§10.16.2；`11` §11.3.1、§11.3.5、§11.6.2、§11.7.1；`13` §13.8.1、§13.8.3；
  - `14` §14.3.4、§14.8、G31、G46；`16` §16.1.6、§16.1.12、§16.1.13、§16.2.8。
- **Pi 行号**（v1.2.0，`git show v1.2.0:<path>`，`packages/coding-agent/src/` 下）：
  - `core/tools/truncate.ts:11-12`（2000 行 / 50 KB）；`read.ts:65, 90`（`autoResizeImages`）、`:135, 155`（整读）；`edit.ts:164-167, 186, 198`；`write.ts:68-71`；
  - `core/tools/file-mutation-queue.ts:4-5, 16-26, 33-49`；
  - `utils/output-files.ts:17-34`；`core/tools/bash.ts:343-352`；`extensions/mcp/tools.ts:71`；`extensions/codemode/execute.ts:340, 369`；
  - `utils/mime.ts:3-23`；`src/index.ts:494`；`core/agent-session.ts:3636, 3647`；`core/system-prompt.ts:162-170`。

与第 92 轮相比的计数变化：
- ADR 220 → 221；section_refs 8262 → 8379。
- (e) 234 → 237 对：ADR-221 Amends ADR-220、ADR-199、ADR-125，三者标题都已补 “Amended by ADR-221”。
- (r′) 57 → 59 对：新增的两对来自本轮新增的“唯一定义”及其引用处（`11` §11.3.1、§11.6.2，`10` §10.2、§10.8.4 第 8 步），取值一致。
- (D) 402 → 414 个短语：命中 0。
- (C) 仍为 19 行、0，已核对到第 93 轮的数值：
  - W4 4.46、W13 6.94、W16 3.41，功能合计 123.71；
  - 角色容量表桌面 27.96 / 26.16 / 28.78、设计 29.13 / 26.13 / 28.74；范围句 “第 93 轮后…28.74–28.88”；
  - 结论与甘特图余量桌面 0.22、设计 0.26；增人算式 28.86 + 28.88 + 28.78 + 28.74 + 14.44 = 129.70，T = 131.70 / 5.5 = 23.95；
  - §14.8 桌面 W4 4.46、合计 27.96，设计 W13 6.94、W16 3.41、合计 29.13；ADR-133 第 93 轮补记的角色合计与余量。
- (w) 仍为 0；(O) 仍为 35 行（`08` §8.8 `write_back_failed` 一行补“放弃 Goal”，仍是每个出口一类）；(A) 仍为 7 行；(T) 仍为 9 种；(v) 仍为 98 条命令（本轮不新增命令）。其余各项计数不变，全部为 0。

```
headings=566 adrs=221 section_refs=8379 problems=0
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
(e) ADR back-markers: 237 supersede/amend pairs, missing=0
(r′) mutual “一致/唯一定义” claims: 59 pairs, differing values=0
(q) verbatim-quote mismatches=0
(p) 16 §16.8 copy cells without 规则 5: 10 copy cells, missing=0, UNPARSABLE=0
(P) 16 §16.8 role-column copies (per column): 8 role cells with copies, missing=0, UNPARSABLE=0
(i) event names in per-document event tables vs 16 §16.1.14: 31 names, not in index=0, UNPARSABLE=0
(i′) full-row and path-list payload events vs the 13 §13.9.1 cap (06 §6.3 rule): 5 events, unhandled=0, UNPARSABLE=0
(D) superseded phrases of 16 §16.1.13 outside history: 414 phrases, hits=0, UNPARSABLE=0
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
