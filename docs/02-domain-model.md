# 02 · 领域模型

本文定义 Tower 的核心概念与数据结构。所有类型以 TypeScript 表达，是 Supervisor 事件日志、投影与 UI 协议的共同语言。**每个字段都标注了“谁有权写”**——这是诚实语法（R1）在数据层的落地。

写入者标记：
- 🧑 Human（人在 UI 中的动作）
- ⚙️ Harness（Supervisor / 验证器 / 观察器根据确定性来源计算）
- 🤖 Agent（模型通过 tower-goal 工具声明）
- 🔁 Derived（由其他字段纯函数推导，不存储或仅缓存）

---

## 2.1 概念总览

```
User ──owns──► Goal ──binds──► WorkspaceBinding ──► Project (仓库身份)
                │                                   └─ Checkout(path)…
                ├─ Contract v1..vN  (🧑 批准；🤖 可起草)
                ├─ Runs[] ──► Pi Session JSONL (Trace)
                ├─ Ledger
                │    ├─ Facts      ⚙️
                │    ├─ Claims     🤖 (+⚙️ 交叉校验)
                │    └─ Decisions  🧑
                ├─ ReviewUnits[]   ⚙️ 切分 + 🤖 叙述
                ├─ Comments[]      🧑 → 转向指令
                ├─ NeedsYou items  ⚙️ 产生 / 🧑 处理
                └─ Memory(goal)    🤖 提议 / 🧑 批准
Scratch ──promote──► Goal(draft)
```

关键关系的设计取舍：

| 关系 | 选择 | 理由 |
|---|---|---|
| Goal ↔ 文件夹 | Goal 绑定 **Project 身份**（规范根提交；远端只是别名，ADR-028），而非路径；执行时在 Tower 管理的 worktree 中运行 | 换文件夹、移动检出目录不丢 Goal 与记忆（P5）。跨机器：记忆可同步（`09`）；Goal 与账本 v1 只在本机，可导出/导入 `.towergoal`（ADR-028，有意偏离，见 `04` §4.20） |
| Goal ↔ Session ↔ Run | Goal : Session = 1 : N；Session : Run = 1 : N。每次运行（初次、返工、恢复、交接）是一个 Run；返工通常沿用同一会话文件（同一分支），交接或上下文过长时开新会话；回退/分叉产生会话树新分支 = 新尝试（ADR-027） | Session 降级为 Trace（P4），Goal 跨越多次运行持续存在 |
| Goal ↔ Repo | 1 : N（多仓库 Goal） | 契约测试、前后端联动 |
| Goal ↔ Goal | 父子（子 Goal 由 Agent 提议、人批准）+ 依赖（DAG，禁止环） | 分解与排序 |
| Memory ↔ Session | 无直接绑定；Memory 绑定作用域（User / Project / Goal） | P5 |

---

## 2.2 标识与通用类型

```ts
type GoalId = `G-${string}`;          // 人类可读短号，如 G-0142（单调递增，本机不复用；高水位丢失时至少不与已有目录、地标同名，ADR-199。分配规则（唯一定义，ADR-198）：取数据库中的最大编号与 ~/.tower/goal-id-hwm 中的高水位，较大者加一，该文件不存在或无法解析时视同缺失、只取数据库最大编号；跳过在该 Goal 各 Project 的 <wtRoot> 下已有同名目录（含由 Tower 改名保留的 <编号>.kept-*，10 §10.2，ADR-200/221/228）或用户仓库中已有 refs/tower/<编号>/ 的编号；高水位在 goal.created 提交之前写入，“清除全部”保留该文件（09 §9.12.4））
type ProjectId = `P-${string}`;       // 由身份哈希得出
type RunId = `R-${string}`;           // ULID
type FactId = `F-${string}`; type ClaimId = `C-${string}`; type DecisionId = `D-${string}`;
type ItemId = `N-${string}`;          // Needs-You 条目
type Iso = string;                    // ISO-8601 时间
type Sha = string;                    // git 提交哈希
type CheckpointId = { projectId: ProjectId; n: number };
type Continuation =                   // ADR-134：暂停解除后去哪里（唯一转移函数 onAllReasonsCleared() 执行；03 §3.2.1）
  | { kind: "run" }                                                     // 从 running 进入；开场载荷不在这里，见 Goal.pendingOpenings（ADR-140）
  | { kind: "settle" }                                                  // 从 settle 序列中进入（任何原因）或 retry_claim：从宽限确认起重新执行完整 settle 序列，有效提交保留，不开新 Run；Host 不存在时见 ADR-143
  | { kind: "claim"; decisionId: DecisionId }                           // claim_on_behalf：直接进入 claimed（verifyFrom=claimed，trigger claimed；失败去向按 03 §3.2.1 的归因窗口，claim_on_behalf 不移动窗口起点，ADR-144），Trace 记“人代为提交”（ADR-137）
  | { kind: "verify"; pin: Sha }                                        // 从 claimed/verifying 进入：以该 pin 验证（源状态取 Goal.verifyFrom；secretPhaseOnly 随带机密标准移到 M2，ADR-164）
  | { kind: "review"; state: "in_review" | "accepted"; pin: Sha }       // 从 in_review/accepted 进入：回到该状态
  | { kind: "verify_new"; returnTo?: "in_review" | "accepted" };     // 只由显式改写或守卫产生：以当前树生成新 pin 验证；执行时写 Goal.verifyFrom = returnTo ?? "claimed"。失败是否自动返工由归因决定（ADR-140），不由目标携带

interface Provenance {
  writer: "human" | "harness" | "agent";
  at: Iso;
  runId?: RunId;                       // 产生它的运行
  sessionId?: string;                  // Pi session id（entry id 只在单个会话文件内唯一；fork 后会保留原 id）
  piEntryId?: string;                  // 对应 Pi session 中的 entry id（8 位 hex），与 sessionId 一起定位 Trace
  toolCallId?: string;
}
```

---

## 2.3 Project（仓库身份）

```ts
interface Project {
  id: ProjectId;                       // hash(canonicalRoot)；远端只是别名（ADR-028）
  identity: {
    canonicalRoot: Sha | `provisional:${string}`;   // ⚙️ 首次绑定时 `git rev-list --max-parents=0 --all` 中字典序最小的提交，此后**固定**（ADR-058、ADR-087）；
                                                    //    浅克隆时为 provisional:<remote>
    rootAliases: Sha[];                // ⚙️ 之后新增的根（unrelated-histories、subtree add）只作为别名，不改变身份
    remotes: string[];                 // ⚙️ 规范化远端 URL 别名（去协议、去 .git、小写 host）；增删不改身份
    disambiguator?: string;            // ⚙️ 拆分出的项目才有：首次绑定时名为 origin 的远端（无则字典序最小的远端，无远端则 uuid）；进入 id 哈希、导出与同步元数据（ADR-080/087）
  };
  displayName: string;                 // 🧑 可改
  checkouts: { path: string; lastSeenAt: Iso }[];   // ⚙️ 用户在本机打开过的路径，仅作定位用
  defaultBaseRef: string;              // 🧑 默认 "origin/main"
  verifyProfile?: VerifyProfile;       // 🧑 项目级验证命令模板（见 07）
  trust: {                             // 🧑 项目信任：决定是否加载仓库内 .pi/ 的技能、提示、主题与 SYSTEM.md；项目扩展、包与 MCP 在 M1 中不论信任都不加载（见 11 §11.8.1，ADR-202）
    state: "trusted" | "untrusted";    //   默认 untrusted；首次绑定时询问
    decidedAt: Iso;
    resourcesSeen: string[];           //   决定时看到的 .pi/**、.agents/** 资源清单（哈希），变化即重新询问
  };
  worktreeRoot?: string;               // 🧑 覆盖卫星工作目录位置（默认见 ADR-008）
  branchPrefix: string;                // 🧑 seal 分支前缀，默认 "tower"
  keepAuditLandmarks: boolean;         // 🧑 归档时把地标检查点写入用户仓库 refs/tower/<goalId>/cp/<n>（只限地标，180 天后删除，10 §10.6.2），默认 false
  defaultCheckout?: string;            // 🧑 默认检出（10 §10.1.1 选择顺序 (2)；project.relocate 主动迁移时写入，06 §6.4.3）
  relocatedFrom?: { checkoutPath?: string; wtRoot: string; at: Iso }[];   // ⚙️ project.relocate 之前的旧位置，供列出、删除与清除定位；只在 <wtRoot> 确实改变时追加，按 wtRoot 去重（06 §6.4.3，ADR-237/238）
}
```

- 身份只取规范根提交：先本地建库后加远端、改远端 URL 都不改变身份；仓库无提交时先要求初始提交（Tower 提供一键操作）。
- 浅克隆：暂记 `provisional:<remote>`，一键 `git fetch --unshallow` 后升级并自动合并记录（ADR-028）。
- 非 git 目录：v1 不支持作为 Project 绑定（Scratch 可用）；见 `14` 的后续计划。
- 拆分后的归属（ADR-087）：已有 Goal 归属其绑定检出的远端所匹配的一方；项目记忆复制到双方（`origin:"copied_from_project"`，待复审）；新项目信任为 `untrusted`；VerifyProfile 复制后各自演化。
- 根提交相同**且**根集合与远端集合一致 → 同一 Project；canonicalRoot 相同但根集合或远端不一致（例如 monorepo 与其成员仓库、同一仓库的 fork）→ 绑定时由人确认“同一项目 / 新项目”，新项目身份 = `hash(canonicalRoot, 消歧键)`（ADR-080），记录 `audit.project_split`。


```ts
interface ProjectLocalFile {            // ADR-078/082/165/166：本地文件清单（06 project_local_files）
  projectId: ProjectId; path: string;
  secretBy: "name" | "content" | "user" | null;   // 机密判定来源；name 不可取消。写入者：add 时判定、每次复制前的重新判定（null 且内容命中 → content；不可读或不存在时不改写，ADR-170/171；时机唯一定义在 16 ProjectLocalFile 行）、mark_secret（非 isSecret → user；已是 isSecret 时不覆盖，ADR-171）
  approved: { decisionId: DecisionId } | null;   // 只有已批准的普通本地文件才播种（approve_local_file，ADR-168）
  unmarked: { contentHash: string; decisionId: DecisionId } | null;   // 用户取消标记（绑定内容哈希）。写入者：unmark_secret（写入）；自动恢复（内容变化且再次匹配机密模式，记事件 project.local_file_unmark_reverted，ADR-172）与 mark_secret（清除，ADR-171）；非空要求 secretBy 非空（06 CHECK，ADR-170）
}
```

---

## 2.4 Goal

```ts
type LifecycleState =
  | "draft" | "shaping" | "ready"
  | "running" | "paused"
  | "claimed" | "verifying" | "in_review"
  | "accepted" | "integrated" | "archived"
  | "abandoned";
// 详细状态机见 03-goal-lifecycle.md

type Mode =                            // ⚙️ 主要用于 running/verifying；ready 中的 Goal 可处于 queued/preparing（启动前准备）。封闭集合（R6）；推导规则见 08
  | "preparing"       // 创建 worktree / 安装依赖 / 启动 Engine Host（可能持续数分钟，不能与 queued 混淆）
  | "thinking"        // 模型正在生成（message_update 流入）
  | "acting"          // 工具执行中（tool_execution_start..end）
  | "waiting_human"   // 有未决 ask_user / 审批（extension_ui_request 未答）
  | "blocked_guard"   // 被自主度矩阵 / 范围围栏阻断且等待处理
  | "budget_capped"   // 触发软上限，正在 drain 到回合边界（Run 仍活跃）；drain 完成后 Goal 进入 paused(budget_soft_cap)，Mode 消失
  | "retrying"        // auto_retry_start..end
  | "compacting"      // compaction_start..end
  | "queued"          // 等待 Engine Host 槽位 / 依赖 / 评审余量（卡片注明原因）
  | "verifying"       // 验证器正在干净环境中执行验收标准（生命周期为 verifying 时）
  | "stalled"         // ⚙️ 进程存活，但命中任一停滞判据：N 分钟无新 Fact、或检测到循环（同一失败命令重复 / 编辑-回退振荡）、
                      //    或单个工具调用超出预期时长、或烧 token 而 diff 不变（判据 S1–S7 见 07 §7.7.1；“或”关系）
  | "unresponsive"    // ⚙️ 心跳超时（Engine Host 无响应 / 进程挂起）
  | "settled";        // agent_settled 且无待办

interface Goal {
  id: GoalId;
  title: string;                       // 🧑（🤖 可起草）
  state: LifecycleState;               // ⚙️ 由状态机根据 🧑/⚙️ 事件转移
  mode?: Mode;                         // ⚙️ running/verifying（及 ready 中的 queued/preparing）；其他状态用下面的原因字段解释“为什么停在这里”
  waitReason?:                         // ⚙️ state=ready 时
    "slot" | "dependency" | "review_capacity";   // manual 已删除：没有写入路径（ADR-177）；review_capacity 只在阻止模式（M2，E8）下写入（ADR-191）
  pauseReason?:                        // ⚙️ state=paused 时
    | "human" | "budget_soft_cap" | "stop_condition" | "idle_without_submit" | "verify_failed_limit"
    | "sentinel_high" | "human_change_verify_failed" | "app_quit" | "engine_crash" | "satellite_missing"   // satellite_missing：只在 running 时卫星丢失或重建失败时成为暂停原因；其他状态下是叠加态（ADR-076、ADR-084）
    | "verify_env_error" | "s0_grant_pending" | "post_settle_activity"   // 后者见 ADR-025（1 小时内第 2 次）
    | "question_timeout"               // riskTier ≥ standard 的 question 在 use_defaults 下超时 → 暂停（ADR-023）
    | "prepare_failed"                 // 来源清单只按 16 §16.1.1（ADR-239）：ready 的准备阶段失败或超时（ADR-149/150/151），或运行中途停止的几种（含 tower-goal 的同一处理器连续 3 次出错，05 §5.6.5 第 6 项）；不在启动时自动解除
    | "stalled_timeout"                // use_defaults 下检测器 escalate 的 stalled 条目超时、按默认暂停（08 §8.7.1，ADR-183）；条目保持打开
    | "external_change"                // 任何状态中检测到来源不明的写入（10 §10.3.1，ADR-122/128）；详情在 externalChange
    | "provider_unavailable"           // provider 重试耗尽 / 离线（05 §5.9、04 §4.18.3）
    | "budget_hard_cap";               // 触达 usdHard / wallClockHardMin：无单纯“继续”：扩展预算后恢复、`claim_on_behalf` 按当前状态送去验证、或放弃（03 §3.2.1、06 §6.2.5）
  shapingIssue?: "no_proposal" | "crashed" | "budget" | "unresponsive";   // ⚙️ state=shaping 时塑形 Run 的失败原因（03 §3.4.1）
  continuation?: Continuation;            // ⚙️ ADR-134：从非 paused 状态第一次进入 paused 时写入，叠加原因不覆盖；只由显式决定改写；全部原因解除时由唯一转移函数 onAllReasonsCleared() 执行（03 §3.2.1）
                                          //    取代已废弃的 resumeTo / pendingVerify / externalChange.detectedIn（16 §16.1.13）
  externalChange?: {                      // ⚙️ ADR-128：external_change 的持久状态（06 goals.external_change JSON 列；事件 goal.external_change.detected/.resolved）
    paths: string[];                      //    E：来源不明的写入路径，重复检测时并入
    mixedPaths: string[];                 //    drain 期间同一路径也有 Agent 工具写入（记 mixed）
    baselineCps: (CheckpointId | Sha)[];  //    归因基线（10 §10.3.1），每个涉及的仓库一个，首次检测时确定；没有对应检查点时为当前 pin 或 baseCommit 的提交（ADR-211）
    detections: { at: Iso; paths: string[] }[];
  };
  humanCheckout?: { path: string; baseTree: Sha; createdAt: Iso;
                    syncState: "idle" | "syncing"; written?: string[];
                    targetTree?: Sha; rebuiltTree?: Sha;
                    params?: { mode?: "continue_agent" | "reverify"; note?: string; sealNote?: string;
                               externalResolution?: "take_human" | "take_external" | "keep_both";
                               resolvePinHits?: { path: string; action: "delete" | "restore_base" }[] } };
                                       // ⚙️ 人工编辑检出（ADR-081/094）；持久化以便应用重启后仍可交还；syncing = 交还或检验带回的写回已开始而未完成（正在本进程中执行时为写回进行中，06 §6.4.3，ADR-219），重启后以 targetTree（写回目标树 T1，与 syncState='syncing' 同一事务写入，唯一落点，ADR-176）幂等续写（ADR-099）；
                                       //    params：交还（goal.hand_back）或带回（inspect.bring_back，只有 sealNote）的参数，与 targetTree 同一事务写入，崩溃续写与后续步骤只从这里读取（ADR-178）；
                                       //    rebuiltTree：接管期间 Tower 重建卫星时所用的树（重建成功的同一事务写入），交还第 6 步以它代替 T0 作比较基准（10 §10.8.4，ADR-178）
  takeoverFrom?: LifecycleState;       // ⚙️ “我来改”接管时所在状态（running/ready/paused/in_review/accepted；ready 仅当检出完成标记存在，ADR-147/153），交还时用于展示与审计（ADR-094）
  pendingHandBack?: { mode: "continue_agent" | "reverify"; at: Iso; decisionId: DecisionId; returnTo?: "in_review" | "accepted" };   // ⚙️ 交还后仍暂停时人的选择；returnTo 在交还清除 takeoverFrom 之前由它取得（ADR-213）；onAllReasonsCleared() 第 1 步优先于 continuation 执行（ADR-104/108/134）；take_external 时不写；decisionId 指向 HumanDecision{hand_back}，意图取其 note（`16` §16.1.1）
  satelliteRebuilding?: boolean;       // ⚙️ 叠加态：后台重建卫星，不改状态与 pauseReason（ADR-084）
  alsoApplies?: PauseReason[];         // （PauseReason = 本节 pauseReason 的取值集合）              // ⚙️ 同时成立、优先级较低的其他暂停原因（ADR-084）
  s0Grant: "none" | "pending" | "granted" | "denied" | "denied_timeout";   // ⚙️/🧑 S0 执行授权状态（ADR-077）
  s0GrantExpiresOn?: "run_end" | "next_run_start";   // ⚙️ ADR-179：经远程连接批准的 S0 授权按事件失效（11 §11.9 远程授权的统一有效期）：Run 中批准 → run_end（本 Run 结束），没有 Run 时批准 → next_run_start；到达该事件时 s0Grant 回到 none 并清除本字段；本机批准为空；其余失效条件（合同修订、检查点命中 scope.protected）唯一定义在 11 §11.2（ADR-182）
  autoResume?: boolean;                // ⚙️ 可自动恢复（如 app_quit 后重启、engine_crash 重试）
  verifyFrom?: "claimed" | "in_review" | "accepted";   // ⚙️ 当前或最近一次验证的源状态（ADR-084；06 goals.verify_from；验收延续据此判定）。写入点（ADR-137）：进入 claimed 时写 claimed；I2/retry_verify/grant_s0_exec/bring_back/标准修订 从 in_review/accepted 进入 verifying 时写该状态；paused 中修订标准把 review{state, pin} 改写为 verify{pin} 时写 state（ADR-180）；守卫把 verify 改写为 verify_new 时 returnTo 取当时的 verifyFrom（∈ {in_review, accepted}）；verify_new 执行时写 returnTo ?? "claimed"；pendingHandBack.reverify 的 returnTo = pendingHandBack.returnTo（交还时由 takeoverFrom 取得，若 ∈ {in_review, accepted}，ADR-213）。写入点以 16 §16.1.1 Goal.verifyFrom 行为准（ADR-182）
  stopConditionSilences?: {             // ⚙️ ADR-139：停止条件的再武装状态（06 goals.stop_condition_silences JSON 列）
    conditionId: string;                 //    StopCondition.id
    scope: "run" | "until_amend";        //    run：“继续”，只静默本次命中的对象到“继续”之后开始的那个 Run 结束；until_amend：“这里不该停”，静默到下一次合同修订（合同页显示“已停用 · 到下次修订”）
    object?: string;                     //    scope=run 时：命中的具体路径或命令
    runId?: RunId; decisionId: DecisionId;   // scope=run：runId 在“继续”之后开始的那个 Run 启动时填入，该 Run 结束时清除（ADR-143 补记）
  }[];
  baseChoice?: { side: "remote" | "local"; towerTip: Sha; userTip: Sha; at: Iso };   // ⚙️ goal.base.choose 的持久化；同一对分叉提交仍存在时 baseTip() 返回所选一侧（ADR-159）
  drainingFor?: {                         // ⚙️ ADR-141：drain 开始的同一事务写入；期间到达的暂停请求并入 reasons；崩溃恢复的唯一规则见 06 §6.1.6
    target: "pause" | "take_over" | "rewind" | "dependency";
    reasons: PauseReason[]; decisionIds: DecisionId[]; requestedAt: Iso;
  };
  preparingSince?: Iso;                    // ⚙️ ADR-150：准入时写入，run.started / 中止 / 失败时清除（06 §6.8 F8 的中止除外，ADR-233）；启动恢复只对 state=ready 且 preparingSince 非空且无暂停原因的 Goal 生效
  // queuedRun 清除点：run.started、abandon、进入 ready/paused 以外的状态（ADR-151）
  queuedRun?: { kind: "initial" | "resume" | "rework" | "handback"; decisionId?: DecisionId };   // ⚙️ ADR-147/148：ready 中恒非空（合同批准 → initial = 第一次启动；依赖回退 → resume；其余见 ADR-147）；准入按类别判定（只有 initial 受评审余量闸控，阻止模式，M2，ADR-191）；与 Run.reason 一一对应；在 run.started 同一事务中清除
  pendingOpenings?: OpeningRef[];         // OpeningRef = {id, decisionId} | {id, factId}（id：入队时分配的稳定标识，撤回按 id 而非下标，并发撤回幂等；返工证据引用验证失败的 Fact，ADR-144）；可逐条撤回（goal.openings.withdraw{goalId, openingId} → HumanDecision{withdraw_opening}）          // ⚙️ ADR-140：自带开场的决定按序追加；下一次任何 Run 开始时消费组装进开场的条目（之后追加的留给下一个 Run，06 §6.4.3，ADR-184；pendingHandBack 不清空它）
  takeoverPriorReasons?: PauseReason[];    // ⚙️ ADR-140：take_over 时的原因集合；discard_human_edits 判定是否保留 paused(human) 只读它与 takeoverFrom
  verifyOrigin?: "agent_submit" | "human_change" | "rebase" | "merge_queue" | "manual" | "opportunistic" | "agent_bg";   // agent_bg：bg_process_survived 期间存活进程的写入使树 ≠ pin（ADR-122）
                                       // ⚙️ 本次验证由什么触发；只作 Trace 与 Fact 的说明，不决定失败去向（失败去向按归因窗口，03 §3.2.1，ADR-140/144）
  contract: ContractRef;               // 当前生效合同版本
  bindings: WorkspaceBinding[];        // 1..N 个仓库
  parentId?: GoalId;
  dependsOn: GoalId[];                 // 🧑
  kind: "code" | "investigation" | "docs" | "ops";   // 🧑；决定 Changes 面板形态（Diff vs Artifacts vs Findings）
  riskTier: "low" | "standard" | "high";             // 🧑（⚙️ 根据范围给出建议）
  priority: number;                    // 🧑 手动排序，系统永不自动重排
  owner: string;                       // 🧑 v1 = 本机用户
  labels: string[];
  runs: RunId[];
  counters: {                          // ⚙️
    reworkCycles: number; interrupts: number;
    costUsd: number; tokens: number; wallClockMs: number;
  };
  watermarks: Record<string /*userId*/, number /*event seq*/>;   // ⚙️ 用户上次查看的位置，用于 Re-entry
  createdAt: Iso; updatedAt: Iso;
  archivedAt?: Iso; abandonedAt?: Iso; abandonReason?: string;   // abandonedAt 用于分层保留（ADR-057）
  resurrectedFrom?: GoalId;            // 复活 = 新 Goal 链接旧 Goal，旧合同不可变
  integrationRevertedSeal?: Sha;       // ⚙️ ADR-176：宽限期内“撤销合入”时写入被撤销的 seal（Goal 回到 accepted，界面显示 reverted 标记）；该 seal 不再触发 integrated（10 §10.12）；从不清除，再次撤销时覆盖（ADR-181）
}

interface WorkspaceBinding {
  projectId: ProjectId;
  baseRef: string;                     // 🧑 如 origin/main
  baseCommit: Sha;                     // ⚙️ Goal 开始时解析并冻结；rebase 时更新并记录事件
  boundSeq: number;                    // ⚙️ 绑定事件的事件序号，**不随 rebase 移动**（ADR-146）；归因窗口在没有“通过”的验证时以它为起点；多仓库按 binding 分别计算（ADR-145/146，07 decide）
  branch: string;                      // ⚙️ 卫星中的工作分支 tower/<goalId>；用户仓库中的 seal 分支为 <Project.branchPrefix>/<goalId>-<slug>（ADR-060 第 7 点）
  attach: { checkoutPath: string; commonDir: string; satellite: true };   // ⚙️ 附着点 = 用户主检出：Tower 镜像库（ADR-073）的 fetch 来源、seal 分支的写入目标；Agent 对其完全只读
                                       //    Agent 的工作目录是卫星克隆（alternates → Tower 镜像库，分离 gitdir 整体归 Agent，工作目录任意深度不可创建 .git，ADR-060/073/081/089）；多检出时的选择与迁移见 10 §10.1.1
  shadowGitDir: string;                // ⚙️ ~/.tower/goals/<goalId>/git/<projectId>.git（Agent 不可写，ADR-060）
  worktreePath?: string;               // ⚙️ 卫星工作目录，默认 <checkoutParent>/.tower-wt.noindex/<repoName>/<goalId>（ADR-008）
  headCommit?: Sha;                    // ⚙️ 分支 HEAD。检查点与验证 pin 只写影子 ref（refs/tower/…），不进分支历史；
                                       //    卫星分支上只有 Agent 的提交；人的就地编辑留在卫星工作区（检查点归因为 human），Tower 不替人提交；
                                       //    集成 seal 在影子中生成并带 Tower-Human-Edit / Co-authored-by trailer（ADR-036、ADR-060）
}
```

---

## 2.5 Goal Contract（合同）

合同是 Goal 的“指挥官意图”。它由人批准、版本化、可 diff；修订是显式事件。

```ts
interface Contract {
  goalId: GoalId;
  version: number;                     // 1, 2, 3…
  status: "draft" | "ratified" | "superseded";
  intent: {
    purpose: string;                   // 为什么做（commander's intent：目的）
    endState: string;                  // 做完是什么样（终态）
    constraints: string[];             // 不可做什么 / 必须保持什么
    context?: string;                  // 背景、链接、issue
  };
  criteria: Criterion[];               // 验收标准：进度的唯一来源（R4）
  scope: ScopeFence;
  budget: Budget;
  autonomy: AutonomyMatrix;            // 见 11
  stopConditions: StopCondition[];
  maxReworkCycles?: number;            // I6 返工上限，默认 3（16 §16.2；ADR-143）
  plan?: PlanStep[];                   // 可选；高风险 Goal 必填（计划闸门，R7）
  review: {
    unitMaxLoc: number;                // 默认 300
    viewPolicy: "all" | "risk_at_least_medium" | "high_risk_only" | "none";
                                       // 验收前必须“有效评审”的单元范围；riskTier=high 的 Goal 下限为 "all"
  };
  unattended: "wait" | "use_defaults"; // 🧑 人长时间不在时：wait = Needs-You 不超时；use_defaults = 按条目 defaultIfIgnored 超时执行（08）
  ratifiedBy?: string; ratifiedAt?: Iso;
  draftedBy: "human" | "agent";
  amendmentNote?: string;              // v>1 时必填：为什么修订
}

type Criterion =
  | { id: string; kind: "exec"; title: string;
      command: string;                 // 在 worktree 根目录运行，例如 "pnpm test -- checkout"
      expect: { exitCode?: number; stdoutMatches?: string; minTests?: number; maxFailures?: number };
      repeat?: number;                 // 连续通过次数（如 flaky 修复：5 次）；默认 1；判定规则唯一定义在 07 §7.4.5（ADR-183）
      timeoutSec: number;
      env?: string[];                  // M2：该标准需要的机密名称；M1 中不可用，需要机密的检查写为 human 标准（ADR-164）
      secretsVia?: "env" | "file";     // M2（ADR-164）
      // 无 cleanEnv：验收依据一律来自验证器的干净槽位；Agent 环境的结果只计入“观测到”轨（ADR-020、07）
    }
  | { id: string; kind: "human"; title: string; howToCheck: string }   // 无法执行的标准，由人勾选
  | { id: string; kind: "artifact"; title: string; artifactGlob: string;   // 文档/研究类 Goal；验证器内置检查（ADR-031）
      checks: ({ type: "exists" } | { type: "headings"; required: string[] }
             | { type: "links_internal" }               // 离线：相对链接与锚点存在
             | { type: "links_reachable" }              // （M2，ADR-183）外部链接可达；每次正式验证执行，需 network 声明（07 §7.4.9）
             | { type: "min_words"; n: number })[];
      network?: string[] }                              // links_reachable 允许访问的主机
  | { id: string; kind: "subgoal_accepted"; title: string; goalId: GoalId };   // ⚙️ 由状态机判定：子 Goal 处于 accepted/integrated/archived(经验收)；
                                                                                //    子 Goal 被复活或验收失效（I2）时该标准回到未满足

interface ScopeFence {
  includeOrigin: "explicit" | "template" | "compiled";   // 🧑 explicit = 人显式设置（优先，ADR-050）；template = 快速路径模板默认围栏；
                                                         // compiled = 由计划 ∪touches 编译。优先级 explicit > compiled > template：
                                                         // 计划编译（下方，每个合同版本；没有计划或没有 touches 时不改写 include，原为 compiled 时置 explicit，ADR-183/184）：includeOrigin = template 时改为 compiled；= explicit 时不变，超出部分只警告；
                                                         // 人在任何修订（本机或 web）中编辑 include 时，同一修订把 includeOrigin 置为 explicit，之后编译不再改写 include（ADR-182）
  include: string[];                   // glob，按 binding 区分：`${projectId}:src/checkout/**`
  exclude: string[];
  protected: string[];                 // 只读（改动需 ask）。默认值：
                                       //   Agent 指令/信任类：.pi/**、.agents/**、**/AGENTS*.md、**/CLAUDE.md、.mcp.json、.envrc、.npmrc、.husky/**
                                       //     （全部 protected 模式——含验证类与合同中的——的名字按 16 §16.1.12“上下文文件名与受保护名字”的比较规则匹配，大小写变体同样命中，ADR-203/204）
                                       //   验证类：测试快照、CI 配置（.github/workflows/** 等）、package.json#scripts 中被验收标准引用的脚本，
                                       //           以及生命周期脚本 package.json#scripts.{preinstall,install,postinstall,prepare,pretest,posttest}（ADR-062、07 §7.5）、
                                       //           .pnpmfile.cjs、patches/**、package.json 的 pnpm.patchedDependencies/pnpm.overrides/pnpm.packageExtensions/overrides/resolutions，以及 pnpm-workspace.yaml 的 overrides/catalog/catalogs/packageExtensions/patchedDependencies（ADR-098；ADR-085/092）
  allowNewDependencies: boolean;       // lockfile 的可写性由此推导：false → lockfile 视同 protected；true → 允许（按 dep.add 动作类审批，见 11）
  allowTestEdits: "forbid" | "ask" | "allow";   // 测试完整性哨兵的策略（见 07）
  // 优先级：同一路径命中多条规则时取最严格者（forbid > ask > allow）
}

type AutonomyLevel = "forbid" | "ask" | "notify" | "silent";
interface AutonomyMatrix {
  levels: Record<ActionClass, AutonomyLevel>;   // ActionClass 共 28 类（含 read.pi_resources，ADR-091；tool.external，ADR-185），定义见 11 §11.1；单向门类与 tool.external 的级别下限为 ask——唯一执行点是 11 §11.3.5 decide() 的 floor（先钳矩阵级别、再求授权），合同中更低的值不生效（ADR-186）
  grants: { actionClass: ActionClass; pattern?: string; until?: Iso; grantedBy: DecisionId }[];  // 批准合同时写入的授权（合同不可变，I3），不按事件失效；ADR-179 的 expiresOn 已删除（ADR-180）。
                                       // 编入 policy.json 时 actionClass → Grant.class、pattern → matcher（11 §11.3.5）；pattern 缺省时不匹配任何调用（不是“整个类”，放宽整类改 levels）；
                                       // tool.external 的 pattern 是一个工具名、精确匹配（ADR-186）；本 Goal 的不可信内容与对外通信都为真时不编入（11 §11.3.5 排除 (d)，ADR-227）
                                       // 运行中的“本 Goal 内同类”授权（M3 另有项目级）不在这里，见下方 Grant
  preset?: "spike" | "standard" | "prod_hotfix" | "dependency_upgrade" | "investigation";
}

interface Grant {                      // 运行时授权（ADR-180，唯一定义；11 §11.2 审批选项“本 Goal 内同类”；“本项目内同类”属 M3，ADR-183）
  scope: "goal" | "project"; goalId?: GoalId; projectId?: ProjectId;   // goal → goalId；project → projectId（M3：随自适应自主度的“已获得的自主度”面板提供列出与撤销，M1 中不产生）
  class: ActionClass; matcher: string;   // 匹配器由 Harness 从解析结果生成（11 §11.2）；class = tool.external 时为工具名、精确匹配（11 §11.3.4，ADR-185）
  expiresAt: Iso;                      // goal：Goal 结束；project（M3）：30 天
  grantedBy: DecisionId;               // 存放处：该 approve_action 决定的 payload.grant（决定不可变，无单独的表）；Supervisor 在每个 Run 开始时
                                       // 把未过期者编入 policy.json 的 grants（05 §5.6）；只在本机批准时产生——远程审批只有“仅这一次”（16 §16.5）；
                                       // 效果（只把 ask 降到 notify，不越过 forbid）、编入时的排除（撤销、降级、合同收紧过该类）与撤销路径唯一定义在 11 §11.3.5 applyGrants（ADR-182）；
                                       // M1 的撤销 autonomy.revoke{goalId} 只作用于该 Goal 的 Grant（ADR-184）
}

interface Budget {
  usdSoft?: number; usdHard?: number;
  wallClockSoftMin?: number; wallClockHardMin?: number;
  interruptsPerHour?: number;          // 本 Goal 允许打扰人的上限（注意力预算）
  maxDiffLoc?: number;                 // 评审尺寸预算：超过时 ⚙️ 提示拆分为子 Goal（R8、R11；默认 = 2 × review.unitMaxLoc × 3）
}

type StopCondition = { id: string } & (   // id：合同版本内稳定（如 "sc-3"），修订时未改动项保留原 id；Needs-You 去重键 stc:{goalId}:{id}（ADR-135）
  | { kind: "natural"; text: string }   // 注入给模型的“遇到此情况停下来问”
  | { kind: "path_touched"; glob: string }
  | { kind: "command_matches"; regex: string }
  // rework_cycles_over 已删除（ADR-143）：返工上限只由 I6 / Contract.maxReworkCycles 定义
  | { kind: "no_progress_for"; minutes: number });

interface PlanStep {
  id: string; title: string;
  criteriaIds: string[];               // 步骤服务于哪些验收标准
  touches?: string[];                  // 预计改动的路径 glob
  needsDecision?: boolean;             // 预计在此处需要人（L3 预测的来源之一）
}
// 计划“编译”为运行时围栏（R7）：合同的每个新版本（批准或修订，含只改步骤标题或 needsDecision 的修订）生效前执行一次编译——编译是合同的确定函数；
//  `16` §16.5 的判别原则比较的是编译后的合同（ADR-182）。⚙️ 没有计划（plan 为空或缺省）时规则 (1) 不执行；规则 (2) 照常整体重算——计划被删空时删除全部 plan:* 条目（ADR-184，取代 ADR-183 的“编译是空操作”）。
//  (1) 只在 plan 非空且至少一个步骤有 touches 时执行：若 scope.includeOrigin ≠ "explicit"，则 scope.include = ∪ 有 touches 的步骤的 touches、includeOrigin = "compiled"
//      （超出即 edit.out_of_scope，按自主度矩阵处理；没有 touches 的步骤在合同编辑器中提示“该步骤的改动将按范围外处理”）；没有任何步骤带 touches 时 include 不变（ADR-183）；
//      **计划为空或不再有任何 touches、而 includeOrigin = "compiled" 时**（例如本机修订删空了计划），include 保留上一版编译的值、同一修订把 includeOrigin 置为 "explicit"
//      （围栏只会保持或更窄；合同编辑器提示“范围保留为上一版计划编译的结果，此后按人设置处理”，ADR-184）；template 与 explicit 不变；
//      若 = "explicit"，以人设置的为准，计划中超出的 touches 在合同编辑器中警告（ADR-050）；
//  (2) 每个 needsDecision 步骤生成一条 stopCondition{id:"plan:<stepId>", kind:"natural", text:"开始「<title>」前用 ask_user 确认"}：id 由步骤 id 派生、稳定不变；
//      每个版本**整体重算**生成的条目（替换、不追加；取消 needsDecision 或删除步骤即删除对应条目，ADR-183）；`plan:` 前缀的条目只由编译产生，不能经修订单独增删改，
//      它们的远程规则按 `16` §16.5 的 `plan` 行判定（随步骤标题改变的生成文本按措辞处理）；
//      且 tower-goal 在 Agent 的 log{kind:"step"} 声明进入该步骤时检查是否已有对应确认，没有则提醒；
//  (3) 步骤顺序不强制（Agent 可调整，调整以 Claim 记录）。
```

**Task 从哪里来？** Pi 作者的经验是“to-do 会迷惑模型”。因此 Tower **不要求模型维护任务清单**：
1. 主进度 = 两轨进度：已验证 V/M（⚙️ Fact）· 观测到 O/M（⚙️ 观测，不计入验收），ADR-020、`07` §7.2.4。M 只计机器标准（`exec` + `artifact`）；`human` 与 `subgoal_accepted` 标准另列为“人工 h/k”，永不进入 V 或 O（ADR-052）。
2. 次进度 = 计划步骤（🧑 批准的 `plan`，或 🤖 通过 `log{kind:"plan"}` 提出的计划，显示为 Claim）。
3. 当前步骤 = 🤖 最近一次 `log` 中声明的 `step`，并与 ⚙️ 实际触及的文件交叉校验（声明在做 A，却在改 B → 标记为不一致）。

---

## 2.6 Run 与 Trace

```ts
interface Run {
  id: RunId;
  goalId: GoalId;
  reason: "shaping" | "initial" | "rework" | "resume" | "handback" | "handoff" | "verify_fix" | "scratch_promote"   // handback：交还 continue_agent（ADR-148/149；与 queuedRun.kind 一一对应，映射表见 16）
        | "review";                    // review = 可选的独立评审 Run（另一个模型只读评审 diff 对合同，产出 author:"reviewer" 的 Claim，07）
  engine: { adapter: "pi-sdk" | "pi-rpc"; piVersion: string; model: string; thinking?: string };
  sessionId: string;                   // Pi session id；文件位于 ~/.tower/goals/<goalId>/sessions/（--session-dir），路径由 SessionManager 解析；多个 Run 可共享同一会话
  entryRange: { firstEntryId?: string; lastEntryId?: string };   // ⚙️ 本 Run 在会话树中覆盖的 entry 区间（对账游标）
  parentRunId?: RunId;                 // 交接链
  attempt: { n: number; branchFromEntryId?: string; label?: string };   // 同一 Goal 的第 n 次尝试；对应 Pi 会话树分支（ADR-015）
  handoffPacket?: HandoffPacket;       // 见 2.11
  startedAt: Iso; endedAt?: Iso;
  outcome?: "settled" | "aborted" | "crashed" | "budget_stopped" | "superseded";
  outcomeReason?: string;              // ⚙️ 如 "submit_effective" | "idle_without_submit" | "human_abort" | "app_quit" | "host_oom" | "disk_full" | "project_unreachable"（06 §6.1.6，ADR-235）
  submit?: {                           // ⚙️ 有效提交（03 I4，ADR-121）以工具事件判定：最后一次 submit 之后没有变更类工具调用；fingerprint 只记录提交时的工作区指纹（信息性，不参与有效性判定）
    toolCallId: string; fingerprint: string; at: Iso;
  };
  usage: { usd: number; tokens: number };   // ⚙️ 来自 Pi Usage
}
```

Trace = Pi 的 session JSONL（对话唯一真相）+ Tower 事件日志中该 Run 的事件。Tower 从不改写 Pi 的 JSONL。

---

## 2.7 Ledger：Fact / Claim / Decision

### Fact（⚙️ 唯一写入者是 Harness）

```ts
interface Fact {
  id: FactId; goalId?: GoalId; projectId?: ProjectId; runId?: RunId;   // 项目级 Fact（如 remote_credential_blocked）只带 projectId；其余必带 goalId（ADR-159）
  kind:
    | "diffstat"            // 每个 binding 相对 baseCommit 的增删行、文件数
    | "files_touched"       // 本次运行实际改动的文件集合
    | "command_result"      // Agent 执行的 bash：命令、退出码、耗时（来自工具结果，⚙️ 观察而非声明）
    | "criterion_check"     // 验证器对某条验收标准的执行结果
    | "test_inventory"      // 测试数量 / skip 数 / 断言数估计（测试完整性哨兵）
    | "sentinel"            // 哨兵命中，data.detector 区分：test_edit / skip_added / assertion_weakened / test_count_drop /
                            //   criterion_def_changed / scope_breach / dep_added / config_changed / api_changed / migration /
                            //   secret / policy_block 等（完整清单见 16 §16.1.6；严重度见 07 §7.10.1）
    | "anomaly"             // 检测器：loop / stall / burn_without_progress / claim_contradicted / post_settle_activity / stat_cache_mismatch / structured_content_dropped / tower_goal_handler_error / verifier_store_tampered / bg_process_survived（07 §7.7、§7.10.1；16 §16.1.6）
    | "flake"               // 某测试在同一指纹上结果不一致；进入隔离清单需人决定（quarantine_test）
    | "conflict_forecast"   // 冲突雷达：与 base 或兄弟 Goal 的预测冲突
    | "budget"              // 消耗快照
    | "heartbeat"
    | "prepare"             // worktree / 依赖准备结果与耗时（10）
    | "ci_check"            // 远端 CI 状态（PR 模式，M2，10）
    | "engine_error"        // 引擎 / provider 错误、重试耗尽（05）
    | "policy_notify"       // notify 级动作的记录（11）
    | "compaction"          // 一次压缩：原因、tokensBefore（05）
    | "host_resource"       // Host 内存 / CPU 超阈（13）
    | "sandbox_violation"   // OS 沙箱拒绝记录（11）
    | "verify_env_error"    // 验证环境故障（服务、端口、安装器），≠ 标准失败（ADR-037）
    | "local_merged"        // ⚙️ 本地 base 观测到某个 seal 合入：data.seal、data.current（是否为最近一次验收的 seal；false 时不进入 integrated，ADR-137）
    | "lfs_excluded"        // ⚙️ 项目 lfs.fetchexclude/fetchinclude 使部分 LFS 文件在卫星中保持指针：data.count、data.paths（被排除的路径，最多 200 条，超出记总数）、data.patterns、data.source（"lfsconfig" | "gitconfig"）（ADR-153）；不导致 prepare_failed
    | "lfs_config_ignored"  // ⚙️ 白名单校验拒绝的 base .lfsconfig 值：data.keys、data.reasons（来源恒为 .lfsconfig，ADR-154 补记、ADR-155）；获取成功时为提示，失败时随卡片列出
    | "rebase_lfs_failed"   // ⚙️ M2：自动 rebase 前补齐新 base 的 LFS 对象失败：data.missing；本次 rebase 放弃，卫星保持旧 base（ADR-155）
    | "push_hook_failed"    // ⚙️ M2：推送前在用户检出中运行的 pre-push 钩子失败：data.exitCode、data.output（经 11 §11.7 脱敏、截断）；不推送（ADR-155 补记 3）
    | "base_diverged"       // ⚙️ 同一远端分支在镜像中 Tower 获取与用户获取的提交分叉：data.tower、data.user；分叉时 baseTip() 不改变 baseCommit，由人选择（goal.base.choose）；data 含 towerFetchedAt、userObservedAt（ADR-158）
    | "base_advanced"       // ⚙️ base 前进（M1 只提示）：data.from、data.to、data.count（ADR-157）
    | "base_unchanged_nonancestor" // ⚙️ base 变化但不是前进：data.from、data.to（ADR-158）
    | "push_failed"         // ⚙️ M2：推送失败：data.stage（"hook" | "network" | "auth"）、data.exitCode?（ADR-158）
    | "remote_credential_blocked" // ⚙️ macOS：远端 URL 带凭据，Tower 不执行网络命令：data.remote（ADR-158）
    | "base_fetch_failed"   // ⚙️ 远端 base 获取失败（进入 in_review 前、“检查 base”）：data.remote、data.error（ADR-158 补记 2）；不阻塞
    | "remote_merged"       // ⚙️ M2：远端观测到已推送的 seal 合并（ADR-128/133）
    | "symptom";            // 首个失败测试 / 错误签名（Cause 区块的事实一半，ADR-030）
  data: unknown;            // 按 kind 的结构化载荷（见 07）
  atCommit?: Sha;           // 该事实针对哪个提交成立（单独记录，便于溯源）
  workspaceFingerprint?: string;   // "wt1:<tree-sha>"（artifact 检查用 "art1:<内容哈希>"）：把 worktree 当前内容经临时 index 写成 git tree 的哈希（stat 缓存，廉价）。
                                   // 只依赖内容，不依赖 HEAD：同内容不同提交不会误判过期；已跟踪文件的内容变化不会漏判（07 §7.3.2）
  computedAt: Iso;
  producer: "observer" | "verifier" | "sentinel" | "detector" | "radar" | "accountant" | "git" | "policy" | "engine";
  track: "verified" | "observed";   // ADR-020/024：verified = 不经 Pi 扩展链的 Harness 组件（验证器、git）产生，可着绿；
                                    //   observed = 经 Pi 工具结果转述的观测（command_result 等），永不单独着绿
  evidence: EvidenceRef[];  // 指向原始产物：日志文件、Trace 片段、diff hunk
}

type Freshness = "fresh" | "stale" | "expired";
// 🔁 fresh：指纹 = 当前指纹；stale：指纹不同（对旧代码成立，需重新验证，灰显）；
//    expired：依赖的外部条件失效（baseCommit 已变、验收标准在合同新版本中被修改、或超过 kind 的最长有效期）——不能作为验收依据（07 §7.3.3）
```

**新鲜度规则：** 任何依赖代码状态的 Fact，在 workspaceFingerprint 改变后立即变为 `stale`（灰显，“需重新验证”）；`Verified` 状态随之失效（见 03）。

### Claim（🤖 写入，⚙️ 交叉校验）

```ts
interface Claim {
  id: ClaimId; goalId: GoalId; runId: RunId;
  kind: "plan" | "step" | "decision" | "assumption" | "finding" | "cause" | "risk" | "done" | "next"   // ADR-030：无 eta
      | "memory"                       // 记忆提议（经 log{kind:"memory"}），生成 MemoryProposal 进入批准队列（09）
      | "review_note";                 // 独立评审 Run 的意见
  author: "worker" | "reviewer";       // 执行 Agent 还是评审 Agent（两者都是 🤖，视觉上区分）
  text: string;                        // 🤖
  rationale?: string;                  // 🤖（显示为“Agent 的说法”，不作解释的保证）
  alternatives?: string[];             // 🤖 decision 专用
  confidence?: "low" | "medium" | "high";  // 🤖 定性，从不显示百分比（防“信心表演”）；由 log 的可选参数产生（ADR-030）
  // done 来自 submit；review_note 来自评审 Run 的 log；其余 kind 来自 log{kind}
  evidenceRefs: EvidenceRef[];         // 🤖 声明它依赖哪些文件:行 / 命令 / 工具调用
  crossCheck: {                        // ⚙️
    strength?: "hard" | "soft";        // hard = 确定性矛盾（danger 色）；soft = 关键词/启发式（中性提示），07 §7.8
    status: "consistent" | "contradicted" | "unbacked" | "unchecked";
    reasons: string[];                 // 如 "声称修改 src/a.ts，但 a.ts 未变化"
    linkedFacts: FactId[];
  };
  ratification?: "pending" | "ratified" | "rejected";   // 🧑 assumption/decision 进入批准队列
  provenance: Provenance;
}
```

### HumanDecision（🧑，不可变）

```ts
interface HumanDecision {
  id: DecisionId; goalId: GoalId;
  kind: "ratify_contract" | "amend_contract" | "approve_action" | "deny_action"
      | "answer" | "ratify_claim" | "reject_claim" | "accept" | "request_changes"   // accept 带 integrate:"none" 即“验收但不合并”：从 in_review（先 seal 并写分支）或 accepted 进入 archived，不另设种类（06 §6.4.3 goal.accept，ADR-187/188）
      | "abandon" | "resurrect" | "override_sentinel" | "extend_budget" | "override_capacity"   // override_capacity：M2（仅阻止模式，ADR-191）
      | "quarantine_test" | "trust_project"
      | "ratify_memory" | "edit_memory" | "retire_memory" | "resolve_sync_conflict"
      | "approve_autonomy_change"
      | "pause" | "resume" | "take_over" | "hand_back" | "rewind" | "fork" | "start_now"
      | "snooze" | "dismiss" | "check_human_criterion" | "grant_s0_exec" | "merge_projects"
      | "approve_docker" | "quick_ratify"        // quick_ratify：快速路径一键批准最小合同（03 §3.4.1）
      | "retry_verify" | "retry_claim" | "claim_on_behalf"   // paused 出口（03 §3.2.1）
      | "deny_s0_exec" | "split_project"      // ADR-077、ADR-080
      | "reject_memory"                        // 驳回 Agent 或挖掘得到的记忆提议（09 §9.3）
      | "discard_human_edits" | "bring_back_inspection" | "retry_after_human_change"   // ADR-099
      | "keep_external_change" | "revert_external_change"    // external_change 的两种处置（任何状态，ADR-122）：采纳为人的改动 / 按路径撤销到归因基线（10 §10.3.1）
      | "acknowledge_signal" | "mark_benign"     // ADR-117：受保护目标沙箱拒绝的出口（知悉 → informative；良性 → false_positive + 项目良性清单）
      | "withdraw_opening"                       // ADR-144：撤回 pendingOpenings 中的一条
      | "inspect_with_secrets" | "unmark_secret_file" | "approve_local_file"   // ADR-166：人显式让检验检出带上机密本地文件 / 取消机密标记（均仅本机）
      | "accept_secret_exposure"                 // M2（ADR-164）：带机密标准的“现在运行（接受风险）”；M1 中不产生
      | "rebuild_satellite"                      // ADR-176/183：satellite_missing 中人发起的重试重建（goal.rebuild_satellite，重建来源与自动重建相同，10 §10.16.2 情形 E），不开 Run、不改写继续目标（06 §6.4.3）；从更早的检查点重建属 M2
      | "lower_risk_tier";                       // ADR-178：goal.update_meta 降低 riskTier（仅本机）；riskTier 是 Goal 的字段，不是合同修订，不产生合同版本
  target?: { claimId?: ClaimId; itemId?: ItemId; criterionId?: string; reviewUnitId?: string;
             memoryId?: string; proposalId?: string; factId?: FactId; projectId?: ProjectId;
             checkpointN?: number; openingId?: string };   // checkpointN：仅 M2 的“从更早的检查点重建”（rebuild_satellite，ADR-176/183），M1 中不写；openingId：仅 withdraw_opening（OpeningRef.id，ADR-144/178）
  reason?: {                           // 结构化原因：供学习闭环挖掘（09），不再塞进 note
    code: string;                      // 如 abandon: "contract_unclear" | "wrong_direction" | "superseded" | "not_needed" | "agent_incapable" | "other"
                                       //    override_sentinel: "intended_change" | "false_positive" | "accept_risk"
                                       //    resume（stop_condition 出口“这里不该停”）: "stop_condition_false_positive"，target.criterionId 记 StopCondition.id（ADR-135；09 合同学习的输入）
    detail?: string;
  };
  note?: string;
  handBack?: {                         // 仅 hand_back（ADR-114、ADR-118）；以及置换交还选择的 resume，只带 mode:"continue_agent"（06 §6.4.3 goal.resume，ADR-218）
    mode?: "continue_agent" | "reverify";   // hand_back 时为交还的选择，取自 Goal.humanCheckout.params（06 §6.4.3 goal.hand_back；只在 take_external 时省略，ADR-134）；置换的 resume 恒为 continue_agent（ADR-219）；归因窗口按 hand_back{continue_agent} 与带它的 resume 读取它（03 §3.2.1，ADR-217/218）
    externalResolution?: "take_human" | "take_external" | "keep_both";   // 接管期间检测到外部写入时交还第 6 步的选择；树级语义见 10 §10.8.4（ADR-122）——任何选项都不把外部写入记为人的改动
    resolvePinHits?: { path: string; action: "delete" | "restore_base" }[];   // 交还第 7 步删除或还原 pin 命中条目，记 author:"human"
  };
  integrate?: "local_merge" | "push_pr" | "branch_only" | "none";   // 仅 accept：goal.accept 的去向参数（06 §6.4.3）；存 06 decisions.payload 列（ADR-188）
  grant?: Grant;                       // 仅 approve_action 选“本 Goal 内同类”时（M1；“本项目内同类”属 M3，ADR-183；§2.5 Grant 的存放处；06 decisions.payload 列，ADR-180/182）
  targetTree?: Sha;                    // 仅 hand_back / bring_back_inspection：写回目标树（take_external 时为 T0），只作审计；崩溃续写读 Goal.humanCheckout.targetTree 与 .params（ADR-176/178）
  sealNote?: string;                   // 仅 hand_back / bring_back_inspection：写入 seal 说明第 2 段“人的说明”的文字（与给 Agent 的 note 分开，`10` §10.6，R10-D4-01b）
  actor: string; at: Iso;
}
```

### EvidenceRef

```ts
type EvidenceRef =
  | { type: "trace"; runId: RunId; sessionId: string; piEntryId: string; toolCallId?: string }
  | { type: "hunk"; projectId: ProjectId; file: string; hunkHash: string; atCommit: Sha }
  | { type: "fileLine"; projectId: ProjectId; file: string; line: number; atCommit: Sha }
  | { type: "log"; path: string; byteRange?: [number, number] }      // 验证器 / bash 完整输出
  | { type: "artifact"; path: string; mime: string }                 // 截图、录屏、报告
  | { type: "url"; url: string; retrievedAt: Iso };                  // 研究类 Goal
```

---

## 2.8 Review Unit 与 Comment

```ts
interface ReviewUnit {
  id: string; goalId: GoalId;
  hunks: { projectId: ProjectId; file: string; hunkHash: string;
           author: "agent" | "human" | "external" | "mixed" }[];   // ⚙️ 由检查点链与人编辑事件归因；人自己改的代码单独标注；"external" 只出现在 drain 期间的回合检查点中（ADR-122），只能经 keep_external_change 变为 "human"；external_change 未解除时 Goal 处于 paused，不会进入评审
  loc: number;                         // ⚙️
  intent: string;                      // 🤖 两行叙述（Claim 语法显示）
  risk: { score: number; reasons: string[] };   // ⚙️ 规则计算：auth/money/concurrency/删除/公共 API/低覆盖/测试改动
  criteriaIds: string[];               // ⚙️+🤖 关联
  contentHash: string;                 // ⚙️ hunks 内容哈希；变化即需重审
  reviewState: "unseen" | "viewed" | "approved" | "changes_requested";   // 🧑
}

interface Comment {
  id: string; goalId: GoalId;
  anchor:
    | { type: "hunk"; projectId: ProjectId; file: string; side: "old" | "new"; line: number; hunkHash: string }
    | { type: "claim"; claimId: ClaimId }
    | { type: "criterion"; criterionId: string }
    | { type: "contract"; path: string }
    | { type: "trace"; runId: RunId; piEntryId: string }   // 轨迹与 Watch 中的事件（04 §4.17 F4；键同 EvidenceRef 的 trace；ADR-180）
    | { type: "goal" };
  body: string;                        // 🧑
  timing: "now" | "batch";             // 🧑 投递时机：now = steer（下个回合边界生效）；batch = 攒批，作为 follow-up 在 Agent 将停下时投递
  requiresChange: boolean;             // 🧑 语义：true = 必须处理（验收前该评论须为 addressed——只认 ⚙️ hunk 已变——或被人关闭；Agent 的引用不算，ADR-176；非 hunk 锚点没有 ⚙️ 来源，只能由人关闭，05 §5.7.3，ADR-178）；false = 建议/提问
  delivery: {                          // ⚙️ 送达回执（防止“转向被静默丢弃”）
    state: "draft" | "queued" | "delivered" | "acknowledged" | "addressed" | "stale" | "dropped";   // 唯一定义 05 §5.7.3
    seenAtEntry?: string;              // delivered 的属性（不是状态）：送达后第一条完成的 assistant 消息（模型已生成回复，不代表理会）
    acknowledgedAtEntry?: string;      // Agent 的 log/消息引用了该评论 id（05 §5.7.3）
    runId?: RunId; deliveredAtEntry?: string; addressedAtCommit?: Sha; staleReason?: string;
  };
}
```

---

## 2.9 Needs-You Item

```ts
interface NeedsYouItem {
  id: ItemId;
  owner: { kind: "goal"; goalId: GoalId } | { kind: "scratch"; scratchId: string }   // ADR-034
       | { kind: "project"; projectId: ProjectId } | { kind: "global" };
  // Scratch 只能产生 question；project/global 用于跨 Goal 根因合并、洪泛汇总、积压提示、同步冲突，以及 project 级的 integration 卡片（remote_credential_blocked，ADR-157/158）
  kind:
    | "question"            // 🤖 ask_user
    | "approval"            // ⚙️ 自主度矩阵要求审批的动作（单向门等）
    | "review_ready"        // ⚙️ Verified，等待验收
    | "verify_failed"       // ⚙️ 验证失败且 Agent 返工已达上限 / 需人决定
    | "sentinel"            // ⚙️ 高严重度哨兵
    | "budget"              // ⚙️ 软上限
    | "stalled"             // ⚙️ 卡住 / 无响应
    | "ratify"              // ⚙️ 待批准的假设 / 决策 / 记忆（低优先级，默认攒批）
    | "conflict"            // ⚙️ 冲突雷达预测的高风险冲突
    | "verify_env"          // ⚙️ 验证环境故障（ADR-037）
    | "digest"              // ⚙️ 攒批摘要（global）
    | "backlog"             // ⚙️ 评审积压提示（global，ADR-014）
    | "flood"               // ⚙️ 洪泛汇总（global/project）
    | "sync_conflict"       // ⚙️ 记忆同步冲突（global，09）
    | "external_change"     // ⚙️ 来源不明的写入待人决定（ADR-128）；severity 2；去重键 ec:{goalId}
    | "stop_condition"      // ⚙️ 合同停止条件命中（paused(stop_condition)，ADR-133 第 14 轮 lint 补记）；severity 2，agent_blocked；去重键 stc:{goalId}:{conditionId}
    | "integration"         // ⚙️ owner=goal：M2 推送失败（pre-push 钩子、网络、认证），去重键 int:{goalId}；owner=project：macOS 上带凭据 URL 的远端被拒（int:{projectId}:credential_url）；severity 2（ADR-157/158）
    | "anomaly"             // ⚙️ Tower 状态异常需人处置（如 bg_process_survived，ADR-126）；去重键前缀 an:（08 §8.4）
    | "project_identity";   // ⚙️ 绑定时根集合/远端不一致，需人确认“同一项目 / 新项目”（ADR-080；决定 merge_projects / split_project）
  severity: 1 | 2 | 3;      // 1 低（攒批进简报）/ 2 中（应用内）/ 3 高（可升到系统通知 + 可选声音）
  costOfDelay: "agent_blocked" | "agent_degraded" | "none";   // Agent 是否因此停摆
  title: string;            // 一句话：需要你决定什么
  options: { id: string; label: string; consequence: string }[];
  recommendation?: { optionId: string; by: "agent" | "harness"; why: string };   // 以 Claim 语法显示
  evidence: EvidenceRef[];
  defaultIfIgnored?: { optionId: string; afterSec: number };   // 超时后的默认动作。安全规则：默认项必须是“保守项”——
                                                                // approval 类只能默认拒绝；单向门永不超时放行；question 类只能默认
                                                                // “Agent 推荐且可逆”的选项（否则默认暂停）（08 §8.7.1、11 §11.1）；计时从 surfacedAt 起算；
                                                                // 合同 unattended="wait" 时不超时。Supervisor 的计时器是权威：
                                                                // 到期后 Supervisor 以 optionId 应答（Pi 侧 timeout 只作兜底，且随 Host 死亡而消失）
  source: { producer: "agent" | "policy" | "verifier" | "sentinel" | "detector" | "radar" | "accountant"; detector?: string };
  dedupeKey: string;        // 同一 Goal 内同根因合并
  rootCauseKey?: string;    // 跨 Goal 根因合并为项目级条目（08 §8.4）
  occurrences: number; lastSeenAt: Iso;   // 去重后的重复次数
  level: 0 | 1 | 2 | 3 | 4;               // ⚙️ 当前投递强度（注意力阶梯 L0–L4，08）。注意：severity 是“后果严重度”，
  deliveredLevels: number[];              //    level 是“投递强度”，由 AttentionRouter 按 severity × costOfDelay × 断点 × 预算映射，二者不是一一对应
  snoozedUntil?: Iso;                     // 🧑
  timedOutAt?: Iso;                       // ⚙️ question 在 use_defaults 下超时并暂停 Goal 时记录；条目保持打开（无 resolution），人仍可作答（03 §3.2.1）
  createdAt: Iso; surfacedAt?: Iso; resolvedAt?: Iso;
  resolution?: { optionId?: string; freeText?: string; by: "human" | "timeout" | "obsolete" };
  outcomeClass?: "actionable" | "confirmatory" | "reflexive" | "informative" | "false_positive" | "timeout" | "obsolete";
                            // ⚙️ 关闭时计算（08 §8.8）；告警精度 = actionable / 已关闭。reflexive = 未打开证据即批准
}
```

---

## 2.10 Memory

```ts
interface MemoryItem {
  id: string;
  scope: { kind: "user" } | { kind: "project"; projectId: ProjectId } | { kind: "goal"; goalId: GoalId }
       | { kind: "team"; teamId: string };   // team 仅预留（ADR-013），v1 不实现
  kind: "convention" | "preference" | "gotcha" | "fact" | "decision" | "rejected_approach" | "command" | "constraint";
  text: string;                        // 一条原子事实/约定/偏好，≤ 80 估算 token（ADR-032 口径，约 120 个汉字或 320 个 ASCII 字符）
  detail?: string;                     // 可选补充，只写入 contract.md 按需读取，不常驻
  tags: string[];
  // 其余字段（subjectKey、appliesTo、version/supersedes、pinned、origin、support/contested、taint、
  // retiredReason、sensitivity、sync）定义于 09 §9.2，是本接口的规范扩展
  status: "proposed" | "active" | "retired";
  author: "human" | "agent";
  provenance: { goalId?: GoalId; claimId?: ClaimId; evidence: EvidenceRef[] };
  ratifiedBy?: string; ratifiedAt?: Iso;
  reviewAfter?: Iso;                   // 过期复审
  useCount: number; lastInjectedAt?: Iso;   // ⚙️
}
```

详见 `09-memory-and-learning.md`。

---

## 2.11 Handoff Packet（SBAR）

```ts
interface HandoffPacket {
  situation: { state: LifecycleState; mode?: Mode; criteria: { id: string; status: "met" | "failing" | "unknown" }[] };
  background: { contractVersion: number; decisions: ClaimId[]; humanDecisions: DecisionId[] };
  assessment: { openRisks: string[]; assumptions: ClaimId[]; evidence: EvidenceRef[] };
  recommendation: { nextSteps: string[] };
  readBack?: { restatedGoal: string; mismatch: string[] };   // 接收方复述 + ⚙️ 与合同比对
}
```

用于：上下文压缩后的恢复、返工新 Run、模型切换、人机交接。Situation/Background 由 ⚙️ 从账本生成（不依赖模型摘要），Assessment/Recommendation 由 🤖 填写。

---

## 2.12 Scratch

```ts
interface Scratch {
  id: string;
  sessionId: string;                   // Pi session id；文件位于 ~/.tower/scratch/<id>/session/（06 §6.6.1），路径由 SessionManager 解析；7 天后自动清理（可 pin）
  cwd: string;                         // 临时目录；需要项目上下文时为项目检出的临时副本（CoW），真实检出对 Scratch 只读，其中机密路径与仓库元数据配置文件读拒绝（11 §11.6.5，ADR-176）
  pinned: boolean;
  createdAt: Iso;
  promotedTo?: GoalId;                 // “升级为 Goal”：🤖 从对话起草合同，🧑 批准
}
```

### ImportedSession（只读历史）

```ts
interface ImportedSession {
  id: string;                          // = Pi session id
  sourcePath: string;                  // ~/.pi/agent/sessions/... 原文件（只读引用，不复制、不改写）
  cwd: string; projectId?: ProjectId;  // ⚙️ 若 cwd 属于已知 Project 则关联
  name?: string; firstMessage: string; modified: Iso; messageCount: number;   // 来自 SessionManager.listAll
  promotedTo?: GoalId;                 // 🧑 “从此会话创建 Goal”：会话作为新 Goal 合同起草的背景
}
```

首次运行时 Tower 列出用户既有的 Pi 会话（`SessionManager.listAll`），以“历史”只读视图呈现，不进入 Goal 列表；可搜索、可在 Trace 视图中打开、可升级为 Goal。

Scratch 的约束：不写记忆（默认）、不得在 Project 的真实 checkout 中写文件（只读或临时 worktree）、不出现在 Goal 列表、不产生 Needs-You 以外的通知。

---

## 2.13 Event（Supervisor 事件日志）

事件日志是 Tower 的唯一真相（Pi JSONL 是对话的唯一真相）。所有投影（Goal 卡片、收件箱、简报）都是对事件的折叠。

```ts
interface TowerEvent {
  seq: number;                         // 全局单调递增
  v: number;                           // 事件模式版本（迁移用）
  idempotencyKey?: string;             // 来自引擎/命令的去重键（如 runId+piEntryId、commandId）；重放与崩溃恢复时防重复
  ts: Iso;
  goalId?: GoalId; runId?: RunId;
  source: "engine" | "harness" | "human" | "agent_tool" | "system";
  type: string;                        // 如 "engine.tool_end" | "fact.recorded" | "claim.recorded" | "goal.state_changed" | "human.decision"；Host 事件为 engine. + EngineEvent.t（. 改为 _），唯一规则 06 §6.3（ADR-181）
  payload: unknown;
  causedBy?: number;                   // 因果链：哪个事件触发了它
}
```

保留策略：engine 的 `message_update` 文本增量**不进入**事件日志（Pi JSONL 已有完整消息）；只记录 `message_end`、工具起止、模式变更等离散事件。这使事件日志在 10 个并发 Goal 下保持在每秒几十条量级。

**生命周期与清除（ADR-005 修订）：**

- **分层保留**：Goal 归档或放弃 30 天后（ADR-057），在写出最终投影快照的前提下删除 `engine.*` 细粒度事件；Fact / Claim / HumanDecision / 状态变化 / `audit.*` 事件永久保留。已归档 Goal 从“快照 + 保留事件”重建，不再保证从首条事件完整重放（13 §13.9.3）。
- **墓碑化（隐私清除）**：事件行只存元数据与 `payloadRef`；载荷存于独立的 `payloads` 表。清除时删除载荷、在事件行写入 `tombstone: {reason, at, by}`，并追加一条 `privacy.purged` 事件。审计哈希链对“载荷哈希”而非载荷本身成链，因此清除不破坏链的可验证性（11 §11.11）。HumanDecision 行同样只墓碑化（置空其文本，种类、目标、执行者与时间保留，`06` §6.3 触发器的唯一例外），Goal 行保留为墓碑行；范围只按 `09` §9.12.4（ADR-196）。
- **Pi JSONL**：Tower 从不**改写** Pi 会话文件；清除时整份**删除**相关会话文件（Trace 中显示“已按隐私要求清除”），这是对“不改写”原则的唯一例外形式。

---

## 2.14 UserSettings（注意力与调度）

```ts
interface UserSettings {
  maxConcurrentGoals: number;              // 默认 3（BCG/HBR：约 3 个并行 AI 工具时生产力见顶）
  reviewBacklogLimitLoc: number | null;    // 默认 1500；null = 关闭（ADR-014：WIP 上限，H = C − P − F）
  reviewBacklogMode: "advisory" | "blocking";   // 默认 advisory，E8 通过后默认 blocking
  attention: {
    interruptsPerHour: number;             // 全局打扰预算：只对 L3/L4（系统级通知/声音）扣令牌，默认 6（≈ 每 10 分钟 1 条，ISA-18.2），上限 12。
                                           // L2（应用内）不扣：question/approval 不能因预算被压住（08 §8.5）
    burst: number;                         // 令牌桶容量，默认 3
    focusUntil?: Iso;                      // 专注模式：只放行 L4，结束时投递迷你简报
    lockScreenPrivacy: boolean;            // 默认 true：系统通知中不显示细节
    autoTune: boolean;                     // 默认 true：按告警精度自动调节（severity 3 永不自动压制，08 §8.9）
    digestWatermark: number;               // 攒批摘要的水位线（不推进各 Goal 水位线）
    quietHours?: { start: string; end: string; allowSeverity3: boolean };
    digestTimes: string[];                 // 攒批摘要投递时间，如 ["09:30", "14:00"]
    soundForSeverity3: boolean;            // 默认 false；名称沿用，含义是“L4 投递时发提示音”，也作用于 severity 2 的单向门审批（08 §8.7.2，ADR-209）
  };
  globalWatermark: number;                 // 用户上次查看全局总览时的事件 seq（重入简报）
  watchModeByGoal: Record<GoalId, boolean>;// R12
  locale: "zh-Hans" | "en";
}
```
