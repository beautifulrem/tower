# 第 61 轮评审回应

决策：ADR-189（`15` 末尾）；ADR-188 标题加 “Amended by ADR-189”。本文件关闭 `round-61.md` §4 的 5 条（重要 1、次要 4）、§5 的全部 9 条观察，以及 §3.1 建议的三项 lint。行号为修改后的位置。

**收敛规则**（同 ADR-186/187/188）：只用三种办法关闭条目：
1. 把说法改弱，但保证为真；
2. 删除或推迟不属于 M1 主循环的机制；
3. 在已有的唯一定义处加至多一条守卫、一行或一个字段。

本轮不新增状态、事件、表、命令或决定种类。新增的只有：Host 骨架中的两个常量与一个 `excludeTools` 参数、`commandContextActions` 的定义（骨架原已传入、未定义）、`goal.accept` 的一处顺序与一条归档守卫。`E_INTERNAL` 是已有的错误码。安全不变式全部保持，拿不准时取更严格的行为。安全问题只写到设计层面。

## 条目处理

| 条目 | 采用的规则 | 改动位置 |
|---|---|---|
| **R61-D11-01**（重要） | **固定白名单 + 不注册其余内置工具**（Pi 依据见下节）。<br>• Tower 支持的内置工具 `TOWER_BUILTINS` = `read`、`bash`、`edit`、`write`、`grep`、`find`、`ls`，与 `16` §16.1.10 工具表的文件类、`bash` 两行一一对应；`bash` 的生效定义恒为 `<sdk:bash>`。<br>• Host 以 `excludeTools: NON_TOWER_BUILTINS`（v1.2.0 为 `["powershell"]`）创建会话：它不进入注册表，用户或项目的 `defaultTools`、扩展的 `setActiveTools`、`executeTool` 与 `reload` 都无法启用它。RPC（M2）同样传 `--exclude-tools`。<br>• `running` 阶段显式设置内置工具为 `read`/`bash`/`edit`/`write`，不读 `defaultTools`。<br>• **纵深防御**：来源为 `builtin:<name>` 而名字不在白名单中（含以后 Pi 新增的内置工具），门禁按沙箱外执行，硬底线 forbid，不可授权，不按 `bash` 规则、不以 Goal 的沙箱档位求值。会执行命令的内置工具中，只有被 `customTools` 替换的 `bash` 按有沙箱求值。<br>• **唯一定义**在 `11` §11.3.4 工具来源条。<br>**未采用**：Pi 的 `tools` 选项（它是允许表，会把用户扩展工具一并移出注册表）；注入沙箱版 `powershell`（多一个执行器，M1 不需要）；只把 `builtin:powershell` 归 `tool.external`（工具仍对模型可见，且可授予按名字的放行，弱于不注册） | `11` L162（标题）、L218（唯一定义）；`05` L370–377（骨架）、L470（RPC）、L697（激活表）、L1001（gate 第 3 步）、L1441（C28a）；`16` L122、L259–260；`10` L701；`00` L99；`14` G46(bg)(1) |
| **R61-D5-01** | 在 `05` §5.3.5 骨架**唯一定义** SDK 的 `commandContextActions`：<br>• `waitForIdle` 与 RPC 模式相同；<br>• `newSession`、`fork`、`navigateTree`、`switchSession` 返回 `{cancelled:true}`；`reload`（返回 `void`）抛错，Pi 转为 `extension_error{extensionPath:"command:<命令名>"}`，只进诊断；<br>• 每次拒绝记 `engine.error{source:"adapter", message:"command action refused: <name>"}`，与设置写入被拦截同一写法。<br>整个 Run 中会话只由 Tower 自己替换或导航，Run 开始时的静态清单确认、项目信任、来源自检与处理器顺序因此对整个 Run 成立。<br>**未采用**“视为 Run 边界、drain 后暂停”：需要新的暂停原因或来源；拒绝更简单，也更严 | `05` L280、L381–390（唯一定义）、L1427（C14(b)）；`00` L100；`14` G46(bg)(2) |
| **R61-D13-01** | 取**验收不完成**：M1（`branch_only`，以及从 `in_review` 选 `none`）闸口通过后**先** seal 并写分支，成功后才在**同一事务**记 `human.decision{accept}`、`→accepted` 与 `integration.performed`（`none` 时同一事务再 `→archived`）。<br>• 写入失败（前缀冲突、ref 锁、磁盘、仓库不可写）：返回 `E_INTERNAL`（`detail` 写失败的步骤），不记决定，Goal 留在 `in_review`，面板显示原因与“重试”；重试复用已写的 seal 与分支（按步骤幂等，同 `06` §6.1.6 seal 行）。<br>• 写入期间到达的该 Goal 的其他转移排在本命令的事务之后，`accepted` 与 `integration.performed` 之间不再有窗口（评审的“相邻边角”随之消失）。<br>• **归档守卫**：从 `accepted` 归档前，最近一条 `integration.performed.branch` 不在用户仓库中时，先以该条的 `sha` 重写同名分支；失败同样 `E_INTERNAL`、不归档。<br>“已验收的改动总能从用户仓库取回”因此在失败时仍成立。不新增 Needs-You：失败发生在人正在操作的验收面板上 | `06` L919（唯一定义）；`03` L59；`10` L253、L438；`04` L543；`16` L291；`14` G46(bg)(3) |
| **R61-D15-01** | 来源 `running` 补进 `16` `Goal.pauseReason` 行与 `stalled` 子类型行、`08` §8.6.5 `preparing` 行（“L2，Run 无法开始或已停止”）与 `06` F4b；`08` §8.4 去重键的理由改为“按 Goal 去重，与是否已有 `runId` 无关”。<br>卡片：Run 中途被遮蔽时写 `◆ 运行已停止：扩展 <名字> 注册了与 Tower 工具同名的 <工具名>，请在 Pi 设置中禁用该扩展`，“重试”的说明写“开新的运行”。`05` §5.3.5 说明与 §5.6.5 第 1 步不再写“卡片相同” | `16` L29、L195；`08` L206、L405；`06` L1170；`04` L972；`12` L429；`05` L415、L996；`14` G46(bg)(4) |
| **R61-D15-02** | • `04` §4.6.1 评审底栏 `E 我来改（M2）` → `E 我来改`（与 `16` §16.3 的 M1 一致；就地编辑 hunk 才是 M2），线框宽度不变；<br>• `04` §4.6.7 目标页的 `[交还 ⌘↩]` → `[交还]`：不在 `16` §16.3 为目标页登记 `⌘↩`，避免与转向输入框的“发送”争用 | `04` L453、L624；lint (H) |

## 评审结论中的观察（R61 §5）

| 观察 | 处理 | 位置 |
|---|---|---|
| 1. `review` 行的措辞 | `not_machine_verified` 的原因取自该次验证：S0 拒绝后的重新验证命中阻断、再经覆盖进入时为 `s0_denied{by}`；S0 拒绝本身不改写继续目标 | `07` L1682 |
| 2. gate 的分类对象与实际执行的工具 | 记为已知窗口：Pi 在 `beforeToolCall` 之前取定要执行的工具，同一回合内的覆盖注册使这次执行的内置工具按 `tool.external` 判定，方向偏严 | `11` L218 |
| 3. `12` §12.6.5 的 `◆` | 注明两处例外：`provider_unavailable` 在重试耗尽前写 `◇`；`nested_repo_live` 的条目是 `sentinel`，以 `■` 表达 | `12` L406 |
| 4. 依赖的里程碑 | 补 M2：`12` wait `dependency` 行、`04` 概览与列表线框（宽度不变）、`06` `goal.add_dependency` / `goal.remove_dependency` | `12` L411；`04` L173、L256；`06` L862 |
| 5. `00` 的 RPC 模式 | 补 M2 | `00` L66 |
| 6. “不会超时”的解释 | 改为“合同设为人不在时等待：问题不自动作答”，与 `08` §8.7.1 一致；宽度不变 | `04` L753 |
| 7. 嵌套调用的发起者 | 记为已知限制：任何工具的 `execute` 都有 `ctx.executeTool`，已批准的沙箱外工具可以嵌套调用 Tower 工具；后果限于一次不是由模型发起的 `log`/`submit`，之后仍由验证裁决。不加守卫：它不保护任何不变式 | `11` L222 |
| 8. 测试的触发方式 | C28a 注明：Run 中途的一组由测试扩展以 `sendUserMessage("/<命令>", {expandPromptTemplates:true})` 触发，或在 `turn_start` 处理器中注册 | `05` L1441 |
| 9. 取舍判断 | 无改动 | — |

## 删除、推迟与收窄

- **删除**：`11` §11.3.2 与 `16` 工具表的“（及 `powershell`）”；`running` 阶段“保留用户默认工具”；线框中评审 `E` 的“（M2）”与目标页的 `⌘↩` 提示。
- **收窄的说法**：工具来源中“Pi 内置工具”收窄为“Tower 白名单中的 Pi 内置工具”；`08` §8.4 去重键的理由。
- **补标**（不是新推迟）：依赖（M2）；“使用我安装的 pi”（M2）。
- **记为已知限制**：同一回合内的覆盖注册（观察 2）；非 codemode 发起的嵌套 Tower 工具调用（观察 7）。
- **被取代的说法**登记在 `16` §16.1.13 L578–582，共 5 行，供 (D) 检索。

## Pi v1.2.0 引用

都已用 `git -C research/pi-mono show v1.2.0:packages/coding-agent/<path>` 核实（`agent-loop.ts` 在 `packages/agent/`）：

- `src/core/tools/index.ts:95-105`：`allToolNames` = `read`、`bash`、`powershell`、`edit`、`write`、`grep`、`find`、`ls`；`:182-191` `createAllToolDefinitions` 全部创建。包根 `src/index.ts` 不导出 `allToolNames`，所以骨架按固定版本列出。
- `src/core/tools/powershell.ts:32, 55`：不传 `operations` 时用本地执行实现。
- `src/core/settings-manager.ts:83`：`DEFAULT_TOOL_NAMES` = `read/bash/edit/write`；`src/core/sdk.ts:282, 294`：初始活跃工具取 `defaultTools`，再按 `excludeTools` 过滤。
- `src/core/agent-session-services.ts:61-64, 227-230`：`createAgentSessionFromServices` 透传 `tools`/`excludeTools`/`noTools`。
- `src/core/agent-session.ts:1541-1545`（`_isAllowedTool`）、`:3536-3539`（`_refreshToolRegistry` 对内置与扩展工具都按它过滤）：被排除的名字不进入注册表；`:1518-1522`：`setActiveTools` 只认已注册的工具；`:1566-1571`：`executeTool` 只调用注册表中的工具；`:3685-3721`：`reload` 沿用同一过滤，并再次发出 `session_start`。
- `src/cli/args.ts:162`：`--exclude-tools`（RPC，M2）。
- `src/core/extensions/types.ts:2239-2259`：`ExtensionCommandContextActions`；`src/index.ts:100` 导出该类型；`src/core/extensions/runner.ts:553-570`：不传时为返回成功的空操作；`src/modes/rpc/rpc-mode.ts:322-343`：RPC 模式接到真实动作。
- `src/core/agent-session.ts:2053-2068, 2390-2420`：命令在 `prompt` 中立即执行，`sendUserMessage` 需 `expandPromptTemplates:true` 才分派命令；`:2156-2163`：命令处理器抛错转为 `extension_error{extensionPath:"command:<名字>"}`。
- `src/core/extensions/types.ts:383-394`：`ExtensionToolContext.executeTool`（观察 7）。
- `packages/agent/src/agent-loop.ts:708-730`：`prepareToolCall` 先取定工具，再调用 `beforeToolCall`（观察 2）。
- **结论**：`excludeTools` 是唯一能让一个内置工具在整个会话中都不可启用、又不影响用户扩展工具的 SDK 选项，因此采用它，并以门禁的硬底线兜底。

## lint

`reviews/lint/xref.py` 的文件头已写明新检查的定义：

- **(T) 再扩展**：
  - `05` §5.3.5 的 `TOWER_BUILTINS` 与 `NON_TOWER_BUILTINS` 必须恰好划分 Pi v1.2.0 `allToolNames`（`PI_BUILTIN_TOOLS`），会话必须以 `excludeTools: NON_TOWER_BUILTINS` 创建；
  - 白名单之外的每个名字在 `11` §11.3.4 工具来源条与 `16` §16.1.10 对应行中点名；白名单中除 `bash` 外的每个名字在 `11` §11.3.4 以 `builtin:<name>` 点名；
  - `05` §5.6.2 激活表中 `setActiveTools` 的字面量只能是白名单内置工具或 Tower 工具，每个阶段都显式写出内置工具；
  - 工具种类表新增“白名单之外的 Pi 内置工具”。
- **(H) 新增**（评审建议的 (H)）：`04` 线框中的按键提示（`[K 动作]` 与“K 动作 · …”底栏）的键必须在 `16` §16.3 登记；标 M2/M3 的提示须有该里程碑的行，只登记为 M2/M3 的键须带标记。视图与作用域的比对**不实现**：线框没有可机械读取的视图名。
- **(s) 扩展只实现窄形式**：`prepare_failed` 的运行期来源在其六处定义（`02`、`03` §3.2.1、`16` 两行、`08` §8.6.5、`06` F4b）都出现。评审建议的一般形式（`02`/`03`/`16` 的来源状态集合相同）**不实现**：原型显示 `02` 与 `16` 只对少数原因以自然语言写出来源状态，逐行比对会大量误报。
- **(D) 补登**：`16` §16.1.13 新增第 61 轮的 5 行，共 135 个短语，命中 0。

**回归测试**：逐一撤销修改，每项都能报出，退出码均为 1：

| 撤销的修改 | 报出 |
|---|---|
| `04` 评审底栏恢复 `E 我来改（M2）` | `HINT_MILESTONE` |
| `05` 骨架删去 `excludeTools`、`NON_TOWER_BUILTINS` 置空、`running` 行恢复“当前活跃工具” | `BUILTIN_SPLIT`、`NO_EXCLUDE_TOOLS`、`PHASE_BUILTINS_IMPLICIT` |
| `11` 工具来源条中 `powershell` 去掉反引号 | `NON_WHITELISTED_BUILTIN_UNNAMED` |
| `08` §8.6.5 删去来源 `running` | `PREPARE_FAILED_SOURCE_MISSING` |
| `16` `stalled` 子类型行删去来源 `running` | `PREPARE_FAILED_SOURCE_MISSING` |

**结果**：从 `docs` 运行 `python3 reviews/lint/xref.py --checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`，**退出码 0**：
- headings 566，ADR 189，section_refs 5143，problems 0；
- (s) 8/8，来源 6 处，缺 0；(v) 96 条命令（没有新命令）；(e) 172 对，缺 0；(r′)、(k)、(q) 0；
- (D) 135 个短语，命中 0；(T) 9 种，0；(H) 77 个提示键，0；(B) 1 条，0；(O) 31 行，0；
- (J) 134 对，重复 0；(C) 19 个 WBS 行，0；
- 其余各项均为 0，UNPARSABLE 全为 0。

## 排期（第 61 轮相对第 60 轮，+0.04 人周）

| WBS 行 | 增量 | 计入线 |
|---|---|---|
| W6 | +0.02：`excludeTools` 与 `running` 显式内置工具 0.01；`commandContextActions` 拒绝五个动作 0.01 | Agent |
| W7 SP6b | +0.01：G46(bg)，现值 5.07 | Agent |
| W15 | +0.01：M1 验收先 seal 并写分支、失败时不验收；从 `accepted` 归档前核对分支 | 桌面 |

以下各项按 WBS 行逐项都不足 0.01，计 0：门禁把白名单之外的内置工具按硬底线 forbid（W10）；`prepare_failed` 来源的登记与卡片文案；线框按键提示；M2 标记与已知限制的说明。

- **系统线没有净增量**，余量保持 0.12（0.125），不需按 ADR-136 改派。
- **WBS**：122.69。行值：W6 9.17、W7 26.64、W15 0.85；W9 10.91 不变。19 行的主责拆分之和都等于该行估计。
- **角色合计**：Agent 26.53、系统 26.35、桌面 27.73、设计 28.51、安全 13.57。
- **冻结前所需**：Agent 26.13 × 1.1 = 28.743 → 28.74；桌面 25.93 × 1.1 = 28.523 → 28.52；系统 28.88、设计 28.06、安全 14.38（按 0.5 人计为 28.76）不变。
- **余量**：系统 0.12、Agent 0.26、桌面 0.48、设计 0.94、安全 0.24，均为正。
- **依赖链**：W9b = 6.5 + (10.91 − 10.7) = 6.71，链长 **19.91**，不变。
- **增 1 人**：28.74 + 28.88 + 28.52 + 28.06 + 14.38 = 128.58，T = 130.58 / 5.5 = 23.74。安全线 0.5 人完成约 11.87 人周，新人承担约 2.51 人周；23.74 + 2 = 25.74 → 26 个工作周，仍为 33 周。
- **M1 维持 38 周**（第 34 周末冻结 2027-07-02，退出 2027-07-30）。

`14` 与 `15` 的同步位置：
- `14`：L16（“第 25–61 轮不变”）、L31（SP6b 5.07，Agent 1.07）、L215 增量段、W6/W7/W15 行与功能合计、角色容量表（Agent、桌面两行）、L392、L394（依赖链）、L398（结论、轮次列表、余量）、L400（增人）、甘特余量格（Agent 0.26、桌面 0.48）；
- `15`：ADR-133 第 61 轮补记与 ADR-189 末段。

**核对**：lint (C) 按十进制半进位重算了冻结前所需、余量、T 与加法式，并检查 `14` 与 `15` 补记中的角色合计与余量相同。

## 偏离指示之处

- R61-D11-01 的纵深防御取 **forbid**（硬底线），没有取 `tool.external`：两者都在指示允许的范围内，forbid 更严，而且 Host 已不注册这些工具，正常情况下不会触发。
- 白名单写成 7 个名字（`TOWER_BUILTINS`），`running` 阶段只激活其中 4 个（与 Pi 的默认相同）；`grep`/`find`/`ls` 只在塑形与评审阶段激活，与此前一致，不增加 `running` 的常驻工具 token。
- (H) 与 (s) 扩展只实现了可机械比对的部分，原因见 lint 一节。

## 未解决

无。
