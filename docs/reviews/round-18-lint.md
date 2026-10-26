# 第 18 轮 · 一致性 lint 报告（ADR-039）

日期：2026-10-15 · 范围：`docs/00`–`docs/16`、`README.md` · 依据：`16-registry.md`、`15` ADR-001–144 与 ADR-144 补记、ADR-133 第 18 轮补记（M1 = 37 个日历周，2026-11-09 → 2027-07-23）、`reviews/round-18.md`（R18-D15-01）及 5 份第 18 轮回应。只做机械修正，需要设计裁决的列入 §4。

## 1. 结果

```
$ python3 docs/reviews/lint/xref.py --checks rstuvwxyzckdnSe ; echo exit=$?
headings=558 adrs=144 section_refs=3029 problems=0
(r) unique-definition contradictions=0
(s) three-way enums: 8/8 consistent
(u) SP6b batch-table disagreements=0
(v) remote-matrix coverage problems=0 (commands in 06 §6.4.3: 80)
(w) Needs-You kind/dedupe/outcome problems=0
(x) default data vs examples: default-benign targets ['~/.ssh/known_hosts']; problems=0
(w′) pauseReason → Needs-You problems=0
(y) cross-column CHECK vs 16 problems=0
(z) push/PR/remote polling presented as M1=0
(c) continuation literal shape vs 02=0
(d) deleted mechanism names outside history=0
(n) contract-test references=0
(k) 03 §3.2.1 rewrite targets vs 06 §6.4.3=0
(s′) enum values used in rule text / pseudo-code outside the registered set=0
(e) ADR back-markers: 87 supersede/amend pairs, missing=0
(t) open markers=0
exit=0
```

**全部检查通过。** (s′) 在命令行中写作 `S`（`--checks` 参数逐字符解析）。

修正前 (e) 有 **25 处缺少反向标记**（§2.1），(s′) 为 0。`author === "mixed"` 一类写法在第 18 轮各作者的修订后已不存在，本轮由 (s′) 防止再次出现。

## 2. 修正清单

### 2.1 ADR 反向标记（检查 e，`15`）

从各 ADR 的 “Supersedes/Amends ADR-n”（标题与正文）推出 87 对。其中 25 对在被修订的 ADR 标题中缺少反向标记，已在标题括号末尾补上 “Amended by ADR-k” 或 “部分 Superseded by ADR-k”：

| 被修订的 ADR | 补上的后续 ADR | 被修订的 ADR | 补上的后续 ADR |
|---|---|---|---|
| ADR-058 | ADR-080 | ADR-128 | ADR-135；部分 Superseded by ADR-142 |
| ADR-060 | ADR-081（073、075 已含在原有的 “071–075” 中） | ADR-129 | ADR-135、ADR-138 |
| ADR-062 | ADR-085 | ADR-131 | ADR-136 |
| ADR-063 | ADR-085 | ADR-132 | ADR-133 |
| ADR-094 | 部分 Superseded by ADR-134 | ADR-133 | ADR-136 |
| ADR-115 | ADR-138 | ADR-134 | ADR-137 |
| ADR-119 | ADR-133 | ADR-135 | ADR-138、ADR-139 |
| ADR-125 | ADR-131、ADR-136 | ADR-139 | ADR-143 |
| | | ADR-140 | ADR-144 |
| | | ADR-141 | ADR-144 |
| | | ADR-142 | ADR-144 |

R18-D15-01 第 12 项点名的 ADR-137、ADR-138、ADR-139 的进程识别与 `openings` 部分，作者已在本轮补上标记。本轮补上的是同一类遗漏的其余部分。

### 2.2 已改变规则的旧表述（第 3 项任务）

逐类搜索的结果：

| 类别 | 发现 | 处理 |
|---|---|---|
| 按触发来源或 `verifyOrigin` 描述失败去向（应按归因窗口，ADR-140/144） | 4 处 | 均已改写，见下 |
| 静默“到本 Run 结束”（应为“继续之后开始的那个 Run”） | 0 | `02` §2.7、`05` §5.6.5、G41 已由作者修正 |
| 继续目标携带数据 | 0 | (c)(d) 均通过 |
| pid / pgid 身份 | 1 处（`16` 废弃表中一行的替代栏） | 已改，见下。`07` §7.4.4 的 `-pgid` 是验证槽位进程组的信号目标，与 Agent 进程识别无关，保留 |
| 拒绝路径 64 条上限 | 0 | 正文中只剩兜底重试的 64 次上限，见 §4 U1 |
| `idle_without_submit` 的“一次提醒后” | 0 | `03` §3.2 只剩 `shaping` 行（M2）的“一次提醒后仍无”，属于不同机制，未改 |
| M1 = 36 周 | 0 | “36 周”只出现在 `14` 的历次演变与第 16 轮处理段、`16` 废弃表中。自用期第 34–36 周与 37 周计划一致 |

失败去向的四处改写：

- **`02` §2.2 `Continuation` 的 `claim` 注释**：“失败按 Agent 路径”→“失败去向按 `03` §3.2.1 的归因窗口；`claim_on_behalf` 不移动窗口起点（ADR-144）”。
- **`03` §3.2.1 `human` 行的交还说明**：“`reverify` → 新 pin，`verifyOrigin:"human_change"`，失败不自动返工”→ 写明“交还的检查点为 `author:"human"`，窗口内有人的改动，因此不自动返工——由归因窗口决定”。
- **`03` §3.2.1 `human_change_verify_failed` 行的入口**：“自上一个已验证 pin 以来存在 `author:"human"`/`mixed` 检查点”是 ADR-140 的旧窗口，且把 `mixed` 当作作者值 → 改为“归因窗口内有人的改动（`author:"human"` 或 `mixedPaths` 非空的检查点）”。同一句中的 rebase 子句见 §4 U2。
- **`05` §5.8 交还“直接重新验证”**：只写结果、不写原因 → 加上“交还的检查点为 `author:"human"`，按 `03` §3.2.1 的归因窗口”。

身份识别一处：

- **`16` §16.1.13**：“settle 时 SIGTERM，5 s 后 SIGKILL”一行的替代栏仍写“`(pid, 启动时间)` 身份确认”→“进程以 `TOWER_RUN_TOKEN` 识别（ADR-142）”，依据加 ADR-142。

### 2.3 lint 工具（`reviews/lint/xref.py`）

- **新增 (s′)（参数 `S`）**：在规则正文与伪代码中抓取以下五类枚举引用，检查取值属于 (s) 已比对过的登记集合：
  - `author ===/:/= "x"`
  - `paused(x)`、`pauseReason ===/: "x"`、`pause_reason = 'x'`
  - `continuation.kind === "x"`、“继续目标改写为 `x`”
  - `human.decision{x}`、`HumanDecision{kind:"x"}`
  - Needs-You 语境中的 `kind:"x"`

  `author` 的判定区分语境：检查点语境只允许 `agent`/`human`；hunk 或路径语境（hunk、评审单元、`mixedPaths`、`externalPaths`、“路径”）允许 `02` §2.8 `ReviewUnit` 的 `agent`/`human`/`external`/`mixed`；`Claim.author` 的 `worker`/`reviewer` 不在此列。跳过 `15` 与 `16` §16.1.13。
- **新增 (e)**：从后续 ADR 的 “Supersedes/Amends ADR-n” 推出修订对（支持 `ADR-088/090` 与 `、` 列举），要求 ADR-n 标题中 “Amended/Superseded/取代” 之后出现 ADR-k，或出现覆盖它的区间（如 `ADR-071–075`）。
- **注入验证**：在临时副本中注入以下错误，全部被检出：
  - `cp.author === "mixed"`（检查点语境）
  - `paused(stop_reason_x)`
  - `continuation.kind === "pause"`
  - `human.decision{adopt_external_hunks}`
  - Needs-You `kind: "stopped"`
  - 删去 ADR-141 标题中的 “Amended by ADR-144”
  
  同一副本中 hunk 语境下的 `author:"mixed"` 正确地未被报出。

## 3. R18-D15-01 清单核验

| # | 内容 | 现状 |
|---|---|---|
| 1 | `07` 的 `returnTo` | 已关闭（`07` §7.10.3 的继续目标表：`review` → `review.state`；从 `verify` 改写时取当时的 `Goal.verifyFrom`，与 `03`/`02`/`16` 一致） |
| 2 | `03` 缺 `takeoverPriorReasons` | 已关闭 |
| 3 | `03` 按触发来源描述失败去向 | 已关闭（作者修正 L58、图、L82、I4；本轮补 §3.2.1 两处，§2.2） |
| 4 | `02` `verifyOrigin`“决定失败后的去向” | 已关闭 |
| 5 | 静默范围措辞 | 已关闭 |
| 6 | `06` `verifyFrom` 写入点 | 已关闭 |
| 7 | `idle_without_submit`“一次提醒后” | 已关闭 |
| 8 | `06` §6.2.2 GitService 的 64 条/循环 | 已关闭（改为“一次列出、兜底重试”）；兜底重试的 64 次上限见 §4 U1 |
| 9 | G33b(a)“意图取自 `decisionId`” | 已关闭 |
| 10 | cgroup 粒度 | 已关闭（`06` §6.1.10 引用 `10` §10.3.1：每个 Goal 一个） |
| 11 | `06` §6.2.4 步骤编号 | 已关闭（a–g） |
| 12 | ADR 反向标记 | 本轮关闭（(e)，§2.1） |
| 13 | `05` “进程组策略见下方说明（ADR-135）” | 已关闭 |

### 3.1 连续两轮以上未关闭的条目

R18-D15-01 中标为“第二轮以上”的残留（#2、#7、#8）均已关闭。本轮新列的两个未决项（§4）都是第一次出现。

## 4. 需要设计裁决的问题（未修改）

| # | 问题 | 位置 | 说明 / 选项 |
|---|---|---|---|
| U1 | **git 拒绝收录时兜底重试是否有 64 次上限** | 见下 | ADR 文本与规范位置相反 |
| U2 | **rebase 触发的验证失败是否例外地不自动返工** | 见下 | 唯一规则没有这一例外，但两处入口条件写了 |

U1 的两方：

- **ADR-139 第 16 轮补记**写“一次列举……因此不存在重试上限”；ADR-136 的划线注记写“无重试上限”。
- **`10` §10.1.2**（规范位置）写“git 仍拒绝时作为兜底加入排除集合重试……兜底重试超过 64 次时停止重试，以已排除的路径完成”；`06` §6.2.2 与 `13` §13.11.1 相同。

选项：(a) 保留兜底重试与 64 次上限，在 ADR-139 补记中写明（“一次列举为主，Tower 规则与 git 版本有差异时兜底重试，≤ 64 次”）；(b) 取消兜底重试，同步改 `10`/`06`/`13`。

U2 的两方：

- **ADR-140/144 的唯一规则**：失败去向只看归因窗口，窗口内有人的改动才不自动返工；没有 rebase 例外。
- **`03` §3.2.1 `human_change_verify_failed` 行的入口**与 **`07` §7.10.3 `decide`** 都写“或本次由 rebase 触发（M2）”。按唯一规则，Tower 自动 rebase 产生的变化不是人的改动，失败应走 Agent 路径；按这两处则不自动返工。

选项：(a) 把 rebase（M2）作为明文例外写进 ADR-144 与 `03` §3.2.1 开头的唯一规则；(b) 删去两处的 rebase 子句。

此外有一处观察，不影响 lint，未改：`03` §3.2 `shaping` 行（M2）的 `no_proposal` 写“一次提醒后仍无”。ADR-129 删除的是 Supervisor 侧针对 `submit` 的提醒回合；塑形阶段的提醒由谁发出、是否同属已删除的机制，文档未说明，建议塑形在 M2 定稿时一并明确。

## 5. 复现

```
python3 docs/reviews/lint/xref.py --checks rstuvwxyzckdnSe
```

新增 ADR 修订既有 ADR 时，在被修订 ADR 的标题中补 “Amended/Superseded by ADR-k”，(e) 会检查。新增枚举取值时先登记到 (s) 比对的三方，(s′) 才会接受正文中的引用。

## 主干裁决

- U1：保留兜底重试（最多 64 次，超过按 `nested_repo`/`nested_repo_live` 阻断，不是 `verify_env_error`），`10`/`06`/`13` 现行写法即为裁决结果；ADR-139/144 补记已写明。
- U2：rebase（M2）带入的变化计为归因窗口内的人的改动，不设单独例外；`03` §3.2.1 与 `07` `decide` 已改。
- 复跑 `--checks rstuvwxyzckdnSe` → exit 0。
