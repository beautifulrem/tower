# Tower 设计审计 r1（视觉与交互）

> 日期：2026-10-26。审计人：Fable（产品设计视角：Linear / Raycast / Things / Teenage Engineering / Apple HIG 的标准）。
> 范围：`apps/desktop/src`（`styles/tokens.css`、`base.css`、`app.css`、`components/`、`views/`）与 `docs/reviews/product/r1/*.png` 13 张截图，另在本机 dev 构建上补拍 6 张（命令面板、运行中的目标页、观察面板、验收面板、要求修改面板、带 ⋯ 菜单的目标页；临时文件在 `/tmp/audit-shots/`，未入库）。
> 判准只有一个：**顶级设计团队会不会原样发布。** 结论：不会原样发布，但骨架是对的——距离“可发布”大约两个专注的迭代，而不是一次重做。
>
> 说明：
> - 本文只审视觉与交互，不改代码；文案正处于中英 i18n 迁移中，凡涉及字符串的只给方向。
> - `10-goal-real-model.png` 被另一个窗口（终端）整幅遮住、`02-goal-rework.png` 顶部被一条通知遮住；`/tmp/tower-live/home` 为空，无法补拍真实模型目标。本文对真实数据形态的判断来自 demo 引擎 G-0002（第 14–15 次运行、5 条重复“原因”说法、14 行运行记录）。
> - 上一轮美学研究（`research/ui-aesthetics-2026.md` §9）的 20 项已基本落地：紫色强调色、shadcn 光晕、手形光标、10px 圆角、spinner、原生 `<select>`、全页琥珀都已消失。本文从这个新基线出发，不重复那 20 项。

---

## 0. 总评

Tower 现在的样子：**一个克制、灰度正确、原则清晰、但“手写感”还不够的仪表盘。** 它不再像 AI 生成的网页，但也还没有变成“一眼认出是 Tower”的产品。

三件做对了、而且在同类里独有的事（都来自规范，不要动）：
1. 五色纪律与“绿色只属于验证器”在所有 19 张截图里没有一次破例（唯一存疑处见 §3.7 欢迎页）。
2. 诚实语法（事实 / 观测 / 说法 / 人）已经是看得见的版面结构：`┆ Agent 称` 悬挂标签列、`⚙ @a4a90b2` 事实后缀、虚线观测框。
3. 生命周期字形（`○ ◎ ◐ ‖ △ ◭ ▲ ◬ ● ◍ ◉`）是一套真正自绘的 10px / 1.25px 字形，灰度下可辨。这是全产品最有识别度的资产。

三件最伤品质的事（本文的主线）：
1. **层级是平的。** 区块标题 14px/500/text-2 比正文 13px/text-1 更暗，说法标签 text-3、说法正文 text-2、事实后缀 text-2、meta text-2——目标页通篇是三种相近的灰，眼睛没有落点。规范把“必读小字一律 text-2”执行得过于彻底，结果是什么都必读、什么都不突出。
2. **仪表没有对齐成列。** 验收标准行右侧的 `⚙ 通过 · 708ms @a4a90b2 · 21 分钟前` 是一串右对齐的拼接文本，各行长度不同，左缘参差。规范说“层级靠字号、字重与灰阶”，但一个驾驶舱的可读性首先靠**列**：结果、耗时、来源、时间各占固定宽度，上下对齐。现在没有一处做到。
3. **字形体系只做了一半。** 生命周期字形是 SVG，而导航与动作图标全是 Unicode 文字（全角 `＋`、`▦`、`⋯`、`←`、`›`、`▸`、`↳`、`⚙` U+2699、`✓ ✕ ⟲ ○✓ ⚠`）。它们来自三种不同字体（PingFang、Inter、Apple Symbols），笔画粗细与基线互不一致，`⚙` 和 `○✓` 在 11px 下发糊。这是现在最明显的“没画完”。

其余要害：动效几乎为零（规范里唯一的信号动效——进入“需要你”的 700ms 琥珀衰减——没有实现；而键盘打开的命令面板却有 160ms 动画，正好反了）；目标页标题栏与 H1 重复、实况行与决策卡条头重复；真实数据下“原因”区块出现 5 条一字不差的说法、“运行”区块 14 行 `继续 · 被中断`，页面没有任何去重与折叠；`confirm()` 弹出的是 WebKit 通用对话框；自绘 10px 滚动条仍在。

---

## 1. 维度评分（0–100）

| # | 维度 | 分 | 理由（一句话） |
|---|---|---|---|
| 1 | 视觉美学与原创性（无“AI 味”） | **66** | 已没有紫色、光晕、渐变卡片、星光图标；暖灰、6px 圆角、反色主按钮、琥珀条头都像是有人选过的。但整体仍是“Inter + JetBrains Mono + 1px 6% 边框卡片”的 2025 开发工具标准像，识别度全靠 10px 字形撑着。 |
| 2 | 排版（拉丁 + CJK） | **70** | 基础正确：13/20 固定行高、单行 `halt` 标点挤压、tnum、mono 只包机器值、字重只用 400/500。问题：层级倒置（区块标题比正文暗）；行内 mono 0.923em 与汉字并排时显得“码比字小一号且更淡”；`G-0003` 这类关键交叉引用用 text-3 11.5px（Lc≈53，低于规范对必读小字的 75 要求）。 |
| 3 | 颜色与对比 | **78** | 五色纪律执行到位，APCA 达标，浅色主题令牌独立调过。扣分：`--st-active` 蓝灰在 10px 的 `◐` 上与中性灰几乎不可分；分段条“未运行”段用 `bg-selected` 填充在深色下几乎看不见；`result-pass` 绿被环境检查复用（§3.7）。 |
| 4 | 布局与信息层级 | **60** | 目标页“头部副标题 / 实况行 / 决策卡条头”三处说同一件事；标题栏与 H1 同文；概览每个分组各自成网格，4 个目标占 3 行、右侧 60% 空白；欢迎页锚在左 6vw、右侧全空。 |
| 5 | 密度与节奏 | **64** | 卡片 5×20px 网格是好节奏。目标页一列里混着 28px（标准行）、26px（说法）、24px（运行行）三种行高；区块上下 12px 与标题 24px 之间没有可感的“段落呼吸”；评审页 280px 单元栏只装一个条目。 |
| 6 | 组件工艺 | **62** | 按钮里的 `kbd` 是一块灰底，使 `评审 R` 看起来像分段按钮；卡片内的输入框用更暗的 `bg-inset` 形成“洞”；轨迹筛选是全产品唯一的胶囊（radius 11）；预算条软上限刻度 1×9px 几乎不可见；犯规式的 JS `confirm()` ×4。好的：自绘弹出式 `Select`、自动增高的 textarea、焦点环 1.5px。 |
| 7 | 动效与反馈 | **45** | 只有浮层 fade 100ms / lift 160ms 与悬停退出 150ms。规范唯一的信号动效（700ms 琥珀衰减）未实现；字形交叉淡入未实现；进入评审的 220ms 空间切换未实现；回答决策卡后卡片瞬间消失、无任何确认；而键盘触发的命令面板却有动画（规范要求 0ms）。“安静”不等于“没有反馈”。 |
| 8 | macOS 原生感 | **72** | 原生菜单栏、原生弹出菜单、默认光标、非活动窗口变淡、Overlay 标题栏 52px、交通灯对齐、无 spinner——这些都在。扣分：`confirm()`、自绘常驻滚动条、`←` 文字返回键、设置页里的“保存”按钮式表单、评审页没有可见的返回入口。 |
| 9 | 图标与字形 | **58** | 生命周期字形 90 分；其余图标 30 分（见总评第 3 条）。两套混在同一行里（侧栏 `＋ 新目标` 与 `◆ 需要你`），笔画粗细差一倍。 |
| 10 | 空 / 加载 / 错误状态 | **55** | 空状态“一行文字在内容出现处”策略对，但视觉上与 meta 无法区分；加载是“加载中…”纯文字；真实数据下的退化形态（重复说法、长运行表）没有设计；没有引擎断连的页面级状态，只有侧栏底部一行。 |
| 11 | 浅色主题质量 | **68** | 是认真的令牌反转而非偷懒：白卡在 0.992 底上靠 11% 边框分层、diff 底色 10%、黑色主按钮，都成立。不足：`--attention-bg` 0.965/0.030/75 发桃色；边框 11% 在白底上偏弱，标题栏下的分隔几乎消失；mono 在白底上显得更细更浅。 |
| 12 | 品牌性格 / 记忆点 | **52** | 诚实语法与字形链是同类里没有的（`research/harness-gui-landscape-2026.md` §6 也这么判断），但它们都只有 10–11px，没有一处被放大成“海报级”的身份。标题栏、命令面板、欢迎页都是通用形态。最被记住的元素是琥珀条头——这还不够。 |
| | **综合** | **63** | |

---

## 2. 全局问题与修法

### 2.1 层级：把“三种灰”拉开

现状（`app.css`）：`.section-title` 14/500 **text-2**；正文 13 text-1；`.claim-label` 11 text-3；`.claim-text` 13 text-2；`.meta` 12 text-2；`.fact` 12 text-2。目标页上 70% 的字是 text-2。

修法（需要同步修改规范 §12.3.2 的 `title-section` 一行）：

```css
.section { padding: var(--sp-5) 0 var(--sp-3); }            /* 20 / 12，原 12 / 12 */
.section-title { font-size: 13px; line-height: 20px; font-weight: 500; color: var(--text-1); letter-spacing: var(--tr-13); }
.section-head { margin-bottom: var(--sp-2); min-height: 20px; }
.claim { grid-template-columns: 6em minmax(0, 1fr) auto; padding: 2px 0; }   /* 原 7.5em，3px */
.claim-label { color: var(--text-3); }                      /* 保持 */
.claim-kind { display: none; }                               /* 种类并入标签列，见下 */
.meta { color: var(--text-2); }                              /* 保持 */
.rail-dl dt, .kv dt { color: var(--text-3); }                /* 字段名是“非必读”的标签，退一级 */
```

说法标签列改为两段：`┆ Agent 称` 固定 + 种类词同列第二行或同行以 `·` 连接（`┆ Agent 称 · 原因`），正文从第二列起。这样页面只剩三个清楚的层：**text-1 的标题与事实数值、text-2 的说法与 meta、text-3 的标签与来源**。

### 2.2 仪表列：把右侧的“读数”对成列

现状：`CriterionRow`、`LedgerRow`、改动行、评审头部、验收面板里的事实后缀都是 `flex` + `grow` 把一串 `FactChip` 推到右边。各行长度不同，左缘参差，耗时与哈希上下不对齐。

修法（`app.css` + `GoalPage.tsx` `CriterionRow`）：

```
验收标准                                          ▰▰  已验证 2/2 · 观测 1/2
✓  C1  购物车测试全部通过   npm test            通过    708ms  ⚙ @a4a90b2   21 分钟前
   ○✓                                              观测 · 通过                 21 分钟前
✓  C2  总价计算的单元测试   node --test …       通过    389ms  ⚙ @a4a90b2   21 分钟前
☐  C3  在结账页手动核对一次总价                                              待你勾选
```

```css
.criterion-row {
  display: grid;
  grid-template-columns: 14px 2.5em minmax(0, 1fr) 3em 6ch 9ch 7em;
  column-gap: var(--sp-2);
  align-items: center;
  min-height: 28px;
}
.criterion-row .col-result { color: var(--text-1); }
.criterion-row .col-dur    { font-family: var(--font-mono); font-size: 12px; font-feature-settings: var(--font-features-num); text-align: right; color: var(--text-2); }
.criterion-row .col-pin    { font-family: var(--font-mono); font-size: 12px; color: var(--text-2); }
.criterion-row .col-age    { font-size: 12px; text-align: right; color: var(--text-2); }
```

同一套列规格用于：账本行（`一致 · 2 条事实` 落在固定 7em 列）、改动首行、评审头部统计、验收面板首行、轨迹里的 `criterion_result` 行。**这是 Tower 应该拥有、而任何聊天式 Agent GUI 都没有的版面：每一行事实都像仪表读数一样落在同一列。**

### 2.3 字形体系：一支笔画完所有图标

现状（文件与字符）：`Sidebar.tsx` `＋`（U+FF0B 全角）、`▦`；`Chrome.tsx` `←`、`›`；`Overview.tsx` `›`；`GoalPage.tsx` `⋯`、`↳`；`Trace.tsx` `▸ ▾`；`Honesty.tsx` `⚙`；`Glyph.tsx` `ResultMark` 用文字 `✓ ✕ ⟲ ○✓ ○✕ ⚠ ·`。

修法：在 `Glyph.tsx` 增加 `Icon` 组件（12px 与 16px 两档，viewBox 12，`stroke-width 1.25`，方端，`currentColor`），自绘以下字形并替换所有 Unicode 图标：`plus`、`grid`（概览，2×2 方块）、`inbox`（直接复用 ◆ / ◇）、`chevron-left`、`chevron-right`、`ellipsis`（三点，与 `·` 同径）、`search`、`harness`（方框内一条刻度线，取代 `⚙`，规范 §12.9 已定义）、`check`、`cross`、`stale`（⟲）、`obs-check`（空心圆内勾）、`warn`、`caret-down/right`、`return`（↳）。`ResultMark` 改为 SVG，10px，与生命周期字形同一网格。

效果：侧栏三行、标题栏、命令面板、事实后缀、结果标记全部由同一套 1.25px 线条绘出。这是“TE 式自有字体”的完成态，成本约一天。

### 2.4 动效：实现规范里唯一的信号，删掉不该有的

| 变化 | 现状 | 应为（规范 §12.7） | 文件 |
|---|---|---|---|
| 新条目进入“需要你” | 无 | 条头 `background` 从 `oklch(0.80 0.15 75 / 0.24)` 衰减到 `--attention-bg`，700ms，一次 | `app.css` 新增 `@keyframes attn`；`DecisionCard.tsx` / `GoalCard.tsx` 对 `created_at > 挂载时刻` 的条目加 `data-new` |
| 命令面板打开（键盘） | `lift 160ms` | **0ms** | `app.css` `.palette { animation: none }`，`.overlay` 保留 fade 100ms 仅用于鼠标触发的面板 |
| 进入 / 退出评审 | 无 | 220ms View Transition（`document.startViewTransition`） | `lib/nav.ts` `go()` 对 `review` 路由包一层 |
| 生命周期字形变化 | 瞬时 | opacity 交叉淡入 100ms | `Glyph.tsx` 外层 `<span>` 加 `transition: opacity 100ms` 并在 state 变化时 key 切换 |
| 回答决策卡后 | 卡片瞬间消失 | 人触发的移除：高度 + 透明度 160ms ease-in（允许：由人引起） | `DecisionCard.tsx` 在 `send` 成功后加 `.leaving`，`app.css` |
| 按钮按下 | 仅背景变 `bg-selected` | 加 `transform: translateY(0.5px)` 或 opacity 0.85，100ms（Emil Kowalski：进出路径对称） | `app.css` `.btn:active` |
| toast 退出 | 无 | opacity 100ms ease-in | `app.css` |

### 2.5 其他全局

- **输入框在卡片里的“洞”**：`input, textarea { background: var(--bg-inset) }`（0.160）放在 `bg-raised`（0.205）的决策卡里比页面还暗。新增令牌 `--bg-field`：深色 `oklch(0.170 0.004 70)` 用于页面级输入；卡片内输入用 `background: var(--bg-app)` + `border: 1px solid var(--border)`。浅色两者都是白。
- **按钮内的键帽**：`.btn .kbd { background: transparent; padding: 0; margin-left: 2px; color: inherit; opacity: 0.55; }`，`.btn-primary .kbd { color: var(--bg-app); background: transparent; }`。键帽只在侧栏、命令面板和提示行保留底色。
- **胶囊**：`.pill { border-radius: var(--radius-s); height: 22px; padding: 0 8px; }`，与 4/6/10 的圆角分级一致；轨迹筛选改为“文字标签 + 选中底色”。
- **自绘滚动条**：删除 `base.css` 的 `::-webkit-scrollbar*`，让 WKWebView 使用系统叠加式滚动条（Raycast 的判准：用户会不会以为这是网页）。
- **`confirm()` ×4**（`GoalPage.tsx` 放弃 / 推送 / 删除工作区）：改为 `@tauri-apps/plugin-dialog` 的 `ask()`，得到带应用图标的原生 sheet；破坏性动作用 `kind: "warning"`。
- **渐变遮罩**：`.steer { background: linear-gradient(...) }` 改为 `background: var(--bg-app); border-top: 1px solid var(--border-subtle)`。
- **关键 ID 的可读性**：`GoalCard` 第 5 行、`goal-sub`、`decision-head`、`palette` 里的 `G-0003` 从 `t3` 提到 `t2`；`.code-val` 在 12px 容器里的 0.923em = 11.08px，改为 `font-size: max(0.923em, 11.5px)`。
- **浅色令牌微调**（`tokens.css`）：`--border: oklch(0.20 0.01 70 / 0.14)`、`--border-subtle: oklch(0.20 0.01 70 / 0.08)`、`--attention-bg: oklch(0.960 0.040 85)`（去桃色、偏向琥珀本色）、`--text-4: oklch(0.700 0.005 70)`（行号、禁用在白底上略深）。

---

## 3. 逐屏审计

### 3.1 标题栏（`Chrome.tsx` `TitleBar`，`.titlebar`）

问题：
1. 目标页上标题栏写 `清理购物车计算的边界情况`，52px 之下的 H1 再写一遍，浪费一整行最贵的位置。
2. 右侧 `运行 1/4 · 累计 $0.09` 是 12px text-2 的“小字”，但它是全局仪表（规范 §12.8 的 `StatusStrip`、上一轮研究 §1.16 的“生命迹象”应在这里），现在像页脚。
3. `搜索目标与命令 ⌘K` 是一个带边框的假输入框；`←` 是 22px 方块里的文字字符。
4. 标题栏与内容区之间只有 6% 发丝线，无任何材质差异，在浅色下几乎消失。

修法：

```
┌ ‹ shop › G-0003                                   ◐ 1/4 运行 · $0.09 · ● 引擎 2 秒前   ⌕ ┐
```

- 左：`chevron-left` 24×24 图标按钮；面包屑 12px text-2：项目名 › `G-0003`（mono）。目标名只留给 H1。概览 / 需要你 / 设置页保持写页面名（13/500 text-1）。
- 右：**仪表簇**固定宽度（`min-width: 20em`，tnum），从左到右：运行数（前置 `◐` st-active，仅 >0 时）、累计花费、引擎生命迹象（`●` text-3 + `引擎 · n 秒前`，断连时 `■` danger + text-1 `引擎无响应`）。侧栏底部那行随之删除（HIG：侧栏底部不放关键信息）。
- 搜索：26×26 的 `search` 图标按钮，tooltip `搜索目标与命令 ⌘K`；不画输入框。
- 评审页的自定义头部（`.review-head`）也要放回同一个返回键（现在只能按 Esc）。

### 3.2 侧栏（`Sidebar.tsx`，`.sidebar`）

做得好：232px、28px 行、分组 12px text-3、`◆` 行尾、非活动窗口变淡。

问题与修法：
1. 图标混用（见 §2.3）。`＋` 全角加号与 `▦` 在同一列里一个细一个粗。→ `Icon` 12px。
2. 顶部 `需要你 4` 与分组 `需要你 1`（新截图中 5 对 2）口径不同：前者计条目，后者计目标。→ 顶部行文字改“收件箱”（或在计数后加“项”），分组保留“需要你”。文案在 i18n 中，此处只给方向。
3. 分组之间 12px 太紧，分组标题 `padding: 6px 8px 2px` 使标题贴着上一组最后一行。→ `.side-group { margin-bottom: var(--sp-4) }`，`.side-group-title { padding: 8px 8px 2px }`。
4. 底部一行 `● 引擎正常 · Pi demo-engine` 是静态文字，“安静 = 正常”与“安静 = 死机”仍无法区分。→ 移入标题栏仪表簇（§3.1），带“n 秒前”。侧栏底部改为只剩 `设置 ⌘,` 的 28px 行，或干脆为空。
5. 选中行 `bg-selected` 0.265 与悬停 0.235 差 0.03，鼠标滑过时选中项与悬停项几乎同色。→ 选中行左侧加 2px `--text-2` 竖标（`box-shadow: inset 2px 0 0 var(--text-3)`），非活动窗口时去掉。

### 3.3 概览（`Overview.tsx`，`GoalCard.tsx`）

问题：
1. 顶部堆了四条不同样式的“条”：`◆ 下一件 …`（12px）、32px 快速输入、`自 21:01 起 · …  知道了`（带下边线）、分组标题。左缘分别在 264 / 278 / 264 px，视觉上像四个不同组件的试装。
2. 每个分组各自一个 `auto-fill` 网格：4 个目标占 3 行，每行右侧两格空白，页面下半空。
3. 卡片第 2 行 `执行    bash · npm test …`：模式徽章 `min-width: 3.4em` 造成“执行”后一个不解释的空洞；而“已暂停”行没有。
4. 分段条“未运行”段 `background: var(--bg-selected)`（0.265）在 0.205 的卡上几乎不可见（截图里 `▭▭` 淡得像污点）。
5. 第 5 行 `G-0003 · shop · 返工 1 / 3` 全是 text-3 11px mono/UI 混排；`G-0003` 是人用来相互指认目标的键，不该是最淡的字。
6. `$0.02 / $5` 与右列 `刚刚` 跨卡对齐靠 `space-between`，碰巧对齐而非设计对齐。

修法：
```
◆ 下一件 · G-0004 · Agent 停下了但没有提交                         自 21:01 起 · G-0002 运行中   知道了
› 在 shop 中，一句话描述你想要的结果…                                  ↵ 快速开始 · ⌥↵ 写合同

需要你 1 ───────────────────────────────────────────────────────────────────────────────
[card] [card] [card]
运行中 1 ───────────────────────────────────────────────────────────────────────────────
[card]
```
- 把“下一件”和“自 … 起”合并成一条 20px 的**今日条**（左“下一件”，右“简报”），统一左缘 264px；快速输入保持 32px，`›` 与上一行的 `◆` 同一 x。
- `board-group-title` 改为 12px/500 text-3 + 右侧延伸的 `--border-subtle` 发丝线（`display:flex; &::after{content:""; flex:1; border-top:1px solid var(--border-subtle); margin-left: 8px}`），间距 `margin: 16px 0 8px`。视觉上分组成为“刻度”而不是“标题”。
- 卡片：`.live-line { display: grid; grid-template-columns: 4em minmax(0,1fr) auto; }`——让徽章列成为**有意的列**，所有卡片的动作文字从同一 x 开始；徽章 text-1，动作 text-2。
- `.seg-empty { background: transparent; box-shadow: none; border: 1px dotted var(--border-strong); }`（规范 §12.10.1 本就是点线）。
- 第 3、4 行改 `grid-template-columns: 1fr auto`，右列 `min-width: 6ch; text-align: right`，花费与时间跨卡对齐。
- 第 5 行：`G-0003` text-2；项目名 text-3；`返工 1/3` text-2。
- 卡片 `border` 从 6% 提到 `--border`（10%）**或**去边框只留明度差（二选一，不要两者都弱）。建议：深色去边框 + `bg-raised`；浅色保留 14% 边框。

### 3.4 目标页（`GoalPage.tsx`，`.goal-*`、`.section`、`.criterion-*`、`.rail`）

问题：
1. 三处重复：标题栏标题 = H1；运行中时 `.annunciator` 实况行 `◆ 等你 问题 · Should the discount…` 紧贴下面决策卡条头 `◆ 问题 … Should the discount…`；副标题 `待验收` 与决策卡 `待验收` 再重复。
2. 真实数据退化：G-0002 的“原因”区块 5 条一字不差的 `┆ Agent 称 原因 · total() 把单价和数量相加了`；“运行”区块 14 行 `R-1x 继续 · 21:02 · 5s … 被中断`。页面没有去重、没有折叠、没有上限。
3. 层级平（§2.1）、仪表不成列（§2.2）。
4. 头部动作已收敛为“主按钮 + 次按钮 + ⋯”，好。但 `评审 R` 里的键帽是灰块，像分段按钮；`⋯` 是文字字符。
5. 预算条：3px 高、软上限刻度 1×9px text-2，几乎不可见；文字 `预算 $0.02 / 软 $5 · 硬 $8 · 墙钟 <1s / 软 90 分` 的 `/` 与 `·` 混用；而且它被放在“接下来”区块下面，语义不属于那里。
6. 观测行 `○✓ [观测 通过（Agent 环境，未计入已验证）· 刚刚]`：整句话装在虚线框里，像一个表单字段；而且比它所属的标准行还长。
7. 右栏 `Pi 默认` 用了 mono（汉字进等宽栈）；`dt` 用 text-2 与 `dd` 同亮。
8. 底部转向框 `position: sticky` + 渐变遮罩。

修法：
- 删除标题栏里的目标名（§3.1）。`annunciator` 在存在同一条目的决策卡时只显示模式徽章（`◆ 等你`）不显示对象；或直接隐藏，由决策卡条头承担。
- `GoalBlocks`：`causes()` 按 `text` 去重并保留最新 3 条，多余折叠为 `另有 n 条相同`；`runs` 默认显示最近 3 条 + `全部 15 次 ›`（展开后同一列表）。这是设计问题而不只是数据问题：**版面必须对重复与长尾有形状**。
- 头部副标题改为两段：左段身份（`G-0003 · shop · 合同 v1 · 第 2 次运行（返工 1/3）`，text-2），右段**验证印章**（§4.3）。`stateLabel` 不再在副标题里重复——H1 左边的字形与印章已经说明状态。
- 预算条移到右栏“引擎”块上方，改为：
  ```css
  .budget-bar { height: 4px; border-radius: 2px; background: var(--bg-selected); }
  .budget-soft { top: -3px; width: 1px; height: 10px; background: var(--text-1); }
  .budget-bar::after { content: ""; position: absolute; right: 0; top: -3px; width: 1px; height: 10px; background: var(--text-3); } /* 硬上限端刻度 */
  ```
  文字 `$0.02 · 软上限 $5 · 硬上限 $8`（`/` 统一为 `·`，i18n 方向）。
- 观测行：`○✓ 观测 · 通过 · 21 分钟前`，`（Agent 环境，未计入已验证）` 放进 `title` 悬停；虚线框只框 `观测` 两个字（`ObsChip` 的 children 不再包含整句）。
- 右栏：`dt` text-3；`dd` 中的 `Pi 默认` 去 mono（只有 `provider/model` 形式的值才 mono）；`.rail-dl { grid-template-columns: 4.5em 1fr }`。
- `.steer`：实色 + 上发丝线。
- 观察面板（`Trace.tsx`）：`run_ended`、`running → paused` 等原始事件名直接出现在界面上，应映射为字形 + 标签（`‖ 已暂停 ← 运行中 · 上次退出时仍在运行`）；筛选胶囊改标签（§2.5）；`Tower 注入 · 消息 ▸` 的 `▸` 改 `caret` 图标。

### 3.5 需要你（`Inbox.tsx`，`DecisionCard.tsx`，`.decision*`）

做得好：只有焦点卡亮条头，其余条头透明 + 下边线；种类前缀已从标题剥离；16px 问题句。

问题与修法：
1. 卡宽 1120px，问题句 16px 只占左 1/3，右 2/3 是空的琥珀条头与空白。→ `.inbox { max-width: 840px }`，与阅读宽度一致。
2. 列表只靠一句说明 `按紧急程度排序：阻塞运行的问题与审批在前，待验收在后` 来解释顺序。→ 用两个 12px text-3 的刻度式分组标题（§3.3 的样式）：`阻塞运行 2`、`待验收 2`，说明句删掉。
3. 两张 `待验收` 卡的正文都是通用句 `全部机器标准在干净环境中通过`，信息量为零。→ 正文改为一行事实读数：`▲ 已验证 @a4a90b2 · +1 −1 · 1 个文件 · 已验证 2/2 · 人工 0/1`，再接 `打开评审 R`。卡片因此有内容差异，用户不用点进去就知道大小。
4. 焦点卡按钮里的 `1` `2` 键帽灰块（§2.5）。
5. 卡片内 textarea 的“洞”（§2.5 `--bg-field`）。
6. 新条目到达时的 700ms 衰减（§2.4）。

### 3.6 评审（`Review.tsx`，`.review-*`、`.file`、`.diff`）

做得好：风险排序单元、`+/−` 槽、10% 底色、低彩度语法色、hunk 头 `bg-inset`、文件头 sticky、`已看` 复选、键盘提示。

问题与修法：
1. 头部 52px 塞两行（标题 14px 在 y=18、统计 12px 在 y=36），下行贴着底线。→ `.review-head { min-height: 56px; padding: 8px 16px 8px 24px }`，两行 20/16 + 4px 间距；统计行按 §2.2 拆成两组（改动规模 | 验证两轨），组间 24px。
2. 没有返回入口（只有 Esc）。→ 头部左侧 `chevron-left` 24px 按钮，与标题栏一致。
3. 单元列表项 `src/ … 2 行 / cart.js` 两行、两种字号（12 / 11.5）。→ 单行：`▪▪ src/cart.js            2 行`，mono 12，目录 text-2、文件名 text-1，风险方块在左 14px 槽。
4. 280px 单元栏只有一个条目时是浪费。→ `grid-template-columns: 240px 1fr`；单元数为 1 时折叠为头部的一行面包屑，`⌘\` 切换。
5. 左下角键盘提示换行成两行。→ 移到全宽 24px 底部状态条（text-3 11px，单行，省略号），或放进 `?` 快捷键表。
6. 行号 `text-4`（Lc≈31）是可点击的批注入口。→ `text-3`，悬停 text-1（已有）。
7. 验收面板里 `tower/g-0001-…` mono 片段插在中文句子里，在 600px 宽下独占一行断得很难看。→ 分支名单独一行 `分支  tower/g-0001-…`（mono，text-1），句子不嵌 mono。
8. `.file` 外框 6px、`bg-raised`：与卡片一致，好。文件头 `批注 在编辑器中打开` 是下划线文字按钮 + 原生复选框 `已看`：三种控件形态并排。→ 统一为 `btn-ghost btn-s`，`已看` 用同样式的切换按钮（`aria-pressed`），选中时 `bg-selected`。

### 3.7 欢迎页（`Welcome.tsx`，`.welcome`、`.checks`）

问题与修法：
1. 布局锚在 `margin: 10vh 0 0 6vw; max-width: 600px`，1440 宽窗口右侧 55% 空白，构图失衡。→ 居中（`margin: 12vh auto 0; max-width: 640px`）**或**两栏：左 420px 讲“Tower 是什么”，右 360px 是环境检查 + 添加仓库（更像 Xcode / Things 的首启）。
2. 环境检查的 `✓` 用 `result-pass`（`--st-verified` 绿）。按规范 §12.4.3，绿只给“验证器在当前树上的通过”；环境检查是 Tower 自测的事实，不是验证器结论。→ `✓` 用 text-2 + 事实前缀 `⚙`，或用 `●` text-2。**这一条需要规范作者裁定**：如果认为“Tower 自测 = 验证器”，请在 §12.4.3 写明。
3. 三条要点 `事实与声明分开 / 只在需要你时打扰 / 你的仓库不被触碰` 是纯文字。→ 把第一条画出来：放一张**静态样例卡片**（`▲ 已验证 2/2 · ┆ Agent 称 …` 的真实组件渲染，不是图片），这是最便宜的“教语法 + 立身份”的位置。
4. `重新检查` 是下划线链接，`添加一个 git 仓库` 是反色主按钮，两者垂直堆叠、间距 12px。→ 同一行：左 `重新检查`（ghost），右主按钮。

### 3.8 合同编辑器（`ContractEditor.tsx`，`.editor*`、`.field*`）

问题与修法：
1. 仍是“网页表单”：标签 / 输入 / 提示 / 标签 / 输入 / 提示 … 纵向 1100px+，`范围围栏` 三个框在首屏之外被切掉；左栏输入宽到 780px，一行能打 60 个汉字，不利阅读。→ 左栏 `max-width: 640px`；textarea 初始 2 行（`rows=2`，40 + 8px）。
2. 主动作 `批准并开始 ⌘↵` 漂在右栏中部（y≈650），与表单底部无关，禁用态是灰块。→ 动作行改为**左栏底部 sticky**（`position: sticky; bottom: 0; background: var(--bg-app); border-top: 1px solid var(--border-subtle); padding: 12px 0`），顺序 `取消`（ghost）· `保存为草稿`（默认）· `批准并开始 ⌘↵`（主）；禁用时保持反色 + `opacity: .4`，旁边 12px text-2 写原因（`至少需要 1 条验收标准`）。
3. 标准行 `C1 [标题] [npm test] [600] 删除`：四个控件等高挤在一行，`600` 无单位，`删除` 是下划线文字。→ 两行结构：第一行 `C1  [标题 ……………………]  [600 秒]  ×`，第二行缩进 2.5em 的 `[npm test ……]`（mono，`bg-field`）；超时框 `width: 7ch`，单位 `秒` 作为框内右侧 text-3 后缀；删除为 16px `cross` ghost 图标按钮。
4. `软上限 $` / `硬上限 $` 把单位写在标签里。→ 单位进框：左内侧 `$` text-3，`padding-left: 20px`。
5. 四个大文本块（目的 / 终态 / 停止条件 / 约束）之间没有可感分组；`验收标准`、`范围围栏` 又用了区块标题。→ 全部用 §2.1 的 13/500 text-1 区块标题 + 20px 上间距，把“意图”类四个字段合成一个区块 `意图`，字段标签退为 12/500 text-2。
6. 右栏自主度三项的描述 `范围内编辑、跑测试直接做；加依赖、改 CI、递归删除先问` 折行后与单选圆不对齐。→ `.radio { grid-template-columns: 14px 1fr; }`，描述另起一行 12px text-3。

### 3.9 设置（`Settings.tsx`，`.settings*`、`.kv`、`.field`）

问题与修法：
1. 单列 880px 纵向表单，标签在上、控件在下，与 macOS 系统设置（标签左、控件右、行高一致）的手感不同；两列 `editor-grid2` 又在中途出现，节奏不稳。→ 改为**左标签右控件**的表格式表单：
   ```css
   .settings-form { display: grid; grid-template-columns: 180px minmax(0, 520px); gap: 10px 16px; align-items: center; }
   .settings-form .field-label { text-align: right; color: var(--text-2); }
   .settings-form .field-hint  { grid-column: 2; margin-top: -4px; }
   ```
2. `☐ 加载我全部的 Pi 扩展 扩展在沙箱之外以你的权限运行；只在你信任它们时打开。` 标签与说明挤在一行。→ 标签一行、说明 12px text-3 另起一行（`.check { align-items: flex-start }` 已有，只需拆 span）。
3. “保存”按钮模式。→ 失焦即保存，右上角显示 `已保存 · 21:03`（`HumanStamp` 语法，text-3，5 秒后淡出 100ms）。语言切换已经是即时的，其余字段应一致。
4. 环境块 `kv` 的 90px 标签列对中文够用，但 `Pi` 路径一行 70 字符 mono 12px text-1 占满宽度。→ `dd` 用 `break-all` + text-2，版本号 text-1 放前面。

### 3.10 命令面板（`Chrome.tsx` `CommandPalette`，`.palette*`）

做得好：600px、10px 圆角与阴影只在浮层、32px 行、字形复用。

问题与修法：
1. 键盘打开却有 160ms 动画（§2.4）。
2. 没有分组：命令与目标混在一列，命令用 `›` 文字字符占位。→ 两个 12px text-3 组标题 `命令` / `目标`（`padding: 8px 10px 2px`）；命令行左槽放对应图标（`plus`、`grid`、`inbox`、`gear`），目标行左槽放生命周期字形，行尾放 `◆`（有需要你时）与状态词 text-3。
3. 输入 46px 无提示符，与概览的 `›` 快速输入不呼应。→ 40px，左 `›` text-3（mono），`padding-left: 32px`；`font-size: 13px`（原 14）。
4. 没有底部提示行。→ 28px 页脚：`↑↓ 移动 · ↩ 打开 · esc 关闭`，text-3 11px，右侧 `共 9 项`。
5. 匹配高亮缺失。→ 匹配字符 text-1 500，其余 text-2。
6. 遮罩 28% 黑：浮层已有阴影与 1px 边，遮罩可降到 16%，减少“模态感”（Raycast 的面板不压暗桌面）。

### 3.11 Toast（`Chrome.tsx` `Toasts`，`.toast*`）

- 当前正在看 G-0002 的页面时仍弹出 `◆ G-0002 需要你：…`，与屏幕中央的决策卡重复（规范：只在不看该目标时发）。
- 无动作、无关闭、无退出动画。→ 右侧 `打开` 文字按钮；8 秒后 100ms 淡出；最多 2 条；`max-width: 380px`；`padding: 8px 10px 8px 12px`。

---

## 4. 签名设计动作（让 Tower 一眼可辨，且不违反“安静驾驶舱”）

1. **仪表列（Instrument Column）** — §2.2。全产品所有“事实读数”落在同一组固定列：结果 · 耗时 · `⚙ @pin` · 时间。像飞行进程单、像示波器的读数栏。没有任何聊天式 Agent GUI 这样排版，因为它们没有“验证器事实”这个概念。
2. **来源边栏（Source Gutter）** — 诚实语法的悬挂标签列统一为 6em，`┆ Agent 称`、`你 · 14:20`、`⚙ Tower`、`⚙ 验证器` 全部落在左侧同一列。页面读起来像账簿：**左边是谁说的，右边是说了什么，最右边是量出来的**。不画竖线，靠对齐。
3. **一支笔的字形集** — §2.3。生命周期字形、结果标记、导航图标、`harness` 刻度标记全部 1.25px 方端线条。这是 Tower 的“字体”。
4. **验证印章（Verified Seal）** — 绿色永远与哈希同时出现。新增 `<Seal>` 组件：`▲ 已验证 @a4a90b2`（字形 st-verified、`已验证` text-1 500、`@pin` mono text-2，`white-space: nowrap`，间距 4px），在卡片第 2 行、目标页副标题右端、评审头部、收件箱待验收卡、验收面板首行都用它、只用它。视觉法则写进规范：**没有哈希就没有绿。**
5. **实况行作为航班条** — `[徽章 4em][动作][· 对象 1fr][时间]` 的固定网格，卡片、目标页、命令面板目标行、侧栏悬停预览都用同一条。一眼看去，整个概览像一块机场航班牌：每行一个目标，每个目标一条在变的字。
6. **琥珀只在 28px 条头 + 700ms 衰减** — 已有前者，补后者。它应该是用户能回忆起来的、Tower 唯一会“自己动”的东西。
7. **刻度式分组标题** — 概览、收件箱、设置的分组标题统一为 `12px/500 text-3 + 向右延伸的发丝线`，像仪表盘面上的刻度，而不是网页的 H2。

这七件事互相一致，都不引入新颜色、新动效或新装饰；它们只是把规范里已经写下的语法做**彻底、做大、做统一**。

---

## 5. 优先实施清单（Top 30）

影响：H = 整体观感或原则级；M = 单屏明显；L = 细节。工作量：S < 半天，M ≈ 1 天，L > 1 天。

| # | 文件 | 改动 | 影响 / 量 |
|---|---|---|---|
| 1 | `app.css` `.section*`、`.claim*`、`.rail-dl dt`、`.kv dt`；`docs/12` §12.3.2 | 区块标题 13/500 text-1、区块上间距 20px；说法标签列 6em，种类并入标签；字段名 text-3（§2.1） | H / S |
| 2 | `Glyph.tsx` 新增 `Icon`；替换 `Sidebar.tsx`、`Chrome.tsx`、`Overview.tsx`、`GoalPage.tsx`、`Trace.tsx`、`Honesty.tsx`、`Glyph.tsx ResultMark` 中的 Unicode 图标 | 一套 12/16px、1.25px、方端 SVG 字形（§2.3） | H / M |
| 3 | `GoalPage.tsx` `CriterionRow`/`LedgerRow`/改动行；`app.css` `.criterion-row` | 仪表列网格 `14px 2.5em 1fr 3em 6ch 9ch 7em`（§2.2） | H / M |
| 4 | `app.css` 新增 `@keyframes attn`；`DecisionCard.tsx`、`GoalCard.tsx` 加 `data-new` | 进入“需要你”的 700ms 琥珀衰减，一次性 | H / S |
| 5 | `app.css` `.palette`、`.overlay` | 键盘打开的面板 0ms；遮罩 16% | M / S |
| 6 | `app.css` `.btn .kbd`、`.btn-primary .kbd` | 按钮内键帽去底色、`opacity .55` | M / S |
| 7 | `Live.tsx`、`app.css` `.live-line`、`.mode-badge` | 实况行改固定网格 `4em 1fr auto`，徽章 text-1、动作 text-2 | H / S |
| 8 | `GoalPage.tsx` `GoalBlocks` | 原因说法按文本去重、保留 3 条；运行列表最近 3 条 + 展开 | H / S |
| 9 | `GoalPage.tsx` 头部 + `Chrome.tsx` `TitleBar` | 标题栏改面包屑 + 仪表簇（运行数 / 花费 / 引擎心跳），去掉与 H1 重复的标题；`←` 改图标；搜索改图标按钮 | H / M |
| 10 | `GoalPage.tsx` `annunciator` | 同一条目已有决策卡时隐藏实况行对象段（去重复） | M / S |
| 11 | 新组件 `Seal`（`Honesty.tsx`）；用于 `GoalCard`、`goal-sub`、`Review` 头部、`DecisionCard` 待验收、`AcceptPanel` | 验证印章 `▲ 已验证 @pin`（§4.4） | H / S |
| 12 | `tokens.css` 新增 `--bg-field`；`app.css` 输入框、`.decision textarea`、`.steer textarea` | 卡片内输入不再比卡片暗 | M / S |
| 13 | `app.css` `.seg-empty`、`.budget-bar*`；`GoalPage.tsx` `BudgetMeter` 位置 | 未运行段点线框；预算条 4px、软/硬刻度 1×10 text-1；移到右栏 | M / S |
| 14 | `app.css` `.steer` | 去渐变，实色 + 上发丝线 | L / S |
| 15 | `app.css` `.pill`；`Trace.tsx` | 胶囊改 4px 圆角标签 | L / S |
| 16 | `Review.tsx` 头部、`app.css` `.review-head`、`.unit*`、`.ln` | 头部 56px 两行、返回键、单元单行、行号 text-3 | M / M |
| 17 | `Review.tsx`、`app.css` `.review-body` | 单元栏 240px；单元数 1 时折叠；键盘提示移到底部状态条 | M / M |
| 18 | `Inbox.tsx`、`DecisionCard.tsx`、`app.css` `.inbox` | 宽 840；刻度式分组；待验收卡正文改事实读数 | M / S |
| 19 | `ContractEditor.tsx`、`app.css` `.editor*`、`.criterion-edit` | 左栏 640；底部 sticky 动作行；标准行两行结构；单位入框 | H / M |
| 20 | `Settings.tsx`、`app.css` `.settings*` | 左标签右控件表格式表单；失焦自动保存 + `已保存 · 时间` | M / M |
| 21 | `Welcome.tsx`、`app.css` `.welcome*` | 居中或两栏；样例卡片代替文字要点；`✓` 去绿（需规范裁定） | M / S |
| 22 | `lib/native.ts` 新增 `ask()`；`GoalPage.tsx` 4 处 `confirm()` | 原生对话框 | M / S |
| 23 | `base.css` | 删除 `::-webkit-scrollbar*`，用系统叠加滚动条 | M / S |
| 24 | `GoalCard.tsx`、`GoalPage.tsx`、`DecisionCard.tsx`、`Chrome.tsx`；`base.css` `.code-val` | `G-000N` 提到 text-2；`.code-val` 最小 11.5px | M / S |
| 25 | `tokens.css` 浅色块 | `--border .14`、`--border-subtle .08`、`--attention-bg oklch(.96 .04 85)`、`--text-4 .70` | M / S |
| 26 | `Overview.tsx`、`app.css` `.next-line`、`.briefing`、`.quick` | 合并为一条“今日条”，统一左缘；刻度式分组标题 | M / S |
| 27 | `Chrome.tsx` `Toasts`、`lib/store.ts` toast 逻辑、`app.css` | 不在当前目标页重复弹；带“打开”；退出 100ms；最多 2 条 | L / S |
| 28 | `Trace.tsx` 回退分支 | 原始事件名映射为字形 + 标签 | L / S |
| 29 | `app.css` `.btn:active`、`DecisionCard.tsx` `.leaving`、`lib/nav.ts` | 按下反馈 100ms；回答后卡片 160ms 收起；进入评审 220ms View Transition | M / M |
| 30 | `Sidebar.tsx`、`app.css` `.side-group*`、`.side-row.active` | 分组间距 16、选中行 2px 左标、底部改为设置入口或留空 | L / S |

第 1–11 项构成“一个迭代”：全部是 S/M 工作量，合计约 4–5 个工作日，完成后 §1 的综合分预计从 63 提到 75 上下；第 12–30 项是第二个迭代。

---

## 6. 附：需要规范作者裁定的条目

1. §12.3.2 `title-section`：14/500 **text-2** → 建议 13/500 **text-1**（§2.1 的理由：同一页里 14px 的暗字不构成层级）。
2. §12.4.3 绿色的边界：环境检查、集成检查（`检查已验收目标是否已合入`）这类 Tower 自测的事实是否允许 `--st-verified`。本文建议不允许，只给验证器在树上的结论。
3. §12.7：命令面板现有 160ms 动画与“键盘打开 0ms”冲突，按规范改。
4. §12.6.3 模式徽章“固定最小宽度 4 个汉字”：建议改写为“实况行以 4em 的徽章**列**对齐”，否则单张卡片上会出现无法解释的空洞。
5. 新增一条视觉法则：“绿色元素必须与 `@pin` 同时出现”（§4.4）。

## 7. 附：本次补拍的截图（临时，未入库）

- `/tmp/audit-shots/palette.png`：概览 + ⌘K 命令面板（深色）
- `/tmp/audit-shots/goal-running.png`：G-0002 运行中（第 14 次运行、5 条重复原因、14 行运行记录）
- `/tmp/audit-shots/goal-watch.png`：G-0002 观察面板 + 等你决策卡 + 右下 toast
- `/tmp/audit-shots/goal-more-menu.png`：G-0003 待验收（与 r1/02 同一页，无遮挡）
- `/tmp/audit-shots/accept-panel.png`、`changes-panel.png`：评审页的验收与要求修改面板

如需入库，建议由截图负责人用 `tools/screenshot.sh` 按 r1 的命名规则重拍（本次为了触发面板用了 `osascript` 键击，脚本未入库）。
