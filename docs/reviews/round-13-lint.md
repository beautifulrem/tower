# 第 13 轮 · 一致性 lint 报告（ADR-039）

日期：2026-10-15 · 范围：`docs/00`–`docs/16`、`README.md` · 依据：`16-registry.md`、`15` ADR-001–127 与 ADR-119 第 13 轮补记（M1 维持 33 周，WBS 102.6）、`reviews/round-13.md`（R13-D15-01）及 5 份第 13 轮回应。只做机械修正，需要设计裁决的列入 §4。

## 1. 结果

```
$ python3 docs/reviews/lint/xref.py --checks rstuvwx ; echo exit=$?
headings=553 adrs=127 section_refs=2731 problems=0
(r) unique-definition contradictions=0
(s) three-way enums: 8/8 consistent
(u) SP6b batch-table disagreements=0
(v) remote-matrix coverage problems=0 (commands in 06 §6.4.3: 79)
(w) Needs-You kind/dedupe/outcome problems=0
(x) default data vs examples: default-benign targets ['~/.ssh/known_hosts']; problems=2
SEV2_EXAMPLE_NON_SEV2_CATEGORY  04  533  user_config  … `◆ 沙箱拒绝 · user_config · write · ~/.gitconfig ×2` …
SEV2_EXAMPLE_NON_SEV2_CATEGORY  04  810  user_config  … 类别 user_config · 操作 write · 目标 ~/.gitconfig …
(t) open markers=0
exit=1
```

**除 (x) 的 2 条外全部通过**。这 2 条是同一个设计分歧（§4 U1），没有机械修法，因此本轮不是完全干净的运行。

| 检查 | 结果 |
|---|---|
| 断链（`xref.py`） | 2731 处、553 个标题、ADR-001–127：0 |
| (r) 唯一定义 | 15 个概念，0 处矛盾（§2.1 列出本轮新增与更新的概念） |
| (s) 三方枚举 | 8/8 一致：Goal state 12、PauseReason 17、HumanDecision.kind 48（ADR-122 删去 2 个）、Checkpoint landmark 9、Checkpoint.author 2、anomaly 检测器 9、**verifyOrigin 7**（新增）、**NeedsYouItem.kind 16**（新增，含 `anomaly`） |
| (t) 未关闭标记 | 0 |
| **(u)** SP6b 批次表 | 以 `14` §14.2 批次表为唯一来源（B0–B4 的周次与用例），甘特图与其他文档中的 `B<n>（周`、`第 N 周 G…`、`B<n>：G…` 写法 0 处不一致 |
| **(v)** 远程矩阵覆盖 | `06` §6.4.3 的 79 条命令：在 `16` §16.5 有行且 scope 一致，或落在新增的总规则 4 下。修正前 23 条既无行也无默认规则，`project.merge`/`split` 在 `06` 中标为禁止远程，但矩阵中没有 ✗ 行（§2.3） |
| **(w)** Needs-You 闭环 | 16 个 kind 在 `08` §8.4 都有去重行、在 §8.8 都有标注行；检测器专属行（`sandbox_violation`、`bg_process_survived`）两表对应；去重键前缀唯一（`s` / `sv` / `an` 等互不重复）；`07` §7.10.1 的路由只用已登记的 kind |
| **(x)** 默认数据与示例 | 默认良性目标 `~/.ssh/known_hosts` 没有被任何 G 用例或线框当作 sev 2 示例；**另一子项**（sev 2 示例的 `category` 必须属于 `16` 的 sev 2 集合）命中 `04` 两处，见 §4 U1 |
| 旧检查 | §16.8 表 0；实况行英文模式名 0；`take_over_from` 0；DDL `CHECK` 值未登记 → 已补（§2.4） |
| 残留扫描 | `adopt_external`、`revert_external_hunks`、`goal.review.adopt` 只在 `16` §16.1.13 废弃表与 ADR 历史中；`author:"external"` 只作 drain 期间的逐路径归因（ADR-122），无“待处置”状态；`a:{goalId}:bg` 0；“停止 Agent 的后台进程后继续”只在 `04` §4.8.8 中作为“不提供”的说明 |

## 2. 修正清单

### 2.1 lint 工具（`reviews/lint/xref.py`）

- **(r) 新增概念**：
  - `an:` 去重键（`08` §8.4，ADR-126）；
  - 可执行/重定向配置键清单（`16` §16.2.6；覆盖对话框处列键而不引用 `16` 即为矛盾）；
  - `category / op / target`（`16` §16.1.6；“目标根”“targetRoot”“同类目标去重”为矛盾）；
  - I4 以工具事件判定（`03` §3.3；“指纹一致”“`Run.submit.fingerprint ==`”为矛盾）；
  - 默认良性清单（`16` §16.1.6）。
- **(r) 更新概念**：
  - “撤销外部改动”合并为“归因基线”，并把 ADR-122 删除的命令、决定种类与“外部 · 待处置”列为矛盾；
  - settle 顺序按 ADR-121 反转判据：宽限在终止之前，“终止 … → 宽限”为矛盾；
  - `sv:` 键改为 `sv:{goalId}:{category}:{op}:{target}`。
- **(s)**：新增 verifyOrigin 与 NeedsYouItem.kind 两组比较。`needs_you` 的解析改为匹配 `CHECK (kind IN`，避免误取 `owner_kind`。
- **新增 (u)(v)(w)(x)**：判据写在文件头。退出码在 (r)(s)(u)(v)(w)(x) 有任一发现时非零。
- **验证**：在临时副本中注入了每种错误，均被检出：
  - B3 周次错、G 用例周次错、G 用例批次错；
  - 去重键前缀重复；
  - 默认良性目标被当作 sev 2；
  - 七种 (r) 矛盾写法。

### 2.2 文档：唯一定义与残留

- **`category / op / target`（ADR-125）**：
  - `11` §11.6.2：“按 (类别, 目标根) 去重”→“按 `(category, op, target)` 去重”；E7 统计口径同改。
  - `16` §16.1.6 `sandbox_violation` 行、`12` §12.12 `RunAnomalies`（“同类目标去重”）、`14` §14.5.1 E7 指标（“按目标根……分组”）：同上。
- **覆盖后写出改为白名单（ADR-124）**：
  - 改为“`objects/**`（不含 `objects/info/**`）、`refs/**`、`packed-refs` 写 pin 版本，其余写 base 版本”：`11` §11.6.2、`11` T29、`14` G29、`16` §16.2.6（原文都是 ADR-116 的“git 元数据文件写 base 版本”）；
  - `16` §16.1.13 对应废弃行的替代栏同步。
- **settle 顺序（ADR-121）**：`16` §16.1.13 中“SIGTERM，5 s 后 SIGKILL”一行的替代栏仍是 ADR-115 的旧顺序 → 改为“2 s 宽限 → 终止并等待 → `agent_bg_done` → `claimed` → pin”。
- **I4（ADR-121）**：`02` §2.6 `Run.submit` 的注释“submit 工具调用 + 当时的工作区指纹”→ 有效性以工具事件判定，`fingerprint` 只作信息性记录。
- **`Checkpoint.externalPaths`（ADR-122）**：`10` §10.7.1 有此字段，`06` §6.3 `checkpoints` 表缺列 → 补 `external_paths`（JSON）。

### 2.3 远程矩阵（`16` §16.5）

- **新增总规则 4**（“三条总规则”→“四条总规则”）：未单列的命令按 `06` §6.4.3 的 scope 列与 `06` §6.4.7 的 scope 定义授权，web 与 mobile 相同，手机 UI 可不提供入口；`06` 标为“禁止远程 / 仅本机”的命令必须在矩阵中单列为 ✗。这一条是把 `06` §6.4.7 已有的 scope 定义（“`full`：除禁止远程的命令外都可以执行”）写进矩阵，主干如需对某些命令另作限制，应在矩阵中单列。
- **新增行**：“合并 / 拆分项目（`project.merge`/`split`）”仅本机（`06` §6.4.3 已标为禁止远程）。

### 2.4 注册表与 ADR 注

- **`16` §16.1.12**：
  - `agent_proc.gone.how` 补 `reboot`（ADR-121），身份键改为 `(bootSession, pid, startTime)`；
  - 新增 `engine_outbox.state` / `timers.state` 行。这两组 DDL `CHECK` 值自第 2 轮起一直未登记，本轮补上。
- **`16` §16.1.13 新增废弃行**：
  - I4 以指纹判定（ADR-121）；
  - 旧的 `sv:` 键与“(类别, 目标根)”单位（ADR-125）。
- **`15` 修订注**：
  - ADR-025 ← ADR-121（将 ADR-115 注加删除线）；
  - ADR-115 ← ADR-121；ADR-116 ← ADR-124；ADR-117 ← ADR-125；ADR-118 ← ADR-127；
  - ADR-120 的 U2 中“按外部写入处理”← ADR-122。

## 3. R13-D15-01 清单核验（第 1–10 项）

| # | 内容 | 现状 |
|---|---|---|
| 1 | `10` “不会有 Agent 进程写卫星” | 已关闭（加了 `bg_process_survived` 存活者的例外） |
| 2 | `06` “确认保留后 `resume`” | 已关闭（0 处） |
| 3 | 非回合检查点回退的 M1/M2 | 已关闭（`04`、`05`、`10`、`12`、`14` 均为“M1 显示、回退 M2”） |
| 4 | ADR-119 “合计 1.1” | 已关闭 |
| 5 | 默认良性清单与 G32b、`04` | 默认清单已统一（`(system, write, ~/.ssh/known_hosts)`），(x) 主项通过；`04` 示例改用 `user_config` 后引出 §4 U1 |
| 6 | 覆盖对话框配置键三份清单 | 已关闭（`04`/`07`/`10` 引用 `16`；(r) 概念已加） |
| 7 | 规则 F 的“n ≥ 20、M2 起” | 已关闭（`04`/`07`/`08`/`11`/`16` 逐处含两项） |
| 8 | `03` `claimed` 的进入条件 | 已关闭（含终止与 `agent_bg_done`，顺序按 ADR-121） |
| 9 | `00` §0.5.1 L81/L84 重叠 | 已关闭（合并为一行，含 base 豁免） |
| 10 | lint 漏检 | 本轮关闭：(u)(v)(w)(x) 已写入 `xref.py` |

### 3.1 连续两轮以上未关闭的条目

无。第 12 轮的 HFS+ 一项已由 ADR-120 关闭；本轮唯一未决项（U1）是第 13 轮新出现的。

## 4. 需要设计裁决的问题（未修改）

| # | 问题 | 位置 | 说明 / 选项 |
|---|---|---|---|
| U1 | **`user_config` 的沙箱拒绝是否为 severity 2** | 下文两方 | ADR-125 指定 `04` 线框与 G32b 的良性对照改用 `~/.gitconfig`（`user_config`），但没有规定哪些类别是 sev 2 |

U1 的两方：

- **`16` §16.1.6**（字段的唯一定义）：sev 2 集合只有 `credential`、`tower_data`、`user_checkout`、`other_satellite`，因此 `user_config` 为 sev 1。`14` G32b 与此一致：写 `~/.gitconfig` 被拒 → severity 1。
- **`04`**：§4.6.5 验收面板的 `◆ 沙箱拒绝 · user_config · write · ~/.gitconfig ×2`，以及 §4.8.6 整张 sev 2 Needs-You 卡片（含“这是良性的”与把 `(user_config, write, ~/.gitconfig)` 加入良性清单）。按 `16`，这张卡片不会出现。

选项：

- **(a)** 把 `user_config` 加入 `16` 的 sev 2 集合，并相应修改 G32b；
- **(b)** 保持 `16`，把 `04` 的两处示例改为 sev 2 集合中的目标，例如 `tower_data · write · ~/.tower/…`，与 G32b 中“对 `tower_data` 写拒绝选这是良性的”一致。

裁决前 (x) 会持续报这 2 处。

## 5. 复现

```
python3 docs/reviews/lint/xref.py --checks rstuvwx
```

各检查的判据见 `xref.py` 文件头。新增唯一定义概念时在 `UNIQUE` 中加一行；SP6b 批次只改 `14` §14.2 的批次表；新增命令时在 `16` §16.5 单列或确认它适用总规则 4；新增 Needs-You 来源时同时在 `16` §16.1.7、`08` §8.4、§8.8 登记。

---

## 6. 补记：按 ADR-125 第 13 轮 lint 补记落地 U1 后的复跑

主干裁决 U1 采用选项 (a)。severity 2 的受保护类别为：

- `credential`（读、写）
- `tower_data`
- `user_checkout`
- `other_satellite`
- `user_config`（仅写）

§2.3 的总规则 4 已确认，保留不变。

### 6.1 修改

- **`16` §16.1.6**：字段行中的“severity 2 的受保护集合”改为上述 5 个类别，`user_config` 只含写，并附裁决理由。`sandbox_violation` 行原先按路径枚举（“用户主检出、Tower 数据目录、`~/.ssh`……”），改为引用这 5 个类别。
- **`07` §7.10.1**：sev 2 行写明 5 个类别（含操作限制），唯一定义指向 `16` §16.1.6。
- **`11` §11.6.2**：把路径枚举改为 5 个类别，附各类别的含义，并引用 `16` §16.1.6。
- **`08` §8.4**：`sandbox_violation` 去重行注明“类别与操作见 `16` §16.1.6”。§8.8 没有列出类别，无需修改。
- **`06` §6.2.2（Sentinels）**：同步为 5 个类别（原为路径枚举，并写“以 `07` 为准”）。
- **`04` §4.6.5**：“运行异常”区块的置顶说明加入“对用户级配置如 `~/.gitconfig` 的写入”，类别引用 `16`。§4.6.5 的 `◆ 沙箱拒绝 · user_config · write · ~/.gitconfig` 与 §4.8.6 的卡片因此成立，不需改动。
- **`14` §14.2 G32b 良性对照**：
  - 写 `~/.gitconfig` 被拒 → severity 2 Needs-You；
  - 人选 `mark_benign` 并加入项目良性清单 → 之后同一 `(user_config, write, ~/.gitconfig)` 为 severity 1；
  - 新增对照：读 `~/.gitconfig` 被拒 → severity 1；
  - 删除原先“对一个 `tower_data` 写拒绝选这是良性的”一步，由上面的 `~/.gitconfig` 流程取代。
- **`16` §16.1.13**：新增废弃行“severity 2 集合不含 `user_config`；以路径枚举代替类别”。
- **`lint/xref.py` (x)**：子检查改为同时检查类别与操作。`16` 对某个类别限定了操作时（如 `user_config` 仅写），sev 2 示例中出现不允许的操作即报告。在临时副本中注入“`user_config · read`”与“`system · write`”两个 sev 2 示例，均被检出。

### 6.2 复跑结果

```
$ python3 docs/reviews/lint/xref.py --checks rstuvwx ; echo exit=$?
headings=553 adrs=127 section_refs=2737 problems=0
(r) unique-definition contradictions=0
(s) three-way enums: 8/8 consistent
Goal state	OK
PauseReason	OK
HumanDecision.kind	OK
Checkpoint landmark	OK
Checkpoint.author	OK
anomaly detectors	OK
verifyOrigin	OK
NeedsYouItem.kind	OK
(u) SP6b batch-table disagreements=0
(v) remote-matrix coverage problems=0 (commands in 06 §6.4.3: 79)
(w) Needs-You kind/dedupe/outcome problems=0
(x) default data vs examples: default-benign targets ['~/.ssh/known_hosts']; problems=0
(t) open markers=0
exit=0
```

全部检查通过，§4 的 U1 已关闭，第 13 轮没有遗留的未决项。
