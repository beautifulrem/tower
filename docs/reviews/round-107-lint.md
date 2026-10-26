# 第 107 轮 lint

`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH` → exit 0（ADR-235 落地后；headings 566，ADR 235，section_refs 10153，problems 0）。从 `docs/` 运行。

**本轮改动了 lint 脚本**（`reviews/lint/xref.py`）：(d) 的 `DELETED` 列表新增三项，都可以出现在 `15`、`16` §16.1.13 左栏或历史标记旁（DEL_OK）：
- `short-lived probe Host`（`短时 ?(?:探测 ?)?Host|为探测起(?:的|一个)`，ADR-235）：R107-D5-01 删除了为探测另起的 Host；
- `volume-name mount heuristic`（`/Volumes/<卷名>|当前不是已挂载的卷|注明 \`卷未挂载\`|· 卷未挂载`，ADR-235）：R107-D13-01/02 以 Project 不可达规则取代按卷名判别的一行；
- `automatic checkout discovery`（`mdfind -name \.git|按 \`Project\.identity\` 在最近打开`，ADR-235）：情形 C 的自动查找删除。

`16` §16.1.13 的新栏也按 (d) 检查（不带历史豁免）。第 106 轮一行（`16:657`）的新栏原写 “同组空闲的 Host，或为探测起的短时 Host” 与 “`<wtRoot>` 所在卷未挂载时不判为丢失”，已改为现行写法（“同组已存活的空闲 Host，不为探测另起”“Project 不可达时不判为丢失”），否则新增的 DELETED 项会在新栏中命中。

各项的变化：
- **(D)**：632 → 644 个短语。第 107 轮一行（`16:658`）登记 12 个被取代的说法：“按正常的 Host 启动路径为探测起一个短时 Host”“每个打包分组至多一个、只存在于一次探测的时长”“应用重启后探测从 60 s 重新开始”“恢复后提示继续”“恢复网络后提示继续”“两者中较小的起作用”“当前不是已挂载的卷”“复查中求不出剩余空间的卷”“挂载它后自动恢复，不再使用该卷时请重启 Tower”“后缀追加与消失时”“在最近打开过的目录与 Spotlight”“运行中的 Goal 不受影响”。写这一行之前逐个检查过（同 (D) 的取法）：在 `00`–`14`、`16`（§16.1.13 之外）与 README 中都为 0。没有登记 “已中止（磁盘已满）· 释放空间后恢复”：G35e (q) 中条件成立的一组仍正确地写它。
- **(e)**：287 → 290 对，即 ADR-235 的 “Amends ADR-234、ADR-233、ADR-207” 与三者标题的 “Amended by ADR-235”。
- **(C)**：WBS 124.30，19 行；W4 4.67、W6 9.33、W7 26.67（系统 14.12）；角色容量表、范围句、结论的余量、甘特图余量、增人加法式、§14.8 与 `15` 第 107 轮补记一致。
- **(v)** 仍为 99 条命令（本轮不新增命令：`提供方可能已恢复？[重试]` 用已有的 `goal.resume`，切换模型用已有的 `engine.set_prefs` 与 `goal.resume`）。
- **(s)、(w)、(w′)、(k′)、(O)、(i)** 集合不变：不新增暂停原因、Needs-You kind、`wait_reason` 值或事件类型。`project_unreachable` 是 `Run.outcomeReason`（开放字符串）的已用值，不是暂停原因；`Project 不可达` 是卡片注明，准入检查 i 的一项仍记为 `waitReason = slot`。
- **(A)** 仍为 7 个进程行：可达性检查的 `worker_thread` 在 Supervisor 进程内，不是新进程。
- **(n)**：C39、C43 的改动都在 `05` §5.11 中，引用为 0。

**变异检查**（在 `/tmp` 的副本上做，正文未改动）：
- **(d)**：在 `13` §13.5 写入 “探测在短时 Host 中执行。”，把 `12` §12.6.5 的 `就绪 · Project 不可达` 改回 `就绪 · 卷未挂载`，分别报 `DELETED_NAME short-lived probe Host 13:131` 与 `DELETED_NAME volume-name mount heuristic 12:416`。（第一次变异时正则写成 `短时(?:探测 ?)?Host`，漏了 “短时” 与 “Host” 之间的空格，没有报出；改为 `短时 ?(?:探测 ?)?Host` 之后报出。）
- **(D)**：在 `05` §5.3.6 写回 “两者中较小的起作用”，报 `SUPERSEDED_PHRASE 05:474`（第 107 轮一行，`16:658`）。
- **(C)**：把 `14` W4 改为 4.68，共报 6 项：`TEAM_TABLE 14 §14.8 桌面 W4 4.67 ≠ §14.3.4 4.68`、`TEAM_TABLE 14 §14.8 桌面 合计`、`WBS_TOTAL 124.30 ≠ 124.31`、`CAPACITY_TOTAL 桌面`、`ADR133_ROLE_TOTAL 15 第 107 轮 桌面`、`ADR133_TOTAL 15 第 107 轮`。

本轮引用的位置都已核对：
- **节号**（lint 的 section_refs 覆盖 `00`–`14`、`16` 与 README）：`02` §2.6；`03` §3.2.1；`04` §4.18.1、§4.18.3；`05` §5.3.6、§5.6.5、§5.11.1 D63、D64、C39、C43；`06` §6.1.1、§6.1.4、§6.1.6、§6.1.8、§6.2.4、§6.2.5、§6.3、§6.4.3、§6.8 F4b、F6、F7、F8、F13；`08` §8.6.5；`10` §10.1.1、§10.3.1、§10.16.1、§10.16.2；`11` §11.7.1；`12` §12.6.4、§12.6.5、§12.8、§12.13.3；`13` §13.5；`14` §14.1、§14.3.4、§14.8、G35e (q)、G46 (d)；`16` §16.1.1、§16.1.4、§16.1.12、§16.1.13、§16.2.6。
- **Pi 行号**（v1.2.0，`git show v1.2.0:<path>`，`packages/coding-agent/src/` 下，另注 `ai`）：
  - `core/sdk.ts:340-353, 420-421, 427-429`；`core/settings-manager.ts:147-156, 891-898, 900-901, 913-917, 925-932, 934-936`；`core/settings-defaults.ts:60`；
  - `ai/src/utils/provider-retry.ts:111-125`；`ai/src/utils/retry.ts:73, 198, 218`；`ai/src/api/anthropic-messages.ts:641, 655-661`；
  - `core/cache-warmer.ts:296, 330-339, 342-348`；`core/extensions/runner.ts:1096-1125`；`core/model-runtime.ts:634-640`；`core/resource-loader.ts:781`；`extensions/mcp/runtime.ts:48, 210-211, 363`。

```
headings=566 adrs=235 section_refs=10153 problems=0
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
(v) remote-matrix coverage problems=0 (commands in 06 §6.4.3: 99; local-only checked against 06 §6.4.7: 24)
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
(e) ADR back-markers: 290 supersede/amend pairs, missing=0
(r′) mutual “一致/唯一定义” claims: 65 pairs, differing values=0
(q) verbatim-quote mismatches=0
(p) 16 §16.8 copy cells without 规则 5: 10 copy cells, missing=0, UNPARSABLE=0
(P) 16 §16.8 role-column copies (per column): 8 role cells with copies, missing=0, UNPARSABLE=0
(i) event names in per-document event tables vs 16 §16.1.14: 31 names, not in index=0, UNPARSABLE=0
(i′) full-row and path-list payload events vs the 13 §13.9.1 cap (06 §6.3 rule): 5 events, unhandled=0, UNPARSABLE=0
(D) superseded phrases of 16 §16.1.13 outside history: 644 phrases, hits=0, UNPARSABLE=0
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
