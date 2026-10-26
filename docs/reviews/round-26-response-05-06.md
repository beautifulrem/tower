# 第 26 轮评审回应：`05`、`06`

以 ADR-152 为准。每条一行：条目 → 修订位置。

- R26-D13-01（LFS 端点显式传入）→ `06` §6.2 GitService 行：Tower 以 `git show <base>:.lfsconfig` 自行读取，按 git-lfs 优先级（用户主检出的 `lfs.url`/`remote.<name>.lfsurl` → base 的 `.lfsconfig` → 远端 URL 推导）算出端点，以 `-c` 显式传入；镜像的 `HEAD` 与其中配置不参与。
- R26-D11-01（凭据与输出）→ `06` 同一行：凭据只在 git、git-lfs 与 helper 之间传递，Tower 不截取；命令输出只进诊断日志（模式脱敏 userinfo 与认证头），从不进入开场或 Agent 可读位置；`prepare_failed` 卡片只显示 Tower 生成的摘要。`05` §5.3.1 从精确匹配集合中删去 LFS 凭据，改为说明不截取、输出不进开场。
- R26-D4-01（未建成的卫星不算丢失）→ `06` §6.1.6 卫星丢失行与 §6.2.4 检出完成标记：只对 `checkout.done` 存在的卫星判定丢失；标记缺失时的重新检出不触发丢失判定。
- R26-D15-01 → `06` `goal.pause` 行：检出属于仓库准备段，期间 `pause` 允许并中止（→ `paused(human)`）；`E_BUSY` 只用于握手与开场。F4b 与 §6.2.4 的接管条件统一为“检出完成标记存在”。events 表后的注释与 `events.producer` 注释：`prepare.progress` 的生产者为 `prepare`（Supervisor 的 PrepareService）。

## 人周

| 线 | WBS 行 | 本轮增量 | 内容 |
|---|---|---|---|
| 系统 | W7-core | +0.05 | `.lfsconfig` 自行读取与端点计算、未建成卫星不判丢失 |
| 安全 | W10 | −0.02 | 不再截取 helper 凭据（删去内存匹配）；输出只进诊断日志的约束 |
| Agent | W6 | 0 | 精确匹配集合删去一项 |
| **合计** | | **+0.03** | |

## 需要主干处理

- `16` L280：`prepare.progress` 的 producer 改为 `prepare`（Supervisor PrepareService），与 `06` 一致；`events.producer` 取值登记 `prepare`。
