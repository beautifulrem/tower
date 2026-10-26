# 第 101 轮 lint

`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH` → exit 0（ADR-229 落地后；headings 566，ADR 229，section_refs 9461，problems 0）。从 `docs/` 运行。

本轮改动了 lint 脚本（`reviews/lint/xref.py`）两处：
- **(d) 的 DELETED 补一组，并新增严格匹配**（R101-D15-01，ADR-229）：
  - `Tower deletes the human copy / inspection directory`：`同步写回并删除|相同时才删除|交还……(后|时)删除……(副本|检出)|关闭检验……删除(检验)?目录|(关闭检验|验收)……(后|时)删除(?=[（；，。 |])|(验收|放弃|关闭)……(后|时)?清理检验目录`。评审举出的 `04` 三种措辞与任务列出的 “交还后删除…副本”“关闭检验…删除目录”“验收后清理检验目录” 都在其中。
  - **严格匹配**（`DELETED_STRICT`）：这些措辞自身含 “删除”，而 `DEL_OK` 把 “删除” 当作历史标记、又在包含匹配本身的窗口里搜索，所以按原规则它们总被自己豁免。第 100 轮补的 “删除来源目录之前的比较 | 删除前的比较 | 删除前比较” 一组同样如此（本轮复核时发现，原先实际上不起作用）。严格模式下：
    - 历史标记只认 `HIST`、“第 N 轮”、“撤回”“已删除”“Supersedes”“旧的”，并且在去掉匹配本身之后的前 120 字、后 60 字中找；
    - 匹配中 “删除” 之前 3 字内有 “不”（不删除、不会被删除、从不自动删除）视为现行写法；
    - `14` §14.3.4 以 “按子项估算” 开头的逐轮增量段整段是历史，跳过。第 100 轮一组改为严格匹配之后，起初在这一段第 93 轮的增量句中报出 2 处（“删除来源目录之前的比较推广到……”“续写删除前比较来源目录”），都是历史文字。
  - 改动后两组均命中 0。
- **(v) 扩展到 `06` §6.4.7**（R101-D15-02，评审 §3.1 的建议）：`06` §6.4.3 中整条命令仅本机的命令（范围列含 “禁止远程” 或 “仅本机”，不含字段级与 “时仅本机”）必须在 §6.4.7 “禁止远程的命令” 一行中按名列出。
  - 名字的写法有四种：
    - 完整名；
    - 兄弟简写 `a.b`/`c`（`c` 替换最后一段）；
    - 斜线组 `x/y`（按第一段）；
    - `V647_ALIAS` 中的文字名（`project.approve_docker` ↔ “docker 批准”）。
  - 共 24 条，缺 0。
  - 输出行改为 `(v) … (commands in 06 §6.4.3: 99; local-only checked against 06 §6.4.7: 24)`。

改动后做了变异检查（改完即还原，还原后输出与改动前逐行一致）：
- **(d)**：把 `04` L736 改回 “同步写回并删除”、L737 改回 “……放弃时删除（x）”，并在 `10` §10.2 插入一句 “验收后清理检验目录”。报 `DELETED_NAME Tower deletes the human copy / inspection directory ADR-229`，分别在 `04` 736、`04` 737、`10` 259。
- **(D)**：同一变异另报 `SUPERSEDED_PHRASE 04:736`、`04:737`（第 101 轮一行，`16` L652）。另在 `11` §11.7.1 插回 “这与终端中的 Pi 相同”，报 `SUPERSEDED_PHRASE 11:518`。
- **(v)**：从 `06` §6.4.7 删去 `goal.delete_kept`，报 `LOCAL_NOT_IN_6_4_7 goal.delete_kept`。
- **(C)**：把 `14` W19 改为 3.03，共报 6 项：
  - `TEAM_TABLE 14 §14.8 设计 W19 3.02 ≠ §14.3.4 3.03`；
  - `TEAM_TABLE 14 §14.8 设计 合计`；
  - `WBS_TOTAL 124.12 ≠ 124.13`；
  - `CAPACITY_TOTAL 设计`；
  - `ADR133_ROLE_TOTAL 15 第 101 轮 设计`；
  - `ADR133_TOTAL`。

评审 §3.1 的建议按下面处理：
- **R101-D15-01**：采纳。三句登入 `16` §16.1.13 第 101 轮一行，由 (D) 检查；(d) 另补严格匹配的一组（见上）。
- **R101-D15-02**：
  - `16` L1122 的 “删除人在检验目录中的修改” 登入 (D)；
  - (v) 扩展到 `06` §6.4.7（见上）；
  - `13` L368 的 “同上” 属于表格语义，lint 不覆盖，改为直接写 “计入 Tower 总占用”。
- **R101-D5-01、R101-D10-01、R101-D11-01、R101-D13-01、R101-D13-02**：属于语义，lint 不覆盖。被取代的说法登入 §16.1.13，由 (D) 检查：共 15 个短语，见 `16` §16.1.13 第 101 轮一行（L652）。

中途报出并已修正的问题：
- 新写的条目在 ADR-229 写入之前报 `NO_ADR`（引用了尚不存在的 ADR-229），写入后消失。
- 第 100 轮一组改为严格匹配后在 `14` §14.3.4 增量段报出 2 处历史文字，处理见上。
- 写 §16.1.13 第 101 轮一行之前，逐个检查了候选短语在正文中的出现（与 (D) 同一取法，去掉反引号与星号）。
  - “的删除时机与前提只在” 会命中 `06` §6.6.4 新写的 “卫星的删除时机与前提只在”，改用 “（及其引用的 §10.8.3、§10.8.4）定义”。
  - 其余 15 个短语在正文中都为 0。

本轮引用的位置都已核对：
- **节号**（lint 的 section_refs 覆盖 `00`–`14`、`16` 与 README）：
  - `04` §4.3.2、§4.6.6、§4.6.7、§4.7.3、§4.15；`05` §5.3.6、§5.11.1 D62；
  - `06` §6.4.3、§6.4.7、§6.6.4、§6.8；`08` §8.1、§8.5.3、§8.6.1、§8.6.3；`09` §9.12.4；
  - `10` §10.1.2、§10.1.3、§10.2、§10.3.1、§10.3.2、§10.4.4、§10.8.3、§10.8.4、§10.17.1；
  - `11` §11.3.4、§11.6.2、§11.7.1、T33；`12` §12.6.2；`13` §13.11.3；
  - `14` §14.1、§14.3.4、§14.3.5、§14.4.1、§14.5 E3、E6、§14.8、G46 (d)；`16` §16.1.1、§16.1.12、§16.1.13、§16.5、§16.6。
- **Pi 行号**（v1.2.0，`git show v1.2.0:<path>`，`packages/ai/` 下，另注 coding-agent）：
  - `src/api/bedrock-converse-stream.ts`：
    - `:167`（`hasAmbientConfiguredProfile` 只看进程环境）；
    - `:168-173`、`:1239-1250`（只在没有配置区域、也没有环境 profile 时固定标准端点）；
    - `:184-189`（bearer 令牌取 `options.apiKey`）；
    - `:196-205`（区域取法：ARN → 配置的区域 → 固定端点时的端点区域 `:201` → 没有环境 profile 时 `us-east-1` `:203-204`）；
    - `:1202-1209`（配置的区域）。
  - `test/bedrock-endpoint-resolution.test.ts`：`:97-101`（内置 `eu.*` 的端点为 `eu-central-1`）、`:113-120`（没有区域与 profile 时端点与区域都为 `eu-central-1`）。
  - `src/providers/amazon-bedrock.ts`：`:61-79`（判定顺序）、`:65-73`（环境或存储凭据的 `AWS_PROFILE`，或环境中的原始密钥对）。
  - `src/providers/anthropic.ts`：`:30-31`（密钥以 `apiKey` 发送）、`:34-40`（`ANTHROPIC_AUTH_TOKEN` 以 Bearer 头部发送）、`:49-69`（工作负载身份联合）。
  - `src/auth/context.ts:23-28`（`ctx.env` 即 `process.env`）；`src/auth/resolve.ts:70-85`（存储的凭据优先）。
  - coding-agent `core/model-runtime.ts`：`:621-629`（`setRuntimeApiKey`）、`:671-675`（请求级 `env` 由调用方给出）、`:692`（请求的 `apiKey` 取自判定结果）。
  - coding-agent `core/package-manager.ts:2102-2116`（观察 1，评审已核实，未改）。

与第 100 轮相比的计数变化：
- ADR 228 → 229；section_refs 9282 → 9461。
- (v) 仍为 99 条命令（不新增命令），另报 §6.4.7 核对 24 条。
- (e) 268 → 272 对：ADR-229 Amends ADR-228、ADR-208、ADR-099、ADR-049，四者标题都已补 “Amended by ADR-229”。
- (r′) 59 → 63 对：新写的唯一定义（`08` §8.1 “存储提示”、`10` §10.2 “使用中”）与引用处成对增加，差异 0。
- (D) 549 → 564 个短语：第 101 轮一行登入 15 个被取代的说法，命中 0。
- (d) DELETED 新增一组、两组改为严格匹配，命中 0。
- (C) 仍为 19 行、0，已核对到第 101 轮的数值：
  - W7 26.66（系统 14.12）、W17 1.63、W19 3.02，功能合计 124.12；
  - 角色容量表：系统 26.37 / 26.27 / 28.90；设计 29.36 / 26.36 / 29.00（最长）；范围句 “第 101 轮后…28.88–29.00”；
  - 结论：M1 = 39 周，容量 30.00，结束日期 2027-08-06；M2 至 2027-11-12；M3 在 2028-02；
  - 结论与甘特图的余量：系统 1.10、Agent 1.12、桌面 1.06、设计 1.00、安全 1.12；
  - 增人算式 28.88 + 28.90 + 28.94 + 29.00 + 14.44 = 130.16，T = 132.16 / 5.5 = 24.03；
  - §14.8：系统 W7 14.12、合计 26.37；设计 W17 1.63、W19 3.02、合计 29.36；
  - ADR-133 第 101 轮补记的角色合计与余量；ADR-038〔当前值〕39 周 / 2027-08-06。
- (s) 8/8（不新增 Needs-You kind、`wait_reason` 值）；(w) 0；(O) 仍为 35 行。其余各项计数不变，全部为 0。

```
headings=566 adrs=229 section_refs=9461 problems=0
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
(e) ADR back-markers: 272 supersede/amend pairs, missing=0
(r′) mutual “一致/唯一定义” claims: 63 pairs, differing values=0
(q) verbatim-quote mismatches=0
(p) 16 §16.8 copy cells without 规则 5: 10 copy cells, missing=0, UNPARSABLE=0
(P) 16 §16.8 role-column copies (per column): 8 role cells with copies, missing=0, UNPARSABLE=0
(i) event names in per-document event tables vs 16 §16.1.14: 31 names, not in index=0, UNPARSABLE=0
(i′) full-row and path-list payload events vs the 13 §13.9.1 cap (06 §6.3 rule): 5 events, unhandled=0, UNPARSABLE=0
(D) superseded phrases of 16 §16.1.13 outside history: 564 phrases, hits=0, UNPARSABLE=0
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
