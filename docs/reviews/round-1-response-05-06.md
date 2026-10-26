# 第 1 轮评审回应 · `05` 与 `06`

一行一项：ID → 修复位置。“仍开放”项列在末尾。

## 已解决

- R1-D2-01 → `05` §5.6.5“压缩后的账本块”（删除压缩接管与 `CompactionModelOverride` 回落条件，并更正原文的误读，引用 `core/settings-schema.ts:13-26`）；文首核实声明改为指向 §5.9 陷阱表新增的“核实方式”列与 §5.11.1 依赖清单
- R1-D2-02 → `05` §5.3.1、§5.3.5、§5.10：MCP、codemode、tool_search 以 `builtin:true` 条目提供，行为与 CLI 一致，继承用户的 `mcp.json`（ADR-032）；C21
- R1-D2-03 → `05` §5.6.3：改用 `ascii/4 + nonAscii/1.5` 估算；按 ADR-030 重算 `log`；给出相对 Pi 基线的论证；C15。**另需 ADR-009 调整分项，见下方“仍开放”第 1 条**
- R1-D2-05 → `05` §5.11.1：依赖清单 D1–D37，分 A/B/C 三类，每项对应契约测试，并列出上游 PR 候选；`15` ADR-004 的 API 句改为引用该表
- R1-D2-06 → `05` §5.3.6：白名单环境；`setRuntimeApiKey` 注入凭据；首次运行检测并提示导入密钥库；RPC 模式的限制说明；C26
- R1-D5-01 → `05` §5.3.5（tower-goal 放在数组末尾）、§5.4.1、§5.6.5 gate 第 6–7 条、G32、G36；C20、C22。**RPC 下无法做到最后加载，见“仍开放”第 2 条**
- R1-D5-02 → `05` §5.6.4：对话框唯一规格（只用 `input`、`tower:` 载荷、两档超时、默认项安全规则、兜底行为）
- R1-D5-03 → `05` §5.4.2“活性探针”、G35；`06` §6.1.3；C23
- R1-D5-04 → `05` §5.5 `agent_settled` 行（2 s 宽限确认、撤回规则）、G33；`06` §6.2.3 I4；C19
- R1-D5-05 → `05` §5.6.5（不接管压缩，只在 `session_compact` 后发 `tower.ledger`）；C17 改写
- R1-D5-06 → `05` §5.6.5 `tool_result` 来源分级；`06` facts.track、Observer 行
- R1-D5-07 → `05` §5.8：尝试 = 分支，表中新增 `attempt.n` 列
- R1-D5-08 → `05` §5.6.5 nudge 条件排除 draining；C24
- R1-D5-09 → `05` §5.6.2(b)（`log` 增加 `scopeHint` 等字段）、(e)（`review_report` 为评审 Run 的唯一工具，`07` §7.12 引用）
- R1-D5-10 → `05` §5.7.3：`acknowledged` 的唯一定义是“显式引用评论 key”；`seenAtEntry` 作为附加属性；`06` comments 表
- R1-D5-11 → `05` §5.6.4“撤销窗口”：真实窗口为发送前保留的 5 s；送达后只能以转向消息改判
- R1-D5-12 → `05` §5.6.5 预筛规则：只有全部是只读白名单工具的 turn 才跳过，嵌套调用和未知工具都算“可能改动”；C25
- R1-D4-06 → `06` §6.1.6：中间状态恢复表，加上集成日志
- R1-D4-12 → `05` §5.8（基数 N:1）、G19；`06` 新增 `sessions` 表、runs 记录 `first/last_entry_id`、对账游标改为按会话。**`02` 需要同步修改，见“仍开放”第 3 条**
- R1-D6-01 → `06` §6.3：`caused_by` 等改为软引用（不设外键）
- R1-D6-02 → `06` §6.3：`events_delete_guard` 触发器加 `retention_guard` 表；每日 `audit.log_digest`；`audit.retention_purge`
- R1-D6-03 → `06` §6.1.7：安全模式能力清单（数据库完好与损坏两种情况）
- R1-D6-04 → `06` §6.1.8：Host 退出协议，以及 `host-*-unacked.jsonl`
- R1-D6-05 → `06` §6.3 说明 + §6.6.5 第 2 条：`derived:`、`timer:`、`tool:<sessionId>:<toolCallId>` 幂等键
- R1-D6-06 → `06` §6.1.9：`refs/tower/_owner` 租约锁，明确不支持多机并发；F25
- R1-D10-01 → `06` §6.1.1：内存数字标为假设，待 SP2 实测；M1 退路为打包模式；`05` §5.4.8
- R1-D11-07 → `06` §6.6.1“权限、加密与备份”
- R1-D11-08 → `05` §5.6.5 gate 第 8 条：预算好的脚本体哈希（`scriptIndex`），热路径不启动子进程，并给出测量方案
- R1-D15-05（05/06 部分）→ git ≥ 2.40；`projects.trust_*` 与 `02` §2.3 同形；I3 的 CHECK 与 DDL 一致；`facts.producer` 与 `02` 一致（`02` 已加入 git/policy/engine）
- R1-D15-06 → `05` §5.5：不再重复列出 Mode 优先级，只引用 `08` §8.6.2
- R1-D15-12 → `06` §6.2.3 I2 行加入 `accepted`（尚未 integrated）
- R1-D8-03 → `06` §6.4.7：远程验收的决定（五个条件；`high` 只能在本机桌面验收；单向门不能远程批准），远程能力矩阵引用 `16-registry`
- ADR-021 / ADR-033 / ADR-037 → `05` §5.3.6（Host 环境）；`06` §6.2.4 准入第 f 步，bindings 表的 `port_base`
- ADR-022 → `05` §5.6.5 gate 第 4 步（S0 授权）
- ADR-034 → `06` needs_you 表的 `owner_kind/owner_id` 和 kind 的 CHECK
- ADR-014（修订）→ `06` §6.2.4（H = C − P − F，默认提示模式）
- ADR-020 → `06` §6.2.4（机会式验证）；`05` §5.6.5 账本块中的两轨计数
- ADR-039 → 删除两篇文档末尾的“主干修订状态”
- 追加项（第 2 批）→ worktree 根目录改名为 `.tower-wt.noindex`（05、06）；`06` 中的 16 ms 改为按刷新率分档（`13` §13.3.1）；保留期 30 天；存储路径与验证槽位路径（§6.6.1）；准入改用 `13` §13.8.3 的整机模型；`05` §5.10 的扩展清单确认与隔离 agentDir；DDL 对齐 `02` 的新字段（`attach_checkout_path`、`verify_origin`、`facts.track`、`facts.producer`、`cross_strength`、needs_you owner）；删除 `cleanEnv`

## 仍开放（需要主干或兄弟文档处理）

1. **ADR-009 的分项需要调整**：`log` 按 ADR-030 扩充后，在 `ascii/4 + nonAscii/1.5` 口径下，running 阶段的工具部分最少为 329（已去掉单独的 guideline 并压缩了描述），超过 300。提议总量 600 不变，分项改为：工具 ≤ 350；系统段 ≤ 250，其中意图与终态 ≤ 70、标准标题 ≤ 90、记忆 ≤ 90。`05` §5.6.3 已按提议值设计。
2. **ADR-024 第 1 条的 RPC 部分与源码不符**：CLI 的 `-e` 扩展**最先**加载（`resource-loader.ts:577-578`），所以 RPC 模式下 tower-goal 做不到最后加载。建议改为：“SDK：最后加载；RPC：做不到，依靠第 2、3 条兜底，并对高风险 Goal 默认使用 pi-sdk”。
3. **`02` §2.1 与 §2.6**：Goal ↔ Session 关系表应改为“Run : Session = N:1，只有交接和 Best-of-N 才产生新文件”；`Run.sessionPath` 应改为 `sessionId`（路径放在会话记录上）。
4. **`02` §2.8 `Comment.delivery`**：建议增加可选的 `seenAtEntry` 与 `acknowledgedAtEntry`，以配合 `05` §5.7.3 的定义。
5. **兄弟文档**：
   - `04` F3（撤销窗口）、F4（acknowledged）应引用 `05` §5.6.4 和 §5.7.3；
   - `07` §7.12 应引用 `05` §5.6.2(e) 的 `review_report` 参数；
   - `10` §10.7.2 的“在 Engine Host 中执行”应改为“由 tower-goal 执行”；
   - `13` 把 `maxConcurrentRuns` 统一为 `maxConcurrentGoals`；
   - `11` §11.4 的处理器顺序说明应同步第 2 条（RPC 中 tower-goal 最先加载）；
   - `04` §4.14（手机不能验收）与 `11` §11.9 应与 `06` §6.4.7 的远程验收条件对齐，最终以 `16-registry` 为准。
