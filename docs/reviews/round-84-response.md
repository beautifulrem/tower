# 第 84 轮评审回应

决策：
- ADR-212（`15` 末尾，L3584 起）；
- ADR-211、ADR-208、ADR-066 标题加 “Amended by ADR-212”；
- ADR-133 第 84 轮补记（`15` L1362）。

本文件关闭 `round-84.md` §4 的 10 条次要条目、第 83 轮部分关闭的 R83-D14-01，以及 §5 的 9 条观察。行号为修改后的位置。

**收敛规则**（同 ADR-186–211）：只用三种办法关闭条目：
1. 把说法改弱，但保证为真；
2. 删除或推迟不属于 M1 主循环的机制；
3. 在已有的唯一定义处加至多一条守卫、一行或一个字段。

本轮先判断独立的隔离 agentDir 是否为 M1 所必需。结论是否，推迟到 M2（见下），由此关闭 R84-D6-01 与 R84-D5-02 的 (b)(c)。

复用的已有机制：
- 命令 `comment.edit`、`goal.take_over`、`goal.resume`；
- 字段 `Comment.requiresChange`、`goals.takeover_from`；
- 事件 `checkpoint.created`（补全载荷，不新增事件类型）；
- 资源加载选项 `noExtensions`。

不新增状态、事件类型、表、列、命令、决定种类、Needs-You kind、子类型或 landmark。安全不变式全部保留；安全问题只写到设计层面。

---

## 隔离 agentDir：推迟到 M2

**它保护什么**：`riskTier=high` 的 Goal 与清单确认之前的 Goal 以 `~/.tower/pi-agent/` 启动（R2-D11-01，`11` §11.8.2）。它在 M1 中保护的只有一项：**确认之前与高风险 Goal 不加载沙箱外代码**，即用户扩展、包中的扩展与 MCP。

**这一项不需要独立目录**：已有的 `noExtensions:true` 单独就能提供。
- v1.2.0 中，`noExtensions` 使资源加载只保留 CLI/inline 扩展（`core/resource-loader.ts:577-578`）。
- 自动发现的扩展、`packages` 解析出的扩展（`enabledExtensions` 来自 `packageManager.resolve()`，`:529`、`:553`）与 builtin 的 mcp、codemode、tool-search 都不加载。
- Tower 不传 CLI 扩展，inline 只有 tower-goal。

**隔离目录额外挡掉的**是用户的技能、提示模板、上下文文件与 settings。
- 它们不是沙箱外代码：技能脚本在 S2 中执行。
- M1 已不读项目扩展、项目包与项目 MCP（ADR-202）。

**它的代价**正是本轮的四条条目：
- 进程级开关随 Run 变化：要重启 Host，打包模式要按 agentDir 分组（R84-D6-01）；
- 隔离 Goal 中的差异（R84-D5-02）：
  - `rg`/`fd` 只在空的 `~/.tower/pi-agent/bin` 中查找；
  - 用户的 `shellPath`/`commandPrefix` 不生效；
  - `~/.agents/skills` 却照常加载。

**决定**：
- M1 中每个 Run 的 agentDir 都是用户 agentDir。
- Host 环境的 `PI_OFFLINE=1` 与 `PI_CODING_AGENT_DIR`=用户 agentDir 对所有 Host 相同，不因 Goal、Run、`riskTier` 或清单是否确认而变。
- 清单确认之前与 `riskTier=high` 只以 `noExtensions:true` 不加载扩展与 MCP（唯一定义 `05` L1330）。

**没有采用的取法**：打包 Host 按 agentDir 分组、§6.1.8 补退出时机、为隔离 Goal 提供 `rg`/`fd` 与 shell 设置。那是为一个不必要的机制再补三处机制。

**落点**：
- `05`：
  - L313（`globalPath` 恒为用户 agentDir，删去隔离分支）；
  - L349、L352（骨架：`agentDir: userAgentDir`，`noExtensions: spec.resources.noExtensions`）；
  - L456（Pi 运行开关）；
  - L461（“隔离 agentDir 的凭据来源” 改为 “凭据来源”）；
  - L1312；
  - L1330（唯一定义：不加载扩展 = `noExtensions:true`）；
  - D57、C29、C39、C40。
- `11`：L607、L608、T16（L692）、T28（L704）。
- `00` L98；`09` L452；`16` L49、L1131、L1230；`14` G46 (a) 与 (bi)；`README.md`。
- lint (d) 新增一项：`~/.tower/pi-agent`、`isolatedAgentDir`、`resources.isolated` 只能出现在 M2 或历史标记旁。

---

## Pi v1.2.0 核实（`packages/coding-agent/src/`，`git show v1.2.0:<path>`）

**bash 环境**：
- `resolveSpawnContext` 以 `{...getShellEnv()}` 起步。`getShellEnv()` 展开整个 `process.env`，并把 `getBinDir()` 加到 `PATH` 前面（`utils/shell.ts:139-150`）。
- 它只删除并重设五个会话变量 `PI_SESSION_ID`、`PI_SESSION_FILE`、`PI_PROVIDER`、`PI_MODEL`、`PI_REASONING_LEVEL`，然后交给 `spawnHook`（`core/tools/bash.ts:185-206`）。

**包目录**：
- 用户级 npm 来源先算安装路径，再判断是否需要安装（`core/package-manager.ts:1321-1324`）。
- `getNpmInstallPath` 在 `<agentDir>/npm/node_modules/<名字>` 不存在时，取 legacy 全局路径（`:2151-2158`）。全局路径由两处求出：
  - pnpm：`getPnpmGlobalPackagePath` 运行 `list -g --depth 0 --json`（`:2118-2130`）；
  - 其余：`getGlobalNpmRoot` 运行 `root -g`，bun 为 `pm bin -g`（`:2102-2116`）。
- 两者都经 `runNpmCommandSync` 同步运行用户设置的 `npmCommand`（`:1787-1797`、`:1846-1849`），出错时返回 undefined（`:2143-2149`）。
- 这一查询在 `installMissing` 的离线判断（`:1309`）之前，不受 `PI_OFFLINE` 控制。
- git 来源的安装路径不含 ref（`:2160-2170`），只看目录是否存在（`:1336-1340`）。

**`rg`/`fd`**：
- `getToolPath` 先查 `TOOLS_DIR`（= `getBinDir()`，模块加载时求值），再查 `PATH`（`utils/tools-manager.ts:10`、`:83-102`）。
- 离线时 `ensureTool` 不下载（`:361`），`grep` 报 “ripgrep (rg) is not available”（`core/tools/grep.ts:119-121`）。
- 交互式 `pi` 启动后会把两者下载到 `getBinDir()`（`modes/interactive/interactive-mode.ts:1089-1090`）。

**模型目录**：
- `modelNetworkEnabled = process.env.PI_OFFLINE === undefined`（`core/model-runtime.ts:247`）。
- 网络刷新还要求 `allowModelNetwork === true`（`:251`），Tower 不传。
- 会话服务只做 `refresh({allowNetwork:false})`（`core/agent-session-services.ts:194`）。

**其他**：
- 扩展的 `execCommand` 以不带 `env` 的 `spawn` 启动，继承 Host 环境（`core/exec.ts:36-46`）。
- `~/.agents/skills` 恒按 `getHomeDir()` 求出（`core/package-manager.ts:2464`、`:2555-2567`）。

结论：评审的描述全部成立。ADR-211 的 C40 断言 “没有包管理器子进程” 在 v1.2.0 上不成立：未安装的 npm 包必然引起一次只读全局根查询。

---

## 次要条目

### R84-D6-01（进程级开关与打包模式的 Host）

随隔离 agentDir 推迟而关闭。

`05` L456（“Pi 运行开关”，唯一定义）：
- 删去 “agentDir 不同时先让该 Host 退出再以新环境启动”；
- 改为：两项对所有 Host 相同，不因 Goal、Run、`riskTier` 或清单是否确认而变（这些只决定每个会话的 `noExtensions`）。Host 不因它们重启，打包 Host 的各 Goal 进程环境一致。

`06` §6.1.8 与 `13` §13.5 的退出时机因此不需要新增一条。`06` L320 的拼装列表见 R84-D15-01 (d)。

### R84-D5-01（`bashEnv` “保留 `PI_*`”）

唯一定义在 `05` L441（§5.3.6 表前一段）：
- `bashEnv` 的输入是 Pi 交给 `spawnHook` 的环境；
- 输出只含表中 “bash 环境” 一列给出的变量，外加五个会话变量；
- **不按 `PI_*` 前缀保留**，所以 Pi 运行开关在这里被去掉。

改为引用的三处：
- `05` L376 骨架注释；
- `11` L287（§11.4）、L507（§11.7.1）；
- C28a（`05` L1460）：断言改为 “`PI_*` 恰为 `bashEnv` 保留的五个会话变量”。

ADR-066 中 “`spawnHook` 的环境白名单保留 `PI_*`” 以本条为准（ADR-066 标题加 Amended by ADR-212）。

### R84-D5-02（隔离 agentDir 下的实际差异）

- **(b) shell 设置**：随推迟消失。每个 Run 读用户 settings（`05` L313 补一句：清单确认之前与高风险 Goal 同样读用户设置），`00` L77、`11` L287、C28a 照字面成立。
- **(c) 技能**：随推迟消失。`09` L452 改为：
  - 每个 Goal 都加载用户级上下文文件、技能与提示；
  - `~/.agents/skills` 与 agentDir 无关，恒按 `$HOME` 加载（附 Pi 行号）。
- **(a) `rg`/`fd`**：对没有运行过交互式 `pi`、`PATH` 中也没有 `rg`/`fd` 的用户仍然成立。取 “写明后果并在首次运行提示”，不由 Tower 提供二进制：
  - `05` L456：查找顺序、`grep` 的报错与交互式 `pi` 的下载位置；
  - `05` L464：首次运行检测按同一顺序检查并提示；
  - `04` L1453：首次运行卡片的文案；
  - `00` L99：写给用户的一行。

### R84-D11-01（legacy 全局包路径与 C40）

唯一定义在 `05` L1330（§5.10 静态清单）。包目录的判定与查找顺序同 Pi：
- 用户级 npm 来源先查用户 agentDir 的 `npm/`，不存在时查包管理器的全局根；
- Supervisor 以 Host 的同一环境与同一 `npmCommand` 运行 Pi 运行的同一只读查询。它只运行包管理器自身、不执行包的代码，与安装器第 1 阶段同类；
- 在全局根中找到的包同样列出，并按目录哈希；
- git 来源的 “版本不符” 只指 npm 的版本范围，git 来源只看目录是否存在。

改弱的说法：“确认之前不加载、不执行任何代码” 改为 “不执行任何扩展或包的代码”，并写明唯一的子进程是这一查询。`11` L607 同步，“不做任何加载或探测” 改为 “不加载或探测任何扩展”。

依赖与测试：
- D45（`05` L1407）补这一依赖与行号；
- C40（`05` L1473）：
  - 断言改为 “没有安装子进程（包管理器的 `install`、`git clone`）与注册表请求”；
  - 记录并允许一次只读全局根查询，断言它是唯一的包管理器子进程；
  - 另加一组 “全局根中有版本相符的包”：清单在确认之前就列出并哈希它。
- G46 (bi)（`14` L134）同步。

### R84-D6-02（`checkpoint.created` 的载荷）

取 “补全载荷”。唯一定义在 `16` L662（§16.1.14）：
- 载荷即 `checkpoints` 行建立时的全部列：`{projectId, n, runId?, sessionId?, piEntryId?, author, commit, tree, satelliteHead?, landmarks, takenAt, durationMs?, excludedPaths, externalPaths, mixedPaths, humanPaths?}`；
- Projector 只从它写入该行。

**检查点建立后不再改写**：
- `10` L980（§10.8.4 第 7 步）：与 `safety` 同树时，第 6 步建立该检查点时即带上第 7 步的 landmark 与路径集合。判定在第 6 步已可求出；ADR-184 的 “记在同一检查点上” 不变。
- 此后只有 `unusable` 投影自 `workspace.recovered`（ADR-185）。
- 信息性的 `in_user_repo` 不由事件承载，重建时按用户仓库中实际存在的地标 ref 求出。

`06` L221（§6.2.1）“可以从 `events` 完全重建” 一句写明这一例外。

### R84-D4-01（丢失检出的两条路径与再次接管）

`06` L144（§6.1.6 人工编辑检出一行，唯一定义）：
- 同一规则适用于运行中由文件系统事件与操作前检查发现的丢失：清除 `human_checkout`，保留 `takeover_from` 与 `takeover_prior_reasons`；
- 于是 “继续”（`goal.resume`）不再被 `human_checkout` 守卫拒绝。

`06` L903（`goal.take_over`）加一条守卫：`human_checkout` 为空而 `takeover_from` 非空（检出已丢失）时，保留这两项、不改写，只写新的 `human_checkout`。

同步处：
- `06` L504 列注释；
- `10` L1027：检出丢失一条改为引用 `06` §6.1.6；
- `08` L210：去重键行改为 “重启时与运行中发现相同”；
- `16` L196：子类型行（见 R84-D15-01 (a)）。

### R84-D8-01（评论 “人关闭” 与 `dropped` 的人选分支）

唯一定义在 `05` L1193（§5.7.3 `addressed` 一行之后）：
- **人关闭** = 人以 `comment.edit` 把该评论的 `requiresChange` 改为 `false`；
- 由 `comment.*` 事件留痕（谁、何时、原值）；
- 回执显示 `你已关闭`，不新增状态或字段。

`02`、`03`、`04`、`06` §6.4.7、`11` §11.9、`16` 的 “被人关闭” 都指它。写明的地方：
- `06` L920 `comment.*` 行；
- `04` L501（§4.6.3）与 L1355（F4 第 3 步）。

`dropped`（`05` L1195）删去 “且人选择丢弃”，只保留 Pi 返回 `handled` 一个来源。`abort` 后清出的评论本就由暂停流程放回队列（§5.7.4）。

### R84-D13-01（情形 B 与 `07` 伪代码）

- `10` L744（§10.7.1 第 1 步 “忽略规则不追溯”，唯一定义）补一句：影子目录被删除后重建（§10.16.2 情形 B）时，影子索引以从备份取回的最新可用检查点的树初始化，没有时才以 `baseCommit`。
- `10` L1247（情形 B）改为引用这一句。
- `07` L262（§7.3.2 `worktreeTree`）：不再在 `full` 之后删除临时索引，而是返回它（`tempIndex`），由调用方在 `stat_cache_mismatch` 时取代影子索引，否则删除。

### R84-D14-01 与 R83-D14-01 的剩余部分（B3 中依赖后续实现的用例）

G11、G19、G21、G23、G33、G35、G35b 移到 B4（`14` L40，第 31 周）。

核对甘特，这些依赖都早于第 31 周：

| 依赖 | 所在线 | 完成周 | 用例 |
|---|---|---|---|
| 交还树级语义、`restorePaths` | 桌面 | 第 23–24 周 | G11、G21、G23 |
| 两种检出的依赖准备 | 桌面 | 第 23–24 周 | G19 |
| 继续目标与 `onAllReasonsCleared()` | 系统 | 第 26–27 周 | G33 |
| `external_change` 持久状态 | 系统 | 第 25–26 周 | G35 |
| Run 令牌识别 | 桌面 | 第 27–28 周 | G35 |
| 令牌扫描与后台写入表 | 桌面 | 第 28–29 周 | G35b |

B3（`14` L39）只留 G18、G26b、G29、G31，其依赖（系统与安全线第 22 周）不变。B3 的依赖列写明移出的原因。执行线与 W7 行的补跑现值不变。

### R84-D15-01

- **(a)** `16` L196（§16.1.7）`stalled` 子类型表补 `human_checkout_lost`，引用 `06` §6.1.6。
- **(b)** `04` L717（§4.7.2 时间线规则）与 `12` §12.12 对齐：
  - 四种非回合检查点；
  - `agent_bg_done` = 每次 settle 的后台结束快照；
  - `human_edit` = 交还或检验带回（就地编辑属 M2）；
  - 补 `safety`（保护快照）。
- **(c)** `10` L774 `Checkpoint.author` 注释补 “检验带回”。
- **(d)** `06` L320（§6.2.4）Host 环境拼装补 Pi 运行开关，并写明 “整台机器同一个值”，没有重启判断。

---

## §5 观察

| 观察 | 处理 |
|---|---|
| 1 | `05` L456：扩展经 `pi.exec` 派生的子进程继承这两项，偏保守，不是泄漏 |
| 2 | `05` L456：Tower 本就不做模型目录的网络刷新，`PI_OFFLINE` 在这里不改变实际行为；`00` L99：模型列表来自 Pi 内置目录与你的 `pi` 最近一次刷新 |
| 3 | `06` L908 `s0.grant`：`s0_grant_pending` 既不是当前原因也不在 `also_applies` 中时，授权或拒绝只写 `s0_grant` 列，不改变状态与继续目标、不开始验证；`04` L589：改为 “先处理该暂停，之后的验证完成后再打开检验” |
| 4 | `06` L267：Projector 断言只对经 settle 进入的 `claimed`（`claim_on_behalf` 是 `03` §3.2.1 的例外）；pin 的树等于该 Run **最近一个** `agent_bg_done` 检查点的树 |
| 5 | `05` L1167（§5.7.1）：队列中的评论随下一个开始的 Run 送达，无论由恢复、自动返工还是交还的 `continue_agent` 开出 |
| 6 | 回执 `未送达` 改用 `◇`（无需操作，不是异常）。`12` L335 的 `■` 行删去它，L334 的 `◇` 行列入，L707 回执行同步；`04` L501、L1356、L1516 同步 |
| 7 | 标 M2：`06` L90、L139；`04` L110、L626、L665、L1416、L1510；`12` L388。`04` §4.7.2 诊断线框后注明 “尝试 2 / 回退后放弃” 是 M2 的情形。lint (z′) 补一组按行检查（见 `round-84-lint.md`） |
| 8 | 基线的 “否则为 pin 的检查点” 改为 “当前 pin 的检查点，没有时为 pin 本身（`10` §10.3.1）”：`03` L81、`06` L906、`10` L1026、`16` L43 |
| 9 | `04` L348（§4.5.2 改动区块）：帮助说明加一句固定提示 “之后才加入忽略规则的文件，若此前已被收入，仍会进入提交”。没有做逐文件标记，以免新增计算 |

---

## 登记

- `16` L635（§16.1.13）：补登第 84 轮被取代的说法 1 行。含 9 个可检短语，由 (D) 检查，命中 0。
- lint 全部检查 exit 0，改动三处：
  - (d) 新增隔离 agentDir 一项；
  - (w) 补 “`stalled` 子类型须在 `16` §16.1.7 登记” 的子检查（评审 §3.1 第一条建议）；
  - (z′) 补 “回退” 与 “接管” 同行须带 M2 标记的按行检查（第二条建议）；
  - 三项都做了有效性核对，详见 `reviews/round-84-lint.md`。

## 排期

净增 **+0.03 人周**，没有系统线增量：

| WBS 行 | 增量 | 线 | 内容 |
|---|---|---|---|
| W6 | −0.01 | Agent | 隔离 agentDir 推迟到 M2：删去 `isolatedAgentDir` 分支、重启规则、C40 的隔离一组 |
| W10 | +0.01 | 安全 | 清单的包目录按 Pi 的顺序含全局根（只读查询）；C40、G46 (bi) 断言 |
| W12 | +0.01 | 设计 | 丢失检出的运行中路径与再次接管的守卫。落点在 W3 与 W7-rest，按 ADR-136 改派，系统线 0 |
| W16 | +0.02 | 设计 | 首次运行检查 `rg`/`fd`；`checkpoint.created` 载荷补全。落点在 W3 与 W7-core，按 ADR-136 改派，系统线 0 |

其余条目与各条观察按 WBS 行逐项不足 0.01，计 0。七个用例只换批次。

数值：
- WBS 123.15；角色合计 Agent 26.54、系统 26.35、桌面 27.84、设计 28.79、安全 13.63。
- 冻结前所需：Agent 28.75、系统 28.88、桌面 28.64、设计 28.37、安全 14.44（按 0.5 人 28.88）。
- 余量：系统 0.12（不变）、Agent 0.25、桌面 0.36、设计 0.63、安全 0.12。
  - 安全线降到约 0.12 的改派阈值，本轮不改派；
  - 下一次落在安全线上的增量须先按 ADR-136 改派。
- 依赖链 19.91：W6、W10、W16 与 W12a 不在链上，W12b 不变。
- 增 1 人：129.08 人周，T = 131.08 / 5.5 = 23.83，新人约 2.52 人周，33 周。
- **M1 维持 38 周**（2027-07-30）。

`14` §14.3.4 的以下各处，与 §14.8 团队表、`14` L16、`15` ADR-133 第 84 轮补记一致，由 lint (C) 核对：
- L216 增量段；
- W6/W10/W12/W16 行、功能合计；
- 角色容量表、范围句、结论；
- 甘特余量、增人备选。

## 偏离与未决

- **R84-D5-02 (a) 只写明后果、不消除**：没有用过交互式 `pi`、`PATH` 中也没有 `rg`/`fd` 的用户，塑形与评审阶段仍然没有 `grep`/`find`。Tower 首次运行时提示，不提供二进制。若要消除，需要随 `$SH/tools` 提供固定版本的 `rg`/`fd`（W8，系统线），本轮不做。
- **高风险 Goal 的范围收窄**：`riskTier=high` 的 Goal 现在照常加载用户的技能、提示模板、上下文文件与 settings，只是不加载扩展与 MCP。这是推迟隔离 agentDir 的有意后果，理由见上；ADR-212 记明。
- **静态清单新增一个子进程**：Supervisor 的只读全局根查询运行用户设置的 `npmCommand`，与 Pi 在 Host 中运行的同一查询相同，且 Pi 在确认之前同样会运行它。清单行的 “只读文件” 已改为如实的说法。
