# 第 31 轮评审回应：`05`、`06`

以 ADR-157 为准（撤回 ADR-155/156 的凭据改写）。每条一行：条目 → 修订位置。

- R31-D13-01（在沙箱层面关闭进程观察，撤回凭据改写）→ `06` §6.2 GitService 行（L239）重写网络命令段：仍在镜像中执行，原样使用用户主检出的远端 URL 并 include 用户全局与系统配置；写明沙箱闸门（Seatbelt 拒绝非自身进程树的 `process-info*` 与 `kern.procargs2`/`kern.proc`；Linux 独立 PID 命名空间；SP6a A12(a)）与闸门失败预案；删去 userinfo 剥离、store 文件、完整有效配置写出、`GIT_CONFIG_NOSYSTEM`、按主机与 `insteadOf` 改写。保留 LFS `.lfsconfig` 白名单临时文件（内容改为原样的远端 URL）与“输出只进诊断日志”。LFS 段“凭据与输出”改回“Tower 从不接触凭据”。§6.6.1 `tmp/` 与 §6.1.6 恢复行删去凭据文件说明。`05` §5.3.1 同步措辞；C29 的 (b)(c) 替换为新 (b)：沙箱内进程读不到其他进程树的参数与环境。
- R31-D13-02（远端 base 的观测时机，M1）→ `06` GitService 行：准备、进入 `in_review` 前、“检查 base”、打开详情且距上次获取超过 10 分钟时 fetch；之后做 base 前进检测（Fact `base_advanced{from, to, count}`）与 `integrated` 观测；`baseTip()` 分叉时取获取时间较新的一方。
- R31-D11-01（M2 推送）→ `06` GitService 行：`git hook run --to-stdin`（git ≥ 2.40）、`ls-remote` 取远端提交；推送失败 → Needs-You `integration`（`int:{goalId}`）；DDL `needs_you.kind` 加入 `integration`。

## 人周

| 线 | WBS 行 | 本轮增量 | 内容 |
|---|---|---|---|
| 系统（M1） | W7-core | −0.12 | 撤回 URL 剥离、store 文件、完整有效配置写出与 `insteadOf` 改写（−0.15）；远端 base 的四个观测时机与 `base_advanced` +0.03 |
| 安全 | W10 | −0.01 | C29(b)(c) 的参数采样改为进程观察拒绝的回归（闸门本身计入 SP6a A12(a)，不在本表） |
| **合计（M1）** | | **−0.13** | M2 推送的 `integration` 卡片计入 M2 |

## 需要主干处理

- `16`：废弃表登记 ADR-155/156 的凭据改写机制；Needs-You kind `integration` 与去重键 `int:{goalId}`；Fact `base_advanced`。
- `11`：Seatbelt 配置中拒绝观察其他进程的规则（S2）与 SP6a A12(a) 闸门。
