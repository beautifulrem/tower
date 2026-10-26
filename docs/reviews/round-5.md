# 对抗评审 · 第 5 轮

> 评审者：独立对抗 Agent（未参与写作）。评审对象：`docs/00`–`docs/16`、`README.md`、`research/pi-release-diff.md`、`research/git-isolation-experiment.md`，以及 `reviews/round-4.md`、5 份第 4 轮回应与 `round-4-lint.md`。
> 核对依据：Pi 发布标签 `v1.2.0`（`git -C research/pi-mono show v1.2.0:<path>`）；`@anthropic-ai/sandbox-runtime` 0.0.79（`npm pack`，已确认 `parentProxy`/`noProxy` 架构）。本机实验在 `/tmp` 中完成，结束后删除。环境：git 2.56.0。
> 源码路径缩写（省略 `packages/coding-agent/src/`）：BT = `core/tools/bash.ts`，RN = `core/extensions/runner.ts`，TY = `core/extensions/types.ts`。

---

## 1. 总评

第 4 轮的两条阻断（ADR-071 嵌套 gitlink、ADR-072 卫星控制文件）方向正确，并配了 GitRunner 的“只允许执行 git”OS 沙箱作纵深防御。我复现了 ADR-073 的用户 `gc --prune=now` 不再损坏卫星/影子对象，`satellite_missing` 已统一为唯一定义，决定性指纹口径（ADR-075）、`ecosystemSupported`、卫星侧物化、包管理器版本识别都已落地。

但本轮发现**一条新阻断**，与第 4 轮同类：

- **`.git/commondir`（及 `.git/worktrees/*`）重定向**绕过 ADR-072。Agent 必须能写 `.git` 根目录（HEAD、index、packed-refs），因此可新建 `commondir` 指向工作区内一个它可写、带 `filter.<x>.clean` 的目录；沙箱外以用户身份对卫星运行 `git status` 的进程（扩展的 `pi.exec`、IDE、shell 提示符）会执行该 filter。我在 git 2.56 上带着 ADR-072 第 4 点的完整 `GIT_CONFIG_*` 注入复现了命令执行——注入只覆盖 fsmonitor/hooksPath，挡不住 filter。

其余主要问题：ADR-078 的人工检验检出是一条新的“沙箱外执行 Agent 代码 + 真实密钥”路径，信任边界未定义；含密钥的本地文件在 S2 下仍可被 Agent 从源头或槽位读到；重放包有四份互相矛盾的规格，直接削弱 D16 的可审计论据；镜像 30 天 prune 与影子/重放 180 天保留冲突，会静默损坏已归档证据；`runner_tampered` 的 stat 快照不含 ctime，可被原地改写规避；大文件在 pin/seal 的全新索引下被 `:(exclude)` 丢弃；`resumeTo` 与 pauseReason 优先级表直接冲突。

## 2. 评分表

| # | 维度 | 分数 | 一句话理由 |
|---|---|---|---|
| D1 | 原论述契合度 | 92 | 没有回到聊天/Session 中心，检验走外部终端与原论述一致；但 `04` §4.6.5 对用户仓库 ref 的说明已过时，就地编辑的提交口径仍与 ADR-036 矛盾 |
| D2 | Pi 哲学契合度 | 90 | `shellPath`、`user_bash` 已按源码修正并核实；但 ADR-066 正文未同步、C31 与正文相反、能力差异表有一行不实（`!cmd` 经沙箱）与三处遗漏 |
| D3 | 论证与证据 | 96 | ADR-056 改 Proposed、与行为指标/ADR-070 一致；`01` §1.7.5 同步。无新问题 |
| D4 | 领域模型与生命周期 | 88 | `satellite_missing` 已统一；但 `resumeTo` 承担三种用途却只一层，且与 `16` L24 的优先级表直接冲突；`verifyFrom`/`pendingVerify` 未持久化 |
| D5 | Agent 架构与 Pi 集成 | 88 | gate 第 7 条已正确收窄并经源码核实；但 C28b/C31 仍测不可能情形、RPC 加载期 `getSettings` 会抛错、MCP 的 `GIT_CONFIG_*` 纵深防御未接线 |
| D6 | 系统架构与可靠性 | 88 | 影子 gc 持锁、删“唯一副本”；但重放包规格四处矛盾、镜像/影子清理时机不一致 |
| D7 | 诚实与验证 | 82 | lifecycleIndirection + runner_tampered 两道防线已建；但 stat 快照无 ctime 可规避、prepare 可留未跟踪文件伪造验证、pnpmfile 在持令牌的安装器中执行、Node 运行时选择未定义 |
| D8 | 注意力与交互 | 84 | 倒计时、`◍`、未经机器验证卡片已修；但检验检出的沙箱档位/网络/端口/密钥信任边界未定义，含密钥本地文件在 S2 下可被 Agent 读到 |
| D9 | 视觉设计与美观 | 95 | `◍` 人工验收中性链已贯通 `12`/`04`/`16`，“只有验证器结论着绿”恢复一致。残留极少 |
| D10 | 性能 | 88 | ADR-075 口径落地、数字一致、删除 60 s 巡检；但大文件在 pin/seal 被 `:(exclude)` 丢改动、`$SH` 浏览器缓存每次复核耗时无预算、FSEvents 丢事件未处理 |
| D11 | 安全与自主度 | 74 | 两条原阻断已关闭并经实验证实；但 `.git/commondir`/`worktrees/*` 重定向是同类新逃逸（已复现），ADR-072 清单与注入都挡不住 |
| D12 | 记忆与学习 | 89 | ADR-080 关闭了 monorepo 自动合并；但根集合随分支漂移会反复弹确认、消歧键未进数据模型与导出、`project.split` 的归属迁移未定义 |
| D13 | 隔离、git 与并发 | 82 | 镜像、LFS 只读、部分/浅克隆检测、卫星无远端、D/F 冲突都已处理；但镜像 30 天 prune 与证据 180 天保留冲突、`+refs/*` 强制 fetch 的不可达对象无上限 |
| D14 | 路线图与可验证性 | 88 | 甘特图按 29 周重排、满足依赖、计入 3 个节假日、M0 算术已修；但 SP6c 7 天与 W8 的 0.8 周不符、`07` T 编号与 `14` P 编号交叉引用错位 |
| D15 | 文档一致性与可执行性 | 86 | 命令表↔HumanDecision 双向闭合、新 lint 规则生效；但检测器 anomaly/sentinel 分类不一、`Fact.kind` 未含 `nested_repo`/`workspace.recovered`、命令表有重复行、`Checkpoint` 接口与 DDL 不符 |
| D16 | 创新与差异化 | 90 | 重放包是可审计的落地；但其规格四处矛盾、且所需输入会被镜像 prune 掉，可审计论据因此不可执行 |

---

## 3. 第 4 轮条目核验

状态：**已解决** / **部分**（已改，但不完整、有残留或引入新问题）/ **未解决**。

| 条目 | 状态 | 备注 |
|---|---|---|
| R4-D1-01 | 已解决 | `04` L284 线框注明“人手动展开后”，自动展开 4 区块与 §4.5.3 一致；区块数字与改动视图统一用当前树 |
| R4-D1-02 | 部分 | 头部“尚未集成”、§4.6.5 seal 与分支说明、F5/F7 已补；但就地编辑提交口径仍矛盾（R5-D1-01） |
| R4-D2-01 | 部分 | `05` L338-341/D38/C28a 改为 `getShellConfig(getShellPath())`，源码核实（`index.ts:496`、BT:248）成立；ADR-066 正文未加修订注 |
| R4-D2-02 | 部分 | README/`00` §0.5 已加限定、新增 §0.5.1 差异表；表中一行不实、三项遗漏（R5-D2-01） |
| R4-D2-03 | 部分 | tower-goal 注册 `user_bash`，源码核实（TY:1465-1476、`rpc-mode.ts:561-582`）成立；C31 仍与正文相反、ADR-066 残留 |
| R4-D3-01 | 已解决 | ADR-056 Proposed、ADR-070 Accepted；`15` 与 `01` §1.7.5 一致 |
| R4-D4-01 | 部分 | `satellite_missing` 已统一到 `03`/`06`/`10`/`12`/`08`/`16`/ADR-076；但引出 resumeTo 与优先级冲突（R5-D4-01） |
| R4-D4-02 | 部分 | in_review/accepted 补出口、s0Grant 五态、`denied_timeout`、`verifyFrom` 保留均已写；但 verifyFrom/pendingVerify 未持久化（R5-D4-02） |
| R4-D4-03 | 已解决 | `03` L57/L82 与 `06` §6.1.4/§6.1.6 一致：保持 verifying、记 pendingVerify、同 pin 重跑 |
| R4-D4-04 | 部分 | 优先级表已登记（`05` §5.5、`16` L24）；但与 ADR-076 直接冲突、`alsoApplies` 无数据模型（R5-D4-01） |
| R4-D5-01 | 已解决 | gate 第 7 条只比对内置工具与沙箱 bash 并存深拷贝；源码核实 edit 的 `prepareArguments` 在 `validateToolArguments` 的 `structuredClone` 之前、bash `resolvedCommand` 为局部变量，不误报 |
| R4-D5-02 | 部分 | `05` L429/C30(d) 写明只依赖静态扫描 + 白名单 `{builtin:mcp:1.2.0}`，源码核实 `mcp/index.ts:1191` 只读输入；ADR-065 正文仍写“启动自检”、无白名单 |
| R4-D5-03 | 部分 | `05` L365/L367 定位为回归保护/桩模拟；但 C28b 表格行仍是运行期 `registerTool` 的不可能情形 |
| R4-D5-04 | 部分 | `pi.getSettings()`（TY:1772）、runtime 工厂每次 new/fork 重传 `customTools` 均核实成立；但 RPC 加载期 `getSettings` 抛错、`~` 路径未规范化（R5-D5-01） |
| R4-D6-01 | 部分 | base 保活 ref 删除、影子 gc 持 wtLock、删“唯一副本”、重放包入布局均已做；但重放包规格与清理时机多处矛盾（R5-D6-01、R5-D13-01） |
| R4-D7-01 | 部分 | lifecycleIndirection（`07` L825）、R-T9、槽位复核 runner_tampered、T14/P19 已加；但 stat 快照无 ctime 可规避、未跟踪产物未复核、生命周期键三份清单（R5-D7-01） |
| R4-D7-02 | 部分 | 识别顺序、`$SH/tools`、关自切换、P15/P17 已落实；ADR-063 正文未改、`devEngines` 范围取确切版本规则缺失、Node 运行时未定义（R5-D7-03） |
| R4-D7-03 | 已解决 | 逐条标准生态判定、先看 exec 标准、yarn/bun 去向在 `07` §7.4.1；残留只是 `firstProgram` 取首程序（R5-D7-04） |
| R4-D7-04 | 已解决 | 卫星侧 `.modules.yaml` 改写、`confirm-modules-purge=false`、P16/T17 登记（`07` L479、`10` L236、`16` L826） |
| R4-D7-05 | 部分 | 五点逐条处理；但 `pnpm rebuild --pending` 会执行根包脚本（实测）、npm rebuild 仍待 P17、pnpmfile 与 `file:` 依赖使 stage 失败（R5-D7-02） |
| R4-D7-06 | 已解决 | 统一为 `verifier_store_tampered`（`07` L418、`16` L813/L144） |
| R4-D8-01 | 部分 | §4.6.6 检验流程、`10` §10.8.3、ADR-078、`O 检验` 已登记；检验检出的信任边界未定义（R5-D8-01） |
| R4-D8-02 | 部分 | 被跟踪 env 可读、本地文件清单、三要素行已对齐；但“含密钥不给 Agent”在 S2 读规则下不成立（R5-D8-02） |
| R4-D8-03 | 已解决 | `04` §4.8.2/§4.8.5 与 `08` §8.7.1 一致；`12` L647 残留文字（R5-D15-01 列入） |
| R4-D8-04 | 已解决 | `04` §4.4.1/§4.6.5、`08` §8.10.4 显示“观测 O/M · 未经机器验证（原因）” |
| R4-D9-01 | 已解决 | `12` L188 绿色只给 verified、新增 `◍` 人工验收中性链、`16`/`04` 图例、§12.16 #25 |
| R4-D10-01 | 已解决 | ADR-075 口径贯通 `07`/`13`/`16`，数字一致，删 60 s 巡检；残留见 R5-D10-01/02 |
| R4-D10-02 | 已解决 | `10` §10.4.4、`13` §13.11.1 补镜像与非 Node 下载估算；浅克隆归 D13 |
| R4-D11-01 | 已解决 | ADR-071 gitlink 永不入影子索引 + GitRunner OS 沙箱；影子侧已挡住。嵌套仓库记哨兵、评审中列出 |
| R4-D11-02 | 部分 | ADR-072 控制文件写拒绝 + 注入 + 校验恢复；但 `.git/commondir` 重定向是同类新逃逸，已复现（R5-D11-01） |
| R4-D11-03 | 已解决 | ADR-079 写明 srt 版本固定、`parentProxy`、PAC 单上游、Basic 认证、T30、Host/Supervisor 直用用户代理；srt 0.0.79 结构核实 |
| R4-D11-04 | 已解决 | §11.3.4 密钥表适用于全部字符串参数、`$TI` 入硬底线、相对路径视为不透明 ask、用户检出只禁写不禁读 |
| R4-D11-05 | 已解决 | §11.2 Agent 侧 push/PR 全预设 forbid；T18/T26/T16 过时表述已删 |
| R4-D12-01 | 已解决 | ADR-080；`02` L95、`09` 相关处 |
| R4-D12-02 | 已解决 | `project_identity` 入 `02`/`06` CHECK/`08`/`16` |
| R4-D12-03 | 已解决 | `10` §10.1.1 `tower-satellite` 标记与路径排除；`09` 同步 |
| R4-D13-01 | 部分 | ADR-073 镜像从不 prune，已复现用户 gc 不再损坏；但 30 天 prune 与 180 天保留冲突、强制 fetch 的不可达对象无上限（R5-D13-01） |
| R4-D13-02 | 已解决 | ADR-074 LFS 只读 M1；§10.14 复制用户全局驱动、镜像预取、槽位 smudge |
| R4-D13-03 | 已解决 | §10.3.0 部分克隆不支持、浅克隆须先 unshallow |
| R4-D13-04 | 已解决 | ADR-074 卫星删 `origin`、无远端；Agent 侧 push forbid |
| R4-D13-05 | 已解决 | §10.2 前缀可配置、添加项目与集成前查 D/F 冲突 |
| R4-D13-06 | 部分 | `10` §10.1.2 为唯一加固清单、`07` 引用；但该清单漏了 `.git/commondir`/`worktrees/*`（R5-D11-01） |
| R4-D13-07 | 已解决 | §10.1.2 复制 `info/exclude`、沿用 `core.autocrlf`/`eol`/`safecrlf`；G17 登记 |
| R4-D13-08 | 已解决 | §10.6.2 默认用户仓库无 `refs/tower/*`、只有 seal 分支、pin 从不进入；`push --mirror` 警告与一键清理 |
| R4-D14-01 | 部分 | 甘特图按 29 周重排、满足依赖、计 3 个节假日、M0 算术改正；但 SP6c 天数与 W8 周数不符、P 编号交叉引用错位（R5-D14-01） |
| R4-D14-02 | 已解决 | SP6 用例补齐 A1–A8、G1–G17、P1–P20，天数重估；小残留列入 R5-D14-01 |
| R4-D15-01 | 已解决 | `06` §6.4.3 命令补齐、`goal.resume` 按原因分派、加完整性 lint；双向抽查无缺项 |
| R4-D15-02 | 部分 | #1/#2/#6/#9/#10/#13 已修；#3/#7 未修、#4/#5/#8/#11/#12 部分（R5-D15-01） |
| R4-D16-01 | 部分 | 重放包有了规格、隐私、命令；但四处规格矛盾、所需输入会被镜像 prune（R5-D6-01、R5-D13-01） |
| U1（lint） | 已解决 | 同 R4-D4-03 |
| U2（lint） | 已解决 | `reject_memory` 入 `02`/`06`/`09` |
| U3（lint） | 部分 | 沿用 `quick_ratify`；但 `06` 命令表有两行同名、参数不同（R5-D15-01） |

**合计**：第 4 轮 49 条中，已解决 25，部分 24，未解决 0；lint U1–U3 已解决 2、部分 1。

---

## 4. 追问清单（新增与残留）

编号 `R5-D<维度>-<序号>`。严重度：**阻断** / **重要** / **次要**。

### D1 原论述契合度

**R5-D1-01｜次要**
- **问题**：(a) `04` §4.6.5 L512 仍写“检查点、验证 pin 与基线快照以 `refs/tower/…` 出现在你的仓库中”，与 `10` §10.6.2（默认用户仓库无任何 `refs/tower/*`、pin 从不进入）直接矛盾——这是对用户的直接承诺且写错了。(b) 就地编辑的提交位置：`04` §4.6.4 L478 写“以用户身份提交到卫星 `tower/<G>` 分支（带 trailer）”，ADR-036（`15`）与 `02` L177 写“Tower 不替人提交，trailer 只在 seal”；在卫星里提交要用 Agent 拥有的 index/objects，正是 R3-D11-01 那类问题。
- **为什么重要**：P4 要求不读聊天也能知道“改了什么、落在哪里”；承诺写错会误导用户去翻 Trace。
- **文档位置**：`04` §4.6.4 L478、§4.6.5 L512；`02` L177；`15` ADR-036。
- **期望的回答形态**：改 §4.6.5 的 ref 说明为“默认只有 seal 分支，开启审计地标后才有 `cp/<n>`”；就地编辑改为“保存到卫星工作区、由检查点归因、seal 时写 trailer”，并同步 `04`/`02`/`15`。

### D2 Pi 哲学契合度

**R5-D2-01｜次要**
- **问题**：(a) ADR-066 正文仍写 `createBashToolDefinition(cwd,{…, shellPath, …})`，未按 R4-D2-01 的“传 `operations` 时 `shellPath` 被忽略”加修订注。(b) C31（`05` L1366）仍写 `!cmd` 与 RPC `bash` 不经沙箱，与 L369（注册 `user_bash`）相反。(c) 能力差异表（`00` §0.5.1）有一行不实：SDK 宿主不发 `user_bash`（源码：AgentSession 不发，仅 interactive/rpc 发），M1 的真实差异是“没有 `!cmd`”，不是“`!cmd` 经沙箱”；并遗漏：内置 `llama.cpp` 扩展未从包根导出（SDK 下不可用，出路“改用 pi-rpc”是 M2）、卫星无远端使 `git fetch`/`push`/`config` 类扩展行为不同、注入的 `core.hooksPath` 让扩展发起的提交跳过项目钩子。
- **为什么重要**：能力差异表是 R4-D2-02 要求兑现的对 Pi 用户的诚实承诺。
- **文档位置**：`15` ADR-066；`05` L369、L225、L259、C31；`00` §0.5.1。
- **期望的回答形态**：同步 ADR-066 与 C31；差异表改“M1 不提供 `!cmd`”并补三行遗漏。

### D4 领域模型与生命周期

**R5-D4-01｜重要**
- **问题**：`resumeTo` 的语义与优先级表冲突，且承担三种用途却只有一层。
  - `16` L24 规定 `human > app_quit > budget_hard_cap > … > satellite_missing`；而 ADR-076（`15` L522）、`10` §10.16.2 情形 E 规定 `paused(human)` 的 Goal 卫星丢失后变为 `paused(satellite_missing)` 并把 human 记进 `resumeTo`。两处结论相反：按优先级表 human 应当压过 satellite_missing（卫星丢失只做后台重建、不改 pauseReason）。
  - `resumeTo` 同时用于：卫星丢失返回（ADR-076）、`goal.pause` 在 verifying 时写 `resumeTo:verifying`（`06`）、app_quit 恢复（`06`）。失效路径：`paused{human, resumeTo:{verifying,pin}}` 的 Goal 卫星被删 → `paused{satellite_missing, resumeTo:{paused,human}}`，内层 resumeTo 被覆盖；人恢复时 `goal.resume` 走“其余 → run.requested{resume}”，开了 Run 而不是以同一 pin 重验。
  - `alsoApplies` 写在 `16` L24 的说明里，但不在任何事件或数据模型中，“恢复时一并处理”也无规则。
- **为什么重要**：同一事件三种转移，`transitions.ts` 无法实现；与 R4-D4-01 同类。
- **文档位置**：`16` §16.1.1 L24/L26；`05` §5.5；`06` §6.1.4、§6.4.3；`15` ADR-076；`02` §2.4 L142。
- **期望的回答形态**：裁决 satellite_missing 是“叠加态”（不改 pauseReason，只后台重建）还是可压过 human；若保留覆盖语义，把 `resumeTo` 改为栈或规定保留内层值；定义 `alsoApplies` 字段与逐对恢复规则；同步 `16` L26 的范围说明。

**R5-D4-02｜次要**
- **问题**：`verifyFrom` 在 `07` 明说是“运行时字段，不持久化”，却必须跨越 `paused(s0_grant_pending)` 的无限期等待与应用重启（ADR-077 要求“保留原 verifyFrom”）；`pendingVerify` 只出现在 `06` 正文，`02` 与 DDL 都没有。重启后两者丢失，验收延续退化为整份重新评审。
- **为什么重要**：验收延续是 S0 分支下每个 Goal 都会走的路径。
- **文档位置**：`07` §7.10.3；`06` §6.1.4；`02` §2.4、§2.9 DDL。
- **期望的回答形态**：在 `02` 与 DDL 加 `verify_from`、`pending_verify`，或写明如何从 `resumeTo` 推导。

### D5 Agent 架构与 Pi 集成

**R5-D5-01｜次要**
- **问题**：(a) RPC 下 tower-goal 必须在加载期 `registerTool`，而扩展加载期 `pi.getSettings()` 处于 `notInitialized` 会抛错（`loader.ts:178`），所以构造 shell 与 `commandPrefix` 必须延迟到 `session_start`/`execute`，文档未写。(b) `getSettings().shellPath` 未经 `normalizePath`，`~` 路径在 RPC 下会失败（`getShellPath()` 才规范化）。(c) C28b 表格行仍测运行期 `registerTool(bash)` 的不可能情形；ADR-065 正文仍以此为由。
- **为什么重要**：按现文档实现，RPC 下 tower-goal 会在加载时出错或解析不了用户 shell 路径。
- **文档位置**：`05` §5.4.1 L362、C28b；`15` ADR-065。
- **期望的回答形态**：写明延迟构造时机与路径规范化；C28b 改为桩模拟优先级变化；同步 ADR-065 正文。

**R5-D5-02｜次要**
- **问题**：ADR-072 第 4 点对扩展/ MCP 子进程注入 `GIT_CONFIG_*` 作纵深防御，依赖子进程继承 Host 环境。`pi.exec` 用不带 `env` 的 `spawn`（`core/exec.ts:41`），继承 Host 环境，成立；但 MCP 的 `StdioTransport` 默认 `inheritEnv`（`{...process.env, ...env}`），而 `05` §5.3.5 L321 调用 `createMcpExtension()` 未传 `createTransport`/env 选项，按服务器构建环境（T28）实际未接线；若改 `inheritEnv:false`，必须把 `GIT_CONFIG_*` 放进基础白名单，否则该层防御丢失。
- **为什么重要**：T28 的缓解目前只是条件句，按现有代码骨架实现不会生效。
- **文档位置**：`05` §5.3.5 L321、C21；`11` T28 L374；`15` ADR-072 第 4 点。
- **期望的回答形态**：在 §5.3.5 接上 `createTransport`，写明基础白名单含 `GIT_CONFIG_*`，C21 补用例，RPC 下登记为残余风险。

### D6 系统架构与可靠性

**R5-D6-01｜重要**
- **问题**：重放包有四份互相矛盾的规格：

  | 来源 | 路径 | 保留 | 是否含 pin bundle / 近似重放 |
  |---|---|---|---|
  | `07` §7.4.1 L372-377 | `verify/<verifyId>/replay/` | 30 天；被 accept 引用 180 天 | 不含 pin bundle；depcache 淘汰时“近似重放” |
  | `06` §6.6.4 L968 | `replay/<verifyAttemptId>/` | 与影子相同 | 明确“不做近似重放” |
  | `15` ADR-070 L477 | `replay/<factId>/` | 永久 | 含 base..pin bundle |
  | `16` §16.1.12 L243 | `replay/<factId>/` | — | 含 pin bundle |

- **为什么重要**：“判定可审计”是回应闭源质疑的唯一论据（D16），四份规格无法同时实现则不可执行。
- **文档位置**：`07` §7.4.1；`06` §6.6.4；`15` ADR-070；`16` §16.1.12。
- **期望的回答形态**：保留一份权威规格（路径、内容、保留期、是否近似重放），其余三处只引用它。

### D7 诚实与验证

**R5-D7-01｜重要**
- **问题**：`runner_tampered` 的第二道防线可被规避。stage 复核只记录 `(path, size, mtime, inode)` 快照（`07` L459），之后只对 stat 变化的文件比对哈希（L467-469）；生命周期代码可原地写入第三方依赖文件：inode 不变、补齐到相同大小、`utimes` 恢复 mtime——改动不会被发现。ADR-075 自己依赖 ctime，这里却没用。另外，“调用文件”的闭包未定义（传递 `require`、`prisma` 的自定义 `generator provider`、`vite` 本地插件都不在内），prepare 可向白名单外或 `$SLOT/.tmp`（jest transform 缓存）留下未跟踪文件改变运行器行为，而 `pass_mutated` 只检查被跟踪文件、runner_tampered 只检查第三方依赖目录。
- **为什么重要**：“已验证”是整个诚实语法的信任锚；这是 R4-D7-01 的第二道防线，人覆盖 R-T9 后它是唯一防线。
- **文档位置**：`07` §7.4.3 L459、L467-473、L553、L825；`16` §16.8.2 L839。
- **期望的回答形态**：快照加 ctime，或运行器类包复核时总做全量逐文件哈希；prepare 后记录未跟踪文件集合、白名单外新增报哨兵；标准执行前重置 TMPDIR/运行器缓存；定义“调用文件”闭包或登记为残余风险；SP6c 加规避用例。

**R5-D7-02｜重要**
- **问题**（均在 pnpm 12.6.0 实测）：(a) 锁文件带 `pnpmfileChecksum`，stage 无 `.pnpmfile.cjs` 时 frozen 安装报错；若放进 stage，它在 `--ignore-scripts` 下**仍会执行**——Agent 可改的代码会在持有 `$TI` 令牌的安装器 I 中运行。(b) `file:./vendor/lib` 本地路径依赖因 stage 无该目录而 `ENOENT` 失败。(c) `patchedDependencies` 路径不一定在 `patches/` 下。(d) `10` §10.4.2 L229 的 npm rebuild 命令仍“待 P17 核实”，与 `07` L448 的 `npm rebuild <names>` 不一致。
- **为什么重要**：这是 M1 唯一生态的安装地基；pnpmfile 执行是一条持令牌的代码执行路径。
- **文档位置**：`07` §7.4.3 L434-449；`10` §10.4.2 L222、L229。
- **期望的回答形态**：pnpmfile 二选一（按“生态未支持”，或设 protected 并写明在 I 中执行的威胁）；本地路径依赖复制进 stage 或“生态未支持”；patch 路径取自 `patchedDependencies` 的值；统一 npm rebuild 命令；加 P 用例。

**R5-D7-03｜重要**
- **问题**：Node 运行时的选择没有定义。`depsKey` 含“运行时版本”、`07` L426 写“所选 Node 自带的 npm”，但全文无 `.nvmrc`/`.node-version`/`engines`/volta 的识别规则；V 的 PATH 继承自 Tower 进程，而 macOS GUI 启动的应用拿不到 shell PATH（`05` L397 只为凭据读登录 shell）。pnpm 已固定到确切版本，Node 却没有。安装器 I 构建原生模块所用的 Node 可能与 A/V 不同（ABI 不一致），也可能与用户本机不同。
- **为什么重要**：Node 版本错配会让验证结果与用户本机不符，或原生模块 ABI 崩溃。
- **文档位置**：`07` §7.4.3 L426、L435、L525；`05` §5.5 L397。
- **期望的回答形态**：Node 识别顺序（含人确认）与 `$SH/tools` 同等的固定方式；加 P 用例。

**R5-D7-04｜次要**
- **问题**：`ecosystemSupported` 的 `firstProgram` 只取第一个程序（`07` L356）。`"test":"vitest run && pytest"` 会被判为受支持；pytest 缺失以 exit 127 失败，被当作 Agent 失败进入返工。全文无对 127/ENOENT 的处理。
- **为什么重要**：标签是事实，不能因间接链里的第二个程序缺失而误判为 Agent 错误。
- **文档位置**：`07` §7.4.1 L356。
- **期望的回答形态**：检查间接链中全部程序；127/ENOENT 判为 `verify_env_error`。

### D8 注意力与交互

**R5-D8-01｜重要**
- **问题**：ADR-078 的检验检出是一条新的“沙箱外执行 Agent 代码”路径，信任边界未定义。`10` §10.8.3 第 3 步在 `_inspect` 中“按 `07` §7.4.3 的规则”执行来自 Agent 写的 pin 的生命周期脚本，但 `_inspect` 不是槽位，用哪个沙箱档位、什么网络规则没写；S0（含 `s0Grant=denied`）下等于未授权以用户权限执行 Agent 代码；人随后在外部终端跑的应用同样是 Agent 代码，在沙箱外、带真实密钥运行，无任何提示。服务在 Goal 端口段按 `VerifyProfile.services` 启动，与 Agent 的 `${port:N}` 同段，恢复 running 后撞端口；外部终端拿不到 `${port:N}` 渲染的环境变量，播种的 `.env.local` 固定端口可能连到用户自己的数据库。删除时机两处不一致（`04` L521 “关闭或验收后”、`10` L475 “随卫星”），人在检验目录的修改静默丢弃。
- **为什么重要**：这是 M1 勾选 human 标准的唯一路径，也是 R4-D11-02 之外的又一条沙箱外执行 Agent 代码的路径。
- **文档位置**：`04` §4.6.6 L514-523、§4.7.3 L581；`10` §10.8.3；`15` ADR-078；`11` §11.6。
- **期望的回答形态**：写明生命周期脚本在 `_inspect` 的沙箱档位与网络规则、S0 未授权时不执行；打开前显示信任提示；给检验独立端口偏移或由 Tower 以注入环境变量的 shell 打开；统一清理时机并对未保存改动提示；加 SP6/`14` 用例。

**R5-D8-02｜重要**
- **问题**：“含密钥的本地文件不给 Agent”在 S2 下不成立。S2 对用户主检出整体允许读（`11` L330），对 `<wtRoot>` 下的 `_verify/slot-<k>`（`10` L90）与 `_inspect` 无读拒绝，读拒绝只靠密钥路径表的文件名模式。凡经内容扫描判为含密钥、但文件名不匹配模式的条目（`config/secrets.local.json`、`.dev.vars`、`serviceAccount.json`），本 Goal 与并发 Goal 的 Agent 都能从源头或槽位读到。另一条路径：这些文件播种进槽位后，Agent 写的测试可打印其值，返工提示把“输出末尾 30 行”经 `prompt` 送给模型（`05` L1146），而 `tool_result` 脱敏器的精确匹配集（`11` L376-378）不含本地文件的值。
- **为什么重要**：ADR-078 与三要素行的安全承诺建立在这个前提上。
- **文档位置**：`11` §11.6.2 L330、L376-378、L398；`10` §10.3.1 L163、§10.8.3 L470；`05` L1146。
- **期望的回答形态**：把每条含密钥条目的具体路径（用户检出、`_verify`、`_inspect`）加入 S2 读拒绝；把扫描命中的值加入脱敏器精确匹配集并覆盖返工 `prompt` 与验证日志；SP6 加泄露用例。

### D10 性能

**R5-D10-01｜重要**
- **问题**：`worktreeTree` 在 `full` 模式（pin/seal）下也对 `> 50 MB` 的文件加 `:(exclude)` 排除（`07` L206 的 `bigFileExcludes`）。结果：超大文件不进入 pin 与 seal 的 tree——在全新索引下相当于在 seal 中被删除，Agent 对大文件的改动被静默丢弃。而 L243 的“以 `(path,size,mtime)` 代替、标记 weak”只描述弱指纹，并未反映到实际写出的 tree。
- **为什么重要**：pin 与 seal 是集成到用户仓库的内容；静默丢改动会破坏结果。
- **文档位置**：`07` §7.3.2 L206、L243。
- **期望的回答形态**：弱指纹只用于 advisory；pin、seal 与 full 一律完整收录大文件。

**R5-D10-02｜次要**
- **问题**：(a) `$SH` 中的浏览器/引擎缓存按 `16` 规则 1 每次验证前复核哈希（数百 MB），这项耗时无预算。(b) FSEvents 的 MustScanSubDirs/丢事件、inotify 的 watch 上限未处理（`07` L222、L256）；验收 full 重哈希是兜底，但评审期间的“新鲜”标签可能是错的。
- **为什么重要**：性能预算失真与新鲜度误标。
- **文档位置**：`07` §7.3.2 L222、L256；`16` §16.8 规则 1。
- **期望的回答形态**：为缓存哈希复核计预算或改用 mtime 快路径；收到丢事件标志时强制一次 decisive、监视失败退回低频巡检。

### D11 安全与自主度

**R5-D11-01｜阻断**
- **问题**：`.git/commondir`（及 `.git/worktrees/*/{commondir,gitdir}`）重定向绕过 ADR-072 的控制文件保护。
  - ADR-072 第 2 点与 `11` §11.6.2 L330 只对 `config`、`config.worktree`、`hooks/**`、`info/**`、`modules/**` 与 `.git` 路径本身写拒绝。Agent 提交必须能写 `.git` 根目录（HEAD、index、packed-refs、ORIG_HEAD），因此它能新建 `.git/commondir`。
  - 复现（git 2.56）：卫星中写 `.git/commondir = ../.cache/cd`，在工作区 `.cache/cd/` 放 objects、refs 与含 `filter.evil.clean = sh -c 'touch PWNED; cat'` 的 `config`，`.gitattributes` 写 `*.txt filter=evil`，touch 一个文件。带上 ADR-072 第 4 点的完整注入（`GIT_CONFIG_COUNT`：`core.fsmonitor=false`、`core.hooksPath=<空>`）执行 `git status --porcelain`——**filter 被执行**（生成 PWNED）；`rev-parse --git-common-dir` 指向被重定向的目录。
  - 第 4 点的 `GIT_CONFIG_*` 注入只覆盖 fsmonitor/hooksPath，挡不住 filter、diff textconv 等由配置定义的驱动；第 3 点的哈希校验只覆盖列出的文件，查不到 `commondir`。而扩展的 `pi.exec("git status")`（Pi 示例 `dirty-repo-guard.ts`）随时运行，不只在人工交接时。`14` G10 只测“卫星 config 中的 fsmonitor”，两层防线都已挡住，测不到此路径。
- **为什么重要**：R4-D11-02 原本要关闭的攻击面（沙箱外以用户身份对卫星运行 git、执行 Agent 写入的命令）在 S2 下依然存在；这是与 R4-D11-01/02 同类的确定逃逸。
- **文档位置**：`15` ADR-072 第 2–4 点；`11` §11.6.2 L330、T16、T29；`10` §10.1.2 加固清单；`14` G10、G11。
- **期望的回答形态**：
  - `.git` 根目录改为白名单写入（只允许 git 正常运行所需文件）；`commondir`、`gitdir`、`worktrees/**` 写拒绝；
  - 第 3 点校验增加“重定向文件不存在”；影子的加固清单（`10` §10.1.2）明确 Tower 自己从不读卫星 `.git` 已成立，但这条针对的是沙箱外的其他进程；
  - SP6b 新增用例：`commondir`/`worktrees/*` 重定向到 Agent 控制的 config + filter，由 `pi.exec` 与 IDE 触发，在每个支持的 git 版本回归。

### D12 记忆与学习

**R5-D12-01｜重要**
- **问题**：ADR-080 的身份判定输入不稳定，消歧键未存储。(a) 根集合取自 `rev-list --max-parents=0 HEAD`（`02` L72），随检出的分支变化——旧分支上的检出会被误判为不一致、反复弹确认。(b) 有多个远端时用哪个做消歧键没写。(c) 消歧键不在 `Project.identity` 与 DDL 中（`06` 仍注释 `id = hash(canonical_root)`），同步/导出元数据（`09`）也不含它，跨机器无法对齐拆分出的项目。(d) `project.split` 之后，记忆、信任、VerifyProfile 与已有 Goal 归属哪一方没有定义。
- **为什么重要**：这是 R4-D12-01 的延伸；身份不稳定会反复打扰人，消歧键不持久化使拆分不可跨机对齐。
- **文档位置**：`02` §2.3 L72；`06` §6.3 L403；`09` §9.12；`15` ADR-080。
- **期望的回答形态**：根集合改用 `--all` 计算或定义为“只增不减”；写明选哪个远端；加 `disambiguator` 字段并写入导出格式；写出拆分的归属迁移规则。

### D13 隔离、git 与并发

**R5-D13-01｜重要**
- **问题**：镜像清理与证据保留冲突。(a) 镜像 `gc --prune=now` 在“Project 下所有 Goal 归档后”触发，`10` L186 是 30 天、`06` L966 是 180 天；而影子的 pin 与地标保留 180 天（`06` L965）且经 alternates 复用镜像中的 blob（ADR-073），重放包承诺 180 天乃至永久——镜像 prune 后这些证据静默损坏。(b) 镜像 fetch 用 `+refs/heads/*` 强制更新（`10` L149），基于后来被 rebase 的分支的 Goal，其 base 与复用对象在镜像中不再可达，第 30–180 天之间镜像一旦 gc 即缺对象；只要 Project 一直有活跃 Goal 镜像永不 gc，强制更新的垃圾无上限。(c) 影子 prune 宽限期 `06` L965 是 `2.weeks.ago`、`10` L711 与 `16` L461 是 `1.hour.ago`；卫星删除前提 `06` L963 与 `10` L183 也不同。
- **为什么重要**：这些是数据/证据丢失窗口与无界磁盘增长。
- **文档位置**：`10` §10.3.2 L186、§10.17 L711；`06` §6.6.4 L963-968；`16` §16.2.6 L461；`15` ADR-073。
- **期望的回答形态**：统一清理时机与 prune 宽限；镜像 gc 前把保留期内仍被影子引用的对象 pack 进影子或保留 keep ref；给镜像增长设上限与回收策略。

### D14 路线图与可验证性

**R5-D14-01｜次要**
- **问题**：(a) SP6c 写作 7 天（`14` L32），W8 中却只计 0.8 周（L130）——同一工作两个数字。(b) `07` 的 T1–T17 与 `14` 的 P1–P20 是两套编号，`07` L479 写“P1–P4 增加此用例”在 `14` 中实际是 P16，交叉引用错位。(c) `pnpm rebuild --pending` 实测会执行根包 postinstall，`07` L449 的“不执行项目根脚本”表述不准（因 stage 已删 scripts 暂不致害，但描述错误）。
- **为什么重要**：验收清单是这些设计唯一可证伪的检验，编号错位会让实现者对不上。
- **文档位置**：`14` §14.2 L32、L130、P 用例表；`07` §7.4.3 L449、L479。
- **期望的回答形态**：统一 SP6c 的天数/周数口径；统一 T/P 编号或给出映射；修正 rebuild 描述。

### D15 文档一致性与可执行性

**R5-D15-01｜重要**
- **问题**：残留清单：
  1. 检测器分类不一：`16` L144 把 `nested_repo`、`git_control_tampered`、`runner_tampered`、`lifecycle_script_changed` 登记为 `anomaly`，但 `05`、`07`、`10` §10.3.1、ADR-071/072 都以 `sentinel{detector}` 发出；lint 检查 (d) 漏了这一点。
  2. `Fact.kind`（封闭集）未含 `nested_repo`（`10` L73）与 `workspace.recovered`（`10` L675，正文称其为 Fact）。
  3. `06` 命令表有重复行：`contract.quick_ratify`（L749/L766 参数不同）、`criterion.check_human`（L765/L781）、`goal.take_over/hand_back`（L758/L770）。
  4. `goal.resume` 的“其余 → Run”无守卫：`budget_hard_cap`（未扩预算）、`sentinel_high`、`human_change_verify_failed` 也会被直接开 Run，而 `03` §3.2.1 中这些原因的出口并不含 resume。
  5. `Checkpoint` 接口（`10` L395）仍缺 DDL 有的 `session_id`；`run_id` 在 DDL 可空、接口必填（R4-D15-02 #7 未修）。
  6. `02` L140 的 `budget_hard_cap` 出口仍“只能扩预算或放弃”，漏 `claim_on_behalf`；`05` D39 仍引用未拆分的 C28（L1313）；`09` §9.12.4 清除 Goal 未提镜像/影子/卫星，“清除全部”删 `refs/heads/tower/*` 忽略可配置前缀；ADR-063 L434 与 `16` L829 的令牌口径仍略不同。
- **为什么重要**：`16` 与 `06` 会被直接实现，lint 的“清零”声明需可信。
- **文档位置**：如上。
- **期望的回答形态**：逐条修正；lint 增加“检测器 anomaly/sentinel 分类一致性”与“`Fact.kind` ↔ 文中 Fact 名”两项检查；给 `goal.resume` 的 Run 分支加守卫。

---

## 5. 结论

- **是否所有维度为 100：否。** 最高为 D3 的 96，最低为 D11 的 74。
- **是否还有可追问的问题：有。** 第 4 轮 49 条中，已解决 25、部分 24、未解决 0（lint U1–U3：解决 2、部分 1）。本轮新增与残留追问共 **18** 条：**阻断 1 条**、**重要 11 条**、**次要 6 条**。
  - 阻断：R5-D11-01（`.git/commondir`/`worktrees/*` 重定向绕过 ADR-072 控制文件保护，沙箱外以用户身份执行 Agent 写入的 filter，已复现）。
- **下一轮建议按以下顺序修订**：
  1. 堵住 `commondir`/`worktrees` 重定向（`.git` 根白名单写入 + 校验重定向文件不存在），SP6b 补用例（R5-D11-01）；
  2. 定义检验检出的沙箱档位/网络/端口/密钥信任边界，堵住含密钥本地文件在 S2 下的可读路径与脱敏漏洞（R5-D8-01/02）；
  3. 收敛重放包为单一规格，并保证其输入不被镜像 prune 掉（R5-D6-01、R5-D13-01）；
  4. 给 `runner_tampered` 加 ctime/全量复核、处理 prepare 未跟踪文件；裁决 pnpmfile 与本地路径依赖；定义 Node 运行时选择（R5-D7-01/02/03）；
  5. 裁决 `satellite_missing` 与优先级表的关系、持久化 verifyFrom/pendingVerify（R5-D4-01/02）；
  6. pin/seal 完整收录大文件（R5-D10-01）；
  7. 统一镜像/影子清理时机与宽限期（R5-D13-01）；
  8. 清理检测器分类、`Fact.kind`、命令表重复行与 `goal.resume` 守卫（R5-D15-01）。
