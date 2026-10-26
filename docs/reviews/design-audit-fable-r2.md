# Tower 设计审计 r2（视觉、信息架构、交互、文案）

> 日期：2026-10-27。审计人：Fable（独立产品设计视角；判准是 Linear / Things 3 / Raycast / Zed / Arc / Panic Nova / Craft / Superhuman / Apple 自家应用的水平，并明确拒绝"AI 味"与"默认感"设计）。
> 范围：产品评分表 D6–D9，以及 r1 的 12 项美学子分。对照 r1（`docs/reviews/design-audit-fable-r1.md`，综合 63）与其后的两轮实现（`bdf1793..eb6c08d`）。
> 取证：锁屏状态下 `tools/screenshot.sh` 只能拍到空窗（`/tmp/audit-r2-design/real-overview.png` 全黑），因此本轮 70 张截图全部来自 `/tmp/preview/shot.mjs`（真实 Vite 页面 + 真实监督器数据，headless Chrome，2× 缩放），覆盖深/浅色 × 中/英 × 1440/1100 的全部视图与面板。截图在 `/tmp/audit-r2-design/`，未入库；下文以 `[编号]` 引用。
> 注意：Chrome 与 WKWebView 在字体渲染（Inter Variable / PingFang 回退、`halt`）和滚动条上有差异，涉及字重观感的结论以 WebKit 实机为准；涉及尺寸、对齐、断行、颜色的结论与实机一致。

---

## 0. 总评

r1 提出的七件"签名设计动作"里，六件已经落地，而且做得像是设计师自己的东西，不是照单抄：区块标题 13/500 text-1、仪表列 `14px 2.5em 1fr 3em 6ch 9ch 7em`、来源边栏 7.5em、一支笔的 SVG 字形（30 个 `Icon` + 10 个生命周期字形 + 结果标记）、验证印章 `✓ 已验证 @a4a90b2`、刻度式分组标题、700ms 琥珀衰减与人触发的 160ms 收起。概览从卡片网格改成了**一目标一行的 36px 航班牌**，这是本轮最大的一步：12 个目标在 [07] 里读起来像机场出发屏，而不是像一个 SaaS 仪表盘。命令面板有了分组、最近、拼音首字母、匹配高亮、页脚；`?` 键表从键位注册表实时生成；`⌘⇧L` 活动记录补上了"错过的 toast 去哪了"。设置页变成了左标签右控件；合同编辑器有了"意图"分组、两行标准、框内单位、底部 sticky 动作行；欢迎页两栏、带真实组件渲染的样例卡。

但它**还不是 95 分的产品**，原因很具体，而且大多不是"品味"问题，是"没做完"：

1. **1100 宽度下有真正的版面断裂。** 目标页"改动"行 `0 个文件` 被逐字竖排、`快照` 与 `相对 base @7d1fbbb` 重叠 [22][29]；验收标准标题被压成 `购物车… np…`；评审头部统计断成三行 `+1 / −1`、`1 个文 / 件`、`@7d1fbbb → / @a4a90b2` [32][56]。右栏 340px 在任何宽度下都不折叠。一个 MacBook Air 的半屏就是 1100 宽，这不是边缘情况。
2. **字形集还剩最后 5% 没画完。** `↻1/3`（行内返工）、轨迹里状态跃迁的 `‹`、评审头部 `@7d1fbbb → @a4a90b2` 的 `→`、`账本：说法 ↔ 事实` 的 `↔`，以及快捷键表把 `1–9` 画成两枚键帽 `1` `9`。r1 把这项从 58 分提到 80 分的功劳是真的，但剩下这几处正好都在最显眼的位置。
3. **宽度体系不统一。** 概览里快速输入通栏（1148px）、决策队列 840px、航班牌又通栏；目标页上的决策卡却是 1590px 全宽（16px 问题句只占左 1/4）[23][27]；收件箱 840px。同一个组件在三个页面有三种宽度，眼睛每次都要重新找右缘。
4. **文案与单位的最后一遍校对没做。** `墙钟 31m / 90 分`（同一行两种时间单位）[20]；英文 `Automatic rework limit 3 ×`（`×` 当单位）[36]；轨迹里 `已暂停 · resume`（原始事件名）[58]；英文界面里出现中文后端消息 `Pi demo-engine 0.1 … 太旧，Tower 需要 1.4.0 或更新的版本。`[12][39]；验收面板同时写 `你已查看 1/1 个评审单元` 和 `1 个评审单元没有标为已看` [53]。
5. **"第四灰"仍然看不见。** 未运行的标准段 `▭▭`（1px 点线 `--border-strong` 16%）在 0.205 的行底上几乎是噪点 [07][72]；无改动时的 `—` 用 text-4 却是整行最抢眼的横杠；`◐` 的 `--st-active` 与 text-3 的对比仍只有 1.18:1（深色）/ 1.02:1（浅色）。

结论：**骨架已经是对的，而且是独有的；距离可发布只差一个"收尾迭代"——响应式、字形余数、宽度对齐、文案校对、第四灰。** 这些全部是 S/M 工作量。做完之后，D6–D9 预计能到 88–92；再往上到 95 需要的是 §4 末尾那几件"放大身份"的事。

---

## 1. 评分

### 1.1 产品评分表 D6–D9

| 维度 | 分 | 一句话判词 |
|---|---|---|
| D6 视觉美学与原创性 | **74** | 已经没有任何"AI 味"：无渐变、无玻璃、无 emoji、无胶囊、无紫色、无居中英雄区。航班牌、仪表列、印章、琥珀条头构成了可辨认的风格；但 1100 宽下的断裂、未画完的字形和宽度不统一让它仍像"接近完成的内部构建"，不像上架产品。 |
| D7 信息架构与布局 | **71** | 页面职责清楚（概览=决策队列+航班牌，收件箱=按阻塞分组，目标页=说法/标准/改动/接下来/运行，评审=全屏+状态条）。扣分几乎全在布局鲁棒性：右栏不折叠、改动行断裂、评审头部断行、决策卡三种宽度、标题列在 1100 下只剩 6 个字。 |
| D8 交互细节与键盘 | **79** | 键盘覆盖面是同类里最完整的：注册表驱动的 `?` 表、作用域分组、`inInputs` 规则、面板 0ms、焦点陷阱与还原、两次按键的破坏性操作、原生 `ask()`。扣分：评审页仍保留侧栏（"全屏"名不副实）；引擎心跳没有"n 秒前"；高亮异步到达造成的代码闪白；成功类 toast 无法与错误区分形态；`1 9` 键帽。 |
| D9 文案与中文排版 | **75** | 中文文案是写给人看的（"停下了但没有提交""绿色只属于验证器""推送由你决定"），标点、`halt`、中西文空格、tnum 都对。扣分在一致性：时间单位混用、`×` 当单位、原始事件名泄漏、后端中文串泄漏进英文界面、验收面板自相矛盾、`账本：说法 ↔ 事实` 用符号代替词、收件箱页脚提示用正文字号。 |

### 1.2 12 项美学子分（与 r1 对比）

| # | 子项 | r1 | r2 | Δ | 判词 |
|---|---|---|---|---|---|
| 1 | 美学与原创性 | 66 | **76** | +10 | 航班牌 + 印章 + 来源边栏已成风格；仍缺一个"放大到海报级"的身份元素。 |
| 2 | 排版（拉丁 + CJK） | 70 | **79** | +9 | 层级拉开了（13/500 text-1 标题、text-3 标签）；`G-000N` 提到 text-2；mono 最小 11.5px。扣：1100 下标题被压成 4 字；`墙钟 31m / 90 分`。 |
| 3 | 颜色与对比 | 78 | **82** | +4 | 浅色令牌按 r1 调整（边框 .14/.08、琥珀 hue 85、text-4 .59）；深色 text-3 7.58:1、text-4 5.16:1。扣：`--st-active` 与 text-3 仍不可分；seg 点线不可见。 |
| 4 | 布局与层级 | 60 | **72** | +12 | 概览与目标页的重复已清除；仪表列成立。扣：响应式断裂（见 §2.1）、宽度三制。 |
| 5 | 密度与节奏 | 64 | **75** | +11 | 36px 行、28px 标准行、24px 观测行、20px 区块上间距，节奏稳定。扣：目标页右栏"自主度"三行 12px 说明文字是一堵墙；轨迹里 `花费更新` 行是噪音。 |
| 6 | 组件工艺 | 62 | **74** | +12 | 键帽去底、单位入框、切换开关、Select、Overlay 焦点管理都到位。扣：禁用主按钮在浅色下是中灰胶囊状 [54]；验证读数的输出框截断无提示 [52]；评审文件头四个文字按钮一字排开。 |
| 7 | 动效与反馈 | 45 | **68** | +23 | 700ms 衰减、120/220ms View Transition、160ms 收起、按下 0.5px 下沉、toast 100ms 退出、键盘面板 0ms——规范里的全部动效都实现了。扣：静态截图无法验证时序；高亮异步到达的"闪白"是一个未设计的动效；没有"已发送/已保存"的就地确认（除设置）。 |
| 8 | macOS 原生感 | 72 | **80** | +8 | 原生 `ask()`、系统滚动条、原生弹出菜单、非活动窗口褪色。扣：评审"全屏"仍有侧栏；没有 `NSVisualEffect` 材质（Tauri 下可选，不强求）；禁用态按钮不像 AppKit。 |
| 9 | 图标与字形 | 58 | **80** | +22 | 30 个 1.25px 方端 SVG 图标替换了全部 Unicode 导航图标，结果标记也 SVG 化。扣：`↻ ‹ → ↔`（面板提示符的 `›` 可以保留）。 |
| 10 | 空 / 加载 / 错误状态 | 55 | **72** | +17 | `Empty` 组件三种标记（环/点/方）、无目标/无收件/无轨迹/无活动的具体文案、启动失败页带原因与路径、`■ 1` 未读错误仪表。扣：空概览仍是 95% 留白加左上角一小块；加载态是一个点 + 文字，无骨架。 |
| 11 | 浅色主题 | 68 | **78** | +10 | 白卡 + .14 边框 + 黑主按钮成立，琥珀不再发桃色。扣：禁用主按钮中灰；`bg-selected` 与 `bg-hover` 1.046:1 仍几乎同色（靠 2px 左标救）。 |
| 12 | 品牌性格 / 记忆点 | 52 | **64** | +12 | 航班牌是第一个"一眼认出是 Tower"的画面。扣：标题栏、欢迎页、面板仍是通用形态；没有 wordmark/图标在任何界面出现；印章只有 12px。 |
| | **综合** | 63 | **75** | +12 | |

---

## 2. 全局问题与修法

### 2.1 响应式：1100 宽度是正式支持宽度，现在是断的

现状（`app.css`）只有两条媒体查询：`.welcome`（≤1100）与 `.g-row`（≤1240）。目标页、评审头部、侧栏都不响应。

| 位置 | 现象 | 截图 | 原因 |
|---|---|---|---|
| 目标页"改动"行 | `0 个文件` 逐字竖排成 4 行；`快照 @4ee67be` 与 `相对 base @7d1fbbb` 重叠 | [22][29] | 改动行复用 `.criterion-row` 的 7 列网格（`14px 2.5em 1fr 3em 6ch 9ch 7em`），其中 `3em`/`6ch` 列装不下 `0 个文件`、`相对 base @7d1fbbb`，且没有 `white-space: nowrap` |
| 目标页标准行 | 标题 `购物车… np…`、`总… node …`：1fr 列只剩 ~90px | [22][29] | 主栏 = 1100 − 232 侧栏 − 64 内边距 − 340 右栏 − 32 间距 ≈ 432px，再减 4 个固定列 |
| 评审头部 | `+1 / −1`、`1 个文 / 件`、`@7d1fbbb → / @a4a90b2` 各断成两行，英文更糟（三行） | [32][56] | `.review-stats` 无 `nowrap`，`.review-stat-group` 可换行 |
| 侧栏 | 1100 下仍 232px，占 21% | [05][22] | `--sidebar-w` 固定 |
| 航班牌 | 标题列 `修复购物车总价…` 与实况 `当前步骤 · 第 84 …` 同时截断 | [05][72] | ≤1240 规则只隐藏了身份列 |

修法（全部 S 工作量）：

```css
/* 1. 右栏在窄窗折到主栏下方，变成两列摘要 */
@media (max-width: 1280px) {
  .goal-body { grid-template-columns: 1fr; gap: 0; }
  .rail {
    border-left: 0; padding-left: 0;
    margin-top: var(--sp-5); padding-top: var(--sp-5);
    border-top: 1px solid var(--border-subtle);
    display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: var(--sp-5) var(--sp-8);
  }
}
/* 2. 改动行不用标准行的网格 */
.changes-row { display: grid; grid-template-columns: auto auto minmax(0, 1fr) auto auto; column-gap: var(--sp-3); align-items: center; min-height: 28px; white-space: nowrap; }
.changes-row > * { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
/* 3. 标准行：标题优先，命令可被挤掉 */
.criterion-title { flex: 0 1 auto; min-width: 8em; }
.criterion-cmd { flex: 1 1 0; max-width: min(340px, 45%); }
@media (max-width: 1280px) {
  .criterion-row { grid-template-columns: 14px 2.5em minmax(0, 1fr) auto; }
  .criterion-row .col-dur, .criterion-row .col-pin { display: none; }   /* 并入 .col-result 的 title，或在第二行显示 */
}
/* 4. 评审头部单行，溢出省略，窄窗先丢 pin 对 */
.review-stats { white-space: nowrap; overflow: hidden; min-width: 0; }
.review-stat-group { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
@media (max-width: 1240px) { .review-stat-pins { display: none; } }
/* 5. 侧栏 */
@media (max-width: 1200px) { :root { --sidebar-w: 204px; } }
```

### 2.2 字形集最后 5%

| 文件 | 现状 | 应为 |
|---|---|---|
| `GoalRow.tsx:72` | `↻{n}/{max}` | `<Icon name="stale" size={10} />` 或新增 `rework`（两段弧 + 箭头，与 `stale` 区分），后接 `{n}/{max}` tnum |
| `Review.tsx:244`, `:551` | `@7d1fbbb → @a4a90b2`、`old → new` | 新增 `arrow-right` 10px 图标，`gap: 6px` |
| `Trace.tsx` 状态跃迁 | `‖ 已暂停 ‹ 运行中` | `chevron-left` 10px text-4，或改为 `运行中 → 已暂停`（时间方向更自然） |
| `i18n.ts goal.ledger` | `账本：说法 ↔ 事实` / `Ledger: claims ↔ facts` | `账本 · 说法与事实` / `Ledger · claims and facts`；符号不做标题 |
| `ShortcutSheet.tsx` / `Overview.tsx` | `hint: "1 9"` 渲染成两枚键帽 | `hint: "1–9"` 单帽，`Kbd` 不按空格切分含 `–` 的片段 |
| `Chrome.tsx:230`, `Overview.tsx:255` | 提示符 `›` | 保留（这是 prompt 字符，不是图标），但应与 `quick-prompt` 同字体同色 |

### 2.3 宽度体系：一个阅读宽度，一个仪表宽度

现状：快速输入 100%（[01] 1148px）；决策队列 `max-width: 840px`；航班牌 100%；目标页决策卡 100%（[23] 1590px）；收件箱 840px；设置 820px；编辑器 1000px；欢迎 920px。

规则建议（写进规范）：**可阅读的东西 840，可扫描的东西通栏。** 决策卡、空状态、长说明、表单属于前者；航班牌、标准行、diff 属于后者。

```css
.goal-decisions { max-width: 840px; }          /* 目标页决策卡与收件箱同宽 */
.quick { max-width: 840px; }                   /* 快速输入与决策队列同右缘；筛选器跟随 */
.settings, .editor { max-width: 840px; }       /* 820 / 1000 → 840，编辑器右栏 300 含在内时为 640+32+168？不行——编辑器保持 1000，但左栏 640 与 840 对齐的是文字宽度 */
.annunciator, .goal-sub { max-width: none; }   /* 仪表类保持通栏 */
```

（编辑器例外：左栏 640 + 右栏 300 的两栏结构是合理的，不动；只把 `.settings` 从 820 改 840。）

### 2.4 第四灰：让"没有"也看得见

| 元素 | 现值 | 问题 | 建议 |
|---|---|---|---|
| `.seg`（未运行段） | `1px dotted var(--border-strong)`（深 16%、浅 22%），12×4 / 8×4 | 在 [07][72] 的 36px 行里是噪点；"0/2" 的 0 成了唯一信息 | `border: 1px solid var(--text-4); border-radius: 1px;`（深 #888682 5.16:1）；`tiny` 档 `width: 9px; height: 5px` |
| `.g-diff` 无改动 | `<span class="t4">—</span>` | em dash 在 tnum 列里比数字更重 | 留空（`&nbsp;`），或 `0` text-4；改动为零不是读数 |
| `--st-active` | 深 `oklch(.76 .085 230)`，与 text-3 对比 1.18:1；浅 `oklch(.52 .095 230)` 对 text-3 1.02:1 | `◐` 在 10px 下与中性灰不可分（r1 已提，未改） | 深 `oklch(0.78 0.12 235)`、浅 `oklch(0.50 0.13 240)`；或让运行中字形带 1 格 700ms 周期的 `opacity .7↔1`（这会违背"只有琥珀自己动"的原则，不推荐） |
| `.result-stale/.result-pending` | text-4 | 待验证的 `·` 几乎不可见 [20] | text-3，并把 `·` 改为 `ring` 空心 6px 圆（已有 `dot` 图标的空心版） |
| 浅色 `.btn-primary:disabled` | `opacity .4` 于 `--text-1` 底 | [54] 像一枚灰胶囊，不像 macOS 禁用按钮 | `.btn-primary:disabled { background: var(--bg-selected); border-color: var(--border); color: var(--text-3); opacity: 1; }` |

### 2.5 文案与单位校对（D9 的主要失分）

| 位置 | 现状 | 应为 |
|---|---|---|
| `goal.wallLine` | `墙钟 {elapsed} / {minutes} 分` → `墙钟 31m / 90 分`；en `Wall clock 36m / 90 min` | 同单位：`墙钟 31 / 90 分`、`Wall clock 31 / 90 min`（`duration()` 在此用分钟整数） |
| `contract.times`（en） | `×` → `Automatic rework limit [3 ×]` | `rounds`（`3 rounds`）；zh `次` 保持 |
| 轨迹状态跃迁 | `运行中 ‹ 已暂停 · resume` | `resume` 走 `goal.purposeResume`（`继续` / `Resume`） |
| 后端环境检查 | `crates/tower-supervisor/src/lib.rs:457` 硬编码中文 `Pi {v} 太旧，Tower 需要 {want} 或更新的版本。`，英文界面原样显示 [12][39] | 监督器返回 code + 参数（`pi_too_old{v,want}`），前端 `t()`；或把 `settings.language` 传给监督器 |
| 验收面板 | `你已查看 1/1 个评审单元` 与 `◇ 1 个评审单元没有标为已看` 并列 [53] | 两个概念合一：`已看 0/1 个评审单元`（按"标为已看"计），删掉第一行；或第一行改 `你打开过 1/1 个评审单元` |
| 收件箱页脚 | `J / K 移动 · 1–9 选择 · 放弃等操作需按两次`，13px text-2 正文样式 [16] | 用 `review-status` 同款：11px text-3 + 键帽 `J K 移动 · 1–9 选择 · 放弃需按两次` |
| `group.review` | `验证与待验收` / `Verifying and ready to accept`（侧栏 232px 下英文占满一行） | `待验收` / `To accept`（"验证中"目标用字形区分即可；侧栏顶部已有 `待验收` 行，口径统一） |
| `trace.evCostUpdated` | `花费更新` 作为一条独立轨迹行，每次工具调用后出现 [58] | 从"全部"视图隐藏，只在"事实"筛选中显示；或合并进上一条工具行的右侧读数 |
| 英文 `chrome.runningShort` | `1/4 running` | 可以；但 `■ 1` 未读错误仪表无文字，建议 `■ 1 error` / `■ 1 条错误`（宽度允许时） |
| `welcome` 检查项 2 | 修复命令 `pi` 单独一个 kbd 块贴右缘 [11][12]，而检查项 1 的命令另起一行 | `.check-row > .fix { flex-basis: 100%; margin-left: calc(14px + var(--sp-3)); }` 一律另起一行（代码里已有此意图，但只对长命令生效） |

中文排版本身做得对的地方要保留：全角标点 `halt` 压缩（单行标签）、中西文之间空格（`在 shop 中`、`第 84 次运行`）、`G-0002 · shop · 合同 v1` 的间隔号、`“批准”和“驳回”` 用弯引号。英文侧的 `Agent says` / `Verified` / `Ready to accept` 与中文语气一致。

### 2.6 动效：实现了，但有一个没设计的动效

- 已实现且方向正确：`.decision[data-new] attn 700ms`、`.g-row[data-new] arrive 160ms`、`.decision.leaving 160ms ease-in`、`.btn:active translateY(.5px)`、`.toast.leaving 100ms`、`::view-transition 120/220ms`、`.overlay.instant` 0ms。
- 未设计的动效：评审页代码先以单色渲染，再在 worker 返回后着色（[30] 单色 vs [33] 有色是同一页面的两次抓取）。这是一次"闪变"。修法：hunk 总字符 < 4k 时走主线程同步高亮（`highlight.ts` 增加 `highlightSync`），或先渲染为 `visibility: hidden` 的占位行，着色完成后一次显示（≤ 1 帧）。
- 缺的就地确认：转向框"发送"后、决策卡"答复"后，除了卡片收起没有任何"已送达"回执；`goal.delivered`（`已送达 · {what}`）文案存在，但 [20] 的转向框下方没有位置显示它。建议在 `.steer` 右侧按钮位置显示 `已送达 · 排在当前步骤之后` 2 秒后 100ms 淡出（与设置页 `saved-stamp` 同一机制）。

---

## 3. 逐屏审计

### 3.1 标题栏与侧栏 [01][02][03][70]

做对了：面包屑 `shop › G-0002`（12px text-2 + 10px chevron + mono id）；右侧仪表簇 `■ 1 · ◐ 1/4 运行 · $0.09 · ● 引擎 Pi demo-engine`；搜索改成 26px 图标按钮；侧栏顶部 `新目标 / 需要你 / 待验收 / 概览` 四行，分组 16px 间距，选中行 2px 左标。

问题：
1. 引擎仪表仍是静态文字，没有"n 秒前"。"安静 = 正常"与"安静 = 死机"依旧不可分（r1 §3.2.4 未落地）。→ `gauge` 第三段显示 `· 2 秒前`（来自最近一次事件时间戳），>30 秒变 text-1 `无响应 32 秒`，>120 秒 `■` 危险色。
2. `Pi demo-engine` 这段 text-3 在 1100 宽下仍占 110px。→ 1200 以下只显示 `● 引擎`，版本进 `title`。
3. 浅色标题栏下沿 `border-subtle` .08 可见但弱 [02]；可接受。
4. 侧栏分组名 `验证与待验收`（英文 `Verifying and ready to accept` 占 232px 的 90%）过长，见 §2.5。

### 3.2 概览 / 航班牌 [01]–[10][72]

做对了：决策队列（焦点卡亮条头、其余安静）+ 刻度式分组标题 + 36px 行；列：字形 14 · 标题 1.25fr · 实况 1.2fr · 标准 11em · 改动 4.5em · 花费 7em · 时间 5em · 身份 11.5em · 动作 5em。12 行时 [07] 的 `$0 / $5`、`$2.96 / $5`、`+111 −36` 全部右对齐成列，`G-0010 · shop` 身份列成列，`评审` 动作只在待验收行出现。这是本产品最像"自己的东西"的画面。

问题：
1. 顶部三种右缘（§2.3）：快速输入通栏、队列 840、航班牌通栏。→ `.quick { max-width: 840px }`，筛选器随之；或队列也通栏（不推荐，16px 问题句在 1148px 上太散）。
2. `seg` 点线不可见；`—` 过重（§2.4）。
3. 实况列的 `思考 当前步骤 · 第 84 次运行`："当前步骤"是占位文案，没有信息量。→ 没有 live_line 时只显示 `思考 · 第 84 次运行`。
4. 1100 宽 [72]：标题列 `把结账流程中所有金…`、实况 `bash · npm test …` 双截断。→ ≤1240 时实况列只保留徽章 + 动作词（`执行 bash`），对象进 `title`；标题列拿到 `minmax(12em, 1.6fr)`。
5. 空状态 [09]：`○ 没有进行中的目标` 在左上角，右侧与下方 95% 留白；侧栏 `需要你` 行用空心 `◇`。文案好（"在上面写一句你想要的结果按 ↵"），构图可以再稳：`.empty` 加 `margin-top: var(--sp-6)`，并把 `试一个演示目标` 与 `⌘N 写合同` 并排为两个动作。
6. 多项目时 `overview-filter` 32px 高的 Select 与 32px 快速输入并排，合理；单项目时不显示，好。

### 3.3 需要你 [16][17][18][19][68]

做对了：840 宽；`阻塞运行 2` / `待验收 2` 刻度标题取代了说明句；待验收卡正文是事实读数 `✓ 已验证 @a4a90b2 · +1 −1 · 1 个文件 · ▬▬ 已验证 2/2 · 观测 1/2 · 人工 0/1`；焦点卡按钮带 `1` `2` 键帽且键帽已去底色。

问题：
1. 页脚提示用正文样式（§2.5）。
2. 两张待验收卡的差异只有 `人工 0/1` 一段，读数里缺"改了什么"：→ 读数第二行加提交说明的说法 `┆ 提交说明 把 total() 中的单价与数量改为相乘`（数据已有，目标页在用）。
3. 焦点卡 `答复 ⌘↩` 按钮禁用态是 `opacity .4` 的描边按钮，与旁边的文本框底色几乎融在一起 [16]。→ 禁用时只降文字（`color: var(--text-3)`），保留边框。
4. 浅色 [17] 焦点卡条头 `#fdf1d9` 正确、不发桃色。

### 3.4 目标页 [20]–[29][58][59][70][71]

做对了：H1 20/28 + 身份行 `G-0002 · shop · 合同 v1 · 第 84 次运行` + 印章右置；实况行只在无决策卡时显示；`原因` 去重并折叠 `另有 23 条相同`；`运行` 最近 3 条 + `› 全部 84 次`；仪表列 `通过 919ms ⚙ @a4a90b2 3 小时前` 上下对齐；观测行只框 `观测` 二字；预算条 4px + 软/硬刻度移入右栏；`dt` text-3；转向框实色 + 上发丝线；轨迹筛选改成文字标签。

问题：
1. 1100 宽断裂（§2.1，最高优先级）。
2. 决策卡全宽 1590px [23][27]（§2.3）。
3. 右栏"自主度"三行 12px text-2 说明是一堵墙 [20]：`标准：范围内直接做，依赖与 CI 先问 / 单向门（push、发布、改历史）一律先问 / 沙箱：只能写自己的工作区 · 不联网`。→ 改成 `rail-dl` 三行键值：`档位  标准`、`单向门  先问`、`沙箱  只写工作区 · 不联网`，详细说明进 `title`。
4. 右栏 `范围围栏` 的 `dt`（`包含 / 只读`，英文 `Include / Read-only`）在英文下落入 mono [21]：`GoalPage.tsx:729` 写的是 `class="rail-dl mono"`，而 `base.css` 的全局 `.mono`（`font-family: var(--font-mono); font-size: max(.923em, 11.5px)`）作用于整个 `dl`，`dt` 一并被染，`app.css:1474` 的 `.rail-dl.mono dd` 形同虚设。→ 类名改为 `rail-dl-code`（只染 `dd`），或把 `code-val` 加在每个 `dd` 上。
5. 预算行单位混用（§2.5）。
6. 标准行的 `待验证` 用 `·` 字形（text-4）作为状态标记，几乎不可见 [20]。→ 6px 空心环 text-3。
7. 轨迹 [58]：`第 84 次运行开始 · 继续` 分隔行的时间戳 `23:21` 落在上一行高度，与文字错开一行；`花费更新` 噪音；`⚙ Tower 注入 · 消息 ›` 是轨迹里唯一的描边 chip；`已暂停 ‹ 运行中 · Tower 退出时暂停 · 上次退出时仍在运行` 一行塞三段。→ 分隔行 `grid-column: 1 / -1; display: flex; gap: 8px`，时间内联；`花费更新` 只在"事实"筛选显示；注入消息用 `harness` 图标 + 文字 + `caret-right`，不描边；状态跃迁 `运行中 → 已暂停 · Tower 退出时暂停`，原因第二段进 `title`。
8. 头部动作 `暂停 P · 改动 R · ∿ 轨迹 W · ⋯`：`轨迹` 带图标而其他两个不带，三枚按钮两种形态 [20]。→ 要么都不带图标（推荐），要么 `轨迹` 的 `pulse` 图标改为按下态切换（`aria-pressed`），作为"视图切换"与"动作"的区分。
9. 页面底部转向框发送后无回执（§2.6）。

### 3.5 评审 [30]–[34][50]–[57][64]

做对了：56px 头部两行（标题 14/500 + 统计 12）；返回键；单文件时单元栏折叠为 solo；24px 底部状态条装下全部键位提示；行号 text-3；`已看` 为 `aria-pressed` 切换按钮；word diff 只标 `+`→`*` 一个字符；并排模式 `⌥V` 折行正确 [50]；验证读数面板 `E` 把每条标准的输出尾部放进 160px 内嵌框 [52]；验收面板列出阻塞项（红方块）与非阻塞项（◇）[53]；要求修改的作文框 1.5px 焦点环 [55]。

问题：
1. 头部统计在 1100 下断成两到三行（§2.1）[32][56]。
2. "全屏"仍保留侧栏 [30]：`view-full` 去掉了标题栏，但 `.shell` 的 232px 侧栏还在；diff 可用宽度 1148px 而非 1408px。→ 评审路由下 `.shell { grid-template-columns: 0 1fr }`（侧栏 `display:none`），返回键已存在；或保留侧栏但让 `.review-head` 跨到侧栏之上（更像 Xcode 的全宽工具栏）。二选一，现状是两头不靠。
3. 文件头 `+1 −1  ↕整个文件  批注  在编辑器中打开  已看` 五段文字按钮一字排开，无主次 [30]。→ `整个文件`/`已看` 作为切换（`btn-s` + `aria-pressed`），`批注`/`在编辑器中打开` 收进 `⋯`，或只留图标按钮 `expand` / `message` / `folder` / `check`，hover 显示文字。
4. 代码高亮异步到达的闪变（§2.6）。
5. 验证读数的输出框 `max-height: 160px` 硬切在 `ℹ pass 2` 后 [52]，没有渐隐也没有"还有 n 行"。→ 底部 1 行 text-3 `… 还有 12 行 · 查看全部`，或 `mask-image: linear-gradient(black 80%, transparent)`（这是功能性渐隐，不是装饰）。
6. 验收面板分支名 `tower/g-0001-…` 被省略号截断且不可复制 [53]。→ `word-break: break-all` 显示全名 + 行尾 `copy` 图标按钮。
7. 验收面板自相矛盾的两行（§2.5）。
8. 折叠行 `↓ 文件其余部分 全部展开`：英文 `rest of the file show all` 用 mono 且 `show all` 带下划线 [31]，与中文版 `全部展开` 的样式不同（中文是 UI 字体）。→ 两种语言统一为 `btn-ghost btn-s`。
9. 评审页 `?` 表 [64] 的作用域标题 `评审 · G-0001` 很好；`标为已看并前进` / `并排 / 单列切换` 的用词清楚。

### 3.6 合同编辑器 [35][36][37][66]

做对了：`意图` 区块合并四个文本字段；标准两行结构 `C1 [标题] [600 秒] ×` + 缩进的 `[npm test]`；`$5` / `$8` 单位在框内左侧；`90 分` / `3 次` 单位在框内右侧；底部 sticky 动作行 `取消 · 保存为草稿 · 批准并开始 ⌘↩`；右栏 `自主度` 单选描述另起一行 12px text-3；`允许联网` 用反色开关。

问题：
1. 英文 `3 ×`（§2.5）。
2. 文本区初始高度：`目的` 2 行、`终态` 3 行、`停止条件` 2 行、`约束` 2 行——`终态（可选）` 空着却是最高的框 [35]。→ 全部 `rows=2` 自动增高。
3. 右栏在 1100 下仍 300px，`谨慎 / 标准 / 自主` 描述折成 3 行 [37]。→ ≤1280 时右栏折到左栏下方，三档单选横排。
4. 标准行的 `×` 删除是 16px 图标按钮，与 28px 输入框垂直居中略低 1px（Chrome 渲染，实机需复核）。
5. `+ 命令` / `+ 人工` 两个添加按钮是文字链接样式，与下方的输入框形成"轻-重-轻"节奏，合理。

### 3.7 设置 [38][39][40][67]

做对了：左标签右控件（180px / 520px）；`已保存 · 时间` 戳；环境块的 `kv` 版本在前、路径 text-2；`加载我全部的 Pi 扩展` 标签与说明分两行。

问题：
1. 环境警告行的修复命令 chip 贴着 820px 右缘，距离警告文字 70px 以上 [38]；1100 下它换到第二行 [40]，反而更好。→ 一律另起一行（与欢迎页同一 `.check-row` 规则）。
2. `同时运行的目标上限 [4]` 72px 窄框后面没有单位，而 `单次运行墙钟 [90 分]` 有。→ 单位 `个`（zh）/ 留空（en），`.narrow` 宽 `6ch`。
3. `你的记忆` 说明句 `（最多约 800 字）` 与 `Lasting preferences … (up to about 800 characters)` 都对；但 textarea 没有字数读数。→ 右下角 `312 / 800` text-3 tnum，超限 text-1。
4. 浅色 [39] 的 `Select` 下拉三角 8×10 与 28px 框匹配；好。

### 3.8 欢迎 [11][12]

做对了：两栏（440 / 400）、居中 920；24px 标题；样例卡用真实 `Seal` + `CriteriaBar` + `Claim` 渲染；要点三行左 9em 标签；环境检查红方块 + 修复命令 chip；三个动作同行 `重新检查 · 试一个演示目标 · 添加一个 git 仓库`。

问题：
1. `✓ git version 2.56.0` 的勾用 text-2 而非绿（r1 §3.7.2 的裁定已执行，正确）。
2. 检查项 2 的 `pi` 命令 chip 孤悬右缘（§2.5）。
3. 英文界面出现中文后端消息（§2.5）。
4. 右栏标题 `环境检查` 13/500 与左栏 24px 标题的基线不齐（右栏首行 y=226，左栏 y=236）[11]。→ `.welcome-side { padding-top: 6px }` 或让右栏标题用 `--fs-reading` 14px 与左栏 lede 对齐。
5. 这个页面是唯一能放 wordmark 的地方，现在没有任何 Tower 的标识。→ 标题上方 10px text-3 的 `TOWER` 字距 .08em，或 16px 的自绘图标（不是 emoji，不是渐变方块）。

### 3.9 命令面板 [41]–[44][65]

做对了：40px 输入 + `›` 提示符；`最近 / 命令 / 目标` 分组；命令行左槽图标、目标行左槽生命周期字形 + 行尾 `◆` 与状态词；匹配高亮 text-1 500；28px 页脚 `↑↓ 移动 · ↩ 打开 · esc 关闭 · 共 11 项`；无匹配时两行提示 `没有与“zzzqq”匹配的结果 / 可以输入标题的任意片段，或中文的拼音首字母，如 gwc。`；遮罩 16%；键盘打开 0ms。

问题：
1. 拼音匹配落错了字：输入 `gwc` 两条结果都加粗了 `G-0003` 的 `G` 和 `物车`，`购` 是常规字重（[43] 放大后可见）。匹配器把 `g` 给了 id 的首字母而不是 `购`，所以高亮在告诉用户一个错误的理由。→ `fuzzy.ts` 对目标行先在标题内寻找连续的拼音首字母串（`购物车` 三字连续得分应高于 `G…物车` 跨段），id 只在标题无匹配时参与；或对 id 与标题分别打分取高者。
2. 占位符 `搜索目标与命令…（支持拼音首字母）` 27 字在 600px 里偏长；英文 `(pinyin initials work)` 对英文用户是噪音。→ 占位符只写 `搜索目标与命令…`，拼音提示留在无匹配状态（已有）。
3. 目标行的状态词 `待验收` 与 `◆` 之间 24px，`◆` 与标题之间弹性——`◆` 应贴近状态词（它修饰的是状态）。→ `gap: 6px`，`◆` 放在状态词前紧邻。

### 3.10 快捷键表与活动记录 [45][46][60][64]

做对了：760px 两栏；作用域标题 12/500 text-3；键帽右对齐；页脚说明 `单键在输入框里不生效；带 ⌘ 的组合键随时可用。`；活动记录空状态用环 + 两行文案；`全部复制 / 清空` 在无条目时禁用。

问题：
1. `1 9` 两枚键帽（§2.2）。
2. 活动记录标题行 `保留最近 200 条错误与警告，最新的在上面` 与两个按钮同行，按钮禁用态 text-3 与说明文字同灰同重，看不出是按钮 [60]。→ 禁用 ghost 按钮保留 `btn` 边框但 `border-color: var(--border-subtle)`。

### 3.11 Toast、空、加载、错误 [13][14][15][70][71]

做对了：toast 右下、10px 圆角、`■` 前缀、`打开`/`×` 动作、最多 2 条；启动失败页居中 560px，`■ Tower 无法启动` + 原因 + 等宽错误框 + `重试 / 打开数据目录` + 右侧数据目录路径；标题栏 `■ 1` 未读错误仪表。

问题：
1. 成功类 toast（`已暂停 G-0002`、`已复制`）与错误 toast 形态只差前缀；`toast-success` 没有前缀。→ 成功用 `✓` text-2 前缀（10px `check` 图标），信息类无前缀。
2. 启动失败页缺 `复制错误` 动作；错误文本可选中但没有按钮。→ 错误框右上角 `copy` 图标按钮。
3. 加载态 [15] 在 60ms 内已完成渲染，无法观察；代码里是 `· 载入中…`。对于 goal 页，`goal.loadingDetail`（`正在载入合同、标准与说法…`）是有内容的加载文案，好；但没有骨架，切换目标时内容区会从空白跳到满版。→ 目标页加载时保留 H1 行与区块标题（已知的数据）作为骨架，只有正文为空。

---

## 4. 距离 95 分还差什么：Top 30

影响：H = 阻断性或原则级；M = 单屏明显；L = 细节。量：S < 半天，M ≈ 1 天，L > 1 天。预期：完成第 1–10 项后 D6–D9 约 84–88；完成第 1–22 项后约 90–92；最后 8 项是"放大身份"，把它推向 95。

| # | 改动 | 文件 | 预期效果 | 影响/量 |
|---|---|---|---|---|
| 1 | 目标页右栏 ≤1280 折到主栏下方，两列摘要（§2.1 代码 1） | `app.css .goal-body/.rail` | 1100 宽可用；标准行拿回 ~370px | H / S |
| 2 | 改动行脱离 `.criterion-row` 网格，独立 `.changes-row`，`nowrap` + 省略 | `GoalPage.tsx:459`、`app.css` | 消除竖排与重叠 | H / S |
| 3 | 评审头部统计 `nowrap` + 省略，≤1240 先丢 pin 对 | `app.css .review-stats`、`Review.tsx:244` | 头部永远两行 | H / S |
| 4 | 标准行标题优先、命令可压缩（`min-width: 8em` / `max-width: min(340px,45%)`） | `app.css .criterion-title/.criterion-cmd` | 窄窗仍能读出标准名 | H / S |
| 5 | 决策卡统一 840：`.goal-decisions { max-width: 840px }`；`.quick` 同宽 | `app.css` | 三页同一右缘，问题句行长 ≤ 40 字 | H / S |
| 6 | `seg` 改实线 text-4；`—` 留空；`--st-active` 加彩度；`pending` 标记 text-3 空心环 | `tokens.css`、`app.css .seg/.result-*`、`GoalRow.tsx:56` | "没有"与"有"都可见；`◐` 可辨 | H / S |
| 7 | 字形余数：`↻ ‹ → ↔` 改图标 / 改词；`1–9` 单帽 | `GoalRow.tsx`、`Review.tsx`、`Trace.tsx`、`i18n.ts`、`ui.tsx Kbd` | 图标体系 100% 一支笔 | H / S |
| 8 | 单位与文案校对：`墙钟 31 / 90 分`、`rounds`、`resume`→`继续`、验收面板合并"已看"两行 | `i18n.ts`、`GoalPage.tsx BudgetMeter`、`Trace.tsx`、`Review.tsx` 验收面板 | D9 一致性 | H / S |
| 9 | 后端消息本地化：监督器返回 code + 参数，前端翻译 | `crates/tower-supervisor/src/lib.rs:457`、`lib/labels.ts` | 英文界面无中文泄漏 | H / M |
| 10 | 评审页真正全屏（隐藏侧栏）或头部跨侧栏 | `App.tsx`、`app.css .shell` | diff 宽 +260px；"空间切换"动效有了意义 | H / S |
| 11 | 引擎心跳 `· n 秒前`，>30s 变 text-1，>120s 危险 | `Chrome.tsx TitleBar`、`store.ts` 记录最近事件时间 | 安静≠死机 | M / S |
| 12 | 高亮同步路径（< 4k 字符）或着色完成前隐藏 | `lib/highlight.ts`、`Review.tsx:768` | 消除代码闪白 | M / S |
| 13 | 轨迹：分隔行时间内联；`花费更新` 仅事实筛选；注入消息不描边；状态跃迁 `A → B` | `Trace.tsx`、`app.css .trace-divider` | 轨迹密度 −20%，无错位 | M / S |
| 14 | 右栏"自主度"改三行键值 | `GoalPage.tsx` 右栏、`i18n.ts goal.autonomy*` | 右栏不再是文字墙 | M / S |
| 15 | 右栏范围围栏的 `dl` 不再挂全局 `.mono`，改 `rail-dl-code` 只染 `dd` | `GoalPage.tsx:729`、`app.css:1474` | 英文 `Include/Read-only` 回到 UI 字体 | L / S |
| 16 | 收件箱页脚改 11px 键帽行；待验收卡加提交说明一行 | `Inbox.tsx`、`DecisionCard.tsx`、`app.css` | 页脚像提示；两张卡有差异 | M / S |
| 17 | 禁用按钮：浅色主按钮用 `bg-selected` + text-3；ghost 禁用保留发丝边 | `app.css .btn-primary:disabled/.btn-ghost:disabled` | 浅色验收面板不再是灰胶囊 | M / S |
| 18 | 验证读数输出框：`… 还有 n 行 · 查看全部` 或功能性遮罩 | `Review.tsx` 验证面板、`app.css .verify-tail` | 不再硬切 | L / S |
| 19 | 验收面板分支名全显 + 复制按钮 | `Review.tsx`、`app.css .panel-branch dd` | 分支名可用 | L / S |
| 20 | 文件头五个文字按钮收敛：两个切换 + `⋯` | `Review.tsx` 文件头 | 文件头有主次 | M / S |
| 21 | 拼音匹配优先标题内连续命中（`购物车`），不借 id 的 `G` | `lib/fuzzy.ts` / `lib/pinyin.ts` | 高亮解释正确的命中理由 | L / S |
| 22 | 面板占位符去掉括号说明；`◆` 紧邻状态词 | `i18n.ts chrome.searchPlaceholder`、`Chrome.tsx` | 面板更安静 | L / S |
| 23 | 转向框发送后 `已送达 · 排在当前步骤之后` 2 秒回执；决策答复同理 | `GoalPage.tsx .steer`、`DecisionCard.tsx` | 每个人触发的动作都有回执 | M / S |
| 24 | 航班牌 ≤1240：实况列只留徽章 + 动作词；标题列 `1.6fr` | `app.css @media (max-width:1240px)` | 1100 下标题可读 | M / S |
| 25 | 编辑器右栏 ≤1280 折下、三档横排；文本区统一 `rows=2` | `ContractEditor.tsx`、`app.css .editor` | 1100 下编辑器不挤 | M / S |
| 26 | 欢迎页：wordmark / 图标；右栏标题与左栏基线对齐；修复命令一律另起一行 | `Welcome.tsx`、`app.css .welcome-side/.check-row` | 第一屏有身份 | M / S |
| 27 | 成功 toast `✓` 前缀；启动失败页 `copy` | `Chrome.tsx Toasts`、`App.tsx boot-failed` | 三类反馈可辨 | L / S |
| 28 | 目标页加载骨架：先画 H1 + 区块标题 | `GoalPage.tsx` | 切换目标不跳版 | M / M |
| 29 | 印章放大一档：评审头部与待验收卡用 13px `Seal`（已有 `.decision-readout-main .seal` 13px），目标页身份行右端用 13px；印章字形 12px | `Glyph.tsx Seal`、`app.css .seal` | "没有哈希就没有绿"成为看得见的签名 | M / S |
| 30 | 航班牌的"到达"动效扩展为唯一的签名动效：新行 `arrive` 160ms 之外，状态列变化时徽章词 100ms 交叉淡入（已有 `.glyph` opacity 过渡，扩到 `.mode-badge`） | `Live.tsx`、`app.css .mode-badge` | 出发屏"翻牌"的克制版 | L / S |

---

## 5. 与主流 harness GUI 的对比

对照对象与时间点：OpenAI Codex 桌面应用（2026-02 发布，Electron，"agent 指挥中心"：项目侧栏、线程、内置终端、代码评审面板、worktree 可视化）[^codex1][^codex2]；Claude Code 桌面重设计（2026-04-14：会话侧栏带状态筛选、拖放式窗格布局、内置终端与文件编辑器、重写的大改动 diff 查看器；2026-10-14 更新了会话启动页）[^cc1][^cc2]；Conductor（每工作区一个 worktree，聊天窗 + diff 窗 + 评审流，社区评价"更响应、不隐藏它在做什么"）[^cond1][^cond2]；Cursor 2.0（2025-10，agents-first 布局，右侧 agent 侧栏，文件以 pill 内联；2026-04 独立 agent 窗口"我们拥有全部像素"）[^cur1][^cur2][^cur3]；Linear 2026-03 界面刷新（重绘图标、侧栏调暗、头部统一）[^lin1][^lin2]；Raycast 2.0（2026-05 重写，Liquid Glass 克制使用，紧凑模式）[^ray1][^ray2]。

### 5.1 Tower 落后的地方

| 方面 | 它们 | Tower | 差距性质 |
|---|---|---|---|
| 布局鲁棒性 | Codex / Claude Code 的面板可拖放、可保存布局，窄窗下面板自动折叠 | 两条媒体查询；1100 宽断裂 | 工程完成度，不是理念 |
| 评审器能力 | Claude Code 重写的 diff 查看器面向大改动；Cursor 可按 agent 部分接受、独立撤销；Codex 可在 diff 上评论并在外部编辑器打开 | 单元列表 + 风险排序 + 行内批注 + 并排 + 整文件 + 已看；无按 hunk 接受/拒绝、无跨文件搜索 | 功能面；但 Tower 的"批注即转向"是同类没有的 |
| 环境材质 | Raycast 2.0 / Linear 刷新后的图标与材质经过数轮打磨；Codex 被多篇评测称"polished" | 平面、无材质；靠 1px 6% 边框与 0.025 明度差分层 | 可以是选择（Zed 也平面），但要做到位：第四灰可见、禁用态像原生 |
| 侧栏即工作台 | Claude Code 侧栏按运行中 / 等待 / 已归档筛选、按项目分组、PR 合并自动归档 | 侧栏按生命周期分组（需要你 / 运行中 / 待验收 / 就绪 / 已结束），无筛选、无按项目分组 | 多项目场景下会显出来 |
| 启动与空状态 | Claude Code 10 月更新专门做了"更快的会话启动页：最近文件夹、保存的环境、更清楚的进度提示" | 欢迎页两栏 + 环境检查，空概览一小块 | 空概览可以借鉴"最近 / 环境"两块 |
| 品牌 | Linear 的字体与图标系统、Raycast 的窗口形态都能被一眼认出 | 航班牌与印章是种子，但没有 wordmark，面板 / 标题栏 / 欢迎页都是通用形态 | 身份放大（§4 第 26、29、30 项） |

### 5.2 Tower 独有且应该坚持的地方

1. **没有聊天转录作为主界面。** Codex、Claude Code、Conductor、Cursor 的主画面都是一条对话流 + 一个 diff；Tower 的主画面是一块航班牌和一叠决策卡。这是"监督"与"结对"的根本区别，也是它看起来不像任何竞品的原因。
2. **诚实语法是版面结构，不是标签。** `┆ Agent 称` 来源边栏、`⚙ @pin` 事实后缀、虚线 `观测`、绿色只跟哈希一起出现——没有任何竞品在 UI 层区分"模型说的"与"验证器量到的"。Cursor 论坛里对 2.0 agents 视图的抱怨（"看不到代码在发生什么"）正是 Tower 的切入点[^cur3]。
3. **仪表列。** 每条验证结果落在同一组列里（结果 · 耗时 · pin · 时间）。Conductor 被称赞"不隐藏它在做什么"，但它呈现的是日志；Tower 呈现的是读数。
4. **琥珀纪律与 700ms 衰减。** 竞品用徽章、红点、动画 spinner 表达"需要你"；Tower 只有 28px 条头和一次衰减。这一条在截图里是安静的，在运行时是唯一会自己动的东西——应该被保护，不要加 spinner。
5. **键盘注册表驱动的 `?` 表与作用域。** 比手写的快捷键帮助更可信，也比 Raycast 的"全局 + 扩展"两层更贴近视图。
6. **中英双语与拼音首字母搜索。** 竞品均为英文优先；Tower 的中文不是翻译腔，拼音搜索是面向中文开发者的真实便利。

### 5.3 一句话定位

与 Codex / Claude Code / Conductor / Cursor 相比，Tower 在"面板灵活性、评审器功能面、材质打磨"上落后半代，在"信息架构的原创性、诚实语法、键盘纪律、中文"上领先一代。本轮剩下的工作是把落后的半代补齐（几乎全是 S 工作量），同时不要为了追它们而引入对话流、spinner 或材质装饰。

---

## 6. 附：本轮截图清单（`/tmp/audit-r2-design/`，未入库）

| 编号 | 内容 |
|---|---|
| 01–06 | 概览：深/浅 × 中/英 × 1440/1100 |
| 07–08 | 概览，12 个目标（`--many`），深中 / 浅英 |
| 09–10 | 空概览 |
| 11–12 | 欢迎页（无项目），深中 / 浅英 |
| 13–14 | 启动失败 |
| 15 | 加载（60ms，已完成渲染） |
| 16–19, 68 | 需要你：深中、浅英、1100 英、空、1100 中 |
| 20–22 | G-0002 运行中：深中、浅英、1100 深中 |
| 23–24 | G-0004 已暂停 |
| 25–26, 69 | G-0001 待验收（深中、浅英、1100 深中） |
| 27–29 | G-0003 待验收 + 假设卡（深中、浅英、1100 深英） |
| 30–34 | 评审：深中、浅英、1100 深中、G-0003 深英、G-0002 浅中 |
| 35–37, 66 | 合同编辑器：深中、浅英、1100 深英、浅中 |
| 38–40, 67 | 设置：深中、浅英、1100 深英、浅中 |
| 41–44, 65 | 命令面板：默认、浅英、拼音 `gwc`、无匹配、英文 `rev` |
| 45–46, 63–64 | 快捷键表：概览、浅英、目标页、评审页 |
| 50–51 | 评审并排 |
| 52 | 验证读数面板 |
| 53–54 | 验收面板，深中 / 浅英 |
| 55–56 | 要求修改，深中 / 1100 浅英 |
| 57 | `V` 标为已看后 |
| 58–59 | 轨迹（`W`），深中 / 浅英 |
| 60–62 | 活动与错误 |
| 70–71 | 错误 toast + 标题栏 `■ 1` |
| 72 | 12 目标概览 1100 深中 |
| real-overview.png | `tools/screenshot.sh` 实机抓取（锁屏，空窗，仅作记录） |

[^codex1]: Verdent, "Codex App First Impressions (2026): Polished Parallel Agents, but Not a Full IDE Yet", https://www.verdent.ai/guides/codex-app-first-impressions-2026
[^codex2]: DEV Community, "OpenAI shipped a Codex macOS app: multi-agent threads + built-in git worktrees", https://dev.to/damogallagher/openai-shipped-a-codex-macos-app-multi-agent-threads-built-in-git-worktrees-3aoh
[^cc1]: Anthropic, "Redesigning Claude Code on desktop for parallel agents", https://claude.com/blog/claude-code-desktop-redesign
[^cc2]: VentureBeat, "We tested Anthropic's redesigned Claude Code desktop app and 'Routines'", https://venturebeat.com/orchestration/we-tested-anthropics-redesigned-claude-code-desktop-app-and-routines-heres-what-enterprises-should-know
[^cond1]: Conductor, https://www.conductor.build/
[^cond2]: Augment Code, "Conductor vs Intent (2026): macOS Agent Orchestrators", https://www.augmentcode.com/tools/intent-vs-conductor-macos-agent-orchestrators
[^cur1]: Prismic, "Cursor AI Review (2026)", https://prismic.io/blog/cursor-ai
[^cur2]: Lee Robinson on X, "Meet the new Cursor…", https://x.com/leerob/status/2039771986180649010
[^cur3]: Cursor Forum, "Cursor 2.0 'Agents View' – What's the point?", https://forum.cursor.com/t/cursor-2-0-agents-view-whats-the-point/140094
[^lin1]: Linear, "How we redesigned the Linear UI (part II)", https://linear.app/now/how-we-redesigned-the-linear-ui
[^lin2]: Linear Changelog, "Mobile app redesign" (2025-10-16), https://linear.app/changelog/2025-10-16-mobile-app-redesign
[^ray1]: Raycast, "The New Raycast", https://www.raycast.com/blog/the-new-raycast
[^ray2]: Raycast Changelog 1.103.0 "macOS Tahoe Ready", https://www.raycast.com/changelog/1-103-0 ；Raycast Manual "New in v2", https://manual.raycast.com/new-in-v2
