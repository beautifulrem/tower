# 第 108 轮 lint

`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH` → exit 0（ADR-236 落地后；headings 566，ADR 236，section_refs 10296，problems 0）。从 `docs/` 运行。

**本轮改动了 lint 脚本**（`reviews/lint/xref.py`，R108 §5 观察 14）：(d) 的 ADR-235 三项——`short-lived probe Host`、`volume-name mount heuristic`、`automatic checkout discovery`——加入 `DELETED_STRICT`。非严格模式下，匹配前后窗口中的 “不再” 等宽松历史词即可豁免，而 “不再发起新的” 这类说法在现行正文中常见，所以同一句插在 `13` §13.5 时不报。严格模式只认匹配之外的真实历史标记（HIST、`第 N 轮`、撤回、已删除、Supersedes、旧的）。改为严格模式之后，正文中这三项的命中仍为 0。

各项的变化：
- **(D)**：644 → 657 个短语。第 108 轮一行（`16:659`）登记 13 个被取代的说法：“整个 Project 判为不可达”“整条推迟到可达”“适配器要求设置时为有限的非负数”“Host 的运行时不能代它判定”“服务该 Goal 而仍存活的 Host”“服务该目标的 Host 存活期间”“3 个目标将暂停，下次启动自动恢复”“外接盘未挂载时其 Project 判为不可达”“添加项目时计算一次”“只在下述对账的差值中出现”“作用于这一次调用与下一次 turn_start 之前 Pi 发出的”“工具被阻断（fail-safe）；连续 3 次则暂停”“从远端克隆（normalizedRemote）到新位置并重新附着”。写这一行之前逐个检查过：在 `00`–`14`、`16`（§16.1.13 之外）与 README 中都为 0。“服务它的 Host 存活期间” 没有登记：C39（`05` L1500）描述的是专用模式下的测试情形，写法正确。第 107 轮一行（`16:658`）的新栏改为现行写法（“第 108 轮起按 Goal 判定”“F8 复查不含不可访问的 `<wtRoot>`”）。
- **(e)**：290 → 291 对，即 ADR-236 的 “Amends ADR-235” 与 ADR-235 标题的 “Amended by ADR-236”。
- **(v)**：99 → 100 条命令，仅本机 24 → 25 条：新增 `project.relocate`（`06` §6.4.3 scope “仅本机”），已列入 `06` §6.4.7 “禁止远程的命令” 与 `16` §16.5 “仅本机” 一行。
- **(C)**：WBS 124.36，19 行；W4 4.69、W6 9.34、W7 26.70（系统 14.15）；角色容量表、范围句、结论的余量、甘特图余量、增人加法式、§14.8 与 `15` 第 108 轮补记一致。
- **(s)、(w)、(w′)、(k′)、(O)、(i)** 集合不变：不新增暂停原因、Needs-You kind、`wait_reason` 值或事件类型。`project.relocate` 记的是已有的事件 `binding.reattached`。
- **(A)** 仍为 7 个进程行：按挂载点的 `worker_thread` 在 Supervisor 进程内，不是新进程。
- **(n)**：C43 的改动在 `05` §5.11 中，引用为 0。

**变异检查**（在 `/tmp` 的副本上做，正文未改动；四处一并改动后运行一次）：
- **(d)**：在 `13` §13.5 的 “同一路径上一次检查未返回时不再发起新的。” 之后写入 “探测按正常的 Host 启动路径为探测起一个短时 Host。”，报 `DELETED_NAME short-lived probe Host 13:130`（两处匹配）。用改动之前的脚本（非严格）在同一副本上运行，(d) 为 0，即评审观察 14 所说的漏报；改为严格模式之后报出。
- **(D)**：在 `06` §6.1.6 隐私清除一行写回 “整条推迟到可达”，报 `SUPERSEDED_PHRASE 06:143`（第 108 轮一行，`16:659`）；上一条的插入同时报 `SUPERSEDED_PHRASE 13:130`（第 107 轮一行）。
- **(v)**：从 `06` §6.4.7 删去 `project.relocate`，报 `LOCAL_NOT_IN_6_4_7 project.relocate`。
- **(C)**：把 `14` W4 改为 4.70，共报 6 项：`TEAM_TABLE 14 §14.8 桌面 W4 4.69 ≠ §14.3.4 4.70`、`TEAM_TABLE 14 §14.8 桌面 合计`、`WBS_TOTAL 124.36 ≠ 124.37`、`CAPACITY_TOTAL 桌面`、`ADR133_ROLE_TOTAL 15 第 108 轮 桌面`、`ADR133_TOTAL 15 第 108 轮`。

本轮引用的位置都已核对：
- **节号**（lint 的 section_refs 覆盖 `00`–`14`、`16` 与 README）：`03` §3.2.1；`04` §4.8.11、§4.15、§4.16 F12、§4.18.3；`05` §5.3.6、§5.6.5、§5.11.1 D63、C43；`06` §6.1.4、§6.1.6、§6.1.8、§6.2.4、§6.2.5、§6.4.3、§6.4.7、§6.7、§6.8 F4b、F8、F13；`07` §7.4.1；`08` §8.1；`09` §9.12.4；`10` §10.1.1、§10.2、§10.3、§10.3.0、§10.4.3、§10.12、§10.16.1、§10.16.2；`11` §11.7.1；`12` §12.6.5；`13` §13.5；`14` §14.1、§14.3.4、§14.8、G35e (q)；`16` §16.1.1、§16.1.13、§16.2.6、§16.5。
- **Pi 行号**（v1.2.0，`git show v1.2.0:<path>`，`packages/coding-agent/src/` 下，另注 `ai`）：
  - `core/sdk.ts:345-350, 427-430`；`core/agent-session.ts:1204, 3795`；`core/compaction/compaction.ts:15, 638`；`core/cache-warmer.ts:16-20, 245-257, 286-297`；`core/resolve-config-value.ts:9-10, 208-216, 221-231`；`core/provider-composer.ts:466-467`；
  - `ai/src/utils/retry.ts:72-73, 198, 218`；`ai/src/api/anthropic-messages.ts:641`、`openai-completions.ts:372`、`openai-responses.ts:180`、`openai-codex-responses.ts:192-198, 398, 409`；`packages/ai/package.json`（`@anthropic-ai/sdk` 0.129.0、`openai` 7.19.0）。
- **厂商 SDK**（Pi v1.2.0 所钉的版本，以 `npm pack` 取得、只读核对）：`@anthropic-ai/sdk` 0.129.0 `internal/utils/values.js:48-56`、`client.js:663-675, 808`；`openai` 7.19.0 `internal/utils/values.js:47-55`、`client.js:996, 1146`。

```
headings=566 adrs=236 section_refs=10296 problems=0
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
(e) ADR back-markers: 291 supersede/amend pairs, missing=0
(r′) mutual “一致/唯一定义” claims: 65 pairs, differing values=0
(q) verbatim-quote mismatches=0
(p) 16 §16.8 copy cells without 规则 5: 10 copy cells, missing=0, UNPARSABLE=0
(P) 16 §16.8 role-column copies (per column): 8 role cells with copies, missing=0, UNPARSABLE=0
(i) event names in per-document event tables vs 16 §16.1.14: 31 names, not in index=0, UNPARSABLE=0
(i′) full-row and path-list payload events vs the 13 §13.9.1 cap (06 §6.3 rule): 5 events, unhandled=0, UNPARSABLE=0
(D) superseded phrases of 16 §16.1.13 outside history: 657 phrases, hits=0, UNPARSABLE=0
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
