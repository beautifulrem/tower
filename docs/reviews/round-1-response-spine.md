# 第 1 轮回应 · 主干（00–03、15、README、01）

逐条说明修订位置。跨文档决策见 `15` ADR-014（重写）、ADR-019（准入与撤回规则）、ADR-020 – ADR-040。

| 条目 | 处理 |
|---|---|
| R1-D1-01 Cause 无通路 | ADR-030：`log{kind:"cause"}` + Fact `symptom`；`02` Claim/Fact 枚举；Goal 页 Cause 区块（`04`） |
| R1-D1-02 运行中 Q3 | ADR-020 两轨进度 + 机会式验证 |
| R1-D1-03 Goal 列表堆积 | ADR-029 老化与“搁置”分组 |
| R1-D1-04 换机器不丢 Goal | ADR-028；`02` §2.1 改写为有意偏离 |
| R1-D2-02 MCP 默认矛盾 | ADR-032 |
| R1-D2-03 token 增幅与口径 | ADR-032（统一估算口径、相对 Pi 基线的论证） |
| R1-D2-04 未证明特性默认开 | ADR-019 准入规则 + 撤回规则；措辞检测器默认关；积压上限默认仅提示 |
| R1-D2-06 环境变量凭据 | ADR-033 |
| R1-D3-01 数据领域标注 | `01` §1.2 第 2 条 |
| R1-D3-02 默认值迁移假设 | `01` §1.6 新表 |
| R1-D3-03 执行式验证不独特 | `01` §1.7.1 逐项对比矩阵 |
| R1-D3-04 仪式感 | `03` §3.4.1：红灯先行降为提示；只用 human 标准的合法路径（ADR-031）；实验见 `14` |
| R1-D4-01 快速路径缺边 | `03` §3.2 draft → ready（`quick_ratify`）；`02` HumanDecision |
| R1-D4-02 零 exec 标准变绿 | ADR-031；`03` verifying 行 |
| R1-D4-03 artifact 无语义 | ADR-031；`02` Criterion.artifact.checks |
| R1-D4-04 subgoal_accepted | `02` Criterion 新 kind；`03` §3.5 |
| R1-D4-05 塑形失败路径 | `03` shaping 行 + `02` Goal.shapingIssue |
| R1-D4-06 中间态恢复 | `03` §3.4.6 → `06` §6.1.4 恢复表 |
| R1-D4-07 合同修订 | `03` §3.4.5 修订矩阵 |
| R1-D4-08 Project 身份 | ADR-028；`02` §2.3 |
| R1-D4-09 Needs-You 归属 | ADR-034；`02` §2.9 owner |
| R1-D4-10 枚举不全 | `02` Fact.kind / producer / track、NeedsYou.kind、HumanDecision.kind、pauseReason 补全；最终唯一来源为 `16-registry.md`（ADR-039） |
| R1-D4-11 Claim 字段无生产者 | ADR-030；`02` Claim 注释；删除 eta |
| R1-D4-12 Run↔Session 基数 | `02` §2.1、§2.6（1:N，entryRange）；ADR-001 |
| R1-D4-13 计划“编译” | `02` PlanStep.touches + 编译规则；`00` R7 |
| R1-D4-14 依赖回退 / 撤销合入 | `03` running 行、integrated 行 |
| R1-D15-01 分支提交约定 | ADR-036；`02` headCommit 注释 |
| R1-D15-02 有效评审系数 | ADR-014 重写（1.2 s/行为反点穿下限，不引用 SmartBear） |
| R1-D15-03 调速器公式 | ADR-014 重写为 WIP 上限 H = C − P − F，含演算 |
| R1-D15-07 过时的修订状态表 | ADR-039：删除，集中在 reviews/ |
| R1-D15-09 README 工具表述 | README 按阶段说明 |
| R1-D15-11 ADR 顺序与缺失 | ADR-013 归位；ADR-040 沙箱默认档位 |
| R1-D16-01 v1 差异化 | `01` §1.7.1–1.7.2 |
| R1-D16-02 积累型资产 | `01` §1.7.3 |
| R1-D16-03 上游情景 | `01` §1.7.4 |
| R1-D16-04 付费假设 | `01` §1.7.5 |

## lint 未决冲突的裁决（`round-1-lint.md` §4）

| # | 裁决 |
|---|---|
| U1 | 保留 5 s 发送前撤销窗口（`05` §5.6.4）；`04` §4.8.2/F3、`12` DecisionCard 改为“5 秒后发送 · 撤销 · 立即发送”，送达后不可撤销、只能改判 |
| U2 | ADR-025 补充：同一 Goal 1 小时内第 2 次 post-settle 活动 → `paused(post_settle_activity)` |
| U3 | `pauseReason` 新增 `question_timeout`（ADR-023） |
| U4 | `maxConcurrentGoals` 范围 1–10，M1 构建封顶 3 |
| U5 | worktree 创建失败 → stalled(L2)；依赖安装失败不阻止 Run，10 min 未恢复才 stalled(L2)（`08`、`10` 一致） |
| U6 | 回执文案：排队 / 已送达 / 已读入（seen）/ 已回应（acknowledged）/ 已处理 |
| U7 | “小额预算延长”= ≤ 当前硬上限 20% 且 ≤ US$5 |
| U8 | “本 Goal 内同类”授权可远程选择，仅限非单向门动作类，有效期 ≤ 当前 Run |
| U9 | `stalled` 子类型按 S1–S7 命名（`07` §7.7.1、`16`） |
| U10 | 确认 `snapshot_changed`、`test_config_changed`，`07` 原文同步 |
| U11 | 两个熵阈值有意不同（发现 vs 改写），注册表注明理由 |
| U12 | `~/.tower/goal-bundles/`（Goal bundle）、`~/.tower/db-backups/`（DB 备份）、`~/.tower/diag/` 均入 `06` §6.6.1 |
