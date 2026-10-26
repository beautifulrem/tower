# Tower 设计审计 r5（信息设计、视觉、交互与动效、独特性）

> 日期：2026-10-27。审计人：Fable（独立产品设计视角；判准是 Linear / Things 3 / Raycast 2 / Craft / Arc·Dia / Apple 自家应用，95 分以上意味着"放在这些应用旁边没有一处读起来像模板或 AI 生成"）。
> 范围：D6–D9 与 12 项美学子分。对照 r4（`docs/reviews/design-audit-fable-r4.md`，综合 86）与其后 11 个提交（`5df9887..1dcf29e`：身份列、一页一主按钮、一个概念一个名字、评审单列表、看图键盘、收起卡片有去处、`H`、手机 44pt 与离线态、推送、监督器侧 snooze、链接按网络命名）。
> 取证：仍是锁屏环境，未拍实机窗口。用 **Playwright WebKit 2370**（WKWebView 引擎）渲染真实 Vite 页面，Tauri IPC 用与 `apps/desktop/e2e/tauri.ts` 同构的 shim 回放 **本轮重新 dump 的监督器视图**（`seed_demo` + `dump_views`，英文种子 `/tmp/audit-r5/fx/`，中文种子 `/tmp/audit-r5/fx-zh/`），再叠加 `e2e/rich.ts` 的全部增强（Claude Code 引擎、看图标准、可撤销回退、三文件两单元评审、第二个待验收、CI 失败卡、手机页开启、已收起卡）以及本轮新增的：一条带 ```` ```suggestion ```` 的草稿批注、心跳沉默 100 分钟、12 目标航班牌、空概览、无项目的欢迎页、启动失败页。手机页以 390×844 / 430×844、3× 打开 `remote.html`，`/api/state` 路由拦截。共 **90 张截图**（深/浅、中/英、1100/1440/1800 宽）与一份 DOM 度量（`/tmp/audit-r5/shots/metrics.json`：主按钮计数、<22px 的按钮、被裁切的文本），未入库；下文以 `[编号]` 引用。
> 两处限制：原生菜单（`Menu.popup`）在 shim 下不能真正选中项（就地编辑入口、引擎切换按代码审读）；动效只能从 CSS/JS 判断存在与时序，不能从静态图验证手感。

---

## 0. 总评

r4 的 Top 30 **全部落地**，其中 5 项落地后带出了新的小副作用（§1.3）。这一轮没有新面，全是收口：航班牌身份列不再把 `shop` 压成 `s…`；已暂停页一个主按钮；`Agent's summary` 不再裁切；看图条与标题同列；手机页 44pt、离线可重试、可"稍后"；评审侧栏只剩一份文件列表；比较面板有了 `1 2 3`、`← →`、按住空格与"差异"模式；收起的卡在页脚有去处、`H` 有键。

它现在的位置：**桌面端已经可以放到 Linear 旁边而不显得外行**，剩下的差距是三类——

1. **修 r4 时留下的边角。** 引擎字标 `CC` 在带返工计数的行里被省略成 `· C` [05][07]；年龄列 `1h 40m ago` 在 5em 的列里裁成 `1h 40m a…` [10b]；叠加 / 差异两种比较模式把竖长截图拉到 1500px 宽再裁掉下半截 [39][40]；1100 宽航班牌实况列的分隔点被隐藏后 `bash` 与 `已运行` 粘成 `bashr…` [03][06]。
2. **"一页一个主按钮"只在头部与卡片之间成立。** 待验收目标页同时出现卡片的首选项（监督器给的 `primary`）与"接下来"的 `评审 n 个文件` 两个黑按钮 [29][32]。
3. **不可测量的那一层——独特性——还差一口气。** 诚实语法、字标、空心方框、航班牌都是 Tower 自己的；但标题栏、面板、toast、轨迹面板的形态仍是通用的，手机页仍是"系统字体 + 白卡"。没有任何一处是 AI 味（没有紫色、没有圆角大卡阴影、没有渐变、没有图标方块），但也还没有一处让人一眼记住——除了那个琥珀条头。

全是 S / M 量级。修完 §4 的前 10 项，D6–D8 可到 91–92；D9 要上 90 需要 §6 说的三件事之一真正做出来。

---

## 1. 评分

### 1.1 产品评分表 D6–D9

本轮的维度名与 r4 不同（r4：D6 视觉、D7 信息架构、D8 交互、D9 文案）。为了可比，r4 列按**内容**对位：r5 D6（页面 / 信息设计）← r4 D7；r5 D7（UI 视觉）← r4 D6；r5 D8（交互与动效）← r4 D8；r5 D9（美学独特性）没有 r4 对应项，取 r4 子分 1（美学与原创性 85）与 12（品牌性格 80）的均值 83 作基线。

| 维度 | r4（对位） | r5 | Δ | 判词 |
|---|---|---|---|---|
| D6 页面 / 信息设计 | 85 | **88** | +3 | 做对了：一份文件树按单元分组 [41]；收起卡的页脚 `已收起 1（04:02）· 现在显示` [21]；预算两行固定 [24]；引擎只叫"引擎"；CI 卡在目标页不再重复 PR 行 [29]；无响应态右侧 `最后动静 1h 40m 前` [35]；手机待验收行 ID 进第二行 [81]。扣分：卡片首选项 + `评审 n 个文件` 两个主按钮同页 [29][32]；侧栏 `已验收 · 已结束 1` 与 `已结束 1` 两个折叠组名字几乎一样 [05][06]；1800 宽时卡片止于 840px、右半屏空着而航班牌全宽 [07]；命令面板在概览输入 `rev` 零结果——评审是动词却不在面板里 [76]；右栏 `引擎 › 引擎 Claude Code` 标题与字段同词 [24]；手机离线页标题栏与正文各写一遍 `连不上 Tower` [86]。 |
| D7 UI 视觉设计 | 86 | **88** | +2 | 做对了：建议块 inset 底 + 2px 绿左线，一层底色 [41][42]；QR 内描边 [73]；看图条与标题同列、缩略图 contain [29]；被推翻的说法 kind 降 text-4；铃铛 .7 透明度；就地编辑焦点走边框。扣分：`G-0005 · shop · ⟳ 1/3 · C`——`CC` 被省略成一个字母 [05][07]；`1h 40m a…` [10b]；缩略图 160×96 的黑色 inset 框里只有 58px 宽的页面，深色下像四个黑块 [29][52]；叠加 / 差异模式图片 `width:100%` 拉伸裁切 [39][40]；要求修改面板的 textarea 打开即一圈 1.5px 全亮 outline [54]；1100 下标题栏 `● 引擎` 标签后面没有值 [03][06]；手机页仍是系统字体白卡。 |
| D8 交互与动效 | 88 | **90** | +2 | 做对了：比较面板 `1 2 3` / `← →` / 按住空格 / `交换` [39][40]，关闭后焦点回到缩略图（e2e 已验）；`H` 收起、`?` 表按 `editable()` 过滤 `U`；手机 44pt、`再按一次`、离线 `重试`、`稍后提醒` 两个时刻 [87][88]；动效全部有目的且时序分级（视图 120ms 交叉淡入、进评审 220ms、面板 160ms lift、键盘打开的层不动、新卡 700ms 琥珀衰减、徽章 100ms split-flap、新行 160ms arrive），`prefers-reduced-motion` 全局归零且 `startViewTransition` 跳过——这一点**所有对照的 harness 都没有公开做到**。扣分：标题栏安静铃铛是 12×12 的点击目标（macOS 最小 20pt）；`撤销回退` / `回到这次运行开始时` 16px 高的文字按钮；toast 只有离场没有入场、答完的决策卡没有离场；叠加模式实际不可用（见 D7）；评审没有"接受这个 hunk"（只有反向撤销）。 |
| D9 美学独特性 | 83 | **85** | +2 | 没有 AI 味：无强调色、发丝线、hue 70 暖灰、Inter + JetBrains Mono、两种字重、状态只靠四个小字形。有自己的语法：`◆ 需要你`、`◻ 无响应`、`┆ Agent 称`、印章 `@e9bc9ce`、`红 → 绿`、`事实与声明分开 · 只在需要你时打扰 · 你的仓库不被触碰`。差在：**没有一张能当海报的画面**——空态与启动失败页是左对齐的三段文字 [08][14]，工整但不被记住；标题栏 / 面板 / toast / 轨迹面板是任何一个好应用都会长成的样子；手机页是最接近默认感的面；深色主题 raised 与 bg 仅 0.025 L 差，层次靠边线不靠材质。 |
| **综合** | 85.5 | **88** | +2.5 | |

### 1.2 12 项美学子分

| # | 子项 | r1 | r2 | r3 | r4 | r5 | Δ | 判词 |
|---|---|---|---|---|---|---|---|---|
| 1 | 美学与原创性 | 66 | 76 | 82 | 85 | **86** | +1 | 建议块、树分组、收起页脚都没有"GitHub 味"或"Linear 味"；但本轮没有新增任何记忆点。 |
| 2 | 排版（拉丁 + CJK） | 70 | 79 | 84 | 86 | **87** | +1 | `Summary` 不再裁切；预算两行；中文种子下 `Agent 停下了但没有提交 / 提醒过一次后仍未提交` 是人话 [zh-16]。扣：`· C`、`1h 40m a…`、`bashr…` 三处新裁切。 |
| 3 | 颜色与对比 | 78 | 82 | 86 | 88 | **89** | +1 | 建议块一层底色；被推翻说法降档。扣：缩略图黑 inset 框在深色下是页面上最重的色块 [29]。 |
| 4 | 布局与层级 | 60 | 72 | 80 | 85 | **87** | +2 | 看图条同列、树一份、1100 右栏三列 [25b]。扣：两主按钮；1800 宽卡片搁浅；侧栏两个"已结束"。 |
| 5 | 密度与节奏 | 64 | 75 | 82 | 86 | **88** | +2 | 树行 26px 统一；验证读数面板缩略图 72px；手机一列三段。扣：轨迹每行都重复 `04:29` [36]。 |
| 6 | 组件工艺 | 62 | 74 | 81 | 85 | **87** | +2 | QR 内边、链接键值、`外观` 超时 `秒内可访问` 单位 [65]、编辑态禁用 `已看`。扣：铃铛 12px 目标；叠加模式拉伸；composer 焦点环；`新的配对链接` 幽灵按钮读起来像正文 [73]。 |
| 7 | 动效与反馈 | 45 | 68 | 80 | 82 | **85** | +3 | 本轮读了全部 6 组 keyframes 与 view-transition 规则：存在、分级、有减动画回退。扣：toast 无入场、卡片无离场、`现在显示` 之后没有可见回执（shim 下未见 toast [77]）。 |
| 8 | macOS 原生感 | 72 | 80 | 85 | 87 | **88** | +1 | 手机页守住 44pt；稍后提醒仍走原生菜单。扣：标题栏铃铛目标；文字按钮 16px。 |
| 9 | 图标与字形 | 58 | 80 | 90 | 91 | **91** | 0 | 未变；`unit-caret` 在非当前单元上用 `›` 但其文件仍展开，字形语义与状态不一致 [41]。 |
| 10 | 空 / 加载 / 错误状态 | 55 | 72 | 80 | 86 | **88** | +2 | 手机离线 `连不上 Tower · 重试` [86]；启动失败页 `Tower 无法启动` + 可复制错误块 [14]；`无法在 @a399b8e 上检查` 把"基线跑不起来"说清楚 [29]。扣：离线页同一句两遍；验证读数面板的看图条仍被底边裁一半 [50]。 |
| 11 | 浅色主题 | 68 | 78 | 84 | 87 | **88** | +1 | 浅色建议块 cream + inset 两层可辨 [42]；浅色手机页 [80]。 |
| 12 | 品牌性格 / 记忆点 | 52 | 64 | 72 | 80 | **82** | +2 | 手机页脚"评审留在电脑上"、`差异` 模式、`最后动静`。差：同上，没有海报级画面，材质单一。 |
| | **综合** | 63 | 75 | 82 | 86 | **87** | +1 | |

### 1.3 r4 Top 30 落地核对

| r4 # | 项目 | 状态 | 证据 / 副作用 |
|---|---|---|---|
| 1 | `.g-id` 子项不压缩、引擎缩为 `CC / Pi` | **已修，有副作用** | `app.css:3085-3099`；[01] `G-0002 · shop · CC`。但 `.g-engine { flex: 0 10 auto; overflow:hidden; text-overflow:ellipsis }` 在 `G-0005 · shop · ⟳ 1/3 · CC` 里把两字母省略成 `· C` [05][07]。 |
| 2 | 已暂停页一个主按钮、`重新验证` 只在验证过的目标 | **已修，规则不完整** | [26] 头部 `继续 P` 唯一 primary，卡片 `Continue` 降为中性，运行行 `工作区已回退 ⮌ 撤销回退 共 1 次`。但待验收页卡片首选项与 `评审 n 个文件 R` 仍是两个 primary [29][32]（metrics：`primaries: ["Approve","Review 3 filesR"]`）。 |
| 3 | kind 列 `minmax + ellipsis`，英文 `Summary` | 已修 | `app.css:495,516-522`；[21] `┆ Summary` |
| 4 | 看图条进标题列、`object-fit: contain` | **已修，有副作用** | `app.css:3649-3681`；[29] 缩略图左缘与 `The checkout page…` 同列。`width:160px + contain` 让竖长页面只占框宽 1/3，其余是 inset 黑底 [29][52]。 |
| 5 | 手机 44pt | 已修 | `remote.html:92,101,111,123`；e2e 断言；[81] |
| 6 | 手机离线：隐藏原文、`重试`、`每 5 秒`、超 60s 变 text-1 | 已修 | `remote.html:239-244,320`；[86] |
| 7 | 引擎一个名字；提示仅 Claude Code 时显示；`{engine} 默认` | **已修，一处重复** | [70] `Pi 是 Tower 自带的 Agent 引擎。`；[24] 右栏 `Engine › Engine Claude Code / Model Claude Code default`——区块名与行名同词。 |
| 8 | 预算行两行固定 | 已修 | `app.css:1618-1627`；[24] |
| 9 | 收件箱页脚 `已收起 n（HH:MM）`、`h` | 已修 | `Inbox.tsx:56`、`app.css:1912-1941`；[21] |
| 10 | 评审侧栏合并：单元作树的分组 | **已修，字形语义存疑** | [41] `src/ 2 个文件 9 行 › cart/ › money.js`；`test/` 前的 `›` 像"折叠"，其下 `setup.js` 却展开着。 |
| 11 | 建议块 inset + 绿左线 | 已修 | `app.css:3631-3642`；[41][42] |
| 12 | 就地编辑焦点走边框；编辑中禁用 `已看` | 已修 | `app.css:3614-3618`、`FileDiff.tsx:154` |
| 13 | 目标页 CI 卡不重复 PR 行 | 已修 | `DecisionCard.tsx:169`；[29] |
| 14 | 无响应态 `最后动静`；年龄列 <3h 用 duration | **已修，有副作用** | [35] `最后动静 1h 40m 前`；但 `.g-row` 年龄列 5em 装不下 `1h 40m ago` → `1h 40m a…` [10b]。 |
| 15 | 比较面板键盘 `1/2`、`← →`、空格 | 已修 | `Look.tsx:85-90`；e2e；[39] 提示行 `1 2 3 switch · ← → adjust · ␣ hold for before` |
| 16 | `差异` 模式与 `交换` | **已修，不可用** | `app.css:3760`；[40] `mix-blend-mode: difference` 成立，但 `.look-onion img { width:100% }` 把 390 宽的页面拉到 1500px、`max-height: 64vh` 再裁掉下半，叠加模式同 [39]。 |
| 17 | 手机块链接键值、端口未开启禁用 | 已修 | [73] `Tailscale 100.101.102.103:7317 ⧉ / Local network 192.168.1.24:7317 ⧉`；e2e 断言 disabled |
| 18 | `+ 外观`、占位 `这个页面应该看起来怎样`、`秒内可访问` | 已修 | [65] |
| 19 | 手机 snooze | 已修 | `remote.html:271`；[87] `稍后提醒 · 1 小时后 · 明天 9:00` 行内展开，不开 sheet |
| 20 | 建议块 `white-space: pre; overflow-x: auto` | 已修 | [43] 1100 下横向裁切不折词 |
| 21 | 1100 下引擎标进实况列前缀 | **已修，有副作用** | [03][06] `CC 执行 bash已…` / `CC Working bashr…`——`.g-live .live-detail .sep { display:none }` 删了分隔点，`bash` 与 `已运行 / running` 粘连。 |
| 22 | 侧栏 `已验收 · 已结束` 默认折叠 | 已修 | `Sidebar.tsx:22`；[05] |
| 23 | 收件箱 `(goal, kind, subject)` 去重 | 已修 | `store.ts:154 dedupeInbox`；[36] 轨迹不再两行 `撤回` |
| 24 | 验证读数面板缩略图 72px | 已修 | `app.css:3680-3686`；[50] 仍被面板底边裁掉下半（面板可滚动，首屏不可见） |
| 25 | 手机待验收行 ID 进第二行；`question.code` 15px | 已修 | `remote.html:86,287`；[81] |
| 26 | `?` 表按 `editable()` 隐藏 `U` | 已修 | `Review.tsx:276 when: editable` |
| 27 | 被推翻行 kind 降 text-4 | 已修 | `app.css:524-527 .claim-dim` |
| 28 | 空态 `clamp(120px, 24vh, 280px)` | 已修 | `app.css:3171`；[08] |
| 29 | 欢迎页 Pi 行按引擎切换 | 已修 | `Welcome.tsx:119` |
| 30 | `.editor-main { padding-bottom: 56px }`；look 超时分列 | 已修 | `app.css:2683-2686,2735-2740`；[65] |

---

## 2. 全局问题与修法

### 2.1 身份列：`CC` 被省略成 `C`

现状 [05][07]：12 目标航班牌里 `G-0005 · shop · ⟳ 1/3 · CC` 的最后一段显示为 `· C`。`.g-engine` 是 `flex: 0 10 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis`——两字母字标被压到一个字母、省略号又放不下，于是只剩 `C`。1440 宽、11.5em 的列在"ID + 项目 + 返工 + 引擎"四段同在时就不够。

修法（S）：`.g-engine { flex: 0 0 auto; min-width: 2ch }`，让位顺序改为 **项目名先缩**（`.g-project { min-width: 3.5em }` 已有），四段仍放不下时整段 `.g-engine` 在 `@container`/媒体查询下隐藏并进 `title`。字标永远整字出现或不出现，不出现半个。

### 2.2 年龄列 5em：`1h 40m a…`

现状 [10b]：`.g-row` 的年龄列 `5em`（`app.css:2993`），英文 `1h 40m ago` 10 字符溢出。中文 `1h 40m 前` 刚好。

修法（S）：年龄列 `6.5em`；或 duration 形式去掉 `ago`——航班牌上所有年龄都是"多久以前"，`2 小时前 / 2h` 一致即可（Linear 的列表就只写 `2h`）。

### 2.3 叠加 / 差异模式把截图拉伸裁切

现状 [39][40]：`.look-onion img { width: 100% }` + 容器 `max-height: 64vh; overflow: auto`。390×640 的页面截图被拉到约 1500px 宽、2460px 高，首屏只看到页眉和一条占位；`差异` 模式里只剩一个被切断的灰块。并排模式 [38] 是对的（`width:auto; max-width:100%; max-height:60vh`）。

修法（S）：

```css
.look-onion { display: inline-block; max-width: 100%; max-height: 64vh; overflow: hidden; }
.look-onion img { width: auto; max-width: 100%; max-height: 64vh; }
.look-onion img + img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
```

并在容器外层 `text-align: center`，让竖长页面居中立着；横向大页面再允许滚动。

### 2.4 一页两个主按钮（卡片 + 接下来）

现状 [29][32]：G-0001 待验收页：CI 卡 `Send the failures to the agent`（监督器 tone=primary）与"接下来"的 `评审 1 个文件 R` 同为 `btn-primary`。G-0003：`Approve` 与 `Review 3 files R`。r4 的规则只处理了"头部 vs 卡片"。

修法（S）：`GoalPage.tsx` 的 Next 区块在 `inbox().length > 0` 时把主动作降为 `btn-secondary`（保留键帽 `R`），因为卡片是这页唯一的问题句——与 r4 §2.2 的头部规则同源。或者反过来：待验收页上卡片的首选项降为中性、Next 保持 primary——但卡片的 tone 来自监督器，前端覆写会让手机与桌面不一致，所以降 Next 更稳。

### 2.5 1100 宽实况列：`bashr…`

现状 [03][06]：`@media (max-width:1240px) .g-live .live-detail .sep { display:none }` 把 `bash · npm test · 已运行 1h 49m` 的分隔点删掉后，详情被截到 `bash已…` / `bashr…`。

修法（S）：不隐藏分隔点，改为在窄窗只显示**第一段**（工具名 + 目标）并把 `已运行` 挪到 `title`；或用 `" "` 代替 `·`。

### 2.6 侧栏两个"已结束"

现状 [05][06]：底部两个折叠组 `已验收 · 已结束 1` 与 `已结束 1`（英文 `Accepted · ended 1` / `Ended 1`）。一个是 accepted/integrated，一个是 abandoned/archived；两个名字共用"已结束"，读者要点开才知道差别。

修法（S）：`labels.ts groupLabel` 与 `zh-CN.ts done/ended`：`已验收 n` / `已放弃 n`（英文 `Accepted` / `Abandoned`）；或合并成一个 `已结束 n` 组，组内行用状态字形区分（✓ / ○）。

### 2.7 命令面板缺动词

现状 [76]：概览里 `⌘K` 输入 `rev` → `No matches for "rev"`。`commands()`（`Chrome.tsx:247-275`）只在当前是目标页时加 `review`；其余是导航 + 目标名。Raycast / Linear 的面板首先是动词表。

修法（S）：对每个 `in_review` 目标加 `评审 G-0001 · Fix the cart total`，对收件箱每张卡加 `回答 G-0004 · 已暂停`，加 `依次评审全部待验收 ⇧R`、`收起当前卡 H`、`新的配对链接`。空结果句也该给出口：`没有匹配 · 按 N 新建目标`。

### 2.8 点击目标

| 位置 | 现状 | 应为 |
|---|---|---|
| 标题栏安静铃铛 `.gauge-quiet` [01] | 12×12（`Chrome.tsx:125` 只有 12px 图标，无 padding） | `min-width/height: 22px`，图标居中；与右侧 `⌕` 同尺寸 |
| `撤销回退` / `回到这次运行开始时` [26] | 文字按钮 16px 高 | `min-height: 20px; padding: 2px 0` |
| 行号旁 `+` 批注 | 16×16 | 可以（行号本身可点、有键），但 hover 区域放大到整格 |
| 手机页 | 全部 ≥ 40/44 | 已合格 |

### 2.9 文案与排版校对

| 位置 | 现状 | 应为 |
|---|---|---|
| 右栏引擎区块 [24] | `Engine › Engine Claude Code · Model Claude Code default` | 区块 `引擎`，行 `名称 Claude Code / 模型 Claude Code 默认`；默认引擎时只有 `模型 Pi 默认` 一行 [26]——区块名与唯一一行不同词，可接受 |
| 1100 标题栏 [03] | `● 引擎`（名字与版本被隐藏后标签独存） | 窄窗时整段隐藏或只留 `●` 并把名字进 `title` |
| 手机离线 [86] | 标题栏 `■ 连不上 Tower` + 正文 `■ 连不上 Tower · 重试` | 标题栏改 `上次更新 04:36`，正文留一句 + `重试` |
| 轨迹 [36] | 每行都写 `04:29` | 同一分钟只写一次，其余行留空（Things 的日志、Linear 的活动流都这么做） |
| 树的单元行 [41] | 非当前单元 `› test/`，文件却展开 | 当前单元用选中底色，caret 只表示折叠 |
| `新的配对链接` [73] | 幽灵按钮，无边框，与右侧说明句同一行同重 | `btn-secondary`，或下划线链接样式 |
| 收件箱选项语言 [16] | 中文界面 + 英文选项（种子语言 = 创建时监督器语言） | 产品层：切换语言后由监督器重算未决卡的选项文案；UI 不改 |
| 验收面板禁用主按钮 [52] | `验收并更新分支` 禁用态与次按钮几乎同形 | 保持 primary 形、整体 `opacity: .45`，让"这是主动作，只是还不能按"可读 |

---

## 3. 逐屏审计

### 3.1 标题栏与侧栏 [01][05][10b]

做对了：`◻ silent for 1h 40m` 空心方框 + 行徽章 `Unresponsive`；`验证中` 独立组；12 目标时 `已验收 · 已结束` 折叠。

问题：铃铛 12px（§2.8）；两个"已结束"（§2.6）；1100 下 `● 引擎` 空标签（§2.9）。

### 3.2 概览 / 航班牌 [01]–[10b]

做对了：`G-0002 · shop · CC`；1100 下 `CC 执行` 前缀；空态海报 `clamp` 后在 900 高下位于 1/3 处 [08]。

问题：`· C`（§2.1）；`1h 40m a…`（§2.2）；`bashr…`（§2.5）；1800 宽 [07] 决策卡止于 840px、右侧 900px 空白，而其下的航班牌全宽——两种宽度规则在同一屏打架。建议：整个视图 `max-width: 1280px; margin: 0 auto`（Linear 的 issue 视图、Craft 的文档都这样），卡片与牌在同一容器里。

### 3.3 需要你 [16]–[22]

做对了：焦点卡琥珀条头 + `1 / 2` 键帽；页脚 `J K 移动 · 1-9 选择 · H 稍后 · 放弃需按两次`；`已收起 1（04:02）` 展开后 `G-0002 Which discount applies first? · 04:02 再提醒 · 现在显示` [20][21]。中文种子下卡片文案 `Agent 停下了但没有提交 / 提醒过一次后仍未提交 / 继续 1 · 放弃这个目标 2` [zh-16]。

问题：`现在显示` 之后在 shim 下没有看到 toast [77]（可能是 shim 不回写状态；建议 e2e 断言 toast 出现）。

### 3.4 目标页 [23]–[37]

做对了：`超时` chip、`墙钟 109 / 90 分` 琥珀段、两行预算 [24]；`最后动静 1h 40m 前` [35]；运行行 `工作区已回退 ⮌ 撤销回退 共 1 次` [26]；`无法在 @a399b8e 上检查`、`红 → 绿` [29]；账本 `Criterion met … Consistent` [32]；轨迹工具行一行一读 [36]。

问题：两主按钮（§2.4）；`Engine › Engine`（§2.9）；缩略图黑框（§2.10 见下）；轨迹时间重复（§2.9）。

**缩略图黑框**（M 级视觉问题）[29][52]：`.look-img { width:160px; height:96px; object-fit:contain; background: var(--bg-inset) }`——竖长页面在 160×96 里只占 58px 宽，两侧是 51px 的深色空白，四张一排像四块黑砖。修法：`width: auto; max-width: 160px; height: 96px`，让竖图就是竖图（58×96），横图撑满 160。

### 3.5 评审 [41]–[59]

做对了：树按单元分组、文件只出现一次 [41]；`⌘P` 命中项带 `+7 −0` [45]；建议块一层底色、`应用建议` [41]；`要求修改（1 条批注） C` 头部计数；要求修改面板里 `src/cart.js:2 Round at the end… · 建议` [54]；队列 `队列 1 / 2` 进标题行 [56]；`?` 表两栏对齐 [59]。

问题：caret 语义（§2.9）；composer textarea 全亮焦点环 [54]——`input:focus-visible, textarea:focus-visible { outline }`（`app.css:832`）对面板里首焦点的 textarea 也生效；建议 `.panel textarea:focus, .composer textarea:focus { outline: none; border-color: var(--border-strong) }`，与就地编辑一致；验证读数面板看图条首屏被裁 [50]——把看图条放在该标准输出尾巴**之前**，或面板底部加渐隐提示可滚动。

### 3.6 合同编辑器 [61]–[66]

做对了：`+ 命令 · + 外观 · + 人工`；外观行 `60 秒内可访问` + `pnpm dev` / `http://localhost:3000/` 两格 [65]；`Engine` 区块 `Default (Pi)` / `Pi default` / `From your Pi configuration.` [62]。

问题：`Engine › Engine` 同词（§2.9）；1440 宽下底部 sticky 条仍遮住视口内最后一行提示——这是滚动位置而非终端留白，可接受，但 sticky 条可以加 8px 的上渐隐让"下面还有"可见。

### 3.7 设置 [68]–[74]

做对了：`Pi 是 Tower 自带的 Agent 引擎。`；两条环境问题各带修复动作（`npm i -g …` / `打开 Pi 登录`）[70]；手机块键值链接 + 两句网络诚实话 + ntfy 字段与"只有标题离开这台机器"的说明 [73]。

问题：`新的配对链接` 幽灵按钮（§2.9）。

### 3.8 手机页 [80]–[89b]

做对了：44pt；`稍后提醒 · 1 小时后 · 明天 9:00` 行内展开 [87]；`再按一次` [88]；离线 `连不上 Tower · 重试` [86]；桌面专属决定 `◇ 在电脑上：允许` 命名而不提供 [89b]；待验收行 `✓ @e9bc9ce · G-0001 · 回到电脑上评审并验收`；页脚立场句；中文种子下 `继续 / 放弃这个目标 / 批准 / 驳回` [zh-80]。

问题：离线句两遍（§2.9）；仍是最接近默认感的面——系统字体、白卡、1px 边；若要像 Things 而不是像一个 PWA，至少做三件事：条头 28px 改为 32px 并加 2px 琥珀左缘（与桌面焦点卡呼应）、卡与卡之间 10px 改 12px、运行行加 `已运行 1h 49m`。

### 3.9 欢迎 / 启动失败 / 空态 [08][11]–[15]

做对了：欢迎页右栏 `环境检查` 与字标同线 [12]；启动失败页 `Tower 无法启动` + 可复制错误 + `重试` + 三条规则 [14]；空概览 [08]。

问题：这些页面全部是"字标 + 标题 + 一段 + 按钮 + 三条规则"的左对齐块——结构正确，但三个页面长得一样；至少空概览可以给航班牌一个**空骨架**（三行 36px 的发丝线与列头），让人看见"这里以后是什么"。

### 3.10 动效与焦点（代码审读）

- 时序分级清晰：`--dur-fast 100`（徽章 swap）、`--dur-base 160`（面板 lift、新行 arrive）、`--dur-view 120`（视图交叉淡入）、`--dur-space 220`（进出评审）、`--dur-attn 700`（新卡琥珀衰减）；`--ease-out` 进、`--ease-in` 出；键盘打开的层 `.overlay.instant` 不动。
- 减动画：`base.css:176` 全局归零；`nav.ts:28` 跳过 `startViewTransition`。
- 缺口：`.toast` 只有 `.leaving { opacity: 0 }`，没有入场；决策卡被回答后直接从 DOM 消失，没有 160ms 的高度收起；`.g-row` 状态分组变化（运行 → 验证中）没有位移动画——Linear 的列表会做一次 FLIP。
- 焦点：全局 `:focus-visible 1.5px var(--focus)`，16 处组件级覆写；`Overlay initialFocus="panel"` 已验；嵌套 overlay（验收面板里开看图）焦点归还由 e2e 覆盖了外层，内层仍未测。

---

## 4. 距离 95 分还差什么：Top 25

影响：H = 主画面可见破损或原则级；M = 单屏明显；L = 细节。量：S < 半天，M ≈ 1 天，L ≈ 2–3 天。预期：完成 1–10 后 D6–D8 约 91–92；完成 1–18 后约 93；19–25 是 D9 的事。

| # | 改动 | 文件 | 预期效果 | 解锁 | 影响/量 |
|---|---|---|---|---|---|
| 1 | `.g-engine { flex:0 0 auto; min-width:2ch }`，放不下时整段隐藏进 `title` | `app.css:3094-3099`、`GoalRow.tsx` | 不再 `· C` | D7 +1 | H / S |
| 2 | 年龄列 `6.5em` 或去 `ago` | `app.css:2993`、`format.ts` | 不再 `1h 40m a…` | D7 | H / S |
| 3 | 叠加 / 差异模式图片 `width:auto; max-height:64vh`，容器居中 | `app.css:3744-3758`、`Look.tsx` | 两种模式真能看 | D8 +1 | H / S |
| 4 | 有卡时 Next 主动作降 secondary | `GoalPage.tsx` Next 区块 | 一页一个主按钮，任何状态 | D6 +1 | H / S |
| 5 | 1100 实况列保留分隔或只显示第一段 | `app.css` `@media(max-width:1240px) .g-live` | 不再 `bashr…` | D7 | M / S |
| 6 | 缩略图 `width:auto; max-width:160px` | `app.css:3669-3679` | 竖图是竖图，不是黑砖 | D7 +1 | M / S |
| 7 | 标题栏铃铛 22×22；文字按钮 `min-height:20px` | `Chrome.tsx:125`、`app.css .gauge-quiet/.run-rollback` | 点得到 | D8 | M / S |
| 8 | 侧栏 `已验收 / 已放弃` 或合并 | `labels.ts groupLabel`、`zh-CN.ts:85,226`、`en.ts` | 两个组名可分辨 | D6 | M / S |
| 9 | 命令面板加动词：每个待验收 `评审 G-…`、每张卡 `回答 …`、`⇧R`、`H` | `Chrome.tsx:247-275` | `rev` 有结果 | D6 +1、D8 | M / S |
| 10 | composer / 面板 textarea 焦点走边框 | `app.css:832`、`.panel textarea` | 面板打开时安静 | D7 | M / S |
| 11 | 右栏引擎区块行名 `名称`；1100 标题栏隐藏空 `引擎` 标签 | `GoalPage.tsx ContractRail`、`Chrome.tsx`/`app.css` | 不重复、不空挂 | D6 | L / S |
| 12 | 整个视图 `max-width:1280px; margin:0 auto`（概览、收件箱、目标页） | `app.css .view` | 1800 宽不搁浅 | D6 +1 | M / S |
| 13 | toast 入场 `lift 160ms`；答完的卡 `height → 0` 160ms；评审队列切换 220ms | `app.css .toast/.decision`、`Inbox.tsx` | 反馈闭环 | D8 +1 | M / M |
| 14 | 轨迹同分钟只写一次时间 | `Trace.tsx` | 列更安静 | D7 | L / S |
| 15 | 树：当前单元用选中底，caret 只表示折叠 | `Review.tsx unit-caret`、`app.css` | 字形不说谎 | D7 | L / S |
| 16 | 验证读数面板看图条移到输出之前 | `panels.tsx` | 首屏可见 | D6 | L / S |
| 17 | 手机离线页标题栏改 `上次更新 HH:MM` | `remote.html:321` | 一句一次 | D6 | L / S |
| 18 | 验收面板禁用主按钮保持 primary 形 + 透明度 | `app.css:678` | 主动作可辨 | D7 | L / S |
| 19 | 空概览给航班牌空骨架（三行发丝线 + 列头） | `Overview.tsx`、`ui.tsx Empty` | 空态有"这里以后是什么" | D9 +1 | M / M |
| 20 | 手机页：条头 32px + 2px 琥珀左缘、卡距 12px、运行行加时长 | `remote.html` | 手机页像 Things 不像 PWA | D9 +1、D7 | M / S |
| 21 | 深色材质：`--bg-raised` 0.205 → 0.215、卡片 `box-shadow: 0 1px 0 oklch(0 0 0/.3)` 一道底线 | `tokens.css`、`app.css .decision/.file` | 层次靠材质不只靠边线 | D9 | M / S |
| 22 | 评审"接受这个 hunk"（与 `U` 撤销成对，Zed keep/reject） | `Review.tsx`、`FileDiff.tsx`、监督器 API | 评审器追平 | D8 +1 | M / L |
| 23 | 航班牌分组变化 FLIP 位移（运行 → 验证中） | `Overview.tsx`、`app.css` | 牌像仪表不像列表刷新 | D8、D9 | L / M |
| 24 | 标题栏心跳做成 Tower 自己的仪表：`◐ 1/4` 的半圆按运行数填充、沉默时空心方框脉动一次 | `Chrome.tsx Gauges`、`Glyph.tsx` | 一个记忆点 | D9 +1 | L / M |
| 25 | 监督器：切换语言后重算未决卡选项文案 | `tower-supervisor` | 中文界面不混英文按钮 | D6 | M / M |

---

## 5. 与主流 harness GUI 的对比（2026-08 至 10 月）

对照对象与时间点（来源见脚注）：Claude Code 桌面（04-14 围绕并行会话重建；10-15 右侧"会话栏"卡片、计划框结束时变成"下一步按钮"、嵌套会话缩进、按环境分组；Remote Control 出预览，手机可在任意机器开会话；仍只有统一 diff，无中文）[^cc1][^cc2][^cc3]；Codex（07-09 并入 ChatGPT 桌面；侧栏 sections；`⌘⌥A` 下一个需要注意；统一 / 并排 diff + 内联编辑；手机可改批准、内联评论；10-22 手机上从输入框上方停后台命令；UI 仍英文，评测说"紧凑而不精致、层级弱、快捷键不可发现"，侧栏展开时 10–15 FPS）[^cx1][^cx2][^cx3]；Cursor 3（Agents Window 平铺；iOS Live Activities 三态推送；10-06 远程控制本地 agent；评测说"与代码失去连接"）[^cu1][^cu2][^cu3]；Conductor（09-02 diff 内直接编辑；09-09 sections / routines；10-02 iOS；10-23 远程控制、可自定义快捷键、手动排列、按 ⌘ 显示编号提示）[^co1][^co2]；Zed（线程侧栏按项目分组、`alt-/` which-key）[^zd1]；Devin 桌面（10-23 看板式"指挥中心"）[^dv1]；Linear（09-03 优先收件箱；`H` 收起；10-08 堆叠 PR 折叠行；10-22 评论筛选、`⌘⌥X` 关 toast）[^ln1][^ln2]；Raycast 2.4–2.9（Golden Gate 适配、自动对比度、可关闭 HUD、减少闪烁）[^rc1]；Things 3.24–3.25（按住 snooze 立即出选项；Duo 布局与全键盘）[^th1]；Apple（macOS 27 Golden Gate：玻璃强度滑杆、统一圆角、Reduce Motion 关闭弹性；44pt 触控、Mac 指针 20pt 最小）[^ap1][^ap2]。

### 5.1 Tower 落后的地方

| 方面 | 它们 | Tower | 差距性质 |
|---|---|---|---|
| 评审器 | Codex 内联编辑 + 并排；Conductor diff 内编辑 + Viewed；Zed 按 hunk keep/reject；Linear 分段引导评审 | 树 + ⌘P + 就地编辑 + 建议块 + 撤销 hunk + 内容哈希 `已看` | 只差"接受这个 hunk"（#22）；其余持平或更好 |
| 手机 | Cursor Live Activities 三态推送；Codex 手机内联评论、可改批准；Conductor 远控 | 一页 HTML + ntfy 推送 + 批准 / 暂停 / 稍后；评审留在电脑 | 立场正确；工艺这一轮补齐（44pt、离线、snooze）；缺的是"像一个 iOS 应用"的材质（#20） |
| 面板灵活性 | Claude Code 拖放面板、Cursor 平铺、Conductor 可自定义快捷键 | 固定三区；1100 全部可用 | 选择而非缺陷；但快捷键仍不可自定义 |
| 命令面板 | Raycast / Linear 以动词为先 | 导航 + 目标名；评审动词只在目标页 | #9 |
| 材质 | Raycast 2 透明 web 视图 + 原生浮层；Things 玻璃收敛；Apple 统一圆角 | 平面暖灰 + 发丝线 | 方向与 Linear 一致；但深色层次略平（#21） |

### 5.2 Tower 领先的地方

1. **动效与减动画。** 六组 keyframes 全部有名字有理由、时序分四级、键盘打开的层不动、`prefers-reduced-motion` 全局归零——对照的七个 harness 没有一个公开写过自己的减动画行为。
2. **主画面不是对话流。** 2026 年所有竞品收敛成"线程侧栏 + 聊天 + diff"，Devin 甚至退回看板；Tower 是航班牌 + 决策卡，`◻ 无响应 1h 40m` 这种读数没有任何竞品 UI 层会说。
3. **诚实语法扩到了看图与账本。** `红 → 绿`、`无法在 @a399b8e 上检查`、`Criterion met … Consistent`、截图"是否算通过，由你勾选"。
4. **键盘注册表 + 中文。** `?` 表从注册表生成并按状态过滤；中文种子下卡片文案是人写的（`Agent 停下了但没有提交`）。Claude Code 侧栏在 ja-JP 下仍是英文，Codex 的 i18n 在 flag 后面，Cursor 中文仍是论坛请求。
5. **手机页的立场与诚实。** "评审留在电脑上"、"在电脑上：允许"（命名而不提供）、"只有标题离开这台机器"。

### 5.3 一句话定位

与 Codex / Claude Code / Conductor / Cursor 相比，Tower 在"按 hunk 接受、面板灵活、手机材质"上落后半步，在"信息架构原创性、诚实语法、动效纪律、键盘与中文"上领先一代。r4 的接缝这一轮缝上了；留下的是五处 S 级边角（`· C`、`1h 40m a…`、叠加拉伸、`bashr…`、两主按钮）和一个 D9 的问题：**它已经不像任何别人，但还没有一张画面让人记住它像什么。**

---

## 6. 要到 95，每个维度必须成立的事

**D6 页面 / 信息设计（88 → 95）**
- 任何页面、任何状态只有一个主按钮——包括卡片与"接下来"同在时（#4）。
- 每个概念只有一个名字、每个组名可区分（#8、#11）。
- 命令面板是动词表：任何地方都能 `评审 G-0001`、`回答 G-0004`、`收起`（#9）。
- 宽度规则只有一套：1100 到 1800 之间，卡片与航班牌在同一个容器里呼吸（#12）。
- 没有一处裁切（#1、#2、#5）。

**D7 UI 视觉设计（88 → 95）**
- 图片从不被拉伸或装进不合身的框（#3、#6）。
- 焦点只有两种形态：控件一圈 1.5px、字段一道边框，面板打开时不闪环（#10）。
- 深色层次有材质：raised 与 app 的差能被看见，不只靠 1px 线（#21）。
- 点击目标无一低于 20pt（桌面）/ 44pt（手机）（#7）。
- 轨迹、树、面板的次要信息（时间、caret、禁用态）各自安静（#14、#15、#18）。

**D8 交互与动效（90 → 95）**
- 反馈闭环：每个动作有入场与离场——toast 进出、卡片答完收起、队列切换的 220ms（#13）。
- 评审动作成对：撤销 hunk 旁边有接受 hunk（#22）。
- 航班牌分组变化有位移而不是刷新（#23）。
- 嵌套 overlay 的焦点归还有测试覆盖。

**D9 美学独特性（85 → 95）**
- 一张海报级画面：空概览的航班牌骨架（#19），或标题栏心跳做成 Tower 自己的仪表（#24）——让人在截图里一眼认出是 Tower，不靠字标。
- 手机页与桌面是同一支笔：琥珀左缘、32px 条头、时长读数（#20）。
- 材质有一点自己的脾气：深色 raised 的一道底线、浅色卡片的 cream 边（#21）；不追玻璃。
- 三个空态 / 错误页不再长得一样：各自回答"这里以后是什么"。

---

## 7. 附：本轮截图清单（`/tmp/audit-r5/shots/`、`/tmp/audit-r5/shots-zh/`，未入库）

| 编号 | 内容 |
|---|---|
| 01–04 | 概览（rich）：深中 1440、浅英 1440、深中 1100、浅英 1100 |
| 05–07 | 概览 12 目标：深中 1440、浅英 1100、深中 1800×1100 |
| 08–09 | 空概览：深中、浅英 |
| 10, 10b | 概览无响应态：深中、浅英 |
| 11–13 | 欢迎（无项目）：深中、浅英、深英 1100 |
| 14–15 | 启动失败：深中、浅英 |
| 16–22 | 需要你：深中、浅英、深中 1100、空（深中 / 浅英）、已收起展开（深中 / 浅英）、`j` 焦点 |
| 23–25b | G-0002 运行中（Claude Code）：深中、浅英、深中 1100、1100 全页 |
| 26–27 | G-0004 已暂停 + 可撤销回退：深中、浅英 |
| 28–30b | G-0001 待验收 + 看图 + CI：深中、深中全页、浅英、浅英 1100 全页 |
| 31–32 | G-0003 返工 + 账本：深中、浅英全页 |
| 35 | G-0002 无响应 + 超时 |
| 36–37 | 轨迹：G-0002 深中、G-0003 浅英 |
| 38–40 | 比较面板：并排深中、叠加浅英、差异深中 |
| 40c | 目标页快捷键表 |
| 41–45 | 评审 G-0003 三文件 + 树 + 建议块：深中、浅英、深中 1100、并排、⌘P `money` |
| 48–49 | 评审 G-0001 单文件：深中、浅英 |
| 50–51 | 验证读数：G-0001 深中、G-0003 浅英 |
| 52–53 | 验收面板：深中、浅英 |
| 54 | 要求修改（含 `· 建议`） |
| 56 | 评审队列 `队列 1 / 2` |
| 58 | 评审 G-0002 没有改动 |
| 59–60 | 快捷键表：评审深中、需要你浅英 |
| 61–66 | 合同编辑器：深中、浅英、深英 1100 全页、深中全页、`+ 外观` 后、浅英 |
| 68–73 | 设置：深中、浅英、深中全页、浅英 1100 全页、手机块深中 / 浅英 |
| 75–77 | 命令面板深中、浅英 `rev`、`现在显示` 之后 |
| 80–89b | 手机页：中浅、中深、英浅、英深全页、中浅全页、空态、离线（中深 / 英浅）、稍后展开、按两次、430 宽、桌面专属决定 |
| zh-* | 同一组屏在中文种子（`fx-zh`）下：卡片选项与说法为中文 |
| metrics.json | 每屏主按钮计数、<22px 按钮、被裁切文本、控制台错误（全部 0 错误） |

[^cc1]: Anthropic, "Redesigning Claude Code on desktop for parallel agents"（2026-04-14），https://claude.com/blog/claude-code-desktop-redesign
[^cc2]: Claude Cowork / Code desktop changelog（2026-10-15 session rail、plan recap、nested sessions），https://claude.com/docs/cowork/changelog ；https://code.claude.com/docs/en/changelog
[^cc3]: The New Stack, "Claude Code desktop redesign"（统一 diff vs Codex 并排），https://thenewstack.io/claude-code-desktop-redesign/ ；issue #73984（ja-JP 侧栏英文），https://github.com/anthropics/claude-code/issues/73984
[^cx1]: OpenAI Help Center, ChatGPT / Codex release notes（2026-07-09、10-08、10-22），https://learn.chatgpt.com/docs/changelog
[^cx2]: We The Flywheel, "Codex desktop app review"（2026-09-16），https://wetheflywheel.com/en/guides/codex-desktop-app-review/
[^cx3]: openai/codex issues #48760（侧栏卡顿）、#23815（i18n），https://github.com/openai/codex/issues/48760
[^cu1]: Cursor Changelog 3.1（Agents Window 平铺），https://cursor.com/changelog/3-1
[^cu2]: Cursor, iOS app（Live Activities、三态推送），https://cursor.com/changelog/ios-mobile-app
[^cu3]: Cursor Changelog, "Remote control for local agents"（2026-10-06），https://cursor.com/changelog ；InfoQ（2026-04-16）评测，https://www.infoq.com/news/2026/04/cursor-3-agent-first-interface/
[^co1]: Conductor Changelog 0.84.0（diff 内编辑）、0.85.0（sections / routines），https://www.conductor.build/changelog/0.84.0-edit-files-directly-in-diffs
[^co2]: Conductor Changelog 0.90.0（iOS）、0.92.0（远程控制、自定义快捷键），https://www.conductor.build/changelog/0.92.0-remote-control
[^zd1]: Zed releases / docs, Parallel Agents 与 threads sidebar，https://zed.dev/releases/stable ；https://zed.dev/docs/ai/parallel-agents
[^dv1]: Devin desktop changelog（2026-10-23 Agent Command Center），https://docs.devin.ai/desktop/changelog
[^ln1]: Linear Changelog（2026-09-03 优先收件箱；10-08 堆叠 PR；10-22 评论筛选），https://linear.app/changelog
[^ln2]: Linear Docs, Inbox（`H` 收起）；"Reviewing code in the agent era"，https://linear.app/docs/inbox ；https://linear.app/now/reviewing-code-in-the-agent-era
[^rc1]: Raycast Changelog 2.4–2.9（Golden Gate、自动对比度、可关闭 HUD），https://www.raycast.com/changelog
[^th1]: Cultured Code, Things 3.24 / 3.25，https://culturedcode.com/things/blog/
[^ap1]: MacRumors / 9to5Mac, macOS 27 Golden Gate Liquid Glass 控制（2026-06-09、09-22），https://www.macrumors.com/2026/06/09/macos-golden-gate-liquid-glass/
[^ap2]: Apple HIG, What's new（2026-06-08）；WWDC25 session 219（Reduce Motion / Reduce Transparency 行为），https://developer.apple.com/design/whats-new/ ；https://developer.apple.com/videos/play/wwdc2025/219/
