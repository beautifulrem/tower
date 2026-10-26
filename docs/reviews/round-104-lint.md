# 第 104 轮 lint

`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH` → exit 0（ADR-232 落地后；headings 566，ADR 232，section_refs 9834，problems 0）。从 `docs/` 运行。

本轮没有改动 lint 脚本（`reviews/lint/xref.py`）。

评审 §3.1 的建议按下面处理：
- **观察 7 的 “Azure 配置目录等”**：取评审的写法。`05` §5.3.6 凭据一行删去这一写法（改为 “只有这几个”），并把 `05` L475 的原句 “GOOGLE_APPLICATION_CREDENTIALS、Azure 配置目录等” 登入 `16` §16.1.13 第 104 轮一行（`16` L655），由 (D) 检查。
- **R104-D14-01**：属于语义，lint 不覆盖；G46 的前提与期望改为与 `10` §10.2 的同机写法一致，并另加一次不同机器名的一组。
- **其余六条**：属于语义，lint 不覆盖。被取代的说法一并登入第 104 轮一行，共 15 个短语。
- 本轮不新增暂停原因、Needs-You kind、`wait_reason` 值、事件类型或命令，所以 (s)、(w)、(w′)、(k′)、(O)、(i)、(v) 的集合不变。新增的依赖行 D63、D64 与契约测试 C43、C44 都在 `05` §5.11 中定义，(n) 0。

写第 104 轮一行之前，逐个检查了候选短语在正文中的出现（与 (D) 同一取法，去掉反引号与星号）：15 个短语在 `00`–`14`、`16`（§16.1.13 之外）与 README 中都为 0。`12` §12.8 横幅的旧文字 “数据库只读；释放空间后自动恢复” 没有登记：新文字 “…释放空间后自动恢复可写” 以它为前缀，登记会误报。

改动后做了变异检查（在 `/tmp` 的副本上做，正文未改动）：
- **(D)**：在 `05` §5.3.6 凭据一行写回 “`GOOGLE_APPLICATION_CREDENTIALS`、Azure 配置目录等”，并在 `12` §12.8 写回 “同一时刻屏幕上至多一个自动出现的覆盖层”，报 `SUPERSEDED_PHRASE 05:475` 与 `SUPERSEDED_PHRASE 12:528`（第 104 轮一行，`16:655`）。
- **(C)**：把 `14` W6 改为 9.32，共报 6 项：
  - `TEAM_TABLE 14 §14.8 Agent W6 9.31 ≠ §14.3.4 9.32`；
  - `TEAM_TABLE 14 §14.8 Agent 合计`；
  - `WBS_TOTAL 124.22 ≠ 124.23`；
  - `CAPACITY_TOTAL Agent`；
  - `ADR133_ROLE_TOTAL 15 第 104 轮 Agent`；
  - `ADR133_TOTAL 15 第 104 轮`。

本轮引用的位置都已核对：
- **节号**（lint 的 section_refs 覆盖 `00`–`14`、`16` 与 README）：
  - `00` §0.5.1；`02` §2.6；`04` §4.3.1、§4.3.3、§4.17.3、§4.18.1、§4.18.3；`05` §5.3.5、§5.3.6、§5.10、§5.11.1 D57、D63、D64、C43、C44；
  - `06` §6.1.1、§6.1.4、§6.1.6、§6.1.8、§6.1.9、§6.7、§6.8 F7 与 F8；`08` §8.6.3、§8.10.5；`10` §10.2、§10.3.1；`11` §11.7.1、§11.8.2；`12` §12.6.5、§12.8；
  - `14` §14.3.4、§14.8、G35e (q)、G46 (d) 第八至第十组与租约一组；`16` §16.1.13、§16.2.6。
- **Pi 行号**（v1.2.0，`git show v1.2.0:<path>`，`packages/coding-agent/src/` 下，另注 `ai`）：
  - `core/http-dispatcher.ts:45-50`（`applyHttpProxySettings`）、`:81-113`（`configureHttpDispatcher`：`EnvHttpProxyAgent`、`setGlobalDispatcher`、`undici.install`）；`cli/setup.ts:12`；`main.ts:596-597, 874-875`；`rpc-entry.ts:11`；`modes/interactive/interactive-mode.ts:2063, 5014`；`index.ts` 不导出它（`git grep`）；`package.json` 的 `exports` 只有 `.` 与 `./rpc-entry`，依赖 `undici` 8.10.2；`ai/src/api/bedrock-converse-stream.ts:222-227`；`packages/mcp/src/transports/streamable-http.ts:214`；
  - `core/agent-session-services.ts:139-146, 158-181`；`core/model-runtime.ts:217-268`（`create`，`refreshOnCreate` 在 `:261`）、`:526-528`（`getRegisteredProviderIds`）、`:891-957`（`registerNativeProvider`、`registerProvider`、`unregisterProvider`）；`core/agent-session.ts:3504-3505`（`unregisterProvider` 只经扩展 API 调用）；`ai/src/models.ts:679-680, 683-690`（`:688` 未知 provider 返回 `undefined`）；
  - `core/resolve-config-value.ts:9-10, 88-89, 185-216`（`:213-214` 不分成败一并缓存）、`:229-238`；`core/provider-composer.ts:438-456`（`:447-449` `$VAR` 的变量不存在时返回 `undefined`）、`:467`（`!` 形式每次请求执行）；
  - `core/auth-storage.ts:75-79, 81-115`；`ai/src/providers/amazon-bedrock.ts:48-52, 61-71`；`ai/src/providers/google-vertex.ts:71-72, 85`；`ai/src/auth/helpers.ts:21`；`ai/src/providers/anthropic.ts:31`；`ai/src/providers/cloudflare-auth.ts:50`。

与第 103 轮相比的计数变化：
- ADR 231 → 232；section_refs 9714 → 9834。
- (v) 仍为 99 条命令（不新增命令或字段），§6.4.7 核对 24 条。
- (e) 279 → 282 对：ADR-232 Amends ADR-231、ADR-212、ADR-079，三者标题都已补 “Amended by ADR-232”。
- (r′) 仍为 65 对、差异 0：新的唯一定义 “打包的分组”（`06` §6.1.1）与 “模型请求怎样经过代理”（`05` §5.3.6 代理一行）的引用处只写 “见 `06` §6.1.1 打包的分组”“只按 …”，没有新增 “一致/唯一定义” 的互指。
- (D) 593 → 608 个短语：第 104 轮一行登入 15 个被取代的说法，命中 0。
- (C) 仍为 19 行、0，已核对到第 104 轮的数值：
  - W4 4.62、W6 9.31、W16 3.57，功能合计 124.22；
  - 角色容量表：Agent 26.67 / 26.27 / 28.90；桌面 28.13 / 26.33 / 28.96；设计 29.40 / 26.40 / 29.04（最长）；范围句 “第 104 轮后…28.90–29.04”；
  - 结论：M1 = 39 周，容量 30.00，结束日期 2027-08-06；M2 至 2027-11-12；M3 在 2028-02；
  - 结论与甘特图的余量：系统 1.09、Agent 1.10、桌面 1.04、设计 0.96、安全 1.10；
  - 增人算式 28.90 + 28.91 + 28.96 + 29.04 + 14.45 = 130.26，T = 132.26 / 5.5 = 24.05；
  - §14.8：Agent W6 9.31、合计 26.67；桌面 W4 4.62、合计 28.13；设计 W16 3.57、合计 29.40；
  - ADR-133 第 104 轮补记的角色合计与余量；ADR-038〔当前值〕39 周 / 2027-08-06。
- (s) 8/8（不新增暂停原因、Needs-You kind、`wait_reason` 值）；(w) 0；(O) 仍为 35 行。其余各项计数不变，全部为 0。

```
headings=566 adrs=232 section_refs=9834 problems=0
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
(e) ADR back-markers: 282 supersede/amend pairs, missing=0
(r′) mutual “一致/唯一定义” claims: 65 pairs, differing values=0
(q) verbatim-quote mismatches=0
(p) 16 §16.8 copy cells without 规则 5: 10 copy cells, missing=0, UNPARSABLE=0
(P) 16 §16.8 role-column copies (per column): 8 role cells with copies, missing=0, UNPARSABLE=0
(i) event names in per-document event tables vs 16 §16.1.14: 31 names, not in index=0, UNPARSABLE=0
(i′) full-row and path-list payload events vs the 13 §13.9.1 cap (06 §6.3 rule): 5 events, unhandled=0, UNPARSABLE=0
(D) superseded phrases of 16 §16.1.13 outside history: 608 phrases, hits=0, UNPARSABLE=0
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
