# 第 32 轮回应 · `10` `11` `13` `14` `16`

> 范围：ADR-158（R32 全部条目）及其补记在 `10`、`11`、`13`、`14`、`16` 中的落实。安全相关内容只写到设计层面。

| 条目 | 处理 | 位置 |
|---|---|---|
| R32-D11-01 / ADR-158（`11`） | • §11.6.2“观察其他进程”行改为如实的平台事实：macOS 上 Seatbelt 无法阻止；平台二进制的环境读取成功但为空；`ps` 是 setuid，在沙箱中不可用，不作要求。M1 按“闸门失败”设计。A12(a) 是测量。Linux S2（M2）为 `--unshare-pid`。M2 决定点：以专用系统用户运行 Agent。<br>• §11.6.4：Tower 自己不把凭据或密钥放进任何参数或环境，覆盖带凭据的远端、模型密钥与验证器机密。pre-push 参数中的 URL 是规则的例外：macOS 上带凭据的远端不会走到推送（R32-D15-01 第 4 项）。<br>• §11.7：“模型凭据”行改为 `setRuntimeApiKey` / `InMemoryCredentialStore`，只在 Host 内存中，RPC（M2）用 0600 的 `auth.json`；文中没有 `AuthStorage.inMemory()`。“验证器注入”行改为默认 `secretsVia: "file"`（`<NAME>_FILE` 指向 0600 文件），`env` 须显式声明并标注；`secrets.access` 的审批卡片写明“可能被读到”；精确匹配说明同步。<br>• **T33** 改为 macOS S2 中、Linux S2 低、S0 高，并列出残余类别；新增 **T33b**（`secretsVia: "env"`，macOS S2 为中）。<br>• Run 令牌段补上平台二进制的事实。 | `11` |
| R32-D11-01（`10`） | • §10.1.2 的前提改为如实表述。“闸门失败时的预案”改为“带凭据的远端”，是 macOS 的默认行为。<br>• **凭据判定**的唯一定义写在 `10`：userinfo 含 `:` 视为凭据；只有用户名时，匹配 token 前缀、`x-access-token` 或长度 ≥ 20 的高熵串，也视为凭据。<br>• 命中时记 Fact `remote_credential_blocked{remote}`，“重试”为 `project.remote.recheck`。<br>• 残余按 T33 的新评级写明。<br>• 步骤 2a 中 C29 一句改为引用 C29(b)，并写明“其他进程能否观察取决于 A12(a) 的测量”（R32-D15-01 第 1 项）。 | `10` |
| R32-D6-01 / ADR-158 | §10.3.1“后台进程的识别”：<br>• 写明 macOS 平台事实；<br>• settle 等扫描按**进程树（`proc_listchildpids`）与令牌的并集**进行，发信号前对两类进程分别确认；<br>• “读到空环境”视为无法确认；<br>• 脱离进程树的平台二进制是登记的窗口，其后的写入按来源不明处理，登记为已知误判 (d)；<br>• “`setsid`、双重 fork 不影响识别”限定为环境可读的进程。<br>settle 第 3 步同步；`11` Run 令牌段同步。 | `10` `11` |
| R32-D13-01 / ADR-158 及补记 | `baseTip`：<br>• **分叉时不自动选择**，`baseCommit` 不变，记 `base_diverged{tower, user, towerFetchedAt, userObservedAt}`，带“使用远端”“使用本地”两个动作；<br>• `goal.base.choose{side: "remote" \| "local"}` 按补记只改观测基准，记事件 `goal.base.chosen`，不改 `baseCommit`、不重新验证；M2 中所选一侧是后代时按普通前进处理；<br>• 变化但不是前进时记 `base_unchanged_nonancestor{from, to}`；<br>• 进入 `in_review` 前的获取不阻塞，最多等 10 s；<br>• 卡片后两个获取时机都用 `goal.base.check`（远程客户端同样计入），同一 Goal 的并发请求合并为一次；<br>• 提示的生命周期：只显示最新一条，`integrated`、`archived`、`abandoned` 后不再显示（R32-D4-01）。 | `10` |
| R32-D13-02 / ADR-158（M2） | 推送失败时记 Fact `push_failed{stage, exitCode?}`，队列条目进入 `awaiting_push`，**不占用**该 base 的 FIFO，“重试推送”只对该条目重做推送。`MergeQueueEntry.state` 加入 `awaiting_push`；§10.12 推送行同步。 | `10` `16` |
| R32-D15-01（`13`） | §13 后台任务表拆成两行：M1 远端 base fetch（四个时机、`in_review` 前最多 10 s、合并请求）与 M2 的 5 分钟轮询。settle 终止的预算改为进程树与令牌的并集。 | `13` |
| `16` | • `Fact.kind` 增至 31 种：`base_unchanged_nonancestor`、`remote_credential_blocked`、`push_failed`；`base_diverged` 的数据同步。<br>• 新增行：<br>&nbsp;&nbsp;– 事件 `goal.base.chosen`；<br>&nbsp;&nbsp;– exec 标准的 `secretsVia`（默认 `file`）；<br>&nbsp;&nbsp;– “远端 URL 的凭据判定”（唯一定义指向 `10`）。<br>• §16.5 加三行：`goal.base.check`、`goal.base.choose`、`project.remote.recheck`，都是 `decide`、允许远程，并写明理由。<br>• `MergeQueueEntry.state` 加 `awaiting_push`。<br>• 网络命令行、`baseTip` 行与 `integration` 条目同步。<br>• 废弃表新增五行：ADR-157 在 macOS 上的说法；分叉取较新一方；“保持待推送”；令牌识别的旧断言；验证器机密默认环境注入与模型密钥经环境。 | `16` |
| 用例（R32-D14-01） | • **M0 退出标准**：A12(a)“已运行并记录结论”，不要求通过。<br>• **A12**：(a) 改为测量，不以 `ps` 作判据；(b) 按 macOS 的默认拒绝改写期望。<br>• **G43(j)**、**G44(d)** 分别写 macOS 与 Linux（M2）的期望；G44(d) 加一组不带凭据的 `insteadOf`。<br>• **G44(e)**：失败组改为 `awaiting_push`，同 base 的后续条目照常推进，并记 `push_failed`。<br>• **G35** 加三组：shell 循环脱离进程树、`nohup /bin/sleep`、仍在进程树中的循环被终止。<br>• **G45** 重写：<br>&nbsp;&nbsp;– (a) 带 token 的远端被拒绝；<br>&nbsp;&nbsp;– (c) 加入强制推送前已 fetch 的情形，以及“使用远端/使用本地”与 `base_unchanged_nonancestor`；<br>&nbsp;&nbsp;– (d) 加入远端挂起时不阻塞进入 `in_review`；<br>&nbsp;&nbsp;– (f) 加入 token 在用户名位置与 `x-access-token`。<br>• **新增 G46**：模型密钥不在 Host 环境中；文件注入的验证器机密不在环境中；`secretsVia: "env"` 的标注。 | `14` |

**本轮工作量与 M1：+0.23 人周（WBS 120.96），M1 维持 38 周。**

| 来源 | 估计（人周） | 计入的 WBS 行与承担线 |
|---|---|---|
| 05/06 | +0.10 | W7-core +0.05（系统）；W4 +0.03，05/06 记为系统，按 W4 的主责计入桌面；W10 +0.02（安全） |
| 07 | +0.05 | W9，`07` 记为系统，按 W9 的主责计入 Agent |
| 04/12 | +0.02 | W11，桌面 |
| 本文：`11` | W10 取较大者 0.03（多出 +0.01） | 与 05/06 的 W10 是同一行 |
| 本文：SP6b 用例 | +0.05 | G35 的 ADR-158 组、G45 改写、G46，用 Agent 线的余量 |
| `13` | 0 | 只是措辞修正 |

合计在评审估计的 0.2–0.35 人周之内。M2 的 `awaiting_push` 与 G44(e) 的新期望不计入。

**各线余量**（缓冲外，工作周）：

| 线 | 余量 |
|---|---|
| 系统 | 0.31 |
| Agent | 1.02 |
| 桌面 | 1.05 |
| 设计 | 1.05 |
| 安全 | 0.8 |

**日程不变**：
- 第 34 周末冻结（2027-07-02）。
- 增人备选仍为 33 周（T ≥ 23.39），新人承担约 2.4 人周安全线工作。
- SP6b 补跑现值为 4.71 人周。
- ADR-133 的第 32 轮补记已写入 `15`，`16` 的 M1 行已更新。

**lint**（`--checks rstuvwxyzckdnSeRq`）全部通过，退出码 0。

**主干需要处理**：
1. **Goal 准备时的分叉**：补记只定义了已有 `baseCommit` 时的 `goal.base.choose`，没有说准备时（还没有 `baseCommit`）分叉怎么办。`10` 暂定取用户检出一侧，即用户在自己检出中看到的 `<r>/<b>`，同样记 `base_diverged` 并显示两个动作。请确认。
2. **`in_review` 前获取失败的 Fact**：ADR-158 写“失败或超时记 Fact”，但没有登记 kind。`10` 暂时只在卡片的上次获取时间旁标注获取失败，原因进诊断日志。若需要 Fact，建议在 `02` 登记 `base_fetch_failed{remote, error}`，同时覆盖 `04` 的 `◇ 无法获取远端 base`（R32-D4-01 第 1 项）。
3. **云 SDK 凭据链**：ADR-049 透传到 Host 环境的云凭据，在 macOS 上仍可被同一用户的其他进程读到。ADR-158 只说模型提供商密钥不进入环境。我在 T33 中把它列为残余，等级为中。是否另作规定，例如只透传 `AWS_PROFILE` 这类指向文件的变量、不透传原始密钥？
4. **W4 与 W9 的承担线**：05/06 与 `07` 把这两项记为系统线。我按 WBS 行的主责计入了桌面线（W4）与 Agent 线（W9），系统线余量因此仍有 0.31。若主干要求按各作者标注的系统线计入，系统线余量会降到约 0.22。

## 补充：ADR-158 补记 2 的落实

| 条目 | 处理 | 位置 |
|---|---|---|
| 1. 准备时分叉 | `10` 与 `16` 注明这一规则已由补记 2 确认：取用户本地一侧，记 `base_diverged`，显示两个按钮。 | `10` §10.1.2；`16` |
| 2. `base_fetch_failed{remote, error}` | `10`：任何时机的获取失败或超时都记它，包括步骤 1、进入 `in_review` 前与 `goal.base.check`；卡片据此显示“无法获取远端 base”。`16` 的 `Fact.kind` 增至 32 种。G45(d) 的“远端挂起”一组期望记这一 Fact。 | `10` `16` `14` |
| 3. 云 SDK 凭据 | `11` §11.7：<br>• “云 SDK 凭据链”行改为只传指向文件的变量，即 `AWS_PROFILE`/`AWS_SHARED_CREDENTIALS_FILE`/`AWS_CONFIG_FILE`、`GOOGLE_APPLICATION_CREDENTIALS`、`AZURE_CONFIG_DIR` 等；<br>• 原始密钥变量从不传入，只有原始变量时写入 Tower 数据目录下的 0600 凭据文件并传路径；<br>• 连带后果改为“MCP 服务器与用户扩展继承的是文件路径”，它们不在 Agent 沙箱中，可以读取该文件，这一点仍按 T28 登记；<br>• “Engine Host 环境”行同步。<br>T33 中这一残余关闭，缓解列表加入这一条。`16` 新增“云 SDK 凭据传入 Host”规则行与一条废弃行。新增 **G46(d)**：只有原始变量时，Host 环境中没有密钥，只有 0600 文件路径；只有 `AWS_PROFILE` 时原样传入。 | `11` `16` `14` |
| 4. 工时归属 | 已按补记 2 采纳 WBS 行的主责线，排期数字不变。 | — |

本补充的工时可忽略，已在 `15` 的第 32 轮补记（ADR-133 附）中注明，数字不变。**lint**（`--checks rstuvwxyzckdnSeRq`）全部通过，退出码 0。本轮没有遗留的主干需求。
