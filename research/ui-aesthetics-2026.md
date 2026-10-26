# Tower 界面美学研究 2026：怎样做出顶级、不像 AI 生成的“安静驾驶舱”

> 日期：2026-10-26。范围：标杆产品拆解、“AI 生成感”的成因与规避、Tower 现有截图的逐屏批评、中文排版与 macOS 原生细节、图标选型。
> 输入：`docs/12-visual-design-system.md`（下称“规范”）、`assets/screenshots/*.png`（6 张，1440×900，1x）、`apps/desktop/src/styles/{tokens,base,app}.css`、`apps/desktop/src-tauri/tauri.conf.json`。
> 本文只给建议，不改规范。凡与规范冲突处都写明了冲突点。

**证据等级**（每条结论后标注）：
- **[实测]**：本次在本机或线上直接测得，例如读取 linear.app 线上 CSS 令牌、用 CoreText/fontTools 读取字体度量、对截图取色。
- **[官方]**：厂商文档或官方博客。
- **[二手]**：第三方分析或评测。
- **[推断]**：作者判断。

---

## 0. 结论先行

1. **方向是对的，执行层还带着“网页 + shadcn”的口音。** 规范里的暗驾驶舱语法（灰为常态、5 个状态色、绿色只属于验证器、诚实语法）比绝大多数标杆都严格，这是 Tower 最难被模仿的部分。截图里显得普通的地方几乎都在实现层：
   - 紫色强调色。
   - 3px 半透明焦点光晕。这正是 shadcn v4 的默认写法。
   - `cursor: pointer`。
   - 10px 圆角加满屏发丝线框。
   - 原生 textarea 拖拽角和数字输入的上下箭头。
   - 一个无限旋转的 spinner。
2. **最伤品质感的三件事：**
   - **琥珀泛滥。** “需要你”页 4 张卡全是琥珀底，侧栏顶部也是一大块琥珀，琥珀因此失去信号意义。这违反了规范自己的 cry-wolf 原则。
   - **框太多。** 模式徽章、事实框、观测框、kbd 键帽、命令底色、链接下划线，一行里常有 3–4 种框。
   - **等宽字体包住了中文和分隔符。** 例如 `+1  -1  ·  1 文件` 里的大空洞：JetBrains Mono 的空格与 `·` 各占 0.6em，一个分隔符就是 1.8em 的空白。[实测]
3. **规范中有两条中文排版规则在 Tauri（WKWebView）上不成立。**
   - `text-spacing-trim`：WebKit 不支持。
   - `text-autospace`：要 Safari 18.4（macOS 15.4）才支持，而 Tower 的最低系统是 macOS 13。
   - 替代方案：PingFang SC 自带 `halt` 特性 [实测]，可以在 WebKit 上做标点挤压。
4. **强调色 h=285（紫 / 靛）恰好是 2025–2026 年最典型的“AI 味”色相**，见 §3。建议改成无彩色的焦点和选中体系，让琥珀成为界面上唯一“会叫”的颜色。这比任何细节打磨收益都大。

文末 §9 是按影响排序的 20 项具体改动。

---

## 1. 标杆拆解：可直接落地的细节

### 1.1 Linear（2026-03 “calmer interface” 改版）

**官方叙述** [官方]（[changelog](https://linear.app/changelog/2026-03-12-ui-refresh)、[改版说明](https://linear.app/now/behind-the-latest-design-refresh)、[上一轮改版](https://linear.app/now/how-we-redesigned-the-linear-ui)）：
- 侧栏“暗几档”，让内容区优先。
- 图标更少、更小，去掉团队图标的彩色底。
- 边框与分隔线变少、对比度变柔。
- 灰色从偏冷蓝改为更暖、更低彩度。原文警告“太暖会发浑（muddy）”。
- 主题由 3 个输入（base、accent、contrast）在 LCH 空间生成，取代原来的 98 个变量；并刻意限制 accent 渗入中性色。
- 两句原则：“Don't compete for attention you haven't earned”和“Structure should be felt not seen”。

**线上 CSS 令牌** [实测]，2026-10-26 抓取 linear.app 的 CSS 包。这是营销站与 Web 端共用的设计系统，可作为数量级参考：

| 项 | 取值 |
|---|---|
| 字重 | normal 400 · **medium 510** · **semibold 590** · bold 680 |
| 字号 / 字距 / 行高 | micro 12px / 0 / 1.4 · **mini 13px / −0.01em / 1.5** · small 14px / −0.013em / 1.5 · regular 15px / −0.011em / 1.6 · title-2 20px / −0.012em / 1.33 · title-3 24px / −0.012em / 1.33 |
| 字体 | `"Inter Variable", "SF Pro Display", -apple-system…`，`font-feature-settings: "cv01", "ss03"`；等宽 **Berkeley Mono** |
| 圆角 | 4 / 6 / 8 / 12 / 16 / 24 / 32（UI 控件主要用 4–8） |
| 动效 | `--speed-highlightFadeIn: 0s`、`--speed-highlightFadeOut: .15s`、`quickTransition .1s`、`regularTransition .25s` |
| 边框（深色） | `#ffffff14`（8%）/ `#ffffff1f`（12%）/ `#ffffff26`（15%） |
| 表面（深色） | `#08090a → #0f1011 → #141516 → #191a1b`，每级约 +2% 明度 |
| 侧栏 | `--sidebar-width: 232px` |
| 焦点 | `--focus-ring-width: 2px`，`--focus-ring-offset: 2px` |

**对 Tower 的启示：**
- 悬停是“瞬间亮起、150ms 熄灭”。Tower 现在是双向 120ms，所以鼠标划过列表时会拖出尾巴。
- 中等字重用 510，不用 500。这在中文环境下有陷阱，见 §5.3。
- Tower 的 13px 基础字号与 6% / 10% / 16% 边框档位，和 Linear 是同一量级，这个方向是对的。

### 1.2 Raycast（v2，2026，WKWebView + 原生外壳）

Raycast 的架构和 Tower 最像：原生外壳加 Web 前端。它的官方经验 [官方]（[技术深潜](https://www.raycast.com/blog/a-technical-deep-dive-into-the-new-raycast)、[The New Raycast](https://www.raycast.com/blog/the-new-raycast)）：
- **不用 `cursor: pointer`。** 原话是它“immediately signals 'this is a website'”。
- 多数控件**没有悬停高亮**，与 macOS 按钮和列表一致。
- 设置是独立的原生窗口，不是模态框。
- 弹出层和提示气泡是原生窗口，可以超出主窗口边界。
- 用 `_doAfterNextPresentationUpdate` 等 WebView 画完再显示窗口，消除打开时的闪白。
- 打开 WebKit 特性开关，解除 60fps 上限。
- Liquid Glass 只“有品味地”用在启动器外框，不进入列表内容。
- 紧凑模式把一切非必要元素融入背景。

**启示：** Tower 的 `base.css:50 button { cursor: pointer; }` 和 `.chip { cursor: pointer }` 应该删掉。Tauri 窗口首帧闪背景色的问题，也值得照 Raycast 的方式处理（Tauri 侧：窗口先 `visible: false`，首帧渲染后再 `show()`）。

### 1.3 Things 3（Cultured Code）

[MacStories](https://www.macstories.net/reviews/things-3-beauty-and-delight-in-a-task-manager/)、[Things 博客](https://culturedcode.com/things/blog/) [官方 / 二手]：
- 层级主要靠**字重与留白**，不靠框。
- 动画是**空间性**的：待办展开成一张“纸”，用来解释你去了哪里。
- 3.22 版为 OS 26 加了玻璃按钮，但玻璃只在浮动按钮上，列表依旧是纸面。

**启示：** Tower 规范“键盘打开的东西 0ms”是对的。唯一值得动画的是“进入评审 / 诊断”这种空间切换，规范已定为 220ms，保持即可。

### 1.4 Arc → Dia（The Browser Company）

[Wikipedia](https://en.wikipedia.org/wiki/Dia_(web_browser))、[MakeUseOf](https://www.makeuseof.com/arc-supposed-successor-not-even-close/)、[复盘](https://www.penkin.me/browsers/arc/dia/2026/01/09/arc-to-dia-revisited.html) [二手]：
- Dia 2025 年以“AI 优先 + 极简顶栏”发布，评测普遍说它“看起来就是另一个 Chrome”，丢了身份。
- 2025-11 起，Dia 把 Arc 的侧栏、垂直标签、固定标签加了回来，口碑才回升。

**启示：**
- “极简”不等于“去掉结构”。侧栏作为空间上的“家”，是专业工具最强的识别物。
- 以 AI 为卖点的视觉（对话框居中、大输入框）恰恰抹掉了产品个性。Tower 概览顶部那个 44px 的大输入框正有这个倾向，见 §4.2。

### 1.5 Vercel Geist

[Colors](https://vercel.com/geist/colors)、[Typography](https://vercel.com/geist/typography) [官方]：
- **色阶语义：** 100–300 背景（默认 / 悬停 / 按下），400–600 边框（默认 / 悬停 / 按下），700–800 高对比背景，900–1000 文字（次 / 主）。
- **规则：** 默认一律灰；“每条边框只画一次”（重叠的 alpha 边框会让交点变亮）；阴影保持半透明。
- **排版分 Label 与 Copy 两族：** Label 用于单行，行高宽松；Copy 用于多行，行高更高。`label-13` 搭配表格数字，`label-13-mono` 搭配 `label-14`。

**启示：** Tower 应该显式区分“单行标签”和“多行正文”两套行高，见 §5.2。现在 `:lang(zh)` 一刀切地把 body 改为 21px，这个做法不对。

### 1.6 Superhuman

[命令面板指南](https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/) [官方]：
- ⌘K 在任何地方都可用。
- **同一快捷键再按一次即关闭，并把焦点还给之前的元素。**
- 面板结果旁总是显示快捷键，用来训练用户“毕业”离开面板。
- 速度目标是 100ms 级（第三方称内部目标 50–60ms [二手]）。
- 乐观更新。

**启示：** Tower 的 Palette 规范已经接近，只需补上“再按 ⌘K 关闭并还原焦点”。

### 1.7 Height（已于 2025-09-24 停运）

[AlternativeTo](https://alternativeto.net/news/2025/3/height-project-management-tool-to-shut-down-by-september-2025/) [二手]：Height 以“AI-native / 自主协作”为卖点，2.0 发布 5 个月后宣布关停。

**启示（推断）：** 用 AI 叙事包装视觉与文案没有护城河。Tower 规范里“不拟人、不用星光图标、说法只标‘Agent 称’”的克制，本身就是差异化。

### 1.8 Craft

[craft.do](https://www.craft.do/) [官方 / 二手]：2021 Mac App of the Year，ADA 入围。被称道的是“原生字形（SF Pro / New York）与原生手势”，Windows 和 Web 版则被认为缺少原生打磨。

**启示：** 原生感有一半来自文字渲染与系统惯例，见 §6。

### 1.9 Cron / Notion Calendar

[Cron changelog](https://www.cron.com/changelog)、[Notion 帮助](https://www.notion.com/help/notion-calendar-settings) [官方]：
- 时间网格的纵向密度默认“恰好”。
- 窗口拉高时增大行高，但保持锚点不跳动。
- 缩放快捷键 ⇧⌘. / ⇧⌘, / ⇧⌘0，也都可以从 ⌘K 到达。
- 时间标签约 11px [二手]。

**启示：** 规范里的密度三档可以做成“随窗口高度自动、可用快捷键覆盖”，而不只是设置项。

### 1.10 Zed

[0.201 发布说明](https://zed.dev/releases/stable/0.201.4) [官方]：
- UI 字体 IBM Plex Sans，代码字体 Lilex（基于 Plex Mono），两者同一设计血统。
- 字体名用 `.ZedSans` / `.ZedMono` 别名，便于以后替换。
- 有 compact / default / comfortable 的 UI 密度（[#18078](https://github.com/zed-industries/zed/issues/18078)）。

**启示：** 给字体做语义别名。Tower 的 `--font-ui` / `--font-mono` 已经是这样，保持。另外，“UI 无衬线与等宽同族”能明显减少混排的违和感，见 §5.5。

### 1.11 Warp

[主题设计](https://www.warp.dev/blog/how-we-designed-themes-for-the-terminal-a-peek-into-our-process)、[Block 模型](https://www.warp.dev/blog/block-model-behind-warps-agentic-development-environment) [官方]：
- UI 表面 = 主题背景 + 与正文色相同的半透明叠层 + 描边。
- 屏幕是“有类型的、自包含的 block”纵向列表。

**启示：** Tower 用 `oklch(1 0 0 / α)` 做边框，和 Warp 的叠层思路一致。诚实语法的每一行，本质上也是“带来源类型的 block”，可以借 Warp 的一致外形，但要更安静。

### 1.12 Figma UI3

[设计 UI3](https://www.figma.com/blog/our-approach-to-designing-ui3/) [官方]、[设计系统分析](https://medium.com/@successful_zomp_crow_820/analyzing-figmas-design-system-exploring-scalability-consistency-and-maintainability-a31000582699) [二手]：
- 浮动面板在发布后被撤回，原因是“Speed is a feature… they slowed people down”。
- UI 字号 11px，字重从 400/600 改为 **450/550**（Inter 可变字体）。
- 16px 图标对齐 16px 行高。

**启示：** 可变字体的非整百字重是 2024–2026 年专业工具的“隐形签名”。但它在中文回退字体上会出问题，见 §5.3。

### 1.13 Apple HIG（macOS 26 Tahoe / Liquid Glass）

本次读取 HIG JSON 原文 [官方]（[Materials](https://developer.apple.com/design/human-interface-guidelines/materials)、[Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars)、[Windows](https://developer.apple.com/design/human-interface-guidelines/windows)、[Focus and selection](https://developer.apple.com/design/human-interface-guidelines/focus-and-selection)；Sidebars 页 2026-06-08 有更新）：
- **Materials：** “Don't use Liquid Glass in the content layer.” Liquid Glass 只用于浮在内容之上的控件和导航层，并且要“sparingly”。侧栏、弹出层这类文字多的组件用 regular 变体。
- **Sidebars：**
  - 一般不超过两级层级。
  - “Avoid putting critical information or actions at the bottom of a sidebar”，因为用户常把窗口底边拖出屏幕。
  - 侧栏图标颜色默认跟随系统强调色；少量固定颜色可以“澄清含义或吸引注意”，例如 Mail 的 VIP 用黄色。
- **Windows：**
  - key、main、inactive 三种窗口状态外观不同。
  - 非活动窗口的交通灯变灰，并且**不使用 vibrancy，显得更远、更淡**。
  - 自绘界面也要自己实现这些状态切换。
- **Focus：** 文本框用焦点环，列表和集合用整行高亮。
- **Tahoe 的实际情况：**
  - 窗口圆角随工具栏、侧栏变化。带工具栏时约 26pt，“Golden Gate”约 20pt，旧版约 10pt（[lapcat](https://lapcatsoftware.com/articles/2026/3/1.html)、[TidBITS](https://talk.tidbits.com/t/adjust-tahoe-window-corner-radius/33791)）[二手]。
  - 浮动侧栏被批评为“双层边框”。
  - NN/g 的 “Liquid Glass Is Cracked” 批评其易读性与注意力抢夺（[摘要](https://anderegg.ca/2025/10/12/nielsen-norman-group-on-ios-26-usability)）[二手]。

### 1.14 Teenage Engineering（OP-1 / OP-1 field）

[OP-1 布局指南](https://teenage.engineering/guides/op-1/original/layout) [官方]、[Abduzeedo](https://abduzeedo.com/teenage-engineering-masterclass-product-design) [二手]：
- 颜色**严格作为代码**：四个彩色编码器与屏幕图形一一对应，绿色元素就表示“绿色旋钮会改它”。
- OP-1 field 重画了全部屏幕，并为它切了一套新字体，让菜单与硬件落在同一网格上。
- 网站：单色、无圆角、无阴影、无渐变，唯一的非中性色是琥珀警示三角 [二手]。

**启示：** “颜色 = 代码”与 Tower 的 5 色语法同源。TE 敢用直角；Tower 至少可以把卡片圆角收到 4–6px。

### 1.15 ISA-101 / 高性能 HMI

[LADX](https://ladx.ai/resources/isa-101-hmi-design)、[Aevus](https://aevus.io/learn/isa-101/) [二手，非标准原文]：
- 常态是低对比灰阶，颜色只给异常。“屏幕上任何有颜色的东西按定义都是不对劲的”。
- 报警色绝不用于常态、按钮或装饰。
- **绿色不作为“运行正常”的默认色。** Tower 让绿色只属于验证器，与此完全一致。
- 约 90% 的画面应保持中性。

### 1.16 Airbus 暗驾驶舱（lights-out）

[Aviapro](https://aviaproconsulting.com/article/post/engineering-spotlight-the-ergonomics-of-annunciation-%E2%80%93-airbus-lights-out-vs-boeing-quiet-and-dark)、[Aeropeep](https://aeropeep.com/which-aircraft-uses-the-dark-cockpit-concept/) [二手]：
- 按钮全黑表示系统适航。琥珀表示故障，红色表示需立即处置。
- **关键反面：** 灯不亮也可能是“没电或灯泡坏了”。

**启示：** 暗驾驶舱必须区分“安静是因为正常”和“安静是因为死了”。Tower 需要一个永远可见、但不运动的生命迹象：标题栏状态区写 `引擎 正常 · 3 秒前`（text-3），断连时换成 `■` + text-1。规范的 `StatusStrip` 已有雏形，应该放到标题栏，而不是侧栏底部。

### 1.17 汇总：Tower 与标杆的参数对照

| 维度 | 标杆共识 | Tower 规范 | Tower 实现 | 建议 |
|---|---|---|---|---|
| 基础字号 | 13px（Linear mini）、11px（Figma） | 13 | 13 | 保持 |
| 中等字重 | 510（Linear）、550（Figma） | 500 | 500 | 拉丁 520，中文锁 PingFang Medium（§5.3） |
| 正文字距 | 13px −0.01em（Linear）；Inter 公式 −0.003em | 未定义 | 0 | 13px −0.003em；≥20px −0.017em |
| 控件圆角 | 4–8px | xs4 / sm6 / md8 / lg12（lg 仅浮层） | **卡片 10、输入框 10** | 卡片和输入框 6，kbd 3，浮层 10 |
| 悬停 | 进 0ms、出 150ms | 未定义 | 进出 120ms | 进 0、出 150ms |
| 焦点 | 2px 实线，偏移 2px | 2px accent 环 | **3px 半透明光晕**（shadcn 写法） | 1.5px 中性实线，偏移 2px |
| 强调色 | Linear 限制 accent 渗入；TE、ISA 无强调色 | h285 紫 | 紫下划线到处可见 | 无彩焦点（§4.1） |
| 侧栏宽 | 232（Linear） | 232 | **264** | 232 |
| 光标 | 无手形（Raycast） | — | pointer | default |

---

## 2. 2025–2026 年“AI 生成感”的精确定义

### 2.1 成因

Anthropic 的 cookbook 说得最直接：模型“converge toward generic, 'on distribution' outputs… what users call the 'AI slop' aesthetic”（[Prompting for frontend aesthetics](https://platform.claude.com/cookbook/coding-prompting-for-frontend-aesthetics)，2025-10）[官方]。也就是说，**任何“默认值”都是统计中心**：Tailwind 的 indigo-500、shadcn 的 zinc 与 ring、Lucide、rounded-2xl、shadow-lg。

[superdesign](https://superdesign.dev/blog/why-ai-design-looks-generic) 把它叫作“distributional convergence”，并提到 Tailwind 作者曾为 indigo-500 成为默认色致歉 [二手]。[avoid-ai-design](https://github.com/funboy322/avoid-ai-design) 给出一个经验法则：一页上出现 1 个是巧合，出现 4 个以上就是“质心外观”[二手]。

### 2.2 征兆清单与 Tower 的暴露情况

| # | 征兆 | 来源 | Tower 现状 | 规避方法 |
|---|---|---|---|---|
| 1 | 紫 / 靛色（#7c3aed → #6366f1 一带）用作强调、渐变、光晕 | 925studios 称其为“single loudest AI tell in 2026”；avoid-ai-design C1 | **命中**：`--accent: oklch(0.76 0.12 285)` 用于链接下划线、焦点、选中，截图中每个 `G-0004` 下都有紫线 | 焦点和选中改为无彩（§4.1） |
| 2 | 渐变（背景、按钮、标题字） | avoid-ai-design C1/C6 | 已避免；仅 `.steer` 有一处背景渐变遮罩 | 遮罩改成实色 + 上边发丝线 |
| 3 | 玻璃拟态、`backdrop-blur` 到处用 | avoid-ai-design；HIG 本身也禁止 Liquid Glass 进入内容层 | 已避免 | 保持；vibrancy 也慎用（§6.3） |
| 4 | emoji 图标、✨ 星光表示 AI | avoid-ai-design“Sparkle icon used for AI” | 已避免（规范 §12.9 明令禁止） | 保持 |
| 5 | `rounded-2xl` + `shadow-lg` 卡片，同一圆角到处用 | avoid-ai-design；[Spot the Slop](https://world.hey.com/kostac/spot-the-slop-a-ui-designer-s-guide-to-fixing-ai-defaults-4c448c9c)“same corner radius everywhere” | **部分命中**：10px 用于卡片、决策卡、侧栏块、输入框、快速输入。无阴影是好的 | 分级圆角：控件 6、徽章 4、键帽 3、浮层 10 |
| 6 | shadcn 默认（zinc 灰、`ring-[3px] ring-ring/50`、`border-input`） | avoid-ai-design“untouched shadcn palettes” | **命中**：`input:focus { box-shadow: 0 0 0 3px var(--accent-soft) }` 与 `.goal-card.selected` 的 3px 光晕就是 shadcn v4 的焦点写法 | 实线环或整行高亮（HIG） |
| 7 | 居中 hero 式空状态，大标题 + 一句话 + 按钮 | avoid-ai-design L1；Spot the Slop“missing states” | **命中**：`.empty { margin: 12vh auto; text-align: center }`，规范 `display` 24px“仅空状态” | 空状态写在内容将出现的位置，左对齐，一行（§4.6） |
| 8 | 过多 badge / pill | avoid-ai-design“pill badge” | **命中**：模式徽章有框（与规范“背景：无”不符）、FactChip、ObsChip、kbd、命令底色，一行可达 4 种框 | 只给“例外”加框（§4.3） |
| 9 | 千篇一律的灰色边框框住一切 | Linear“structure should be felt not seen”；Geist“每条边框只画一次” | **部分命中**：卡片 + 内部 chip + 内部 kbd 形成框套框 | 卡片靠明度分层，内部去框 |
| 10 | Lucide 到处用 | avoid-ai-design“The worn Lucide icon set” | **规范命中**（§12.9 指定 Lucide） | 换图标集（§7） |
| 11 | Inter 独占、无搭配 | Spot the Slop；cookbook 的 `<use_interesting_fonts>` 示例点名 Inter | **部分命中**：Inter + JetBrains Mono 是 2024–2026 开发工具“默认对” | 对 Tower 来说 Inter 可以保留（中文 UI 中拉丁占比小，Linear 和 Figma 都用），但要“有主见地用”：开 opsz、定字距、用特性（§5.1）；等宽换成更少见的一款（§5.5） |
| 12 | 低信息密度、巨大留白、巨大输入框 | 多个来源；Figma UI3“speed is a feature” | **部分命中**：概览 44px / 15px 快速输入框，目标页的通栏状态框 | 压缩（§4.2） |
| 13 | 左缘彩色竖线 | Spot the Slop 第 5 条 | **命中**：说法用 2px 虚线左边框，toast 用 3px 琥珀内阴影左边 | 说法改为标签列（§4.3） |
| 14 | 统一 fade-up 动效、弹跳缓动、无限转圈 | avoid-ai-design“Motion” | **命中**：`.spinner { animation: spin .8s linear infinite }`，规范明令禁止 | 删除 |
| 15 | “✨ AI”“Elevate your workflow”式文案 | avoid-ai-design“Copy” | 已避免：文案具体、有工程语气 | 保持；另修正“5分前 / 3时前”这类日语腔（§5.6） |
| 16 | 网页交互痕迹：手形光标、textarea 拖拽角、数字上下箭头、原生 `<select>` 箭头 | Raycast“signals this is a website” | **命中**（新目标页最明显） | §4.5 |
| 17 | 默认永远深色 | superdesign“permanent dark mode as reflex” | 轻微：有浅色主题 | 默认“跟随系统” |

**一句话标准（推断）：** 每个视觉决定都能说出“为什么是这个值而不是默认值”。答不上来的就是 slop。

---

## 3. Tower 的已有优势（保持，不要改）

- 5 色状态语法，加上“绿色只属于验证器”。在所有标杆中最严格，也最像 ISA-101 和暗驾驶舱。
- 诚实语法（事实 / 观测 / 说法 / 人）。这是 Tower 独有的视觉身份。截图里 `○✓ 观测 通过（Agent 环境，未计入已验证）` 的虚线框已经能一眼读出来。
- 无渐变、无阴影卡片、无头像、无星光。
- 主按钮反色、无品牌色（对应 TE 和 ISA 的思路）。
- 固定高度卡片、`tnum` 数字、键盘提示。
- 暖灰 h≈70、低彩度。截图实测 `bg-app` = rgb(19,18,17)，`bg-sidebar` = rgb(15,15,14)，卡片 = rgb(24,22,21)，与令牌一致 [实测]。

---

## 4. 逐屏批评（按影响排序，CSS 级别）

### 4.1 全局：强调色与焦点（影响：最高）

**问题：**
- `--accent: oklch(0.760 0.120 285)` 是 2025–2026 年最被诟病的 AI 色相区间。
- 它在截图里是除状态色外唯一的彩色，出现在每个目标编号的下划线、输入框焦点和选中卡片上，人会以为它“表示什么”。
- 规范 §12.15 设想“系统强调色映射到 accent”，但 WebKit 对网页内容的 `AccentColor` 返回固定蓝，不暴露用户设置，原因是防指纹（[csswg #10372](https://github.com/w3c/csswg-drafts/issues/10372)）[二手]。系统默认蓝 h≈255 与 `--st-active` h=230 只差约 25°，也违反规范自己“≥30°”的约束。

**改为无彩焦点体系**（暗驾驶舱：选中靠亮度，不靠色相）：

```css
:root[data-theme="dark"] {
  --focus: oklch(0.945 0.003 70 / 0.70);        /* 焦点环 */
  --select-edge: oklch(1 0 0 / 0.28);           /* 选中卡片 1px 内描边 */
  --link-underline: oklch(1 0 0 / 0.26);
}
:root[data-theme="light"] {
  --focus: oklch(0.230 0.006 70 / 0.65);
  --select-edge: oklch(0.20 0.01 70 / 0.30);
  --link-underline: oklch(0.20 0.01 70 / 0.28);
}
:focus-visible { outline: 1.5px solid var(--focus); outline-offset: 2px; border-radius: inherit; }
input:focus, textarea:focus, select:focus { border-color: var(--border-strong); box-shadow: none; }
input:focus-visible, textarea:focus-visible { outline: 1.5px solid var(--focus); outline-offset: 0; }
.goal-card.selected { box-shadow: inset 0 0 0 1px var(--select-edge); border-color: transparent; }
.link { text-decoration-color: var(--link-underline); text-decoration-thickness: 1px; text-underline-offset: 3px; }
.link:hover { text-decoration-color: currentColor; }
::selection { background: oklch(1 0 0 / 0.16); }   /* 浅色：oklch(0.2 0.01 70 / 0.14) */
```

需要的话，可以在设置里提供“跟随系统强调色”。实现方法：Rust 侧读取 `NSColor.controlAccentColor`，转成 OKLCH，再注入 `--accent`；监听 `NSSystemColorsDidChangeNotification`。这只能作为选项，不作为默认。

**目标编号去掉下划线。** `G-0004` 本身就在可点击的行里，下划线只会制造噪声。改为悬停时出现下划线。

### 4.2 概览（overview.png）

1. **侧栏顶部的琥珀大块：**
   - 现状：`.side-inbox.has-items` 用 10px 圆角、`--attention-bg` 整块填充，约 236×60px，是全屏最大的彩色面积。下面的分组标题“需要你 1”又重复了一次，而且计数不一致：顶部写 4，分组写 1。原因是前者含待验收，但用户读不出这个差别。
   - 改法：改成普通的 28px 导航行，`◆ 需要你` 加右侧计数，计数 text-1 / 500，◆ 用琥珀，**不铺底色**。“下一件：…”移到概览页顶部，作为一行 12px text-2。
   - 分组名改成与计数口径一致。例如分组“需要你”只列有 ◆ 的目标；“验证与待验收”里带 ◆ 的行，◆ 本身已经说明了一切。
2. **快速输入框：**
   - 现状：44px 高、15px 字号、10px 圆角，读起来像“AI 对话首页”。
   - 改为 `height: 32px; font-size: 13px; border-radius: 6px; padding-left: 28px`，左侧放 mono `›` 提示符（text-3）。右侧提示 `↵ 快速开始 · ⌥↵ 写合同` 去掉键帽框，用 11px text-3。
   - 也可以只保留一行占位，点击或按 `N` 才展开。
3. **卡片：**
   - 圆角 10 改成 **6px**。
   - 内边距：规范是 12/8，实现是 14/10。按规范改为 `padding: 8px 12px`。
   - 行网格：`grid-template-rows: repeat(5, 20px); row-gap: 4px`，代替 `1fr`，保证中英文行在 1x 屏上都落在整像素上。
   - 数值右列对齐：给第 3、4 行用 `display: grid; grid-template-columns: 1fr auto auto; column-gap: 12px`，`$0.02/$5` 与 `5 分钟前` 两列跨卡片对齐。数字用 `font-variant-numeric: tabular-nums`。
   - 第 5 行无异常时显示 `shop`，浪费了一行。把项目名移到第 1 行标题后（12px text-3，`· shop`），第 5 行留给 AnomalyChip，空着就空着。空本身就是“灯灭 = 正常”。
   - 卡片悬停 `border-color: var(--border-strong)` 加 120ms 过渡，改成 `background: var(--bg-hover)`，进 0ms、出 150ms。
4. **分组标题“需要你 1 / 运行中 1”：** 14/500 text-2 合理，计数改为 text-3 tnum，与标题间距 6px，下边距 8px（现在是 12px）。

### 4.3 框与线的减法（全局，影响：高）

| 元素 | 现在 | 改为 | 理由 |
|---|---|---|---|
| `ModeBadge`（`已暂停` / `待验收` / `思考`） | `inset 0 0 0 1px var(--border-subtle)`，18px 高 | 常态**无框无底**，12px / 500 text-1，`min-width: 4em`；只有 attention / danger 模式有 `--attention-bg` / `--danger-bg` 底，圆角 4px | 规范表 §12.6.3 本就写“背景：无”，属于实现偏差 |
| `FactChip` | 实线框 `--border-strong` | **去框**：`⚙`（自绘 harness 刻度图标，10px，text-3）+ 文本 11px mono text-2 | 事实是常态，常态不加框；“例外才加框”更符合 ISA-101 的思路 |
| `ObsChip` | 虚线框 | 保留虚线框（1px dashed `--border-strong`，圆角 3px） | 观测是“降级的可信度”，框就是警示 |
| `ClaimBlock` | 2px 虚线左边框 + `┆` 前缀 + `Agent 称` 标签 | **去掉左边框**，改成悬挂缩进：标签列固定宽 `5.5em`，`┆ Agent 称` 11px text-2；正文 13px text-2 | 三重标记冗余；虚线左边框在 WebKit 下 2px 虚线断点不均；左缘竖线也是 AI 征兆 |
| `HumanStamp` | 2px 实线左边框 text-3 | 同上改为标签列 `你 · 14:20`，正文 text-1 | 与说法对称：靠标签列和灰阶区分，不靠竖线 |
| `.kbd` | 1px 边框 + 16px 高 | **无边框**，`background: oklch(1 0 0 / 0.06)`（浅色 `oklch(0.2 0.01 70 / 0.06)`），`border-radius: 3px; height: 16px; padding: 0 4px; font: 500 10.5px/16px var(--font-mono); color: var(--text-3)` | 键帽描边是“网页文档风”；Raycast 和 Linear 只用底色 |
| 命令底色 `.criterion-cmd` | `--bg-inset` 块 | 去底色，mono 12px text-2 | 已有等宽字体区分，底色多余 |
| 区块分隔 `.section` | 上边线 + 16px 上下内边距 | 保留上边线（`--border-subtle`），内边距改成 12px | 密度 |

### 4.4 目标页（goal.png / goal-light.png）

1. **重复的状态通栏：** `.annunciator`（`待验收 · 已验证 · @50c5544`）占满宽 40px，与标题下的 `待验收 · 第 2 次运行…` 重复。**删掉**，把 `已验证 @50c5544`（FactChip）并入副标题行。省下的 56px 留给内容。
2. **头部动作区：** 现在 6 个按钮（评审 R / 观察 W / 重新验证 / 修订合同 ⇧E / 归档 / 放弃）有 3 种样式（反色、描边、无框），视线无处落脚。
   - 改为：**1 个主按钮**（当前状态下最该做的事，例如“评审”）+ **最多 2 个次按钮**（描边）+ “…”溢出菜单。溢出菜单走原生菜单，见 §6.4。
   - 键帽只在主按钮上显示，其他动作的快捷键在原生菜单和 ⌘K 中可见。
   - 统一 `height: 26px; padding: 0 10px; border-radius: 6px; font: 500 13px/1 var(--font-ui)`。
   - `放弃` 不应该和 `归档` 并排放在头部，它是破坏性操作，放进溢出菜单。
3. **决策卡（假设待你确认）：** 整块琥珀底，约 1100×185px，是全页最大的彩色面积。改为“告警条头”结构，参照 Airbus ECAM 的标题条：
   ```css
   .decision-card { background: var(--bg-raised); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 0; gap: 0; }
   .decision-head { height: 28px; padding: 0 12px; background: var(--attention-bg); border-radius: 5px 5px 0 0; }
   .decision-question { padding: 10px 12px 2px; }  /* 16/500 text-1 */
   .decision-body, .decision-actions, .decision-text { padding: 0 12px; }
   .decision-actions { padding-bottom: 12px; }
   ```
   琥珀只在 28px 高的条头里，◆ 加种类文字 text-1。700ms 的一次性提示改成作用在条头上。
4. **补充说明输入框：** textarea 的 WebKit 拖拽角（右下斜线）是网页痕迹。改为 `resize: none`，用 JS 随内容自动增高（1–6 行）。`发送 ⌘↵` 禁用态用 text-4，不要整块降透明度。
5. **说法与事实对齐：** 验收标准行 `✓ C1 购物车测试全部通过 npm test ……… ⚙ 通过 · 451ms @50c5544 · 5分` 现在右侧是一整个框。去框后改成**右侧三列定宽**：结果（`通过`，text-1）、耗时（mono tnum text-2，`min-width: 5ch; text-align: right`）、来源（`⚙ @50c5544 · 5 分钟前`，text-2）。各行的这三列上下对齐，形成仪表读数列。
6. **右栏（合同摘要）：** 结构好。`dt` 是 text-3，按规范只限非必读文字；“包含 / 只读 / 模型 / 工作区”这些标签是必读的，应改为 text-2。`dd` 里的路径用 mono 11.5px，与正文 12px 的高度不一致，改为 12px。
7. **底部预算条：** 4px 条加刻度，很好。文案 `预算 $0.02 / 软 $5 · 硬 $8` 的 `/` 与 `·` 混用，统一为 `预算 $0.02 · 软上限 $5 · 硬上限 $8`。
8. **浅色主题：** 侧栏琥珀块在浅色下成了桃色，更扎眼，§4.2 的改法同样适用。浅色下卡片 `--bg-raised` 是纯白（`oklch(1 0 0)`），与 `bg-app` 0.992 几乎无差，只能靠 6% 边框分层，这是对的，保持。

### 4.5 新目标 / 合同编辑器（contract.png）—— 网页味最重的一屏

| 问题 | 改法 |
|---|---|
| 每个 textarea 都有拖拽角 | `resize: none` + 自动增高 |
| `<input type=number>` 的 WebKit 上下箭头 | `input::-webkit-inner-spin-button, input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }`；用 ↑ / ↓ 键调值，单位写在框内右侧（`$`、`分`，text-3） |
| 原生 `<select>`（`Pi 默认 ⌃⌄`）在深色下是系统浅色箭头 | 自绘“弹出按钮”：26px 高，文字加 10px 双向箭头图标，点击调用 Tauri `Menu.popup()` 弹**原生菜单**。原生弹出菜单是 macOS 原生感最强的信号之一 |
| 原生 radio 是系统蓝 | `accent-color: var(--text-1)`，或者自绘 14px 圆（1.25px 描边 text-3，选中时实心 text-1） |
| 右栏底部三个全宽堆叠按钮（批准并开始 / 保存为草稿 / 取消） | 改为右对齐的一行：`取消`（文字按钮）· `保存为草稿`（描边）· `批准并开始 ⌘↵`（反色）。全宽堆叠按钮是移动端和网页表单的惯例 |
| 主按钮禁用态是灰块，看不出来是主按钮 | 禁用时保留反色，`opacity: .4`，旁边一行 12px text-2 说明原因（例如“至少需要 1 条验收标准”） |
| `placeholder` 用 text-4（Lc ≈ 31） | 规范说占位属于“非必读”，应用 text-3（Lc ≈ 53）。text-4 只给禁用 |
| 字段标签 13/400 text-1，说明 12/400 text-2 | 标签改为 12/500 text-2，说明 12/400 text-3（非必读）。层级靠灰阶 |
| 范围围栏三个框等宽 | 合理；框高从 72 改为 3 行 × 20 + 12 = 72，保持，但去掉拖拽角 |

### 4.6 需要你（inbox.png）

1. **四张卡全是琥珀底：** 在这一页里每一项都“需要你”，琥珀底不提供任何区分信息，只会制造焦虑。改法：
   - 列表项用 `--bg-raised`，靠 ◆（琥珀）和种类文字（text-1）标记。
   - **只有当前键盘焦点那一项**用 §4.4 的琥珀条头。
   - 新到达的那项照规范做 700ms 一次性提示。
2. **标题重复：** 种类行 `◆ 已暂停 · G-0004 调研结账慢的原因` 下面又是 `已暂停：Agent 停下了但没有提交`。标题去掉种类前缀，只写 `Agent 停下了但没有提交`。
3. **页面说明：** `按紧急程度排序：…` 12px text-2 很好，保持。
4. **列表宽 820px：** 与概览的 1480 不一致。建议统一内容最大宽 1120px，左对齐。

### 4.7 评审（review.png）

1. 头部统计行 `+1 -1 · 1 文件 · 1 个评审单元 · base @3c332b3 → @50c5544 · ▬▬ 已验证 2/2 · 观测 1/2 · 人工 0/1` 整行是等宽字体，间隙巨大。按 §5.5 只让数值和哈希用 mono，并拆成两组：
   - 左组：改动规模。
   - 右组：验证两轨。
   - 两组间距 24px，组内分隔 `·` 用 UI 字体，左右各 0.35em。
2. 文件树项 `src/` 用 mono、`cart.js` 用 UI 字体，同一条路径两种字体。统一用 mono 12px，目录 text-2、文件名 text-1。
3. diff 区：行号槽 + `+/−` + 10% 底色都对。hunk 头 `@@ -1,5 +1,5 @@` 用 text-3。外框 10px 圆角改成 6px。
4. `验收 ⌘↵` 是反色主按钮，`要求修改 C` 是描边，层级正确。

### 4.8 侧栏（所有截图）

- 宽 264 改为 **232**（规范值，也与 Linear 一致）。
- 行高 28px、13px、`padding: 0 8px`、图标槽 16px、选中 `--bg-selected` 圆角 6px：保持。
- **底部的 新目标 / 设置 / 版本串：** HIG 明确不建议把关键动作放在侧栏底部。
  - `新目标`：移到侧栏顶部、交通灯行下方，作为一行 `＋ 新目标 ⌘N`。
  - `设置`：移到 App 菜单 `Tower → 设置… ⌘,`，打开独立窗口（Raycast 的做法）。
  - 版本串 `Pi demo-engine 0.1 (scripted, no model)` 换行显示很粗糙。移到“关于 Tower”，侧栏底部只留一行生命迹象（§1.16），截断不换行。
- 分组标题 12px text-3（非必读、与内容重复）合理。分组之间 12px，组内 0。

---

## 5. 中文排版：中英混排的具体做法

### 5.1 实测字体度量

用 CoreText 与 fontTools 在本机读取（macOS 27、PingFang.ttc、`@fontsource-variable` 5.3.0）[实测]：

| 字体 | 上行 | 下行 | `line-height: normal` | 大写高 | x 高 | `·` 宽 | 可变轴 |
|---|---|---|---|---|---|---|---|
| PingFang SC（Regular / Medium / Semibold 相同） | 1.060 | 0.340 | **1.40** | 0.860 | 0.600 | 0.500em | —（离散字重：Ultralight…Semibold） |
| Inter Variable（fontsource `wght` 子集） | 0.969 | 0.241 | 1.21 | 0.728 | 0.546 | 0.288em | **只有 wght**，没有 opsz |
| JetBrains Mono Variable | 1.020 | 0.300 | 1.32 | 0.730 | 0.550 | **0.600em** | wght |
| SF Pro（系统 UI） | 0.967 | 0.211 | 1.18 | 0.705 | 0.508 | — | — |

**推论：**
- PingFang 的“中”字字面从 −0.107em 到 0.821em，约 0.93em 高，明显高于 Inter 的大写高 0.728em。同字号下中文显得比拉丁大。**不要放大拉丁**，这是中文 UI 的常态；也不要缩小中文。
- PingFang 的自然行高是 1.40，Inter 是 1.21。混排时**必须用固定 px 行高**，否则行高会随一行里有没有汉字而跳动。规范已经这样要求，正确。
- 现在用的 `@fontsource-variable/inter` 默认入口**没有 opsz 轴**，所以 20px 和 24px 标题用不上 Inter Display 的紧凑字形。改一行即可：`import "@fontsource-variable/inter/opsz.css"`（包内已有 `opsz.css` 和 `*-opsz-normal.woff2`）[实测]，再加 `font-optical-sizing: auto`。
- 现有字体栈是 `"Inter Variable", -apple-system, …, "PingFang SC"`。汉字会先落到 `-apple-system`（SF Pro 没有汉字），再走 CoreText 的语言级联，结果取决于 `lang`。现在 `<html lang="zh-CN">` 能保证选到 PingFang SC。但 Agent 输出等不设 `lang` 的内容（规范 §12.14 #13），可能在日文系统语言下落到 Hiragino 的日式字形。**把 `"PingFang SC"` 放到 `-apple-system` 之前**，可以消除这种不确定性。

### 5.2 行高（统一为“单行标签”和“多行正文”两套）

规范现在是拉丁 / 中文各一套（20/21、16/18……），实现里 `:lang(zh) body { line-height: 21px }` 又与 `--line-row: 20px` 冲突。建议按 Geist 的 Label / Copy 拆分：

| 用途 | 字号 | 行高（中英相同） | 说明 |
|---|---|---|---|
| 单行标签（行、按钮、meta、卡片行） | 13 | **20px** | 中文 1.54 倍，单行足够；1x 屏上居中不会出现半像素 |
| 单行 meta / 实况行 | 12 | **16px**（会换行时 18px） | |
| 键帽 / 提示 | 11 / 10.5 | 16px | |
| 多行正文（说法正文、发现、合同正文） | 14 | 22px（拉丁）/ **24px**（`:lang(zh)`，1.71 倍） | 只有这里按语言区分 |
| 问题（决策卡） | 16 | 24px | |
| 标题 | 20 | 28px | |

删掉 `:lang(zh) body { line-height: 21px }`。多行容器用 `.copy:lang(zh) { line-height: 24px }` 单独设置。

### 5.3 字重：可变字重与 PingFang 的匹配陷阱

CSS 字重匹配算法有两条规则：
- 请求 400–500 之间的值时，先向上找到 500 为止。
- 请求大于 500 时，先向上找。

PingFang SC 只有 300 / 400 / 500 / 600 几档，所以：

| 请求字重 | Inter 渲染 | PingFang SC 实际匹配 | 结果 |
|---|---|---|---|
| 400 | 400 | Regular | 正常 |
| 450（Figma 风格） | 450 | **Medium** | 中文突然变粗 |
| 500 | 500 | Medium | 正常 |
| 510（Linear 风格） / 550 | 510 / 550 | **Semibold** | 中文过粗 |

**建议：**
- **默认：** 仍只用 400 / 500，与规范一致，最安全。
- **进阶（可选，可得到 Linear / Figma 的拉丁质感）：** 用 `unicode-range` 给汉字建一个“锁档”的别名族。拉丁字重可以自由取 520，中文固定落在 Regular 或 Medium：

```css
@font-face { font-family: "Tower Han"; src: local("PingFangSC-Regular"); font-weight: 100 459;
  unicode-range: U+2E80-2FDF, U+3000-303F, U+3100-312F, U+31A0-31BF, U+3400-4DBF, U+4E00-9FFF, U+F900-FAFF, U+FE30-FE4F, U+FF00-FFEF; }
@font-face { font-family: "Tower Han"; src: local("PingFangSC-Medium"); font-weight: 460 900;
  unicode-range: U+2E80-2FDF, U+3000-303F, U+3100-312F, U+31A0-31BF, U+3400-4DBF, U+4E00-9FFF, U+F900-FAFF, U+FE30-FE4F, U+FF00-FFEF; }
:root {
  --font-ui: "Inter Variable", "Tower Han", "PingFang SC", -apple-system, BlinkMacSystemFont,
             "Hiragino Sans GB", "Microsoft YaHei UI", "Noto Sans CJK SC", sans-serif;
  --w-regular: 400; --w-medium: 520;   /* 拉丁 520，中文落在 Medium */
}
```

PostScript 名 `PingFangSC-Regular` 和 `PingFangSC-Medium` 已用 CoreText 实测确认 [实测]。WKWebView 对系统字体的 `local()` 匹配**需要在 macOS 13 和 26 上各验证一次** [推断]。Windows（M2）上 YaHei 没有 Medium，应回退到 400 / 700 两档。

- **深色下细一点：** 在深底上，浅字会因光渗显得更粗。可以考虑深色 `--w-regular: 400`、浅色 `430`（只影响拉丁）[推断，需目测]。

### 5.4 字距（只给拉丁，汉字要“密排不加字距”）

`letter-spacing` 对同一元素里的汉字也生效，所以负字距只能小。Inter 官方动态字距公式是 `tracking = −0.0223 + 0.185·e^(−0.1745·px)` em（[Inter Dynamic Metrics](https://d.rsms.me/inter-website/v3/dynmetrics/)）[官方]，算出来：

| px | 11 | 12 | 13 | 14 | 16 | 20 | 24 |
|---|---|---|---|---|---|---|---|
| em | +0.005 | 0 | −0.003 | −0.006 | −0.011 | −0.017 | −0.020 |

- 13px 以下按公式取值，量级在 ±0.05px，对汉字无感。
- 16–24px 标题用 −0.011 到 −0.017em。打开 opsz 后 Inter Display 本身更紧，标题再取一半即可：20px 用 **−0.008em**、24px 用 −0.010em，避免中文标题被挤。
- 不用全大写，不给中文加正字距。规范已规定，保持。

### 5.5 等宽与中文：现在最大的视觉毛病

**问题：** 卡片的第 3、4 行、评审头部、预算行把中文、空格和 `·` 都放进了等宽字体。JetBrains Mono 的空格与 `·` 各 0.6em [实测]，`" · "` 一个分隔符就占 1.8em ≈ 21.6px（12px 字号）。截图里 `+1  -1  ·  1 文件` 的空洞就是这么来的。中文在 mono 栈中回退到 PingFang（1em 宽），也对不齐 2:1 网格。

**规则：**
1. **mono 只包裹“机器值”：** 数字、哈希、路径、命令、工具名。中文标签、量词、分隔符一律用 UI 字体。例如：`<span class="ui">已验证</span> <span class="num">2/2</span>`。
2. **分隔符组件化，不写空格：**
   ```css
   .sep { font-family: var(--font-ui); color: var(--text-3); margin: 0 0.35em; }
   .sep::before { content: "·"; }
   ```
   Inter 的 `·` 宽 0.288em，加上两侧 0.35em，总宽约 1em，与一个汉字等宽，节奏稳定。
3. **行内 mono 缩一档：** JetBrains Mono 字面宽，13px 正文里的行内 mono 用 `font-size: 0.923em`（12px），避免“码比字大”。
4. **等宽字体选择**（JetBrains Mono 是 2020 年代开发工具的“默认答案”，可以换掉以去默认化）：
   - **Berkeley Mono**：付费，Linear 在用，最“仪器感”。
   - **Lilex / IBM Plex Mono**：免费，Zed 在用，Plex Sans 的拉丁节奏与之同源。
   - **Commit Mono**：免费，中性。
   - 中文需要 2:1 对齐的地方（Watch 日志）：**Sarasa Mono SC** 或 **Maple Mono NF CN**。规范已列为可选，保持。

### 5.6 标点与中西文间距：WebKit 的现实

**规范 §12.14 #4 和 #5 的前提不成立：**
- `text-spacing-trim` 只在 Chromium 123+ 生效；WebKit（含 Safari 26.2）不支持（[W3C i18n](https://www.w3.org/International/articles/styling/inline-space)、[Chrome 博客](https://developer.chrome.com/blog/css-i18n-features)）[官方]。
- `text-autospace` 在 Safari 18.4+（macOS 15.4+）可用，初始值与规范不同；Chrome 140+、Firefox 145+ 也支持（[caniuse](https://caniuse.com/mdn-css_properties_text-autospace)）[二手]。Tower 最低是 macOS 13，覆盖不全。

**可行方案：**
1. **标点挤压用 PingFang 的 `halt`。** 实测 PingFang SC Regular 和 Medium 的 GSUB/GPOS 都带 `halt`、`hwid`、`fwid`、`pwid`、`vert`；全角 `：，。（）「」` 默认宽 1em [实测]。截图里 `下一件：G-0004`、`Agent 称（提交说明）` 的空洞，就是全角标点自带的半格空白。
   ```css
   /* 单行标签、meta、徽章、卡片行、侧栏行、条头：标点半宽 */
   .label, .meta, .card-line, .side-goal, .mode-badge, .decision-head, .chip, .live-line {
     font-feature-settings: var(--font-features-ui), "halt" 1;
   }
   /* 多行正文保持全宽标点（阅读节奏） */
   ```
   Inter 和 JetBrains Mono 没有 `halt`，开着也不会影响它们。
2. **中西文间距：**
   - **界面文案（消息目录）：** 手写一个普通空格（Inter 空格约 0.25em，符合 clreq“不超过四分之一汉字宽”，[clreq](https://www.w3.org/TR/clreq/)）[官方]。这样 macOS 13–27 的表现一致。这与规范 #4“不手写空格”的 lint 方向相反，建议改规范：lint 改为**要求**空格。
   - **用户与 Agent 产生的内容（无法控制源文本）：** 渐进增强。
     ```css
     @supports (text-autospace: ideograph-alpha) {
       .user-content, .claim-body, .reading { text-autospace: ideograph-alpha ideograph-numeric; }
     }
     ```
     已有空格的位置不会再加。
3. **中间点 `·`：** clreq-gap 指出 PingFang 的 U+00B7 既不是全宽也不是半宽（[clreq-gap](https://www.w3.org/TR/clreq-gap/)）。实测为 0.5em [实测]。按 §5.5 统一由 Inter 渲染即可。
4. **数字与单位：**
   - 截图中 `5分前`、`5分` 和 `1 个文件`、`第 2 次运行` 混用了两种写法。
   - **`5分前` 和规范里的 `3时前` 是日语腔**（日语写作「5分前」「3時間前」），中文应写 `5 分钟前`、`3 小时前`。
   - 卡片紧凑态写 `5 分钟`（加“前”字的语义靠位置），或 `刚刚 / 5 分钟 / 3 小时 / 昨天 / 10月2日`。
   - 统一“数字 + 空格 + 量词”：`1 个文件`、`返工 1/3`、`第 2 次`。
5. **引号：** 规范 #10 用「」表示引用的说法，与 Apple 简体中文风格（“”）不同。在说法里用「」作为语法标记是好的，保持；其他场合用“”。

### 5.7 截断与断行（补充规范）

- 卡片标题单行省略：`text-overflow: ellipsis` 在中英混排下按字素截断，没问题。
- 路径中间省略要在 JS 中按 `Intl.Segmenter` 做（规范已写）。
- `word-break: keep-all` **不要**用在中文 UI 上：它会让中文整句不断行。

---

## 6. macOS 原生感（Tauri 2）

### 6.1 窗口外框与交通灯

- 现状：`titleBarStyle: "Overlay"`、`hiddenTitle`、`trafficLightPosition {x:16, y:20}`、标题栏 44px。截图实测交通灯圆心约在 y≈18，标题文字中线约在 y≈21–22，**差 3–4px** [实测]。
- 建议：标题栏改为 **52px**（Tahoe 统一工具栏的常见高度，与 Mail、Finder 一致）[推断]。调整 `trafficLightPosition.y`，直到圆心 = 26px，标题文字、搜索框、状态区都按 26px 中线对齐。侧栏内容从 52 + 8px 开始。
- 标题栏全宽都是拖动区（`data-tauri-drag-region`），双击执行系统“缩放 / 最小化”偏好（读 `AppleActionOnDoubleClick`；Tauri 2 的拖动区已处理双击最大化，需验证是否尊重该偏好）[推断]。
- 窗口背景色 `backgroundColor: "#1b1a19"` 与 `--bg-app`（rgb 19,18,17 ≈ #131211）不一致，首帧会闪一下更亮的灰。改为 `#131211`，浅色主题启动时动态设置。也可以照 Raycast：窗口先隐藏，首帧画完再显示。

### 6.2 窗口激活状态（HIG 要求，最容易被网页式 App 忽略）

```ts
import { getCurrentWindow } from "@tauri-apps/api/window";
const w = getCurrentWindow();
w.onFocusChanged(({ payload }) => { document.documentElement.dataset.windowActive = String(payload); });
```
```css
:root[data-window-active="false"] .sidebar { color: var(--text-3); }
:root[data-window-active="false"] .side-goal.active,
:root[data-window-active="false"] .side-link.active { background: var(--bg-hover); }
:root[data-window-active="false"] .btn-primary { background: var(--text-2); }
/* 状态色（◆ ■ ▲）不随失焦变淡：状态永远是状态 */
```

### 6.3 侧栏 vibrancy：建议默认**不开**

Tauri 2 的做法是 `"transparent": true` + `"windowEffects": { "effects": ["sidebar"], "state": "followsWindowActiveState" }` + `app.macOSPrivateApi: true` + Cargo 特性 `macos-private-api`，CSS 中 html、body 背景透明，侧栏背景 alpha 约 0.6–0.75（[Tauri 配置](https://v2.tauri.app/reference/config/)、[window-vibrancy](https://github.com/tauri-apps/window-vibrancy)）[官方]。

**不建议默认开启的理由：**
1. 壁纸颜色会渗进暖灰侧栏，破坏“颜色 = 含义”，也让规范里实测的 APCA 值失效。
2. 需要 `macOSPrivateApi`，影响 Mac App Store 上架。
3. 透明窗口的已知缺陷：Overlay 标题栏下缺少系统的浅色内描边（[tauri#14394](https://github.com/tauri-apps/tauri/issues/14394)）。
4. HIG 本身规定非活动窗口不显示 vibrancy，收益只在前台可见。

如果要做，作为“外观 → 侧栏半透明”选项：侧栏用 `oklch(0.155 0.004 70 / 0.72)`，内容区保持不透明；`prefers-contrast: more` 时强制关闭。

**Liquid Glass：不用。** 内容层禁用是 HIG 原话，导航层用自绘玻璃在 WebView 里做不到系统级折射，做出来只会是“网页玻璃拟态”（§2 征兆 #3）。

### 6.4 原生菜单（原生感收益最高的一项）

用 Tauri 2 的 `Menu` / `Submenu` / `PredefinedMenuItem` 和 `menu.setAsAppMenu()` 建完整菜单栏（[Window Menu](https://v2.tauri.app/learn/window-menu/)）[官方]。macOS 上第一个子菜单会变成应用菜单：

- **Tower：** 关于 Tower · 设置… ⌘, · 服务 · 隐藏 ⌘H · 隐藏其他 ⌥⌘H · 退出 ⌘Q
- **文件：** 新目标 ⌘N · 新便笺 · 打开项目… ⌘O · 关闭窗口 ⌘W
- **编辑：** 预定义的 撤销 / 重做 / 剪切 / 复制 / 粘贴 / 全选（**必须有**，否则 WKWebView 中 ⌘C / ⌘V 在某些焦点下会失效）
- **显示：** 概览 ⌘1 · 需要你 ⌘2 · 显示 / 隐藏侧栏 ⌃⌘S · 密度（紧凑 / 默认 / 舒适）· 进入全屏
- **目标：** 评审 R · 观察 W · 重新验证 ⇧V · 修订合同 ⇧E · 暂停 · 继续 · 归档 · 放弃…（随当前目标状态启用或禁用）
- **窗口：** 最小化 ⌘M · 缩放 · 前置全部窗口
- **帮助：** 键盘快捷键 ? · 文档

右键菜单（卡片、侧栏行、diff 行）用 `Menu.popup()` 弹原生菜单，不画 DOM 菜单。§4.5 的弹出按钮也用它。

### 6.5 其他原生细节

| 项 | 做法 |
|---|---|
| 光标 | 全局 `cursor: default`；只有文本输入是 I 形，可拖拽分隔条是 `col-resize` |
| 悬停 | 列表行和按钮：进 0ms、出 150ms；纯文字按钮悬停只把颜色从 text-2 提到 text-1，不加底 |
| 滚动条 | 删掉自定义 `::-webkit-scrollbar`，让 WKWebView 跟随系统“自动显示滚动条”（叠加式）。自绘的 10px 常驻轨道是网页痕迹 |
| 文本选择 | 已有 `user-select: none` 加输入框和说法可选，正确；事实数值、哈希、路径也应可选（`user-select: text`），方便复制 |
| 设置 | 独立窗口（Tauri `WebviewWindow`），宽 680，左侧分栏，不做模态 |
| 提示气泡 | 延迟 600ms 出现、0ms 消失，不做动画；内容是“名称 · 快捷键” |
| Dock 角标与菜单栏 | 规范已定，保持“无动画” |
| 声音 | 默认关，已定 |
| 弹出层 | 圆角 10px，`--shadow-overlay` 保持；进入 160ms ease-out，退出 100ms（退出比进入快） |

---

## 7. 图标：小而精的方案

**约束：**
- SF Symbols 的许可只允许用于运行在 Apple 平台上的软件界面，打包成 SVG 用在跨平台的 Tauri App（M2 有 Windows）里不合规（[Apple 论坛](https://developer.apple.com/forums/thread/739523)、[HN](https://news.ycombinator.com/item?id=42083430)）[二手]。
- Lucide 被列为“用旧了的 AI 默认图标集”（§2 #10），默认 2px / 24 网格，缩到 14px 时线条发糊。

| 方案 | 许可 | 网格 / 线宽 | 优点 | 缺点 | 适配度 |
|---|---|---|---|---|---|
| **A. 自绘字形 + Radix Icons** | MIT | 15×15，约 1px，像素对齐 | 1x 屏上锐利，仪器感强，体量小（约 300 个，Tower 白名单约 25 个全覆盖）；与 10px 的 LifecycleGlyph 量级一致 | 图标少，个别要自绘 | **首选** |
| B. Phosphor Regular / Light | MIT | 256 网格；Regular 在 16px 时约 1px 描边，Light 约 0.75px | 6 种字重，覆盖面大 | 填充路径，不能改线宽；风格偏圆润友好 | 备选 |
| C. Central Icons（round-outlined, radius 2, stroke 1.5） | 付费（约 $59 起；单风格无限制） | 24 网格，1 / 1.5 / 2px，5 种圆角 | 最像 SF Symbols 的现代手感，可按“线宽 × 圆角”精确选型（[iconists](https://iconists.co/central)） | 付费；npm 私有包需要 license key | 预算允许时的首选 |
| D. 维持 Lucide，线宽 1.25 | ISC | 24 网格 | 零成本 | 仍是“默认答案” | 不推荐 |

**统一规格（不管选哪套）：**
- 行内 14px、按钮 16px。描边统一到**有效 1–1.25px**，与 LifecycleGlyph 的 1.25px 一致。
- 颜色继承 `currentColor`，常态 text-2。
- 端点和拐角统一（Radix 是方端，Central 可选 radius 1 / 2）。不要两套混用。
- 规范 §12.9 白名单 → Radix 对照（不全）：
  - `arrow-left` → ArrowLeftIcon
  - `search` → MagnifyingGlassIcon
  - `git-branch / commit / pull-request` → 自绘（Radix 无）
  - `terminal` → 自绘或 CodeIcon
  - `pause / play / square` → PauseIcon / PlayIcon / StopIcon
  - `rotate-ccw` → ResetIcon
  - `message-square` → ChatBubbleIcon
  - `check / x` → CheckIcon / Cross2Icon
  - `settings` → GearIcon
  - `inbox` → 自绘（建议直接用 ◆ 字形）
  - `clock` → ClockIcon
  - `link` → Link2Icon
  - `image` → ImageIcon
- **自绘清单**（10px 或 16px 网格、1.25px 描边、方端）：
  - `harness`（方框加刻度，即“仪表读数”）
  - git 三件套
  - `plug`
  - `book-open`（记忆）
  - `scroll-text`（日志）
  这套自绘图标 + 状态字形，就是 Tower 的“TE 式自有字体”，是识别度的来源。

---

## 8. 建议的令牌增量（tokens.css 草案）

```css
:root {
  --font-ui: "Inter Variable", "PingFang SC", -apple-system, BlinkMacSystemFont, "Hiragino Sans GB",
             "Microsoft YaHei UI", "Noto Sans CJK SC", sans-serif;
  --font-features-ui: "calt" 1, "cv01" 1, "ss03" 1;           /* 去掉 cv11 单层 a（显得幼）；ss02 只给 ID 列 */
  --font-features-num: "calt" 1, "tnum" 1, "zero" 1;

  --tr-11: 0.005em; --tr-12: 0; --tr-13: -0.003em; --tr-14: -0.006em;
  --tr-16: -0.008em; --tr-20: -0.008em; --tr-24: -0.010em;   /* 开 opsz 后标题取半值，照顾中文 */

  --lh-row: 20px; --lh-meta: 16px; --lh-hint: 16px;
  --lh-copy: 22px; --lh-copy-zh: 24px;

  --radius-xs: 3px;  /* kbd */
  --radius-s: 4px;   /* 徽章、chip */
  --radius-m: 6px;   /* 按钮、输入、卡片、决策卡、diff 外框 */
  --radius-l: 10px;  /* 仅浮层：命令面板、弹出层、简报 */

  --titlebar-h: 52px;
  --sidebar-w: 232px;

  --dur-hover-in: 0ms; --dur-hover-out: 150ms;
  --dur-1: 100ms; --dur-2: 160ms; --dur-3: 220ms; --dur-exit: 100ms; --dur-attn: 700ms;
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);     /* ease-out-quint：进入 */
  --ease-in: cubic-bezier(0.55, 0.055, 0.675, 0.19); /* 退出 */
}
html { font-optical-sizing: auto; }
button, [role="button"], .chip, a { cursor: default; }
.btn, .side-goal, .side-link, .goal-card { transition: background-color var(--dur-hover-out) linear, color var(--dur-hover-out) linear; }
.btn:hover, .side-goal:hover, .side-link:hover, .goal-card:hover { transition-duration: var(--dur-hover-in); }
```

`main.tsx` 中把 `import "@fontsource-variable/inter"` 改为 `import "@fontsource-variable/inter/opsz.css"`。

---

## 9. 影响最大的 20 项具体改动（按影响排序）

1. **去掉紫色强调色（h285）。** 焦点改成 1.5px 中性实线环（深色 `oklch(0.945 0.003 70 / 0.70)`，偏移 2px）；选中卡片改成 1px 内描边 `oklch(1 0 0 / 0.28)`；链接下划线改成 `oklch(1 0 0 / 0.26)`，悬停时变为 currentColor；目标编号常态不加下划线。
2. **琥珀退回“信号”：**
   - 侧栏顶部琥珀块改成普通 28px 行（◆ 琥珀，计数 text-1）。
   - “需要你”页的列表项改为 `--bg-raised`，只有焦点项用琥珀条头。
   - 决策卡改成“28px 琥珀条头 + 中性卡身”。
   - 700ms 一次性提示作用在条头上。
3. **只给例外加框：**
   - ModeBadge 常态无框（实现回到规范）。
   - FactChip 去框，改为 `⚙` 前缀；ObsChip 保留虚线框。
   - kbd 去边框，改为 6% 底色。
   - 命令去底色。
4. **说法和人的竖线改为标签列：** 去掉 2px 虚线 / 实线左边框，用 `5.5em` 悬挂标签列（`┆ Agent 称` / `你 · 14:20`）。
5. **mono 只包机器值：** 中文、量词、分隔符一律用 UI 字体；`.sep` 用 Inter 的 `·`，左右各 0.35em，不写空格；行内 mono 用 `0.923em`。
6. **删掉 shadcn 式 3px 焦点光晕：** 输入框和卡片的 `box-shadow: 0 0 0 3px var(--accent-soft)` 全部删除，输入框聚焦时边框改为 `--border-strong`，外加 §1 的焦点环。
7. **圆角分级：** 卡片、决策卡、输入框、快速输入、侧栏块从 10px 降到 6px；徽章 4、kbd 3；只有浮层用 10。
8. **去网页交互痕迹：**
   - 删除 `cursor: pointer`。
   - textarea 改为 `resize: none` 加自动增高。
   - 隐藏数字输入的上下箭头。
   - `<select>` 换成自绘弹出按钮 + `Menu.popup()` 原生菜单。
   - radio 改为 `accent-color: var(--text-1)`。
   - placeholder 改用 text-3。
9. **启用原生菜单栏：** 用 `Menu.setAsAppMenu()` 建全量菜单（Tower / 文件 / 编辑 / 显示 / 目标 / 窗口 / 帮助）。“设置”改为 ⌘, 打开的独立窗口；右键菜单用 `Menu.popup()`。
10. **中文标点挤压改用 `halt`：** 单行标签、meta、徽章、卡片行、侧栏行加 `"halt" 1`。修正规范 §12.14 #5（`text-spacing-trim` 在 WebKit 无效）。
11. **中西文间距改为手写空格：** 消息目录手写一个半角空格，lint 改为要求空格；`text-autospace` 只用 `@supports` 作用于用户和 Agent 内容。修正规范 §12.14 #4。
12. **字体加载与字体栈：**
    - 改为 `@fontsource-variable/inter/opsz.css` + `font-optical-sizing: auto`。
    - `"PingFang SC"` 移到 `-apple-system` 之前。
    - 特性改为 `cv01, ss03`，去掉 `cv11`。
    - 标题 20px 字距 −0.008em，13px 字距 −0.003em。
13. **标题栏与交通灯：** 标题栏 44 改为 52px，交通灯圆心、标题、搜索框、状态区对齐到 26px 中线；`backgroundColor` 改为 `#131211`，首帧画完再显示窗口。
14. **非活动窗口变淡：** 用 `onFocusChanged` 设置 `data-window-active`，失焦时侧栏文字降到 text-3、选中底降到 bg-hover、主按钮降到 text-2；状态色不变。
15. **删掉 spinner：** `.spinner` 的无限旋转违反规范 §12.7；人触发且超过 400ms 的等待用静态文字 `试运行中…`，超过 3 秒后追加已用时。
16. **目标页去重：**
    - 删除 `.annunciator` 通栏，把 FactChip 并入副标题。
    - 头部 6 个动作改为 1 个主按钮 + 2 个次按钮 + `…` 原生溢出菜单（`放弃` 进菜单）。
    - 区块内边距从 16 改为 12px。
17. **卡片网格化：**
    - 行改为 `repeat(5, 20px)` 加 4px 行距。
    - 数值列右对齐、用 tnum，并跨卡片对齐。
    - 项目名移到第 1 行尾（text-3），第 5 行只给异常，空着就留空。
    - 内边距回到规范的 8 / 12。
18. **侧栏重排：**
    - 宽 264 改为 232。
    - `＋ 新目标 ⌘N` 放到顶部。
    - 设置进 App 菜单，版本串进“关于”。
    - 底部只留一行“引擎 正常 · 3 秒前”生命迹象（断连时换成 `■` + text-1），区分“安静 = 正常”和“安静 = 死机”。
19. **行高与文案统一：**
    - 单行 UI 不分中英，统一 13/20、12/16，删掉 `:lang(zh) body { line-height: 21px }`；只有多行正文按语言取 14/22 或 14/24。
    - 相对时间改为 `5 分钟前 / 3 小时前`（去掉日语腔的“5分前 / 3时前”），统一“数字 + 空格 + 量词”。
    - 标题去掉重复的种类前缀。
20. **换掉 Lucide 并重做空状态：**
    - 图标改为 Radix Icons（15px，约 1px）加自绘 harness 和 git 字形，统一 1–1.25px 有效描边；预算允许时用 Central（stroke 1.5, radius 2）。
    - 空状态从居中的 24px hero 改为“在内容将出现处的一行 13px text-2 状态文字 + 快捷键”，例如 `没有运行中的目标 · ⌘N 新建`。
    - 概览快速输入从 44px / 15px 改为 32px / 13px，左侧加 `›` 提示符。

---

## 来源

**标杆产品**
- Linear：[UI refresh changelog](https://linear.app/changelog/2026-03-12-ui-refresh) · [A calmer interface](https://linear.app/now/behind-the-latest-design-refresh) · [How we redesigned the Linear UI](https://linear.app/now/how-we-redesigned-the-linear-ui) · 线上 CSS 令牌（static.linear.app，2026-10-26 抓取）
- Raycast：[A Technical Deep Dive Into the New Raycast](https://www.raycast.com/blog/a-technical-deep-dive-into-the-new-raycast) · [The New Raycast](https://www.raycast.com/blog/the-new-raycast) · [New in v2](https://manual.raycast.com/new-in-v2)
- Things：[MacStories 评测](https://www.macstories.net/reviews/things-3-beauty-and-delight-in-a-task-manager/) · [Things 博客](https://culturedcode.com/things/blog/)
- Arc / Dia：[Wikipedia](https://en.wikipedia.org/wiki/Dia_(web_browser)) · [MakeUseOf](https://www.makeuseof.com/arc-supposed-successor-not-even-close/) · [Penkin 复盘](https://www.penkin.me/browsers/arc/dia/2026/01/09/arc-to-dia-revisited.html)
- Vercel Geist：[Colors](https://vercel.com/geist/colors) · [Typography](https://vercel.com/geist/typography)
- Superhuman：[How to build a remarkable command palette](https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/)
- Height：[停运新闻](https://alternativeto.net/news/2025/3/height-project-management-tool-to-shut-down-by-september-2025/)
- Craft：[craft.do](https://www.craft.do/)
- Cron / Notion Calendar：[Cron changelog](https://www.cron.com/changelog) · [Notion Calendar settings](https://www.notion.com/help/notion-calendar-settings)
- Zed：[0.201.4 发布说明](https://zed.dev/releases/stable/0.201.4) · [UI density #18078](https://github.com/zed-industries/zed/issues/18078)
- Warp：[How we designed themes](https://www.warp.dev/blog/how-we-designed-themes-for-the-terminal-a-peek-into-our-process) · [Block model](https://www.warp.dev/blog/block-model-behind-warps-agentic-development-environment)
- Figma UI3：[Our approach to designing UI3](https://www.figma.com/blog/our-approach-to-designing-ui3/) · [设计系统分析](https://medium.com/@successful_zomp_crow_820/analyzing-figmas-design-system-exploring-scalability-consistency-and-maintainability-a31000582699)

**Apple 与 macOS**
- HIG：[Materials](https://developer.apple.com/design/human-interface-guidelines/materials) · [Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars) · [Windows](https://developer.apple.com/design/human-interface-guidelines/windows) · [Focus and selection](https://developer.apple.com/design/human-interface-guidelines/focus-and-selection) · [WWDC25 Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)
- Tahoe 窗口圆角：[lapcat](https://lapcatsoftware.com/articles/2026/3/1.html) · [TidBITS](https://talk.tidbits.com/t/adjust-tahoe-window-corner-radius/33791)
- NN/g 对 Liquid Glass 的批评：[摘要](https://anderegg.ca/2025/10/12/nielsen-norman-group-on-ios-26-usability)

**工业与航空界面**
- Teenage Engineering：[OP-1 layout](https://teenage.engineering/guides/op-1/original/layout) · [Abduzeedo](https://abduzeedo.com/teenage-engineering-masterclass-product-design)
- ISA-101：[LADX](https://ladx.ai/resources/isa-101-hmi-design) · [Aevus](https://aevus.io/learn/isa-101/)
- 暗驾驶舱：[Aviapro](https://aviaproconsulting.com/article/post/engineering-spotlight-the-ergonomics-of-annunciation-%E2%80%93-airbus-lights-out-vs-boeing-quiet-and-dark) · [Aeropeep](https://aeropeep.com/which-aircraft-uses-the-dark-cockpit-concept/)

**AI 生成感**
- [Anthropic：Prompting for frontend aesthetics](https://platform.claude.com/cookbook/coding-prompting-for-frontend-aesthetics) · [avoid-ai-design](https://github.com/funboy322/avoid-ai-design) · [Spot the Slop](https://world.hey.com/kostac/spot-the-slop-a-ui-designer-s-guide-to-fixing-ai-defaults-4c448c9c) · [925studios](https://www.925studios.co/blog/ai-slop-design-tells) · [superdesign](https://superdesign.dev/blog/why-ai-design-looks-generic)

**中文排版与字体**
- [W3C clreq](https://www.w3.org/TR/clreq/) · [clreq-gap](https://www.w3.org/TR/clreq-gap/) · [W3C inline spacing](https://www.w3.org/International/articles/styling/inline-space) · [Chrome CSS i18n](https://developer.chrome.com/blog/css-i18n-features) · [caniuse text-autospace](https://caniuse.com/mdn-css_properties_text-autospace) · [Inter Dynamic Metrics](https://d.rsms.me/inter-website/v3/dynmetrics/)
- WebKit 系统强调色：[csswg #10372](https://github.com/w3c/csswg-drafts/issues/10372)

**Tauri**
- [配置参考](https://v2.tauri.app/reference/config/) · [window-vibrancy](https://github.com/tauri-apps/window-vibrancy) · [tauri#14394](https://github.com/tauri-apps/tauri/issues/14394) · [Window Menu](https://v2.tauri.app/learn/window-menu/)

**图标**
- SF Symbols 许可：[Apple 论坛](https://developer.apple.com/forums/thread/739523) · [HN](https://news.ycombinator.com/item?id=42083430)
- [Central Icons](https://iconists.co/central) · [Central 许可](https://iconists.co/license) · [Radix Icons](https://www.radix-ui.com/icons) · [Phosphor](https://phosphoricons.com)
