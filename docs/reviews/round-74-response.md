# 第 74 轮评审回应

决策：ADR-202（`15` 末尾，L3000 起）；ADR-201、ADR-004 标题加 “Amended by ADR-202”；ADR-133 第 74 轮补记（`15` L1292）。本文件关闭 `round-74.md` §4 的唯一一条重要条目 R74-D11-01 与 §5 的 4 条观察。行号为修改后的位置。

**收敛规则**（同 ADR-186–201）：只用三种办法关闭条目：
1. 把说法改弱，但保证为真；
2. 删除或推迟不属于 M1 主循环的机制；
3. 在已有的唯一定义处加至多一条守卫、一行或一个字段。

本轮取评审给出的**严格一边**，以推迟关闭：
- M1 不再让 Pi 以信任加载项目；
- 项目扩展、项目包与项目 MCP 服务器整体推迟到 M2，届时另做显式的批准设计。

新增的只有一个字段 `RunSpec.projectResources`，用于 Supervisor 把枚举出的文件列表交给 Host。不新增状态、事件类型、表、决定种类、Needs-You kind、`step` 取值、列或命令参数。安全问题只写到设计层面。

## Pi v1.2.0 核实（`packages/coding-agent/src/`）

**结论：Pi 不能部分授予信任，但能部分加载**，做法是“信任为假 + 显式路径”。

| 问题 | 核实结果 | 出处 |
|---|---|---|
| 信任能否按资源种类授予 | **不能**：设置管理器上只有一个布尔值，按整个项目一次判定 | `core/settings-manager.ts:469-481`；`core/resource-loader.ts:520-524` |
| 能否只拦扩展 | **不能**：<br>• `extensionsOverride` 在扩展**加载之后**才过滤，代码已经执行；<br>• `noExtensions` 去掉全部设置来源的扩展，连用户级与内置 MCP 也去掉；<br>• `disabledBuiltinExtensions:["mcp"]` 连用户级 MCP 也去掉 | `resource-loader.ts:596`、`:577-583` |
| 不信任时项目侧加载什么 | 什么都不加载：<br>• 项目设置为 `{}`，其中的 `extensions`、`packages` 与资源路径都不生效；<br>• 项目扩展、技能、提示、主题与祖先 `.agents/skills` 不收集；<br>• 项目包的安装位置拒绝访问；<br>• 内置 MCP 不读 `.pi/mcp.json`；<br>• 项目 `SYSTEM.md`/`APPEND_SYSTEM.md` 不读，改读用户级的 | `settings-manager.ts:364-366`；`core/package-manager.ts:2465-2468`、`:2484-2502`、`:2520-2535`、`:1781-1785`；`extensions/mcp/config.ts:145-149`，信任状态取自 `extensions/mcp/index.ts:1344` → `core/agent-session.ts:3465`；`resource-loader.ts:1213-1239` |
| 不信任时照常加载什么 | • 用户级与 CLI 扩展；<br>• 用户级 `mcp.json`；<br>• `AGENTS*.md`/`CLAUDE.md` | `resource-loader.ts:505-511`；`config.ts:147`；`resource-loader.ts:232-274`、`:646-653` |
| 有没有不受信任控制的入口 | **有**：`additionalSkillPaths`、`additionalPromptTemplatePaths`、`additionalThemePaths`、`systemPrompt`、`appendSystemPrompt`。<br>SDK 经 `createAgentSessionServices` 的 `resourceLoaderOptions` 传入。<br>RPC 对应 `--skill`、`--prompt-template`、`--theme`、`--system-prompt`、`--append-system-prompt` | `resource-loader.ts:276-313`、`:599-676`；`core/skills.ts:482-503`；`core/agent-session-services.ts:44`、`:148-154`；`cli/args.ts:121-125`、`:193-201`；`main.ts:781-793` |
| 经这些入口加载会不会执行代码 | **不会**：只读取并解析 Markdown 与 JSON | 主题：`modes/interactive/theme/theme.ts:551-555`；技能与提示的加载器不调用子进程或动态导入 |
| 怎样让信任恒为假 | SDK：`SettingsManager.fromStorage(storage, {projectTrusted:false})`，不传 `resolveProjectTrust`。不传回调时 Pi 沿用设置管理器的信任状态，也不询问扩展的 `project_trust`。<br>RPC：`--no-approve` | `settings-manager.ts:323-335`；`resource-loader.ts:520-528`；`cli/args.ts:243-244` |

## 条目处理

| 条目 | 采用的规则 | 改动位置 |
|---|---|---|
| **R74-D11-01**（重要；信任复核只比较 `.pi`、`.agents`，而 Pi 在信任下执行的代码可以来自卫星中 Agent 可写、默认也不受保护的其他路径） | **`11` §11.8.1 的不变式（唯一定义）**：M1 中 Tower 从不让 Pi 在 Engine Host 中或作为其子进程执行来自项目的代码。<br>**Pi 的项目信任恒为假**：SDK 用 `projectTrusted:false`，不传回调；M2 的 RPC 恒传 `--no-approve`。<br>**永不加载**（不论 `Project.trust` 与 base 如何）：<br>• 项目 `settings.json`（含 `extensions`/`packages`）；<br>• 项目扩展；<br>• 项目包；<br>• `.pi/mcp.json` 的服务器。<br>**照常加载**：用户级扩展与 MCP（按 §11.8.2 的清单确认）、`AGENTS*.md`/`CLAUDE.md`。<br>**声明性资源**：ADR-201 的复核保留（`Project.trust`、`.pi`/`.agents` 无变化、祖先目录检查），但只决定是否传入第一组。为真时，Tower 按 Pi 的发现规则（`package-manager.ts:377-567`）从 base 的树中枚举技能、提示、主题、`SYSTEM.md`/`APPEND_SYSTEM.md` 与 `.agents/skills`，只把普通文件以显式路径传入。<br>• 符号链接不传入；<br>• 被忽略的文件不在 base 的树中，也不传入，评审指出的 S0 下被忽略文件的盲区因此一并关闭；<br>• ADR-201 的“改动后不加载、两条恢复途径、`◇` 提示”不变。<br>**信任提示**分两组：“信任后加载（与 base 相同时）”与“M1 中不加载，不论是否信任”。<br>**推迟到 M2**：项目扩展、包与 MCP 的加载，须带批准设计，并覆盖它们引用的 `.pi` 之外的代码。<br>**T4/T16**：<br>• T4 的代码路径关闭，残余只剩指令类，评级仍为低；<br>• T16 去掉“受信任项目的 `.pi` 扩展”；补登残余“用户级扩展或 MCP 若自己执行卫星中的文件，Agent 的代码会经它在沙箱外运行”，评级仍为中。<br>**测试**：G46 (bh)(1) 改写；C11 扩充 | `11` L562–L595（不变式、两组、复核、传入什么、传递方式）、L553、L605、L609、L663、T4 L678、T16 L690；`05` L90–L92、L262–L263、L308、L313、L354–L360、L475–L488、L1049、G2 L1265、L1325、D2 L1359、D9 L1366、C11 L1438；`00` L67、L104；`README` 第 8 条；`04` L1455；`02` L90；`06` L442；`16` L286；`14` L134 |

## 评审结论中的观察（R74 §5）

| 观察 | 处理 | 位置 |
|---|---|---|
| 1. `00` 的措辞 | 改为“相对 base 未被修改”，并写明项目扩展、项目包与项目 MCP 服务器在 M1 中不加载 | `00` L67、L104 |
| 2. 运行时卫星丢失时的 drain 结束 | 补半句：正常结束 drain 时记录的回合检查点这时无从记录，跳过；重建从影子中可用的最新检查点开始，不丢数据 | `06` L139 |
| 3. 归档续做的范围 | 写明这是有意的：按删除条件保留的分支也算待删分支，每次重启都重新判定一次，因为保留的原因可能已消失。判定是只读检查，删除以 CAS 守卫，条件仍不满足时照旧保留 | `10` L442 |
| 4. 已结束 Run 的存活者 | 补半句：所属 Goal 已没有卫星（例如归档之后）时照常终止、跳过 `agent_bg_done` 检查点，不丢数据 | `06` L145 |

## 推迟到 M2 / 删除

- **删除**：
  - M1 中 Tower 让 Pi 信任项目的做法：SDK 的 `resolveProjectTrust` 回调、RPC 的 `--approve`；
  - 静态清单中对“受信任项目的 `.pi/extensions/`”的枚举。
- **推迟到 M2**：项目扩展、项目包与项目 MCP 服务器的加载及其批准设计。
- **登记**：
  - `16` §16.1.13 补第 74 轮被取代的说法 1 行（L624）；
  - lint DELETED 补两项，出现时须带 M2 标记。

## lint

从 `/Volumes/Remi/Project/docs` 运行 `python3 reviews/lint/xref.py --checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`，**退出码 0**（全文见 `round-74-lint.md`）：
- headings 566，ADR 202，section_refs 6334，problems 0；
- (e) 190 对，缺 0（新增 ADR-202 → ADR-201、ADR-004）；
- (D) 220 个短语，命中 0（新增第 74 轮一行的 5 个短语）；
- (d) 0（DELETED 新增两项：“Tower 让 Pi 信任项目”的写法、“受信任项目的扩展”）；
- (C) 19 个 WBS 行，0（含 §14.8 团队表与 ADR-133 第 74 轮补记）；
- 其余各项均为 0。

评审 §3.1 建议的“信任复核路径集合须相同”没有机械化。写出路径集合的句子只有几处：`11` §11.8.1，`05` 的 RunSpec 注释、§5.4.1 与 G2，`02`、`06` 的注释。它们都写 `.pi/**`、`.agents/**`；`00` 不再列路径。

## 排期（第 74 轮相对第 73 轮，±0.00 人周）

| WBS 行 | 增量 | 说明 |
|---|---|---|
| W6（Agent） | 0 | 以显式路径传入声明性资源：枚举复用添加项目时信任提示已有的 base 资源枚举，Host 只多五个选项。同一行删除了 `resolveProjectTrust` 的传递。现值 9.17 |
| W10（安全） | 0 | 静态清单不再枚举项目扩展（删除） |
| — | 0 | 以下各项按 WBS 行均不足 0.01：<br>• `04` 信任提示文案；<br>• `00`/README 措辞；<br>• G46 (bh) 改写，复用已有夹具；<br>• 四条观察 |

- **WBS**：122.92，不变。
- **角色合计**：Agent 26.53、系统 26.35、桌面 27.84、设计 28.61、安全 13.59。
- **冻结前所需**：28.74 / 28.88 / 28.64 / 28.17 / 14.40（安全按 0.5 人 28.80）。
- **余量**：系统 0.12、Agent 0.26、桌面 0.36、设计 0.83、安全 0.20。
- **系统线**：净增 0。
- **依赖链**：19.91。
- **增人备选**：128.83，T 23.79，33 周。
- **M1 维持 38 周**（2027-07-30）。
- **一致性**：`14` L16、L216、L393、L395、L399、L401 与 `15` ADR-133 第 74 轮补记、ADR-202 末段一致，lint (C) 通过。
- **与评审估计的关系**：评审对严格一边的估计为 ≤ 0.02。本轮取 ±0.00，理由是删除抵消了新增：
  - 新增：显式路径；
  - 删除：信任回调与 `--approve` 的传递、静态清单中的项目扩展枚举。

## 偏离指示之处

- **没有采用“base 中含会执行代码的资源时整项目以不信任启动、只含声明性资源的项目照常复核”**（评审严格一边的原写法）。核实发现 Pi 有不受信任控制的显式入口，因此改为“信任恒为假 + 显式传入声明性资源”。这样更严格（任何项目都不执行项目代码），保留的声明性资源也更多（含会执行代码的资源的项目，其技能、提示、主题照样可用）。
- **项目 `settings.json` 的非资源设置在 M1 中也不生效**。它与 `extensions`/`packages` 在同一个文件里，Pi 只能整体读或整体不读。`00` §0.5.1 与信任提示已如实写明。
- **新增一个 `RunSpec.projectResources` 字段**。Host 必须只传 base 树中的文件（这样才能排除被忽略的文件与符号链接），文件列表须由能读影子的 Supervisor 给出。这在收敛规则 (3) 的“一个字段”之内。
- **没有采用“从 base 物化一份声明性资源供加载”**。技能以相对路径引用目录内的其他文件，物化副本与卫星中的不同；也超出收敛规则。

## 未解决

无。已知残余都写入了正文：
- 用户级扩展或 MCP 服务器自己执行卫星文件，见 `11` §11.8.2 与 T16；
- 改动后的 `AGENTS*.md` 仍会加载，见 T4 与 §11.8.1 的上下文文件复核；
- 项目扩展、包与 MCP 的加载推迟到 M2。
