# 第 22 轮评审回应：07 / 08 / 09

依据 ADR-148。

| 条目 / 决策 | 处理 | 位置 |
|---|---|---|
| R22-D6-01 / ADR-148（去重） | 新增一行：`stalled`（子类型 `prepare_failed`），去重键 `st:{goalId}:prepare`。准备阶段还没有 `runId`，所以键里不用它；重试后再次失败时并入同一条目 | `08` §8.4 |
| R22-D6-01 / ADR-148（标注） | 新增一行：“重试”（`goal.resume`）→ `actionable`；“我来改”（仅当卫星已存在）→ `actionable`；“放弃” → `informative` | `08` §8.8 |
| R22-D6-01 / ADR-148（模式） | `preparing` 行写明：总时限 120 s，失败或超时 → `paused(engine_crash)`，继续目标 `run`，`queuedRun` 保留，不 `autoResume`，并给出去重键 | `08` §8.6.5 |
| `07` 的 Needs-You 来源 | `07` §7.7.1 的 `stalled` 子类型清单已含 `prepare_failed`（“其他来源”），无需改动 | — |
| R22-D15-01 / ADR-148 | 放弃改动规则 `takeoverFrom ∈ {running, ready}` 在 `07` 中已同步，补上 ADR 引用，注明与 `03` 一致 | `07` §7.10.3 |

lint `--checks rstuvwxyzck`：退出码 0。新增行的首格先写成 `` `stalled{prepare_failed}` ``，(w) 的表格解析器因此报错（它要求首格以 `` `kind` `` 开头）；首格改为 `` `stalled`（子类型 `prepare_failed`） `` 后通过。

## 工时

| 线 | 内容 | 人周 |
|---|---|---|
| 系统（注意力） | 新去重键与标注映射 | 0.02 |
| 合计 | | **0.02** |

## 需要主干修改的地方

没有新增项。另有一个工具问题：lint (w) 的 `table_rows` 遇到首格不以 `` `[a-z_]+` `` 开头的行时直接抛异常；建议跳过或报出该行，不要中止整个运行。
