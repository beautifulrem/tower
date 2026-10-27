# Tower 设计审计 r7（信息设计、视觉、交互与动效、独特性）

> 日期：2026-10-27。审计人：Fable（独立产品设计视角；判准不变：Linear / Things 3 / Raycast 2 / Craft / Arc·Dia / Apple 自家应用，95 分以上意味着"放在这些应用旁边没有一处读起来像模板或 AI 生成"）。
> 范围：D6–D9 与 12 项美学子分。对照 r6（`docs/reviews/design-audit-fable-r6.md`，综合 89.5）与其后 27 个提交（`c81328d..188fe2a`）：一轮实现——r6 Top 20 全部动过（字段焦点、无改动评审页、简报一行、手机保留测试卡、折叠挂在卡片上、手机问题句位置、提示句与 ◇、20pt 文字目标与批注格、配对链接、`TAIL_LINES`、状态词、骨架列头、**接受这个 hunk**、轨迹渐隐、面板分组、嵌套 sheet 焦点测试、toast 左缘、手机骨架与刻度字距、评审树滑入、运行环转到位），外加三块新面：金丝雀读数（`断言已检查 / 未检查 / 必然失败的测试通过了`）、哨兵详情分寄存器排版、git 身份就地表单、保留测试卡上的失败测试名。
> 取证：仍是锁屏环境，未拍实机窗口。用 **Playwright WebKit（1.64.1）** 渲染真实 Vite 页面（端口 1443），Tauri IPC 用 `apps/desktop/e2e/tauri.ts` 的 shim 回放**本轮重新 dump 的监督器视图**（`seed_demo` + `dump_views`，英文种子 `/tmp/audit-r7/fx/`，中文种子 `/tmp/audit-r7/fx-zh/`），叠加 `e2e/rich.ts` 全部增强，再加审计自己的：12 目标航班牌、沉默 100 分钟、1040 全读数标题栏、空概览、无项目欢迎页 + git 身份缺失、启动失败、推送三态、手机问题、无改动评审、答完卡片 70 / 400ms 与逐帧折叠采样、金丝雀被篡改的标准。手机页以 390×844 / 430×844 打开 `remote.html`，`/api/state` 路由拦截。共 **97 张英文种子 + 41 张中文种子桌面截图、22 张手机截图**，一份 DOM 度量（每屏 primary 计数、<20pt 目标、裁切文本、焦点元素、字体、控制台错误——**全部 0 错误**，字体为 Inter Variable / JetBrains Mono Variable，即本轮排版可直接评判），一组探针（焦点边框色、toast `::before`、槽位逐帧高度、view-transition-name、金丝雀行、哨兵寄存器、面板分组、评审空态几何、验证读数看图条位置）和 **axe（WCAG 2A/2AA）** 跑过 12 屏 + 手机 4 屏；均未入库，下文以 `[编号]` 引用（§7）。
> 限制同 r6：原生菜单在 shim 下不能真正选项；动效从 CSS / JS / 逐帧采样判断，不能验证手感；网页检索由子代理完成，列出的均为抓到页面或摘要里见到的条目。

---

## 0. 总评

r6 的 Top 20 **全部落地**，其中 19 项干净，1 项（#10 看图条首屏）被同一轮新加的两行读数吃掉了收益。更重要的是三件以前只能"建议"的事这一轮真做成了，而且做得有 Tower 的口音：

1. **接受这个 hunk 是"阅读标记"，不是改动。** 头部两个动词并排 `✓ 接受这一块 · ↶ 撤销这一块`，按 `A` 之后 hunk 折成一行头、左缘一道 2px text-1 实线（与"只给你看"同一支笔）、按钮改读 `已接受 · 折叠 6 行`、状态栏 `✓ 已接受 1/2 块`、一个文件的 hunk 全接受则自动 `已看` [45][45b][45c]。没有绿色——因为什么都没被验证。这是本轮最像 Tower 的一张新画面，也是竞品里没有的语义（Codex 的 per-hunk 是 stage / revert，是对工作区的操作）。
2. **答完即折，而且真的在动。** 逐帧采样：点 `批准` 后槽位从 378px 到 2px 用了 ~170ms，透明度同步走 [P2]；toast `✓ 已答复` 升入、左缘 2px text-1 [22g]。r6 的"洞"没有了。
3. **键盘用户看得见字段。** 指针焦点边框从 14% 黑到 text-3（oklch 0.53），键盘焦点再加 1px 内描 [22b][22e][22f][P1]——两种形态都量得到、看得到。

它现在的位置：**桌面端放到 Linear / Conductor 旁边不再是"不显得外行"，而是在评审、决策卡、诚实语法三处能让对方抬头看一眼。** 剩下的差距是四类——

1. **一个新的信息矛盾。** 金丝雀被篡改时，C4 那一行用琥珀写着 `必然失败的测试通过了`，而同一屏的刻度条写着 `已验证 3/3`、页头是绿色的 `已验证 @f20e1bf` [29h]。行在说"这次通过不是证据"，总分却把它算进去了。监督器此时会另发一条高危哨兵（`bench.rs:586-596`），但 UI 层的合计不该等哨兵来纠正自己。
2. **新面带来的新边角。** 简报项 `18em` 把 `G-0004 Paused (Held-out tests fa…` 恰好切在最有信息的那个词上 [04]；失败测试名 `total rounds half-cents up  applies tax once` 两个名字之间只有 10px 空隙、没有分隔符，读成一句话 [22c][80]；验证读数面板里看图条仍在首屏之下 85px 处 [50][P9]。
3. **一屏三个黑按钮。** 需要你 / 概览的队列里，每张卡各有一个 filled primary，三张卡同时在屏时三个黑块并排往下 [02][17]。单卡成立的"一页一主按钮"在队列里没有成立——焦点所在的卡才该是黑的。
4. **可达性的结构项。** 评审文件树 `role="tree"` 的直接子元素里有不是 `treeitem` 的按钮（axe critical）[P8]；浅色评审树里 `⌘P` 徽标 2.96:1、目录名 4.44:1 [P8]；合同编辑器的开关 26×16 低于 20pt [metrics]。

D6–D8 修完 §4 前 8 项可到 93–94；D9 这一轮长出了"阅读标记"这张画面，并把 toast、树转场、仪表转动、手机骨架都接上了 Tower 的语法——再往上要的是**设置页、合同编辑器、两张 sheet 和手机页的字体也姓 Tower**。

---

## 1. 评分

### 1.1 产品评分表 D6–D9

| 维度 | r6 | r7 | Δ | 判词 |
|---|---|---|---|---|
| D6 页面 / 信息设计 | 90 | **92** | +2 | 做对了：简报一行、三项 + `还有 n 项`、`已暂停（保留测试失败）` 不再套括号 [04][04b]；手机保留测试卡与桌面同一层级——`只给你看` 实线栏 → `失败` 测试名 → 输出 → 提示框（占位、两行、primary 满宽）→ 次选项 → `在电脑上：…` → ◇ 注释 [80][83b][zh-83]；无改动评审页是 poster、状态栏回到底 [58][P6]；设置里手机问题句挪到开关下、端口上，"在下面"指对了 [73b]；`Notifications: On` 是状态词 [73d][P7]；金丝雀三态各有一句长解释挂在 title 上、`断言未检查 · 这里的通过说明得更少` 把"为什么要在意"压成半句 [29b][29h]；哨兵详情句在 UI 字、路径在 mono，一行一寄存器 [29c]；git 身份两格一键，命令留在旁边 [12][69]；面板有查询时 `命令 / 目标` 分组、动词行带目标状态字形 [76d]。扣分：金丝雀被篡改时刻度条与页头仍绿且计入（§2.1，H）；失败测试名无分隔（§2.2）；简报项截在状态词上（§2.3）；队列里每卡一个 filled primary（§2.4）；看图条仍在首屏下（§2.6）。 |
| D7 UI 视觉设计 | 90 | **92** | +2 | 做对了：字段焦点两形态 [22b][22e][22f][P1]；提示句不孤行、◇ 对齐首行（高 20 = 一行）[22c][P3]；`新的配对链接` 是实按钮 [73b][73]；骨架列头 `更新 ⟷ 身份` 之间 12px [07][P4]；接受的 hunk 一道 2px 实线 + 头部降为 text-2 [45]；金丝雀被篡改用琥珀底 + ◆ [29h]；哨兵路径列齐整 [29c]；toast 左缘 2px（text-1 / 琥珀 / 红）[22g]；1040 下六个读数并排不溢出 [10b][P5]。扣分：浅色评审树 `⌘P` kbd 2.96:1、目录名与行数 4.44:1（axe serious）[P8]；合同编辑器开关 26×16 [62][metrics]；欢迎页身份表单两格 28px、按钮 24px 不等高 [12][P10]；轨迹筛选条下的 8px 渐隐太轻，首行仍见半截 [36c]；手机页仍是系统字体。 |
| D8 交互与动效 | 91 | **93** | +2 | 做对了：槽位折叠挂在 `.decision.leaving` 上，逐帧 378→2px / 170ms、透明度同步 [P2]；`A` 接受 hunk → 折叠 → 跳到下一块 → 全接受即 `已看`、再按取消，与 `U` 成对，状态栏计数，标记随评审保存（`set_ui_state accepted`）[45][45b][45c]；运行环 rAF 160ms ease-out 转到位、减动画归零（`Chrome.tsx RunsGauge`）；进评审时树 `translateX(-24px)` 滑入、diff 交叉淡入，`.review-units / .review-diff` 各自 view-transition-name [P8]，减动画整体跳过（`nav.ts:28`）；批注 `+` 的点击区扩到 24×20 [P8]；`知道了`、PR 行、重叠行 ≥20pt [metrics 无 <20px 文字按钮]；嵌套 sheet 焦点归还有 e2e。扣分：树的 ARIA 结构（axe critical）[P8]；队列里 j/k 移动焦点但 primary 不随焦点（§2.4）；开关 16px 高；看图条首屏（§2.6）。 |
| D9 美学独特性 | 87 | **89** | +2 | 做对了：**接受的 hunk 是"人的印章"**——同一支 2px 实线笔，从"只给你看"到 toast 到折叠的 hunk 头，三处同一语法 [45][22g][22c]；金丝雀行 `必然失败的测试通过了` 是诚实语法的第三格（看到的 / 人能看到 agent 看不到的 / 看起来通过但不是证据）[29h]；手机空态两行空心环 + 条形、刻度标题 10px/0.08em 大写、中文 11px/0.04em [84][P-phone]；树滑入是一个能记住的转场。差在：设置页、合同编辑器、活动 sheet、快捷键 sheet 仍是任何好应用都会长成的样子 [62][69][78][79]；手机页系统字体 + 白卡（有琥珀条头、实线栏之后像 Things 又多了一点）；三张海报（生命线、熄灭仪表、骨架板）之外本轮没有第四张整页画面。 |
| **综合** | 89.5 | **91.5** | +2 | |

### 1.2 12 项美学子分

| # | 子项 | r1 | r2 | r3 | r4 | r5 | r6 | r7 | Δ | 判词 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 美学与原创性 | 66 | 76 | 82 | 85 | 86 | 88 | **89** | +1 | 阅读标记、金丝雀行、toast 左缘——同一支笔画出的第三、四、五处。 |
| 2 | 排版（拉丁 + CJK） | 70 | 79 | 84 | 86 | 87 | 88 | **89** | +1 | 提示句一行、哨兵分寄存器、手机刻度标题中英各自字距 [P-phone]。扣：失败测试名无分隔；简报项切在状态词上。 |
| 3 | 颜色与对比 | 78 | 82 | 86 | 88 | 89 | 89 | **90** | +1 | 字段焦点 text-3 可辨；接受的 hunk 不用绿。扣：浅色评审树 kbd 2.96:1、目录名 4.44:1。 |
| 4 | 布局与层级 | 60 | 72 | 80 | 85 | 87 | 89 | **91** | +2 | 评审空态居中、状态栏在底；手机卡与桌面同序；手机问题句位置；面板分组。扣：队列三个黑按钮。 |
| 5 | 密度与节奏 | 64 | 75 | 82 | 86 | 88 | 89 | **90** | +1 | 简报一行 20px；`TAIL_LINES` 4；1040 标题栏六读数。 |
| 6 | 组件工艺 | 62 | 74 | 81 | 85 | 87 | 88 | **90** | +2 | 两形态焦点、配对链接、身份表单、批注格扩区、`接受这一块` 按钮三态。扣：开关 26×16；身份按钮 24 vs 输入 28。 |
| 7 | 动效与反馈 | 45 | 68 | 80 | 82 | 85 | 88 | **91** | +3 | 折叠逐帧可证；接受 hunk 折叠 + 前进一气呵成；运行环 ease-out 转到位；树滑入；四处减动画一致。 |
| 8 | macOS 原生感 | 72 | 80 | 85 | 87 | 88 | 89 | **90** | +1 | 指针目标全部 ≥20pt（开关除外）；`A`/`U` 成对、`?` 表即时更新 [59][79]。扣：树 ARIA。 |
| 9 | 图标与字形 | 58 | 80 | 90 | 91 | 92 | 92 | **92** | 0 | 金丝雀行复用 `harness` 字形与 ◆；无新字形，也无新问题。 |
| 10 | 空 / 加载 / 错误状态 | 55 | 72 | 80 | 86 | 88 | 90 | **92** | +2 | 评审空态 poster；手机空态骨架；启动失败与欢迎页维持 [12][15]。 |
| 11 | 浅色主题 | 68 | 78 | 84 | 87 | 88 | 89 | **90** | +1 | 浅色焦点边 text-3 清楚；接受 hunk 实线在 cream 上成立 [45]。扣：浅色评审树对比。 |
| 12 | 品牌性格 / 记忆点 | 52 | 64 | 72 | 80 | 82 | 86 | **89** | +3 | `已接受 · 折叠 6 行`、`这是你的阅读标记，随这次评审保存；工作区没有改动（U 才会改）`、`必然失败的测试通过了`、`这里的通过说明得更少`。 |
| | **综合** | 63 | 75 | 82 | 86 | 87 | 89 | **90** | +1 | |

### 1.3 r6 Top 20 落地核对

| r6 # | 项目 | 状态 | 证据 / 副作用 |
|---|---|---|---|
| 1 | 字段焦点可见 | 已修 | `app.css:886-900`：`:focus` 边 `--text-3`，`:focus-visible` 内描 1px；探针 [P1] 指针 oklch(0.53) / 键盘 + inset；[22b][22e][22f] |
| 2 | 无改动评审页 | 已修 | `Review.tsx:456-466 poster`、`app.css:2309-2319`；[58] poster x=32 y=278，状态栏底 900 [P6] |
| 3 | 简报一行、去双括号 | **已修，有副作用** | `Overview.tsx:275-310 shortPauseLabel / BRIEFING_MAX`、`app.css:1184-1197 18em`；[04] 高 20、无 `((`；但首项 227px > 216px 截成 `Held-out tests fa…`（§2.3） |
| 4 | 手机保留测试卡 | 已修 | `remote.html:98-107,240-271,345-355`；[80][83b][88] 次序与桌面一致、占位、primary |
| 5 | 折叠挂在卡片 `leaving` | 已修 | `app.css:1921-1925 :has(> .decision.leaving)`；逐帧 [P2] 378→2px / 170ms |
| 6 | 手机问题句位置 | 已修 | `Settings.tsx:377-385`；[73b] 开关 → 句子 → 端口 |
| 7 | 提示句去 `max-width`、◇ 对齐首行 | 已修 | `app.css:2065-2074`；[22c] 高 20、◇ top+4 [P3] |
| 8 | 20pt 文字目标、批注格扩区 | 已修 | `Overview.tsx:296 text-btn`、`GoalPage.tsx:215`、`Pr.tsx:17`、`app.css:2577-2590 .gutter-btn::before inset -4px -2px`；metrics 无 <20px 文字按钮 |
| 9 | 配对链接实按钮 | 已修 | `Settings.tsx:457`；[73][73b] |
| 10 | 看图条首屏 | **部分** | `panels.tsx:24 TAIL_LINES 4`；但新增 `CanaryLine` + `HeldOutLine` 各占一行，C4 看图条 top 725（面板 90–810），首屏露 85px [50][P9] |
| 11 | `On`、安静时段 hint 只说差异 | 已修 | `en.ts:178,564`、`zh-CN.ts`；[73d][P7] |
| 12 | 骨架列头 `身份` 左补白 | 已修 | `app.css:3337-3340`；[07] 1148→1160 [P4] |
| 13 | 接受这个 hunk | 已修 | `Review.tsx:217-251,304-312`、`FileDiff.tsx:126-138,287-305`、`reviewState.ts:33-45`；[45][45b][45c] |
| 14 | 轨迹筛选条渐隐 | 已修 | `app.css:2190-2199 ::after 8px`；[36c] 存在但轻 |
| 15 | 面板分组 | 已修 | `Palette.tsx:141-151`；[76d] `Commands / Goals` |
| 16 | 嵌套 overlay 焦点 e2e | 已修 | `flows.spec.ts:295` |
| 17 | toast 左缘 | 已修 | `app.css:2861-2895`；[22g] 2px text-1 at left 8px |
| 18 | 手机骨架、刻度字距 | 已修 | `remote.html:61-72,227,325,368`；[84] 两行空心环；h2 10px/0.08em，中文 11px/0.04em |
| 19 | 评审树滑入 | 已修 | `app.css:3242-3274 tree-in/out 220ms`；[P8] view-transition-name 到位；手感未验 |
| 20 | 运行环转到位 | 已修 | `Chrome.tsx:72-108` rAF 160ms ease-out，减动画 0 |

r6 §2.9 校对表：`Notifying` ✔、安静时段 hint ✔、配对链接 ✔、骨架列头 ✔、看图条 ✘（部分）、手机占位 ✔、简报双括号 ✔。

---

## 2. 全局问题与修法

### 2.1 金丝雀被篡改：行与合计打架（H）

现状 [29h][zh-29h]：C4 行下 `◆ 必然失败的测试通过了`（琥珀底、title 说"这次通过不是证据"），同屏刻度条 `━━━ 已验证 3/3 · 观测 0/3`、页头 `✓ 已验证 @f20e1bf` 绿色、`Review 1 file` 仍是主按钮。监督器此时 `Outcome::Passed` 并另发 `assertions_disabled` 哨兵（`verify/bench.rs:565-598`，本轮夹具未带这条哨兵），所以产品里页顶会有一条红哨兵——但**合计本身不该说谎**，哨兵是第二道。

修法（M）：
- `CriteriaBar`（`Honesty.tsx:105-118`）：`canary === "tampered"` 的标准不计入 `verified` 段，改为琥珀段；文案 `已验证 2/3 · 1 项不作数`。
- 页头 `Verified` 印章在存在 tampered 时降为 `◆ 通过但不作数`（`GoalPage` 头部 / `Review` 头部同一处）。
- 验收 sheet 的 `All n machine criteria passed` 同步说 `n-1 of n count as evidence`。

### 2.2 失败测试名无分隔（M）

现状 [22c][80][83b]：`failing  total rounds half-cents up  applies tax once`——`.heldout-names { gap: 2px 10px }` 两个 `<code>` 之间只有空隙，英文里读成 "…up applies tax once"；手机上一折行更像一句话。

修法（S）：每个名字一枚轻 chip（`code-val` 加 1px 边或 `bg-inset`）或名字之间 ` · ` 分隔；手机同款（`remote.html:104`）。一行放不下时每名一行。

### 2.3 简报项切在状态词上（M）

现状 [04][P-briefing]：`.briefing-item { max-width: 18em }`，首项 `G-0004 Paused (Held-out tests failed)` 227px 被截成 `Held-out tests fa…`——简报存在的意义就是那个括号里的词。

修法（S）：`max-width: 24em`；或截断策略反过来：先去括号再省略（`G-0004 Paused`），括号内容放进 title（已有）。1100 下三项 + `1 more` 仍能一行（当前 20px 高有余量）。

### 2.4 队列里每卡一个黑按钮（M）

现状 [02][17][18][zh-16]：概览 / 需要你 的三张卡各带 filled primary（`发送提示并继续`、`Approve`、`Send the failures`），再往下还有 `Review 1 file`、`Review 3 files`——一屏五个黑块。单卡"一页一主按钮"成立，队列里不成立；`j/k` 移动焦点时黑块不跟着走。

修法（S）：`.decision-slot:not(.focused) .btn-primary` 降为 `btn-default` 外观（保留语义与 `1-9` 键），焦点卡（鼠标悬停 / j k）才升为 filled；首张卡默认 focused。Linear 的 inbox、Things 的 Today 都是这样让一屏只有一个黑的。

### 2.5 评审树的可达性与对比（M）

现状 [P8]：`.tree[role=tree]` 的子元素 `.unit-group[role=group]` 里，组头是 `button[aria-current]` 而非 `treeitem`，axe `aria-required-children` critical（深浅色都报）。浅色下 `.tree-head > kbd` 2.96:1（10.5px）、`.unit-dir` / `.unit-lines` 4.44:1。

修法（S）：组头按钮加 `role="treeitem" aria-expanded`，其下文件列表 `role="group"`；kbd 前景用 `--text-2`；`.unit-dir` 用 `--text-2`（12px 需 4.5:1）。

### 2.6 验证读数：看图条仍在首屏下（L）

现状 [50][51][P9]：`TAIL_LINES` 8→4 之后 C1/C2 各多了 `断言已检查` / `断言未检查 · …` 一行、C2 又多 `保留测试 · 只给你看`，看图条 top 725，面板底 810，首屏露 85px（r6 是 21px）。

修法（S）：面板内把 look 标准排在最前（图先于尾巴），或折叠态只留 `退出码` + 两行；金丝雀与保留测试两行并成一行 `断言已检查 · 保留测试 · 只给你看`。

### 2.7 点击目标与尺寸

| 位置 | 现状 | 应为 |
|---|---|---|
| 合同编辑器 `允许联网` 开关 [62] | `.toggle` 26×16（4 处） | 28×18 或 `::before` 扩到 32×24 |
| 欢迎 / 设置身份表单 [12][69] | 输入 28px、`Set in git` 24px（`btn-s`） | 按钮 `size="m"` 或输入 24px，齐一条基线 |
| 批注 `+` | 16×16，`::before` 扩到 24×20 | 合格（r6 #8） |
| 手机 | 卡内按钮 44，行内 `Pause` 40（有记录） | 合格 |
| 标题栏读数 1040 [10b] | 六项并排、无溢出 | 合格 |

### 2.8 文案与排版校对

| 位置 | 现状 | 应为 |
|---|---|---|
| 简报 [04] | `Held-out tests fa…` | §2.3 |
| 保留测试卡 [22c] | `failing  a  b` | §2.2 |
| 标题栏 [04] | `silent for 61s` | 60s 以上读分钟：`silent for 1m`（`format.ts duration` 的 60–119s 一档） |
| 轨迹 [36c] | 首行 `08:05 Run 1 started · First` 半截在筛选条下 | 渐隐 8→16px，或列表 `scroll-padding-top` |
| 手机稍后菜单 [86] | `Remind me later  [In 1 hour]` 第一行、`[Tomorrow 9:00]` 第二行 | 标签独占一行，两枚 chip 一行 |
| 面板 zh [75] | `评审 G-0003 · Clean up cart edge cases` 中英混排 | 英文种子的产物；中文种子下为 `评审 G-0003 · 清理购物车计算的边界情况` [zh-75]。非产品问题 |
| 中文种子 CI 卡 [zh-16] | `Send the failures to the agent` 英文 | `rich.ts enrichCi` 硬编码英文；监督器的中文版本在 `verify/mod.rs:302` 有。非产品问题，但夹具该补中文 |
| 验收 sheet [53] | `All 2 machine criteria passed in a clean environment` | 存在 tampered 时见 §2.1 |

---

## 3. 逐屏审计

### 3.1 标题栏与侧栏 [02][09][10b]

做对了：`◔ 1/4 running` 扇形随 `n/max` 转到位；沉默 `◻ silent for 1h 40m` 一跳；1040 宽 + 沉默 + 安静 + 手机未开 六项并排 [10b]，引擎标签整段隐藏、无溢出 [P5]。问题：`silent for 61s`（§2.8）。

### 3.2 概览 / 航班牌 [02][03][04][05][06][07]

做对了：简报 `Since 05:11 · G-0004 … · G-0003 Ready to accept · G-0002 Running · 1 more  Got it` 一行 20px [04]；12 目标 1800 宽卡片与航班牌同一 1280 容器 [06]；骨架板列头可分 [07]。问题：简报截断（§2.3）；队列三黑按钮（§2.4）。

### 3.3 需要你 [17][18][22b]–[22i]

做对了：保留测试卡 `FOR YOU ONLY` 实线栏 → `C2 Rounding edge cases` → `failing …` → 输出 → 提示框（唯一 primary，禁用 .45）→ ◇ 一行注释 → 三个次选项（`Abandon` 按两次 `Press again to confirm · 2` [22i]）；Tab×4 落在提示框、边框 text-3 + 内描 [22b]；答完卡片 70ms 时槽位已折、toast `✓ Replied` 带左缘 [22g]。问题：测试名分隔（§2.2）；三黑按钮（§2.4）。

### 3.4 目标页 [24][25][26][27][29][29b][29c][29h]

做对了：G-0001 哨兵两条——`Program code reaches into the tests…`（红、`Needs your confirmation`）句子在 UI 字，`The sandbox refused 7 accesses…; the latest:` 下五条路径 mono 列齐 [29c]；标准下 `assertions checked`（harness 字形）/ `assertions not checked · a pass proves less here`（text-3 + text-4 半句）/ `◆ a test that must fail passed`（琥珀底）三态 [29b][29h]；1100 下右栏折到主栏下、合同摘要三列 [25]；G-0004 暂停页头 `Resume P` 中性、卡片提示框 primary、`Workspace rolled back ↶ Undo rollback` 20pt [27]。问题：§2.1。

### 3.5 评审 [41]–[45e][48b][50]–[59]

做对了：hunk 头 `✓ Accept this hunk · ↶ Undo this hunk` 20px 成对 [41][42]；`A` 后折成一行 + 2px 实线 + `Accepted · 6 lines folded` + 状态栏 `✓ 1/2 hunks accepted` + 页脚 `A accept hunk` [45]；全接受自动 `✓ Viewed`、树上 `cart.js +1 -1 ✓` [45c]；中文 `已接受 · 折叠 6 行`、`已接受 1/2 块` [45b]；1100 / 1800 两端布局成立 [43][44]；无改动页 poster + `Open the goal page` 实按钮、状态栏在底 [58]；验证读数带金丝雀行 [50][51]；要求修改 sheet 的 textarea 键盘打开时边 + 内描、无环 [54]。问题：树 ARIA 与对比（§2.5）；看图条（§2.6）。

### 3.6 合同编辑器 [61][62][63]

无新问题；开关 26×16（§2.7）。仍是一张标准表单——D9 的欠账。

### 3.7 设置 [68]–[73h]

做对了：Environment 里 `git has no name and email: …` 下两格 + `Set in git` + hint + 命令 [69][72]；手机问题句在开关下、端口上，琥珀 ◆ [73b]；`Notifications: On`；安静时段 hint `In this window pushes stop too. It may cross midnight.` [73d]；推送三态 [73d][73f][73g]。问题：身份按钮高度（§2.7）。

### 3.8 手机页 [80]–[88][zh-80]–[zh-88]

做对了：刻度标题 `NEEDS YOU ——— 3` 10px/0.08em 大写、中文 `需要你` 11px/0.04em [80][zh-80]；保留测试卡与桌面同序、提示框两行 + 满宽 primary `Send the hint and resume` [80][83b]；`At your Mac: Show the agent the failure…` 命名不提供；空态两行空心环 + 条形、`RUNNING` 一行 [84]；离线 `■ Can't reach Tower · Retry` [85]；axe 零违规；全部控件 ≥40/44。问题：测试名换行成句（§2.2）；稍后菜单两行（§2.8）；系统字体（D9）。

### 3.9 欢迎 / 启动失败 / 空态 [07][12][14][15]

做对了：欢迎页右栏 `git has no name and email` 行内表单先于命令 [12]；启动失败 `■ 1 error  —/— running  —  ○ Engine —` 熄灭仪表 + 错误框 + `Retry / Open the data folder` [15]；空概览骨架 [07]。问题：身份按钮高度（§2.7）。

### 3.10 动效与焦点（代码审读 + 探针）

- 时序：`--dur-fast 100`、`--dur-base 160`（toast 升入、槽位折叠、运行环）、`--dur-view 120`、`--dur-space 220`（进出评审、树滑入、FLIP）、`--dur-attn 700`。全部有名字有理由。
- 折叠逐帧 [P2]：`grid-template-rows 0.16s cubic-bezier(.55,.055,.675,.19)`，378 → 350（60ms）→ 241（113ms）→ 29（156ms）→ 2（170ms）；ease-in 作为退场可接受。
- 减动画：`base.css` 全局归零；`nav.ts:28` 跳过 view transition；`linger.ts` 归零；`Chrome.tsx baseMs()` 归零；`Overview.tsx spaceMs()` 归零——五处一致。
- 焦点：字段两形态 [P1]；sheet 内 textarea 键盘打开为边 + 内描、不闪环 [54]；嵌套 sheet 归还有测试。缺：树 ARIA（§2.5）。
- 反馈闭环：答复 → 槽位折 + toast 升；接受 hunk → 折叠 + 前进 + 计数 + 文件已看——两条闭环都闭上了。

---

## 4. 距离 95 分还差什么：Top 18

影响：H = 信息矛盾或可达性结构；M = 单屏明显；L = 细节。量：S < 半天，M ≈ 1 天，L ≈ 2–3 天。预期：完成 1–8 后 D6–D8 约 93–94；9–13 约 94–95；14–18 是 D9 的事。

| # | 改动 | 文件 | 预期效果 | 解锁 | 影响/量 |
|---|---|---|---|---|---|
| 1 | tampered 不计入 `verified`，刻度条琥珀段 + `1 项不作数`；页头印章与验收 sheet 同步 | `Honesty.tsx:105-118 CriteriaBar`、`GoalPage.tsx` 头部、`panels.tsx AcceptPanel` | 行与合计说同一件事 | D6 +1 | H / M |
| 2 | 评审树 ARIA：组头 `treeitem aria-expanded`、文件列表 `group`；kbd / 目录名 `--text-2` | `Review.tsx:485-495,690-705`、`app.css .tree-head kbd / .unit-dir` | axe critical 清零、浅色 ≥4.5:1 | D7、D8 | H / S |
| 3 | 失败测试名 chip 或 ` · ` 分隔，手机同款 | `app.css:2056-2064 .heldout-names`、`remote.html:104` | 名字是名字 | D6、D7 | M / S |
| 4 | 简报项 `max-width: 24em`，或先去括号再省略 | `app.css:1186`、`Overview.tsx:303` | 状态词完整 | D6 | M / S |
| 5 | 队列只有焦点卡的 primary 是 filled | `app.css .decision-slot`、`Inbox.tsx:85 focused`、`Overview.tsx` 队列 | 一屏一个黑按钮 | D6 +1、D7 | M / S |
| 6 | 验证读数：look 标准前置，或金丝雀 + 保留测试并一行 | `panels.tsx:86-145`、`Honesty.tsx CanaryLine/HeldOutLine` | 看图条首屏 | D6 | M / S |
| 7 | 开关 28×18（或扩区）；身份表单按钮与输入等高 | `app.css:1040-1048 .toggle`、`GitIdentity.tsx:34 size` | 无 <20pt；一条基线 | D7、D8 | M / S |
| 8 | `silent for 61s` → 分钟档 | `format.ts duration` / `Chrome.tsx:53-57` | 读数像读数 | D6 | L / S |
| 9 | 轨迹渐隐 16px + `scroll-padding-top` | `app.css:2190-2199`、`.trace-scroll` | 首行不半截 | D7 | L / S |
| 10 | 手机稍后菜单：标签一行、两 chip 一行 | `remote.html .later` | 不换行 | D7 | L / S |
| 11 | 夹具：`enrichCi` / `enrichHeldOut` 按语言给中文串 | `e2e/rich.ts` | 中文种子截图可信 | 审计基础设施 | L / S |
| 12 | 接受 hunk 的折叠加 160ms 高度过渡（现为瞬时重排） | `FileDiff.tsx` hunk 行、`app.css .hunk-accepted` | 阅读标记"合上" | D8 | L / S |
| 13 | `A` 在最后一块时状态栏提示 `全部接受 · V 标为已看` 或自动跳下一单元 | `Review.tsx:327-331 acceptHunk` | 闭环到单元 | D8 | L / S |
| 14 | 合同编辑器像一份合同：字段分组成 `意图 / 验收 / 边界` 三张"条款"，标题用字标字距 | `views/New.tsx`、`app.css .contract-*` | 第四张海报 | D9 +1 | M / M |
| 15 | 设置 › Environment 做成仪表条：`Pi ✓ 1.4.2 · git ✓ 2.56 · sandbox ✓ · identity ◆` 一行读数，问题展开在下 | `Settings.tsx:120-170` | 设置页姓 Tower | D9 | M / S |
| 16 | 手机页字体：Inter 子集（拉丁 + 数字）内嵌 base64，CJK 仍系统 | `remote.html` `<style>` | 手机与桌面同一张脸 | D9 +1 | M / S |
| 17 | 活动 / 快捷键 sheet：标题用字标、分组标题用刻度字距 | `Chrome.tsx Activity`、`App.tsx Shortcuts`、`app.css .panel h2` | 通用 sheet 也姓 Tower | D9 | L / S |
| 18 | 树滑入 + diff 淡入之外，评审 → 评审（队列）时文件树不重入、只换 diff | `nav.ts`、`app.css view-transition` | 队列像翻页不像换屏 | D9 | L / M |

---

## 5. 与主流 harness GUI 的对比（2026-09 至 10 月）

对照对象与时间点（来源见脚注；本轮子代理检索，只列抓到页面或摘要的条目）：Claude Code 桌面 v3.6556.1（10-22：按机器 / SSH 主机记住权限模式、屏幕阅读器点名 computer-use 的应用；10-20 Storage 页、`/btw` 侧聊；10-15 权限请求并入对话流、RTL 修正；10-01 Files 面板行批注 `+`）；桌面文档：评审是**批注式**（hover `+`、Enter、⌘Enter 提交），`/code-review` 结果卡 `Walk through in diff / Fix this one / Apply fixes`，**没有按 hunk 接受 / 拒绝**，无 zh-CN、无 Reduce Motion 文字 [^cc1][^cc2]；Codex 应用 26.1007（10-08 Changes 面板滚动与文件导航；文档：hover `+` 批注、**stage / unstage / revert 三级：整个 diff / 文件 / hunk**、⌘-click 开编辑器、按文件 `Mark as viewed`、PR 流终于 `Comment / Approve / Request changes`、Stack 导航）[^cx1][^cx2]；Cursor Agents Window 3.25–3.27（10-22：Review Changes 头部在实时 diff 替换缓存时不再跳、合并按钮说会落几个 PR、方向键 / Home / End 到达每一行、屏幕阅读器播报任务状态；3.26 **Reduce Motion 下对话框原地淡入**；IDE 3.27 `workbench.reduceMotion`）[^cu1]；Conductor 0.90–0.92（10-23：**自定义快捷键**、长对话先载最近、`⌘1–9` 跳过折叠分区；10-15 工作时停止键是 primary、输入时发送是 primary、未读消息保持淡色；10-02 diff 刷新有进度条、刷新中可标 Viewed、关闭下拉焦点回触发器）[^co1]；Zed 1.24–1.25（Agent Panel 间距、`zed --diff`；issue #65894 大文件实时 diff 卡主线程）[^zd1]；Devin 桌面 3.11.216（10-24）[^dv1]；Warp 2026.10.15（⌘E 切 Markdown 渲染）；Amp 10-12（Changes 面板按决策模型排文件，diff 中途变化**不重排**、蓝点提示新序）[^am1]；Factory 桌面 v0.206（10-24；0.184 侧栏加粗待确认会话、浅色 diff 语法色加深）[^fa1]；Linear（10-22 Loops，10-08 堆叠 PR 与实时 diff 不变）[^ln1]；Raycast 2.9（10-22：HUD / toast 可关、带 pending + 进度、修 toast 残留）[^rc1]；Things Mac 3.24.1（09-30）、Craft 3.7.0（10-11：**新 CJK 字体四款**、macOS 27 工具栏模糊修正）、Dia 1.53–1.54（"平滑侧栏与分屏过渡，减少布局抖动与视觉接缝，网页内容保持锚定"）[^th1]；Apple HIG What's new（10-13 Widgets / Live Activities；**焦点环、指针目标、Reduce Motion 自 6 月起无新条目**）[^ap1]；评测：Paralect（10 月）称 Conductor "大概是当下最好的 ADE UX……重度使用 15–20 分钟后 UI 开始卡"、Codex 桌面 "diff 查看器干净" [^rv1]。

### 5.1 Tower 落后的地方

| 方面 | 它们 | Tower | 差距性质 |
|---|---|---|---|
| 评审器 | Codex 三级 stage / revert（工作区操作）；Claude / Conductor 批注批量提交；Cursor 文件级 ⌘Z + Restore Checkpoint；Amp diff 中途不重排 | 树 + ⌘P + 就地编辑 + 建议块 + **撤销 hunk（工作区）/ 接受 hunk（阅读标记）成对** + `已看` 哈希 + 队列 | **本轮追平并在语义上领先**：没有竞品区分"我改了工作区"与"我读过了"。剩：实时 diff 变化时标记作废的提示（Amp 的蓝点）——Tower 以 `range` 作废标记但不告诉人（#13 相邻） |
| 手机 | Cursor Live Activities；Codex 优先视图；Conductor 远控 Mac；Claude 手机端失去行内 Approve（issue #93985） | 一页 HTML + 骨架 + 刻度标题 + 保留测试卡同桌面 | 立场正确；材质仍是系统字体白卡（#16） |
| 可自定义 | Conductor 自定义快捷键；Cursor 每行可达 | 注册表 `?` 表，不可改 | 选择而非缺陷 |
| 减动画 | Cursor 3.26 对话框原地淡入、应用级开关 | 五处一致归零 + 实测 | 已领先；差一个"应用内开关"（选择） |
| 面板 / 命令 | Claude 首行动词；Linear `Create new loop` | 动词在前 + 分组 + 目标字形 | 持平或更好 |

### 5.2 Tower 领先的地方

1. **阅读标记。** `接受这一块` 折叠 + 实线 + "工作区没有改动（U 才会改）"——把"读过"与"改过"分成两个动词，是 Codex 三级 stage 没有的语义，也是 Linear "实时 diff" 没有的人的位置。
2. **诚实语法的第三格。** `必然失败的测试通过了` / `这里的通过说明得更少`——没有竞品在 UI 层区分"通过"与"通过是否算证据"。（§2.1 的合计矛盾是它自己的欠账。）
3. **动效纪律仍无人公开做到。** 五级时序、五处减动画一致、折叠逐帧可证；Cursor 到 3.26 才做 Reduce Motion 淡入，Claude Code 无相关文字。
4. **空态与错误页有脸。** 骨架板、手机骨架、熄灭仪表、生命线；竞品的空态是"新会话"。
5. **键盘 + 中文。** `A`/`U` 成对、`?` 表即时反映；中文种子下整张卡中文；Craft 10 月才上 CJK 字体，Claude zh-CN 仍是 issue。

### 5.3 一句话定位

与 Codex / Claude Code / Conductor / Cursor 相比，Tower 在"评审语义、诚实语法、动效纪律、键盘与中文、空态与错误页"上领先一代，在"手机材质、可自定义"上落后半步。r6 留下的 H（字段焦点）和次序问题（先透明后折叠）都缝上了；新面带来一处 H（金丝雀合计）、两处可达性结构（树 ARIA、开关尺寸）和三处边角（测试名、简报截断、看图条）。**它现在有四张能认出来的画面和一支贯穿的笔；要到 95，需要把表单、sheet 和手机页也用这支笔画一遍。**

---

## 6. 要到 95，每个维度必须成立的事

**D6 页面 / 信息设计（92 → 95）**
- 行与合计永远说同一件事：tampered 不绿、不计（#1）。
- 每个列表项截断时保住状态词，不保住 ID 之外的任何别的（#4）。
- 机器值之间有分隔，一个名字一个形（#3）。
- 一屏只有一个 filled primary，且它跟着焦点走（#5）。
- 首屏能看见图（#6）。

**D7 UI 视觉设计（92 → 95）**
- 所有 12px 以下文字 ≥4.5:1，含 kbd 与目录名（#2）。
- 无一控件低于 20pt，含开关（#7）；同一行的输入与按钮同高（#7）。
- 滚动容器的顶边真的有交代（#9）。
- 手机页与桌面同一张脸（#16）。

**D8 交互与动效（93 → 95）**
- 树是树：ARIA 结构过 axe（#2）。
- 阅读标记有"合上"的 160ms（#12），最后一块有去处（#13）。
- 队列焦点与 primary 同步（#5）。

**D9 美学独特性（89 → 95）**
- 合同编辑器像一份合同，不像一张表单（#14）。
- 设置的环境块是一行仪表读数（#15）。
- 两张通用 sheet 的标题用字标字距（#17）。
- 评审队列翻页时树不重入（#18）。
- 第五张海报：手机页用 Tower 的字（#16）。

---

## 7. 附：本轮截图清单（`/tmp/audit-r7/shots/`、`/tmp/audit-r7/shots-zh/`，未入库）

| 编号 | 内容 |
|---|---|
| 01–03b | 概览（rich）：深中 1440、浅英 1440、深中 1100、浅英 1040 + 沉默 |
| 04, 04b | 简报：浅英 1440、深中 1100 |
| 05–06 | 概览 12 目标：深中 1440、浅英 1800×1100 |
| 07–08 | 空概览（骨架板）：深中、浅英 |
| 09 | 概览沉默 100 分钟（运行环 + 空心方框） |
| 10, 10b | 概览 + 手机页面未开启：深中；1040 六读数标题栏 |
| 11–13b | 欢迎（无项目 + git 身份缺失）：深中、浅英、深英 1100、身份表单填写后 |
| 14–15 | 启动失败：深中、浅英 |
| 16–19b | 需要你：深中、浅英、浅英全页、深中 1100、深英 1800、空态深中 / 浅英 |
| 22, 22b | `j` 焦点；Tab×4 字段焦点 |
| 22c–22f | 保留测试卡：浅英、深中、指针焦点、键盘焦点（元素） |
| 22g–22h | 答完一张卡：70ms、400ms |
| 22i | `Abandon` 按一次（`Press again to confirm · 2`） |
| 23–25b | G-0002 运行中：深中、浅英、深中 1100、浅英 1800 |
| 26–27 | G-0004 已暂停 + 保留测试卡：深中、浅英全页 |
| 28–29 | G-0001 待验收：深中、深中全页、浅英全页 |
| 29b–29d | 金丝雀行与哨兵（元素）：浅英、深中 |
| 29e–29h | 金丝雀被篡改（C4）：浅英、深中 |
| 31–32 | G-0003 返工：深中、浅英全页 |
| 36, 36c | 轨迹：深中元素；浅英 `w` 打开 |
| 38–39 | 比较面板：并排深中、叠加浅英 |
| 40c | 目标页快捷键表 |
| 41–44 | 评审 G-0003：深中、浅英、深中 1100、浅英 1800 |
| 45–45e | 接受 hunk：浅英、深中、全接受一个文件、hunk 头悬停、⌘P `money` |
| 48–48b | 评审 G-0001：深中；浅英并排 |
| 50–51 | 验证读数：深中、浅英 |
| 52–53 | 验收 sheet：深中、浅英 |
| 54 | 要求修改 sheet（已输入） |
| 56 | 评审队列 |
| 58, 58b | 评审 G-0002 无改动：浅英、深中 |
| 59 | 评审快捷键表 |
| 61–63 | 合同编辑器：深中、浅英、深英 1100 全页 |
| 68–71 | 设置：深中、浅英、深中全页、浅英 1100 全页 |
| 72, 72b | 设置 › Environment 身份表单：浅英、深中 |
| 73–73h | 设置 › 手机（深中 / 浅英 / 问题浅英 / 问题深中）、通知与推送（失败浅英 / 失败深中 / 成功浅中 / 从未深英）、状态词探针 |
| 75–76d | 命令面板：深中空查询、浅英 `rev`、深中 `回答`、浅英 `zzz`、深英 `cart`（命令 / 目标两组） |
| 78, 78b | 活动与错误 sheet：浅英、深中 |
| 79 | 需要你快捷键表 |
| 80–88 | 手机页：浅、深、浅全页、保留测试卡（浅 / 深）、空态（浅 / 深）、离线、稍后、430 宽、提示框焦点 |
| zh-* | 同一组屏在中文种子（`fx-zh`）下 |
| metrics-en/zh.json | 每屏 primary 计数、<20px 按钮、裁切文本、焦点元素、字体、控制台错误（全部 0 错误） |
| P1–P10 | 探针：字段焦点（指针 oklch 0.53 / 键盘 + inset 1px）、折叠逐帧（378→2px / 170ms）、提示句高 20 与 ◇ top+4、骨架列头 1148/1160、1040 六读数、评审空态 poster (32,278) 与状态栏底 900、`Notifications: On`、评审树 ARIA 与对比（axe）、看图条 top 725 / 面板 90–810、身份表单 28/24 |
| axe | 概览、需要你、目标页、合同、设置（深浅）零违规；评审深浅各 1 critical（树）、浅色 3 serious（对比）；手机零违规 |

[^cc1]: Claude Desktop changelog（v3.6556.1 2026-10-22；v3.1623.0 10-20；v2.42304.0 10-15；v2.19675.0 10-01），https://claude.com/docs/cowork/changelog ；桌面文档（评审批注式、`/code-review` 结果卡、快捷键），https://code.claude.com/docs/en/desktop
[^cc2]: Claude Code CHANGELOG v2.1.300–2.1.311（10-14 至 10-26），https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md ；issue #93985（手机端会话列表失去行内 Approve），https://github.com/anthropics/claude-code/issues/93985
[^cx1]: Codex app changelog 26.1007（2026-10-08）、Codex CLI 0.164.0（10-23）、ChatGPT iOS 1.2026.286（10-22），https://learn.chatgpt.com/docs/changelog?type=codex-app
[^cx2]: Codex code review 文档（hover `+`、stage / unstage / revert 三级、Mark as viewed、Submit review、Stack），https://learn.chatgpt.com/docs/code-review
[^cu1]: Cursor release notes（Agents Window 3.25–3.27、IDE 3.27 `workbench.reduceMotion`），https://cursor.com/docs/release-notes
[^co1]: Conductor changelog 0.90.0（2026-10-02）、0.91.0（10-15）、0.92.0（10-23），https://www.conductor.build/changelog
[^zd1]: Zed stable releases 1.23–1.25，https://zed.dev/releases/stable ；issue #65894，https://github.com/zed-industries/zed/issues/65894
[^dv1]: Devin desktop changelog 3.11.216（2026-10-24），https://docs.devin.ai/desktop/changelog
[^am1]: Amp, "First Things First, Faster"（2026-10-12），https://ampcode.com/news/first-things-first-faster ；Warp changelog 2026.10.15，https://docs.warp.dev/changelog/2026
[^fa1]: Factory desktop release notes v0.177–v0.206（2026-09-16 至 10-24），https://docs.factory.com/changelog/release-notes
[^ln1]: Linear changelog（2026-10-08 堆叠 PR 与实时 diff；10-22 Loops），https://linear.app/changelog
[^rc1]: Raycast changelog 2.9（2026-10-22），https://www.raycast.com/changelog
[^th1]: Things Mac 3.24.1（2026-09-30），https://culturedcode.com/things/support/articles/1100684/ ；Craft 3.7.0（10-11），https://www.craft.do/blog/craft-update-3-7-0 ；Dia 1.51–1.54，https://www.diabrowser.com/changelog
[^ap1]: Apple HIG What's new（2026-09-09、09-17、10-13），https://developer.apple.com/design/whats-new/
[^rv1]: Paralect, "Top Agentic IDEs"（2026-10 更新），https://www.paralect.com/stack/top-agentic-ides
