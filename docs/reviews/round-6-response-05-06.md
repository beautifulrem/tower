# 第 6 轮评审回应：`05`、`06`

以 ADR-089..095 为准。每条一行：条目 → 修订位置。

- R6-D2-01（技能不可用）→ `05` §5.3.6 新增“S2 读允许列表”行（ADR-091：Pi 资源目录、`.pi`/`.agents`、祖先上下文文件；`read.pi_resources` silent；技能脚本在沙箱执行）；§5.10 “Adapt Pi to your workflows”行改写并引 `core/skills.ts:368-381`（v1.2.0 已核实）；§5.10 `skills/contextFiles` 行补充未跟踪 `AGENTS.md` 经本地文件清单复制。
- R6-D4-01（a）take_over/hand_back → `06` §6.4.3 拆为 `goal.take_over`（源状态 running(drain)/paused(*)/in_review/accepted，记 `take_over_from`、`human_checkout`，IDE 信任提示 T31）与 `goal.hand_back{mode:"agent"|"verify"}`（running 或 verifying(`human_change`)，失败不自动返工）；`05` §5.8 “人接管与交还”行同步。
- R6-D4-01（b）人工编辑检出持久化 → `06` §6.3 `goals.human_checkout`（`{path, baseTree, createdAt}`，与 `02` 一致）、`take_over_from` 两列 + CHECK；`goal.resume` 前置守卫 `E_STATE`；§6.1.6 新增“人工编辑检出”重启恢复行。
- R6-D4-01（c）重建失败 → `06` §6.1.6 卫星丢失行、F14：从任意非终态进入 `paused`，`resumeTo={state:升级前状态}`，按优先级与 `alsoApplies` 合并，成功后的返回规则（ADR-094）；`05` §5.5 优先级段同步并补 `satellite_missing` 位次（与 `16` 一致）。
- R6-D4-01（d）`resume_to` CHECK 冲突 → `06` §6.3：被更高原因覆盖时 `satellite_missing` 迁入 `also_applies`，`resume_to` 保留；CHECK 改为 `pause_reason='satellite_missing' OR instr(also_applies,'"satellite_missing"')>0`。另：卫星丢失/重建中拒绝 `take_over`。
- R6-D4-02（`goal.resume` 分派）→ `06` §6.4.3 `goal.resume` 行重写：以 `03` §3.2.1 出口为唯一来源逐原因列出（`verify_failed_limit` 允许 resume；`verify_env_error`/`s0_grant_pending`/`sentinel_high`/`human_change_verify_failed`/未扩预算的 `budget_hard_cap` → `E_STATE` 并提示对应命令），并注明 lint 检查项。
- R6-D6-01 / R6-D16-01（重放保留）→ `06` §6.6.4 重放包行（ADR-095：仅决定性验证永久保留并写保留 ref，其余归档后 30 天；不可重放的诚实说明；计入 `13` 预算）、镜像库行。
- R6-D7-01/02/03（安装器）→ `06` §6.2 VerifierScheduler 行（拉取 → 预取 → 离线安装到 staging → Supervisor 校验发布，`runner_patched`）；§6.3 新表 `depcache_entries`（发布记录、注册表 tarball 运行器基准）；§6.1.6 安装器恢复行改为 staging/发布记录口径；§6.6.1 `$VS` 注释。
- R6-D11-01（Tower 原始文件操作被劫持）→ `05` §5.3.6 git 行、`06` §6.2 GitService 行、§6.1.6 卫星丢失行、take_over/hand_back 行：`openat`/`O_NOFOLLOW`、只接受普通文件与目录、超时、旁路目录 + 原子 `rename`；提交说明以沙箱化只读 `git log` 获取（ADR-089）。
- R6-D13-01（gitdir 白名单）→ `05` §5.3.6 git 行改为 gitdir 整体归 Agent + 两条不变式（ADR-089）；§5.5 settle 行删除控制文件哈希校验与 `git_control_tampered`，只保留 S0 `.git` 扫描 → `nested_repo`；GIT_CONFIG 注入行标注“非安全边界”；`06` GitService 行与 §6.6.1 `_gitdirs` 注释同步。
- R6-D13-02（垫片泄漏 `GIT_DIR`）→ `05` §5.3.6 “git 发现与垫片”行：继承值的剥离规则、只有 `--work-tree` 的行为、Agent 侧 `GIT_CEILING_DIRECTORIES`、绝对路径 git 的已知限制、仓库内 `git init` 夹具失败（ADR-090）。
- R6-D15-01 第 4 项 → `06` `criterion.check_human` 行补全参数；第 5 项 → `06` GitService 行删除“镜像从不 prune”、§6.6.4 镜像库行补 `refs/tower-live/*`、保留 ref 统一指向 pin；第 6 项 → `06` §6.1.6 `rebasing` 恢复行改为影子 `merge-tree` + 安全检查点；第 3 项 → `06` 已含 `claim_on_behalf`，无需改；第 10 项同 R6-D4-02。

## 需要主干处理

- `00` §0.5.1：登记“S2 下仓库目录树内 `git init` 夹具失败”“技能在沙箱内运行（写入与网络受限）”“绝对路径 git 继承变量的已知限制”。
- `16`：`git_control_tampered` 标记退役；HumanDecision `hand_back` 的 `mode` 参数；`goal.resume` 分派与 lint 检查“命令分派 ↔ `03` §3.2.1 出口”。
- `03` §3.2.1：`human` 行可补“卫星丢失或重建中不可 `take_over`”；`satellite_missing` 出口补“`alsoApplies` 非空时保持 `paused`”。
