The sandbox refused writing `report.md`, so here is the full report. The evidence is in `/tmp/tower-design/review2-0239/` ($R): `shots/`, `flows/`, `sheets/` and `checks/`. Everything was re-rendered with `E2E_PORT=1441`. The checkout `/tmp/tower-design/wt-review2` is clean: the `zz-review-*` specs and `test-results/` are deleted.

# Tower 前端设计评审：`aa1026b`（design/evolution，基线 `bf22cad`）

**结论：不通过设计验收。** 加权得分 7.4/10，低于 8.0；还有两条 P1 未解决：看板上的 Space 键，以及高危哨兵的说明被截断。改动解决了基线里大部分 P1，方向是对的。这两条 P1 都是这次改动新引入的问题，或是标成已修但其实没修。

**设计方向：成立。** 需要局部调整，不需要重新设计。

**评审范围：**
- 所有截图和交互都在 1441 端口上重新渲染。每次运行都用 `log-origin.txt` 确认页面来自本 checkout，`HighSentinels` 和 `goal-verdict` 都存在。
- 69 张全量截图，覆盖：welcome（干净 / 红色）、空看板、看板（1100/1440/1800）、inbox、目标页 G-0001/2/4/5、评审 G-0001/G-0003/空评审、accept 弹层、读数、look 对比、合同编辑、settings（含 phone 和 attention）、learning、operations、快捷键表、命令面板、peek、活动面板。语言和主题为 en 亮色、zh 暗色两组。
- 走过的流程：
  - 看板 j×5、Space、R、Enter。
  - 目标页在 4 种变体下量几何位置；展开 C1/C2 和低危折叠。
  - G-0001 评审：首帧计时、键盘走查、accept 弹层、点击原因行。
  - G-0003 用纯键盘过完（7 个键）。
  - 合同编辑：+Look、⌘↩ 和点击提交。
  - 命令面板、快捷键表（有选中和无选中两种）。
  - 8 个路由 × en/zh 的小字 DOM 扫描。
- 没能覆盖：
  - 原生窗口（没跑 `tools/screenshot.sh`）。
  - `impeccable detect`：本机没有安装。
  - 合同提交之后的去向：mock 的 `create_goal` 不返回目标，页面停在 New goal，无法判断真实行为。
  - 看板决策行的 peek 抽屉：被 P1-01 挡住，打不开。
  - "Review every ready goal in turn" 实际会串哪些目标：没留截图，不下结论。

## 分维度评价（简报的 0–10 加权量表）

| 维度 | 权重 | 分 | 依据 |
|---|---|---|---|
| 产品适配 | 15% | 8.0 | 目标页先给证据：裁决在标题下 4px，验收标准标题在 575px，agent 的话一律标为 "Agent says"。held-out 卡（`shots/heldout-card-en-light.png`）把"只给你看"讲得很准。扣分在最危险的信号上：第一条高危哨兵的说明和"请亲自确认"被截掉了（P1-02）。 |
| 信息架构与工作流 | 20% | 7.0 | 目标页顺序是裁决 → 高危哨兵 → 决策 → 验收标准 → 低危 → 改动 → 原因（`flows/log-goal.txt`），符合"先看证据再看说法"。看板决策行仍然不带证据（P2-03），Space 坏了（P1-01），R 会进一个空评审（P3-02）。 |
| 视觉层级 | 15% | 7.5 | 裁决行就在标题的阅读路径上，accept 只在过数时才是主按钮，这两处层级清楚（`shots/goal-G-0001-en-light.png`、`flows/review-1800-zh-dark.png`）。同一类质疑在 C1 是琥珀、在 C2 是灰（P2-01），层级不可预测。 |
| 原创性与产品身份 | 15% | 8.0 | 这套语法不是模板：印章、◆、双轨计数条、"Agent says" 说法栏、For you only。welcome 页仍然像落地页（D22，已延后）。 |
| 工艺与排版 | 10% | 7.0 | 字号和 mono 用得一致，DOM 扫描没有找到 12px 以下的句子。问题都在细节：句中省略号、低危折叠把路径配错了标题（P2-02）、1100 宽时 Review 按钮孤行、G-0002 页上有空的双分隔线、评审首帧有行号没代码。 |
| 密度与克制 | 10% | 7.5 | 1440 宽下关键内容都在首屏。仍有重复："Needs your confirmation" 每行都写；"Check during review" 既是标题又是每行的标签；accept 弹层里有两个 "Sentinels" 小标题。 |
| 交互 | 10% | 6.5 | 做对了的：j 稳定（行顶 6 次都是 371px）、Enter 打开、R 进评审、点原因行会聚焦 "Your name"、G-0003 七键过完。Space 打开卡片并让行跳 116–375px，提示栏却写着"␣ peek"（P1-01）。 |
| 设计系统一致性 | 5% | 7.0 | 限定标签的色调没有规则（P2-01）。同一目标在侧栏是 ‖/✓/◆，在看板一律 ◆（P2-03）。MicroVM 禁用了，看起来却和可用的一样（P3-04）。 |

**加权总分：7.375，约 7.4/10。**

按本角色原有的 1–5 分维度：产品适配性 4，视觉设计 4，原创性 4，工程细节 3，信息架构 4，交互体验 3，功能完整性 4。

## AC1–AC11 核对

| AC | 判定 | 证据 |
|---|---|---|
| AC1 | 满足 | 在 1440×900 下，标题到裁决行间距 4px（en 和 zh 都是）。验收标准标题在 575px（1440 en/zh）、585px（1100 en）、557px（1100 zh），都小于 600。验收标准之上没有 Cause、Next 或 Summary（`flows/log-goal.txt` 的 order 行）。截图：`shots/goal-G-0001-en-light.png`。 |
| AC2 | 不满足 | 高危哨兵确实排在验收标准之前，第二条的代码行完整。但第一条没有代码行，它唯一的证据就是说明文字，而这段文字被截成一行，在 4 种变体下都是 `clipped:true`。完整文字只在 hover 的 title 里；评审 notes 和 accept 弹层都只给标题（P1-02）。低危折叠确实点出了 `~/.ssh/config`，但放在了别的哨兵标题旁边（P2-02）。 |
| AC3 | 部分满足 | 满足：折叠态每行最多两行（50px）；通过的标准没有红色标签；子行同一缩进。不满足：C2 展开后 "held-out tests, for you only" 出现两次（`flows/goal-c2-open.png`、`flows/log-goal-int.txt`）；同一个高危事实在 C2 上成了灰色观察（P2-01）。 |
| AC4 | 满足 | 目标页两条 agent 文本都带 "Agent says" 或 "Agent 称"，并有 "Agent claim:" 读屏前缀（`flows/log-goal.txt`）。台账里的 Unsupported 带 ◇，不是纯灰。 |
| AC5 | 不满足 | j×5 后首行行顶不变（371×6），满足。Enter 打开，满足。R 对选中行的目标生效（`flows/b-R-3rd.png`），满足。Space 不满足：在决策行上 Space 原地展开卡片，没有 peek（`flows/log-b.txt`：peek drawers 0、opened cards 1，行顶 371→746 和 371→487）。DESIGN_REVIEW 把 D08 标成 "Fixed"，这不实。 |
| AC6 | 满足 | Accept 禁用时，旁边有可见行 "Set git's name and email first · Tick C3, C4 first"，点击后焦点到 Your name 输入框（`flows/log-accept.txt`）。git 阻塞项在最上方。C3/C4 夹在印章和摘要格之后，但仍在信息列表之前（见 P3-03）。 |
| AC7 | 已看到的界面上满足 | 命令面板里 G-0001 是 "Passed, doesn't count"（`flows/palette-cart.png`）。G-0001 评审头的 Accept 是描边按钮，G-0003 的是实心主按钮（`shots/review-G-0003-en-light.png`）。目标页的 Review 按钮在 G-0001 上不是主按钮。G-0001 的 peek 因为 P1-01 打不开，没能检查。briefing 没覆盖。 |
| AC8 | 满足（有一处边缘） | 在看过的截图里，绿色只出现在验证器结果和 verified 目标字形上。Learning 已改成中性色。计数分轨，没有跨类别的 N/M。边缘情况：welcome 生命周期条在 "Ready to accept / Accepted" 两步上用了绿色 ✓（`shots/welcome-clean-en-light.png`）。 |
| AC9 | 部分可查 | 在 8 个路由 × en/zh 上扫 DOM，没有 12px 以下的句子。低于 12px 的只有 11.5–12px 的 mono 代码值和 11px 的按键提示栏（`flows/log-tiny.txt`）。`impeccable detect` 本机未安装，检测器那一半无法核对。 |
| AC10 | 满足（余量极薄） | tsc 0 错。vitest 41 个文件、218 个测试通过。改动涉及的 e2e 94 个通过（flows、honesty、review-keys、smoke 含 axe、type）。shots.spec 产出 69 张图。line-limit 通过。bundle-budget 通过（构建输出在仓库外）。但总量 163,402/163,840 B 只剩 438 B，goal page chunk 12,138/12,288 B 只剩 150 B（`checks/`）。 |
| AC11 | 不满足 | 即本评审：7.4/10，并有 2 条 P1。 |

## 问题清单

### [P1-01] 看板决策行上按 Space 会原地展开卡片，不出 peek，页面跳动
- **位置：**`overview`，"Needs you" 下的决策行（G-0004、G-0001），亮色，1440 宽。
  - 决策行的 `.g-title` 是按钮。聚焦后，`src/lib/keys.ts:79`（`activatesTarget`）让它自己用掉了 Space，把卡片点开了。
  - 所以 `src/views/Overview.tsx:161` 的 peek 绑定没有执行。
- **截图证据：**
  - `$R/flows/b-space-1.png`：按 j 选中 G-0004 后按 Space，整张 held-out 卡片展开，下面的行全部下移。
  - `$R/flows/peek-G0001.png`：G-0001 的 CI failed 卡片展开，没有抽屉。
  - `$R/flows/log-b.txt`：`peek drawers: 0 | opened cards: 1 | row top 371 -> 746` 和 `371 -> 487`。
  - 提示栏一直写着 "␣ peek"。
- **问题：**
  - Space 实际做的是"打开"，和 Enter 一样，违反了 AC5 的"决策只在 Enter 或点击时打开"。
  - D08 被标成 Fixed。
  - 实现者的 flows.spec 没测决策行上的 Space。
- **影响：**
  - 同时盯多个 agent 的工程师在看板上分诊时，最需要"不离开列表先看一眼"的正是这几行。
  - 现在一按 Space，列表跳动 116–375px，用户要重新找回原来那一行。
  - 提示栏的说法和实际行为不一致，会让人以后不再信任按键提示。
- **修正目标：**
  - 在任何选中的看板行（含决策行）上按 Space，都打开该目标的 peek，所有行的行顶不变。
  - 再按 Space 或 Esc 关闭，焦点回到原行。
  - 验收方法：e2e 在 j 选中 G-0004 后按 Space，断言 `.peek-drawer` 数量为 1、`.board-queue .decision` 数量为 0、行顶不变。

### [P1-02] 高危哨兵的说明被截成一行，完整内容只能 hover 看到；第一条因此等于没有证据
- **位置：**`goal/G-0001` 的 Sentinels 区，en/zh × 1100/1440。
  - 截断来自 `src/styles/app.css:1622-1628`（`-webkit-line-clamp: 1`）。
  - 那里的注释写着 "whole on hover and in review"，与实际不符。
- **截图证据：**
  - `$R/shots/goal-G-0001-en-light.png`：第一条红 ■ 在 "…the assertions of C2 could …" 处截断，这一条也没有代码行。
  - `$R/flows/review-notes-open.png` 和 `$R/shots/review-G-0001-accept-en-light.png`：评审 notes 和 accept 弹层都只有标题。
  - `log-goal.txt`：4 种变体都是 `clipped:true`。
- **问题：**
  - 被截掉的正是这条哨兵唯一的证据和操作指引：涉及 C2；Tower 不认识这种测试写法；"请亲自确认这些测试真的在检查"。
  - 完整文本只放在 title 属性里，键盘和读屏用户都碰不到。
  - 基线里这段文字是完整显示的，所以这是回退。
- **影响：**
  - 用户在决定是否接受一个"通过但不作数"的目标时，最危险的信号只剩一个泛泛的标题。
  - 他不知道该复查哪条标准、怎么查。在这个产品里，这正是红色存在的理由。
- **修正目标：**
  - 每条高危哨兵在目标页上不靠 hover 就能看到：涉及哪条标准、为什么、要用户做什么。
  - 没有代码行的哨兵，它的说明就是证据，必须完整显示。评审 notes 至少给出同一句。
  - 验收方法：在 1100 和 1440、en 和 zh 下，`.sentinels-high .sentinel-prose` 的 scrollHeight 都不超过 clientHeight。

### [P2-01] 通过标准上的限定标签色调没有规则，同一个高危事实在不同标准上轻重不一
- **位置：**`goal/G-0001` 的 C1/C2/C5。去重和改色逻辑在 `src/views/goal/CriterionRow.tsx:59-69`。
- **截图证据：**
  - `$R/shots/goal-G-0001-en-light.png`：C1 "runner patched" 是琥珀底，C2 "assertions not checked" 是灰字，C5 有两个琥珀标签。
  - `$R/flows/goal-c2-open.png`：C2 展开后，"held-out tests, for you only" 出现两次。
- **问题：**
  - 两处质疑都来自页顶的红色高危哨兵，一个却是琥珀、一个是灰色。
  - 去重后，C2 上的高危分量没了。
  - docs/12 §12.5.2 规定限定徽章用中性色，现在两种规则都没守住。
- **影响：**用户判断哪个"通过"不能信时，颜色给出的轻重是随机的。C2 的断言根本没被检查，看上去却比 C1 安全。
- **修正目标：**
  - 同类质疑在每条标准上都是同一色调，并且符合 §12.5.2 或文档里写明的例外。
  - 与高危哨兵关联的标准要标明关联，而不是降为灰色观察。
  - 展开态里每个标签只出现一次。

### [P2-02] 低危折叠行把 `~/.ssh/config` 放在了别的哨兵标题旁边
- **位置：**`goal/G-0001` 的 "Check during review" 折叠行，代码在 `src/views/goal/GoalBlocks.tsx:56`。
- **截图证据：**
  - `$R/flows/goal-low-fold.png`：折叠行读作 "◇ ~/.ssh/config  Program code reaches into assertion libraries… The agent repeatedly tried to re…"。
  - `$R/flows/goal-low-open.png`：这个路径其实属于第二条 "read outside its workspace"。
- **影响：**只看折叠行的用户，会以为改断言库的那条哨兵读了 SSH 配置。真正的越界读取那条反而被截断在行尾。
- **修正目标：**路径紧跟它所属的哨兵。验收方法：折叠行文本里，路径与其所属哨兵的标题相邻。

### [P2-03] 看板决策行不带目标的证据状态，字形也和侧栏不一致（D12 未解决，D10 部分未解决）
- **位置：**`overview` 的 "Needs you" 区。
- **截图证据：**
  - `$R/shots/overview-en-light.png`：G-0001 那一行只写 "CI failed test (ubuntu-latest, node 22)"，看不到 "Passed, doesn't count" 或 2 条高危。
  - `$R/flows/peek-G0001.png`：侧栏同样 4 个目标是 ‖ ✓ ◆ ‖，看板上 4 行一律 ◆。
- **影响：**要判断先处理哪个、哪个危险，必须逐个打开目标页。有两条高危哨兵的 G-0001，在看板上和一个普通暂停没有区别。
- **修正目标：**每条决策行用和目标页裁决相同的语法带上印章状态，1100 宽时仍是一行。字形与侧栏一致，或者明确只表达一种含义。

### [P2-04] "Accept" 同时指读过某块代码和接受整个目标（D14 未解决）
- **位置：**`review/G-0003` 和 `review/G-0001`。
- **截图证据：**`$R/shots/review-G-0003-all-accepted-en-light.png`：
  - 块头写 "Accepted, 3 lines folded"，状态栏写 "All 1 hunk accepted"。
  - 与此同时，目标并没有被接受。
  - 块头上还有 "Accept this hunk A"。
- **影响：**评审者过完所有块，看到"全部已接受"，可能以为工作已经完成，从而漏掉真正的接受。
- **修正目标：**块级读标记换一个和目标接受完全不同的动词，块头、状态栏、快捷键表三处同步修改。"Accept"/"接受" 只用于目标级动作。

### [P3-01] 评审首帧有行号和底色，却没有代码文字（D09 未解决）
- **截图证据：**`$R/sheets/review-tops.png`：
  - `review-G-0001-en-light`、`review-G-0001-zh-dark`、`review-G-0003-en-light`、`review-G-0003-zh-dark` 四张都是有编号的空行。
  - 作为对照，`final-review-theater-*` 里代码是完整的。
- **问题：**在单独的交互运行里，代码比表格晚 9ms（`log-review.txt`），主要是负载下的问题。
- **修正目标：**行号和代码文字在同一帧出现，高亮可以稍后再到。

### [P3-02] R 会进入"没有改动"的空评审，空状态缩在画布左侧（D21 未解决）
- **截图证据：**`$R/flows/board-R-on-decision.png`（在看板上对 G-0005 按 R）和 `$R/shots/review-empty-en-light.png`。
- **影响：**用户进到一个空视图，还得再点 "Open the goal page" 回去。
- **修正目标：**目标没有改动时，R 不跳转，或者直接去目标页并说明原因。空状态不再孤立在左侧。

### [P3-03] Accept 弹层的分组：阻塞项被拆开，有两个 "Sentinels" 小标题
- **截图证据：**`$R/shots/review-G-0001-accept-en-light.png`：
  - git 阻塞项在顶部，C3/C4 阻塞项排在大印章和 4 格摘要之后。
  - "Not evidence…" 和 "To look at" 下各有一个 "Sentinels"。
- **修正目标：**所有阻塞项连在一起放在最前；哨兵放在一个列表里，或者用不同的名字区分。

### [P3-04] 合同编辑：初始焦点、禁用项和标题行
- **截图证据：**`$R/shots/contract-en-light.png`、`$R/flows/c-contract-click-approve.png`、`log-contract.txt`（`focus on open TEXTAREA`，`microvm disabled true`）。
- **问题：**
  - 焦点直接落在 Purpose，跳过了上方的 Title；Title 没标必填或可选，"Done when" 却标了 "(optional)"。
  - MicroVM 是禁用的，但外观和可用时几乎一样，也不说为什么不可用。
  - 页头 "Contract shop New" 读起来是三个并列的词。
- **修正目标：**Title 明确标出必填或可选，并与初始焦点一致；禁用项明显不可用并给出原因；页头读作一句话。

### [P3-05] 没有选中行时，快捷键表不列 Space
- **截图证据：**`$R/shots/shortcuts-en-light.png` 和 `log-b.txt`（`sheet without selection has peek: false`）。提示栏却常驻 "␣ peek"。
- **修正目标：**快捷键表始终列出 Space，并说明它作用于选中行。

### [P3-06] G-0002 目标页在实时状态行下有一段空的双分隔线
- **截图证据：**`$R/flows/goal-G0002-1100.png`，在 y≈350 和 y≈377 有两条横线，中间没有内容。
- **修正目标：**区块为空时不渲染它的分隔线。

### [P3-07] 哨兵区的重复标签
- **截图证据：**
  - `$R/shots/goal-G-0001-en-light.png`：每条高危哨兵右侧都写 "Needs your confirmation"。
  - `$R/flows/goal-low-open.png`：标题 "Check during review" 下，每行右侧又写一遍 "Check during review"。
- **修正目标：**区块标题已经说明的状态，行内不再重复。

### [P3-08] 目标主动作的位置和名称随状态变化，1100 宽时会孤行
- **截图证据：**
  - `$R/shots/goal-G-0001-en-light.png`：裁决行末尾是 "Review 1 file R"。
  - `$R/flows/goal-G0002-1100.png`：标题右上角是 "Changes R"。
  - `$R/flows/goal-G0001-en-light-1100-full.png`：裁决行折成两行，按钮单独一行（verdict 高 52px，1440 宽时是 24px）。
- **修正目标：**同一个键 R 对应同一个位置和同一个名称。1100 宽时裁决行和它的按钮不分开。

## 做对了、值得保留的
- 证据优先：裁决和双轨计数在标题下 4px，验收标准不必滚动就能看到。
- "Agent says" 说法栏。
- held-out 卡和无法运行卡的写法。
- 命令面板和 peek 不再半透明。
- inbox 选中用中性底。
- G-0001 的 Accept 不再是主按钮。
- accept 弹层的可见原因行，以及点击后的聚焦。
- G-0003 七个键就能用键盘评审完。

## 验收条件
通过验收必须完成：
- **[P1-01]**：看板上 Space 打开 peek，页面不跳动，并有 e2e 覆盖决策行。
- **[P1-02]**：高危哨兵的说明不靠 hover 也完整可读。
- 修完后重新评审，加权分数必须达到 8.0 以上。

其他建议：
- [P2-01] 和 [P2-02] 与 P1-02 同属哨兵与限定这条链路，建议同一轮处理。
- [P2-03] 和 [P2-04] 是上一轮遗留、已登记为 Open 的问题。
- bundle 余量只剩 438 B（总量）和 150 B（goal page chunk），任何修复都要先在预算内腾出空间。