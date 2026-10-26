# 第 3 轮回应 · 主干（00–03、15、16、01）与跨文档决策

跨文档决策：`15` ADR-060 – ADR-070；被取代或修订的 ADR 已标注（ADR-044 Superseded by ADR-060；ADR-046 冻结部分 Superseded by ADR-065；ADR-008/041/043/045/049/056/058 Amended）。实验：`research/git-isolation-experiment.md`。

| 条目 | 处理 |
|---|---|
| R3-D11-01 git 元数据逃逸（阻断） | ADR-060：Tower 只经自有影子 git 目录操作工作区（`--git-dir` 显式指定、硬化 `-c`、影子配置不定义驱动、决定性指纹用全新索引）；实验证实植入的 fsmonitor 与 clean filter 不被触发 |
| R3-D13-01 私有对象目录破坏用户仓库（阻断） | ADR-060：卫星克隆（`clone --shared`），Agent 的 git 活动限于卫星；用户仓库对 Agent 只读；进入用户仓库一律经 `fetch`（先对象后 ref）；实验证实用户仓库 `fsck`/`gc`/`log --all` 正常 |
| R3-D13-02 迁回顺序 | ADR-060 第 5 点（fetch 语义保证顺序）；`10` §10.7.1 完整序列由作者重写 |
| R3-D2-01 customTools 顶替用户 bash | ADR-066 |
| R3-D2-02 版本表述 | `00`、`01` 统一为 1.2.0（精确）；`04`、`05` 由作者同步 |
| R3-D3-01 付费检验只有陈述意愿 | 交 `14`/ADR-056 增加行为指标（作者处理） |
| R3-D4-01 s0_grant_pending 语义 | ADR-068；`03` running/verifying 行与 §3.2.1 |
| R3-D4-02 转移表缺口 | `03` running 行列出全部暂停入口；verifying 行补撤回、post_settle、人暂停、应用退出；§3.2.1 增加“入口”列；I4 登记 `claim_on_behalf` 例外；`budget_hard_cap` 增加“按当前状态送去验证”出口 |
| R3-D4-03 不可达的 settle 分支 | `03` I4：只在 abort/兜底超时后出现，进入 `paused(question_timeout)` |
| R3-D4-04 计划编译措辞 | `02` `ScopeFence.includeOrigin`（explicit > compiled > template）与编译规则 |
| R3-D4-05 autoResume 冲突 | `provider_unavailable` 自动恢复（探测退避、不计费），`03`/`16` 同步；`06` 由作者同步 |
| R3-D5-01 冻结与 Pi API 冲突 | ADR-065 |
| R3-D5-02 沙箱外执行路径 | ADR-066 最后一点 |
| R3-D7-01 验证器读 Agent 可写配置 | ADR-061 |
| R3-D7-02 生命周期脚本 | ADR-062 |
| R3-D7-03 非 Node | ADR-064 |
| R3-D7-04 env 表失效 | ADR-063 |
| R3-D8-01 question 超时条目 | `02` `NeedsYouItem.timedOutAt`（条目保持打开） |
| R3-D11-02 代理 | ADR-067 |
| R3-D12-01 根相交自动合并 | ADR-069 |
| R3-D16-01 闭源判定者 | ADR-070 |
| R3-D15-01 #13 小节标题 | `15` 第 2 轮小节标题改为 ADR-041 – ADR-059 |
| R3-D14-01 排期 | ADR-038：M1 = 26 周（冻结前缓冲、关键路径单人负荷，`14` §14.3.4）；`16` 废弃表登记 |
| 安装器令牌位置（10/11 作者提出） | ADR-063：含令牌 npmrc 只在 `~/.tower/installer/<projectId>/`（0700）；`$VS` 副本不含令牌 |
| 07 作者新增标识符 | `16`：`not_machine_verified` 原因、`stat_cache_mismatch`、`verifier_config_tampered`、`VerifyProfile.exposeGit` |

## round-3 lint 未决项裁决（`round-3-lint.md` §4）

| # | 裁决 |
|---|---|
| U1 | 验证槽位直接从影子检出 pin；pin 只在验证通过、进入 `in_review` 时 fetch 进用户仓库（供用户审计），`07`/`10` 同步 |
| U2 | pin 的父提交 = `baseCommit`（`diff base..pin` 即完整改动）；检查点链父 = 上一个检查点 |
| U3 | Agent 进程树杀进程上限 = `max(m_kill_v, 1.5 × p90_g, 2 GB)`，`m_kill_v` = 验证器杀进程上限 `max(2 GB, 2 × m_v)`；`13`/`16` 同步 |
| U5 | 确认 `contract.quick_ratify` 命令名（`06` §6.4.3） |
