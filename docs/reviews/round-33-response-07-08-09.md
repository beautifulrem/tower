# 第 33 轮评审回应：07 / 08 / 09

依据 ADR-159。

| 条目 / 决策 | 处理 | 位置 |
|---|---|---|
| R33-D7-01 / ADR-159（`07` 带机密的标准） | 改写，并注明唯一定义在 `11` §11.7：<br>• 默认 `env`；可选 `secretsVia:"file"`，投递文件在 `~/.tower/run/<deliveryId>/`，即时创建、用后删除。<br>• 验证器沙箱拒绝 `~/.tower/**`，只逐路径放行本标准自己的投递文件。<br>• **独占窗口**：标准运行期间，其他 Goal 的 Agent 不开始新的工具调用。等待超过 5 分钟 → `verify_env_error{stage:"secret_window"}`，不返工，选项为 等待 / 中止其他 Goal 的当前调用 / 以 `file` 重试；项目可关闭窗口。<br>• `file` 方式下若出现跳过 → R-T5（§7.5.4），并给出 `<NAME>_FILE` 提示。<br>• 残余风险与 `criterion_check.secretsVia` 的默认值同步 | `07` §7.4.3、§7.4.4 |
| ADR-159（`08` 去重） | `verify_env` 行的 `stage` 加入 `secret_window`，键为 `ve:{goalId}:secret_window`，并列出选项 | `08` §8.4 |
| ADR-159（`08` 标注） | 新增一行：“中止其他 Goal 的当前调用”或“以 `file` 方式重试” → `actionable`；“等待” → `informative`；人处置前窗口已自行开启 → `obsolete` | `08` §8.8 |
| R33-D15-01（`08` L208–209） | L208：“保持‘待推送’”改为 `awaiting_push`，且不占用该 base 的队列（ADR-158）。L209：“只在 A12(a) 证明……时出现”改为“**macOS 上默认出现**”（ADR-158）；凭据判定范围按 ADR-159 扩展为 URL userinfo、内联 `credential.helper`、`core.sshCommand`、`http.extraHeader` | `08` §8.4 |

`09` 无涉及。

lint `--checks rstuvwxyzck`：退出码 1，只有 (s) 一项——`06` `decisions.kind` CHECK 与 `16` `HumanDecision.kind` 缺少 `abort_tool_call`（ADR-159 的“中止其他 Goal 的当前调用”），不在 `07`/`08`/`09`。

工时：0.05 人周。独占窗口的 gate 标志与 Supervisor 计时计在 `05`/`06`；`07`/`08` 只有规格对齐。

## 需要主干修改的地方

1. **`06` `decisions.kind` 与 `16` `HumanDecision.kind`** 加入 `abort_tool_call`（lint (s)）。
2. **`16` §16.1.3 `verify_env_error.stage`** 加入 `secret_window`；`02` 的 `Criterion` 仍缺 `env`/`secretsVia` 字段（第 32 轮已报），默认值改为 `env`。
