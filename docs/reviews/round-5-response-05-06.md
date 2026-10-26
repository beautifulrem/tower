# 第 5 轮评审回应 · `05` 与 `06`

- R5-D2-01（05 部分）→ (b) `05` C31 改为：RPC 下 `!cmd`/RPC `bash` 经 `user_bash` 进入 S2；SDK 下 AgentSession 不发 `user_bash`（已核实 v1.2.0 只有 interactive 与 RPC 模式发，`interactive-mode.ts:7005`、`rpc-mode.ts:562`），Tower 不提供 `!cmd`，因此没有这条路径；§5.3.5 同步说明，并建议 `00` §0.5.1 的能力差异表据此改写。D39、D38 的测试引用改为 C28a/C28b
- R5-D4-01 → `05` §5.5 优先级表移除 `satellite_missing`，改为叠加态说明（ADR-084）；`06` DDL 规定 `resume_to` 只在 `satellite_missing` 时存在（CHECK 约束）；§6.1.6 卫星丢失行写明“原样恢复、不覆盖 `pendingVerify`”；`goal.pause` 在验证中保存 `pendingVerify` 而非 `resumeTo`；`alsoApplies` 删除
- R5-D4-02 → `06` goals 表新增 `pending_verify {pin, verifyFrom, trigger}` 与 `verify_from`；`goal.resume` 以 `pendingVerify` 分派
- R5-D5-01 → `05` §5.3.5：RPC 下加载期 `registerTool`，shell 与 `commandPrefix` 推迟到 `session_start` 解析（已核实 v1.2.0 `loader.ts:158, 178` 中 `getSettings` 为 `notInitialized`）；`shellPath` 按 `normalizePath` 规则展开 `~`；C28b 改为桩模拟（并断言 v1.2.0 下运行期 `registerTool(bash)` 不会取代）；D52
- R5-D5-02 → `05` §5.3.5：已核实 `pi.exec` 继承 Host 环境（`exec.ts:36-46`），MCP 默认 stdio 传输为 `{...process.env, ...env}`（`stdio.ts:94`、`runtime.ts:111-121`）；SDK 下传入 Tower 的 `createTransport`（`inheritEnv:false` + 含 `GIT_CEILING_DIRECTORIES`/`GIT_CONFIG_*`/代理、不含云凭据的基础环境）；RPC 下登记为残余风险（T28）；C21 补用例；D53
- R5-D6-01 → `06` §6.6.1、§6.6.4：重放包只引用 `07` §7.4.1（ADR-083），删除本文自己的规格
- R5-D7-03（05 部分）→ `05` §5.3.6 新增 `PATH` 行（ADR-085：显式构造，Node 版本按识别顺序取自 `$SH/tools`）；`06` 目录布局加入工具缓存
- R5-D8-02（05 部分）→ `05` §5.8：返工证据发出前经过脱敏器，精确匹配集包含本地密钥文件的值
- R5-D12-01（06 部分）→ `06` projects 表新增 `disambiguator`，`id` 的注释改为 ADR-080/087 的口径
- R5-D13-01（06 部分）→ `06` §6.6.4：镜像使用保留 ref（ADR-083）；影子与镜像的 prune 宽限期、卫星删除前提只引用 `16` §16.2.6 与 `10` §10.3.2（不再在本文写具体数字）
- R5-D15-01（05/06 部分）→ 第 1 项：`05` 中 `git_control_tampered` 为 sentinel 检测器（Fact.kind `sentinel`，与 `verifier_store_tampered`/`runner_tampered`/`lifecycle_script_changed`/`nested_repo` 同类，按协调者裁决）；`structured_content_dropped` 仍为 anomaly，以 `16` 为准；第 3 项：`06` 命令表删除重复行；第 4 项：`goal.resume` 增加守卫；第 6 项：D39 引用 C28a/C28b
- ADR-081 → `05` §5.3.6（Host 设 `GIT_CEILING_DIRECTORIES`、不设 `GIT_DIR`；沙箱 bash 经 spawnHook 设 `GIT_DIR`/`GIT_WORK_TREE`；gitdir 写入白名单）、§5.5 settle 校验、§5.8 交还行；`06` 目录布局（`_gitdirs`、`_human`）、`goal.take_over` 流程
- ADR-082 → `06` 目录布局：`_inspect` 按验证器沙箱档位执行，Agent 不可读
- ADR-083 → `06` 镜像的保留 ref 与回收规则
- ADR-085 → `05` PATH 行；`06` 工具缓存目录

## 需要主干处理
1. `00` §0.5.1：把“`!cmd` 经沙箱”改为“Tower 不提供 `!cmd`（RPC 下若使用则经 `user_bash` 进入 S2）”；补上 `llama.cpp` 在 SDK 中不可用、卫星没有远端、注入的 `core.hooksPath` 使扩展发起的提交跳过项目钩子、`GIT_CEILING_DIRECTORIES` 使依赖 git 的扩展看不到仓库这几行。
2. `11` T28：登记 RPC 下 MCP 服务器继承完整环境（包括云凭据）的残余风险。
3. `16` §16.1：把 `verifier_store_tampered`、`runner_tampered`、`lifecycle_script_changed`、`nested_repo`、`git_control_tampered` 改登记为 sentinel 检测器（协调者已裁决）；确认 `structured_content_dropped` 的类别。

- 追加：重放包路径统一为 `~/.tower/goals/<goalId>/replay/<verifyId>/`，命令 `tower verify --replay <verifyId>`，镜像保留 ref `refs/tower-retain/<goalId>/<verifyId>`（`06` §6.6.1、§6.6.4 已一致）。
