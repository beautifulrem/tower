# 第 29 轮评审回应：`05`、`06`

以 ADR-155 为准。每条一行：条目 → 修订位置。

- R29-D11-01（URL 中的凭据）→ `06` §6.2 GitService 行新增“Tower 的 git 网络命令”通则（base 远端 fetch、LFS 获取；M2 轮询与推送）：`~/.tower/tmp/`（0700）下的 0600 临时配置写去掉 userinfo 的 `remote.<name>.url`，用户名经 `credential.<URL>.username`，密码经 `store --file=<0600 文件>` helper，进程参数与环境只出现路径；命令结束即删。LFS 临时配置内容加入 `remote.<name>.url`、`core.sshCommand` 与无 URL 的 `http.*`。§6.1.6 恢复表与 §6.6.1 目录布局：启动时清空 `~/.tower/tmp/`。`05` C29 增加 (c)：含凭据 URL 的 base fetch 期间无密码出现在任何 argv/env。
- R29-D13-02（rebase 的 LFS）→ `06` GitService 行：自动 rebase 写回前先补齐新 base 的 LFS 对象，失败记 `rebase_lfs_failed{missing}` 并放弃本次 rebase。
- R29-D13-01（远端名统一）→ `06` GitService 行：所有 base 获取命令使用同一远端规则，不硬编码 `origin`。
- R29-D15-01 → `06`：`lfs_config_ignored{keys, reasons}`，来源恒为 base 的 `.lfsconfig`。
- ADR-155 补记 1、2 → `06` GitService 行：所有 git 网络命令在镜像中执行（base fetch/轮询用去 userinfo 的 URL + 显式 refspec；M2 推送自镜像 `<seal>:refs/heads/<branch>`，再写用户仓库的 `branch.<x>.remote/.merge`）；推送目标 `pushRemote` → `pushDefault` → base 远端规则；`insteadOf`/`pushInsteadOf` 目标含 userinfo 时不 include 全局配置、写入主检出上下文的完整有效配置（排除仓库级键）并去 userinfo、凭据入 store；附 `GIT_CONFIG_NOSYSTEM=1`。补记工作量：系统 +0.06（M1：镜像中 fetch 与 refspec、有效配置的完整写出与 `insteadOf` 改写；M2 推送部分计入 M2，不占 M1 余量）、安全 +0.02（`insteadOf` 凭据改写的回归）；系统线在 0.22 人周余量之内。

## 人周

| 线 | WBS 行 | 本轮增量 | 内容 |
|---|---|---|---|
| 系统 | W7-core | +0.1 | 网络命令的临时配置与凭据文件通则（含 base fetch）、`~/.tower/tmp` 清理、rebase 前 LFS 补齐 |
| 安全 | W10 | +0.03 | C29(c) 的参数与环境采样 |
| **合计** | | **+0.13** | |

## 需要主干处理

- `10`：删除硬编码的 `origin`；§10.10 自动 rebase 写入 LFS 补齐步骤。
- `11` §11.7：脱敏模式加入 `<scheme>://<user>:<pass>@`；威胁表登记“同用户进程可见他进程参数”。
