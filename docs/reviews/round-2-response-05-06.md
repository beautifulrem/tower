# 第 2 轮评审回应 · `05` 与 `06`

- R2-D2-01 → `05` §5.0 新增“发布版”一行；§5.11.1 新增“发布版核实”列（依据 `research/pi-release-diff.md`，`agent-session.ts` 行号 +≤5），SP2 用 tarball 做最终确认
- R2-D2-03 → `05` §5.11.1 新增 D38–D49：`createBashToolDefinition` 的 operations/spawnHook、同名工具优先级（customTools 最后写入）、`forkFrom`/`createBranchedSession`/`listAll`、`parseSessionEntries`、RPC `get_messages`、`registerProvider`、`tool_call` 的 `ctx.signal`、`PI_CODING_AGENT_DIR`、`noExtensions` 的副作用、深度冻结兼容性、`--session-id` 的语义、entry id 的作用域；§5.3.5 修正 `noExtensions` 的注释；新增 C28（`C-tool-precedence`）、C29、C30
- R2-D2-04 → `05` §5.3.6 改写：Host 环境与 bash 环境分开（spawnHook 剥离只属于 Host 的变量）、代理透传、凭据按 ADR-049 的类别处理、包管理器环境变量引用 `16` 的唯一表；RPC 经 `ctx.ui.input` + `registerProvider` 传递凭据（C29 评估）
- R2-D2-05 → `05` §5.0 估算口径；C15 改为工具 ≤ 350、系统段 ≤ 250；§5.6.3 的基线论证改为“纯增量，由 E5 的成本比与成功率裁决”（ADR-048）
- R2-D4-03 → `05` §5.5 新增“settle 判定”表（I4 的阻断范围、settle 时的处理、`question_timeout`）；`06` §6.2.3 I4 行
- R2-D5-01 → `05` §5.3.5：SDK 的沙箱 bash 走 `customTools`，RPC 由 tower-goal 注册；两种适配器都做 `sourceInfo` 自检，不符时降为 S0；C28
- R2-D5-02 → `05` §5.6.5 `session_compact` 改用 `triggerTurn:false`；C17 断言没有额外的 `agent_start`
- R2-D5-03 → `05` §5.4.1（深度冻结、RPC 的适用范围）、gate 第 5–7 条（`approvedInput` 按 turn 清理并设 10 min TTL）、`tool_result` 改为写带外的 `tower.obs` 条目；C30
- R2-D5-04 → `05` §5.5 `agent_settled` 行：`claimed`/`verifying` 期间持续监视、如实归因、1 小时内第 2 次的规则；`06` §6.2.3 I4 行
- R2-D5-05 → `05` §5.2.2 规则 7（Observer 合并 start、end 和 obs）、§5.3.2（`switchSession` 支持 `cwdOverride`）、§5.4.4（`--session-id` 是打开或创建）、§5.6.2(b)（引用 Pi 条目时带 `sessionId`）；`06` claims/checkpoints 增加 `session_id`；ADR-024 的引用已经是 §5.4.1
- R2-D6-01 → `06` §6.3 删除守护触发器加入 `abandoned`，新增 `goals.abandoned_at`；§6.6.4 保留规则同步（ADR-057）
- R2-D10-01 → `06` §6.1.1：只引用 `16` 中的唯一规则（RSS p95 > 120 MB → 打包模式，K = 4）
- R2-D11-01 → `05` §5.10：确认之前只生成静态清单（路径、内容哈希、源码文本扫描），不加载任何代码；RPC 使用同一份清单
- R2-D15-01（05/06 部分）→ `05` §5.5 `message_end` 行的 acknowledged 措辞；§5.0 估算口径；C15
- R2-D15-02（05/06 部分）→ S0 授权类名改为 `exec.test|exec.build`；`scriptIndex` 改名为 `scriptDigest`；`pause_reason` 增加 `question_timeout`、`budget_hard_cap`、`external_change`、`provider_unavailable`；verifier 的 verdict 引用 `16`（含 `resource_exceeded`，ADR-054）
- ADR-044 / ADR-045 / ADR-055 → `05` §5.3.6 环境表；`06` §6.2.4（端口段 20000–29999、环境拼装）、GitService 行（私有对象回迁与 fsck）

## 需要主干处理

1. `02` §2.4 `pauseReason` 枚举应加入 `post_settle_activity`（ADR-025 使用）；与 `06` DDL 的完整集合对齐：`question_timeout`、`budget_hard_cap`、`external_change`、`provider_unavailable`、`verify_env_error`、`s0_grant_pending`。
2. `02` §2.2 `Provenance` 与 `EvidenceRef{type:"trace"}` 应增加 `sessionId`（entry id 只在会话文件内唯一）。
3. `02` §2.4 `Goal` 应增加 `abandonedAt`（ADR-057 的保留规则要用到）。
4. `16` 应登记：S0 授权类名、`scriptDigest`、Host 回退规则（120 MB / K = 4）、包管理器环境变量表（ADR-045），供 `05`/`06` 引用。
5. `11` 应同步 `05` §5.3.6 的残余风险：其他扩展派生的子进程（例如 MCP 服务器）仍继承 Host 环境，包括云 SDK 凭据。
