# 第 80 轮 lint

`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH` → exit 0（ADR-208 落地后；headings 566，ADR 208，section_refs 6956，problems 0）。从 `docs/` 与从 `/Volumes/Remi/Project` 运行，输出逐行相同。

中途命中并改正的：
- ADR-208 写入之前的一次运行报 46 处 `NO_ADR`（各文件已引用 ADR-208，而 `15` 中还没有它）；写入 ADR-208 后归零。
- 写 §16.1.13 第 80 轮一行之前，逐条 grep 候选短语：“由运行行为推导的保留”在 `04` §4.18.3 仍有一处，已同步为按 `16` §16.1.1 三类处理后再登记。
- 人工复查节号：新增引用（`03` §3.2.1、§3.3、§3.4.1；`04` §4.4.4、§4.5.1、§4.6.5、§4.6.7、§4.8.12、§4.15.1、§4.18.3；`05` §5.3.6；`06` §6.1.4、§6.2.4、§6.4.3、§6.8；`07` §7.2.3、§7.2.4、§7.4.1、§7.4.10、§7.5.5；`08` §8.1、§8.3.1、§8.3.5、§8.4、§8.6.5、§8.8；`10` §10.1.2、§10.6.2、§10.7.1、§10.8.3、§10.8.4；`11` §11.7.0、§11.8.2；`12` §12.5.1；`13` §13.8.3；`16` §16.1.1、§16.1.13、§16.2.6、§16.3、§16.5）逐条核对所在小节；ADR-208 正文中四处节号（`12` §12.5.1、`04` §4.6.5、`16` §16.2.6、`08` §8.1/§8.3.5）在复查时改正。

本轮没有改动 lint。评审 §3.1 的三条建议：
- **(D) 补登**：以 `16` §16.1.13 第 80 轮一行实现。“只去除 `.git` 与 gitlink”含反引号，不在 (D) 的收录形状内（无反引号、至少 5 个汉字），改登记同一句的前半“其余情况下检查点树与 pin 树只去除”与“树的唯一例外”。
- **(z′) 补登“评审余量”“越过余量”**：没有实现。“评审余量”在 M1 的提示模式中仍是现行术语（H 的名字），登记会误报；“越过余量”只有 4 个汉字。改由 `03` `ready` 行的显式 M2 标记解决。
- **批次覆盖检查**：没有实现。本轮人工核对 SP6b 范围内的编号，补齐 G33f、G36。

与第 79 轮相比的计数变化：
- ADR 207 → 208；section_refs 6828 → 6956。
- (v) 96 → 97 条命令：`06` §6.4.3 新增 `inspect.close`（`decide（仅本机）`），`16` §16.5 单列为 ✗。
- (e) 197 → 199 对：ADR-208 Amends ADR-207、ADR-158，两者标题已补 “Amended by ADR-208”。
- (D) 254 → 263 个短语：`16` §16.1.13 新增第 80 轮一行，含 9 个可检短语：
  - “作者按收入它的检查点记录”；
  - “树的唯一例外”；
  - “其余情况下检查点树与 pin 树只去除”；
  - “整个凭据集只在 Host 内存中”；
  - “评审余量只闸控首次启动”；
  - “由运行行为推导的保留”；
  - “评审积压已满时仍被闸控”；
  - “扩预算后进入”；
  - “含有保留与未经机器验证”。
  - 已逐条 grep 核对：除 `15`（历史）与 §16.1.13 本行外没有出现。
- (O) 仍为 33 行、0：`08` §8.8 两种 `anomaly` 的 “知悉” 加了命令名，类别不变。
- (w)、(w′) 仍为 0：`08` §8.4 `prepare_failed` 行与 §8.8 判定的补充写在括号内，kind 与子类型不变。
- (u) 仍为 0：B4 补 G33f、G36，SP6b 范围改为 “G33b–f”。
- (H) 仍为 77 个提示键、0：`04` §4.5.1 线框去掉运行中的 `⇧V` 提示。
- (C) 仍为 19 行、0，并且已核对到第 80 轮的数值：
  - W12 9.12 → 9.14（设计 7.51 → 7.53）、W13 6.89 → 6.90、W16 3.04 → 3.05，功能合计 123.02；
  - 角色容量表设计行 28.69 / 25.69 / 28.26；冻结前所需范围句 “第 80 轮后…28.26–28.88”；
  - 结论余量设计 0.74；甘特设计行余量 0.74；
  - 增人算式 28.74 + 28.88 + 28.64 + 28.26 + 14.42 = 128.94，T = 130.94 / 5.5 = 23.81；
  - §14.8 设计行 W12（7.53）、W13（6.90）、W16（3.05）、合计 28.69；
  - ADR-133 第 80 轮补记的角色合计与余量。
- 其余各项计数不变，全部为 0。

```
headings=566 adrs=208 section_refs=6956 problems=0
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
(v) remote-matrix coverage problems=0 (commands in 06 §6.4.3: 97)
(w) Needs-You kind/dedupe/outcome problems=0
(x) default data vs examples: default-benign targets ['~/.ssh/known_hosts']; problems=0
(w′) pauseReason → Needs-You problems=0
(y) cross-column CHECK vs 16 problems=0
(z) push/PR/remote polling presented as M1=0
(z′) M2 capability phrases in M1 tables: 35 occurrences, unmarked=0, UNPARSABLE=0
(c) continuation literal shape vs 02=0
(d) deleted mechanism names outside history=0
(n) contract-test references=0
(k) 03 §3.2.1 rewrite targets vs 06 §6.4.3=0
(s′) enum values used in rule text / pseudo-code outside the registered set=0
(e) ADR back-markers: 199 supersede/amend pairs, missing=0
(r′) mutual “一致/唯一定义” claims: 50 pairs, differing values=0
(q) verbatim-quote mismatches=0
(p) 16 §16.8 copy cells without 规则 5: 10 copy cells, missing=0, UNPARSABLE=0
(P) 16 §16.8 role-column copies (per column): 8 role cells with copies, missing=0, UNPARSABLE=0
(i) event names in per-document event tables vs 16 §16.1.14: 31 names, not in index=0, UNPARSABLE=0
(D) superseded phrases of 16 §16.1.13 outside history: 263 phrases, hits=0, UNPARSABLE=0
(g) fact/danger glyphs paired with queue/grant/approval in 04/12: 20 glyph lines checked, misuse=0
(o) 16 §16.1 object shapes vs 02: 8 rows compared, 0 unions skipped, differing=0, UNPARSABLE=0
(k′) 03 §3.2.1 resume exits vs 06 goal.resume: 14 reasons with a resume exit, missing=0, UNPARSABLE=0
(r‴) one-sided “只引用本条/本节” claims: 1 enumerating claims, re-enumerations=0
(A) per-process memory budgets 06 §6.1 vs 13 §13.8.1: 7 process rows, problems=0, UNPARSABLE=0
(T) tool kinds (05 §5.6.5, 11 §11.3.4) → 16 §16.1.10 action classes: 9 kinds, problems=0, UNPARSABLE=0
(F) level floors (02 §2.5) enforced in 11 §11.3.5 decide(): 1 floor clauses, problems=0, UNPARSABLE=0
(M) 13 “M1 验收” CI scenarios in 14 §14.3.5 M1 exit: 1 scenarios, missing=0, UNPARSABLE=0
(B) enumerating “run 类阻断” claims vs 16 §16.1.6: 1 claims, differing=0, UNPARSABLE=0
(O) 08 §8.8 one class per exit: 33 rows, problems=0, UNPARSABLE=0
(J) 16 §16.3 keymap (key, scope) pairs: 135 pairs, duplicates=0, UNPARSABLE=0
(H) 04 wireframe key hints vs 16 §16.3: 77 hint keys, problems=0, UNPARSABLE=0
(C) 14 §14.3.4 capacity table vs WBS / margins / 15 ADR-133 addendum: 19 WBS rows, problems=0, UNPARSABLE=0
(t) open markers=0
```
