# Tower（暂定名）

**一个以 Goal 为第一公民的编程 Agent 监督台。引擎：[Pi](https://github.com/earendil-works/pi)。**

> 现有 Agent GUI 几乎都沿用 VSCode 的排布：左侧 Session 列表，中间是 Agent 输出流，右侧是 Diff。
> 这是 Chat 时代的惯性。Tower 问的是另一个问题：
> 和 Agent 交互时，我们真正想看到的是什么？是它**要做什么、在做什么、做成了什么、改变了什么**——
> 以及**证据**。

## 核心主张

1. **Goal，而不是 Session。** 侧边栏只有 Goal 与「需要你」收件箱。Session 降级为 Trace，按需深入。
2. **状态，而不是流。** 主视图显示 Goal 合同、验收标准进度、决策、改动、验证；过程流压缩为一行保留可转向细节的 Live Line，一键可展开。
3. **事实与声明分离。** Harness 计算的事实（diff、退出码、测试计数）与 Agent 的自述在数据和视觉上严格区分；Agent 的「完成」只是声明。
4. **完成三态。** Agent 声称完成 → Harness 在干净环境中验证 → 人验收。只有人的验收触发归档。
5. **例外管理。** 只在需要人时打扰人，并像工业报警系统一样度量每次打扰是否值得。
6. **评审即操控。** 全屏、按风险排序的评审单元；在 diff 上的评论就是给 Agent 的转向指令，带送达回执。
7. **记忆属于你和项目，而不属于路径。** User / Project / Goal 三层作用域，来源可追溯，需你批准。
8. **尊重 Pi 的极简与透明。** 运行期只向模型增加 3 个工具（`ask_user`、`log`、`submit`；塑形期为 `ask_user`、`propose_contract`），常驻上下文增量 ≤ 650 token；所有注入在 Trace 中可见；你的 Pi 扩展、技能与模型配置在大多数情况下照常生效——例外（例如 bash 与 `read`、`edit`、`write` 被 Tower 沙箱版本取代，Pi 的 `grep`、`find`、`ls` 不提供（Agent 改用 bash 中的同名命令）、高风险 Goal 默认不加载扩展与 MCP、配置了 MCP 服务器时外部工具每次调用都要你批准、仓库中的项目级扩展与 MCP 服务器在 M1 中不加载、stdio MCP 服务器不以 Agent 的工作区为工作目录启动，没写绝对 `cwd` 时以 Tower 为每个运行进程新建的空目录为工作目录、相对路径参数按项目根与服务器的工作目录检查；注册 `/mcp` 而取代 Pi 内置 MCP 的扩展在 M1 中不可用）见 `docs/00-vision-and-principles.md` §0.5.1。

## 仓库结构

```
docs/        设计文档（从 00 开始阅读）
  reviews/   对抗评审记录（每轮的追问、评分与回应）
research/    原始调研报告（带引用）与 Pi 源码克隆（pi-mono/，未纳入版本控制）
```

## 阅读顺序

| 先读 | 再读 | 实现前读 |
|---|---|---|
| `docs/00-vision-and-principles.md` | `docs/03-goal-lifecycle.md` | `docs/05-pi-integration.md` |
| `docs/01-research-synthesis.md` | `docs/04-ux-information-architecture.md` | `docs/06-system-architecture.md` |
| `docs/02-domain-model.md` | `docs/07` – `docs/11` | `docs/12` – `docs/14`、`docs/15-decision-log.md` |
| | | `docs/16-registry.md`（标识符、默认值、快捷键等的单一来源，随时查阅） |

## 状态

设计阶段。尚无实现代码。见 `docs/14-roadmap-and-validation.md`。
