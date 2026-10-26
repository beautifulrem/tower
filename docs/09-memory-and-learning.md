# 09 · 记忆与学习（Memory & Learning）

> 本文定义：Tower 记住什么、记在哪里、谁批准、如何在不污染模型上下文的前提下注入、如何让记忆在机器之间迁移；以及如何从人的转向、返工、放弃和覆盖中沉淀出规则、记忆、技能、合同模板和验证档案（R9 学习闭环）；如何度量并展示模型的“历史表现”（校准记分板）；以及可选的反技能萎缩机制与隐私。
>
> 依据：`00` P5、R1、R9、R10、§0.5（上下文透明）；`02` §2.10 MemoryItem；`03` §3.4.7（放弃原因）；ADR-009（模型面预算）、ADR-011（记忆按作用域、需批准）、ADR-013（团队预留）、ADR-028（Project 身份）、ADR-030（删除 ETA）、ADR-032（token 估算口径）、ADR-035（仓库约定优先）；`11` §11.5（自适应自主度）、§11.8（记忆污染标记 `taint`）。研究依据：`research/theory-brainstorm.md`（*TB*）A1（Sheridan 的 Learn）、A2（Bainbridge）、A13（Lee & See）、C17、D#20/26/27/28/31；`research/landscape.md`（*LS*）B.11 与 §D.4；`research/pi.md` §9（Pi 没有记忆子系统）。

---

## 9.0 设计立场

1. **Pi 没有记忆**（*pi.md* §9）：持久知识只存在于 AGENTS.md、技能、会话内 `custom` 条目和压缩摘要中，全部绑定路径或会话。Tower 必须自己拥有记忆层。
2. **市面上的记忆都是机器本地、按路径或仓库键控的**：Claude Code 的 auto memory 位于 `~/.claude/projects/<project>/memory/`，官方说明“machine-local… not shared across machines”；Codex 的 memories 位于 `~/.codex/memories/`，每台机器一份（*LS* Thesis 3、B.11）。Steve Yegge 的 **Beads** 把记忆做成**工作项**（issue 图），因为 Agent “会失忆”（*LS* B.11）。*LS* 的结论是：“work-item memory 是没有人以本地优先方式拥有的一层。” Tower 的定位是：**以仓库身份（而非路径）和 Goal（工作项）为键、可迁移、可审计、由人批准**的记忆（`01` §1.3、§1.4 第 8 条）。
3. **记忆是会被注入给模型的指令，因此属于攻击面。** Agent 只能提议，人批准后才生效（ADR-011）；提议默认带污染标记，只有完全来自人类原话与 Harness 事实的提议才不带（§9.2.1，`11` §11.8）；每次注入在 Trace 中原样可见（`00` §0.5）。
4. **学习闭环的输出永远是“提议”。** 人的转向和返工是最宝贵的训练信号（*TB* A1“The Work Behind Delegation”的 *Update Assets* 阶段），但从信号到规则的归纳由机器完成，可能出错，所以必须经过人的批准。
5. **数字要诚实。** 校准记分板展示的是 Harness 统计出的历史（Fact），它出现在 Claim 旁边，但永远不改变 Claim 的状态（R1）。样本不足时就明说样本不足。

### 9.0.1 M1 范围（ADR-059）

| 能力 | M1 | 推迟到 |
|---|---|---|
| 人手写的 User / Project 记忆；注入（≤ 120 token 系统段 + `contract.md`，§9.5）；编辑、退役、过期复审（§9.4：M1 在记忆管理器中标出“待复审”并可筛选；每月复审批次随站会摘要投递，属 M2，ADR-182）；与 AGENTS.md 的关系（§9.11；其中“导出到 AGENTS.md”在 M2）；清除（§9.12.4） | ✓ | — |
| 导出 Markdown（§9.12.2）（ADR-059 的 M1 范围未列出，`14` §14.3.2；与同步一起在 M2，`04` §4.2.4 同，ADR-180）；“导出到 AGENTS.md”（§9.11，同样未列出，其推荐路径依赖的 `kind: docs` Goal 也不在 M1，ADR-205） | — | M2 |
| Goal 作用域记忆（由批准的 assumption/decision 转入） | — | M2 |
| Agent 提议（`log{kind:"memory"}`）、污染判定（§9.2.1）、批准队列（§9.3） | — | M2 |
| 学习闭环挖掘（§9.6，L1–L9；M1 起只随决定记录信号） | — | M3（`14` §14.4.2，ADR-185） |
| 验证档案学习（§9.7，除 ADR-043 的 Node runner 识别外） | — | M2–M3 |
| 校准记分板（§9.8）：M1 只记录数据，展示（记分板页与决策卡上的校准记录）从 M3 起（`14` §14.4.2，ADR-180） | 记录 | M3 |
| 自适应自主度建议（§9.9） | — | M3（ADR-019） |
| 同步目录（§9.12.3） | — | M2–M3 |
| 反技能萎缩（§9.10） | — | opt-in，M2+ |

M1 中的记忆都由人直接写入，因此不存在污染与批准问题；§9.2.1 与 §9.3 的规则从 M2 起生效。

---

## 9.1 作用域

| 作用域 | 键 | 典型内容 | 谁能提议 | 生命周期 |
|---|---|---|---|---|
| `user` | 本机用户（v1） | 个人偏好、语言、提交信息风格、“不要自动加 emoji” | 🧑 直接写入；🤖/学习闭环提议（需跨 ≥ 2 个项目观测到） | 默认 180 天复审 |
| `project` | `ProjectId = hash(canonicalRoot)`（ADR-028：首次绑定时字典序最小的根提交，**之后固定**——仓库后来新增的根（`--allow-unrelated-histories`、`subtree add`）只作为 `rootAliases` 记录，不改变身份，ADR-058；远端 URL 只是别名），**与路径和机器无关**。绑定一个检出时，若已存在相同 `canonicalRoot` 的 Project，但该检出的根集合或远端集合与记录不一致（例如 monorepo 与其成员仓库），不自动并入，而是请人确认“同一项目 / 新项目”（ADR-080；根集合按该检出全部 ref 计算，ADR-087）；选择“新项目”时身份为 `hash(canonicalRoot, disambiguator)`；Tower 自己的卫星与检验检出永不登记为检出（R4-D12-03，`02` §2.3） | 约定、架构要点、陷阱、命令、“支付相关一律用幂等键” | 🧑；🤖 提议；学习闭环提议 | 默认 120 天复审 |
| `goal` | `GoalId` | 本 Goal 的决策、被否决的方案、澄清后的事实（例如“时间戳按本地时区”） | 🧑；🤖 提议（主要来源是被批准的 assumption/decision） | 随 Goal 存续；Goal 归档后冻结；复活时作为新 Goal 的起草输入 |
| `team` | （预留）`teamId` | — | — | ADR-013：v1 不实现，`02` §2.10 的 scope 联合类型已预留 |

- **fork 合并**：`02` §2.3 允许用户把 fork 与上游合并为同一记忆作用域。实现方式是让该 Project 记录 `memoryScopeAlias: ProjectId`，注入时把两者的项目记忆一起取出。
- **多仓库 Goal**：注入时取所有 binding 的项目记忆，按 §9.5 的预算统一竞争。
- **Scratch**：默认不读、不写记忆（ADR-012）。用户可以在单个 Scratch 中开启“读取记忆”，但写入永远关闭。

---

## 9.2 条目格式与来源

`02` §2.10 的 `MemoryItem` 已包含 `kind` 与 `team` 作用域，并声明其余字段以本节为规范扩展。完整格式如下，新增字段都写明了写入者：

```ts
interface MemoryItemV2 extends MemoryItem {
  // —— 02 §2.10 已有：id, scope(含预留 team), kind, text, tags, status, author, provenance,
  //    ratifiedBy/At, reviewAfter, useCount, lastInjectedAt。以下为规范扩展字段
  // text 的长度上限：estTokens(text) ≤ 80（ADR-032 口径 ceil(ascii/4 + nonAscii/1.5)，约 120 个汉字或 320 个英文字符）
  detail?: string;              // 🧑 可选的补充说明，≤ 600 字符；只进入 contract.md 的按需部分，从不常驻
  subjectKey?: string;          // 🧑 归一化主题，如 "pkg-manager"、"test.runner"、"tz"、"style.quotes"；用于冲突检测
  appliesTo?: {                 // 🧑 用于相关性选择
    paths?: string[];           //   glob，如 "src/checkout/**"
    goalKinds?: Goal["kind"][];
    ecosystems?: ("js" | "ts" | "python" | "go" | "rust" | string)[];
  };
  version: number;              // ⚙️ 编辑即升版本；历史版本只读保留
  supersedes?: string; supersededBy?: string;   // ⚙️ 同作用域内替代关系
  pinned?: boolean;             // 🧑 必选注入（每个作用域至多 5 条）
  origin: "human_written" | "agent_proposed" | "mined_steering" | "mined_rework" | "mined_question"
        | "mined_assumption" | "mined_override" | "mined_inline_edit" | "promoted_from_goal" | "sync_import" | "copied_from_project";
  support: { count: number; goalIds: GoalId[] };                 // ⚙️ 提议得到多少次独立观测支持
  contested: { count: number; lastAt?: Iso; evidence: EvidenceRef[] };   // ⚙️ 被人的转向或决定反驳的次数
  taint: { level: "none" | "standard" | "high"; classes: TaintClass[]; sources: EvidenceRef[] };   // ⚙️ §9.2.1；默认带污染
  retiredReason?: "obsolete" | "wrong" | "superseded" | "goal_undone" | "exported" | "privacy";
  sensitivity: "normal" | "private";   // 🧑 private：不导出、不同步、不进入学习起草器的提示
  sync?: { vv: Record<string /*machineId*/, number>; baseText?: string; updatedAt: Iso; hmac?: string };   // ⚙️ §9.12.3
}
```

**来源（provenance）规则：**

- 每条记忆必须至少有一个 `evidence`，可以是：转向评论 id、`HumanDecision`、被批准的 Claim、`verify_failed` 的 Fact、或人直接写入（evidence 为“手写于 <时间>”）。
- 记忆详情页显示“为什么有这条”：来源 Goal、原始的人类原话（引用原文，不经改写）、支持次数，以及提议它的挖掘规则（§9.6）。
- **来源可见：** 批准界面始终显示提议所依据的原始材料（人类原话引用或 Agent 读过的内容摘要），并按 §9.2.1 标出污染等级。

---

### 9.2.1 污染（taint）：默认带污染，反向白名单（R1-D12-01）

初版只列举了少数“不可信来源”，漏掉了 worktree 内的依赖代码、测试夹具、他人在 base 上的提交、测试输出、注册表 GET、用户扩展工具的结果。这些都是记忆投毒的主要入口。改为：**每条提议默认带污染**，只有完全来自白名单来源的提议才是 `level:"none"`。

**白名单（仅这些来源不产生污染）：**

1. **人自己输入的自由文本**：转向评论正文、对问题的自由文本回答、拒绝理由、人直接写入的记忆（§9.6 的 L1、L2、L4 挖掘源）。
   **不包括**人点选的选项：选项标签、选项后果说明、问题文本都是 Agent 起草的，一律继承**提出该问题的 Run** 的污染类别（R2-D12-01）。人点选选项 A 时，挖掘器只记录“人选择了 Agent 提出的 A”，这条证据的污染与该 Run 相同；只有人在选项之外另行输入的文字才属于白名单。
2. Harness 产生的 Fact（退出码、失败签名、文件路径、计数），以及 Tower 注入的合同与简报文本。

**污染类别（任何一项出现即带污染）：**

```ts
type TaintClass =
  | "repo_content"        // Agent 读过的仓库跟踪文件（包括他人在 base 上的提交、README、注释）
  | "tool_output"         // 任何命令输出：测试输出、安装输出、构建日志
  | "fixtures"            // 测试夹具、testdata、快照、样例数据
  | "dependency_code"     // node_modules、vendor/、third_party/、.venv、site-packages 等依赖代码
  | "registry_fetch"      // net.registry 类请求的响应（含从代码托管抓取的原始内容）
  | "web" | "mcp"         // 网页/URL 工具、MCP 工具结果（ADR-032：MCP 一律视为不可信）
  | "extension_tool"      // 用户扩展注册的工具的结果
  | "pasted_context"      // 合同 context 中粘贴的 issue/PR 等外部文本
  | "outside_worktree";   // worktree 之外的文件
```

- **判定方式：** Agent 通过 `log{kind:"memory"}` 提出的提议，其污染类别 = 该 Run 在提议之前进入上下文的全部内容的类别并集（由观察器按工具调用与路径归类）。实际上 Agent 提议**总是**带污染（至少有 `repo_content`）。挖掘产生的提议（§9.6），如果聚类中的证据全部来自白名单，就是 `none`；如果起草器的输入包含 Agent 文本，则为 `standard`。
- **等级：** 含 `web`、`mcp`、`extension_tool`、`registry_fetch`、`outside_worktree`、`pasted_context`、`dependency_code`、`fixtures` 任一项 → `high`；其余（只有 `repo_content` / `tool_output`）→ `standard`。
- **批准要求：** `none` 可以一键批准，也可以批量批准；`standard` 必须逐条确认（查看来源后点击）；`high` 必须编辑文本，或逐字输入确认短语，并以 `12` 的异常样式（danger 字形 + “来源不可信”）显示来源。
- **威胁评级：** 记忆投毒的残余风险因此不再是“低”。人的批准是唯一屏障，而批准疲劳是已知问题（ADR-010），评为**中**（`11` T22 已同步）。

## 9.3 批准队列（Ratification Queue）

### 9.3.1 入口

| 来源 | 途径 |
|---|---|
| Agent 提议 | 运行期间只有三个工具可用（ADR-009），提议通过 `log{kind:"memory", text, scopeHint, evidenceRefs}` 提交。tower-goal 把它记为 `Claim{kind:"memory"}`（`02` §2.7）并生成 `MemoryProposal` |
| 被批准的 assumption/decision | 人在批准队列中批准 assumption/decision 时，可勾选“记住这一点”（默认作用域 goal） |
| 学习闭环挖掘 | §9.6 |
| Goal 验收时的提升 | Goal 记忆中被起草器标记为“具有一般性”的条目（每个 Goal 至多 3 条）提议提升为 project 作用域 |
| 同步导入 | §9.12.3（没有有效签名的外部修改） |

### 9.3.2 呈现与动作

- 待批准的提议在 Needs-You 中**每天、每个作用域聚合为一条** `ratify`（severity 1，进入“稍后”分区，不计入角标，`08` §8.4），同时出现在记忆管理器的“待批准”标签页。
- 每条提议显示：草拟文本（Claim 语法）、建议作用域、`kind`/`subjectKey`/`appliesTo`、证据链接、支持次数、污染等级与类别（§9.2.1），以及与现有条目的**冲突和重复**（§9.4.3）。
- 动作：**批准** / **编辑后批准** / **改作用域** / **合并进已有条目**（`support.count++`，可以选择更新文本，从而产生新版本）/ **拒绝**（可选填原因，作为反例写入挖掘器的抑制表，30 天内不再就同一聚类提议）/ **稍后**。
- **批量批准（R1-D12-04）：** `04` 的多选批量批准只对同时满足以下条件的提议生效：`taint.level = "none"`、无“可疑指令”标记、无冲突或重复提示、未命中密钥扫描。其余提议在多选时自动排除，并提示“N 条需要逐条处理”。
- 批准产生 `HumanDecision{kind:"ratify_memory"}`；拒绝为 `reject_memory`；编辑、退役、同步冲突分别为 `edit_memory`、`retire_memory`、`resolve_sync_conflict`（`02` §2.7）。拒绝时的原因写入 `reason{code, detail}`。

### 9.3.3 限制

| 规则 | 值 |
|---|---|
| Agent 提议上限 | 每个 Run 5 条，超过的直接丢弃并在 Trace 中标注 |
| 学习闭环提议上限 | 每个项目每天 5 条进入队列（按 `support.count` 和预期收益排序），其余留在“更多建议”列表 |
| 过期 | 提议 14 天未处理 → 状态 `expired`（记录事件，不打扰） |
| 去重 | 归一化文本的三元组 Jaccard ≥ 0.6，或 `subjectKey` 相同且 Jaccard ≥ 0.4 → 视为重复，合并为一次支持 |
| 密钥 | 提议文本经过 `07` §7.6.6 的密钥扫描，命中则**自动拒绝**并告知原因（`privacy`） |
| 可疑指令 | 文本匹配 `ignore (previous|above)`、`always run .*curl|wget`、`disable (tests|checks|sandbox)`、`do not (tell|ask) the user` 等模式 → 标“可疑指令”，不能一键批准 |

---

## 9.4 生命周期：编辑、退役、过期、冲突

### 9.4.1 编辑与退役

- **编辑会产生新版本。** `id` 不变，`version++`，旧版本只读保留，供审计和回放（例如“G-0142 的第 3 个 Run 当时注入的是 v2”）。
- **退役**：`status = "retired"`，并填写 `retiredReason`。退役条目永不注入，可以恢复（经 `memory.edit` 把 `status` 改回 `active`、清除 `retiredReason`，`06` §6.4.3，ADR-207）。
- **撤销 Goal 时回滚记忆**（*TB* C14）：一个 Goal 被撤销（revert）或复活为“回归修复”时，`provenance.goalId` 指向它的条目会被提议退役（`goal_undone`），需要批准。
- 记忆管理器提供按作用域、`kind`、标签、路径的筛选；按“注入次数”和“被反驳次数”排序；批量退役。

### 9.4.2 过期与复审

以下条件会把条目标为“待复审”，不会单独打扰：M1 在记忆管理器中标出并可按“待复审”筛选；M2 起另以**每月一次的“记忆复审”批次**投递（作为站会摘要中的一行，`08` §8.11；站会摘要属 M2，`16` §16.2.4，ADR-182）：

| 条件 | 判定 |
|---|---|
| 到期 | `now > reviewAfter` |
| 久未使用 | 90 天内没有被注入过 |
| 路径失效 | `appliesTo.paths` 中的 glob 在项目默认 base 上全部不再匹配任何文件（通过 `git ls-tree -r --name-only <base>` 检查，结果按 base tree 缓存） |
| 被反驳 | 30 天内 `contested.count ≥ 2`：注入了这条记忆的 Run 中，人的转向内容与它的 `subjectKey` 相同但方向相反 |
| 影子化 | 被更具体的作用域长期遮蔽（§9.4.3）超过 90 天 |

复审动作：保留（`reviewAfter` 顺延一个周期，经 `memory.edit` 只改这一项）、编辑、退役（ADR-207）。

### 9.4.3 冲突解决

**检测：**

1. 相同 `subjectKey`、不同文本 → 冲突候选。
2. 启发式：两条文本共享一个名词令牌（去停用词后），且一条含肯定指令（`use|prefer|always|必须|用`）、另一条含否定指令（`never|don't|avoid|不要|禁止`）。
3. 与 AGENTS.md/CLAUDE.md 的冲突：同样使用规则 2，比较对象是这些文件的各行（§9.11）。

**优先级（ADR-035：仓库约定优先）：**

```
合同（constraints / scope / criteria，本 Goal 的人类决定）
  > 仓库中提交的 AGENTS.md / CLAUDE.md（团队约定，由 Pi 自行加载）
  > Goal 记忆
  > Project 记忆
  > User 记忆 ≈ ~/.pi/agent/AGENTS.md（同级：冲突时提示用户二选一）
```

个人记忆不能静默覆盖团队提交进仓库的约定（R1-D12-02）。检测到记忆与仓库约定冲突（规则 2 命中，或批准时人工标注）时，批准队列提示三个选项：

- **保留约定**：拒绝或收窄这条记忆；
- **本 Goal 例外**：记忆只对指定 Goal 生效并压过约定，记为 `HumanDecision{kind:"ratify_memory", reason:{code:"goal_exception"}}`，注入时写明“本 Goal 例外”；
- **提议修改仓库约定**：生成 AGENTS.md 修改建议（§9.11 的导出流程），在仓库约定被修改并合入之前，记忆保持“被约定遮蔽”。

以上三个选项属于批准队列（M2，§9.0.1）。**M1 中**只有人手写的记忆：人保存一条记忆时按同一规则检测，命中时编辑器列出冲突的约定行，并写明“仓库约定优先”（上方优先级）；人可以修改、收窄（加 `appliesTo.paths`）或照常保存。照常保存的记忆按上方优先级注入，不压过约定；“本 Goal 例外”与“提议修改仓库约定”在 M1 中不提供（ADR-206）。

- **同一作用域内**，同一 `subjectKey` 不能有两条 active 条目。批准新条目时必须选择：替代旧条目（`supersedes`）、把其中一条收窄（加 `appliesTo.paths`），或者拒绝新条目。
- **跨作用域**，两条可以同时 active。注入时每个 `subjectKey` 只注入获胜的那一条，被遮蔽的条目记为 `omitted: shadowed_by <id>`（§9.5.4），记忆管理器会显示这种遮蔽关系。
- **记忆与合同冲突**：合同永远胜出。合同编辑器中显示“生效记忆”列表；如果某条记忆与合同的 constraint 命中规则 2，就在合同编辑器中提示，由人决定是修订合同还是让这条记忆暂不适用于本 Goal（`goalOverrides: {memoryId: "suppress"}`，**M2**；M1 中只能修订合同、编辑或退役这条记忆，ADR-207）。
- 注入文本中写明“仓库约定与合同优先于这些笔记”（§9.5.3），不再告诉模型“冲突时听记忆的”。

---

## 9.5 注入算法

### 9.5.1 预算

按 ADR-009（修订）：

| 部分 | 预算 | 位置 |
|---|---|---|
| **常驻记忆** | **≤ 120 token** | `tower_goal` 系统段的 `Notes:` 行（`05` §5.6.3 的简报模板）。系统段 ≤ 300 = 意图与终态 ≤ 70 + 验收标准标题 ≤ 110 + 记忆 ≤ 120（ADR-009） |
| 按需记忆 | 不占常驻预算 | Goal 数据目录中 `contract.md` 的 `## Memory` 小节：放不进 120 的必选条目（置顶与 Goal 作用域，排在最前、全部写入、不计入 20 条，ADR-185），以及本次选中但放不进 120 的其余条目（按得分排序，至多 20 条）、优先级说明和条目 id。简报末行 `More: read <path>` 指向它，由模型按需 `read`（`05` §5.6.3） |
| 交接包、返工证据 | 事件性注入，分别 ≤ 300 / ≤ 400 | 与记忆无关，见 ADR-009 |

Token 估算：`ceil(asciiChars / 4 + cjkChars / 1.5)`，保守估计，偏高。

### 9.5.2 选择（无嵌入向量）

```ts
function selectMemory(goal: Goal, run: Run, budget = 120): Injection {
  const ctx = {
    scopeGlobs: goal.contract.scope.include,
    touched: filesTouchedInPreviousRuns(goal),            // 返工或恢复时可用
    tags: new Set([goal.kind, ...goal.labels, ...detectEcosystems(goal.bindings), ...contractKeywords(goal)]),
    text: [goal.contract.intent.purpose, goal.contract.intent.endState, ...goal.contract.intent.constraints].join("\n"),
  };
  const pool = activeItems([{kind:"goal",goalId:goal.id}, ...projectScopes(goal), {kind:"user"}])
    .filter(i => !goalSuppressed(goal, i))
    .filter(i => !i.appliesTo?.goalKinds || i.appliesTo.goalKinds.includes(goal.kind))
    .filter(i => !(i.appliesTo?.paths?.length && pathRel(i, ctx) === 0));   // 绑定路径但与本 Goal 无交集 → 排除

  const winners = resolveShadowing(pool);                  // §9.4.3：每个 subjectKey 只留获胜者
  const mandatory = winners.filter(i => i.pinned || i.scope.kind === "goal")
                           .sort(byRatifiedAtDesc);
  const scored = winners.filter(i => !mandatory.includes(i))
                        .map(i => ({ i, s: score(i, ctx) }))
                        .filter(x => x.s >= 0.2)
                        .sort((a, b) => b.s - a.s);

  const out: Item[] = []; let used = 2;                     // "Notes:" 前缀
  for (const i of mandatory) if (used + tok(i) <= Math.max(budget * 0.5, 2 + 80)) { out.push(i); used += tok(i); }   // 置顶优先，至多占一半，但总能放下一条上限 80 token 的条目：
                                                                                                             //   上限取 max(一半, 前缀 + 80)，计入前缀（ADR-185）
  for (const { i } of scored) if (used + tok(i) <= budget) { out.push(i); used += tok(i); }
  const mandatoryOverflow = mandatory.filter(i => !out.includes(i));   // 放不进常驻的必选条目：全部写入按需部分、排在最前、不计入 20 条（ADR-185）
  const onDemand = [...mandatoryOverflow,
                    ...scored.map(x => x.i).filter(i => !out.includes(i)).slice(0, 20)];   // 写入 contract.md 的 ## Memory
  return { items: orderForReading(out) /* goal → project → user */, onDemand, mandatoryOverflow,   // 可见性：“置顶但未进常驻”（§9.5.4）
           omitted: pool.filter(i => !out.includes(i) && !onDemand.includes(i)), tokens: used };
}

function score(i, ctx): number {
  const sw = { goal: 1.2, project: 1.0, user: 0.8 }[i.scope.kind];
  const R_path = i.appliesTo?.paths?.length ? pathRel(i, ctx) : 0.3;   // 无路径限定的一般条目给中等分
  const R_tag  = i.tags.length ? jaccard(new Set(i.tags), ctx.tags) : 0;
  const R_text = bm25Normalized(i.text, ctx.text);                      // 项目内条目语料上的 BM25，归一化到 [0,1]
  const U      = Math.log1p(i.useCount) / Math.log1p(maxUseInScope(i.scope));
  const Fresh  = Math.exp(-ageDays(i.ratifiedAt) / 180);
  const contestPenalty = i.contested.count >= 2 ? 0.5 : 1;
  return sw * contestPenalty * (0.45 * R_path + 0.25 * R_tag + 0.15 * R_text + 0.10 * U + 0.05 * Fresh);
}
// pathRel：条目 glob 与 scope include 或已触及文件有交集 → 1；只同在一个顶层目录 → 0.5；否则 0
```

**为什么 v1 不用嵌入向量：**

1. **语料很小**：单个项目的记忆通常少于 300 条。BM25、路径和标签已经足以区分。
2. **可解释**：每次注入都能写明“因为 `src/checkout/**` 与围栏相交”，人能看懂，也能纠正（R1 的精神：选择过程本身要可审计）。
3. **本地优先与隐私**：计算嵌入要么把记忆文本发给远端 API，要么在本地加载模型，后者增加数百 MB 的体积和冷启动时间（`13`）。
4. **确定性**：相同输入得到相同注入，便于复现和实验 E5（`14`）。

**复审触发条件**：单个项目的条目数 > 1000；或者“遗漏召回”投诉（人在转向中重复了一条已有但未被注入的记忆，见 §9.6 的效果度量）每月 ≥ 5 次。

### 9.5.3 注入的文本格式

常驻部分是简报中的一行（条目用简写文本，不带 id，以节省 token）：

```
Notes: webhook timestamps are local time, not UTC; use pnpm, never npm/yarn; payment mutations use idempotency key = event.id.
```

`contract.md` 中的按需部分写明优先级与 id：

```markdown
## Memory (ratified by the user)
Precedence: the contract and the repository's AGENTS.md/CLAUDE.md take priority over these notes,
except items marked [goal exception].
If an item looks wrong for this task, say so via log(kind:"finding"); do not silently ignore it.
- (goal M-g7) Timestamps in webhook payloads are local time, not UTC.
- (project M-p12) Use pnpm; never npm or yarn in this repo.
- (project M-p31) Payment mutations must use the idempotency key from event.id.
- (user M-u3) Commit messages: imperative mood, no emoji.
```

### 9.5.4 注入时机与 Trace 可见性

| 时机 | 机制 |
|---|---|
| 每次 `before_agent_start` | tower-goal 设置 `systemPromptOptions.sections.tower_goal`（`05`）。内容不变时 Pi 不生成补丁，不重复计费；记忆选择变化时生成一个 section 补丁，**持久化在 Pi JSONL 中** |
| 压缩之后 | 不需要重新注入记忆：系统段不参与压缩。Tower **不接管** Pi 的压缩（ADR-026）；只在 `session_compact` 之后补发一条 `tower.ledger` 自定义消息（≤ 150 token，`display:true`，Trace 中标“Tower 注入”），其中不含记忆 |
| 重新选择 | 下一次 `before_agent_start`（返工、恢复、follow-up）时，用本 Run 的 `files_touched` 更新 `ctx.touched` 并重新选择。**Run 中途不做记忆注入**：ADR-009 的事件性注入清单里没有记忆一项，路径相关的记忆通过 `contract.md` 按需读取获得 |

**可见性（SAT-1 for memory，*TB* C17）：**

- 每次注入都写一条 Tower 事件 `memory.injected{runId, piEntryId, items:[{id, version, score, reasons:["path: src/checkout/** ∩ scope", "tag: stripe"]}], omitted:[{id, score, why:"budget"|"shadowed_by M-x"|"below_threshold"}], tokens}`。
- Trace 中，`tower_goal` 段补丁和 `contract.md` 的读取都带“Tower 注入”标记（`05`），原文完整显示；每条记忆可以点开查看来源和入选原因。
- Goal 页的“生效记忆”面板分“常驻”与“按需（contract.md）”两组列出，并显示按需条目是否被模型读取过；放不进常驻的必选条目在按需组中标 `置顶但未进常驻`（ADR-185）；每条可打开记忆编辑器编辑或退役；“本 Goal 不适用”按钮与上文 `goalOverrides` 一起推迟到 M2（ADR-207）。
- `useCount++`、`lastInjectedAt` 在注入时更新。

---

## 9.6 学习闭环（Learn Loop）

Sheridan 的循环是 Plan → Teach → Monitor → Intervene → **Learn**（*TB* A1）。原论述漏掉了 Learn，结果同样的错误每个 Goal 重来一次（R9）。

### 9.6.1 触发

- Goal 进入 `accepted` 或 `abandoned` 时，对该 Goal 做一次回顾（retro）。
- 每周一次跨 Goal 批处理（与 `08` §8.9 的周报同时进行）。
- 阈值事件触发：某个聚类的支持数达到阈值时立即生成提议（仍需排队批准）。

### 9.6.2 挖掘源与规则

| # | 信号 | 归一化与聚类 | 阈值 | 产出 |
|---|---|---|---|---|
| L1 | **转向评论**（hunk、claim 或 goal 上的 Comment；`request_changes` 附带的评论；问题的**自由文本**回答——点选的选项不算） | 切句后保留带祈使或情态线索的句子（`不要|别|必须|应该|改用|统一|always|never|don't|use|prefer|should|must`）。聚类键为锚点路径的目录 glob 加文本相似度（三元组 Jaccard ≥ 0.4，或共享关键名词短语） | 同一项目中跨 ≥ 2 个 Goal，或同一 Goal 中 ≥ 3 次；`requiresChange = true` 的评论（`02` §2.8）计 2 次 | project 记忆（convention/preference）；跨 ≥ 2 个项目 → user 记忆 |
| L2 | **重复的问题**（不同 Goal 中 `question` 的 dedupe 归一化文本相同或相似 ≥ 0.6） | 问题文本加人的回答 | ≥ 2 个 Goal | project 记忆（fact），文本取自人的回答。**价值最高**：直接消除一次未来的打扰。污染：回答是人输入的自由文本时为 `none`；回答是点选的选项时，继承提问 Run 的污染（§9.2.1） |
| L3 | **返工原因**：首次验证失败时的标准类别（lint/typecheck/test/build）与失败签名聚类；`request_changes` 的评论 | 按 `(criterion class, failureSignature 聚类)` 分组 | 项目最近 10 个 Goal 中 ≥ 3 个首验失败于同一类 | ① 记忆（command）：“提交前运行 `pnpm lint`”；② 验证档案或合同模板补丁：在快速路径模板中加入更便宜的前置标准（§9.7） |
| L4 | **被拒绝的 assumption/decision**（`reject_claim`） | 拒绝说明加随后的转向 | 1 次（单次即可，人已经明确表达） | goal 记忆（fact/constraint）；若同类拒绝跨 ≥ 2 个 Goal → project |
| L5 | **放弃原因**（`HumanDecision{kind:"abandon"}.reason.code`，`02` §2.7） | 按原因和 Goal kind 统计 | 项目 30 天内 `contract_unclear` ≥ 2 次 | 合同模板补丁：要求 `human` 标准附示例，或对该 kind 默认走塑形路径 |
| | | | `agent_incapable` ≥ 2 次且集中在模型 M | 模型路由建议（Claim）：“kind=X 的 Goal 改用模型 N” |
| | | | `wrong_direction` ≥ 2 次 | 建议对该 kind 或规模的 Goal 启用计划闸门 |
| L6 | **哨兵覆盖**（`07` §7.11.4） | `(detector, pathGlob)` | 同一模式被 `reason.code = "intended_change"` 覆盖 ≥ 3 次 | 检测器豁免提议（存入 VerifyProfile，90 天复审）；测试编辑类 → 合同模板中 `allowTestEdits` 由 `forbid` 改为 `ask` 的建议 |
| L7 | **人的就地 hunk 编辑**（Agent 版本 → 人的版本） | 提取简单的风格差异（引号、`any` → 具体类型、命名风格）；v1 只统计“人在某 glob 中改了 N 个 hunk” | 同类 ≥ 3 次 | 记忆（convention），由起草器归纳文本 |
| L8 | **重复的命令序列**：已验收 Goal 中，归一化后相同的命令序列（长度 ≥ 3，例如“起 db → 迁移 → 播种”） | 序列 n-gram | 项目中 ≥ 3 个 Goal | **技能草稿**（`SKILL.md`，Agent Skills 规范）。只能由人显式导出到 `~/.pi/agent/skills`（用户目录），或通过一个 docs Goal 写入仓库的 `.pi/skills`（§9.11） |
| L9 | **停止条件误报**（`stop_condition` 卡片上的“这里不该停”：`goal.resume{feedback:"stop_condition_false_positive"}` → `HumanDecision{kind:"resume"}.reason.code = "stop_condition_false_positive"`，`target.criterionId` = `StopCondition.id`，`02` §2.7；`08` §8.8 记为 `false_positive`，ADR-135） | 按 `StopCondition.id` 聚类（id 在合同修订中保持不变）；来自合同模板的条件再按模板条目聚合 | 同一 Goal 1 次 → 该条件**静默到下一次合同修订**（再武装规则见 `07` §7.7.1，ADR-139；不影响 I6 的返工上限 `maxReworkCycles`，ADR-143），并成为**候选收窄**；同一模板条目跨 ≥ 2 个 Goal | ① 在下一次 `contract.amend` 时提示收窄该条件（只提示，不自动修改合同）；② 合同模板补丁：收窄或删除该条目。M1 只记录信号（随 `HumanDecision` 持久化），挖掘属 M3（§9.0.1） |

### 9.6.3 起草

- 聚类和证据由确定性代码产生。**规则的文字**（目标 ≤ 40 token，上限 80 token，ADR-032 口径，原子化；补充说明放 `detail`）以及 `kind`/`subjectKey`/`tags`/`appliesTo` 的建议，由一个便宜的模型起草。起草器**不带任何工具**，输入只有该聚类的人类原话片段（`sensitivity: private` 的条目及其来源除外）。起草结果按 Claim 语法显示。
- 起草费用计入“学习”预算，默认每天 $0.50 上限。超出或离线时退化为模板：`"In <paths>: <最有代表性的一句人类原话>"`。
- 产出类型：`MemoryProposal`、`VerifyProfilePatch`、`ContractTemplatePatch`、`SentinelException`、`SkillDraft`、`AutonomySuggestion`（交给 `11` §11.5）、`ModelRoutingSuggestion`。**全部进入批准队列，没有任何一项会被自动应用**（§9.7 中的“仅性能类”档案调整除外）。

### 9.6.4 效果度量与退役阈值（R1-D12-06）

对每条由挖掘产生并被批准的记忆，比较**其来源聚类**在批准前后的复发率。“相关 Goal”指路径或标签与该条目 `appliesTo`/`tags` 相交的 Goal；“复发”指该 Goal 中出现了落入同一聚类的转向（§9.6.2 L1 的聚类规则）。

```
基线 r0：批准前 90 天内的相关 Goal 中发生复发的比例；相关 Goal < 5 个时记“基线不足”
事后 r1：批准后的相关 Goal 中，该条目被注入（常驻或在 contract.md 中被读取）的那些 Goal 的复发比例
先验：r0、r1 各取 Beta(1, 1)；报告 P(r1 < r0) 与 r1 的 80% 可信区间
评估时点：批准后满 10 个相关 Goal，或 60 天（先到者）
```

| 结论 | 条件 | 动作 |
|---|---|---|
| **有效** | `P(r1 < r0) ≥ 0.9` 且 r1 的后验均值 ≤ 0.5·r0 | 在记忆管理器标“有效（n=…）”；复审周期延长一倍 |
| **无效果** | 满 15 个相关 Goal 后 `P(r1 < r0) < 0.6`，且该条目被注入过 | 提议改写措辞或升格为合同 constraint 模板；不自动退役 |
| **遗漏召回** | 复发的 Goal 中该条目**没有**被注入或读取 | 计一次遗漏召回；建议加 `appliesTo.paths` 或 `pinned`；也是 §9.5.2 复审嵌入方案的依据 |
| **数据不足** | 120 天内相关 Goal < 10 个 | 不下结论；进入每月复审批次 |

**退役提议的阈值**（只提议，不自动执行，进入每月复审批次）：

- 30 天内 `contested.count ≥ 3`（人的转向与它方向相反）；
- “无效果”且未被置顶；
- 120 天内既未被注入也未被读取；
- `appliesTo.paths` 在默认 base 上全部失效（§9.4.2）。

样本量很小时（单人、单项目），这些统计主要用来排序复审队列，而不是证明因果；周报中同时给出 n 与区间。

---

## 9.7 每项目验证档案的学习（VerifyProfile）

`VerifyProfile` 的权威类型在 `07` §7.13（R1-D15-10），本节只定义学习规则；学习结果写入其中对应的字段。

| 学习项 | 规则 | 应用方式 |
|---|---|---|
| runner 识别 | 配置文件（`vitest.config.*`、`jest.config.*`、`pyproject [tool.pytest]`、`go.mod`、`Cargo.toml`）+ `package.json` scripts 解析 + 观察到的 `class=test`、退出码 0 且能解析出计数的命令 | 首次添加项目时提议；之后检测到变化时提议 |
| 默认验收标准（`commands.test/lint/build/typecheck`） | 在已验收 Goal 中，统计 Agent 提交前最后一次运行的命令 C 的结果与验证结果的一致率。一致率 ≥ 0.9 且样本 ≥ 5 → C 成为快速路径的默认 `exec` 标准候选 | 需批准（影响验收严格程度） |
| 超时 | `timeoutSec = max(60, ceil(p95 × 2))`（样本 ≥ 5，观察器与验证器的耗时合并计算） | **一律需批准**：学到的值只作为建议，经 `contract.amend` 由人修订（`exec` 标准的 `timeoutSec` 是合同字段，任何改动仅本机，`16` §16.5；提高时限可能使原本 `timeout` 的运行通过，属判别原则所指的放宽）；`07` §7.13 的 `learned` 统计只用于排序与建议，不影响判定，不自动写入任何字段（ADR-182） |
| reporter 注入 | 注入导致 `Unknown option` 失败 1 次 → 提议对该 runner 关闭注入 | **需批准**（ADR-183）：触发判据取自验证槽位中运行的被测代码的输出，可被它触发；关闭注入后计数改按正则兜底，已识别的 runner 仍得不到计数时判为 `unparseable`，零分母保护不受影响（唯一定义在 `07` §7.4.5）。单次验证内的“无注入重跑一次”照常自动执行（`07` §7.4.5），不形成持久规则 |
| 网络 | 验证失败的输出含 `ENOTFOUND|getaddrinfo|ECONNREFUSED` 指向非 localhost 主机，而同一指纹下 Agent 环境中通过 → 建议在 `VerifyProfile.env.network` 中放行所需主机（验证器执行阶段网络的唯一来源，仅本机修改，`07` §7.4.4、`16` §16.5；合同中没有可放行执行阶段网络的字段，ADR-178/183），或给测试加 mock | 需批准（与 `11` §11.6.3 的网络默认关闭一致） |
| 本地文件清单（不在 VerifyProfile 中） | 验证通过但 Agent 环境失败（或反之）的差异集中在某个被忽略的文件（例如 `.env.test`）→ 提议把该文件加入本地文件清单 | 需批准：人同意后经 `project.local_files.add` 加入，加入后按 `16` 的 `ProjectLocalFile` 行判定（播种仍需 `project.local_files.approve`，ADR-174） |
| flake 隔离 | `07` §7.4.6 | 需批准 |
| 依赖预热键 | lockfile 路径和 `depsKey` 组成 | 自动 |
| 服务与端口（`services`、`ports`） | 30 天内 ≥ 2 次 `verify_env_error{stage:"service"|"port"}`（`07` §7.4.4）→ 提议补充 `services` 条目或标记 `ports:"fixed"`（后者会把项目的服务并发度降为 1） | 需批准 |

**原则：凡是可能让判定变宽松的调整都需要人批准；只影响速度或信息量的调整可以自动应用，但必须留痕、可撤销。**

---

## 9.8 校准记分板（Calibration Scoreboard）

这是 Lee & See“目的 / 过程 / **表现**”中“表现”这一条腿（*TB* A13、D#26）：对 Agent 的信任要按 模型 × 项目 来校准，而不是笼统地“信任 AI”（*TB* B1）。

### 9.8.1 指标（键为 `(model, projectId)`，并汇总出 `(model, *)`；滑动 90 天）

| 指标 | 定义 | 数据来源 |
|---|---|---|
| 声明被推翻率 | 硬矛盾数 / (consistent + 硬矛盾)，只统计含可检查断言的 Claim；软矛盾单独列出，不计入（`07` §7.8.1） | `07` §7.8 |
| 首验通过率 | 首次验证即通过的 `submit` / 全部 `submit`（只统计有机器标准的 Goal，ADR-031） | `criterion_check` |
| 虚假成功率（Tower 本地口径） | 自评全部 `met` 但首次验证失败的 `submit` / 自评全部 `met` 的 `submit`。这是**本机、本项目**的测量，与文献中客服/AppWorld 领域的 45–76% 不可直接比较（`07` §7.0） | `07` X6 |
| 验证失败率 | 失败的验证次数 / 验证次数 | — |
| 返工率 | 每个进入 `in_review` 或 `abandoned` 的 Goal 平均经历的 `reworkCycles` | `Goal.counters` |
| 评审退回率 | `request_changes` 次数 / 评审轮次 | `HumanDecision` |
| 测试完整性事件率 | 出现 severity ≥ 2 测试完整性命中的 Goal / 全部 Goal | `07` §7.5 |
| 信心校准 | 对标注为 high、medium、low 信心的 Claim（`log` 的 `confidence` 参数，ADR-030），分别计算硬矛盾率。“单调”（high < medium < low）视为校准良好 | `Claim.confidence` + crossCheck |
| 每个验收 Goal 的成本 | 中位数 | `Run.usage` |
| 逃逸缺陷率 | 抽样深审（§9.10）发现问题的 Goal / 被审 Goal | §9.10 |

### 9.8.2 展示

- **在 Claim 旁边**（只有当 n ≥ 10 时才显示）：信心徽标之后加一个中性灰色的“履历”标签，例如 `高信心 · 在本项目中 12% 被推翻（n=41）`。n < 30 时同时显示 Wilson 80% 区间（`8–18%`）。某个信心档位的被推翻率 ≥ 25% 时，标签文字提到 text-1 并加“偏高”二字（不用琥珀：琥珀只表示需要你决定，`12` §12.4.3）。**永不用绿色**（H3）。
- **在 `done`/`submit` Claim 旁边**：`该模型在此项目：首验通过 64%（n=25）· 虚假成功 18%`。
- **记分板页**：模型 × 项目的表格加时间趋势迷你图。这里也是模型路由建议（L5）和自适应自主度（§9.9）的依据。
- 记分板的数字是 ⚙️ 统计出来的 Fact（关于历史的事实），按 Fact 语法渲染。但它们**只是放在 Claim 旁边**，从不改变 Claim 的 `crossCheck`，也从不影响状态机。
- 独立评审模型（`07` §7.12）有自己的一行：发现被采纳率（发现之后人发出了转向或 `request_changes`）与被推翻率。
- 换模型后不继承履历，显示“新模型，样本不足”。信任不跨模型迁移（`11` §11.5）。

---

## 9.9 自适应自主度（Earned Autonomy）

**默认关闭，M3 起提供（ADR-019：自适应自主度晋升建议，实验 E7）。规则以 `11` §11.5 为准**：信任按 项目 × 模型 × 动作类 计算；只建议升一级；Wilson 95% 下界 ≥ 0.90，`distinct_goals ≥ 5`，近 30 天 0 事故；单向门最高只能到 `ask`，不能形成授权（`11` §11.3.5，ADR-182）；1 次事故立即降一级，30 天内 2 次重置为预设。本节只补充学习层的职责：

1. **证据供给**：`08` §8.8 的 `outcomeClass` 区分 `reflexive` 与 `confirmatory` 两种批准。**反射式批准不计入 `approved_unmodified` 的“有效证据”**，因为人没看就点了，不能证明动作是安全的。所以晋升依据的是“看过之后仍然批准”的次数。这样可以防止审批疲劳反过来成为放宽权限的理由。
2. **触发**：`08` §8.9.2 规则 D（某类反射批准率 ≥ 0.95）只会把该类放进候选列表，是否晋升仍由 `11` 的条件判定。
3. **呈现**：晋升建议并入每天的 `ratify` 聚合条目，附上证据（批准列表、涉及的 Goal、0 事故的时间窗）和当前的记分板摘要（例如该模型在该项目的虚假成功率）。如果该模型的**测试完整性事件率**或**虚假成功率**高于项目中位数，建议卡片会给出警示（Claim 语法），但不阻止人批准。
4. **降级通知**：按 `11` 的规定为 severity 2，并在周报中列出“本周被收回的自主度”。

---

## 9.10 反技能萎缩（可选，默认关闭）

Bainbridge 指出，监视者会逐渐变成没有经验的操作员（*TB* A2）；Mitchell 等人在 2026 年把这一点重新表述到 Agent 场景，*TB* B3.4 也把它列为长期风险。下面三项机制都需要用户主动开启，都有频率上限，都**不阻塞验收**，以免显得家长式（*TB* D#31）。

| 机制 | 规则 | 度量 |
|---|---|---|
| **预测后揭示** | ① 验证进行中，Goal 页一键询问“你预计验证会通过吗？是 / 否 / 不确定”；② 打开高风险评审单元前，询问“你预计这块有问题吗？”。都可以跳过，每天至多 3 次 | 用户自己的 Brier 分数和校准曲线，进入周报（`08` §8.9.1 第 8 项） |
| **抽样深审** | 每验收一个 Goal，以概率 `p = min(1, 1/N × (1 + riskScoreNorm))`（默认 N=10）选中它做深审。深审不阻塞，在之后的断点提示：完整评审包括低风险单元在内的全部单元，或者回答 3 个“关于这次改动你应知道的”问题（由模型生成，Claim 语法，答案对照代码自查） | 发现问题 → 创建关联的回归 Goal；计入记分板的“逃逸缺陷率”。这是 R10 种子错误检出率在真实环境中的代理指标 |
| **亲手任务建议** | 用户在自己的 checkout 中 60 天内没有提交过某模块，而 Agent 在该模块累计改动 > 2000 LOC → 站会摘要中出现一行建议：亲手做一个小任务，或做一次代码走读 | 采纳次数 |

---

## 9.11 与 AGENTS.md / CLAUDE.md 的关系

**事实：** Pi 自行加载上下文文件（`resource-loader.ts:184-274`）。每个目录按 `16` §16.1.12“上下文文件名与受保护名字”一行的候选顺序（v1.2.0 共五个名字，以 `AGENTS.override.md` 为首）取第一个存在的普通文件，在大小写不敏感的卷上任何大小写变体都算存在；加载范围是 agentDir（`~/.pi/agent/`）中的上下文文件，加上**从文件系统根到 cwd 的每一级目录**；**与信任设置无关**（*pi.md* §9）。M1 中每个 Goal 都以用户 agentDir 运行（清单确认之前与 `riskTier=high` 的 Goal 只是不加载扩展，独立的隔离 agentDir 属 M2，`05` §5.10，ADR-212），所以用户级 `AGENTS.md`（“User 记忆”）、`SYSTEM.md`、技能与提示对每个 Goal 都照常加载；`~/.agents/skills` 与 agentDir 无关，恒按 `$HOME` 加载（`core/package-manager.ts:2464`、`:2555-2567`）。

| 原则 | 做法 |
|---|---|
| **只读，从不写** | Tower 从不修改用户 checkout 或 Goal worktree 中的 AGENTS.md/CLAUDE.md（ADR-011）。Agent 修改它们属于 `edit.protected`（`11` §11.3.3 默认保护）；若用户放开保护，`07` §7.6.3 仍会单独标记 |
| **不重复注入** | Tower 不重复注入 Pi 已经加载的上下文文件，也不使用 `--no-context-files`：仓库约定照常生效 |
| **用于展示** | Goal 页的“生效上下文”面板列出 Pi 将加载的上下文文件（路径和 token 估算）以及 Tower 记忆块。人能一眼看到模型会读到哪些指令 |
| **用于去重** | 记忆提议与 AGENTS.md 各行的三元组 Jaccard ≥ 0.5 → 标记“AGENTS.md 已覆盖”，建议拒绝 |
| **用于冲突提示** | §9.4.3 规则 2 |

**Worktree 位置与祖先上下文：** ADR-008（修订）默认把 worktree 放在用户检出目录的同级隐藏目录 `<checkoutParent>/.tower-wt.noindex/<repoName>/<goalId>`，因此 worktree 在仓库根以上的祖先链与用户检出相同，Pi 加载的上下文文件与用户自己运行 Pi 时一致。只有卫星不在默认位置（人设置了 `Project.worktreeRoot`，或强制回退到 `~/.tower/worktrees`，`10` §10.4.3 第 1、3 步）时祖先链才会不同。此时的祖先上下文差异以本段为唯一定义（何时计算、比较什么、内容去向；ADR-205，`10` §10.4.3、`05` G31 引用）：Tower 在每个 Run 开始前分别计算 `contextFiles(checkout)` 与 `contextFiles(worktree)`（定义见 `16` §16.1.12“上下文文件名与受保护名字”），仓库根以上的各级按路径、仓库根这一级按名字比较：`contextFiles(checkout)` 中的项在 `contextFiles(worktree)` 里没有对应项的，即为缺失文件；反过来只在 `contextFiles(worktree)` 中的项（卫星祖先目录中的上下文文件）照常由“生效上下文”面板列出，不算缺失（ADR-206）。如有差异：

- 在“生效上下文”面板中显示警告，列出缺失的文件；
- 在简报中提示这些差异（ADR-008“后果”，受项目信任约束）。缺失文件中位于用户检出**之外**的祖先目录的，其内容快照写入 `contract.md` 的 `## Imported context` 小节，供模型按需读取，不占常驻预算；记录文件哈希，文件变化时重新提示。位于用户检出**之内**的缺失文件（如未跟踪的 `AGENTS.md`）**不导入**：`runs/` 中的 `contract.md` 对 Agent 可读，导入会绕过本地文件的批准与内容判定；面板提示先让 git 忽略它（加入 `.git/info/exclude`）、再把它加入“本地文件”清单，按 `11` §11.6.2 处理（ADR-178、ADR-205）。

**“导出到 AGENTS.md”（显式的用户动作；M2，§9.0.1，ADR-205）：**

1. 在记忆管理器中选中若干条目，点击“导出到 AGENTS.md”。
2. Tower 选择目标文件（ADR-204、ADR-205，唯一定义）：取 Run 的 Pi 在 cwd（卫星根）实际加载的那个文件。它只在 base 树上求值（`Project.defaultBaseRef` 在镜像中的当前提交；卫星由 base 检出，只含被跟踪的内容）：在树的根目录按 `16` §16.1.12“上下文文件名与受保护名字”的候选顺序与比较规则取第一个普通文件，以它在树中的名字写入；它是符号链接时（如 `AGENTS.md → CLAUDE.md`）取链接在仓库内的目标文件，目标越出仓库时不导出；根目录没有任何候选时新建 `AGENTS.md`。从不取用户检出中未跟踪或被忽略的文件（如个人的 `AGENTS.override.md`）作为目标；用户检出根目录另有排在目标之前的候选时，提示“你本地的 `<名字>` 会遮蔽它”，并不提供退役（第 4 步）。不按 `appliesTo.paths` 的公共前缀目录选：Pi 只加载 cwd 及其祖先目录中的上下文文件，子目录中的不加载（`resource-loader.ts:232-274`）；条目的路径范围写进文字（如 “`src/checkout/**`：…”）。Tower 生成**补丁**：在 `## Conventions` 小节下追加纯文本，不带 Tower id 和元数据。
3. 用户二选一：
   - **作为一个 docs Goal**（推荐）：用快速路径合同创建一个 `kind: docs` 的 Goal，补丁就是它的唯一改动。之后走正常的验证、评审、合并流程。Tower 自己仍然没有写用户仓库，写入是经过人验收的改动。
   - **复制补丁**，或在用户的编辑器中打开目标文件。
4. 补丁进入 base 之后（docs Goal 为 `integrated` 时；复制补丁时不自动询问，人可在记忆管理器中手动退役），询问是否把这些条目退役（`retiredReason: "exported"`），以免与 AGENTS.md 重复注入。只在补丁的目标是 Pi 会加载的那个文件、且没有第 2 步的遮蔽提示时询问；人改选了其他文件（例如子目录中的 `AGENTS.md`）时提示“Pi 不会自动加载这个文件”，不提供退役（ADR-204）。

---

## 9.12 可迁移性：导出、同步与隐私

### 9.12.1 存储位置与内容

| 数据 | 位置 | 内容 | 默认保留 |
|---|---|---|---|
| 事件日志、账本、记忆、路由、记分板、审计 | `~/.tower/tower.db`（SQLite） | 全部结构化数据；记忆文本 | 直到清除；审计事件不按时间删除，清除只删其载荷（`16` §16.2.8 审计保留，ADR-195） |
| Pi 会话 | `~/.tower/goals/<goalId>/sessions/*.jsonl` | **完整对话**：注入的简报和记忆、代码、工具输出（已脱敏，`11` §11.7） | 直到清除（这是用户自己的历史） |
| Run 目录与证据 | `~/.tower/goals/<goalId>/runs/<R>/`、`artifacts/` | 简报、合同、情节等开场文件（含注入的记忆文本）；截图与报告 | 随 `goals/<goalId>/`，直到清除 |
| 命令与验证日志 | `~/.tower/goals/<goalId>/logs/`、`verify/` | 完整输出（已掩码）；观察器复制的命令全文 `logs/<toolCallId>.log` 单个没有大小上限（Pi 全文文件的大小，`07` §7.2.2），默认进入系统备份（ADR-226） | Goal 归档或放弃后 30 天；决定性验证的验证日志随其重放包永久保留（每条标准 ≤ 2 MB），口径与保留规则只按 `07` §7.4.1 重放包规格（唯一定义，ADR-095/182）；本表不另设“证据摘录”上限 |
| Host 临时目录 | `~/.tower/tmp/<hostId>/` | Pi 写出的输出文件原文——bash 截断输出的全文、MCP 截断结果的全文与二进制资源、codemode 的溢出文本与图像——**未经脱敏**（`11` §11.7.1 残余）；不在系统备份中 | 随该 Host 进程退出删除（`05` §5.3.6 临时目录一行）；打包模式下与长寿 Host 同寿，退出之前没有上限（ADR-224/226） |
| Pi 的 MCP 日志（Tower 之外） | 用户 agentDir 的 `mcp.log`、`mcp.log.1` | MCP 服务器发来的日志消息，可能含 Goal 中的路径、查询与工具参数；由 Pi 写入，终端中的 `pi` 与 Tower 共用 | Pi 按 5 MB 轮转；Tower 不删除（§9.12.4 “清除之后仍可能存在的副本”，ADR-230） |
| 诊断包 | `~/.tower/diag/` | 日志片段、diff | TTL 1 小时（`08` §8.13） |
| worktree、验证槽位、依赖缓存 | 默认 `<checkoutParent>/.tower-wt.noindex/<repoName>/`（含 `_verify/`；ADR-008、`10` §10.4.3），回退 `~/.tower/worktrees/`；depcache 与之同卷 | 代码、依赖 | worktree 随 Goal；depcache 按 LRU，上限 20 GB |
| 影子检查点 ref | Tower 的影子 gitdir `~/.tower/goals/<goalId>/git/<projectId>.git` 中的 `refs/tower/<goalId>/*`（用户仓库中不保存，`10` §10.1）；开启“保留审计地标”时，地标另写入用户仓库（`10` §10.6.2，ADR-176） | 工作区快照 | 保留期只按 `10` §10.3.2 “检查点保留”（哪些 ref 保留、影子何时删除，本表不复述，ADR-194/239） |
| 备份 bundle | `~/.tower/goal-bundles/<projectId>/<goalId>.bundle` | 本 Goal 的检查点、pin、seal 对象 | `10` §10.16.3 |
| 镜像库 | `~/.tower/projects/<projectId>/mirror.git` | 用户仓库的历史；各 Goal 的基线快照 `refs/tower/<goalId>/base-snapshot`（选择“包含我的未提交改动作为起点”时含你当时的未提交改动，`10` §10.5）、活跃影子 ref 的副本与证据保留 ref | `10` §10.17.1 |
| 数据库备份与会话归档 | `~/.tower/db-backups/` | `tower.db` 的日备份、周备份与迁移前备份（含载荷）；归档 180 天后移入的 Pi 会话 `sessions-<年>.tar.zst` | `06` §6.6.2–§6.6.4 |
| 全局日志与崩溃转储 | `~/.tower/logs/`、`~/.tower/crash/` | 已掩码的运行日志（含 `host-<goalId>.log` 等按 Goal 命名的文件）；minidump | 日志 14 天或 200 MB（`06` §6.6.4） |
| Scratch | `~/.tower/scratch/` | 对话 | 7 天（ADR-012） |

**会离开本机的数据：** 模型提供商调用（Agent Run，包含代码、简报和注入的记忆；可选的独立评审；可选的学习起草器，包含转向原话片段）；可选的依赖注册表元数据查询（`11` T6）；用户自己开启的同步目录（§9.12.3）。**默认没有任何遥测。**

### 9.12.2 导出为 Markdown

- **一次性导出**：用户选择作用域（user / 某个 project / 某个 Goal）→ 生成一个 Markdown 文件。人可以直接读懂，任何引擎都能使用（与 ADR-016 引擎中立一致），也可以再导入。再导入时按 §9.12.3 的身份规则处理：`canonicalRoot` 相同（且根集合、远端一致）才自动归入同一 Project，否则生成 `project_identity` 条目由人确认（ADR-069、ADR-080）。
- 格式（确定性排序：作用域 → kind → subjectKey → id，保证 diff 干净）：

```markdown
# Tower memory · project · github.com/acme/web
<!-- tower:scope {"kind":"project","projectId":"P-7f3a…","identity":{"canonicalRoot":"9c1e…","disambiguator":"github.com/acme/web","rootAliases":["4b2d…"],"remotes":["github.com/acme/web"]}} -->

## convention · pkg-manager
<!-- tower:item {"id":"M-p12","version":3,"status":"active","tags":["js"],"appliesTo":{"paths":["**"]},
     "origin":"mined_steering","ratifiedAt":"2026-09-30T10:12:00Z","machineId":"mbp-1","hmac":"…"} -->
Use pnpm; never npm or yarn in this repo.
```

- `sensitivity: private` 的条目**不导出**。retired 条目只在用户勾选“包含历史”时导出。

### 9.12.3 同步目录（可选）

**目的：** 让记忆跨机器、跨 worktree、跨引擎地跟着人和仓库身份走（*LS* §D.4），而不是像 Claude Code auto memory 和 Codex memories 那样锁在一台机器上（*LS* B.11）。

| 规则 | 说明 |
|---|---|
| **位置** | 用户指定的任意目录：一个专用 git 仓库，或者云盘目录（iCloud Drive、Dropbox 等） |
| **永不写入用户代码仓库** | 设置时校验：同步目录不能位于任何已知 Project 的 checkout 或 Tower worktree 之内，也不能是某个已知 Project 的仓库（比较根提交）。不满足就拒绝（`01` §1.4 第 8 条） |
| **布局** | `<sync>/tower-memory/v1/user.md`、`projects/<projectId>--<slug>.md`、`goals/<goalId>.md`（Goal 记忆默认不同步，可以开启） |
| **项目身份** | 文件名和元数据使用 `ProjectId = hash(canonicalRoot)`，`canonicalRoot` 在首次绑定时固定（ADR-028、ADR-058），并同时写出 `rootAliases` 与 `remotes`。在另一台机器上读入时：**只有 `canonicalRoot` 与 `disambiguator`（ADR-087：首次绑定时名为 `origin` 的远端，没有则字典序最小的远端，无远端则 uuid；存于 `Project.identity.disambiguator` 并写入导出与同步元数据）都相同，才自动视为同一 Project**（ADR-069、ADR-087）；仅根别名相交（本机根集合与文件中的 `canonicalRoot ∪ rootAliases` 有交集，但 `canonicalRoot` 不同）时，**不自动合并**，而是生成一条 `project_identity` 条目（`08` §8.4；不复用 `sync_conflict`，后者只用于记忆条目的并发编辑），进入人确认的“合并 Project”流程（ADR-028），决定类型为 `merge_projects` / `split_project`；确认前该文件的记忆不注入（R4-D12-02）。`canonicalRoot` 相同但根集合或远端不一致时同样走此流程（ADR-080）；一致性检查用该检出**全部 ref** 的根集合（`rev-list --max-parents=0 --all`），不随当前分支变化（ADR-087）。

**拆分后的归属（按 ADR-087，R6-D12-01）：** 选择“新项目”拆分时，项目记忆**复制到双方**：新 Project 中的副本记 `origin:"copied_from_project"` 与 `provenance.copiedFrom = <原 ProjectId>`；双方的这些条目都把 `reviewAfter` 设为拆分时刻，在记忆管理器中显示“继承，待复审”，并进入下一次复审批次（§9.4.2），复审前照常注入。新 Project 的信任为 `untrusted`（重新询问）；VerifyProfile 复制后各自演化；已有 Goal 归属其绑定检出的远端与新旧项目相匹配的一方（规则以 `02` §2.3 为准）。全部记录 `audit.project_split`。User 记忆不受影响。无论路径与远端如何。浅克隆的 `provisional:` 身份不参与同步，升级为正式身份后再按此规则处理 |
| **写出** | 记忆变化后防抖 10 s 写出对应文件。如果同步目录是 git 仓库，Tower 再执行 `git commit -m "tower: memory <scope> <ids>"`；只有用户开启了 `autoPush` 时才 `pull --rebase`/`push`（由 Supervisor 用用户凭据执行，与 `11` §11.6.4 的“被代理的能力”一致） |
| **读入（并发编辑检测，R1-D12-05）** | 文件监听，加上启动时扫描。每个条目带**版本向量** `vv: {machineId: counter}`（本机每次编辑把自己的计数 +1），见下方算法。云盘的“冲突副本”文件（`* (conflicted copy)*.md`、`*-conflict-*`）中的条目同样按版本向量合并 |
| **防投毒** | 每个条目块带 `hmac = HMAC-SHA256(syncKey, canonical(item))`。`syncKey` 用 Electron `safeStorage` 保存，换新机器时通过一次性配对码迁移。**签名无效或缺失的外部修改**（例如有人改了云盘上的文件）→ 记为 `origin: "sync_import"` 的**提议**，必须经人批准，绝不直接生效 |
| **删除** | 退役同步为 `status: retired`。彻底清除同步为墓碑 `{"id", "purged": true, "vv", "hmac"}`（ADR-183）：不含文本；`vv` 为被清除条目的版本向量逐项取最大后本机 +1，因而支配此前任何一台机器上的版本；`hmac` 与普通条目同样签名。清除界面注明：同步目录是 git 仓库时，原文仍在其历史中，需要用户自行改写该仓库的历史 |
| **团队** | ADR-013：v1 的同步目录只服务于单个用户的多台机器。共享给他人属于 `team` 作用域，留待以后 |

**合并算法（替代“版本号较大者胜”，避免两台机器从不同基线编辑后静默覆盖）：**

```
for each item id in remote:
  L = local[id], R = remote[id]
  if L 或 R 是有效签名的墓碑:      墓碑优先：本机删除该条目并保留墓碑；之后任何不被墓碑 vv 支配的同 id 版本按并发编辑处理（ADR-183）
  elif !L:                        take R（签名有效时；否则作为 sync_import 提议）
  elif vv(R) == vv(L):            nothing
  elif vv(R) dominates vv(L):     take R                // R 包含了 L 的全部编辑：快进
  elif vv(L) dominates vv(R):     keep L（下次写出时覆盖远端）
  else:                           并发编辑 → Needs-You kind:"sync_conflict"（owner: global，ADR-034）
                                  并排显示两个版本与共同祖先（各自保存 baseText），人选择其一或合并编辑
                                  → HumanDecision{kind:"resolve_sync_conflict"}，结果的 vv = 两者逐项取最大后本机 +1
```

`version`（§9.2）仍是给人看的单调序号；判定只用 `vv`。

**与 Beads 的关系：** Beads 把工作项（issue 图）本身当作 Agent 的记忆。Tower 中对应的“工作项记忆”是 Goal 账本、Goal 记忆和交接包。v1 不与 Beads 集成，但 Goal 级的 Markdown 导出在形态上与之兼容（一个工作项一个文件、带结构化元数据），以后可以做映射。

### 9.12.4 清除（Purge）

**唯一定义**（ADR-195/196；`06` §6.4.3 `privacy.purge`、§6.6.4 与 `10` §10.3.2、§10.6.2 引用）。清除只删除 **Tower 自己的数据**，**从不写入或删除用户仓库中的任何东西**（`10` 设计基调“绝不碰用户的工作现场”）：
- Tower 曾写进用户仓库的 ref——Goal 分支（`integration.performed.branch` 的各个取值）、开启“保留审计地标”时的 `refs/tower/<goalId>/cp/<n>`——一律原样保留。清除结果逐条列出完整的 ref 名，并说明“Tower 未改动你的仓库；分支可能含你的提交，需要时请自行删除”。清除之后 Tower 不再按 `10` §10.6.2 的“归档 180 天后”删除该 Goal 的审计地标（清除删去了排定它的记录；保守地保留），地标与分支一样由人自行删除（ADR-201）。
- 要由 Tower 删除其中满足删除条件的分支与地标，请在清除**之前**执行“清理 Tower 引用”（`10` §10.6.2）。清除之后，Tower 不再有识别这些分支所需的 seal ref。清除确认框写明这一点，并注明“清理 Tower 引用”作用于该仓库中所有 Goal 的地标与分支，不只是要清除的这一个（地标对应的检查点仍在各自的影子中）。
- **状态前提**（ADR-196）：`goal` 档只接受终态 Goal（`archived` / `abandoned`，`03` §3.2）。其他状态——包括 `integrated` 的 24 小时宽限期与 `paused(human)`——返回 `E_STATE`，提示“先放弃，或等待归档，再清除”；放弃时人工编辑检出中有未交还的改动会先询问（`06` §6.4.3 `goal.abandon`）；路径不可访问的 Goal（`06` §6.1.6 Project 不可达一行）同样可以放弃，之后照常清除（ADR-236）。`project` 与 `all` 档的范围内只要有一个非终态 Goal，就整笔返回 `E_STATE`，并列出这些 Goal。
- **人的工作现场**（ADR-196）：清除**从不删除**人工编辑检出 `_human/<goalId>/` 与检验检出 `_inspect/<goalId>/`，也从不删除按名字形状改名保留的目录——`_human/<goalId>.kept-*`、`_inspect/<goalId>.kept-*`、卫星的 `<wtRoot>/<goalId>.kept-*` 与 `_gitdirs/<goalId>.kept-*`（`10` §10.2，ADR-199/221/222）；默认位置与回退位置都如此。终态 Goal 仍留有的这类目录：交还、放弃改动、放弃 Goal、检验带回与关闭之后已脱离的副本（Tower 从不自动删除它们，`10` §10.2 “人的工作现场不自动删除”，ADR-228；删除卫星时同样保留，`10` §10.3.2）、人选择“稍后决定是否带回”的检验目录（`10` §10.8.3）、中断的接管留下的 `_human/<goalId>`（ADR-200），以及 Tower 自动改名保留的 `.kept-*`（`10` §10.2 所列的几处，ADR-221/228）。其中可能有只存在于该处的改动。清除结果与上述 ref 一样逐条列出完整路径与原因；其中有该 Project 机密本地文件的目录另注明 `含本地机密文件的副本`（由目录本身求出，同存储面板，`10` §10.2，ADR-230/231）。清除一个 Goal 时写“可能含你的改动；不需要时在设置的存储面板中删除”（`goal.delete_kept`，仅本机，删除前列出将丢失的内容；该 Goal 的影子已随清除删除，确认框只有文件级信息，`10` §10.2，ADR-229）。清除一个 Project 与清除全部之后，Tower 不再知道这些目录——Project 记录与它的 `<wtRoot>` 随之删除，存储面板无从列出（`10` §10.2 “列出的来源”；清除时不可访问而记入清除遗留清单的根除外，见下方“不可访问的根”，ADR-238）——所以结果写“可能含你的改动；存储面板之后不再列出它们，不需要时请自行删除”，清除的确认框在执行之前同样列出这些路径（再次添加同一项目且工作目录位置不变时，它们按名字重新列出；ADR-229）。之后新建的 Goal 不会使用这些路径（编号不复用，`10` §10.2，ADR-198）。“清除全部”同样跳过并列出这些目录，`<wtRoot>` 为 `~/.tower` 之内的回退位置时也是如此（见下表“清除全部”一行，ADR-197）。结果另注明两点：这些目录创建时已排除在系统备份之外（`10` §10.4.3），排除标记仍在；人工编辑检出的 git 对象经 alternates 取自影子与镜像，清除之后其中的 git 命令会因缺少对象而失败，文件本身完整（ADR-197）。
- **数据库中的墓碑**（ADR-196）：`decisions` 行不删除，只墓碑化：`note`、`reason_detail` 置空，`payload` 改为 `{"tombstone": {reason, at, by}}`；种类、目标、执行者、时间与 `seq` 不变。这是 `06` §6.3 `decisions_no_update` 触发器的唯一例外，与事件的墓碑化（`02` §2.13）同形。Goal 行同样保留为墓碑行：`title` 改为 `（已清除）`，`abandon_reason` 置空，`labels` 置 `[]`，即置空人写的文本列；标识、状态、时间与 `owner`、`counters` 等非人写的列保留（ADR-197）。墓碑化只更新尚未墓碑化的行（例如已被“彻底忘记”墓碑化的决定不再更新，ADR-197）。这样，决定、其他 Goal 的 `parent_id` / `resurrected_from` 与 `goal_deps` 的外键仍然成立。已清除的 Goal（以 `scope = "goal"`、`id` 为该 Goal 的 `privacy.purged` 事件判定，载荷、顺序与中途崩溃的续做见 `06` §6.4.3 `privacy.purge`，ADR-197；不新增字段）不在列表与 `⌘K` 搜索中显示，也不能复活（`06` §6.4.3 `goal.resurrect`）。

| 操作 | 效果 |
|---|---|
| 彻底忘记一条记忆 | 删除全部版本；按 `02` §2.13 墓碑化相关事件（删除 `payloads` 表中的载荷，事件行写 `tombstone`，追加 `privacy.purged`）；同步目录写墓碑；以它为对象的 Needs-You 条目删除；聚合的 `ratify` 条目（每天每作用域一条，`08` §8.4）不整条删除，而是从其对象中移除这条提议，按剩余对象重算“N 项待批准”与证据，对象为空时以 `obsolete` 关闭（`08` §8.8，ADR-198）；相关决定（`ratify_memory`、`edit_memory` 等）按上方“数据库中的墓碑”处理。Tower 自己写出的 Run 目录开场文件（`brief.md`、`contract.md` 的 `## Memory` 等，§9.12.1）中，该条文本改写为 `[已清除的记忆]`（ADR-196；改写需要原文，`Notes:` 行不带条目 id，因此在数据库事务之前执行，`06` §6.4.3，ADR-198）。**注意**：这条记忆被注入过的 Pi 会话 JSONL 中仍有原文，而 Tower 从不改写 Pi JSONL（`02` §2.6）。因此 UI 会列出受影响的会话文件，并对已归档或放弃的 Goal 提供“一并删除这些会话”的选项（人的选择随命令的 `sessionIds` 写入同一事务的事件，崩溃后按事件续做；已移入年度归档包的会话同样删除，按下一行同一方式重写归档包，`06` §6.4.3，ADR-199/200）；进行中 Goal 的会话只列出。数据库日备份与周备份按下一行同样如实列出 |
| 清除一个 Goal | 删除 Tower 自有的、可能含该 Goal 内容的全部副本（存储位置见 §9.12.1）：<br>• `~/.tower/goals/<goalId>/` 整个目录：Pi 会话、Run 目录、证据与验证日志、重放包（`07` §7.4.1）、导出包、影子 git 目录——含未写完的交还 `refs/tower/<goalId>/handback-t1`（`10` §10.3.2）：它可能是你交还而未写完的改动仅剩的副本，所以有它时确认框单独列出 `未写完的交还（保存在 Tower 中）将被删除`，结果同样列出（ADR-239）；<br>• 备份 bundle `goal-bundles/<projectId>/<goalId>.bundle`；<br>• 卫星及其分离 gitdir、`_stores/<goalId>`、`$TMPDIR/tower-<goalId>/`（含 `project.relocate` 之前的旧位置——`Project.settings.relocatedFrom` 中的旧 `<wtRoot>`，`06` §6.4.3，ADR-237）；人工编辑与检验检出及本 Goal 的各 `.kept-*` 目录按上方“人的工作现场”保留并列出；仍载有本 Goal 内容的验证槽位立即重置；<br>• 镜像库中该 Goal 的全部 ref：`refs/tower/<goalId>/base-snapshot`、`refs/tower-live/<goalId>/*`、`refs/tower-retain/<goalId>/*`。除仍可经用户分支副本到达的对象外（见下方“用户仓库”一条），对象随之不可达，由之后的镜像 gc 在宽限期后删除（`10` §10.17.1，ADR-083）；<br>• 数据库（同一事务，按外键先删引用者，ADR-196）：删除本 Goal 的合同、绑定、Run、会话、检查点、Fact、Claim、评审单元、评论、`engine_outbox`、计时器、水位、以本 Goal 为 owner 的 Needs-You 条目（含已解决的）与 Goal 记忆（同步目录写墓碑）；来源为本 Goal（`provenance.goalId`）且仍为 `proposed` 的项目或用户记忆提议同样删除，以它们为对象的 Needs-You 条目与相关决定按“彻底忘记”一行处理（ADR-197）；`decisions` 行与 Goal 行按上方“数据库中的墓碑”保留为墓碑；事件按 `02` §2.13 墓碑化，审计事件只删载荷；`projections` 中本 Goal 的快照删除，含本 Goal 的全局快照（看板等）在同一事务之后立即重写，`recovery/last-board.json` 随之重写；`recovery/journal.jsonl` 只在安全模式下写入、正常模式下已重放，一并清空（`06` §6.1.7）；渲染进程的搜索索引（`13` §13.4.1）同时丢弃本 Goal 的条目（ADR-197）；<br>• 按名字属于本 Goal 的日志（`host-<goalId>.log`、本 Goal 各 Run 的 `rpc-<R>.stderr.log`）。不能按 Goal 区分的共享日志（`supervisor-*.jsonl`、`main.log`、`verifier.log`）、诊断包与崩溃转储一并清空；<br>• 会话归档包 `sessions-<年>.tar.zst` 中有本 Goal 的会话时，重写该年度归档包（写新包后原子替换）。<br>**不改写、如实列出**：<br>• 日备份与周备份（`06` §6.6.3）中仍有被清除的载荷，结果写明“N 份数据库备份中仍含被清除的内容，最晚于 <日期> 过期；在它们过期之前，系统备份的新快照同样会含有这些内容”（ADR-196：不提供立即删除，过期即删）；<br>• 迁移前备份 `pre-migrate-v<N>.db` 没有保留期，结果逐个列出，由人选择删除（删除后不能回滚到该次迁移之前）；<br>• Pi 写出的输出文件——bash 截断输出的全文、MCP 截断结果的全文（`pi-mcp-*.txt`）与二进制资源、codemode 的溢出文本与图像——在承载该 Goal 的 Host 的临时目录 `~/.tower/tmp/<hostId>/` 中（`05` §5.3.6，ADR-224），不能按 Goal 区分：清除不逐个删除它们，它们随该 Host 进程退出删除，承载它的 Host 仍在运行时（打包模式下还承载其他 Goal）结果写明“运行中的 Host 的临时目录中可能还有本目标的输出文件，将在它退出时删除”；bash 的全文由观察器在复制为证据后删除（`07` §7.2.2、`11` §11.7.1 残余，ADR-221/222/224） |
| 清除一个 Project | 对其下每个 Goal 执行上一行；另删除项目记忆、VerifyProfile、记分板行、depcache 中对应的条目与该 Project 的镜像库，以及数据库中的 Project 行、`project_checkouts`、`project_local_files`、`project_benign_targets`、`depcache_entries`、项目级 Fact 与以该 Project 为 owner 的 Needs-You 条目；目标为该 Project 的决定按上方“数据库中的墓碑”处理（ADR-196）。删除 Project 即本操作（`10` §10.3.2） |
| 清除全部 | 删除 `~/.tower` 中的全部内容（含镜像库、重放包、数据库备份与会话归档），以及各 `<wtRoot>` 下 Tower 创建的目录（卫星、`_gitdirs`、`_verify`、`_stores`）；上方“人的工作现场”所列的目录（`_human`、`_inspect` 与各 `<goalId>.kept-*`，含 `_gitdirs` 之中的）保留并列出（ADR-196/222）。编号高水位文件 `~/.tower/goal-id-hwm` 同样保留：它只含一个编号，不含目标内容，使之后新 Goal 的编号不与被保留的目录同名（`02` §2.2、`10` §10.2，ADR-198）；清除遗留清单 `~/.tower/purge-leftovers.json` 同样保留，其中这时可访问的根与上述各 `<wtRoot>` 一样处理、条目移除，只剩这时不可访问的根（只含路径与时间，见下方“不可访问的根”，ADR-238）。完成后数据库已不存在，应用回到首次运行（`04` §4.18.1，ADR-237）。**回退位置**（ADR-197）：`<wtRoot>` 为 `~/.tower/worktrees/…`（`10` §10.4.3）时，其中“人的工作现场”所列的目录（`_human/<goalId>/`、`_inspect/<goalId>/` 与各 `<goalId>.kept-*`，ADR-199/222）同样不删除：它们与其上级目录留在原路径，`~/.tower` 中除此之外（与上述高水位文件）的一切照删，因此 `~/.tower` 不作为整体删除；结果列出这些路径。Electron `userData`（Chromium 缓存与窗口状态，`06` §6.6.1）一并删除；钥匙串中 Tower 写入的模型提供商密钥与云 SDK 凭据（`11` §11.7.1）不是目标内容，不删除，结果列出，需要时在设置中移除（ADR-197）。<br>用户仓库同样不改动；结果另列出多机租约 `refs/tower/_owner`。之后再次添加该仓库时，Tower 会把它视为另一台机器的租约（`06` §6.1.9）；没有其他机器上的 Tower 使用该仓库时，可在仓库中自行执行 `git update-ref -d refs/tower/_owner` |
| 审计链 | 不受影响：`11` §11.11 的哈希链对载荷哈希成链，删除载荷不破坏可验证性（`02` §2.13） |

**清除之后仍可能存在的副本**（Tower 无法删除，清除结果如实列出）：
- **系统备份**：`tower.db`、`goals/`、`db-backups/` 默认保留在系统备份（如 Time Machine）中（`06` §6.6.1“备份排除”）。已备份的副本不随清除删除；`db-backups/` 中尚未过期的数据库备份在过期之前也会进入此后的系统备份快照。需要时由你在备份工具中删除对应快照（`11` T24）。
- **从清除之前的数据库备份恢复**（ADR-215）：这样的备份仍含被清除 Goal 的事件，而它们引用的路径集合文件已随 `goals/<goalId>/` 删除；在恢复的库上重建时，重建报错停止、不替换现有的库，并列出缺失的文件（`06` §6.3“载荷中的路径集合”）。恢复办法：对缺失文件路径中的 Goal 重新执行清除（在该备份中尚未终结的，按上文的状态前提先放弃），再重建。
- **不可访问的根**（唯一定义，ADR-237；清单的内容、写入次序、列出范围与移除，ADR-238；`06` §6.1.6 隐私清除一行、§6.4.3 `privacy.purge` 与 §6.6.1 引用）：清除一次完成，从不推迟，也没有之后会删除数据的续做。每个根只按 `roots[].wtRoot` 判定可访问性（`stat`，经 `13` §13.5 的同一组线程与 5 s；不读 Project 行与附着检出）。确认框列出这时不可访问的 `<wtRoot>`（外接盘没有插上等），写明其下 Tower 创建的目录（卫星、`_gitdirs`、`_verify`、`_stores`）**这次不会删除，之后 Tower 也不会自动删除**，你确认后才执行；这些根不写入事件的 `roots`，只记入清除遗留清单 `~/.tower/purge-leftovers.json`。**清单只存列出所需的最少内容**：`[{wtRoot, at}]`——根的路径与最近一次记入的时间，不存 Project、Goal 或目录名；同一个根只有一条（再次记入只更新 `at`）；Tower 自有、在数据库之外，只用于列出，从不触发删除。**写入次序**：清单先写入并落盘（写临时文件、`fsync` 后原子改名），再提交清除的数据库事务与不带 `filesDone` 的事件；执行或崩溃续做中才变为不可访问的根同样先记入清单，再追加 `filesDone: true`。所以任何时刻崩溃，一个未删除的根不是在 `roots` 中（续做照常），就是在清单中（照常列出）；清单多出一条而清除没有提交时，只是多列出一个位置——列出范围不含仍有当前记录的目录（见下），不会把活跃的工作目录列为遗留。其余——`~/.tower` 中的副本与可访问的根——在这一次中删除，完成即追加 `filesDone: true`，`all` 档随后删除数据库。执行中变为不可访问的根在结果中列出；崩溃续做中的没有命令结果可以承载，只由存储面板列出（`06` §6.1.6）。**列出范围**只按 `10` §10.2 “列出的来源”（唯一定义）：清单中的根重新可访问时，存储面板把其下 Tower 创建、**已没有当前 `WorktreeRecord`** 的目录列为 `清除时未删除（当时不可访问）`，由你在“清理工作目录”中一键删除（`10` §10.3.2）；同一位置上其他 Goal 仍在使用的卫星有当前记录，不在其列。**条目的移除**：其下已没有这类目录时该条目移除；不可访问的条目（例如那块盘已不再使用）在“清理工作目录”中可 `从列表移除`——只删清单中的这一条，不访问、不删除磁盘上的任何内容；`all` 档把清单中这时可访问的根与其他根一样处理（其下 Tower 创建的目录删除，人的工作现场保留并列出），并移除这些条目，这时不可访问的根照上文记入或保留。所以“清除全部”之后清单中只剩当时不可访问的根的路径，你可在存储面板中把它们移除（如实登记：在移除之前，这些路径——含 `10` §10.2 默认位置中的仓库名——留在 `~/.tower` 中）。崩溃之后的续做在接受界面命令之前完成（`06` §6.1.6），所以清除不会删除此后新建的数据，`project` 档也不会删到再次添加的同一项目（同一 ProjectId）此后的 `~/.tower` 内容。
- **用户仓库**：上述 ref；以及已写入用户仓库对象库的 seal 对象，由 git 自己的回收管理。Tower 镜像库以 `refs/user/heads/*` 保存用户分支的副本（`10` §10.3.1），其中的 Goal 分支副本使 seal 对象在镜像中仍可达。这些副本不随“清除一个 Goal”删除：你删除这些分支后，下一次镜像获取（带 `--prune`）删除对应副本，对象之后由镜像 gc 回收（ADR-197）；仍存在的副本在清除该 Project 或清除全部时随镜像库一并删除。
- **Tower 之外的副本**：同步目录为 git 仓库时的历史（§9.12.3“删除”一行）、你自行导出的文件、已发送给模型提供商的内容（§9.12.1“会离开本机的数据”）、系统通知中心中已显示的通知文本。
- **Pi 的 MCP 日志**（ADR-230）：内置 MCP 扩展把服务器发来的日志消息（`notifications/message`）逐条追加到用户 agentDir 的 `mcp.log`，超过 5 MB 时轮转为 `mcp.log.1`（v1.2.0 `extensions/mcp/index.ts:369-371`、`extensions/mcp/log.ts:1-5, 43-56`；Tower 构造内置 MCP 扩展时只传 `createTransport`、不传 `logPath`，`05` §5.3.5 “MCP 继承用户的 Pi 配置”一条；`getAgentDir()` 随 Host 环境的 `PI_CODING_AGENT_DIR` 落在用户 agentDir，`05` §5.3.6 “Pi 运行开关”一行，ADR-231）。其中可能有 Goal 中的路径、查询与工具参数；它由 Pi 写入、终端中的 `pi` 与 Tower 共用，不能按 Goal 区分，Tower 不删除，结果列出这两个路径，需要时由你删除。
- **从本 Goal 提炼并已批准的项目或用户记忆**：它们是独立条目，不随 Goal 清除，可逐条“彻底忘记”。
- **派生到其他 Goal 与汇总条目中的内容**（ADR-197）：复活出的新 Goal（`resurrected_from` 为本 Goal）的合同以旧合同为起草输入，子 Goal（`parent_id` 为本 Goal）的标题与合同来自本 Goal 的计划。它们是独立的 Goal，不随清除改动，结果逐个列出，可分别清除。项目或全局汇总的 Needs-You 条目（`digest`、`flood`、`backlog`）的标题与证据中可能有本 Goal 的标题或摘录：不改写，结果列出条数，随其 owner 的清除删除（项目级随清除该 Project，全局级随清除全部）；`ratify` 条目不在此列，按上表“彻底忘记”一行从对象中移除被删除的提议并重算（ADR-198）。
- **事件的载荷哈希**：墓碑化后事件行仍保留 `payload_hash`（`06` §6.3，未加盐）。对低熵的载荷（如简短的作答），拿到数据库的人可以验证猜测的内容；M2 计算哈希链时考虑以本机密钥做带密钥哈希（ADR-197）。


---

## 9.13 默认值汇总

| 键 | 默认 |
|---|---|
| 常驻记忆预算 | 120 token（ADR-009）；其余相关条目至多 20 条写入 `contract.md` |
| 单条长度 | `text` ≤ 80 token（ADR-032 口径，约 120 汉字 / 320 英文字符）；`detail` ≤ 600 字符，只按需 |
| 污染 | 默认带污染；只有人类原话 + Harness 事实来源为 `none`；`standard` 逐条确认，`high` 需编辑或输入确认 |
| 学习效果评估 | 满 10 个相关 Goal 或 60 天；有效 `P(r1<r0) ≥ 0.9`；无效果判定需 15 个相关 Goal |
| 选择阈值 | score ≥ 0.2；Run 中途不注入 |
| 复审周期 | user 180 天 / project 120 天；久未使用 90 天 |
| 提议上限 | Agent 每 Run 5 条；学习闭环每项目每天 5 条；14 天过期 |
| 学习起草预算 | $0.50/天 |
| 记分板窗口 | 90 天；n ≥ 10 才显示；n < 30 显示区间 |
| 抽样深审 | N = 10（风险加权），默认关闭 |
| 同步 | 关闭；写出防抖 10 s；HMAC 必需；版本向量合并 |
