# Tower 设计审计 r3（视觉、信息架构、交互、文案）

> 日期：2026-10-27。审计人：Fable（独立产品设计视角；判准是 Linear / Things 3 / Raycast / Zed / Arc / Panic Nova / Craft / Superhuman / Apple 自家应用的水平，并明确拒绝"AI 味"与"默认感"设计）。
> 范围：产品评分表 D6–D9，以及 r1/r2 的 12 项美学子分。对照 r2（`docs/reviews/design-audit-fable-r2.md`，综合 75）与其后的实现（`0f03edb..HEAD`，14 个桌面端提交：响应式到 1100、一个阅读宽度、第四灰、心跳、安静时段、字形余数、窗口化轨迹、依赖变更与 CI 失败决策卡、撤销 hunk、回退运行、分支预览、最低 Pi 版本、提交说明作为说法）。
> 取证：锁屏状态下 `tools/screenshot.sh` 只能拍到黑窗（`/tmp/audit-r3-design/real-overview.png`，平均亮度 19/255，仅作记录），因此本轮 84 张截图全部来自 `/tmp/preview/shot.mjs`（真实 Vite 页面 + 真实监督器数据，headless Chrome，2× 缩放）。为覆盖"依赖变更"与"CI 失败"两种新卡，我在 `/tmp/audit-r3-design/fx-extra/` 复制了夹具并按监督器 `crates/tower-supervisor/src/pr.rs:178-191`、`verify.rs:187-198`、`tower-core/src/i18n.rs:217-219` 的真实文案合成了这两张卡；单目标概览用 `fx-one/`。截图在 `/tmp/audit-r3-design/`，未入库；下文以 `[编号]` 引用。
> 注意：Chrome 与 WKWebView 在字体渲染与滚动条上有差异；涉及字重观感的结论以 WebKit 实机为准，涉及尺寸、对齐、断行、颜色、显隐的结论与实机一致。本轮另用 `--eval` 读取了计算样式，用于核实 CSS 级结论。

---

## 0. 总评

r2 列出的 30 项里，**27 项已经完整落地，2 项部分落地，1 项落地后被另一条规则抵消**（见 §1.3）。这一轮的差别是质变：1100 宽度不再断裂，评审页真正全屏，`↻ ‹ → ↔` 全部进了字形集，决策卡在三个页面同一个 840px 右缘，第四灰看得见（空段 `▭▭` 现在是 `1px solid var(--text-4)`，`—` 消失，`◐` 的 `--st-active` 加到 `oklch(.78 .12 235)`），标题栏有了 `1 秒前 / 无响应 1h 49m` 的心跳，欢迎页有了 `◯ TOWER` 字标，命令面板 `gwc` 正确点亮了 `购物车` [66]。D9 的几处校对（`墙钟 132 / 90 分`、`rounds`、`运行中 → 已暂停 · Tower 退出时暂停`、英文界面里的 `Pi demo-engine is too old; Tower needs 1.4.0 or newer`）也都做了。

它现在是一个**成立的产品**：没有 AI 味，没有默认感，航班牌 + 印章 + 来源边栏 + 琥珀条头 + 一支笔的字形是一套能被认出来的语言，中英文都像是人写的。但它**还不到 95**，剩下的问题换了一种性质——不再是"没做"，而是"做了但彼此打架"：

1. **一个 CSS 顺序错误抵消了 r2 第 1 项。** `app.css:1343` 的 `@media (max-width:1280px) .rail { display:grid }` 写在 `app.css:1608` 的基础规则 `.rail { display:flex; flex-direction:column }` 之前，同特异性后者赢。实测 1100 宽下 `.rail` 的 `display` 是 `flex`，五个 `.rail-block` 各 811px 宽、单列堆叠 [80]，预算条拉到 735px 长。r2 要的"两列摘要"从未在屏幕上出现过。
2. **诚实语法在两张新卡上反了。** CI 失败卡把监督器那句**散文**（"可以把失败的检查和日志发给 Agent：它会在同一个工作区里修复……"）排成了等宽 `code-val`，而真正的机器值——检查名 `test (ubuntu-latest, node 22)`——却用 16px UI 字体当问题句 [20][34]。`DecisionCard.tsx:82` 的 `codeBody()` 把 `ci_failed` 整体归为机器文本，这是分类错误，不是样式错误。依赖变更卡同理：第一句是散文，后两行才是 `npm ERR!`。
3. **重复的句子。** 假设卡的问题句与正文一字不差（`run.rs:576-577` 把同一个 `text` 同时写进 `subject` 和 `body`）[16][20][31]；验收面板仍然同时写 `已看 0/1 个评审单元` 和 `◇ 1 个评审单元没有标为已看` [46][47]（r2 第 8 项只改了措辞，没有合并）；目标页在身份行、卡片条头、卡片问题句里三次说"已暂停 / 停下了但没有提交" [26]。
4. **两个红方块并排。** 标题栏在有未读错误且引擎沉默时会出现 `■ 1 条错误 · ◐ 1/4 运行 · ■ 无响应 2h 1m` [74]——同一个危险字形承担了"有错误"和"很久没动静"两个意思。而且这时候航班牌和目标页的徽章仍然写着 `思考`：一个"思考了 1 小时 49 分"的 Agent 与一个"无响应 1h 49m"的引擎同屏，界面自相矛盾。
5. **按钮里的图标贴着字。** `.btn` 的 `gap: 6px` 只作用于 `.btn-label` 与 `.kbd` 之间；`Icon` 在 `.btn-label` 里面，实测图标右缘到文字左缘 **0px**：`↕整个文件`、`↩撤销这一块`、`+ 命令` 靠的是文字里的空格 [38][41]。
6. **"待验收"分组里有不是待验收的东西。** 12 目标概览里 `待验收 4` 下面第二行是 `验证 · 标准 · 0/2 已通过`（verifying）、侧栏同组里还有 `claimed` 的虚线环 [05]。`groupOf()` 把 `claimed / verifying / in_review` 都放进 `review`，标题却只说 `待验收`。

这些全是 S 量级；修完之后 D6–D9 预计 88–91。再往上到 95 需要的是 §4 末尾那几件事：空状态的构图、设置页的"输出"链接与按钮两种样式、英文右栏大小写、以及把"无响应"做成一等状态而不是标题栏的一个读数。

---

## 1. 评分

### 1.1 产品评分表 D6–D9

| 维度 | r2 | r3 | 一句话判词 |
|---|---|---|---|
| D6 视觉美学与原创性 | 74 | **82** | 字形集 100% 一支笔、第四灰可见、宽度体系统一、字标落地，整体已经像一件"有作者"的东西。扣分：按钮内图标零间距、两个 ■ 并排、CI/依赖卡的 mono 散文、右栏折叠失效让 1100 宽的目标页下半截松垮。 |
| D7 信息架构与布局 | 71 | **80** | 1100 宽全部可用；评审全屏；决策卡一个右缘；目标页骨架；心跳。扣分：`.rail` 折叠被 CSS 顺序抵消；"待验收"组名与内容不符；侧栏顶部 `需要你 2` 与分组 `需要你 1` 不一致；假设卡与暂停原因的重复；0 文件时 `+0 −0 · 0 个文件` 仍是一行读数。 |
| D8 交互细节与键盘 | 79 | **85** | 键位注册表、`?` 表 `1–9` 单帽、面板 0ms、焦点陷阱、两次按键、转向回执、拼音匹配修正、行号 ↑↓、`⌘` 点行号——同类里最完整。扣分：验证读数面板打开时焦点环落在 `还有 6 行 · 查看全部` 上 [45]；`回到这次运行开始时` 只在 hover 出现、无键盘路径说明；徽章不会随心跳降级为"无响应"。 |
| D9 文案与中文排版 | 75 | **83** | 单位、原始事件名、后端串泄漏都清了；新卡的文案（"这是一个安全决定……先看一眼它改了什么"）写得好。扣分：假设卡正文重复；验收面板两句同义；`PR 开放`；英文右栏 `Standard` 与 `ask first / workspace only` 大小写混用；`Agent 改了 package.json…` 整段散文排成等宽；预算行换行时 `·` 悬在行尾。 |

### 1.2 12 项美学子分（与 r2 对比）

| # | 子项 | r1 | r2 | r3 | Δ | 判词 |
|---|---|---|---|---|---|---|
| 1 | 美学与原创性 | 66 | 76 | **82** | +6 | 字标、13px 印章、`⟳ 1/3` 字形、`◯ TOWER`——身份开始从细节渗出来；仍缺一张"海报级"画面（空概览仍是左上角一小块）。 |
| 2 | 排版（拉丁 + CJK） | 70 | 79 | **84** | +5 | `墙钟 132 / 90 分`、`3 rounds`、标题优先命令让位（1100 下 `总价计算的单元测试 node --test test/cart.test.js` 完整可读 [25]）。扣：按钮内图标零间距；英文右栏大小写；`budget-line` 换行时分隔点悬尾 [24]。 |
| 3 | 颜色与对比 | 78 | 82 | **86** | +4 | `--st-active` 深 `oklch(.78 .12 235)` 与 text-3 可分；空段 text-4 实线；浅色禁用主按钮 `bg-selected + text-3`。扣：危险 ■ 同时用于错误计数与心跳沉默；`--text-4` 浅色 4.6:1 仍是边缘。 |
| 4 | 布局与层级 | 60 | 72 | **80** | +8 | 改动行独立网格、评审头部两行恒定、标准行 1280 下丢 `col-dur/col-pin`、编辑器右栏 1280 下折成两列（实测 `293.5px 293.5px`）。扣：目标页右栏折叠失效（实测 `display: flex`，单列 811px）。 |
| 5 | 密度与节奏 | 64 | 75 | **82** | +7 | 右栏三行键值、轨迹去掉 `花费更新`、分隔行时间内联、收件箱页脚 11px。扣：目标页身份行 / 条头 / 问题句三重复述；依赖卡正文四行 mono 一堵墙。 |
| 6 | 组件工艺 | 62 | 74 | **81** | +7 | 文件头两个切换 + `⋯`、禁用 ghost 保留发丝边、活动面板按钮、分支名可复制、验证尾部渐隐 + `还有 n 行`。扣：`.btn` 内 `Icon` 零间距；验证面板首焦点落在次要按钮；设置页 `输出`（下划线链接）与 `重新检查`（ghost 按钮）同一行两种形态。 |
| 7 | 动效与反馈 | 45 | 68 | **80** | +12 | 转向回执 `已送达 · 排在当前步骤之后` 5s；徽章词 100ms `swap`；`code-pending` 150ms 内不闪白；成功 toast `✓`。静态截图仍无法验证时序，故不满分。 |
| 8 | macOS 原生感 | 72 | 80 | **85** | +5 | 评审全屏（侧栏隐藏，头部左缩 84px 给红绿灯）；原生菜单 / `ask()`；禁用态像 AppKit。扣：两个 ■ 并排不像系统状态栏的克制；没有 `NSVisualEffect`（可选）。 |
| 9 | 图标与字形 | 58 | 80 | **90** | +10 | `rework`、`arrow-right`、`ring`、`bell`、`undo`、`columns`、`expand` 全部入集；`1–9` 单帽；`›` 保留为提示符。扣：`ResultMark pending` 用 `ring` 但 `Empty` 自己再画一个环（两处 SVG，应复用）。 |
| 10 | 空 / 加载 / 错误状态 | 55 | 72 | **80** | +8 | 空概览两个动作并排 `试一个演示目标 · 写合同 ⌘N` [08]；目标页骨架；启动失败 `copy`；评审 `没有改动` + `打开目标页` [42]。扣：空状态仍是左上角一块、下方 90% 留白；评审"没有改动"页头部仍显示 `0 个评审单元 · @7d1fbbb → @4ee67be`，与正文矛盾。 |
| 11 | 浅色主题 | 68 | 78 | **84** | +6 | 条头 `oklch(.962 .034 85)` 琥珀正确；白卡 .14 边框；禁用主按钮不再是灰胶囊 [47]。扣：浅色 `.file` 边框 `--border` 与 `.diff` 行底色 `--diff-add-bg .10` 叠在白底上略平；`bg-selected` 与 `bg-hover` 仍 1.046:1。 |
| 12 | 品牌性格 / 记忆点 | 52 | 64 | **72** | +8 | 字标、13px 印章、`⟳`、`◇ G-0003` 重叠标记——都在同一支笔下。扣：字标只在欢迎页；标题栏、面板、toast 仍是通用形态；"无响应"没有成为 Tower 自己的状态语法。 |
| | **综合** | 63 | 75 | **82** | +7 | |

### 1.3 r2 Top 30 落地核对

| r2 # | 项目 | 状态 | 证据 |
|---|---|---|---|
| 1 | 右栏 ≤1280 折到主栏下方两列 | **部分**：规则写了，但被 `app.css:1608` 的 `.rail{display:flex}` 覆盖 | `--eval`：`railDisplay:"flex"`, `blocks:[811,811,811,811,811]` [80] |
| 2 | 改动行独立 `.changes-row` | 已修 | `app.css:1360`；[25] 无竖排、无重叠 |
| 3 | 评审头部 nowrap + 1240 丢 pin | 已修 | `app.css:1972-2000`；[40] 两行 |
| 4 | 标准行标题优先、命令可压 | 已修 | `app.css:1397-1411`；[25] |
| 5 | 决策卡 / 快速输入 840 | 已修 | `--reading-w: 840px`；[23][26] 卡宽 840 |
| 6 | seg 实线 text-4、`—` 留空、`--st-active` 加彩度、pending 空心环 | 已修 | `app.css:568-577`、`tokens.css:111`、`Glyph.tsx:375` |
| 7 | `↻ ‹ → ↔` 改图标 / 改词、`1–9` 单帽 | 已修 | `Glyph.tsx:327-333`、`Review.tsx:256`、`Trace.tsx:298`、`ledger: "账本 · 说法与事实"`、[69] |
| 8 | 单位与文案校对；验收面板合并"已看"两行 | **部分**：单位 / `rounds` / `继续` 已修；验收面板仍两行 | [46]：`已看 0/1 个评审单元` 与 `◇ 1 个评审单元没有标为已看` 并存 |
| 9 | 后端消息本地化 | 已修（前端按 `kind` 翻译） | `labels.ts:96-111`；[12][62] 英文 |
| 10 | 评审真全屏 | 已修 | `app.css:29-34`；[38] |
| 11 | 引擎心跳 | 已修 | `Chrome.tsx:41-57`；[05] `1 秒前`，[23] `无响应 2h 1m` |
| 12 | 高亮闪白 | 已修（`code-pending` 150ms） | `FileDiff.tsx:27,373-375`、`app.css:2230` |
| 13 | 轨迹：分隔行内联、`花费更新` 仅事实、注入不描边、`A → B` | 已修 | [35][36] |
| 14 | 右栏自主度三行键值 | 已修 | [23] `档位 标准 / 单向门 先问 / 沙箱 只写工作区 · 不联网` |
| 15 | `rail-dl-code` 只染 dd | 已修 | [24] `Include / Read-only` UI 字体 |
| 16 | 收件箱页脚 11px 键帽；待验收卡提交说明 | 已修 | [16] |
| 17 | 禁用按钮 | 已修 | `app.css:626-663`；[47] |
| 18 | 验证输出 `还有 n 行` + 功能性遮罩 | 已修 | `panels.tsx:25-42`；[45] |
| 19 | 分支名全显 + 复制 | 已修 | [46] |
| 20 | 文件头收敛为两切换 + `⋯` | 已修 | [38] |
| 21 | 拼音匹配优先标题 | 已修 | `Chrome.tsx:199-205`；[66] `购物车` 三字加粗 |
| 22 | 占位符去括号；`◆` 紧邻状态词 | 已修 | [64][65] |
| 23 | 转向回执 | 已修 | `GoalPage.tsx:886-925` |
| 24 | 航班牌 ≤1240 实况只留徽章 + 动作词 | 已修 | [07] |
| 25 | 编辑器右栏折下、三档横排、`rows=2` | 已修 | `--eval`：`cols:"293.5px 293.5px"`，[58] |
| 26 | 欢迎页字标 / 基线 / 修复命令另起一行 | 已修 | [11][12] |
| 27 | 成功 toast `✓`；启动失败 `copy` | 已修 | [14][76] |
| 28 | 目标页加载骨架 | 已修 | `GoalPage.tsx:254-268` |
| 29 | 印章放大一档 | 已修 | `.seal-large` 13px；[28][38] |
| 30 | 徽章词 100ms 交叉淡入 | 已修 | `app.css:358-366`、`Live.tsx:30-40` |

---

## 2. 全局问题与修法

### 2.1 `.rail` 折叠：规则存在，但从未生效

现状：`app.css:1343-1358` 的媒体查询在 `app.css:1608-1614` 的基础规则之前。同特异性，后者的 `display: flex; flex-direction: column; gap: var(--sp-5)` 覆盖了 `display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr))`。实测 1100 宽：`display: flex`，`railWidth: 832`，五个块各 `811px`。

后果 [80]：目标页 1100 宽时右栏变成一个 832px 宽、约 700px 高的单列附录，预算条拉到 735px，`合同 v1 摘要` 到 `引擎` 之间全是空白右半区；用户要滚过整页才看到预算。

修法（S）：把媒体查询移到 `.rail` 基础规则之后，或提高特异性：

```css
/* app.css —— 放在 .rail { display:flex … } 之后 */
@media (max-width: 1280px) {
  .goal-rail .rail {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: var(--sp-5) var(--sp-8);
    border-left: 0; padding-left: 0;
    margin-top: var(--sp-5); padding-top: var(--sp-5);
    border-top: 1px solid var(--border-subtle);
  }
  .goal-rail .rail .rail-block:first-child { grid-column: 1 / -1; }  /* 合同摘要跨两列 */
}
```

并加一条组件测试：`matchMedia` 1100 下断言 `getComputedStyle(rail).display === "grid"`（现有 jsdom 测试基建已在 `2e045af`）。

### 2.2 诚实语法：新卡上的寄存器错位

| 位置 | 现状 | 应为 |
|---|---|---|
| CI 失败卡 [20][34] | 问题句 = 检查名 `test (ubuntu-latest, node 22)`，16px UI 字体；正文 = 散文说明，`code-val` 等宽 | 问题句：`CI 未通过` 的变量部分用 `code-val`：`<span class="code-val">test (ubuntu-latest, node 22)</span>`；正文散文用 UI 字体 `decision-body`，不加 `code-val` |
| 依赖变更卡 [20][33] | 整段 body（一句散文 + 两行 `npm ERR!`）都是等宽 pre-wrap | 监督器已用 `\n` 分隔（`verify.rs:194`）：首段散文 UI 字体，`\n` 之后的尾部放进 `.output-tail`（已有组件） |
| `DecisionCard.tsx:81-82` `codeBody()` | 以 `kind` 判定整个 body 是机器文本 | 改为按段：`body.split("\n")` 第一段散文、其余机器；或监督器把 `tail` 单独放进一个新字段 `detail` |
| 假设卡 [16][20][31] | `subject === body`（`run.rs:576-577`） | 前端：`<Show when={it().body && it().body.trim() !== it().subject.trim()}>`；后端：assumption 的 `body` 置空或放 Agent 给出的理由 |

### 2.3 一个屏幕只说一次

| 位置 | 重复 | 修法 |
|---|---|---|
| 目标页 G-0004 [26] | 身份行 `已暂停 · 停下了但没有提交` + 条头 `已暂停` + 问题句 `Agent 停下了但没有提交` | 有阻塞卡时身份行只留状态词 `已暂停`，原因交给卡：`GoalPage.tsx:163` 加 `&& inbox().length === 0` |
| 验收面板 [46][47] | `已看 0/1 个评审单元` 与 `◇ 1 个评审单元没有标为已看` | 删除 `panels.tsx:196` 那行；"仍未处理"列表已经表达了同一事实。全部已看时在印章行末尾加 `· 已看 1/1` |
| 评审"没有改动"页 [42] | 头部仍显示 `+0 −0 · 0 个文件 · 0 个评审单元 · @7d1fbbb → @4ee67be` | `units().length === 0` 时头部统计只保留 pin 对与印章 |
| 改动区块 [23][26] | `diffstat.files === 0` 仍渲染 `+0 −0 · 0 个文件 · 相对 base` | `GoalPage.tsx:508` 条件改为 `g().diffstat?.files`；0 文件走 `Empty("还没有改动")` |

### 2.4 标题栏：两个危险方块

现状 [74]：`■ 1 条错误 · ◐ 1/4 运行 · ■ 无响应 2h 1m`。`Chrome.tsx:51` 与 `:93` 都用 `gauge-dot down`（`--st-danger` 方块）。

修法：
- 错误计数保留 ■（它是"有东西坏了"）。
- 心跳 >120s 用 **空心方框** `◻`（1px `--st-danger` 描边，无填充）或改用 `NoticeMark ◇` + text-1 文字：沉默是"值得注意"，不是"已坏"。
- 同时让**航班牌与目标页徽章**在 `now - updated_at > 120s` 时把 `思考 / 执行` 降级为 `无响应`（`Live.tsx:ModeBadge`），否则 [23] 里"思考 1h 49m"与"无响应 1h 49m"同屏矛盾。`mode-badge` 用 text-2，不加琥珀（它不需要决定）。

### 2.5 按钮内图标间距

现状：`.btn { gap: 6px }` 在 `.btn-label` 与 `.kbd` 之间；`Icon` 作为 `.btn-label` 的子节点，实测图标到文字 0px [38][41]（`↕整个文件`、`↩撤销这一块`、`+ 命令`、`+ 人工` 靠源码里的空格或完全没有）。

修法（S）：

```css
.btn-label { display: inline-flex; align-items: center; gap: 5px; }
```

并去掉 `ContractEditor.tsx:172,175` 里 `<Icon/> {t(...)}` 的手写空格。

### 2.6 分组语义：`待验收` 里有 `验证中` 与 `自称完成`

现状 [05][07]：`groupOf()` 把 `claimed / verifying / in_review` 归入 `review`，组名 `待验收`。12 目标里 `待验收 4` 下面有 `验证 · 标准 · 0/2 已通过`（verifying）和虚线环（claimed）。侧栏顶部 `需要你 2`（按收件箱项计）与分组 `需要你 1`（按目标计，且排除 in_review）不一致 [01]。

修法：
- 概览与侧栏：`review` 组拆为 `验证中`（claimed + verifying）与 `待验收`（in_review）；或组名改为 `验收线 n`，但子行徽章已经写 `验证 / 待验收`，拆组更干净。
- 侧栏顶部行 `需要你 2` 的 2 = 阻塞项数（正确），分组 `需要你 1` 应改为按**项**计数，或把 G-0003 的假设卡也归到 `需要你` 组（它确实阻塞）。两处用同一个 `isBlocking` 计数源。

### 2.7 文案与排版校对

| 位置 | 现状 | 应为 |
|---|---|---|
| `goal.prOpen` | `PR 开放` [34] | `PR 开启中`（GitHub 中文、Linear 中文均用"开启"）；英文 `open` 保持 |
| 英文右栏 [24][27] | `Level Standard` / `One-way doors ask first` / `Sandbox workspace only · no network` | 统一句首大写：`Ask first`、`Workspace only · no network`；或全部小写含 `standard` |
| `budget-line` 换行 [24] | `hard $8 ·` 悬在行尾，下一行 `Wall clock 107 / 90 min` | `.budget-line > span { white-space: nowrap }`，`sep` 并入后项：`<span>· 墙钟 …</span>` |
| 墙钟超限 [23] | `墙钟 132 / 90 分` 与 `$0.02` 同一 text-1 | 超过 `wall_minutes` 时该段 `color: var(--st-attention)`（它已是预算读数，琥珀是对的），并在身份行加 `超时`；或说明为什么没有暂停 |
| 验收面板阻塞行 [46] | `■ 人工标准 C3 还没有勾选` 在分支名下方，离复选框 C3 四行 | 阻塞句放在复选框行右侧（`fact-row` 末尾 text-3 `待你勾选`），面板底部只保留主按钮禁用 |
| 设置项目块 [78] | `输出`（下划线 `.link`）与 `重新检查`（`btn-ghost`）同一行两种形态 | 两个都用 `btn-ghost btn-s`，`输出` 用 `aria-expanded` 切换 |
| 轨迹注入消息 [35] | `The goal was paused (Paused when Tower quit) and the human resumed it…` 在中文界面是英文 | 注入文本是给 Agent 的，保留原文正确；但折叠态第一行应标 `（英文，给 Agent）` 或用 text-3，避免读者以为是翻译遗漏 |
| 英文 `Submission` | `┆ Submission` 作为来源标签 | `Submit note` 或 `Agent's summary`；`Submission` 像表单术语 |
| 中文 `待你勾选` / `待验证` | 一致 | 保持 |

### 2.8 焦点与键盘

- 验证读数面板（E）打开时，`Overlay` 把焦点给第一个可聚焦元素——`还有 6 行 · 查看全部` ghost 按钮——于是一打开就有一个 1.5px 焦点环在面板中部 [45]。修法：`Overlay` 增加 `initialFocus?: "panel" | "first"`，三个评审面板用 `"panel"`（容器 `tabindex=-1`，Tab 再进第一个控件）。
- `回到这次运行开始时` 只在 `.run-row:hover` 出现（`app.css:1593-1603`）。键盘用户 Tab 到它时 `:focus-visible` 会显示，但没有任何地方说明有这个动作。修法：在 `运行` 区块标题右侧 `共 84 次` 旁加 text-3 提示 `悬停一行可回退`，或把回退放进该行的 `⋯` 菜单。
- 评审页 `?` 表作用域正确；但 `撤销这一块` 没有键位。建议 `u`（在当前 hunk 上）。

---

## 3. 逐屏审计

### 3.1 标题栏与侧栏 [01][02][03][05][74]

做对了：心跳 `1 秒前`（<30s text-2）→ `无响应 32s`（text-1）→ `■ 无响应 2h`（>120s）；1200 以下 `Pi demo-engine` 版本隐藏；侧栏 204px；`待验收` 顶行只在有待验收时出现；`需要你` 空时用 `◇`。

问题：
1. 两个 ■ 并排（§2.4）。
2. 顶行 `需要你 2` vs 分组 `需要你 1`（§2.6）。
3. 侧栏分组 `已验收 · 已结束` 与概览 `done` 组同名但概览不显示 archived——可接受。
4. 标题栏 `$16.74` 累计花费没有单位语境（`title` 有 `累计 $16.74`）。可接受。

### 3.2 概览 / 航班牌 [01]–[10][64]–[68]

做对了：快速输入、决策队列、空状态三者同一 840 右缘；航班牌通栏；12 行时 `$0 / $5 … $3.33 / $5` 右对齐成列；`⟳ 1/3` 字形；`◇ G-0003` 重叠；1100 下实况列只留 `执行 bash`、身份列隐藏、标题列拿到 1.6fr [07]；单目标时同一张牌 [10]；空状态两个动作并排 [08]。

问题：
1. `待验收 4` 组内有 verifying / claimed 行（§2.6）。
2. 空状态 [08][09] 仍是左上角一块，下方 90% 留白；"海报级"身份画面的机会仍然空着。建议：空状态下把 `.empty` 下移到视口 32% 高度（`margin-top: 24vh`），上面放 `◯ TOWER` 字标（欢迎页同款），正文下方用一行 text-3 展示三条规则（`事实与声明分开 · 只在需要你时打扰 · 你的仓库不被触碰`）。
3. 快速输入 `padding-right: 200px` 为右侧提示留位；1100 宽下输入可用宽约 540px，可接受；但英文提示 `↵ quick start · ⌥↵ write a contract` 已 175px，再长会与占位符重叠。建议 1200 以下提示只留 `↵ · ⌥↵`。
4. 航班牌 `g-age` 列对运行中目标显示 `1h 46m`（运行时长），其他行显示 `4 小时前`（更新时间）——同一列两种量纲，靠读者自己分辨。建议运行中行前缀 `已运行`，或把时长放进实况列、年龄列统一为"最后更新"。

### 3.3 需要你 [16]–[22]

做对了：`阻塞运行 3 / 待验收 1` 刻度标题；焦点卡亮条头；`1 2` 键帽；CI 卡条头右侧 `PR 开启 · ✓ 3 ■ 1 · 1 ›`；依赖卡 `◇ 这是一个安全决定……` 用 60ch 限宽的 meta 段落；页脚 11px 键帽行。

问题：
1. CI 卡与依赖卡寄存器错位（§2.2）。
2. 假设卡问题句 = 正文（§2.2）。
3. CI 卡条头：`PR 开放 · ✓ 3 ■ 1 · 1 › 32 分钟前`——PR 行与时间之间只有 12px，且 `›` 后紧跟时间，像是时间属于链接。建议 PR 行左移到标题后（`G-0001 修复购物车总价计算 · PR …`），时间独占右缘。
4. 依赖卡没有文本框（`allow_text: false`），而其他阻塞卡都有——卡高度参差。可接受（这是个二选一安全决定，不该附言），但 `先看一眼它改了什么` 应该是一个动作：在 `◇` 段落末尾加 `btn-ghost btn-s` `打开改动 ›`（跳到 review）。
5. 1100 宽 [22]：卡片 840 → 通栏 736px，依赖卡 mono 正文第一行 `Agent 改了 package.json, package-lock.json。合同不允许联网，离线准备失败；联网安装会运行这些改动选择的代码。` 一行 54 字未折行，等宽中文一行塞满。改成散文后自然解决。

### 3.4 目标页 [23]–[34][80]

做对了：H1 20/28 + 身份行；印章 13px 右置；`原因` 去重 `另有 23 条相同`；仪表列 `通过 919ms ⫽ @a4a90b2 4 小时前`；观测行只框 `观测`；右栏三行键值；预算条 4px；`运行` 三条 + `全部 84 次`；1100 下标准行 `通过 4 小时前`（丢 dur/pin）[30]；骨架；转向回执。

问题：
1. 右栏折叠失效（§2.1，最高优先级）。
2. 三重复述（§2.3）。
3. 墙钟超限无强调（§2.7）。
4. `+0 −0 · 0 个文件` 仍是一行读数 [23][26]（§2.3）。
5. 徽章 `思考` 不随心跳降级（§2.4）。
6. 头部动作 `暂停 P · 改动 R · 轨迹 W · ⋯`：`轨迹` 是 `btn-ghost` + `aria-pressed`，按下态 `bg-selected`，[35] 可见；好。但 `改动 R` 与 `接下来` 区块里的 `评审 1 个文件 R` 同一个键 `r` 两个按钮 [28]——同页两处同键是对的（同一动作），但 `改动` 与 `评审` 两个词指同一件事。建议统一为 `评审 R`（in_review 时主按钮）/ `改动 R`（其他状态），`接下来` 区块的按钮改为 `评审 1 个文件 R` 时头部不再重复 `评审 R`。
7. 英文右栏大小写（§2.7）。
8. 轨迹 [35][36]：`read  {`、`read  function total(…)` 的摘要是文件首行而非文件名——这是引擎给的 summary，但读者看到 `read {` 不知道读了什么。建议 `tool_ended.summary` 为空或以 `{` 开头时显示 `target`（路径）。`Agent 环境中的观测` 一行没有说观测到什么（`observed` 事件只有 plainLabel）；应带 `C1 通过`。

### 3.5 评审 [38]–[55]

做对了：真全屏；头部两行恒定（1100 丢 pin 对 [40]）；文件头 `+1 −1 · ↕整个文件 · 已看 · ⋯`；`↩撤销这一块` 只在 paused/in_review 出现；word diff `+`→`*` 单字符；并排 [43][44]；`整个文件` 按下态 [53]；批注编辑器 [55]；验证读数 `还有 6 行 · 查看全部` [45]；验收面板分支名 + 复制 [46]；`没有改动` 空态 [42]。

问题：
1. 按钮内图标零间距（§2.5）：`↕整个文件`、`↩撤销这一块`。
2. 验证面板首焦点（§2.8）。
3. 验收面板两句同义（§2.3）；阻塞句位置（§2.7）。
4. `没有改动` 页头部统计矛盾（§2.3）。
5. 并排模式 [43]：左右两栏各自 `col-ln 44px + col-half calc(50% − 44px)`，中间 `border-left: 1px var(--border-subtle)`；删除行左栏有底色、右栏同一行空白 `dl-blank` 用 `--bg-inset`——好。但 hunk 头 `@@ -1,5 +1,5 @@` 仍跨全宽、`撤销这一块` 在最右，与右栏代码右缘对齐；左栏没有对应物，视觉上像右栏的操作。建议并排时 hunk 头的撤销按钮居中或放在左栏末。
6. 状态条 `点行号或 + 写批注 · ⌘ 点行号在编辑器中打开` 两段无键帽的提示与前面五段键帽提示混排，视觉上成了第六、第七个"键"。建议这两段放到右侧 `?` 之前，用 text-4。
7. 浅色 [39][44][47]：diff 行底色 `.10` 在白底上偏淡；`--diff-add-bg` 浅色可到 `.13`。

### 3.6 合同编辑器 [56]–[59]

做对了：`意图` 区块；标准两行结构；`$5 / $8` 单位左置；`90 分 / 3 次`、`90 min / 3 rounds`；sticky 动作行；右栏 1280 下折成两列 `293.5px × 2`、三档横排；`rows=2` 全部统一；`+ 命令 / + 人工` 文字按钮。

问题：
1. `+ 命令`、`+ 人工` 的 `+` 与文字靠源码空格（§2.5）。
2. 1100 下 [58] 右栏折下后 `自主度` 三档横排每档只有 ~180px，`标准` 的描述 `范围内编辑、跑测试直接做；加依赖、改 CI、递归删除先问` 折成四行。建议 ≤1280 时描述进 `title`，只留一行 `谨慎 · 标准 · 自主` 单选 + 当前档描述一行。
3. `终态（可选）` 空框 56px 高与 `目的` 同高——r2 第 25 项已统一为 `rows=2`，现在一致；好。
4. 底部 `取消` 在最左、`保存为草稿 · 批准并开始 ⌘↩` 在右；中间 `reason` 文字区空着时整行只有两端——可接受（macOS 对话框惯例）。

### 3.7 设置 [60]–[63][78][79]

做对了：环境 kv；`■ Pi demo-engine 太旧` 本地化 + 修复命令独占一行；`4 个` 量词；`0 / 800` 字数；项目块 `✕ main 上测试已经失败 npm test` 一行事实 + `输出 / 重新检查`；1100 下标签列 180px 仍放得下 `Workspace setup command`。

问题：
1. `输出` 下划线链接与 `重新检查` ghost 按钮同行两形态（§2.7）。
2. 项目块 `移除` ghost 按钮与 `shop` 标题同一行右缘，`saved-stamp` 出现时会挤在中间；可接受。
3. 外观两组单选 `跟随系统 ○ 浅色 ○ 深色` 用原生 radio `accent-color: var(--text-1)`，14px；与 Select 28px 高度不在一个节奏（radio 行 20px）。建议外观用 `.scope-switch` 同款分段控件（`tab` 22px）。
4. `Pi demo-engine 0.1 (scripted, no model) · /Volumes/…/demo_pi.py` 路径 `break-all` 正确。

### 3.8 欢迎 [11][12][13]

做对了：`◯ TOWER` 10px 字距 .14em；右栏首行与字标同高；修复命令独占一行；`重新检查` 左、`试一个演示目标 · 添加一个 git 仓库` 右；1100 单列。

问题：
1. 字标是唯一的身份锚点，其他页面没有（§3.2 空状态建议复用）。
2. 右栏 `环境检查` 标题 y=234 与左栏字标 y=222 差 12px，与 lede 基线也不齐；`.welcome-side { padding-top: 6px }` 应改为对齐字标：`padding-top: 0` 并让 `.checks .section-title` 行高 12px 上边距与 `.wordmark` 同。
3. 英文 1100 [13]：`Let the agent do the work; you look at results and evidence` 24px 折两行后与 lede 间距 `--sp-5` 偏紧；可加到 `--sp-6`。

### 3.9 命令面板 [64]–[68]

做对了：`gwc` 命中 `购物车` [66]；占位符 `搜索目标与命令…`；`◆ 待验收` 紧邻；无匹配两行 [67]；页脚 `共 2 项`。

问题：
1. 命令行的键帽 `⌘,` 在浅色 [65] 里 `kbd-bg .06` 几乎不可见；可接受（键帽本就应安静）。
2. 面板列表项 32px、分组标题 `最近 / 命令 / 目标` 12px text-3——与 Raycast 2.0 的 36px 相比更紧，符合 Tower 的密度；好。

### 3.10 快捷键表与活动记录 [69][70][71][72]

做对了：`1–9` 单帽；两栏 760px；活动面板禁用按钮保留发丝边 [72]；空态环 + 两行。

问题：
1. 快捷键表 `任何地方` 列 `新目标 N ⌘N`、`下一个需要你的目标 G ⌘⌥↓` 两枚键帽并列表示"二选一"，但 `上下移动 J K` 的两枚是"两个键"——同一视觉表示两种语义。建议别名用 `/` 分隔：`N / ⌘N`。

### 3.11 Toast、空、加载、错误 [14][15][74][76]

做对了：错误 toast `■ preview is read-only: pause` + `×`；信息 toast `已复制`；启动失败 `copy` 图标在错误框右上；`重试` 主按钮 + `打开数据目录` + 路径右置。

问题：
1. 信息 toast [76] 只有文字 + `×`，没有任何前缀；成功有 `✓`、警告 `◆`、错误 `■`——信息类"无前缀"是设计决定，但在只有一条 toast 时它与成功类几乎不可分（`已复制` 用的是 `info`，`已答复` 用的是 `success`）。建议 `已复制` 改为 `success`，`info` 只留给"已暂停 G-0002" 这类中性通知。
2. 启动失败页 [14] 居中 560px，字标缺席——这是最需要"这是 Tower"的一屏。

---

## 4. 距离 95 分还差什么：Top 30

影响：H = 阻断性或原则级；M = 单屏明显；L = 细节。量：S < 半天，M ≈ 1 天。预期：完成第 1–10 项后 D6–D9 约 86–89；完成第 1–20 项后约 90–92；最后 10 项把它推向 95。

| # | 改动 | 文件 | 预期效果 | 影响/量 |
|---|---|---|---|---|
| 1 | `.rail` 折叠规则移到基础规则之后（或 `.goal-rail .rail`），合同摘要跨两列；加 jsdom 断言 | `app.css:1343-1358 → 1615+`、`__tests__` | 1100 宽目标页右栏真的变成两列摘要，页面短 40% | H / S |
| 2 | CI 卡：检查名 `code-val`，散文 UI 字体；依赖卡：首段散文 + 尾部 `.output-tail`；`codeBody()` 按段判定 | `DecisionCard.tsx:81-82,177-182` | 诚实语法在新卡上不再反向 | H / S |
| 3 | 假设卡 `body === subject` 时不渲染正文；监督器 assumption 的 body 置空 | `DecisionCard.tsx:178`、`run.rs:577` | 每张卡少一行重复 | H / S |
| 4 | 心跳 >120s：标题栏用空心方框 / `◇`，徽章降级为 `无响应`（text-2） | `Chrome.tsx:51`、`Live.tsx:20-49`、`app.css:131-134` | "安静 ≠ 死机"在航班牌上也成立；标题栏不再两个 ■ | H / S |
| 5 | `.btn-label { display:inline-flex; gap:5px }`；删手写空格 | `app.css:597+`、`ContractEditor.tsx:172,175` | 所有带图标的按钮统一 5px | H / S |
| 6 | 验收面板删 `已看 n/m` 行；阻塞句移到复选框行右侧 | `panels.tsx:196,237-241` | 面板少两行、无自相矛盾 | H / S |
| 7 | 概览 / 侧栏 `review` 组拆为 `验证中` 与 `待验收`；分组计数与顶行计数同源 | `labels.ts:34-51`、`Overview.tsx:29,52`、`Sidebar.tsx:17,33-34`、`i18n group.*` | 组名与内容一致；`需要你 2 = 2` | H / S |
| 8 | 有阻塞卡时身份行只留状态词；`diffstat.files === 0` 走 `Empty` | `GoalPage.tsx:163,508` | 目标页每个事实只说一次 | M / S |
| 9 | 墙钟超限段 `--st-attention`；身份行加 `超时` | `GoalPage.tsx:759-767`、`app.css .budget-line` | 预算读数会"报警" | M / S |
| 10 | `Overlay initialFocus="panel"`；三个评审面板使用 | `ui.tsx:227-290`、`panels.tsx` | 面板打开无游离焦点环 | M / S |
| 11 | `PR 开放` → `PR 开启中`；英文右栏句首大写统一 | `zh-CN.ts:527`、`en.ts:644-651` | D9 一致性 | M / S |
| 12 | `budget-line` 每段 nowrap、`·` 并入后项 | `GoalPage.tsx:755-768`、`app.css:1572` | 换行时无悬尾分隔点 | L / S |
| 13 | 评审 `没有改动` 时头部只留 pin 对与印章 | `Review.tsx:241-280` | 头部不与正文矛盾 | M / S |
| 14 | 设置 `输出` 改 `btn-ghost btn-s` + `aria-expanded` | `TestCheck.tsx:47-49` | 一行一种控件形态 | L / S |
| 15 | 轨迹 `tool_ended.summary` 为空或 `{` 开头时显示 target；`observed` 事件带 `C1 通过` | `Trace.tsx:210,160-181` | 轨迹每行可读 | M / S |
| 16 | 依赖卡 `◇` 段落末尾加 `打开改动 ›`；1100 下正文可折行 | `DecisionCard.tsx:183-187` | "先看一眼它改了什么"可点 | M / S |
| 17 | 航班牌年龄列统一为"最后更新"；运行时长进实况列 `· 已运行 1h 46m` | `GoalRow.tsx:24-25,65` | 一列一种量纲 | M / S |
| 18 | 快捷键表别名用 `/`：`N / ⌘N` | `ShortcutSheet.tsx:46`、`ui.tsx Kbd` | 两枚键帽只表示"两个键" | L / S |
| 19 | 状态条无键帽的两段提示移到右侧、text-4 | `Review.tsx:423-424`、`app.css:2102` | 状态条左侧全是键 | L / S |
| 20 | 编辑器 ≤1280 三档横排：描述进 `title`，当前档描述一行 | `ContractEditor.tsx:272-283`、`app.css:2530-2534` | 1100 下右栏不再四行折 | M / S |
| 21 | `已复制` 用 `success`；`info` 只留中性通知 | `Chrome.tsx`, `GoalPage.tsx`, `panels.tsx` 等 `toast("info", t("common.copied"))` | 三类 toast 可辨 | L / S |
| 22 | 并排模式 hunk 头的 `撤销这一块` 居中或置左栏末 | `app.css:3256+`、`FileDiff.tsx:188-197` | 操作不被误读为右栏的 | L / S |
| 23 | 浅色 `--diff-add-bg / --diff-del-bg` `.10/.08 → .13/.11` | `tokens.css:177-178` | 浅色 diff 行可辨 | L / S |
| 24 | `回到这次运行开始时` 键位 / 菜单入口；`撤销这一块` 绑 `u` | `GoalPage.tsx:568-596`、`Review.tsx:193-214` | 键盘用户能发现 | M / S |
| 25 | CI 卡条头：PR 行移到标题后，时间独占右缘 | `DecisionCard.tsx:132-144` | 条头右缘只有时间 | L / S |
| 26 | 外观两组单选改分段控件 | `Settings.tsx:246-292`、`app.css .scope-switch` | 设置页控件高度一个节奏 | L / S |
| 27 | 空概览 / 空收件箱 / 启动失败页：字标 + `margin-top: 24vh` + 三条规则一行 | `Overview.tsx:126-142`、`Inbox.tsx:77-87`、`App.tsx:67-105`、`app.css .empty` | 三个最空的屏幕有 Tower 的脸 | M / S |
| 28 | 欢迎页右栏标题与字标同基线 | `app.css:1232-1236` | 两栏首行对齐 | L / S |
| 29 | `Empty` 的环 / 方块改用 `Icon name="ring"` 与 `DangerMark` | `ui.tsx:162-176` | 字形集单一来源 | L / S |
| 30 | 轨迹注入消息折叠态标 `（给 Agent）` text-3 | `Trace.tsx:229-245`、`i18n trace.injected` | 英文不被当成翻译遗漏 | L / S |

---

## 5. 与主流 harness GUI 的对比

对照对象与时间点：OpenAI Codex 桌面应用（2026-02-02 发布 macOS，线程按项目分组、每线程一个 worktree、内置评审界面可在 diff 上评论并在外部编辑器打开；2026-05 登陆 Windows）[^codex1][^codex2][^codex3]；Claude Code 桌面重设计（2026-04-14：会话侧栏并行、拖放式布局、内置终端 / 文件编辑器 / 预览、更快的 diff 查看器支持行内评论、每会话一个 worktree；后续加了活动仪表盘、嵌套会话、保存的环境）[^cc1][^cc2][^cc3]；Conductor（Melty Labs，macOS，每工作区一个 worktree，"diff-first review UI"，2026-08 评测称其"最强的 Mac 并行 Agent 看板"，但本地工作区明确不沙箱）[^cond1][^cond2][^cond3]；Cursor 3（2026-04-02，Agents Window：每 Agent 一个标签、可并排或网格、worktree 隔离、Design Mode；3.20 调整了窗口 chrome 与图标一致性）[^cur1][^cur2][^cur3]；Linear 2026-03-12 UI 刷新（头部 / 导航 / 视图控件统一、图标重绘、侧栏调暗、分割线减少、灰阶转暖；2026-09 优先收件箱 + 模糊搜索）[^lin1][^lin2][^lin3]；Raycast 2.0（2026-05-14 公测、08-19 正式，"每个像素都是新的"，Liquid Glass 克制使用，Tahoe 起）[^ray1][^ray2]；Things 3.22–3.25（Liquid Glass 刷新、重复待办重构把复选框放回原位、iPhone Duo 自适应布局）[^things1][^things2]。

### 5.1 Tower 落后的地方

| 方面 | 它们 | Tower | 差距性质 |
|---|---|---|---|
| 面板灵活性 | Claude Code 拖放布局、Cursor 3 标签可并排 / 网格、Codex 线程 + 内置终端 | 固定三区（侧栏 / 内容 / 右栏），评审全屏 | 这是**选择**（监督不需要终端），但右栏折叠失效让"固定"在窄窗变成了"僵硬" |
| 评审器功能面 | Claude Code 行内评论 + 更快 diff；Codex 评论 + 外部编辑器；Cursor 按 Agent 部分接受 | 单元 / 风险 / 行内批注 / 并排 / 整文件 / 已看 / 撤销 hunk / 回退运行 | 功能面已追平大半；缺跨文件搜索、缺按 hunk 接受（撤销是反向操作） |
| 窄窗与多窗 | Things 3.25 为折叠屏做了自适应、Cursor 3.20 调了 chrome | 1100 可用，但 §2.1 的 bug 说明响应式没有测试守护 | 工程纪律 |
| 环境材质 | Raycast 2.0 / Things 3.22 Liquid Glass；Linear 暖灰 + 减线 | 平面、hue 70 暖灰、发丝线 | 方向一致（Linear 也在"减线、转暖"）；Tower 的 `--border-subtle .06` 与 `.scale-title::after` 已是同一思路 |
| 启动与空态 | Claude Code 会话启动页（最近 / 环境）；Linear 优先收件箱 | 欢迎页两栏、空概览一块 | 空态构图（§3.2 第 2 条） |
| 品牌 | Linear 字体与图标系统、Raycast 窗口形态 | 字标只在欢迎页；一支笔的字形集已成体系 | 把字标和"无响应"语法推广到空态与标题栏 |

### 5.2 Tower 独有且应该坚持的地方

1. **主画面不是对话流。** Codex、Claude Code、Conductor、Cursor 的主画面都是"一条线程 + 一个 diff"；Tower 是一块航班牌和一叠决策卡。Cursor 3 的 Agents Window 把聊天放到正中，是"结对"；Tower 是"监督"。
2. **诚实语法是版面结构。** `┆ Agent 称` 来源边栏、`⫽ @pin` 事实后缀、虚线 `观测`、绿色只跟哈希——没有竞品在 UI 层区分"模型说的"与"验证器量到的"。本轮两张新卡（依赖变更、CI 失败）是这套语法第一次遇到"监督器自己的散文 + 机器尾部"的混合体，§2.2 是让语法覆盖它，而不是放弃它。
3. **仪表列。** `通过 919ms ⫽ @a4a90b2 4 小时前` 每条读数同列；Conductor 呈现的是日志，Tower 呈现的是读数。
4. **琥珀纪律。** 只有 28px 条头、一次 700ms 衰减、一个 100ms 徽章翻牌。竞品用 spinner 与红点；Tower 应该继续不加。
5. **安全决定写成人话。** "这是一个安全决定：批准后，验证的准备命令会在沙箱里联网一次……先看一眼它改了什么。" Conductor 的评测特别指出它"本地工作区不沙箱"；Tower 不但沙箱，还把"这次联网"做成一张需要人确认的卡。
6. **键盘注册表与中文。** `?` 表从注册表生成；`gwc` 命中 `购物车`；中文不是翻译腔。竞品全部英文优先。

### 5.3 一句话定位

与 Codex / Claude Code / Conductor / Cursor 3 相比，Tower 在"面板灵活性、材质打磨、空态与启动页"上仍落后半步，在"信息架构的原创性、诚实语法、键盘纪律、中文"上领先一代。r2 的"收尾迭代"基本完成；本轮剩下的是**一致性收口**——一个 CSS 顺序、两张卡的寄存器、三处重复、两个红方块、一个 5px 间距。做完这些，它就不再是"接近完成的内部构建"，而是一个可以放到 Linear 旁边不脸红的桌面应用。

---

## 6. 附：本轮截图清单（`/tmp/audit-r3-design/`，未入库）

| 编号 | 内容 |
|---|---|
| 01–04 | 概览：深中 1440、浅英 1440、深中 1100、浅中 1100 |
| 05–07 | 概览 12 目标（`--many`）：深中、浅英、深中 1100 |
| 08–09 | 空概览：深中、浅英 |
| 10, 10b | 单目标概览（`fx-one`）：深中、浅英 |
| 11–13 | 欢迎：深中、浅英、深英 1100 |
| 14–15, 15b | 启动失败：深中、浅英、复制后 toast |
| 16–19 | 需要你：深中、浅英、深中 1100、空 |
| 20–22, 22b | 需要你（`fx-extra`：CI 失败 + 依赖变更）：深中、浅英、深中 1100、`j` 后 |
| 23–25 | G-0002 运行中：深中、浅英、深中 1100 |
| 26–27 | G-0004 已暂停：深中、浅英 |
| 28–30 | G-0001 待验收：深中、浅英、深中 1100 |
| 31–32 | G-0003 待验收 + 假设卡：深中、浅英 1100 |
| 33 | G-0004 依赖变更卡（目标页） |
| 34, 34b | G-0001 已验收 + CI 失败卡（目标页）：深中、浅英 |
| 35–37 | G-0002 轨迹深中、浅英；`?` 表 |
| 38–42 | 评审：深中、浅英、深中 1100、G-0003 深英、G-0002 浅中（没有改动） |
| 43–44 | 并排：深中、浅英 |
| 45, 45b | 验证读数：深中、浅英 |
| 46–47 | 验收面板：深中、浅英 |
| 48–49 | 要求修改：深中、浅英 1100 |
| 50–55, 55b | 已看、`?` 表、展开上下文、整个文件（浅英）、撤销 hunk、批注编辑器深中 / 浅英 |
| 56–59 | 合同编辑器：深中、浅英、深英 1100、浅中 |
| 60–63 | 设置：深中、浅英、深英 1100、浅中 |
| 64–68, 68b | 命令面板：默认、浅英、`gwc`、无匹配、英文 `rev`、1100 |
| 69–71 | 快捷键表：概览深中、浅英、需要你 |
| 72–73 | 活动与错误：深中、浅英 |
| 74–75 | 错误 toast + 标题栏 `■ 1 条错误 · ■ 无响应`：深中、浅英 |
| 76 | 信息 toast `已复制`（验收面板） |
| 77 | 两次按键的 armed 态 `再按一次确认 · 2` |
| 78–79 | 设置项目块：深中、浅英 |
| 80 | G-0002 1100 滚到右栏折叠处（单列 811px） |
| 81–84 | `--eval` 计算样式取证用图 |
| real-overview.png | `tools/screenshot.sh` 实机抓取（锁屏，黑窗，仅作记录） |

[^codex1]: Help Net Security, "OpenAI releases Codex macOS app for agent-based software development" (2026-02-03), https://www.helpnetsecurity.com/2026/02/03/openai-codex-macos-app/
[^codex2]: Verdent, "What Is Codex App? OpenAI's Command Center for Parallel Coding Agents (2026)", https://www.verdent.ai/guides/what-is-codex-app
[^codex3]: Nimbalyst, "Best Codex GUI 2026: 6 Codex Desktop Apps Compared", https://nimbalyst.com/blog/best-codex-gui-tools-and-desktop-apps-2026/
[^cc1]: MacRumors, "Anthropic Rebuilds Claude Code Desktop App Around Parallel Sessions" (2026-04-15), https://www.macrumors.com/2026/04/15/anthropic-rebuilds-claude-code-desktop-app/
[^cc2]: @claudeai on X, "We've redesigned Claude Code on desktop…", https://x.com/claudeai/status/2044131493966909862
[^cc3]: Nimbalyst, "Claude Code Desktop after the redesign: what Anthropic shipped, and what power users still miss", https://nimbalyst.com/blog/claude-code-desktop-after-the-redesign/
[^cond1]: Continuum Code, "Conductor review 2026: honest verdict and limits", https://continuumcode.ai/guides/conductor-review/
[^cond2]: Addy Osmani, "The Code Agent Orchestra - what makes multi-agent coding work", https://addyosmani.com/blog/code-agent-orchestra/
[^cond3]: AlteredCraft, "Conductor and the Agent Orchestration Environment", https://writing.alteredcraft.com/p/conductor-and-the-agent-orchestration
[^cur1]: Cursor Changelog, "New Cursor Interface" (3.0), https://cursor.com/changelog/3-0
[^cur2]: Cursor, Release notes (3.20 chrome / icons), https://cursor.com/docs/release-notes
[^cur3]: Sean Kim, "Cursor 3 Review: Agents Window, Design Mode, and the Agent-First IDE Challenge…", https://blog.imseankim.com/cursor-3-agents-window-review-parallel-agents-design-mode-claude-code-codex-april-2026/
[^lin1]: Linear Changelog, "UI refresh" (2026-03-12), https://linear.app/changelog/2026-03-12-ui-refresh
[^lin2]: Linear, "A calmer interface for a product in motion", https://linear.app/now/behind-the-latest-design-refresh
[^lin3]: Linear Changelog, "Priority inbox" (2026-09-03), https://linear.app/changelog/2026-09-03-priority-inbox
[^ray1]: Raycast, "The New Raycast", https://www.raycast.com/blog/the-new-raycast
[^ray2]: Raycast, "A Technical Deep Dive Into the New Raycast", https://www.raycast.com/blog/a-technical-deep-dive-into-the-new-raycast
[^things1]: Cultured Code, "Repeating To-Dos, Refined" (2026-08), https://culturedcode.com/things/blog/2026/08/repeating-to-dos-refined/
[^things2]: MacRumors, "Things 3 Updated for iOS 27 With Siri AI and Spotlight Integration" (2026-09-14), https://www.macrumors.com/2026/09/14/things-3-updated-for-ios-27/
