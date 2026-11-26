**PASS（通过）**

# Tower 前端设计评审：第 7 轮，最终验收（`3145645`，design/evolution）

> 环境不允许写报告文件，所以没有写成。下面是完整报告，请原样保存到 `/tmp/tower-design/review7/report.md`。文中 `$R` 指 `/tmp/tower-design/review7`。

**结论：通过设计验收。** 加权得分 8.18/10，不低于 8.0，也没有未关闭的 P0 或 P1。
- 第 6 轮唯一的 P1 是 peek 不困住焦点，现已修好。
  - 我在 en/zh × 有 CI/无 CI 下跑了 160 组按键序列。焦点一次也没离开 peek，`quick_goal` 一次也没被调用。
  - Tab 能走到 peek 的每个按钮，焦点框看得见。
- 本轮新发现一条 P2：标题很长时，Operations 存储表、Needs you 卡头、评审头里的短标签会被挤到折行或截断。它不阻塞主流程，建议下一轮修。

**设计方向：成立。** 剩下的都是局部问题。

**评审范围**
- **对象与环境**
  - worktree 是 `/tmp/tower-design/wt-review7`，HEAD 为 `3145645`（detached）。确认过 `ui.tsx` 导出了 `trapTab`，`PeekDrawer` 用了它。
  - 用 Playwright WebKit 跑，Tauri IPC 用 stub。
  - fixtures 是 `/tmp/tower-design/fixtures`，端口 1441，没有运行 cargo。
  - “无 CI”变体的做法：先跑 `enrichRich` 和 `enrichConsole`，再去掉 `ci_failed`，并把 G-0001 的 `pr` 置为 null。
- **截图**
  - `shots.spec` 的 69 张全部生成，看过关键的几张。
  - 矩阵：13 个界面 × 1100/1440/1800 × en/zh-CN × 明/暗，共 156 张（`$R/flows/matrix/`），没有 pageerror，没有内容越出边缘。
  - 计数格测了 1100–1800 的 13 个宽度（`$R/flows/cell/`）。
  - 长标题测了三档：56 列（快速开始的上限）、66 字符、约 110 字符，宽度 1100/1240/1440/1800（`$R/flows/wrap/`）。
- **流程**
  - 看板 j/k、Space peek、peek 的 6 种出口（Esc、r、↩、⇧R、两个按钮、点遮罩）× 5 个目标 × 4 个变体，共 200 次出口。
  - 键盘评审 G-0003，到 accept 弹层。
  - G-0001 评审和 accept 弹层，验证 AC6 的阻塞项点击。
  - Needs you 的数字键、合同编辑和 + Look、命令面板、Learning、Settings、Operations。
  - 空状态、错误状态（G-0099、G-0002 无改动）、welcome、长标题。
- **没能覆盖的：** 见文末。
- **清理**
  - 12 个临时文件（`zz-review-lib.ts` 和 11 个 spec）已复制到 `$R/checks/`，并从 worktree 删除。
  - 删除了 `dist/` 和 `test-results/`。受版本控制的 `.impeccable/design.json` 没有动。
  - `git status` 干净，HEAD 仍是 `3145645`，端口 1441 已释放。

---

## 加权评分（满分 10）

| 维度 | 权重 | 分数 | 理由 | 加权 |
|---|---|---|---|---|
| 产品适配 | 15% | 8.5 | 不作数的通过在 11 个界面上都只读作“Passed, doesn't count / 通过但不作数”，有没有 CI 都一样。评审头的 Accept 不是主按钮；accept 弹层写的是“Accept anyway / 仍然验收”，并且列出原因。 | 1.275 |
| 信息架构与工作流 | 20% | 8.5 | 看板 → peek → 目标页或评审 → Esc 回到原行，这个循环是闭合的，焦点也回到原行标题。⇧R 队列、命令面板、Needs you 的数字能互相核对。扣分：侧栏分组和看板重复；◆ 的含义和“need you”计数不完全对得上（P3-01）。 | 1.700 |
| 视觉层级 | 15% | 8.0 | 裁决就在标题下 4px，验收标准头在 600px 以内。颜色克制，只有印章一处用展示级字号。扣分：长标题下卡头标签折成竖排（P2-01）；合同编辑右栏编号乱序（P3-04）。 | 1.200 |
| 原创性与产品身份 | 15% | 8.0 | 双轨计数条、印章、“Agent says / Agent 称”来源栏、“Measured by Tower”声明表、held-out 卡，是 Tower 自己的语言，不是通用模板。 | 1.200 |
| 工艺与排版 | 10% | 7.5 | P1 和 P3 的修复都测得很完整。但长标题会把固定宽度的短标签挤坏（P2-01），D87 的加固只覆盖了看板和目标页。还有 11px 标签，bundle 余量只剩 97 B。 | 0.750 |
| 密度与克制 | 10% | 8.0 | 每个界面裁决只说一次，G-0003 的 peek 不再说两遍。没有越界的中点。扣分：声明表里有看起来完全相同的两行（P3-03）。 | 0.800 |
| 交互 | 10% | 8.5 | peek 的 Tab 和 ⇧Tab 在 peek 内循环，焦点框清楚，Esc 后焦点回到原行。点 accept 弹层的阻塞说明，焦点落到第一个阻塞项。200 次 peek 出口没有任何 pageerror。 | 0.850 |
| 设计系统一致性 | 5% | 8.0 | 绿色和中点的规则都守住了。peek 和其他弹层共用 `trapTab`。detector 的发现和上轮完全相同，没有新增。 | 0.400 |
| **合计** | 100% | | | **8.18** |

## 分维度评价（frontend-reviewer 1–5 分）

- **产品适配性 4/5**
  - G-0001 在看板、侧栏、peek、命令面板、Needs you、目标页、评审头、readout、accept 弹层、Operations 里措辞一致（`$R/flows/g1/log-{ci,noci}-*.txt`）。
  - accept 弹层写“2 of 3 machine criteria count: in one, a test that must fail passed”，并且写“Seal withheld”（`$R/flows/ac6/ac6-en-G-0001.png`）。
- **视觉设计 4/5**
  - 目标页第一屏依次是标题、裁决、计数条、哨兵、验收标准（`$R/flows/ac6/ac1-1100-en-ci.png`）。
  - 看板各行格式统一，运行中的行标题恢复到第 5 轮的长度（`$R/flows/cell/board-en-light-1440.png`）。
- **原创性 4/5**
  - welcome 用一个样例印章解释“事实与声明分开”，环境检查里的勾是中性色（`$R/shots/welcome-red-zh-dark.png`）。
- **工程细节 4/5**
  - 修复都补了 e2e：Tab 陷阱 en/zh 都有，每个 peek 最多一个印章，运行中的行标题至少显示 37 个字符。
  - 扣分是 P2-01：长标题在三个界面上挤坏短标签。
- **信息架构 4/5**
  - 侧栏的 “Review queue 2” 和 Needs you 页里的队列是同一个集合，标题栏的数字和侧栏一致（`$R/flows/g1/noci-en-light-overview.png`）。
- **交互体验 4/5**
  - 键盘评审 G-0003：Space、r、a、v、a、a、v、⌘⇧↩，8 个键打开 accept 弹层（`$R/flows/flows/log-review-g3.txt`）。
  - peek 焦点的细节见下文复核表。
- **功能完整性 4/5**
  - 空看板没有骨架条（`$R/shots/overview-empty-zh-dark.png`）。
  - 找不到目标时写“G-0099 was not found”，并提供“Open overview”（`$R/flows/flows/state-goal_G-0099.png`）。
  - 无改动的评审写“No changes”（`$R/flows/flows/state-review_G-0002.png`）。

---

## 问题清单

### P0

无。

### P1

无。

### [P2-01] 标题很长时，ID、类别、时间、大小、裁决这些短标签被挤到折行，Operations 存储表的最后一列被截掉

- **位置**
  - **Operations 存储表**（`operations`，1100–1240）。`styles/console.css:645` 的 `.data-table` 里，数字列和 ID 列没有 `white-space: nowrap`，标题列也没有先让出宽度。
  - **Needs you 卡头**（`inbox`，zh 在 1440 也会出现）。`styles/app.css:2235` 的 `.decision-head` 高度固定为 28px，`app.css:2300` 的 `.decision-kind` 和时间都没有 `nowrap` 或 `flex-shrink: 0`。
  - **评审头的 ID**（`review/G-000N`，1100–1240）。
  - accept 弹层头里的 ID 也会折行（`$R/flows/wrap/log-long-*.txt` 的 accept 行）。
- **截图证据**
  - `$R/flows/wrap/ops-cap-en-1100.png`：标题 56 列，正好是快速开始的上限。
    - ID 折成 “G- / 0001”，裁决折成 “Passed, doesn't / count”，“28.0 / MB” 也折了行。
    - 右端操作列只剩 “Prote” 和 “Cle”。
    - 日志 `$R/flows/wrap/log-ops-cap-en.txt`：表宽 872px，外层容器 830px，容器带 `overflow:auto`，最后一列被藏到横向滚动里。
  - zh 在 1100 下一样：`$R/flows/wrap/ops-cap-zh-CN-1100.png`。
  - 66 个字符的标题在 1100–1240 下也会折行：`$R/flows/wrap/log-mid-*.txt`。
  - `$R/flows/wrap/long-zh-CN-ci-1440-inbox.png`：G-0001 和 G-0003 用约 45 个汉字的标题，宽度 1440。
    - 卡头的 “假设” 竖排成 “假 / 设”，“CI 失败” 成了 “CI 失 / 败”。
    - “开启中” 成了 “开启 / 中”，“8 小时前” 成了 “8 小时 / 前”。
    - 文字溢出 28px 高的色条，上下被切掉。
  - `$R/flows/flows/long-en-light-1100-review_G-0001.png`：评审头的 ID 折成 “G- / 0001”，计数条右边的文字 “Verified 2/3 · 1 doesn't count” 整段看不见，只剩色段（`$R/flows/flows/log-states.txt` 记录为 overflow）。
  - 对照：看板、目标页、peek、命令面板、Learning 在同样的标题下都正常（各日志里标为 “ok”）。D87 的加固只覆盖到这些界面。
- **问题：** 标题没有在这些地方先截断。挤压落到了本该一眼读完的短标签上。
- **影响**
  - **Operations：** 用户在这里决定清理或保护哪个目标的存储。1100 是最小窗口宽度，标题到快速开始上限就会把操作按钮藏到横向滚动后面。大小列折成两行，没法顺着一列扫读。
  - **Needs you：** 卡头的类别是每张卡第一眼要读的东西，被折成单字后几乎读不出来。
  - **谁会碰到：** 合同编辑器的标题没有长度上限（这一点是读代码判断的），所以自己写标题的用户会碰到；用快速开始建目标、标题正好在上限的用户，也会在窄窗口里碰到。
- **修正目标**
  - 测试条件：1100/1240/1440/1800 × en/zh，标题取 56 列、66 字符、110 字符三档。
  - ID、类别、时间、大小、裁决词都只占一行，只有标题用省略号截断，并带完整标题的 tooltip。
  - Operations 表的 `scrollWidth` 不大于容器的 `clientWidth`，最后一列完整可见。
  - 评审头计数条的文字在 1100 下仍然可见，或者至少完整保留裁决词。
  - 把这三档标题加进 inbox、operations、评审头、accept 弹层的 e2e 几何检查。

### P3（细节）

- **P3-01 无 CI 时，G-0001 带着标题栏“need you”用的 ◆，读屏标签也说 “Needs you”，但它排在 To review 组，也不计入 “3 need you”**
  - **截图证据：** `$R/flows/g1/noci-en-light-overview.png`。
    - 标题栏写 “◆ 3 need you”。
    - Needs you 组的三行用的是 ⏸ ✓ ⏸，没有一行是 ◆。
    - 看板上唯一的 ◆ 是 To review 组里的 G-0001。
  - **日志：** `$R/flows/g1/log-noci-en-light.txt` 记录行内标签为 “Fix the cart total, Passed, doesn't count, Needs you”；zh 写 “需要你”（`log-noci-zh-CN-*.txt`）。
  - **影响：**
    - 读屏用户在 To review 组里听到 “Needs you”。
    - 数 ◆ 来分拣的用户看到的数，和标题栏的计数对不上。
  - **修正目标：** 行的读屏状态词跟着它所在的组走（“To review / 待评审”），或者把 ◆ 定义成“需要注意”，和“need you”计数分开说明。
- **P3-02 G-0002 的 peek 头写 “Running”，下面的“Now”写 “Unresponsive”**
  - **截图证据：** `$R/flows/peek/drawer-en-ci-G-0002.png`。头部是 “◐ G-0002 Running”，Now 写 “Unresponsive · Getting started · last activity 7h ago”。标题栏同时写着 “silent for 7h”。
  - **影响：** 头部是第一眼读的地方，却给出健康的状态。
  - **修正目标：** 运行中但没有心跳的目标，peek 头写 “Unresponsive”，或者头部只放字形和 ID。
- **P3-03 声明表里出现看起来完全相同的两行**
  - **截图证据：** `$R/flows/matrix/en-dark-1100-goal_G-0003.png` 的 “Claims and facts”。第 1 行和第 3 行都是 “C1 npm test passes locally ⇔ Consistent Verifier: C1 passed @5f72710”。
  - **原因：** fixture 里有 3 条 `criterion_met` 声明，2 条来自第 1 次运行，1 条来自第 2 次。界面没有标出是第几次运行。
  - **影响：** 看起来像渲染重复的 bug，读者也分不清哪次运行说了什么。
  - **修正目标：** 不同运行的相同声明合并成一行，标注“runs 1, 2”；或者每行带运行号。
- **P3-04 合同编辑器的右栏编号是 04，排在左栏 03 之前；高级配置默认全部展开（基线 P2-07 的残留）**
  - **截图证据：** `$R/flows/flows/contract-full-en.png`。右上是 “04 Engine, escalation & sandbox”，03 在左栏下方。引擎、模型、沙箱、网络、端口、自主度全部展开。
  - **影响：** 读的顺序和编号不一致。写一个简单的目标时，旁边有 15 个以上的控件。
  - **修正目标：** 编号和阅读顺序一致，例如右栏不编号；默认展开的控件不多于一行摘要加意图区。
- **只做记录，按团队的决定不计入：**
  - 11px 标签和 10px kbd（D54/D85），没有低于 12px 的句子。
  - zh 界面里有 supervisor 和 fixture 的英文（D51/D86），例如 `$R/flows/wrap/long-zh-CN-ci-1440-inbox.png` 里的 “Approve / Reject”。
  - bundle 余量 97 B（D84）。
  - Operations 的 cron 显示原始表达式（D20）。

---

## 第 6 轮（`16ac40c`）问题复核（对照 D81–D87）

| 编号 | 判定 | 证据 |
|---|---|---|
| P1-01 peek 不困住焦点 | **已修复** | **Tab 循环：** `$R/flows/focus/log-tabwalk-{en,zh-CN}.txt`。5 个目标都在 Close → Review R（或 Pause/Resume P）→ Open ↩ → Close 之间循环，每一步都在 peek 内，⇧Tab 也一样。<br>**按键序列：** `log-tabkeys-*.txt`，4 个变体 × 5 个目标 × 8 组，共 160 组。焦点离开 peek 0 次，`quick_goal` 0 次。<br>**焦点框：** 1.5px 中性色描边，清楚可见（`$R/flows/focus/ring-zh-CN-T2.png`、`log-ring.txt`）。<br>**Esc 之后：** 焦点回到原行的 `g-title`。<br>**按钮上的 ↩ 和 Space：** 交给按钮自己执行，例如聚焦“Close”时按 ↩ 是关闭，行为可预测。 |
| P3-01 计数列 16em 截掉标题 | **已修复** | 1440 下标题是 “Align discount rules with the product…”，实况是 “Getting started run…”，和第 5 轮一样（`$R/flows/cell/board-en-light-1440.png`）。13 个宽度下 G-0001 的计数格没有重叠，人工计数在 tooltip 里（`$R/flows/cell/log-*.txt`）。 |
| P3-02 G-0003 的 peek 说两遍“已验证” | **已修复** | 头部只有字形，“已验证 @5f72710” 只在“此刻”下出现一次（`$R/flows/focus/ring-zh-CN-T2.png`）。peek 日志里 `seals` 都不超过 1。 |
| P3-03 bundle 余量 | **延期（D84），数字属实** | 总量 163,743 / 163,840，余 97 B，比上轮少（`$R/checks/bundle-budget.log`）。`tools/` 没有改动，预算没有提高。 |
| P3-04 11px 标签 | **保留（D85）** | 和上轮相同，AC9 仍然成立。 |
| P3-05 zh 里的英文数据 | **延期（D86）** | `$R/flows/wrap/long-zh-CN-ci-1440-inbox.png`。 |
| D87 金额分组、目标页标题 tooltip | **已做到** | 金额写成 `$43,209.60`（单测）；目标页的 h1 带完整标题的 tooltip。但长标题的加固没有覆盖 inbox、operations 和评审头，见 P2-01。 |

## 基线（`bf22cad`）问题是否解决

| 基线编号 | 判定 | 证据或说明 |
|---|---|---|
| P1-01 证据在首屏外 | 已解决 | AC1 的测量，见下文 |
| P1-02 标准展开像调试日志 | 默认视图已解决 | 每条标准最多两行，标签是琥珀色（`$R/flows/ac6/ac1-1100-en-ci.png`）。展开态本轮没有逐条复看 |
| P1-03 事实和说法区分弱 | 已解决 | 有 “Agent says” 来源栏和 “Measured by Tower” 对照表（`$R/flows/matrix/en-dark-1100-goal_G-0003.png`） |
| P1-04 j/k 让行跳动 | 已解决 | 连按 5 次 j，各行顶部始终是 149/189/229/269/349/371（`$R/flows/flows/log-board.txt`） |
| P1-05 accept 禁用时不说原因 | 已解决 | AC6，见下文 |
| P1-06 状态叫法矛盾 | 已解决 | AC7，见下文 |
| P2-01 浮层半透明 | 已解决 | 命令面板不透明（`$R/flows/flows/palette-cart-zh-CN.png`） |
| P2-02 提示和行为不符 | 已解决 | 键栏写 “J K move · ␣ peek · ↩ open · R review”，和实际行为一致 |
| P2-03 评审首帧闪烁 | 没有复测 | 有 e2e 覆盖（D09） |
| P2-04 琥珀色用作焦点 | 已解决 | 焦点框和选中底色都是中性色（`log-ring.txt`） |
| P2-05 外壳重复 | 部分解决 | 导航不再重复列出目标。但侧栏分组和看板仍然重复；≥1440 时标题栏仍有静态的 “Seatbelt S2” 和 “● Pi”（`$R/flows/g1/noci-en-light-overview.png`） |
| P2-06 需要你的行没有证据 | 已解决（按它自己的修正目标） | 这些行显示裁决词，例如 “Ready to accept”，但仍然用自己的列宽 |
| P2-07 合同编辑器的焦点和布局 | 部分解决 | 进入后焦点在 Purpose 框，+ Look 后焦点到 C2 的说明框（`$R/flows/flows/log-contract.txt`）。眉题已改。编号和高级配置见 P3-04 |
| P2-08 Accept 一词两义 | 大部分解决 | 区块写 “Mark read”，文件写 “Mark reviewed”，Accept 只指封存。“Revert hunk” 仍和 “Mark read” 同级并排（`$R/flows/flows/long-en-light-1100-review_G-0001.png`） |
| P2-09 空看板像在加载 | 已解决 | `$R/shots/overview-empty-zh-dark.png` |
| P2-10 字号压缩和小数字号 | 部分解决 | 阅读文字都不低于 12px。mono 字体的小数字号按 D16 的决定保留 |
| P3-01 Abandon 看起来像普通按钮 | 按决定保留（D24） | — |
| P3-02 Operations 表格 | 部分解决（D20） | 时区和存储条已修。原始 cron 保留 |
| P3-03 校准表用绿色 | 已解决 | 绿色扫描里没有统计值用绿色 |
| P3-04 评审空状态挤在左侧 | 已解决 | `$R/flows/flows/state-review_G-0002.png` |
| P3-05 ▮▮ 风险标记没有含义 | 已解决 | 单元行上直接写出原因 “test harness: runner config…”（`$R/flows/matrix/zh-CN-dark-1100-accept.png` 左栏） |
| P3-06 welcome 像落地页模板 | 延期（D22） | — |
| P3-07 1800 下标题和 ID 相距太远 | 未解决（D23 Open） | — |

## 设计合同 AC1–AC11

| AC | 判定 | 证据 |
|---|---|---|
| AC1 | 满足 | 测了 8 个变体：1440/1100 × en/zh × 有 CI/无 CI（`$R/flows/ac6/log-ac1.txt`）。<br>• 标题底都在 100，裁决顶在 104，计数条顶在 106（en 1100 下是 134）。<br>• 验收标准头在 396–588 之间，全部不超过 600。<br>• Cause 排在标准之后（`$R/flows/ac6/ac1-1100-en-ci.png`）。 |
| AC2 | 满足 | 高危哨兵在标准之前，带证据行。低危折叠是一行，并写出 `test/holdout/rounding.test.js`（同一张截图的底部）。 |
| AC3 | 满足 | C1、C2、C5 都是两行，通过的标准上的标签是琥珀色，子行缩进一致。 |
| AC4 | 满足 | Cause、Summary、Next 和声明表都标了 “Agent says / Agent 称”。无依据的声明写 “◇ Unsupported”（`$R/flows/peek/drawer-en-ci-G-0002.png`）。 |
| AC5 | 满足 | 连按 5 次 j，各行顶部不变；决策只在按 ↩ 时就地展开；Space 和 R 作用于选中行（`$R/flows/flows/log-board.txt`）。 |
| AC6 | 满足 | `$R/flows/ac6/log-ac6.txt`：en/zh × G-0001/G-0003。<br>• Accept 禁用时，旁边写出全部阻塞项，例如 “Set git's name and email first; Tick C3, C4 first”。<br>• 点这行文字，焦点落到弹层里可见的 “Your name / 你的名字” 输入框。<br>• 阻塞项排在信息列表之前（`$R/flows/ac6/ac6-en-G-0001.png`）。 |
| AC7 | 满足 | G-0001 在任何界面都没被叫作 Ready，包括 aria。评审头的 Accept 是 `btn-default`（`$R/flows/g1/log-*.txt`）。 |
| AC8 | 满足 | 绿色只出现在验证结果的标记、`seg-verified` 段、已验证字形和印章上（`$R/flows/scan/scan-*.txt` 的 greens 段）。welcome 的环境检查勾是中性色。 |
| AC9 | 满足 | detector 报 15 条：side-tab 3 条，DS radius、字号、颜色的 advisory 12 条。没有 `tiny-text` 或 `low-contrast`。按（规则，片段）去重后和第 6 轮的集合完全相同（`$R/checks/detect.json`）。 |
| AC10 | 满足 | 见下文工程检查。 |
| AC11 | 满足 | 加权 8.18，不低于 8.0，没有未关闭的 P0 或 P1。 |

## 硬性门槛

| 门槛 | 判定 | 证据 |
|---|---|---|
| 为了装下而提高预算 | 未触发 | `git diff 16ac40c 3145645 -- tools/` 和 `git diff bf22cad 3145645 -- tools/` 都为空。`bundle-budget.sh` 的阈值没变。 |
| 为了通过而削弱测试 | 未触发 | **对 16ac40c：** `verdict.spec` 只删了一条断言，内容是“≥1400 时显示人工计数”。它随 D82 的设计改成“格内不画人工计数，tooltip 匹配 `/Human 0\/2/`”，同时新增了运行中行的标题字数、peek 的 Tab 陷阱（en/zh）、单一印章等测试。`format.test` 多了 2 条断言。<br>**对 bf22cad：** 删掉的断言都是随文案更名，并各有对应的新断言，例如 Accepted→Read、Viewed→Reviewed、“not evidence”→“doesn't count”。<br>没有新增 `skip`、`only`、`fixme`。playwright、vitest、vite 的配置没有改动。 |
| 绿色聚合或绿色步骤勾 | 未触发 | 见 AC8。 |
| 把说法画成事实 | 未触发 | 见 AC4。 |
| 用户已有改动丢失 | 没有检查 | 见文末。 |

## 必查项

- **G-0001 跨界面一致性：** 有 CI 和无 CI、en 和 zh、明和暗，共 8 种组合，11 个界面的措辞都一致，没有 pageerror（`$R/flows/g1/log-{ci,noci}-*.txt`、`$R/flows/g1/*.png`）。唯一的偏差是无 CI 时的读屏标签，见 P3-01。
- **绿色：** 见 AC8。
- **“ · ” 中点：** 只出现在计数条（例如 “Verified 2/3 · 1 doesn't count · Observed 0/3”）和预算行。accept 弹层的原因用 “; ” 和 “；” 连接（`$R/flows/scan/scan-*.txt` 的 dots 段）。
- **peek 出口的 pageerror：** 200 次出口，0 次（`$R/flows/peek/log-exits-*.txt`）。

## 工程检查（日志在 `$R/checks/`）

| 检查 | 结果 | 日志 |
|---|---|---|
| tsc | 通过 | `tsc.log` |
| vitest | 41 个文件，220 个测试通过 | `vitest.log` |
| 全量 e2e（不含 zz 脚本，端口 1441） | 316 通过，76 跳过，EXIT=0。有 3 条 “Importing a module script failed” 警告，和第 6 轮相同 | `e2e-full.log` |
| shots.spec | 69 通过 | `shots-run.log` |
| line-limit | 通过 | `line-limit.log` |
| vite build | 通过 | `build.log` |
| bundle-budget | 通过：启动 54,128 / 65,536；按需 109,615 / 110,592；合计 163,743 / 163,840（余 97 B）；目标页 11,437 / 12,288；worker 197,901 / 262,144 | `bundle-budget.log` |
| detector | 15 条，和第 6 轮相同，没有新增 | `detect.json` |

## 没能覆盖的

- **原生窗口：** 没有运行 `tools/screenshot.sh`，也没有运行 cargo。没有看原生标题栏、窗口阴影和真实字体渲染。
- **WKWebView 的真实 Tab 行为：** 没开 macOS“全键盘控制”时的行为，只在 Playwright WebKit 里验证过。
- **设置 git 身份后 accept 能否解锁：** stub 的环境是静态的，没法验证。
- **合同编辑器的标题能否超过 56 列：** 只读了代码（标题框没有 `maxLength`），没有在真实 supervisor 上建一个长标题的目标。P2-01 的长标题是我注入 fixture 的。
- **用户已有改动丢失：** 没有构造这个场景。
- **合同 ⌘↩ 之后停在哪里：** 只确认调用了 `validate_contract` 和 `create_goal`。
- **验收标准的展开态、评审首帧闪烁：** 本轮没有逐条目测，只靠 e2e。
- **真实 supervisor 的中文数据：** fixture 里的风险理由、假设、选项都是英文。

## 验收条件

通过，没有必须先解决的项。建议下一轮先修 **P2-01**，按它的修正目标补 e2e，再处理 P3-01 到 P3-04。