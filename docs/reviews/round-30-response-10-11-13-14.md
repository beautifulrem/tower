# 第 30 轮回应 · `10` `11` `14` `16`

> 范围：ADR-156（R30 全部条目）在 `10`、`11`、`14`、`16` 中的落实。`13` 本轮没有改动。安全相关内容只写到设计层面。

| 条目 | 处理 | 位置 |
|---|---|---|
| R30-D13-01 / ADR-156 | §10.1.2“Tower 的 git 网络命令”重写了凭据部分：<br>• **凭据按主机提供**：`credential.<scheme>://<host>[:port].username`，store 条目为 `<scheme>://<user>:<secret>@<host>`，`useHttpPath` 保持 false。这样 git-lfs（端点路径与仓库 URL 不同）也能用上。<br>• **只有用户名**（Bitbucket、Azure DevOps）时只写 `username`，用户自己的 helper 照常工作。<br>• **带密码或 token** 时，store helper 写在 `[include]` 之前，排在用户全局 helper 的前面。<br>• **从不清除用户的 helper 列表**。<br>步骤 2a 同步。 | `10` |
| 认证键的读取（R30-D15-01 第 4 项，ADR-156） | 按推荐的 (a) 处理，读取含仓库级的有效认证配置，但只取认证类键。写入方式改为：只追加 `[include]` 在镜像中带不进来的那部分值（仓库级的值与按目录生效的值，按 `--show-origin` 求差集），按主检出上下文中的顺序写出。用户的 helper 链因此原样保留、不会重复，也不再需要清空任何多值键。仓库级的、带凭据的 `insteadOf` 同样去凭据后写入。 | `10` §10.1.2、步骤 2a；`11` |
| `GIT_CONFIG_NOSYSTEM` 的时机 | 只在全局或系统配置中有带凭据的 `insteadOf`、因而不 include 全局配置而写出完整有效配置时设置。正常路径不设，系统级的非认证配置照常生效。 | `10` §10.1.2；`11` §11.6.2；`16` |
| R30-D13-02 / ADR-156 | • **`baseTip(r, b)` 的唯一定义写在 `10` §10.1.2**：<br>&nbsp;&nbsp;– 只有一个值时取它；<br>&nbsp;&nbsp;– 有祖先关系时取后代；<br>&nbsp;&nbsp;– 分叉时取 `refs/tower-remote` 并记 Fact `base_diverged`。<br>• **调用方**：步骤 1 的 `baseCommit`、§10.9.3 的前进检测、§10.10、Q2 的 `newBase`（M2）、§10.12 的 `integrated` 观测。<br>• **“base 前进”的定义**：新值 ≠ `baseCommit`，且 `baseCommit` 是它的祖先；其余情形只记 Fact，不会出现倒退的 rebase。<br>• **M2 rebase 前的 LFS 补齐**：在卫星锁之外进行，人的命令不被阻塞；补齐完成后在锁内重新检查全部前置条件（空闲点、无人工编辑或检验检出、`baseCommit` 未变、`baseTip` 未再次前进），不成立就放弃本次 rebase。 | `10`；`16` 新增 `baseTip` 行，指向 `10` |
| R30-D14-01 / ADR-156 | • §10.10 开头标明“自动 rebase 属于 M2”，表格、LFS 补齐与冲突解决 Run 都归 M2。<br>• M1 中 base 前进时只记 Fact 并在卡片上提示，不 rebase、不改 `baseCommit`。<br>• §10.1.2 的适用范围把 rebase 前的补齐移到 M2。<br>• `16` 的 `rebasePolicy` 行与 `rebase_lfs_failed` 标为 M2。 | `10` `16` |
| R30-D11-01 / ADR-156（M2） | `pre-push` 改为 `git hook run --ignore-missing --to-stdin=<0600 文件> pre-push -- <远端名> <URL>`：<br>• 标准输入必须经 `--to-stdin` 传入；<br>• 没有钩子视为通过；<br>• git < 2.42 时不运行钩子、照常推送，卡片如实说明；<br>• 钩子失败时 Goal 保持 `accepted`，卡片“推送被 pre-push 钩子拒绝”提供“重试推送”与“只保留分支”。<br>§10.1.2 与 §10.12 同步。 | `10` `16` |
| R30-D15-01（`11` 部分） | • L379 的 Fact 改为 `lfs_config_ignored{keys, reasons}`，来源恒为 `.lfsconfig`；<br>• 凭据描述改为按主机提供、不清除 helper、只有用户名时不写 store；<br>• §11.6.2 写明 `GIT_CONFIG_NOSYSTEM` 的条件与仓库级认证键的处理；<br>• T33 的缓解措辞同步。 | `11` |
| `16` | • `Fact.kind` 增至 27 种：登记 `base_diverged{tower, user}`；`rebase_lfs_failed` 标为 M2。<br>• 网络命令行更新：凭据作用范围、认证键读取、`GIT_CONFIG_NOSYSTEM` 条件、`pre-push`。<br>• 新增 `baseTip` 行，唯一定义指向 `10` §10.1.2。<br>• `rebasePolicy` 行标为 M2。<br>• 废弃表新增一行。 | `16` |
| 用例 | • **G44**：(a) 移入 M2，不计入 M1 补跑。(e) 新增三组（M2）：<br>&nbsp;&nbsp;– 钩子经 `--to-stdin` 收到范围行，并扫描到测试串，不推送；<br>&nbsp;&nbsp;– 仓库没有钩子，推送照常进行；<br>&nbsp;&nbsp;– git 2.41 上不运行钩子，卡片给出说明。<br>• **新增 G45（M1）**：<br>&nbsp;&nbsp;– (a) URL 带 token 的远端加 LFS 项目，fetch 与 LFS 获取都成功；<br>&nbsp;&nbsp;– (b) Bitbucket 式只带用户名的 URL，由用户的 helper 提供密码；<br>&nbsp;&nbsp;– (c) `baseTip` 的三种情形：用户的值较旧、用户的值较新、分叉并记 Fact；<br>&nbsp;&nbsp;– (d) M1 中 base 前进只提示、不 rebase。<br>• SP6b 清单、批次表与甘特都加入 G45。 | `14` |

**本轮工作量与 M1：−0.02 人周（WBS 120.76），M1 维持 38 周，略为变轻。**

| 来源 | 估计（人周） | 计入的 WBS 行与承担线 |
|---|---|---|
| 05/06 | −0.05 | W7-core，系统：rebase 前的 LFS 补齐归 M2 −0.1、`baseTip()` +0.03、凭据按主机 +0.02。`10` 的同一工作不重复计入 |
| 04/12 | +0.01 | W11，桌面（M1 前端） |
| 本文 | +0.02 | SP6b：G44(a) 移入 M2 −0.01、G45 +0.03，Agent。G44(e) 的新组属于 M2，不计入 |
| `11` | 0 | 只是措辞修正 |

**各线余量**（缓冲外，工作周）：

| 线 | 余量 |
|---|---|
| 系统 | 0.23（上轮 0.18） |
| Agent | 1.16 |
| 桌面 | 1.13 |
| 设计 | 1.05 |
| 安全 | 0.95 |

**日程不变**：第 34 周末冻结（2027-07-02）。增人备选仍为 33 周（T ≥ 23.36），前提是新人承担约 2.3 人周的安全线工作。SP6b 补跑现值为 4.63 人周。ADR-133 的第 30 轮补记已写入 `15`，`16` 的 M1 行已更新。

**lint**（`--checks rstuvwxyzckdnSeRq`）全部通过，退出码 0。

**请主干知悉**：
- **store helper 的位置**：已由 ADR-156 补记裁定并落实。URL 或适用的替换目标带密码或 token 时，一律走“写出完整有效配置 + `GIT_CONFIG_NOSYSTEM=1`”的路径，store helper 排在全部用户 helper（含系统级）之前，URL 中的凭据优先。URL 只带用户名或不带凭据时仍 include 全局配置。改动位于 `10` §10.1.2（配置文件分为 include 写法与完整写法）、`11` §11.6.2 与 `16` 网络命令行；新增用例 G45(e)：系统级钥匙串 helper 为同一主机返回另一份凭据，期望使用 URL 中的凭据。工时可忽略，已并入第 30 轮补记。lint 重跑通过，退出码 0。
- **差集写入**：认证键改为“只追加 `[include]` 带不进来的值”，用来同时满足“含仓库级”与“不清除、不重复 helper”两条要求。这意味着按目录生效的全局 helper 会排在其他全局 helper 之后，相对顺序与用户本机略有不同，`10` 中已写明。
