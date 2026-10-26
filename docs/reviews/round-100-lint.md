# 第 100 轮 lint

`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH` → exit 0（ADR-228 落地后；headings 566，ADR 228，section_refs 9282，problems 0）。从 `docs/` 运行。

本轮改动了 lint 脚本（`reviews/lint/xref.py`）一处：
- **(d) 的 DELETED 补三项**（R100-D13-01，ADR-228：以删除关闭人工编辑检出去留一类）：
  - `take_over moveAside / move-aside restart`：`moveAside|移到一边并重新开始`；
  - `compare-before-delete of the source directory`：`删除来源目录之前的比较|删除前的比较|删除前比较`；
  - `write-set trigger that renames the copy`：`副本将改名保留`。
  - 三项只能出现在 `15`、`16` §16.1.13 或带历史标记的文字中（`DEL_OK`）。第三项起初也收 “副本改名保留”，它在 `14` §14.3.4 第 99 轮增量的历史句中合法出现、且前后没有历史标记，改为只收界面文案 “副本将改名保留”。
  - 新增项检查到 §16.1.13 旧行的“现行”列（`DELETED_IN_NEW_COLUMN`）：第 71 轮一行（L622）的 “`humanCheckout` 为空时人可选‘移到一边并重新开始’（`goal.take_over{moveAside}`…）” 被报出，按现行规则改写为 “Tower 先把它改名再新建，从不自动删除 H 并列出（第 100 轮起，ADR-228）”；同样改写了第 70 轮（L619）“已存在时 `E_STATE`”、第 93 轮（L644）“删除来源目录之前都与 T1 比较”、第 98 轮（L649）“凭据形排除与改名保留”、第 99 轮（L650）“使副本改名保留” 四处已不现行的“现行”列文字（后四处 lint 不报，按同一原则一并改）。

改动后做了变异检查（改完即还原，还原后输出与改动前逐行一致）：
- 在 `08` §8.6.1 表中一行加入 “Host 被 moveAside”，报 `DELETED_NAME take_over moveAside / move-aside restart ADR-228 08 365`；
- 把 `14` W16 行改回 3.54，(C) 报 `TEAM_TABLE 14 §14.8 设计 W16 3.53 ≠ §14.3.4 3.54`、`WBS_TOTAL 124.08 ≠ 124.09`、`CAPACITY_TOTAL 设计`、`ADR133_ROLE_TOTAL 15 第 100 轮 设计`、`ADR133_TOTAL` 共 6 项。

评审 §3.1 的建议按下面处理：
- **R100-D15-01**：采纳。`06` §6.2.4 的 “云 SDK 凭据只传指向文件的变量” 与 `10` §10.7.1 第 2 步的 “settle 的 agent_bg_done 与人工决定类的非回合入口除外” 登入 §16.1.13，由 (D) 检查。
- **R100-D8-01**：没有扩展 (C)。“打扰率” 的口径改为在 `14` §14.3.5 打扰率一行与 E3 指标中写明 “口径同 §14.6.2（L2+）”；三处数值互不相同（≤ 8/10、≤ 6、≤ 6），是不同门槛而非同一值的复述，(C) 的数值核对不适用。
- **R100-D5-01、R100-D6-01、R100-D13-01、R100-D13-02**：属于语义，lint 不覆盖。被取代的说法登入 §16.1.13，由 (D) 检查（共 18 个短语，见 `16` §16.1.13 第 100 轮一行，L651）；删除的机制另由 (d) 检查（见上）。

中途报出并已修正的问题：
- `03` §3.2.1 `human` 行 “放弃改动：丢弃 H” 改写时一度写长，使 (k) 的反向核对（`discard_human_edits` 之后 200 字内须出现 `verify_new`）报 `REWRITE_MISSING_IN_03`；改为 “不写回 H”（H 保留的规则只在 `10` §10.2），(k) 恢复 0。
- 写 §16.1.13 第 100 轮一行之前逐个检查了候选短语在正文中的出现（与 (D) 同一取法）：“删除来源目录之前的比较” 与 “移到一边并重新开始” 在 `14` §14.3.4 历次增量的历史句中出现、前 60 字内没有历史标记，不登入 (D)，改由 (d) 的 DELETED 守住；含反引号或嵌套引号的两条（“只在 `06` §6.1.6 所写的双重故障中同时出现”“第 8 步删除前的比较按‘不同’处理”）(D) 不收，不登记。

本轮引用的位置都已核对：
- **节号**（lint 的 section_refs 覆盖 `00`–`14`、`16` 与 README）：
  - `00` §0.5.1；`01` §1.4；`02` §2.2；`03` §3.2.1；`04` §4.5.2、§4.6.6、§4.6.7、§4.10.2、§4.15；`05` §5.3.1、§5.3.6、§5.10、§5.11.1 D62、§5.11.2 C29；
  - `06` §6.1.6、§6.2.4、§6.4.3、§6.6.1、§6.8；`08` §8.3.1、§8.5.3、§8.6.1、§8.6.3、§8.8；`09` §9.12.4；
  - `10` §10.1.3、§10.2、§10.3.1、§10.3.2、§10.4.4、§10.7.1、§10.8.3、§10.8.4；`11` §11.3.4、§11.3.5、§11.5、§11.7.0、§11.7.1、§11.8、T10、T33；`12` §12.6.4、§12.12；`13` §13.5、§13.11.1、§13.11.3；
  - `14` §14.3.4、§14.3.5、§14.4.1、§14.5 E3、§14.6.2、§14.8、G31、G35c (x)、G35e (m)、G36b、G46 (d)(bl)(bn)；`16` §16.1.13、§16.5。
- **Pi 行号**（v1.2.0，`git show v1.2.0:<path>`，`packages/ai/src/` 下）：
  - `api/bedrock-converse-stream.ts:162-164`（`optionsProfile` 只取 `options.profile` 与 `options.env.AWS_PROFILE`）、`:215-217`（有原始密钥且没有 `optionsProfile` 时设 `config.credentials`）、`:166-167`、`:193-205`（区域取法与 `us-east-1` 回落）；
  - `api/azure-openai-config.ts:32`（`AZURE_OPENAI_DEPLOYMENT_NAME_MAP`）、`:74-75`（`AZURE_OPENAI_BASE_URL`、`AZURE_OPENAI_RESOURCE_NAME`）、`:87-91`（都没有且无 `model.baseUrl` 时抛出）、`:104`（`AZURE_OPENAI_API_VERSION`）；
  - `providers/cloudflare-auth.ts:37-42`（`CLOUDFLARE_API_KEY`、`CLOUDFLARE_ACCOUNT_ID`，AI Gateway 另要 `CLOUDFLARE_GATEWAY_ID`）、`:16-28`（按字段先取存储凭据、再取环境）；
  - `utils/provider-env.ts:45-51`（`getProviderEnvValue`：调用方 `env` → `process.env`）；
  - `providers/azure.ts:48`（Azure 的密钥变量 `AZURE_OPENAI_API_KEY`，G46 (d) 第六组所用）；
  - coding-agent `core/package-manager.ts:2102-2130`（全局根查询同步运行，R100-D6-01 的前提，评审已核实，未改）。

与第 99 轮相比的计数变化：
- ADR 227 → 228；section_refs 9117 → 9282。
- (v) 98 → 99 条命令：新增 `goal.delete_kept`（`06` §6.4.3，`full（仅本机）`），`16` §16.5 “仅本机” 一行同步列入。`goal.take_over` 删去参数 `moveAside`，命令数不变。
- (e) 259 → 268 对：ADR-228 Amends ADR-227、ADR-226、ADR-225、ADR-222、ADR-221、ADR-201、ADR-199、ADR-099、ADR-049，九者标题都已补 “Amended by ADR-228”。
- (r′) 61 → 59 对：删去 “删除来源目录之前的比较” 的唯一定义（ADR-221）与引用它的位置，成对减少；新写的 “人的工作现场不自动删除” 唯一定义不与别处构成 “一致” 互指，差异 0。
- (D) 531 → 549 个短语：第 100 轮一行登入 18 个被取代的说法，命中 0。
- (d) DELETED 新增三项，命中 0。
- (C) 仍为 19 行、0，已核对到第 100 轮的数值：
  - W7 26.65（系统 14.11）、W16 3.53、W17 1.61、W19 3.01，功能合计 124.08；
  - 角色容量表 系统 26.36 / 26.26 / 28.89、设计 29.33 / 26.33 / 28.96（最长）；范围句 “第 100 轮后…28.88–28.96”；
  - 结论 M1 = 39 周、容量 30.00、结束日期 2027-08-06；M2 至 2027-11-12；M3 在 2028-02；
  - 结论与甘特图余量 系统 1.11、Agent 1.12、桌面 1.06、设计 1.04、安全 1.12；增人算式 28.88 + 28.89 + 28.94 + 28.96 + 14.44 = 130.11，T = 132.11 / 5.5 = 24.02；
  - §14.8 系统 W7 14.11、合计 26.36，设计 W16 3.53、W17 1.61、W19 3.01、合计 29.33；ADR-133 第 100 轮补记的角色合计与余量；ADR-038〔当前值〕39 周 / 2027-08-06。
- (O) 仍为 35 行；(s) 8/8（不新增 `wait_reason` 值）；(o) 8 行（`humanCheckout` 形状不变）；(A) 7 行；(T) 9 种。其余各项计数不变，全部为 0。

```
headings=566 adrs=228 section_refs=9282 problems=0
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
(v) remote-matrix coverage problems=0 (commands in 06 §6.4.3: 99)
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
(e) ADR back-markers: 268 supersede/amend pairs, missing=0
(r′) mutual “一致/唯一定义” claims: 59 pairs, differing values=0
(q) verbatim-quote mismatches=0
(p) 16 §16.8 copy cells without 规则 5: 10 copy cells, missing=0, UNPARSABLE=0
(P) 16 §16.8 role-column copies (per column): 8 role cells with copies, missing=0, UNPARSABLE=0
(i) event names in per-document event tables vs 16 §16.1.14: 31 names, not in index=0, UNPARSABLE=0
(i′) full-row and path-list payload events vs the 13 §13.9.1 cap (06 §6.3 rule): 5 events, unhandled=0, UNPARSABLE=0
(D) superseded phrases of 16 §16.1.13 outside history: 549 phrases, hits=0, UNPARSABLE=0
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
