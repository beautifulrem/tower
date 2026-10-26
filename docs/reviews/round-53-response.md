# 第 53 轮评审回应

决策：ADR-180（`15` 末尾；ADR-178、ADR-179 标题加 “Amended by ADR-180”）。本文件关闭 `round-53.md` §4 的 16 条（重要 2、次要 14）、§3 中第 52 轮的三条“部分”，以及 §3.1 建议的三项 lint。行号为修改后的近似位置。

选择原则：评审给出选项时取更安全、更简单的一个；删除机制与增加机制都能关闭问题时取删除。安全问题只写到设计层面（缺了哪条规则、会放进哪一类后果）。

## 条目处理

| 条目 | 采用的规则 | 改动位置 |
|---|---|---|
| **R53-D11-01（重要）** | 两张封闭表前加**判别原则**：以字段缺省值下的判定为基准，可能使失败变通过、使检查不再执行、或放宽自主度/范围/网络的都算放宽；两向都可能放宽或结果取决于被测代码行为的字段一律仅本机。逐字段核对两个方向（见下方“封闭表复核”），改为仅本机：`exitCode` 任何改动、修改/删除 `stdoutMatches`、新增 `exec` 标准、artifact `network` 任何改动、新增 `links_reachable` 与修改检查、`intent.constraints` 措辞、`budget.interruptsPerHour`、`VerifyProfile` 的 `exposeGit`/`env.tz`/`env.memLimitMb`/`env.network`/`prefetch` | `16` L982–1037（唯一定义）；`11` L580；`06` L867；`04` L1244；`14` G46(ao) L133 |
| **R53-D11-02（重要）** | 规则 5 的范围改为“由用户配置生成、供 Tower 之外的代码读取的副本”（A、安装器第 2/3 阶段、V），并写明白名单 → 剥除 userinfo → 凭据判定的顺序。安装器第 2、3 阶段不再另有副本，读取与 V 同一份 `$VS/npmrc`（只读）；第 1 阶段配置留在 `$TI`（不执行项目或依赖代码，认证行即时投递，不属副本）。`07` 的“I 的配置在 `$TI`”改为分阶段写明 | `16` L1157（规则 5）、L1173（npmrc 行 A/I/V 三列）；`07` L550、L589；`11` L409；`14` G46(ak)；lint (p) 逐格、(P) 按列 |
| R53-D11-03 | 方案 (b)：新增 `exec` 标准仅本机（不给分类器加“未确认”状态）；`11` §11.3.2 的“合同 exec 标准命令相等”按展开后的每个简单命令逐个比较、不短路并集；任何合同修订后重算致命三要素（本机警告、远程 `E_FORBIDDEN`）；`env.tz` 仅本机 | `16` L989、L1026；`11` L187、L536；`06` L867；`14` G46(ao) |
| R53-D11-04 | 删除机制：远程审批只提供“仅这一次”，“本 Goal / 本项目内同类”只在本机；删除 ADR-179 的 `AutonomyMatrix.grants[].expiresOn`；`Contract.autonomy.grants` 只含批准合同时的授权，不按事件失效；运行时 `Grant` 在 `02` 定义，存于 `approve_action` 决定的 `payload.grant`（不新增表），每个 Run 开始时编入 `policy.json`；S0 的 `run_end` 在启动恢复结束未结束的 Run 时同样生效 | `02` L317–328；`11` L115–118、L580；`16` L33、L253、L936；`06` L146、L479；`14` G46(an) |
| R53-D4-01 | 改写 `review{state, pin}` → `verify{pin}` 的同一事务写 `Goal.verifyFrom = state`，登记为写入点；`03` `accepted` 行的“验证通过后回 `in_review`”改为“一律按 I2 验收延续判据” | `16` L34、L35；`03` L60、L69、L167；`06` L867；`07` L1618、L1645 |
| R53-D4-02 | 每次重建成功（自动或人选）记 `satellite.recovered{tree, checkpointN?, by}`；下一次任何 Run 开始时由开场组装为每条生成 `tower.satellite_rebuilt`（同 `tower.processes_terminated`，不经 `pendingOpenings`）；删去“以 steer 告知”与 ADR-178 的入队；`rebuild_satellite` 把 `settle`、`claim` 都改写为 `run`；守卫加 `satellite_rebuilding=1 → E_BUSY`（`running` 中自动重建期间同样置标志）；`02`/`16` 注释改正 | `16` L36、L144、L276、L291–292（唯一定义）；`06` L139、L921；`03` L69、L94；`10` L1170；`07` L1653；`05` L857；`02` L502 |
| R53-D13-01 | 写回集合唯一定义在 `10` 第 7 步：`B→T1`（`B = rebuiltTree ?? T0`）∪ E（仅 `take_human`）；第 5 步短路为 `T1 == B`；`discard_human_edits` 加卫星守卫，并以接管以来最近一次重建的树为比较基准（检出丢失时取 `satellite.recovered.tree`） | `10` L893–911、L948；`06` L142、L893、L895；`03` L78；`14` G46(aq) 第四个 Goal |
| R53-D5-01 | F7 的检测键改为运行期 `OAuth refresh failed for <provider>` 或预检 `No API key found for <provider>`；F6 根因合并排除；C39 (a)(c) 按源码重写；“需要 `pi` CLI”保留为**设计选择**并写明 SDK 的 `ModelRuntime.login` 与不采用的理由（方案 (b) M2 复审） | `05` L1261、L1362（D58）、L1411（C39）；`06` L1170–1171 |
| R53-D7-01（并关闭 R52-D7-02 残留） | 计划步骤没有表示完成的事实字形；关联标准全部新鲜通过时加事实徽章 `关联标准通过`；字形优先级 `◆` > `┆▸` > `┆✓` > `○`；`✕ 不一致` → `◇ 可能不一致` | `12` L238（唯一定义）、L344；`04` L318、L349 |
| R53-D7-02（并关闭 R52-D7-01 残留） | F4 第 3 步写明非 hunk 锚点止于 `┆ Agent 称已回应`；`Comment.anchor` 加 `{type:"trace", runId, piEntryId}`（与 `EvidenceRef.trace` 同键）；`14` 聊天回流比引用 `04` §4.20.1 | `04` L1342、L1551；`02` L560；`16` L211；`14` L666 |
| R53-D8-01（并关闭 R52-D15-01 残留） | 方案 (a) 的简化：`needs_you.dismiss{itemId}` 不带原因；人按 `X` 关闭按 `08` §8.8 该 kind 的“关闭”一格定类，未单列的记 `false_positive`；`obsolete` 只由自动解决产生 | `08` L512；`06` L912；`16` L496；`04` L786 |
| R53-D8-02 | 远程 S0 卡片按阶段两种文案（验证阶段“允许（直到本目标下一次运行开始）”）；“最多询问一次”限定为本机批准 | `04` L827、L833；`11` L106 |
| R53-D9-01 | 看板人工标准 `☐`，图例 `▫` 不含人工；评审队列 `◦` 已看 / `•` 已计入；`12` §12.6.2 登记 `▪▪`/`▪`、`◦`/`•`、时间线 `│`、徽章；诊断时间线统一 `│` | `04` L29–30、L167、L435–449、L491、L694；`12` L341–345、L690 |
| R53-D12-01 | 以 ADR-059 与 `14` §14.4 为准：导出 Markdown 属 M2；记分板展示属 M3（M1 只记录）；决策卡校准记录标 M3、事实语法；收件箱线框的记忆提议标 M2 | `09` L21–26；`04` L760、L765、L783；`12` L677 |
| R53-D14-01 | 方案 (a) 先剥除再判定：npmrc A 列补剥除一步；G46(ak) 期望保留剥除后的 `@corp:registry` | `16` L1173；`14` G46(ak) |
| R53-D15-01 | 事件索引补 `10` §10.18 事件族、`audit.repo_lock_taken`、`claim.recorded`；`fact.recorded` 定义位置改为 `02` §2.13/`06` §6.3，`run.ready` 归入 `engine` 行；表前说明改为“定义处为 `06` §6.3 与各文档的事件表”；`04` §4.14 改为引用封闭表；`07` 的 `OpeningRef` 补 `id`；lint (D) 查出的两处“Tower 数据目录下”改为 `~/.tower/tmp/` | `16` L500–527；`10` L1240；`04` L1244；`07` L1653；`10` L1132、`16` L564 |

**第 52 轮的三条“部分”**：R52-D7-01 由 R53-D7-02 关闭（F4 文案）；R52-D7-02 由 R53-D7-01 关闭（`✕ 不一致`）；R52-D15-01 由 R53-D8-01 关闭（“`X` 不可行动”的定类）。

## 封闭表复核（R53-D11-01 的硬要求）

逐字段、两个方向（“放宽？”指该方向能否使原本失败的运行通过、检查不再执行，或放宽自主度/范围/网络）：

| 字段 | 收紧方向 | 反方向 | 结论 |
|---|---|---|---|
| `expect.exitCode` | 无（缺省 0；新增 0 不改变判定） | 新增非零、修改、删除都可能让失败判为通过 | **仅本机**（原表错） |
| `expect.stdoutMatches` | 原无时新增：只增加失败条件 | 修改（可写成恒真）、删除 | 新增 web，其余仅本机 |
| `expect.minTests` / `maxFailures` | 新增/提高、新增/降低：只增加失败条件（缺省不检查） | 降低/删除、提高/删除 | 保持 |
| `repeat` | 提高 | 降低 | 保持 |
| `criteria` 新增 `exec` | 加一条验收条件 | 但在槽位中运行新命令，且使同名命令按 `exec.test` 自主度放行 | **仅本机**（D11-03） |
| `criteria[].checks` | 新增 `exists`/`headings`/`min_words`/`links_internal` | 删除、修改；新增 `links_reachable` 触发沙箱外访问 | 只留前者 |
| artifact `network` | 删除主机看似收紧网络 | 但链接检查随之 `skipped`，结论仍是“有保留的通过” | **仅本机**（原表错） |
| `intent.constraints` | 新增 | 措辞修改可等同删除 | 措辞修改改为仅本机 |
| `intent.*` 其余 | 不进入判定 | `context` 影响致命三要素 | 保持，三要素凑齐时远程拒绝 |
| `scope.*`、`autonomy.*`、`stopConditions`、`maxReworkCycles`、`plan`、`review.*` | 表中方向 | 反向 | 复核成立，保持 |
| `budget.usd*`/`wallClock*`/`maxDiffLoc` | 降低 | 提高 | 保持 |
| `budget.interruptsPerHour` | 方向不单一（减少打扰即减少监督） | — | **仅本机** |
| `VerifyProfile.exposeGit` | `true → false` 看似收紧 | 需要 `.git` 的测试可能被跳过 | **仅本机** |
| `env.tz` | — | 改变与时间相关的测试结果 | **仅本机** |
| `env.memLimitMb` | 降低 | 提高使 `resource_exceeded` 的运行通过 | **仅本机** |
| `env.network` | 删除主机看似收紧 | 依赖网络的测试可能被跳过 | **仅本机** |
| `prefetch` | 删除看似收紧 | 测试数据缺失时结果取决于测试代码 | **仅本机** |
| `prepareTimeoutSec`、`pool.size` | 只影响时限与槽位；准备超时记环境错误、不产生标准结果 | 同 | 保持“任何方向” |
| `rerunFailed`、`generatedPaths`、`bigFileBytes`、`irrelevantGlobs`、`testPathOverrides.*`、`runnerExceptions`/`sentinelExceptions`、`flakeQuarantine` | 表中方向 | 反向 | 复核成立，保持 |

## Pi v1.2.0 源码核实（`git show v1.2.0:<path>`）

| 断言 | 位置 |
|---|---|
| 预检只看 `hasConfiguredAuth` 或 `checkAuth`；无凭据时抛通用的 `No API key found for <provider>` | `packages/coding-agent/src/core/agent-session.ts:2118-2131`；`core/auth-guidance.ts:22-25` |
| 存有 OAuth 凭据即判为已配置，不看过期 | `packages/ai/src/models.ts:657-664`（`checkProviderAuth`）、`683-692`（`checkAuth` 每次重新读取凭据） |
| 带 `/login` 的一支走不到：`snapshot.auth` 与 `configuredProviders` 总是同时增删 | `core/model-runtime.ts:342-369`、`393-426`、`910-926`；`isUsingOAuth`/`hasConfiguredAuth` 在 `543-553` |
| 令牌在请求时刷新（剩余 < 5 分钟），失败抛 `ModelsError("oauth", "OAuth refresh failed for <provider>")` | `packages/ai/src/auth/resolve.ts:102`、`119-143`、`161-176`；请求路径 `resolve.ts:70-81` → `core/model-runtime.ts:658-676`（`prepareRequest`）、`744-748`（`streamSimple`）；SDK 的 `streamFn` 走 `modelRuntime.streamSimple`（`core/sdk.ts:420-431`） |
| 该错误成为 `stopReason:"error"` 的 assistant 消息，只保留 `message` | `packages/ai/src/api/lazy.ts:4-23`、`46-59` |
| 不匹配 Pi 的可重试模式 | `packages/ai/src/utils/retry.ts:30-75`、`253-258` |
| SDK 公开 `ModelRuntime.login(providerId, type, interaction)`，经 `AgentSession.modelRuntime` 取得，包入口导出 | `core/model-runtime.ts:826-838`；`agent-session.ts:528-530`；`packages/coding-agent/src/index.ts:231-237` |
| Pi 自己的 `/login` 调用它 | `modes/interactive/interactive-mode.ts:3293`、`6327-6348` |
| 宿主需实现的 `AuthInteraction`（4 种 prompt、4 种 notify 事件） | `packages/ai/src/auth/types.ts:119-161` |
| `auth.json` 文件版本变化时 `AuthStorage.read` 重新加载（CLI 登录后 Host 无需重启） | `core/auth-storage.ts:402-448` |
| `prompt` 先把 `/` 开头的文本路由给扩展命令，再展开 `/skill:` 与提示模板 | `agent-session.ts:2062-2063`、`2090-2095` |
| 命令行首条消息交给 `session.prompt` | `interactive-mode.ts:1231-1233` |
| faux provider 只有 API 密钥认证（C39(c) 因此用声明 `auth.oauth` 的测试 provider） | `packages/ai/src/providers/faux.ts:708` |

**关于 `pi` CLI**：评审说得对，需要 CLI 是 Tower 的选择，不是 Pi 的约束。保留它（`05` §5.10 写明理由）比改由 SDK 登录更容易一次写对：SDK 方案需要在 Host 与界面之间新增一条双向通道并渲染 8 种提示与事件，OAuth 回调也要在 Host 内处理；CLI 写入同一份凭据存储，Host 每次请求都重新读取。方案 (b) 在 M2 随 `serve` 的界面通道复审。

## 排期（第 53 轮相对第 52 轮，+0.12 人周）

| WBS 行 | 增量 | 计入线 |
|---|---|---|
| W3 | +0.02（`verifyFrom` 写入点 0.01；`E_BUSY` 守卫与 `claim → run` 0.01） | 系统 → 桌面（ADR-136） |
| W7-rest | +0.02（写回集合以 `rebuiltTree` 为基准 0.01；`discard_human_edits` 守卫与基准 0.01） | 系统 → 安全（外部写入归因一类） |
| W6 | +0.03（F7 检测键与 F6 排除、C39、开场从事件生成） | Agent |
| W8 | +0.01（安装器第 2/3 阶段读 `$VS/npmrc`、先剥除再判定） | Agent |
| W7 SP6b | +0.01（G46 补组，现值 4.99） | Agent |
| W10 | +0.01（运行时 `Grant` 存放与编入、远程只有“仅这一次”） | 安全 |
| W12 | +0.01（批注锚点 `trace`） | 设计 |
| W14 | +0.01（修订后重算三要素） | 设计 |

M2 的 `serve` 部分、删减与显示替换计 0。系统线若不改派为 (26.39 − 0.1) × 1.1 = 28.919 → 28.92（余量 0.08），按 ADR-136 改派后不进入系统线。

- WBS 122.02 → **122.14**；角色合计 Agent 26.26、系统 26.35、桌面 27.64、设计 28.42、安全 13.47。
- 冻结前所需：Agent 28.45、系统 28.88、桌面 28.42、设计 27.96、安全 14.27（按 0.5 人 28.54）。
- 余量（29 − 取整值）：系统 **0.12**（不变）、Agent 0.55、桌面 0.58、设计 1.04、安全 0.46，全部为正。
- 依赖链 19.7（增量都不在链上）；增 1 人：28.45 + 28.88 + 28.42 + 27.96 + 14.27 = 127.98，T = 129.98 / 5.5 = 23.63，0.5 × 23.63 = 11.82，新人承担约 2.45 人周，23.63 + 2 = 25.63 → 26 个工作周 → 仍为 33 周。
- **M1 维持 38 周**（第 34 周末冻结 2027-07-02，退出 2027-07-30）。`14` §14.3.4（头段、W 行、角色表、结论、甘特余量格、增人备选、L16）与 `15` ADR-133 第 53 轮补记数字一致（脚本核对：W 行逐行拆分之和等于估计，19 行合计 122.14）。

## lint

`reviews/lint/xref.py`：
- (p) 改为**逐格**检查：§16.8 表中每个描述用户配置副本的格子自身须含“白名单”与“凭据判定”，或引用“规则 5”，不能借同一行其他列的关键词。
- 新增 (P)（= p′）：按表头识别 A/I/V 角色列，角色列中凡提到非缓存副本的格子须自身引用规则 5（或写明“同 A/V 列”且该列通过）。已用第 53 轮的原文验证能拦住 I 列“不含令牌的副本”。
- 新增 (i)：各文档“本文产生的事件”“本文新增的事件类型”表（含 `06` 的 SQL 注释块）中的事件名必须出现在 `16` §16.1.14 索引中。
- 新增 (D)（= d′）：`16` §16.1.13 左列中被取代的引号说法（≥ 5 个汉字、无反引号、不在新说法列中）不得出现在正文，历史标记例外；`D_KEEP` 列出只作为现行名称被引用的短语。查出并修正 `10`、`16` 两处“Tower 数据目录下”，`07` 一处措辞撞名。
- 三项都打印 `UNPARSABLE` 计数，不可解析的行不使运行失败。

运行：`python3 reviews/lint/xref.py --checks rstuvwxyzckdnSeRqpoPiD`（在 `docs` 目录下）→ **退出码 0**：headings 566，ADR 180，section_refs 3916，problems 0；(s) 8/8；(v) 96 条命令；(e) 150 对，缺 0；(r′) 32 对，0；(p) 10 格，缺 0；(P) 8 格，缺 0；(i) 31 个事件名，缺 0；(D) 45 个短语，命中 0；(o) 7 行，差异 0；UNPARSABLE 全为 0；其余各项为 0。
