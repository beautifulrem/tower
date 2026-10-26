# 第 82 轮 lint

`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH` → exit 0（ADR-210 落地后；headings 566，ADR 210，section_refs 7117，problems 0）。从 `docs/` 与从 `/Volumes/Remi/Project` 运行，输出逐行相同。

本轮改动 lint 一处：(d) 的 `DELETED` 补两项（`reviews/lint/xref.py` 第 850–854 行）。
- **准备命令（M2）**：`human_checkout\.run_prepare|在验证器沙箱中运行准备步骤`。出现处必须在旁边带 M2 或历史标记（`DEL_OK`）。
  - 现存的出现只有 `14` §14.3.4 的 W12 行与第 81 轮增量段两处，都已带“第 82 轮删除”。
  - `16` §16.1.13 第 81 轮一行的“新说法”列原写 `human_checkout.run_prepare`（仅本机），(d) 对新说法列不豁免，已改为“人工编辑面板的准备命令（第 82 轮推迟到 M2，ADR-210）”。
- **“只链接 + auth.json”**：`只链接\s*`?auth\.json`，即评审 §3.1 的建议。(D) 不收录含反引号的短语，这条改用与文件无关的匹配。`05` §5.10 的残留已删去，现存出现只在 §16.1.13 的旧说法列中。

中途命中并改正的：
- **(r′) 少了一对（50 → 49）**：`10` §10.7.2 “影子的唯一写者” 一句的括注里写进了 “；”，把 “唯一定义” 与 `06` §6.2 的引用切进了两个子句，使它与 `06` §6.2 GitService 一行的互指不再成对。括注改为 “检查点 `cp/<n>`（含 landmark 为 `safety` 的检查点）、pin、seal” 后恢复为 50 对。
  - 逐对比较过改动前后的配对集合，其余差异都只是删行带来的行号平移。
- **人工复查节号**：逐条核对了新增的引用，均在所指的小节内：
  - `00` §0.5.1；`03` §3.2.1；
  - `04` §4.6.6、§4.6.7、§4.7.3、§4.15.1、§4.18.1、§4.19；
  - `05` §5.3.5、§5.3.6、§5.10；
  - `06` §6.4.3、§6.4.7；
  - `07` §7.2.4、§7.3.3、§7.4.1；
  - `08` §8.5.3；
  - `10` §10.1.2、§10.2、§10.3.1、§10.7.1、§10.7.2、§10.8.1、§10.8.3、§10.8.4；
  - `11` §11.6.2、§11.8.2；`12` §12.5.4；`13` §13.11.1；`16` §16.1.12、§16.1.13、§16.5。
  - 改正一处：`12` §12.5.4 新示例注明 “待验收中的事实变旧会立即回到验证中”，引用起初写作 `07` §7.2.4，改为新鲜度判定所在的 §7.3.3。

评审 §3.1 的建议：
- **(D) 的可检短语改为与文件无关的核心片段**：已实现。实现方式是 (d) 的 `DELETED` 一项，见上。
- **扫描 SP6b 批次中用例的 “回退”“自动 rebase”“fork”“web 端”“手机”“远程客户端”**：没有实现。理由同第 81 轮：这些词也出现在描述 “远程被拒” 或 “M2 中另行处理” 的预期句里，误报面与 (z′) 相近。
  - 本轮以人工扫描 B1–B4 中的用例代替，补标三处：
    - G21 的回退与自动 rebase 一组；
    - G33d (f) 的 web 客户端一组；
    - G35c (p) 的分叉一组。
  - SP6b 行（`14` L31）补列这三处。

与第 81 轮相比的计数变化：
- ADR 209 → 210；section_refs 7026 → 7117。
- (v) 98 → 97 条命令：`06` §6.4.3 删去 `human_checkout.run_prepare`，§6.4.7 禁止远程一行与 `16` §16.5 同步删去。
- (e) 200 → 201 对：ADR-210 Amends ADR-209，ADR-209 标题已补 “Amended by ADR-210”。
- (D) 275 → 288 个短语：`16` §16.1.13 新增第 82 轮一行（L633），含 13 个可检短语：
  - “在验证器沙箱中运行准备步骤”；
  - “[打开] [只复制文件] [取消]”；
  - “授权后检验”；
  - “在每次 fetch 新 base 时刷新”；
  - “在 Tower 下一次获取 base 时生效”；
  - “settle 第 4 步的 agent_bg_done 检查点，其树 = pin 的树”；
  - “跳过第 0 步与第 7 步”；
  - “运行中的观察器指纹与 Fact 新鲜度”；
  - “示例为待验收中的目标”；
  - “透支期间同一 Goal 的其他 severity 2 条目一律只进收件箱”；
  - “随后人执行回退、Tower 自动 rebase、检查点”；
  - “在 D 与 E 的卡片上各点一次”；
  - “刷新之前 D 的检查点不含”。
- (d)：`DELETED` 多两项，命中 0。
- (s) 仍为 8/8：`Checkpoint landmark` 没有新增取值。`safety` 检查点的 ref 统一为 `cp/<n>`，landmark 不变。
- (i) 仍为 31 个事件名、0：非回合检查点复用已登记的 `checkpoint.created`。
- (z′) 仍为 35 处、未标 0：G21、G33d (f)、G35c (p) 的 M2 标记写在同一句中。
- (C) 仍为 19 行、0，已核对到第 82 轮的数值：
  - W12 9.15 → 9.14（设计 7.54 → 7.53），W16 3.07 → 3.09，功能合计 123.07；
  - 角色容量表设计行 28.74 / 25.74 / 28.31；范围句 “第 82 轮后…28.31–28.88”；
  - 结论与甘特设计行的余量 0.69；
  - 增人算式 28.74 + 28.88 + 28.64 + 28.31 + 14.42 = 128.99，T = 130.99 / 5.5 = 23.82；
  - §14.8 设计行 W12（7.53）、W16（3.09），合计 28.74；
  - ADR-133 第 82 轮补记的角色合计与余量。
- 其余各项计数不变，全部为 0。

```
headings=566 adrs=210 section_refs=7117 problems=0
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
(e) ADR back-markers: 201 supersede/amend pairs, missing=0
(r′) mutual “一致/唯一定义” claims: 50 pairs, differing values=0
(q) verbatim-quote mismatches=0
(p) 16 §16.8 copy cells without 规则 5: 10 copy cells, missing=0, UNPARSABLE=0
(P) 16 §16.8 role-column copies (per column): 8 role cells with copies, missing=0, UNPARSABLE=0
(i) event names in per-document event tables vs 16 §16.1.14: 31 names, not in index=0, UNPARSABLE=0
(D) superseded phrases of 16 §16.1.13 outside history: 288 phrases, hits=0, UNPARSABLE=0
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
