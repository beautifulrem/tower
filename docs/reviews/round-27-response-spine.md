# 第 27 轮回应 — 主干文档（02、03、15）

| 条目 | 处理 | 位置 |
|---|---|---|
| R27-D11-01 | ADR-153：`.lfsconfig` 键白名单（`lfs.url`、`remote.<name>.lfsurl`、`lfs.<url>.access`、`lfs.fetchinclude/fetchexclude`），URL 只接受 https/ssh | `15` ADR-153 |
| R27-D13-01 | ADR-153：按键解析（与 git-lfs 一致）；远端名；镜像 `HEAD` 指向占位引用；fetchinclude/exclude 的缺失判定与 Fact `lfs_excluded` | `15` ADR-153 |
| R27-D4-01 | ADR-153：检出与重试删除是 Tower 自己的写入，标记出现前不监视；`03` 改为“检出完成标记存在” | `03` §3.2；`15` |
| R27-D15-01 | `02` `takeoverFrom` 注释含 `ready`；其余由作者处理 | `02` §2.4 |
