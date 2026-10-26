# 第 81 轮 lint

`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH` → exit 0（ADR-209 落地后；headings 566，ADR 209，section_refs 7026，problems 0）。从 `docs/` 与从 `/Volumes/Remi/Project` 运行，输出逐行相同。

中途命中并改正的：
- 第一次写 `16` §16.1.13 第 81 轮一行时，左列把“运行准备步骤”放在引号中，(D) 把它收为被取代的短语，命中 7 处现行文字（`00`、`04`、`06`、`10`、`14`、`16`）。这个按钮名是现行术语，改为不加引号的叙述后归零。
- 人工复查节号：新增引用（`02` §2.14；`03` §3.1、§3.2；`04` §4.6.4、§4.6.7、§4.15.1；`05` §5.3.6；`06` §6.4.3；`07` §7.4.3；`08` §8.3.4、§8.5.2、§8.5.3、§8.7.2；`10` §10.1.2、§10.2、§10.7.1、§10.8.3、§10.8.4、§10.10、§10.11；`11` §11.3.1、§11.6.2、§11.7.0；`12` §12.5.4、§12.6.2；`16` §16.1.13、§16.5）逐条核对所在小节。ADR-209 草稿中的四处节号（`04` §4.4.4 → §4.6.4 两处、`12` §12.6 → §12.6.2、`12` §12.4 → §12.5.4）与 `11` 投递表新行、ADR-209 观察 2 中的 `11` §11.6.2 → §11.3.1（密钥路径表在 §11.3.1）在复查时改正。

本轮没有改动 lint。评审 §3.1 的两条建议：
- **批次中用例的手机 / 远程客户端 / web 端步骤要求 M2 标记**：没有实现。本轮人工扫描 SP6b 批次表 B0–B4 中的用例，补标 G33f (d)(f) 与 G32b，并在 SP6b 行写明这些步骤属 M2。实现为检查项需要可靠地区分“M1 中已标 M2 的同句”与“预期中描述远程被拒的句子”，误报面与 (z′) 相近，留作后续。
- **按钮文案与 `06` §6.4.3 的对照清单**：没有实现。本轮人工核对 `04`、`10` 中 `[...]` 形式的按钮，唯一缺命令的是“在验证器沙箱中运行准备步骤”，已补 `human_checkout.run_prepare`。

与第 80 轮相比的计数变化：
- ADR 208 → 209；section_refs 6956 → 7026。
- (v) 97 → 98 条命令：`06` §6.4.3 新增 `human_checkout.run_prepare`（`full（仅本机）`），`16` §16.5 单列为 ✗，`06` 禁止远程一行补列。
- (e) 199 → 200 对：ADR-209 Amends ADR-208，ADR-208 标题已补 “Amended by ADR-209”。
- (D) 263 → 275 个短语：`16` §16.1.13 新增第 81 轮一行，含 12 个可检短语：
  - “在上一个检查点记录的 L 中”；
  - “它是人的文件”；
  - “只在卫星创建到第一个变更回合之间”；
  - “base 版本仍在树中”；
  - “你的文件，可能经 Agent 修改”；
  - “已复制到工作目录的副本将被删除”；
  - “非机密，已批准”；
  - “检验检出存在期间”；
  - “检验目录存在即按已打开的检验处理”；
  - “原因清除只限由 pin 推导者”；
  - “在远程客户端上修订合同”；
  - “期间在手机上批准”。
  - 已逐条 grep 核对：除 `15`（历史）与 §16.1.13 本行外没有出现。
- (s) 仍为 8/8：`Checkpoint landmark` 没有新增取值，pin 之前的检查点复用已有的 `safety`。
- (i) 仍为 31 个事件名、0：`human_checkout.run_prepare` 不产生新事件类型，验收或放弃触发的清理复用已登记的 `inspect.closed`。
- (z′) 仍为 35 处、未标 0：G33f、G32b 的新 M2 标记写在同一句中。
- (C) 仍为 19 行、0，并且已核对到第 81 轮的数值：
  - W12 9.14 → 9.15（设计 7.53 → 7.54）、W13 6.90 → 6.91、W16 3.05 → 3.07，功能合计 123.06；
  - 角色容量表设计行 28.73 / 25.73 / 28.30；冻结前所需范围句 “第 81 轮后…28.30–28.88”；
  - 结论余量设计 0.70；甘特设计行余量 0.70；
  - 增人算式 28.74 + 28.88 + 28.64 + 28.30 + 14.42 = 128.98，T = 130.98 / 5.5 = 23.81；
  - §14.8 设计行 W12（7.54）、W13（6.91）、W16（3.07）、合计 28.73；
  - ADR-133 第 81 轮补记的角色合计与余量。
- 其余各项计数不变，全部为 0。

```
headings=566 adrs=209 section_refs=7026 problems=0
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
(z′) M2 capability phrases in M1 tables: 35 occurrences, unmarked=0, UNPARSABLE=0
(c) continuation literal shape vs 02=0
(d) deleted mechanism names outside history=0
(n) contract-test references=0
(k) 03 §3.2.1 rewrite targets vs 06 §6.4.3=0
(s′) enum values used in rule text / pseudo-code outside the registered set=0
(e) ADR back-markers: 200 supersede/amend pairs, missing=0
(r′) mutual “一致/唯一定义” claims: 50 pairs, differing values=0
(q) verbatim-quote mismatches=0
(p) 16 §16.8 copy cells without 规则 5: 10 copy cells, missing=0, UNPARSABLE=0
(P) 16 §16.8 role-column copies (per column): 8 role cells with copies, missing=0, UNPARSABLE=0
(i) event names in per-document event tables vs 16 §16.1.14: 31 names, not in index=0, UNPARSABLE=0
(D) superseded phrases of 16 §16.1.13 outside history: 275 phrases, hits=0, UNPARSABLE=0
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
