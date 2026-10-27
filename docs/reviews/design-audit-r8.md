# Tower 设计审计 r8（信息设计、视觉、交互与动效、独特性）

> **本轮由 Opus 审计**：Fable 模型本轮用量已满，改由 Opus 5.5 按 r7 的同一套判准与刻度执行。分数与 r7（`docs/reviews/design-audit-fable-r7.md`：D6 92 / D7 92 / D8 93 / D9 89）直接可比。换了审计人，评分可能有系统偏差；本轮宁可偏严。
>
> 日期：2026-10-27。范围：D6–D9 与 12 项美学子分。对照 r7 之后的 43 个提交（`188fe2a..d8ebdf3`），其中 UI 相关的有：tampered 不计入（e624b93）、树 ARIA / 测试名 chip / 简报 / 队列单 primary（249a6de）、看图条前置 / 开关 28×18 / 身份表单等高（43df5d4）、沉默按分钟 / 轨迹渐隐 / 手机稍后菜单 / 夹具语言（b8cceff）、hunk 折叠 160ms 与最后一块的去处（1a0196e）、合同编辑器像合同 / Environment 仪表条 / sheet 字标标题 / 队列翻页不重入（cb36e87）、无保留测试一句话 / 金丝雀措辞 / 拒绝路径读作环境问题（c8c442c）、`criteria_cannot_run` 暂停（f6bc814、293fda1）、look 标准的 `steps`（20fa955）、Enter / Space 归焦点元素（d8ebdf3）。
>
> 取证：用 **Playwright WebKit 1.64.1** 渲染真实 Vite 页面（`E2E_PORT=1461`，独立 TMPDIR `/tmp/audit-r8`）。Tauri IPC 走 `apps/desktop/e2e/tauri.ts` 的 shim，回放**本轮重新 seed 的监督器视图**：英文种子 `/tmp/audit-r8/fx`，中文种子 `/tmp/audit-r8/fx-zh`（`TOWER_LANG=zh-CN`）。夹具叠加 `e2e/rich.ts` 的全部增强，另加审计自己的状态：criteria-cannot-run 暂停卡（用监督器原句、三个选项）、tampered 的 C5（见 §2.9 的夹具冲突）、空概览、欢迎页、启动失败（拦截 `goals` 让它抛错）。
>
> 共拍 **68 张桌面截图、9 张手机截图（390 / 430 宽）、3 张探针截图**，另有：
> - 每屏 DOM 度量：已填充的 primary 数、<20pt 的目标、被省略号截断的文本、字体、控制台错误。**全部 0 错误**，字体为 Inter Variable / JetBrains Mono Variable。
> - 探针：队列颜色逐帧、hunk 折叠逐帧、`]`/`A` 键路径、Tab 顺序、开关尺寸、字距、连字。
> - **axe（WCAG 2A/2AA）** 跑了 8 屏，深浅色、中英文都有，**全部零违规**。
>
> 截图与探针均未入库，下文用 `[编号]` 引用（见 §7）。
>
> 限制：原生菜单不能真正选中项；动效靠逐帧采样和读代码判断，手感未验证；网页检索由子代理完成，只列它实际抓到页面或摘要的条目。

---

## 0. 总评

r7 的 Top 18 落地了 **15 项干净、2 项部分、1 项未动**（手机字体）。最重要的几项都修成了，而且口径一致：

1. **tampered 不再说谎。** 页头印章成了 `◆ Passed, not evidence @ca8ab12`，刻度条是 `━━━ Verified 2/3 · 1 doesn't count`（第三段琥珀色）。`Next` 一句改成 "A machine criterion passed with a tampered canary: that pass is not evidence…"；验收 sheet 写 `2 of 3 machine criteria count as evidence; 1 passed with a tampered canary`，"仍未处理"里第一条是 `■ C5: a test that must fail passed` [24][24c][24d]。行、合计、印章、sheet 四处现在说同一件事。
2. **队列一屏一个黑按钮，而且跟着焦点走。** 非焦点卡的 primary 降为默认外框，键位提示数字也只在焦点卡上出现；焦点卡同时点亮琥珀头 [12][14]。
3. **合同编辑器像一份合同。** `CONTRACT · SHOP · NEW` 字标抬头，`01 INTENT … 07 ENGINE` 七条款带编号和细线 [42][44]。设置 › Environment 是一行读数 `Pi ■ demo-engine · git ✓ 2.56.0 · Sandbox ✓ on · Identity ◆ not set` [48]。快捷键 / 活动两张 sheet 都有字标标题和细线 [54][55]。
4. **可达性结构项清零。** axe 8 屏零违规（r7 评审页 1 critical + 3 serious）；开关 28×18。

但这一轮也暴露了三件 r7 没看到、或新面带来的硬伤：

1. **评审的 `]` / `A` 在一屏放得下的 diff 上不工作（H，D8）。** "当前 hunk"是按滚动位置算的（`Review.tsx:272-288 jumpHunk / currentHunk`）。diff 不超过一屏时面板没法滚（实测 `scrollHeight 820 = clientHeight 820`），于是 `]` 不动，`A` 永远落在第一块上。第二次按 `A` 会**静默取消**第一块的接受，文件的 `Viewed` 也一起掉，没有任何提示 [31][32][P2]。这正是最常见的情形：小改动。r7 记为"一气呵成"的闭环，在这里其实断了。
2. **验收 sheet：三条红 ■ 写着"不阻止验收"，primary 却毫无摩擦（H，D6/D8）。** `Still open (does not block accepting)` 下面是 `■ C5 … not evidence`、两条高危哨兵，而 `Accept and update branch` 仍是一键的黑按钮 [24d]。判断交给人可以，但红项和零摩擦放在一起，等于在训练人忽略红色。
3. **合同里有看不见的条款（M，D6）。** look 标准新增了 `steps`（click / type / press / wait / wait for），编辑器不显示 [44]。修订一份带 steps 的合同时，`setKind` 只改 `start/url`，steps 原样保留却看不见——人会批准一份没看全的合同。

还有一批新的细节问题：
- 代码值和哨兵证据里开着编程连字，`a === 10.02` 显示成 `a ═══ 10.02`，`=>` 成了 `⇒` [21][P5]。证据必须逐字可读。
- 中文字标字距 0.2em，项目名 `shop-zh` 也被拉成 `s h o p - z h` [43]。
- 空态正文的行宽太窄，留下 `yet.` / `同。` 这样的孤字 [20][39][55]。
- 手机页仍是系统字体，同屏两个黑按钮 [p04]。

**定位：** 桌面端放在 Linear / Conductor / Codex 旁边，评审语义、诚实语法、空态与错误页仍领先一代；但一个键盘闭环在常见场景下失效，这类问题顶尖应用不会有。**修完 §4 前 7 项，D6–D8 可到 94–95；D9 还差设置页和手机页的那张脸。**

---

## 1. 评分

### 1.1 产品评分表 D6–D9

| 维度 | r7 | r8 | Δ | 判词 |
|---|---|---|---|---|
| D6 页面 / 信息设计 | 92 | **93** | +1 | **做对了：**<br>- tampered 四处同口径 [24][24c][24d]。<br>- 验证读数 look 标准排第一 [34][24c]。<br>- `No held-out tests: only the tests the agent can see vouch for this result…` 和 `Set held-out tests ›` 出现在目标页、评审页 [19][28]。<br>- criteria-cannot-run 卡先说"不是测试失败"，再给被拒路径，选项是 `Retry / It is a real test failure… / Abandon` [18][19]。<br>- 测试名是 chip，桌面和手机一致 [16][p04]。<br>- 设置的环境块一行读完 [48]。<br><br>**扣分：**<br>- 验收 sheet 红项零摩擦（§2.2，H）。<br>- 合同 steps 不可见（§2.3）。<br>- tampered 之后标题字形、侧栏字形、C5 行首仍是绿 ✓ [24]（§2.4）。<br>- cannot-run 正文里 `` `npm test` `` 原样露出反引号；"把路径加到项目设置"没有就地动作；页头 `Resume P` 和卡上 `Retry` 是同一件事的两个动词 [19]（§2.5）。<br>- 标准行的注记右对齐、起点不齐 [21]。 |
| D7 UI 视觉设计 | 92 | **93** | +1 | **做对了：**<br>- axe 零违规（浅色树 kbd 与目录名对比已修）。<br>- 开关 28×18；身份表单的输入、选择、按钮同高 [48]。<br>- 合同条款字标 11px / 0.12em，编号在 text-4 [42]。<br>- tampered 印章用琥珀 ◆ [24c]。<br>- 两张 sheet 的标题带细线 [54]。<br><br>**扣分：**<br>- 代码值连字（§2.6）。<br>- 中文字标 0.2em、拉丁也跟着拉开（§2.7）。<br>- 空态与活动 sheet 的孤字 [20][39][55]（§2.7）。<br>- 设置里 `Every repository (git's gl…` 被截 [48]。<br>- 概览的分区细线伸到 1408，卡片列止于 1104，两条右边界 [01]。<br>- 手机页系统字体、两个填充 primary [p04]（§2.8）。 |
| D8 交互与动效 | 93 | **93** | 0 | **做对了：**<br>- 接受 hunk 的折叠逐帧可证：表高 179→56px 约 160–200ms，ease 收尾 [P2]。<br>- 队列主色随焦点有 150ms 线性过渡 [P1]。<br>- 评审 → 评审时树不重入（`nav.ts transitionKind "page"`）。<br>- 减动画仍是一处 `lib/motion.ts` 给 JS，`base.css` 给 CSS。<br>- Enter / Space 归焦点元素（d8ebdf3），与本月 Claude Code、Factory、Raycast 的修复同一方向。<br><br>**扣分：**<br>- `]` / `A` 在不滚动的 diff 上失效，第二次 `A` 静默撤销（§2.1，H）。r7 计入的 +2 有一半要还回去。<br>- 验收 sheet 红项无二次确认（§2.2）。<br>- WebKit 默认 Tab 只走输入框（快速开始 → 提示框 → 备注框 → body，循环）[P3]。系统"键盘导航"关闭时按钮只能靠 j/k / 1–9 到达，这是平台默认，Tower 用单键补上了，但 `?` 表里没说。 |
| D9 美学独特性 | 89 | **91** | +2 | **做对了：**<br>- 合同编辑器长出了第四张画面：字标抬头 + 编号条款 + 细线，读起来像文书而不像表单 [42][44]。<br>- Environment 是标题栏仪表搬到页面里 [48]。<br>- `Passed, not evidence` 是诚实语法的第四格，琥珀 ◆ 和刻度条第三段同一种颜色 [24][24c]。<br>- sheet 标题姓 Tower 了 [54][55]。<br><br>**差在：**<br>- 设置页其余部分仍是"右对齐标签 + 输入框"的通用 macOS 偏好设置，与它上面那条仪表、隔壁的合同条款不是一个声音 [46]。<br>- 手机页没有动（系统字体 + 白卡 + 两个黑块）。<br>- 中文字标 0.2em 把条款抬头的那点克制弄丢了 [43]。 |
| **综合** | 91.5 | **92.5** | +1 | |

### 1.2 12 项美学子分

| # | 子项 | r1 | r2 | r3 | r4 | r5 | r6 | r7 | r8 | Δ | 判词 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 美学与原创性 | 66 | 76 | 82 | 85 | 86 | 88 | 89 | **90** | +1 | 合同条款、Environment 读数、`Passed, not evidence`。 |
| 2 | 排版（拉丁 + CJK） | 70 | 79 | 84 | 86 | 87 | 88 | 89 | **89** | 0 | 加：测试名 chip、条款字标。扣：代码连字；中文 0.2em 字距与拉丁被拉开；空态孤字。 |
| 3 | 颜色与对比 | 78 | 82 | 86 | 88 | 89 | 89 | 90 | **91** | +1 | axe 零违规；tampered 琥珀第三段。扣：tampered 后标题和行首仍绿。 |
| 4 | 布局与层级 | 60 | 72 | 80 | 85 | 87 | 89 | 91 | **92** | +1 | 队列单 primary；读数图先。扣：标准注记右对齐不齐；分区线与卡片列两条右边界。 |
| 5 | 密度与节奏 | 64 | 75 | 82 | 86 | 88 | 89 | 90 | **90** | 0 | 评审页顶部一条 no-held-out 加两条哨兵横幅，再加 diff，开头偏挤 [24e]。 |
| 6 | 组件工艺 | 62 | 74 | 81 | 85 | 87 | 88 | 90 | **91** | +1 | 开关、身份表单等高、条款头。扣：git 范围选择被截；人工标准复选框 14×14（标签可点，但框本身小）。 |
| 7 | 动效与反馈 | 45 | 68 | 80 | 82 | 85 | 88 | 91 | **91** | 0 | 加：折叠 160ms、翻页不重入。扣：第二次 `A` 静默撤销、没有回执。 |
| 8 | macOS 原生感 | 72 | 80 | 85 | 87 | 88 | 89 | 90 | **91** | +1 | 树 ARIA、Enter 归焦点。扣：键盘导航关闭时的到达路径没写进 `?` 表。 |
| 9 | 图标与字形 | 58 | 80 | 90 | 91 | 92 | 92 | 92 | **92** | 0 | ◆ 用到印章上；绿 ✓ 在 tampered 目标上残留。 |
| 10 | 空 / 加载 / 错误状态 | 55 | 72 | 80 | 86 | 88 | 90 | 92 | **92** | 0 | 加：启动失败、骨架板、手机空态都成立 [06][10][p05]。扣：空态正文孤字；cannot-run 卡反引号。 |
| 11 | 浅色主题 | 68 | 78 | 84 | 87 | 88 | 89 | 90 | **91** | +1 | 浅色评审树对比已修 [28]。 |
| 12 | 品牌性格 / 记忆点 | 52 | 64 | 72 | 80 | 82 | 86 | 89 | **90** | +1 | `Passed, not evidence`、`2 of 3 machine criteria count as evidence`、`CONTRACT · SHOP · NEW`。 |
| | **综合** | 63 | 75 | 82 | 86 | 87 | 89 | 90 | **91** | +1 | |

### 1.3 r7 Top 18 落地核对

| r7 # | 项目 | 状态 | 证据 / 副作用 |
|---|---|---|---|
| 1 | tampered 不计入，印章、sheet 同步 | **已修，有残留** | 印章、刻度条、`Next`、验收 sheet 都对了 [24][24c][24d]。残留：标题 `✓`、侧栏 `✓`、C5 行首 `✓` 仍是绿色（§2.4） |
| 2 | 评审树 ARIA、kbd / 目录名对比 | 已修 | axe review3 深浅色零违规 |
| 3 | 失败测试名 chip | 已修 | 桌面 [16]、手机（`remote.html:106-108`）[p04] |
| 4 | 简报保住状态词 | 已修（代码核对） | `app.css:1204 max-width: 24em`；本轮种子不出简报条，未见实屏 |
| 5 | 队列一个填充 primary，跟着焦点走 | 已修（桌面） | [12][14]，DOM 度量每屏 1 个。手机未跟（§2.8） |
| 6 | 读数图在前 | 已修 | [34] look 第一；副作用：tampered 行排到最后、在首屏之下 [24c] |
| 7 | 开关 28×18、身份表单等高 | 已修 | P4 `28x18`；[48] |
| 8 | 沉默读分钟 | 已修 | `silent for 4m` [01] |
| 9 | 轨迹渐隐一行高 | 已修 | [57] 首行渐隐 |
| 10 | 手机稍后菜单 | 已修 | [p07] 标签一行、两枚 chip 一行 |
| 11 | 夹具按语言 | **部分** | CI 卡和保留测试卡已中文；`enrichCanary` 哨兵、`enrichLook` 的 C4 标题仍是英文 [22][37]；另见 §2.9 的夹具冲突 |
| 12 | 接受 hunk 折叠 160ms | 已修 | 逐帧 179→56px [P2] |
| 13 | 最后一块有去处 | **代码已修，实际走不到** | `Review.tsx:631-636` 有 `All n hunks accepted · V next unit`，但 §2.1 使 `A` 无法前进到最后一块 |
| 14 | 合同编辑器像合同 | 已修 | [42][43][44] |
| 15 | Environment 仪表条 | 已修 | [48][48b] |
| 16 | 手机页字体 | **未动** | 计算字体 `-apple-system` / `ui-monospace` |
| 17 | sheet 字标标题 | 已修 | [54][55] |
| 18 | 队列翻页树不重入 | 已修（代码） | `nav.ts transitionKind → "page"`；手感未验证 |

---

## 2. 全局问题与修法

### 2.1 评审键盘路径：`]` / `A` 在不滚动的 diff 上失效（H）

**现状**
- `currentHunk()` 取"头部在面板顶边或刚越过顶边的那一块"，`jumpHunk()` 靠 `pane.scrollTo` 前进（`Review.tsx:272-288`）。
- 面板内容不超过一屏时，`scrollTo` 什么也不做。实测 G-0003 的 unit 1：`scrollHeight 820 = clientHeight 820`。
- 结果是 `]` 不动，接着按 `A` 接受的仍是 `src/cart.js`，而不是 `src/cart/money.js` [P2-hunk]。
- 连按 `A`：第一次接受 cart.js，`requestAnimationFrame(jumpHunk)` 没能前进，第二次 `A` 把它**取消**——`Viewed` 掉了、状态栏的 `1/2 hunks accepted` 消失，没有 toast [31][32][P2-after-2A]。
- 页面上也没有"当前块"的标记，人不知道 `A` 将作用在哪里。

**修法（M）**
- 当前块改为状态：`createSignal<{path, index}>`，`]` / `[` 改它并 `scrollIntoView({block: "nearest"})`，不再从 scrollTop 反推。
- 当前块的 hunk 头画上 Tower 的那支 2px 笔：左缘一道 text-3 竖线，接受后变 text-1。
- `A` 只接受、不取消；取消留给 `⇧A` 或再点按钮，并配一个 toast `↶ Unaccepted · src/cart.js`。
- 补 e2e：两个文件各一块、diff 不滚动，`] A` 应落在第二块。

### 2.2 验收 sheet：红项与一键 primary 并存（H）

**现状**
- [24d]：`Still open (does not block accepting)` 下面是三条红 ■（C5 不作数、两条高危哨兵）和两条 ◇。
- 主按钮 `Accept and update branch` 是黑色、一键。
- 同一个产品里，`Abandon` 都要按两次（`Press again to confirm`）。

**修法（S）**
- 存在任一红 ■ 时，primary 文案改为 `Accept anyway`，复用 `.btn.armed` 的两次按压：第一次进入 armed 并读出 `3 open items above`。
- 列表标题按严重度分开：`Not evidence / needs your judgement` 在前，`To look at` 在后。
- 红项为零时维持现状。

### 2.3 合同编辑器：look 标准的 `steps` 不可见（M）

**现状**
- `CriterionKind.look.steps?: string[]` 已在数据里，监督器会执行（20fa955）。
- 编辑器只给 `start`、`url`、超时 [44]。修订带 steps 的合同时，它们被保留却不可见、不可改。

**修法（M）**
- look 标准下加一列有序的"步骤"条，每步一行 mono：`click #pay`、`type #qty 2`、`press Enter`、`wait 500ms`、`wait for .total`。
- `+ Step` 用幽灵按钮，序号复用条款的 `01` 小号 text-4。
- 无步骤时显示一行 hint：`Before the picture: click, type, press, wait, wait for`。
- 至少做到只读显示 steps。目标页 C4 行也该露出 `3 steps`，现在只有 URL [21]。

### 2.4 tampered 的残留绿色（M）

**现状**
- [24]：标题前 `✓` 绿环、侧栏 `Fix the cart total` 绿 ✓、C5 行首绿 `✓`、`passed 1s` 都没有变。
- 页头印章已经是琥珀 `Passed, not evidence`，C5 行下也有 `◆ a test that must fail passed`。

**修法（S）**
- `goalGlyph` 在 `progress` 含 discounted 时改用 ◆ 琥珀，与印章同一字形；侧栏、航班牌同源。
- 标准行首 tampered 时用 `◆`。`passed 1s` 保留，那是事实。

### 2.5 criteria-cannot-run 卡（M）

**现状** [18][19][20]
- 结构对：先说跑不了，再说不是测试失败，再给输出尾巴，Retry 是 primary。三个问题：
  1. 正文里 `` `npm test` `` 的反引号原样显示：监督器的句子用反引号包命令，UI 没把它渲染成 `code-val`。
  2. "add it to the project settings if it belongs"，但卡上没有去项目设置的动作。被拒路径 `/Users/you/node_modules/.bin` 只在尾巴里。
  3. 目标页页头 `Resume P` 和卡上 `Retry` 并排，是同一出口的两个名字。

**修法（S）**
- 卡片正文做最小的行内 code 渲染：只认反引号，与 `GoalBlocks` 的 `code-val` 同款。暂停卡、哨兵详情、验收 sheet 共用。
- 从 `sandbox-exec: deny(1) … <path>` 里抽出被拒路径，作为一行 `◇ Refused: /Users/you/node_modules/.bin · Allow in project settings ›`。链接跳到项目块、聚焦对应字段。
- 卡上有 primary 时，页头的 `Resume` 隐藏，或改读 `Retry P`，同一个动词。

### 2.6 代码值开着编程连字（M）

**现状**
- `base.css` 给全局开了 `"calt" 1`。只有 `.diff`、`.output-tail`、`.file-editor-text` 关了连字。
- `.code-val`、`.sentinel-machine`、标准命令、测试名 chip 都继承了 JetBrains Mono 的 `calt`：`assert.strictEqual = (a, b) ⇒ (a ═══ 10.02 && b ═══ 10.01 …` [21][P5]。
- 这恰好是哨兵在指控"程序代码改写断言"的证据——`==` 和 `===` 必须分得清。

**修法（S）**
- 在 `var(--font-mono)` 的所有用处统一 `font-variant-ligatures: none; font-feature-settings: "liga" 0, "calt" 0, "zero" 1;`。
- 最简单的做法是给 `code, kbd, pre, .code-val, .num-mono` 一条规则。数字用的 `--font-features-num` 也去掉 `calt`。

### 2.7 中文字标与孤字（M）

**现状**
- `:root[lang="zh-CN"] .contract-mast / .clause-title / .panel-title / .keys-group-title` 一律 `letter-spacing: 0.2em`（`app.css:3068,3101,3904,3917`），比英文的 0.12em 还宽。
- 项目名 `.contract-mast-project` 跟着拉成 `s h o p - z h` [43]；`活 动 与 错 误` [55]。
- 手机页中文刻度标题是 0.04em（r7 已认可），两处不一致。
- 空态正文没有行宽规则，继承了窄的容器：
  - `The snapshot is the same as base↵@122cd13.`、`快照与 base @122cd13 相↵同。` [19][20]
  - `The agent has not changed any tracked files↵yet.` [39]
  - `可以逐条复↵制。` [55]

**修法（S）**
- 中文字标统一 0.08em。容器内的拉丁 / 数字片段（项目名、`v2`）用 `letter-spacing: 0.02em`，可包一层 `<span class="latin">`。
- `.empty-body { max-width: 44ch; text-wrap: pretty; }`，WebKit 支持 `text-wrap: pretty`；中文再加 `word-break: keep-all` 的 hash 片段保护，或直接把 `@122cd13` 放进 `nowrap` span。

### 2.8 手机页：两个黑块与系统字体（M）

**现状** [p04][p08]
- 保留测试卡的 `Send the hint and resume` 和假设卡的 `Approve` 同时是填充 primary。
- 桌面已经做到"队列只有焦点卡是黑的"，手机没跟。
- 字体仍是 `-apple-system` / `ui-monospace`（r7 #16 未动）。
- 尾巴里 `AssertionError: expected 10.01 to↵equal 10.02` 在 390 宽下断在词中间，没有悬挂缩进。

**修法**
- **S**：只有第一张卡（最紧急的）保持填充，其余卡的 primary 用 `.btn` 默认外观（与 `.decision.quiet` 同规则），点进卡或滚到视口中心再升起。
- **M**：Inter 拉丁 + 数字子集（约 30–40KB woff2）以 base64 内嵌，CJK 仍走系统。
- **S**：`.tail` 用 `white-space: pre; overflow-x: auto`，或 `pre-wrap` 加 `text-indent: -2ch; padding-left: 2ch`。

### 2.9 夹具：tampered 在 rich 世界里从未出现（审计基础设施）

- `enrichRich` 先跑 `enrichLook`，它往 G-0001 里加了 `C4`（look）。随后 `enrichCanary` 的 `if (c2?.verified && !by("C4"))` 因为 C4 已存在而**跳过** tampered 标准。
- 所以 `shots.spec.ts` 与 `tools/e2e.sh` 的预览里，tampered 行、`Passed, not evidence` 印章、`1 doesn't count` 都不会出现 [21]。本轮的 [24] 是审计另加 C5 才看到的。
- 修：tampered 标准用 `C5` 或 `id = next free`；另起一张 `shots` 屏 `goal-G-0001-tampered`。
- 同处：`enrichHeldOut` 给 C2 打了 `held_out = true`，却没设 `has_held_out_tests`。于是同一屏既有 `held-out tests · for you only`，又有 `No held-out tests: …` [21]。应当一起设，或由 `enrichHeldOutTests` 负责。
- `enrichSandboxRefused` 仍用旧的 `prepare_failed` 和两个选项；监督器现在给 `criteria_cannot_run` 和三个选项（`actions.rs:34`）。
- `enrichCanary` 的哨兵与 `enrichLook` 的 C4 标题没有中文版 [22][37]。

### 2.10 点击目标与尺寸

| 位置 | 现状 | 判定 |
|---|---|---|
| 合同 `Allow network` 开关 | 28×18 | 合格 |
| 人工标准复选框（目标页 C3/C4） | 14×14，标签可点 | 合格但偏小；把整行做成 `label` 的事实写进测试 |
| 评审批注 `+` | 16×16，`::before` 扩区 | 合格（r6 #8） |
| 设置 git 范围选择 | `Every repository (git's gl…` 被截 [48] | 放宽 `min-width: 15em`，或文案改为 `All repositories` / `Only shop` |
| 手机控件 | 卡内 44、行内 40 | 合格 |

### 2.11 文案与排版校对

| 位置 | 现状 | 应为 |
|---|---|---|
| 设置 › Environment [48] | `Pi has no models available yet` 的 hint 说 `click Check again`，但设置页这一块没有 `Check again` | 在 Environment 标题行右侧放 `Check again` 幽灵按钮（欢迎页有） |
| 合同 look 按钮 | 英文 `+ Screenshot`，中文 `+ 外观` | 统一一个名字：英文 `+ Look`（与目标页 "still looks right" 呼应），中文 `+ 外观` |
| 评审无改动页 [39] | 状态栏仍列 `A accept hunk / ⌥V side by side / click a line number…` | 无 diff 时状态栏只留 `Esc back · ? This sheet` |
| 评审顶部 [24e] | no-held-out 一行 + 两条哨兵横幅叠在 diff 之上 | 三条并进一条可展开的 `◇ 3 notes before you read` 带，或 no-held-out 移到验证读数 |
| 标准行注记 [21] | `couldn't check on @122cd13`、`must-fail tests failed…` 右对齐，C1 / C2 起点不同 | 注记左对齐到标题列（x = 标题起点），一行一寄存器，与哨兵详情同一规则 |
| 概览 [01] | 分区细线伸到 1408，卡片止于 1104 | 细线止于卡片列宽，或卡片与运行表同宽 |

---

## 3. 逐屏审计（摘要）

### 3.1 标题栏与侧栏 [01][03][04]
`◔ 1/4 running · ▫ silent for 4m · $0.09 · 🔔 · ● Engine Pi demo-engine`，1040 宽时引擎标签整段隐藏、无溢出。侧栏 `Needs you` 两处（导航与分区）各有计数。无新问题。

### 3.2 概览 / 需要你 [01]–[05][12]–[15]
- 焦点卡是黑的，其余卡安静；焦点卡琥珀头、带键位提示。
- 首卡是保留测试卡，其 primary 未输入时禁用（.45 透明），所以首屏"唯一的黑"是灰的。这是对的：提示框才是第一步。
- 1100 宽下三个次选项折行，`Abandon this goal 3` 独占一行 [04]，可接受。
- 问题：分区线右边界（§2.11）。

### 3.3 保留测试卡 / cannot-run 卡 [16][17][18]–[20]
保留测试卡：`FOR YOU ONLY` 实线栏 → `C2 Rounding edge cases` → `failing [total rounds half-cents up] [applies tax once]` → 输出 → 提示框 + primary → ◇ 注释 → 三个次选项。层级清楚，中文同构。cannot-run 卡见 §2.5。

### 3.4 目标页 [21]–[27b]
- 哨兵分寄存器、路径列齐。
- 标准刻度 `━━ Verified 2/2 · Observed 0/2 · Human 0/2`。
- look 标准的前后缩略图 64px 宽，点开是三模式比较 sheet [56]。
- no-held-out 一行带 `Set held-out tests ›`。
- 问题：连字（§2.6）、注记对齐（§2.11）、tampered 残留（§2.4）、空态孤字（§2.7）。

### 3.5 评审 [28]–[41]
- 树、hunk 头 `✓ Accept this hunk · ↶ Undo this hunk`、接受后 `Accepted · 6 lines folded` + 2px 实线 + 文件 `Viewed` 自动亮 [31]，都成立。
- 1100 / 深色 / 中文都成立 [29][30]。
- 高亮在 worker 里晚到一拍，首帧是纯色代码 [28]，再一拍才上色 [32]。可接受，但能看到一闪。
- 问题：键盘路径（§2.1）、验收 sheet（§2.2）、无改动页状态栏（§2.11）、顶部横幅堆叠。

### 3.6 合同编辑器 [42]–[45]
- 第四张画面成立：条款编号、字标、细线、右栏 `04–07`。
- 页脚 `Cancel`（左，幽灵）/ `Save as draft` / `Ratify and start ⌘↩` 层级正确。
- 问题：steps（§2.3）、中文 0.2em（§2.7）、look 按钮命名（§2.11）。

### 3.7 设置 [46]–[51]
- Environment 仪表条好。
- 其余是通用偏好设置：右对齐标签、灰 hint，布尔用复选框，而合同编辑器的布尔用开关。同一个"允许 / 不允许"在两页用两种控件。
- 通知与推送三态 `■ Last push failed · 21:03 · ntfy.example.net could not be reached` 清楚 [50]。
- 问题：`Check again` 缺位、选择被截、标题不在条款的声音里（D9）。

### 3.8 面板、sheet [53]–[57]
- 命令面板空查询、中文零结果都有解释，`没有与"cart"匹配的结果 / 可以输入标题的任意片段，或中文的拼音首字母，如 gwc`。
- 快捷键 sheet 两栏分组、字标细线。
- 活动 sheet 空态孤字（§2.7）。

### 3.9 欢迎 / 启动失败 / 空态 [06]–[11]
- 欢迎页：左栏生命线 + 一张样例印章 + 三条原则，右栏环境检查，git 身份就地表单与按钮同高，`Try a demo goal` 是唯一的黑。
- 启动失败：熄灭仪表 `■ 1 error —/— running — ○ Engine —` + 错误框 + `Retry / Open the data folder` + 数据目录路径。
- 空概览骨架板。三张都成立。

### 3.10 手机页 [p01]–[p09]
- 刻度标题、保留测试卡与桌面同序、提示框满宽 primary、`At your Mac:` 命名不提供。
- 空态两行空心环骨架 [p05]；离线 `■ Can't reach Tower · Retry` [p06]；稍后菜单修好 [p07]。
- 问题见 §2.8。

### 3.11 动效、焦点与可达性
- **时序：** `--dur-hover-out 150ms linear`（按钮底色，也是队列主色随焦点的过渡）、`--dur-base 160`、`--dur-space 220`。全部有名字有理由。
- **折叠：** 接受 hunk 后表高 179→56px，12 帧约 160ms，前慢后快的退场曲线 [P2]。
- **减动画：** `motion.ts` 的 `baseMs / spaceMs` 与 `base.css` 全局 0ms 同源；`nav.ts` 跳过 view transition。
- **焦点：** 字段两形态（`outline: none` + 内描 1px text-3）[P3]；队列卡焦点是 1px `border-strong` 加外环，视觉上略像双线 [14]。可以只留外环。
- **Tab：** WebKit 默认只走表单控件 [P3]，与 Safari 一致。建议在 `?` 表的 Everywhere 组加一行 `Tab reaches buttons when macOS Keyboard navigation is on`。
- **axe：** 8 屏零违规。

---

## 4. 距离 95 分还差什么：优先修复清单

影响：H = 信息矛盾或闭环断裂；M = 单屏明显；L = 细节。工作量：S < 半天，M ≈ 1 天，L ≈ 2–3 天。

预期：完成 1–7 后 D6 / D7 / D8 约 94–95；8–14 是 95 的打磨；15–18 是 D9 的事。

| # | 改动 | 文件 | 预期效果 | 解锁 | 影响/工作量 |
|---|---|---|---|---|---|
| 1 | 当前 hunk 改为状态；`]`/`[` 改状态并 `scrollIntoView`；当前块左缘标记；`A` 只接受、取消另给键并配 toast；补"不滚动 diff"e2e | `views/Review.tsx:247-330`、`review/FileDiff.tsx` hunk 头、`app.css .hunk-head.current` | 键盘闭环在小改动上成立 | D8 +1 | H / M |
| 2 | 验收 sheet 有红 ■ 时 primary 改 `Accept anyway` 并两次按压；列表按严重度分组 | `review/panels.tsx AcceptPanel`、`components/ui.tsx Button armed` | 红色不被训练成噪音 | D6 +1、D8 | H / S |
| 3 | look 标准的 `steps` 在编辑器里可见可改（至少只读），目标页 C4 行露出 `n steps` | `views/ContractEditor.tsx:227-280`、`views/goal/GoalBlocks.tsx` | 合同里没有看不见的条款 | D6 +1 | M / M |
| 4 | mono 一律关连字（`liga`/`calt` 0），含 `.code-val`、`.sentinel-machine`、chip、命令 | `styles/app.css`（mono 规则一处）、`tokens.css --font-features-num` | 证据逐字可读 | D7 +0.5、D6 | M / S |
| 5 | tampered 时标题、侧栏、行首字形改琥珀 ◆ | `components/Glyph.tsx goalGlyph`、`Sidebar.tsx`、`GoalBlocks.tsx` 标准行 | 一屏不再有绿 ✓ 与"不作数"并存 | D6 | M / S |
| 6 | 卡片正文行内 code（反引号）；cannot-run 卡抽出被拒路径 + `Allow in project settings ›`；页头与卡同一动词 | `components/DecisionCard.tsx` 正文渲染、`GoalPage.tsx` 页头动作 | 卡片句子不露机器标记，出口就地 | D6 | M / S |
| 7 | 中文字标 0.08em，拉丁片段复位；`.empty-body` 加 `max-width: 44ch; text-wrap: pretty`，hash 不断行 | `app.css:3068,3101,3904,3917`、`.empty-body`、`Activity.tsx` | 无孤字、中文字标克制 | D7 +0.5 | M / S |
| 8 | 手机：只有最紧急那张卡的 primary 填充；尾巴不断词 | `remote.html .opts .btn` 规则、`.tail` | 手机与桌面同一条"一屏一个黑" | D7、D6 | M / S |
| 9 | 设置 Environment 行加 `Check again`；git 范围选择不截断 | `views/Settings.tsx:133-170`、`GitIdentity.tsx` | hint 指得到按钮 | D6 | L / S |
| 10 | 标准行注记左对齐到标题列，一行一寄存器 | `components/Honesty.tsx` CanaryLine / HeldOutLine、`app.css .criterion-obs` | 读数有一条左边界 | D7 | L / S |
| 11 | 评审顶部三条横幅并成一条可展开带；无 diff 时状态栏只留 Esc / ? | `views/Review.tsx:515-530`、状态栏 | diff 首屏更早开始 | D6、D7 | L / S |
| 12 | 概览分区细线止于卡片列宽 | `app.css .board-section-head` | 一条右边界 | D7 | L / S |
| 13 | 读数里 tampered / 失败行先于通过行（图仍第一） | `review/panels.tsx` 排序 | 最需要看的在首屏 | D6 | L / S |
| 14 | 夹具：tampered 用 C5；held_out 与 `has_held_out_tests` 一起设；cannot-run 夹具换新理由与三选项；哨兵 / C4 中文 | `e2e/rich.ts`、`e2e/shots.spec.ts` 加一屏 | 预览能看见本轮的新面 | 审计基础设施 | L / S |
| 15 | 设置页其余块用条款的声音：`01 ENVIRONMENT … 07 APPEARANCE` 字标抬头 + 细线；布尔与合同统一控件（开关或复选框选一种） | `views/Settings.tsx`、`app.css .settings-block .section-title` | 设置姓 Tower | D9 +1 | M / M |
| 16 | 手机页 Inter 子集内嵌（拉丁 + 数字） | `remote.html <style>` | 手机与桌面同一张脸 | D9 +1 | M / S |
| 17 | look steps 的条款画面：步骤作为编号小行，接在 `Before / After` 缩略图前 | `ContractEditor.tsx`、`GoalBlocks.tsx` | "看图之前做的事"有自己的形 | D9 | L / M |
| 18 | `?` 表加键盘导航说明一行；队列卡焦点去掉内边框只留外环 | `components/ShortcutSheet.tsx`、`app.css .decision.focused` | 平台差异写明白；焦点一条线 | D8 | L / S |

---

## 5. 与主流 harness GUI 的对比（2026-10 中下旬）

对照对象（来源见脚注；子代理本轮检索，只列抓到页面或摘要的条目，带"未证实"的照录）：
- **Claude Code**
  - 桌面 v3.6556.1（10-22）：修"键盘焦点丢失或跳到打开的对话框后面"、权限卡屏幕阅读器只读出 "Claude wants to use:"。
  - v3.1623.0（10-20）：权限请求、问题、建议任务进入对话流。
  - v2.42304.0（10-15）：Changes 卡上有 PR 控件；修 Enter 选中斜杠菜单项而不是发送。
  - CLI 2.1.311（10-26）：屏幕阅读器把问题读成 "Questions: Color (answered), Pages"。
  - 桌面文档：评审仍是 hover `+` 批注、⌘Enter 批量提交，`/code-review` 结果卡 `Walk through in diff / Fix this one / Apply fixes`，手机 Dispatch 只推送"完成或需要批准" [^cc]。
- **Codex**
  - 应用 26.1007（10-08）之后无新版：Changes 面板滚动与文件导航。
  - 评审文档：stage / unstage / revert 三级（整 diff / 文件 / hunk），"Use staging when you want to accept part of the work"，另有 `Last turn` 视图。
  - ChatGPT iOS 1.2026.286（10-22）：后台命令 pill [^cx]。
- **Cursor** 3.27（官方无日期；第三方镜像 3.27.14 约 10-26，未证实）：
  - `workbench.reduceMotion` 下 spinner 改脉动或淡入。
  - 侧栏方向键 / Home / End 到达每一行和按钮。
  - 置顶、移动、归档后焦点留在原处。
  - PR 页头在实时 diff 替换时不再跳 [^cu]。
- **Conductor** 0.92.0（10-23）：远程控制 Mac、快捷键可自定义、"chats, diffs, and files stop at the top of the message box" [^co]。
- **Factory 桌面**：v0.207（10-27）浏览器面板打开别的应用前先问；v0.199（10-15）"Pressing Enter on a right pane control no longer answers a pending question" [^fa]。
- **Devin 桌面** 3.11.212（10-23）："Typing anywhere focuses the composer"、Changes 有 `Since last seen` 范围 [^dv]。
- **Zed** 1.25.2（10-21）：标签切换器不再因悬停改变选中 [^zd]。
- **Amp**（10-12）：按决策模型给文件排序，"review starts sooner" [^am]。
- **Linear**（10-08）Guided Reviews："previous and next controls to jump between Guide sections without marking them reviewed" [^ln]。
- **Raycast**：2.9（10-22）HUD / toast 可关；2.6（10-05）"automatic color contrast adjustments" [^rc]。
- **Dia** 1.54（10-22）：外部应用对话框可用快捷键 [^dia]。
- **Apple HIG**：What's new 最新条目仍是 10-13（Widgets / Live Activities）[^ap]。
- **评测**：本月没有找到中立的 UX 评测；Paralect（约 5 个月前）称 Conductor "Probably the best UX of any ADE"，但重度使用后变慢 [^rv]。

### 5.1 Tower 落后的地方

| 方面 | 它们 | Tower | 差距性质 |
|---|---|---|---|
| 评审键盘 | Cursor 3.27 方向键到达每一行和按钮、操作后焦点留在原处；Codex hunk 级 stage 有显式目标 | 当前块按滚动位置推断，不滚动时 `]`/`A` 失效，且无当前块标记（§2.1） | **本轮新发现的硬差距**；语义仍领先，到达性落后 |
| 评审范围 | Codex `Last turn`、Devin `Since last seen`、Linear Guide 可跳节且不标已读 | 以 `range` 作废已看标记，但不提供"自上次评审以来"视图 | 选择题；返工后的第二轮评审会想要它 |
| 手机 | Claude Dispatch / Cursor / Conductor 0.92 都连到干活的机器，核心是"需要批准"推送 | 一页 HTML + 推送 + 骨架 + 同桌面次序；系统字体、两个黑块 | 立场一致、材质落后（§2.8） |
| 可自定义 | Conductor 快捷键可改 | 注册表 `?` 表，不可改 | 选择，非缺陷 |
| 对比 | Raycast 2.6 自动对比度调整 | 手调 token + axe 零违规 | 持平 |

### 5.2 Tower 领先的地方

1. **"通过"与"证据"分开说。** `Passed, not evidence`、`Verified 2/3 · 1 doesn't count`、`2 of 3 machine criteria count as evidence`。竞品的绿色只有一种意思；developertoolkit.ai 的综述恰好在抱怨"diff 不能证明代码能用"[^rv]，Tower 把这件事做进了印章。
2. **阅读标记与工作区操作是两个动词。** `Accept this hunk`（读过）与 `Undo this hunk`（改工作区）并排。Codex 的 stage 是 git 操作，Linear 的 Guide 只是导航；只是键盘路径要先修（§2.1）。
3. **合同是一份文书。** 编号条款 + 字标抬头。竞品的任务入口都是"一个输入框 + 高级设置"。
4. **空态与错误页有脸。** 熄灭仪表的启动失败、骨架板、手机骨架。竞品的空态是"新会话"。
5. **动效纪律与减动画同源。** JS 与 CSS 时长一处定义、同一个开关。Cursor 本月才做到 spinner 的减动画替代。
6. **中文。** 整张卡中文、拼音首字母搜索；Claude Code 本月修的是 RTL，zh-CN 仍不在列表上。

### 5.3 一句话定位

Tower 在"诚实语法、评审语义、合同文书、空态错误页、动效纪律、中文"上仍领先 Codex / Claude Code / Conductor / Cursor 一代。本月这些竞品的更新几乎都是**焦点与 Enter 的归属**——这恰恰是 Tower 评审里刚发现断掉的那一环。r7 的 H（金丝雀合计）缝上了，可达性结构清零；新的 H 是键盘闭环和验收摩擦，两件都不难修。

---

## 6. 要到 95，每个维度必须成立的事

**D6 页面 / 信息设计（93 → 95）**
- 合同里没有看不见的条款：steps 可见（#3）。
- 红色的未决项与一键确认不同屏（#2）。
- 任何一处都不再在"不作数"的目标上画绿 ✓（#5）。
- 卡片句子里没有机器标记（反引号）；每个"去某处修"都有就地链接（#6、#9）。

**D7 UI 视觉设计（93 → 95）**
- mono 文本逐字等于源码：无连字（#4）。
- 中文字标与拉丁同一种克制，拉丁片段不被拉开（#7）。
- 正文没有孤字，hash 不断行（#7）。
- 读数、分区线各只有一条左边界、一条右边界（#10、#12）。
- 手机一屏一个黑块（#8）。

**D8 交互与动效（93 → 95）**
- 键盘能到达每一块 hunk，人看得见 `A` 将作用在哪；`A` 不会静默撤销（#1）。
- 最危险的确认需要两次按压，与 `Abandon` 同一规则（#2）。
- 平台差异（Tab / 键盘导航）写进 `?` 表（#18）。

**D9 美学独特性（91 → 95）**
- 设置页说条款的语言，布尔控件全应用一种（#15）。
- 手机页用 Tower 的字（#16）。
- look 标准的"看图之前"有自己的画面（#17）。
- 中文字标不靠 0.2em 字距撑气场（#7）。

---

## 7. 关于 CI 上"按 `j` 之后 primary 不变黑"

`apps/desktop/e2e/flows.spec.ts:81-86` 注释说：CI 的 WebKit 上，`j` 移动焦点后目标卡有 `focused` 类，但计算出的背景色"never settles"，于是这两行只在本地检查。

**能否复现：本机不能。** 同一份 Playwright WebKit 1.64.1，rAF 76 次/秒。把页面放到同一 context 里另一页之后（`bringToFront`），页面仍报告 `visible`、rAF 仍 76/s，过渡照常结束 [P1][ci-probe]。

**机制已经查清：**
1. `.btn` 给 `background-color` 和 `border-color` 配了 `var(--dur-hover-out) 150ms linear` 过渡（`app.css:693-696`、`tokens.css:55`）。卡失去 `quiet` 类时，背景从 `--bg-raised` 过渡到 `--text-1`。
2. 逐帧采样：过渡期间 `getComputedStyle` 返回插值后的 `oklab(0.7074 …)`、`oklab(0.4918 …)`、`oklab(0.2865 …)`。过渡结束（约 120–150ms）、`getAnimations()` 为空之后，才回到声明值的写法 `oklch(0.23 0.006 70)` [P1]。
3. 测试里的 `fill()` 用**字符串全等**比较 `backgroundColor === color(--text-1)`。只要过渡没结束，结果就是 `plain`；而 WebKit 的 CSS 过渡只在"更新渲染"（显示刷新驱动的帧）时推进。
4. 同步采样证实：类刚变时过渡已在 `running`，`currentTime = 0`，值是起点 `oklab(1 0 0)`；调用 `getAnimations().forEach(a => a.finish())` 后立即是 `oklch(0.23 0.006 70)` [P1b]。
5. 首屏检查和重载后的概览检查在 CI 上都过，因为首次样式计算不产生过渡。

**结论（推断，未在 CI 上实证）：** GitHub 的 macOS runner 是没有真实显示器的 VM。WebKit 的显示链路在那里不出帧或严重节流，于是动画时间线停住，过渡停在起点，`poll` 永远读到 `oklab(…)`。同一批提交里 view transition 和"键晚到一帧"的修补（2da0657、ae14274）也指向"CI 上帧很少"。

**这不是产品缺陷：** 真机有显示刷新。

**建议：**
- 让 `fill()` 先 `el.getAnimations().forEach(a => a.finish())` 再读值；或者这一个测试用 `emulateMedia({ reducedMotion: "reduce" })`（`base.css` 会把过渡归零）。这样就能撤掉 `if (!process.env.CI)`。
- 失败时在 CI 证据里记下 500ms 内的 rAF 计数和 `getAnimations()` 状态，用来实证上面的推断。

---

## 8. 附：本轮截图清单（`/tmp/audit-r8/shots/`，未入库）

| 编号 | 内容 |
|---|---|
| 01–05b | 概览：浅英 1440、深中 1440、深英 1100、浅英 1040、浅中 1800、无 Pi 问题 |
| 06–07 | 空概览骨架板：深英、浅中 |
| 08–09 | 欢迎（无项目 + git 身份缺失）：浅英、深中 |
| 10–11 | 启动失败：浅英、深中 |
| 12–15 | 需要你：浅英、深中、浅英全页、`j j` 之后、深英 1100 |
| 16–17 | 保留测试卡元素：浅英、深中 |
| 18–20 | criteria-cannot-run：收件箱浅英、目标页浅英、目标页深中 |
| 21–23 | G-0001 全页：浅英、深中、深英首屏、有保留测试 |
| 24–24f | tampered（C5）：目标页浅英 / 深中、验证读数、验收 sheet、评审页；干净验收 sheet |
| 25–27b | G-0002 运行中、G-0003 深中、G-0004 保留测试暂停全页、G-0001 1100 |
| 28–41 | 评审 G-0003：浅英、深中、深英 1100、接受一块、连按 A、G-0001、读数浅英 / 深中、验收 sheet 浅英 / 深中、要求修改、G-0002 无改动、⌘P、快捷键表 |
| 42–45 | 合同编辑器：浅英、深中、加 look 标准、深英 1100 |
| 46–51 | 设置：浅英全页、深中全页、Environment 浅英 / 深中、手机块、通知与推送浅英 / 深中、首屏 |
| 53–57 | 命令面板（深英、浅中 `cart`）、快捷键 sheet、活动 sheet、look 比较、轨迹 |
| p01–p09 | 手机：浅、深、中文、全页、空态、离线、稍后、430 深中、提示框输入 |
| P1 / P1b | 队列主色逐帧与同步采样（§7） |
| P2 / P2-after-2A / P2-hunk | 接受 hunk 折叠逐帧；连按 A 后状态；`]`+`A` 落点 |
| P3 | Tab 顺序（WebKit 默认只到表单控件） |
| P4 / P5 | 开关 28×18、字标字距；mono 的 `calt` 设置 |
| metrics.jsonl | 每屏填充 primary、<20pt 目标、截断文本、字体（全部 0 控制台错误） |
| axe | 概览浅、需要你深中、G-0001 浅、评审浅 / 深、合同浅、设置浅 / 深中：零违规 |

[^cc]: Claude Desktop / Cowork changelog（v3.6556.1 2026-10-22；v3.1623.0 10-20；v2.42304.0 10-15），https://claude.com/docs/cowork/changelog ；桌面文档 https://code.claude.com/docs/en/desktop ；CLI CHANGELOG 2.1.307–2.1.311（10-21 至 10-26），https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md
[^cx]: Codex app changelog 26.1007（2026-10-08），https://learn.chatgpt.com/docs/changelog?type=codex-app ；评审文档 https://developers.openai.com/codex/app/review ；ChatGPT iOS 1.2026.286（10-22）
[^cu]: Cursor release notes 3.27，https://cursor.com/docs/release-notes ；changelog（10-06 iOS 远控），https://cursor.com/changelog
[^co]: Conductor 0.92.0（2026-10-23），https://www.conductor.build/changelog/0.92.0-remote-control
[^fa]: Factory release notes v0.199–v0.207（10-15 至 10-27），https://docs.factory.com/changelog/release-notes
[^dv]: Devin desktop changelog 3.11.212 / 3.11.228（10-23 / 10-26），https://docs.devin.ai/desktop/changelog
[^zd]: Zed stable 1.25.2（10-21），https://zed.dev/releases/stable
[^am]: Amp news（10-12、10-16），https://ampcode.com/news ；Warp changelog 2026.10.15，https://docs.warp.dev/changelog/2026
[^ln]: Linear changelog（10-08 Guided Reviews、10-22 Loops），https://linear.app/changelog
[^rc]: Raycast changelog 2.6–2.9（10-05 至 10-22），https://www.raycast.com/changelog
[^dia]: Dia 1.54.0（10-22），https://www.diabrowser.com/changelog/mac/1-54-0 ；Things Mac 3.24.1（09-30）；Craft（10-11，仅见摘要）
[^ap]: Apple HIG What's new（最新 10-13），https://developer.apple.com/design/whats-new/
[^rv]: developertoolkit.ai agent shells（10-12 更新），https://developertoolkit.ai/en/ecosystem/agent-tools/agent-shells/ ；Paralect, "Top Agentic IDEs"，https://www.paralect.com/stack/top-agentic-ides
