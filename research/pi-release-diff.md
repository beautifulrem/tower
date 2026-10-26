# Pi 源码核实基线与发布版差异（回应 R2-D2-01）

- 设计文档的源码核实基于 `research/pi-mono` HEAD `b06c1f2`（2026-10-14）。Tower 固定的是 npm `@earendil-works/pi-coding-agent@1.2.0`（tag `v1.2.0`，commit `06a4669`）。
- `git log v1.2.0..HEAD`：46 个提交。`git diff --stat v1.2.0..HEAD` 中与运行时相关的核心文件只有 12 个：

| 文件 | 变化 | 对 Tower 的影响 |
|---|---|---|
| `core/agent-session.ts` | +15/−? ：恢复会话时按 `defaultToolModifiers` 还原工具配置（`_restoreToolsFromTranscript(modifiers)`），注释调整 | **低**：v1.2.0 中恢复会话同样从 transcript 还原工具（`_initialActiveToolNames === undefined` 时）；Tower 的 3 个工具通过扩展注册并在 `session_start` 中 `setActiveTools`，两版行为一致。行号在 L267 之后整体偏移 +1…+5 |
| `core/model-resolver.ts` | 重写（735 行） | 无：Tower 不依赖模型解析内部 |
| `core/settings-*.ts` | 新增 `sessionShareDestination` | 无 |
| `main.ts` | `inlineApiKey` 标志 | 无 |
| `cli/credential-print.ts`、`prompt-templates.ts`、`slash-commands.ts`、`tools/render*`、`export-html` | UI/打印 | 无 |

- **未变化**（对 Tower 关键）：`core/extensions/*`（加载顺序、`tool_call` 语义、`emitToolCall` 无 try/catch 而由 `_beforeToolCall`/`prepareToolCall` 转为错误结果）、`modes/rpc/*`、`core/compaction/*`、`agent_settled` 推迟语义、`resource-loader.ts`、`session-manager.ts`、`packages/agent/src/*`。
- **结论**：设计文档中关于 Pi 行为的结论对 v1.2.0 同样成立；`agent-session.ts` 行号引用需按 +≤5 行理解。`05` §5.11.1 的“已在发布版上验证”一列以本表为依据；SP2（M0）以 `npm pack @earendil-works/pi-coding-agent@1.2.0` 的 tarball 运行契约测试作最终确认。
