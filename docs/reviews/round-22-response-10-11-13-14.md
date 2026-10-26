# 第 22 轮回应 · `14` `16`（`10` 核对）

> 范围：ADR-148（R22 的三个次要条目）在 `16`、`14` 中的落实，并核对 `10`。`11`、`13` 本轮没有改动。

| 条目 | 处理 | 位置 |
|---|---|---|
| R22-D4-01 / ADR-148 | **`16`**：<br>• “`ready` 的入口与出口”行：`queuedRun` 恒非空（批准写 `initial`，依赖回退写 `resume`）；`initial` = 第一次启动；`queuedRun` 在 `run.started` 的同一事务中清除；增加两条恢复规则；<br>• `Goal.queuedRun` 行：写明 `CHECK`，并说明 `kind` 与 `Run.reason` 一一对应；<br>• `Run.reason` 加入 `handback`。 | `16` |
| R22-D6-01 / ADR-148 | **`16`**：<br>• 准备阶段 120 s，失败或超时 → `paused(engine_crash)`，不 `autoResume`，生成 `stalled{prepare_failed}`；<br>• `prepare_failed` 登记去重键 `st:{goalId}:prepare` 与三个选项；<br>• `abandon` 始终允许，并中止准备；`E_BUSY` 只适用于准备阶段的 `pause` 与 `take_over`；<br>• §16.2.2 增加默认值 120 s；<br>• 废弃表增加一行。 | `16` |
| R22-D15-01 / ADR-148 | **`10`**：放弃改动的规则在第 21 轮已写为“`takeoverFrom ∈ {running, ready}` 或 `takeoverPriorReasons` 含 `human`”，与 `03`/`07` 一致；`ready` 接管与 `E_BUSY` 的描述也与 ADR-148 一致，无需修改 | `10`（核对） |
| 用例 | G42 补充：<br>• (e)：准备阶段只对 `pause`、`take_over` 返回 `E_BUSY`；<br>• (g)：`initial` 受评审积压闸控，`resume` 不受；<br>• (h)：交还排队后，Run 行的 `reason` 为 `handback`；<br>• (i)：准备阶段崩溃 → 回到 `ready`，`kind` 保留；<br>• (j)：准备超时 → `paused(engine_crash)`，不 `autoResume`；<br>• (k)：准备中放弃。<br>“自 `ready` 接管后放弃改动 → `paused(human)`”已由 G42(c) 覆盖 | `14` |

**准备阶段 120 s 的范围（已按 ADR-148 补记裁决并落实）**：准备阶段分为两个子阶段。

| 子阶段 | 内容 | 时限 | `pause` | `take_over` | `abandon` |
|---|---|---|---|---|---|
| 依赖物化 | depcache CoW 物化，或未命中时由安装器构建；卡片显示 `依赖准备中 · <阶段> · <进度>` | `prepare.depsTimeoutMin`，默认 15 min，不计入 120 s | 允许，中止物化 → `paused(human)`，继续目标 `run`，`queuedRun` 保留 | `E_BUSY` | 允许 |
| 启动 | 卫星、Host 握手、开场组装 | 合计 120 s | `E_BUSY` | `E_BUSY` | 允许 |

任一子阶段失败或超时都走同一出口：`paused(engine_crash)` + `stalled{prepare_failed}`，依赖物化的原因写“依赖准备失败”。

落实位置：

- `10` 的“运行模式”段；
- `16` 的 §16.2.2 两行默认值、`ready` 行、`ProtoError.code` 行与 `prepare_failed` 行；
- `14` 新增 G42(l)，分三组：① 依赖物化超时 → `prepare_failed`；② 物化中暂停 → `paused(human)`；③ 物化中接管 → `E_BUSY`。

**本轮工作量与 M1：+0.37 人周（WBS 118.89），M1 维持 37 周。** 已包含准备阶段拆分后更新的估计。

| 来源 | 估计（人周） | 计入的 WBS 行与承担线 |
|---|---|---|
| 05/06 | +0.2 | W3 +0.1（系统）、W4 +0.1（桌面） |
| 04/12 | +0.07 | W11 +0.06、W13 +0.01，都由设计线承担：前端部分原属桌面线，桌面线余量偏小 |
| 本文 | +0.1 | SP6b 用例 G42(g)–(l)，设计线 |

**各线余量**（缓冲外，工作周）：

| 线 | 余量 |
|---|---|
| 系统 | 0.22 |
| Agent | 0.72 |
| 桌面 | 0.1 |
| 设计 | 0.36 |
| 安全 | 0.39 |

**日程不变**：第 33 周末冻结（2027-06-25）。增人备选仍为 32 周，前提是新人承担约 2.3 人周的安全线工作；但这一备选只剩约 0.02 工作周余量。

ADR-133 的第 22 轮补记已写入 `15`。

**lint**（`--checks rstuvwxyzckdnSeRq`）：主干补上 ADR-145、ADR-147 的反向标记后，全部通过，退出码 0。
