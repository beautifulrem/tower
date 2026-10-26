# Tower 设计审计 r4（视觉、信息架构、交互、文案）

> 日期：2026-10-27。审计人：Fable（独立产品设计视角；判准是 Linear / Things 3 / Raycast / Zed / Arc / Panic Nova / Craft / Superhuman / Apple 自家应用的水平，并明确拒绝"AI 味"与"默认感"设计）。
> 范围：产品评分表 D6–D9 与 12 项美学子分。对照 r3（`docs/reviews/design-audit-fable-r3.md`，综合 82）与其后的实现（`9539a00..HEAD`，12 个桌面端 / 手机页提交：r3 回应、引擎选择、保留测试、手机页、看图标准、评审文件树与 ⌘P、就地编辑、建议块、评审队列、撤销回退、稍后提醒、心跳三态、轨迹工具行）。
> 取证：锁屏状态下 `tools/screenshot.sh` 仍只能拍到黑窗（`/tmp/audit-r4-design/real-overview.png`，平均亮度 19/255，仅作记录）。本轮改用 **Playwright WebKit**（`webkit-2370`，即 WKWebView 的引擎）渲染真实 Vite 页面，Tauri IPC 用 shim 回放 **本轮从真实监督器重新 dump 的视图**（`cargo run --example seed_demo` + `dump_views`，`/tmp/audit-r4-design/fx/`）。为覆盖新面：`fx-rich/` 在真实 dump 上加了引擎覆盖（G-0002 = Claude Code）、看图标准 C4 与两张截图、"依赖被改的测试"（G-0003 C1）、可撤销的回退（G-0004）、保留测试与 base 测试检查、手机页开启、三文件评审与一条带 ```suggestion 的批注；`fx-extra/` 再加 CI 失败卡 + PR、依赖变更暂停、base 测试失败、缺一侧截图。手机页直接用 WebKit 以 390×844 / 3× 打开 `crates/tower-supervisor/src/remote.html`，`/api/state` 由路由拦截返回同一套数据。共 112 张截图在 `/tmp/audit-r4-design/`，未入库；下文以 `[编号]` 引用。涉及尺寸的结论另用 `--eval` 读取了 DOM 盒模型。
> 两处取证限制：原生弹出菜单（`Menu.popup`）在 shim 下不能真正选中项，"设置里切到 Claude Code" 与 "编辑器里切到 Claude Code" 两屏按代码审读（`Settings.tsx:212-227`、`ContractEditor.tsx:349-370`）；动效与时序仍无法从静态截图验证。

---

## 0. 总评

r3 的 30 项里 **29 项完整落地，1 项落地后产生了新的副作用**（§1.3）。这一轮的差别不再是"修 bug"，而是面扩了一倍：引擎选择、看图标准、保留测试、手机页、文件树、就地编辑、建议块、评审队列、撤销回退、稍后提醒——十个新面，**没有一个是"默认感"的**。心跳三态（`1 秒前 / 工具运行中 3m · bash / ◻ 无响应 1h 40m`）把 r3 最难的那条做成了一等语法 [10][35]；"依赖被改的测试"用琥珀 chip + 账本里一个 `✕ 矛盾` 把"红→绿造假"说清楚了 [31][32]；手机页是同一支笔画出来的（字标、琥珀条头、印章、`┆ Agent 称`）[80]–[89]；空概览、启动失败页有了字标和三条规则 [08][15]。

它现在距离 95 的差距，第一次不是"有没有做"，也不是"做了彼此打架"，而是 **新面接上旧骨架时的接缝**：

1. **航班牌身份列被引擎标签挤爆。** `.g-id` 是固定 149.5px；加上 `Claude Code` 后项目名 `shop` 被压到 **3px**（显示为 `s…`），有返工计数时 `⟳ 1/3` 被压到 **4px**，与 `Claude Code` 实际重叠 [01][05]（`--eval`：`shop w=3 sw=28`，`1/3 w=4 sw=33`）。这是本轮唯一在 1440 宽主画面上可见的破损。
2. **一页三个主按钮。** 已暂停且可撤销回退的目标页：头部 `继续 P`（primary）、卡片 `继续`（primary）、"接下来"区块 `重新验证`（primary）[26]。而且 `重新验证` 出现在一个**从未验证过**的目标上，说明文案"你改过工作区：验收前需要重新验证"是评审语境写死的。
3. **英文 `┆ Agent's summary` 被裁成 `Agent's summa`。** 来源边栏的 kind 列是固定 6.5em，中文 `提交说明` 刚好，英文溢出裁切 [24][29][32]。
4. **看图条没对齐列。** 缩略图从 `C4` 编号列（x=286）开始，标题列在 x=326.5，差 40px [28][29]。
5. **手机页的点击目标低于平台底线。** `.btn` 34px、行内 `暂停` 30px，iOS 最小 44pt；离线态把 WebKit 原始错误 `Load failed` 直接排在中文句子里 [86]。
6. **设置里的引擎提示串场。** 选的是 Pi，字段下方却写"Claude Code 自身没有任何工具……" [68][69]；引擎在三处叫三个名字（设置 `引擎` / 合同 `引擎 › Agent` / 右栏 `引擎 › Agent`），模型默认写成 `引擎默认`。

全是 S 量级。修完 Top 10，D6–D9 预计 90–92；Top 30 全部做完，才有资格谈 95——到那时剩下的差距是 §5 里说的"面板与材质"，而不是接缝。

---

## 1. 评分

### 1.1 产品评分表 D6–D9

| 维度 | r3 | r4 | Δ | 一句话判词 |
|---|---|---|---|---|
| D6 视觉美学与原创性 | 82 | **86** | +4 | 心跳空心方框、琥珀 chip、字标进了空态与手机页、手机页同一支笔；建议块、文件树、就地编辑都没有"GitHub 味"。扣分：身份列重叠、建议块琥珀 + 绿双层底色、就地编辑全亮焦点环、看图条错列、QR 白块生硬。 |
| D7 信息架构与布局 | 80 | **85** | +5 | 验证中 / 待验收分组、1100 右栏两列真的生效 [25b]、评审队列、文件树、`接下来`统一为一个主动作（in_review 时头部不再重复 `评审 R`）。扣分：三主按钮 [26]；评审侧栏单元列表与文件树重复列出同一批文件 [41]；目标页 CI 卡 PR 读数在身份行与条头各一次 [34]；稍后提醒后卡片消失没有"去哪了"的线索 [22b]；真实 dump 里出现了两张一模一样的暂停卡与两行重复轨迹（监督器侧，但 UI 原样显示）。 |
| D8 交互细节与键盘 | 85 | **88** | +3 | `U` 撤销区块、`⌘P`、`⇧R` 队列、`N / ⌘N` 别名键帽、面板首焦点落在容器、hover 回退有提示、两次按键在手机页同样成立 [88]。扣分：比较面板无键盘（叠加滑块只能拖）；稍后提醒无键位（只有铃铛）；手机页 34/30px 点击目标、无手动刷新；验收面板里的看图缩略图会在 overlay 上再开 overlay，焦点归还未验证。 |
| D9 文案与中文排版 | 83 | **87** | +4 | `PR 开启中`、英文右栏大小写、`（英文，给 Agent）`、"依赖被改的测试 / 这不是红 → 绿"、"已收起，04:02 再提醒"、手机页"评审留在电脑上"——都是人写的。扣分：`Agent's summa` 裁切；`引擎默认`；`看起来对` 作为标准种类名；预算行换行后 `·` 领头 [24]；保留测试提示复述标签；手机页"由你自己的电脑上的 Tower 提供"双"的"、英文 `on the desk`；离线态英文原始错误。 |

### 1.2 12 项美学子分（与 r3 对比）

| # | 子项 | r1 | r2 | r3 | r4 | Δ | 判词 |
|---|---|---|---|---|---|---|---|
| 1 | 美学与原创性 | 66 | 76 | 82 | **85** | +3 | 空心方框、琥珀 chip、字标三处落地、手机页同笔。还没有一张"海报级"画面；手机页是最接近默认感的面（系统字体 + 白卡）。 |
| 2 | 排版（拉丁 + CJK） | 70 | 79 | 84 | **86** | +2 | `N / ⌘N`、`队列 1 / 2`、`返工 1 / 3`、单位全对。扣：`Agent's summa` 裁切；身份列重叠；`·` 领头；1100 下建议块 `break-all` 把 `item.qty` 拆成 `ite / m.qty` [43]。 |
| 3 | 颜色与对比 | 78 | 82 | 86 | **88** | +2 | 空心 ■ 把"沉默"与"错误"分开；`.btn-ghost .kbd` 用 text-3 整色；浅色 diff .13/.11 可辨 [42]。扣：建议块绿底叠在琥珀批注底上；深色手机页卡片 raised 与 bg 仅 0.025 L 差。 |
| 4 | 布局与层级 | 60 | 72 | 80 | **85** | +5 | 右栏折叠真生效、合同摘要跨两列 [25b]；文件树折叠单子目录；并排撤销居中 [44]。扣：`.g-id` 149.5px 固定列溢出；看图条错列 40px；评审侧栏两套列表。 |
| 5 | 密度与节奏 | 64 | 75 | 82 | **86** | +4 | 轨迹工具行 `read src/cart.js 52ms` 一行可读 [36]；验收面板少两行；手机页一列三段。扣：目标页 CI 卡 PR 两次；已暂停页三个主按钮。 |
| 6 | 组件工艺 | 62 | 74 | 81 | **85** | +4 | 图标 5px 间距、`输出` 与 `重新检查` 同形、外观分段控件、`Kbd` 别名、`Overlay initialFocus`。扣：就地编辑 textarea 1.5px 全亮 outline 包住 1600px 框 [47]；手机页按钮高度；QR 白块无内边界过渡。 |
| 7 | 动效与反馈 | 45 | 68 | 80 | **82** | +2 | 回退 toast 带 `撤销回退` 8s；稍后提醒 toast 带 `现在显示`；保存文件 / 应用建议都有回执。静态截图仍无法验证时序。 |
| 8 | macOS 原生感 | 72 | 80 | 85 | **87** | +2 | 稍后提醒走原生菜单；分段控件 22px；评审全屏；状态条鼠标提示退到右侧 text-4。扣：手机页不是 macOS，但它该像 iOS——44pt 没守。 |
| 9 | 图标与字形 | 58 | 80 | 90 | **91** | +1 | `bell`、`caret`、`harness`、`undo` 全在一支笔下；`Empty` 复用 `Icon ring` / `DangerMark`；手机页 SVG 同一组路径。扣：`◆`（需要你）被借去做"依赖被改的测试"的前缀 [31]——语义是对的（这确实需要你判断），但它是第一次出现在事实行而非决定卡上。 |
| 10 | 空 / 加载 / 错误状态 | 55 | 72 | 80 | **86** | +6 | 空概览 / 空收件箱 / 启动失败页：字标 + 24vh + 三条规则 [08][09][15][19b]；手机页空态与未配对态 [85][87]。扣：手机离线态 `连不上 Tower · Load failed` 英文原文 + 无重试 [86]；缺一侧截图的虚线框文案可读但 60 秒超时的句子折三行 [34]。 |
| 11 | 浅色主题 | 68 | 78 | 84 | **87** | +3 | 浅色 diff、浅色建议块、浅色手机页都成立 [42][80]。扣：浅色批注框 cream + 建议绿 + 行底绿三层相邻 [42]。 |
| 12 | 品牌性格 / 记忆点 | 52 | 64 | 72 | **80** | +8 | 字标现在在欢迎页、空态、启动失败、手机页；"无响应"成了 Tower 自己的状态语法；"评审留在电脑上"是一句有立场的话。扣：标题栏、面板、toast 仍是通用形态；手机页卡片没有桌面那种"航班牌"密度。 |
| | **综合** | 63 | 75 | 82 | **86** | +4 | |

### 1.3 r3 Top 30 落地核对

| r3 # | 项目 | 状态 | 证据 |
|---|---|---|---|
| 1 | `.rail` 折叠规则移到基础规则之后 | **已修** | `app.css:1667-1681`（`.goal-rail .rail` 在 `.rail` 之后）；[25b] 1100 宽右栏 `合同 v1 摘要` 跨两列、`范围围栏 / 预算 / 自主度` 三列 |
| 2 | CI 卡 / 依赖卡寄存器按段判定 | 已修 | `DecisionCard.tsx:96-104 bodyParts()`；[33] 散文 UI 字体 + `npm ERR!` 进 `.output-tail`；[34] 检查名 `code-val` |
| 3 | 假设卡 `body === subject` 不渲染 | 已修 | `bodyParts` 首行；[16][31] 假设卡只有问题句 |
| 4 | 心跳 >120s 空心方框；徽章降级 `无响应` | 已修 | `app.css:136-141 .gauge-dot.hollow`、`Live.tsx silent()`；[10] `◻ 无响应 1h 40m` + 行徽章 `无响应`；[35] 目标页同 |
| 5 | `.btn-label { gap: 5px }` | 已修 | `app.css:649-653`；[61] `+ 命令` |
| 6 | 验收面板删 `已看 n/m`；阻塞句移到复选框行 | 已修 | `panels.tsx:199-213`；[52] `C3 … 待你勾选`，无 `已看 0/1` |
| 7 | `review` 组拆 `验证中` / `待验收`；计数同源 | 已修 | `labels.ts:34-56`、`Sidebar.tsx:22-36`；[05] `验证中 2`、`待验收 2` |
| 8 | 身份行只留状态词；0 文件走 `Empty` | 已修 | `GoalPage.tsx:179-182,555-563`；[26] `已暂停`；[23] `还没有改动 · 快照与 base @482c602 相同` |
| 9 | 墙钟超限 `--st-attention` + `超时` | 已修 | `app.css:1616-1626 .over-wall`；[35] 身份行 `超时` chip、预算行 `墙钟 109 / 90 分` chip |
| 10 | `Overlay initialFocus="panel"` | 已修 | `ui.tsx` 新增、`panels.tsx:52,191`、`Look.tsx:58`；[51] 无游离焦点环 |
| 11 | `PR 开启中`；英文右栏句首大写 | 已修 | `zh-CN.ts prOpen`、`en.ts askFirst/sandboxOnShort/networkOff`；[24] `Ask first · Workspace only · No network` |
| 12 | `budget-line` 每段 nowrap、`·` 并入后项 | **已修但有副作用** | `.budget-line > span { white-space: nowrap }`；[24] 英文换行后第二行以 `· Wall clock 46 / 90 min` 领头——分隔点从悬尾变成了领头 |
| 13 | 评审 `没有改动` 时头部只留 pin 对 | 已修 | `Review.tsx:325-342`（`units().length > 0` 才渲染计数） |
| 14 | 设置 `输出` 改 ghost | 已修 | `TestCheck.tsx:63-66`；[69b] `Output / Re-check` 同形 |
| 15 | 轨迹 `tool_ended` 显示 target；`observed` 带标准 | 已修 | `Trace.tsx:213-227,229-238`；[36] `read package.json 54ms`、`bash npm test 2>&1 \| tail -8 · at startSubtest…` |
| 16 | 依赖卡 `打开改动 ›` | 已修 | `DecisionCard.tsx:224-227`；[33] |
| 17 | 年龄列统一；运行时长进实况列 | 已修 | `GoalRow.tsx:24-25`、`Live.tsx:90-99`；[10] `开始工作 · 已运行 1h 49m` 在实况列，年龄列 `2 小时前` |
| 18 | 快捷键表别名 `/` | 已修 | `ui.tsx Kbd`、`.kbd-or`；[59] `N / ⌘N`、`Esc / ⌘[` |
| 19 | 状态条鼠标提示右移 text-4 | 已修 | `Review.tsx:537-538`、`.status-mouse`；[41] |
| 20 | 编辑器 ≤1280 三档描述进 `title` | 已修（代码） | `.autonomy-current` + `@media (max-width:1280px) .autonomy-choices .radio-desc{display:none}` |
| 21 | `已复制` 用 `success` | 已修 | `Welcome.tsx:97`、`GoalPage.tsx`、`Settings.tsx:357`、`panels.tsx:250` |
| 22 | 并排模式撤销居中 | 已修 | `.diff-split .hunk-head .undo-hunk { left:50% }`；[44] |
| 23 | 浅色 diff `.13 / .11` | 已修 | `tokens.css:178,180`；[42] |
| 24 | 回退键位 / 入口提示；`u` 撤销区块 | 已修 | `GoalPage.tsx` 运行区块 `悬停一行可回退到它开始时`；`Review.tsx:270-276 u`；[26][59] |
| 25 | CI 卡条头 PR 行移到标题后，时间独占右缘 | 已修 | `DecisionCard.tsx:164-172`；[34] 条头 `CI failed · PR open · ✓3 ■1 › ……… 39 min ago` |
| 26 | 外观改分段控件 | 已修 | `Settings.tsx:62-74 Segmented`；[68c] `跟随系统 浅色 深色` |
| 27 | 空态字标 + 24vh + 三条规则 | 已修 | `ui.tsx Empty poster / Rules / Wordmark`；[08][09][15][19b] |
| 28 | 欢迎页右栏与字标同基线 | 已修 | `.welcome-side { padding-top: 0 }`、`.checks .section-title { line-height: 12px }`；[11] `环境检查` 与 `TOWER` 同一行 |
| 29 | `Empty` 复用 `Icon ring` / `DangerMark` | 已修 | `ui.tsx:190-198` |
| 30 | 轨迹注入消息标 `（英文，给 Agent）` | 已修 | `Trace.tsx:305`；[36][37b] |

---

## 2. 全局问题与修法

### 2.1 航班牌身份列：固定 149.5px，引擎标签把项目名挤成 `s…`

现状 [01][05]：`.g-row` 网格的身份列是 `149.5px`（`--eval` 读到 `grid-template-columns: 14px 229.6px 220.4px 143px 58.5px 91px 65px 149.5px 65px`）。`.g-id` 是 `display:flex; overflow:hidden; white-space:nowrap`，子项没有 `flex-shrink: 0`，于是浏览器按比例压缩：`G-0002 · shop · Claude Code` 里 `shop` 被压到 **3px**（`scrollWidth 28`），显示为 `s…`；G-0011 `G-0011 · shop · ⟳ 1/3 · Claude Code` 里 `1/3` 被压到 **4px**，与后面的 `Claude Code` 字面重叠。r3 要求"引擎只在非默认时说"做到了，但说的时候把更重要的项目名吃掉了。

修法（S）：

```css
/* app.css —— .g-id 的子项不参与压缩；项目名可省略但有下限；引擎名最先让位 */
.g-id > * { flex: 0 0 auto; }
.g-id .g-project { flex: 0 1 auto; min-width: 3.5em; }
.g-id .g-engine { flex: 0 10 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
@media (max-width: 1400px) { .g-id .g-engine, .g-id .g-engine + .sep { display: none; } }
```

并把引擎标签缩成一个 **两字母字标**（`CC` / `Pi`，`.code-val t3`），全称进 `title`；12 目标的航班牌上一个 `Claude Code` 单词占 73px，比 `G-0011` 本身还宽，不配这个位置。

### 2.2 一页三个主按钮

现状 [26]：G-0004 已暂停、`can_undo_rollback = true`：头部 `继续 P`（`btn-primary`）、决策卡 `继续`（`btn-primary`，监督器给的 tone）、"接下来"区块 `重新验证`（`btn-primary`）。`--eval` 读到三个 `.btn-primary`：`["继续P","继续","重新验证"]`。而且这个目标 `已验证 0/2`，从未验证过，"验收前需要重新验证"不成立。

修法（S）：
- `GoalPage.tsx:450-465` 的"你改过工作区"区块只在 `g().state === "in_review"` 或 `criteria.some(c => c.verified)` 时出现；paused 且从未验证时，`撤销回退` 放进 **运行区块** 对应那一行（`R-01 首次 02:52 4s 已暂停 · 已回退 · 撤销`），不开新区块。
- 有决策卡在页时，头部动作里与卡片首选项同义的按钮（`继续`）降为 ghost：卡片已经是这页唯一的问题句。
- 文案拆两句：in_review → `你改过工作区：验收前需要重新验证。`；paused → `你回退了工作区；继续运行会从这里开始。`

### 2.3 来源边栏 kind 列裁切英文

现状 [24][29][32]：`┆ Agent's summary` 显示为 `Agent's summa`。`.claim-kind`（Honesty.tsx `Claim`）列宽固定约 6.5em，中文 `提交说明 / 标准已满足` 四五个字正好，英文 15 字母溢出被 `overflow:hidden` 裁掉，没有省略号。

修法（S）：列宽 `minmax(6.5em, max-content)` 上限 `9em`，超出 `text-overflow: ellipsis` 并给 `title`；英文改短：`Summary`（`goal.submitSummary`），`Criterion met` 保持。中文不动。

### 2.4 看图条与列不齐

现状 [28][29][30]：`.look-strip { margin: 2px 0 8px 22px }`，缩略图左缘 x=286，与 `C4` 编号列同起点；标准标题列起点 x=326.5（`14px + 2.5em + 2 × 8px`）。差 40px，缩略图像是属于编号列。

修法（S）：把看图条放进 `criterion-row` 同一网格的 `grid-column: 3 / -1`，或 `margin-left: calc(14px + 2.5em + 2 * var(--sp-2))`。同时 `.look-img { object-fit: contain; background: var(--bg-inset) }`——`cover + top left` 在竖长页面只会露出页眉。

### 2.5 手机页：44pt 与离线态

现状 [80]–[89]：`.btn { height: 34px }`，`.row .btn { height: 30px }`，`textarea { min-height: 34px }`，`.row { min-height: 44px }`。iOS HIG 最小点击目标 44×44pt；`放弃这个目标` 这种需要按两次的按钮尤其不该是 34px。离线态 `■ 连不上 Tower · Load failed` [86]：`e.message` 是 WebKit 的英文原文，拼在中文句子里；没有重试按钮；页面每 5 秒自动刷新但没有任何手动刷新入口（下拉刷新在 `file://`/PWA 外的 Safari 里有效，但状态行应说明）。

修法（S）：

```css
.btn { height: 44px; padding: 0 16px; font-size: 15px; }
.row .btn { height: 40px; }
textarea { min-height: 44px; }
.row { min-height: 52px; }
```

离线：`<p class="error">连不上 Tower</p>` + ghost `重试`，原始错误进 `title`；状态行 `更新于 03:05 · 每 5 秒`。

### 2.6 引擎：一个概念三个名字，提示串场

| 位置 | 现状 | 应为 |
|---|---|---|
| 设置 › 引擎与默认值 [68][69] | 字段 `引擎 = Pi`，提示恒显 `Claude Code 自身没有任何工具，只能用 Tower 的沙箱工具。` | 提示只在 `engine() === "claude-code"` 时显示（`Settings.tsx:212` 的 `hint` 改为条件），Pi 时为空或 `Tower 自带的 Agent 引擎。` |
| 合同编辑器 [61][62] | 区块 `引擎`，字段 `Agent = 默认（Pi）` | 字段名改 `引擎`（与设置一致）；`contract.agent` 删除 |
| 目标右栏 [23][24] | `引擎` 区块下 `Agent  Claude Code` / `模型  引擎默认` | `引擎  Claude Code` / `模型  Claude Code 默认`（`common.engineDefault` → `{engine} 默认`） |
| 身份行 [23] | `… · 第 1 次运行 · Claude Code` text-3 | 保持；但 1100 下身份列隐藏后引擎完全不可见 → 进 `LiveLine` 徽章前缀或 H1 的 `title` |

### 2.7 评审侧栏：两套列表说同一批文件

现状 [41][42]：240px 侧栏上半是评审单元（`cart.js +1 src/ 9 行 ▮` / `cart.test.js test/ 3 行`），下半 `文件 3 ⌘P` 是同一批文件的树。两套高亮：单元用 `bg-selected`，树用 `text-1` + `aria-current`。三个文件、两个单元时读者要在两处找同一个名字。

修法（M）：≥2 文件时只保留树，**单元成为树的分组标题**（`◇ 改了金额计算 · 9 行 ▮` 作为一级节点，其下按目录折叠），`j/k` 仍在单元间走。1 文件时无侧栏（现状）。`tree-head` 的 `文件 3` 与 `⌘P` 键帽保留为树的页眉。

### 2.8 文案与排版校对

| 位置 | 现状 | 应为 |
|---|---|---|
| 预算行换行 [24] | `… · hard $8` ↵ `· Wall clock 46 / 90 min` | 两行固定：第一行花费（`$0.02 · <1% of the $5 soft cap · hard $8`），第二行时间（`Wall clock 46 / 90 min`），不靠换行；或 `.budget-line { display:grid; grid-template-columns: max-content; }` 时去掉 sep |
| `common.engineDefault` | `引擎默认` / `Engine default` | `Claude Code 默认` / `Claude Code default`（带参数） |
| `contract.addLook` | `+ 看起来对` / `+ Looks right` | `+ 外观` / `+ Screenshot`——它是"截图给你比较"，不是一个会"对"的标准；标题占位 `说明` 改 `这个页面应该看起来怎样` |
| `settings.holdoutFilesHint` | `保留测试（只在验证中出现，Agent 看不到）。每行一个模式，须是被 git 忽略的文件。` | 去掉复述标签：`只在验证中出现，Agent 看不到。每行一个模式；须是被 git 忽略的文件。` |
| 手机页脚 `foot` | `这个页面由你自己的电脑上的 Tower 提供。` | `这个页面由你电脑上的 Tower 提供。` |
| 手机页 EN `acceptOnDesk` | `Review and accept on the desk` | `Review and accept on your Mac` |
| 手机页离线 | `连不上 Tower · Load failed` | `连不上 Tower`（原文进 `title`）+ `重试` |
| 建议块 1100 [43] | `.suggestion { word-break: break-all }` 把 `item.qty` 拆成 `ite` / `m.qty` | `white-space: pre; overflow-x: auto`（代码不折行，横滚）或 `overflow-wrap: anywhere` |
| 时间量纲 [10] | 标题栏 `无响应 1h 40m`，同屏行 `已运行 1h 49m`，年龄列 `2 小时前` | 年龄列在 <3h 时用 `1h 40m 前`（同一个 `duration` 格式器） |
| 目标页 CI 卡 [34] | 身份行 `PR open · ✓3 ■1 · test (…) ›` 与卡片条头 `PR open · ✓3 ■1 ›` | 目标页 `showGoal=false` 时条头不再放 PR 行（`DecisionCard.tsx:165` 加 `&& props.showGoal !== false`） |
| 轨迹重复行 [36] | `你的回答 撤回：运行已停止` 连续两行；真实 dump 里 G-0004 两张相同暂停卡 | 监督器去重（`seed_demo` 的暂停事件发了两次）；前端 `inbox` 按 `(goal_id, kind, subject)` 去重作保险 |

### 2.9 焦点与键盘

- 比较面板 [38][40]：`并排 / 叠加` 是 `role=tablist`，滑块是 `input[type=range]`；没有键：建议 `1` / `2` 切模式，`← →` 调 5%，按住 `空格` 显示"改动前"（Figma / Kaleidoscope 惯例），`Esc` 已有。
- 稍后提醒只有铃铛（22px `IconButton`，`aria-haspopup=menu`）；收件箱里 `1–9` 选项、`j/k` 移动都有键，`h` 应该给 snooze（Linear 的 `H`[^lin2]）。
- 验收面板里点看图缩略图会在 `Overlay` 上再开一个 `Overlay`（`Look.tsx:43-45` 在 `panels.tsx:215` 内）；关闭内层后焦点应回到缩略图按钮，`Overlay` 目前只在关闭时归还给打开前的 `activeElement`——嵌套时是否正确未验证，建议加测试。
- 就地编辑 [47]：`Esc` 退出、`⌘↩` 保存、未改动禁用——好。但编辑中 `已看` 切换仍可点，且 textarea 的 `:focus-visible` 1.5px 全亮 outline 把 1600px 宽的框整个描了一圈；编辑态应走 `input:focus` 的 `border-color: var(--border-strong)` 规则而不是 outline。

---

## 3. 逐屏审计

### 3.1 标题栏与侧栏 [01][05][10][35]

做对了：心跳三态（`5 秒前` → `工具运行中 3m · bash` → `◻ 无响应 1h 40m`）；空心方框与错误 ■ 不再并排；侧栏 `验证中` 独立分组；`需要你 2 = 2`。

问题：
1. 引擎挂牌 `● 引擎 Pi demo-engine` 在 engine=claude-code 时写 `Claude Code`（代码 `Chrome.tsx`），但版本号位置空着——Claude Code 也该有一个可读版本或 `claude-agent-acp` 字样。
2. 12 目标时侧栏七组 + `已验收 · 已结束` 默认展开 [05]，1440×900 下已接近底部 `设置`；`已验收 · 已结束` 默认折叠。

### 3.2 概览 / 航班牌 [01]–[10b]

做对了：`验证中` 组 [05]；运行行实况列 `执行 bash · npm test -- disco…`、`已运行 1h 49m` [10]；空态海报 [08][09]；引擎只在非默认时出现。

问题：
1. 身份列溢出（§2.1，最高优先级）。
2. 12 目标 [05] 第三行 `Migrate every amount…` 的 `G-0011 · s… ⟳ 1/3 Claude Code` 实际重叠。
3. 空态海报的三条规则 `事实与声明分开 · 只在需要你时打扰 · 你的仓库不被触碰` 是 text-3 12px 左对齐，和上面的字标、标题构成一个左对齐块——成立；但 `margin-top: 24vh` 在 1800px 高的屏上会把它推到 430px，仍偏上，`clamp(120px, 24vh, 280px)` 更稳。

### 3.3 需要你 [16]–[22b]

做对了：`阻塞运行 2 / 待验收 2`；`依次评审全部待验收 ⇧R` 作为 scale-title 右缘的 ghost；每卡铃铛；`已收起，04:02 再提醒 · 现在显示` toast [22b]；待验收卡正文是 Agent 的提交说明（`┆ 提交说明`）。

问题：
1. 收起后没有"收起了 n 张"的痕迹：侧栏 `需要你` 计数直接减一，用户下次困惑"那张卡呢"。页脚 `J K 移动 · 1-9 选择 · 放弃需按两次` 后加 `· 已收起 1（04:02）`，点击展开。
2. 铃铛用 text-3 挂在时间右侧，`margin-right: -4px`——与时间 12px 字号并列时视觉重量相当，像是时间的一部分；`opacity: .7` hover 到 1。
3. 待验收卡 `打开评审` 在收件箱里是 `btn-primary`，而目标页同一动作是 `评审 1 个文件 R`；两处词不同（`打开评审` / `评审 n 个文件`），建议收件箱也写 `评审 1 个文件`。

### 3.4 目标页 [23]–[37b]

做对了：身份行 `· Claude Code`；右栏 `引擎` 区块；`超时` chip 与预算行琥珀段 [35]；`还没有改动 · 快照与 base @482c602 相同` [23]；运行区块 `悬停一行可回退到它开始时`；看图条两张缩略图 + `改动前 / 改动后` [28]；`◆ 依赖被改的测试` + 账本 `✕ 矛盾` + 证据句 [31]；缺一侧时虚线框写原因 [34]；轨迹工具行、观测行、`（英文，给 Agent）` [36][37b]。

问题：
1. 三主按钮（§2.2）。
2. `Agent's summa` 裁切（§2.3）。
3. 看图条错列（§2.4）。
4. `重新验证` 区块的说明句在 paused 态不成立（§2.2）。
5. 无响应态 [35] 实况行 `无响应   开始工作` 右侧时间槽空着（`刚刚` 消失了）——沉默时恰恰最需要"最后一次动静 1h 40m 前"。
6. 预算行领头 `·`（§2.8）。
7. CI 卡 PR 两次（§2.8）。
8. 账本 `✕ 矛盾` 用 `--st-danger` 的 ✕ + text-1 文字；这是全站第一次在非错误场景用红 ✕。语义上"说法被测量推翻"确实是坏消息，可接受；但同一行左侧 `┆ 标准已满足` 仍是中性来源标签，建议该行的 kind 标签也降为 text-4（被推翻的说法不该与成立的说法同重）。

### 3.5 评审 [41]–[60b]

做对了：树折叠 `src/ › cart/ › money.js`，文件行 `+7 −0`，当前文件 text-1、已看 text-3 + ✓；`⌘P` 面板复用命令面板壳 [45][46]；建议块 `建议` 标签 + 代码 + `应用建议` [41][42]；就地编辑 `编辑中` 标签 + 说明句 + `保存文件 ⌘↩` 禁用态 [47]；并排撤销居中 [44]；验收面板 `待你勾选` 行内 + 看图条 [52]；队列 `队列 1 / 2` [56]；要求修改面板里 `· 建议` 标注 [54]。

问题：
1. 两套列表（§2.7）。
2. 建议块双层底色：深色 [41] 琥珀批注底（`.inline-comment`）上叠 `--diff-add-bg` 绿块，浅色 [42] 是 cream + 浅绿 + 行底绿三层相邻。建议 `.suggestion { background: var(--bg-inset); border-left: 2px solid var(--st-verified); }`。
3. 就地编辑焦点环（§2.9）；编辑中 `已看` 仍可切换。
4. 1100 下建议块 `break-all` [43]（§2.8）。
5. `⌘P` 面板 [46]：命中项 `src/cart/money.js` 只有高亮没有文件的 `+7 −0`，而树里有；面板项右侧加同一读数，让两处一致。
6. 验证读数面板 [51] 的看图条在 8 行输出尾巴之后，被面板底边裁掉；面板里缩略图高 72px 或折叠为 `查看截图 ›`。
7. 树行 `height: 24px`、单元行 28px、`tree-head` 10px 上边距——三个节奏；统一为 26px。

### 3.6 合同编辑器 [61]–[67c]

做对了：`+ 命令 · + 看起来对 · + 人工` 三个加法在同一行右缘；look 行 `启动命令 / 地址` 两格 + 一句提示；右栏 `引擎` 区块 `Agent / 模型 / 思考强度`，Claude Code 时隐藏思考强度、模型列表换别名（代码）；1100 下描述进 title（代码）。

问题：
1. `看起来对` 命名与 `Agent` 字段名（§2.6、§2.8）。
2. look 行的超时输入与命令行同用 `600 秒` 样式但默认 `60 秒`，两种标准同一列不同量级，读者分不出哪个是"等页面可访问"；look 的单位改 `秒内可访问`，或把超时移到 `地址` 后缀。
3. 底部 `取消 / 保存为草稿 / 批准并开始 ⌘↩` sticky 条遮住 look 提示句的末行 [65]——`.editor-main` 末尾加 `padding-bottom: 56px`。

### 3.7 设置 [68]–[74b]

做对了：引擎字段；保留测试字段与提示；项目块 `✓ Tests pass on main · 1s  npm test  Output / Re-check` 一行；未检查过时 `还没有在 main 上跑过测试 · 在 main 上检查测试`；手机块：开关 + 端口 + QR + 两条链接（Tailscale 在前）+ 传输诚实句 + `新的配对链接`；外观分段控件；Claude Code 时 `Claude Code 启动命令` 字段出现、思考强度隐藏（代码）。

问题：
1. 引擎提示串场（§2.6）。
2. 手机块链接 `http://100.101.102.103:7317/#…` 用 `mono t2` 截断到 `#…`，两行几乎一样，读者要比对 IP 才知道哪条是 Tailscale；改为键值：`Tailscale  100.101.102.103:7317  ⧉` / `局域网  192.168.1.24:7317  ⧉`，`http://` 与 `#…` 都不必显示。
3. 端口字段在未开启时仍可编辑；开启前禁用（`disabled` + text-3）。
4. QR 132px 纯白块在深色下是页面上最亮的元素；外框 `padding: 6px` 已有，再加 `box-shadow: 0 0 0 1px var(--border)` 与 `border-radius` 内外一致即可。
5. `保留测试` 提示复述标签（§2.8）。

### 3.8 手机页 [80]–[89]

做对了：同一字标、同一琥珀条头、`┆ Agent 称`、印章 `@ed3597c`、`再按一次` [88]、`回到电脑上评审并验收`、空态与未配对态、深色跟随系统、页脚一句立场。

问题：
1. 44pt（§2.5）。
2. 离线态（§2.5）。
3. 没有 snooze；桌面有、手机没有，而手机恰恰是"现在不想处理"最常发生的地方。
4. 待验收行 `G-0001` 挂在右侧 mono text-3，运行行右侧是 `暂停` 按钮——同一列两种东西；待验收行把 ID 放进第二行 `@ed3597c · G-0001 · 回到电脑上…`，右侧留空。
5. `question.code` 16px 等宽的 `test (ubuntu-latest, node 22)` 在 390 宽下占满一行 [80]，比桌面更重；手机上 15px。
6. 没有"最后更新"的相对时间，只有绝对 `03:05`；失焦回来后 `更新于 03:05` 可能已是 20 分钟前，加 `· 20 分钟前` 或超过 60 秒时变 text-1。

### 3.9 欢迎 / 启动失败 / 空态 [08][09][11][15][19b]

做对了：字标三处；右栏与字标同线；启动失败页 `TOWER` + 错误块 + `Retry` + 三条规则 [15]。

问题：
1. 欢迎页 Pi 问题下的 `Tower 用 Pi 作为 Agent 引擎。` 在 engine=claude-code 时过时（代码里有 Claude 检查行，但这句仍在 Pi 行下）。
2. `24vh` 上限（§3.2）。

### 3.10 命令面板、快捷键表、Toast [59][22b]

做对了：`N / ⌘N`、`Esc / ⌘[`；评审表新增 `U`、`⌘P`；`已收起，04:02 再提醒 · 现在显示`。

问题：
1. 快捷键表里 `撤销当前区块 U` 在不可编辑的评审里也会列出（注册表按页面注册，不按 `editable()`）——状态条已经按 `editable()` 隐藏了，表应一致。

---

## 4. 距离 95 分还差什么：Top 30

影响：H = 主画面可见破损或原则级；M = 单屏明显；L = 细节。量：S < 半天，M ≈ 1 天。预期：完成第 1–10 项后 D6–D9 约 90–92；完成第 1–20 项后约 92–94；最后 10 项把它推向 95。

| # | 改动 | 文件 | 预期效果 | 影响/量 |
|---|---|---|---|---|
| 1 | `.g-id` 子项 `flex: 0 0 auto`，项目名 `min-width: 3.5em`，引擎标签最先让位并缩为 `CC / Pi` 字标 | `app.css .g-id`、`GoalRow.tsx:82-86` | 航班牌身份列不再 `s…`、不再重叠 | H / S |
| 2 | 已暂停页：`重新验证` 区块只在验证过的目标出现；`撤销回退` 进运行行；有卡时头部同义按钮降 ghost；文案分 paused / in_review 两句 | `GoalPage.tsx:450-465,335-380`、`zh-CN.ts goal.editedNeedsVerify` | 一页一个主按钮，句子不撒谎 | H / S |
| 3 | 来源边栏 kind 列 `minmax(6.5em, 9em)` + 省略号；英文 `Agent's summary` → `Summary` | `Honesty.tsx Claim`、`app.css .claim-kind`、`en.ts goal.submitSummary` | 不再 `Agent's summa` | H / S |
| 4 | 看图条进 `criterion-row` 网格第 3 列；缩略图 `object-fit: contain` + inset 底 | `Look.tsx:39`、`app.css .look-strip/.look-img` | 缩略图与标题同列 | M / S |
| 5 | 手机页 44pt：`.btn 44 / .row .btn 40 / textarea 44 / .row 52` | `remote.html:82,88,98,108` | 手机可按 | M / S |
| 6 | 手机页离线：隐藏原始错误、加 `重试`、状态行 `· 每 5 秒`；`更新于` 超 60s 变 text-1 | `remote.html:263-266` | 离线态可行动、中文干净 | M / S |
| 7 | 引擎命名统一为 `引擎`；提示仅 Claude Code 时显示；`引擎默认` → `{engine} 默认` | `Settings.tsx:212`、`ContractEditor.tsx:352`、`GoalPage.tsx ContractRail`、`zh-CN.ts/en.ts common.engineDefault, contract.agent` | 一个概念一个名字 | M / S |
| 8 | 预算行两行固定（花费行 / 时间行），不靠换行 | `GoalPage.tsx BudgetMeter`、`app.css .budget-line` | 没有领头 `·` | L / S |
| 9 | 收件箱页脚 `已收起 n（HH:MM）` 可展开；snooze 绑 `h` | `Inbox.tsx:97-110`、`DecisionCard.tsx snoozeMenu`、`keys` | 收起的卡有去处、有键 | M / S |
| 10 | 评审侧栏合并：单元作为树的分组节点 | `Review.tsx:425-445`、`app.css .tree/.unit` | 一份文件列表 | M / M |
| 11 | 建议块 `bg-inset + 2px st-verified 左线`，去掉绿底叠琥珀 | `app.css .suggestion` | 批注里一层底色 | L / S |
| 12 | 就地编辑 textarea 焦点用 `border-color` 不用 outline；编辑中禁用 `已看` | `app.css .file-editor-text:focus`、`FileDiff.tsx:150-160` | 编辑态安静 | L / S |
| 13 | 目标页 CI 卡条头不重复 PR 行 | `DecisionCard.tsx:165` | 一屏一次 | L / S |
| 14 | 无响应态实况行右侧显示 `最后动静 1h 40m 前`；年龄列 <3h 用 duration | `Live.tsx`、`GoalRow.tsx:25`、`format.ts ago` | 三个时间一个量纲 | L / S |
| 15 | 比较面板键盘：`1/2` 切模式、`← →` ±5%、按住空格看改动前 | `Look.tsx LookCompare` | 看图可用键盘 | M / S |
| 16 | 比较面板加 `差异` 模式（`mix-blend-mode: difference`）与 `交换` | `Look.tsx`、`app.css .look-onion` | 看出一像素偏移 | L / S |
| 17 | 手机块链接改键值 `Tailscale / 局域网 + 主机:端口 + ⧉`；端口未开启时禁用 | `Settings.tsx:371-391` | 两条链接可分辨 | L / S |
| 18 | `+ 看起来对` → `+ 外观`（EN `Screenshot`）；look 标题占位 `这个页面应该看起来怎样`；超时单位 `秒内可访问` | `zh-CN.ts/en.ts contract.addLook, criterionTitle`、`ContractEditor.tsx:208-219` | 标准种类名是名词 | L / S |
| 19 | 手机页加 snooze（铃铛 → 两项 action sheet） | `remote.html render()`、`/api/snooze` | 手机也能"稍后" | M / S |
| 20 | 建议块 `white-space: pre; overflow-x: auto`（1100 不拆词） | `app.css .suggestion` | 代码不折行 | L / S |
| 21 | 1100 下引擎标签不随身份列消失：进实况列徽章前缀 `CC · 执行` 或 H1 `title` | `GoalRow.tsx`、`app.css @media(max-width:1240px)` | 窄窗仍知道是谁在跑 | M / S |
| 22 | 侧栏 `已验收 · 已结束` 默认折叠 | `Sidebar.tsx endedOpen` | 12 目标侧栏不触底 | L / S |
| 23 | 收件箱 / 轨迹按 `(goal, kind, subject)` 去重；监督器修暂停事件重发 | `store.ts`、`tower-supervisor run.rs` | 不出现两张一样的卡 | M / S |
| 24 | 验证读数面板里看图条 72px 或折叠为 `查看截图 ›` | `panels.tsx:108`、`app.css .verify-item .look-img` | 面板不被截图撑爆 | L / S |
| 25 | 手机页待验收行：ID 进第二行，右侧留空；`question.code` 15px | `remote.html:235,75` | 一列一种东西 | L / S |
| 26 | 快捷键表按 `editable()` 隐藏 `U` | `Review.tsx:270`（`when`）或 `ShortcutSheet` 过滤 | 表与状态条一致 | L / S |
| 27 | 账本被推翻行的 kind 标签降 text-4 | `GoalPage.tsx LedgerRow`、`Honesty.tsx Claim` | 推翻的说法不与成立的同重 | L / S |
| 28 | 空态海报 `margin-top: clamp(120px, 24vh, 280px)` | `app.css .empty-poster` | 大屏不漂 | L / S |
| 29 | 欢迎页 Pi 行的 `Tower 用 Pi 作为 Agent 引擎。` 按引擎切换 | `Welcome.tsx:170-190` | 不过时 | L / S |
| 30 | 编辑器 `.editor-main { padding-bottom: 56px }`；look 超时与命令超时分列 | `app.css .editor-main` | sticky 条不遮提示 | L / S |

---

## 5. 与主流 harness GUI 的对比

对照对象与时间点（2026 年 2 月—10 月）：OpenAI Codex 桌面应用（2026-02-02 macOS，线程 + worktree + 右侧 diff 面板；05-14 ChatGPT 移动端 "Codex" 标签，二维码配对，手机上可批准动作、在 diff 上点行加评论；07-09 并入 ChatGPT 桌面，diff 内联编辑、PR 评审侧栏）[^codex1][^codex2][^codex3]；Claude Code 桌面（2026-04-14 围绕并行会话重建：会话侧栏按状态过滤、拖放面板、diff 点行评论 ⌘⏎、CI 状态栏；10-14 新会话页 + 保存的环境 + 嵌套子会话 + "需要你"标记；Remote Control：`/rc` 出二维码，手机上答权限）[^cc1][^cc2][^cc3][^cc4]；Conductor（03-24 侧栏显示每个工作区的 GitHub 状态；09-02 "在 diff 里直接编辑文件"；10-02 iOS 应用；10-23 Remote control，可自定义快捷键）[^cond1][^cond2][^cond3]；Cursor 3（04-02 Agents Window；06-29 iOS 公测，"只看与评审"，Live Activities；10-06 Remote control for local agents，桌面侧批准配对）[^cur1][^cur2][^cur3]；Linear（03-12 UI 刷新；09-03 优先收件箱，snooze 仍是 `H`；10-08 Diffs 里堆叠 PR 一行可折叠、Agent 会话中 diff 实时更新；10-22 Esc 先清搜索再关闭、`⌘⏎` 勾选清单项）[^lin1][^lin2][^lin3][^lin4]；Raycast 2.0（08-25 GA，"每个像素都是新的"，Liquid Glass 克制，Compact 窗口）[^ray1][^ray2]；Things 3.22–3.24（Liquid Glass；OS 27 "调低了玻璃"；更宽的提醒 snooze 间隔）[^things1][^things2]；Zed（04-22 Parallel Agents：线程侧栏按项目分组、未读蓝点、完成通知；Agent Panel 的 Review Changes 多缓冲区按 hunk keep/reject）[^zed1][^zed2]；GitHub PR（01-22 新 Files changed 默认：可调宽文件树、每文件评论指示；03-19 停靠面板；10-22 跨 PR 的空白偏好、拆分视图新建 / 删除文件跨两列；`Viewed` 文件改动后自动清除）[^gh1][^gh2][^gh3][^gh4]。

### 5.1 Tower 落后的地方

| 方面 | 它们 | Tower | 差距性质 |
|---|---|---|---|
| 手机端 | Codex / Claude Code / Cursor / Conductor 全部在 2026 年 5–10 月上了手机：二维码配对、批准、**在 diff 上评论**（Codex 6 月、Cursor iOS）、Live Activities / 推送（Cursor） | 一页 HTML：需要你 / 待验收 / 运行中，批准与暂停，**评审留在电脑上** | 立场正确（手机不评审），但 44pt、离线态、snooze、推送都还没到"产品"——这是本轮扣 D8 最多的地方 |
| 评审器 | GitHub `Viewed` 在文件改动后自动清除；Codex / Conductor diff 内联编辑；Zed 按 hunk keep / reject；Linear diff 实时更新 | 文件树 + ⌘P + 就地编辑 + 建议块 + 撤销 hunk + 已看按内容哈希（改动即失效，与 GitHub 同） | 功能面已追平；差的是"接受这个 hunk"（Tower 只有反向的撤销）与单元 / 树两套列表 |
| 窄窗与面板 | Claude Code 拖放面板、Cursor 平铺；Conductor 可自定义快捷键 | 固定三区，1100 全部可用（本轮确认） | 选择而非缺陷；但快捷键不可自定义 |
| 材质 | Raycast 2.0 / Things 3.22 玻璃；Apple 在 OS 27 调低透明度；Linear 暖灰减线 | 平面 hue 70 暖灰、发丝线 | 方向与 Linear 一致；没有必要追玻璃 |
| 会话 / 环境 | Claude Code 10-14 的"保存的环境"、嵌套子会话；Zed 线程按项目分组 + 未读点 | 项目 = 仓库，目标 = 合同；无子目标 | 不同模型；Tower 的"目标"比"会话"更稳，但没有"从这个目标派生一个"的动作 |

### 5.2 Tower 独有且应该坚持的地方

1. **主画面仍不是对话流。** 2026 年所有竞品的主画面都收敛成"线程侧栏 + 聊天 + diff"；Tower 是航班牌 + 决策卡。本轮 `验证中` 组、`已运行 1h 49m`、`◻ 无响应` 让这块牌更像仪表，不像列表。
2. **诚实语法扩到了新面。** "依赖被改的测试"是 2026 年没有任何竞品 UI 层会说的一句话：它测量了"恢复原测试后是否仍通过"，把结果写进账本（`✕ 矛盾`）并解释"这不是红 → 绿"。看图标准也守住了"由你勾选"——截图是证据，不是判定。
3. **沉默 ≠ 死机 ≠ 错误。** 三态心跳 + 空心方框 + 徽章降级，比 Zed 的蓝点、Cursor 的推送更细：它区分"工具在跑 3 分钟"与"两分钟没有任何事件"。
4. **手机页的立场。** "这里只有需要你的事；评审留在电脑上"——Codex 与 Cursor 把评审搬到手机上，Tower 明确不搬。立场可以坚持，工艺（44pt、离线、snooze）必须补齐。
5. **键盘注册表与中文。** `?` 表从注册表生成、`N / ⌘N` 别名、`⇧R` 队列、`U` 撤销、`⌘P`；中文不是译文。竞品仍全部英文优先。
6. **安全决定写成人话并给出口。** 依赖变更卡：散文 + 机器尾巴 + `◇ 这是一个安全决定…` + `打开改动 ›`；手机上同一张卡少了"打开改动"，但多了一句"验证的准备命令会在沙箱里联网一次"——两端都诚实。

### 5.3 一句话定位

与 Codex / Claude Code / Conductor / Cursor 相比，Tower 在"手机端成熟度、面板灵活性、按 hunk 接受"上落后半步到一步，在"信息架构的原创性、诚实语法、沉默语义、键盘与中文"上领先一代。r3 的一致性收口已经完成；本轮暴露的是**新面接旧骨架的接缝**——一个 149.5px 的列、三个主按钮、一个 6.5em 的标签、40px 的错列、34px 的按钮。这些都是 S 量级；做完它们，Tower 的桌面端可以放到 Linear 旁边，手机页可以放到 Things 旁边。

---

## 6. 附：本轮截图清单（`/tmp/audit-r4-design/`，未入库）

| 编号 | 内容 |
|---|---|
| 01–04 | 概览（fx-rich，运行中新鲜）：深中 1440、浅英 1440、深中 1100、浅中 1100 |
| 05–07 | 概览 12 目标（`--many`）：深中、浅英、深中 1100 |
| 08–09 | 空概览海报：深中、浅英 |
| 10, 10b | 概览无响应态（`--silent`）：深中、浅英 |
| 11–13 | 欢迎：深中、浅英、深英 1100 |
| 14–15 | 启动失败：深中、浅英 |
| 16–19b | 需要你：深中、浅英、深中 1100、空（深中 / 浅英） |
| 20–22b | 需要你（fx-extra：CI 失败 + 依赖变更）：深中、浅英、深中 1100；稍后提醒后的 toast |
| 23–25b | G-0002 运行中（Claude Code）：深中、浅英、深中 1100、1100 全页（右栏两列） |
| 26–27 | G-0004 已暂停 + 可撤销回退：深中、浅英 |
| 28–30 | G-0001 待验收 + 看图标准：深中、深中全页、浅英、深中 1100 |
| 31–32 | G-0003 依赖被改的测试：深中、深中全页、浅英 1100 |
| 33 | G-0004 依赖变更卡（fx-extra） |
| 34, 34b | G-0001 CI 失败卡 + PR + 缺一侧截图（fx-extra）：浅英、深中 |
| 35 | G-0002 无响应 + 超时 |
| 36–37b | 轨迹：G-0002 深中 / 浅英、G-0003 深中 |
| 38–40 | 看图比较面板：并排深中、并排浅英、叠加深中 |
| 40b–40c | 缺一侧截图全页；目标页快捷键表 |
| 41–43 | 评审 G-0003 三文件 + 树 + 建议块：深中、浅英、深中 1100 |
| 44, 44b | 并排：深中、浅英 |
| 45–46 | ⌘P：深中空、浅英 `money` |
| 47, 47b | 就地编辑：深中、浅英 |
| 48–49 | 评审 G-0001 单文件：深中、浅英 |
| 50–51 | 验证读数：G-0003 深中、G-0001 浅英（含看图条） |
| 52–53b | 验收面板：G-0001 深中 / 浅英（看图条 + 待你勾选）、G-0003 深中 |
| 54–55 | 要求修改（含 `· 建议`）：深中、浅英 |
| 56–57 | 评审队列 `队列 1 / 2`：深中、浅英 |
| 58 | 评审 G-0002 没有改动 |
| 59–60 | 快捷键表：评审深中、需要你浅英 |
| 61–67c | 合同编辑器：深中、浅英、深英 1100、浅中 1100、look 行深中 / 浅英、1100 全页 |
| 68–74b | 设置：深中、浅英、深英 1100、浅中 1100、项目块与手机块滚动截图（68b/c、69b/c、70b、71b）、fx-extra（base 测试失败、局域网警告）、fx（未检查过）、输出展开 |
| 75–77 | 命令面板深中、浅英 `rev`；G-0002 浅中 1100 |
| 80–89 | 手机页：中浅、中深、英浅、英深、中浅全页、空态、离线、未配对、按两次 armed、430 宽英深 |
| e1–e4 | `--eval` 取证用图（身份列盒模型、看图条坐标、主按钮计数） |
| real-overview.png | `tools/screenshot.sh` 实机抓取（锁屏，黑窗，仅作记录） |

[^codex1]: OpenAI Developers, "Worktrees in the Codex app", https://developers.openai.com/codex/app/worktrees
[^codex2]: OpenAI Help Center, "ChatGPT — Release Notes"（Codex 并入桌面、diff 内联编辑、PR 评审侧栏），https://help.openai.com/en/articles/6825453-chatgpt-release-notes
[^codex3]: Every, "Codex Vibe Check"（独立评测：diff 侧栏是设计亮点），https://every.to/vibe-check/codex-vibe-check
[^cc1]: Anthropic, "Redesigning Claude Code on desktop for parallel agents"（2026-04-14），https://claude.com/blog/claude-code-desktop-redesign
[^cc2]: MacRumors, "Anthropic Rebuilds Claude Code Desktop App Around Parallel Sessions"（2026-04-15），https://www.macrumors.com/2026/04/15/anthropic-rebuilds-claude-code-desktop-app/
[^cc3]: Claude Code Docs, "Remote Control", https://code.claude.com/docs/en/remote-control
[^cc4]: @ClaudeDevs（2026-10-14 新会话页、保存的环境、嵌套子会话），https://x.com/ClaudeDevs/status/2110445844675838148
[^cond1]: Conductor Changelog 0.44.0, "New sidebar, rebuilt composer", https://www.conductor.build/changelog/0.44.0-new-sidebar-rebuilt-composer-codex-checkpoints
[^cond2]: Conductor Changelog（0.83–0.92：diff 内编辑、iOS、Remote control、自定义快捷键），https://www.conductor.build/changelog
[^cond3]: The New Stack, "A Hands-On Review of Conductor", https://thenewstack.io/a-hands-on-review-of-conductor-an-ai-parallel-runner-app/
[^cur1]: Cursor Changelog 3.1, https://cursor.com/changelog/3-1
[^cur2]: Cursor Docs, "Mobile app"（iOS：只看与评审、Live Activities），https://prod.cursor.com/help/ai-features/mobile-app
[^cur3]: Cursor Changelog, "Remote control for local agents"（2026-10-06），https://cursor.com/changelog/remote-control-local-agents
[^lin1]: Linear Changelog, "UI refresh"（2026-03-12），https://linear.app/changelog/2026-03-12-ui-refresh
[^lin2]: Linear Docs, "Inbox"（snooze `H`），https://linear.app/docs/inbox
[^lin3]: Linear Changelog, "Stacked pull requests"（2026-10-08），https://linear.app/changelog/2026-10-08-stacked-pull-requests
[^lin4]: Linear Changelog（2026-10-22：Esc 两段、`⌘⏎` 清单），https://linear.app/changelog/2026-10-22-slack-and-github-loops
[^ray1]: Raycast, "The New Raycast", https://www.raycast.com/blog/the-new-raycast
[^ray2]: Raycast Changelog macOS 2.0, https://www.raycast.com/changelog/macos/2-0
[^things1]: Cultured Code, "Things for OS 26"（2025-09-15），https://culturedcode.com/things/blog/2025/09/things-for-os-26/
[^things2]: MacRumors, "Things 3 Updated for iOS 27"（2026-09-14），https://www.macrumors.com/2026/09/14/things-3-updated-for-ios-27/
[^zed1]: Zed, "Parallel Agents"（2026-04-22），https://zed.dev/blog/parallel-agents
[^zed2]: Zed Docs, "Agent Panel"（Review Changes，keep / reject），https://zed.dev/docs/ai/agent-panel
[^gh1]: GitHub Changelog, "Improved pull request Files changed page on by default"（2026-01-22），https://github.blog/changelog/2026-01-22-improved-pull-request-files-changed-page-on-by-default/
[^gh2]: GitHub Changelog, "View code and comments side by side"（2026-03-19），https://github.blog/changelog/2026-03-19-view-code-and-comments-side-by-side-in-pull-request-files-changed-page/
[^gh3]: GitHub Changelog, "Saved whitespace preferences and improved split view"（2026-10-22），https://github.blog/changelog/2026-10-22-pull-requests-saved-whitespace-preferences-and-improved-split-view/
[^gh4]: GitHub Docs, "Reviewing proposed changes in a pull request"（Viewed、suggestion），https://docs.github.com/en/pull-requests/how-tos/review-pull-requests/reviewing-proposed-changes-in-a-pull-request
