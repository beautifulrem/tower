# 第 3 轮评审回应 · `05` 与 `06`

- ADR-060 / R3-D6-01 → `05` §5.3.6（删除 `GIT_OBJECT_DIRECTORY` 与 alternates 环境变量；Tower 的 git 一律经 GitRunner，`--git-dir=<影子>` + `--work-tree=<卫星>` + 加固的 `-c`、`GIT_CONFIG_NOSYSTEM`/`GIT_CONFIG_GLOBAL`）、§5.6.1 `shadowGitDir`、§5.6.2(c) submit 指纹用全新临时索引、§5.6.5 检查点经影子目录；`06` GitService/GitRunner 行、bindings 表（`attach_common_dir`、`satellite`、`shadow_git_dir`）、§6.6.1 目录布局（`goals/<G>/git/<projectId>.git`、卫星克隆）、备份与保留规则
- ADR-065 → `05` §5.4.1（不冻结；只做哈希比对；RPC 只在没有拦截型扩展、也没有 bash 覆盖时可用；每次 `tool_call` 复核 bash 来源）、gate 第 5–7 条、C30 改写（含扩展工具在 `execute` 中修改参数的情形）、D47
- ADR-066 → `05` §5.3.5（`commandPrefix`/`shellPath` 取自用户设置、`exposeSessionEnvironment:true`、spawnHook 保留 `PI_*`、SDK 自检定位为回归保护、静态清单检测 bash 覆盖并在卡片上提示被取代）；C28 拆为 C28a/C28b；D50/D51 登记 `!cmd`、RPC `bash` 命令、`pi.exec` 为沙箱外执行路径；C31
- ADR-067 → `05` §5.3.6 代理行（S2 下为链式代理）
- ADR-063 / ADR-061 / ADR-064 → `05` §5.3.6 包管理器行（引用 `16` §16.8，按主版本生成配置，V 角色只读 `$VS`）
- ADR-068 → `05` §5.6.5 gate 的 S0 步骤（运行阶段 ask，不暂停）；`06` §6.2.3（验证阶段由 `decide()` 转为 `s0_grant_pending`，拒绝授权时以“未经机器验证”进入评审）
- R3-D4-03 → `05` §5.5 settle 判定：“有效 submit + 阻断条目”只在 abort 或 Pi 侧超时后出现，进入 `paused(question_timeout)`，并记录 `timedOutAt`；`06` needs_you 表增加 `timed_out_at`
- R3-D4-05 → `06` §6.1.4 第 5 条：`provider_unavailable` 自动恢复（探测从 60 s 指数退避到 10 min，不计费）
- R3-D2-02 → `05` 全文统一写作“1.2.0（精确）”，并说明阅读的源码 HEAD 与发布版之间的关系
- R3-D15-01（06 部分）→ 第 1 项：`projects.root_aliases` 与 `canonical_root` 固定的说明；第 2 项：§6.2.4 验证并发与机会式验证条件按 ADR-042 重写；第 3 项：F20 按 ADR-054 判别；第 4 项：§6.2.5 `usdHard` → `budget_hard_cap`；第 14 项：C28 拆分；第 15 项：`05` §5.0

## 需要主干处理
1. `16` §16.1.1：`autoResume=true` 的集合加入 `provider_unavailable`（与 `03` §3.2.1、`06` §6.1.4 一致）。
2. `10`：`ensureWorktree` 等命名与 linked worktree 相关的描述，按 ADR-060 改为卫星克隆（`06` 仍沿用 `ensureWorktree` 这个函数名，指“确保卫星存在”）。
3. `11`：T16 子项（沙箱外执行路径 D50/D51）；§11.4 中 RPC 的描述按 ADR-065 改写（不冻结，只在没有拦截型扩展时可用）。
