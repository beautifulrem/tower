# 第 83 轮评审回应

决策：
- ADR-211（`15` 末尾，L3528 起）；
- ADR-210 与 ADR-127 标题加 “Amended by ADR-211”；
- ADR-133 第 83 轮补记（`15` L1353）。

本文件关闭 `round-83.md` §4 的 2 条重要条目、7 条次要条目，以及 §5 的 13 条观察。行号为修改后的位置。

**收敛规则**（同 ADR-186–210）：只用三种办法关闭条目：
1. 把说法改弱，但保证为真；
2. 删除或推迟不属于 M1 主循环的机制；
3. 在已有的唯一定义处加至多一条守卫、一行或一个字段。

两条重要条目都用 **Pi 自己的环境开关**关闭（`PI_OFFLINE`、`PI_CODING_AGENT_DIR`），不自建资源加载流程，也不向 `createMcpExtension` 逐项传入替代实现。

复用的已有机制：
- 命令 `comment.create`、`comment.delete`、`goal.take_over`、`goal.resume`、`goal.discard_human_edits`；
- landmark `human_edit` 与字段 `humanPaths`；
- Needs-You kind `stalled`（新增子类型取值 `human_checkout_lost`，子类型不在三方枚举中）。

不新增状态、事件类型、表、列、载荷字段、命令、决定种类、Needs-You kind 或 landmark。删去评论 “未送达” 的两个按钮。安全不变式全部保留；安全问题只写到设计层面。

---

## Pi v1.2.0 核实（`packages/coding-agent/src/`，`git show v1.2.0:<path>`）

**包的自动安装**：
- `createAgentSessionServices` 构造资源加载器后立即 `reload()`（`core/agent-session-services.ts:148-154`）。
- `reload()` 无条件调用 `this.packageManager.resolve()`，不带 `onMissing`（`core/resource-loader.ts:529`；`loadCurrentExtensionSet` 同，`:681`）。
- `resolve()` 遍历全局与项目设置的 `packages`（`core/package-manager.ts:926-942`）：
  - npm 来源未安装或已安装版本不满足设置的范围（`:1323-1324`、`:1513-1519`），git 来源未安装（`:1338`），都调用 `installMissing`；
  - `installMissing` 在 `PI_OFFLINE` 为真时返回 false，调用方 `continue`，即不加载（`:1309`、`:1326-1327`、`:1339-1340`）；
  - 否则没有 `onMissing` 时直接 `installParsedSource`（`:1310-1312`），在 Host 中运行 `npm install`（含生命周期脚本）或 `git clone`。
- `isOfflineModeEnabled()` 只读 `process.env.PI_OFFLINE`（`1`/`true`/`yes`，`:60-63`）。全仓库没有调用方传入 `onMissing`，`reload()` 也不接受它，SDK 没有等价选项。
- 同一开关还管：临时 git 来源的刷新（`:1341`、`:2027`）、`update`（`:1129`）、npm 批量安装（`:1224`）、更新检查（`:1522`、`:1573`）；`grep`/`find` 缺少 `rg`/`fd` 时的下载（`utils/tools-manager.ts:361`；查找顺序为 agentDir 的 `bin/` 再 `PATH`，`:83-102`）；模型目录的网络刷新（`core/model-runtime.ts:247`、`:859`）。CLI 的 `--offline` 只是设置同一变量（`main.ts:578-581`）。
- **其他安装或更新路径**：`packageManager.install/update` 只由 `package-manager-cli.ts` 调用，SDK 路径中没有。

**`getAgentDir()` 的消费者**（读 `process.env.PI_CODING_AGENT_DIR`，`config.ts:585`、`:605-611`）：
- SDK 路径上 Tower 无法显式传入的：
  - 内置 MCP 扩展：`mcp.json`（`extensions/mcp/index.ts:1344`）、`mcp.log`（`:370`）、`mcp-auth.json` 与锁目录（`extensions/mcp/oauth.ts:147-148`）；三者可经 `McpExtensionOptions` 替换（`index.ts:69-77`）；
  - 工具二进制目录：`TOOLS_DIR = getBinDir()`，模块加载时求值（`utils/tools-manager.ts:10`；`utils/shell.ts:139`）。
- 已由 Tower 显式传参覆盖的：`auth-storage.ts:348`、`model-runtime.ts:220`（`models-store` 随 `modelsPath`）、`settings-manager.ts:310`、`agent-session-services.ts:139`。
- 只在交互模式或 CLI 中出现的：`crash-log.ts:21`（只被 `interactive-mode.ts` 调用）、`keybindings.ts:337`、`migrations.ts`、`package-manager-cli.ts`、`startup-ui.ts`。

**全局设置**：Tower 传入自建的 `settingsManager` 时，`createAgentSessionServices` 不调用 `SettingsManager.create(cwd, agentDir)`（`:147`）；Pi 自己的取法是 `join(agentDir, "settings.json")`（`core/settings-manager.ts:308-319`）。

结论：评审对两条重要条目的描述成立。ADR-210 的 “Host 自己的环境不影响任何一项” 由 ADR-211 取代。

---

## 重要条目

### R83-D11-01（Pi 加载资源时在 Host 中自动安装包）与 R83-D5-01（内置 MCP 与全局设置不随传入的 `agentDir`）

**唯一定义**：`05` L456（§5.3.6 Host 环境表新增一行 “Pi 运行开关”）。
- Host 环境恒设两项：
  - `PI_OFFLINE=1`；
  - `PI_CODING_AGENT_DIR` = 本 Run 的 agentDir（非隔离为用户 agentDir，隔离为 `~/.tower/pi-agent/`），与传给 `createAgentSessionServices` 的 `agentDir` 同值。
- 两项在 `host.spawn` 时写入（工具二进制目录在模块加载时求值）。下一个 Run 选定的 agentDir 与存活 Host 不同时，Supervisor 先让该 Host 退出再启动。
- 两项都不进入 bash 环境与 MCP 的基础环境。
- 效果：
  - Pi 在 Tower 中从不安装或更新包，缺失或版本不符的包跳过、不加载；
  - MCP 配置、`mcp-auth.json`、`mcp.log` 与工具二进制目录都随本 Run 的 agentDir，与静态清单枚举的目录相同。

**全局设置**：`05` L313（§5.3.3）定义 `globalPath` = 本 Run 的 agentDir 下的 `settings.json`。隔离模式因此不读用户设置，也不解析用户的 `packages`。

**修正的断言**：
- `05` L461（§5.3.6 用户 agentDir 一段）：删去 “一律不调用 Host 的 `getAgentDir()`” 与 “Pi 以它定位全局 `settings.json`”；改为分列 `agentDir`、`globalPath` 与 Host 环境三处，并写明隔离的是 “本 Run 的 agentDir” 的三处；
- `05` L349 骨架注释；
- `05` L1312（§5.10 Adapt 一行）：RPC（M2）取同样两项；
- `05` L490（§5.4.1 RPC 环境）：同一规则（也关闭观察 12 的第 4 点）；
- `05` §5.10 隔离 agentDir 一句：Host 环境取同一个值。

**静态清单**：唯一定义在 `05` L1330（§5.10）。
- “确认之前不加载、不执行任何代码” 后括注它依赖的开关。
- 清单只列已安装且版本与设置相符的包（判定同 Pi）。
- 列出而未安装或版本不符的来源单列为 “未安装：Tower 不安装、不加载；请在你的终端中运行 `pi` 安装”。装好后清单变化，按已有规则重新确认。
- `11` 的引用：L607（§11.8.2 清单行）、L507（§11.7.1 环境白名单）、L450（§11.7.0 凭据行补 `mcp-auth.json`）、T16 缓解。

**用户可见的说明**：`00` L99（§0.5.1 能力差异表）补一行：不安装、不更新 Pi 包，设置中未安装的包不加载并提示在终端中安装；不自动下载 `rg`/`fd`。

**依赖、测试与用例**：
- 依赖 D45（`05` L1407）改为两项开关，A 类，C11、C40；
- 契约测试 C40（`05` L1473）：
  - 非默认 agentDir D 的 `packages` 列出一个未安装的包与一个版本不符的包，D 与默认目录各有一份 `mcp.json`；
  - 断言：没有安装子进程或注册表请求，没有新增包目录，两个包不加载、清单列为 “未安装”；MCP 只连接 D 中的服务器，`mcp.log` 写在 D 中；隔离时不加载 MCP；bash 环境中没有这两项；
- G46 (bi)（`14` L134）：同一组构造，从 Dock 启动，含 `postinstall` 标记文件，在清单确认前后各开一个 Goal。复用 C40 的夹具。

**没有采用的取法**：
- 向 `createMcpExtension` 逐项传入三项：只解决 MCP；
- 自建资源加载并传 `onMissing:"skip"`：需要绕过 `reload()`。

两者都比 Pi 自己的开关多一层自建机制。

---

## 次要条目

### R83-D6-01（settle 的 `agent_bg_done` 受去重）

取 “不受去重” 的一侧。
- `10` L732（§10.7.1 去重例外，唯一定义）补一句：settle 第 4 步的 `agent_bg_done` 同样不适用第 2 步，作者照常为 `agent`。于是每次 settle 都有它的检查点，I4(b) 与 `06` §6.2.3 的 Projector 断言照字面成立。
- 交还第 7 步与 `safety` 同树时，仍按 §10.8.4 记在该检查点上（ADR-184 不变）。起初写成整体豁免，与这一步冲突，已收窄。
- 第 2 步（L749）、`16` L184（§16.1.6 landmark 行）同步。
- `03` L115、`07` L350、`06` L267、`10` L741–L742 的原文因此成立，不改。

### R83-D7-01（检验带回的检查点）

唯一定义在 `10` L913（§10.8.3 第 7 步）：
- 带回写回后记一个 `author:"human"`、landmark `human_edit` 的非回合检查点；
- `humanPaths` = 以 T_pin 为基线的写回集合中改动的路径，与交还第 8 步同一取法。

同步处：
- `10` L732：非回合入口的 `human_edit` 补 “检验带回”；
- `10` L415：`Tower-Human-Edit` 的列举补 “检验带回”；
- `10` `humanPaths` 字段注释；
- `16` L300；
- `06` L913 `inspect.bring_back`：同时删去 “T1、检查点” 的重复写法。

### R83-D8-01（评论 “未送达” 的两个按钮）

删除。

已有规则本就让未送达的评论留在 Tower 队列，下一次 Run 开始时随开场送达（`05` §5.7.1 最后一行、§5.7.4）。各处落点：
- `04` L1356（F4 第 4 步）：写明这一点，不另设按钮。
- `04` L501（§4.6.3）：
  - `■ 未送达` 无需操作，不想再发时 `comment.delete`；
  - `过期` 的 `重新发送` = 以原正文预填评论编辑器，确认后 `comment.create`。
- `04` §4.18.3 一行、`12` L707 回执行同步。
- `05` L1194：`stale` 删去没有命令的 “人选择不再投递”。

### R83-D8-02（“人工编辑检出已丢失” 没有 kind）

映射到已有 kind `stalled`，子类型 `human_checkout_lost`（与 `satellite_missing` 同类）：
- severity 2，`costOfDelay:"none"`；
- 去重键 `st:{goalId}:human_checkout`（`08` L210）；
- 出口分类（`08` L514）：“再次接管”“继续”→ `actionable`；“放弃改动”→ `informative`；
- `06` L144 引用。

### R83-D13-01（影子索引的历史影响快照）

取 “忽略规则不追溯”。

唯一定义在 `10` L744（§10.7.1 第 1 步）：
- 已收入影子索引的路径，此后即使匹配忽略规则，也照常更新并留在快照中。这与 `add -A` 的行为及 git 的已跟踪文件一致。
- 验收与 seal 的 `full` 的全新临时索引，以影子索引此刻收录的树初始化（不带 stat）。它与 decisive 收录同一组路径，只可能在内容上不同。
- `stat_cache_mismatch` 后的 “清空影子索引”，即以这次 `full` 的临时索引取代它。

同步处：
- `10` L183：改为 “不会新进入”，并写明不追溯；
- `10` L211：`11` §11.8.1 两种复核仍以 `baseCommit` 初始化，`full` 引用新定义；
- `10` 指纹注释；
- `07` L281、L285 两处断言。

没有取 “追溯”：它要为由此产生的删除另定归属。

### R83-D14-01（G21 在 B1）

G21 移到 B3（`14` L39，第 23 周，依赖 W7-rest 的交还，第 22 周），与 G23 同批。用例只换批次，补跑现值不变。

### R83-D15-01

- **(a)** `12` L418：括注改为 “面板只显示提示，`04` §4.6.7”。
- **(b)** 回退与分叉标 M2（ADR-059）：
  - `06` L907、L918、L919：`goal.rewind`/`goal.fork`、`run.rewind`、`run.fork_goal`；
  - `16` L1133：远程矩阵一行；
  - `08` L768：诊断视图的就绪动作；
  - `06` L146：drain 的 `rewind` 目标与 “回退恢复检查点的中途”。
- **lint**：(z′) 补按行检查，覆盖 `06` §6.4.3、`16` §16.5、`08` §8.13（见 `round-83-lint.md`）。

---

## §5 观察

| 观察 | 处理 |
|---|---|
| 1 | `10` L945：提示补 “它能改动 H 中包括 git 元数据在内的任何文件” |
| 2 | `04` L589：授权引起的重新验证失败时按归因决定去向（窗口内没有人的改动即自动返工），从已验收出发不延续验收；在其他暂停中授权只记录授权、不改变状态 |
| 3 | `14` L134 G46 表头与 L31 SP6b 行补 “(al)、(au) 的 web 端一组”。核对后 (au) 只有 web 端一组属 M2，其余照常在 M1 运行，所以没有整组排除 |
| 4 | `12` L283：本次因环境故障未运行的标准显示 `⚠`，其余仍停在旧提交的显示 `⟲` |
| 5 | `02` L169：元素改为 `CheckpointId \| Sha`；`16` L42 与 `10` L854 `restorePaths` 的输入同步 |
| 6 | `10` L749（第 2 步）：回合入口只与上一个回合检查点比较；`12` §12.12 时间线补 `safety` 的标签 “保护快照”；`07` §7.7.1 M2 振荡检测注明只取回合检查点 |
| 7 | `16` L43 的 `suspended` 两处、`10` L908 与 L916 的合并队列步骤标 M2 |
| 8 | 工具二进制目录随 R83-D5-01 的开关解决。崩溃日志只在交互模式写，SDK 下不涉及。`11` L160 密钥路径表补 `mcp-auth.json`、`models.json`。`09` L452：隔离 agentDir 的 Goal 不加载用户级 `AGENTS.md`、`SYSTEM.md`、技能与提示，“生效上下文” 面板按实际 agentDir 列出 |
| 9 | 不改：与 `goal.hand_back` 一致，`serve` 属 M2 |
| 10 | `16` L661：`checkpoint.created{projectId, n, piEntryId?}`。其余属性由 `checkpoints` 表承载。`piEntryId` 保留，因为 `05` §5.6.5 与 `16` `checkpoint.settleWaitSec` 已以它为映射依据 |
| 11 | `06` L904 第 ① 步：删去 “检查点（landmark:human_edit）”，注明只在写回后记一次；`inspect.bring_back` 同理（见 R83-D7-01） |
| 12 | `05` L1095：“第 8 步” → “第 7 步”；`06` L296：`startAgentActivity` 改为 “安装器（含两种检出的依赖准备）、检验检出的生命周期脚本”；`00` L84、L112：就地编辑标 M2；`05` L490：见 R83-D5-01 |
| 13 | 确认：`auth.json` 在三类沙箱中不可读，由 `11` §11.6.2 的读允许列表不含它与 §11.7.0 一行保证，正文不改 |

---

## 登记

- `16` L634（§16.1.13）：补登第 83 轮被取代的说法 1 行，含 12 个可检短语，由 (D) 检查，命中 0。
- lint：
  - 全部检查 exit 0；
  - (z′) 补一组按行检查（评审 §3.1 的第一条建议）；
  - 第二条建议（(d) 登记与名字无关的片段）由 (D) 的第 83 轮一行覆盖；
  - 详见 `reviews/round-83-lint.md`。

## 排期

净增 **+0.05 人周**，没有系统线增量：

| WBS 行 | 增量 | 线 | 内容 |
|---|---|---|---|
| W6 | +0.02 | Agent | Host 环境的 Pi 运行开关、`globalPath`、C40 |
| W10 | +0.01 | 安全 | 静态清单的 “未安装” 一类、密钥路径表 |
| W13 | +0.01 | 设计 | `human_checkout_lost` 的登记 |
| W16 | +0.01 | 设计 | 忽略规则不追溯；W7-core 的落点按 ADR-136 改派，系统线 0 |

其余条目按 WBS 行逐项不足 0.01，计 0。G21 只换批次，G46 (bi) 复用 C40 的夹具。

数值：
- WBS 123.12；角色合计 Agent 26.55、系统 26.35、桌面 27.84、设计 28.76、安全 13.62。
- 冻结前所需：Agent 28.77、系统 28.88、桌面 28.64、设计 28.34、安全 14.43（按 0.5 人 28.86）。
- 余量：系统 0.12（不变）、Agent 0.23、桌面 0.36、设计 0.66、安全 0.14。
  - 安全线仍高于约 0.12 的改派阈值，不改派；
  - 安全线再增 0.02 人周及以上时须先改派。
- 依赖链 19.91（W6、W10、W13、W16 不在链上）。
- 增 1 人：129.06 人周，T = 131.06 / 5.5 = 23.83，新人约 2.51 人周，33 周。
- **M1 维持 38 周**（2027-07-30）。

`14` §14.3.4（L216 增量段、W6/W10/W13/W16 行、功能合计、角色容量表、范围句、结论、甘特余量、增人备选）、§14.8 团队表、`14` L16 与 `15` ADR-133 第 83 轮补记一致，由 lint (C) 核对。
