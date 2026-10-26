# 第 103 轮 lint

`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH` → exit 0（ADR-231 落地后；headings 566，ADR 231，section_refs 9714，problems 0）。从 `docs/` 运行。

本轮没有改动 lint 脚本（`reviews/lint/xref.py`）。

评审 §3.1 的建议按下面处理：
- **R103-D15-01 (a)**（`06` §6.2.4 的复述没有被 (D) 拦住）：取第一种写法。`06` §6.2.4 删去括号中的复述，旧写法 “ADR-055 的端口段与 `${port:N}` 模板” 登入 `16` §16.1.13 第 103 轮一行（`16` L654），由 (D) 检查。没有新增 “写了 ‘只按 `05` §5.3.6’ 的句子不再列举变量” 一类检查：Host 环境的变量仍只有一处定义，`06` 这一句已只剩引用。
- **其余六条**：属于语义，lint 不覆盖。被取代的说法一并登入第 103 轮一行，共 18 个短语。
- **R103-D6-02**：沿用已有的暂停原因 `app_quit`，不新增暂停原因，所以 (s)、(w′)、(k′)、(O) 的集合不变；只为开放字符串 `Run.outcomeReason` 登记一个已用值 `disk_full`（`02` §2.6、`06` §6.3 DDL 注释、`16` §16.1.4）。

写第 103 轮一行之前，逐个检查了候选短语在正文中的出现（与 (D) 同一取法，去掉反引号与星号）：18 个短语在 `00`–`14`、`16`（§16.1.13 之外）与 README 中都为 0。`14` G46 (d) 第八组原写的 `已有 pi /login 的凭据，Tower 用它` 随 R103-D5-01 改为新文案；`10` §10.8.4 第 2 步的 “路径已存在时按 §10.2 处理——仍在使用中返回 E_STATE” 对人工编辑检出仍然成立（`humanCheckout` 存在时接管本就返回 `E_STATE`），没有登记。

改动后做了变异检查（在 `/tmp` 的副本上做，正文未改动）：
- **(D)**：在 `06` §6.2.4 写回 “ADR-055 的端口段与 `${port:N}` 模板”，报 `SUPERSEDED_PHRASE 06:323`（第 103 轮一行，`16:654`）。
- **(C)**：把 `14` W16 改为 3.57，共报 6 项：
  - `TEAM_TABLE 14 §14.8 设计 W16 3.56 ≠ §14.3.4 3.57`；
  - `TEAM_TABLE 14 §14.8 设计 合计`；
  - `WBS_TOTAL 124.18 ≠ 124.19`；
  - `CAPACITY_TOTAL 设计`；
  - `ADR133_ROLE_TOTAL 15 第 103 轮 设计`；
  - `ADR133_TOTAL 15 第 103 轮`。

本轮引用的位置都已核对：
- **节号**（lint 的 section_refs 覆盖 `00`–`14`、`16` 与 README）：
  - `00` §0.5.1；`04` §4.3.2、§4.6.7、§4.15.1、§4.18.1、§4.18.3；`05` §5.3.5、§5.3.6、§5.10、§5.11.1 D57、C21；
  - `06` §6.1.1、§6.1.3、§6.1.4、§6.1.6、§6.1.9、§6.2.4、§6.3、§6.4.3、§6.8 F7 与 F8；`08` §8.1、§8.6.1、§8.6.3；`09` §9.12.4；
  - `10` §10.1.2、§10.1.3、§10.2、§10.4.3、§10.4.4、§10.8、§10.8.3；`11` §11.7.1、T28；`12` §12.4.3、§12.6.5、§12.7、§12.8；`13` §13.11.3；
  - `14` §14.3.4、§14.8、G35c (x)、G35e (q)、G46 (d) 第九组与 `core.fsmonitor` 一组；`16` §16.1.4、§16.1.13、§16.2.6、§16.8。
- **Pi 行号**（v1.2.0，`git show v1.2.0:<path>`，`packages/coding-agent/src/` 下，另注 `ai`）：
  - `core/model-runtime.ts:109-124`（`CreateModelRuntimeOptions`，含 `authPath`、`modelsPath`、`refreshOnCreate`）、`:217-218`（`create` 以 `RuntimeCredentials` 包住文件型存储）、`:485-487`（`checkAuth`）、`:634-640`（`removeRuntimeApiKey`）、`:646-657`（`getProviderAuthStatus`）、`:658-697`（`prepareRequest`，`:676` 抛出 `Provider is not configured`）、`:705-712`（`stream` 经 `lazyStream`）；`index.ts:232-236`（导出 `ModelRuntime`）；
  - `ai/src/models.ts:649-655`（读凭据失败抛 `ModelsError("auth")`）、`:657-681`（`checkProviderAuth`，OAuth `:662-664`）、`:683-692`（`checkAuth`）；`ai/src/api/lazy.ts:46-59`；
  - `core/provider-composer.ts:438-456`（组合后的 `check`）、`:457-473`（`resolve`）；
  - `core/auth-storage.ts:333-346`（同一 `authPath` 共享读取状态）、`:393-399`、`:402-440`（锁内读取）、`:442-448`（`read` 解析 `key`）；
  - `core/resolve-config-value.ts:9-10`（命令结果缓存）、`:88-89`、`:145-151`、`:185-216`（`execSync`，`timeout: 10000`）、`:229-238`（`resolveConfigValueOrThrow` 的错误文本）；
  - `core/runtime-credentials.ts:6, 24-28`；`ai/src/providers/anthropic.ts:28-47`；`ai/src/providers/amazon-bedrock.ts:61-71`（`:65-70` 为 `AWS_PROFILE` 一支）；
  - `core/http-dispatcher.ts:81-100`（`EnvHttpProxyAgent`、`setGlobalDispatcher`）；`packages/ai/src` 与 `packages/coding-agent/src` 中没有 `NODE_EXTRA_CA_CERTS`、`SSL_CERT_FILE`、`SSL_CERT_DIR`、`AZURE_CONFIG_DIR` 的引用（`git grep`）；
  - `extensions/mcp/runtime.ts:111-113`（`env` 值以 `resolveConfigValueOrThrow` 解析）；`core/exec.ts:36-46`；
  - `ai/src/auth/credential-store.ts:40-56`（`modify`）；`core/agent-session.ts:2459-2469`（`abort`）、`:3993-4000`（`navigateTree` 的流式与压缩检查）。

与第 102 轮相比的计数变化：
- ADR 230 → 231；section_refs 9575 → 9714。
- (v) 仍为 99 条命令（不新增命令或字段），§6.4.7 核对 24 条。
- (e) 275 → 279 对：ADR-231 Amends ADR-230、ADR-229、ADR-227、ADR-049，四者标题都已补 “Amended by ADR-231”。
- (r′) 仍为 65 对、差异 0：本轮把唯一定义 “与 `pi /login` 存储的凭据的先后” 改名为 “与你的 Pi 配置中凭据的先后”（引用处只写 “`11` §11.7.1 模型凭据一行”，不受影响）；`mcpBaseEnv` 的引用处写 “只按 `05` §5.3.5”，没有新增 “一致/唯一定义” 的互指。
- (D) 575 → 593 个短语：第 103 轮一行登入 18 个被取代的说法，命中 0。
- (C) 仍为 19 行、0，已核对到第 103 轮的数值：
  - W4 4.61、W16 3.56，功能合计 124.18；
  - 角色容量表：桌面 28.12 / 26.32 / 28.95；设计 29.39 / 26.39 / 29.03（最长）；范围句 “第 103 轮后…28.88–29.03”；
  - 结论：M1 = 39 周，容量 30.00，结束日期 2027-08-06；M2 至 2027-11-12；M3 在 2028-02；
  - 结论与甘特图的余量：系统 1.09、Agent 1.12、桌面 1.05、设计 0.97、安全 1.10；
  - 增人算式 28.88 + 28.91 + 28.95 + 29.03 + 14.45 = 130.22，T = 132.22 / 5.5 = 24.04；
  - §14.8：桌面 W4 4.61、合计 28.12；设计 W16 3.56、合计 29.39；
  - ADR-133 第 103 轮补记的角色合计与余量；ADR-038〔当前值〕39 周 / 2027-08-06。
- (s) 8/8（不新增暂停原因、Needs-You kind、`wait_reason` 值）；(w) 0；(O) 仍为 35 行。其余各项计数不变，全部为 0。

```
headings=566 adrs=231 section_refs=9714 problems=0
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
(e) ADR back-markers: 279 supersede/amend pairs, missing=0
(r′) mutual “一致/唯一定义” claims: 65 pairs, differing values=0
(q) verbatim-quote mismatches=0
(p) 16 §16.8 copy cells without 规则 5: 10 copy cells, missing=0, UNPARSABLE=0
(P) 16 §16.8 role-column copies (per column): 8 role cells with copies, missing=0, UNPARSABLE=0
(i) event names in per-document event tables vs 16 §16.1.14: 31 names, not in index=0, UNPARSABLE=0
(i′) full-row and path-list payload events vs the 13 §13.9.1 cap (06 §6.3 rule): 5 events, unhandled=0, UNPARSABLE=0
(D) superseded phrases of 16 §16.1.13 outside history: 593 phrases, hits=0, UNPARSABLE=0
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
