# 第 27 轮评审回应：`05`、`06`

以 ADR-153 为准。每条一行：条目 → 修订位置。

- R27-D11-01（键白名单）→ `06` §6.2 GitService 行：只取 `lfs.url`、`remote.<name>.lfsurl`、`lfs.<url>.access`、`lfs.fetchinclude`、`lfs.fetchexclude`；URL 只接受 `https://`、`ssh://`（含 scp 式），不合规值记诊断日志并忽略。
- R27-D13-01（按键解析）→ 同一行：逐键以用户主检出的 git 配置覆盖 `.lfsconfig`，再按 `lfs.url` ?? `remote.<name>.lfsurl` ?? 远端推导；远端名取 `branch.<base>.remote`，否则 `origin`；镜像 `HEAD` 指向 `refs/tower/none`；`fetchexclude` 排除的对象不算缺失，记 Fact `lfs_excluded{count}`（§6.2.4 仓库准备段同步；`facts.kind` 注释指向 `02`/`16` 的取值）。`05` §5.3.1：简报说明被排除的文件是指针。
- R27-D4-01（准备期间 Tower 自己的写入窗口）→ `06` §6.2.3 I2 行：检出完成标记出现之前不监视卫星，检出与重试删除是 Tower 自己的写入；L261 “卫星已存在的 `ready`”改为“检出完成标记存在的 `ready`”。

## 人周

| 线 | WBS 行 | 本轮增量 | 内容 |
|---|---|---|---|
| 系统 | W7-core | +0.05 | `.lfsconfig` 白名单与按键解析、远端名、`refs/tower/none`、`lfs_excluded` |
| 系统 | W3 | +0.02 | 标记出现前不监视卫星 |
| Agent | W6 | +0.01 | 简报中的指针说明 |
| **合计** | | **+0.08** | |

## 需要主干处理

- `02`/`16`：Fact kind 登记 `lfs_excluded{count}`。
