## Tower 前端设计评审：第 8 轮复查（`d6f07ef`，对照 `3145645`）

> 当前环境规定不能写报告类 `.md` 文件，所以没有生成 `$R/report.md`（第 7 轮也是这样）。下面是完整报告，可以原样存到 `/tmp/tower-design/review8/report.md`。文中 `$R` 指 `/tmp/tower-design/review8`。

**结论：PASS（通过设计验收）。** 加权得分 8.30/10，不低于 8.0，没有未关闭的 P0 或 P1。
- 第 7 轮唯一的 P2（P2-01：长标题挤坏短标签）已修复。我在 600 个页面状态里测量，没有一个短标签折行，也没有表格超出外框。
- 本轮没有新的 P0、P1、P2。
- 新增两条 P3，都是修复不完整带出来的：
  - peek 头部现在会把“等你回答”的目标叫作“无响应”（R8-P3-01）。
  - 看板行已经不再说 Needs you，但侧栏还在说，两处对同一个目标给出不同说法（R8-P3-02）。
- 另外记录两条早就存在的 P3，不是本轮引入的（R8-P3-03、R8-P3-04）。

**设计方向：成立。**

**评审范围**
- **对象和环境**
  - worktree 是 `/tmp/tower-design/wt-review8`，HEAD 为 `d6f07ef`（detached）。
  - 用 Playwright WebKit 跑，Tauri IPC 用 stub。fixtures 是 `/tmp/tower-design/fixtures`，端口 1441，没有运行 cargo。
  - 对照组在 `/tmp/tower-design/wt-review7`（`3145645`）上跑同样的临时 spec。
- **长标题扫描**
  - en/zh × 4 档标题 × 15 个界面 × 5 个宽度，共 600 个页面状态，日志在 `$R/flows/wrap/log-*.txt`。
    - 4 档标题：fixture 原标题、56 列（快速开始的上限）、66 字符、约 110 字符。
    - 15 个界面：看板、看板就地展开的决策、Needs you、两个目标页、两个评审、评审对比运行、两个 accept 弹层、Operations、Learning、两个 peek、命令面板。
    - 5 个宽度：1024、1100、1240、1440、1800。
  - 合并队列另测了约 110 字符的长分支，共 20 个状态（`log-ops-branch-*.txt`）。
- **其他专项**
  - 卡头：7 种类别（question、approval、assumption、paused、review_ready、stalled、ci_failed）× 4 种状态（focused、listed+focused、listed+quiet、plain）× en/zh。
  - 看板、标题栏、侧栏：有 CI、无 CI、G-0002 等你回答，3 个变体 × en/zh，并打开每个目标的 peek。
  - 合同编辑：8 个宽度 × en/zh。
  - 最小窗口宽度 1040（`tauri.conf.json` 的 `minWidth`）下，在两个 commit 上逐项对照。
- **清理**
  - 7 个临时文件已存到 `$R/checks/specs/`，并从两个 worktree 删除。
  - 删除了 `dist/` 和 `test-results/`。
  - 两个 worktree 的 `git status` 都干净，HEAD 仍分别是 `d6f07ef`、`3145645`，端口 1441 已释放。
  - 主 checkout 我没有碰过。它本身有一些未提交的 `design-evidence/*.webp` 改动，不是我做的。

---

## 加权评分（满分 10）

| 维度 | 权重 | 分数 | 理由 | 加权 |
|---|---|---|---|---|
| 产品适配 | 15% | 8.5 | “无响应”现在在 peek 头部和“此刻”里一致了。但等你回答的运行中目标，头部被叫作“无响应”（R8-P3-01）。 | 1.275 |
| 信息架构与工作流 | 20% | 8.5 | 标题栏、侧栏的“需要你”和看板队列的条数，在 4 种数据下都一致（4/4/4、3/3/3、5/5/5、2/2/2）。扣分：侧栏和看板对同一个目标的说法不同（R8-P3-02）。 | 1.700 |
| 视觉层级 | 15% | 8.5 | 只有标题让出位置，类别、ID、时间、PR、大小、裁决词都在一行。合同编辑的编号和阅读顺序一致。 | 1.275 |
| 原创性与产品身份 | 15% | 8.0 | 和上轮一样。 | 1.200 |
| 工艺与排版 | 10% | 8.0 | P2-01 修得彻底，新增的 e2e 在旧 commit 上确实会失败。扣分：定时表的 cron 在 1040 下折行（既有）；bundle 只剩 60 B。 | 0.800 |
| 密度与克制 | 10% | 8.0 | 声明表的重复行（P3-03）和默认展开的高级配置（P3-04 的后半）都还在。 | 0.800 |
| 交互 | 10% | 8.5 | 没有退化。peek、j/k、就地展开决策都正常，0 个 pageerror。 | 0.850 |
| 设计系统一致性 | 5% | 8.0 | detector 没有新增。◆ 在侧栏和看板上的用法不再一致（R8-P3-02）。 | 0.400 |
| **合计** | 100% | | | **8.30** |

## 分维度评价（frontend-reviewer 1–5 分）

- **产品适配性 4/5**：G-0002 的 peek 头部和“此刻”都写 “Unresponsive / 无响应”（`$R/flows/board/crop-peek-en-ci-G-0002-head.png`）。但目标在等你回答时，头部和下面的说法矛盾（`$R/flows/board/peek-en-g2wait-4-G-0002.png`）。
- **视觉设计 4/5**：zh 长标题在 1440 下，卡头写成“假设 G-0003 让结账总额…… 8 小时前”和“CI 失败 G-0001 …… PR 开启中 ✓3 ■1 39 分钟前”，每项都在一行（`$R/flows/wrap/zh-CN-long-1440-inbox.png`）。第 7 轮同样条件下是竖排、被切掉的。
- **原创性 4/5**：没有变化。
- **工程细节 4/5**
  - 新 e2e 在 `3145645` 上 13 条里失败 11 条，失败点正是第 7 轮报的那些问题（`$R/checks/new-tests-on-3145645.log`）。
  - 覆盖仍有缺口，见下文“新增 e2e 是否测到了它声称的东西”。
- **信息架构 4/5**：数字之间能互相核对。只有侧栏和看板对 ◆ 和读屏状态词的处理不同（`$R/flows/side/en-base-overview.png`）。
- **交互体验 4/5**：卡头和评审头不再折行，按键流程和第 7 轮相同。各 spec 记录的 pageerror 都是 0。
- **功能完整性 4/5**：P3-03 和 P3-04 的后半按 D91、D92 延期。

---

## 第 7 轮问题复核

| 编号 | 判定 | 证据 |
|---|---|---|
| **P2-01** 长标题挤坏短标签，Operations 表越出外框 | **已修复** | **测量结果：** 600 个页面状态里，标签折行、裁切、外溢、表格越框都是 0。<br>• 唯一的折行在定时表，在 1024 下出现，与标题长度无关，`3145645` 上完全相同（见 R8-P3-03）。<br>• 标题截断后都有完整标题的 tooltip（命令面板不在 P2-01 范围内，另计）。<br>**卡头：** 192 次测量，0 条异常。高度都是 28px，没有子项越出卡头，ID 也没有被省略号吃掉。<br>**Operations 存储表：** 在 1024–1800 下都没越框。56 列标题在 1100 下写成 “◆ G-0001 Make checkout totals agr… Passed, doesn't count 48.0 MB 28.0 MB 16.0 MB 92.0 MB Protected”，最后一列完整可见（`$R/flows/wrap/en-cap-1100-operations.png`）。<br>**评审头：**<br>• `3145645` 在 1040 下 ID 折成 “G- / 0001”，`d6f07ef` 在一行（`$R/flows/min-3145645/zh-CN-review_G-0001-1040.png` 对比 `$R/flows/min-d6f07ef/zh-CN-review_G-0001-1040.png`）。<br>• 1100 下完整保留裁决词 “Passed, doesn't count”（`$R/flows/wrap/en-long-1100-review_G-0001.png`），满足第 7 轮修正目标里“至少完整保留裁决词”这一条。<br>**accept 弹层：** 在 1024–1800 下都没有异常（`$R/flows/wrap/zh-CN-long-1024-accept_G-0001.png`）。 |
| **P3-01** 无 CI 时 To review 里的 G-0001 读作 “Needs you” | **部分修复** | **看板已修：** 行的读屏标签变成 “Fix the cart total, Passed, doesn't count”，标题后也不再有 ◆（`$R/flows/board/log-*-noci.txt`）。<br>**侧栏没修：** 同一个目标在侧栏仍读作 “…, Passed, doesn't count, Needs you”。基础 fixture 里，侧栏 To review 行还带着标题后的 ◆。看板和侧栏因此不一致，见 R8-P3-02。<br>**◆ 的两种含义：** 字形列里那个 ◆ 表示“通过但不作数”，和标题栏 “◆ 3 need you” 的 ◆ 形状、颜色相同。团队已在 `TelemetryStrip` 注释里明确了两者的区分，按可接受处理。 |
| **P3-02** G-0002 的 peek 头写 “Running”，下面写 “Unresponsive” | **按修正目标已修复，但带出新矛盾** | **已修好的部分：** 有 CI、无 CI × en/zh 下，头部都是 “G-0002 Unresponsive / 无响应”，和“此刻”一致（`$R/flows/board/crop-peek-en-ci-G-0002-head.png`）。<br>**新矛盾：** 运行中、正在等你回答的目标，头部也写“无响应”，见 R8-P3-01。 |
| **P3-03** 声明表里看起来相同的两行 | **未修复，延期（D91），延期合理** | G-0003 的 “Claims and facts” 第 1 行和第 3 行仍然一样，en 和 zh 都是（`$R/flows/claims/en-claims.png`、`log-*.txt` 里记录 duplicates: 2）。它是 P3，不影响操作。bundle 只剩 60 B 是真实约束。 |
| **P3-04** 合同编辑的编号乱序；高级配置默认展开 | **部分修复** | **编号：已修复。**<br>• ≤1280 时侧栏折到表单下面，编号是 01–05。<br>• ≥1281 时侧栏在旁边，主栏编号 01–03，侧栏不编号。<br>• 我测了 1040、1100、1240、1280、1281、1300、1440、1800，布局切换点和编号切换点一致，en/zh 都是（`$R/flows/contract/log-*.txt`、`$R/flows/contract/en-1440.png`）。<br>**高级配置：没有修，按 D92 延期。** 侧栏仍有 20 个可见控件。延期理由“折叠需要 JS”只部分成立：原生 `<details>` 不需要交互逻辑，成本只有几十字节模板。作为 P3 可以接受。 |

## 回归检查

| 检查项 | 判定 | 证据 |
|---|---|---|
| Operations 和 Learning 的每个 `.data-table`：1024/1100/1240/1440/1800 × 4 档标题 × en/zh，加长分支 | **无回归** | **存储表、合并队列、校准表：** 全部正常，没有越框，也没有单元格内容溢进相邻列。<br>**定时表：** 1024 和 1040 下 cron 折行。`3145645` 的列宽和行高完全相同，是既有问题（R8-P3-03）。<br>**长分支：** 原标题配 110 字符分支，在 1100 下标题只剩 “Fix the ca…”，分支却有约 400px（`$R/flows/wrap/ops-branch-en-1100.png`）。<br>• 这条规则是从旧的 `.mq-row` 规则原样并过来的，不是回归。<br>• 真实分支名是标题的 slug，56 列标题配长分支时，标题能拿到 149–260px（`log-ops-branch-en.txt` 的 noci-cap 部分）。所以只记录，不单列问题。 |
| Needs you 卡头：每种类别和状态 × en/zh | **无回归** | 192 次测量，0 条异常（`$R/flows/wrap/log-*.txt`）。<br>看板就地展开时，卡头的 PR 读数、时间和铃铛都在一行（`$R/flows/wrap/en-long-1100-overview-open.png`）。 |
| 评审头：各宽度，包括对比运行时 | **无回归** | 1024、1040、1100 下，统计行在两个 commit 上逐项相同（`$R/flows/min-{d6f07ef,3145645}/log-*.txt`）。<br>en 对比运行时在 1040 丢掉裁决，以及行尾悬空的 “·”，都是既有问题（R8-P3-04）。 |
| 每个目标的 peek 头 | **有一处新矛盾** | 共打开 30 个 peek：3 个变体 × 2 种语言 × 5 个目标。只有 g2wait 变体里的 G-0002 自相矛盾（R8-P3-01）。其余目标的头部都在一行，高 22px。 |
| 合同编辑器 ≤1280 和 >1280 | **无回归** | 见上表 P3-04。 |
| 看板行的读屏标签和 ◆，与标题栏计数、侧栏是否一致 | **有新的不一致** | 计数一致。但侧栏仍然说 Needs you、带 ◆，看板不再这样（R8-P3-02）。 |
| pageerror | 无 | 各 spec 日志的 `ERRORS []` |

---

## 问题清单（本轮）

### P0、P1、P2

无。

### [R8-P3-01] 运行中、正在等你回答的目标，peek 头部写“无响应”，下面的“此刻”写“需要你”（P3-02 的修法带出来的）

- **位置**
  - 看板 → Space 打开 peek，头部（`apps/desktop/src/components/PeekDrawer.tsx:93`）。
  - 触发条件：目标 `state=running`、`mode=waiting_on_you`，心跳超过 2 分钟。
  - 这个状态是真实存在的：agent 提问或请求审批时，supervisor 会把 mode 设成 `WaitingOnYou`（`crates/tower-supervisor/src/run/events.rs:527`）。在你回答之前没有工具在跑，2 分钟后 `silent()` 就会成立。
- **截图证据**
  - `$R/flows/board/peek-en-g2wait-4-G-0002.png`：头部是 “◐ G-0002 Unresponsive”，“Now” 下面是琥珀色的 “◆ Needs you · Question Which rounding does t…”。
  - zh：`$R/flows/min-d6f07ef/zh-CN-g2wait-peek.png`，头部写“无响应”，此刻写“等你”。
  - 对照：`$R/flows/min-3145645/log-en.txt` 里同样数据的头部写的是 “Running”。
- **问题**
  - 头部只用了心跳规则。“此刻”的 `ModeBadge` 用的规则是“需要你的优先于无响应”（`Live.tsx:34`），头部没有跟着用。
  - 相关的既有情况：看板上 G-0002 行的读屏标签仍是 “…, Running, Claude Code”，而它显示出来的字是 “Unresponsive”（`$R/flows/board/log-en-ci.txt`）。
- **影响**
  - 头部是第一眼读的地方。一个只是在等用户回答的 agent 被说成没反应，用户可能会去暂停或放弃它，而不是去回答问题。
  - agent 请求审批后用户走开几分钟，这种情况很常见。
- **修正目标**
  - peek 头部的状态词和 `ModeBadge` 用同一个优先级：等你回答时写 “Needs you / 等你”，或者头部只放字形和 ID。
  - `verdict.spec.ts` 里加一个变体：G-0002 的 mode 为 `waiting_on_you`，带一张 question 卡。断言头部不出现 “Unresponsive / 无响应”。

### [R8-P3-02] 看板行不再说 “Needs you”、不再带 ◆，侧栏还在。同一个目标在两处说法不同（P3-01 只修了一半）

- **位置**
  - 侧栏的目标行：`apps/desktop/src/components/Sidebar.tsx:62`（aria-label 里有 `needs_you > 0 → Needs you`），`:68–70`（Needs you 组以外的行，标题后画 ◆）。
- **截图证据**
  - `$R/flows/side/en-base-overview.png`，基础 fixture，也就是真实 supervisor 导出的数据：
    - 标题栏写 “◆ 2 need you”。
    - 侧栏 To review 组里是 “✓ Fix the cart total ◆”。
    - 看板 To review 组的同一行没有 ◆。
  - 日志 `$R/flows/side/log-{en,zh-CN}-{base,noci}.txt`：
    - 侧栏的读屏标签是 “Fix the cart total, Ready to accept, Needs you”，无 CI 时是 “…, Passed, doesn't count, Needs you”。
    - 看板的读屏标签是 “Fix the cart total, Ready to accept”。
  - 对照：`$R/flows/min-3145645/log-en.txt` 的 “base G-0001” 一行显示，`3145645` 上看板和侧栏的说法是一致的。不一致是本轮的修改带出来的。
- **问题**
  - D89 判断的根因是“行读的是 `needs_you > 0`”，但只改了看板的 `GoalRow`，侧栏的 `GoalRow` 没改。
  - 新增的 e2e 只检查了看板上 `.g-title` 里的 ◆，没检查侧栏。
- **影响**
  - 读屏用户在侧栏的 To review 组里仍然会听到 “Needs you”。
  - 用 ◆ 分拣的用户看到，侧栏唯一的 ◆ 挂在一个不计入 “2 need you” 的目标上。
  - 一个已验证、待验收的目标是最常见的情况，所以基础数据就能触发。
- **修正目标**
  - 侧栏行和看板行用同一条规则：Needs you 组以外的行，读屏标签里不说 Needs you，标题后也不画 ◆。
  - 把 `verdict.spec.ts` 的 “no board row … says it needs you” 扩展到 `.sidebar .side-goal`，覆盖基础 fixture、有 CI、无 CI × en/zh。

### [R8-P3-03] 1040–1099 宽度下，定时任务表的 cron 表达式从中间断开（既有问题，不是本轮引入）

- **位置：**`operations` 的 Scheduled goals 表（`views/Operations.tsx:131`）。
- **截图证据**
  - `$R/flows/min-d6f07ef/en-scheduled-1040.png`：
    - cron 折成 “0 2 * * 1-” 和 “5” 两行。
    - “Unattended strict” 折成两行。
    - “Nov 25 16:02 G-0001” 也折了行。
  - zh 里的 “无人值守严格” 同样折行（`log-zh-CN.txt`，cronH 为 35px）。
  - `3145645` 上的列宽和行高完全相同（`$R/flows/min-3145645/log-*.txt`）。
- **影响：**在最小窗口宽度下，cron 被断成 “1-” 加 “5”，看起来像另一个表达式。这和 P2-01 是同一类问题：短标签必须一行。但 P2-01 的修复范围没有包括这张表。
- **修正目标**
  - 在 1040 下，cron、审批方式和时间都只占一行，只有标题列让出宽度。
  - 把 `layout.spec.ts` 长标题测试里的“短标签一行”检查扩展到这张表，宽度从 1040 起测。

### [R8-P3-04] 1040–1099 宽度下评审头的统计行：en 对比运行时整个裁决都没了；G-0001 行尾有悬空的 “·”（既有问题）

- **截图证据**
  - `$R/flows/min-d6f07ef/en-review_G-0003-compare-1040.png`：统计行只剩 “+11 −1 · All changes · Last turn · Compare runs… · base @3d28c9a → base @3d28c9a”，没有 “Verified @5f72710” 和计数条。zh 在 1040 下保留了裁决。
  - `$R/flows/min-d6f07ef/zh-CN-review_G-0001-1040.png`：行尾是 “观测 0/3 ·”，“人工 0/2” 被去掉了，但它前面的分隔点还留着。
  - 两处在 `3145645` 上都完全相同（`min-3145645/log-*.txt`）。
- **影响：**在最小窗口宽度下对比运行，评审头不再显示这个目标的裁决。悬空的分隔点像是内容被截断了。
- **修正目标**
  - 裁决词是统计行里最后一个被去掉的，在 1040 en 对比运行时也要可见。
  - 某个统计被整块去掉时，它前面的分隔符一起去掉。

### 只做记录，不计入

- 命令面板里截断的标题没有 tooltip（`$R/flows/wrap/log-en-long.txt` 的 palette 行）。它不在本轮范围内，而且面板是用键盘操作的。
- 合并队列里“短标题配超长分支”时，分支比标题占得宽。见回归检查表。
- 第 7 轮已经接受的延期项不变：11px 标签（D54/D85）、zh 界面里的英文数据（D86）、原始 cron 表达式（D20）、bundle 余量（D84，现在 60 B）。

---

## 新增 e2e 是否测到了它声称的东西

- 新增 13 条测试，没有删除任何测试。
  - webkit 项目的测试标题，第 7 轮有 390 条，本轮 403 条。新增的是 contract 1 条、layout 6 条、verdict 6 条（`$R/checks/e2e-titles-r{7,8}.txt`）。
  - 没有新增 `skip`、`only`、`fixme`。
  - `tools/` 和 playwright、vite、vitest 的配置没有改动。
- **在 `3145645` 上跑的结果：**11 条失败，2 条通过（`$R/checks/new-tests-on-3145645.log`）。通过的是“有 CI 卡”的两个变体，按作者说明是用作守卫。失败的原因都对得上：
  - 卡头的 “CI failed” 和 “39m ago” 各占 2 行。
  - 评审头的 “G-0001” 占 2 行。
  - Operations 的 “28.0 MB” 占 2 行，表格越出外框（1302 > 830）。
  - 合同编辑在 1440 下多显示了 “04”“05”。
  - peek 头部写的是 Running。
- **覆盖缺口（我都另外实测过）**
  - `layout.spec` 的注释说覆盖了 accept 弹层，但测试从来没打开它。我实测过，没有问题。
  - verdict 测试只查看板 `.g-title` 里的 ◆，所以漏掉了侧栏（R8-P3-02）。
  - peek 测试只覆盖“没在等你回答”的 G-0002，所以漏掉了 R8-P3-01。
  - 合同测试只测 1100 和 1440。我补测了 1240、1280、1281、1300，结果一致。

## 工程检查（日志在 `$R/checks/`）

| 检查 | 结果 | 日志 |
|---|---|---|
| `tsc --noEmit` | 通过，EXIT=0 | `tsc.log` |
| vitest | 41 个文件，220 个测试，全部通过 | `vitest.log` |
| Playwright 全量（`--project=webkit`，端口 1441） | 327 通过，76 跳过（shot 测试没设 SHOTS），0 失败，EXIT=0，用时 1.2 分钟。有 3 条 Vite 的 “Importing a module script failed” 警告，第 7 轮也有，没有测试因此失败。perf 项目不在这条命令里 | `e2e-full.log` |
| vite build | 通过 | `build.log` |
| bundle-budget | 通过。启动 54,090 / 65,536；按需 109,690 / 110,592；**合计 163,780 / 163,840（余 60 B）**；目标页 11,424 / 12,288；worker 197,901 / 262,144 | `bundle-budget.log` |
| line-limit | 通过 | `line-limit.log` |
| detector（本轮改动的 7 个文件） | 13 条，都在 `app.css`：side-tab 3 条，DS radius、字号、颜色的 advisory 10 条。<br>按（规则、文件、片段）去重后，和第 7 轮 `app.css` 的那部分完全相同，没有新增。<br>第 7 轮另有 2 条在 `workbenches.css`，本轮没改这个文件，所以不在扫描范围内。<br>`console.css` 和各 tsx 没有发现。 | `detect.json` |

## 没能覆盖的

- **原生窗口和真实 WKWebView：**没有运行 `tools/screenshot.sh` 和 cargo。
- **shots.spec：**不在本轮的门槛命令里，没有重新生成。
- **暗色主题：**只在声明表那里看了暗色。本轮的改动都是布局，不涉及颜色。
- **真实数据：**没有在真实 supervisor 上建一个长标题、长分支的目标，也没有构造一个真实的等你回答、心跳过期的运行。R8-P3-01 的数据是我在 fixture 里注入的，但对应的 supervisor 路径已经在源码里确认过。

## 验收条件

通过，没有必须先解决的项。建议下一轮优先修 **R8-P3-01** 和 **R8-P3-02**，它们都是本轮修改带出来的，各自只需一处判断，再按修正目标补上 e2e。R8-P3-03 和 R8-P3-04 可以和 D91、D92 的延期项一起排期。