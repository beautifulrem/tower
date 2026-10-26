# 第 99 轮 lint

`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH` → exit 0（ADR-227 落地后；headings 566，ADR 227，section_refs 9117，problems 0）。从 `docs/` 运行。

本轮改动了 lint 脚本（`reviews/lint/xref.py`）一处：
- **(C) 加 M2、M3 日期的核对**（R99-D14-01，ADR-227；评审 §3.1 的建议）：
  - 从 `14` §14.1 的 M2 一行读出 “14 周（至 <年-月-日>”，核对它等于 §14.3.4 结论的 M1 结束日期加 14 周，不符时报 `M2_END`；
  - 从 M3 一行读出 “12–14 周（至 <年-月>”、从结论读出 “M3 在 <年-月>”，核对两者都落在 M2 结束日期加 12、13、14 周所在的月份之内，不符时报 `M3_END`；
  - 读不出时报 UNPARSABLE。文档头的 (C) 说明同步。

改动后做了变异检查（改完即还原，还原后输出与改动前逐行一致）：
- 把 §14.1 的 M3 一行改回 “至 2027-12”，报 `M3_END 14 §14.1 M3 2027-12 ∉ ['2028-02'] (M2 end 2027-11-12 + 12–14 weeks)`；
- 把结论的 “M3 在 2028-02” 改为 “2027-12”，报 `M3_END 14 §14.3.4 结论 M3`；
- 把 M2 一行改为 “至 2027-11-05”，报 `M2_END 2027-11-05 ≠ M1 end 2027-08-06 + 14 weeks`。

评审 §3.1 的建议按下面处理：
- **R99-D14-01**：采纳，见上。
- **R99-D14-02**：没有扩展 (z′)。`14` §14.3.5 的 G 行中 “在手机上”“web 端” 的写法很多，有的已在表头的 M2 列表中、有的在组内自带 “（M2）”，按短语扫描误报多；本轮直接把 (bm) 的手机一组标为 M2 并列入 G46 表头，(bm) 的旧写法 “另一组在手机上对同一合同 quick_ratify” 登入 §16.1.13，由 (D) 防止回退。
- **R99-D15-01**：采纳。`06` §6.1.10 的旧列举 “只在 settle 终止、重启清理、以及 watcher 检测到来源不明写入时” 登入 §16.1.13，由 (D) 检查。
- **R99-D5-01、R99-D6-01、R99-D11-01、R99-D13-01**：属于语义，lint 不覆盖。被取代的说法登入 §16.1.13，由 (D) 检查（共 18 个短语，见 `16` §16.1.13 第 99 轮一行）。

中途报出并已修正的问题：
- 正文写入、ADR 未写时的中间运行只有预期的 `NO_ADR`（正文中对尚未写入的 ADR-227 的引用），以及 (C) 对 ADR-133 补记的 `ADR133_ROLE_TOTAL` / `ADR133_TOTAL` / `ADR133_MARGIN`（第 99 轮补记写入之前，最新补记仍是第 98 轮），补记写入后消失。
- G46 (d) 的旧期望在 G46b 中有一份原样副本，按整个文件替换时匹配到两处；改为按行替换，G46b (d) 第一组同步为 “只有 `AWS_PROFILE` 与 `AWS_SHARED_CREDENTIALS_FILE`”，并注明 M1 部分与新增两组见 G46 (d)。
- 写 §16.1.13 第 99 轮一行之前逐个检查了短语在正文中的出现：“只有 AWS_SHARED_CREDENTIALS_FILE 指向” 在 G46 (d) 新增第三组的设置中合法出现，没有登记；M3 的 “2027-12” 不足 5 个汉字，(D) 不收，改由 (C) 的 `M3_END` 守住。

本轮引用的位置都已核对：
- **节号**（lint 的 section_refs 覆盖 `00`–`14`、`16` 与 README）：
  - `00` §0.5.1；`01` §1.4；`02` §2.5；`04` §4.6.6、§4.6.7、§4.10.2、§4.15.1；`05` §5.3.6、§5.11.1 D62、§5.11.2 C29；
  - `06` §6.1.1、§6.1.3、§6.1.5、§6.1.6、§6.1.7、§6.1.10、§6.2.4、§6.4.3、§6.6.1、§6.7、§6.8；`08` §8.6.1、§8.6.3；
  - `10` §10.7.1、§10.8.4；`11` §11.2、§11.3.4、§11.3.5、§11.7.0、§11.7.1、§11.8、T16；`12` §12.6.4、§12.12；`13` §13.8.3；
  - `14` §14.1、G35c (x)、G46 (d)(bj)(bl)(bm)(bn)、G46b (d)、§14.3.4、§14.8；`16` §16.1.13、§16.5。
- **Pi 行号**（v1.2.0，`git show v1.2.0:<path>`，`packages/ai/src/` 下）：
  - `providers/amazon-bedrock.ts:54-79`（Bedrock 的 `resolve`，只有 `AWS_SHARED_CREDENTIALS_FILE` 时返回 `undefined`）；
  - `models.ts:757`（`resolveProviderAuth`）、`:865-866`（`Provider is not configured: <provider>`）；
  - `api/bedrock-converse-stream.ts:166-167`（`configuredRegion`、`hasAmbientConfiguredProfile`）、`:193-205`（区域的取法，无 profile 时回落 `us-east-1`）、`:1202-1209`（`AWS_REGION`、`AWS_DEFAULT_REGION`）；
  - `providers/google-vertex.ts:64-89`（`resolve`；`:76` `fileExists`，`:78-81` project 与 location）；`auth/context.ts:30-42`（`fs.access`，不缓存）；
  - `compat.ts:23`（`env-api-keys.ts` 只经它导出）；`env-api-keys.ts:41-44`、`:59-62`（只查显式 `env` 参数；进程环境时缓存）。
  - `v1.2.0..HEAD`：以上文件只有 `bedrock-converse-stream.ts` 改了两行（工具调用参数解析，+2/−2），所引行号不变。

与第 98 轮相比的计数变化：
- ADR 226 → 227；section_refs 8987 → 9117。
- (e) 254 → 259 对：ADR-227 Amends ADR-226、ADR-223、ADR-186、ADR-182、ADR-158，五者标题都已补 “Amended by ADR-227”。
- (r′) 59 → 61 对：本轮新写的 “唯一定义” 声明与引用它们的位置成对计入，差异 0。
- (D) 513 → 531 个短语：第 99 轮一行登入 18 个被取代的说法，命中 0。
- (C) 仍为 19 行、0，已核对到第 99 轮的数值并加 M2、M3 两项：
  - W4 4.60、W14 2.08、W16 3.54，功能合计 124.06；
  - 角色容量表 桌面 28.11 / 26.31 / 28.94、设计 29.32 / 26.32 / 28.95（最长）；范围句 “第 99 轮后…28.88–28.95”；
  - 结论 M1 = 39 周、容量 30.00、结束日期 2027-08-06；M2 至 2027-11-12；M3 在 2028-02；
  - 结论与甘特图余量 系统 1.12、Agent 1.12、桌面 1.06、设计 1.05、安全 1.12；增人算式 28.88 + 28.88 + 28.94 + 28.95 + 14.44 = 130.09，T = 132.09 / 5.5 = 24.02；
  - §14.8 桌面 W4 4.60、合计 28.11，设计 W14 2.08、W16 3.54、合计 29.32；ADR-133 第 99 轮补记的角色合计与余量；ADR-038〔当前值〕39 周 / 2027-08-06。
- (v) 仍为 98 条命令（本轮不新增命令）；(O) 仍为 35 行；(s) 8/8（不新增 `wait_reason` 值）；(o) 8 行（不改对象形状）；(A) 7 行；(T) 9 种。其余各项计数不变，全部为 0。

```
headings=566 adrs=227 section_refs=9117 problems=0
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
(z′) M2 capability phrases in M1 tables: 53 occurrences, unmarked=0, UNPARSABLE=0
(c) continuation literal shape vs 02=0
(d) deleted mechanism names outside history=0
(n) contract-test references=0
(k) 03 §3.2.1 rewrite targets vs 06 §6.4.3=0
(s′) enum values used in rule text / pseudo-code outside the registered set=0
(e) ADR back-markers: 259 supersede/amend pairs, missing=0
(r′) mutual “一致/唯一定义” claims: 61 pairs, differing values=0
(q) verbatim-quote mismatches=0
(p) 16 §16.8 copy cells without 规则 5: 10 copy cells, missing=0, UNPARSABLE=0
(P) 16 §16.8 role-column copies (per column): 8 role cells with copies, missing=0, UNPARSABLE=0
(i) event names in per-document event tables vs 16 §16.1.14: 31 names, not in index=0, UNPARSABLE=0
(i′) full-row and path-list payload events vs the 13 §13.9.1 cap (06 §6.3 rule): 5 events, unhandled=0, UNPARSABLE=0
(D) superseded phrases of 16 §16.1.13 outside history: 531 phrases, hits=0, UNPARSABLE=0
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
