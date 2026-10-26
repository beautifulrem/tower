# 对抗评审 · 第 3 轮

> 评审者：独立对抗 Agent（未参与写作）。评审对象：`docs/00`–`docs/16`、`README.md`、`research/pi-release-diff.md`，以及 `reviews/round-2.md`、5 份第 2 轮回应与 `round-2-lint.md`。
> 核对依据：Pi **发布标签 `v1.2.0`**（`git -C research/pi-mono show v1.2.0:<path>`，不是工作区 HEAD）；对 git 私有对象目录与 pnpm/npm 环境变量做了实际实验与官方文档核对（见各条“证据”）。下文源码路径省略 `packages/coding-agent/src/`：AS = `core/agent-session.ts`，RN = `core/extensions/runner.ts`，TY = `core/extensions/types.ts`，RL = `core/resource-loader.ts`，AL = `packages/agent/src/agent-loop.ts`。

---

## 1. 总评

第 2 轮 44 条中，两条阻断项都有了实质修复。ADR-041 的 `customTools` 接线我在 `v1.2.0` 上逐行核实成立：`customTools` 最后写入注册表（AS:3530-3553）；`tool_call`/`tool_result` 对所有工具通用（AS:652-724）；codemode 的嵌套调用经同一注册表与钩子（AS:730-764）。ADR-026 的 `triggerTurn:false` 不会触发额外回合（AS:2345-2350；`agent.ts:325-327`）。ADR-042 统一了验证容量模型。

但第 2 轮的修复又引入了几处新问题，加上一个此前各轮都没发现的越界路径：

1. **S2 沙箱可被逃逸**（阻断）：Supervisor 在沙箱外对 Agent 可写的 git 元数据（worktree 根的 `.git` 文件、`worktrees/<name>/commondir`、`config.worktree`、`index`）运行 `git add -A`、`status`、`commit-tree`。ADR-044 把 `worktrees/<name>/**` 明确列为写允许。
2. **ADR-044 弄坏用户自己的仓库**（阻断）：实验证实，Agent 提交后、迁回之前，用户主检出中的 `git log --all`、`git for-each-ref`、`git fsck`、`git gc` 全部以 `fatal: bad object` 失败。文档却写“最多滞后一个回合”“`git gc` 安全”。
3. **验证器读 Agent 可写的配置**：验证器读取的 `npmrc` 位于 Agent 可写的 `$GS`。
4. **唯一环境变量表在当前 pnpm 上无效**：pnpm ≥ 11 不再读取 `npm_config_*`；`PRISMA_ENGINES_CACHE` 这个变量并不存在。
5. **ADR-046 与 Pi 的公开 API 冲突**：深度冻结直接违背 Pi 文档规定的“原地修改 `event.input`”。
6. **M1 只支持 Node 后，非 Node 项目实际跑不起来**：在 S2 下既不能安装也不能验证。
7. **20 周排期的缓冲不在冻结之前**：按冻结周算，冻结前几乎没有缓冲。

另有十余处修订残留。

## 2. 评分表

| # | 维度 | 分数 | 一句话理由 |
|---|---|---|---|
| D1 | 原论述契合度 | 90 | Q3 口径已统一；但目标页没有 Changes 区块，与 §4.20 “六字段全部显示”的自述不符（P3/P10 的“改变了什么”） |
| D2 | Pi 哲学契合度 | 87 | 发布版核实、`log` 准入已解决；但 SDK 下的沙箱 bash 会静默顶替用户自己的 bash 扩展，并忽略用户的 bash 设置（`shellPath`/`commandPrefix`），与“你的 Pi 配置照常生效”相悖；SDK 自检永远不会失败 |
| D3 | 论证与证据 | 95 | 证据等级、迁移假设都已补齐；M2 商业检验只测陈述意愿，没有行为指标 |
| D4 | 领域模型与生命周期 | 84 | 出口表有了；但 `s0_grant_pending` 在运行期有两种互斥语义，§3.2 作为“唯一规格”仍缺多条转移，I4 新增的分支不可达，ADR-050 缺少区分“显式范围”的字段 |
| D5 | Agent 架构与 Pi 集成 | 86 | ADR-041、ADR-026 经发布版核实成立；ADR-046 的深度冻结违背 Pi 文档（TY:1455），并使它自己允许的“低风险 + 有修改型扩展”组合不可用 |
| D6 | 系统架构与可靠性 | 93 | 主体严谨；`_objects/` 不在数据目录布局、备份与清理规则中；Host 环境中的 `GIT_OBJECT_DIRECTORY` 会被扩展和 MCP 子进程继承 |
| D7 | 诚实与验证 | 77 | 守卫、超时判别都已成立；但验证器读取 Agent 可写的 `npmrc`；安装器的 stage 不含生命周期脚本依赖的源文件；非 Node 生态在 M1 实际无法验证；pnpm ≥ 11 下私有存储变量全部失效 |
| D8 | 注意力与交互 | 92 | 远程矩阵、可见性上限都已修正；`question_timeout` 条目的开闭状态两处说法冲突；`verify_env` 仍无 dedupeKey |
| D9 | 视觉设计与美观 | 96 | 命名与文案已统一；`10` §10.16.2 情形 E 仍用琥珀色的 `blocked_guard` 表示“工作区丢失” |
| D10 | 性能 | 91 | 资源模型已统一；每 Goal 进程树硬上限与参考项目的测试峰值相撞；参考硬件写成 8 核与 10 核两种 |
| D11 | 安全与自主度 | 70 | **阻断**：Agent 可经 git 元数据让 Supervisor 在沙箱外执行任意命令；代理透传与沙箱代理冲突；T7/T26 的“低”没有考虑沙箱外的扩展工具与 MCP |
| D12 | 记忆与学习 | 94 | 污染洗白路径已堵；ADR-058 的“根集合有交集即合并”会把不同项目的记忆合并 |
| D13 | 隔离、git 与并发 | 70 | **阻断**：ADR-044 使用户主检出的 `log --all`、`for-each-ref`、`fsck`、`gc` 在迁回前全部失败（已实验证实）；`GIT_OBJECT_DIRECTORY` 有全局副作用；迁回与检查点的先后顺序未定义 |
| D14 | 路线图与可验证性 | 80 | 自下而上估算到位；但冻结前缓冲约为 0；角色表沿用旧编号；SP6 在 4 天内要覆盖的内容过多；ADR-043 与 SP6、首次运行测试的样本冲突 |
| D15 | 文档一致性与可执行性 | 84 | lint 覆盖面大；仍有约 15 处残留（DDL 缺 `root_aliases`、`06` 的槽位公式与 F20 过时、“待主干登记”×3、`autoResume` 冲突、C28 断言不可能成立等） |
| D16 | 创新与差异化 | 93 | 开源与付费边界已写明；把“已验证”的信任锚点（验证器）放在闭源付费部分，与可审计、“看到每个 token”有张力，没有论证 |

---

## 3. 第 2 轮条目核验

状态：**已解决** / **部分**（已改但不完整、有残留或引入新问题，见对应 R3 条目）/ **未解决**。

| 条目 | 状态 | 备注 |
|---|---|---|
| R2-D1-01 | 已解决 | ADR-052；`00`/`02`/`04`/`07`/`12`/`16` 口径一致（`04` L29、L158；`12` §12.10.1 L523） |
| R2-D2-01 | 已解决 | `research/pi-release-diff.md`。本轮在 `v1.2.0` 上独立核实 ADR-041/026/046 依赖的语义成立。残留：`01` L9 仍写“`b06c1f2`，v1.2.0”（R3-D15-01） |
| R2-D2-02 | 已解决 | ADR-048；`16` §16.6 重新分类 |
| R2-D2-03 | 部分 | D38–D49 已补；漏登记 customTools bash 不继承 settings 的 `shellPath`/`commandPrefix`（AS:3646-3649），以及用户 bash（`!cmd`、RPC `bash` 命令）与扩展 `pi.exec` 不经 `tool_call`（R3-D2-01、R3-D5-02） |
| R2-D2-04 | 部分 | ADR-049 凭据表成立；但“代理透传到 bash”与 S2 的沙箱代理冲突（R3-D11-02） |
| R2-D2-05 | 已解决 | C15 = 工具 ≤ 350、系统段 ≤ 300；基线论证改为由 E5 裁决 |
| R2-D3-01 | 已解决 | `01` §1.7.1 核实日期与“未发现”的语义 |
| R2-D4-01 | 部分 | `03` §3.2.1 有了逐原因出口；但 `s0_grant_pending` 语义冲突，主表仍缺转移（R3-D4-01、R3-D4-02） |
| R2-D4-02 | 部分 | 17 值在 `02`/`06`/`16`/`12` 一致；`04` §4.18.3 仍三处写“原因值待主干登记”；`provider_unavailable` 的 `autoResume` 与 `16` 冲突（R3-D4-05、R3-D15-01） |
| R2-D4-03 | 部分 | 范围已限定；新增的“settle 时仍有阻塞条目 → 留在 running”分支不可达，且与 `running` 的定义矛盾（R3-D4-03） |
| R2-D4-04 | 部分 | ADR-050 已裁决；`02` §2.5 写“未显式设置更窄的 scope”，ADR-050 写“显式设置即优先”，数据模型也没有字段区分显式范围与模板默认范围（R3-D4-04） |
| R2-D4-05 | 已解决 | 修订矩阵补了三列；状态图声明以表为准（表本身的缺口见 R3-D4-02） |
| R2-D4-06 | 已解决 | ADR-058；`02` 有 `rootAliases`（DDL 缺列，见 R3-D15-01；合并规则的新问题见 R3-D12-01） |
| R2-D5-01 | 已解决 | 发布版核实：`customTools` 最后写入（AS:3530-3553）；sourceInfo 为 `<sdk:bash>`（AS:3534）；钩子对 `customTools` 同样生效（AS:652-724，`wrapper.ts:4-5`）；嵌套 codemode 调用用的是生效注册表中的 bash，并且经过钩子（AS:730-764）。新问题见 R3-D2-01 |
| R2-D5-02 | 已解决 | `triggerTurn:false` → `_pendingCustomMessages`（AS:2345-2350）；`hasQueuedMessages()` 不含它（`agent.ts:325-327`） |
| R2-D5-03 | 部分 | “抛错即阻断”成立（RN:1249-1267、AS:675-680、AL:770-776）；但冻结违背 Pi 文档（TY:1455），与 ADR-046 自己的适用范围冲突（R3-D5-01） |
| R2-D5-04 | 已解决 | `03` I4、`05` §5.5、`06` §6.2.3 一致：持续监视、如实归因、1 小时规则 |
| R2-D5-05 | 已解决 | Observer 合并 start/end/obs；`cwdOverride`；`--session-id`；`sessionId` 进入 Provenance 与 DDL |
| R2-D6-01 | 已解决 | ADR-057；DDL 删除守护含 `abandoned` |
| R2-D7-01 | 已解决 | ADR-042；`07` §7.4.10 与 `13` §13.8.3 同一套预留。残留：`13` 写 8 核，`07`/`16` 写 10 核；`06` §6.2.4 仍是旧公式（R3-D15-01）；进程树上限问题见 R3-D10-01 |
| R2-D7-02 | 部分 | 逐生态表与 SP5/SP6 矩阵已有；stage 安装忽略依赖源文件的生命周期脚本；验证器读 Agent 可写的 `npmrc`；pnpm 物化的细节（R3-D7-01、R3-D7-02、R3-D7-04） |
| R2-D7-03 | 已解决 | ADR-053；`07` `progress()` 与 `12` §12.5.2 |
| R2-D7-04 | 已解决 | ADR-054；`06` F20 仍是旧写法（R3-D15-01） |
| R2-D7-05 | 已解决 | `links_deferred`/`links_unchecked`、`network` 声明 |
| R2-D8-01 | 已解决 | ADR-051；`contract.quick_ratify` 命令；web 只允许不放宽的修订（lint U1、U3 已闭合） |
| R2-D8-02 | 已解决 | 可见性上限定义为“有资格自动展开”；17% 的算术已改 |
| R2-D9-01 | 部分 | 命名、原因徽章、暂停文案已统一；`10` §10.16.2 情形 E 仍是 Mode `blocked_guard`（R3-D9-01） |
| R2-D10-01 | 已解决 | `06` §6.1.1 引用 `16` 的唯一规则 |
| R2-D10-02 | 已解决 | 预热规则；16 GB 演算计入服务与 fsmonitor |
| R2-D11-01 | 已解决 | 改为静态清单，确认之前不执行任何代码 |
| R2-D11-02 | 部分 | 公共对象库已写拒绝；但私有对象目录带来悬空引用与环境副作用（R3-D13-01）；同时开放的 `worktrees/<name>/**` 是逃逸入口（R3-D11-01） |
| R2-D11-03 | 部分 | `16` §16.8 唯一表已建；但 V 的 `npmrc` 指向 `$GS`；pnpm ≥ 11 不读 `npm_config_*`；`PRISMA_ENGINES_CACHE` 不存在；`npm_config_devdir` 已被 npm 11 弃用（R3-D7-01、R3-D7-04） |
| R2-D11-04 | 已解决 | 祖先 `.agents/skills` 复核；§11.3.3 三类改写 |
| R2-D12-01 | 已解决 | 只有人自己输入的自由文本在白名单内 |
| R2-D12-02 | 已解决 | §9.5.4、§9.12.2 已改；`09` §9.1 L39 未提“首次绑定后固定”（R3-D15-01） |
| R2-D13-01 | 已解决 | ADR-055：20000–29999、bind 探测、模板、试运行 |
| R2-D13-02 | 已解决 | 硬链接说法删除；`attach.commonDir`；Go `chmod`/`-modcacherw` |
| R2-D14-01 | 部分 | 19 个工作包、71 人周；但冻结前缓冲约为 0，角色表沿用旧编号（R3-D14-01） |
| R2-D14-02 | 已解决 | ADR-059 为唯一来源；`04`/`14` 对齐（`04` §4.12 只写“项目记忆”属残留） |
| R2-D14-03 | 已解决 | 非劣效、功效推导、E7 按 S0/S2 定义拦截 |
| R2-D15-01 | 部分 | 主要残留已清；新残留见 R3-D15-01 |
| R2-D15-02 | 部分 | lint U5 已闭合；但 lint U2（`verify_env` 的 dedupeKey）仍未处理，DDL 缺 `root_aliases`，`16` §16.8 不完整（R3-D8-02、R3-D15-01） |
| R2-D15-03 | 已解决 | 引用已改；lint 1890 处 0 断链 |
| R2-D16-01 | 已解决 | ADR-056（Proposed）与 M2 商业检验；新问题见 R3-D16-01 |

**合计**：已解决 30，部分 14，未解决 0。

---

## 4. 追问清单（新增与残留）

编号格式：`R3-D<维度>-<序号>`。严重度：**阻断** / **重要** / **次要**。

### D1 原论述契合度

**R3-D1-01｜重要**
- 问题：原论述 P3/P10 要回答“它改变了什么”，`04` §4.20（L1083）也声称“Goal / Task / Cause / Decision / Changes / Validation 目标页全部显示”。但目标页状态视图的线框（§4.5.1 L283-322）、区块规则（§4.5.2）和可见性表（§4.5.3）**都没有 Changes 区块**。改动统计只出现在卡片第 4 行（§4.4.1）和简报的“改动评审”行（§4.9.2）；文件级的改动只能进入评审模式查看，而评审模式只在 `in_review` 时可用（§4.2.1）。运行中的 Goal 在目标页上看不到“改了哪些文件、在不在围栏内、哪些是测试”。
- 为什么重要：Changes 是原论述六字段中唯一被静默丢掉的；而 R1 体系下 diffstat 与 `files_touched` 都是现成的 Fact（`07` §7.2.3）。
- 文档位置：`04` §4.5.1–4.5.3、§4.20；`12` §12.10.6。
- 期望的回答形态：在 §4.5.2/§4.5.3 增加“改动”区块（相对 base 的 diffstat、按目录聚合的文件列表、测试或围栏外路径的标记、到检查点 diff 的入口），写明各状态下的可见性与它在 4 区块上限中的优先级；或者修改 §4.20，把它登记为有意偏离并给出理由。

### D2 Pi 哲学契合度

**R3-D2-01｜重要**
- 问题：ADR-041 改用 `customTools` 后，方向反了过来，Tower 的 bash 现在压过一切同名定义。由此带来四点后果，文档都没有写：
  1. 用户自己覆盖 `bash` 的扩展在 SDK 下**静默失效**，例如 Pi 自带的 sandbox 示例、ssh/远程执行、容器执行类扩展。SDK 下自检读到的必然是 `<sdk:bash>`（AS:3534），所以 `04` §4.18.3 与 `12` §12.6.6 的“沙箱被扩展 X 覆盖 → S0”在 M1（只有 SDK）中**永远不会出现**。用户的扩展被顶替时，也没有任何提示。
  2. 内置 bash 会从用户设置读取 `commandPrefix`/`shellPath`（AS:3646-3649），`customTools` 的 bash 不会（`createBashToolDefinition` 只收到 `operations`/`spawnHook`，`05` L338-341）。依赖 `commandPrefix`（例如先 `source` 环境）或自定义 shell 的用户，在 Tower 中的命令行为与在自己的 pi 中不同。
  3. bash 默认导出 `PI_*` 变量（`bash.ts:193-211`），`spawnHook` 的白名单重建会不会去掉它们，没有写。
  4. 契约测试 C28 要求“测试扩展覆盖 bash 时，自检降级到 S0”，在 SDK 下这在构造上就不可能成立。
- 为什么重要：README L19 与 `00` §0.5 承诺“你的 Pi 扩展与配置照常生效”，`05` §5.10 写的是“Adapt Pi to your workflows”。bash 是 Pi 最核心的工具，在这里却被 Tower 无声地换掉了。
- 文档位置：`15` ADR-041；`05` §5.3.5、§5.11.1 D39、C28；`04` §4.18.3；`12` §12.6.6；README L19。
- 期望的回答形态：
  - 静态清单（§5.10）中检测“注册了名为 `bash` 的工具”的扩展，确认卡片上写明“其 bash 将被 Tower 沙箱版本取代”；
  - 把用户设置的 `commandPrefix`/`shellPath` 传入 `createBashToolDefinition`，或说明不传的理由；
  - C28 按适配器拆成两条断言；
  - 说明 SDK 下的自检防的是什么（例如未来 Pi 改变优先级），否则删掉 SDK 下的 UI 状态。

**R3-D2-02｜次要**
- 问题：基线表述不一致。`01` L9 写“`b06c1f2`，v1.2.0”，但 `b06c1f2` 比 v1.2.0 晚 46 个提交；`00` L4 与 `04` §4.15 写“固定版本 1.2.x”，`05` §5.11 写“精确固定 1.2.0”；`04` L178 的侧栏线框写“Pi 1.2.3”。
- 为什么重要：ADR-047 的目的就是把核实对象固定到一个确定版本。
- 文档位置：如上。
- 期望的回答形态：统一为“1.2.0（精确）”。

### D3 论证与证据

**R3-D3-01｜次要**
- 问题：ADR-056 与 `14` §14.4.1 的商业检验只用陈述意愿（“愿意付费”≥ 30%）。陈述意愿普遍高估实际转化，这里没有任何行为指标（例如预付、意向书，或者付费墙关闭后的留存）。
- 为什么重要：K6 是“高 / 高”风险，转向或停止商业化的决定完全取决于这个阈值。
- 文档位置：`15` ADR-056；`14` §14.4.1、K6。
- 期望的回答形态：增加一个行为指标及其阈值，或说明为什么陈述意愿在这里足够。

### D4 领域模型与生命周期

**R3-D4-01｜重要**
- 问题：`s0_grant_pending` 有两种互斥语义。
  - **运行阶段**：`05` §5.6.5 gate 第 4 条与 `11` §11.2 规定 S0 首次 `exec.test` 为 gate 的 `ask`，即 Agent 阻塞、Mode 为 `blocked_guard`、`use_defaults` 时 30 min 后默认拒绝；`04` §4.8.5 的授权卡也写“Agent 阻塞”。但 `03` §3.2.1 L77、`04` §4.18.3 L1044、`12` §12.6.5 L398 写的是 `paused(s0_grant_pending)`，“若暂停于运行阶段 → running”。阻塞的 ask 不是暂停：Run 仍然活跃，不会 drain。
  - **验证阶段**：`07` §7.4.1 L294 是 `return requestUnsandboxedGrant(goal)`（“生成 approval 并返回 waiting”），`decide()` 与 §7.10.3 的组合表里都没有这条路径，`03` 却写 `verifying → paused(s0_grant_pending)`。
  - 拒绝授权之后 Goal 去哪，也没有写：`11` §11.2 说该 Goal 只能产出 human 标准结果，但它的机器标准永远不会被执行，Goal 也就永远无法进入 `claimed → in_review`。
- 为什么重要：M1 的 SP6 = B 分支下，这是每个 Goal 都会经过的路径。
- 文档位置：`03` §3.2、§3.2.1；`05` §5.6.5；`07` §7.4.1、§7.10.3；`04` §4.8.5、§4.18.3；`12` §12.6.5。
- 期望的回答形态：一种定义。例如运行阶段只用 ask（删除“暂停于运行阶段”）；验证阶段进入 `paused(s0_grant_pending)` 并写进 `decide()`。另外写明拒绝后的去向，例如进入 `in_review` 并标为“未经机器验证（S0 未授权）”，或进入 `paused` 等待人裁决。

**R3-D4-02｜重要**
- 问题：§3.2 自称“唯一规格”（L12），`06` §6.2.3 要求“状态 × 输入”穷举并 100% 覆盖，但主表仍缺这些转移：
  - `running` 行的出口只列了 human、软上限、停止条件和 `idle_without_submit`，缺少进入 `question_timeout`、`external_change`、`provider_unavailable`、`budget_hard_cap`、`engine_crash`、`app_quit`、`worktree_missing` 的转移。
  - `verifying` 行没有“出现 `agent_start` → 撤回到 `running`”与“→ `paused(post_settle_activity)`”（只写在 claimed 行）；也没有人在验证中按暂停、应用在验证中退出时的转移（`06` §6.1.6 只处理崩溃恢复）。
  - `claim_on_behalf`（§3.2.1 L72）绕过了 I4 的“有效 submit + agent_settled”，I4 没有登记这个例外。
  - `budget_hard_cap` 只有“`extend_budget` 或 `abandon`”：已经完成的工作无法不花钱地进入验证（验证不消耗 LLM 预算）。
- 为什么重要：转移表要直接变成 `transitions.ts`；缺一条，实现就只能自己猜。
- 文档位置：`03` §3.2、§3.2.1、§3.3 I4；`06` §6.2.3。
- 期望的回答形态：把 §3.2.1 的入口一侧也补进主表（每个 `pauseReason` 从哪些状态、由什么输入进入）；`verifying` 行补撤回与暂停；I4 增加 `claim_on_behalf` 的例外；给 `budget_hard_cap` 一个“按当前状态提交验证”的出口，或说明为何不要。

**R3-D4-03｜次要**
- 问题：I4 与 `05` §5.5 的 settle 判定表新增了一个分支：“有效 submit，但存在本 Run 的阻塞条目（例如 Agent 在 submit 后又调用了 `ask_user`）→ Goal 保持 `running`、Mode `waiting_human`”。
  - 这个分支在正常路径上不可达。`ask_user` 和 gate 的 ask 在工具执行内部阻塞，问题没得到回答，Run 就不会 settle。只有 Pi 侧兜底超时或 abort 之后才会出现这种情况，而这两种情况已经由 `question_timeout` 与 drain 处理。
  - 它还与 `03` 中 `running` 的定义“有一个活跃 Run”（L54）以及“Mode 只在有活跃 Run 时存在”（`16` §16.1.2）矛盾。
- 为什么重要：不可达的分支会诱导实现出一种无 Run 却处于 `running` 的状态。
- 文档位置：`03` §3.3 I4；`05` §5.5 settle 判定。
- 期望的回答形态：写明这个分支实际在什么条件下出现（例如 abort 后），并指定它进入的状态（例如 `paused(question_timeout)`）；或者删掉。

**R3-D4-04｜次要**
- 问题：计划编译的两处规则不一致。`02` §2.5 L266 写“若合同**未显式设置更窄的** scope，则 `scope.include = ∪ touches`”；ADR-050 写“人**显式**设置了 `scope.include` 即以它为准”。两种写法在“显式范围比 ∪touches 更宽”时结论相反。另外 `ScopeFence` 没有字段区分“人显式设置”与“快速路径模板生成的默认围栏”（`03` §3.4.1），而高风险 Goal 的快速路径要求补计划，于是编译结果没有定义。
- 为什么重要：门禁的范围判定直接依赖它。
- 文档位置：`02` §2.5 L227-236、L265-269；`15` ADR-050；`04` §4.10.2。
- 期望的回答形态：统一措辞；增加 `scope.includeOrigin: "explicit" | "template" | "compiled"`，并写出三者的优先级。

**R3-D4-05｜次要**
- 问题：`03` §3.2.1 L81 规定 `provider_unavailable` 在探测成功后自动 `autoResume`；`16` §16.1.1 L23 写“`autoResume=true` 只用于 `app_quit`、`engine_crash`”；`06` §6.1.4 第 5 条的 `resumeOnLaunch` 也只列这两个值。
- 为什么重要：自动恢复会花钱，必须只有一处定义。
- 文档位置：如上。
- 期望的回答形态：裁决并同步三处；如果 `provider_unavailable` 自动恢复，再写明探测节奏。

### D5 Agent 架构与 Pi 集成

**R3-D5-01｜重要**
- 问题：ADR-046 的深度冻结与 Pi 的公开扩展 API 冲突。
  - Pi 在 `types.ts` 中**明确要求**扩展通过原地修改 `event.input` 来改参数：“To modify arguments, mutate `event.input` in place instead”（TY:1455）。扩展模块以严格模式运行，所以在 RPC 下，排在 gate 之后、按文档写法修改参数的扩展，**每一次**调用都会抛 `TypeError` 并被阻断（AL:770-776）。
  - ADR-046 却规定检测到这类扩展时“只允许 `riskTier = low` 的 Goal”。被允许运行的低风险 Goal，恰好是工具调用会被系统性阻断的 Goal。
  - 冻结对象也是 `execute` 收到的参数（AL:768、834）。用户扩展工具或 MCP 工具在 `execute` 中修改自己参数的情况也会抛错，而 C30 只覆盖内置工具（内置工具确实安全，edit 的规范化发生在 `structuredClone` 之前，`edit.ts:103-134`；`validation.ts:318-320`）。
  - `11` §11.4 L259 的残余风险“非严格模式的静默写入”在实际中几乎不会出现。
- 为什么重要：RPC 是“使用我安装的 pi”的承诺。这项设计在它允许运行的组合上不可用，在其余组合上又直接拒绝。
- 文档位置：`15` ADR-046；`05` §5.4.1、C30；`11` §11.4、T27。
- 期望的回答形态：二选一，并用真实扩展语料验证。
  - (a) 检测到 `tool_call` 修改型扩展时一律拒绝 RPC，不再区分风险等级；
  - (b) 不冻结，只保留哈希比对，并把 RPC 限定为“无 `tool_call`/`tool_result` 处理器的用户扩展集合”。
  - 另外 C30 要覆盖“扩展工具在 `execute` 中修改参数”的情形。

**R3-D5-02｜次要**
- 问题：依赖清单与威胁表没有登记两条不经 `tool_call` 和沙箱的执行路径：
  - 用户 bash：交互式的 `!cmd` 与 RPC 的 `bash` 命令，都走 `emitUserBash → executeBash(createLocalBashOperations)`（`rpc-mode.ts:561-567`；AS:3866-3883）；
  - 扩展的 `pi.exec`。

  Tower 自己不发出这两类调用，但用户扩展的工具和命令会。另外，运行期的 `registerTool` 会刷新注册表（`loader.ts:300`），RPC 下启动时的自检可能过时。
- 为什么重要：S2 的保证只覆盖 Tower 的 bash；这两条路径需要明确列为“沙箱外”。
- 文档位置：`05` §5.11.1；`11` T16。
- 期望的回答形态：登记为 C 类依赖与 T16 的子项；RPC 下每次 `tool_call` 用 `pi.getAllTools()` 复核 bash 来源（只是一次内存查询）。

### D6 系统架构与可靠性

**R3-D6-01｜次要**
- 问题：
  - `<wtRoot>/_objects/<goalId>`（ADR-044）不在 `06` §6.6.1 的目录布局、§6.6.1 的备份排除、§6.6.4 的保留与清理表中（只有 `10` §10.3.2 提到删除）。迁回之前，它是 Agent 提交的**唯一副本**，也不在 bundle 备份中（bundle 从 commonDir 生成，`10` §10.16.3）。
  - `05` §5.3.6 把 `GIT_OBJECT_DIRECTORY` 放进 **Host 环境**。Host 派生的所有子进程（MCP 服务器、用户扩展执行的 git）都会继承它。
- 为什么重要：前者是数据丢失窗口；后者让沙箱外的代码把对象写进 Agent 的私有目录。
- 文档位置：`06` §6.6.1、§6.6.4；`05` §5.3.6；`10` §10.16.3。
- 期望的回答形态：把 `_objects/` 加入布局、备份与清理规则；bundle 前先迁回；Host 环境不设 `GIT_OBJECT_DIRECTORY`，只给 tower-goal 自己的 git 调用与沙箱 bash 传入。

### D7 诚实与验证

**R3-D7-01｜重要**
- 问题：验证器读取 Agent 可写的配置。
  - `16` §16.8.1 L786：npm/pnpm 用户配置一行中，V 列为“`$GS` 同款净化副本”，A 列为 `$GS/npmrc`；而 `$GS` 对 A 读写（L775、`11` §11.6.2）。Agent 改写这份 `npmrc` 即可影响验证器的 `pnpm test`：npm 与 pnpm 在执行 `run` 脚本时会应用 `node-options`（成为 `NODE_OPTIONS`，例如 `--require <worktree 内的文件>`）与 `script-shell`；被 `--require` 的文件会在测试进程内先于测试执行（例如改写 `process.exit` 或测试运行器）。
  - 项目级 `.npmrc` 已列为 protected，但这份用户级副本不受任何保护。
  - 同类风险：V 列中所有指向 `$GS` 或 `$SH` 的路径都要检查。`$SH` 对 A 只读，没问题；node-gyp 的 V 列是 `$SH`，也没问题。
- 为什么重要：这直接击穿 ADR-021“Agent 不可写验证器依赖”，而且击穿得不可见（配置不在指纹中）。
- 文档位置：`16` §16.8.1；`07` §7.4.3；`15` ADR-021、ADR-045。
- 期望的回答形态：V 使用 `$VS` 中由安装器生成的副本（只读，带哈希复核）；在 §16.8 的规则中写明“V 列不得引用 A 可写路径”，lint 检查这一点；SP6 增加篡改用例（类似 T2）。

**R3-D7-02｜重要**
- 问题：stage 安装忽略依赖源文件的生命周期脚本。
  - 安装器只把依赖相关文件放进 stage：`package.json`、lockfile、`pnpm-workspace.yaml`、`.npmrc`、`patches/`（`07` §7.4.3 L352-353）。但大量 Node 项目的 `postinstall`/`prepare` 依赖源文件，例如 `prisma generate` 读 `prisma/schema.prisma` 并把客户端生成到 `node_modules/.prisma`；还有 `husky install`、`ts-patch` 和各类代码生成脚本。在 stage 中执行它们会失败（→ `verify_env_error`），或生成出与 pin 不一致的产物。
  - `depsKey` 不含这些输入。Agent 改了 `schema.prisma` 之后，depcache 命中，物化的却是旧的生成客户端，于是验证器在一个过期的生成产物上得出结论，假通过与假失败都可能出现。
  - `VerifyProfile.prepare` 写的是“安装器之后、标准之前执行”（`07` §7.13），但 `07` §7.4.3 的伪代码又把它放在安装器沙箱里，还计入了 `depsKey`。它到底在 stage 中还是在槽位中针对 pin 执行，没有确定。
- 为什么重要：Prisma 一类的代码生成在 Node Web 项目中很常见，正是 M1 唯一支持的生态。
- 文档位置：`07` §7.4.3、§7.13；`10` §10.4.2；`14` SP5/SP6。
- 期望的回答形态：
  - 规定项目自身的生命周期脚本（根与 workspace 的 `postinstall`/`prepare`）不在 stage 执行，而是物化之后在槽位中、针对 pin 执行；
  - `VerifyProfile.prepare` 明确在槽位中执行；
  - `depsKey` 只覆盖第三方依赖；
  - SP5/SP6 测试矩阵加 Prisma 用例。

**R3-D7-03｜重要**
- 问题：ADR-043 的“非 Node 项目以‘有保留（生态未支持）’基本验证”在 S2 下实际不可行。
  - **验证器侧**：非 Node 项目没有 depcache，干净槽位里只有源码。`cargo test` 需要下载 crates，但验证执行阶段默认禁网（`07` §7.4.4、`11` §11.6.3），而且对 `~/.cargo` 写拒绝；`pytest` 需要的 venv 不存在；`go test` 需要模块缓存。结果几乎必然是 `verify_env_error`，而不是“有保留的已验证”。
  - **Agent 侧**：`16` §16.8 的 M1 表只有 Node；S2 又对 `~/.cargo`、`~/.cache/uv`、`~/go/pkg/mod` 写拒绝（`11` §11.6.2 L324）。Agent 在非 Node 项目中连 `cargo build`、`uv sync`、`go mod download` 都会失败。
  - 与之冲突的是：`04` §4.18.1 L1021 的首次运行可用性测试用“Node / Python 各半”的真实仓库；SP6（`14` L30）测 `cargo test`。
- 为什么重要：ADR-043 对 UX 的承诺（`04` §4.2.4、`12` 徽章“生态未支持”）在默认安全档位下兑现不了，用户看到的是持续的环境故障。
- 文档位置：`15` ADR-043；`07` §7.4.3；`11` §11.6.2；`16` §16.8；`04` §4.2.4、§4.18.1；`14` SP6。
- 期望的回答形态：如实规定 M1 中非 Node 项目的行为。可选方案：添加项目时直接提示“M1 不支持该生态的验证”，把机器标准降为 human 标准；或者给出最小可行的私有存储与槽位内安装规则（例如槽位内允许注册表网络安装、`CARGO_HOME` 写入槽位副本）。同步修改首次运行测试的样本与 SP6 的用例。

**R3-D7-04｜重要**
- 问题：`16` §16.8.1 这张“唯一表”的多个变量在当前工具版本上无效或不存在（实验与文档核实见附注 A）：
  1. **pnpm ≥ 11 不再读取 `npm_config_*`**，只认 `pnpm_config_*` / `PNPM_CONFIG_*`。实测 pnpm 12.6 中，设置 `npm_config_store_dir` 后 `pnpm config get store-dir` 仍为 `undefined`，store 依旧落在 `~/Library/pnpm/store`。后果：
     - 在 S2 下，Agent 的 `pnpm install` 会写用户全局 store，遭写拒绝而失败；
     - 在 S0 下，它会写进用户全局 store，违背 ADR-021 第 1 条“不使用用户的全局包缓存”；
     - 安装器的 `package-import-method=clone-or-copy` 同样无效，回落到 `auto`（pnpm 12 在 Linux 上硬链接优先），与“禁止硬链接”冲突。

     项目用哪个 pnpm 版本由 `packageManager` 字段经 Corepack 决定，Tower 无法假定是 v10。
  2. **`PRISMA_ENGINES_CACHE` 不存在**（@prisma/fetch-engine 7.10 的缓存目录取 `$XDG_CACHE_HOME/prisma` 或 `~/.cache/prisma`）。而 A 列的 `XDG_CACHE_HOME` 指向 `$GS`，Prisma 引擎因此会在每个 Goal 中重新下载，而不是从 `$SH` 只读共享。表中的“变量名以 SP6 核实为准”把一个已知不存在的变量写进了唯一表。
  3. **`npm_config_devdir` 已被 npm 11 弃用**（node-gyp README：npm 12 移除；npm 11 已提示 `Unknown env config "devdir"`），新形式是 `npm_package_config_node_gyp_devdir`。
  4. **`verifyDepsBeforeRun`**：在 pnpm v11+ 中默认值为 `install`，环境变量名为 `pnpm_config_verify_deps_before_run`；关闭它的设置只写在 `07` §7.4.3 L370，不在唯一表中。另外，`.pnpm-workspace-state-v1.json` 以**项目的绝对路径**为键，`.modules.yaml` 记录 store 的绝对路径。stage 路径与槽位路径不同，于是在槽位里执行 `pnpm test` 时可能判定依赖“过期”而触发安装：
     - 槽位只读 store、执行阶段禁网，这次安装会失败，被记为 `verify_env_error`；
     - pnpm 10 的 `pnpm add` 会报 `ERR_PNPM_UNEXPECTED_STORE`；
     - pnpm 12 会静默地重新下载。
- 为什么重要：ADR-043 让 M1 只支持 Node，这张表就是 M1 唯一生态的地基，SP6 也按它“逐行验收”。按现状实现，在 pnpm 11/12 项目上私有存储整体失效。
- 文档位置：`16` §16.8.1；`07` §7.4.3；`15` ADR-045；`14` SP6。
- 期望的回答形态：
  - 按 pnpm 主版本给出变量名（同时设置两种前缀会触发 npm 11 的未知配置警告，需写明取舍），或改为生成一份 Tower 专用的 `npmrc`/`pnpm-workspace` 配置文件，不依赖环境变量前缀；
  - Prisma 改用 `XDG_CACHE_HOME` 分角色设置，或接受按 Goal 下载并计入成本；
  - node-gyp 改用新变量；
  - 把 `verifyDepsBeforeRun` 与“槽位内只执行 run 类命令、绝不执行 install”写成唯一表中的规则；
  - 物化之后改写或删除 `.modules.yaml` 与 `.pnpm-workspace-state-v1.json`，并在 SP6 中测 pnpm 9/10/11/12 四个版本。

### D8 注意力与交互

**R3-D8-01｜次要**
- 问题：`question_timeout` 之后，问题条目是打开还是关闭，两处说法冲突。`08` §8.7.1 L409 写“超时 = 暂停 Goal……**条目保留**”；同节 L423 写“超时决策记为 `resolution.by = "timeout"`……计入 `outcomeClass:"timeout"`”，`resolution` 有值即视为已关闭。`03` §3.2.1 L78 的出口又要求人之后作答。
- 为什么重要：条目关闭后，人就无处作答；条目保留，告警精度的统计口径又会变化。
- 文档位置：`08` §8.7.1；`03` §3.2.1；`02` §2.9。
- 期望的回答形态：问题类超时暂停时条目保留打开（不写 `resolution`），只追加一个 `timedOutAt` 字段；写明它在精度统计中的口径。

**R3-D8-02｜次要**
- 问题：lint U2 仍未处理。`verify_env` 是 14 种 Needs-You 之一（`02` §2.9、`06` CHECK），但 `08` §8.4 的 dedupeKey 表中没有这一行，而 `needs_you_open_dedupe` 唯一索引要求 dedupeKey 非空。
- 为什么重要：实现时只能自己发明一个键。
- 文档位置：`08` §8.4；`reviews/round-2-lint.md` U2。
- 期望的回答形态：补一行（例如 `ve:{goal}:{stage}`）。

### D9 视觉设计与美观

**R3-D9-01｜次要**
- 问题：R2-D9-01 的第 4 点未改。`10` §10.16.2 情形 E（L574）仍写“Mode `blocked_guard`（原因‘工作区丢失’）”。`blocked_guard` 的徽章是琥珀色 `◆ 等你批准`（`12` §12.6.3），而这时并没有任何需要人决定的事。
- 为什么重要：违反“琥珀只表示需要你决定”。
- 文档位置：`10` §10.16.2。
- 期望的回答形态：改为 `preparing`（重建中）或 `stalled{subtype:"worktree_missing"}`。

### D10 性能

**R3-D10-01｜次要**
- 问题：
  - 每 Goal 进程树硬上限是 `max(2 GB, 1.5 × p90_g)`，无历史时 `p90_g = 1.2 GB`（`13` §13.8.3 L190；`16` §16.2.6）。参考项目的验证峰值“≤ 2 GB”（ADR-042），Agent 在自己 worktree 中跑同一套测试，峰值也在 2 GB 附近，再加上 dev server 或 tsserver 就会超过上限。超过时 Tower 会“杀掉最大子进程组”，也就是 Agent 自己的测试运行。
  - `p90_g` 的定义（“近 20 次 Run 进程树峰值的 p90”）同时出现在预留与杀进程两个用途里：作为预留它偏大，作为上限的基数它又偏小。
  - 参考硬件在 `13` §13.8.3 是“8 核”，在 `07` §7.4.10 与 `16` §16.2.3 是“10 核”。
- 为什么重要：会在参考项目上误杀合法的测试运行，并把它归因为资源超限。
- 文档位置：`13` §13.8.3；`16` §16.2.6；`07` §7.4.10。
- 期望的回答形态：杀进程上限与验证器的杀进程上限采用同一口径（例如 `max(验证器上限, 1.5 × p90_g)`）；统一参考硬件的核数。

### D11 安全与自主度

**R3-D11-01｜阻断**
- 问题：Agent 能让 Supervisor 在沙箱外执行任意命令。Tower 在 S2 之外、以用户权限对 Goal worktree 运行 git：
  - 指纹（`07` §7.3.2：`git add -A`、`write-tree`，并复制 `${wt.gitDir}/index`）；
  - 检查点、pin、seal（`10` §10.6、§10.7）；
  - `in_review` 期间的巡检。

  而下列 git 元数据对 Agent 可写：
  - worktree 根目录的 **`.git` 文件**（`gitdir:` 指针）。它在 worktree 内，S2 允许写；`11` §11.3.3 的“`.git/**` 硬底线”是按目录写的，对文件工具有效，对 bash 则只说“由沙箱保证”，但沙箱并不拒绝这个文件。
  - ADR-044 与 `11` §11.6.2 L325 明确写允许的 `$GIT_COMMON_DIR/worktrees/<本 wt>/**`，其中包括 `commondir`、`gitdir`、`index`，以及启用了 `extensions.worktreeConfig` 时的 `config.worktree`。

  Agent 只要把 `.git` 或 `commondir` 指向自己在 worktree 内构造的目录，并在那里的 `config` 中写入 `core.fsmonitor=<命令>`（或 `filter.<x>.clean=<命令>`，再配合 worktree 内的 `.gitattributes`；或 `core.sshCommand` 等），Tower 下一次 `git add -A`/`status` 就会在沙箱外执行这个命令。`core.hooksPath=/dev/null` 挡不住 fsmonitor 与 clean filter；`safe.directory` 只检查目录属主，而属主正是同一用户。

  此外，复制 Agent 可写的 `index` 来继承 stat 缓存，使 Agent 可以构造“stat 与磁盘一致、blob 不同”的索引项，让生成的树与磁盘内容不一致，从而让 I2 的新鲜度判定失真。
- 为什么重要：
  - 这是一条从 S2 内到宿主用户权限的确定性逃逸路径，使 ADR-022（S2 下 `exec` 为 silent）、T3/T5/T7/T26 的“低”残余风险评级全部失效。
  - 它还可能在用户主检出中留下持久化：如果 `commondir` 被改指向别处，用户的 `git worktree list`/`repair` 也会读到被改写的元数据。
- 文档位置：`10` §10.1（GitRunner 约定）、§10.6.1、§10.7；`07` §7.3.2；`11` §11.3.3、§11.6.2、§11.12；`15` ADR-044。
- 期望的回答形态：
  1. GitRunner 一律显式传入 `GIT_DIR=<commonDir>/worktrees/<name>`、`GIT_COMMON_DIR=<commonDir>`、`GIT_WORK_TREE=<wt>`，不经 `.git` 文件发现仓库；每次调用前校验 `.git`、`commondir`、`gitdir` 的内容与 Tower 记录一致，不一致即视为篡改哨兵；
  2. 以 `-c core.fsmonitor=<Tower 的值或 false>`、`-c core.sshCommand=`、`GIT_CONFIG_NOSYSTEM=1` 等覆盖所有可执行命令的配置；对 clean/smudge filter 给出明确策略（例如只允许用户全局配置中已有的 driver）；
  3. S2 对 `worktrees/<name>/{commondir,gitdir,config.worktree}` 与 worktree 根的 `.git` 写拒绝；
  4. decisive 指纹使用全新的临时索引，不复制 Agent 可写的 index；
  5. 威胁表新增 T29，SP6 增加对应的攻击用例。

**R3-D11-02｜重要**
- 问题：ADR-049 把 `HTTPS_PROXY`/`NO_PROXY` 等代理变量“透传”到 bash 环境（`05` §5.3.6 L368）。但 S2 的网络规则是“仅经沙箱代理”（`11` §11.6.2 L328），`sandbox-runtime` 通过设置子进程自己的代理变量来实现域名允许列表。两者叠加只有两种结果：
  - 透传的企业代理覆盖了沙箱代理，绕过域名允许列表；
  - 或者被 Seatbelt 的“只允许连本机代理”挡住，所有网络都失败。

  安装器沙箱（I）的出口同样没有说明如何经过企业代理。
- 为什么重要：需要代理的企业网络正是 R2-D2-04 想要支持的用户，现方案要么不安全，要么不可用。
- 文档位置：`15` ADR-049；`05` §5.3.6；`11` §11.6.2；`16` §16.8。
- 期望的回答形态：规定沙箱代理以用户代理作为上游（链式），bash 环境中只出现沙箱代理；安装器同理；契约测试或 SP6 覆盖“企业代理 + S2”。

**R3-D11-03｜次要**
- 问题：T7（缓存投毒）与 T26（对象库篡改）在 S2 下评为“低”，前提是“只有 Agent 的 bash 被沙箱化”。但标准与低风险 Goal 默认加载用户扩展与 MCP 服务器（`11` §11.8.2），它们在沙箱外以用户权限运行（T16）。被注入的 Agent 可以驱动一个 MCP 文件系统服务器或用户扩展工具，写 `_stores/_verifier`、`<commonDir>/objects`、depcache。“无注解 → 首次 ask”只是策略层的约束；一旦人选择“本项目内同类”授权，它就不再询问。
- 为什么重要：T7 与 T26 是“已验证”完整性的边界评级。
- 文档位置：`11` §11.12 T7、T16、T26；§11.3.4。
- 期望的回答形态：T7/T26 的评级按“是否加载了可写文件系统的沙箱外工具”分档；或者把验证器存储、depcache、公共对象库列为所有沙箱外工具的路径级 forbid（gate 可以检查 MCP 与扩展工具参数中的路径）。

### D12 记忆与学习

**R3-D12-01｜次要**
- 问题：ADR-058 规定导入或同步时“根集合有交集 → 同一 Project → 合并”。但根集合有交集并不意味着是同一个项目：
  - 用 `--allow-unrelated-histories` 合并 A、B 两个仓库形成的 monorepo，与独立的 A 仓库共享 root(A)；
  - 用 `git subtree add` 引入同一个第三方库的多个仓库，共享该库的根。

  按现规则，这些仓库的记忆、信任与 Goal 归属都会被自动合并。
- 为什么重要：会把一个项目的约定注入另一个项目，信任也会跨项目传播。
- 文档位置：`15` ADR-058；`02` §2.3；`09` §9.12.3。
- 期望的回答形态：只有 `canonicalRoot` 相同才自动合并；仅别名相交时，走人确认的“合并 Project”流程（ADR-028 已有这个流程）。

### D13 隔离、git 与并发

**R3-D13-01｜阻断**
- 问题：ADR-044 的私有对象目录在迁回之前会让 ref 悬空，并弄坏用户自己的仓库（已实验证实，附注 B）。
  - Agent 在 S2 内 `git commit` 时，新对象写入 `<wtRoot>/_objects/<goalId>`，但 `refs/heads/tower/<goalId>` 是在**公共** `refs/` 中更新的，因为 Agent 对它有写允许。迁回发生在“每个检查点与 seal 之前”（`10` §10.6.1 L300），最早也要等到下一次 `turn_end`。tower-goal 的检查点同样在 Host 环境中写私有对象（`05` §5.3.6 L371），然后更新 `refs/tower/<goalId>/cp/<n>`。
  - 实验（git 2.56）：在这个窗口内，用户主检出中不带该环境的命令结果如下。
    - `git log --all` → `fatal: bad object refs/heads/feat`；
    - `git for-each-ref` → `fatal: missing object …`，VS Code 等 IDE 的分支列表依赖这条命令；
    - `git fsck` → `invalid sha1 pointer`（退出码 10）；
    - `git gc`、`git repack -a -d`、`git prune` → 退出码 128；`git maintenance run` 失败；
    - 用户在主检出中**每次** `git commit` 触发的 `maintenance run --auto` 都会打印 `error: refs/heads/feat does not point to a valid object!`；
    - 在主检出中对该 worktree 执行 `git -C <wt> status` → `fatal: bad object HEAD`。

    同样受影响的还有 Tower 自己为**其他** Goal 运行的 fetch（`10` §10.3.1）、冲突雷达（`10` §10.9.1 的临时对象目录只挂了公共 alternates）和 bundle 备份（§10.16.3）。
  - 文档的描述与实验结果相反：§10.6.1 写“用户在主检出中查看该分支，最多滞后一个回合”；§10.17 L614 写“`git gc` 安全”。
  - 在 Agent 环境中执行 `git repack -a -d`（不带 `-l`）会把整个公共对象库复制进私有 pack，随后的“迁回”也就要搬整个仓库。在 Agent 环境中执行 `git gc`，会对**公共**目录执行 `pack-refs --all`、`reflog expire --all` 与 `worktree prune`；`packed-refs` 已写拒绝，所以 gc 会失败。
  - `GIT_OBJECT_DIRECTORY` 以环境变量全局生效（仓库中的 hook 也会继承它）：Agent 在任何其他仓库中执行的 git（`git clone` 依赖、pnpm 的 git 依赖、测试夹具里 `git init` 的临时仓库）都会把对象写进本 Goal 的私有目录，那些仓库自己的 `.git/objects` 为空。脱离这个环境（例如在验证器槽位中）之后它们就是坏的，使 Agent 的观测轨与验证器的环境系统性地不同。
- 为什么重要：
  - 这直接违背了“绝不碰用户的工作现场”（`10` L10）：只要 Agent 提交过一次，用户的 IDE 与 git 命令就会周期性报错，`gc` 与 `maintenance` 会一直失败；
  - 它是第 2 轮修复引入的回归，而设计文档写的结论与事实相反；
  - 测试中使用 git 的项目（很多工具类仓库）的 Agent 环境会被扭曲。
- 文档位置：`15` ADR-044；`10` §10.6.1、§10.9.1、§10.16.3、§10.17；`05` §5.3.6；`11` §11.6.2。
- 期望的回答形态：在三种方案中选择一种，并给出 SP6 实验：
  - (a) Agent 的分支 ref 也私有化：Agent 的 git 使用 Tower 管理的独立 gitdir，通过 alternates 读公共对象，由 Supervisor 以“先迁对象、后更新公共 ref”的顺序同步；
  - (b) 公共 `refs/heads/tower/<goalId>*` 对 Agent 也写拒绝，Agent 的提交只进入私有 ref 命名空间，由 Supervisor 推进；
  - (c) 由文件系统事件驱动立即迁回，并量化剩余窗口。

  另外，把 `GIT_OBJECT_DIRECTORY` 换成只对本 worktree 生效的机制（例如 `GIT_DIR` 下的 `objects/info/alternates` 加 worktree 级配置），或说明其他仓库中的 git 如何不受影响。

**R3-D13-02｜次要**
- 问题：迁回与检查点的先后顺序没有定义。§10.6.1 写“在每个检查点……之前”迁回，但检查点本身就会产生新对象（`commit-tree`）。正确的顺序应该是“写对象 → 迁回 → 更新公共 ref”；现文档允许“先更新 ref 再迁回”。§10.7.1 第 7 步（`update-ref`）与迁回的关系也没有写。
- 为什么重要：顺序决定 R3-D13-01 的窗口有多大。
- 文档位置：`10` §10.6.1、§10.7.1；`06` §6.2.2 GitService 行。
- 期望的回答形态：在 §10.7.1 中写出带迁回步骤的完整序列；雷达和 bundle 在运行前先确保对应的对象已经迁回。

### D14 路线图与可验证性

**R3-D14-01｜重要**
- 问题：20 周排期的算术与人力分配。
  - **冻结前缓冲约为 0**。功能加 QA 为 71.0 + 7.1 = 78.1 人周，必须在**第 16 周功能冻结**前完成；§14.3.4 L106 还把第 15–16 周写成“冻结前缓冲”。到第 16 周末的容量是 6.5 + 16 × 4.5 = 78.5 人周，到第 14 周末只有 69.5。所谓 11.9 人周缓冲，几乎全部落在第 17–20 周（自用与退出评审）；而延期规则禁止把自用期压到 3 周以下（L108）。所以任何功能延误都会直接推迟 M1，“2.6 周缓冲”名不副实。
  - **按角色超载**。“系统”一个人承担 W3、W4、W5、W7、W8、W15（20.5 人周），再加上 W9、W16 的一半（约 4.3），扣除 M0 先行的 4.5 后，约 20.3 人周要在 16 周内完成，而关键路径 W3 → W7 → W8 → W9 正是这条线。
  - **角色表与工作分解矛盾**。§14.8 仍用旧编号：桌面负责“W1、W7、W8、W12”，设计负责“W7、W9、W10”，安全负责“W6”，这与 §14.3.4 的“主责”列互相矛盾。
  - **SP6 的工作量**。SP6 要在 4 天内完成 Seatbelt 策略、git 精细规则、私有对象目录、customTools 生效、`16` §16.8.1 的每一行（约 15 行，每行一个“S2 下安装 + 测试”用例）和钥匙串可读性，还不含本轮新增的攻击用例。
- 为什么重要：R1-D14-01 是阻断项，R2-D14-01 是重要项，排期可信度是 D14 的核心。
- 文档位置：`14` §14.3.4、§14.8、§14.2 SP6；`15` ADR-038。
- 期望的回答形态：
  - 按冻结周重算缓冲，并把缓冲放在冻结之前；
  - 按角色排出甘特或容量表，标出关键路径上的人；
  - 改正 §14.8；
  - SP6 拆分或延长，并列出验收用例清单。

### D15 文档一致性与可执行性

**R3-D15-01｜重要**
- 问题：修订后的残留与跨文档冲突（逐项）：
  1. `06` §6.3 DDL `projects` 没有 `root_aliases` 列（`02` §2.3 有 `rootAliases`，ADR-058）；`canonical_root` 的注释没有写“首次绑定后固定”。
  2. `06` §6.2.4 L296-298：全局验证并发仍是 `max(1, CPU 核数/4)`，机会式验证条件仍是“全局有空闲槽位、距上次 ≥ 10 min”，都没有改为 ADR-042 的写法。
  3. `06` F20（L1000）：“verdict 记为 `resource_exceeded` → `verify_failed`”，没有经过 ADR-054 的判别。
  4. `06` §6.2.5：`usdHard` 超出时没有写明 `pauseReason = budget_hard_cap`。
  5. `04` §4.18.3 L1046、L1047、L1052 仍写“原因值待主干登记”。
  6. `10` §10.6.1 L300 写“最多滞后一个回合”，§10.17 L614 写“`git gc` 安全”，都与 ADR-044 的实际后果不符（R3-D13-01）。
  7. `13` §13.8.3 写 8 核，`07`/`16` 写 10 核。
  8. `16` §16.8 自称唯一表，却没有 `npm_config_verify_deps_before_run`（只在 `07` 中）。
  9. `16` §16.1.1 与 `03` §3.2.1 的 `autoResume` 冲突（R3-D4-05）。
  10. `08` §8.4 缺 `verify_env` 的 dedupeKey（R3-D8-02）。
  11. `04` §4.12 L798 写“M1 只有人手写的项目记忆”，ADR-059 是 User/Project。
  12. `09` §9.1 L39 未提 ADR-058 的“首次绑定后固定”。
  13. `15` 第 2 轮小节标题写“ADR-041 – ADR-058”，实际包含 ADR-059。
  14. C28 的“测试扩展覆盖 bash 时降为 S0”在 SDK 下不可能成立（R3-D2-01）。
  15. `01` L9 与 `05` §5.0 的源码基线表述（R3-D2-02）。
- 为什么重要：`16` 自称唯一来源，`06` 的 DDL 与状态机会被直接实现。
- 文档位置：如上。
- 期望的回答形态：逐条修正；lint 增加两项检查——“DDL 列 ↔ `02` 字段”，以及“`16` §16.8 的变量 ↔ 其他文档中出现的 `npm_config_*`/`*_DIR` 变量”。

### D16 创新与差异化

**R3-D16-01｜次要**
- 问题：ADR-056 把“桌面应用中的验证器（干净槽位、哨兵、机会式验证）”划为付费部分。可是“已验证”是 Tower 整个诚实语法的信任锚：只有验证器的结论可以着绿（R1、ADR-024）。闭源的验证器意味着用户无法审计“绿色”是怎样算出来的，这与 `00` §0.5 的“看到每个 token”、`01` §1.7.3 的“用户拥有数据、不锁定”有张力。文档没有讨论这一点：可以源码可见但付费授权，也可以开源判定逻辑而对托管或同步收费。
- 为什么重要：差异化的论证（`01` §1.7.2 第 1 条）恰恰是“厂商不愿让同一方的组件判定完成”。一个闭源的判定者削弱了这条论证。
- 文档位置：`15` ADR-056；`01` §1.7.2–1.7.5；`14` K6。
- 期望的回答形态：一句话说明判定逻辑的可审计性（源码可见、规则公开、可复现的验证日志），或者调整付费边界。

---

## 附注

**A. pnpm / npm 环境变量（R3-D7-04、R2-D11-03 的依据）**

实验环境：本机 `/tmp`，npm 11.19.1、pnpm 12.6.0 与 10.34.7、node-gyp 12.4.0。

- **pnpm 10**：`npm_config_store_dir`/`cache_dir`/`state_dir` 生效。
- **pnpm 12**：只认 `pnpm_config_*`；见 pnpm11 `docs/configuring.md` 中的“pnpm no longer reads `npm_config_*` environment variables”，以及 `config/reader/src/env.ts`。
- **`NPM_CONFIG_USERCONFIG`**：npm 与 pnpm 12 都生效（pnpm 11+ 中是 `npmrcAuthFile` 的回退）。
- **`.modules.yaml`**：其中 `storeDir` 为绝对路径；`.pnpm-workspace-state-v1.json` 以项目绝对路径为键。
- **node_modules 内的链接**：pnpm 与 npm 的包内符号链接、`.bin` 都是相对路径，CoW 复制到新路径后可以运行。
- **更换 store-dir**：pnpm 10 执行 `install` 时，无 TTY 下报 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，执行 `add` 报 `ERR_PNPM_UNEXPECTED_STORE`；pnpm 12 会静默重新下载。
- **`verifyDepsBeforeRun`**：v11+ 默认 `install`，v10 默认关闭。
- **各工具的缓存变量**：
  - `COREPACK_HOME`、`PLAYWRIGHT_BROWSERS_PATH`、`CYPRESS_CACHE_FOLDER`、`PUPPETEER_CACHE_DIR` 确实存在；
  - `PRISMA_ENGINES_CACHE` 不存在，Prisma 用 `XDG_CACHE_HOME`；
  - `npm_config_devdir` 仍可用，但已被 npm 11 弃用。

**B. git 私有对象目录实验（R3-D13-01 的依据）**

实验环境：git 2.56.0，主检出 + `git worktree add`，在该 worktree 中设置 `GIT_OBJECT_DIRECTORY=<priv>` 与 `GIT_ALTERNATE_OBJECT_DIRECTORIES=<common>/objects`。

- **在该环境中**：`git add` 与 `git commit` 成功，3 个新对象全部进入私有目录；公共 `refs/heads/feat` 被更新为指向新提交。
- **在主检出中（不带该环境）**：
  - `git log feat`、`git log --all`、`git for-each-ref` 退出码 128；`git fsck` 退出码 10；`gc`、`repack -a -d`、`prune` 退出码 128；
  - `git branch -v` 静默隐藏该分支；
  - 用户每次 commit 都打印 `refs/heads/feat does not point to a valid object!`。
- **迁回之后**：`cp -an priv/objects/?? .git/objects/` 后，以上命令全部恢复，没有任何对象被删除。
- **`git fsck --connectivity-only <rev>`**：只接受 ref 名或**完整** SHA，缩写 SHA 报错（ADR-044 的 pin 检出前检查须传完整 SHA）。
- **hook**：`reference-transaction`、`post-commit` 等 hook 会继承 `GIT_OBJECT_DIRECTORY`。

---

## 5. 结论

- **是否所有维度为 100：否。** 最高为 D9 的 96，最低为 D11 与 D13 的 70。
- **是否还有可追问的问题：有。** 第 2 轮 44 条中，已解决 30、部分 14、未解决 0。本轮新增与残留追问共 **29** 条：**阻断 2 条**（R3-D11-01：Agent 经 git 元数据让 Supervisor 在沙箱外执行命令；R3-D13-01：私有对象目录使用户主检出的 git 命令失败），**重要 12 条**，**次要 15 条**。
- 下一轮建议按以下顺序修订：
  1. 堵住 git 元数据逃逸，重新设计 ADR-044 的 ref 与对象同步，并用实验验证（R3-D11-01、R3-D13-01、R3-D13-02）；
  2. 让验证器只读 `$VS` 中的配置；生命周期脚本改到槽位中执行；按 pnpm 主版本重写 `16` §16.8.1；如实规定非 Node 项目在 M1 中的行为（R3-D7-01–04）；
  3. 裁决 RPC 冻结的取舍；给用户 bash 扩展被顶替一个显式的确认路径（R3-D5-01、R3-D2-01）；
  4. 统一 `s0_grant_pending` 的语义，把转移表补成真正的唯一规格（R3-D4-01、R3-D4-02）；
  5. 目标页增加 Changes 区块（R3-D1-01）；
  6. 按冻结周重排 M1 排期与角色（R3-D14-01）；
  7. 清理残留（R3-D15-01）。
