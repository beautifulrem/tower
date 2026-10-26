# 第 31 轮回应 — 主干文档（02、15）

| 条目 | 处理 | 位置 |
|---|---|---|
| R31-D13-01 | ADR-157：根因处理——沙箱拒绝观察其他进程（macOS Seatbelt 拒绝非自身进程树的 `process-info*` 与相关 `sysctl`；Linux PID 命名空间），SP6a A12(a) 为闸门；撤回 ADR-155/156 的全部凭据改写机制，网络命令在镜像中原样使用用户配置；闸门失败预案为拒绝带凭据 URL 的网络命令并提示用户改用 helper | `15` ADR-157 |
| R31-D13-02 | ADR-157：M1 远端 base 的 fetch 时机（准备、进入 `in_review` 前、“检查 base”、打开详情且超过 10 分钟）；`baseTip()` 分叉时取较新获取的一方 | `02` `base_diverged` 注释；`15` |
| R31-D4-01 | ADR-157：`base_advanced{from, to, count}` | `02` `Fact.kind` |
| R31-D11-01 | ADR-157（M2）：`--to-stdin` 自 git 2.40 可用，删除回退；远端提交取自 `ls-remote`；Needs-You kind `integration` | `02` `NeedsYouItem.kind`；`15` |
| R31-D15-01 | 由作者统一 | — |
