# 第 25 轮评审回应：`05`、`06`

以 ADR-151 为准。每条一行：条目 → 修订位置。

- R25-D13-01（LFS 获取的执行上下文）→ `06` §6.2 GitService 行：LFS 缺失对象的获取改为 Tower 以用户身份、在 Agent 沙箱之外执行一条 `git lfs fetch`（不经 GitRunner 的 git-only 沙箱），作用对象只有镜像；用户的全局与系统配置生效，仓库级配置只取用户主检出的 `remote.<name>.url`、`lfs.url` 与 base 中的 `.lfsconfig`；不限制主机；`10` §10.1.2 加固清单对它的例外及理由。顺带修正上一轮插入位置把 Seatbelt/bwrap 括号断开的问题。
- R25-D6-01（检出归入仓库准备）→ `06` §6.2.4：仓库准备的顺序为镜像 → 项目锁 → fetch → LFS 补齐 → `clone --shared` 与检出；120 s 只计握手与开场；检出完成标记与“标记缺失则删除工作目录后重新检出”的重试规则；准入流水线行与 F4b 同步；`prepare.progress.step` 取值改为 `mirror | lock | fetch | lfs | checkout | deps | handshake`。`05` §5.3.1 同步 120 s 的范围。
- R25-D4-01（接管的守卫）→ `06` `goal.take_over` 行：要求检出完成标记，否则 `E_STATE`（“工作区尚未建立”），自 `paused(prepare_failed)` 接管同样适用。
- R25-D4-02（`queuedRun` 的清除点）→ `06` §6.2.4 与 `queued_run` 列注释：进入 `ready`/`paused` 以外的任何状态时也清除。
- R25-D11-01（脱敏的精确匹配集合）→ `05` §5.3.1：开场中的安装器日志尾部的精确匹配集合覆盖 Tower 知道的全部机密（密钥库条目、模型提供商密钥、`$TI` 注册表令牌、LFS 获取期间 credential helper 返回的凭据，后者只在内存中）。

## 人周

| 线 | WBS 行 | 本轮增量 | 内容 |
|---|---|---|---|
| 系统 | W7-core | +0.05 | 检出移入仓库准备、完成标记与重新检出 |
| 系统 | W3 | +0.05 | `take_over` 守卫、`queued_run` 新清除点 |
| 安全 | W10 | 0（替换） | LFS 获取从 GitRunner 沙箱改为用户身份执行：原“单命令网络开放”的工作改为“输入来源审查与例外登记”，工作量相当 |
| Agent | W6 | +0.02 | 脱敏精确匹配集合扩展到 `$TI` 与 credential helper 凭据 |
| **合计** | | **+0.12** | |

## 需要主干处理

- `10` §10.1.2：加固清单登记“用户身份的 `git lfs fetch`”这一例外；§10.3.1 步骤顺序与完成标记。
- `11` §11.7：精确匹配集合加入 `$TI` 令牌与 credential helper 凭据。
