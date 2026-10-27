# Tower 设计审计 r9（信息设计、视觉、交互与动效、独特性）

> 审计人：Opus 5.5，以外部挑剔设计师的视角，透镜是 `frontend-design` 的判准：类型是否刻意、结构装置是否承载信息、动效是否回应动作、文案是否一事一职、是否带"模板 / AI 生成"的痕迹。分数与 r8（`docs/reviews/design-audit-r8.md`：D6 93 / D7 93 / D8 93 / D9 91）同一刻度。95+ 指能与 Linear、Things 3、Raycast、Arc、Craft 和 Apple 自家应用并列。
>
> 日期：2026-10-27。对照 `main @ 3c3860e`。r8 之后与 UI 相关的提交有：
> - 当前 hunk 改为状态（273732b）；红项时 `Accept anyway` 两次按压（44c5a89）。
> - look 的 steps 进编辑器与目标页（866a629）；mono 关连字（66ce24c）。
> - tampered 不画绿 ✓（b731262、5fc1f01）；卡片反引号与被拒路径（d63b4b0）。
> - 中文字标 0.08em 与孤字（426354c）；手机单 primary 与尾巴悬挂（bf82a00）。
> - `Check again` 与 git 范围（d1ff07b）；注记左对齐（d3e7a46）；评审 notes 带与空评审状态栏（9d9fc81）。
>
> **取证**
> - 渲染：Playwright WebKit 渲染真实 Vite 页面（`E2E_PORT=1465`，TMPDIR `/tmp/audit-r9`），Tauri IPC 走 `apps/desktop/e2e/tauri.ts` 的 shim。
> - 种子：本轮重新 seed 的监督器视图，英文 `/tmp/audit-r9/en/fx`，中文 `/tmp/audit-r9/zh-CN/fx`（`TOWER_LANG=zh-CN`）。
> - 夹具：`e2e/rich.ts` 的 `enrichRich`，另加审计自己的状态：
>   - G-0001 上真正的 tampered C5，同时设 `progress.not_evidence`；
>   - criteria-cannot-run（`enrichSandboxRefused`）；
>   - 空概览、欢迎页、启动失败（拦截 `goals` 抛错）、空评审、look steps。
> - 产出：约 86 张桌面图、8 张手机图（390 / 430 宽）、9 张探针图。
> - 度量：每屏 DOM 度量（填充 primary 数、<20pt 目标、省略号截断、字体、控制台错误），探针（对比度、Tab 顺序、焦点样式、折叠逐帧、减动画、高亮到达时间、树与 diff 顺序）。
> - axe（WCAG 2A/2AA）跑了 7 屏，**全部零违规**；控制台 0 错误。截图未入库，见 §8。
>
> **限制**
> - 渲染的是 Vite dev 页面，不是生产包；原生菜单与窗口阴影看不到。
> - 动效靠逐帧采样判断，手感未验证。
> - 竞品检索由子代理完成，只列它实际抓到页面的条目，未证实的已注明。

---

## 0. 总评

**r8 的两个 H 都修好了，修法也是对的。**
1. **评审键盘闭环成立。** 在不滚动的小 diff 上，`]` 把当前块移到 `src/cart/money.js`，hunk 头左缘那支 2px 笔跟着移过去；`A` 接受这一块并前进；第二次 `A` 不会撤销。`⇧A` 撤销时有回执 `Unaccepted · src/cart.js · Accept again` [31a–31d]。
2. **红项不再零摩擦。** 验收 sheet 按严重度分成 `Not evidence · needs your judgement` 和 `To look at` 两组；primary 改成 `Accept anyway`，两次按压，2 秒后失效，与 Abandon 同一规则 [33a][33b]。
3. **其余也已落地：**
   - tampered 时标题、侧栏、标准行首都是琥珀 ◆，没有绿 ✓ [21][S-goal1]；
   - mono 文本逐字可读，`=>`、`===` 不再变形 [21]；
   - look 的 steps 在编辑器里是编号行，目标页写 `4 steps` 并可展开 [44][23c]；
   - cannot-run 卡渲染了 `npm test`，被拒路径单独一行，并带 `Settings for shop ›` [19]。

**这一轮从外部看到的，是另一个层面的问题。** 局部诚实已经做到，整体构图和"脸"还没到：
1. **概览不像概览（D6）。** 1440×900 的首屏是三张完整的决策卡。它们与"需要你"页逐字相同，侧栏也同时列着这三项；真正的航班牌 `Running 1` 从 y=880 才开始 [01][05]。同一屏同一件事有三种表示，而一屏看不到全局。
2. **栅格还有几条没对上（D7）。**
   - 分区细线伸到 1408（1800 宽时伸到 1656），卡片止于 1104 / 1216。这是 r8 #12，未修。
   - 目标页的决策卡比主栏窄 68px [P-goal3-1800]。
   - 印章 `Verified @933fb27` 右对齐到一个看不见的边：x≈1305（1440 宽）或 1546（1800 宽），既不对右栏左缘，也不对页面右缘 [21][25][P-goal3-1800]。
3. **行长失控（D7）。** 决策卡正文、cannot-run 正文、no-held-out 注记在 1440 宽下每行约 115–125 个字符，远超 80ch 的阅读上限 [01][19]。与此同时，空态正文却被压到约 30ch：`The snapshot is the same as / base @5697a06.` [24]。同一个应用里有两种都不对的行宽。
4. **模板痕迹（D9）。** 外部评审一眼会认出 2025–26 年"生成式 UI"的那套通用装饰：
   - 到处是字距拉开的全大写标签：`FOR YOU ONLY`、`CONTRACT · SHOP · NEW`、`01 INTENT`、`KEYBOARD SHORTCUTS`、`DRAFT RUNNING …`、手机 `NEEDS YOU`；
   - 中点连接的元信息串：`G-0001 · shop · Contract v1 · Run 1`、`Ledger · claims and facts`、`Sentinel · …` 重复四次；
   - 每个链接尾巴上的 `›`；
   - 每个空态底下都有一条口号带 `Facts stay apart from claims · Interrupts you only when it must · Your repository is untouched`，连空评审页上也有 [37]；
   - 字体是 Inter，也就是这个年代的默认字体。

   Tower 真正属于自己的资产是诚实语法：◆ / ■ / ◇ / 绿环 ✓、`━━━` 刻度条、`@pin` 印章、生命周期字形。这些已经够独特；周围的通用装饰在稀释它们。

**定位：** 评审语义、诚实语法、合同文书、错误页在主流 harness 里仍领先一代（§5）。本轮修完了所有 H，D6 / D8 各 +1。D7 停在 93：r8 的两个具体缺陷修了，但栅格与行宽问题被看得更清楚，两者相抵。D9 停在 91：本轮没有新增"脸"，设置页和手机页仍是 r8 的样子。**修完 §4 前 8 项，D6 / D8 可到 95、D7 到 94–95；D9 要过 93，需要 §4 #15–18 那种"减法"。**

---

## 1. 评分

### 1.1 产品评分表 D6–D9

| 维度 | r8 | r9 | Δ | 判词 |
|---|---|---|---|---|
| D6 页面 / 信息设计 | 93 | **94** | +1 | **做对了：**<br>- tampered 在标题、侧栏、行首、印章、刻度条、`Next`、验收 sheet 七处同口径 [21][33a]。<br>- steps 可见 [23c][44]。<br>- 红项分组且有摩擦 [33a]。<br>- cannot-run 有就地出口，页头不再同时出现 `Resume` 和 `Retry` 两个动词 [19]。<br>- 评审页顶部三条提示并成一行 `5 notes before you read · ■ Sentinel · …`，展开后红项在前 [32a][32b]。<br><br>**扣分：**<br>- 概览首屏是"需要你"的副本，航班牌在折线下（§2.1）。<br>- 验证读数仍是 look 第一、tampered 最后，在首屏之外 [36b]（r8 #13 未修）。<br>- cannot-run 卡把"不是测试失败"说了两遍：⚠ 提示条一遍，正文一遍 [19]。<br>- 空评审页仍提供 `Request changes`，还挂着口号带 [37]。<br>- 手机离线时丢掉语言：中文用户看到 `Can't reach Tower`，也没说该去哪里看 [p06]。 |
| D7 UI 视觉设计 | 93 | **93** | 0 | **做对了：**<br>- mono 关 `calt` / `liga`，加 `zero` 和 `tnum`（探针：`.code-val`、`.sentinel-machine`、`code`、`kbd` 都是 `"calt" 0, "liga" 0`）。<br>- 中文字标 0.08em，`shop` 不再被拉开。<br>- 注记左缘对齐标题列 [S-goal1]。<br>- 手机一屏一个填充 primary（度量：每屏 1 个）。<br>- axe 7 屏零违规，armed 按钮对比度浅色 7.9:1、深色 12.3:1。<br><br>**扣分：**<br>- 两条右边界与漂浮的印章（§2.2）。<br>- 行宽（§2.3）。<br>- 深色下占位符与真实值太像：示例写得像真的，对比度 7.7:1，对比值 16.2:1 [43][45]（§2.6）。<br>- 手机卡上的次按钮宽度参差：满宽黑块下面跟着两个按内容宽度、左对齐的外框按钮 [p01]。<br>- 命令面板输入框在面板边框里又套一层边框 [53b]。 |
| D8 交互与动效 | 93 | **94** | +1 | **做对了：**<br>- 当前块是状态，有标记，`A` 只接受，`⇧A` 有回执、可撤回 [31a–31d]。<br>- `Accept anyway` 两次按压 [33b]。<br>- 折叠逐帧：表高 179→177→172→161→139→100→56，约 120–140ms，前慢后快 [P-motion]。<br>- 减动画下 `getAnimations()` 为空。<br>- steps 编辑器里 Enter 开下一行、空行上 ⌫ 收起。<br><br>**扣分：**<br>- 非法 step 只有红框，不说为什么非法，提示行也已经消失 [P-step-invalid]。<br>- 全部接受后，"当前块"和"已接受块"的左缘笔画一样黑，分不出 [31c]。<br>- 树的顺序（`cart/money.js` 在前）与 diff 的顺序（`cart.js` 在前）相反，`]` 走的顺序和左栏看到的顺序不一致 [28]。<br>- 仍未修（r8 #18）：Tab 只在输入框之间循环、`?` 表没写；队列卡焦点仍是 1px 边框加 1px 外环两条线。<br>- 首屏高亮：dev 下 1.0–2.5s 后才上色 [P-hl]，需要在生产包上复测。<br>- `Hover a run to roll back to its start` 是只能靠悬停发现的能力 [S-goal1]。 |
| D9 美学独特性 | 91 | **91** | 0 | **做对了：**<br>- steps 的编号行和条款编号是同一支笔。<br>- `Accept anyway` 与 Abandon 同规则。<br>- 回执 toast 带左缘竖线，与 hunk 笔同源。<br><br>**差在：**<br>- 全大写字标、中点元信息、尾巴 `›`、Inter、空态口号带，这些都是通用装饰（§2.5）。<br>- 设置页仍是通用偏好设置（r8 #15 未动）。<br>- 手机页仍是 r8 的样子（r8 #16 未动）。<br>- 品牌标记 `◎ TOWER` 的圆环用的就是"已验证"状态字形，品牌和状态共用一个符号。 |
| **综合** | 92.5 | **93.0** | +0.5 | |

### 1.2 12 项美学子分

| # | 子项 | r5 | r6 | r7 | r8 | r9 | Δ | 判词 |
|---|---|---|---|---|---|---|---|---|
| 1 | 美学与原创性 | 86 | 88 | 89 | 90 | **90** | 0 | 诚实语法是原创的；周围的全大写 / 中点 / `›` 是模板。 |
| 2 | 排版（拉丁 + CJK） | 87 | 88 | 89 | 89 | **90** | +1 | 加：连字关闭、中文字标克制、孤字清掉。扣：卡片正文约 120 字符一行；空态约 30ch；标题没用 Inter 的 `opsz` 显示轴，20px 标题和正文是同一副字形。 |
| 3 | 颜色与对比 | 89 | 89 | 90 | 91 | **92** | +1 | tampered 不再出现绿色；axe 零违规；armed 对比度足够。扣：深色占位符过亮。 |
| 4 | 布局与层级 | 87 | 89 | 91 | 92 | **92** | 0 | 加：评审 notes 一行。扣：概览首屏没有航班牌；两条右边界；印章离栅。 |
| 5 | 密度与节奏 | 88 | 89 | 90 | 90 | **91** | +1 | 评审首屏的 diff 从 y≈113 开始（r8 时被三条横幅压到约 200）。扣：1440 宽右侧约 300px 空白，而卡片正文仍然过长。 |
| 6 | 组件工艺 | 87 | 88 | 90 | 91 | **92** | +1 | 加：steps 编辑器、armed 按钮、git 范围选择完整显示。扣：非法 step 无理由；手机次按钮参差；面板输入框双边框；空活动 sheet 的 `Copy all / Clear` 仍可点。 |
| 7 | 动效与反馈 | 85 | 88 | 91 | 91 | **92** | +1 | 回执 toast、当前块标记、armed 计时。扣：高亮"啪"地一下出现，没有过渡。 |
| 8 | macOS 原生感 | 88 | 89 | 90 | 91 | **91** | 0 | Tab 说明、焦点双线未修；Inter 而非系统字体，这是一个选择，但两条路都没走到头。 |
| 9 | 图标与字形 | 92 | 92 | 92 | 92 | **93** | +1 | ◆ 在标题、侧栏、行首、面板、手机上一致。 |
| 10 | 空 / 加载 / 错误状态 | 88 | 90 | 92 | 92 | **92** | 0 | 启动失败页仍是全场最好的一屏 [10]。扣：口号带、空评审的 `Request changes`、手机离线丢语言。 |
| 11 | 浅色主题 | 88 | 89 | 90 | 91 | **91** | 0 | 无新问题。 |
| 12 | 品牌性格 / 记忆点 | 82 | 86 | 89 | 90 | **90** | 0 | `Accept anyway` 好；armed 文案 `3 items need your judgement · press again · 2` 丢了动词。 |
| | **综合** | 87 | 89 | 90 | 91 | **91.3** | +0.3 | |

### 1.3 r8 修复清单落地核对

| r8 # | 项目 | 状态 | 证据 / 残留 |
|---|---|---|---|
| 1 | 当前 hunk 为状态，`A` 只接受，`⇧A` 回执 | **已修** | [31a–31d]。残留：已接受块与当前块分不出 [31c]；树与 diff 顺序相反 [28] |
| 2 | 红项时 `Accept anyway` 两次按压，分组 | **已修** | [33a][33b]。残留：armed 文案丢了动词，结尾的倒计时数字 `· 2` 意义不明 |
| 3 | look steps 可见可改 | **已修** | [44][23c]。残留：非法 step 不说原因 |
| 4 | mono 关连字 | **已修** | 探针 TYPE |
| 5 | tampered 不画绿 ✓ | **已修** | [21][S-goal1]、侧栏、面板 [53b] |
| 6 | 卡片行内 code、被拒路径、单一动词 | **已修** | [19]。残留：⚠ 提示条与正文重复，提示条宽约 430px，后半句折行 |
| 7 | 中文字标 0.08em、孤字 | **已修** | [43][55]。残留：空态行宽仍太窄（约 30ch） |
| 8 | 手机单 primary、尾巴悬挂 | **已修** | [p01][p02]，度量每屏 1 个。残留：次按钮宽度参差 |
| 9 | Environment `Check again`、git 范围完整 | **已修** | [46] |
| 10 | 注记左对齐标题列 | **已修** | [S-goal1] |
| 11 | 评审 notes 一条带；空评审状态栏只留 Esc / ? | **已修** | [32a][32b][37] |
| 12 | 概览分区线止于卡片列 | **未修** | [01] 1408 对 1104；[05] 1656 对 1216 |
| 13 | 读数里 tampered / 失败先于通过 | **未修** | [36b] 顺序是 C4、C1、C2 …，tampered 在首屏之外 |
| 14 | 夹具 | **部分** | `enrichSandboxRefused` 已换成 `criteria_cannot_run` 加三个选项。仍未修：`enrichRich` 里 tampered 仍因 `!by("C4")` 被跳过；`held_out` 与 `has_held_out_tests` 仍矛盾（同屏既有 `held-out tests · for you only` 又有 `No held-out tests`）[S-goal1]；哨兵 / C4 / cannot-run 仍无中文 [22][20] |
| 15 | 设置页用条款的声音，布尔控件统一 | **未修** | [46][S-settings]：复选框，而合同里是开关 |
| 16 | 手机 Inter 子集 | **未修** | 度量 `-apple-system` / `ui-monospace`。本轮认为应降级，见 §2.7 |
| 17 | look steps 的条款画面 | **部分** | 编号行已有；还没有和 Before / After 组成一张"先做什么、再看什么"的画面 |
| 18 | `?` 表写 Tab 说明；队列焦点单线 | **未修** | 探针 QUEUE FOCUS：`border 1px` 加 `outline 1px offset 2px`；TAB 探针仍是 textarea → textarea → body 循环 |

合计：11 项已修，2 项部分，5 项未修。

---

## 2. 全局问题与修法

### 2.1 概览不是概览（M，D6）

**现状**
- 1440×900 的概览从上到下依次是：快速开始框、`Needs you 3`、三张完整决策卡（共约 710px）、y=880 处的 `Running 1` [01]。
- 这三张卡与"需要你"页逐字相同 [12]；侧栏 `Needs you 3` 下也列着同样三项。一屏里同一件事有三种表示（导航计数、侧栏列表、整卡），而航班牌这张 Tower 最像"塔台"的图，必须滚动才看得到。
- 1800 宽时，下面的运行表是 1280 宽，而决策卡是 840 宽，同一页有两种列宽 [05]。

**修法（M）**
- 概览上的决策压成**一行一项的"待你处理"条**：字形、类别、目标、一句标题、主动作的键位，例如 `◆ Paused · G-0004 Held-out tests failed · ⌘2`。
- 只有键盘焦点所在的那一项展开成整卡（与队列"一屏一个黑"同一规则）；整卡留给"需要你"页。
- 首屏必须能看到航班牌的前几行。
- 文件：`views/Overview.tsx`（`.board-group`、`.board-queue`）、`components/DecisionCard.tsx` 增加 `compact` 变体。
- 预期：D6 +0.5～1。

### 2.2 栅格：两条右边界、漂浮的印章（M，D7）

**现状**
- 概览分区细线 `.scale-title` 伸满整个容器，卡片列 `.board-queue` 只有 840 [01][05]（r8 #12）。
- 目标页决策卡 840 宽，而主栏是 908 [P-goal3-1800]。
- 印章 `<Seal large>` 在 meta 行末尾，前面一个 `.grow`（`GoalPage.tsx:207-209`）。它右对齐的是 header 左块的最大宽度，于是在 1440 宽时停在 x≈1305，在 1800 宽时停在 1546。它与右栏左缘（1089 / 1337）、页面右缘、`Trace W` 都不对齐 [21][25]。

**修法（S）**
- 分区线止于卡片列宽；或者卡片与运行表同宽。二选一，全应用统一。
- 印章搬进 `.goal-actions` 那一列，与 `Trace` 右对齐；或者左对齐到右栏 `Contract v1 summary` 的左缘。它是目标页最重要的一枚字，应该落在栅格线上。
- 目标页决策卡宽度等于主栏宽度。

### 2.3 行宽（M，D7）

| 位置 | 现状 | 应为 |
|---|---|---|
| 决策卡正文（保留测试、cannot-run、CI） | 1440 宽下约 115–125 字符一行 [01][19] | `max-width: 72ch`，卡片本身可以更宽 |
| no-held-out 注记 | 约 130 字符一行，链接被推到最右 [S-goal1] | 同上；`Set held-out tests ›` 紧跟句尾 |
| cannot-run ⚠ 提示条 | 约 430px 宽，`… the / refused path is below.` 折行 [19] | 与正文同宽，或删掉（见 §2.4） |
| 空态正文 | 约 30ch：`The snapshot is the same as / base @5697a06.`、`The agent has not changed any tracked / files yet.` [24][37] | `.empty-body { max-width: 44ch }`（r8 #7 写了，实测仍窄，应是父容器限宽） |

### 2.4 文案：一事一职（M，D6）

| 位置 | 现状 | 应为 |
|---|---|---|
| cannot-run 卡 [19] | ⚠ `An environment problem, not a test failure and not the agent's doing: the refused path is below.`，正文又说 `This is not a test failure: check the refused path below…` | 只留一处：保留 ⚠ 这一行，正文删掉 `This is not a test failure:` 半句 |
| armed 按钮 [33b] | `3 items need your judgement · press again · 2` | `Accept anyway — press again` 加一条 2 秒的退场细条；数量已经写在上面的列表里 |
| 评审 notes 与验收 sheet [32b][33a] | 每行都以 `Sentinel ·` / `Sentinel:` 开头 | 组标题写 `Sentinels`，行内只留句子 |
| 空态口号带 [06][37] | `Facts stay apart from claims · Interrupts you only when it must · Your repository is untouched` 出现在空概览和空评审上 | 只留在欢迎页；空评审页去掉口号，并隐藏 `Request changes` |
| 运行历史 [S-goal1] | `Hover a run to roll back to its start` | 行可聚焦，提示改成 `Select a run to roll back to its start`，焦点上出现按钮 |
| 手机离线 [p06] | 中文页显示 `Can't reach Tower · Retry`，没有原因 | 记住上次的语言（`localStorage`，否则用 `navigator.language`）；写 `连不上你 Mac 上的 Tower：Mac 是否醒着、Tailscale 是否在线？` 再给 `重试` |
| 设置 [46] | `pi executable` 小写开头，其余标签都是首字母大写 | `Pi executable` |

### 2.5 模板痕迹：把装饰交还给诚实语法（M，D9）

`frontend-design` 列出的通用装饰，Tower 现在几乎每一条都有：

| 痕迹 | 出处 | 建议 |
|---|---|---|
| 字距拉开的全大写标签 | `FOR YOU ONLY` [01]、`CONTRACT · SHOP · NEW`、`01 INTENT` [42]、`KEYBOARD SHORTCUTS / OVERVIEW / EVERYWHERE` [54]、生命周期 `DRAFT … ACCEPTED` [08]、手机 `NEEDS YOU` [p01]、骨架表头 `GOAL LIVE CRITERIA` [06] | **只在一处保留**：合同的抬头 `CONTRACT · SHOP · NEW`，它确实是文书的抬头。条款标题改成首字母大写、500 字重，编号保留，它们是真序列；sheet 标题、手机分区标题、骨架表头、保留测试栏标签都改成首字母大写 |
| 中点连接的元信息串 | `G-0001 · shop · Contract v1 · Run 1`、`Ledger · claims and facts`、`↑↓ move · ↩ open · esc close` | 元信息改用间距和字色分组（ID 用 mono t3，其余 t2），不用 `·`；`Ledger · claims and facts` 改成 `Claims and facts` |
| 尾巴上的 `›` | `Set held-out tests ›`、`Open changes ›`、`Settings for shop ›`、刻度条后的 `›` | 只在"去往另一页"且整行不可点时保留；可点的整行不加 |
| Inter | 全应用 | 不必换。20px 以上的标题、印章、合同抬头用 Inter 4 的光学尺寸轴（`font-variation-settings: "opsz" 32`），让大字有自己的紧度，而不是正文放大 |
| 品牌标记 | `◎ TOWER` 的圆环就是"已验证"字形 | 品牌要有自己的符号，例如塔台的一横一竖，与状态字形分开；否则空态里的 `◎ TOWER` 会被读成"已验证" |

这一节不是要推翻 r7–r8 认可的"字标声音"，而是**把它从十几处收回到一处**，让 ◆ / ■ / ◇ / `━━━` / `@pin` 成为页面上唯一的装饰。

### 2.6 占位符读成真实值（M，D7）

- 合同编辑器的占位符是逼真的示例：`Fix duplicate charge at checkout`、`An order is charged exactly once on every retry path`、`The database schema needs to change` [42][45]。
- 深色下占位符 `rgb(167,164,161)`，对比度 7.7:1；真实值 16.2:1。乍看像一份已经填好的合同。设置里的"你的记忆"也一样 [S-settings]。
- **修法（S）**：示例前缀 `e.g.` / `例如`，颜色降到 `--text-4`（约 4.5:1）。真实值和例子要一眼分得开，合同不能看起来像已经写好。

### 2.7 手机页（M，D9）

- 字体：r8 要求内嵌 Inter 子集。外部视角下，iOS 上的 SF 是原生的声音，不算缺陷。**本轮把它降为 L。** 手机页缺的不是字体，是那张脸：
  - 页头应是桌面标题栏那条仪表：`◔ 1/4 running · ▫ silent 3m · $0.09`，而不是 `updated 15:25 · every 5 s`。
  - 次按钮要么全宽，要么同行等宽。现在是黑色满宽块下面跟着两个参差的外框按钮 [p01]。
  - 离线页见 §2.4。
- 文件：`crates/tower-supervisor/src/remote.html` 的 `#status`、`.opts .btn`、离线分支。

### 2.8 评审的小处（L，D8）

- **树与 diff 顺序**：树是"目录在前"，`cart/money.js` 排在 `cart.js` 前面；diff 按路径排，`cart.js` 在前 [28]。修法：二者用同一个排序（`lib/filetree.ts` 与 `reviewState` 的单元文件顺序）。
- **已接受与当前**：当前块是 text-3 的 2px 笔，已接受是 text-1 的 2px 笔。全部接受后，当前块没有区别 [31c]。修法：当前块再加一道 `--bg-hover` 的头部底色，或者已接受改成 1px。
- **高亮到达**：dev 下 1.0–2.5s 后才上色，两种动效偏好下都一样 [P-hl]。修法：先在生产包上测；若仍 >150ms，首帧用 text-1 单色，到达后颜色在 120ms 内淡入，不要"啪"地出现。

---

## 3. 逐屏审计（摘要）

### 3.1 标题栏与侧栏 [01][03][04]
- 仪表条 `◔ 1/4 running · ▫ silent for 3m · $0.09 · 🔔 · ● Engine Pi demo-engine` 仍是全应用最好的一条线。1040 宽时引擎段隐藏，无溢出。
- 侧栏 `Needs you` 出现两次（导航项与分区），r8 已认可，但加上概览的整卡就是三次（§2.1）。

### 3.2 概览 / 需要你 [01]–[05][12]–[15]
- "需要你"页成立：分区线止于卡片列 [12]，焦点卡琥珀头加唯一的黑 [14]。
- 焦点卡仍是双线 [14]（r8 #18）。
- 概览见 §2.1、§2.2。

### 3.3 保留测试卡 / cannot-run 卡 [16][17][18]–[20]
- 保留测试卡结构好：`FOR YOU ONLY` 栏 → 测试名 chip → 输出 → 提示框加 primary → ◇ 注 → 三个次选项。
- cannot-run 见 §2.3、§2.4。
- 中文目标页上 cannot-run 正文仍是英文，这是夹具问题 [20]。

### 3.4 目标页 [21]–[27][S-goal1]
- 哨兵按严重度、mono 证据逐字可读。
- 刻度 `━━━ Verified 2/3 · 1 doesn't count · Observed 0/3 · Human 0/2`。
- C5 行 `◆ a test that must fail passed` 用琥珀底标出。
- steps `4 steps ⌄` 展开为编号行 [23c]。
- 问题：
  - 印章离栅（§2.2）；
  - 夹具同屏矛盾的保留测试说法（§1.3 #14）；
  - 哨兵 mono 证据折行没有悬挂缩进，`strictEqual(a,` 后的 `b));` 顶格 [21]；
  - C1 `couldn't check on @5697a06` 没写原因（原因在 `base_error` 里，只能悬停看到）。

### 3.5 评审 [28]–[38][36b]
- 键盘闭环、回执、notes 带都成立。
- 验收 sheet 分组、armed 都成立；干净的验收 sheet 一键 `Accept and write branch` 合理 [35]。
- `Request changes` sheet 在没有批注时禁用 `Send back to the agent`，并说明 `No inline comments yet. Click a line number…` [38b]。好。
- 问题：§2.8、读数顺序（r8 #13）、空评审页（§2.4）。

### 3.6 合同编辑器 [42]–[45]
- 条款画面成立，steps 编号行与条款编号同一支笔。
- 问题：占位符（§2.6）；全大写条款标题（§2.5）；非法 step 不说原因 [P-step-invalid]。
- 1100 宽时右栏 04–07 移到下方，左栏 Ratify 页脚仍然粘底 [45]。

### 3.7 设置 [46][S-settings]
- Environment 块好，`Check again` 有了。
- 其余三屏是右对齐标签加输入框的通用偏好设置，没有页内导航：7 个分区、约 2800px 高，只能滚动。布尔用复选框，与合同的开关不一致（r8 #15）。

### 3.8 面板、sheet [53]–[56]
- 命令面板分组 `Commands / Goals`，匹配加粗，tampered 的 G-0001 是琥珀 ◆ [53b]。
- 快捷键 sheet 两栏，评审上下文里有 13 个键 [54z]。
- 活动 sheet 空态合理，但 `Copy all / Clear` 在空态下仍可点 [55]。
- look 比较 sheet 三模式 `1 2 3 switch` [56]。

### 3.9 欢迎 / 启动失败 / 空态 [06]–[11][37]
- 启动失败页：熄灭的仪表 `■ 1 error —/— running — ○ Engine —`、错误框、`Retry / Open the data folder`、数据目录。仍是全场最好的一屏 [10]。
- 欢迎页左栏生命线、样例印章、三条原则，右栏环境检查，结构对 [08]。但 Pi 被标红"太旧"时，`Try a demo goal` 仍是唯一的黑按钮：环境不满足时，primary 应该是修环境的那个动作。

### 3.10 手机页 [p01]–[p08]
- 刻度标题、保留测试卡与桌面同序、`At your Mac:` 写明哪些只能在桌面做。稍后菜单一行两枚按钮 [p07]，空态骨架 [p05]。
- 问题见 §2.7、§2.4。

### 3.11 动效、焦点与可达性
- 时长有名字：`--dur-hover-out 150ms`、`--dur-base 160ms`、`--dur-space 220ms`；`--ease-out cubic-bezier(0.23, 1, 0.32, 1)`。
- 折叠约 130ms 收尾。减动画下没有任何动画。
- 焦点：字段是内描 1px text-3 [P-focus-tab]；队列卡双线。
- 键盘：Tab 在 WebKit 默认下只到表单控件，按钮靠 j / k / 1–9 / 字母键到达，`?` 表没写这一点。
- axe：概览、需要你（深中）、G-0001、评审 G-0003（深）、合同、设置（深中）、评审 G-0001（浅），全部零违规。

---

## 4. 优先修复清单

影响：H = 信息矛盾或闭环断裂；M = 单屏明显；L = 细节。工作量：S < 半天，M ≈ 1 天，L ≈ 2–3 天。

预期：完成 1–8 后，D6 / D8 约 95，D7 约 94.5；9–14 是 95 的打磨；15–18 决定 D9 能否过 93。

| # | 改动 | 文件 | 预期效果 | 解锁 | 影响/工作量 |
|---|---|---|---|---|---|
| 1 | 概览上的决策压成一行一项，焦点项才展开；航班牌进首屏 | `views/Overview.tsx`、`components/DecisionCard.tsx`（compact） | 概览是全局，不是第二个收件箱 | D6 +1 | M / M |
| 2 | 栅格：分区线止于卡片列（r8 #12）；目标页决策卡等于主栏宽；印章落在 `.goal-actions` 列或右栏左缘 | `app.css .board-group .scale-title / .board-queue`、`views/GoalPage.tsx:207-209` | 每屏一条右边界，印章在栅格线上 | D7 +0.5 | M / S |
| 3 | 行宽：卡片正文与注记 `max-width: 72ch`；空态容器放宽到 44ch | `app.css .decision-body`、`.honesty-note`、`.empty-poster` 父容器 | 阅读行宽统一在 45–75ch | D7 +0.5 | M / S |
| 4 | 读数里不作数 / 失败的标准排在通过的前面（图仍第一）（r8 #13） | `views/review/panels.tsx` | 最该看的在首屏 | D6 | M / S |
| 5 | 文案一事一职：cannot-run 去掉重复；armed 保留动词；去掉重复的 `Sentinel ·`；空评审去掉口号与 `Request changes` | `components/DecisionCard.tsx`、`review/panels.tsx`、`views/Review.tsx`、locales | 每句话只做一件事 | D6 +0.5 | M / S |
| 6 | 非法 step 就地写原因；提示行常驻为列头 | `components/LookSteps.tsx`、`lib/lookSteps.ts` | 输入错了知道怎么改 | D8 | M / S |
| 7 | 占位符加 `e.g.` / `例如`，颜色降到 text-4 | `views/ContractEditor.tsx`、`views/Settings.tsx`、`app.css ::placeholder` | 合同看起来不会像已经填好 | D7 | M / S |
| 8 | 评审：树与 diff 同序；当前块与已接受块分得开 | `lib/filetree.ts`、`lib/reviewState.ts`、`app.css .hunk-current` | `]` 的顺序与左栏一致 | D8 +0.5 | M / S |
| 9 | 手机：离线记住语言并说明去哪看；次按钮全宽或同行等宽 | `remote.html` | 手机错误页与桌面同一水准 | D6、D7 | M / S |
| 10 | 队列卡焦点只留外环；`?` 表加 Tab / 键盘导航说明（r8 #18） | `app.css .decision.focused`、`components/ShortcutSheet.tsx` | 焦点一条线；平台差异写明 | D8 | L / S |
| 11 | 运行历史可聚焦，回退不再只靠悬停 | `views/goal/` Runs 块 | 每个能力都能用键盘发现 | D8 | L / S |
| 12 | 欢迎页：环境有红项时，primary 是修环境的动作，`Try a demo goal` 降为次按钮 | `views/Welcome.tsx` | 第一屏不把人引向会失败的路 | D6 | L / S |
| 13 | 高亮：用生产包测到达时间；颜色 120ms 淡入，不要突然出现 | `lib/highlight.ts`、`app.css` | 评审首帧不闪 | D8 | L / S |
| 14 | 夹具：`enrichRich` 带上 tampered C5 并设 `not_evidence`；`held_out` 与 `has_held_out_tests` 一致；cannot-run 进 rich 世界与 shots；哨兵 / C4 / cannot-run 补中文；活动 sheet 空态禁用复制 / 清空 | `e2e/rich.ts`、`e2e/shots.spec.ts`、`components/Activity.tsx` | 预览世界能看到本轮的新面，没有自相矛盾 | 审计基础设施 | L / S |
| 15 | **减法**：全大写只留合同抬头；条款、sheet、手机分区、骨架表头改首字母大写；元信息去中点，改用间距 / 字色分组；可点整行去掉 `›` | `app.css .scale-title / .clause-title / .panel-title / .keys-group-title / .wordmark`、locales | 去掉模板痕迹，诚实语法成为唯一装饰 | D9 +1 | M / M |
| 16 | 设置页条款化加布尔控件统一，并加页内分区索引（r8 #15） | `views/Settings.tsx`、`app.css .settings-block` | 设置姓 Tower，长页可跳转 | D9 +1、D6 | M / M |
| 17 | 手机页头换成桌面仪表条；字体维持 SF（r8 #16 降级） | `remote.html #status` | 手机与桌面同一张脸 | D9 +0.5 | M / S |
| 18 | 20px 以上标题、印章、合同抬头用 Inter `opsz` 显示轴；品牌标记与"已验证"字形分开 | `tokens.css`、`components/Glyph.tsx`、`Chrome.tsx` | 大字有自己的紧度，品牌不与状态共用符号 | D9 +0.5、D7 | M / M |

---

## 5. 与主流 harness GUI 的对比（2026-10 下旬）

来源由子代理检索（§注）。引文经摘要工具转述，接近原文。

| 产品 | 本月 UI 相关变化 |
|---|---|
| **Claude Code** | CLI 2.1.311（10-26）修"diff 面板在无内容时自行打开"、屏幕阅读器下 Esc 关掉的反馈仍被发送；2.1.310 修"在 plan 卡的 `Send feedback and keep planning` 上按 Enter 却批准了 plan"；2.1.305 让 MCP 同意框"不那么容易把给输入框的 Enter 当成 Accept"，删除提示改为"1 或 Enter 保留、2 删除"。桌面 v2.42304.0（10-15）有会话侧栏卡片、权限请求进对话流；v3.6556.1（10-22）修焦点跳到对话框后面。文档里 diff 面板没有在 hunk 间移动的键 |
| **Codex 应用** | 评审范围有 Unstaged / Staged / Commit / Branch / `Last turn`；整 diff、文件、单个 hunk 三级 stage / revert；行内 `+` 批注。26.1007（10-08）"Changes 面板的滚动与文件导航"。文档里没有 hunk 导航键，也没有当前块标记 |
| **Cursor 3.27** | Agents 窗口"方向键 / Home / End 到达侧栏每一行和每个按钮"、操作后焦点留在原处；`reduceMotion` 下 spinner 改为脉动或淡入，"即使系统设置没开"。3.26 在减动画下对话框原地淡入；3.25 合并按钮说明为何被阻（`Needs restack`）；PR 页按 `?` 出快捷键表 |
| **Conductor** | 0.92.0（10-23）iPhone 远程控制 Mac 工作区，扫码配对；有 issue 报远程控制下 CJK 乱码（仅搜索结果） |
| **Devin 桌面** | 3.11.212（10-23）本地会话的 Changes 标签有 `Since last seen` 范围；失败的对话"说明原因并提供 Retry" |
| **Factory** | v0.207（10-27）长消息可折叠、会话显示 PR 状态；v0.203 会话在认证时"显示正在认证，而不是看起来空闲" |
| **Zed** | 1.24.2 修 `Awaiting Confirmation` 行因省略号动画而跳动 |
| **Amp** | 10-12 按决策模型给文件排序，"review starts sooner" |
| **设计参照** | Linear 10-08 Guided Reviews；Dia 1.52 当前标签滚出视口后图标仍可见（"当前项"标记的好范例）；Raycast 2.7 修工具审批输入框里 ⌘↩ 失效。Things、Craft、Arc 本月无条目；Apple HIG 只找到第三方博文（未证实） |
| **评测** | developertoolkit.ai（10-12）：第三方 harness 必须在"更好的评审板，或远程 / 手机访问"上赢；并提醒工作区可能"显示 working，实际在等输入"。Paralect 称 Conductor UX 最好（未证实） |

### 5.1 Tower 领先的地方

1. **评审键盘**：本月没有任何一家文档里有"当前 hunk + 只接受 + 带回执的撤销"。Tower 是唯一一个把阅读标记做成键盘闭环、并在页面上画出当前块的。Claude Code 本月修的三个 bug（Enter 误批准、Esc 后仍发送、对话框抢焦点），正是 Tower 已经用"两次按压 + Enter 归焦点"规避掉的那一类。
2. **"通过"不等于"证据"**：竞品的绿色只有一种意思。Tower 的 `Passed, not evidence`、`2 of 3 machine criteria count as evidence`，以及红项时的 `Accept anyway`，在本月对照组里没有同类。
3. **"不要看起来空闲"**：Factory、Devin、Cursor 本月都在补"失败或认证时说清楚，别显示为空"。Tower 的 `silent for 3m`、熄灭仪表的启动失败页、骨架板，早已是这个立场。
4. **减动画**：Cursor 3.26–3.27 才做到应用内的减动画替代；Tower 的 JS 与 CSS 时长同源，减动画下 0 个动画。
5. **中文**：Conductor 在远程控制里 CJK 乱码；Tower 整卡中文，支持拼音首字母搜索。

### 5.2 Tower 落后的地方

| 方面 | 它们 | Tower | 差距性质 |
|---|---|---|---|
| 评审范围 | Codex `Last turn`、Devin `Since last seen` | 只有整次评审，返工后的第二轮评审看不到"自上次以来" | 功能缺口，影响返工流程 |
| 键盘到达 | Cursor 方向键 / Home / End 到达每个按钮 | Tab 只在输入框之间循环，`?` 表没写 | 平台默认，但没说明 |
| 手机 | Conductor 0.92 / Cursor iOS / Claude Dispatch 都是原生应用 | 一页 HTML，离线时丢语言，页头只有刷新时间 | 立场一致，材质落后 |
| 概览 | Conductor / Devin 的侧栏一眼看全部会话状态 | 概览首屏是整卡副本，航班牌在折线下 | 信息架构 |

### 5.3 一句话定位

Tower 在评审语义、诚实语法、错误与空态、动效纪律、中文上仍领先 Codex / Claude Code / Conductor / Cursor 一代；本月竞品修的 Enter / 焦点 / "看起来空闲"类问题，Tower 已在上一轮解决。它与 Linear / Things 的差距不在功能，而在**构图与减法**：概览的首屏、栅格的最后几条线、行宽，以及一套还在借用通用装饰的外衣。

---

## 6. 要到 95，每个维度必须成立的事

**D6 页面 / 信息设计（94 → 95）**
- 概览首屏能看到全局：决策是一行一项，航班牌在折线之上（#1）。
- 读数里最需要看的在首屏（#4）。
- 每句文案只做一件事，没有重复的半句，没有口号填充（#5）。
- 环境有红项时，欢迎页的 primary 是修环境（#12）。

**D7 UI 视觉设计（93 → 95）**
- 每屏一条左边界、一条右边界；印章在栅格线上（#2）。
- 阅读行宽 45–75ch，无论卡片多宽、空态多窄（#3）。
- 占位符一眼就能和真实值分开（#7）。
- 手机按钮宽度有规则（#9）。
- 大字有显示光学尺寸（#18）。

**D8 交互与动效（94 → 95）**
- 输入错了，界面说哪里错、怎么改（#6）。
- `]` 的顺序就是左栏的顺序；当前块在任何状态下都看得出（#8）。
- 焦点一条线；Tab 与键盘导航写进 `?` 表；没有只靠悬停的能力（#10、#11）。
- 首帧不闪（#13）。

**D9 美学独特性（91 → 95）**
- 全大写、中点、`›` 从"到处都有"收回到"一处"，诚实语法成为唯一的装饰（#15）。
- 设置页与手机页长出 Tower 的脸：条款声音、仪表条（#16、#17）。
- 品牌有自己的符号，不借"已验证"（#18）。
- 至少有一个只属于 Tower 的版式时刻，可放进对比截图里：例如概览顶部那条"塔台"仪表，或者验收 sheet 的印章盖下的瞬间。它应当是全应用唯一一处被允许张扬的地方。

---

## 7. 关于评分口径

- 本轮宁可偏严：D7、D9 不动，不代表没有进步。r8 的 D7 / D9 缺陷修了一半以上，但外部视角新看到的栅格、行宽、模板痕迹与之相抵。
- D6、D8 的 +1 来自两个 H 的完整修复，有 e2e 守住（`review-keys.spec.ts`、`accept.spec.ts`）。
- 子分综合 91.3，略低于 D 综合 93.0。差距主要在第 1、8、12 项：原创性、原生感、品牌记忆点都卡在"通用装饰"上。

---

## 8. 附：本轮截图清单（`/tmp/audit-r9/shots/`，未入库）

| 编号 | 内容 |
|---|---|
| 01–05 | 概览：浅英 1440、深中 1440、深英 1100、浅英 1040、浅中 1800 |
| 06–07 | 空概览：深英、浅中 |
| 08–09b | 欢迎：浅英（身份缺失）、深中、深英（身份齐全） |
| 10–11 | 启动失败：浅英、深中 |
| 12–15 | 需要你：浅英、浅英（全页）、`j j` 之后、深英 1100；13 深中 |
| 16–17 | 保留测试卡：浅英、深中 |
| 18–20 | cannot-run：收件箱浅英、目标页浅英、目标页深中 |
| 21–27、S-goal1* | G-0001（tampered C5）浅英 / 深中 / 含保留测试；steps 展开；G-0002 运行中；G-0003 深中；G-0004；1100；滚动分屏 |
| 28–38b、36b | 评审 G-0003 浅英 / 深中 / 深英 1100；`]`、`A`、全部接受、`⇧A` 回执；G-0001 notes 折叠 / 展开 / 深中；验收 sheet（Accept anyway、armed、深中、干净）；空评审；读数面板；Request changes |
| 42–45 | 合同：浅英、深中、look steps、深中 look、深英 1100 |
| 46–47、S-settings* | 设置浅英 / 深中，滚动分屏 |
| 53–57 | 命令面板（空 / `cart`）、快捷键表（概览浅英、评审深中）、活动 sheet 浅中、look 比较、运行中目标 |
| p01–p08 | 手机：浅英 390、深英全页、浅中全页、深中 430、空、离线深中、稍后菜单、浅英全页 |
| P-* | armed 对比度（浅 / 深）、非法 step、队列焦点、Tab 顺序、高亮到达（两种动效偏好）、G-0003 1800、评审 1800 |
| metrics.jsonl / probes.txt / axe.txt | 每屏度量；探针结果（对比度、占位符、焦点、折叠逐帧、减动画、字体特性、树与 diff 顺序）；axe 7 屏零违规 |

注（来源）：
- Claude Code CHANGELOG 2.1.304–2.1.311（10-19 至 10-26）：https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md ；桌面 changelog：https://claude.com/docs/cowork/changelog ；文档：https://code.claude.com/docs/en/desktop
- Codex：https://learn.chatgpt.com/docs/changelog?type=codex-app ；https://learn.chatgpt.com/docs/code-review?surface=app
- Cursor：https://cursor.com/changelog ；https://cursor.com/docs/release-notes
- Conductor：https://conductor.build/changelog ；CJK issue：https://github.com/meltylabs/conductor-releases/issues/38（仅搜索结果）
- Devin：https://docs.devin.ai/desktop/changelog ；Factory：https://docs.factory.com/changelog/release-notes ；Zed：https://zed.dev/releases/stable ；Amp：https://ampcode.com/chronicle
- Linear：https://linear.app/changelog ；Raycast：https://www.raycast.com/changelog ；Dia：https://www.diabrowser.com/changelog
- 评测：https://developertoolkit.ai/en/ecosystem/agent-tools/agent-shells/ ；https://www.paralect.com/stack/top-agentic-ides（未证实）
