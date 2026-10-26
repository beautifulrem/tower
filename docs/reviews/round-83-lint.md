# 第 83 轮 lint

`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH` → exit 0（ADR-211 落地后；headings 566，ADR 211，section_refs 7261，problems 0）。从 `docs/` 与从 `/Volumes/Remi/Project` 运行，输出逐行相同。

本轮改动 lint 一处：(z′) 补一组按行检查（`reviews/lint/xref.py` `check_z2` 末尾的 `Z4_SECTIONS`/`Z4_PHRASES`，即评审 §3.1 的第一条建议）。
- **范围**：`06` §6.4.3、`16` §16.5、`08` §8.13。
- **短语**：`run.rewind`、`run.fork_goal`、`goal.rewind`、`goal.fork`、“回退到检查点”、“从检查点分叉”。
- **判定**：出现这些短语的行必须在同一行带 M2 或 M3 标记。
- **为什么按行，不复用原表格检查的 40 字窗口**：试跑原窗口规则时，`06` §6.4.3 有 6 处误报，例如 “直到下一次分叉”（base 分叉）、“要求不要回退已采纳的路径”。按命令名与动作名逐行检查没有误报。
- **有效性核对**：临时去掉 `08` §8.13.3 两处 “（M2）” 后，(z′) 报 2 处 `M2_CAPABILITY_UNMARKED`；恢复后为 0。

评审 §3.1 的另一条建议（(d) 对已删除按钮登记与名字无关的片段）：没有另改 (d)。本轮已删除或已取代的说法——“按钮在目标页人工编辑面板”“在下次运行开始时送达”“重新发送并继续运行”“且人选择不再投递”，以及 Pi 集成与快照的四个旧断言——都登记在 `16` §16.1.13 第 83 轮一行的左列引号中，由 (D) 按与文件无关的方式检查，效果相同。

中途核对：
- **人工复查节号**：逐条核对了新增的引用，都在所指的小节内：
  - `00` §0.5.1、§0.6；`02` §2.4；`04` §4.6.3、§4.6.6、§4.6.7、§4.18.3；
  - `05` §5.3.1、§5.3.3、§5.3.5、§5.3.6、§5.4.1、§5.6.5、§5.7.1、§5.7.3、§5.10、§5.11.1、§5.11.2；
  - `06` §6.1.6、§6.2.3、§6.2.4、§6.4.3；`07` §7.3.2、§7.7.1、§7.10.3；
  - `08` §8.4、§8.8、§8.13.3；`09` §9.11；
  - `10` §10.1.2、§10.3.1、§10.7.1、§10.8.1、§10.8.3、§10.8.4；
  - `11` §11.3.1、§11.7.0、§11.7.1、§11.8.2；`12` §12.5.4、§12.6.5、§12.12；`14` §14.3.4；
  - `16` §16.1.1、§16.1.6、§16.1.13、§16.1.14、§16.5。
  - 改正四处：ADR-211 起初把 `Tower-Human-Edit` 的列举写作 “§10.6 前”（实在 §10.3.1），把 `12` 人工编辑实况行写作 §12.6（实在 §12.6.5），把 landmark 行写作 `16` §16.1.12（实在 §16.1.6），并把 `10` 的 Projector 断言引用从 `06` §6.2 改为 §6.2.3。
- **去重例外的范围**：起初把 `agent_bg_done` 整体豁免于去重，与 `10` §10.8.4 第 7 步 “与 `safety` 同树时按去重记在该检查点上”（ADR-184）冲突；改为只豁免 settle 第 4 步的 `agent_bg_done`，`16` §16.1.6 同步。
- **G46 的 M2 排除**：观察 3 原说 (al)、(au) 两组都需要 M2。核对后 (al) 整组以 M2 的 Scratch 为前提；(au) 只有 “（M2）web 端” 一组，其余（`unattended:"wait"` 下的 `dismiss`、`spike` 预设的写入归类）属 M1。因此表头与 SP6b 行写作 “(al)、(au) 的 web 端一组”。

与第 82 轮相比的计数变化：
- ADR 210 → 211；section_refs 7117 → 7261。
- (z′) 35 → 47 处、未标 0：新增的按行检查共 12 处，都带 M2（主要在 `06` §6.4.3 的 `goal.rewind`/`goal.fork`、`run.rewind`、`run.fork_goal` 三行，`16` §16.5 回退与分叉一行，`08` §8.13.3 就绪动作）。
- (e) 201 → 203 对：ADR-211 Amends ADR-127 与 ADR-210，两者标题都已补 “Amended by ADR-211”。
- (r′) 50 → 53 对：新增 3 对，其中两对是 `07` §7.3.2 的两处（L281、L285）与 `10` §10.7.1 第 1 步新增的 “忽略规则不追溯” 一句（L744）互指。各对的取值一致，差异 0。
- (D) 288 → 300 个短语：`16` §16.1.13 新增第 83 轮一行（L634），含 12 个可检短语，命中 0。
- (O) 33 → 34 行：`08` §8.8 新增 `stalled`（`human_checkout_lost`）一行，每个出口一个类别。
- (w) 仍为 0：`stalled` 是已登记的 kind，`08` §8.4 补该子类型的去重键 `st:{goalId}:human_checkout`。
- (s) 仍为 8/8：没有新增 landmark、Goal 状态、暂停原因、决定种类、检测器或 `verifyOrigin` 取值；`stalled` 的子类型不在三方枚举中。
- (i) 仍为 31 个事件名、0：`checkpoint.created` 只补写载荷形状。
- (v) 仍为 97 条命令：命令行只加了 M2 标注，没有增删命令。
- (u) 仍为 0：G21 从 B1 移到 B3，批次表与 SP6b 行的用例集合一致。
- (C) 仍为 19 行、0，已核对到第 83 轮的数值：
  - W6 9.17 → 9.19（Agent），W10 10.50 → 10.51（安全 7.90 → 7.91），W13 6.91 → 6.92，W16 3.09 → 3.10，功能合计 123.12；
  - 角色容量表 Agent 26.55 / 26.15 / 28.77，设计 28.76 / 25.76 / 28.34，安全 13.62 / 13.12 / 14.43 / 28.86；范围句 “第 83 轮后…28.34–28.88”；
  - 结论与甘特图的余量：Agent 0.23、设计 0.66、安全 0.14；
  - 增人算式 28.77 + 28.88 + 28.64 + 28.34 + 14.43 = 129.06，T = 131.06 / 5.5 = 23.83；
  - §14.8：Agent 行 W6（9.19）、合计 26.55；设计行 W13（6.92）、W16（3.10）、合计 28.76；安全行 W10（7.91）、合计 13.62；
  - ADR-133 第 83 轮补记的角色合计与余量。
- 其余各项计数不变，全部为 0。

```
headings=566 adrs=211 section_refs=7261 problems=0
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
(z′) M2 capability phrases in M1 tables: 47 occurrences, unmarked=0, UNPARSABLE=0
(c) continuation literal shape vs 02=0
(d) deleted mechanism names outside history=0
(n) contract-test references=0
(k) 03 §3.2.1 rewrite targets vs 06 §6.4.3=0
(s′) enum values used in rule text / pseudo-code outside the registered set=0
(e) ADR back-markers: 203 supersede/amend pairs, missing=0
(r′) mutual “一致/唯一定义” claims: 53 pairs, differing values=0
(q) verbatim-quote mismatches=0
(p) 16 §16.8 copy cells without 规则 5: 10 copy cells, missing=0, UNPARSABLE=0
(P) 16 §16.8 role-column copies (per column): 8 role cells with copies, missing=0, UNPARSABLE=0
(i) event names in per-document event tables vs 16 §16.1.14: 31 names, not in index=0, UNPARSABLE=0
(D) superseded phrases of 16 §16.1.13 outside history: 300 phrases, hits=0, UNPARSABLE=0
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
