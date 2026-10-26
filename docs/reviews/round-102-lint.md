# 第 102 轮 lint

`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH` → exit 0（ADR-230 落地后；headings 566，ADR 230，section_refs 9575，problems 0）。从 `docs/` 运行。

本轮没有改动 lint 脚本（`reviews/lint/xref.py`）。

评审 §3.1 的建议按下面处理：
- **R102-D15-01**（可选的新检查：`05` §5.3.6 表中 Host 一列不为 “—” 的变量都被 `11` 的白名单覆盖）：不新增。Host 环境的变量改为只在 `05` §5.3.6 “Host 环境的变量” 一行逐类列出（唯一定义，ADR-230），`11` §11.7.1 Engine Host 环境一行只引用它、不再按列过滤，所以没有第二份列表可以核对。旧写法 “变量表中 Host 列为 ✔ 的其余各行”“用户显式放行的变量” 登入 `16` §16.1.13，由 (D) 检查。
- **R102-D8-01**（(v) 不覆盖界面发出的消息）：存储提示的 “已查看” 改为界面状态，不发命令，(v) 无需扩展；(v) 仍为 99 条命令。
- **R102-D5-01、R102-D6-01、R102-D11-01、R102-D12-01、R102-D13-01、R102-D13-02**：属于语义，lint 不覆盖。被取代的说法登入 §16.1.13 第 102 轮一行（`16` L653），由 (D) 检查：共 11 个短语。

写 §16.1.13 第 102 轮一行之前，逐个检查了候选短语在正文中的出现（与 (D) 同一取法，去掉反引号与星号）：11 个短语在 `00`–`14`、`16`（§16.1.13 之外）与 README 中都为 0。

改动后做了变异检查（在 `/tmp` 的副本上做，正文未改动）：
- **(D)**：在 `05` §5.3.6 写回 “用户显式放行的变量”、在 `11` §11.7.1 写回 “与终端相同，Tower 传入的变量随之不起作用”，分别报 `SUPERSEDED_PHRASE 05:472` 与 `SUPERSEDED_PHRASE 11:518`（第 102 轮一行，`16:653`）。
- **(C)**：把 `14` W16 改为 3.55，共报 6 项：
  - `TEAM_TABLE 14 §14.8 设计 W16 3.54 ≠ §14.3.4 3.55`；
  - `TEAM_TABLE 14 §14.8 设计 合计`；
  - `WBS_TOTAL 124.15 ≠ 124.16`；
  - `CAPACITY_TOTAL 设计`；
  - `ADR133_ROLE_TOTAL 15 第 102 轮 设计`；
  - `ADR133_TOTAL 15 第 102 轮`。

本轮引用的位置都已核对：
- **节号**（lint 的 section_refs 覆盖 `00`–`14`、`16` 与 README）：
  - `00` §0.5.1；`04` §4.1.2、§4.3.2、§4.6.7、§4.15、§4.18.1；`05` §5.3.5、§5.3.6、§5.11.1 D57、D62；
  - `06` §6.1.1、§6.1.8、§6.2.4、§6.4.2、§6.4.3、§6.8 F8；`08` §8.1、§8.6.1、§8.6.3；`09` §9.12.1、§9.12.4；
  - `10` §10.1.2、§10.1.3、§10.2、§10.3.2、§10.4.4、§10.8.4、§10.19；`11` §11.7.1；`13` §13.11.3；
  - `14` §14.1、§14.3.4、§14.4.1、§14.5 E6、§14.8、G35c (x)、G46 (d) 与 `core.fsmonitor` 一组；`16` §16.1.13、§16.8。
- **Pi 行号**（v1.2.0，`git show v1.2.0:<path>`，`packages/coding-agent/src/` 下，另注 `ai`）：
  - `core/runtime-credentials.ts:16-18`（`removeRuntimeApiKey`）、`:24-28`（`read` 先返回运行时覆盖）；
  - `core/model-runtime.ts:109-112, 218`（`credentials` 只接受一个 `CredentialStore`）、`:621-632`、`:634-640`（`setRuntimeApiKey`、`removeRuntimeApiKey`）、`:671-676`（会话路径不传请求级 `env`；未配置时在 `:676` 抛出）、`:682-685`（`resolution.env` 并入请求）、`:891`（`registerNativeProvider`）；
  - `core/auth-storage.ts:497-507`（`readStoredCredential`）；`index.ts:26`（自包入口只导出 `readStoredCredential`，不导出 `AuthStorage`）；`package.json` 的 `exports` 只有 `.` 与 `./rpc-entry`；
  - `extensions/mcp/index.ts:369-371`（`options.logPath ?? join(getAgentDir(), "mcp.log")`）；`extensions/mcp/log.ts:1-5, 43-56`（逐条追加、超过 5 MB 轮转为 `mcp.log.1`）；
  - `ai/src/auth/resolve.ts:27-31, 70-92`（存储的凭据决定该 provider，环境只在没有存储凭据时判定）；
  - `ai/src/providers/anthropic.ts:30-46`（存储的密钥 → `ANTHROPIC_AUTH_TOKEN` → `ANTHROPIC_OAUTH_TOKEN`/`ANTHROPIC_API_KEY`）、`:49-69`（工作负载身份联合）；
  - `ai/src/providers/amazon-bedrock.ts:61-64`（存储凭据的 `key` → `AWS_BEARER_TOKEN_BEDROCK`）、`:65-70`（存储凭据 `env` 中的 `AWS_PROFILE`）；
  - `ai/src/models.ts:865-866`（pi-ai 自己的请求路径上的同一消息）。

与第 101 轮相比的计数变化：
- ADR 229 → 230；section_refs 9461 → 9575。
- (v) 仍为 99 条命令（不新增命令；`goal.delete_kept` 增一个字段 `listedAt`），§6.4.7 核对 24 条。
- (e) 272 → 275 对：ADR-230 Amends ADR-229、ADR-228、ADR-049，三者标题都已补 “Amended by ADR-230”。
- (r′) 63 → 65 对：新写的唯一定义（`05` §5.3.6 “Host 环境的变量”、`11` §11.7.1 “与 `pi /login` 存储的凭据的先后”）与引用处成对增加，差异 0。
- (D) 564 → 575 个短语：第 102 轮一行登入 11 个被取代的说法，命中 0。
- (C) 仍为 19 行、0，已核对到第 102 轮的数值：
  - W7 26.68（系统 14.13、安全 5.62）、W16 3.54，功能合计 124.15；
  - 角色容量表：系统 26.38 / 26.28 / 28.91；设计 29.37 / 26.37 / 29.01（最长）；安全 13.64 / 13.14 / 14.45（按 0.5 人 28.90）；范围句 “第 102 轮后…28.88–29.01”；
  - 结论：M1 = 39 周，容量 30.00，结束日期 2027-08-06；M2 至 2027-11-12；M3 在 2028-02；
  - 结论与甘特图的余量：系统 1.09、Agent 1.12、桌面 1.06、设计 0.99、安全 1.10；
  - 增人算式 28.88 + 28.91 + 28.94 + 29.01 + 14.45 = 130.19，T = 132.19 / 5.5 = 24.03；
  - §14.8：系统 W7 14.13、合计 26.38；设计 W16 3.54、合计 29.37；安全 W7-fs 5.62、合计 13.64；
  - ADR-133 第 102 轮补记的角色合计与余量；ADR-038〔当前值〕39 周 / 2027-08-06。
- (s) 8/8（不新增 Needs-You kind、`wait_reason` 值）；(w) 0；(O) 仍为 35 行。其余各项计数不变，全部为 0。

```
headings=566 adrs=230 section_refs=9575 problems=0
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
(e) ADR back-markers: 275 supersede/amend pairs, missing=0
(r′) mutual “一致/唯一定义” claims: 65 pairs, differing values=0
(q) verbatim-quote mismatches=0
(p) 16 §16.8 copy cells without 规则 5: 10 copy cells, missing=0, UNPARSABLE=0
(P) 16 §16.8 role-column copies (per column): 8 role cells with copies, missing=0, UNPARSABLE=0
(i) event names in per-document event tables vs 16 §16.1.14: 31 names, not in index=0, UNPARSABLE=0
(i′) full-row and path-list payload events vs the 13 §13.9.1 cap (06 §6.3 rule): 5 events, unhandled=0, UNPARSABLE=0
(D) superseded phrases of 16 §16.1.13 outside history: 575 phrases, hits=0, UNPARSABLE=0
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
