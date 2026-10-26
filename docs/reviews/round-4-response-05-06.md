# 第 4 轮评审回应 · `05` 与 `06`

- R4-D2-01 → `05` §5.3.5：v1.2.0 中，传入 `operations` 时 `shellPath` 被忽略（`bash.ts:248`），所以 `sandboxedOps` 由 Tower 用 `getShellConfig(shellPath)` 自行构造；C28a、D38
- R4-D2-03 → `05` §5.3.5：tower-goal 注册 `user_bash`，在 S2 下返回 `{operations: sandboxedOps}`（已在 v1.2.0 核实 `types.ts:1465-1476`、`rpc-mode.ts:561-582`），`!cmd` 与 RPC `bash` 都在沙箱中运行；仍在沙箱外的路径只剩 `pi.exec` 和 MCP；C31、D50、D51
- R4-D4-02（05/06 部分）→ `06` goals 表新增 `s0_grant`，命令表新增 `s0.grant`/`s0.deny`、`goal.retry_verify`（ADR-077）
- R4-D4-03 → `06` §6.1.4：验证中的 Goal 在退出时取消验证，暂停为 `app_quit`，`resumeTo=verifying`，下次启动以同一 pin 重新验证、不开 Run；Host 崩溃不影响验证；§6.1.6 verifying 行
- R4-D4-04 → `05` §5.5：abort 的原因决定 pauseReason（`question_timeout` 只用于 Pi 侧兜底超时），并新增 pauseReason 优先级表（建议登记到 `16`）
- R4-D5-01 → `05` §5.6.5 gate 第 7 条：只对内置工具和 Tower 的沙箱 bash 做比对（gate 时保存深拷贝与哈希）；扩展工具和 MCP 工具在 `execute` 中修改参数是允许的；C22、C30(b)
- R4-D5-02 → `05` §5.4.1：RPC 只能依赖静态扫描；内置扩展白名单 `{builtin:mcp: 1.2.0}`（`mcp/index.ts:1191` 只读输入）；C30(d)
- R4-D5-03 → `05` §5.3.5：RPC 的每次复核定位为回归保护；C28b 改为用桩模拟优先级变化
- R4-D5-04 → `05` §5.3.5：RPC 从 `pi.getSettings()` 读取 `shellPath`/`shellCommandPrefix`；SDK 的 runtime 工厂在每次 newSession/fork 时重新传入 `customTools`；C28a 覆盖 fork 之后的会话
- R4-D6-01 → `06` §6.6.1、§6.6.4：base 保活 ref 已删除（ADR-073）；删除卫星的前提改为“最后一个检查点已写入影子”；影子 gc 持有 `wtLock` 并只 prune 两周之前的对象；影子与镜像必须一起恢复（删除“唯一副本”的说法）；重放包加入目录布局与保留表
- R4-D13-01（06 部分）→ `06` §6.6.1、§6.6.4：镜像库 `projects/<projectId>/mirror.git`（加入布局、备份与保留规则）；alternates 指向镜像
- R4-D13-08 → `06` §6.6.4：检查点、pin、`base-snapshot` 只保存在影子中；用户仓库只在集成时得到 `refs/heads/tower/<goalId>`，宽限期结束后删除
- R4-D15-01 → `06` §6.4.3：补齐命令（`retry_verify`/`retry_claim`/`claim_on_behalf`/`start_now`/`s0.grant`/`s0.deny`/`quarantine`/`approve_docker`/`project.merge`/`project.split`/`resolve_sync_conflict`/`quick_ratify`），`goal.resume` 按 pauseReason 与 `resumeTo` 分派，并加入与 `HumanDecision.kind` 的完整性 lint
- R4-D15-02（05/06 部分）→ 第 1 项：`ensureWorktree` 改为 `ensureSatellite`，`05` 中的 “worktree” 改为“卫星”；第 2 项：`--approve` 的判定改用 GitRunner 在影子上下文中执行；第 4 项：`06` §6.2.5 `budget_hard_cap` 的出口
- R4-D16-01（06 部分）→ `06` §6.6.4：重放包的内容、体积、保留期、隐私与“不可重放”行为；属于开源核心
- ADR-071 → `05` §5.6.5 检查点（扫描嵌套 `.git` 并排除）；`06` GitRunner 行（只允许执行 git 的沙箱档位）
- ADR-072 → `05` §5.3.6 `GIT_CONFIG_COUNT` 行、§5.5 settle 时的控制文件校验；`06` GitRunner 行
- ADR-073 → `05` §5.3.6 git 行；`06` 目录布局、备份与保留规则
- ADR-075 → `06` §6.2.3 I2 行（文件系统事件驱动的 stat 检查，完整重哈希只在验收与 seal 时执行）
- ADR-076 → `05`/`06` 统一改名为 `satellite_missing`；`06` 新增 `resume_to` 列、§6.1.6 重建行、F14
- ADR-077 → `06` `s0_grant` 列、`s0.grant`/`s0.deny` 命令
- ADR-079 → `05` §5.3.6 代理行（Host/Supervisor 直接使用用户代理；沙箱代理使用 parentProxy、PAC 单上游、只支持 Basic 认证）

## 需要主干处理
1. `02` `HumanDecision.kind` 加入 `deny_s0_exec`，以及拆分 Project 的决定（例如 `split_project`）；`Goal` 加入 `resumeTo`。
2. `16` §16.1.1 登记 pauseReason 优先级表（`05` §5.5）与 `alsoApplies` 语义；更新内置扩展白名单的登记位置。
3. `10` §10.2、§10.3.2：只有 seal 进入用户仓库（`refs/heads/tower/<goalId>`），检查点、pin、`base-snapshot` 只在影子中；与 `06` §6.6.4 对齐。
