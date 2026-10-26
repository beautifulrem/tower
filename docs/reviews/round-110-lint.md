# 第 110 轮 lint

`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH` → exit 0（ADR-238 落地后；headings 566，ADR 238，section_refs 10542，problems 0）。从 `docs/` 运行。

**本轮没有改动 lint 脚本**：ADR-238 没有删除具名机制（删去的是写法——人工编辑检出本身作为必需路径、失败先判可达中的影子与叶目录、路径丢失确认的 “唯一不可访问的必需路径”），由 (D) 覆盖；(d) 仍为 49 项。

各项的变化：
- **(D)**：669 → 677 个短语。第 110 轮一行（`16:661`）登记 8 个被取代的说法：“仍按原路径计”“与 pin 所在的影子”“验证不读的附着检出”“且它是该 Goal 唯一不可访问的必需路径”“只有人工编辑检出或检验检出不可访问时”“只能放弃，检验目录与影子中的检查点都保留”“只含根的路径与清除时间”“启动时未自动解除后”。写这一行之前逐个检查过：在 `00`–`14`、`16`（§16.1.13 之外）与 README 中都为 0，`07` §7.4.1 的一处带 “ADR-238 更正此前” 的历史标记。第一次运行时 (D) 报出 `SUPERSEDED_PHRASE 09:575 其下 Tower 创建的目录`（旧栏引了一个仍在使用的短语），改为不加引号的描述后为 0。
- **(z′)**：第一次运行报出 `M2_CAPABILITY_UNMARKED 06 139 回退 + 接管`（“回退位置的验证槽位” 与同句的 “接管物化” 相邻）；改写为 “位于 `~/.tower` 之内的验证槽位” 后为 0，仍为 53 处。
- **(e)**：292 → 294 对，即 ADR-238 的 “Amends ADR-237、ADR-236” 与两者标题的 “Amended by ADR-238”。
- **(r′)**：65 → 66 对（新增的 “唯一定义” 引用对，取值一致）。
- **(v)**：仍为 100 条命令、仅本机 25 条：本轮没有新命令（`从列表移除` 是存储面板 “清理工作目录” 中的一项，同该操作）。
- **(C)**：WBS 124.48，19 行；W6 9.36、W7 26.79（系统 14.24）；角色容量表（Agent 28.95、系统 29.03、桌面 29.05、设计 29.06、安全 14.45）、范围句（28.90–29.06）、结论的余量（系统 0.97、Agent 1.05、桌面 0.95、设计 0.94、安全 1.10）、甘特图余量、增人加法式（130.54，T 24.10）、§14.8 与 `15` 第 110 轮补记一致；ADR-038〔当前值〕仍为 39 周、2027-08-06。
- **(s)、(w)、(w′)、(k′)、(O)、(i)** 集合不变：不新增暂停原因、Needs-You kind、`wait_reason` 值或事件类型（F13 的第三次暂停沿用 `prepare_failed` 已登记的 `running` 来源）。
- **(o)**：`02` §2.3 `relocatedFrom` 只改了注释，字段不变；比较的 8 行不变。
- **(n)**：C5 的改动在 `05` §5.11 中，引用为 0。

**变异检查**（在 `/tmp` 的副本上运行副本中的脚本，正文未改动；三处一并改动后运行一次，副本已删除）：
- **(D)**：在 `06` §6.1.6 Project 不可达一行写回 “人工编辑检出仍按原路径计”，报 `SUPERSEDED_PHRASE 06:139 仍按原路径计`（`16:661`）。
- **(e)**：删去 ADR-237 标题的 “Amended by ADR-238”，报 `NO_BACK_MARKER ADR-237`。
- **(C)**：把 `14` W7 改为 26.80（系统 14.25），共报 6 项：`TEAM_TABLE 14 §14.8 系统 W7 14.24 ≠ §14.3.4 14.25`、`TEAM_TABLE 14 §14.8 系统 合计`、`WBS_TOTAL 124.48 ≠ 124.49`、`CAPACITY_TOTAL 系统`、`ADR133_ROLE_TOTAL 15 第 110 轮 系统`、`ADR133_TOTAL 15 第 110 轮`。

本轮引用的位置都已核对：
- **节号**（lint 的 section_refs 覆盖 `00`–`14`、`16` 与 README）：`02` §2.3、§2.4；`03` §3.2.1；`04` §4.6.7、§4.15、§4.18.3；`05` §5.3.6、§5.5、§5.6.5、§5.9、§5.11 C5；`06` §6.1.6、§6.4.3、§6.6.1、§6.8 F4、F13；`07` §7.4.1、§7.4.6；`08` §8.6.3；`09` §9.12.4；`10` §10.2、§10.3.2、§10.8.4、§10.16.2；`11` §11.7.1；`12` §12.6.5；`13` §13.5；`14` §14.3.4、§14.8、G31、G35e (q)；`16` §16.1.1、§16.1.7、§16.1.12、§16.1.13、§16.2.6。
- **Pi 行号**（v1.2.0，`git show v1.2.0:<path>`，`packages/coding-agent/src/` 下）：`core/extensions/runner.ts:1128, 1137-1143, 1190-1247, 1197-1233, 1201-1204, 1223-1233, 1236-1238, 1249-1267`；`core/http-dispatcher.ts:19-34`。

```
headings=566 adrs=238 section_refs=10542 problems=0
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
(v) remote-matrix coverage problems=0 (commands in 06 §6.4.3: 100; local-only checked against 06 §6.4.7: 25)
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
(e) ADR back-markers: 294 supersede/amend pairs, missing=0
(r′) mutual “一致/唯一定义” claims: 66 pairs, differing values=0
(q) verbatim-quote mismatches=0
(p) 16 §16.8 copy cells without 规则 5: 10 copy cells, missing=0, UNPARSABLE=0
(P) 16 §16.8 role-column copies (per column): 8 role cells with copies, missing=0, UNPARSABLE=0
(i) event names in per-document event tables vs 16 §16.1.14: 31 names, not in index=0, UNPARSABLE=0
(i′) full-row and path-list payload events vs the 13 §13.9.1 cap (06 §6.3 rule): 5 events, unhandled=0, UNPARSABLE=0
(D) superseded phrases of 16 §16.1.13 outside history: 677 phrases, hits=0, UNPARSABLE=0
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
