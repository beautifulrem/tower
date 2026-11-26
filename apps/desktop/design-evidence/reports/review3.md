# Tower 前端设计评审：`3faaf0c`（第三轮，对照基线 `bf22cad`、上一轮 `aa1026b`）

**结论：不通过设计验收。** 加权得分 **7.2/10**，低于 8.0。另有两条 P1 未解决：
- 一个“通过但不作数”的目标，在“需要你”和 peek 抽屉里被叫作“Ready to accept”，并画了绿色的“Verified”印章。
- 外部 CI 的通过数用了验证器的绿色勾。

这两条都违反 AC7、AC8 和硬性门槛。上一轮的两条 P1（Space、哨兵说明被截断）这次确实修好了。

**设计方向：成立。** 需要局部调整，不需要重新设计。

**评审范围：**
- 所有渲染都用 `E2E_PORT=1441` 和 `E2E_FIXTURES=/tmp/tower-design/fixtures`。我拉取过 `/src/lib/locales/en.later.ts`，里面有 3faaf0c 才有的文案 “Needs macOS 26”，确认页面来自本 worktree。
- 全量截图 69/69 张，在 `/tmp/tower-design/review3/shots/`，我逐张看过。
- 自写脚本跑了这些流程，证据在 `/tmp/tower-design/review3/flows/`：
  - 看板 j/k、Space、Enter、R、⇧R、Esc，覆盖 1440 en/亮色 和 1100 zh/暗色
  - peek 抽屉
  - G-0001 在 4 种变体下量几何位置，展开 C1/C2/C5，看低危折叠和轨迹
  - G-0002、G-0004、G-0005 在 1100 宽
  - G-0001 评审：首帧、notes、块键、快捷键表、accept 弹层、点击原因行
  - G-0003 在 zh、暗色、1100 宽下纯键盘过完
  - 合同编辑：写目的、+Look、⌘↩
  - 命令面板、inbox 的 j/k、learning、operations、settings
  - 12 个路由 × en/zh 的 DOM 扫描：绿色、小字、无省略号的截断、中点
- 工程检查自己跑过，日志在 `checks/`。
- 没能覆盖：
  - 原生窗口。
  - `impeccable detect`：本机没有安装。
  - 合同提交之后的去向：mock 的 `create_goal` 不返回目标。
  - accept 弹层在设置 git 身份、勾选 C3/C4 之后能否解锁：mock 不持久化状态。我看到勾已打上，行内仍写 “Waiting for your check”，但这无法归因到产品。
- 临时 spec、`test-results`、`dist` 都已删除，worktree 是干净的。

## 1. 分维度评分

| 维度 | 权重 | 分 | 一句话理由 |
|---|---|---|---|
| 产品适配 | 15% | 7.0 | 目标页和评审头对 G-0001 是诚实的（“Passed, doesn't count”、哨兵在前、印章扣留）。但 inbox 和 peek 把同一个目标说成 “Ready to accept ✓ Verified”，正好打在产品最核心的承诺上（P1-01）。 |
| 信息架构与工作流 | 20% | 7.0 | 看板 → 目标页 → 评审 → 接受这条链路完整，键盘可走通。扣分：inbox 把 G-0001 归进 “Ready to accept”，“逐个评审”队列也包含它；两个入口进入队列后的起点不同；⇧R 在看板上是死键；peek 的 Review 是死按钮；内嵌的 CI 卡把验收标准推过了 600px。 |
| 视觉层级 | 15% | 7.5 | 目标页的焦点清楚：裁决就在标题下 4px，accept 只在可信时才是主按钮。看板决策行的提问文字起点参差不齐；Learning 同屏有 3 个黑色主按钮。 |
| 原创性与产品身份 | 15% | 8.0 | 印章、“Agent says” 来源栏、双轨计数、held-out 卡都不是模板。welcome 仍像落地页。 |
| 工艺与排版 | 10% | 6.5 | Learning 的来源标签被截成 “Agent says · Age”；自动标题在单词中间截断；en 与 zh 的 accept 摘要说的不是同一件事；zh 界面里风险理由仍是英文；还有几处 11px 的标签。 |
| 密度与克制 | 10% | 7.0 | 1440 宽下关键内容都在首屏。C2 展开后同一事实出现两次；G-0005 的拒绝输出打印了两遍；合同页有 48 个可见控件。 |
| 交互 | 10% | 7.5 | 连按 5 次 j 行顶不动；Space 打开 peek，Esc 后焦点回到原行；R 有守卫；G-0003 六个键就能评审完。扣分：peek 里的 Review 死按钮还会抛未处理异常；⇧R 在面板上宣传了，在看板上却不工作。 |
| 设计系统一致性 | 5% | 6.0 | 同一目标的裁决、印章、计数条随界面而变：第三段在目标页是琥珀，在 inbox 是空心。同一目标的信任档位在 peek 是 Restricted S2，在目标页是 Full S2。“已看”和“已读”两个标记并存。 |

**加权总分：** 7.0×0.15 + 7.0×0.20 + 7.5×0.15 + 8.0×0.15 + 6.5×0.10 + 7.0×0.10 + 7.5×0.10 + 6.0×0.05 = **7.18，约 7.2/10**

## 2. 问题清单

### [P1-01] 不作数的通过，在“需要你”和 peek 里被叫作 “Ready to accept”，并画成绿色 “Verified”（AC7 不满足）
- **位置：**
  - `inbox` 的 “Ready to accept 2” 分组，G-0001 卡片。
  - 看板上任一行按 Space 打开的 peek 抽屉（G-0001）。
  - 评审队列：sidebar 的 “To review”、面板的 “Review every ready goal in turn”。
  - 在 en/亮色/1440 和 zh/暗色/1100 下都能复现。
  - 源码：`src/components/PeekDrawer.tsx:82-85`，`<Seal pin={s().verified_pin} compact />` 没有传 tampered 或 discounted 状态。
- **复现：**
  1. 打开 `overview`，按 j j j 选中 “Fix the cart total”，再按 Space。
  2. 或者打开 `inbox`，滚到 “Ready to accept”。
- **证据：**
  - peek：`flows/b-space-2.png`。抽屉头部是 “◆ G-0001 ✓ Verified @5f72710”，Now 一栏写 “Ready to accept ✓ Verified”。左侧同一行看板写的却是 “Passed, doesn't count”。
  - inbox：`flows/inbox-ready-group-en.png`。卡头写 “Ready to accept G-0001”，印章是绿色 “✓ Verified”，计数条是“绿、绿、空”，文字是 “Verified 2/3 · Observed 0/3”，缺了 “1 doesn't count”。目标页上同一条计数条是“绿、绿、琥珀”。
  - 日志：`flows/log-board.txt`（`peekHead=G-0001 | Verified by Tower: | Verified`），`flows/log-board-zh.txt`（“此刻 待验收 … Tower 已验证”），`flows/log-inbox.txt`。
  - 队列：`flows/crop-q-to-review-head.png`。从 sidebar 的 “To review” 进入，队列第一个就是 G-0001（Queue 1/2）。
- **问题：**
  - DESIGN_REVIEW 把 D06/AC7 标成已修复，但只修了面板、Operations 和评审头。
  - 用户最常停留的两个分诊界面仍然用摘要里的 `verified_pin` 直接画绿印章。
  - 这个目标有 2 条高危哨兵，C5 的金丝雀也被篡改了。
- **影响：**
  - 同时盯多个 agent 的工程师在“需要你”里分诊时，会把 G-0001 当成和 G-0003 一样“已验证、可接受”。
  - 真正的纠正要到进入评审头、打开 accept 弹层才出现。
  - 这正是产品定位里“绿只属于未被篡改的验证通过”要防止的误读。
- **修正目标：**
  - 裁决由一个函数统一给出，所有界面都用它。
  - 对 G-0001，在 inbox、peek、面板、sidebar、队列命名、Operations 上都不出现 “Ready to accept” 或 “待验收”，也不出现绿色印章；计数条的第三段为琥珀，文字里有 “1 doesn't count”。
  - inbox 的分组名和“逐个评审”的说法不再暗示“全部就绪”，或者把不作数的目标单独标出。
  - 验收方法：对 G-0001 的这五个界面各写一条 e2e 断言。

### [P1-02] 绿色用在验证器结果以外：CI 通过数和生命周期步骤（AC8 不满足，触发硬性门槛“绿色聚合或步骤勾”）
- **位置：**
  - `src/components/Pr.tsx:25` 用 `<ResultMark kind="pass" /> {passed}` 画 PR 行。同一文件的注释写着 “the rest is grey”。
  - 出现在 inbox 的 CI 卡头、目标页身份行（en/zh 都有）。
  - welcome 的生命周期条，“Ready to accept” 和 “Accepted” 两步是绿 ✓。
- **证据：**
  - `flows/crop-inbox-ci.png`：“PR open ✓3 ■1”，✓ 是验证器绿。
  - `shots/goal-G-0001-en-light.png`，约 y=222 处。
  - `flows/log-scan-en.txt` 的 GREEN 段：`span.result result-pass :: PR open 3 1`。
  - `shots/welcome-red-en-light.png`。
  - 基线 `/tmp/tower-design/baseline/shots/goal-G-0001-en-light.png` 也有同样的问题，前两轮评审都漏掉了。
- **影响：**
  - 3 是 GitHub CI 的计数，不是 Tower 的验证结果。
  - 它出现在一个“通过但不作数”的目标旁，让用户在最需要怀疑的地方看到绿色。
  - 面积很小，但它破坏的是产品自称别人无法复制的那条颜色规则。按合同，这一条单独就判失败。
- **修正目标：**
  - CI 通过数用中性色（text-2）。
  - welcome 图例里，非验证器的步骤不用绿色。
  - 验收方法：在所有路由上做颜色扫描，绿色只出现在验证器结果、已验证目标字形和 seal 上，且 seal 不出现在不作数的目标上。

### [P2-01] 验收标准标题回到 600px 以下（AC1 不满足）
- **位置：** `goal/G-0001`。
- **证据：** `flows/log-goal.txt`，验收标准标题的 top 值：
  - 1440 en：611，超出合同上限
  - 1440 zh：593
  - 1100 en：621
  - 1100 zh：575
- **原因：**
  - 高危哨兵说明不再截断（这是 P1-02 的正确修复），多出约 50px。
  - 页面上还内嵌了一张约 190px 高的 CI 决策卡，夹在哨兵和标准之间（`shots/goal-G-0001-en-light.png`）。
- **影响：** 1440×900 下 C5（不作数的那一条）落在首屏以外；需要先滚动才能看到唯一不作数的标准。
- **修正目标：** 四个变体下验收标准标题的 top 都 ≤600px，且哨兵说明仍然完整。

### [P2-02] peek 里对没有改动的目标仍显示 “Review R”，点了无效并抛异常
- **位置：** `PeekDrawer.tsx:37`，`canReview = () => !!g()?.diffstat`。`{files:0}` 是一个对象，所以判断为真。
- **复现：** 在看板上选中 G-0002，按 Space，再点 Review（或按 R）。
- **证据：**
  - `shots/final-peek-drawer-dark.png`：底栏有 “Review R”。
  - `flows/log-peek-err.txt`：`diffstat={"files":0…}`；点击后 peek 关闭，评审页和目标页都没打开；页面抛出 `Attempting to access a stale value from <Show>`。
- **影响：** D31 只修了看板和目标页的 R。用户在 peek 里按 R 什么都没发生，按键提示变得不可信。
- **修正目标：** 没有改动的文件时，peek 不显示 Review，或改为“打开目标页”；不再有 pageerror。

### [P2-03] “Accept” 冲突修掉后，换来一对近义词：mark viewed / mark read（zh：标为已看 / 标为已读）
- **位置：**
  - review 底部的按键栏、快捷键表、块头。
  - accept 弹层里的 “1 review unit not marked viewed”。
- **证据：**
  - `shots/review-G-0001-zh-dark.png`：底栏是 “V 标为已看 A 标为已读”。
  - `flows/r1-keys-sheet.png`。
- **影响：** 评审者要记住“已看”是文件级、“已读”是块级。在中文里这两个词几乎同义，accept 弹层的“没有标为已看”很容易被误解。
- **修正目标：** 两个动作用不同的名词或动词；或者合并成一个。快捷键表、块头、accept 弹层三处一致。

### [P2-04] 标题可选时，自动标题在第 48 个字符处断在单词中间
- **位置：** `ContractEditor.tsx:119,196`，`intent.slice(0, 48)`。
- **证据：** `flows/log-contract.txt`。目的写的是 “Checkout shows the discounted total on every page”，`create_goal` 收到的 title 是 “…on every pag”。
- **影响：**
  - 这次把焦点放在 Purpose，并标出 “Title (optional)”。于是不填标题成了默认路径。
  - 截断后的名字会出现在看板、sidebar、面板和分支名里。
  - 这段逻辑基线就有，是这次的流程改动把它变成了常态。
- **修正目标：** 按词或句边界截断并加省略号，或者在 Title 框里预填可编辑的生成标题。

### [P2-05] Learning 的来源标签被截成无意义的片段
- **位置：** `learning` 的 `.prov-badge`，固定宽 102px。
- **证据：**
  - `flows/crop-learning-prov.png`：显示 “Agent says · Run”、“Agent says · Age”。
  - `flows/log-console.txt`：cw=102，sw=132/144，en 1440 和 zh 1100 都是这样。
- **影响：**
  - 来源栏是产品的签名元素。审批记忆时，用户看不到这条记忆来自 “Run trace” 还是 “Agent claim”。
  - 这里还残留一个 “·”。D38 声称已清理，但 e2e 是在没有数据的 Learning 页上检查的，等于没测。
- **修正目标：** 来源完整显示，或换行显示。e2e 的中点检查要在有数据的 Learning 和 Operations 上运行。

### P3（合并列出）
- **P3-01 ⇧R 和队列入口不一致。**
  - 面板在看板上给 “Review every ready goal in turn ⇧R”，但 ⇧R 只在 Inbox 里绑定。在看板上按 ⇧R 没有反应（`flows/log-queue.txt`、`q-shiftR.png`）。
  - 同一个队列，从 sidebar 进入从 G-0001 开始，从面板进入从 G-0003 开始。
  - 修正：快捷键在宣传它的地方都有效，各入口的顺序一致。
- **P3-02 C2 展开后同一事实出现两次（AC3）。** 标签 “assertions not checked” 下面又有一句 “assertions not checked, so a pass proves less here”（`flows/goal-C2-open.png`）。
- **P3-03 看板决策行的提问文字起点不齐。** 1440 宽下分别在 x≈836、933、984、836，裁决词占了宽度不定的槽位（`shots/overview-en-light.png`）。提示栏的大小写也不统一：“move / peek” 对 “Open / Review”。
- **P3-04 文案和本地化。**
  - zh 界面下，评审 notes 和单元行的风险理由仍是英文 “test harness: runner config…”（`shots/review-G-0003-all-accepted-zh-dark.png`）。
  - accept 摘要中英文意思不同。en 写 “…in 1 a test that must fail passed, so it doesn't”，句子像被截断；zh 写“1 条的金丝雀被篡改”（`shots/review-G-0001-accept-*.png`）。
- **P3-05 同一目标的信任档位两处不一致。** G-0002 在 peek 写 “Restricted S2”，在目标页右栏写 “Full S2”。两处取值来源不同：`labels.ts:116` 和 `state.engines`。注意：引擎列表来自 e2e mock。证据是 `shots/final-peek-drawer-dark.png` 对照 `shots/goal-G-0002-en-light.png`。
- **P3-06 低危折叠的“最敏感路径”选了 `~/.ssh/config`。** agent 试图读取 held-out 测试（`test/holdout/rounding.test.js`）这件事，与保留测试的证据效力直接相关，在折叠态却看不到（`flows/goal-low-fold.png`，基线是展开显示的）。
- **P3-07 小字。** 以下几处是 11px：“Agent says” 和 “Measured by Tower” 来源标签、“abandoning asks twice”、“Queue for next turn”、快速开始的提示、表头（`flows/log-scan-en.txt` 的 TINY 段）。
- **P3-08 重复和留白。**
  - G-0005 的沙箱拒绝输出在决策卡和 C1 行各印了一遍（`shots/goal-G-0005-cannot-run-en-light.png`）。
  - 1800 宽时，看板行的标题和 ID 相距约 1300px（D23 仍为 Open，`shots/overview-en-light-1800.png`）。
  - look 对比弹层里写着“是否算通过，由你勾选”，弹层里却没有勾选控件。

## 3. 上一轮（`aa1026b`）问题复核

| 编号 | 判定 | 证据 |
|---|---|---|
| P1-01 看板 Space | **已修复** | `flows/log-board.txt`：4 条决策行都是 peek=1、cards=0，行顶 149/189/229/269/371 不变，Esc 后焦点回到原行 `g-title`。zh/1100 下同样成立（`log-board-zh.txt`）。 |
| P1-02 高危哨兵说明被截断 | **已修复** | `flows/log-goal.txt`：4 个变体都是 `clipped:false`、`clamp:none`、`title:null`。评审 notes 给出完整首句（`flows/r1-notes-open.png`）。副作用是新的 P2-01。 |
| P2-01 限定标签色调 | **部分修复** | 色调已统一：C1 和 C2 都是 `ev-pill-attn` 琥珀（`log-goal-int.txt`）。但 C2 展开后同一事实重复（P3-02）。 |
| P2-02 低危折叠路径配错 | **已修复** | 折叠行读作 “~/.ssh/config The agent repeatedly tried to read outside its workspace”（`log-goal-int.txt`）。 |
| P2-03 决策行没有证据、字形不一致 | **基本修复** | 字形 ‖✓◆‖ 与侧栏一致；G-0001 写 “Passed, doesn't count”（`shots/overview-en-light.png`）。剩下的是对齐问题（P3-03）。 |
| P2-04 块级 “Accept” | **部分修复** | 已改成 “Mark read”，但和 “mark viewed” 形成近义词冲突（P2-03）。 |
| P3-01 评审首帧没有代码 | **已修复** | `log-review.txt`：首帧的代码单元格都是 visible，并有文字。 |
| P3-02 R 进入空评审 | **部分修复** | 看板上 R 对 G-0004、G-0005、G-0002 都改为打开目标页（`log-board-R.txt`）。peek 里没修（P2-02）。空状态仍贴着标题列，属于有意为之。 |
| P3-03 accept 弹层分组 | **已修复** | 阻塞项（git、C3、C4）排在印章之前；只有一个 “Sentinels” 小标题（`shots/review-G-0001-accept-en-light.png`）。 |
| P3-04 合同编辑 | **已修复** | 页面上可见 “Title (optional)”、MicroVM 不可用的原因、页头 “New contract  shop”（`shots/contract-en-light.png`）。由此引出新的 P2-04。 |
| P3-05 快捷键表缺 Space | **已修复** | `shots/shortcuts-en-light.png` 有 “Quick-peek the selected goal ␣”。 |
| P3-06 G-0002 的双分隔线 | **已修复** | `flows/crop-goal-G-0002-1100-en.png` 只剩一条线。 |
| P3-07 哨兵区重复标签 | **已修复** | “Needs your confirmation” 只在区块头出现一次（`shots/goal-G-0001-en-light.png`）。 |
| P3-08 R 动作的位置和名称 | **已修复** | 只保留一个 “Review 1 file R”，1100 宽时随计数条一起换行（`flows/crop-goal-1100-en-top.png`）。Changes 区仍有一个幽灵按钮 “Open changes”，可以接受。 |

## 4. AC1–AC10 与硬性门槛

| 条目 | 判定 | 证据 |
|---|---|---|
| AC1 | **不满足** | 标题与裁决行间距 4px（标题底 100、裁决顶 104），满足；验收标准之上没有 agent 写的区块，满足。验收标准标题在 1440 en 是 611px，超过 600（`log-goal.txt`）。 |
| AC2 | 满足 | 高危哨兵在验收标准之前，说明完整，第二条带代码行；低危折叠点出了 `~/.ssh/config`。 |
| AC3 | 部分满足 | 折叠态每行高 50px，满足；通过的标准没有危险色，满足；子行同一缩进，满足。C2 展开后有重复事实，不满足。 |
| AC4 | 满足 | 目标页所有 agent 文本都标 “Agent says”/“Agent 称”；台账里的 Unsupported 用 ◇。 |
| AC5 | 满足 | j×5 后首个目标行顶不变（371）；Enter 和点击才打开决策；Space 打开 peek，R 作用于选中行（`log-board*.txt`）。 |
| AC6 | 满足 | 底栏写出 “Set git's name and email first; Tick C3, C4 first”，点击后焦点到 “Your name”；阻塞项在最前。解锁之后的状态因 mock 无法验证。 |
| AC7 | **不满足** | 见 P1-01：inbox、peek、队列。 |
| AC8 | **不满足** | 见 P1-02：PR 的 ✓3、welcome 步骤勾；inbox 和 peek 在不作数的目标上画绿印章。 |
| AC9 | 部分满足 | 句子级小字只有 “abandoning asks twice”（11px），另有几处 11px 标签；检测器未安装，无法核对。 |
| AC10 | 满足（余量极薄） | tsc 0 错；vitest 41 个文件、218 个测试通过；e2e 231 个通过、76 个跳过；截图 69/69；line-limit 通过；bundle 163,588/163,840 B，余 252 B；goal chunk 12,194/12,288 B，余 94 B。 |
| AC11 | **不满足** | 即本评审：7.2/10，并有 2 条 P1。 |

| 硬性门槛 | 判定 |
|---|---|
| 绿色聚合或步骤勾 | **触发失败**（P1-02） |
| 把说法画成事实 | 未发现 |
| 丢失用户已有改动 | 未检查（mock 环境） |
| 削弱测试 | 抽查删掉的断言，都是随文案迁移的，没发现削弱。中点守卫在空数据页上运行，不足以说明问题，但不算削弱。 |
| 抬高预算 | 未发现：`git diff bf22cad 3faaf0c -- tools/` 为空 |

## 5. 比基线明显好的地方，以及主要风险

**确实更好（有证据）：**
- 目标页改为证据优先。基线的验收标准在 989px，现在约 593–621px；裁决和双轨计数就在标题下；哨兵排在最前，说明完整（`baseline/shots/goal-G-0001-en-light.png` 对照 `shots/goal-G-0001-en-light.png`）。
- 看板选中不跳动，Space 打开 peek 并能回焦。
- accept 弹层有可见原因，点击原因直接聚焦；G-0001 的 Accept 不再是主按钮。
- 评审首帧就有代码。
- 面板和 peek 改成不透明。
- 合同编辑页的顺序和页头。

**主要风险：**
- 裁决没有单一来源。每个界面自己拼印章和计数，所以修了面板，inbox 和 peek 仍然漏掉（P1-01）。
- 预算几乎为零：总量只剩 252 B，goal chunk 只剩 94 B。修 P1-01 必须先腾出空间。
- e2e 依赖 mock，状态转换验证不到，例如设置 git 身份或勾选后 accept 能否解锁。中点之类的守卫在空数据页上运行，会给出假的放心。
- C1、C2 带着 “runner patched” 和 “assertions not checked”，仍然计为 Verified 并显示绿勾。这是 supervisor 的计数规则，界面如实呈现了。但它和“绿只属于未被篡改的通过”之间的张力，应当由产品层面明确拍板。

**通过验收必须完成：**
- P1-01、P1-02。
- 建议同一轮修掉 P2-01、P2-02。
- 修完后重新评审，加权分达到 8.0 以上。