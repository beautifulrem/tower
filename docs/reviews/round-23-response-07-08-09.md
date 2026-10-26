# 第 23 轮评审回应：07 / 08 / 09

依据 ADR-149。

| 条目 / 决策 | 处理 | 位置 |
|---|---|---|
| R23-D6-01/02 / ADR-149（去重行） | `stalled{prepare_failed}` 改为与暂停原因 `prepare_failed` 成对（原为 `engine_crash`）；该原因不在启动时自动解除，也不 `autoResume` | `08` §8.4 |
| R23-D6-01/02/03 / ADR-149（`preparing` 行） | 改写 `preparing` 行（原 L397）：<br>• 步骤顺序引用 `10` §10.3.1。<br>• 120 s 只计卫星创建或复用、Host 握手与开场组装，失败或超时 → `paused(prepare_failed)`。<br>• 依赖物化**不阻止 Run**：失败或超过 15 min 时照常进入 `running`，并给出 `prepare{ok:false}` chip，与原规则相同。<br>• 删去“10 min 后升为 `stalled{prepare_failed}`”：该子类型现在只对应 `paused(prepare_failed)`，Goal 在 `running` 中时不应使用它。<br>• 准备中途到达其他原因时中止准备 | `08` §8.6.5 |
| `07` | 没有“准备失败 → `engine_crash`”的文字。L675 的“准备阶段（checkout + 物化）≤ 5 s”是性能目标，不涉及去向 | — |

lint `--checks rstuvwxyzck`：退出码 1，只有 (s) 一项——`16` `Goal.pauseReason` 缺少 `prepare_failed`，不在 `07`/`08`/`09`。

## 工时

| 线 | 内容 | 人周 |
|---|---|---|
| 系统（注意力） | 暂停原因改名；删去依赖失败的 10 min 升级（−） | 0.0 |
| 合计 | | **0.0** |

## 需要主干修改的地方

1. **`16` `Goal.pauseReason`** 加入 `prepare_failed`（lint (s) 失败）；`16` §16.1.1 的优先级与 `12` §12.6.5 的 pause 行同步。
