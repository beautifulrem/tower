# 第 31 轮回应 · `10` `11` `14` `16`

> 范围：ADR-157（R31 全部条目）及其补记在 `10`、`11`、`14`、`16` 中的落实。`13` 本轮没有改动。安全相关内容只写到设计层面。

| 条目 | 处理 | 位置 |
|---|---|---|
| R31-D13-01 / ADR-157（`11`） | • §11.6.2“观察其他进程”行改为**在沙箱层面拒绝**：<br>&nbsp;&nbsp;– macOS S2：Seatbelt 拒绝对非自身进程树的 `process-info*`，以及其他进程的 `kern.procargs2`/`kern.proc` 读取。自身进程树的 `ps`、`lsof` 照常可用，同由 A12(a) 核实。<br>&nbsp;&nbsp;– Linux S2（M2）：`--unshare-pid`。<br>&nbsp;&nbsp;– SP6a A12(a) 是闸门。<br>&nbsp;&nbsp;– 闸门失败时启用预案：项目级 Needs-You `integration`，去重键 `int:{projectId}:credential_url`。<br>• T33 改为“在沙箱层面关闭”：S2 闸门通过时为低，S0 为高。<br>• §11.6.4 的“git 自身的行为”与 LFS 段删去凭据改写，改为引用沙箱前提。<br>• §11.7 的精确匹配说明同步。通用 URL userinfo 模式保留。 | `11` |
| R31-D13-01 / ADR-157（`10`） | §10.1.2“Tower 的 git 网络命令”重写：<br>• **删去**：userinfo 剥离、store 文件、写出完整有效配置、`GIT_CONFIG_NOSYSTEM`、按主机改写凭据、`insteadOf` 改写。<br>• **原样**使用用户配置的远端 URL，照常 include 全局配置、读取系统配置，与用户自己的 `git fetch` 相同。<br>• **保留**：<br>&nbsp;&nbsp;– 镜像中执行；<br>&nbsp;&nbsp;– 远端名规则；<br>&nbsp;&nbsp;– `~/.tower/tmp/` 的 0600 临时配置文件，以及启动时清空；<br>&nbsp;&nbsp;– LFS 白名单与按键解析；<br>&nbsp;&nbsp;– 输出只进诊断日志与模式脱敏。<br>• 新增闸门失败预案：带密码或 token 的远端不执行网络命令；项目级卡片；LFS 缺失时进入 `prepare_failed`；用户改用 helper 后以 `actionable` 关闭。<br>• 步骤 1、2a、§10.9.3、§10.12 中的“去掉 userinfo 的 URL”“store 文件”都已改正。 | `10` |
| 保留的一项（请确认） | “用户主检出上下文中 `[include]` 带不进来的认证类值”（仓库级与按目录生效的值，按 `--show-origin` 求差集）**保留，并原样写出**。理由是 ADR-157 要求“与用户自己的 `git fetch` 完全相同”：在镜像中只 include 全局配置时，按目录的 `includeIf` 与仓库级的 helper、代理、`core.sshCommand` 都不会生效（R28 的问题会回来）。这一项不是凭据改写，所以没有列入撤回清单。 | `10` §10.1.2、步骤 2a；`16` |
| R31-D13-02 / ADR-157 | • §10.1.2 新增“远端 base 的获取时机”（M1）：Goal 准备、进入 `in_review` 之前、点“检查 base”、打开详情且距上次获取超过 10 分钟。<br>• 每次获取之后进行 base 前进检测（`base_advanced{from, to, count}`）与 `integrated` 观测；§10.9.3 与 §10.12“仅保留分支”行同步。<br>• `baseTip` 分叉时取**获取时间较新**的一方。Tower 一方的时间是 Tower 记录的获取时间；用户一方的时间是镜像观察到该值变化的时间。提示写明取的是哪一方、何时获取。<br>• 步骤 1 改为 fetch 失败时仍按 `baseTip` 比较现有的两个值（可能取到上一次获取的值），与定义一致。 | `10` |
| R31-D11-01 / ADR-157（M2） | • `--to-stdin` 自 git 2.40 起可用，删去“需要 2.42”与跳过钩子的回退。<br>• 标准输入中的远端提交取自镜像中的 `ls-remote`，分支不存在时为全零。<br>• 推送失败（钩子、网络、认证）：<br>&nbsp;&nbsp;– Needs-You `integration`（severity 2，去重键 `int:{goalId}`）；<br>&nbsp;&nbsp;– Goal 保持 `accepted`，队列条目保持“待推送”；<br>&nbsp;&nbsp;– 选项为“重试推送”与“只保留分支”。 | `10` §10.1.2、§10.12 |
| `16` | • 网络命令行（原 L474）按 ADR-157 重写。<br>• `baseTip` 行改为按获取时间取值，并补上 `base_advanced`。<br>• LFS 行的 `remote.<name>.url` 改为原样。<br>• `Fact.kind` 增至 28 种，登记 `base_advanced{from, to, count}`；`base_diverged` 的取值说明同步。<br>• `NeedsYouItem.kind` 增至 19 种，登记 `integration` 的两种 owner 与去重键（含补记的 `int:{projectId}:credential_url`）。<br>• 废弃表新增三行：凭据改写机制全部；`baseTip` 固定取 Tower 一方与 M1 只在准备时获取；2.42 前提与只记 Fact 的推送失败。 | `16` |
| 用例 | • **A12**：(a) 改为闸门（M0），覆盖对沙箱外进程的拒绝和自身进程树的可用性，不通过则启用预案；(b) 改为“另一个 Goal 的 Agent 看不到 token”。<br>• **G43(j)**：期望改为“Tower 放入的命令行与环境只有路径，Agent 观察不到其他进程”。<br>• **G44**：<br>&nbsp;&nbsp;– (a) 加入 R30 要求的第四组：补齐进行中点“继续”，不写回；<br>&nbsp;&nbsp;– (b)(c) 去掉 store 与去 userinfo 的说法；<br>&nbsp;&nbsp;– (d) 改为“带凭据的 `insteadOf`（全局一组、仓库级一组）照常生效，Agent 看不到 token”；<br>&nbsp;&nbsp;– (e) 第六组改为 git 2.40 照常运行，新增第七、八组（网络、认证失败 → `integration`），第一组补上 `ls-remote`。<br>• **G45** 重写：<br>&nbsp;&nbsp;– (a) 期望改为原样 URL、无 store、无 `NOSYSTEM`；<br>&nbsp;&nbsp;– (b) 只带用户名；<br>&nbsp;&nbsp;– (c) `baseTip` 四组，较新获取者胜；<br>&nbsp;&nbsp;– (d) 四个获取时机与 `base_advanced`；<br>&nbsp;&nbsp;– (e) 点“检查 base”后进入 `integrated`；<br>&nbsp;&nbsp;– (f) 闸门失败预案卡片；<br>&nbsp;&nbsp;– 删去原 (e) 的钥匙串排序组。<br>• M0 退出标准标注 A12(a) 为闸门。 | `14` |

**本轮工作量与 M1：−0.03 人周（WBS 120.73），M1 维持 38 周，变轻。**

| 来源 | 估计（人周） | 计入的 WBS 行与承担线 |
|---|---|---|
| 05/06 | −0.13 | W7-core −0.12（系统）；W10 −0.01（安全）。`10` 与 `11` 的同一工作不重复计入 |
| 04/12 | +0.02 | W11，桌面 |
| 本文：SP6a A12(a) 闸门核查 | +0.05 | 在 M0 中执行，工时计入安全线（W10） |
| 本文：SP6b 用例 | +0.03 | G45(c)–(f) +0.04、G44(d) 的旧组撤去 −0.01，用 Agent 线的余量；G44(a)(e) 的新组属于 M2，不计入 |

**各线余量**（缓冲外，工作周）：

| 线 | 余量 |
|---|---|
| 系统 | 0.37（上轮 0.23） |
| Agent | 1.13 |
| 桌面 | 1.10 |
| 设计 | 1.05 |
| 安全 | 0.86（上轮 0.95） |

**日程**：
- 第 34 周末冻结（2027-07-02）。
- 增人备选仍为 33 周（T ≥ 23.35）。安全线在 23.35 工作周内只能完成约 11.67 人周，新人须承担的安全线工作由约 2.3 人周升为**约 2.4 人周**；`14` 与 `16` 已同步。
- SP6b 补跑现值为 4.66 人周。
- ADR-133 的第 31 轮补记已写入 `15`，`16` 的 M1 行已更新。

**lint**（`--checks rstuvwxyzckdnSeRq`）全部通过，退出码 0。

**主干需要处理**：
1. **请确认保留项**：认证类差集保留，并原样写出（见上表第三行）。如果主干的本意是连它一起撤回，按目录的 credential helper、代理与 SSH 密钥会在镜像中失效。G43 的 (p)(q) 两条用例会因此失败。
2. **`15` L1312**（R31-D15-01 第 5 项）：ADR-156 正文中“写空值清除列表仅保留给……非凭据多值键”半句属于主干。ADR-157 撤回改写之后，`10` 中已经没有任何键需要写空值，建议删去这半句。
3. **A12(a) 闸门的工时**：闸门核查在 M0 中执行。我按协调者的要求把它计入 14，以 +0.05 人周记在安全线（W10），没有改动 M0 的算术。如果主干认为应当计入 M0 的 SP6a（6 天）之内，请告知，我会撤回这 +0.05。
