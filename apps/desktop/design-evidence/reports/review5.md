# Tower 前端设计评审：第 5 轮（`d0dc2a1`，design/evolution）

> **报告文件没有写成：** 环境不允许 subagent 写报告文件，我没有绕过这个限制。下面是完整报告，请原样保存到 `/tmp/tower-design/review5/report.md`。截图、流程证据和检查日志都在 `/tmp/tower-design/review5/{shots,flows,checks}` 下，下文路径都相对于 `$R=/tmp/tower-design/review5`。

**结论：不通过设计验收。** 加权得分 7.85/10，低于 8.0 的通过线。本轮没有 P0，也没有 P1。

- 第 4 轮的两条 P1 都在屏幕上确认已修复：
  - peek 的出口全部能用。
  - 没有 CI 时，G-0001 归到“To review / 待评审”，计数条带上了“1 项不作数”。
- 两处修复各带来一个回归。两处都在英文（默认语言）、常用宽度下，实现者的 e2e 都没测到：
  - **P2-01：** 没有 CI 时，看板 G-0001 行的计数格在 1440 和 1800 下重叠并被截断。
  - **P2-02：** 英文 peek 里，来源标签“Agent says”掉到了陈述下面，┆ 单独占一行。

修好这两条，“视觉”和“工艺”两个维度大约能回到 8 分，总分会过线（估算约 8.0）。

**设计方向：成立。** 剩下的都是局部缺陷，不需要重新设计。

**评审范围**

- **对象与环境**
  - 只读 worktree `/tmp/tower-design/wt-review5`，HEAD `d0dc2a1`（detached）。
  - 端口 1441，fixtures 用 `/tmp/tower-design/fixtures`，没有运行 cargo。
  - Playwright WebKit，Tauri IPC 用 stub。
- **截图**
  - `shots.spec.ts` 的 69 张全部通过。
  - 另写了 5 个 `zz-review-*` 临时脚本，生成的截图和日志在 `flows/` 下。
  - 关键截图都用 Read 看过，并截了局部图。
- **宽度、语言、主题组合**
  - **矩阵：** en、zh-CN × light、dark × 1100、1440、1800，共 12 种组合。每种组合看 6 个界面（看板、无 CI 的看板、G-0001 目标页、G-0001 评审、无 CI 的 Needs you、Operations），外加无 CI 的 peek（`flows/matrix/`）。
  - **路由扫描：** 13 条路由加弹层，跑 4 个变体（en-light-1440、zh-CN-dark-1100、en-dark-1800、zh-CN-light-1440）。弹层包括 briefing；G-0001、G-0003、G-0005 的 peek；命令面板；快捷键表；G-0001 和 G-0003 的 readout 与 accept；要求修改；welcome。扫描内容：绿色、中点、小字、“Ready”措辞、来源栏几何（`flows/scan-*.txt`）。
- **交互流程**
  - peek 出口：5 个目标 × 5 种出口 × 2 个变体。
  - 看板键盘操作。
  - 用键盘评审 G-0003。
  - G-0001 评审：文件头开关、建议、要求修改。
  - 合同编辑：+ Look、holdout 草稿。
  - G-0001 目标页几何：6 个变体。
  - 空状态和错误状态。
- **清理**
  - 脚本副本已放进 `checks/zz-review-*.spec.ts`，并从 worktree 删除。
  - 运行中产生的 `dist/`、`test-results/`、`.impeccable/hook.cache.json` 已删除。
  - worktree 干净，HEAD 仍是 `d0dc2a1`，端口 1441 已释放。
- **没能覆盖的：** 见文末。

---

## 加权评分（满分 10）

| 维度 | 权重 | 分数 | 一句话理由 | 加权 |
|---|---|---|---|---|
| 产品适配 | 15% | 8.0 | G-0001 在 10 个界面上都读作“通过但不作数”，有没有 CI 都一样，主线是通的。“待评审”一个词指四个不同集合，计数对不上，让人不敢信数字。 | 1.200 |
| 信息架构与工作流 | 20% | 8.0 | peek 出口、Esc 回到原选中行、⇧R 队列和命令面板顺序一致，这些都对了。还剩：导航“待评审 2”和分组“待评审 1”同名不同数；标题栏 ◆3，屏幕上却有 4 行 ◆。 | 1.600 |
| 视觉层级 | 15% | 7.5 | 目标页、评审、accept 弹层的层级都好。但最需要看清的 G-0001 看板行，在英文 1440/1800 下计数格坏了（P2-01）。peek 来源栏标签错位（P2-02）。 | 1.125 |
| 原创性与产品身份 | 15% | 8.0 | 双轨计数条、印章、“Agent 称”来源栏、held-out 卡、look 对比，都是 Tower 自己的语言。 | 1.200 |
| 工艺与排版 | 10% | 7.0 | 中点、zh 来源栏、文件头开关、建议块颜色都修好了。但修复同时引入两个英文排版回归，还有几处零碎折行。 | 0.700 |
| 密度与克制 | 10% | 8.0 | G-0005 的重复句去掉了，Learning 的按钮降了一级，1800 下看板居中并限宽。peek 头、侧栏、inbox 卡片还在重复裁决或 ◆。 | 0.800 |
| 交互 | 10% | 8.5 | 看板、peek、评审、合同的键盘路径都可靠，没有任何 pageerror。只剩 peek 里按 ⇧R 没反应，也没有提示。 | 0.850 |
| 设计系统一致性 | 5% | 7.5 | 绿色和中点规则都执行到位。detector 仍报 15 条设计系统 advisory，和上一轮相同。同一个词用在四个集合上。 | 0.375 |
| **合计** | 100% | | | **7.85** |

## 分维度评价（frontend-reviewer 1–5 分）

- **产品适配性 4/5**
  - “合同 → 运行 → 验证 → 评审 → 接受”这条主线清楚。
  - 不作数的通过在所有界面上措辞一致，评审头的 Accept 不是主按钮（`flows/g1-noci-en-light-goal.png`、`flows/g1-noci-en-light-review.png`）。
  - 扣分在计数：侧栏导航“To review 2”，下面分组“To review 1”（`flows/g1-noci-en-light-goal.png` 左栏）。
- **视觉设计 3.5/5**
  - 目标页的裁决紧贴标题，验收标准头在 600px 以内，accept 弹层阻塞项在前。
  - 但看板上本该最醒目的 G-0001 行，计数格在英文常用宽度下重叠（`flows/crop-noci-en-1440-crit.png`）。
  - peek 的来源栏标签掉到陈述下方（`flows/crop-peek-en-prov-r5.png`）。
- **原创性 4/5**
  - 产品身份清楚，welcome 的样例印章和“事实与声明分开”说得很明白（`flows/welcome-zh-CN-light-1440.png`）。
- **工程细节 3.5/5**
  - 上一轮列的工艺问题大多修了：中点、zh 断词、开关状态、建议块颜色。
  - 但两处修复（D65、D71）都只在 zh 或 1100 下验证，英文常用宽度出现回归。
  - bundle 总余量只剩 22 B（`checks/bundle.log`）。
- **信息架构 4/5**
  - 看板 → peek → 目标页或评审 → Esc 回到原选中行，这个循环已经闭合（`flows/log-peek-en.txt`、`flows/log-board-*.txt`）。
  - 剩下的是命名和计数问题（P3-01）。
- **交互体验 4/5**
  - 所有出口都能落地，没有 pageerror。
  - 评审 G-0003 用 a、j、a、a、v 再按 ⌘⇧↵，能顺利打开 accept（`flows/log-review-G0003.txt`）。
  - peek 里按 ⇧R 没反应（P3-03）。
- **功能完整性 4/5**
  - 所有界面都有内容、空状态和错误状态。
  - 设置 git 身份后 accept 能否解锁，mock 下没法验证。

---

## 问题清单

### P0

无。

### P1

无。

### [P2-01] 没有 CI 时，看板 G-0001 行的计数格在英文 1440/1800 下重叠并被截断（D71 引入的回归）

- **位置**
  - `overview` 的 “To review” 分组，G-0001 行的 `.g-crit` 格，没有 CI 的状态。
  - en，light 和 dark，宽度 1440 和 1800。
  - 源码：`apps/desktop/src/styles/app.css:4301-4322`。
    - `.g-crit` 设了 `overflow: hidden`。
    - `.criteria-bar.tiny .segs` 设了 `min-width: 0`，`.seg` 设了 `flex: 0 1 9px; min-width: 3px`。
    - `.meta` 设了 `flex: none`。
  - `app.css:4393` 只在 ≤1240 时隐藏 `.crit-human`。
- **截图证据**
  - `flows/crop-noci-en-1440-crit.png`：“1 doesn't count” 的 “1” 压在第 2、3 段上；“·” 后面只剩 “human”，“0/2” 被切掉。
  - `flows/crop-noci-en-1800-crit.png`、`flows/crop-noci-en-dark-1440-crit.png`：同样的问题。
  - `flows/g1-noci-en-light-board-row.png`：整行。
  - `flows/log-g0001-rows-en-light.txt`：1800 时 `.g-crit sw=161 cw=143`，子元素右边界 1163，超出格子右边界 1145。
  - 对照（正常）：`flows/crop-noci-en-1100-crit.png`（1100 下人工计数被隐藏）、`flows/crop-noci-zh-1440-crit.png`、`flows/crop-noci-zh-1800-crit.png`。
- **问题：** 格宽 143px 放不下“段 + 1 doesn't count + · + human 0/2”。三段被压到 3px，被文字盖住；人工计数被裁掉。
- **影响**
  - 这一行正是上一轮 P1-02 要修的那行，琥珀色的“不作数”段是它和 G-0003 唯一的视觉区别，现在被盖住了。
  - 主管在默认语言、参考宽度下扫看板，看到的是一个坏格子，还少了“人工 0/2”这件待办。
  - 实现者的 e2e 只测了 1100。
- **修正目标**
  - en 和 zh，light 和 dark，1440 和 1800 下的 G-0001 行同时满足：
    - `.g-crit` 的 `scrollWidth ≤ clientWidth`。
    - 没有文字矩形和任何 `.seg` 矩形相交。
    - 每段宽度 ≥ 5px。
    - “human 0/2”完整可见，或者像 1100 那样挪出这一格。
  - 用无 CI 的 fixture 补 1440 和 1800 的 e2e。可以参考 `checks/zz-review-g0001.spec.ts` 末尾的 rows 测试。

### [P2-02] 英文 peek 里，来源标签掉到陈述下方，┆ 单独占一行（D65 引入的回归）

- **位置**
  - peek 抽屉（看板上按 Space），所有带 agent 声明的行：Evidence 台账里的 “Criterion met”、“Budget and next step” 里的 “Next”、原因行。
  - 目标 G-0001、G-0003、G-0005；en；所有宽度（抽屉固定宽 `--drawer-w: 448px`，`tokens.css:54`）。
  - 源码：`apps/desktop/src/styles/console.css:38-47`（`.prov-badge` 改成了 `flex-wrap: wrap`，加了 `.nw`）和 `src/components/ProvenanceFrame.tsx:41`。
- **截图证据**
  - `flows/crop-peek-en-prov-r5.png`：
    - “npm test passes locally” 在第一行，左边只有一个 ┆。
    - “Agent says” 和 “Criterion met” 落在第 2、3 行，在陈述下方。
    - “Reproduce the failing test first / Agent says / Next” 也一样。
  - `flows/g1-noci-en-light-peek.png`、`flows/matrix/peek-noci-en-light-1440.png`：同样的问题。
  - `flows/scan-en-light-1440.txt` 的 prov 段：标签顶比正文顶低 19px，栏宽 78px。
  - 对照：
    - 第 4 轮标签在陈述旁边（`/tmp/tower-design/review4/flows/peek-G0001-en-light.png`）。
    - zh 正常（`flows/crop-peek-noci-zh-CN-dark.png`、`flows/crop-peek-zh-1100-prov.png`），只是折出的第二行起点比 ┆ 更靠左。
- **问题：** 英文标签和类别连起来比 78px 宽，换行后 ┆ 留在第一行，标签移到下面。读者先看到一句没有出处的陈述，标签看起来又像是下一块的说明。
- **影响**
  - 来源栏是把一句话读成“声称”而不是“事实”的关键（AC4）。peek 是快速判断用的视图，最需要它一眼可见。
  - 标签和声明的语域都还在，所以不算触发“把声称画成事实”这条硬性门槛，但这个保护被削弱了。
- **修正目标**
  - en 和 zh，1100、1440、1800 下的所有 `.prov-frame`：
    - 标签第一行的顶和陈述第一行的顶相差不超过 ±2px。
    - ┆ 和 “Agent says” 在同一行。
    - 类别（Criterion met / Next / Cause）放在栏的第二行，或者放在标签后面。
    - 栏内没有一行的起点比 ┆ 更靠左。
  - 在 peek 里补一条这个几何的 e2e 断言。

### P3（细节）

- **P3-01 “To review / 待评审”一个词指四个集合，计数对不上**
  - 证据：`flows/g1-noci-en-light-overview.png`、`flows/g1-noci-en-light-goal.png`。
    - 侧栏导航写 “To review 2”，侧栏分组写 “To review 1”。
    - 看板分组写 “To review 1”，Needs you 页里也有一个 “To review” 分组。
    - 标题栏是 ◆3，看板上却能看到 4 行 ◆。
  - 影响：用户不再相信数字，会去逐个点开核对。
  - 目标：一个词只指一个集合；或者同名的计数相同；标题栏 ◆ 的数目等于 ◆ 行数，或者写明它数的是什么。
- **P3-02 裁决和 ◆ 在几个界面重复**
  - 证据：
    - `flows/crop-noci-en-sidebar-g1.png`：侧栏 G-0001 行首尾各一颗 ◆。
    - `flows/g1-noci-en-light-peek.png`：peek 头部写 “◆ G-0001 ◆ Passed, doesn't count”，下面 “Now: Passed, doesn't count” 又重复一次。
    - `flows/g1-noci-en-light-inbox-card0.png`：inbox 卡片的头部和印章行各写一次裁决。
  - 看板行已经降到一颗 ◆。
  - 目标：每行最多一颗 ◆，每个界面裁决只出现一次。
- **P3-03 peek 打开时按 ⇧R 没反应，也没有提示**
  - 证据：`flows/log-peek-en.txt`、`flows/log-peek-zh-CN.txt`，“key Shift+R → peek”。
  - 目标：⇧R 关掉 peek 并开始队列；或者在 peek 的键栏说明这时不能用。
- **P3-04 11px 标签（实现者在 D54 选择保留）**
  - “Mark read / Revert hunk” 等是 11px，kbd 是 10px，不是句子，所以 AC9 仍成立。
  - 长时间评审时偏小。
- **P3-05 bundle 总余量只剩 22 B**
  - 证据：`checks/bundle.log`，163,818 / 163,840（第 4 轮余 30 B）。
  - 影响：下一个功能几乎一定超预算，到时就会碰到“为了装下而提高预算”这条硬性门槛。
  - 目标：做下一个功能之前，先腾出至少 1 KB。
- **P3-06 零碎的折行和文案**
  - 合同摘要右栏的 “Ports on this machine” 折成两行（`flows/g1-noci-en-light-goal.png` 右栏）。
  - welcome 的 git 行，“需要先设置”的“置”单独落到下一行（`flows/welcome-zh-CN-light-1440.png`）。
  - zh 的 Needs you 页里：
    - 提示“给提示，或只告诉它哪些测试失败，/ 这些测试仍对它隐藏……”在逗号处断行，读起来别扭。
    - 按钮是英文 “Approve / Reject”，下面的说明却写“‘批准’和‘驳回’都会带上这段说明”，两处叫法对不上（`flows/route-inbox-zh-CN-dark-1100.png`）。
- **P3-07 zh 界面里有 supervisor 和 fixture 的英文（D51 Deferred，数据侧问题，只做记录）**
  - 证据：`shots/review-G-0003-zh-dark.png` 的风险理由；`flows/route-inbox-zh-CN-dark-1100.png` 的假设句和标准标题。

---

## 第 4 轮（`815bd99`）问题复核

| 编号 | 判定 | 证据 |
|---|---|---|
| P1-01 peek 的所有跳转都失效，并抛异常 | **已修复** | 5 个目标 × 2 个变体都测了，全部没有 pageerror。G-0001、G-0003：r 和 Review 进评审页，↩ 和 Open 进目标页。G-0002、G-0004、G-0005：没有 Review 按钮，r 不动作，↩ 和 Open 进目标页。Esc 回来选中行不变（`flows/log-peek-en.txt`、`flows/log-peek-zh-CN.txt`、`flows/peek-zh-CN-G-0003-key_Enter.png`）。 |
| P1-02 无 CI 时，不作数的目标归到“待验收”，计数条丢了“不作数” | **语义已修复；渲染回归见本轮 P2-01** | 组名改成 “To review / 待评审”；计数条三段是已验证、已验证、不作数，写着 “1 doesn't count / 1 项不作数”（`flows/g1-noci-en-light-overview.png`、`flows/log-g0001-noci-*.txt`）。en 1440/1800 下这一格重叠。 |
| P2-01 中点出现在计数条和预算行以外 | **已修复** | 4 个变体 × 13 条路由加弹层扫描，文本、伪元素、aria、title、placeholder、alt 里都没有越界的中点。只剩允许的位置：计数条 `.sep`（aria-hidden）、计数条 title、预算行和它的 title。Learning 证据行改用逗号（`flows/scan-*.txt`）。 |
| P2-02 建议块用了验证绿侧条 | **已修复** | 侧条换成 `--border-strong`（light 下 `oklch(0.2 0.01 70/0.22)`，dark 下 `oklch(1 0 0/0.16)`）（`flows/r1-suggestion-crop-en.png`、`flows/log-review-G0001.txt`）。 |
| P2-03 文件头 “Reviewed/已审” 开关读成状态 | **已修复** | 未按下时写 “Mark reviewed / 标为已审”，按下后写 “✓ Reviewed / ✓ 已审”（`flows/crop-file-head-states.png`）。 |
| P2-04 readout 少了 “runner patched”，合并队列只写 “Merges cleanly” | **已修复** | readout 的 C1、C5 都带上了 “runner patched”（`shots/review-G-0001-readout-en-light.png`）。合并队列写 “Merges cleanly” 加 “◆ Passed, doesn't count”（`flows/g1-noci-zh-CN-dark-operations.png`、`flows/matrix/operations-en-light-1100.png`）。 |
| P2-05 zh 来源栏断在词中间，“Agent 称 Agent claim” 重复 | **zh 已修复；引入 en 回归（本轮 P2-02）** | zh 先写“Agent 称”，下一行写完整的“标准已满足”（`flows/crop-peek-noci-zh-CN-dark.png`、`flows/crop-peek-zh-1100-prov.png`）。Learning 里“Agent says / Agent 称”只出现一次（`flows/route-learning-*.png`）。en peek 里标签掉到陈述下方。 |
| P3-01 Esc 回看板，选中行丢失 | **已修复** | 从评审、目标页、peek 用 Esc 返回，选中的都是刚离开的那个目标（`flows/log-board-*.txt`、`flows/log-peek-*.txt`）。 |
| P3-02 G-0001 行的 ◆ 叠用 | **部分修复** | 看板行只剩一颗 ◆。侧栏行和 peek 头部仍然重复（本轮 P3-02）。 |
| P3-03 Learning 上三个实心“批准” | **已修复** | 改成 default 按钮（`flows/route-learning-en-light-1440.png`）。 |
| P3-04 11px 标签 | **保留（D54）** | 同本轮 P3-04。 |
| P3-05 1800 宽时看板行太空 | **已缓解（D23 仍是 Deferred）** | 1800 下内容居中并限宽，标题和 ID 不再相隔很远（`flows/matrix/overview-noci-en-dark-1800.png`）。 |
| P3-06 zh 里 supervisor 文案是英文 | **未修（D51 Deferred，数据侧）** | `shots/review-G-0003-zh-dark.png`。 |
| P3-07 命令面板的逐个评审顺序和队列起点不同 | **已修复** | 命令面板先列 Review G-0001，再列 G-0003，和 ⇧R 的 Queue 1/2 一致（`flows/palette-en-light-1440.png`、`flows/b-shiftR-en-light-1440.png`）。 |
| P3-08 G-0005 还剩一句重复 | **已修复** | “environment problem / 环境问题”只出现一次（`flows/log-goal.txt`、`shots/goal-G-0005-cannot-run-en-light.png`）。 |

---

## 设计合同 AC1–AC11 与硬性门槛

| 条目 | 判定 | 证据 |
|---|---|---|
| AC1 | 满足 | 标题底都在 100（`flows/log-goal.txt`）。裁决顶在 1440 en、1100 zh、1800 en dark、1800 zh light、1440 zh light 下都是 106，在 1100 en 下是 134，都在 120px 以内。验收标准头分别是 578、542、560、542、560、588，全部 ≤ 600。验收标准之上只有哨兵，没有 agent 写的区块（`flows/g1-noci-en-light-goal.png`）。 |
| AC2 | 满足（低危折叠没有重测） | 高危哨兵在验收标准之前，带证据行（`flows/g1-noci-en-light-goal.png`）。本轮没有改动低危折叠，也没有重测。 |
| AC3 | 满足 | C1、C2、C5 默认各占两行。通过的标准上的标签是琥珀色，不是危险色。每条标准里同一事实只出现一次。子行缩进一致（`flows/g1-noci-en-light-goal.png`）。 |
| AC4 | 满足（有瑕疵） | 目标页、评审、inbox 里，agent 写的文本都标了“Agent says / Agent 称”，台账里的无依据用 ◇。en peek 里标签错位（P2-02）。 |
| AC5 | 满足 | j×6 过程中，行顶始终是 149、189、229、269、349、371。决策只在 ↩ 或点击时打开。Space 和 R 作用于选中行。peek 的出口现在都能用（`flows/log-board-*.txt`、`flows/b-j6-*.png`）。 |
| AC6 | 满足（解锁没法验证） | 底栏列出所有阻塞项，阻塞项在信息列表之前（`flows/accept-G-0001-*.png`、`flows/accept-G-0003-*.png`）。mock 下 git 身份没设置，Accept 一直禁用。 |
| AC7 | 满足 | 有 CI 和没有 CI、en/zh、light/dark 下，G-0001 在任何界面都没被叫作 Ready。评审头的 Accept 是 `btn-default`（`flows/log-g0001-*.txt`、扫描里的 Ready 段）。 |
| AC8 | 满足 | 绿色只出现在：G-0003 的已验证字形、验证结果的通过标记、seg-verified 段、印章（包括 welcome 的样例印章）。diff 的新增底色是另一类颜色。没有跨类别的单一 N/M。 |
| AC9 | 满足 | detector 在 23 个改动的 UI 文件上报了 15 条，没有 `tiny-text` 或 `low-contrast`，和第 4 轮的 15 条相同。具体是：radius 2px 和 9px 共 7 条，10px 字号 4 条，side-tab 3 条，未登记颜色 1 条（`checks/detect.json`、`checks/changed-ui-files.txt`）。扫描里没有低于 12px 的句子。 |
| AC10 | 满足 | 见下面的工程检查表。 |
| AC11 | **不满足** | 本轮加权得分 7.85，低于 8.0。没有 P0 或 P1。 |

| 硬性门槛 | 判定 | 证据 |
|---|---|---|
| 绿色聚合或绿色步骤勾 | 未触发 | CI 计数、welcome 步骤、accept 清单都是中性色；扫描里没有绿色的统计值。 |
| 把声称画成事实 | 未发现 | 所有 agent 文本都标了出处。en peek 的标签错位削弱了这一点，但标签仍在，记为 P2-02。 |
| 用户已有改动丢失 | 没有检查 | 本轮没有构造这个场景。 |
| 为了通过而削弱测试 | 未发现 | `checks/test-diff.log`：断言只是随文案更名（aria-pressed 改成文字状态，中点改成逗号）。FileDiff 的 “virtual” 断言随徽标一起删除。 |
| 为了装下而提高预算 | 未发现 | `checks/tools-diff.log` 为空。注意余量只剩 22 B（P3-05）。 |

## G-0001 跨界面一致性、绿色扫描和中点扫描

| 界面 | 有 CI 失败时 | 无 CI 时 | 判定 |
|---|---|---|---|
| 看板 | 在 “Needs you” 组，写 “Passed, doesn't count” 和 “CI failed” | 在 “To review / 待评审” 组；三段分别是已验证、已验证、不作数，写 “1 doesn't count” | 一致；en 1440/1800 下有渲染缺陷（P2-01） |
| 侧栏 | 在 “Needs you” 下 | 在 “To review” 下，◆ 重复 | 一致（P3-02） |
| peek | “Passed, but not counted as verified: Passed, doesn't count” | 同左 | 一致（裁决重复，P3-02；en 标签错位，P2-02） |
| 命令面板 | “G-0001 Fix the cart total ◆ Passed, doesn't count” | 同左 | 一致 |
| Needs you 卡片 | CI 卡加评审卡，评审卡写 “Passed, doesn't count” | 一张评审卡 | 一致 |
| 目标页 | 裁决紧贴标题，第三段琥珀 | 同左 | 一致 |
| 评审头 | 同样的裁决，Accept 是 `btn-default` | 同左 | 一致 |
| readout | 裁决一致，C1、C5 带 “runner patched” | 同左 | 一致 |
| accept 弹层 | 写 “2 of 3 machine criteria count: in one, a test that must fail passed” 和 “Seal withheld” | 同左 | 一致 |
| Operations 合并队列 | “#1 … Merges cleanly ◆ Passed, doesn't count” | 同左 | 一致 |

证据：`flows/log-g0001-{ci,noci}-{en,zh-CN}-{light,dark}.txt` 和 `flows/g1-*.png`，所有组合都没有 pageerror。

- **绿色扫描：** 见 AC8。另外，建议块和 accept 清单都不是绿色。
- **中点扫描：** 见上一轮 P2-01 的复核。

## 交互流程记录

- **看板**
  - j、k 移动时行不跳。
  - Space 打开 peek，Esc 回来选中行不变。
  - ↩ 打开决策或目标页，R 进评审。
  - ⇧R 进队列，从 G-0001 开始，显示 Queue 1/2（`flows/log-board-*.txt`）。
- **peek：** 见上一轮 P1-01 的复核；⇧R 无效（P3-03）。
- **评审 G-0003（键盘）**
  - 按 a、j、a、a、v，再按 ⌘⇧↵，accept 弹层打开。
  - 因为 git 身份没设置，Accept 一直禁用（`flows/log-review-G0003.txt`、`flows/r3-*.png`）。
- **评审 G-0001**
  - 文件头开关、建议块、要求修改都正常，en 和 zh 都测了（`flows/log-review-G0001.txt`、`flows/r1-*.png`）。
- **合同编辑**
  - + Look 加出 C2。
  - holdout 标签写 “Draft claim, inactive until you approve it” 和 “You approved, hidden”（`flows/c-*.png`）。
  - 按 ⌘↩ 后页面停在 New goal，日志被截断，没能确认提交结果。

## 工程检查（日志都在 `checks/`）

| 检查 | 结果 | 日志 |
|---|---|---|
| tsc | 通过 | `tsc.log` |
| vitest | 41 个文件、220 个测试通过 | `vitest.log` |
| 全量 e2e（含 axe） | 284 通过，76 跳过，EXIT=0 | `e2e-full.log` |
| shots.spec | 69 通过 | `shots-run.log` |
| line-limit | 通过 | `line-limit.log` |
| bundle-budget | 通过，余量很小（见下） | `bundle.log` |
| vite build | 通过 | `build.log` |
| `tools/` diff | 为空 | `tools-diff.log` |
| 测试 diff 抽查 | 没有削弱 | `test-diff.log` |
| detector | 15 条 advisory，和上一轮相同 | `detect.json` |

bundle-budget 的明细：

| 部分 | 大小 | 预算 |
|---|---|---|
| 启动 | 54,176 | 65,536 |
| 按需 | 109,642 | 110,592 |
| 合计 | 163,818 | 163,840（余 22 B） |
| 目标页 chunk | 11,381 | 12,288 |
| worker | 197,901 | 262,144 |

## 没能覆盖的

- **原生窗口（标题栏、阴影）：** 没有运行 `tools/screenshot.sh`，也没有运行 cargo。
- **accept 在设置 git 身份后的解锁状态：** mock 下 Accept 一直禁用，没法验证。
- **真实 supervisor 的中文数据：** fixture 里的风险理由、假设、标准标题都是英文。
- **硬性门槛“用户已有改动丢失”：** 没有专门构造这个场景。
- **合同 ⌘↩ 提交后的结果：** 日志被截断，没能确认。这个 commit 没有改动合同编辑器。
- **AC2 的低危折叠：** 本轮没有改动，也没有重测。
- **矩阵脚本的自动重叠检测：** 误报多（省略号、视觉隐藏标签），还漏掉了 P2-01。重叠的判定以截图和局部截图为准。

## 验收条件

要通过，需要做到：

1. 修复 **P2-01** 和 **P2-02**，并按各自的“修正目标”补上 e2e：en 1440/1800 的计数格几何，en/zh peek 的来源栏几何。
2. 重新做一次独立评审，加权 ≥ 8.0，且没有 P0 或 P1（AC11）。

建议一起处理：P3-01（同名不同数的计数）、P3-05（bundle 余量）。