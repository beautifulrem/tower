# 第 19 轮评审回应：`05`、`06`

以 ADR-145 为准（主干 `03` 已改）。每条一行：条目 → 修订位置。

- R19-D4-01（归因窗口的次序与“通过”）→ `06` §6.4.3 表前统一写法：改为对 `03` §3.2.1 现文的**逐字**引文（含 rebase 带入的 base 变化、“通过”含验收延续、按事件序号界定），实现注记放在引文之后（`events.seq` 比较、`OpeningRef.id`、不读 `TOWER_ORIGIN`）；`goal.hand_back` 第 ③ 步写明同一事务中先写 `human_edit` 检查点、后写交还决定。
- R19-D4-02（离开暂停后需要等待）→ `06` 统一写法：`run` 目标无槽位或依赖未满足 → `ready{waitReason}`，`pending_openings` 保留。
- R19-D6-01（settle 中崩溃、drain 中的其他目标、回退前置条件）→ `06` §6.3 `runs.phase`（`running`/`settling`）；§6.1.10 settle 开始时同一事务写 `settling`；§6.1.6 恢复表拆出“settle 中崩溃 → `settle`”与“Run 中崩溃 → `run`”两行；§6.1.4 drain 协议、`goal.take_over`、`run.rewind`：drain 进行中请求其他目标返回 `E_BUSY`；`run.rewind` 在 `external_change` 未解除时 `E_STATE`。
- R19-D6-02（macOS 内存上限）→ `06` §6.1.10：每 5 s 以 `proc_pidinfo` 采样 `exec` 已知的直接进程，超过上限 80% 时做一次令牌扫描。
- R19-D7-01（不信任 Agent 可设置的环境值，M2）→ `06` §6.1.10 与统一写法的实现注记：`TOWER_ORIGIN` 只用于诊断；只有 `user_bash` 调用窗口内的写入归人（Tower 由调用的 `BashOperations` 实例得知），其后台进程按存活进程规则记为 `agent`。
- R19-D8-01（撤回与送出的竞争）→ `06` 统一写法与 `goal.openings.withdraw` 行：在 `run.started` 同一事务中消费；已消费返回 `already_delivered`，已撤回返回成功。`05` `RunOpening` 注释与 C38 同步（投递失败时未投递条目以原 `id` 重新入队）。
- R19-D15-01 → 第 1 项：`06` §6.1.10 cgroup 改为“每 Goal 父、每 Run 子”，并声明取值唯一在 `10`；第 2 项：`06` §6.1.10 写明“知悉”不结束存活期间；第 3 项：见 R19-D4-01；第 4 项：`06` §6.1.10 令牌注入改为由 `exec` 自身注入；第 5 项：`05` §5.5 “draining 中结束”行改指 `06` §6.1.4 与 §6.1.6；第 7 项：`05` §5.3.6 `bash.ts:214-225` 改为 `186-211`。

- 补充（协调者）：`06` §6.3 `checkpoints_landmark_guard` 的取值加入 `rebase`（M2，合并队列 rebase 写入），与 `10`、`16` 同步。

## 人周

| WBS 行 | 本轮增量 | 内容 |
|---|---|---|
| W3 Supervisor 核心 | +0.15 | `runs.phase` 与恢复分支、`E_BUSY`/`E_STATE` 守卫、离开暂停到 `ready`、`already_delivered`、窗口以 `seq` 界定 |
| W4 进程生命周期 | +0.1 | macOS 直接进程采样与 80% 触发扫描 |
| W6 Pi 适配器与 tower-goal | +0.05 | `user_bash` 调用窗口归因（M2，标注在 M2 范围）、C38 补断言 |
| **合计** | **+0.3** | |

## 需要主干处理

- `10` §10.3.1：cgroup 取值写为“每 Goal 父、每 Run 子”；第 ④ 项改为“存活者未全部退出期间”（“知悉”不结束）。
- `16` L31：“人的改动”补上 rebase（M2）带入的 base 变化。
