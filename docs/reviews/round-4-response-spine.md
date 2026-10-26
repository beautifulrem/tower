# 第 4 轮回应 · 主干（00–03、15、16、01、README）与跨文档决策

跨文档决策：`15` ADR-071 – ADR-080（ADR-060/067/068/069 标注 Amended by）。

| 条目 | 处理 |
|---|---|
| R4-D11-01 嵌套仓库/子模块逃逸（阻断） | ADR-071：影子索引永不含 gitlink（自有文件遍历 + pathspec 排除）；嵌套仓库 = severity 3 哨兵；子模块 M1 未支持；GitRunner 在“只允许执行 git”的 OS 沙箱中运行 |
| R4-D11-02 卫星 `.git` 配置被沙箱外 git 执行（阻断） | ADR-072：卫星控制文件 Tower 所有、S2 写拒绝；交接前与 settle 时校验恢复；Host 派生进程注入 `GIT_CONFIG_*` 加固 |
| R4-D13-01 对象借用 | ADR-073：每 Project 的 Tower 镜像库，永不 prune；删除用户仓库 base 保活 ref |
| R4-D13-02/03/04 LFS、部分/浅克隆、卫星远端 | ADR-074 |
| R4-D10-01 决定性指纹耗时 | ADR-075 |
| R4-D4-01 worktree_missing 三义 | ADR-076：`satellite_missing` + `resumeTo`；`02`/`03`/`16` 同步 |
| R4-D4-02 in_review 出口与 S0 状态模型 | ADR-077；`03` in_review/accepted 行补 `retry_verify`/`grant_s0_exec`；`02` `Goal.s0Grant`、`deny_s0_exec` |
| R4-D4-03 应用退出时的验证 | `03`：verifying 不进入 `app_quit`/`engine_crash`；取消并保持 verifying，重启后同一 pin 重跑 |
| R4-D8-01/02 人工检验与本地文件 | ADR-078 |
| R4-D11-03 代理机制 | ADR-079（T30） |
| R4-D12-01 monorepo 自动合并 | ADR-080；`02` §2.3 |
| R4-D2-02 “照常生效”承诺 | README 与 `00` §0.5 加限定；新增 `00` §0.5.1 能力差异表 |
| R4-D3-01 ADR-056 不一致 | ADR-056 正文按 ADR-070 与行为指标重写；状态说明（商业假设 Proposed，判定可审计部分 ADR-070 Accepted）；`01` §1.7.5 同步 |
| R4-D16-01 重放包 | ADR-070 增加重放包规格、保留、隐私、命令；`16` §16.1.12 登记 |
| R4-D15-02 #3 人就地编辑提交位置 | ADR-036 按 ADR-060 改写（Tower 不替人提交，seal 带 trailer）；`02` 注释同步 |
| R4-D15-02 #4/#6/#10/#12 | `02` budget_capped 语义、`03` in_review 定义与重建来源、`16` Mode 表、ADR-063 A 副本口径统一为“净化副本，合同显式授予时写入单个令牌” |

## round-4 lint 未决项裁决（`round-4-lint.md`）

| # | 裁决 |
|---|---|
| U1 | 应用退出时正在验证：取消验证、Goal **保持 `verifying`** 并记录 `pendingVerify`，启动时以同一 pin 重跑（`03` §3.2.1 为准，`06` §6.1.4、§6.1.6 已同步） |
| U2 | 新增 `HumanDecision.kind = "reject_memory"`（`02`、`06` 命令表、`09` §9.3.2、`16`） |
| 其他 | ADR-038：M1 = 29 个日历周；ADR-060 第 7 点：seal 分支 `<branchPrefix>/<goalId>-<slug>`；`02` `Project.branchPrefix`、`keepAuditLandmarks`；`attach` 含义改写 |
