# 第 33 轮评审回应：`05`、`06`

以 ADR-159 为准（机密投递的统一模型；投递表唯一定义在 `11` §11.7）。每条一行：条目 → 修订位置。

- 独占窗口（gate 侧）→ `05` §5.6.5：`TowerPolicy.secretWindow` 字段；gate 新增第 0 步——标志存在且持有者不是本 Goal 时，新工具调用在 handler 中等待（不 block、不 terminate），进行中的调用照常结束，`features.gate=false` 时同样执行，Tower 自己的工具除外；新增契约测试 C39。
- T33 与 C29 → `05` C29 改写：Tower 不把机密放入长生命周期进程的参数或环境；两个有界例外（验证器 `env` 注入、`secrets.access` 单次调用）只在独占窗口内出现；`secretsVia:"file"` 只出现投递文件路径。
- 验证器机密 → `06` §6.2 VerifierScheduler 行：默认 `env`、可选 `secretsVia:"file"`（`~/.tower/run/<deliveryId>/` 即时投递，验证器沙箱只放行该路径），skip 哨兵提示；独占窗口（`secret_window.opened/closed` 事件、写入其他 Goal 的 `policy.json`、等待超过 5 分钟 → `verify_env_error{stage:"secret_window"}` 与三项选择、项目可关闭）；`secrets.access` 按单次工具调用注入、同一窗口。
- 数据目录 → `06` §6.6.1：“密钥”行改为“只静态存放在密钥库，即时投递于 `~/.tower/run/`”（L1038）；目录布局加入 `run/<deliveryId>/`；备份排除加入 `run/` 并加 Spotlight 排除；§6.1.6 启动清空 `run/`。
- 重启清理 → `06` §6.1.6（L141）与 §6.1.10（L194）：只处理令牌已确认的进程，无法确认的不提示、不终止。
- `goal.base.choose` 持久化 → `06` §6.3 新列 `goals.base_choice{side, towerTip, userTip, at}`；`baseTip()` 与命令行同步。
- 远端 base fetch → `06` GitService 行：按（镜像，引用）合并，总时限 60 s，`in_review` 只等前 10 s；`base_fetch_failed` 的提示保留到下一次成功获取。
- 项目级 Fact → `06` `facts`：`goal_id` 可空，新增 `project_id` 与“至少属于一个”的 `CHECK`、项目索引。
- ADR-159 补记（`goal.tool.abort`）→ `06` §6.4.3 新命令与 `decisions.kind` 的 `CHECK` 加入 `abort_tool_call`；`05` §5.3.5 骨架以 `withPerCallAbort` 包装沙箱 bash 的 `execute`（每次调用一个 `AbortController`，v1.2.0 `types.ts:650-655`、`tools/bash.ts:127-150, 374-375` 核实），§5.6.5 第 0 步写明 SDK 直接中止、RPC 经 `/tower-abort <toolCallId>`，扩展与 MCP 工具不可单独中止；C39 增加 (b)。工作量 Agent W6 +0.05（合计改为 +0.35）。
- ADR-159 补记 2、3 → `06` VerifierScheduler 行：窗口内对其他 Goal 已识别的全部进程（树 ∪ 令牌）`SIGSTOP`、结束时 `SIGCONT`，不含 Engine Host 与 Tower 自身；`secret_window.suspended/resumed{goalId}` 事件，挂起期间墙钟预算、停滞检测与 Run 耗时不计时；项目设置 `secretWindow.enabled`。§6.1.6 恢复行：窗口中崩溃时启动先对令牌已确认的进程 `SIGCONT` 并补写事件。`05` §5.6.5 第 0 步同步。工作量另计系统 W4 +0.05、Agent W9 +0.03（合计改为 +0.43）。

## 人周

| 线 | WBS 行 | 本轮增量 | 内容 |
|---|---|---|---|
| 系统 | W3 | +0.05 | `base_choice`、项目级 Fact、重启清理只按令牌 |
| 系统 | W7-core | +0.02 | fetch 按（镜像，引用）合并与总时限 |
| Agent | W6 | +0.08 | gate 第 0 步（独占窗口等待）、C39、C29 改写 |
| Agent | W9 | +0.1 | 验证器的独占窗口编排（标志、等待、超时出口）、`env`/`file` 两种投递、`~/.tower/run` 即时投递 |
| 安全 | W10 | +0.05 | 验证器沙箱逐路径放行投递文件、`secrets.access` 单次注入 |
| **合计** | | **+0.43** | 系统 0.12（在余量内）；含补记 Agent +0.08、系统 +0.05 |

## 需要主干处理

- `11` §11.7：投递表；`16`：事件 `secret_window.opened/closed`、`goals.base_choice`、`TowerPolicy.secretWindow`。
