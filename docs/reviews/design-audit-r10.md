# Tower 设计审计 r10（信息设计、视觉、交互与动效、独特性）

> 审计人：Opus 5.5，以外部挑剔设计师的视角重新看一遍，不沿用 r9 团队的结论。透镜是 `frontend-design` 的判准：
> - 结构装置（编号、细线、中点、标签）是否承载信息；
> - 动效是否回应动作；
> - 文案是否一事一职；
> - 有没有"模板 / AI 生成"的痕迹。
>
> 刻度与 r9 相同（`docs/reviews/design-audit-r9.md`：D6 94 / D7 93 / D8 94 / D9 91）。95+ 指能与 Linear、Things 3、Raycast、Arc、Craft 和 Apple 自家应用并列，且没有任何通用或模板化的东西。
>
> 日期：2026-10-27。对照 `main @ 8a0eebd`。r9 之后与 UI 相关的提交：
> - UI pass 11（b63195b … ea49bc2）：r9 的 18 项；
> - 之后又加了：保留测试按文件证明"m of n ran"（f01d0a0）、标准行的 loopback 注记与设置里的项目 loopback 开关（fe3d0cb、87e4d92、627f3d2）、账本 `Cannot confirm` 徽章（00332d1）、卡片文本框长到六行（7ee03fd）、记忆字段按条款命名（847dc11）。
>
> **取证**
> - 渲染：Playwright WebKit 渲染真实 Vite 页面，`E2E_PORT=1485`，`TMPDIR=/tmp/audit-d10`，Tauri IPC 走 `e2e/tauri.ts` 的 shim。
> - 种子：`tools/e2e.sh` 现场 seed 的监督器视图（`/tmp/audit-d10/tower-e2e/fixtures`）。
> - 两套截图：
>   - `SHOTS` 跑 `shots.spec.ts` 与 `phone.spec.ts`，共 73 张，在 `/tmp/audit-d10/shots/`；
>   - 审计自己的 harness（`/tmp/audit-d10/harness/`，不在仓库内）补了 61 张，在 `/tmp/audit-d10/cap/`。
> - harness 补的画面：
>   - en-dark / zh-light 两组配对；
>   - 1040 / 1240 / 1400 / 1600 / 1800 宽；
>   - 启动失败（拦截 `goals` 抛错）；
>   - 目标页长页分屏，带 `enrichHeldOutPartly`（1 of 2 ran）、C1 / C3 的 loopback 注记、C3 账本 `cannot_confirm`；
>   - 评审的 `]`、`A`、`A` 后 `⇧A`、`[` 后 `⇧A`、全部接受；
>   - 读数面板、验收 sheet（红项 / 干净）；
>   - 合同 look steps 非法步骤；
>   - 设置全页；
>   - 命令面板、快捷键表。
> - 探针（`/tmp/audit-d10/probes*.jsonl`）：
>   - 概览每行最后一个字的右缘与板右缘；
>   - Tab 顺序与焦点样式；
>   - 字体特性与 `opsz`；
>   - <24px 目标、省略号截断；
>   - 占位符颜色、行宽（ch）；
>   - 逐帧动画，以及减动画下的 `getAnimations()`；
>   - hunk 头样式、树与 diff 顺序；
>   - 合同冷启动到出内容的时间。
>
> **限制**
> - Vite dev 页面，不是生产包；原生菜单、窗口阴影、红绿灯看不到。
> - 动效只做了逐帧采样，手感没有验证。
> - armed 状态（`Accept anyway` 第二次按压）这轮没截到（选择器没命中），文案沿用 r9 之后的提交说明，未目验。
> - 竞品由子代理检索，只列它实际打开过的页面；仅见于搜索摘要的条目已标"未证实"。

---

## 0. 总评

**pass 11 把 r9 最大的问题修对了。**
- **概览成了真正的概览。** 1440×900 首屏一共只有：快速开始框、`Needs you 4` 四行、`Running 1` 一行。每个决策一行，`j` 展开的那张卡与上下的行同一右缘（1408）[shots/overview-en-light][shots/overview-en-light-j]。航班牌第一次进了首屏。
- **栅格补齐。** 印章 `◆ Passed, not evidence @b144ff4` 落到页面右缘，与 `Trace W ···` 对齐。目标页决策卡等于主栏宽。卡片正文实测正好 72ch（探针：`decision-body` 590px = 72ch）。
- **评审小处都修了。**
  - 树与 diff 同序（探针：树 `money.js → cart.js`，diff 同序）；
  - 当前块多了一层头部底色，全部接受后仍分得出 [cap/review3-allacc-dark]；
  - 非法 step 就地写原因 `Start with a verb Tower knows…` [cap/contract-look-bad]；
  - 高亮 120ms `tint-in`；
  - `e.g.` 占位符，浅色约 4.6:1，与真实值 15:1 拉开。
- **手机页成立。** 页头是桌面仪表条；离线页保留中文，写明去哪看，只给一个 `重试` [shots/phone-offline-zh-dark]。
- **Tower 有了自己的标记。** 塔的轮廓不再借用"已验证"的圆环。

**这一轮从外面看，新问题集中在三处，其中一处是回退：**
1. **设置页的开关坏了（H，回退）。**
   - `.settings-form .field-hint { grid-column: 2 }` 把开关里的说明也推进了第二栏。每个开关的说明都贴在标签右边，有的直接粘上：`Also serve on the local networkOff: Tower listens…`。
   - 新加的项目 loopback 开关没有包进 `.form-row`，掉进了 180px 的标签栏。说明被压成每行两三个词，共 25 行；`Project memory` 的标签被挤进字段栏，留下约 550px 高的空洞。中英文都是如此 [cap/settings-full-en-light-2][cap/settings-full-zh-dark-2]。
   - pass 11 说"设置页条款化"，而这一块现在是全应用最难看的一屏。
2. **同一件事，各处说法与字形不一（D6）。**
   - **字形。** C5 的"必然失败的测试通过了"在目标页、读数、侧栏都是琥珀 ◆，在验收 sheet 里却是红 ■ [cap/review1-accept-x]。设置的环境条里身份是琥珀 ◆，紧下面的列表里是空心 ◇。账本的 `Cannot confirm` 用红 ×，与 `Contradicted` 同一字形 [cap/goal1x-en-light-2]。
   - **时间。** 概览同一个"更新"列里，决策行写 `6 min ago`，运行行写 `5m ago` [cap/palette-cart-dark]。
   - **身份串。** 同一个身份列里，决策行是 `G-0004  shop`（间距分组），运行行是 `G-0002 · shop · CC`（中点）。
3. **两处快速一看注意到的问题，属实（见 §2.1）。**
   - 概览行的元信息停在板右缘前 130–170px；
   - 运行行末尾的 `· CC` 是引擎缩写，与前面的身份串语法不同，宽度一变它就挪位置或消失。

**定位。** 评审语义、诚实语法、错误页和中文在主流 harness 里仍领先一代（§5）。
- D6 +0.5：概览重构到位，被一致性问题抵消一半。
- D8 +0.5：评审闭环补齐，只差 `A` 之后的 `⇧A` 是哑键。
- D7 持平：栅格修好了几条线，设置页又折断了一块。
- D9 +1：自己的标记、全大写收回；但中点仍在十几处，设置页给非序列编了 01–07，"唯一的高声时刻"也只有 8% 的缩放。

**修完 §4 #1–#9，D6 / D8 可到 95，D7 到 94.5；D9 过 93 要靠 #12–#14。**

---

## 1. 评分

### 1.1 产品评分表 D6–D9

| 维度 | r9 | r10 | Δ | 判词 |
|---|---|---|---|---|
| D6 页面 / 信息设计 | 94 | **94.5** | +0.5 | **做对了：**<br>- 概览一行一项，航班牌进首屏，只有焦点项展开，"需要你"页保留整卡（r9 #1）。<br>- 读数里 tampered 的 C5 排到了第二（仅在 look 图之后），首屏可见 [cap/review1-readout-x]。<br>- cannot-run 卡中文版只说一次"不是测试失败"。<br>- 空评审去掉了口号和 `Request changes` [shots/review-empty-en-light]。<br>- 欢迎页红项时 primary 是 `Copy the fix` [shots/welcome-red-en-light]。<br>- 运行历史 `Select a run to roll back to its start`，R-01 可 Tab 到。<br><br>**扣分：**<br>- 字形 / 颜色不一：C5 在 sheet 里是红 ■，身份 ◆ / ◇ 混用，`Cannot confirm` 用失败的 ×。<br>- 同一列两种时间格式（`6 min ago` / `5m ago`），两种身份语法（间距 / 中点）。<br>- 文案仍有重复：<br>&nbsp;&nbsp;· 英文 cannot-run 正文末尾仍是 `This is not a test failure.`（`env_error.rs:25`），与 ⚠ 行重复；<br>&nbsp;&nbsp;· 假设卡占位符 `(optional, sent with Approve or Reject)` 下面又有一句 `Both Approve and Reject carry this note.`；<br>&nbsp;&nbsp;· 保留测试卡 ◇ 注第一句重复正文。<br>- 读数副标题写 `Each machine criterion's last result…`，列出的第一项却是 look、第三项是 human。<br>- 评审状态栏 `? This sheet`：这是快捷键表里的自指，放到状态栏就不知所指。<br>- 中文漏译：`相对 base @6be78fa`、`快照与 base 相同`，而同屏另一处写"基线"；还有 `无响应 4m`、`最后动静 4m 前`，与 `5 分钟前` 混用。 |
| D7 UI 视觉设计 | 93 | **93** | 0 | **做对了：**<br>- 概览一条右边界（框、细线、行、展开卡同为 1408）；印章上栅；决策卡等于主栏。<br>- 72ch 正文、`opsz 32` 的 20px 标题（探针 `H1.goal-title fvs "opsz" 32`）。<br>- 手机按钮宽度规则成立；占位符一眼可辨。<br><br>**扣分：**<br>- 设置页开关的说明栏泄漏，loopback 开关错栏（H，§2.2）。<br>- 概览元信息停在右缘前 130–170px；1040 宽时决策行反而溢出板右缘 21px（行 1029，板 1008）[cap/overview-1040]（§2.1）。<br>- 目标页一旦有决策卡，右栏就从卡下面才开始，右上留出约 500×200–600px 的空白 [cap/goal4-en-light-0][cap/goal1x-en-light-0]；右栏也不吸顶，下滑两屏后右侧三分之一全空。<br>- 保留测试文件列表的逗号两边各空 8px：`rounding.test.js ,  tax.test.js`（flex gap 加在了文本节点上）[cap/zoom-goal-c1]。<br>- 中文空态 44ch 只有约 22 个汉字，`Tower 会生 / 成最小合同` 被断开 [shots/overview-empty-zh-dark]。 |
| D8 交互与动效 | 94 | **94.5** | +0.5 | **做对了：**<br>- 当前块可辨；`]` 顺序就是树的顺序。<br>- `[` 后 `⇧A` 出回执 `Unaccepted · src/cart/money.js · Accept again` [cap/k-review-unaccept-receipt]。<br>- 非法 step 说原因；`?` 表写明 Tab 与系统键盘导航 [cap/k-shortcuts-overview]。<br>- 印章 260ms 压入、高亮 120ms 淡入；减动画下 0 个动画。<br>- 空活动 sheet 不再给 `Copy all / Clear`。<br><br>**扣分：**<br>- **`A` 之后马上 `⇧A` 什么也不发生，也没有提示。** `A` 已把当前块移到下一块，`⇧A` 只作用于当前块（`Review.tsx:275`）。"刚才按错了"是最常见的撤回场景，这里是哑键。状态栏也没列 `⇧A`。<br>- 合同编辑器冷打开时主栏空白 1.3–1.8s（dev），没有骨架或加载态；`shots.spec` 的两张合同图因此是白屏。<br>- 回执 toast 底边压在状态栏的顶线上。<br>- 铃铛与 `Remind me later` 是 22×22，人工勾选框画成 14×14（探针）。 |
| D9 美学独特性 | 91 | **92** | +1 | **做对了：**<br>- 塔形标记，与状态字形分开。<br>- 全大写收回到合同抬头一处。<br>- 元信息串大多改成间距与字色分组。<br>- 设置有了条款索引，且索引的"此处"用的是当前块那支 2px 笔。<br><br>**差在：**<br>- 中点仍有十几处：命令面板 `Review G-0001 · Fix the cart total`、回执 `Unaccepted · path`、`assertions not checked · a pass proves less here`、PR 行、Overlaps 行、欢迎页样例 `Verified @a4a90b2 · ━━`、运行行身份串。<br>- 设置页给七个**不是序列**的分区编号 01–07。合同的条款编号是真序列，设置借过来就成了 frontend-design 点名的那种"01 / 02 / 03"装饰。<br>- "全应用唯一允许张扬的时刻"是一个 20px 的行，以 1.08 → 1 缩放压入；截图里看不出它是盖章，记不住。<br>- 品牌标记 14px 灰色，出现在每个空态上方，成了重复的抬头，而不是一个时刻。 |
| **综合** | 93.0 | **93.5** | +0.5 | |

### 1.2 12 项美学子分

| # | 子项 | r6 | r7 | r8 | r9 | r10 | Δ | 判词 |
|---|---|---|---|---|---|---|---|---|
| 1 | 美学与原创性 | 88 | 89 | 90 | 90 | **91** | +1 | 自有标记、全大写收回。扣：中点残留，设置页编号是借来的装饰。 |
| 2 | 排版（拉丁 + CJK） | 88 | 89 | 89 | 90 | **90** | 0 | 加：`opsz` 显示轴、72ch。扣：中文 44ch ≈ 22 字；逗号孤悬；`· CC` 是 mono 与 Inter 两种字体拼在一个身份串里；中文单位 `4m` 与 `5 分钟前` 混用。 |
| 3 | 颜色与对比 | 89 | 90 | 91 | 92 | **92** | 0 | 加：占位符 4.6:1 对 15:1。扣：同一事实在两处一红一琥珀（C5）；`Cannot confirm` 借失败红。 |
| 4 | 布局与层级 | 89 | 91 | 92 | 92 | **92** | 0 | 加：概览、印章、决策卡宽。扣：设置开关错栏；目标页右栏空洞；元信息不到右缘；1040 溢出。 |
| 5 | 密度与节奏 | 89 | 90 | 90 | 91 | **92** | +1 | 概览五行一屏看全。扣：cannot-run 正文段间空一整行。 |
| 6 | 组件工艺 | 88 | 90 | 91 | 92 | **91** | −1 | 扣：`Toggle` 在设置表单里说明错位（选择器泄漏），这是一个组件级缺陷，波及 6 个开关。 |
| 7 | 动效与反馈 | 88 | 91 | 91 | 92 | **93** | +1 | 加：`tint-in`、印章、回执。扣：`A` 后 `⇧A` 无反馈。 |
| 8 | macOS 原生感 | 89 | 90 | 91 | 91 | **91** | 0 | Tab 的平台差异写进了 `?` 表；Tab 本身在 WebKit 默认下仍只到输入框和 R-01（探针：quick-input ↔ body 循环）。 |
| 9 | 图标与字形 | 92 | 92 | 92 | 93 | **93** | 0 | 加：品牌与"已验证"分家。扣：◆ / ■ / ◇ 在 sheet、设置里错用；环境的 ⚠（卡片）与 ◫（标准行）不是同一个字形。 |
| 10 | 空 / 加载 / 错误状态 | 90 | 92 | 92 | 92 | **93** | +1 | 加：手机离线、空评审、启动失败仍是最好的一屏 [cap/boot-fail-en-light]。扣：合同冷打开白屏无加载态。 |
| 11 | 浅色主题 | 89 | 90 | 91 | 91 | **91** | 0 | 无新问题。 |
| 12 | 品牌性格 / 记忆点 | 86 | 89 | 90 | 90 | **91** | +1 | 加：塔形标记。扣：印章时刻太轻，没有一张"只属于 Tower"的截图。 |
| | **综合** | 89 | 90 | 91 | 91.3 | **91.7** | +0.4 | |

### 1.3 r9 修复清单落地核对

| r9 # | 项目 | 状态 | 证据 / 残留 |
|---|---|---|---|
| 1 | 概览决策一行一项，焦点才展开，航班牌进首屏 | **已修** | [shots/overview-en-light][-j]。残留：元信息不到右缘、`· CC`、1040 溢出（§2.1） |
| 2 | 分区线止于卡片列；决策卡等于主栏；印章上栅 | **已修** | 探针：框、细线、行同为 264–1408；印章右缘 = 页右缘。残留：目标页右栏空洞（§2.3） |
| 3 | 正文 72ch，空态 44ch | **已修** | 探针 72ch。残留：中文 44ch 太窄 |
| 4 | 读数里不作数 / 失败先于通过 | **已修** | C4（look 图）→ C5 tampered → C3 → C1。残留：副标题仍写"每条机器标准" |
| 5 | 文案一事一职 | **大部分** | 中文已去重；英文监督器文案仍重复；新增的假设卡、保留测试卡重复；`? This sheet` |
| 6 | 非法 step 就地写原因 | **已修** | [cap/contract-look-bad] |
| 7 | 占位符 `e.g.` / text-4 | **已修** | 探针。残留：合同 `Ports on this machine` 的 `5432, 6379` 没有 `e.g.` |
| 8 | 树与 diff 同序；当前块 / 已接受可辨 | **已修** | 探针、[cap/review3-allacc-dark] |
| 9 | 手机离线语言、次按钮宽度 | **已修** | [shots/phone-offline-zh-dark][shots/phone-en-light] |
| 10 | 队列焦点单线；`?` 表写 Tab | **已修** | [cap/probe-overview-j-focus][cap/k-shortcuts-overview] |
| 11 | 运行历史可聚焦 | **已修** | 探针：Tab 到 R-01，2px 左笔 |
| 12 | 欢迎页红项时修环境是 primary | **已修** | `Copy the fix`。残留：干净变体里"打开 Pi 登录"同屏出现两次（行内一次、primary 一次） |
| 13 | 高亮淡入 | **已修** | `tint-in:120`。生产包到达时间未复测 |
| 14 | 夹具 | **部分** | tampered C5、保留测试一致已修。仍有：<br>- 手机截图用的是生图，G-0004 写"stopped without submitting"，桌面写"held-out failed"；<br>- `welcome-clean` 仍有红项 `Pi has no models available yet`；<br>- G-0003 的 `money.js +7 −0` 显示的是与 `cart.js` 相同的一行改动；<br>- `shots.spec` 的 `press("?")` 打不开快捷键表，合同两张截图白屏（§4 #15） |
| 15 | 减法：全大写、中点、尾巴 `›` | **部分** | 全大写与 `›` 已收；中点十几处残留（§1.1 D9） |
| 16 | 设置条款化、布尔控件统一、页内索引 | **部分，且有回退** | 索引与条款头成立；开关布局坏了，loopback 开关错栏（§2.2） |
| 17 | 手机页头仪表条 | **已修** | `1/4 running $0.09`；离线时熄灭为 `—/— 运行 — ■ 离线` |
| 18 | `opsz` 显示轴；品牌标记分家 | **已修** | 探针、`BrandMark`（`components/ui.tsx:243`） |

合计：13 项已修，1 项大部分，4 项部分（#16 含回退）。

---

## 2. 全局问题与修法

### 2.1 概览：右缘与 `· CC`（M，D7 / D9）

**右缘（属实）**

| 宽 | 板右缘 | 决策行最后一个字 | 运行行最后一个字 | 差 |
|---|---|---|---|---|
| 1240 | 1208 | 1123 | 1123 | 85px（身份列已隐藏） |
| 1440 | 1408 | 1238 | 1277 | 131–170px |
| 1800 | 1656 | 1486 | 1525 | 131–170px |

- **原因：** `.g-row` 的列是 `… 6.5em 12.5em 5em`（`app.css:3931`）。
  - 身份列 12.5em 左对齐，内容只有约 92px；
  - 最后的 `.g-act` 5em（65px）只有 `in_review` 的行才放 `Review` 按钮，而概览上没有这样的行，于是每行右侧都有一块空槽。
- 右缘的细线与展开卡都在 1408，文字停在 1238，**一屏两条右边界又回来了**，只是换了位置。
- **修法：**
  - 身份列右对齐（`.g-id { justify-content: flex-end }`），让 ID 落在右缘；
  - `.g-act` 改为 `minmax(0, auto)`，或者只在分组里有可操作行时才给列宽（`data-has-act`）。

**`· CC`（属实）**
- 它是 `engineMark`：goal 的引擎不是默认引擎时，用两个字母标出（Claude Code），完整名称只在 tooltip 里（`GoalRow.tsx:95-100`）。外人看到的问题有三个：
  1. **语法不一。** 同一身份列里，决策行是 `G-0004  shop`（间距），运行行是 `G-0002 · shop · CC`（中点）。53c7a36 只改了目标页身份行和决策行，`GoalRow` 没改。
  2. **字体拼接。** `CC` 是 JetBrains Mono t3，前面的 `shop` 是 Inter，中点又是 t3。三段视觉重量不同，`CC` 看起来像掉在行尾的碎片。
  3. **位置随宽度跳动。** ≥1560 时在行尾；1400–1560 拥挤行隐藏；<1400 消失；<1240 跳到实况行前面变成 `CC Unresponsive`。同一信息三种去处。
- **修法：**
  - 引擎用词，不用缩写：在身份列写 `Claude Code`（t3，Inter），位置在 ID 之前；
  - 只有一个项目时，不重复写 `shop`（它在快速开始框里已经说了），这样腾出的空间正好放引擎名；
  - 窄宽下统一只进 tooltip，不挪到实况行前面。
- 文件：`components/GoalRow.tsx`、`app.css .g-id / .g-engine*`、`views/Overview.tsx`（决策行身份）。

**1040 宽溢出**
- 决策行的行宽 1029，板右缘 1008（探针 `overview 1040 overflow`）。决策行的行线伸出细线 21px [cap/overview-1040]。
- `@media (max-width:1240px)` 改了 `.g-row` 的列，但决策行的 `grid-column: 3 / 7` 跨列逻辑在窄栅格下多出一列。
- 修法：决策行在窄宽下跨到 `-2`，并在 e2e 里断言 `row.right <= board.right`。

**时间格式**
- 同一列，决策行 `6 min ago`，运行行 `5m ago`（`agoShort`）。改用一个格式化函数。
- 建议用短格式：仪表条也是短格式，这样两处一致。

### 2.2 设置页开关（H，D7，回退）

**现状**
- `Toggle`（`components/ui.tsx:156`）把标签和说明放进 `.toggle-text`（一个两行的 grid）。但 `.settings-form .field-hint, .settings-form .field-error { grid-column: 2 }`（`app.css:3572`）也命中了开关内部的 `.field-hint`。结果是说明被放进 `.toggle-text` 隐式的第二列，紧贴标签，gap 只有 2px：
  - `Load all my Pi extensionsExtensions run outside…`
  - `Also serve on the local networkOff: Tower listens…`
  - `开启手机页面 … 关闭后页面立即不可达。` 漂在 x≈990
  - 每个开关的说明左缘各不相同（928 / 963 / 910 / 1015）。
- 项目 loopback 开关（`views/Settings.tsx:708`）没包 `<div class="form-row">`，被自动放进 180px 标签栏：
  - 标签 5 行，说明 25 行；
  - `Project memory` 的标签被挤进字段栏，下面留约 550px 高的空洞；
  - 中英文都一样。这是本轮新功能的入口，也是全应用最难看的一屏。

**修法（S）**
- `Settings.tsx:708` 的 `<Toggle>` 包进 `<div class="form-row">`。
- 选择器收窄为 `.settings-form > .field > .field-hint`；再加 `.toggle-text .field-hint { grid-column: auto; margin-top: 0 }`。
- 开关的说明一律放在标签下一行（与合同编辑器 Isolation 的开关同一排法，那边是对的 [cap/contract-look-bad]）。
- 加一条 e2e：设置页每个 `.toggle-row` 的左缘等于字段栏左缘，说明的 top 大于标签的 bottom。

### 2.3 目标页右栏空洞（M，D7）

- 有决策卡的目标页（G-0001、G-0004、G-0005），右栏 `Contract v1 summary` 从卡片下面才开始（y≈470 / 840），右上留出约 500×(200–600)px 的空白 [cap/goal4-en-light-0]。
- 右栏不吸顶，滑过第一屏后右侧三分之一完全空白 [cap/goal1x-en-light-1]。
- **修法：**
  - 页头之下立即进入两栏网格：决策卡只占主栏的第一行，右栏从同一 y 开始；
  - 右栏 `position: sticky; top: var(--sp-4)`，内容超过视口时自身滚动；
  - 1280 以下右栏折到下方，保持现状。
- 文件：`views/GoalPage.tsx`、`app.css .goal-body`。

### 2.4 同一件事，一个字形（M，D6）

| 事实 | 处 A | 处 B | 应为 |
|---|---|---|---|
| C5 必然失败的测试通过了 | 目标页 / 读数 / 侧栏：琥珀 ◆ | 验收 sheet：红 ■（`views/review/panels.tsx` 的 judgement 列表按严重度画） | 琥珀 ◆；红 ■ 只留给哨兵的高严重度 |
| git 身份缺失 | 设置环境条：琥珀 ◆ `not set` | 同块列表与欢迎页：空心 ◇ | ◇（它不阻塞运行，只阻塞写分支） |
| 账本 `Cannot confirm` | 红 ×（与 `Contradicted` 同） | — | Agent 自己说"没跑过"，这不是反驳，而是"不作数"：用琥珀 ◆ 加 `Cannot confirm`，红 × 只留给 `Contradicted`（`components/Honesty.tsx:101`） |
| 环境问题 | 卡片 ⚠ 三角 | 标准行 `env-line` 的 ◫ | 一个字形；`Glyph.tsx` 自己说三角不用于生命周期，环境也应该用 ◫ |

### 2.5 文案（M，D6）

| 位置 | 现状 | 应为 |
|---|---|---|
| 英文 cannot-run 正文 | `…needed (exit code 255). This is not a test failure.`（`crates/tower-supervisor/src/verify/bench/env_error.rs:25`），⚠ 行已说过 | 去掉末句；中文已经是对的 |
| 假设卡 | 占位符 `(optional, sent with Approve or Reject)` 加脚注 `Both Approve and Reject carry this note.` | 留一处：占位符写 `A note for the agent (optional)`，脚注保留 |
| 保留测试卡 ◇ 注 | `The agent does not know these tests exist.` 与正文 `The agent does not know these tests` 重复 | ◇ 注只说选择的后果：`A hint, or only the names, keeps them hidden; showing the failure does not.` |
| 保留测试芯片 | `held-out tests, 1 of 2 ran, for you only` | `Held-out tests: 1 of 2 ran, for you only`。三个逗号串成的短语读不出主次 |
| 读数副标题 | `Each machine criterion's last result and output tail on a clean checkout.`，下面列的是 look / human | `Every criterion's last result, the ones that need you first.` |
| 评审状态栏 | `? This sheet`（`en.ts:197` 的 `keys.shortcuts` 两处复用） | 状态栏用独立键 `All keys` / `全部快捷键` |
| hunk 头 | `Undo this hunk` 与 `⇧A`（撤销接受）同用"撤销"一词 | `Revert hunk` / `还原此块`。"Undo"留给接受的反操作 |
| 中文 | `相对 base @6be78fa`、`快照与 base 相同` | `相对基线`，与同屏"基线"一致 |
| 中文 | `无响应 4m`、`最后动静 4m 前` | `无响应 4 分钟`、`4 分钟前`，与列表同单位 |
| 合同 | `Ports on this machine` 占位 `5432, 6379` | `e.g. 5432, 6379` |

### 2.6 评审：`A` 之后的 `⇧A`（M，D8）

- 现在：`A` 接受并前进，当前块变成下一块；此时按 `⇧A`，`unacceptHunk` 发现当前块未接受就直接返回，**没有任何反馈** [cap/review3-unaccept]（money.js 仍是 `Accepted`）。必须先 `[` 回去再 `⇧A` 才有回执。
- 修法（二选一）：
  - **撤回栈：** `⇧A` 在当前块未接受时，撤回最近一次接受的块，并把它设为当前；回执不变。这与 macOS 的 ⌘Z 直觉一致。
  - **说明：** 当前块未接受时，`⇧A` 给一条 toast `Nothing accepted here; [ goes back`。
- 状态栏加 `⇧A take back`。
- 文件：`views/Review.tsx:275-280, 378-385`，以及 `review-keys.spec.ts` 加一条。

### 2.7 中文行宽（M，D7）

- `.empty-body { max-width: 44ch }`：`ch` 是半角"0"的宽，一个汉字约 2ch，所以中文只有约 22 字一行，`Tower 会生 / 成最小合同` 被断开。
- 修法：`:lang(zh) .empty-body { max-width: 28em }`。卡片正文的 72ch 同理，中文约 36 字，可以接受，但建议 `:lang(zh) { max-width: 40em }`。

---

## 3. 逐屏审计（摘要）

### 3.1 标题栏与侧栏
- 仪表条 `◔ 1/4 running ▫ silent for 4m $0.11 🔔 ● Engine Pi demo-engine` 仍是全应用最好的一条线。
- 欢迎页的红项状态下，仪表条的引擎点仍是中性灰，没有反映 `Pi demo-engine is too old`。

### 3.2 概览 / 需要你
- 概览见 §2.1。展开卡的标题顺序与行不同：行是"目标 → 类别 → 问题"，卡头是"类别 → ID → 目标"。可以接受，但展开那一刻眼睛要重新找。
- "需要你"页：只有焦点卡有填充 primary；保留测试卡的 `Send the hint and resume` 在空文本时是禁用灰。

### 3.3 目标页
- 印章上栅；哨兵证据 mono 折行有了悬挂缩进；notes 一行一个语域。
- loopback 注记 `loopback opened: your tests use it on the base` 以 t4 出现，安静，但"the base"对新用户是行话。中文"已放开本机回环：你的测试在基线上就用到它"更清楚。
- 问题：
  - 右栏空洞（§2.3）；
  - 逗号间距 [cap/zoom-goal-c1]；
  - `Open changes` 右缘在 1426，比标准列右缘 1438 短 12px（按钮内边距没有外扩）；
  - 刻度行 `Observed 0/3  ·  Human 0/2` 最后一个中点两边空得更大，同一行有两种间距。

### 3.4 评审
- 键盘闭环、回执、当前块都成立。
- 读数：tampered 排在首屏。
- 验收 sheet：`Passed, not evidence @b144ff4` 作抬头，红项分组；git 身份缺失时 `Accept anyway` 禁用，理由就在上面。这些都对。
- 问题：
  - C5 字形（§2.4）；
  - `⇧A`（§2.6）；
  - 夹具里 money.js 的 diff 与 cart.js 相同。

### 3.5 合同编辑器
- look steps：编号行、动词列头 `click type press wait wait for`、非法步骤红框加原因。成立。
- Isolation 的开关排法正确（标签在上、说明在下），可以作为设置页的样板。
- 问题：冷打开白屏（§1.1 D8）。

### 3.6 设置
- 环境块 `Pi ■ demo-engine  git ✓ 2.56.0  Sandbox ✓ on  Identity ◆ not set` 是好的仪表语言。
- 条款索引吸顶，当前条款用 2px 笔标出。
- 问题：
  - 开关（§2.2）；
  - 01–07 编号（§1.1 D9）；
  - 两条右边界：输入框止于 1360（520px 列），条款细线和"你的记忆"大文本框止于 1533。

### 3.7 欢迎 / 启动失败 / 空态
- 启动失败页仍是全场最好的一屏：熄灭的仪表、错误框、`Retry` / `Open the data folder`、数据目录 [cap/boot-fail-en-light]。
- 欢迎页底部一行四个动作（`Check again` / `Try a demo goal` / `Add a git repository` / primary），三个 ghost 等重，层级弱。
- 空评审的海报左缘 x≈45，与页头标题的左缘 167 不对齐 [shots/review-empty-en-light]。

### 3.8 手机页
- 仪表页头、单 primary、全宽按钮、离线语言都成立。
- 卡头把目标标题截成 `Find out why chec…`；390 宽可以让标题换到第二行，不必截断。

### 3.9 动效、焦点与可达性
- 有动画的地方：印章 260ms、`tint-in` 120ms、行到达、折叠；减动画下全部为 0（探针）。
- 概览展开卡是瞬时的（逐帧高度 431 不变）。这符合"不做装饰动效"，但下面的行会一次跳 180px。建议给行的位移 120ms，只在 `no-preference` 下。
- 焦点：
  - 字段是 1px 内描；
  - 卡片是 1.5px 边框；
  - 行与运行行是 2px 左笔；
  - 标题按钮是 1.5px `--focus` 外环。
- 一共四种。r9 要求"一条线"，就单个组件而言做到了；全局还是四种语法，建议收成"块用 2px 左笔，字段与按钮用 1.5px 外环"两种。

---

## 4. 优先修复清单

影响：H = 信息矛盾、闭环断裂或明显坏版；M = 单屏明显；L = 细节。工作量：S < 半天，M ≈ 1 天，L ≈ 2–3 天。

预期：
- 完成 #1–#9：D6 / D8 约 95，D7 约 94.5；
- #10–#11 是 95 的打磨；
- #12–#14 决定 D9 能否过 93；
- #15 是审计基础设施。

| # | 改动 | 文件 | 预期效果 | 解锁 | 影响/工作量 |
|---|---|---|---|---|---|
| 1 | 设置开关：loopback 开关包进 `.form-row`；`.field-hint` 的 `grid-column:2` 只作用于 `.field` 的直接子元素；开关说明一律在标签下一行；加几何 e2e | `views/Settings.tsx:708`、`styles/app.css:3572`、`components/ui.tsx:156`、`e2e/settings.spec.ts` | 设置页回到一条左缘、一条说明规则；新功能入口可读 | D7 +0.5、子分 6 | H / S |
| 2 | `⇧A` 撤回最近一次接受（或给提示）；状态栏列出 `⇧A` | `views/Review.tsx:275-385`、`e2e/review-keys.spec.ts` | 评审闭环里不再有哑键 | D8 +0.5 | H / S |
| 3 | 概览右缘：身份列右对齐，`.g-act` 无内容时不占列；1040 下决策行不溢出；同一列一个时间格式 | `styles/app.css:3931 .g-row / .decision-line`、`components/GoalRow.tsx`、`views/Overview.tsx` | 文字与细线同一右缘 | D7 +0.5 | M / S |
| 4 | 身份串一种语法：去掉 `GoalRow` 的中点；引擎写全名，不写 `CC`；单项目时不重复项目名；窄宽统一进 tooltip | `components/GoalRow.tsx:77-119`、`lib/labels.ts engineMark` | 不再有行尾的 `· CC` 碎片 | D9 +0.5、D6 | M / S |
| 5 | 一事一字形：C5 在 sheet 用琥珀 ◆；身份统一 ◇；`Cannot confirm` 走琥珀，红 × 只给 `Contradicted`；环境统一 ◫ | `views/review/panels.tsx`、`views/Settings.tsx env-gauges`、`components/Honesty.tsx:101`、`components/DecisionCard.tsx`、`app.css:622` | 颜色与字形在全应用只有一个意思 | D6 +0.5、子分 3 / 9 | M / S |
| 6 | 目标页右栏从页头下开始，吸顶 | `views/GoalPage.tsx`、`app.css .goal-body` | 去掉右上空洞与右侧空栏 | D7 +0.5 | M / M |
| 7 | 文案去重与命名（§2.5 全表），含英文监督器 cannot-run 末句、`? This sheet`、`Undo this hunk` → `Revert hunk`、中文"基线"与分钟单位 | `crates/tower-supervisor/src/verify/bench/env_error.rs:25`、`lib/locales/en.ts` / `zh-CN.ts`、`components/DecisionCard.tsx`、`views/review/panels.tsx` | 每句话只做一件事，词汇一致 | D6 +0.5 | M / S |
| 8 | 保留测试注记的文本流：文字与文件名放进一个 inline span，逗号紧贴；芯片改为 `Held-out tests: 1 of 2 ran, for you only` | `components/Honesty.tsx HeldOutLine / HeldOutFiles`、`app.css:1793` | 文件列表读起来像句子 | D7、D6 | M / S |
| 9 | 合同冷打开：先在生产包上测；超过 150ms 就给条款骨架（与空概览的空心行同一语言） | `views/ContractEditor.tsx`、`App.tsx` 懒加载、`e2e/tauri.ts LANDMARK` 加 `new` | 首帧不白 | D8 | M / S |
| 10 | 中文行宽按 em 计：空态 28em，正文 40em | `app.css .empty-body / .decision-body`（`:lang(zh)`） | 中文不再每行 22 字 | D7 | L / S |
| 11 | 焦点收成两种语法；回执 toast 让出状态栏；铃铛与稍后按钮点按区 ≥ 28px（画面不变） | `app.css` 焦点规则、`.toast`、`.bell` | 一套焦点规则，目标易按 | D8 | L / S |
| 12 | **减法第二轮**：中点从命令面板、回执、canary 注记、PR 行、Overlaps 行、欢迎样例里收掉，只留在刻度条与预算两条仪表线上 | `components/Palette.tsx`、`views/Review.tsx` toast、`components/Honesty.tsx`、`components/Pr.tsx`、`views/Welcome.tsx`、locales | 诚实语法成为唯一装饰 | D9 +0.5 | M / M |
| 13 | 设置去编号：索引与条款头保留，01–07 去掉（设置不是序列；合同的条款号被别处引用，才是真序列） | `views/Settings.tsx ClauseHead`、`views/SettingsIndex.tsx` | 去掉借来的"01 / 02 / 03" | D9 +0.5 | L / S |
| 14 | 印章时刻做成真的盖章：<br>- 验收 sheet 抬头用 32–40px `opsz` 显示字；<br>- pin 放进一个 1px 印框（mono，tnum）；<br>- 压入时印框从 1.5px 收到 1px，字从 0 到 1；减动画下静止。<br>同一枚印出现在已接受目标的页头，成为 Tower 唯一的大字 | `views/review/panels.tsx:287-305`、`components/Glyph.tsx Seal`、`app.css .accept-stamp` | 一张只属于 Tower 的截图 | D9 +1、子分 12 | M / M |
| 15 | 夹具与截图：<br>- `shots.spec` 用 `Shift+Slash` 打开 `?` 表；<br>- 合同截图等 landmark；<br>- `welcome-clean` 给 models；<br>- 手机截图走 `enrichRich`；<br>- G-0003 的 money.js 用自己的 diff | `e2e/shots.spec.ts`、`e2e/phone.spec.ts`、`e2e/rich.ts`、`e2e/tauri.ts` | 预览世界不自相矛盾，截图不空白 | 审计基础设施 | L / S |

---

## 5. 与主流 harness GUI 的对比（2026-10 下旬）

来源由子代理检索（文末注），引文接近原文；"未证实"表示只见于搜索摘要。

| 产品 | 本月与 UI 相关的变化 |
|---|---|
| **Claude Code 桌面** | v2.42304.0（10-15）大改版：<br>- 对话右侧加"会话栏"，卡片包括 environment、context、connectors、outputs、changes、servers、background tasks，可右键选择显示哪些；<br>- PR 控件进 Changes 卡，有 `Auto-fix`、`Merge when ready`；<br>- 权限请求与提问进对话流；<br>- 结束时的 recap 框带"下一步"按钮。<br>v2.19675.0（10-01）行内批注。CLI 2.1.309（10-22）云会话 Changes 面板"说明它只列出已推送的提交，还是只列 Claude 的编辑"。桌面没有 diff 键盘或减动画相关的变化 |
| **Codex 应用** | 评审范围 Unstaged / Staged / Commit / Branch / `Last turn`；整 diff、文件、单 hunk 三级 stage / revert；行内 `+` 批注。26.1007（10-08）Changes 面板滚动与文件导航；26.930 修大 diff 在某些缩放下空白。文档里没有 hunk 间导航键 |
| **Cursor** | 10-06 iOS 远程控制本地 agent（"不会把 agent 移到别处"），设置里有"保持电脑唤醒"。9-23 Rollouts 在 PR 上给出 `verified healthy` / `regression detected` / `inconclusive` 的判定 |
| **Conductor** | 0.92.0（10-23）扫码配对，手机可浏览、创建本地工作区、停止 agent，插电时保持 Mac 唤醒。0.91.0（10-15）agent 工作时停止按钮成为 primary；⌘K 搜到已关闭的聊天 |
| **Devin 桌面** | 3.11.212（10-23）：<br>- 侧栏拖拽，最多 8 个会话并排；<br>- 本地会话的 Changes 有 `Since last seen` 范围；<br>- `⌘⇧E` 标记完成；<br>- Enter 引导当前回合，⌘Enter 排队 |
| **Amp** | 10-12 Changes 面板"智能排序"；阅读中顺序不变，有新顺序时按钮上亮蓝点，可切回字母序 |
| **Factory / Zed / Warp** | Factory 0.194 工具摘要用现在时并带计数（未证实）；Zed 1.25.2 修整文件覆写显示为全增（未证实）；Warp 10-15 修 Claude Code 后台任务未完时反复报告完成（未证实） |
| **设计参照** | Linear 10-08：<br>- 堆叠 PR 在 Diffs 里一眼看评审、CI、合并状态；<br>- 合并前可预览整栈；<br>- **非必需检查失败时加合并确认**；<br>- Guides 的上一节 / 下一节不会把该节标为已评审。<br>Things 3.25 iPhone 拇指区工具条与全键盘（未证实）；Raycast 2.9 HUD 显示进行中状态（未证实）；Arc 无条目 |
| **评测** | 本月没有找到独立评测；对比页都出自竞品自家（superset.sh、paradev 等）。Paradev 称 Conductor 是"2026 这一波最精致的并行 agent 应用"（未证实） |

### 5.1 Tower 领先的地方

1. **每条标准的证据。** 检索范围内没有一家在界面上逐条展示"验收标准与证据"。最接近的是：
   - Linear 的"失败的非必需检查时确认合并"；
   - Cursor Rollouts 的三态判定；
   - Conductor 的检查状态。

   Tower 的 `Passed, not evidence`、`1 of 2 ran, for you only`、`Cannot confirm` 和验收时的 `Accept anyway`，在对照组里没有同类。
2. **评审键盘。** Codex 有 hunk 级 stage，但没有文档化的 hunk 导航；Claude Code 桌面没有 diff 键。Tower 的"当前块 + 只接受 + 带回执的撤回"仍是唯一一套（修好 §2.6 之后才算闭环）。
3. **错误与空态的立场。** Factory、Warp 本月还在修"看起来空闲 / 反复报完成"。Tower 的 `silent for 4m`、熄灭仪表的启动失败页、骨架板，早就站在这个立场上。
4. **中文。** 整卡中文、离线也记得语言。

### 5.2 Tower 落后的地方

| 方面 | 它们 | Tower | 差距性质 |
|---|---|---|---|
| diff 范围 | Codex `Last turn`、Devin `Since last seen`、Claude Code"说明 Changes 列的是什么" | 只有整次评审；返工后的第二轮评审看不到"自上次以来" | 功能缺口，影响返工流程 |
| 多会话 | Devin 8 个会话并排；Claude Code 嵌套会话、分组排序 | 一张航班牌加单个目标页 | 立场不同，可接受；但航班牌行内信息还可以更满（§2.1） |
| 手机 | Cursor、Conductor、ChatGPT iOS 本月都是原生应用，可停止 agent、保持 Mac 唤醒、扫码配对 | 一页 HTML；能答、能稍后、能暂停；有二维码，没有保持唤醒 | 材质落后，立场一致 |
| 设置的工艺 | Claude Code 桌面的会话栏卡片可自选 | 设置页开关坏版（§2.2） | 回退，必须先修 |

### 5.3 一句话定位

Tower 在"证据语义、评审键盘、错误与空态、中文"上仍领先 Codex / Claude Code / Cursor / Conductor 一代。这一轮把概览做成了真正的塔台。

它与 Linear / Things 的距离，现在不在构图大块，而在**一致性与收尾**：
- 同一事实一个字形；
- 同一列一种语法；
- 每个组件在每个容器里都对；
- 一个记得住的时刻。

---

## 6. 要到 95，每个维度必须成立的事

**D6 页面 / 信息设计（94.5 → 95+）**
- 同一事实在全应用一个字形、一个颜色（#5）。
- 同一列一种时间格式、一种身份语法（#3、#4）。
- 没有一句重复的话，没有自指的标签；中文没有漏译的 `base`（#7）。
- 读数的副标题说的就是它列出的东西（#7）。

**D7 UI 视觉设计（93 → 95+）**
- 每屏一条左缘、一条右缘：概览文字到右缘；设置输入框与条款细线同宽，或者有意识地两档（#1、#3）。
- 任何组件放进任何容器都不错位（`Toggle` 在设置表单里，#1）。
- 目标页没有空洞（#6）。
- 中文按 em 计行宽（#10）；文件列表像句子（#8）。

**D8 交互与动效（94.5 → 95+）**
- 每个键在每个状态下都有结果或提示（`⇧A`，#2）。
- 首帧不白（#9）。
- 焦点两种语法以内；toast 不压界面（#11）。
- 展开卡时，被推开的行有 120ms 位移，只在 `no-preference` 下（§3.9）。

**D9 美学独特性（92 → 95+）**
- 中点只在仪表线上（#12）；编号只给真序列（#13）。
- 一个只属于 Tower 的时刻，能放进对比截图（#14）：验收的印章。它是全应用唯一的大字、唯一的高声，盖下的那一下在截图里也看得出是盖章。
- 品牌标记不当每个空态的抬头，只出现在欢迎、启动失败和手机页头这三个"门口"。
- 引擎、项目这类身份信息用词，不用缩写碎片（#4）。

---

## 7. 关于评分口径

- 本轮允许半分，因为四个维度的变化方向不同：概览与评审的修复是实打实的，而设置页回退和一致性问题同样实打实，整分会把两者都抹平。
- D7 不动，不代表 pass 11 的栅格工作无效。r9 #2、#3 都修了；被设置页的回退（组件级缺陷，6 个开关加 1 个新入口）和目标页空洞抵消。
- 子分综合 91.7，低于 D 综合 93.5。差距在第 1、6、12 项：原创性仍被中点稀释，组件工艺这轮扣了分，品牌时刻还没成形。

---

## 8. 附：本轮截图与探针（`/tmp/audit-d10/`，未入库）

| 位置 | 内容 |
|---|---|
| `shots/`（73） | `shots.spec`：概览（浅英、深中、深中 1100、浅英 1800、`j j`）、空概览、需要你、欢迎红 / 干净、G-0001 / 2 / 4 / 5、保留测试卡、cannot-run 卡、look 比较、评审 G-0003 / G-0001（全部接受、读数、验收 sheet、空评审）、合同（两张 en 白屏）、设置及其两块、快捷键（`?` 未打开）、活动空态；`phone.spec`：手机浅英 390、深英 430、浅中 430、深中、保留测试、离线中 / 英 |
| `cap/`（61） | 概览深英 / 浅中、1040 / 1240 / 1400 / 1600；启动失败浅英 / 深中；欢迎红 1040；G-0001 长页分屏（m of n、loopback、cannot confirm；浅英、深中、1100）；G-0002 深中、G-0003、G-0004、G-0005；评审 `]` / `A` / `A⇧A` / `[⇧A` 回执 / 全部接受深色 / 1100 / 1800；读数、验收 sheet（红项、干净深中）；合同深英、1100、非法 step；设置全页浅英 / 深中、1100；命令面板、快捷键表（概览、评审）；焦点；局部放大 |
| `probes.jsonl` / `probes2.jsonl` | 概览几何（三档宽）、字体特性、<24px 目标、截断、Tab 顺序与焦点样式、逐帧动画、减动画、hunk 样式、树 / diff 顺序、占位符颜色、行宽、合同首帧时间、1040 溢出、验收动画 |

注（来源）：
- Claude Code 桌面 changelog：https://claude.com/docs/cowork/changelog ；CLI：https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md
- Codex：https://learn.chatgpt.com/docs/changelog?type=codex-app ；https://learn.chatgpt.com/docs/code-review?surface=app
- Cursor：https://cursor.com/changelog/remote-control-local-agents ；https://cursor.com/changelog
- Conductor：https://conductor.build/changelog
- Devin：https://docs.devin.ai/desktop/changelog ；Amp：https://ampcode.com/news/first-things-first-faster
- Linear：https://linear.app/changelog/2026-10-08-stacked-pull-requests
- 未证实：Factory、Zed（releasebot.io）、Warp（docs.warp.dev/changelog/2026/）、Things 3.25（macrumors.com 2026-10-22）、Raycast 2.9、Dia、Craft、paradev.com
