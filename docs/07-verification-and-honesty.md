# 07 · 验证与诚实（Verification & Honesty）

> 本文把诚实语法（R1）、完成三态（R2）和例外管理（R5）落实到实现层面，内容包括：Fact 由谁、从哪里、以什么格式产生；Fact 何时失效；验证器如何在干净环境里既快又可信地重跑验收标准；哪些哨兵/检测器产生例外信号，严重度各是多少，如何度量和压低误报。
>
> 依据：`00` R1/R2/R5/R7/R10 与 P9；`02` §2.7 Ledger；`03` §3.4.3 与不变量 I2/I4/I6；ADR-002/003/010/019，以及第 1 轮评审后的 ADR-020（两轨进度）、ADR-021（验证器依赖完整性）、ADR-022（S0 授权）、ADR-024（验收 Fact 不经扩展链）、ADR-031（零机器标准与 artifact）、ADR-037（服务与端口）。默认数值以 `16-registry.md` 为单一来源。研究依据见 `research/theory-brainstorm.md`（下文简写为 *TB*）。

---

## 7.0 设计立场

1. **Agent 的“完成”只是 Claim。** 证据及其领域：失败运行中 45–48%（tau2 单控**客服**场景）与 75.8%（AppWorld 自评轨迹）被 Agent 报告为成功（*TB* A16 Advani 2026，**非编码 Agent 的通用测量**，只说明“自报成功”在多个领域都不可靠）；在**编码**基准 ImpossibleBench 中，Claude 系模型作弊时超过 79% 的手段是改测试；进度自报在执行中段最不可靠（Unreliable Progress Bar，多领域 Agent 基准）。这些数字用来论证原则，不用来设阈值；Tower 自己的阈值来源见 §7.14。因此 Tower 的任何状态转移、进度和绿色标记，都只能来自 Harness 产生的 Fact。
2. **不让 LLM 裁判决定成败。** LLM 判定成功的 AUROC ≤ 0.65（ADR-002）；在 SWE-bench 类任务上，LLM 监视器只抓到 42–50% 的作弊（ImpossibleBench）。LLM 在本文中只有两个位置：独立评审（§7.12）和措辞线索检测器的离线标注（§7.9）。两者**默认关闭**（ADR-019），开启后输出也只是 Claim 或提示，不设置任何状态。
3. **廉价确定性检测优先。** 测试完整性哨兵在 *TB* D 的排序中是 V×F = 25 的第一名。本文所有检测器都基于 git、正则、轻量 AST 模式和退出码，单次检测的目标耗时 < 200 ms（验证器重跑除外）。
4. **平静不等于沉默。** 每个 Fact 都带新鲜度；“Verified” 会过期（I2）；检测器自身的精度也要度量并公开（R10、ADR-010）。

---

## 7.1 诚实语法的数据规则

下列规则是 Supervisor 的断言，违反即为 bug。它们是对 `02` 写入者标记的补充，与之一致。

| # | 规则 | 实现要点 |
|---|---|---|
| H1 | **Fact 只能由 ⚙️ producer 写入**：`observer / verifier / sentinel / detector / radar / accountant`（`02` §2.7）。**验收相关的 Fact（`criterion_check`）只由不经 Pi 扩展链的验证器产生**（ADR-024）；`observer` 转述的 `tool.end` 结果属于观测轨（§7.2.4），不能单独让任何东西变绿。 | `fact.recorded` 事件的 `source` 必须是 `harness`。来自 `agent_tool` 源的事件试图写 Fact 时一律拒绝。 |
| H2 | **Fact 的**判定**字段只取自确定性来源**：退出码、git 对象、文件内容哈希、计时器、解析器对工具输出的结构化解析。 | 精确表述：模型生成的文本可以作为 Fact 的**被观测对象**原样记录（例如 `command_result.command` 是模型写的命令，`outputTail` 是模型代码的输出），但不能成为**判定**字段（`verdict`、`exitCode`、`counts`、`passed`）的来源；判定由 Harness 代码对观测对象计算得出。 |
| H3 | **Claim 永不渲染为绿色**，也不参与任何“通过”计数。 | 组件库的 `<ClaimText>` 没有 success 色这个变体。 |
| H4 | **Claim 只能“链接”到 Fact**，由交叉校验器（§7.8）给出 `consistent / contradicted / unbacked / unchecked`；`contradicted` 再分为**硬矛盾**与**软矛盾**（§7.8.1）。 | `consistent` 的显示是“有 N 条事实支持”，而不是“正确”。只有硬矛盾使用 danger 色。 |
| H5 | **每个依赖代码状态的 Fact 必须带 `workspaceFingerprint`**（以及适用时的 `atCommit`）。 | 没有指纹的代码类 Fact 在写入时就被拒绝。 |
| H6 | **新鲜度是派生值**（🔁），每次渲染都用当前指纹重新计算，从不存储“fresh”。 | 见 §7.3。 |
| H7 | **历史观测与当前状态分开显示。** `command_result` 记录的是“当时它退出 1”，属于历史；`criterion_check` 记录的是“在提交 X 上该标准是否成立”，属于状态。 | UI 中 `command_result` 只出现在时间线、证据和**观测轨 O/M**（§7.2.4）里，从不计入**已验证 V/M**。 |
| H8 | **检测器的命中是 Fact，对命中的解释是 Claim。** “`tests/a.test.ts` 删除了 3 个 `expect(`”是 Fact；“这可能是在削弱测试”是检测器附带的提示文本，按说法样式显示（`12` §12.5：虚线左边框 + 标签；Harness 推断带 `⚙ 规则推荐` 前缀）。 | `sentinel` Fact 的 `data.observations` 和 `data.hint` 分开存放。 |
| H9 | **Harness 的推荐也按 Claim 语法显示。** 例如 `NeedsYouItem.recommendation.by = "harness"`。 | 推荐是推断，不是事实。 |
| H10 | **任何“通过”都带分母**：`12/12 passed (inventory 12, base 14)`。 | 分母为 0 的通过叫 `vacuous`，按失败处理（§7.4.5）。 |

---

## 7.2 Fact 生产者：观察器（Observer）

观察器运行在 Supervisor 内，订阅 Engine Adapter 转发的 `AgentSessionEvent`（SDK 用 `session.subscribe`，RPC 读 stdout 事件流）。它**不依赖**模型调用任何工具。`tool_execution_end` 携带的是经过所有 `tool_result` 处理器改写后的结果，因此有一条硬约束：Pi 规定，`tool_result` 处理器只替换 `content`、不返回 `structuredContent` 时，结构化结果会被**丢弃**（`extensions/types.ts` `ToolResultEventResult` 注释），退出码也随之丢失。`11` §11.7 的密钥脱敏正是通过改写 bash 的 `content` 实现的，所以 tower-goal 的脱敏处理器**必须同时返回同样脱敏过的 `structuredContent`**（保留 `exit_code` 与 `wall_time_seconds`）。观察器发现 bash 结果缺少 `structuredContent`、而文本中又没有超时或中止的标记时，记 `outcome: "no_exit_code"`，并发出一条系统警告“有扩展丢弃了结构化结果”（ADR-004 约束）。

观察器同时为 Live Line 提供**可转向的细节**（R12、`01` §1.4 第 1 条），格式为 `mode · 动作 · 对象`（渲染规则以 `12` §12.6.4 为准）：`edit` 的对象是路径和 `+a−d`（从 `details.patch` 计算）；`bash` 的对象是命令的前 60 个字符和已运行时长，失败时附上解析出的第一个失败测试名；`write` 的对象是路径和字节数。这些细节都是 Fact，不来自模型文本。

### 7.2.1 事件 → Fact 映射

| Pi 事件 | 条件 | 产生 | 说明 |
|---|---|---|---|
| `tool_execution_start{toolCallId, toolName, args}` | 任意 | 内存态 `pendingTool[toolCallId] = {args, t0}` | 供 Mode（`08`）和 stall 检测使用；不落盘为 Fact |
| `tool_execution_end{toolCallId, toolName, result, isError, durationMs}` | `toolName == "bash"` | `command_result` | 见 §7.2.2 |
| 同上 | `toolName == "edit"` 且 `!isError` | `files_touched`（增量）+ 编辑记录 | `result.details: EditToolDetails{diff, patch, firstChangedLine}`，`patch` 是标准 unified diff |
| 同上 | `toolName == "write"` 且 `!isError` | `files_touched`（增量） | **`write` 的 `details` 为 `undefined`，没有 diff。** 内容差异由 §7.2.3 的 git 计算得到 |
| 同上 | 任何**变更类工具调用**（唯一定义在 `16`：只读白名单之外的任何工具调用，含嵌套调用、MCP 与扩展工具，ADR-130） | 触发指纹重算（防抖 500 ms） | bash 能改任何文件，因此每次 bash 结束后都要重算 |
| `turn_end` | 任意 | 检查点（`03` §3.4.2）+ `diffstat` + `files_touched`（快照） | 与指纹共用同一次 `write-tree`（§7.3.2） |
| `message_end`（assistant，含 `usage`） | 任意 | `budget`（累积） | accountant producer |
| Engine Host 心跳 | 每 5 s | `heartbeat`（只进内存，每 60 s 落盘一次） | 见 `08` §8.6 |

### 7.2.2 `command_result` 的来源与格式

Pi 的 bash 工具声明了 `outputSchema`（`tools/bash.ts`），正常结束时 `result.structuredContent` 为：

```ts
{ output: string;            // stdout+stderr 合并（可能截断，上限 STRUCTURED_OUTPUT_MAX_BYTES）
  truncated: boolean;
  full_output_path?: string; // output 超过 1 MB 被截断时完整输出所在的临时文件（显示截断 > 50 KB 时文件就已存在，路径在 details.fullOutputPath）
  exit_code: number;
  wall_time_seconds: number }
```

非零退出码时 `isError = true`，但 `structuredContent` 仍保留。**超时、中止或无退出码时，工具会抛错**：此时没有 `structuredContent`，只有包含 `Command timed out after N seconds` 或 `Command aborted` 的文本。观察器按下列方式归一：

```ts
interface CommandResultData {
  toolCallId: string;
  command: string;                 // args.command 原文
  normalized: string;              // §7.7.1 的归一化形式（用于循环检测、去重）
  class: CommandClass;             // 见下
  outcome: "exit" | "timeout" | "aborted" | "no_exit_code" | "spawn_error";
  exitCode?: number;               // 仅 outcome=="exit"
  wallTimeSec?: number;            // structuredContent.wall_time_seconds
  durationMs: number;              // tool_execution_end.durationMs（含工具框架开销）
  outputTail: string;              // 末尾 40 行（掩码后，§7.6.6 密钥掩码）
  failureSignature?: string;       // §7.7.1
  fullOutput: EvidenceRef;         // {type:"log"}：观察器把全文复制到 ~/.tower/goals/<goalId>/logs/<toolCallId>.log（Pi 的全文文件
                                   // 存在且通过下方校验时取它，否则取 output 或错误文本）；复制之后删除该文件（唯一定义，ADR-221/222/224；
                                   // Pi 自己不删除它，S2 下 Agent 也读不到它，11 §11.7.1 残余）。路径只取该调用 tool_execution_end 的最终
                                   // details.fullOutputPath：正常结束与非零退出码、且截断时才有（bash.ts:342-343；structuredContent.full_output_path
                                   // 只在超过 1 MB 时出现，:24, 390-396）；tool_execution_end 立即转发、永不丢弃（13 §13.2 ②、05 §5.4.7）。
                                   // 超时、中止与无退出码时工具抛错、没有最终的 details（:371-388），不复制，全文取错误文本——它只是 Pi
                                   // 截断后的尾部（≤ 50 KB / 2000 行）加状态行：错误文本带 Pi 的截断后缀 [Showing … Full output: <path>]（曾被截断；按状态行之前的这一后缀匹配，不按子串，bash.ts:348-352，ADR-226）时，日志视图与 O 的
                                   // 标签写“截断的输出（尾部）”、不写“完整日志”，证据副本中该行注明“（全文未保留）”（ADR-225，00 §0.5.1）；标签按是否得到全文推导（ADR-226）：正常结束且截断、但全文文件未通过校验或已不在而取 output 时同样写“截断的输出（尾部）”；不再从流式更新或
                                   // 错误文本中取路径（ADR-224）。复制与删除共用同一次校验：路径是承载本 Run 的 Host 的临时目录
                                   // ~/.tower/tmp/<hostId>/ 的直接子项（05 §5.3.6 临时目录一行）、名字为 pi-bash-<16 位十六进制>.log
                                   // （utils/output-files.ts:17-19、bash.ts:424），再以不跟随链接的方式打开一次，复制取自这次打开，删除前确认
                                   // 该路径仍是同一文件；校验不过或文件已不在（Host 已退出、目录已删除）时既不复制也不删除。没有复制的全文
                                   // 文件（含 Pi 建了文件而最终 details 没有路径的情形，05 D61）随该 Host 的临时目录删除：删除由目录的生命周期
                                   // 保证，不依赖观察器。S0 下同样如此，Pi 截断提示所指的文件随之不在（需要全文时重跑并重定向输出）
  parsedTests?: TestCounts;        // §7.4.5 解析器在可识别时填写（观察器侧为“尽力而为”）
  workspaceFingerprintBefore: string; workspaceFingerprintAfter: string;
}
type CommandClass = "test" | "lint" | "typecheck" | "build" | "install" | "git" | "vcs_write"
                  | "snapshot_update" | "network" | "destructive" | "other";
```

`CommandClass` 由规则表判定（按顺序取第一个匹配，各项目的 VerifyProfile 可以追加规则）：

| class | 匹配（正则，作用于 normalized） |
|---|---|
| snapshot_update | `(\s-u\b|--update-snapshots?|--snapshot-update|UPDATE_SNAPSHOTS=1|INSTA_UPDATE=(always|new)|cargo insta (accept|review)|go test .*-update\b)` |
| test | `\b(vitest|jest|mocha|ava|playwright test|pytest|py\.test|tox|nox|go test|cargo (nextest|test)|node --test|bun test|deno test)\b`、`\b(npm|pnpm|yarn|bun) (run )?test\b`，以及项目 VerifyProfile 中标记为 test 的命令 |
| lint | `\b(eslint|biome (check|lint)|ruff|flake8|pylint|golangci-lint|cargo clippy|prettier --check)\b` |
| typecheck | `\b(tsc|vue-tsc|mypy|pyright|cargo check)\b` |
| build | `\b(vite build|webpack|tsup|esbuild|go build|cargo build|make\b|turbo run build)\b` |
| install | `\b(npm (i|install|ci)|pnpm (i|install|add)|yarn (add|install)?|pip install|uv (add|sync|pip)|poetry (add|install)|cargo add|go get|go mod tidy)\b` |
| git / vcs_write | `^git (status|diff|log|show)` → git；`^git (commit|push|reset|checkout|rebase|merge|stash|clean)` → vcs_write |
| destructive | `\brm\s+-[a-z]*r[a-z]*f|\bgit clean -[a-z]*f|\bdd\b|\bmkfs|DROP (TABLE|DATABASE)` |

这些类别的用途：交叉校验（“声称测试通过”需要找到 `class=test` 的结果）、循环检测、哨兵（`snapshot_update`、`install`），以及验证档案学习（`09` §9.7）。

### 7.2.3 `files_touched` 与 `diffstat`（git 推导）

`write` 不给 diff，bash 也可能改任意文件，因此 **git 是 Changes 唯一可信的来源**（与 *pi.md* §13.7 一致）。工具事件只用来标注“哪个回合、哪次调用碰过哪个 hunk”。

```
on turn_end or debounced(mutating tool end):
  tree  = worktreeTree(g, "decisive", L)         # §7.3.2，同时给出指纹；L 取当时的清单（10 §10.7.1 第 1 步）
  prev  = lastTree[goal, binding]
  delta = git diff-tree -r --numstat -z --find-renames prev tree
  files_touched.append({ runId, turnIndex, toolCallIds: mutatingCallsSince(prevTurn),
                         paths: delta.paths, renames: delta.renames, treeBefore: prev, treeAfter: tree })
  diffstat = git diff-tree -r --numstat -z --find-renames baseCommit tree   # 相对 base 的累计
  record Fact{kind:"diffstat", data:{files, added, deleted, binaryFiles, perDir}, workspaceFingerprint: fp(tree)}
```

- 归因：同一回合里如果只有一个 `edit`/`write` 碰过某路径，就把该路径归到那个 `toolCallId`；其余变化归到同回合的 bash 调用（多个 bash 时归为“bash（本回合）”）。`edit` 的 `details.patch` 用来把 hunk 精确对应到调用。
- `files_touched` 是**本次 Run** 的触及集合（`02` 定义），`diffstat` 是**相对 baseCommit** 的累计。两者都是 Fact。

### 7.2.4 两轨进度：已验证 V/M 与 观测到 O/M（ADR-020）

运行期进度的**唯一口径**。卡片、Goal 页、简报、重入简报、站会摘要、燃烧检测（§7.7.2）、交接包都使用本节的函数，不再出现单一的 N/M。

```ts
// ADR-052（唯一定义，登记于 16 §16.1）：M = 机器标准（exec + artifact）条数。
// human 标准（含 subgoal_accepted）另列为“人工 h/k”，用 Human 语法显示，**永不进入 V 或 O**，也不着绿。
function progress(goal: Goal, fpNow: string): { V: number; O: number; M: number; humanChecked: number; humanTotal: number } {
  const machine = goal.contract.criteria.filter(c => c.kind === "exec" || c.kind === "artifact");
  const verified = (c) => {
    const f = latestCriterionCheck(goal, c.id);                 // producer: "verifier"（ADR-024）
    return f && freshness(f, fpNow) === "fresh" && isVerifiedPass(f.data)
        && !(f.data.trigger === "opportunistic" && !lbCleanAt(goal, f.atCommit))     // ADR-053 守卫，见下
        && !(c.kind === "artifact" && f.data.reason === "links_deferred");          // 外部链接尚未检查，见下
  };
  const observed = (c) => verified(c) || observedPass(goal, c, fpNow);
  const human = goal.contract.criteria.filter(c => c.kind === "human" || c.kind === "subgoal_accepted");
  return { V: machine.filter(verified).length, O: machine.filter(observed).length, M: machine.length,
           humanChecked: human.filter(isChecked).length, humanTotal: human.length };
}
// 观测通过：本 Goal 的 command_result 中存在一条
//   ① normalized 命令与标准命令“等价”（去掉 Tower 注入的 reporter 参数后字符串相等；或二者解析到同一个
//      未修改的脚本定义，§7.5.1 criterionIndirection）；
//   ② outcome == "exit" 且退出码满足 expect.exitCode；
//   ③ workspaceFingerprintAfter == fpNow（对当前内容新鲜）。
// artifact 的观测通过：最近一次内置检查（不含外部链接）通过，或机会式结果被 ADR-053 守卫挡下。
// 观测轨来自 tool.end，可能经过扩展改写（ADR-024），也可能运行在 Agent 可写的依赖上——所以它只计入 O，从不计入 V。

// ADR-053：L-b 层的廉价静态检查在该 pin 上是否“干净”——TestPathSet（§7.5.1）、标准命令引用的脚本定义
// （criterionIndirection）、测试配置，相对 base 没有未处置的改动（未被 allow 策略放行、未被 override）。
function lbCleanAt(goal, pin): boolean { … }
```

- **O ⊇ V**：O 回答“有迹象表明多少条已经通过”，V 回答“其中多少条由 Tower 在干净环境里确认”。G-0142 有 4 条机器标准与 1 条人工标准时显示为 `已验证 2/4 · 观测到 3/4 · 人工 0/1`（视觉语法见 `12`：V 为事实语法，O 为“Agent 环境观测”语法，人工为 Human 语法）。
- **过期结果两轨都不计入。**
- **artifact 标准**：除外部链接以外的内置检查由验证器直接读取文件（§7.4.9），足够便宜，可在每次指纹变化后立即执行。**外部链接检查（`links_reachable`，M2，ADR-183）在每次正式验证（一切非 `opportunistic` 的触发）中执行**，并且需要合同为该标准声明网络权限（R2-D7-05）；机会式验证不做外部请求，结果为 `reason:"links_deferred"`，只计入 O，不计入 V。
- **ADR-053 守卫：** 机会式验证不跑哨兵全套，所以它的通过结果在计入 V 之前要求该 pin 上 L-b 层静态检查是干净的；否则以“有保留的已验证”显示，只计入 O（R2-D7-03）。正式验证（claimed 等）由 `decide()` 的阻断集合把关，不需要这条守卫：正式验证在任何提前返回之前运行 L-c 静态哨兵，并在有可运行的 exec 标准时总是运行测试清单——即使 exec 标准的结果全部命中缓存（包括机会式验证写入的结果）；缓存只复用标准结果（唯一规则在 §7.4.1 `verify()`，ADR-183）。
- **`isVerifiedPass(data)`**（按 `criterion_check.data` 判定，ADR-183）：`reason:"links_deferred"` 的结果一律不计入（未检查的链接永远不算通过）；其余按 verdict——`pass` 计入；`pass_with_preexisting_flakes`（§7.4.6）计入，但带“有保留”限定（`12` 的“有保留的已验证”变体）；`S0` 环境下（已授权）的通过同样带限定。M1 中非 Node 生态的 exec 标准不由验证器执行（ADR-064），只计入 O。其余 verdict 都不计入。
- **`cleanEnv:false` 在 v1 中不再改变判定**（R1-D7-06）：所有 exec 标准都由验证器在干净环境中验证；Agent 环境的结果永远只进入 O。

**机会式验证**（让 V 在运行中前进，ADR-020）：

```
eligible(goal) = goal.state == "running"
              && 该 Goal 不在检验打开期间（唯一定义在 `10` §10.8.3 第 7 步）
              && 指纹自上次变化起稳定 ≥ 120 s
              && now − lastOpportunistic(goal) ≥ 10 min（超出 16 §16.2.3 的每 Goal 核分钟上限时 10 → 20 → 40 min）
              && 正式验证队列为空 && 有空闲且内存已预留的槽位（ADR-042，§7.4.10）
on eligible: enqueue(verify(goal, trigger="opportunistic"))，优先级最低（§7.4.10）
  - 只跑 exec 标准（artifact 的非链接检查本来就随时执行），不跑测试清单与哨兵全套，不做 flake 重跑；计入 V 前过 ADR-053 守卫
  - 预期频率：参考配置下每 Goal 约每 20–25 min 一次（§7.4.10 演算；核心分钟上限把槽位允许的 15 min 下限压到约 20 min，`13` §13.8.3）
  - 结果照常写 criterion_check（producer:"verifier"，带 atCommit = 机会式 pin）；正式验证可以复用它（同指纹缓存），但哨兵与测试清单照常运行（§7.4.1，ADR-183）
  - 有更高优先级任务到来时立即中止并让出槽位（中止的结果不写入）
  - 失败只更新 V/O 显示与重入简报，不触发返工、不生成 Needs-You（Agent 仍在工作，失败是正常的中间态）
```

---

## 7.3 工作区指纹与新鲜度

### 7.3.1 为什么不能只用 `git status --porcelain`

porcelain 输出只说明“哪些路径有变化”，不包含内容。同一个文件先后两种不同的修改会得到相同的 `M src/a.ts` 行。题设公式 `HEAD + hash(porcelain) + untracked 内容哈希` 漏掉了**已跟踪文件的修改内容**，必须补上。最简单、正确且便宜的做法是**用临时索引把整个工作区写成 git tree**：tree 哈希天然包含已跟踪修改和未跟踪（未忽略）文件的内容，而且 `git add` 会利用索引的 stat 缓存，只对 stat 变化的文件重新计算哈希。

### 7.3.2 算法

**git 隔离前提（ADR-060、ADR-071、ADR-073）：** Goal 的工作目录是**卫星克隆**；卫星工作目录中没有 `.git`，它的 gitdir 分离在 `<wtRoot>/_gitdirs/<goalId>`，Agent 经 PATH 首位的 Tower git 垫片使用（垫片只对在卫星内运行的 git 注入 `GIT_DIR`/`GIT_WORK_TREE`，ADR-088；对环境中**继承来的**、指向卫星 gitdir 的这两个变量同样逐次判定，`init`/`clone` 或在卫星之外运行时先移除再执行真实 git，ADR-090）。gitdir **整体归 Agent 所有、可写**（ADR-089）：Tower **不读取其中的配置、索引或 ref 作为任何判定依据**。安全边界只有两条不变式：S2 拒绝在卫星工作目录任意深度创建名为 `.git` 的条目；沙箱外进程环境含 `GIT_CEILING_DIRECTORIES=<全部 wtRoot>`。Tower 对卫星及其 gitdir 的原始文件操作只有创建、整体删除、整体重建三类，均以 `O_NOFOLLOW`、只接受普通文件与目录、带超时的方式进行，重建在旁路目录完成后以 `rename` 原子替换（ADR-089）；生成 seal 说明需要 Agent 的提交信息时，Tower **不在卫星 gitdir 上运行 git**，而是自行只读解析普通文件（ADR-100）：`HEAD` → ref 文件或 `packed-refs` → 提交对象（loose 对象 zlib 解压，或按 pack 的 `.idx` 定位），单对象 ≤ 1 MB、总计 ≤ 200 个提交、`O_NOFOLLOW`、带超时；不读 config、include、alternates；解析失败则省略提交信息。至此 Tower 对卫星 gitdir 只有创建、整体删除、整体重建、只读解析提交对象四种操作。解析器的进程、内存与 delta 限制以 `10` §10.1.3 为准。seal 说明的结构以 `10` §10.6 为唯一定义，共四段：① Goal 标题与合同摘要（Tower 生成）；② 可选的“人的说明”（交还与检验带回时人写入的 `sealNote`）；③ “Agent 提交记录（声明）”，逐条缩进引用 Agent 的提交信息，去除其中任何 trailer 形态的行（解析失败或无 Agent 提交时省略）；④ Tower 独占生成的 trailer 块（集合登记于 `16`）。Agent 文本无法伪造 trailer。Tower 的所有 git 操作——指纹、检查点、验证 pin、diff、评审单元、seal——都在 **Tower 影子 git 目录** `~/.tower/goals/<goalId>/git/<projectId>.git`（裸库，Agent 不可写，alternates 指向该 Project 的 **Tower 镜像库** `~/.tower/projects/<projectId>/mirror.git`，ADR-073）中执行，从不经卫星的 `.git` 发现仓库，也从不读卫星的 config、index 或 hooks。

**唯一加固清单在 `10` §10.1.2**（影子上下文的环境变量与 `-c` 选项、只允许执行 git 的 OS 沙箱档位、`info/exclude` 模式的复制、换行策略）；本文用 `towerGit(shadow, worktree, args)` 指代“按 `10` §10.1.2 影子上下文执行”，不另列选项（R4-D13-06）。

**嵌套仓库与逃出仓库的符号链接：`pinSafetyCheck`（ADR-109，取代 ADR-106 的“物化 + 排除”）：** 要防住的是 Agent 造出的仓库形态内容或越界符号链接随 pin/seal 落入用户仓库。唯一的权威检查是一个**只依赖两个 tree 哈希**的确定性函数：

```ts
function pinSafetyCheck(baseTree: Sha, pinTree: Sha): SentinelHit[] {
  // 在影子中读取：git ls-tree -r、git diff-tree -r --no-renames <baseTree> <pinTree>、必要时 cat-file 读链接目标
  // 不物化、不依赖槽位、与执行时机无关：同一 (baseTree, pinTree) 的结果永远相同。名字比较规则以 10 §10.1.2 为唯一定义：
  // 去除 Unicode 默认可忽略码位（Default_Ignorable_Code_Point）→ NFKC 规范化 → 大小写折叠（ADR-120）
  const norm = (n: string) => casefold(stripDefaultIgnorable(n).normalize("NFKC"));
  const isMarker = (e) => (e.type === "blob" || e.type === "symlink") && ["head", "commondir", "gitdir"].includes(norm(basename(e.path)));
  // ① 仓库形态候选目录：在 base tree **或** pin tree 中直接含有标记条目（文件或符号链接）的目录；名为 head 的**目录**不算。
  //    **根目录是显式候选**：根目录直接含标记条目时同样适用（ADR-116）
  const candidates = new Set([...dirsWithMarker(baseTree, isMarker), ...dirsWithMarker(pinTree, isMarker)]);   // 可能含 ""（根）
  const under = (path: string, d: string) => d === "" || path === d || path.startsWith(d + "/");
  const hits = [];
  for (const e of diffEntries(baseTree, pinTree)) {             // 增、删、改（含模式变化）
    for (const d of candidates) if (under(e.path, d)) hits.push({ detector: "nested_repo", subject: d || "/" });
  }                                                             // 覆盖标记文件增删改、config/hooks/alternates 修改、
                                                                // objects/ 或 refs/ 增删、删除 commondir 等全部变体（ADR-111）
  // ② 符号链接（ADR-112、ADR-116、ADR-124）：对 pin 中**全部**符号链接在 pin tree 内按 POSIX 语义解析整条链
  //    （链中的符号链接按其在 tree 中的目标继续解析，深度上限 40）。“不安全”= 最终路径为绝对路径或越出仓库根；成环或超限；
  //    经过 tree 中**不存在**的路径分量（如被忽略的依赖目录、.git，保守处理）；经过名字（按 norm）等价于 .git 的分量
  for (const e of allEntries(pinTree).filter(e => e.type === "symlink")) {
    const inPin = resolve(pinTree, e.path, { maxDepth: 40, norm });
    if (inPin.safe) continue;
    const inBase = existsIn(baseTree, e.path) ? resolve(baseTree, e.path, { maxDepth: 40, norm }) : null;
    const hit = isAddedOrChanged(baseTree, pinTree, e.path)           // 新增或改变的链接
             || (inBase && inBase.safe)                                // base 中解析安全、pin 中不安全（经过的目录被换掉等）
             || (inBase && inBase.finalPath !== inPin.finalPath);      // base 中的解析结果与 pin 中不同
    if (hit) hits.push({ detector: "symlink_escape", subject: e.path });
    else trustPromptOnly.push(e.path);                                 // base 中原本就不安全且解析结果未变：不命中，只在信任提示中列出
  }
  return dedupeBySubject(hits);
}
```

- **处置：不排除，只阻断**（ADR-109）。命中即 `sentinel`，severity 3，pin 推导，阻断 Verified 与集成；**pin 不被修改**，因此无需重新生成 pin。人可以 `override_sentinel`（结构化原因），或请求返工，让 Agent 撤销这些变化。
- **覆盖的绑定（ADR-112）：** 覆盖绑定 `(detector, subject, subject 在 pin 中的对象哈希)`——`nested_repo` 的 subject 是仓库形态**目录**，哈希取其 tree 哈希；`symlink_escape` 取链接的 blob 哈希。之后该目录或链接的任何变化都使覆盖失效并重新阻断（R11-D11-04）；seal trailer `Tower-Override` 记录被覆盖的路径与哈希。
- **覆盖对话框（ADR-116、ADR-124）：** 以 Fact 形式列出该目录相对 base 被改动的文件与**全部**被改动的配置键；其中属于“值会被 git 当作命令执行、或使 git 读取其他路径的键”的高亮显示。该键清单的唯一定义在 `16`，本文只引用；清单不全只影响高亮，不影响写出（写出已是白名单）。
- **覆盖之后的写出（ADR-124，白名单）：** pin 与 seal 中保留 Agent 的版本（人的显式决定）；两种检出中，被覆盖的仓库形态目录里**只有纯数据条目**——`objects/**`（不含 `objects/info/**`）、`refs/**`、`packed-refs`——写出 pin 版本；其余一律写出 **base 版本**，base 中没有的则不写出。
- **执行位置**：`verify()` 的**第一步**，在一切提前返回（缓存命中、仅 artifact、S0、子模块、生态不支持）之前（§7.4.1）；验收与 seal 时对同一 pin tree 再执行一次（廉价，结果相同，作为防篡改复核）。属于不降级的闸口。
- **base 中原本就不安全、解析结果也未变的符号链接**不命中，只在信任提示中列出，并照常写出到两种检出（它本来就在用户的主检出中，ADR-124）。
- **未改动的 base 夹具**（候选目录下没有任何变化）不命中，按普通内容进入 pin、seal 与评审，照常写入两种检出（与用户主检出中已有的内容一致）。**被改动的**夹具目录命中 `nested_repo`，在覆盖之前不写入两种检出（ADR-111 第 3 点）。由此，两种检出中不会出现 Agent 改过的 git 元数据（R11-D11-01、R11-D3-01b）。
- **前提（R11-D3-01a、R11-D11-02）：** 规则基于“目录中存在标记条目”这一 git 识别仓库的必要条件，并对候选目录下的任何变化都触发，因此不依赖对 git 判定细节的重演。名字比较按 `10` §10.1.2 的唯一定义（ADR-120），该规则覆盖 HFS+ 忽略的码位。
- **两种检出的写出规则：** 人工编辑检出与检验检出从影子树（或检查点树）物化，**不写出** `pinSafetyCheck` 中尚未覆盖的命中路径（目录含子树）；已覆盖的目录按上一条写出 git 元数据的 base 版本。**依赖目录（ADR-116）：两种检出物化依赖后，对依赖目录做同样的名字扫描，命中的仓库形态目录不写出并在信任提示中列出。** 信任提示列出全部未写出的路径及其原因。
- **早期预警（卫星侧，不作为 Verified 依据，也不影响任何树的内容）**：ADR-101 的名字粗筛 + git 确认继续在检查点时增量运行（S2 下以文件系统事件维护候选集，写回后全量），只用于运行中尽早提示 Agent 与人。它依赖 git 在 Tower 沙箱中的判定，读被拒绝时与“不是仓库”无法区分，所以只作提示，结论只来自 `pinSafetyCheck`（R10-D3-01）。
- **gitlink**：影子索引中若已有 gitlink，先 `update-index --force-remove`；gitlink 永不进入影子索引。

```ts
// 结果：fingerprint = "wt1:" + treeSha [+ ":weak"]
// 排除什么的唯一定义在 10 §10.7.1 第 1 步（ADR-207）：(a) .git 条目、(b) gitlink、(c) git 拒绝收录的路径、(d) 本地文件排除集 local。
// local 由调用方给出：新建检查点或 pin 时为当时求值的集合（结果写进该提交的 Tower-Local-Exclude trailer），
// 与某个检查点或 pin 比较时为该提交记录的集合——清单变化因此不单独引起 I2 或 external_change。
async function worktreeTree(g: GoalBinding, mode: "advisory" | "decisive" | "full", local: string[]): Promise<{ tree: Sha; fp: string; excluded: string[]; refused: string[]; weak?: boolean; tempIndex?: string }> {
  const excluded = nestedGitDirEntries(g.satellite);             // (a)(b)：避免 add -A 进入其中；仓库形态内容本身不排除，由 pinSafetyCheck 阻断
  // decisive：影子自有索引（Agent 不可写）+ core.trustctime=true、core.checkStat=default 的 stat 检查（含 ctime 与 inode，
  //           无特权进程无法伪造），只重新哈希 stat 变化的文件（ADR-075）
  // full：全新临时索引，全部重新哈希；只在验收（accept）与 seal 两个闸口执行
  // advisory：与 decisive 相同的影子索引，另外排除 > 50 MB 的大文件以提速（结果标记 weak，只用于显示）
  const index = mode === "full" ? await freshTempIndex(g.shadow) : `${g.shadow}/index`;
  const env = { GIT_INDEX_FILE: index };
  await dropIndexEntries(g, index, local);                       // (b) gitlink 与 (d) 已在索引中的条目先 update-index --force-remove
  // git 拒绝收录的路径（protectHFS/NTFS）：唯一定义在 10 §10.1.2、§10.7.1——按 §10.1.2 的名字规则一次列出全部、
  // 一次排除；不设重试上限，重试只是后备。这里只取其结果。
  const refused = listGitRefusedPaths(g.satellite);               // 10 §10.1.2
  await towerGit(g.shadow, g.satellite, ["-c", "core.trustctime=true", "-c", "core.checkStat=default",
                 "add", "-A", "--", ".", ...[...excluded, ...refused, ...local].map(p => `:(exclude)${p}`),
                 ...(mode === "advisory" ? bigFileExcludes(g) : [])], env);   // ADR-086：decisive/full 收录全部文件
  const tree = (await towerGit(g.shadow, g.satellite, ["write-tree"], env)).trim();
  // full 的临时索引不在这里删除：调用方与紧邻的 decisive 比较，不一致（stat_cache_mismatch）时以它取代影子索引，一致时删除
  // （唯一定义 10 §10.7.1 第 1 步“忽略规则不追溯”，ADR-211/212）
  // 指纹不含本地文件：criterion_check 记录的指纹是 wt1:${tree}，新鲜度只按 tree 比较（§7.3.3）；本地文件的变化
  // 只在下一次验证时经 envHash 体现（§7.4.1 verify()、§7.4.3，ADR-173/174）
  const weak = mode === "advisory" && bigFileExcludes(g).length > 0;
  return { tree, fp: `wt1:${tree}` + (weak ? ":weak" : ""), excluded, refused, weak, tempIndex: mode === "full" ? index : undefined };
  // 07 中的后果（§7.10.1）：refused 记入检查点 excludedPaths → nested_repo（不可覆盖，唯一出口是删除这些条目）；
  // running 中 → nested_repo_live → paused(sentinel_high)；任何情况下都不是 verify_env_error（ADR-139）
}
```

**两种模式（ADR-075，R4-D10-01）：**

| 调用方 | mode | 理由 |
|---|---|---|
| Live Line 的显示 | `advisory`（同 decisive，但排除 > 50 MB 文件，结果为弱指纹） | 只影响显示 |
| 观察器的指纹（`command_result` 前后、观测轨 O/M 的新鲜度）、检查点、验证 pin（§7.4.1）、验收面板/评审单元打开、`in_review` / `accepted` 期间的 I2 判定（`submit` 有效性按 ADR-121 只看工具事件，不用指纹） | `decisive`（影子索引 + ctime/inode stat 检查，收录全部文件） | 影子索引归 Tower 所有，stat 检查包含 ctime 与 inode，Agent 无法伪造；`in_review` 期间也没有 Agent 在运行 |
| `accept` 动作、seal | `full`（全新临时索引，完整重哈希） | 最后两道闸口，一次性付出完整成本；在验收面板以进度显示，不阻塞 UI |
| `in_review` / `accepted` 期间的监视 | 文件系统事件驱动（Supervisor 在沙箱外以 FSEvents/inotify 监视卫星）+ `decisive` | 取代每 60 s 的定时巡检。监视建立或重新建立时（含 Tower 启动后）先执行一次 decisive，覆盖未监视期间的写入（ADR-195）。**丢事件处理（R5-D10-02）：** FSEvents 报告 `MustScanSubDirs`、`UserDropped` 或 `KernelDropped` 标志，或 inotify 报告 `IN_Q_OVERFLOW` → 立即执行一次 decisive；inotify watch 数达到上限或监视建立失败 → 该 Goal 退回每 60 s 一次 decisive 巡检，并在 Fact 新鲜度旁注明“监视降级” |

`full` 的结果与紧邻的 `decisive` 结果不一致时，以 `full` 为准，记录 `anomaly{detector:"stat_cache_mismatch"}`，清空该 Goal 的影子索引（即以这次 `full` 的临时索引取代它，`10` §10.7.1 第 1 步“忽略规则不追溯”，ADR-211），并按 I2 与 `external_change` 的分界（唯一定义在 `10` §10.3.1，ADR-128）处理：变化的路径按归因表分类，可归因者按 I2 回到 `verifying`，来源不明者进入 `paused(external_change)`，不先验证（ADR-176）。

**成本（ADR-075，以 SP5 实测为准）：** 无变化的 `decisive` 检查，2 万文件 ≤ 150 ms（实测 100–150 ms）；`full` 按仓库规模登记于 `16`（参考：2 万文件 2.6–7.2 s，5 万文件热 4.7–9.5 s、冷约 15 s）。不再有“≤ 30 ms 快路径”或“3 万文件 ≤ 2 s 的决定性指纹”这两个说法。

**pin 与检查点的创建（ADR-060 第 5 条）：** 检查点树的**唯一定义在 `10` §10.7.1**（R11-D13-01）；它与 pin 使用同一个 `worktreeTree(g, "decisive", local)`，排除什么以该处为准（含本地文件排除集，ADR-207）；不排除大文件，不受早期预警影响，因此结果只取决于工作区内容、排除集与影子索引已收录的路径（忽略规则不追溯，`full` 以同一组路径初始化，`10` §10.7.1 第 1 步，ADR-211）。下面只示意两者的关系：

```
checkpoint: tree = worktreeTree(g, "decisive", L).tree                     # L = 当时求值的本地文件排除集，记入提交的 trailer（10 §10.7.1 第 1 步）
            c = towerGit commit-tree tree -p <prevCp 或 baseCommit>          # 对象写入影子目录
            towerGit update-ref refs/tower/<goalId>/cp/<n> c                 # 影子目录内
pin:        tree = worktreeTree(g, "decisive", L).tree
            p = towerGit commit-tree tree -p <baseCommit>                       # 父 = base：diff base..pin 即本 Goal 的完整改动（与检查点链无关）
            towerGit update-ref refs/tower/<goalId>/pin/<k> p
            验证槽位直接从影子目录检出 p（§7.4.2），不需要进入用户仓库
需要进入用户仓库时：**只有两类 ref 会被 fetch 进用户仓库**——集成时的 seal（`refs/heads/<prefix>/<goalId>-<slug>`，`10` §10.6、§10.6.2），以及归档时可选的地标检查点（默认关闭）。已验证的 pin **不**在进入 `in_review` 时 fetch；人检验成果使用人工检验检出（ADR-078，§7.4.2），pin 只留在影子目录。fetch 在用户仓库中执行：
            git fetch <影子目录> <ref>:<ref>                                   # 先传对象、后更新 ref，无悬空 ref
```

- **HEAD 不进入指纹。** 只换 HEAD、不变内容的情况（空提交、只改提交信息、检查点提交）不应让代码类 Fact 变旧。`atCommit` 单独记录，供“这个结论针对哪个提交”使用（`02` §2.7 的 `"wt1:<tree-sha>"`）。
- **大文件（ADR-086）：** 只有 `advisory` 模式排除单个超过 50 MB 的文件（指纹标记 `weak`，只用于显示）；检查点、pin、seal 与验收重哈希（decisive / full）**完整收录**大文件，Agent 对大文件的改动不会被丢弃。超大文件在评审单元中以“二进制/大文件”折叠显示，合同编辑器提示是否应纳入 LFS。
- **被忽略文件**（`node_modules`、构建产物）不进入指纹。它们对 Verified 的影响由验证器的干净环境和私有只读依赖存储消除（§7.4.3，ADR-021）。观测轨的结果可能运行在被 Agent 改过的依赖上，这正是观测轨永不计入 V 的原因（§7.2.4）。
- **检查点复用：** `turn_end` 时算出的 tree 直接用来创建影子目录中的检查点提交，不需要第二次扫描。

**何时计算（按成本取舍）：**

| 触发 | 是否计算 | 理由 |
|---|---|---|
| `read` 结束 | 否 | 不改文件 |
| `edit/write` 结束 | 是，防抖 500 ms，合并为一次 | 已知路径，增量很便宜 |
| `bash` 结束 | 是，防抖 500 ms | bash 可能改任意文件 |
| `turn_end` | 是（强制，跳过防抖） | 检查点与 diffstat |
| UI 打开验收面板或评审单元 | 是，decisive（若距上次超过 2 s；≤ 150 ms） | I2 的守卫 |
| `in_review` / `accepted` 期间 | 文件系统事件（FSEvents/inotify）触发后防抖 1 s，decisive | 人可能就地编辑、rebase；不再定时巡检（ADR-075） |
| `accept`、seal | full | 最后闸口（ADR-075） |

§7.2.3 的 `diff-tree`、§7.5.5 的检查点恢复（`checkout <cp> -- <paths>`）同样只经 `towerGit` 执行。

### 7.3.3 新鲜度判定

`Freshness = "fresh" | "stale" | "expired"`（`02` §2.7 已采纳本节定义）：

- **stale**：Fact 依赖的代码内容已变化，即 `fact.workspaceFingerprint ≠ current fp`（对应 binding）。语义是“对旧代码成立，可能仍成立，需要重新验证”。UI 按 `12` §12.5 的过期样式显示（整行 text-4、`⟲`、`@旧 → 现在 @新`，移除状态色）。
- **expired**：Fact 赖以成立的**非代码前提**已经失效，不论代码变没变。语义是“这条结论不再有意义，不能作为验收依据”（`02` §2.7）。UI 使用与 stale 相同的视觉处理，另加文字徽章“已失效：<原因>”，并退出所有汇总。

| Fact kind | 代码依赖 | 变为 stale 的条件 | 变为 expired 的条件 |
|---|---|---|---|
| `command_result` | 否（历史观测） | 永不 | 永不（只作历史；H7） |
| `files_touched` | 否（历史） | 永不 | 永不 |
| `diffstat` | 是 | fp 变化 | `baseCommit` 变化（rebase） |
| `criterion_check` | 是 | exec：worktree 指纹变化（按 tree 比较，携带规则见 §7.4.8）；artifact：`art1` 内容哈希变化（§7.4.9） | ① 标准定义变化（合同新版本中该 criterion 的 `command`/`expect`/`repeat`/`timeoutSec` 改了，即 `criterionSpecHash` 变化，ADR-183）；② `envHash` 或 `depsHash` 变化后重新解析得到不同值（重新解析只在下一次验证开始时进行；`envHash` 的本地文件项不会在两次验证之间使已通过的结果过期，ADR-173）；③ VerifyProfile 版本变化 |
| `test_inventory` | 是 | fp 变化 | runner 版本变化 |
| `sentinel` | 是 | fp 变化，触发重新扫描；若重扫未命中，旧 Fact 被 `resolvedBy` 链接 | `baseCommit` 变化 |
| `conflict_forecast` | 是 | 本 Goal 或兄弟 Goal 的 fp 变化 | base 前移；或超过 TTL 1 h |
| `heartbeat` | 否 | — | 30 s 后（`08` §8.6） |
| `budget` | 否 | — | 被新的快照取代 |
| 研究类 `url` 证据 | 否 | — | 检索时间 + 7 d（可配置） |

`Verified` 是派生值，唯一定义见 §7.10.3：至少有一条机器标准（ADR-031），所有 exec/artifact 标准的最新验证器结果都是 `fresh` 且为可计入的通过（`isVerifiedPass`），并且不存在未处置的阻断命中（§7.10.1 的“阻断 in_review”列）。任何一条变为 stale 或 expired 时，状态机执行 I2，回到 `verifying`（`in_review`/`accepted` 中新鲜度按当前 pin 记录的 L 判定，本地文件清单的变化不使其变旧，`10` §10.7.1 第 1 步，ADR-210）。

---

## 7.4 验证器（Verifier）

职责分离：验证器不是作者（*TB* C7 “Separation of duties”）。它在**干净 worktree、固定提交**上重跑 `exec` 标准，产出 `criterion_check`。

### 7.4.1 总流程

**从 settle 到 pin 的顺序（ADR-115、ADR-121）：**

- **I4 的两部分**（`03` §3.3）：(a) **有效提交** = 最后一次 `submit` 之后，本 Run 没有**变更类工具调用**（唯一定义在 `16`，ADR-130）——**只以工具事件判定，不比较指纹**；(b) **pin 的树** = settle 之后 `agent_bg_done` 检查点的树。`submit` 之后**仅由后台进程**产生的变化不使提交作废：它们进入 `agent_bg_done` 检查点（`author:"agent"`），随 pin 一起被验证与评审。
- **顺序**：
  1. `agent_settled`；
  2. **宽限确认**（ADR-025/135）：**连续 2 s** `isStreaming=false` 且 `isCompacting=false`，且没有新的 `agent_start`；窗口内只出现压缩（例如扩展调用 `ctx.compact()`，手动压缩不会再发 `agent_settled`）→ 等 `compaction_end` 后**重新开始** 2 s 计时，不再等待下一次 `agent_settled`。宽限失败（出现 `agent_start`）的唯一去向定义在 `05` §5.5（ADR-129/135）：不记异常，回到等待下一次 `agent_settled`，有效性在下一次 settle 时重新判定；此时进程尚未被终止。`post_settle_activity` 只用于进入 `claimed` **之后**的活动；
  3. 终止本 Run 追踪的**全部**进程（Linux 按 cgroup 整体终止）。macOS 上本 Run 的进程 = **进程树**与**令牌**两种识别的**并集**（ADR-158）：Tower 的 `exec` 为每条命令记录直接子进程，settle 时以 `proc_listchildpids` 递归取其后代；再加上环境中含本 Run 令牌的进程。两者取并集后终止。Apple 平台二进制（`/bin/bash`、`/bin/sleep` 等）的环境对普通进程不可读，令牌识别对它们失效，只能靠进程树识别。“环境读取成功但为空”与“读取失败”同样视为**无法确认**，不据此判定属于或不属于本 Run。令牌识别的细节（ADR-142）：每个 Run 的 128 位 `TOWER_RUN_TOKEN` 由 Tower 的 `BashOperations.exec` 实现**自身**加入每条命令的环境（不依赖 `spawnHook`，因此 `user_bash` 路径同样带令牌，ADR-144），子孙进程继承；同一用户、同一开机会话中环境含该令牌的进程即属于本 Run（macOS 读进程环境，Linux 以 cgroup 为主、令牌为辅）。终止前按令牌枚举，发信号前再读一次环境确认令牌（防 pid 复用）。读取其他进程环境只在内存中匹配令牌，不记录、不持久化、不传输其他环境内容，也不对非本用户的进程运行（ADR-144）。扫描只在 settle 终止、重启清理、watcher 检测到来源不明写入时进行，存活者未全部退出期间每 30 s 一次（“知悉”`bg_process_survived` 不结束它，ADR-145），以及 Goal 设有内存上限时为覆盖脱离进程树的后台进程而做的令牌全扫描——全进程扫描最多每 60 s 一次，且只在 Run 活跃时（ADR-146；单次预算见 `13`）。每 5 s 的内存采样只从 `exec` 已知的直接进程出发遍历后代树，不是全进程扫描。已登记窗口：**脱离进程树且无法读到含令牌环境**的进程（脱离的平台二进制、主动清空环境的进程）识别不到（已知误判 (b)）——它们不会被终止，也不进入 `bg_process_survived`；其后的写入在 settle 之后按**来源不明的写入**处理（`paused(external_change)`，由人决定），不会被记为 Agent 或人的改动（ADR-158）；
  4. 等待进程树清空：SIGTERM 后最多 10 s，随后 SIGKILL；仍有存活者记 `bg_process_survived`（注意力闭环见 `08` §8.4、§8.8；存活进程此后的写入见 §7.10.3 的 `agent_bg`）；
  5. 补做 `agent_bg_done` 检查点（非回合检查点，`10` §10.7.1）；
  6. 判定 I4 → 生成 pin（树 = 第 5 步检查点的树）并进入 `claimed`，写 `verifyFrom = "claimed"`——三者在**同一事务**中（ADR-137），因此 `claimed` 中总有 pin，继续目标 `verify{pin}` 的 `pin` 总能写出 → `verify(goal, "claimed")`。
- **没有“settle 之后才发现提交无效”的情形**（ADR-129）：任何新的工具调用都意味着一次新的 run，它在 settle 前必然经过 `agent_before_settle`，由 tower-goal 按常规 nudge 处理；Tower 不开额外的提醒回合。
- **nudge 守卫不成立时**（ADR-135/138）：只适用于**非 draining 且 `outcome = completed`** 的 settle——此时守卫不成立（只有 human 标准、`nudge.max = 0` 等，`05` §5.6.5）且没有有效提交 → 直接 `paused(idle_without_submit)`（Needs-You，`08` §8.6.4），不 nudge。draining 时按 `Goal.drainingFor` 的原因集合进入暂停（最高者为 `pauseReason`，其余入 `alsoApplies`，ADR-141）；`outcome ∈ {aborted, error}` 按 abort 原因或 provider 规则处理（`05` §5.5 settle 判定表）。nudge 的“每个 Run 一次”窗口**锚定本 Run 的起点**（会话条目 `tower.run_start`，每个 **Tower Run** 开始时只写一次、不随 Pi 内部的 run 重写，重启与分叉后按会话分支重建，ADR-143/144；含由 `tower.*` 自定义消息触发的 Run），不再锚定最后一条 user 消息。
- **Tower 的话不以 user 角色出现**（ADR-135/138）：恢复、返工（`tower.rework`，§7.10.3）、交接、唤醒续跑（`tower.resume{reason:"wake"}`）等由 Tower 发起的回合，以 `tower.*` 自定义消息开始（`triggerTurn:true`；RPC 下经 tower-goal 的 `/tower-inject` 命令投递，`05` §5.6.1），Trace 标“Tower 注入”；只有人亲手写的转向与回答以 user 角色出现。
- **settle 序列中进入暂停**（ADR-129/134/137/143）：settle 序列中由**任何**原因进入的暂停（外部写入、人暂停、`app_quit` 等），继续目标都是 `{kind:"settle"}`；`retry_claim` 也改写为它。有效提交保留；全部原因解除后由 `onAllReasonsCleared()` **从宽限确认起重新执行完整序列**，不开新 Run；Host 不存在时（重启后）按 ADR-143 处理（§7.10.3 末表）。settle 序列开始时同一事务写 `runs.phase = 'settling'`，崩溃恢复据此区分“settle 中崩溃”（→ 继续目标 `settle`）与“Run 中崩溃”（ADR-145）；settle 序列中撤回（宽限内，或 `claimed`/`verifying` 中出现 `agent_start`）时同一事务把 `runs.phase` 写回 `running`（ADR-146）。重启后执行继续目标 `settle` 而 I4(a) 判定无有效提交 → 按 settle 判定表（非 draining、`outcome = completed`）进入 `paused(idle_without_submit)` 或 nudge。外部写入时 `keep`/`revert` 只解除本原因、不改写该目标，`tower.external_resolved` 进入 `pendingOpenings`；`keep` 产生的 `author:"human"` 检查点使之后的验证失败按归因规则不自动返工（§7.10.3），不另作标记（ADR-140）。此时被追踪进程在终止前的刷写由检查点链记为 `author:"agent"`，`revert` 不把它们当作剩余差异（§7.10.3）。
- 撤回到 `running` 或自动恢复时，若有进程曾被 Tower 终止，以 `tower.processes_terminated` 列出被终止的命令与原因：run 已在进行时以不触发回合的自定义消息投递（`triggerTurn:false`），自动恢复时作为恢复回合开头的 `tower.*` 消息（ADR-129/135）。

**带机密的标准在 M1 中不存在（ADR-164）：** M1 中 exec 标准不能声明机密，`verify()` 没有机密阶段，也不会出现 `not_run`。机密阶段、调度互斥与相关处置的设计保留为 M2 的起点，见 §7.4.11。

```ts
type VerifyTrigger =
  | "claimed"               // 有效提交后（03 I4）
  | "fp_changed_agent"      // in_review/accepted 期间指纹变化，变化来自 Tower 自动 rebase 等非人、非 Agent 的 Tower 工作
  | "fp_changed_human"      // 人显式采纳的变化：交还、就地编辑后的“采纳为我的改动”、keep_external_change（verifyOrigin:"human_change"，仅作说明，ADR-140）
  | "agent_bg"              // 存活者未全部退出期间（“知悉”不结束它，ADR-145）存活进程的写入：author:"agent"，重新生成 pin 并验证（ADR-122）
  | "merge_queue"           // 合并队列 rebase 后（10 §10.11；M2）
  | "manual"                // 人点击“重新验证”
  | "opportunistic";        // 运行中机会式验证（§7.2.4，ADR-020）

async function verify(goal: Goal, trigger: VerifyTrigger): Promise<VerifyOutcome> {
  const pin = await pinCommit(goal);         // decisive 指纹（§7.3.2）；pin 提交只写在 Tower 影子 git 目录（ADR-060）
  const tree = treeOf(pin);
  const full = trigger !== "opportunistic";  // 正式验证 = 一切非 opportunistic 的触发
  const machine = goal.contract.criteria.filter(c => c.kind === "exec" || c.kind === "artifact");

  // 第一步（ADR-109）：pinSafetyCheck 在一切提前返回之前执行；命中只阻断、不修改 pin（§7.3.2）
  for (const h of pinSafetyCheck(treeOf(goal.binding.baseCommit), tree))
    recordFact({ kind: "sentinel", producer: "verifier", atCommit: pin, data: { ...h, severity: 3, derivation: "pin" } });
  // 第二步（ADR-183，唯一规则）：正式验证总是运行 L-c 静态哨兵（§7.5–7.6：纯 base..pin 的 diff 分析，不需要槽位），
  //   在下面任何提前返回之前启动；done() 等它写完 Fact 后才 decide()，openSentinels 因此总含本次结果。
  //   正式验证中**只有 exec 标准的结果**可以复用缓存（§7.4.8）；哨兵与测试清单从不复用。
  const sentinelsP = full ? runStaticSentinels(goal, goal.bindings, pin) : null;
  const done = async (opts) => { await sentinelsP; return decide(goal, pin, trigger, opts); };

  // 0) artifact 标准：内置检查直接读取 pin 的 tree，不需要槽位（§7.4.9）
  for (const c of machine.filter(c => c.kind === "artifact")) recordFact(artifactCheck(c, pin, trigger));
  // 1) 子模块项目（M1）：子模块路径已从影子操作中排除，exec 标准不运行（ADR-071）
  if (hasRegisteredSubmodules(goal, baseCommit)) return done({ execSkipped: "submodules_unsupported" });   // 槽位之前的返回都不写重放包（§7.4.1 保留行，ADR-186）
  // 2) 逐条判定 exec 标准的生态（ecosystemSupported，见下）；不受支持的只计入观测轨（ADR-064）
  const execs = machine.filter(c => c.kind === "exec");
  const unsupported = execs.filter(c => !ecosystemSupported(goal, c, pin));
  const runnable = execs.filter(c => ecosystemSupported(goal, c, pin));
  const skipped = unsupported.length ? { execSkipped: "ecosystem_unsupported", skippedCriteria: unsupported.map(c => c.id) } : {};
  // 3) exec 标准：缓存（§7.4.8）。先把 seeded 条目逐个读入内存，并按 16 ProjectLocalFile 行重新判定（ADR-173）；
  //    local.record = 本应复制的条目的 {path, contentHash | "not_copied"}[]，由它算 envHash 的本地文件项（§7.4.3）。
  //    查缓存用这一份；未命中时写进槽位的也是这一份，不读第二次；criterion_check.env.localFiles 记录它（§7.4.7）。
  //    写出前按当前状态复核，有条目已不再 seeded 时回到这一步重新开始（见下，ADR-174）
  let local = await readSeededLocalFiles(goal.projectId);
  let todo = runnable.filter(c => !cacheHit(c, tree, envKey(goal, local.record), depsKey(pin)));
  // 命中的标准各新写一条 criterion_check（cache.hit=true，指向原日志）：data.trigger 与 atCommit 取本次的 trigger 与 pin（§7.4.8，ADR-184）
  //   cacheHit 的前提只在 §7.4.8 同指纹缓存行定义（原验证该标准的完整日志仍在，ADR-187）；命中后原日志不升为永久（§7.4.1，ADR-186）
  //   recordHits 只在以 done(skipped) 结束的路径上调用；S0 的两处返回（pending / denied）与 envError 不记录命中——
  //   结局是等待授权、“未经机器验证”或环境错误，都不复用 exec 结果（ADR-185）
  const recordHits = () => runnable.filter(c => !todo.includes(c)).forEach(c => recordFact(cachedCheck(c, pin, trigger, local.record)));
  // 全部命中时不取槽位，只限：机会式验证，或没有可运行的 exec 标准（runnable 为空：只有 artifact 标准，或 exec 标准全部
  //   生态未支持——没有可列举的 runner，测试清单不适用，R-T1 等由上面的静态哨兵执行）。正式验证在 runnable 非空时
  //   即使全部命中也取槽位运行测试清单（R-T5），只跳过标准本身（ADR-183）
  if (todo.length === 0 && (!full || runnable.length === 0)) { recordHits(); return done(skipped); }   // cache.hit 的 criterion_check 同样记录 local.record
  // M1：exec 标准不能声明机密（ADR-164），因此没有机密阶段；M2 的拆分与机密阶段见 §7.4.11

  // 4) S0 下运行 Agent 代码需要 Goal 级授权（ADR-022、ADR-077）：Goal.s0Grant ∈ none | pending | granted | denied | denied_timeout
  if (!sandbox.available) {
    switch (goal.s0Grant) {
      case "none": case "pending":                             // 发起或继续等待 approval；继续目标 verify{pin}，授权或拒绝后都经 onAllReasonsCleared() 以同一 pin 验证（ADR-134/188）
        return done({ s0: "pending" });
      case "denied": case "denied_timeout":                    // HumanDecision{deny_s0_exec} 或 use_defaults 下超时；暂停中拒绝之后的重新验证也走这里（ADR-188）
        return done({ execSkipped: "s0_denied", by: goal.s0Grant === "denied_timeout" ? "timeout" : "human" });
    }                                                          // granted → 继续
  }

  // 3) 取槽位（§7.4.10 队列）；opportunistic 可被抢占
  const slot = await verifyPool.acquire(goal.projectId, priorityOf(trigger), { preemptible: !full });
  try {
    await slot.checkout(pin);                                 // §7.4.2：从影子 git 目录检出
    for (;;) {                                                 // 写出前复核（唯一定义在 16 ProjectLocalFile 行，ADR-174）
      const written = await localFilesLock(goal.projectId).run(async () => {   // 按 Project 的本地文件锁：与该 Project 的 add/approve/remove/mark_secret/unmark_secret 串行（`16` ProjectLocalFile 行，ADR-175）
        if (!stillSeeded(goal.projectId, local)) return false; // 按当前状态复核读入的每个条目是否仍为 seeded：只查清单行，不读文件
        await slot.seedLocalFiles(local);                      // §7.4.2：写出上面已读入的内容，不再读用户检出（ADR-173）
        return true;
      });
      if (written) break;
      // 有条目已不再 seeded（mark_secret、remove、自动改为机密）：不写出任何本地文件；回到读取一步，
      // 重新读取、重新算 envHash、重新查缓存；槽位保留，不重新排队
      local = await readSeededLocalFiles(goal.projectId);
      todo = runnable.filter(c => !cacheHit(c, tree, envKey(goal, local.record), depsKey(pin)));
      if (todo.length === 0 && !full) { recordHits(); return done(skipped); }   // 机会式重查后全部命中：finally 中释放槽位；正式验证继续运行测试清单
    }
    const env = await slot.prepare(pin);                       // §7.4.3：第三方依赖物化 → 槽位内项目生命周期脚本 + VerifyProfile.prepare（ADR-062）
    if (env.error) { if (!(await reachable(slotRoot(slot)))) return interrupted(goal, pin);   // 准备失败同样先判可达（ADR-238；ADR-239：不论文件系统错误还是子进程的非零退出——卷消失时生命周期脚本与 prepare 通常以非零退出）
                     await sentinelsP; return envError(goal, pin, env.error); }   // verify_env_error（ADR-037）：没有测试清单就没有“已验证”，缓存命中也不例外；与 done() 一样先等哨兵写完（ADR-184）
    // todo 为空（标准全部命中、只跑测试清单）时不启动服务：清单只需要依赖物化，服务的健康检查失败不应让可复用的结果变成 verify_env_error（ADR-184）
    const svc = todo.length ? await slot.startServices(goal, env) : {};   // §7.4.4：setup + services + 健康检查
    if (svc.error) { await slot.teardown(); if (!(await reachable(slotRoot(slot)))) return interrupted(goal, pin);   // 同上：setup 与健康检查的任何失败（ADR-238/239）
                     await sentinelsP; return envError(goal, pin, svc.error); }
    const inventoryP = full ? testInventory(slot, pin, goal) : null;                // §7.5.4；正式验证总是运行（ADR-183）
    for (const c of orderByExpectedCost(todo)) {
      const r = await runCriterion(slot, c, env);               // §7.4.4–7.4.6（含 repeat，§7.4.5）；它不写 Fact：flake 与环境故障随 r 返回（ADR-239）
      if ((r.verdict !== "pass" || r.envError) && !(await reachable(slotRoot(slot)))) return interrupted(goal, pin);   // 失败先判可达，只判槽位所在的 <wtRoot>（回退位置在 ~/.tower 中时为空、不判定）：不写该条标准的 Fact 与 verify.result、不计返工，可达后以同一 pin 重跑（`06` §6.1.6，ADR-237/238）
      for (const f of r.facts) recordFact(f);                   // §7.4.5 的 flake{kind:"timing"}、§7.4.6 的 flake：只在上一行的判定之后写，中断的验证不留下该条标准的 flake（ADR-239）
      if (r.envError) { recordFact(r.envError); continue; }     // verify_env_error{stage:"resources"|"exec"|"baseline"}：不产生 criterion_check、不返工、不计次数（§7.3、§7.4.5、§7.4.6）
      recordFact({ kind: "criterion_check", data: { ...r, env: { ...r.env, localFiles: local.record } }, atCommit: pin, workspaceFingerprint: `wt1:${tree}`,
                   producer: "verifier", evidence: [r.log] });
      if (r.verdict !== "pass" && c.expensive && policy.failFastOnExpensive) markSkipped(remaining, "fail_fast");
    }
    await inventoryP;
    recordHits();                                              // 先记命中：manifest.json 要列出命中条目的 factId（ADR-185）
    await writeReplayBundle(goal, pin, slot, env);             // ADR-070：可在本机重放的验证日志（见下；缓存命中的标准引用被复用结果的日志，ADR-183）
  } finally { await slot.teardown(); await slot.release(); }

  return done(skipped);                                        // §7.10.3
}

// ecosystemSupported（R4-D7-03）：逐条标准判定，不按项目一刀切。先有 exec 标准，才谈生态。
function ecosystemSupported(goal, c: ExecCriterion, pin): boolean {
  const cwd = c.cwd ?? ".";
  const pm = nearestLockfile(pin, cwd);        // 从标准的 cwd 向上到仓库根：pnpm-lock.yaml → pnpm；package-lock.json /
                                               // npm-shrinkwrap.json → npm；yarn.lock → yarn；bun.lock / bun.lockb → bun；无 → none
  // ADR-085：命令链中的**每个**程序都参与判定（`"test": "vitest run && pytest"` 中的 pytest 同样要求受支持）
  const progs = allPrograms(resolveIndirection(c.command, pin));   // §7.5.1：展开脚本间接调用与 && ; | 连接的全部程序
  if (!progs.every(p => isNodeToolchain(p) || isPosixBaseline(p))) return false;
     // isNodeToolchain：node/npx/pnpm/npm 或 node_modules/.bin 下的程序（vitest、jest、playwright、tsc…）
     // isPosixBaseline：sh、echo、cd、rm、mkdir、cp、mv、test、true、env、cross-env 等基础命令
     // pytest、cargo、go、make 调非 Node 程序 → M1 不支持
  if (hasGitHostedDependencies(pin, cwd)) return false;   // M1：lockfile 含 git 托管依赖 → 生态未支持（§7.4.3 前置检查）
  if (pm === "pnpm") return packageManagerResolved(goal, "pnpm");   // 版本必须已确定（§7.4.3 包管理器识别）
  if (pm === "npm")  return true;
  return false;                                // yarn、bun（M1 不支持，按“生态未支持”处理）；none（无依赖的纯 Node 脚本另见下）
}
// 纯 node 脚本（pm === "none" 且命令只用 node 运行仓库内文件、无第三方依赖）视为受支持：不需要安装器，物化步骤为空。
```

**缺失程序（ADR-085）：** 标准执行时以 exit 127 结束、或 spawn 报 `ENOENT`，且输出指明找不到的程序 → 不产生 `criterion_check`，记 `verify_env_error{stage:"exec", missing:<program>}`（不返工、不计为 Agent 失败）。若缺失的程序恰好位于 pin 的 `node_modules/.bin` 之外且不在 VerifyProfile 中声明，Needs-You 条目建议把它加入 `VerifyProfile.prepare` 或改写标准。

**磁盘已满（ADR-234）：** 验证命令自身因 `ENOSPC` 失败、而结论在 Supervisor 检测到 `ENOSPC` 之前已经写入的，按标准的失败计，不另判别（如实登记；之后进行中的验证按 `06` §6.8 F8 取消并在解除后以同一 pin 重跑，唯一定义在该处）。**路径不可访问（ADR-236/237）：** 验证命令以非零退出或以文件系统错误失败时，结论写入之前先按 `06` §6.1.6 Project 不可达一行的“失败先判可达”判定**本次验证实际使用的路径所在的根**——槽位所在的 `<wtRoot>`（ADR-238：影子与回退位置的槽位在 `~/.tower` 中，不在判定之内；附着检出只在开始前读取，见下），准备与服务的任何失败（`env.error`、`svc.error`，含生命周期脚本、`VerifyProfile.prepare`、setup 与健康检查以非零退出，ADR-238/239）同样先判；有不可访问的即不写该条标准的 Fact（含 `flake`：它们由 `runCriterion` 返回、在判定之后才写，ADR-239）与 `verify.result`、不计返工次数，验证照应用退出取消，可达后以同一 pin 重跑（唯一定义在该处）。同一次验证中此前已写下的 Fact——前几条标准的 `criterion_check`、哨兵与产物的 Fact——是这次已取消验证在该 pin 上的真实观测，保留（如实登记，ADR-238）。开始前从附着检出播种本地文件时附着检出停顿，条目记为 `not_copied`，随后的失败照常记录、计返工——属下述反方向的竞争（ADR-238 更正此前“验证不读的附着检出”的说法）。所以一条与验证无关的路径停顿不会丢掉一次真实的失败（§7.4.6）。反方向的竞争——卷短暂停顿使验证以 `EIO` 失败、判定时卷已恢复——按真实的失败记录、计返工——验证确实以失败结束，不丢工作，返工时重跑即可（如实登记为可接受，与上一句的磁盘满对称）。

**缺失的机密本地文件（ADR-168，取代 ADR-166/167 的自动归类）：** M1 **不做自动归类**——不能可靠判定一次失败是否源于缺少未播种的机密本地文件（§7.4.2）：输出文本来自 Agent 可影响的代码，沙箱的拒绝规则对不存在的路径不触发，而 dotenv、Vite 等每次运行都会尝试读取 `.env.local`。因此这类失败一律是**普通失败**，按 §7.10.3 的归因规则处理（含自动返工与返工上限）。项目有未播种的机密本地文件（满足 `isSecret` 的 `ProjectLocalFile` 条目；谓词 `isSecret` / `seeded` 唯一定义在 `16` 的 `ProjectLocalFile` 行，ADR-169；已取消标记并批准的文件照常播种，不列入）时，Tower 只给出**提示**，以 Claim 语法表述（是可能性，不是事实）：
- `verify_failed` 卡片附一行：“本项目有 M1 中不提供给验证的本地机密文件（<路径>）；若该失败源于此，请改为 human 标准”，并提供“改为 human 标准”（`contract.amend`：界面生成把该标准由 `exec` 改为 `human` 的修订，保留描述，原命令写入说明；修订生效后界面自动发出 `retry_verify{pin:"same"}`，Goal 回到 `verifying`；修订取消则不发出，Needs-You 保持打开；唯一定义见 `03` §3.4.5，ADR-169）。这张卡片只在 `paused(verify_failed_limit)` 与 `paused(human_change_verify_failed)` 中出现；自动返工期间（`running`）没有卡片、不提供该按钮，提示只进入返工证据；
- 返工证据（`tower.rework`，§7.10.3）附同一行，让 Agent 知道这些文件在验证中不存在；
- 合同**试运行**的红灯徽标附同样的限定：“◇ 红灯 · 能区分前后（本项目有 M1 中不提供给验证的本地机密文件；若红灯源于此，它不是有效红灯）”（`04` §4.10.2；试运行的红灯只是 base 上的一次试运行结果（不是 `12` §12.5.1 的“观测”），不证明完成，ADR-179）；合同批准时提示“读取这些文件的 exec 标准在 M1 中无法通过”。

**本次未复制的本地文件（ADR-172/173）：** 本次验证中有本应复制而未复制的本地文件（`seeded` 的条目在用户检出中不可读或不存在，或在该 Goal 的 base 中被跟踪，ADR-206）时——来源是**本次验证**记录的 `criterion_check.env.localFiles` 中 `not_copied` 的条目（§7.4.7），不取自显示时的任何项目级状态；“无法读取”的 L1 通知另按 `16` 的 `ProjectLocalFile` 行——同样以 Claim 语法提示，与上面的机密文件提示并列，同样不改变 `decide()` 的去向：
- `verify_failed` 卡片附一行：“本次验证中 `<路径>` 未复制（无法读取或不存在）；若失败源于此，请恢复该文件后重试验证”；
- 返工证据附同一行，另写明：该文件在用户检出中，Agent 无法恢复。

例：Python 仓库中只有 artifact 标准的文档类 Goal → 没有 exec 标准，完整机器验证（`verified`）。Node + Python 的混合 monorepo → `pnpm test` 照常验证，`pytest` 标准只计入 O，Goal 标签为“有保留的已验证（C3 生态未支持）”。只有 `yarn.lock` 的项目 → 全部 exec 标准跳过，标签“未经机器验证（生态未支持）”。

**判定逻辑可审计与重放包（ADR-070、ADR-083）——本节是重放包的唯一规格**，`06` §6.6.4、`15`、`16` §16.1.12 只引用。验证器、哨兵与 `decide()` 的判定逻辑属于开源核心，规则即本文；`tower verify --replay <verifyId>` 同属开源核心。

| 项 | 规格 |
|---|---|
| 位置 | `~/.tower/goals/<goalId>/replay/<verifyId>/`；`manifest.json` 中列出本次验证产出的全部 `criterion_check` 的 `factId` |
| 内容 | ① **验证日志**：每条标准的 `wrappedCommand`、退出码、计数、verdict 及其判定输入（reporter 解析结果、flake 与 ADR-054 重跑记录）；脱敏输出**每条标准 ≤ 2 MB**（头 0.5 MB + 尾 1.5 MB；完整日志另按 §7.4.4 保存，随验证日志的保留期）；② **瘦 bundle（base..pin 的对象）**：本地**不另存一份**——对象已由镜像中的保留 ref 保全，瘦 bundle 只在导出重放包（`tower verify --export <verifyId>`）或该 Project 的镜像即将被删除时才生成，避免对象在 bundle 与镜像中各存一份；③ lockfile 副本、`depsKey`、depcache `manifest.json` 的哈希、运行器集合基于 lockfile `integrity` 的逐文件哈希（ADR-092）；④ `$VS` 中生效配置的内容哈希（不含配置本身与令牌）；⑤ 包管理器与 Node 的确切版本、envHash 与生效环境（机密只记名称）、端口段与服务定义、Tower 版本；⑥ 项目配置排除了 LFS 对象时，本次验证所用检出的 `lfs_excluded` Fact（`factId` 列入 `manifest.json`；字段见 `16` `Fact.kind`）——验证槽位与卫星、人工编辑检出、检验检出从同一镜像 LFS 库按同一组 `fetchinclude/fetchexclude` 物化，被排除的文件在槽位中同样保持指针（ADR-154）；⑦ 本次验证的 `env.localFiles`（取自 `criterion_check`，§7.4.7；只有路径与内容哈希或 `not_copied`，不含文件内容），供重放比对（ADR-174） |
| base 对象 | 不进 bundle：重放依赖 Tower 镜像库（ADR-073）。每个被保留的证据在镜像中有保留 ref `refs/tower-retain/<goalId>/<verifyId>`，指向对应 pin；镜像 gc 只删除不被任何 ref 可达的对象 |
| 体积 | 不含输出时通常 < 1 MB；输出每条标准 ≤ 2 MB。按 ADR-095 的估计，每个 Goal 平均 1–2 个永久重放包，计入 `13` 的 30 GB 磁盘预算 |
| 保留（ADR-095） | **只有决定性验证永久保留**：导致 `in_review` / `accepted` 的验证；镜像保留 ref 只为这些重放包而写。验收与 seal 时的完整重哈希是指纹闸口（§7.3.2 `full`），不是 `verify()` 的运行，没有重放包、不写保留 ref；它与紧邻的 `decisive` 结果不一致时记 `anomaly{detector:"stat_cache_mismatch"}`（§7.3.2），一致时不另留证据——验收要求指纹等于决定性验证的 pin，那次验证有重放包时已永久保留（ADR-187）。**只有走到槽位路径的验证才有重放包**（`verify()` 中的 `writeReplayBundle`，唯一定义，ADR-186）：子模块项目、没有可运行的 exec 标准（只有 artifact 标准，或 exec 标准全部生态未支持）、S0 等待或被拒、环境错误等提前返回的路径不写重放包，这些验证即使是决定性的也没有永久重放包，证据是轨迹中的 Fact。以阻断结束的验证（`paused(sentinel_high)` 等）不是决定性的、不写保留 ref，**覆盖后也不升级**：人 `override_sentinel` 的决定记录被覆盖的 `factId`（该 Fact 随事件永久保留，其 `evidence` 指向这次验证的日志；`06` §6.4.3 `sentinel.override`），这次验证的重放包与完整日志按下面的非永久规则保留（ADR-186，取代 ADR-184 的“覆盖时升为决定性”与 ADR-185 的清理排除）。其他验证（机会式、失败后的中间验证、以阻断结束的验证）的重放包保留到 Goal 归档或放弃后 30 天，不写保留 ref。磁盘压力下（`10` §10.3.2）先清理非永久重放包与完整日志；永久重放包从不自动删除，只能经隐私清除删除。**缓存命中的决定性验证**（标准结果全部或部分复用，§7.4.8，ADR-183）同样写保留 ref 并生成本次的重放包：`manifest.json` 列出被复用的 `criterion_check`（`cache.hit=true`）的 `factId`，这些标准的验证日志引用原验证该标准的完整日志（命中的前提，§7.4.8）；原日志按原验证的保留期保留，**不因此改为永久保留**（ADR-186）；测试清单与哨兵是本次运行的结果，不复用。**没有可用的重放包时**——提前返回的路径、重放包已被清理、被引用的原日志已被清理、人手动删除——`tower verify --replay` 的结论为“不可重放：<原因>”（例如“本次验证没有重放包”“重放包已清理”“原日志已清理”），覆盖与验收的判定不受影响（ADR-186） |
| 隐私 | 只在本机；隐私清除（`09` §9.12.4）删除重放包与对应保留 ref，之后镜像中的对象才可被清理 |
| 重放 | 在新的干净槽位中：从镜像（或导出的瘦 bundle）恢复 pin；按记录的 Node / 包管理器版本取工具；depcache 条目仍在 → 校验 manifest 哈希后物化；已被淘汰 → 安装器按记录的 lockfile 重新拉取并安装（ADR-095）。运行器集合按 lockfile `integrity` 逐文件比对，必须一致；其余依赖（原生构建、安装时下载的二进制可能不逐字节可复现）不要求整份 manifest 一致，差异文件数写入重放报告。**本地文件**（ADR-174）：重放是复制点之一（`16` 的 `ProjectLocalFile` 行），只对原验证 `env.localFiles` 中列出的路径按同一规则读入、判定、写出（其中当前仍为 `seeded` 的条目），原验证之后才批准的条目**不写出**，使重放环境的本地文件集合与原验证一致；再把当前内容哈希与 `env.localFiles` 逐条比对（ADR-175）；导出的重放包（`tower verify --export`）不含本地文件。结论分为“复现（原 depcache）”“复现（依赖重建，N 个非运行器文件不同）”“复现条件不同：本地文件 `<路径>` 已变化或缺失”与“不可重放：<原因>”——有内容哈希不同、缺失、当前已不再 `seeded`（因此未写出）或原记录为 `not_copied` 的条目时，结论为“复现条件不同”，不写“复现”；在其他机器上重放导出包、而 `env.localFiles` 非空时同样如此；依赖已从注册表下架或私有注册表不可访问时为“不可重放：依赖不可获得”。重放包保证的是**记录足以审计判定过程，并在依赖可获得时复现**，不保证在任何时间点都可执行。“淘汰后重放成功率”由 `14` G18 测量并登记为已知风险 |

### 7.4.2 干净槽位：槽位池

- **位置：** 每个 Project 有一个槽位池 `<wtRoot>/_verify/slot-<k>`，`k < poolSize`（默认 2）。槽位与 Goal 卫星同卷（`<wtRoot>` 见 `10` §10.4.3，ADR-008/060），写时复制才有效；只有 `<wtRoot>` 回退到 `~/.tower/worktrees` 时才使用 `~/.tower/verify/<projectId>/`。验证器从不在 Agent 正在写的目录里运行。
- **槽位的 git：** 槽位工作目录**没有** `.git`。Tower 为每个槽位维护一个自有的 git 目录 `<wtRoot>/_verify/slot-<k>.git`（位于工作目录之外，S2 下被测进程不可写；alternates 指向该 Goal 的影子 git 目录与该 Project 的 Tower 镜像库，ADR-073），所有操作都按 `10` §10.1.2 的影子上下文执行，不读任何工作区内的 git 配置。少数测试需要 `.git` 的项目可在 VerifyProfile 中设 `exposeGit: true`：Tower 每次验证前在槽位内生成一个一次性的 `.git`（独立克隆，验证后删除），它的任何改动都不会被 Tower 读取。
- **检出到固定提交：**
  ```
  towerGit(slotGitDir, slot) checkout --detach --force <pin>
  towerGit(slotGitDir, slot) clean -ffdx                        # 清掉一切未跟踪/忽略文件，包括上次物化的依赖目录
  towerGit(slotGitDir, slot) fsck --connectivity-only <pin>
  verify: status --porcelain == "" 且 rev-parse HEAD == pin       # 否则作废槽位并重建
  ```
  M1 不在槽位中初始化子模块（ADR-071：子模块项目的 exec 标准不运行，§7.4.1）；M2 的子模块支持将按 base 中的 gitlink 从用户仓库取内容，而不是按 pin 中 `.gitmodules` 的 URL（R4-D13-06）。
- **本地文件播种（ADR-078）：** 检出之后、物化之前，Tower 按该 Project 由人批准的“本地文件”清单，从**用户检出**复制被 git 忽略但运行所需的文件（如 `.env.local`）到槽位。清单分两类（ADR-165）：**普通本地文件**照常播种到验证槽位与人工检验检出；**含机密的本地文件**——文件名匹配 `.env*`、`*.pem`、`*.key`、`*credentials*`、`*.p12` 等模式，或用户标记为机密，或内容匹配 `11` §11.7 的机密模式（`add` 时判定，每次复制前按名字与当前内容重新判定；作用范围、判定与复制用同一次读入的内容、不可读时的处理都见 `16` 的 `ProjectLocalFile` 行，ADR-170/171）——在 M1 中**不播种**到验证槽位、人工检验检出或卫星。依赖这些文件才能运行的检查写为 human 标准（与 §7.4.3 的 M1 规则相同）；本地文件设置页对这类文件显示“M1 中不提供给验证与检验（需要它的检查请写为 human 标准）”。因此 **Tower 不会自动**把机密本地文件放进验证槽位或检验检出（检验检出只在人显式选择时才有，`inspect_with_secrets`，见下条；ADR-164/166）。人工编辑检出同样默认不含它们（提示“此副本不含本地机密文件；需要运行时请自行复制进来”），**交还时一律排除这些路径**，不进入 T1、任何检查点或 seal（ADR-167）。S2 下 Agent 对 `<wtRoot>/_verify/**`、`<wtRoot>/_inspect/**`、`<wtRoot>/_human/**` 与用户主检出一律读拒绝（ADR-082）。被播种文件的内容哈希进入 `envHash`（§7.4.3 的公式：本应复制的条目的 `(path, contentHash)` 列表，未复制的以 `(path, "not_copied")` 进入），并记入 `criterion_check.env.localFiles`（§7.4.7）；两者与写进槽位的内容都取自 `verify()` 在查缓存之前的同一次读取（§7.4.1，ADR-172/173）；未播种的含机密文件与未批准的文件不进入。`criterion_check` 的新鲜度只按 tree 比较（§7.3.3），指纹不含本地文件（§7.3.2，ADR-174）：人修改用户检出中的本地文件，已通过的结果不会因此变旧；变化在下一次验证时经 `envHash` 体现，缓存不命中（ADR-173）。
- **人工检验检出（ADR-078）：** 评审中按 `O 检验` 时，Tower 从影子树物化 pin 的内容到 `<wtRoot>/_inspect/<goalId>`（独立目录，不是卫星，也不是验证槽位；写出规则见 §7.3.2“两种检出的写出规则”：未覆盖的 `pinSafetyCheck` 命中不写出，未改动的 base 夹具照常写出，ADR-111），同样播种**普通**本地文件；**含机密的本地文件默认不带上**——只有人在打开检验时打开开关“带上本地机密文件（由我自己运行 Agent 的代码）”（默认关闭）才写入，并记 `HumanDecision{inspect_with_secrets}`（仅本机），界面写明“运行期间 Agent 写的代码会读到这些文件；同一用户的其他进程也可能读到”（ADR-166，`10` §10.8.3）。这是人发起的例外，等同于人在自己机器上运行该分支；需要机密的 human 标准据此可以完成。在为检验**另行分配的端口段**内（与 Goal、验证槽位同一分配器，不复用 Goal 的段，关闭检验时回收；以 `10` §10.8.3 为准）按 `VerifyProfile.services` 启动依赖服务，并在外部终端或编辑器中打开。它的修改不影响 pin 与 I2，也不产生 `criterion_check`；人据此勾选 human 标准。检验检出运行的是 Agent 写的代码（生命周期脚本与服务），因此**按验证器的沙箱档位执行**（与验证槽位同一套 S2 写入与网络规则，网络按 `VerifyProfile.env.network`）；S0 下需要该 Goal 的 S0 授权（ADR-077），未授权时只复制文件、不执行任何脚本与服务（ADR-082）。
- **人工编辑检出与检验检出的依赖准备（R10-D13-02、R10-D10-01b）：** 两种检出都只从影子树物化（**不**从验证槽位复制：槽位在 `verify()` 结束时已拆除）。依赖按以下流程准备，人看到的环境与验证器一致，而不是 Agent 的卫星：
  1. depcache 命中 → 立即 CoW 物化，检出在目标时间内打开（`13`：< 2 s）；
  2. depcache 未命中（例如 Agent 改过 lockfile、该 depsKey 尚未验证）→ **先打开检出**（只有源码），进度以后缀“依赖准备中 · <阶段> · <进度>”显示在实况行与卡片第 2 行，完成后变为“依赖已就绪”（显示位置以 `04` §4.6.7 为准；检验检出另在检验面板中显示，`04` §4.6.6），安装器在后台按 §7.4.3 的拉取 → 预取 → 安装 → 发布流程运行，完成后物化进检出；
  3. 依赖就绪后：**检验检出**按验证器的沙箱档位执行项目自身的生命周期脚本与 `VerifyProfile.prepare`（生成 Prisma 客户端等；S0 且未授权时不执行并说明，ADR-082）；**人工编辑检出从不自动运行项目脚本或服务**（`10` §10.8.4），生成产物缺失时只在界面中说明；
  4. 与 Agent 环境的差异（依赖来自 depcache 而非 Agent 存储、生成产物针对 pin 重新生成）登记于 `00` §0.5.1。
- **“干净”的定义：** 跟踪文件与 `pin` 完全一致；第三方依赖目录**每次**从只读 depcache 经写时复制重新物化（§7.4.3），内容由 `depsKey` 唯一确定；项目自身的生成产物（如 Prisma 客户端）每次在槽位内针对 pin 重新生成（ADR-062）；没有其他未跟踪文件。

### 7.4.3 依赖存储与环境（ADR-021）

**为什么要私有存储（R1-D7-02）：** 如果 Agent 能写验证器所用的包缓存或 depcache（例如改掉 store 里 `vitest` 的实现），验证器就会在“干净”的源码树上用被篡改的运行器跑出“通过”，而被忽略的目录不在指纹里，这种篡改完全不可见。因此：

| 存储 | 位置 | 谁可写 | 谁可读 | 用途 |
|---|---|---|---|---|
| Agent 存储（每 Goal） | `<wtRoot>/_stores/<goalId>/`（npm/pnpm store、uv cache、`CARGO_HOME`、`GOMODCACHE`、`GOCACHE`） | 该 Goal 的 Agent bash（S2 写允许） | 该 Goal | Agent 自己装依赖、跑测试；污染只影响本 Goal 的观测轨 |
| 验证器存储 | `<wtRoot>/_stores/_verifier/`（同上各类缓存）+ `depcache/<depsKey>/` | **只有 Supervisor 的安装器步骤** | 验证槽位（只读） | 验证器依赖的唯一来源 |
| 用户全局缓存（`~/.pnpm-store`、`~/.npm`、`~/.cache/uv`、`~/.cargo`） | 不变 | 用户 | **Tower 不使用** | 用户在 Tower 之外的项目不受影响 |

所有指向存储的路径都通过环境变量设置，Agent 与验证器各自拿到自己的那一套。变量清单（包管理器 × 环境变量 × 读/写 × 是否继承用户配置）**以 `16` §16.8 的包管理器环境变量表为唯一来源**（ADR-045），本文不重复列出。

**Agent 存储的预热（ADR-045）：** 每个 Goal 的 Agent 存储在首次创建时，从验证器存储经写时复制（`cp -c -R` / reflink）整体克隆而来，Agent 不必重新下载；之后 Agent 的写入只改它自己的副本。

**M1 生态范围（ADR-043、ADR-064）：** 安装器、depcache、物化、测试清单与验证器只支持 **Node.js + pnpm / npm**。添加非 Node 项目时明确提示“M1 不支持该生态的机器验证”。这类项目在 M1 中：

- **Agent 侧可用**：S2 下为该 Goal 设置生态的私有目录（`CARGO_HOME`、`UV_CACHE_DIR`/`UV_PYTHON_INSTALL_DIR`、`GOPATH`/`GOMODCACHE`/`GOCACHE`、`PIP_CACHE_DIR` → `$GS/<eco>`，用户镜像配置以只读副本继承），注册表网络允许；
- **验证器不运行这些 exec 标准**：判定**逐条**进行（`ecosystemSupported`，§7.4.1）；不受支持的 exec 标准只计入观测轨 O，artifact 标准照常由内置检查验证。全部 exec 标准都不受支持时，Goal 以“未经机器验证（生态未支持）”进入评审；只有部分不受支持时，为“有保留的已验证”并逐条列出（§7.10.3）。yarn 与 bun 项目在 M1 中按“生态未支持”处理。

下面逐生态表中非 Node 的行是 M2 草案。

**验证器只读取 `$VS` 中的配置（ADR-061）：** 验证器（V）使用的一切配置——用户级 npmrc 的副本、pnpm 配置、浏览器与引擎缓存位置——都由安装器生成在 `$VS`，记录内容哈希，**每次验证前复核**。`16` §16.8 的 V 列不得引用任何 Agent 可写的路径（`$GS`、卫星），lint 检查此规则。动机：npm 与 pnpm 执行 `run` 脚本时会应用 npmrc 中的 `node-options`（成为 `NODE_OPTIONS`，例如 `--require <文件>`）与 `script-shell`；如果验证器读取 Agent 可写的 npmrc，Agent 就能在测试进程内先于测试执行任意代码。同一原则也用于 Engine Host：Host 在沙箱外运行包管理器的全局根查询，它的环境不引用任何 Agent 可写的位置（唯一定义 `05` §5.3.6，ADR-213）。

**验证器存储完整性的唯一处置（R4-D7-06）：** `$VS` 中任何内容哈希不符——配置副本、depcache 条目、工具缓存——都按同一规则处理：记录 `anomaly{detector:"verifier_store_tampered", path}`（severity 3，阻断本次结论）；删除受影响的条目；本次验证以 `verify_env_error{stage:"integrity"}` 结束（不返工、不计次数）；由安装器重新生成后自动重试一次。由于 S2 下 Agent 不可写 `$VS`，此事件同时意味着沙箱边界可能失效，Needs-You 条目提示检查沙箱档位。（取代此前分别出现的 `verifier_config_tampered` 与 `depcache_tampered`。）

**复核成本（R5-D10-02）：** `$VS` 中的配置副本很小，每次验证前做内容哈希。数百 MB 的 `$SH` 浏览器/引擎缓存与 depcache 条目，每次验证前只做 stat 快照比对（path、size、mtime、**ctime**、inode；目标 ≤ 200 ms），不一致或距上次全量内容哈希超过 24 h 时才做全量内容哈希（后台、低优先级，计入 `13` 的后台预算）。

**Node 运行时选择（ADR-085，R5-D7-03）：** 按以下顺序确定项目的 Node 版本：`.nvmrc` → `.node-version` → `package.json#volta.node` → `engines.node`（取满足范围的最新 LTS）→ Tower 默认 LTS。添加项目时显示结果并请人确认，记入 `VerifyProfile.node`。安装器从官方发布处下载该版本（校验 SHASUMS256 签名）到 `$SH/tools/node@x.y.z/`，与 pnpm 同一机制；Node 版本进入 `depsKey`，所以安装器构建原生模块所用的 Node 与 A/V 一致（ABI 一致）。**A、I、V 三个角色的 `PATH` 由 Tower 显式构造**：`$SH/tools/node@…/bin`、`$SH/tools/pnpm@…`、槽位或卫星的 `node_modules/.bin`、系统基础路径（`/usr/bin:/bin:/usr/sbin:/sbin`）；不继承 GUI 进程的 `PATH`（macOS 从 Dock 启动的应用拿不到 shell PATH）。

**Node 版本声明变化（R6-D7-03d）：** 每次验证按同一顺序从 **pin** 解析 Node 版本。结果与 `VerifyProfile.node` 不同（例如 Goal 修改了 `.nvmrc` 或 `engines`）时，验证使用 pin 声明的版本（经工具缓存安装；`depsKey` 随之变化），结论标为“有保留的已验证（Node 版本与项目档案不同：<新> vs <旧>）”，并生成 `ratify` 类 Needs-You：“更新项目档案的 Node 版本为 <新>？”。人确认后档案更新，此后的验证不再带此保留。

**包管理器识别（R4-D7-02）：** `lockfileVersion` 不足以判定主版本（pnpm 9–12 写出的都是 `'9.0'`），按以下顺序：

1. `package.json#packageManager`（`pnpm@x.y.z`，可带哈希）——**可验证的 pnpm 项目以此为准**；
2. `package.json#devEngines.packageManager`；
3. 都没有时：Tower 在用户检出目录中以用户自己的 PATH 运行 `pnpm --version`（沙箱外、Tower 进程），把结果记入 `VerifyProfile.packageManager`，在添加项目时请人确认，并建议把 `packageManager` 字段提交进仓库。未确认之前，该项目的 pnpm exec 标准按“生态未支持”处理（`packageManagerResolved = false`）。

**Tower 工具缓存：** 识别出确切版本后，由安装器从注册表下载该版本的 pnpm（按注册表元数据的 `dist.integrity` 校验）到 `$SH/tools/pnpm@x.y.z/`，并放在 A/I/V 三个角色 PATH 的首位；不依赖 Corepack（Node ≥ 25 不再随附 Corepack），也不写用户的 Corepack 目录；以对应版本前缀设置 `manage-package-manager-versions=false`，关闭 pnpm 的自切换（否则全局 pnpm 会按 `packageManager` 自行下载到用户全局目录）。npm 默认使用所选 Node 自带的 npm；`packageManager` 指定 `npm@x` 时同样经工具缓存取得。

**按包管理器主版本生成配置（ADR-063）：** 按上面识别出的包管理器与主版本，按角色（A/I/V）生成配置：pnpm ≤ 10 使用 `npm_config_*` 前缀，pnpm ≥ 11 使用 `pnpm_config_*` 前缀（只设对应版本的前缀）；用户级 npmrc 经 `NPM_CONFIG_USERCONFIG` 指向为该角色生成的副本（A 在 `$GS`，只进入 Agent 一侧的 bash 环境、不进入 Host 环境，`05` §5.3.6，ADR-213；V 与安装器阶段 2、3 共用 `$VS/npmrc`，只读——这两处副本都按 `16` §16.8 规则 5 生成：白名单、URL userinfo 剥除、凭据判定，ADR-180；安装器阶段 1 的配置在 `$TI` = `~/.tower/installer/<projectId>/`，不含认证行，阶段 3 对 `$TI` 读写拒绝；私有注册表令牌只在阶段 1 以即时投递文件提供，见下方安装器，ADR-063/165；ADR-063 中“合同可把注册表令牌授予 Agent 可读的 npmrc”在 M1 中撤回，属 M2）；`verify-deps-before-run=false`（按版本选前缀）；Prisma 按角色设置 `XDG_CACHE_HOME`（V → `$VS/xdg`，引擎由安装器预取）；node-gyp 用 `npm_package_config_node_gyp_devdir`。具体变量以 `16` §16.8 为准。

**安装器与槽位准备**（`slot.prepare`）：安装器只负责**第三方依赖**；项目自身的生命周期脚本与 `VerifyProfile.prepare` 在槽位中针对 pin 执行（ADR-062）。

```
# —— I：安装器（Supervisor，独立沙箱）——
depsKey = sha256(全部 lockfile + 各 workspace 的“stage 版” package.json（见下）+ pnpm-workspace.yaml + .pnpmfile.cjs +
                 patchedDependencies 的补丁文件 + file: 本地依赖的源目录内容 + 项目 .npmrc（令牌剥离）+
                 包管理器及确切版本 + Node 确切版本 + 平台)
          # 只覆盖第三方依赖的输入；不含项目其余源码、项目自身生命周期脚本、VerifyProfile.prepare
if depcache[depsKey] 不存在:
  stage = $VS/stage/<depsKey>/       # 保持仓库相对路径
    放入：根与各 workspace 的 package.json（stage 版）、lockfile、pnpm-workspace.yaml、项目 .npmrc（令牌剥离）、
          .pnpmfile.cjs（若存在；lockfile 的 pnpmfileChecksum 要求它在场）、
          补丁文件（路径取自 patchedDependencies 的**值**，不假定在 patches/ 下，R5-D7-02c）、
          file: / link: 本地路径依赖的源目录（R5-D7-02b；其自身的构建脚本不在 stage 执行，按项目生命周期在槽位中执行）
    stage 版 package.json：**只删除 `scripts` 字段**，保留其余一切影响解析与构建的字段（R4-D7-05）
  前置检查：lockfile 中存在 git 托管依赖（git+ssh / git+https / github: / codeload tarball 等非注册表来源）→ M1 不支持：
    git 依赖在拉取时会执行其自身的 prepare，这是持令牌的代码执行；该项目的 exec 标准按“生态未支持”处理（detail:"git_dependency"，
    ecosystemSupported 返回 false），不进入下列阶段（R6-D7-03c）
  阶段 1 · 拉取（带令牌，联网，不执行任何代码；ADR-085）：
    网络 = 注册表允许列表（11 §11.6.2）；配置 = $TI 的 npmrc 加上**即时投递**的令牌文件（ADR-165/166）：Tower **不保存**注册表令牌，每次运行时只从**用户级** ~/.npmrc
    读取认证行（//<registry>/:_authToken 等，按注册表对应；其中的 ${VAR} 以用户登录环境展开）；项目 .npmrc 中的认证行**不读取**
    （仓库控制的凭据不可信，与 pnpm 自身的行为一致，ADR-167），
    写入 ~/.tower/run/<id>/（目录 0700、文件 0600），只在本阶段存在，阶段结束（含失败、超时）即删除；本阶段只运行包管理器自身，
    禁用 pnpmfile 与生命周期脚本，不执行任何项目代码；阶段 2、3 不含令牌（两阶段的网络与执行范围以下方定义为准）
    pnpm：pnpm fetch --ignore-pnpmfile            # 只按 lockfile 下载 tarball 并按 integrity（sha512）校验
    npm： npm cache add <package-lock.json 中每个包的 resolved URL>   # 同上，校验 integrity
    运行器完整性基准（ADR-092）：对运行器集合（见下）中每个包，以**注册表 tarball**（已按 lockfile integrity 校验）为准，
      解包计算逐文件哈希，记入 Tower 数据库（不在 $VS 内）——基准来自注册表，而不是来自安装产物
  阶段 2 · 预取（不带令牌，只允许已登记下载域名，只运行 Tower 内置预取器，不执行任何项目或依赖代码；ADR-093）：
    内置预取器按 lockfile 中的版本取得：Playwright / Cypress / Puppeteer 浏览器、Prisma 引擎、sharp 预编译库、
      node-gyp 所需的 Node 头文件 → $SH（下载域名清单登记于 16，含 nodejs.org、Playwright CDN、binaries.prisma.sh、
      download.cypress.io 等）
    项目自定义下载：只能由人在 VerifyProfile.prefetch 中批准（URL + 校验和 + 目标路径），同样在此步执行
    时机与显示（R7-D10-01b）：添加项目与 lockfile 变化时在后台预热执行，尽量移出首次验证的关键路径；仍在关键路径上时，
      Live Line 按 `12` §12.6 的子状态词表与格式显示：验证时为 verifying 的 `预取`；Goal 启动时并入 preparing 的 `依赖` 步骤（preparing 没有 `预取` 一词，ADR-223）；
      耗时按下载体积与带宽由 SP5 测量登记，不计入 5 s 物化预算
  阶段 3 · 安装（**不带令牌、断网**；.pnpmfile.cjs 作为项目代码只在这里运行；ADR-092）：
    配置 = $VS/npmrc（只读，与验证器同一份净化副本，16 §16.8 规则 5，ADR-180；阶段 2 的预取器同此）
    写允许 = **本次运行的新暂存目录** $VS/staging/<installRunId>/ + 临时目录；**共享缓存一律只读**——$VS 的 pnpm store、
      npm cache、$VS/xdg、$SH（含 node-gyp 头文件与浏览器）、其他 depcache 条目与验证器配置（ADR-092 修订，R7-D7-02）；
      $TI 读写拒绝。共享缓存只由 Supervisor 运行的拉取（阶段 1）、预取（阶段 2）与发布写入。
      本阶段的沙箱另拒绝创建硬链接与钥匙串查找（11 §11.6.2 钥匙串一行的清单，ADR-224）
    pnpm 的副作用缓存关闭（side-effects-cache=false，按版本前缀），构建结果只进入暂存目录；若 SP6c 证明某版本的
      `pnpm install --offline` / `rebuild` 在只读 store 上无法完成，按以下顺序选择回退（R8-D10-01）：
        ① 只私有化 store 的**索引与临时目录**（pnpm 需要写入的部分），内容文件仍只读引用共享 store；
        ② 只有 ① 不可行时，才对 store 做 CoW 私有副本放在暂存目录内，随暂存目录丢弃；在不支持写时复制的卷上禁用此回退，
           该版本的 pnpm 项目按“验证环境不支持”提示（verify_env_error{stage:"install", detail:"readonly_store"}）
      预算与测量：SP6c 测量“只读 store / ① / ② / 副作用缓存关闭”四种情况的安装时长与磁盘占用，结果登记于 `13`；
      ② 的临时占用计入 30 GB 磁盘预算；副作用缓存关闭后每个新 depsKey 都要重建原生依赖，其时长计入首次验证的服务时间。
    安装时需要下载而未经预取的包会失败 →
      verify_env_error{stage:"install", missing:"download"}，提示把它加入 VerifyProfile.prefetch
    pnpm：pnpm install --offline --frozen-lockfile --ignore-scripts
          pnpm rebuild --pending       # 执行因 --ignore-scripts 挂起的构建。实测（pnpm 12.6）它也会执行根包的 postinstall；
                                       # 由于 stage 版 package.json 已删除 scripts，这里没有项目脚本可执行（R5-D14-01c）
    npm： npm ci --offline --ignore-scripts
          npm rebuild <names>          # names = lockfile v3 中 hasInstallScript: true 且不是 workspace / file: 链接的包；`10` §10.4.2 引用此命令
    环境变量指向阶段 2 预取到 $SH 的浏览器、引擎与头文件（变量名见 16 §16.8）
  路径依赖检测：在产物文本文件中查找 stage 的绝对路径（ripgrep 固定字符串，上限 50 万文件）
      → 命中则 depsKey.pathDependent = true：安装器改为以**每个槽位的实际路径**为安装位置，分别构建
        depcache[depsKey@slot-k]（仍由安装器执行，槽位内的验证进程从不执行 install）
  产物按仓库相对路径写入暂存目录的 tree/ + manifest.json（各依赖目录的相对路径与树哈希）
  发布（Supervisor，沙箱外）：校验暂存目录的 manifest 与运行器集合基准一致后，以原子 rename 发布为 depcache[depsKey]，
      发布后只读；来源记录（depsKey → installRunId、全部输入哈希、发布时间）写入 Tower 数据库。
      $VS 中出现数据库没有来源记录的 depcache 条目 → 视为不存在并删除，记 verifier_store_tampered
      （防止安装阶段的代码预先写入他人或未来 base 的 depsKey，R6-D7-02）

# —— V：槽位准备（验证器，S2；PATH 由 Tower 显式构造）——
物化：manifest 中每个目录经 clonefile / reflink 复制到槽位同一相对路径；不支持写时复制的卷做完整复制；**禁止硬链接**
      物化后立即记录第三方依赖目录的 stat 快照（path、size、mtime、**ctime**、inode）
pnpm：改写槽位内 node_modules/.modules.yaml 中的 store 路径为 $VS 中的只读 store；删除 .pnpm-workspace-state-v1.json（ADR-063）
项目生命周期（ADR-062）：针对 pin，按包管理器语义依次执行 preinstall → install → postinstall → prepare（存在者）：
      每个阶段内先按 workspace 依赖拓扑顺序执行各 workspace 包与 file: 本地依赖，最后执行根包；单并发
      已知的“守卫类”脚本静态识别后跳过并记入重放包：`npx only-allow <pm>`、`only-allow`、`is-ci`、`husky` / `husky install`
      网络 = VerifyProfile.env.network（默认只有 localhost）；超时 = VerifyProfile.prepareTimeoutSec（默认 600 s，含下一步）
      → 例如 prisma generate 读取 pin 中的 schema.prisma，把客户端生成到槽位的 node_modules/.prisma
VerifyProfile.prepare（如有）
依赖完整性复核（R4-D7-01、ADR-085、ADR-092、R5-D7-01）：
  (a) 运行器集合（ADR-098）：从 **lockfile 的解析图**确定——别名展开后的真实包名与版本（含 `npm:` 别名），而不是 package.json
      中写的名字。种子 = 测试运行器类包（vitest、@vitest/*、jest、jest-*、@jest/*、mocha、chai、@playwright/*、playwright、cypress、
      ava、tap、tsx、ts-node、typescript、esbuild、vite、@swc/*、babel-jest、@babel/core）+ 标准命令链中每个程序经 .bin 解析到的包；
      集合 = 种子在解析图中的节点及其**直接依赖**。
      运行器身份 = (真实包名, 注册表来源, 版本)。与阶段 1 记录的**注册表 tarball 逐文件哈希**比对（基准不来自安装产物）
      做法：物化时的 stat 快照含 ctime 与 inode——这两项无特权进程无法伪造或恢复——生命周期之后只对 ctime/inode 变化的
      文件重新做内容哈希；所在文件系统的 ctime 不可信（部分网络文件系统）时改为全量内容哈希。
      预算（R6-D10-01）：stat 遍历 + 变化文件哈希，100–300 MB 的运行器集合目标 ≤ 1 s（SP5 实测回填）；全量哈希只作回退
      → 不一致：sentinel{detector:"runner_tampered", package, files}，severity 3，阻断 Verified，本次标准结果不计入 V
  (a') 运行器被补丁或改向（ADR-092、ADR-098、ADR-105，R6-D7-01、R7-D7-01、R8-D7-02）：以 **base 的 lockfile** 为参照，以下每个条件都只针对
      **相对 base 新出现或发生变化**的情况；base 中已有的别名、补丁、覆盖不在每个 Goal 中报出，而是作为项目级信息在
      VerifyProfile 中由人确认一次（`runnerExceptions`）。运行器集合中任一包出现
      · 补丁或覆盖：patchedDependencies / patches/、package.json 的 overrides / resolutions / pnpm.overrides / pnpm.packageExtensions，
        或 pnpm-workspace.yaml 的 overrides / catalog / catalogs / packageExtensions / patchedDependencies 涉及它；
      · 别名：解析图中它由 `npm:` 别名引入，或 base 中同一依赖名解析到的真实包名不同；
      · 来源：解析为 link: / file: / git，或 `resolution.tarball` 指向非已配置注册表的地址（拉取阶段的网络允许列表通常会让其
        失败，但用户的允许列表若含通用代码托管域名则挡不住，所以单独检测）；
      → sentinel{detector:"runner_patched", package, via}，severity 2，Goal 最高只能得到“有保留的已验证”，人可覆盖
      · 版本相对 base 变化（含 allowNewDependencies=true 时的升级）→ 同一 detector，severity 1，以提示显示在验收面板，不影响结论
  (b) 其他第三方依赖：与物化后的 stat 快照（含 ctime 与 inode）比较，变化的文件再与 manifest 哈希比对
      → 不一致：sentinel{detector:"runner_tampered"}，severity 2，在验收面板列出
  (c) 允许的改动只限“持久生成路径”：node_modules/.prisma/** 与 VerifyProfile.generatedPaths
  (d) 未跟踪产物检查：记录 pin 工作树中（node_modules 之外）新增的未跟踪文件；不在 generatedPaths 与 .gitignore 已知构建输出中的
      → sentinel{detector:"prepare_untracked_output", paths}，severity 2（可能用于影响运行器行为，例如向配置搜索路径放文件）
缓存重置：标准执行前清空并重建 TMPDIR，删除 node_modules/.cache/**、node_modules/.vite/**、node_modules/.vitest/**
      与 jest 默认缓存目录（经 --cacheDirectory=<新的空目录> 注入），使 prepare 留下的转换缓存不能改变运行器行为
任何一步失败 → verify_env_error{stage:"prepare", detail}（不返工，ADR-037）
槽位内只执行 run 类命令（标准、生命周期脚本、prepare），绝不执行 install / add / update
```

- **残余风险（R5-D7-01）：** lifecycleIndirection 只把生命周期脚本的**直接**调用文件纳入保护；它们的传递闭包（被 `require` 的模块、Prisma 自定义 generator provider、vite 本地插件等）没有完整定义。这部分由 (a) 运行器内容哈希、(d) 未跟踪产物检查与缓存重置兜底，登记为残余风险“中”。
- **`.pnpmfile.cjs` 是项目代码**（ADR-085）：默认 protected，修改触发 `lifecycle_script_changed`（§7.5.2 R-T9）；它只在不带令牌、断网的安装阶段运行。
- **耗时归属：** 物化（命中时 ≤ 5 s）与生命周期 + prepare 分开计量。后者常常是完整构建，其时长计入验证服务时间 S（§7.4.10）与 `13` 的 prepare 指标，不受 5 s 预算约束。
- **卫星侧（A）的物化（R4-D7-04）：** Goal 卫星的 `node_modules` 同样从 depcache 物化（`10` §10.4.2），但 store 指向 Agent 存储：物化后改写卫星中 `.modules.yaml` 的 store 路径为 `$GS` 的 store、删除 `.pnpm-workspace-state-v1.json`，并在 A 的生成配置中设置 `confirm-modules-purge=false`（按版本前缀）。这样 Agent 在没有 TTY 的 bash 中执行的第一次 `pnpm install` 不会因 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` 失败；最坏情况是一次非交互的重新链接（`14` P16）。

**逐生态物化规格（R2-D7-02）：**

| 生态 | 安装位置与命令 | 物化到槽位的内容（CoW） | 槽位内可写叠加层 | 必须在槽位内重建的部分 | 绝对路径约束 | 阶段 |
|---|---|---|---|---|---|---|
| **Node · pnpm**（9/10/11/12） | stage 中 `pnpm install --frozen-lockfile --ignore-scripts`（import 方式 clone-or-copy），再只为第三方依赖 rebuild；store/cache/state 指向 `$VS`，前缀按主版本（ADR-063，`16` §16.8） | 根 `node_modules/`（含 `.pnpm` 虚拟存储）与每个 workspace 包的 `node_modules/`；包内符号链接为相对路径 | 槽位副本本身（如 `node_modules/.cache`、`.vite`）；`TMPDIR` | 项目自身生命周期脚本与 `prepare`（每次，针对 pin，ADR-062）；`pathDependent` 时由安装器按槽位路径构建 depcache 变体 | 改写 `.modules.yaml` 的 store 路径、删除 `.pnpm-workspace-state-v1.json`；`verify-deps-before-run=false`；槽位内不执行 install | **M1** |
| **Node · npm**（10/11） | stage 中 `npm ci --ignore-scripts`，再只为第三方依赖 `npm rebuild`；cache 指向 `$VS` | 根 `node_modules/`（workspaces 为相对符号链接）与 `.bin` 相对链接 | 同上 | 同上 | `node_modules/.package-lock.json` 无绝对路径；槽位内不执行 install | **M1** |
| 浏览器与引擎（Playwright、Cypress、Puppeteer、Prisma） | 安装器预取到 `$SH`（浏览器；Prisma 引擎在 `$SH/prisma`，发布 depcache 时由 Supervisor CoW 物化到 `$VS/xdg/prisma`，V 经 `XDG_CACHE_HOME` 读取，ADR-063/093，`16` §16.8） | 不复制：槽位以只读方式引用 | — | Prisma 客户端由项目 `postinstall`/`prepare` 在槽位内生成 | 缓存路径固定，经环境变量传入 | **M1** |
| Node · Yarn Berry（PnP） | 槽位内 `yarn install --immutable`，`YARN_CACHE_FOLDER` 指向该槽位对验证器 yarn cache 的 CoW 副本 | 只复制 zip cache | `.yarn/install-state.gz`、`.yarn/unplugged/` | 每次在槽位内安装（cache 命中时约数秒） | `.pnp.cjs` 使用相对路径 | M2 草案 |
| Python · uv | 安装器 `uv sync --frozen` 填充验证器 uv cache | 不复制 `.venv`（含绝对路径的 shebang 与 `pyvenv.cfg`） | 槽位内 `.venv`；该槽位对 uv cache 的 CoW 副本（uv 需要写缓存锁） | 每次 `uv sync --frozen --offline`（`UV_LINK_MODE=clone`），测试用 `uv run --no-sync` 或 `.venv/bin/python -m pytest` | `.venv` 必须在槽位内重建 | M2 草案 |
| Python · pip | 安装器 `pip wheel -r … --require-hashes` 生成 wheelhouse | wheelhouse 只读引用 | 槽位内 venv | `python -m venv` + `pip install --no-index --find-links <wheelhouse>` | 同上 | M2 草案 |
| Rust · cargo | 安装器 `cargo fetch --locked` 填充验证器 `CARGO_HOME`（registry/index、cache、src） | 每个槽位一份 `CARGO_HOME` 的 CoW 副本（**cargo 需要可写的 `CARGO_HOME`**：`.package-cache` 锁、`registry/src` 解压） | 槽位 `CARGO_HOME` 副本；槽位 `target/`（验证器自有，跨次保留以增量编译） | `depsKey` 变化时 `cargo clean -p <workspace crates>` | `target/` 的 dep-info 含绝对路径：槽位路径固定不变 | M2 草案 |
| Go | 安装器 `go mod download` 填充验证器 `GOMODCACHE` | `GOMODCACHE` 只读引用（模块文件本身只读） | 槽位 `GOCACHE`（构建缓存，验证器自有） | — | `GOFLAGS=-mod=readonly -count=1`；模块缓存写锁需求待 SP5 实测 | M2 草案 |

**测试用例：以 `14` §14.2 的 P 编号为唯一编号**（R5-D14-01b）。本文此前的 T1–T17 映射如下；新增用例直接以 `14` 的编号列出。

| 本文旧编号 | `14` 编号 | 内容 |
|---|---|---|
| T11 | P1–P6 | 包管理器版本矩阵（pnpm 9/10/11/12、npm 10/11） |
| T8 | P7 | 用户 npmrc 的私有 registry 与令牌 |
| T10 | P8 | 篡改：Agent 的 npmrc 与 `$VS`（`verifier_store_tampered`） |
| T9 | P9 | Prisma：槽位内针对 pin 生成 |
| T6、T7 | P10 | 原生模块与 Playwright 浏览器 |
| T12 | P15 | Node ≥ 25 无 Corepack，确切 pnpm 版本 |
| T17 | P16 | 卫星首次 `pnpm install` 无 TTY |
| T13 | P17 | 无 `packageManager` 字段 |
| T14 | P19 | `postinstall` 改写 `node_modules/vitest` |
| T16 | P20 | 守卫类 preinstall 与重型 prepare |
| T1 | P21 | 物化耗时：参考项目 3 万文件 `node_modules`，APFS 命中 ≤ 5 s |
| T2 | P22 | Agent 改写自己存储里的 `vitest`，验证器结果不受影响 |
| T3 | P23 | 槽位内写 `node_modules` 后 depcache 树哈希不变 |
| T4 | P24 | 路径依赖检测（postinstall 写入绝对路径的夹具包）→ 按槽位路径构建变体 |
| T5 | P25 | monorepo（3 个 workspace，pnpm 与 npm 各一） |
| T15 | P26 | stage 保留 `pnpm.overrides`、`onlyBuiltDependencies`、`patchedDependencies`（补丁不在 `patches/` 下）与项目 `.npmrc` |
| — | P27 | 规避 `runner_tampered`：生命周期原地改写运行器文件、补齐尺寸、恢复 mtime → 仍被内容哈希检出 |
| — | P28 | `.pnpmfile.cjs`：拉取阶段 `--ignore-pnpmfile` 不执行；安装阶段执行时无令牌、无网络 |
| — | P29 | `file:./vendor/lib` 本地依赖进入 stage，其构建脚本在槽位中执行 |
| — | P30 | Node 运行时选择（`.nvmrc` / `engines`）、从 Dock 启动时 PATH 仍正确、原生模块 ABI 一致 |
| — | P31 | `"test": "vitest run && pytest"` 判为“生态未支持”；缺失程序 exit 127 → `verify_env_error{stage:"exec"}` |
| — | **P32（`14` §14.2 已登记）** | 补丁运行器：`patchedDependencies` 修改 `vitest` → `runner_patched`；生命周期改写运行器文件 → 与注册表 tarball 基准不符 → `runner_tampered` |
| — | **P33（`14` §14.2 已登记）** | `pnpm.overrides` 把 `vitest` 指向 `link:./vendor/vitest` → `runner_patched` |
| — | **P34（`14` §14.2 已登记）** | `.pnpmfile.cjs` 在安装阶段预写他人或未来 base 的 `$VS/depcache/<depsKey>/` → 写拒绝；无来源记录的条目被删除并记 `verifier_store_tampered`；安装前后 `$VS/pnpm-store` 与 `$SH` 的树哈希不变；只读 store 下离线安装与 rebuild 成功 |
| — | **P35（`14` §14.2 已登记）** | 预取：Playwright 浏览器、Prisma 引擎、node-gyp 头文件在预取步骤下载，离线安装成功；未登记的下载 → `verify_env_error{stage:"install", missing:"download"}` |
| — | **P36（`14` §14.2 已登记）** | lockfile 含 git 托管依赖 → 生态未支持；Goal 修改 `.nvmrc` → “Node 版本与项目档案不同”的保留标签与 ratify 条目 |
| — | **P37（`14` §14.2 已登记）** | `npm:` 别名把 `vitest` 映射到注册表上的另一个包 → `runner_patched`（别名）；对照：base 中已有该别名、Goal 未改动 → 无 `runner_patched` |
| — | **P38（`14` §14.2 已登记）** | `pnpm-workspace.yaml` 的 `overrides` / `catalog` / `catalogs` 改动运行器版本 → protected 拦截；放行后 `runner_patched` |

- **预热：** 观察器发现 Goal worktree 的 lockfile 哈希变化时，安装器在后台以 nice 19、并发 1 预先构建对应 `depsKey` 的 depcache。目标：依赖未变时，准备阶段（checkout + 物化）≤ 5 s（APFS，参考项目 3 万文件的 `node_modules`，`13` 测量）。
- **完整性复核：** depcache 条目建立时记录目录树哈希；每 24 h 以及每次 `poolSize` 槽位重建时抽查一次，不一致 → 按上文“验证器存储完整性的唯一处置”（`verifier_store_tampered`）。
- **构建与结果缓存：** Rust `target/` 与 Go `GOCACHE`（M2）属于槽位私有、由验证器写入的构建缓存，按槽位保留以支持增量编译，与 Agent 隔离。`turbo`/`nx` 结果缓存、`vitest --changed`、`jest --onlyChanged`、`.pytest_cache`（`-p no:cacheprovider`）、go test 结果缓存（`GOFLAGS=-count=1`）一律禁用。
- **残余风险：** 没有 OS 沙箱（S0）时，Agent 进程理论上能写任意路径，包括验证器存储。此时所有“已验证”都带 “S0 环境”限定（ADR-021，`12` 的“有保留的已验证”变体），威胁表登记为高。

**环境变量：** 采用白名单，而不是继承用户 shell。

```ts
interface VerifyEnv {
  inherit: ["PATH", "HOME", "USER", "LANG", "SHELL", /* 工具链定位 */ "NVM_DIR", "RUSTUP_HOME", "GOROOT", "PYENV_ROOT"];
  set: { CI: "1"; TMPDIR: "<slot>/.tmp"; TZ?: string /* VerifyProfile 可固定 */; LC_ALL?: string;
         TURBO_FORCE: "true"; NX_SKIP_NX_CACHE: "true"; GOFLAGS: "-count=1";
         PYTHONDONTWRITEBYTECODE: "1"; FORCE_COLOR: "0";
         TOWER_PORT_BASE: string; PORT: string;                   // §7.4.4 端口段（ADR-037）
         /* 验证器存储路径：按 16 的包管理器环境变量表（ADR-045）注入 */ ...pmEnv };
  profileVars: Record<string, string>;     // 🧑 VerifyProfile.env.vars（非机密）
  secrets: "strip";                         // 继承变量中名称匹配 /(TOKEN|SECRET|KEY|PASSWORD|CREDENTIAL)/i 的全部剔除
}
envHash = sha256(canonicalJSON(生效 env 去掉 TMPDIR/端口) + toolchainVersions
                 + canonicalJSON(localFiles))   // M1 无机密；M2 另计机密名称与投递方式（§7.4.11）
// localFiles（ADR-172/173）：本应复制的本地文件（seeded 条目）的 (path, contentHash) 列表，按 path 排序；本应复制而未复制的
//   条目（不可读或不存在，或在该 Goal 的 base 中被跟踪，ADR-206）以 (path, "not_copied") 进入，集合变化也改变 envHash；isSecret 与未批准的条目不进入。
//   来源是 verify() 在查缓存之前对 seeded 条目的那一次读取（§7.4.1）：查询键、写进槽位的内容与 criterion_check.env.localFiles
//   都取自它，不另读（16 ProjectLocalFile 行“同一份内容”）
```

**M1：验证标准不携带机密（ADR-164；唯一定义在 `11` §11.7.0）：** M1 中 exec 标准**不能**声明机密——`env` 字段不可用，合同编辑器拒绝并提示；Agent 的工具调用也不获得机密（ADR-161）。需要机密才能运行的检查写为 **human 标准**：由人在自己的环境中确认并勾选（诚实语法：这是 Human，不是 Fact）；人试图给 exec 标准加机密时，合同编辑器给出“改为 human 标准”的一键转换。加上本地文件中的含机密文件不播种（§7.4.2，ADR-165），**Tower 不会自动**把机密交给 Agent 可影响的进程——验证器与验证槽位从不接触机密；检验检出只在人显式选择“带上本地机密文件”时才有（`inspect_with_secrets`，ADR-166），钥匙串只存放 Tower 自己使用的凭据（模型提供商密钥、云 SDK 凭据，共两类，ADR-166；私有注册表令牌不由 Tower 保存，安装器第 1 阶段每次从用户的 npmrc 读取；均从不进入 Agent 可影响的进程）。带机密验证标准的完整设计保留为 M2 的起点，见 §7.4.11。

### 7.4.4 执行沙箱、服务、端口与资源上限

| 项 | 规则 |
|---|---|
| 进程组 | 每条标准用 `spawn(cmd, {detached:true, cwd: slot, shell: "/bin/sh"})` 启动新进程组；所有终止都对 `-pgid` 发信号 |
| 超时 | `criterion.timeoutSec`（必填）。到时先 `SIGTERM`，宽限 10 s 后 `SIGKILL`；verdict 记为 `timeout` |
| 静默超时 | 连续 `max(120 s, timeoutSec/4)` 无输出且 CPU 占用 < 2% → 视为挂起，verdict `hung`（与 timeout 分开统计） |
| 内存 | Linux：`systemd-run --user --scope -p MemoryMax=<m>`，不可用时用 `prlimit --as`；macOS 没有 cgroup，由 Supervisor 每 2 s 采样进程树 RSS 之和（`ps -o rss= -g pgid`；这里的进程组是验证器自己以 `detached` 启动每条标准时建立的，属 Tower 自有，不涉及 Agent 侧的进程识别——后者以 Run 令牌识别、每 Goal 内存上限按 ADR-146 每 5 s 从 `exec` 已知的直接进程遍历后代树求和，脱离进程树者由最多每 60 s 一次的令牌全扫描覆盖，见 `13`），超过上限就杀掉，verdict 记 `resource_exceeded`（随后按 ADR-054 判别，§7.4.5）。**准入预留**（ADR-042）：`reserve = max(1 GB, 1.3 × p95(该项目验证进程树峰值 RSS，最近 20 次))`，首次未知时取 2 GB；**杀进程上限** `m = VerifyProfile.env.memLimitMb ?? max(2 GB, 2 × reserve)`，且不超过整机模型给出的余量（`13` §13.8.3） |
| CPU 与优先级 | macOS：`taskpolicy -c utility`；Linux：`nice -n 10`，保证 UI 不卡顿（`13`）。并发与排队见 §7.4.10 |
| 文件系统（S2） | macOS Seatbelt、Linux bwrap（`11` §11.6）。写允许：槽位、槽位内 `.tmp`、验证器的构建缓存（Rust `target/` 等）。**写拒绝：depcache、`$VS`（含其中的配置副本，ADR-061）、槽位的 git 目录 `slot-<k>.git`、用户仓库及其 `commonDir`（ADR-060）**。运行后仍经 `towerGit` 检查 `status`：被跟踪文件被改 → verdict `pass_mutated`（§7.4.5） |
| 文件系统（S0） | 无写保护；运行验证需 ADR-022 的 Goal 级授权；结果带 “S0 环境”限定 |
| 网络 | 执行阶段默认只允许 localhost；唯一的放行来源是 `VerifyProfile.env.network`（只能在本机修改，`16` §16.5；合同中没有可放行执行阶段网络的字段，artifact 标准的 `network` 只供 Supervisor 的链接检查器使用，§7.4.9，ADR-178；`11` §11.6.3）。macOS 用 Seatbelt 网络规则；Linux **不**用 `--unshare-net`（会破坏 docker 与本地服务），改用沙箱代理的主机允许列表 |
| 端口（ADR-037、ADR-055） | Supervisor 为每个 Goal worktree、每个验证槽位与每个人工检验检出（`10` §10.8.3）分配互不重叠的端口段：**20000–29999**（低于 macOS 与 Linux 的临时端口范围），每段 20 个；分配前对段内端口做 `bind` 探测，冲突则跳段。经 `TOWER_PORT_BASE` 与 `PORT` 注入；`VerifyProfile.env.vars` 支持模板 `${port:N}`（段内第 N 个）与 `${portBase}`，例如 `DATABASE_URL=postgres://localhost:${port:5}/app`。添加项目时做一次“端口能力试运行”（两个不同端口段同时启动 services 并检查健康），失败则标记 `ports:"fixed"`，该项目同一时刻只允许一个 Goal 或槽位运行服务（并发度 1） |
| 服务（ADR-037） | `VerifyProfile.setup` → `services[]`（每个服务：启动命令、健康检查命令或 URL、超时、清理命令）→ 标准 → `teardown`。服务在槽位的进程组中运行，`teardown` 之后再对整个进程组 `SIGKILL` 兜底 |
| Docker | 默认验证器与 Agent **都不能**访问 docker socket。`services` 中声明 `docker: true` 需要人批准（单向门级别的项目设置）；批准后 compose project name 固定为 `tower-<goalId|slot-k>`，`teardown` 执行 `docker compose -p <name> down -v` |
| 验证环境故障 | 安装器失败、服务启动或健康检查失败、端口段冲突、沙箱不可用 → **不**产生 `criterion_check`，而是记录 `kind:"sentinel"` 之外的专门 Fact `verify_env_error{stage: "install"|"prepare"|"service"|"port"|"sandbox"|"resources"|"integrity"|"exec"|"baseline", detail}`（`baseline`：flake 的 base 确认无结论，§7.4.6，ADR-239）（`producer:"verifier"`）。它不触发自动返工、不计入返工次数，生成 Needs-You（severity 2，见 §7.10.3），因为问题在环境而不在 Agent 的代码 |
| 输出 | stdout/stderr 合流写入 `~/.tower/goals/<goalId>/verify/<verifyId>/<criterionId>.log`；单文件上限 50 MB，超出时保留头 5 MB 和尾 20 MB，中间写截断标记 |

### 7.4.5 结果解析

**退出码是主判据，解析器只能补充信息或“降级”，永远不能把非零退出码改判为通过。**

```ts
interface TestCounts { total: number; passed: number; failed: number; skipped: number; todo: number;
                       errors: number; durationsMs?: number; failedIds: string[]; source: ReporterKind }
type ReporterKind = "junit" | "vitest-json" | "jest-json" | "pytest-junit" | "go-test-json"
                  | "nextest-json" | "libtest-text" | "tap" | "regex-summary" | "none";
```

**reporter 注入：** 只有在 VerifyProfile 识别出 runner 时才注入（`09` §9.7 会学习这一点），并且不改变命令语义，只追加输出文件参数。

| runner | 注入 | 解析 |
|---|---|---|
| vitest | `--reporter=default --reporter=junit --outputFile.junit=$OUT/junit.xml` | JUnit XML |
| jest | `--json --outputFile=$OUT/jest.json`（保留默认 reporter） | `numTotalTests/numPassedTests/numFailedTests/numPendingTests/numTodoTests` |
| node --test | `--test-reporter=tap --test-reporter-destination=$OUT/tap.txt --test-reporter=spec --test-reporter-destination=stdout` | TAP |
| pytest | `--junitxml=$OUT/junit.xml -p no:cacheprovider` | JUnit XML（`skipped` 中含 xfail 时以 `type` 区分） |
| go | 运行 `go test -json ./...` 的变体；原命令不是 go test 时不注入 | 按 `Action` 事件计数 `pass/fail/skip` |
| cargo nextest | `--message-format libtest-json-plus`（需 `NEXTEST_EXPERIMENTAL_LIBTEST_JSON=1`）或 profile 中配置的 junit | JSON / JUnit |
| cargo test | 不注入（stable 无 json） | 正则 `test result: (ok|FAILED)\. (\d+) passed; (\d+) failed; (\d+) ignored`，对每个 test binary 求和 |
| 未知 | 不注入 | 正则兜底：`(\d+) (passed|failed|skipped)` 等常见摘要；`source="regex-summary"`，置信度低，UI 标“计数为估计”，结论为“有保留”（§7.10.3 `anyQualified` ⑪，ADR-184） |

注入的命令在 `exec` 前展开为 `wrappedCommand`。命令如果是脚本间接调用（`pnpm test`），只在能解析到实际 runner 时才把参数透传（`pnpm test -- --reporter…`）。透传失败（runner 报未知参数，退出码 ≠ 0 且输出含 `Unknown option`）时，自动用原命令无注入重跑一次，计数改按上表“未知”一行的正则兜底（`source="regex-summary"`，UI 标“计数为估计”）；**已识别的 runner**（上表除“未知”外的各行）在兜底后仍得不到计数时判为 `unparseable`，不按无计数的通过处理——关闭注入因此不会绕过零分母保护（H10，ADR-183）。

**判定：**

```ts
function verdictOf(c: ExecCriterion, run: RunResult, counts?: TestCounts): Verdict {
  if (run.outcome === "timeout") return "timeout";
  if (run.outcome === "hung") return "hung";
  if (run.outcome === "resource_exceeded") return "resource_exceeded";
  if (run.exitCode !== (c.expect.exitCode ?? 0)) return "fail";
  if (c.expect.stdoutMatches && !new RegExp(c.expect.stdoutMatches, "m").test(run.output)) return "fail";
  if (counts) {
    if (counts.total === 0 || counts.passed === 0) return "vacuous";      // H10：零分母
    if (c.expect.minTests != null && counts.total - counts.skipped < c.expect.minTests) return "fail";
    if (c.expect.maxFailures != null && counts.failed > c.expect.maxFailures) return "fail";
  } else if (c.expect.minTests != null || run.runnerKnown) return "unparseable";   // 合同要求计数、或已识别的 runner 解析不出计数（含关闭注入后的兜底，ADR-183）
  if (run.mutatedTracked) return "pass_mutated";                          // 通过，但测试运行改动了被跟踪文件
  return "pass";
}
// "vacuous" / "unparseable" / "pass_mutated" 都不算 pass；后两者生成 severity 2 的 NeedsYou，让人决定
```

**`repeat`（唯一定义，ADR-183）：** `repeat = N > 1` 的 exec 标准在同一槽位、同一 pin 上连续运行 N 次，每次按 `verdictOf` 判定；N 次全部为 `pass` 才是 `pass`，第一次非 `pass` 即停止，以该次的 verdict 为结论。N 次之内**不适用**§7.4.6 的失败重跑与既有 flaky 宽限（`fail` 不会转为 `pass_with_preexisting_flakes`），也不适用下方 ADR-054 的“重跑通过 → `pass`”一支（环境判别照常：base 上同样超时或超限 → `verify_env_error`）。N 次中首个 `timeout`/`hung`/`resource_exceeded` 即停止，ADR-054 的判别只针对这一次运行：判别所需的再次运行不计入 N，重跑通过也不改变结论（ADR-184）。`criterion_check.repeat = {required: N, passed: k}` 记录次数。`repeat` 属于标准定义，进入 `criterionSpecHash`（§7.4.8）与过期规则 ①（§7.3.3）。

**超时与资源超限的判别（ADR-054，R2-D7-04）：** `timeout`、`hung`、`resource_exceeded` 首次出现时不直接定性：

```
1. 在同一 pin、相同资源限制下重跑该标准一次
2. 查阅该标准在 base 上的历史（同一 depsKey 或最近 20 次）：耗时 p95 与峰值 RSS
   重跑通过                                           → verdict = "pass"，并返回 Fact flake{kind:"timing", testId:<criterionId>}（§7.4.1 在判定之后写入，ADR-239）
   base 上同样超时/超限，或 base 历史耗时 > 限制的 80%  → 不产生 criterion_check，改记 verify_env_error{stage:"resources"}
                                                         （环境问题：不返工、不计次数，ADR-037）
   base 正常而 pin 两次超时/超限                       → verdict 保持 timeout / hung / resource_exceeded，计为失败，
                                                         触发返工并计次（视为 Agent 引入的死锁或泄漏）
   base 上没有历史                                    → 在 base 上跑一次该标准作为对照，再按上两行判定
```

`04` §4.18.3 与 `06` F20 引用此规则；`resource_exceeded` 是 verdict 枚举值（`16` §16.1）。

### 7.4.6 不稳定测试（flaky）

原则：**不稳定本身是一个 Fact；只有“在 base 上本来就不稳定”的测试才可能被宽容；改动引入的不确定性按失败处理**（R1-D7-05）。G-0142 这类并发修复里，改动引入的竞态恰好表现为“同一提交上先失败后通过”，绝不能因此显示为已验证。

```
on verdict == "fail" and counts.failedIds non-empty and runner 支持只重跑指定用例:
  # 1) 在 pin 上重跑失败用例，至多 2 次
  U = { id ∈ failedIds : 在某次重跑中通过 }                 # 在 pin 上不稳定
  F = failedIds − U                                          # 稳定失败 → 按失败处理
  if |U| > 10: verdict = "fail"（reason:"mass_instability"）；跳过下面的 base 确认
  # 2) 在 base 上确认：对 U 中每个用例
  for id in U:
    if id 已被 quarantine_test（人的决定）: origin = "quarantined"; continue
    if flakeLedger 中已有 (id, baseTree) 的 preexisting 记录: origin = "preexisting"; continue   # 缓存
    if id 在 baseTree 中不存在（新测试）: origin = "introduced"; continue
    在同一槽位检出 baseCommit（依赖按 base 的 depsKey 物化），重复运行 id 至多 5 次，遇到第一次失败即停
    # ADR-238：只有运行器报告 id 失败的一次才算“base 上失败”；检出或物化失败、以文件系统错误结束（ENOENT、EIO、ENOSPC 等）、
    #          运行器没有给出 id 的结果、或该次之后槽位所在的 <wtRoot> 判为不可访问（06 §6.1.6）的一次是“无结论”：停止，不计为失败
    origin = (有结论的 base 失败 ≥ 1) ? "preexisting" : "introduced"   # 无结论 → introduced（保守方向），不写入 flakeLedger
    inconclusive(id) = 该次确认因无结论而停止、没有有结论的 base 失败          # ADR-239
  flakes = [ {kind:"flake", producer:"verifier", data:{testId:id, pin, baseTree, origin,
              observations:{pinFail, pinPass, baseRuns, baseFail, baseInconclusive}}} for id in U ]
              # 随 runCriterion 的结果返回，由 §7.4.1 在失败先判可达之后写入（ADR-239）
  verdict =
    F 非空 或 ∃ origin == "introduced" 且非 inconclusive  → "fail"（reason: "introduced_nondeterminism" 若来自后者）
    否则若 ∃ inconclusive 的 id                          → 不产生 criterion_check，envError = verify_env_error{stage:"baseline"}，
                                                           flakes 中去掉这些 id（ADR-239：环境故障，不返工、不计次数）
    否则（全部 preexisting / quarantined）               → "pass_with_preexisting_flakes"
```

- **方向故意保守：** base 上重复 5 次都通过时，即使该测试实际有 20% 的失败率，也有 (0.8)^5 ≈ 33% 的概率被误判为“改动引入”。误判的后果是“验证失败、需要人看一眼”，而不是“有竞态的代码被标为已验证”；风险不对称，按 ADR-019 选择保守方向。
- **base 运行的环境错误不算 base 上失败**（ADR-238）：base 运行以文件系统或基础设施错误结束（例如槽位所在的卷在这几次运行中短暂停顿）时，那次运行没有回答“该测试在 base 上是否失败”，按无结论计，**不写入** `flakeLedger`，所以误判不会经台账缓存带到同一 base 上之后的验证与“隔离该测试”的提议中（ADR-238）。**无结论是环境故障，不归 Agent**（ADR-239，与 §7.3 安装器失败、§7.4.5 “base 上同样超时”同一原则）：该标准只因无结论的用例而不能通过时（没有稳定失败的 F，也没有有结论判为 `introduced` 的用例），不产生 `criterion_check`，改记 `verify_env_error{stage:"baseline", detail}`——不返工、不计返工次数、不推向 `verify_failed_limit`，生成 `verify_env` 的 Needs-You（§7.10.3，写明 `base 上的确认未能完成：<原因>`），也不写这些用例的 `flake` Fact（重试时重新确认）；所以 base 的依赖已无法安装这类确定性的故障每次都停在需要你处理的环境故障上，而不是推着 Agent 返工到上限，也从不得出绿色。该标准另有真实的失败时照常 `fail` 并返工，无结论的用例在 `flake` Fact 中记 `introduced` 与 `baseInconclusive`，返工消息把它们与真实失败分开列出（`base 上的确认未能完成（环境错误），不是这次返工的原因`）。槽位所在的 `<wtRoot>` 不可访问时先按 §7.4.1 判为中断，不是本条。下方“基线已坏”同样只取有结论的 base 运行。
- **`pass_with_preexisting_flakes` 永远不是无保留的绿色**：它计入 V，但使用 `12` 的“有保留的已验证”变体，验收面板列出这些测试与 base 上的失败证据；`review_ready` 的证据中也列出。
- **`introduced_nondeterminism` 的返工消息**明确写出：“测试 X 在你的改动上时过时不过，在 base 上稳定通过（5/5），这通常是竞态或顺序依赖”。
- **项目级 flake 台账**（`flakeLedger`）：同一个 testId 在近 30 天里于 ≥ 2 个不同 base 上被确认为 `preexisting` → 生成 `ratify` 提议“隔离该测试”（severity 1，攒批）。人批准后形成 `HumanDecision{kind:"quarantine_test", target:{factId}}`（`02` §2.7），此后该测试的失败不计入 `maxFailures`，但每次仍然运行并记录。隔离 30 天后自动进入复审。
- **基线已坏：** F 中的用例在 `baseCommit` 上同样失败（复用上面的 base 运行，或单独运行一次）→ 标注 `preexistingFailures`，按 project+baseTree 合并为一条 Needs-You（`08` §8.4 根因去重），不计入本 Goal 的返工次数。

### 7.4.7 `criterion_check` 数据格式

```ts
interface CriterionCheckData {
  criterionId: string; contractVersion: number; kind: "exec" | "artifact";
  verdict: "pass" | "pass_with_preexisting_flakes" | "fail" | "vacuous" | "unparseable" | "pass_mutated"
         | "timeout" | "hung" | "resource_exceeded" | "error" | "skipped_fail_fast"
         | "not_run";        // 仅 M2（带机密标准的机密阶段未进入，§7.4.11）；M1 中不出现
         // 环境故障（含 ADR-054 判定为环境的超时/超限）不产生 criterion_check，而是 verify_env_error
  reason?: "introduced_nondeterminism" | "mass_instability" | "links_unchecked" | string;
  trigger: VerifyTrigger;                           // opportunistic 的结果同样是 Fact，但从不单独触发状态转移
  command?: string; wrappedCommand?: string;        // exec
  checks?: { check: string; ok: boolean | "skipped"; detail?: string }[];   // artifact（§7.4.9）
  exitCode?: number; wallTimeSec: number;
  counts?: TestCounts; countsBase?: TestCounts;     // countsBase 来自 test_inventory 的基线（H10 的分母对比）
  repeat?: { required: number; passed: number };   // 仅 repeat > 1（§7.4.5，ADR-183）
  flaky?: { testId: string; origin: "preexisting" | "introduced" | "quarantined" }[];
  preexistingFailures?: string[];
  env: { envHash: string; depsKey: string; network: string[]; sandbox: "S2" | "S0";
         secretsInjected: string[];                 // 只记名称；M1 恒为空（ADR-164）
         secretsVia?: "env" | "file";             // 仅 M2（§7.4.11）
         toolchain: Record<string, string>;
         localFiles: { path: string; contentHash: string | "not_copied" }[] };   // ADR-173：只含本应复制的条目（isSecret 与未批准的不进入），
                                                    // 取自 verify() 查缓存之前的那一次读取（§7.4.1）；§7.4.1 的“未复制”提示以其中 not_copied 的条目为来源
  cache: { hit: boolean; carriedFrom?: { tree: Sha; reason: "irrelevant_paths" } };
  slot?: string; startedAt: Iso; endedAt: Iso;
  tail?: string;                                    // 失败时末尾 80 行（脱敏）；secretsInjected 非空时（仅 M2）**不存在**此字段（§7.4.11）
  failedNames?: string[];                           // 结构化失败用例名（脱敏、每条 ≤ 120 字符）
}
```

### 7.4.8 成本：何时跳过、何时加速

| 机制 | 规则 | 诚实性保障 |
|---|---|---|
| **同指纹缓存** | 键 `(criterionSpecHash, treeSha, envHash, depsKey, profileVersion)` 命中 → 复用上次的 `criterion_check`（新写一条 Fact，`cache.hit=true`，指向原日志，`data.trigger` 与 `atCommit` 取本次验证的触发与 pin——否则 `progress()` 的 ADR-053 守卫可能按原触发把它排除出 V，与 `outcomeOf` 的结论不一致，`verify()` 中的 `recordHits`，ADR-184；`criterionSpecHash` 覆盖该标准的全部定义字段，含 `command`、`expect`、`repeat`、`timeoutSec`）。**只复用标准结果**：正式验证的 L-c 静态哨兵与测试清单照常运行（§7.4.1，ADR-183）。用 tree 而不是提交作键，所以 rebase 后内容不变、空提交、只改提交信息都会命中 | 键覆盖全部输入（本应复制的本地文件经 `envHash` 进入，与写进槽位的内容取自同一次读取，§7.4.1、§7.4.3，ADR-172/173）；含 flake 的结果不进缓存（下次照常运行）；**命中的前提（唯一定义，ADR-187）**：原验证该标准的完整日志（§7.4.4 `verify/<verifyId>/<criterionId>.log`）仍在——上一次本身是缓存命中时，“原验证”沿引用链取实际运行该标准的那次验证（命中没有自己的日志文件，ADR-188）；已被清理（`10` §10.3.2）时不算命中，照常运行（ADR-185）。原重放包是否仍在不影响命中 |
| **无关路径携带** | 新 tree 与已验证 tree 的差异**全部**匹配 VerifyProfile 中 🧑 批准的 `irrelevantGlobs`（默认空；常见是 `docs/**`、根目录 `*.md`）时，携带上次结果，`cache.carriedFrom` 记录来源 | 默认为空，必须由人显式加入；携带的结果显示“携带自 @abc123”；TestPathSet、配置、带机密标准的相关文件永远不能列入 |
| ~~观察器结果替代~~ | **v1 删除**（R1-D7-06）。`cleanEnv:false` 不再让 Agent 环境的结果成为 `criterion_check`；它们只进入观测轨 O（§7.2.4） | Agent 可控环境中的结果永不变绿 |
| **成本升序** | 按历史 p50 耗时升序执行（lint < typecheck < unit < e2e） | 全部标准都要跑完才能进 `in_review` |
| **昂贵标准 fail-fast** | 标记为 `expensive`（p50 > 5 min）的标准，若之前已有标准失败则跳过，verdict 记 `skipped_fail_fast` | 跳过不等于通过；返工 Run 拿到的反馈里写明“未运行” |
| **依赖预热** | §7.4.3 | — |
| **合并队列复验** | `merge_queue` 触发时**不**使用“无关路径携带”，只允许同指纹缓存；验收延续判据见 §7.10.3 | 集成验证更严格（`10`） |

验证成本记入 `Goal.counters.wallClockMs`，并单独累计 `verifyCpuSec`，在 Goal 页的预算区显示。

### 7.4.9 artifact 标准的内置检查（ADR-031）

调研类与文档类 Goal 的 `artifact` 标准由验证器以**内置检查**执行：Tower 自己的代码读取文件，不运行 Agent 写的代码，因此不需要槽位、沙箱或 S0 授权，可以在每次指纹变化后立即执行。

```ts
// 02 §2.5（类型化对象，checks 必填，至少一项）：
type ArtifactCheck =
  | { type: "exists" }                              // artifactGlob 至少匹配一个文件
  | { type: "headings"; required: string[] }        // 全部必需标题都出现（Markdown 标题文本，大小写不敏感、去首尾空白）
  | { type: "min_words"; n: number }                // 匹配文件的正文词数之和 ≥ n（中文按字计，代码块不计）
  | { type: "links_reachable" }                     // （M2，ADR-183）外部链接可达；每次正式验证执行，需要网络声明（见下）
  | { type: "links_internal" };                     // 相对链接与锚点都能解析到 pin 中的文件/标题；离线、廉价
                                                    //   ↑ 第 5 种类型，已登记于 02 §2.5 与 16 §16.1.3

function artifactCheck(c: ArtifactCriterion, pin: Sha, trigger: VerifyTrigger): Fact {
  const files = gitLsTree(pin).filter(minimatch(c.artifactGlob));     // 从 pin 的 tree 读取，不读工作目录
  const results = c.checks.map(ch =>
    ch.type !== "links_reachable" ? runCheck(ch, files, pin)
    : trigger === "opportunistic"  ? { check: ch, ok: "deferred" }                      // 只有机会式验证不做外部请求（调用点传入 trigger，§7.4.1）
    : !c.network?.length           ? { check: ch, ok: "skipped", detail: "no_network_permission" }
    :                                checkLinks(files, { allowHosts: c.network, timeoutSec: 5, max: 50 }));   // 逐链接结论与汇总见下方判据表（ADR-183）
  const verdict = results.some(r => r.ok === false) ? "fail" : "pass";   // deferred / skipped 由 reason 表达：isVerifiedPass 对 links_deferred 为假，
                                                                         //   links_unchecked 计入 V 但属 anyQualified（§7.10.3）——未检查的链接永远不是无保留的通过
  const artHash = sha256(files.map(f => f.path + ":" + f.blobSha).sort().join("\n"));
  return { kind: "criterion_check", producer: "verifier", atCommit: pin,
           workspaceFingerprint: `art1:${artHash}`,          // 新鲜度按 artifact 文件内容（ADR-031），无关代码改动不使它过期
           data: { criterionId: c.id, kind: "artifact", verdict, checks: results, trigger,
                   reason: results.some(r => r.ok === "deferred") ? "links_deferred"
                         : results.some(r => r.ok === "skipped")  ? "links_unchecked" : undefined } };
}
```

- **外部链接检查的网络权限（R2-D7-05）：** 只有在合同中为该 artifact 标准声明了 `network`（允许的主机列表，或人明确批准的 `["*"]`）时才执行。请求由 Supervisor 的链接检查器发出（只发 HEAD，失败后 GET 前 1 KB；不带 cookie 与凭据；不运行 Agent 代码），不经过验证槽位。`links_deferred` 只计入 O（§7.2.4）；`links_unchecked`（无权限或离线）计入 V，但显示为“有保留”。
- **`links_reachable` 属 M2**（ADR-183：调研与文档类 Goal 不在 M1，ADR-059）：M1 的合同编辑器在批准时拒绝该检查类型（提示“M2 提供”），链接检查器不在 M1 实现；下列规则是 M2 的唯一定义。
- **逐链接判据与汇总（唯一定义，ADR-183）：**

  | 逐链接结果 | 判据 | 对该检查的影响 |
  |---|---|---|
  | 可达 | 最终响应为 2xx（含按下条地址规则逐跳检查、至多 3 跳之后的终点） | — |
  | 不可达 | 最终响应为 4xx 或 5xx；单条请求超过 5 s；连接被拒绝或主机名无解析结果 | 任一 → 该检查 `ok:false`，标准为 `fail` |
  | 被拒绝（不发请求或不继续） | `address_refused`、`redirect_outside_network`、`too_many_redirects`（见下条）；`host_not_in_network`（首跳 URL 的主机不在 `network` 允许范围内）；`over_limit`（第 51 条起的链接，`max: 50`） | 不算可达也不算失败 |
  | 离线 | 链接检查器整体没有网络（系统报告离线，任何请求都未发出） | 整项 `ok:"skipped"`，`detail:"offline"` |

  汇总：有不可达 → `ok:false`；否则有被拒绝的链接或离线 → `ok:"skipped"`（`detail` 取最先出现的一种），按 `links_unchecked` 计入 V、显示“有保留”；否则 `ok:true`。
- **链接检查器的目标地址规则（唯一定义，ADR-181；威胁表 `11` T34）：** 对 `network` 中的具体主机与 `["*"]` 一律适用。先解析、后检查：主机名解析出的地址中任一属于回环、链路本地、私网、唯一本地（IPv6）、未指定地址或云元数据地址，或 URL 直接写的是这类地址，即不发请求；连接只使用检查过的那个地址，不再次解析。不自动跟随重定向：每一跳的目标按同一规则检查通过且主机在 `network` 允许范围内才请求，跳数上限 3。目标地址命中上述地址规则（`detail:"address_refused"`）、重定向目标的主机不在 `network` 允许范围内（`redirect_outside_network`）、第 4 跳仍是重定向（`too_many_redirects`）都是“被拒绝”，与 `host_not_in_network`、`over_limit` 结论相同，汇总按上表（ADR-182/183）。规则不能由合同或 `VerifyProfile` 关闭。
- `checks` 必填；未知类型在合同批准时就被拒绝（合同编辑器提示可用类型），不会到运行时才失败。
- 只有 `human` 标准、没有任何 exec/artifact 标准的 Goal 永远不显示“已验证”，进入 `in_review` 时显示中性的“未经机器验证”（ADR-031，§7.10.3）。

### 7.4.10 验证容量、排队模型与延迟预算（R1-D7-11、ADR-042）

**槽位数**由 CPU 与内存共同决定，与 `13` §13.8.3 的整机模型使用同一套预留（R2-D7-01）：

```
reserve(project) = max(1 GB, 1.3 × p95(该项目验证进程树峰值 RSS，最近 20 次))；首次未知时 2 GB
c = min( max(1, floor(cores / 4)),
         memory-admissible slots：  Σ Goal 进程树预算 + Tower 本体 + c × reserve ≤ RAM × 0.75 )
参考硬件（**M1 Pro 10 核（8P + 2E）/ 16 GB**，与 `13`、`16` 统一；8 核机型同样得 c = 2；参考项目峰值 ≤ 2 GB → reserve 2 GB）：
  3 × 1.2 GB + 0.65 GB + 2 × 2 GB = 8.25 GB ≤ 12 GB  →  c = min(2, 2) = 2
重项目（峰值 3.5 GB → reserve 4.6 GB）：3.6 + 0.65 + 2 × 4.6 = 13.45 GB > 12 GB  →  c = 1
（已知差异：本式的 Goal 一项未计 Host `h`（`13` §13.8.3 的每 Goal 预留为 `h` + `p90_g`）；参考配置下多 3 × 0.12 GB，两例的结论不变，E6 回填时一并对齐，ADR-187）
```

**参考项目**（`13` 用同一项目测量）：TypeScript 单仓库，约 3 万文件；标准为 lint（p50 40 s）、typecheck（60 s）、单元测试（**5 min**，约 3 核）；测试清单 20 s（与标准并行；标准全部命中缓存的正式验证只运行它与依赖物化，不启动服务，ADR-183/184）；依赖物化 5 s（命中）/ 安装器 90 s（未命中，约 1/5 的验证）；flake 的 base 确认约 1/10 的验证需要，平均 +2 min。

```
单次完整验证的服务时间 S：p50 ≈ 7 min，p95 ≈ 10 min
每个运行中的 Goal 平均每 40 min 提交一次，含返工后平均 1.5 次验证/提交
到达率 λ = 并发 Goal 数 × 1.5 / 40 min
```

M/M/c 近似（Erlang C）算出的正式验证排队等待 `Wq`（机会式验证可被抢占，不计入）：

| 场景 | c | λ（/min） | 负载 ρ | P(需等待) | Wq 均值 | Wq p95 | claimed → in_review p50 / p95 |
|---|---|---|---|---|---|---|---|
| **参考**：16 GB、10 核、3 个 Goal | 2 | 0.11 | 0.39 | 0.22 | 1.3 min | 8.6 min | ≈ 7 min / ≈ 19 min |
| 参考硬件、5 个 Goal（超过默认并发） | 2 | 0.19 | 0.66 | 0.52 | 5.4 min | 24 min | ≈ 10 min / ≈ 34 min |
| 重项目（c 被内存限为 1）或 4 核机器、3 个 Goal | 1 | 0.11 | 0.79 | 0.79 | 27 min | 94 min | ≈ 25 min / ≈ 105 min |

（模型估算，证据等级为“假设”，由 `13` 的验证延迟测量、E3、E4、E12 回填，见 §7.14。）

**M1 延迟预算（ADR-042）：** claimed → in_review **p50 ≤ 10 min、p95 ≤ 20 min，只对参考项目承诺**（5 分钟测试套件、验证峰值 ≤ 2 GB、参考硬件、3 个并发 Goal）。其他项目不承诺：Goal 卡片和项目设置页显示由实测服务时间与当前 c 算出的**预测**排队时间（例如“此项目 c = 1，预计验证排队 p95 ≈ 95 min”）。

**机会式验证的预期频率（参考配置）：** 机会式验证只在“正式验证队列为空且有空闲、已预留内存的槽位”时运行（ADR-042）。

```
正式验证占用 = λS = 0.79 个槽位；队列为空且至少一个槽位空闲的概率 = P0 + P1 = 0.43 + 0.34 = 0.78
可供机会式验证的槽位时间 ≈ (2 − 0.79) × 60 ≈ 73 槽位·分钟 / 小时
一次机会式验证（只跑 exec 标准）≈ 6.5 min；3 个 Goal 的需求上限（每 10 min 一次）≈ 117 槽位·分钟 / 小时 > 73 → 供给受限
  → 合计约 11 次/小时，每 Goal 约 3.7 次/小时
被正式验证抢占的概率 ≈ λ × P(另一槽位忙) × 6.5 min ≈ 0.11 × 0.4 × 6.5 ≈ 0.29
  → 每 Goal 成功约 2.6 次/小时；再加上“指纹稳定 ≥ 120 s”的等待
  → 槽位允许每 Goal 约每 15–25 min 一次；每小时 50 核分钟的上限把它压到**约每 20–25 min 一次**（`13` §13.8.3；E4、E12 测量）
CPU：每次约 0.7 + 1 + 5 × 3 ≈ 17 核分钟 → 每 Goal 约 44 核分钟/小时
```

> **CPU 配额（已与注册表同步）：** 旧上限“每运行中 Goal 每小时 ≤ 10 核分钟”会让参考项目的机会式验证降到约每 100 min 一次，与 ADR-042 的 15–25 min 目标矛盾。`16` §16.2.3 与 `13` §13.11.2 现为 **每 Goal 每小时 ≤ 6 次、≤ 50 核分钟**（第 2 轮回应与 `reviews/round-2-lint.md`）。

**降级策略**（按顺序启用；Supervisor 用最近 1 h 的实际到达率与服务时间预测 Wq）：

| 预测 Wq p95 | 动作 |
|---|---|
| > 10 min | 暂停机会式验证与依赖预热 |
| > 20 min | 卡片显示“验证排队约 N min”；Needs-You 摘要建议降低并发 Goal 数（`UserSettings.maxConcurrentGoals`）；内存允许时提示可把 CPU 上限调到 `floor(cores/3)` |
| 任何情况 | **从不跳过标准、从不缩短超时、从不把“未运行”当通过**；正式验证的静态哨兵与测试清单也不降级（第 55 轮删除“Wq > 15 min 时测试清单只在 diff 触及 TestPathSet 时运行”一档，§7.4.1，ADR-183） |

优先级（高 → 低）：`merge_queue` > `claimed` / `agent_bg` > `fp_changed_human` / `fp_changed_agent` > `manual` > 安装器预热 > `opportunistic`。

### 7.4.11 （M2）带机密的验证标准

> **M2，不在 M1 范围**（ADR-164）。M1 规则见 §7.4.3：验证标准不携带机密，需要机密的检查写为 human 标准。本节保留 ADR-159–163 的设计，作为 M2 的起点；M2 定稿时按 `11` §11.7.0 当时的唯一定义重新审视（含 R38 的条目分类与授权输入）。M1 实现**不包含**本节的任何机制：机密阶段、调度互斥与 `secretMutex.enabled`、冻结状态（`startAgentActivity()` 在 M1 中只是唯一启动点的架构约定，没有冻结）、`secret_wait` 与 `verify.secret_wait.*`、`accept_secret_exposure`、`not_run`、`secretPhaseOnly`、`secretsVia`、投递文件的逐路径放行。

#### 7.4.11.1 投递与规则（M2）

**带机密的标准（R1-D7-03、ADR-159；全部机密的存放、投递与可读者唯一定义在 `11` §11.7）：** 合同标准可以声明 `env: ["STRIPE_TEST_KEY"]`，验证器从系统钥匙串取值（`secrets.enc` 只是钥匙串不可用时的加密回退，`11` §11.7.1），只提供给**该标准**的子进程。M1 中机密只流向验证器标准，Agent 的工具调用从不获得密钥库中的机密（`secrets.access` 属 M2，ADR-161）；需要机密的端到端检查以带机密的验证标准表达。

- **投递方式**：**默认 `env`**——以环境变量 `<NAME>` 注入，兼容按变量读取机密的现有测试。可选 `secretsVia: "file"`——Tower 即时在 `~/.tower/run/<deliveryId>/`（目录 `0700`、文件 `0600`）创建投递文件，以 `<NAME>_FILE` 传路径，标准结束（含超时、取消）即删除。验证器沙箱拒绝 `~/.tower/**`，**只逐路径放行本次标准自己的投递文件**；Agent 沙箱一律拒绝。
- **调度互斥**（ADR-160/161/162）：带机密的标准只在**没有 Agent 活动**时运行——“Agent 活动”按原则定义：Tower 启动的、运行 Agent 编写或可影响内容的任何进程（唯一定义在 `11` §11.7.0，本文不再列举）。因此带机密的标准独占整个验证器，在同一次验证中排在所有不带机密的标准之后，等待期间不占用槽位；运行期间整机冻结，由单一闸口 `startAgentActivity()` 执行（ADR-163，不分项目），已 `paused` 的 Goal 不受影响。执行顺序、失败时不运行、准备先于注入、依赖缓存只读、结束时终止槽位全部进程，唯一定义在 §7.4.11.2。持有者自身：带机密的标准不参加机会式验证（§7.2.4），只在 `claimed`/`verifying` 时运行。Run 内部不做任何拦截；脱离且无法识别的进程属 ADR-158 已登记的窗口。
- **等待过久**：等待超过 10 分钟 → Needs-You（kind `verify_env`，去重键 `ve:{goalId}:secret_wait`；**不是** `verify_env_error`，Goal 保持 `verifying`，不进入 `paused`）。选项：继续等待（`verify.secret_wait.keep`）；现在运行、接受风险（`verify.secret_wait.run_now`，记 `HumanDecision{accept_secret_exposure}`，界面写明“其他正在运行的 Agent 可能读到该机密”）；以文件方式运行（`verify.secret_wait.as_file`，本次以 `secretsVia:"file"` 运行，无需互斥）。去重与标注见 `08` §8.4、§8.8。项目设置 `secretMutex.enabled`（默认开启）关闭时不等待，界面标注风险。
- **`file` 方式下的跳过**：若该标准运行中测试的“跳过”计数增加（测试可能仍在读 `<NAME>` 而读不到），按既有的跳过检测处理（§7.5.4 R-T5：运行时 `TestCounts.skipped` 相对 base 增加即命中），并在标准行提示“该标准以文件注入机密，请确认测试读取 `<NAME>_FILE`”。默认 `env` 时不存在这一情形。
- `secretsVia` 与机密名称进入 `envHash`，值不进入。

无论哪种方式，被注入机密的进程运行的都是 Agent 写的代码，所以 Agent 写的测试可以把机密变换（base64、逐字符输出）后打印出来，绕过精确匹配脱敏。规则：

1. **耦合保护：** 声明了 `env` 机密的标准，其命令解析到的测试文件、测试支持文件和间接定义（§7.5.1 TestPathSet 中与该命令相关的部分）在合同生效时**强制加入 `scope.protected`**，`allowTestEdits` 对它们视为 `forbid`，合同编辑器中不可放开（只能去掉机密声明）。Agent 无法修改这些测试来泄露机密。
2. **输出不回送原文：** 带机密的标准，其日志**只存本地**（脱敏后），返工消息与任何进入模型上下文的内容只包含：verdict、计数、失败用例名（来自 JUnit/JSON reporter 的结构化字段，名称经脱敏且截断到 120 字符）、失败签名哈希。**绝不回送输出尾部**。人可以在 Tower 中查看本地日志。
3. **日志脱敏：** 精确匹配集合包含注入的机密值，与注入方式无关（文件注入时，测试读取文件内容后打印也会被匹配）。除 `11` §11.7 的精确匹配与模式外，对带机密标准的日志额外做变换检测：机密值的 base64/hex/URL 编码形式、反转形式也按精确匹配脱敏。
4. **残余风险（中）：** 被测的**非测试**代码（Agent 可改）仍能在运行时读取（读文件或读环境变量）并以其他编码泄露机密到日志；`env` 方式运行期间的同用户观察由调度互斥缓解——互斥开启时 `11` T33b（macOS S2）为低，残余是用户自己的其他进程与 ADR-158 的脱离且无法识别的进程（ADR-161）；关闭互斥或选择“现在运行（接受风险）”时为中；规则 2 保证它不进入模型上下文，但本地日志与人可见的界面仍可能含编码后的机密。建议只为测试专用、可轮换的机密使用此功能，并在合同编辑器中提示。

#### 7.4.11.2 机密阶段（M2；机密阶段的唯一定义在此）

**带机密标准的机密阶段（ADR-162；本段是唯一定义，`11` §11.7.0、`06` §6.2.4、`13` 引用）：** 带机密的标准（`env: [...]`，以环境变量投递）不与其他标准混跑，而是 `verify()` 的独立阶段：
1. 先在普通槽位中照常运行全部**不带机密**的标准（含以 `file` 投递的带机密标准，以及人选择“以文件方式运行”的本次标准），结束后释放槽位；
2. 若其中任一未通过 → 带机密的标准**不运行**，记 `criterion_check{verdict:"not_run", reason:"other_criteria_failed"}`（“因其他标准失败未运行”）；若全部通过但有未处置的阻断哨兵 → 同样不运行，记 `reason:"blocked_by_sentinel"`。两种情况都不等待、不冻结、不注入。`not_run` **不是失败**，也从不进入验证缓存（ADR-163；`decide()` 的去向见 §7.10.3）；
3. 否则进入机密阶段（“无活动”判定与冻结是**整机范围**、不分项目；槽位取自**该 Goal 所在项目的验证器池**——判定通过时任何地方都没有其他验证在运行，因此必有空闲槽位；机密阶段**严格串行**，ADR-163 及其补记）：**不持有槽位**地等待“没有 Agent 活动”（按原则定义，唯一定义在 `11` §11.7.0）且没有其他机密阶段在进行；**“判定没有 Agent 活动 → 获取槽位 → 设置冻结”在 Supervisor 的单写者线程中一次完成**。冻结由单一闸口 `startAgentActivity()` 执行（它在同一线程中检查冻结标志，冻结期间让请求排队；本文不列举它覆盖哪些启动路径）。然后**在注入任何机密之前**完成准备（检出、物化依赖、启动服务），再逐个注入并运行带机密的标准。结束时依次：终止槽位全部进程（进程树 ∪ 令牌）→ 该槽位的正常 teardown（服务、容器卷等，§7.4.4）→ 释放槽位 → 解除冻结；
4. 机密阶段的槽位只读使用依赖缓存，阶段中产生的任何构建产物**不回写**共享缓存；
5. `run_now`（`verify.secret_wait.run_now`）只跳过“等待非机密的 Agent 活动结束”，**从不**与另一个正在进行的机密阶段并行，其余步骤相同；`as_file`（`verify.secret_wait.as_file`）只能在等待中做出（第 1 步已结束），它把本次带机密的标准改为 `file` 投递，**另起一次普通槽位流程**运行，不冻结。
- 等待超过 10 分钟 → Needs-You `ve:{goalId}:secret_wait`（`08` §8.4；Goal 保持 `verifying`，不是 `verify_env_error`）。冻结时长上限 = `verify.slotPrepareTimeoutMin`（`16` §16.2，默认 10 分钟）+ 各带机密标准的超时之和（`13`）。
- **只运行机密阶段**：人对 `blocked_by_sentinel` 的阻断哨兵 `override_sentinel` 后，继续目标改写为 `verify{pin, secretPhaseOnly:true}`——以同一 pin 只运行机密阶段（第 3–4 步；不带机密的标准沿用该 pin 上已有的结果），通过后才进入评审（ADR-163）。
- **崩溃恢复**：重启时若发现冻结未解除（事件未闭合）→ 先终止该槽位进程并 teardown，再解除冻结，机密阶段重新排队（ADR-163）。机会式验证不进入机密阶段，也不运行任何带机密的标准。

#### 7.4.11.3 对 `outcomeOf` / `decide()` 的增补（M2）

- `not_run` **不是失败**：`outcomeOf` 不计入 `latestCriterionCheck(...).verdict === "not_run"` 的标准。`other_criteria_failed` 时其他标准已失败 → `fail`；`blocked_by_sentinel` 时其他标准全部通过 → `pass`，随后由阻断哨兵进入 `paused(sentinel_high)`。验证缓存从不缓存 `not_run`。
- 存在 `not_run{blocked_by_sentinel}` 时，`sentinel_high` 卡片的覆盖选项沿用统一文案“覆盖后评审”（覆盖之后先完成机密阶段，通过才进入评审）；`override_sentinel` 把继续目标改写为 `verify{pin, secretPhaseOnly:true}`。“暂停解除后的验证”表增加一行：

| 继续目标 | 守卫：当前树 = 目标 pin 的树？ | 动作 | `verifyFrom` |
|---|---|---|---|
| `verify{pin, secretPhaseOnly:true}`（`override_sentinel` 处置 `blocked_by_sentinel` 后，ADR-163） | 是 | 以该 pin **只运行机密阶段**（§7.4.11.2），不带机密的标准沿用已有结果；通过后才进入评审 | 不变 |

- 机会式验证跳过全部带机密的标准（机会式验证发生在持有者 `running` 时，不满足调度互斥）。

#### 7.4.11.4 伪代码

```ts
// verify() 的 M2 增补：在 todo 上拆分
//   const secretTodo = full ? todo.filter(c => c.env?.length && deliveryOf(goal, c) === "env") : [];
//   const plainTodo  = todo.filter(c => !secretTodo.includes(c) && !(c.env?.length && !full));
//   if (continuation.verify.secretPhaseOnly) { await runSecretPhase(goal, pin, secretTodo); return done(...); }   // 经 done()：先等哨兵（§7.4.1，ADR-184）
//   普通阶段只跑 plainTodo；释放槽位后：
//   plainFailed || blocked → secretTodo 记 not_run{other_criteria_failed | blocked_by_sentinel}；否则 runSecretPhase
async function runSecretPhase(goal: Goal, pin: Sha, crits: ExecCriterion[]) {
  // ①② “无活动”判定与冻结为整机范围、机密阶段严格串行（ADR-163）。不持有槽位地等待；条件满足时，在 Supervisor 单写者线程中一次完成：
  //     判定“没有 Agent 活动”（11 §11.7.0）且没有其他机密阶段 → 从本项目的验证器池取槽位（此时必有空闲，ADR-163 补记）→ 设置全局冻结。
  //     startAgentActivity() 在同一线程中检查冻结标志，因此不存在竞态。
  //     等待期间人的决定：keep → 继续等；run_now → 不再等待非机密的 Agent 活动，但仍等待正在进行的机密阶段结束；
  //     as_file → 改为 file 投递，另起一次普通槽位流程，不冻结。secretMutex.enabled = false 时不等待 Agent 活动（仍串行）。
  //     等待 > 10 min → Needs-You ve:{goalId}:secret_wait（Goal 保持 verifying）
  const g = await supervisor.singleWriter.secretPhaseGate(goal, pin, {
    waitForAgentActivity: secretMutexEnabled() && !runNowDecided(goal, pin) });   // → {slot} | {asFile: true}
  if (g.asFile) return runInPlainSlot(goal, pin, crits, { delivery: "file" });
  const slot = g.slot;                                         // 冻结已设置；上限 = verify.slotPrepareTimeoutMin + Σ 标准超时（16 §16.2）
  try {
    // ③ 在注入任何机密之前完成准备：依赖只读使用 depcache，任何构建产物不回写共享缓存（ADR-162）
    await slot.checkout(pin);
    const env = await slot.prepare(pin, { depcache: "readonly", writeBack: false });
    if (env.error) return envError(goal, pin, env.error);
    const svc = await slot.startServices(goal, env);
    if (svc.error) return envError(goal, pin, svc.error);
    // ④ 逐个注入并运行
    for (const c of crits) {
      const r = await runCriterion(slot, c, env, { secrets: deliver(c, "env") });   // §7.4.11.1
      recordFact({ kind: "criterion_check", data: r, atCommit: pin, workspaceFingerprint: `wt1:${treeOf(pin)}`,
                   producer: "verifier", evidence: [r.log] });
    }
  } finally {
    // ⑤ 收尾顺序（ADR-163）：终止全部进程（进程树 ∪ 令牌，§7.4.1）→ 正常 teardown（服务、容器卷，§7.4.4）→ 释放槽位 → 解除冻结
    //    崩溃恢复：重启发现冻结未闭合 → 终止该槽位进程并 teardown → 解除冻结 → 机密阶段重新排队
    await slot.killAll(); await slot.teardown(); await slot.release(); supervisor.singleWriter.unfreeze("secret_phase");
  }
}
```

---

## 7.5 测试完整性哨兵（Test-Integrity Sentinel）

ImpossibleBench 的发现是：Claude 系作弊的主要手段是改测试，而把测试设为只读就能有效遏制（*TB* A16、D#1）。另有实例：一次运行报告“4966/4966 通过”，而套件实际有 4992 个值（*TB* C7）。本哨兵有**三层**：

| 层 | 时机 | 能力 | 局限 |
|---|---|---|---|
| L-a 拦截 | `tool_call`（tower-goal 扩展内，同步） | 对 `edit`/`write` 的 `path` 精确判断；对 bash 命令做静态模式匹配；可以 `block` | bash 无法完全解析 |
| L-b 事后即时 | 每次 mutating 工具结束后的指纹重算 | 用 git 精确看到所有路径变化，包括 bash 造成的 | 改动已经发生 |
| L-c 验证时 | 验证器：base..pin 的完整 diff 分析 + 测试清单对比 | 权威结论，生成 Fact | 只在验证时运行 |

### 7.5.1 测试相关路径（按生态）

`TestPathSet = testFiles ∪ testSupport ∪ snapshots ∪ testConfig ∪ criterionIndirection`

| 生态 | testFiles | testSupport | snapshots | testConfig |
|---|---|---|---|---|
| JS/TS | `**/*.{test,spec}.{js,jsx,ts,tsx,mjs,cjs,mts,cts}`、`**/__tests__/**`、`{test,tests,e2e,cypress,playwright}/**` | `**/{setupTests,test-utils,testUtils}.*`、`**/{fixtures,__mocks__,mocks}/**` | `**/__snapshots__/**`、`**/*.snap` | `{vitest,jest,playwright,cypress,karma}.config.*`、`vitest.workspace.*`、package.json 中 `jest`/`vitest` 字段、`.mocharc*` |
| Python | `**/test_*.py`、`**/*_test.py`、`tests/**` | `**/conftest.py`、`**/fixtures/**` | `**/__snapshots__/**`、`*.ambr`（syrupy） | `pytest.ini`、`tox.ini`、`noxfile.py`、`setup.cfg [tool:pytest]`、`pyproject.toml [tool.pytest.*] / [tool.coverage.*]` |
| Go | `**/*_test.go` | `**/testdata/**` | `**/*.golden`、`**/testdata/**/*.golden` | — |
| Rust | `tests/**`、`benches/**`；**以及源文件中 `#[cfg(test)]` 模块内的 hunk**（§7.5.3 hunk 定位） | `tests/common/**` | `**/snapshots/*.snap`（insta）、`*.snap.new`、`*.pending-snap` | `nextest.toml`、`.config/nextest.toml`、Cargo.toml 中 `[[test]]`/`[profile.test]` |
| 通用 CI | `.github/workflows/**`、`.gitlab-ci.yml`、`.circleci/**`、`azure-pipelines.yml`、`Jenkinsfile`、`.buildkite/**`、`.pre-commit-config.yaml`、`.husky/**`、`lefthook.yml`、`codecov.yml` | | | |

**criterionIndirection（关键补充）：** 验收命令通常是间接调用，例如 `pnpm test` 实际执行 package.json 里的 `scripts.test`。Agent 只要把它改成 `"test": "echo ok"`，就能让标准“通过”。所以对每条 `exec` 标准都要解析间接链，并把定义处加入 TestPathSet：

```
resolveIndirection(cmd):
  npm/pnpm/yarn/bun run X | test     → package.json#scripts.X（含被引用的 scripts.pre*/post*）
  make X                             → Makefile 中目标 X 及其依赖目标所在行区间
  just X / task X                    → justfile / Taskfile.yml
  tox -e X / nox -s X                → tox.ini [testenv:X] / noxfile.py 中 session X
  ./scripts/x.sh                     → 该脚本文件
  turbo run X                        → turbo.json pipeline.X + 各包 scripts.X
```

对 package.json 这类结构化文件，只比较被引用的键（JSON 解析后对比 `scripts.test` 等），不把整个 package.json 当作测试文件，否则加依赖时会误报。

**lifecycleIndirection（R4-D7-01、R6-D7-01）：** 验证器会在槽位中针对 pin 执行项目自身的生命周期脚本（§7.4.3），所以它们和标准命令一样能影响结论。`.pnpmfile.cjs`、补丁文件（`patchedDependencies` 的值与 `patches/`）、`package.json` 中的 `overrides` / `resolutions` / `pnpm.overrides` / `pnpm.packageExtensions` 键，以及 `pnpm-workspace.yaml` 中的 `overrides` / `catalog` / `catalogs` / `packageExtensions` / `patchedDependencies` 键（ADR-098）同样纳入；根与各 workspace 的 `scripts.preinstall` / `install` / `postinstall` / `prepare` / `prepack` / `prepublish`，以及标准所用脚本的 `pre*` / `post*`（如 `pretest`、`posttest`），连同这些脚本经同样解析规则调用到的文件，**默认加入 `scope.protected`**（`edit.protected`，`11` §11.3.3），与 criterionIndirection 一同并入 TestPathSet。

### 7.5.2 检测规则

除特别说明外，以下规则都作用于**新增行**（`+`），并且只在 TestPathSet 内的文件上运行。

**R-T1 测试文件被修改/删除/重命名。** `files ∩ testFiles ≠ ∅`。删除比修改严重；重命名后不再匹配 testFiles（例如 `a.test.ts` 改成 `a.ts.bak`）按删除处理。

**R-T2 新增 skip/only/xfail。**

| 生态 | 新增行正则 |
|---|---|
| JS/TS | `\b(it|test|describe|suite|context)\.(skip|only|todo|fails|skipIf|runIf)\b`、`\b(xit|xdescribe|xtest|fit|fdescribe)\s*\(`、`\.concurrent\.(skip|only)`、`test\.fixme\(`、`--passWithNoTests`（加在 scripts 里） |
| Python | `@pytest\.mark\.(skip|skipif|xfail)`、`pytest\.(skip|xfail|importorskip)\(`、`@unittest\.(skip|skipIf|skipUnless|expectedFailure)`、`raise\s+(unittest\.)?SkipTest`、`collect_ignore(_glob)?\s*=`、`addopts.*(-k\s|--deselect|--ignore)` |
| Go | `\bt\.(Skip|SkipNow|Skipf)\(`、`if testing\.Short\(\)`、测试文件中新增 `//go:build` 或 `// +build`、`func Test\w+` 被改名为不再匹配 `^Test[A-Z_]`（删一个 `func TestX` 加一个 `func testX`/`func _TestX`） |
| Rust | `#\[ignore\b`、`#\[should_panic\b`（新增：期望从“成功”变为“panic”）、`#\[cfg\((any\(\)|not\(test\)|FALSE)\)\]`、删掉 `#[test]` 行但函数仍在 |

**R-T3 断言删除/弱化（AST-light）。** 先对每个测试文件的每个 hunk 做两件事：

1. **断言令牌净变化**：`Δ = count(+行中的断言令牌) − count(−行中的断言令牌)`。

   | 生态 | 断言令牌 |
   |---|---|
   | JS/TS | `expect\(`、`assert(\.\w+)?\(`、`\.should\b`、`toMatchSnapshot\(`、`toMatchInlineSnapshot\(`、`toThrow` |
   | Python | `^\s*assert\b`、`self\.assert\w+\(`、`pytest\.raises\(`、`pytest\.approx\(` |
   | Go | `\bt\.(Error|Errorf|Fatal|Fatalf|Fail|FailNow)\(`、`\b(assert|require)\.\w+\(` |
   | Rust | `\b(assert|assert_eq|assert_ne|debug_assert\w*|prop_assert\w*)!`、`\bpanic!`、`insta::assert_\w+!` |

   文件级 `Δ < 0` → 观察 `assertions_removed{n: -Δ}`。

2. **弱化改写对**：把 hunk 中的 `−` 行与 `+` 行按 Levenshtein 相似度 ≥ 0.6 配对，然后匹配下列模式（左为旧，右为新）：

   | 模式 | 示例 |
   |---|---|
   | 精确 → 宽松 | `toEqual/toBe/toStrictEqual(X)` → `toBeDefined()/toBeTruthy()/not.toBeNull()/toBeInstanceOf`；`assert a == b` → `assert a` / `assert a is not None`；`assert_eq!(a, b)` → `assert!(a.is_some())`；`require.Equal` → `require.NotNil` |
   | 常量断言 | 新增 `expect(true).toBe(true)`、`assert True`、`assert!(true)`、`assert 1 == 1` |
   | 容差放宽 | `toBeCloseTo(x, n)` 中 n 变小；`pytest.approx(..., rel=|abs=)` 数值变大；`InDelta(…, d)` 中 d 变大 |
   | 期望值改变 | 断言结构不变，只有字面量变化（`toBe(3)` → `toBe(4)`）→ `expected_value_changed`（中性：需求变化时是合理的，严重度较低） |
   | 吞异常 | 测试文件里新增 `except (Exception|BaseException)?:\s*(pass|\.\.\.)`、`catch\s*\(\w*\)\s*\{\s*\}`、`.catch(() => {})`、`let _ = ` 包裹原本 `unwrap()` 的断言目标 |
   | 提前返回 | 测试函数体第一条语句新增 `return;` / `return` / `t.SkipNow()` |
   | 取反翻转 | `.not.` 增加或删除；`assert not x` ↔ `assert x`；`assert_ne!` ↔ `assert_eq!` |
   | 断言计数要求删除 | 删除 `expect.assertions(n)` / `expect.hasAssertions()` |

   为了避免把整段重构误判为弱化：同一 hunk 中，如果新增的测试函数数量 ≥ 删除的数量，且 `Δ ≥ 0`，则降为 `observation` 级，不生成 Needs-You。

**R-T4 快照变更（detector `snapshot_changed`）。** 任何对 snapshots 的修改；或者 L-a 层观测到 `class == "snapshot_update"` 的命令（§7.2.2），不论命令是否成功。快照的**新增**（新测试的初次快照）只算观察，不算命中。

**R-T5 测试数量下降**（§7.5.4）。

**R-T6 测试/CI 配置修改（detector `test_config_changed`）**：testConfig 或 CI 路径有变化。额外关注这些键：`testPathIgnorePatterns`、`exclude`、`testMatch`、`coverageThreshold`、`fail_under`、`--cov-fail-under`、`retries`（重试次数调高会掩盖失败）、`bail`，以及 workflow 中 `continue-on-error: true`、删除 job/step。

**R-T7 间接定义修改**：criterionIndirection 指向的定义发生变化（§7.5.1）。

**R-T9 生命周期脚本修改**：lifecycleIndirection 中的任一键或其调用的文件相对 base 发生变化 → `sentinel{detector:"lifecycle_script_changed"}`，severity 3，阻断 Verified，直到人覆盖。即使人覆盖了它，§7.4.3 的依赖完整性复核仍然独立执行（两道防线）。

**R-T8 测试运行改动被跟踪文件**：验证时 `pass_mutated`（§7.4.5）。

### 7.5.3 hunk 定位：Rust `#[cfg(test)]` 与内联测试

对 Rust 源文件，按行扫描 base 与新版本，找出 `#[cfg(test)]` 后紧跟的 `mod … {` 的区间（用括号计数器跟踪 `{}`，跳过字符串和注释，即一个轻量词法器）。hunk 与该区间相交，就视为测试 hunk。Python 的 doctest（`>>>` 行）和 Go 的 `Example` 函数也按同样方式处理。

### 7.5.4 测试清单（test inventory）与数量对比

| runner | 列举命令（不运行测试） | 计数单位 |
|---|---|---|
| vitest | `vitest list --json`（`--filesOnly` 不用） | test case |
| jest | `jest --listTests --json` 只能列出文件 → 再用 AST-light 统计每个文件里 `\b(it|test)(\.each\([^)]*\))?\s*\(` 的次数（`.each` 记为 1 并标注 `parametrized`） | 估计值，`source:"static"` |
| pytest | `pytest --collect-only -q -p no:cacheprovider` | nodeid（参数化后的实例） |
| go | `go test -list '.*' ./...`（会编译，耗时较长，使用 GOCACHE） | Test/Benchmark/Example/Fuzz 名称 |
| cargo | `cargo nextest list --message-format json`；没有 nextest 时用 `cargo test -- --list --format terse` | test 名称 |

```ts
interface TestInventoryData { runner: string; source: "runner" | "static"; total: number;
  skippedDeclared: number;              // 静态统计的 skip/xfail/ignore 标记数
  ids?: string[]; idsHash: string;      // ids 超过 5000 时只存哈希和按文件聚合的计数
  perFile: Record<string, number>; atTree: Sha }
```

- **基线**：`baseCommit` 的清单按 `(projectId, baseTree, runner)` 缓存，一个 base 只算一次。
- **对比**：
  - `removed = baseIds − headIds`（`source:"runner"` 时可用）。`removed` 中如果有 id 对应的文件在 head 里还存在，且同名测试被改名，用相似度 ≥ 0.8 认定为改名，不计入删除。
  - `drop = base.total − head.total`；`skipDelta = head.skippedDeclared − base.skippedDeclared`。
  - 命中 R-T5 的条件：`removed 非空` 或 `drop > 0` 或 `skipDelta > 0`。
  - **严重度取决于计数来源（R1-D7-07）：** 只有 base 与 head 两侧都是 `source:"runner"`（真正由 runner 列举）且 `removed` 中存在未被识别为改名的 id 时，才是 severity 3 并阻断 `in_review`。任何一侧为 `source:"static"`（例如 jest 的正则估计，把用例改写成 `.each` 就会让计数下降）时，命中**降为 severity 2、不阻断**，并在验收面板注明“计数为静态估计”。静态计数永远不触发阻断。
- **成本**：清单在验证时与标准并行运行，占用同一个槽位。**正式验证总是运行**（有可运行的 exec 标准时；标准结果全部命中缓存时只为清单取槽位，§7.4.1，ADR-183），机会式验证不运行。go/cargo 的 list 需要编译，和随后的测试运行共享构建缓存，所以几乎没有额外编译。

### 7.5.5 策略执行：`ScopeFence.allowTestEdits`

| 策略 | L-a `tool_call` 拦截（edit/write 命中 TestPathSet） | L-a bash 静态命中¹ | L-b 事后发现 | L-c 验证时命中 |
|---|---|---|---|---|
| `forbid` | `return {block:true, reason:"Contract forbids editing tests: <path>. If the test is wrong, call ask_user."}`。在 Trace 中记录 `sentinel` Fact（observation，severity 1，因为已被阻止） | 同样 block | 从检查点恢复这些文件（经影子 git 目录执行 `towerGit checkout <prevCp> -- <paths>`，§7.3.2），然后通过 `sendMessage(deliverAs:"steer")` 注入 Tower 消息：“你的命令修改了受保护的测试文件 X，已还原”。记 severity 2 Fact | 若仍有残留（例如某次提交绕过了上述层），severity 3，阻止进入 `in_review` |
| `ask` | 按 `11` §11.4 的 `ask` 流程生成 Needs-You `approval`（severity 2，`costOfDelay:"agent_blocked"`；单向门审批的级别由 `08` §8.3.1 直接定为 L4，ADR-208；`defaultIfIgnored: deny @ 1800 s`，仅在 `Contract.unattended = "use_defaults"` 时计时，`02` §2.9）。工具调用挂起，直到人回答 | 同左 | 不还原；生成 severity 2 的 `sentinel` 项，事后请人确认 | 已批准的路径和 hunk（按 hunkHash）视为已覆盖；未批准的部分为 severity 2 |
| `allow` | 放行 | 放行 | 记录 Fact（severity 1，chip） | R-T2/R-T3 的弱化类命中仍为 severity 2；纯修改为 severity 1 |

¹ bash 静态命中规则：命令中出现重定向或写入工具（`>`、`>>`、`tee`、`sed -i`、`perl -pi`、`mv`、`cp`、`rm`、`git checkout --`、`git restore`、`truncate`），并且其参数路径匹配 TestPathSet；或者 `class == "snapshot_update"`。

**L-a 的额外硬化（forbid 时）：** Goal 开始时，对 worktree 中 TestPathSet 内已存在的文件执行 `chmod a-w`（git 只跟踪可执行位，不会产生 diff）。Agent 要绕过就必须执行 `chmod`，而 `chmod … <测试路径>` 会被 bash 静态规则命中。若 OS 沙箱可用（`11`），对这些路径设写拒绝。

**与 `11` §11.4 的分工：** 命中 `protected` 路径（快照、CI、Agent 指令文件等）的事后发现，按 `11` §11.4 处理：运行中只使 S0 授权失效、不暂停 Run，改动由验证时 §7.6.1 的 `protected_path`（severity 3，阻止进入 `in_review`）交给人处置（ADR-201）。本表的“自动还原 + 转向”只用于 `forbid` 策略下**非 protected** 的测试文件，因为这类情况的意图明确（合同禁止改测试），不需要人参与。

**一致性：** `ScopeFence.protected` 与 `allowTestEdits` 同时作用时，取**更严格**者：受保护的测试路径同时归 `edit.protected` 与 `edit.tests`，取两类级别中较严者（`edit.protected` 在各预设中至少为 `ask`；合同把 `allowTestEdits` 设为 `forbid` 时为 `forbid`）——分类与取严的唯一定义在 `11` §11.3.1、§11.3.5（ADR-183）。注意 `02` 的默认 protected 包含快照，因此即使 `allowTestEdits: "allow"`，快照默认也受保护。`02` §2.5 已写明“取严格者”，lockfile 的可写性由 `allowNewDependencies` 推导。

---

## 7.6 其他哨兵

除特别说明外，都在 L-b（事后即时，增量）和 L-c（验证时，全量 base..pin）两层运行，L-a 只用于 autonomy 矩阵拦截（`11`）。

### 7.6.1 范围越界（scope_breach）

```
for path in changedPaths(base, tree):
  if matches(path, fence.protected): hit("protected_path", sev 3 if not approved else 1)   // 名字按 16 §16.1.12 的比较规则（ADR-204）
  else if !matchesAny(path, fence.include) or matches(path, fence.exclude): hit("out_of_scope", sev 2)
```

- 新增文件与修改同样计算；删除文件额外加权（severity +1，上限 3）。
- `tool_call` 层：`edit/write` 的路径越界时按 autonomy 矩阵的 `edit.out_of_scope` 档位处理（默认 `ask`）。
- 去重键 `s:{goalId}:out_of_scope`（`08` §8.4 `sentinel` 行 `s:{goal}:{detector}` 的一例）：一个 Goal 的越界路径**合并为一条**，路径列表累加。

### 7.6.2 新依赖（dep_added）

| 生态 | 清单解析（结构化对比 base vs head） | 命令拦截（L-a，`class=="install"`） |
|---|---|---|
| JS | package.json 的 `dependencies/devDependencies/peerDependencies/optionalDependencies` 键集合差 | `npm i <pkg>`、`pnpm add`、`yarn add`、`bun add` |
| Python | `pyproject.toml [project].dependencies / optional-dependencies / [tool.poetry.*dependencies]`、`requirements*.txt`（规范化包名，PEP 503） | `pip install <pkg>`、`uv add`、`poetry add` |
| Go | `go.mod` 的 `require` 块（区分 `// indirect`） | `go get <mod>` |
| Rust | `Cargo.toml` 的 `[dependencies]/[dev-dependencies]/[build-dependencies]` 和 `[workspace.dependencies]` | `cargo add` |

- 新增直接依赖 → `dep_added`；`allowNewDependencies:false` 时 severity 3（L-a 拦截则为 1），`true` 时 severity 1。
- 主版本升级 → `dep_major_bump`，severity 2。
- 只有 lockfile 变化而清单没变 → `lockfile_drift`，severity 1。
- 新包名在注册表上的“年龄”和下载量检查（防仿冒包）属于可选的联网检查，默认关闭（`11`）。

### 7.6.3 配置/基础设施变更（config_changed）

路径集合：`Dockerfile*`、`docker-compose*.y*ml`、`**/*.tf`、`k8s/**`、`helm/**`、`.env*`、`tsconfig*.json`、`.eslintrc*`/`eslint.config.*`、`biome.json`、`.prettierrc*`、`ruff.toml`、`.golangci.y*ml`、`clippy.toml`、`vite.config.*`、`webpack.config.*`、`.npmrc`、`pnpm-workspace.yaml`、`Makefile`、`.gitignore`、`.gitattributes`、`.editorconfig`（名字按 `16` §16.1.12“上下文文件名与受保护名字”的比较规则匹配，ADR-204）。默认 severity 1，`.env*` 与 infra（tf/k8s/helm/Docker）为 severity 2。

**给 Agent 的指令文件**（任意目录中的上下文文件，以及 `.pi/**`（含 `.pi/SYSTEM.md`、`.pi/APPEND_SYSTEM.md`）、`.agents/**`；名字都按 `16` §16.1.12“上下文文件名与受保护名字”识别，大小写变体同样标记，ADR-203/204）：这些路径在 `11` §11.3.3 中默认受保护，命中时按 §7.6.1 的 `protected_path`（severity 3）处理。即使用户在合同中放开了保护，修改这些文件仍等于修改未来 Agent 的指令，因此至少为 severity 2，并在验收面板中单独列出（另见 `09` §9.11）。

**质量闸门削弱（gate_weakened，属于 config 类的子检测器）**：在**非测试文件**的新增行中统计抑制注释：`eslint-disable`、`@ts-ignore`、`@ts-expect-error`、`@ts-nocheck`、`# type: ignore`、`# noqa`、`# pragma: no cover`、`//nolint`、`#[allow(`、`// biome-ignore`；以及 lint/tsc 配置中把规则设为 `off`/`"warn"`，`strict: false`、`noImplicitAny: false`。每个 Goal 累计 ≥ 3 处或出现任意一处配置降级 → severity 2；其余为 severity 1。

### 7.6.4 公共 API 变化（api_changed，启发式）

| 生态 | “公共”的判定 | 变化检测 |
|---|---|---|
| TS/JS | 被 package.json `main/module/types/exports` 指向的入口，以及从入口 re-export 的文件（解析 `export * from`/`export {…} from` 一层，最多 3 跳） | `−` 行里有 `export (async )?(function|class|const|interface|type|enum) NAME`，而 `+` 行里同名声明缺失或签名文本不同；`.d.ts` 变化 |
| Python | 包 `__init__.py` 的 `__all__`，以及顶层非 `_` 前缀的 `def/class`（在 `src/<pkg>/` 下） | 同名 `def` 参数列表文本变化或删除 |
| Go | 非 `internal/` 包中首字母大写的 `func/type/var/const` | 签名行变化或删除 |
| Rust | `pub fn/struct/enum/trait/type`（不含 `pub(crate)`/`pub(super)`）位于 `lib.rs` 可达模块 | 同上 |
| 通用 | `**/*.proto`、`openapi.*`、`swagger.*`、`**/*.graphql`、`schema.prisma` | 任意变化 |

删除或签名变化 → severity 2（如果合同 `constraints` 中含“不改公共 API”类文本，或 StopCondition `natural` 中有同义描述，由人在合同里勾选 `scope.publicApiFrozen`，此时为 severity 3）。只有新增 → severity 1。本检测器的标签是 *heuristic*，UI 显示“启发式”。

### 7.6.5 迁移文件（migration）

路径：`**/migrations/**`、`db/migrate/**`、`alembic/versions/**`、`prisma/migrations/**`、`drizzle/**`、`**/*.sql`（位于 migrations 目录时）、`schema.prisma`。

- 新增迁移 → severity 2（迁移是单向门的前兆，`11`）。
- **修改 base 中已存在的迁移文件** → severity 3（改写迁移历史）。
- 新增行包含破坏性 SQL：`\bDROP\s+(TABLE|COLUMN|INDEX|SCHEMA|DATABASE)\b`、`ALTER\s+TABLE\s+\S+\s+DROP`、`TRUNCATE`、不带 `WHERE` 的 `DELETE FROM`/`UPDATE` → severity 3。

### 7.6.6 密钥（secret）

| 规则 | 正则（新增行或 bash 输出） |
|---|---|
| AWS | `AKIA[0-9A-Z]{16}`、`(?i)aws_secret_access_key\s*[:=]\s*\S{40}` |
| GitHub | `gh[pousr]_[A-Za-z0-9]{36,}`、`github_pat_[A-Za-z0-9_]{60,}` |
| Slack | `xox[baprs]-[A-Za-z0-9-]{10,}` |
| Stripe | `sk_live_[A-Za-z0-9]{24,}`、`rk_live_` |
| Google | `AIza[0-9A-Za-z\-_]{35}` |
| OpenAI / Anthropic | `sk-(proj-)?[A-Za-z0-9_\-]{32,}`、`sk-ant-[A-Za-z0-9_\-]{32,}` |
| 私钥 | `-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----` |
| 通用高熵 | `(?i)(api[_-]?key|secret|token|passw(or)?d)\s*[:=]\s*['"][^'"\s]{16,}['"]`，且值的 Shannon 熵 ≥ 3.5 bit/char，并排除 `example|dummy|test|xxx|<.*>` |

- **被跟踪的 env 文件**（`.env.test`、`.env.development` 等已提交文件）对 Agent 可读（ADR-078）；它们照样经过本节的扫描，命中即按密钥处理。未跟踪或被忽略的 env 文件与密钥路径表中的其他路径按 `11` §11.3.1 密钥路径表的作用范围处理：Agent 写允许范围之外 S2 读拒绝（CA 证书包允许清单除外），之内只作分类、不读拒绝（ADR-224）。
- 出现在 diff 新增行 → severity 3，阻止进入 `in_review`。新增 `.env`（不含 `.env.example`）文件 → severity 3。
- 出现在 **bash 输出**里（意味着已经进入模型上下文并发送给了提供商）→ severity 3，`costOfDelay: none`，但提示“考虑轮换”。观察器在 `outputTail` 与日志副本中对其做掩码（`****<后4位>`）。
- 若本机装有 `gitleaks`，验证时额外运行 `gitleaks detect --no-git --source <slot>` 作为第二意见（结果为 Fact，规则 id 写入 `data`）。

---

## 7.7 异常检测器（Anomaly Detectors）

这些检测器的 producer 是 `detector`，产生的 Fact 为 `kind: "anomaly"`，`data.detector` 区分 `loop / stall / burn_without_progress / claim_contradicted`（`02` §2.7）。

### 7.7.1 循环/停滞（loop / stall）

**M1 范围（ADR-059、ADR-139）：** M1 只实现 S1（同一失败重复）、S5（静默工具）、心跳（`08` §8.6.3）与合同停止条件 `path_touched`、`command_matches`、`no_progress_for`（`rework_cycles_over` 已删除，ADR-143：返工上限只由 I6 / `Contract.maxReworkCycles` 定义，到达时进入 `verify_failed_limit`，不作为停止条件求值）；S2–S4、S6、S7 推迟到 M2（下表照常给出规格，供 M2 实现与 E1 日志回放）。

**合同停止条件的求值与再武装（ADR-139；`StopCondition` 定义在 `02`，卡片见 `04` §4.8.10，去重与标注见 `08` §8.4、§8.8）：**

| 种类 | 求值点 | 命中动作 |
|---|---|---|
| `path_touched{glob}` / `command_matches{regex}` | gate 中、工具执行**之前**（`05` §5.6.5） | 拒绝该调用（工具结果：“停止条件：需要人确认”）→ drain → `paused(stop_condition)` |
| `no_progress_for` | Supervisor 计时器 | drain → `paused(stop_condition)` |
| `natural{text}` | 不由 Tower 求值：只作为文字注入给模型 | 模型以 `ask_user` 提问 → `question`，不产生 `stop_condition` |

再武装（以 `StopCondition.id` 为单位；状态与清除时机唯一定义在 `16` `Goal.stopConditionSilences`）：“继续” → 只对本次命中的对象（glob 匹配到的具体路径、具体命令）静默一个 Run，`no_progress_for` 计时器重置；“修订合同后继续” → 按修订后的合同重新武装全部条件（未改动的条目保留 id，去重键不变）；“这里不该停” → 该条件静默到下一次合同修订，并成为 `09` §9.6.2 L9 的候选收窄。停止条件的任何静默都**不影响 I6**：返工上限照常生效。因此人刚作出的决定不会被同一条件立即推翻，标注也不会被重复计数。

**归一化与失败签名：**

```ts
normalizeCommand(c) = c.trim().replace(/\s+/g, " ")
  .replace(/\b\d{2,}\b/g, "N")                       // 端口、行号、计数
  .replace(/(\/tmp|\/var\/folders)\/\S+/g, "TMP")
failureSignature(out) = sha1(lastLines(out, 20)
  .map(l => l.replace(/\d+(\.\d+)?\s*(ms|s)\b/g, "T")              // 耗时
             .replace(/0x[0-9a-f]+|\b[0-9a-f]{7,40}\b/gi, "H")      // 地址/哈希
             .replace(/:\d+:\d+/g, ":L:C")                           // 行列号
             .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g, "TS"))
  .join("\n"))
```

| 信号 | 定义 | 阈值（默认） |
|---|---|---|
| S1 同一失败重复 | 本 Run 内同 `(normalized, failureSignature)` 且 `exitCode≠0` 的次数，并且两次之间 tree 变化的行数 < 20 | 3 次 → `nudge`；5 次 → `escalate` |
| S2 编辑-回退振荡（M2） | 用每回合检查点的 `path → blobSha` 序列（只取回合检查点，不含 `safety` 等非回合检查点）；同一路径的 blob 回到 10 个回合内出现过的值（A→B→A），记一次振荡 | 一个路径振荡 2 次，或任意路径合计 3 次 → `nudge`；再发生 2 次 → `escalate` |
| S3 无新事实（M2） | 进展信号（见下）在连续 N 个回合内为空 | `N = 8` 回合**且** ≥ 10 min；Run 的前 10 回合或前 5 min 为探索宽限期，不计 |
| S4 烧 token 不动 diff（M2） | 自上次 tree 变化以来的 tokens > `max(60k, 3 × 本项目×模型的“每次 tree 变化 token 中位数”)` 且时间 ≥ 10 min | → `nudge`；2 倍阈值 → `escalate` |
| S5 静默工具 | `acting` 且当前工具无输出（`tool_execution_update` 无新内容）≥ 20 min，且 bash 没有设置 `timeout` | → `escalate`（Mode 置为 `stalled`，见 `08` §8.6） |
| S6 计划反复（M2） | 30 min 内收到 ≥ 3 次 `log{kind:"plan"}`，且相邻两版的步骤集合 Jaccard 相似度 < 0.5 | → `nudge` |
| S7 反复撞墙（M2） | 10 min 内同一动作类被策略 `forbid` 拦截 ≥ 3 次，或出现 `sandbox_violation` ≥ 3 次（`11` §11.1、§11.6.2） | → `nudge`（提示改用 `ask_user` 申请）；再命中 → `escalate` |

**`stalled` 子类型命名**（escalate 时写入 Needs-You `source.detector` 与 Mode 子类型）：S1 → `loop`；S2 → `oscillation`；S3 → `no_progress`；S4 → `burn_without_diff`；S5 → `silent`；S6 → `plan_churn`；S7 → `policy_wall`。其他来源：`provider_silent`、`unresponsive`、`crashed`、`idle_without_submit`、`prepare_failed`、`engine_error`（`08` §8.6）。

**进展信号**（只用 Fact）：tree 变化且净 diff ≥ 3 行；出现新的 `(normalized, exitCode)` 组合；`class=test` 的失败计数下降或通过计数上升；某条标准的观察器或验证器状态变为通过；人的消息已送达。

**升级流程**（对应 *TB* D#15“先提醒 Agent，再升级给人”）：

```
nudge:    记录 Fact（severity 1，chip）+ 若本 Run 尚未 nudge 过同一信号：
          pi.sendMessage({customType:"tower.nudge", display:true,
            content:"Tower: you appear to be repeating <X> (<evidence>). Stop, summarise what you've tried, "
                  + "and either change approach or call ask_user with 2–3 options."}, {deliverAs:"steer"})
          （在 Trace 中以“Tower 注入”标记显示，P/0.5 上下文透明）
          nudge 是**模型面特性**（ADR-048）：≤ 60 token（ADR-009）、原样可见、实验 E5 附属指标“nudge 后恢复率”，
          未达标时按撤回规则改为默认关闭（只记录 Fact，不注入）
escalate: Mode → stalled；生成 Needs-You `stalled`（severity 2，costOfDelay:"agent_degraded"，
          options: 继续 / 暂停 / 带提示转向 / 回退到检查点 cp<n>（M2）/ 接管；defaultIfIgnored: 暂停 @ 1800 s，仅 `use_defaults` 时计时；
          超时 → paused(stalled_timeout)，条目保持打开（08 §8.7.1，ADR-183）；人选“暂停”仍是 paused(human)）
          若合同 StopCondition no_progress_for 命中且未被静默 → 直接暂停（`03`；再武装规则见本节开头）
```

nudge 每个信号每个 Run 只发 1 次；再次命中时直接 escalate。

### 7.7.2 烧钱对进展（burn_vs_progress）

```
{V, O, M} = progress(goal, fpNow)              // §7.2.4，与卡片同一口径
progress = M > 0 ? (V + 0.5 × (O − V)) / M : 0     // 已验证计满分，只有观测到的计半分；过期结果两轨都不计
            —— M ≤ 1 时，另用 class=test 的观测通过率作辅助进度（只用于本检测器，不显示为进度）
burn     = max(costUsd / usdSoft, wallClockMin / wallClockSoftMin)    // 无预算时用项目×模型的 p75 成本代替分母
anomaly  if (burn ≥ 0.5 and burn − progress ≥ 0.4)
         or (过去 15 min 的花费速率 ≥ 3 × 项目基线速率 and progress 在这 15 min 内未变)
```

默认 severity 1（chip 和简报，`08`）；`burn ≥ 0.8` 且 `progress < 0.3` 时升为 severity 2。预算软上限本身由 accountant 处理（Needs-You `budget`）。

---

## 7.8 声明交叉校验器（Claim Cross-Checker）

输入：新的 Claim（`log`、`submit`、`propose_contract` 等工具调用产生），加上当时的 Ledger。输出：`claim.crossCheck`。在 Claim 写入时运行一次；相关 Fact 更新时（例如之后出现了新的测试运行）重新运行。

### 7.8.1 硬矛盾与软矛盾（R1-D7-10）

交叉校验依赖对 Claim 文本的中英文关键词识别，识别本身可能出错。因此 `contradicted` 分两级：

| 级别 | 条件 | 视觉（`12`） | 路由 |
|---|---|---|---|
| **硬矛盾** `hard` | 被推翻的断言来自**结构化字段**（`evidenceRefs`、`submit.criteriaSelfAssessment`、`log` 的 `scopeHint` 等由工具参数给出的值），且对照的是确定性 Fact | danger 色 + “✕ 与事实矛盾” | `done`/`submit` 类：severity 2（并入 `verify_failed` / `review_ready` 证据）；其他：severity 1 chip |
| **软矛盾** `soft` | 被推翻的断言是从**自由文本**中用关键词或正则抽取的；或检查本身是启发式（X4） | 中性色 + “◇ 可能不一致”（字形以 `12` §12.5.1 为准，ADR-178），附抽取到的原文片段，让人判断抽取是否正确 | severity 1 chip；不计入告警精度的分母（`08` §8.8），单独统计抽取准确率 |

`crossCheck` 增加 `strength: "hard" | "soft"`（与 `status: "contradicted"` 同时出现）。校准记分板（`09` §9.8）只用硬矛盾计算“声明被推翻率”，软矛盾单独列出。

### 7.8.2 规则

| 规则 | 触发（Claim 内容） | 检查 | 结果 |
|---|---|---|---|
| X1 声称改了文件 | `evidenceRefs` 中有 `fileLine/hunk`（结构化），或 text 中的路径令牌（`[\w./-]+\.(ts|js|py|go|rs|…)`）与动词“修改/修复/更新/added/changed/fixed/updated”同句出现（自由文本） | 该路径在本 Run 的 `files_touched` 中？ | 不在 → 结构化时**硬**、自由文本时**软**：“声称修改 src/a.ts，但本次运行未改动 a.ts” |
| X2 声称测试通过 | 正则 `(all )?tests? (now )?(pass|passing|green|succeed)|测试(全部)?通过|✅` | 找本 Run 中最后一次 `class=test` 的 `command_result`：① 不存在 → `unbacked`；② `exitCode≠0` → 软矛盾；③ 该结果的 `workspaceFingerprintAfter ≠` Claim 时刻的 fp（之后还有编辑）→ 软矛盾：“最后一次测试之后有 N 处编辑” | 自由文本，最高为软矛盾 |
| X3 声称运行了某命令 | `I ran|ran |执行了` + 反引号命令 | 本 Run 中存在 normalized 相似度 ≥ 0.8 的 `command_result`？ | 否 → 软矛盾 |
| X4 step vs 文件 | `kind=step` | 设该 step 到下一个 step 之间触及的文件为 F；step 文本里的路径和标识符令牌为 M；所链接的 PlanStep 中 `criteriaIds` 所涉范围为 S。若 `F ≠ ∅` 且 `F ∩ (M ∪ S) = ∅` 且 F 不全是测试或支持文件 | → 软矛盾：“声称在做 A，却在改 B”（`02` §2.5 第 3 点） |
| X5 引用不存在 | `evidenceRefs` 的 `fileLine` 中，文件在 `atCommit` 不存在，或行号 > 行数；或 `trace` 引用的 `piEntryId` 不存在 | — | **硬**：“引用的 src/x.ts:120 不存在” |
| X6 完成自评 | **有效提交**（`Run.submit`，`03` I4）的 `criteriaSelfAssessment[i] == "met"` | 该 criterion 的最新验证器结果：失败 → **硬**；只有观测轨结果且失败 → 软；从未运行 → `unbacked` | 验证器结果出来后再评一次 |
| X7 声称没改测试 | `no test changes|didn't (modify|touch) tests|未修改测试` | R-T1 有命中？ | 有 → 软矛盾（R-T1 命中本身是 Fact，单独显示） |
| X8 范围声明 | `only changed|仅修改` + 路径集合 | 与 `files_touched` 对比 | 多出的路径 → 软矛盾 |

- `consistent` 只在 Claim 中至少一个可检查的断言被 Fact 支持、且没有任何断言被推翻时给出。可检查的断言为 0 时给 `unchecked`。
- 每条矛盾都产生 `anomaly{detector:"claim_contradicted", strength}` Fact（`02` §2.7）。

---

## 7.9 廉价的虚假成功线索检测器（实验特性，默认关闭）

**证据与领域（R1-D3-01）：** Advani 2026 在 tau2（**客服**场景，单控）与 AppWorld（**应用操作**自评轨迹）上发现，TF-IDF 检测器在**同分布**内达到 AUROC 0.83–0.95，而 LLM 裁判 ≤ 0.65。这些结果**没有**在编码 Agent 上评估过，也不能说明跨分布的表现。本检测器的权重是手工设定的，属于跨分布使用。因此按 ADR-019 **默认关闭**；开启后也**只作为提示**，永远不改变状态，也不生成 Needs-You。

- **输入：** `submit.summary` 加上 Run 中最后一条 assistant 消息的文本。
- **特征：** 1–3 gram 的 TF-IDF，再加一组人工线索词，初始权重如下（正值表示虚假成功的倾向更强）：

  | 线索 | 初始权重 |
  |---|---|
  | `should (now )?(work|be fixed|pass)`、`应该(可以|没问题)了` | +1.2 |
  | `I believe|presumably|in theory|理论上` | +0.8 |
  | `(couldn't|could not|unable to|无法) (run|execute|test)`、`without running` | +1.5 |
  | `placeholder|stub|mock(ed)? (out|implementation)|TODO|for now|暂时|临时` | +1.0 |
  | `simplif(ied|y) the test|adjusted the (test|assertion)|updated (the )?expected` | +1.5 |
  | `skipp?(ed|ing)`、`disabled` | +1.0 |
  | 引用了具体测试计数（`\d+ passed`）且与最近一次 `parsedTests` 一致 | −1.0 |

- **模型：** 人工权重的逻辑回归，`score = σ(b + Σ w_i x_i)`，`b = −2.0`。
- **输出（开启时）：** `score ≥ 0.7` 时，在该 `done` Claim 的 `crossCheck.reasons` 中追加“措辞线索：未实际运行/占位实现（提示）”，以说法样式显示，排在验收面板“建议重点看”区域。
- **Tower 场景的评估计划（E1 附属离线评估，`14`）：**
  - **标签：** 正例 = 该 `submit` 的首次验证失败（exec 标准 `fail`/`vacuous`/`introduced_nondeterminism`），或验收时被 `request_changes` 且评论锚定在声称已完成的标准上；负例 = 首次验证通过且未被退回。
  - **样本：** 内部试用的全部 submit，目标 ≥ 400 条且正例 ≥ 80 条（按 20% 的首验失败率估算）。
  - **指标与开启阈值：** 在时间切分的测试集上 AUROC ≥ 0.75，且在 `score ≥ 0.7` 的工作点 precision ≥ 0.5；同时报告与“仅用 X2/X6 硬规则”相比的增益。达不到则保持关闭，并删除该特性（ADR-019 撤回规则）。
  - 用户本机累计 ≥ 200 个带标签的 submit 后，可选择每周在本机重新拟合（L2 正则）；不上传任何数据。

---

## 7.10 严重度映射与路由

### 7.10.1 总表

`sev` 为默认严重度；路由：**chip** = 外围芯片（`08` 阶梯 L1），**NY** = Needs-You（L2 及以上）。“阻断 in_review”列即 `blocksReview`：**这是 Verified 定义与 `decide()` 唯一使用的阻断集合**（严重度本身不决定阻断；例如 bash 输出中的密钥是 severity 3 但不阻断，因为问题不在 diff 里）。“精度目标”是哨兵基准语料上的离线门槛（§7.11.5），也是线上调节的参照。

**sentinel 与 anomaly 的分类规则（R5-D15-01）：** 针对 **Goal 的内容或其执行效果**（diff、卫星、槽位中由 Agent 代码造成的改动）的检测发出 `sentinel{detector}`——包括 `nested_repo`、`lifecycle_script_changed`、`runner_tampered`、`runner_patched`、`prepare_untracked_output`（`git_control_tampered` 已随 ADR-089 退役）；针对 **Tower 自身状态或运行过程**的检测发出 `anomaly{detector}`——包括 `verifier_store_tampered`、`stat_cache_mismatch`、`post_settle_activity`、`structured_content_dropped`、`tower_goal_handler_error`（ADR-239）、`bg_process_survived`（ADR-115）、循环与停滞（`loop`、`stall`）、`burn_without_progress`、`claim_contradicted`。`16` §16.1.6 按此分类登记。

| 检测器 | 子类型 | sev | 路由 | 阻断 in_review | 精度目标（§7.11） | 推导来源（ADR-103） |
|---|---|---|---|---|---|---|
| 测试完整性 | R-T1 修改（allow） | 1 | chip | 否 | 0.90 | pin |
| | R-T1 修改（ask，未批准） | 2 | NY `sentinel` | 否（但在验收面板置顶） | 0.80 | pin |
| | R-T1/R-T7 修改（forbid，残留） | 3 | NY `sentinel` | **是** | 0.95 | pin |
| | R-T2 skip/only/xfail 新增 | 2（forbid 时 3） | NY | forbid 时是 | 0.85 | pin |
| | R-T3 断言删除/弱化（改写对） | 2 | NY | 否 | 0.70 | pin |
| | R-T3 `expected_value_changed` | 1 | chip | 否 | 0.60 | pin |
| | R-T4 快照变更 / snapshot_update 命令 | 2 | NY | 否 | 0.80 | pin（文件）/ run（`snapshot_update` 命令） |
| | R-T5 测试 id 删除（两侧 `source:"runner"`） | 3 | NY | **是** | 0.90 | pin |
| | R-T5 计数下降（任一侧 `source:"static"`） | 2 | NY | 否 | 0.70 | pin |
| | R-T6 测试/CI 配置 | 2 | NY | 否 | 0.80 | pin |
| | R-T8 `pass_mutated` | 2 | NY | 是（verdict 本身不计为通过） | 0.80 | pin（验证时重判） |
| | R-T9 `lifecycle_script_changed` | 3 | NY | **是** | 0.95 | pin |
| | `runner_tampered`（运行器集合，内容哈希） / （其他第三方包） | 3 / 2 | NY | 是 / 否 | 0.99 | pin（验证时重判） |
| | `prepare_untracked_output` | 2 | NY | 否 | 0.80 | pin（验证时重判） |
| | `runner_patched`（补丁、override、link/file/git 指向运行器，ADR-092） | 2 | NY | 否（但结论最高为“有保留”） | 0.95 | pin |
| | flake `origin:"preexisting"` | 1 | chip + 简报；V 带“有保留” | 否 | 0.95 | pin（验证时重判） |
| | flake `origin:"introduced"` | 2 | 并入 `verify_failed`（verdict 为 `fail`） | 是（经由 verdict） | 0.80 | pin（验证时重判） |
| 范围 | protected_path | 3 | NY | **是** | 0.95 | pin |
| | out_of_scope | 2 | NY（一个 Goal 合并为一条） | 否 | 0.75 | pin |
| 依赖 | dep_added（不允许） | 3 | NY | **是** | 0.95 | pin |
| | dep_added（允许）/ lockfile_drift | 1 | chip | 否 | 0.90 | pin |
| | dep_major_bump | 2 | NY | 否 | 0.85 | pin |
| 配置 | config_changed（一般） | 1 | chip | 否 | 0.90 | pin |
| | `.env*` / infra | 2 | NY | 否 | 0.85 | pin |
| | gate_weakened | 2 / 1 | NY / chip | 否 | 0.70 | pin |
| | 给 Agent 的指令文件（合同放开保护后，§7.6.3） | 2 | NY | 否（验收面板单独列出） | 0.95 | pin |
| 公共 API | 删除或签名变化 | 2（冻结时 3） | NY | 冻结时是 | 0.60（启发式） | pin |
| | 只有新增 | 1 | chip | 否 | 0.60（启发式） | pin |
| 迁移 | 新增 | 2 | NY | 否 | 0.90 | pin |
| | 修改已有迁移 / 破坏性 SQL | 3 | NY | **是** | 0.90 | pin |
| 密钥 | diff 中 / 新 `.env` | 3 | NY（L4 立即通知，`08`） | **是** | 0.80 | pin |
| | bash 输出中 | 3 | NY | 否 | 0.80 | run |
| 循环/停滞 | nudge | 1 | chip | — | 0.70 | run |
| | escalate | 2 | NY `stalled` | — | 0.60 | run |
| `burn_without_progress` | 一般 / 严重 | 1 / 2 | chip / NY | — | 0.50 | run |
| 交叉校验 | 硬矛盾（done 类） | 2 | 并入 `verify_failed`/`review_ready` | 否 | 0.90 | run |
| | 硬矛盾（其他） | 1 | chip（danger） | 否 | 0.90 | run |
| | 软矛盾 | 1 | chip（中性，`◇`） | 否 | 抽取准确率单列 | run |
| 措辞线索（默认关） | — | 0（提示） | 只在验收面板显示 | 否 | §7.9 评估门槛 | run |
| 验证结果 | `vacuous` / `unparseable` | 2 | NY `verify_failed` | 是（经由 verdict） | — | pin（验证时重判） |
| 验证环境 | `verify_env_error` | 2 | NY（不返工） | 是（无结果） | — | pin（验证时重判） |
| 输入篡改 | `input_mutated_after_gate`（ADR-024） | 3 | NY | **是** | 0.99 | run |
| git 隔离 | `nested_repo`（`pinSafetyCheck`：仓库形态候选目录之内的任何增删改，subject = 目录，ADR-109、ADR-111） | 3 | NY | **是**（不排除；覆盖绑定目录 tree 哈希，seal 带 `Tower-Override`） | 0.99 | pin |
| | `symlink_escape`（`pinSafetyCheck`：pin 中解析不安全，且为新增/改动、或 base 中解析安全、或解析结果与 base 不同，ADR-112/116/124） | 3 | NY | **是**（不排除；覆盖绑定链接 blob 哈希，seal 带 `Tower-Override`） | 0.95 | pin |
| | `nested_repo`（git 拒绝收录：影子 `add` 因 `protectHFS`/`protectNTFS` 拒绝 `.git` 等价名字，列出与排除的方式唯一定义在 `10` §10.1.2、§10.7.1，被排除的路径记入检查点 `excludedPaths`；检查点或 pin 照常完成，**永不**标为 `verify_env_error`（Agent 可控的内容不是环境故障）；`running` 中按 `nested_repo_live` 进入 `paused(sentinel_high)`，ADR-131/139） | 3 | NY | **是**，绑定“路径 + 名字”，**不可覆盖**；列出全部被拒绝的路径，唯一出口是“删除这些条目” | 0.99 | pin |
| | `nested_repo_live`（运行中卫星 watcher 发现 `.git` 等价条目，ADR-123/131；以 abort 方式 drain，进入 `paused(sentinel_high)`） | 3 | NY | **是**；run 类，交还时保留，**不可覆盖**（没有 pin 可绑定）。出口：`goal.resume` 附必填转向（要求 Agent 删除该条目）/ `take_over`（人删除）/ `abandon`，写下 `pendingHandBack` 之后的例外以 `03` §3.2.1 为唯一来源（ADR-215/216）；条目从卫星中消失时命中解除 | 0.99 | run |
| 外部写入 | `external_change`（来源不明的写入，`10` §10.3.1 检测，ADR-122/128） | 2 | NY（kind `external_change`；`costOfDelay`：继续目标为 `run`/`settle` 时 `agent_blocked`，否则 `none`（ADR-134）；去重与标注见 `08` §8.4、§8.8） | 不经 `decide`：检测即 `paused(external_change)`，验证之前处置（`keep` / `revert`） | 由 `revert` 比例度量（`08` §8.8） | run |
| 验证器存储（anomaly） | `verifier_store_tampered`（§7.4.3） | 3 | NY（经 `verify_env`） | 是（本次无结论） | 0.99 | pin（验证时重判） |
| 运行过程 | `sandbox_violation`（沙箱拒绝的越界读写、执行或网络访问，`11` §11.6.2；拒绝说明边界起了作用，被拒绝的动作没有发生，ADR-110）——**目标属于 severity 2 的受保护类别**：`credential`（读、写；`~/.ssh/**` 整体属于它，ADR-136）、`tower_data`、`user_checkout`、`other_satellite`、`user_config`（仅写）（`category`、`op`、`target` 与该集合的唯一定义在 `16` §16.1.6，ADR-125；`user_config` 的判定规则同样唯一定义在 `16`，按包含式读法：主目录下顶层点文件，以及顶层点目录**之内**的全部文件，减去 `credential` 与 `tower_data`，含 shell 启动文件，其误报由 E7 统计，ADR-131/136） | 2 | NY（`kind:"sentinel"`，L2，`costOfDelay:"none"`），评审“运行异常”区块置顶；去重键 `sv:{goalId}:{category}:{op}:{target}`，以 `08` §8.4 为准。这类拒绝**可能表明**提示注入或越权意图，但也有常见的良性来源（如写 `~/.ssh/known_hosts`——默认良性清单的条目为 `(credential, write, ~/.ssh/known_hosts)`，ADR-136；云 SDK 读取凭据配置）。出口（ADR-117）：“知悉”→ `informative`；“这是良性的”→ `false_positive`，可把 `(category, op, target)` 加入**项目良性清单**，此后同一单位的拒绝为 severity 1（`mark_benign` 仅本机，`16` §16.5）；“收紧策略”；“放弃 Goal”。**凭据读取**（`category:"credential"`、`op:"read"`）不能加入良性清单，也永不降级；凭据写入可以（ADR-125/136）。降级规则 F：以 `(category, op, target)` 为单位，n ≥ 20 且从 M2 起生效，2 周内 `false_positive` > 30% → 默认降为 severity 1（`08` §8.9.2 规则 F） | 否（提示） | 报告频率与误报率（E7） | run |
| | `sandbox_violation`——其他目标（`system` 类：如 `~/Library/Caches/**`、遥测等；点目录中的缓存属 `user_config`，见 `16`），以及经人批准的调用对批准所列路径的拒绝（不论类别，`11` §11.6.2 “经批准的目标”，ADR-221） | 1 | chip + 评审“运行异常”区块（M2 起同类反复出现计入 `policy_wall`） | 否（提示） | 报告频率与类别（E7） | run |
| | `bash_overridden`（生效的 `bash` 不是 Tower 的沙箱版本，该 Goal 降为 S0；只可能在 RPC 适配器下出现，M2；`11` §11.4，ADR-041/066/201） | 2 | NY `sentinel`（去重键 `s:{goalId}:bash_overridden`） | 否（提示） | —（确定性判定） | run |
| | `policy_wall`（S7） | 2 | NY `stalled` | 否（提示，进入评审“运行异常”区块） | 0.80 | run |
| | `post_settle_activity`（anomaly，ADR-025） | 2 | NY | 否（提示；ADR-025 的撤回照常执行） | 0.95 | run |
| | `policy_block`（策略 forbid 拦截单次调用，`11` §11.1） | 1 | chip | 否（提示） | 0.95 | run |
| | `script_modified_then_run`（脚本被改后又被执行；阻断由 `criterion_def_changed` / R-T7 承担） | 2 | NY | 否（提示） | 0.90 | run |
| | `structured_content_dropped`（anomaly，扩展丢弃了 bash 的结构化结果，§7.2） | 2 | NY `anomaly`（去重键与出口见 `08` §8.4、§8.8，ADR-201） | 否（提示） | 0.99 | run |
| | `tower_goal_handler_error`（anomaly，tower-goal 的 `tool_call`、`turn_start` 或 `tool_result` 处理器出错时自报，`05` §5.6.5 第 6 项；同一处理器连续 3 次时 Goal 另以 `prepare_failed` 暂停，ADR-239） | 3 | NY `anomaly`（去重键 `an:{goalId}:tower_goal_handler_error`，同一 Goal 合并为一条；出口见 `08` §8.8） | 否（提示；gate 出错时该调用已被阻断，脱敏出错时该结果已被隐去） | —（确定性判定） | run |
| Tower 状态（anomaly） | `stat_cache_mismatch`（§7.3.2） | 2 | chip | 否（提示；在任何决定性使用之前先触发一次 full 重哈希） | 0.99 | Tower 状态 |
| | `bg_process_survived`（settle 时 SIGTERM 后 10 s 再 SIGKILL 仍存活的 Agent 进程，ADR-115/120/121，`10` §10.3.1） | 2 | NY（kind 以 `16` §16.1.7 为准，去重键与标注见 `08` §8.4、§8.8；选项 `再次终止` / `知悉`，ADR-126） | 否（提示；此后该进程的写入记为 `author:"agent"`，按 `agent_bg` 重新验证，ADR-122） | —（确定性判定） | Tower 状态 |

**推导来源与交还（ADR-103，R8-D7-01）：** “pin”类命中只依据 pin 的内容计算（“验证时重判”指由针对该 pin 的验证重新得出），新 pin 会重新判定；“run”类命中由运行过程产生，新 pin 无法重新得出。因此：

- **阻断 Verified 的 run 类命中**：`input_mutated_after_gate`（被批准执行的与实际执行的不一致，ADR-107、ADR-110；可被 `override_sentinel` 处置），以及 `nested_repo_live`（ADR-131；不可覆盖，出口见上表）。`sandbox_violation`、`post_settle_activity`、`policy_wall`、循环与停滞等运行期异常都是提示性的，不阻断，进入评审的“运行异常”区块。
- `decide(goal, pin, …)` 中的 `openSentinels(goal, pin)` = 针对该 pin 计算的 pin 类阻断命中（含 `pinSafetyCheck` 的命中）∪ **该 Goal 作用域内尚未处置的 run 类阻断命中**（未覆盖的 `input_mutated_after_gate`、未解除的 `nested_repo_live`）。
- 人工交还（`hand_back`）与新 pin 只会清除 pin 类原因；run 类阻断命中保持打开，各自的出口见 `16` §16.1.6（`input_mutated_after_gate` 须以带结构化原因的 `override_sentinel` 处置；`nested_repo_live` 不可覆盖，出口见上表，ADR-188）。交还对话框在存在这类命中时先列出它们（`14` 用例：从 `paused(sentinel_high{input_mutated_after_gate})` 接管并交还后，Goal 不能不经覆盖进入 `in_review`）。
- pin 类命中的覆盖状态在新 pin 上延续的规则见 §7.10.2 第 3 条（同一 `(detector, subject)`，内容哈希未变即延续）。

### 7.10.2 严重度调整因子

- `riskTier: "high"` 的 Goal：所有 severity 1 的**测试完整性、范围、配置**类命中升为 2（上限 3）。
- 已被 L-a 拦截（`block`）且之后没有残留的命中：降为 1（问题已被阻止，只需记录）。
- 同一个 Goal 已经存在、且被人 `override_sentinel` 处置过的同一 `(detector, subject)`：新命中只在 hunkHash 变化时再次出现，否则静默合并。`nested_repo` 与 `symlink_escape` 例外：覆盖绑定 subject 的对象哈希（目录 tree / 链接 blob），哈希一变即重新阻断（ADR-112）。

### 7.10.3 `decide(goal, pin, trigger)`：验证结束后的状态转移（R1-D7-08）

`03` 中进入 `verifying` 的源状态有三个，记为 `goal.verifyFrom ∈ {"claimed", "in_review", "accepted"}`（`accepted` 指尚未 integrated；`02` `Goal.verifyFrom`，持久化在 `06` `goals.verify_from`，验收延续与 `onlyChangedUnits` 据此判定）。**写入点**唯一定义在 `16` §16.1.1 `Goal.verifyFrom` 行（ADR-137；本节不复述，ADR-183）。

`Goal.verifyOrigin` 只是 Trace 与 Fact 的**说明字段**（与 `VerifyTrigger` 的对应见 `16` §16.1.1），**不决定任何去向**（ADR-140）。验证中进入 `paused` 时（`s0_grant_pending`、`verify_env_error`、人暂停、外部写入……），pin 由**继续目标** `Goal.continuation = {kind:"verify", pin}` 持久化（ADR-134/137；源状态不另存，取 `Goal.verifyFrom`），因此能跨越无限期等待与应用重启；离开 `paused` 只经 `onAllReasonsCleared()`，它对验证的去向见本节末“暂停解除后的验证”。机会式验证发生在 `running`，不经过 `verifying`。

```ts
type Outcome = "pass" | "fail" | "env_error" | "no_machine_criteria" | "exec_not_run";
type DecideOpts = { s0?: "pending";
                    execSkipped?: "ecosystem_unsupported" | "s0_denied" | "submodules_unsupported";
                    skippedCriteria?: string[];             // 只跳过部分 exec 标准时（生态逐条判定，§7.4.1）
                    by?: "human" | "timeout" };             // s0_denied 的来源（ADR-077）

function outcomeOf(goal, pin, opts: DecideOpts = {}): Outcome {
  if (latestVerifyEnvError(goal, pin)) return "env_error";                      // ADR-037；含缺失程序 exit 127（stage "exec"，ADR-085）
                                                                                //   缺失程序不是 Agent 的失败。缺少未播种的机密本地文件不归为 env_error，按普通失败处理（ADR-168）
  let machine = goal.contract.criteria.filter(c => c.kind === "exec" || c.kind === "artifact");
  if (machine.length === 0) return "no_machine_criteria";                       // ADR-031
  if (opts.execSkipped && opts.skippedCriteria?.length) {                      // 部分跳过：其余机器标准照常判定
    machine = machine.filter(c => !opts.skippedCriteria.includes(c.id));
    if (machine.length === 0) return "exec_not_run";
    return machine.every(c => isVerifiedPass(latestCriterionCheck(goal, c.id, pin)?.data)) ? "pass" : "fail";
  }
  if (opts.execSkipped) {                                                       // ADR-064 / ADR-071 / ADR-077：全部 exec 标准未由验证器执行
    machine = machine.filter(c => c.kind === "artifact");
    if (machine.some(c => !isVerifiedPass(latestCriterionCheck(goal, c.id, pin)?.data))) return "fail";
    return "exec_not_run";
  }
  return machine.every(c => isVerifiedPass(latestCriterionCheck(goal, c.id, pin)?.data)) ? "pass" : "fail";
}

function decide(goal: Goal, pin: Sha, trigger: VerifyTrigger, opts: DecideOpts = {}): Transition {
  if (trigger === "opportunistic") return { stay: true };                       // 只更新 V/O，从不转移状态
  if (opts.s0 === "pending")                                                    // ADR-068：等待 S0 授权（不是失败）
    return { to: "paused", pauseReason: "s0_grant_pending", needsYou: s0GrantApproval(goal) };
                                                                                // 继续目标按 03 §3.2.1 写为 verify{pin}；授权只解除本原因（ADR-134）
                                                                                // S0 拒绝（唯一定义，ADR-188）：人拒绝或 use_defaults 下超时拒绝同样只解除本原因、不改写继续目标；
                                                                                //   之后以同一 pin 重新验证，经 verify() 的 denied 分支以 {execSkipped:"s0_denied", by} 回到本函数，
                                                                                //   artifact 失败（fail）与阻断命中（sentinel_high）照常在下面判定——拒绝不绕过 decide()
  const o = outcomeOf(goal, pin, opts);
  const blocking = openSentinels(goal, pin).filter(s => s.blocksReview && !s.overridden);   // §7.10.1 的阻断列
  const from = goal.verifyFrom;
  // 失败去向的唯一规则（03 §3.2.1，ADR-140/144）：只看归因，不看 verifyOrigin，没有例外
  // 窗口以**事件序号**界定（ADR-145）：计入事件序号大于起点事件的检查点。起点 = 以下两者中序号较大者：
  //   ① 最近一次“通过”的验证事件（lastPassedVerifySeq；“通过”唯一定义在 03 §3.2.1，ADR-187）——label ∈ {verified, verified_qualified}，
  //      且 Goal 因它进入 in_review（直接进入，或经覆盖哨兵改写的 review 目标进入）或经验收延续回到 accepted；没有则为绑定 base 的事件；
  //   ② 人最近一次明确把工作交给 Agent 的决定事件（封闭列表唯一定义在 03 §3.2.1：hand_back{continue_agent} 等四项，
  //      含 reverify 模式下把 pendingHandBack.mode 置换为 continue_agent 的 resume，ADR-217）。
  // 交还时 human_edit 检查点在同一事务中先于 HumanDecision{hand_back} 写入，因此不在由该交还开启的窗口内：
  //   交回 Agent 之后自动返工随之恢复。
  // 窗口按仓库分别计算（ADR-146）：每个 binding 用自己的 boundSeq（绑定时的事件序号，固定，不随 rebase 移动）
  //   与该仓库的检查点；任一仓库窗口内有人的改动即视为有人的改动。
  // 人的改动 = author:"human" 的检查点、mixedPaths 非空的检查点（M2 中 user_bash 调用窗口与 Agent 工具调用重叠，
  //   或窗口内有不属于该 user_bash 调用进程树的 Agent 进程存活时，窗口内的写入记入 mixedPaths，ADR-146/147），以及 rebase（M2）带入的 base 变化（由 rebase 检查点计入窗口）
  const humanTouched = goal.bindings.some(b => {
    const windowStartSeq = Math.max(lastPassedVerifySeq(goal) ?? b.boundSeq, lastHandToAgentDecisionSeq(goal) ?? 0);
    return checkpointsAfterSeq(goal, b.projectId, windowStartSeq)
             .some(cp => cp.author === "human" || cp.mixedPaths.length > 0 || cp.landmarks.includes("rebase"));   // rebase：M2 合并队列的 rebase 检查点（10 §10.7.1），M1 中不出现
  });

  if (o === "env_error")                                                        // 不返工、不计返工次数
    return { to: "paused", pauseReason: "verify_env_error", needsYou: envErrorItem(goal) };
  if (o === "fail") {
    if (humanTouched)                                                           // 不让 Agent 自动改人改过的内容（含 rebase 带入的变化）
                                                                                // （来源不明的写入在验证之前就已暂停，不会到达这里，ADR-122）
      return { to: "paused", pauseReason: "human_change_verify_failed", needsYou: verifyFailed(goal) };
    if (goal.counters.reworkCycles >= (goal.contract.maxReworkCycles ?? 3))     // I6：返工上限的唯一定义（ADR-143）
      return { to: "paused", pauseReason: "verify_failed_limit", needsYou: verifyFailed(goal) };
    if (budgetAtHardCap(goal))                                                  // 任何 Run 开始前检查预算，不越过硬上限（ADR-140）
      return { to: "paused", pauseReason: "budget_hard_cap", continuation: { kind: "run" },   // ADR-144
               appendOpening: { factId: verifyFailedFact(goal, pin) } };                       // OpeningRef：返工证据引用验证失败的 Fact
    goal.counters.reworkCycles += 1;                                            // ADR-147：选择返工的这一刻递增（与下面的转移同一事务），
                                                                                //   不论直接开 Run 还是进入 ready 排队；I6 因此不能被排队绕过，
                                                                                //   排队中被 pause/abandon 时也不回退
    if (!admissible(goal))                                                      // 任何要开 Run 的转移都经过准入（06 §6.2.4，ADR-146）
      return { to: "ready", waitReason: admissionWaitReason(goal),              // 无执行槽位 → "slot"；依赖未满足 → "dependency"
               queuedRun: { kind: "rework" },                                   // ADR-147：准入按类别判定，通过时才发 run.requested{rework}
                                                                                // ADR-151：此刻 queuedRun 必然为空——上一次 run.started 时已清除
                                                                                //   （清除点：run.started、abandon、进入 ready/paused 以外的任何状态），
                                                                                //   因此写入 rework 与“自动路径不覆盖已保留值”（ADR-150）不冲突
               appendOpening: { factId: verifyFailedFact(goal, pin) } };        // 返工证据留在 pendingOpenings，准入后开 Run
    return { to: "running", rework: buildReworkMessage(goal, pin) };            // run.requested{rework}；03 §3.4.3；merge_queue 亦同（10 Q5a）
  }
  // o ∈ {pass, no_machine_criteria, exec_not_run}
  if (blocking.length > 0)
    return { to: "paused", pauseReason: "sentinel_high",
             needsYou: sentinelItem(blocking, { options: blocking.some(isRunDerived)
               ? ["override_and_review", "abandon"]              // ADR-107：返工无法消除 run 类命中，不提供“返工”
               : ["override_and_review", "rework", "abandon"] }) };
  const label = o === "pass" ? (anyQualified(goal, pin) ? "verified_qualified" : "verified")   // 此处的 anyQualified 不含 ⑨（⑨ 只由下一行的延续结果给出、只作徽章），所以延续回到 accepted 的标签为 verified（ADR-186）
              : o === "exec_not_run" ? { label: "not_machine_verified", reason: opts.execSkipped, by: opts.by }
                                      // “未经机器验证（生态未支持 / S0 未授权 / 子模块未支持）”；S0 超时拒绝为 {reason:"s0_denied", by:"timeout"}
              : { label: "not_machine_verified", reason: "human_only" };     // 中性，不着绿（ADR-031；原因名见 16 §16.1.1）
  if (from === "accepted" && acceptanceCarriesOver(goal, pin))                  // 03 I2 验收延续；本次有 ⑨ 以外的 anyQualified 条件时不延续（见下，ADR-185）
    return { to: "accepted", label, audit: "audit.acceptance_carried" };
  return { to: "in_review", label, needsYou: reviewReady(goal, { onlyChangedUnits: from !== "claimed" }) };
}

// 验收延续（唯一定义，03 I2 与 04 §4.6 引用本条）：全部已批准评审单元的 contentHash 不变、没有新增 hunk、outcome == "pass"（no_machine_criteria / exec_not_run 不延续），
//   且本次验证没有 ⑨ 以外的 anyQualified 条件——有任一条（例如从 accepted 修订标准后出现 ② 计时 flake）→ 不延续，进入 in_review，
//   只需重看变化的单元，并按验收闸为成立的条件写一句确认（ADR-185）；⑨ 本身只是徽章，不是确认条件
//   M1 中延续回到 accepted 还要求先写分支成功；另开 -v<k>、分支正被检出、仓库中有进行中的 git 操作或写入失败时不延续、进入 in_review（唯一定义 06 §6.4.3 goal.accept 行，ADR-190/192/193）
function acceptanceCarriesOver(goal, pin): boolean { … }
// anyQualified（“有保留的已验证”的条件，唯一定义；12 §12.5.2 的徽章与 04 §4.6 的验收闸只引用本条——①–⑧、⑩、⑪ 任一成立即验收前需书面确认；⑨ 只在延续时成立、只作徽章，ADR-183/184/185/187）——任一成立即有保留，
//   qualifiers 逐条列出：① 有标准为 pass_with_preexisting_flakes（§7.4.6）；② 有计时类 flake（flake{kind:"timing"}，§7.4.5，ADR-054）；
//   ③ 在 S0 环境中验证（ADR-021）；④ opts.skippedCriteria 非空（部分 exec 标准因生态未执行；验收面板逐条列出它们）；
//   ⑤ 验证所用 Node 版本与项目档案不同（§7.4.3）；⑥ 该 pin 上有 runner_patched 命中（无论是否已覆盖，§7.4.3）；
//   ⑦ 该 pin 上有被 override_sentinel 处置的哨兵（含按 §7.10.2 第 3 条延续到该 pin 的覆盖，ADR-186）；⑧ LFS 路径被改动（ADR-074）；⑨ 本次去向为验收延续（I2）；
//   ⑩（M2）artifact 结果带 links_unchecked（§7.4.9）；⑪ 有 exec 标准的计数来自正则兜底（source="regex-summary"，§7.4.5，界面标“计数为估计”，ADR-184）
```

**全部组合：**

| verifyFrom | trigger | outcome | 阻断命中 | → |
|---|---|---|---|---|
| 任意 | 任意（非 opportunistic） | env_error | — | `paused(verify_env_error)` + Needs-You（选项：重试 / 打开验证档案 / 暂停 Goal），不计返工 |
| 任意 | 任意（非 opportunistic），S0 且 `s0Grant ∈ {none, pending}` | — | — | `paused(s0_grant_pending)` + approval；授权或拒绝都只解除本原因（拒绝的唯一定义见 `decide()` 注释，ADR-188），全部原因解除后 `onAllReasonsCleared()` 以继续目标中的 pin、**原 `Goal.verifyFrom`**（继续目标不另存）回到 `verifying`（树已 ≠ pin 时改为 `verify_new`），验收延续照常判定——在 S0 中验证时 ③ 恒成立，所以从 `accepted` 来的这次验证不会延续，总是进入 `in_review`（ADR-077/134/186） |
| 任意 | 任意，`s0Grant ∈ {denied, denied_timeout}` / 子模块项目 / 全部 exec 标准生态未支持 | exec_not_run | 无 | `in_review`，标签“未经机器验证”（含暂停中拒绝之后以同一 pin 的重新验证；artifact 失败与阻断命中分别走 fail 行与“有”行，ADR-188），原因 `s0_denied{by:"human"|"timeout"}` / `submodules_unsupported` / `ecosystem_unsupported`（ADR-064、ADR-071、ADR-077） |
| 任意 | 任意，部分 exec 标准生态未支持 | pass（其余） | 无 | `in_review`，`verified_qualified`，逐条列出未执行的标准 |
| in_review / accepted | `retry_verify`（手动）、`grant_s0_exec`、`bring_back`、修订验收标准 | — | — | → `verifying`（`verifyFrom` = 当前状态；`paused` 中修订标准把 `review{state, pin}` 改写为 `verify{pin}` 时 `verifyFrom` = `state`，ADR-180），按本表重新判定（ADR-077/137） |
| 任意 | 任意（非 opportunistic） | fail（含 artifact 失败） | — | **按归因**（`03` §3.2.1 唯一规则，ADR-140/144）：窗口（以事件序号界定，起点为最近一次**通过**的验证（定义只在 `03` §3.2.1，ADR-187）与人最近一次把工作交给 Agent 的决定中序号较大者，ADR-145）内有人的改动（`author:"human"` 或 `mixedPaths` 非空的检查点，以及 rebase（M2）带入的 base 变化）→ `paused(human_change_verify_failed)`，不自动返工；否则 `reworkCycles ≥ maxReworkCycles` → `paused(verify_failed_limit)`；否则预算已达硬上限 → `paused(budget_hard_cap)`，继续目标 `run`，不开 Run，返工证据以 `{factId}` 入队 `pendingOpenings`；否则选择返工：`reworkCycles` 此刻 +1（ADR-147，不论随后是否排队），再经准入（`06` §6.2.4，ADR-146）：无执行槽位或依赖未满足 → `ready{waitReason:"slot"|"dependency"}`，写 `queuedRun{kind:"rework"}`，返工证据留在队列，准入通过时发 `run.requested{rework}`；否则直接 `running`。多仓库 Goal 的窗口按仓库分别计算，任一仓库有人的改动即算 |
| claimed | 任意（settle、`claim` 目标、`returnTo` 为空的 `verify_new`、无 `in_review`/`accepted` 来源的 `reverify`） | pass / no_machine | 无 | `in_review`，全部单元需评审，不延续；`claim` 目标时 Trace 记“人代为提交” |
| in_review / accepted | 任意 | pass / no_machine | 无 | `verifyFrom = accepted` 且满足延续（含“没有 ⑨ 以外的 `anyQualified` 条件”，ADR-185）→ `accepted`（`audit.acceptance_carried`）；否则 `in_review`，只需重看变化的单元，有保留条件时按验收闸写确认 |
| accepted | merge_queue（M2） | pass | 无 | 满足延续 → `accepted`，合并继续；否则 `in_review` |
| 任意 | 任意 | pass / no_machine | 有 | `paused(sentinel_high)` |
| running | opportunistic | 任意 | — | 不转移；只更新 V/O 与重入简报 |

失败行的典型情形：`claim`（人代为提交 Agent 的内容）、存活进程的写入（`agent_bg`）→ 只有 `author:"agent"` 检查点 → Agent 路径；`keep` 之后（任何继续目标下，包括 `settle`）、交还给人验证（`reverify`）、接管编辑 → 窗口内有 `author:"human"` 或 `mixedPaths` 非空的检查点 → 不自动返工；人随后以 `hand_back{continue_agent}`、`retry_after_human_change`、`request_changes` 或置换交还选择的 `resume`（`03` §3.2.1，ADR-217）把工作交给 Agent，窗口从该决定事件之后起算——交还的 `human_edit` 检查点先于决定事件写入，不在窗口内——Agent 此后的失败恢复自动返工。

**Human 层归因的来源**（ADR-145，M2 相关）：判定“人的改动”只依据 Tower 自己记录的事实——人的显式决定（`keep`、交还、接管编辑）与 Tower 知道的 `user_bash` 调用窗口内的写入——但窗口与 Agent 工具调用窗口重叠，或窗口内有**不属于该 `user_bash` 调用进程树**的 Agent 进程仍存活（Tower 以两个 `BashOperations` 实例各自已知的直接 pid 及其后代区分）时，窗口内的写入一律记为 `mixedPaths`，不记为纯 `human`；只有没有其他 Agent 活动时才归因为人（ADR-146/147）；**不**依据 Agent 可读或可写的环境值。`TOWER_ORIGIN` 只用于诊断，不作为归因依据；`user_bash` 启动的后台进程的写入按存活进程规则记为 `author:"agent"`。只有 rebase 带入的变化时，失败卡片与状态标签写“包含 base 的变化（rebase）”，不写“你的改动”（`04`、`12`，ADR-146）。`fp_changed_agent` 只用于 Tower 自动执行的 rebase 等非人、非 Agent 工作的变化；名称保留是为了与审计记录一致。`in_review`/`accepted` 期间没有 Run，Agent 进程已在 settle 时终止（ADR-115/121）。

**I2 的分界与来源不明的写入（ADR-122、ADR-128、ADR-134）：** `in_review`/`accepted` 中指纹变化时：变化来自 Tower 自己的工作（rebase、合并队列）、人的显式采纳（`keep`、交还、`bring_back`）或存活进程（`agent_bg`）→ `verifying`；**来源不明** → `paused(external_change)`。在任何状态检测到来源不明的写入（`10` §10.3.1 的检测器给出路径集合 E），状态写入 `Goal.externalChange{paths, mixedPaths, baselineCps, detections}`（`02`；重复检测时路径并入，基线保持首次值）。从非 `paused` 状态进入时，继续目标按 `03` §3.2.1 写入（`running` → `run`；settle 序列 → `settle`；`claimed`/`verifying` → `verify{pin}`；`in_review`/`accepted` → `review{state, pin}`）；已在 `paused(*)` 时记入 `alsoApplies`，继续目标不变。**来源不明的内容不会先被验证或评审，再等人决定**；`verifying` 中检测到时取消当前验证。两个出口都只解除本原因、按需改写继续目标；离开 `paused` 只经 `onAllReasonsCleared()`：

- `keep` → 以 `author:"human"` 记检查点（`mixedPaths` 记入 `Checkpoint.mixedPaths`，评审中显示为 `mixed`，ADR-135）；继续目标为 `review{state}` 时改写为 `verify_new{returnTo: state}`，为 `verify` 时改写为 `verify_new{returnTo}`（`returnTo` 取当时的 `Goal.verifyFrom`，若 ∈ {`in_review`, `accepted`}，否则为空），为 `run`/`settle` 时不改写（`03` §3.2.1）。本决定以 `{decisionId}` 追加到 `Goal.pendingOpenings`（`OpeningRef`，ADR-144）：下一次任何 Run 开始时，开场附 `tower.external_resolved{kept, reverted, mixed}`（≤ 120 token，要求不要回退已采纳的路径，ADR-140）。之后的验证失败是否自动返工不另作标记：采纳产生的 `author:"human"` 检查点（及 `mixedPaths`）按归因规则使其不自动返工——`settle` 目标下也是如此。
- `revert` → `restorePaths(基线, E)`（基线唯一定义在 `10` §10.3.1），**不改写**继续目标；同样以 `{decisionId}` 追加到 `pendingOpenings`，`tower.external_resolved` 列出被撤销的路径（含 `mixedPaths`：Agent 在这些文件上的编辑也被撤销）。之后**只考察 E 中的路径**：E 中仍与基线不同者——只可能来自恢复期间的并发写入——按归因表分类（存活进程 → `agent_bg`；其余 → 一次新的检测，E′ ⊆ E）。E 之外的路径不参与判定，其归因由检查点链决定：drain 检查点中的 Agent 工具写入为 `author:"agent"`，settle 序列中被追踪进程的刷写为 `author:"agent"`。因此在 `running` 中检测、drain 期间 Agent 又改了其他文件时，`revert` 之后回到 `running`，不产生新的检测（`14` G36b(h)）。

因此不存在“外部写入引起的验证失败”分支：来源不明的内容要么被撤销，要么经 `keep` 成为人的改动（`author:"human"` 检查点，验证失败按归因不自动返工）。

**存活进程的写入（ADR-122、ADR-134、ADR-145）：** 存活者未全部退出期间（`bg_process_survived` 被“知悉”不结束这一期间，只有存活者全部退出才结束），该 Goal 中未归因的写入记为 `author:"agent"`（附 `bg_process_survived` 注记），不走 `external_change`，也不能被采纳为人的改动。在 `claimed`/`verifying`/`in_review`/`accepted` 中，这些写入使卫星树 ≠ pin → 重新生成 pin，以 `trigger:"agent_bg"` 验证，失败按 Agent 失败路径处理（可返工）。在 `paused(*)` 中，不另设记录：继续目标不变，离开 `paused` 时由 `onAllReasonsCleared()` 的守卫发现树 ≠ pin，改为 `verify_new`；这些写入只产生 `author:"agent"` 检查点，失败按归因规则走 Agent 路径。已知误判：`bg_process_survived` 未解决期间，人在外部编辑器中的保存也会被记为 `author:"agent"`（`10` §10.3.1 已知误判 (c)）。

**放弃人工编辑且树已改变（ADR-128、ADR-134）：** `discard_human_edits` 只解除 `human`，继续目标不变（接管时已按 `takeoverFrom` 写入）；但 `takeoverFrom ∈ {running, ready}` 或 `Goal.takeoverPriorReasons`（接管时持久化的原因集合）含 `human` 时**保留** `paused(human)`——放弃改动不会自动开 Run（ADR-137/140/147/148，与 `03` §3.2.1 `human` 行一致）。树已改变时的比较基准（接管以来重建过卫星时为重建所用的树）、归因分类与记入 `external_change` 的基线只按 `06` §6.4.3 `goal.discard_human_edits`（唯一定义，ADR-180/182），本节不复述；结论是**不验证**。

**暂停解除后的验证（ADR-134、ADR-137、ADR-140、ADR-143）：** `onAllReasonsCleared()`（`03` §3.2.1 唯一定义）先执行 `pendingHandBack`（`continue_agent` → 开 Run；`reverify` → 新 pin，`verifyFrom` 按上述写入点）；否则按继续目标执行。继续目标只表示“去哪里”，不携带数据；失败的去向一律按上表的归因规则。

| 继续目标 | 守卫：当前树 = 目标 pin 的树？ | 动作 | `verifyFrom` |
|---|---|---|---|
| `verify{pin}` | 是 | 以该 pin 验证 | 不变（来自修订标准对 `review{state, pin}` 的改写时，改写的同一事务已写 `state`，ADR-180） |
| `review{state, pin}` | 是 | 回到 `state`，不验证；同一事务按上文 `label` 行、以该 pin 最近一次验证的 outcome 计算标签（覆盖哨兵改写的目标：⑦ 成立，`pass` → `verified_qualified`，`no_machine_criteria`/`exec_not_run` → `not_machine_verified`，原因取自该次验证——S0 拒绝后的重新验证命中阻断、再经覆盖进入时为 `s0_denied{by}`，ADR-189；S0 拒绝本身不改写继续目标，ADR-188）。这次验证是否算“通过”只按 `03` §3.2.1（ADR-187） | — |
| `verify` / `review` | 否 | 改为 `verify_new{returnTo}`：`returnTo` 取 `review.state`；从 `verify` 改写时取当时的 `Goal.verifyFrom`（若 ∈ {`in_review`, `accepted`}，否则为空；`03` §3.2.1） | 见下一行 |
| `verify_new{returnTo?}` | — | 以当前树生成新 pin 并验证 | 写 `returnTo ?? "claimed"` |
| `claim{decisionId}` | — | 直接进入 `claimed`（引擎须已空闲），以 `agent_bg_done` 检查点生成 pin；Trace 记“人代为提交” | 写 `claimed` |
| `settle` | — | 从宽限确认起重新执行 settle 序列（§7.4.1）；Host 不存在时（重启后）按 ADR-143：加载会话、不开 Run，引擎空闲即视为宽限满足，按 Run 令牌终止残留进程，`agent_bg_done` 检查点，I4 以持久化的工具事件判定 | 写 `claimed`（与 pin 同一事务） |
| `run` | — | 开 Run（先查预算，已达硬上限 → 保持 `paused(budget_hard_cap)`，继续目标仍为 `run`）；经准入（`06` §6.2.4）：无执行槽位或依赖未满足 → `ready{waitReason}`，`pendingOpenings` 保留，准入后开 Run（ADR-145/146；`pendingHandBack{continue_agent}` 同此）。`ready` 中允许 `pause`（→ `paused(human)`，继续目标 `run`）、`take_over`、`abandon` | — |

**开场**（ADR-140/143）：任何 Run 开始时（触发列表只在 `16` §16.1.1 `Goal.pendingOpenings` 与 `06` §6.4.3 定义，ADR-187），先按 `16` §16.1.12 为自上一次 `run.started` 以来的每条 `satellite.recovered` 组装 `tower.satellite_rebuilt`（不经队列，ADR-180），再按追加顺序消费 `Goal.pendingOpenings` 中组装进本次开场的条目（之后追加的留给下一个 Run，时序唯一定义在 `06` §6.4.3，ADR-184；元素为 `OpeningRef = {id, decisionId} | {id, factId}`，`id` 为稳定的条目 id，`02` §2.4；Goal 卡片与暂停卡片显示“下次运行开场：N 条”，人可逐条撤回——`goal.openings.withdraw`，记 `HumanDecision{withdraw_opening}`，Tower 自己产生的条目同样可撤回，撤回后 Agent 不会收到，ADR-144。消费点与撤回的唯一规则在 `06` §6.4.3（`run.started` 的同一事务；准备第 ③ 步组装开场期间撤回返回 `E_BUSY`，ADR-145/183）；撤回已消费的条目返回 `already_delivered`（界面提示“已发送，无法撤回”，不是 Needs-You），重复撤回幂等；执行 `pendingHandBack` 本身不清空它；验证、评审路径不消费）。开场为多段 `RunOpening = {tower: TowerMessage[], human?}`：`tower` 中的消息（`tower.handback`、`tower.rework`、`tower.external_resolved`……）按 `pendingOpenings` 的顺序依次以 `triggerTurn:false` 追加，最后一条以 `triggerTurn:true` 开始回合；有人写的文字时改为以 `prompt(human)` 开始。为空时为 `tower.resume`（形状与投递唯一定义在 `05`）。任何路径都不会把与 pin 不同的树送进评审，或以旧 pin 验证。`nested_repo_live` 因条目消失而自动解除时，无论是否唯一原因，一律在剩余原因中加入 `human`（`03` §3.2.1 例外，ADR-137）。

**`Tower-Human-Edit`** 的写入条件唯一定义在 `10` §10.6 seal 模板（归为人的路径非空时才写，ADR-183）；来源不明的内容不会以人的名义进入 seal。

**Verified 的唯一定义**（§7.3.3 引用此处）：`decide` 返回的 `label ∈ {verified, verified_qualified}`，且之后指纹未变、没有新的阻断命中。**`label` 的唯一写入点**（ADR-187）：进入 `in_review` 或 `accepted` 的 `goal.state_changed`——由 `decide` 给出，或经继续目标 `review{state, pin}` 进入时按上表计算；其余进入 `in_review`/`accepted` 的转移（`goal.accept`、`goal.undo_integrate`、较旧 seal 合入后 `accepted → in_review`）不重新计算，照写最近一次写入的 `label`（`goals` 不另存该列，读取方取最近一次带 `label` 的 `goal.state_changed`，ADR-188）；徽章（`12` §12.5.2）、验收闸与 seal trailer（`10` §10.6）都读它。

**验证失败的证据输入**（`verify_failed` 卡片，卡片本身见 `04`；以及下面的返工消息）：失败的标准与其 verdict、计数、失败用例名与输出尾部、阻断性哨兵，以及——项目配置排除了 LFS 对象时——本次验证的 `lfs_excluded` Fact，卡片据此提示“项目配置排除了 N 个 LFS 文件”（ADR-154）；项目有未播种的机密本地文件时，附 §7.4.1 的 Claim 提示与“改为 human 标准”（ADR-168）：被排除的文件在验证槽位中是指针，缺少它们可能是失败原因，这与用户本机检出的情形相同。该 Fact **只是提示**，不改变 `decide()` 的归因窗口与失败去向。

**返工消息模板**（`tower.rework` 自定义消息，`display:true`，以 `triggerTurn:true` 开始返工回合、不以 user 角色出现，RPC 经 `/tower-inject`，`05` §5.6.1，ADR-135；**唯一注入路径**是开场的这一次注入，`before_agent_start` 只在崩溃恢复时补发，且会话中已有同一 `details.key` 的 custom 消息时跳过，ADR-138；进入 Trace；≤ 400 token，ADR-009）：列出失败的标准（命令、verdict、计数、失败用例名、末尾 30 行；M2 的带机密标准只给失败用例名与签名哈希，§7.4.11）、阻断性哨兵（路径加规则说明）、存在 `lfs_excluded` 时的一行提示（“项目配置排除了 N 个 LFS 文件，它们在检出中是指针”）、项目有未播种的机密本地文件时的一行提示（§7.4.1，ADR-168）、本次验证有本应复制而未复制的本地文件时的一行提示（§7.4.1，ADR-172/173；来源是本次验证的 `criterion_check.env.localFiles` 中 `not_copied` 的条目），并写明该文件在用户检出中、Agent 无法恢复，以及“不得通过修改测试来使其通过”的固定一句（只在 `allowTestEdits ≠ "allow"` 时附加）。

---

## 7.11 误报预算、精度度量、人工覆盖与学习

### 7.11.1 标注来源

每条哨兵或检测器的命中（chip 或 NY）在生命周期结束时（被处置、过期或 Goal 归档）打上一个结果标签：

| 标签 | 来源 |
|---|---|
| **TP-actionable** | 人在命中出现后的 30 min 内对同一 Goal 采取实质动作，且动作锚点与命中的 subject 相交：转向评论（锚在该文件或 hunk）、拒绝审批、`request_changes`、回退到检查点、修订合同、手动编辑该 hunk；或以交还、`goal.resume`（如 `nested_repo_live` 附转向）解除该命中引起的暂停（与 `08` §8.8 的通用行一致，ADR-188） |
| **TP-informative** | `override_sentinel` 且 `reason.code` 为 `"intended_change"`（检测对了，但这次是有意为之）或 `"accept_risk"`（检测对了，人写明理由承担风险，ADR-187） |
| **FP** | `override_sentinel` 且 `reason.code = "false_positive"`；或在 chip 上点击“误报”（单击、可选） |
| **unlabeled** | 无交互：chip 级命中不进入精度分母，只统计数量；NY 级命中算 *non-actionable* |

### 7.11.2 指标

- **检测精度**（detector precision）= (TP-actionable + TP-informative) / (TP-actionable + TP-informative + FP)，衡量“检测得对不对”。
- **可行动率**（actionability）= TP-actionable / 已呈现（L≥2）的命中数，衡量“值不值得打扰”。这就是 `08` §8.8 告警精度在检测器维度上的投影。
- 每个检测器、每个项目、滚动 30 天分别计算。平滑用的 Beta 先验取自该检测器在**离线基准语料上的精度**（§7.11.5，等效样本量 10），并对同一检测器做跨项目汇总，因此不必等某个项目自己积累 n ≥ 20；单项目 n < 20 时显示“基于基准 + 全局数据”。

### 7.11.3 误报预算与自动调节

**里程碑**（ADR-187）：下表的自动降级从 M2 起（`08` §8.9.2；M1 只计算精度并在周报中展示）；两类豁免提议随 §7.11.4 的 `propose_project_rule` 属 M3。

| 情况 | 动作 | 护栏 |
|---|---|---|
| 检测精度 < 目标 − 0.15，且 n ≥ 20 | 对该检测器在该项目**降一级路由**（NY → chip），并在周报（`08` §8.9）里说明 | **severity 3 永不自动降级或抑制**；每周对同一检测器至多调节一次；任何调节都可以一键撤销 |
| 可行动率 < 0.3，但检测精度 ≥ 目标 | 不降级，转而生成“豁免规则”提议（§7.11.4） | 同上 |
| 同一 subject 被 `intended_change` 覆盖 ≥ 3 次 | 生成项目级豁免提议 | 必须由人批准 |

### 7.11.4 `override_sentinel` 与学习

```ts
// HumanDecision{kind:"override_sentinel", target:{itemId, factId}, reason:{code, detail}}（02 §2.7）
// reason.code: "false_positive" | "intended_change" | "accept_risk"；下列附加字段放在 reason.detail 的结构化 JSON 中
interface OverrideDetail {
  scope: "this_hit" | "this_goal" | "propose_project_rule";
  pattern?: { detector: string; pathGlob?: string; subjectRegex?: string };   // propose_project_rule 时
  freeText?: string;
}
```

- `this_hit`：只处置这一次。`this_goal`：本 Goal 中同一 `(detector, subject)` 不再呈现，但 Fact 仍然写入。
- `propose_project_rule`（**M3**，随 `09` §9.6 学习闭环提供；M1 的覆盖只有 `this_hit` 与 `this_goal`，ADR-186）：生成 `09` §9.6 学习闭环中的一条“检测器豁免”提议，例如“`apps/web/**/__snapshots__/**` 的快照更新在本项目降为 chip”，**需要另行批准**。豁免规则存在 VerifyProfile 的 `sentinelExceptions[]` 中，有版本，带 90 天复审期。
- **severity 3 不能生成项目级豁免**，只能逐次覆盖，并且必须填写 `freeText`。

---

### 7.11.5 哨兵基准语料与上线门槛（R1-D7-07）

精度目标（§7.10.1）在上线前就要有测量，而不是等线上数据。

| 项 | 内容 |
|---|---|
| **语料来源** | ① ImpossibleBench 的作弊轨迹 diff（改测试，正例为主）；② SWE-bench Verified 的金标补丁与公开 Agent 补丁（合法的测试新增/修改，负例为主）；③ 内部试用 Goal 的 diff；④ 合成变异：在真实测试文件中注入 skip/only、断言弱化改写、快照更新、脚本重定义（测召回）；⑤ 四个生态（JS/TS、Python、Go、Rust）各约 50 个真实开源重构提交，作为误报探针（例如把用例改写成 `.each`、拆分测试文件、改名） |
| **规模** | 首版 ≥ 300 个 diff，每个具备阻断能力（severity 3）的检测器至少 30 个命中 |
| **标注** | 每个命中标注 TP/FP 与“是否应阻断”；两名标注者独立标注，报告 Cohen's κ，分歧由第三人裁定 |
| **上线门槛** | 某检测器按表中严重度上线的条件：离线精度 ≥ 目标，且 Wilson 95% 下界 ≥ 目标 − 0.1。未达门槛的检测器**降一级严重度上线且不阻断**，直到下一版语料通过 |
| **回归** | 语料与标注随代码版本化（`tower/sentinel-bench`）；任何规则改动都在 CI 中重跑，某检测器精度下降 > 0.05 即 CI 失败 |
| **与线上的关系** | 离线精度作为线上 Beta 平滑的先验（§7.11.2）；线上精度与离线精度相差 > 0.2 时，在周报中标出“分布漂移”并把样本加入下一版语料 |

---

## 7.12 独立评审（实验特性，默认关闭）

- **定位：** 不同模型（默认选择与执行模型**不同提供商**的模型）按合同审阅 diff，输出**仅为 Claim**，不设置任何状态（ADR-002）。职责是“定向评审”，不是“判定成功”（*TB* D#22）。
- **默认：所有风险等级都关闭**（ADR-019，R1-D15-04），由用户在合同或项目设置中开启，经 `14` 实验 E1 变体评估。开启后，在验证通过之后、进入 `in_review` 之前**并行**启动，不阻塞 `in_review`（评审意见晚到时，以 L1 方式追加到评审单元上）。
- **运行方式：** 一个独立 Run，`reason: "review"`（`02` §2.6）。Pi 只读工具 `read`（`grep`/`find`/`ls` 在 Tower 中不提供，ADR-220；输入已附评审单元的 hunk），不注入 `submit`，改为注入 `review_report` 工具。不使用 `--no-context-files`，让评审模型读取与执行 Agent 相同的 AGENTS.md，以便判断改动是否违反仓库约定。成本上限默认为执行成本的 15% 或 $1，取较小者。
- **输入：** 合同（意图、约束、标准、范围）、评审单元列表（每个单元附 hunk）、Fact 摘要（标准结果、哨兵命中、测试清单对比）。**不提供**执行 Agent 的自述与理由，以免被锚定。
- **问题清单（固定提示）：** ① 有没有违反合同 `constraints` 的改动？② 有没有与意图无关的改动？③ 测试是否真的覆盖了 `endState`（指出未被任何测试触及的新分支）？④ 测试修改是否削弱了检验？⑤ 列出最值得人看的 3 个位置（file:line）。
- **输出：** `Claim{kind:"review_note", author:"reviewer"}`（`02` §2.7；视觉上与执行 Agent 的说法区分） 锚定到评审单元或 hunk，`evidenceRefs` 必须是 `fileLine`，并照常经过交叉校验（X5 等）。这些 Claim 会作为额外的 `risk.reasons` 影响评审单元的**排序**，以“评审模型认为…”的 Claim 语法显示，**不改变** `risk.score` 的规则部分。
- **校准：** 评审模型自己的“发现被人采纳率”和“被事实推翻率”同样进入记分板（`09` §9.8），显示在它的 Claim 旁边。

---

## 7.13 VerifyProfile（权威类型）与默认值

`VerifyProfile` 的**唯一类型定义**在此（R1-D15-10）；`02` §2.3、`09` §9.7、`10`、`11` 只引用。默认数值的单一来源是 `16-registry.md`（ADR-039），下表与之保持一致。

```ts
interface VerifyProfile {
  version: number;                         // 任何字段变化 +1；是 criterion_check 变为 expired 的条件之一（§7.3.3）
  runners: { name: "vitest" | "jest" | "node-test" | "pytest" | "go" | "cargo-nextest" | "cargo-test" | string;
             detectedFrom: string[];       // 识别依据（配置文件、脚本）
             reporterInjection: boolean;   // §7.4.5
             listCommand?: string;         // 测试清单（§7.5.4）
             rerunTemplate?: string }[];   // 只重跑指定用例（§7.4.6），如 "vitest run -t {names}"
  commands: { test?: string[]; build?: string[]; lint?: string[]; typecheck?: string[] };
                                           // 11 §11.3.2 据此判定 exec.test / exec.build；快速路径合同的默认标准来源
  prepare?: string[];                      // 在槽位中针对 pin 执行：物化与项目自身生命周期脚本之后、标准之前（ADR-062）；10 §10.4.2 在 Goal 卫星中同样使用
  exposeGit?: boolean;                     // 测试需要 .git 时，在槽位内生成一次性克隆（§7.4.2），默认 false
  packageManager?: string;                 // 🧑 确认的 "pnpm@x.y.z" / "npm@x.y.z"；仅在仓库无 packageManager 字段时使用（§7.4.3）
  node: string;                            // 🧑 确认的 Node 确切版本（§7.4.3 运行时选择顺序，ADR-085）
  prepareTimeoutSec: number;               // 生命周期脚本 + prepare 的总超时，默认 600（§7.4.3）
  generatedPaths: string[];                // 生命周期/prepare 允许改动的 node_modules 内生成路径（默认含 .prisma、.cache、.vite）
  prefetch: { url: string; sha256: string; target: string; decisionId: DecisionId }[];   // 🧑 ADR-093：项目自定义下载，在预取步骤执行
  runnerExceptions: { package: string; via: "alias" | "patch" | "override" | "source"; baseCommit: Sha; decisionId: DecisionId }[];
                                           // 🧑 base 中已有的运行器别名/补丁/覆盖，确认一次后不再逐 Goal 报 runner_patched（ADR-105）
  setup?: string[];                        // ADR-037：服务启动之前
  services?: { name: string; start: string;
               health: { command?: string; url?: string; timeoutSec: number };
               stop?: string; docker?: boolean /* 需人批准，§7.4.4 */ }[];
  teardown?: string[];                     // ADR-037：标准之后（无论成败）
  ports: "env" | "fixed";                  // ADR-037/055：添加项目时由端口能力试运行确定；fixed → 该项目服务并发度为 1
  integration?: { command: string; timeoutSec: number }[];   // 10 §10.11 Q5 集成交叉检验（合并队列，M2）
  env: { vars: Record<string, string>;     // 非机密——编辑时经过机密检查，命中则在 M1 中拒绝保存（“项目变量会进入 Agent 与验证器的环境，M1 中不能放机密”，ADR-166）；支持模板 ${port:N}、${portBase}（ADR-055）；M1 中验证器不注入任何机密（ADR-164）；M2 见 §7.4.11
         network: string[];                // 执行阶段允许的主机，默认 ["localhost"]
         tz?: string; memLimitMb?: number };
  fingerprint: { bigFileBytes: number };   // advisory 模式排除的大文件阈值（§7.3.2）
  irrelevantGlobs: string[];               // 🧑 无关路径携带（§7.4.8），默认 []
  testPathOverrides: { add: string[]; remove: string[] };    // TestPathSet 调整（§7.5.1）
  sentinelExceptions: { detector: string; pathGlob?: string; subjectRegex?: string;
                        decisionId: DecisionId; reviewAt: Iso }[];   // §7.11.4
  flakeQuarantine: { testId: string; since: Iso; decisionId: DecisionId; reviewAt: Iso }[];   // §7.4.6
  pool: { size: number };                  // 本项目的验证槽位数
  rerunFailed: number;                     // §7.4.6
  learned: { commandStats: { normalized: string; class: CommandClass; p50Sec: number; p95Sec: number;
                             expensive: boolean; samples: number; lastSeen: Iso }[] };
                                           // 09 §9.7 的统计，只用于排序与超时建议，不影响判定
}
```

| 键 | 默认 |
|---|---|
| `pool.size` | 2 / Project；全局槽位 `min(max(1, floor(cores/4)), 内存可容纳数)`（§7.4.10，ADR-042） |
| `rerunFailed` | 2；base 确认 5 次（§7.4.6） |
| `env.network` | `["localhost"]` |
| `prepareTimeoutSec` | 600 s |
| `prefetch` | `[]`（人批准的自定义下载：URL + 校验和 + 目标路径，ADR-093） |
| 验证内存 | 准入预留 `max(1 GB, 1.3 × p95 峰值)`（首次 2 GB）；杀进程上限 `env.memLimitMb ?? max(2 GB, 2 × 预留)`（ADR-042） |
| `irrelevantGlobs` | `[]` |
| `fingerprint.bigFileBytes` | 50 MB |
| `ports` | `"env"`；端口段 20 个，范围 20000–29999，分配前 bind 探测（ADR-055） |
| 机会式验证 | 开；指纹稳定 120 s、间隔 10 min；只在正式队列为空时；每 Goal 每小时 ≤ 6 次、≤ 50 核分钟（`16` §16.2.3，§7.4.10） |
| `loop.sameFailure` | nudge 3 / escalate 5 |
| `loop.noProgress` | 8 回合 且 10 min（宽限 10 回合 / 5 min） |
| `loop.silentTool` | 20 min；bash 默认 timeout 1800 s |
| `burn.gap` | 0.4 |
| 措辞线索检测器 | **关**；开启时阈值 0.7 |
| 独立评审 | **关**（所有风险等级） |
| `flake.quarantineReview` | 30 d |

---

## 7.14 阈值来源审计（R1-D3-05）

证据等级：⚪ 一手来源 · 🟡 二手 · 🔴 轶事/跨领域 · ⚫ 设计假设（无外部来源，待实验回填）。

| 数值 | 用途 | 来源 | 等级 | 回填它的实验 |
|---|---|---|---|---|
| 测试完整性哨兵默认开、R-T* 规则集 | §7.5 | ImpossibleBench：Claude 作弊 > 79% 靠改测试，只读测试有效 | ⚪ | E1 + 哨兵基准（§7.11.5） |
| 不用 LLM 裁判判定成败 | §7.0 | Advani 2026：LLM 裁判 AUROC ≤ 0.65（客服/AppWorld 领域） | 🔴（领域不同，只用于论证方向） | E1 变体 |
| 措辞检测器权重、阈值 0.7 | §7.9 | Advani 2026 TF-IDF 0.83–0.95（同分布、非编码） | 🔴 | E1 附属离线评估；默认关 |
| X2 规则的动机（“37% 完成声明后仍有编辑”） | §7.8 | dev.to 实践者审计 | 🔴 轶事，只用来说明规则存在的理由，不设任何阈值 | E1（统计 submit 后编辑的比例） |
| 精度目标 0.5–0.99 | §7.10.1 | 无 | ⚫ | 哨兵基准离线精度；线上 E1 |
| 自动调节：目标 − 0.15、每周 1 次 | §7.11.3 | 无 | ⚫ | E3 |
| 机会式验证 120 s / 10 min | §7.2.4 | ADR-020 | ⚫ | E4（运行中 Q3 可答性）+ `13` 负载测量 |
| 验证槽位 `min(floor(cores/4), 内存可容纳数)`、预留 1.3 × p95 峰值、M1 延迟预算 10/20 min（仅参考项目） | §7.4.10 | ADR-042；排队模型 | ⚫ | `13` 验证延迟测量、SP4、E3 |
| 机会式验证每 Goal 20–25 min 一次、≤ 50 核分钟/小时 | §7.4.10 | ADR-042 演算 | ⚫ | E4、E12 |
| 超时/超限重跑 1 次、base 历史 > 限制 80% 判为环境 | §7.4.5 | ADR-054 | ⚫ | 哨兵基准 + 内部试用 |
| flake：pin 上重跑 2 次、base 确认 5 次、> 10 个即判失败 | §7.4.6 | 无（误判方向保守，见 §7.4.6 演算） | ⚫ | 哨兵基准 + 内部试用的 flake 台账 |
| 静默超时 `max(120 s, timeout/4)` | §7.4.4 | 无 | ⚫ | `13` |
| 端口段 20 个、范围 20000–29999 | §7.4.4 | ADR-055（避开临时端口范围） | ⚫ | 添加项目时的端口能力试运行；M0 端口冲突测试 |
| 循环 S1 3/5 次；S3 8 回合 + 10 min；S4 60k token / 3× 中位数；S5 20 min；S7 3 次/10 min | §7.7.1 | 无（S7 与 `11` §11.1 一致） | ⚫ | E1 日志回放：对已标注的“卡住”片段测精度与检出延迟 |
| 燃烧 0.5 / 0.4 / 3× 速率 | §7.7.2 | SRE“饱和”思路（*TB* C4），数值无来源 | ⚫ | E3 |
| 通用密钥熵 ≥ 3.5 bit/char | §7.6.6 | gitleaks 等工具的常见取值 | 🟡 | 哨兵基准 |
| 大文件 50 MB；decisive 无变化 ≤ 150 ms（2 万文件）；full 按规模实测登记 | §7.3.2 | ADR-075（实测 100–150 ms；full 2.6–7.2 s / 2 万文件） | 🟡 本机实测 | SP5 |
| 快照/返工消息 30 行、日志 50 MB 截断 | §7.10.3、§7.4.4 | 无 | ⚫ | ADR-009 token 预算测量（C15） |
