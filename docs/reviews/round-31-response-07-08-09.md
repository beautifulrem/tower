# 第 31 轮评审回应：07 / 08 / 09

依据 ADR-157 及其第 31 轮补记。

| 决策 | 处理 | 位置 |
|---|---|---|
| ADR-157（M2 推送失败） | §8.4 新增 `integration` 行：sev 2，去重键 `int:{goalId}`，重试再次失败时并入同一条目；Goal 保持 `accepted`，合并队列条目（M2）保持“待推送”。§8.8 新增标注：重试推送且成功 → `actionable`；“只保留分支” → `informative` | `08` §8.4、§8.8 |
| ADR-157 补记（闸门失败预案） | §8.4 新增 `integration` 行：owner 为 project，去重键 `int:{projectId}:credential_url`，只在 SP6a A12(a) 闸门失败时出现；Tower 不改写用户配置。§8.8：用户改用 credential helper 后条目自动关闭 → `actionable` | `08` §8.4、§8.8 |
| ADR-157（撤回凭据改写） | 检查 `07`：没有提到凭据 store 文件或凭据改写。“store”只出现在包管理器存储语境（`$VS`/`$GS` 的 pnpm store），与此无关。`08` 同样没有。无需删除 | — |

lint `--checks rstuvwxyzck`：退出码 1，只有两项，都是同一个主干缺口：
- (s)：`16` `NeedsYouItem.kind` 缺少 `integration`；
- (w)：`08` 使用了 `16` §16.1.7 中没有的 kind（`integration`，4 处）。

工时：0.03 人周（两个去重键与标注）。

## 需要主干修改的地方

1. **`16` §16.1.7 `NeedsYouItem.kind`**：加入 `integration`，并登记两个去重键 `int:{goalId}` 与 `int:{projectId}:credential_url`。`02` §2.9 的 kind 联合同步。加入后 lint (s)(w) 应通过。
