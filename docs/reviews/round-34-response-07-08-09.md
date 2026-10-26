# 第 34 轮评审回应：07 / 08 / 09

依据 ADR-160。

| 决策 | 处理 | 位置 |
|---|---|---|
| ADR-160（`07` 带机密的标准） | 独占窗口一项整体替换为**调度互斥**（唯一定义在 `11` §11.7.0）：<br>• 带机密的标准只在没有任何其他 Agent 活动时开始（`running`/settle/准备阶段、Scratch、检验服务），运行期间冻结准入；持有者只在 `claimed`/`verifying` 时运行。<br>• 标准结束时终止验证槽位的全部进程（进程树 ∪ 令牌）。<br>• 等待超过 10 分钟 → Needs-You `ve:{goalId}:secret_wait`；这**不是** `verify_env_error`，Goal 保持 `verifying`；三个选项各有命令（`keep`/`run_now`/`as_file`），`run_now` 记 `accept_secret_exposure`。<br>• `secretMutex.enabled` 关闭时不等待。<br>删除：`secret_window` stage、“中止其他 Goal 的当前调用”选项、工具调用拦截。残余风险改为：互斥开启时 T33b 为低，关闭互斥或 `run_now` 时为中 | `07` §7.4.3 |
| ADR-160（机会式验证） | 跳过带机密的标准，这些标准只在正式验证中运行 | `07` §7.2.4 |
| ADR-160（`08` 去重） | `ve:{goalId}:secret_window` 改为 `ve:{goalId}:secret_wait`；`verify_env_error.stage` 列表删去 `secret_window`，并注明 `secret_wait` 不属于 `verify_env_error` | `08` §8.4 |
| ADR-160（`08` 标注） | `run_now`/`as_file` → `actionable`；`keep` → `informative`。“窗口自行开启 → obsolete”改为“人处置前该标准已自行开始 → `obsolete`” | `08` §8.8 |

`09` 无涉及。

lint `--checks rstuvwxyzck`：退出码 1，只有 (s) 一项：`HumanDecision.kind` 在三处不一致——`02` 已删除 `abort_tool_call`，`06`、`16` 仍保留它；`06`、`16` 缺少 `accept_secret_exposure`。都不在 `07`/`08`/`09`。

工时：−0.02 人周（删除窗口拦截的规格，新增内容只是引用）。

## 需要主干修改的地方

1. **`06` `decisions.kind` CHECK 与 `16` `HumanDecision.kind`**：删去 `abort_tool_call`，加入 `accept_secret_exposure`（lint (s)）。
2. **`16` §16.1.3**：确认 `verify_env_error.stage` 中没有 `secret_window`，并登记 `secret_wait` 去重键。
