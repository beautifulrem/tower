## Tower 前端设计评审：第 10 轮（`deef352`，对照 `7a23f45`）

> 文中 `$R` 指 `/tmp/tower-design/review10`。所有截图、日志和临时 spec 都在这个目录下。

**结论：PASS。** 加权得分 **8.20/10**，不低于 8.0，没有未关闭的 P0 或 P1。但这一轮引入了 1 个 **P2**，建议在下一轮之前修掉。

- **核心修复成立**
  - **R9-P3-01 / 02：** 评审头改成按测量让位后，en/zh、G-0001/G-0003、对比和普通模式，1024–1600 每 4px 扫一遍，裁决（封印加标准条）在任何宽度下都完整。没有抖动，没有来回切换，快捷键提示一直都在。
  - **R9-P3-04 / 05 / 07：** 已修好。
  - **R9-P2-01：** 主体修好了。目标页印章、看板和命令面板的字形都保留了“有保留”。
- **新的 P2（R10-P2-01）：** 重叠提示挪进标题格以后，重叠行的标题被挤短。
  - 1241 宽时 en 标题只剩 27px（“Fi…”），zh 只剩 14px。
  - 1440 宽时长标题从 252px 降到 143px。
  - 同一行的 Identity 列现在是空的。
- **其余：** 5 条 P3。分布是：
  - 修复不完整 2 条：accepted/integrated 的 tooltip，以及亮色台账。
  - 本轮引入的 docs/12 不一致 1 条。
  - 既有问题 2 条：运行选择框的读屏值和界面显示不一致；zh 界面里运行名是英文。

**评审范围**
- **环境**
  - worktree `/tmp/tower-design/wt-review10`（`deef352`），对照 `/tmp/tower-design/wt-review10-base`（`7a23f45`，已删除）。
  - Playwright WebKit，Tauri IPC 用 stub。fixtures 是 `/tmp/tower-design/fixtures{,-zh}`。端口 1441 和 1442，1443 没有用到。
- **字体**
  - 按规定命令跑时，字体请求被拒（403）。
  - 所以测量和截图都跑在 `$R/tools/vite.review.config.mjs` 上：只是把主 checkout 的 node_modules 加进 `fs.allow`，生产配置原样导入。每个测试都确认过 `document.fonts.check` 为 true。
- **清理**
  - 临时 spec 存在 `$R/checks/specs/{wt-review10,wt-review10-base}/`，已从两个 worktree 删除。`dist/` 和 `test-results/` 已删除。
  - 对照 worktree 已用 `git worktree remove --force` 删除。1441 和 1442 上的 vite 已停，1441–1443 上没有服务在监听。
  - `git -C /tmp/tower-design/wt-review10 status`：HEAD 仍是 `deef352`，只剩 `node_modules` 和 `apps/desktop/node_modules` 两个符号链接。

---

## 加权评分

| 维度 | 权重 | 分数 | 理由 | 加权 |
|---|---|---|---|---|
| 产品适配 | 15% | 8.5 | 验收后的长期记录（目标页印章、看板/面板字形）保留了“有保留”。扣分：同一个已验收目标，在 peek、评审头、验证读数的 tooltip 里仍写“验收前先看过它们”；integrated 的字形不带缺角（R10-P3-01）。 | 1.275 |
| 信息架构与工作流 | 20% | 8.0 | 重叠用文字写在本行 ID 之后，不会再被读成本行编号；修订合同时，折叠摘要写出所有非默认项。扣分：重叠行的标题被挤到 1–5 个字，Identity 列却空着（R10-P2-01）。 | 1.600 |
| 视觉层级 | 15% | 8.5 | 裁决在 1024–1600 的任何宽度都在，让位顺序符合设计：pins → 计数 → 间距 → 选择框的 pin。扣分：看板重叠行的标题不再是这一行的视觉锚点。 | 1.275 |
| 原创性与产品身份 | 15% | 8.0 | `●*` 落地了：印章和字形的缺角一致。缺角在 stamp 尺寸下仍然很难看出来（沿用第 9 轮的记录）。 | 1.200 |
| 工艺与排版 | 10% | 8.0 | “$” 和单位都不再压数字，单位宽度按测量来。扣分：亮色主题下，台账的运行标注和 agent 原话几乎同色，读起来像原话折了一行（R10-P3-03）；看板上出现 “Fi…”。 | 0.800 |
| 密度与克制 | 10% | 8.5 | 摘要逐项写出非默认项，没有多余装饰。修订时摘要最多 5 行，可以接受。 | 0.850 |
| 交互 | 10% | 8.0 | 快捷键提示恢复，tooltip 写快捷键；选择框能用键盘到达，焦点环清楚。扣分：“比较终点”的原生 select 实际选中的是 Base，界面却写 Latest（R10-P3-02）。 | 0.800 |
| 设计系统一致性 | 5% | 8.0 | 第 9 轮的三处文档不一致已对齐。扣分：新写的“中性药丸”和代码里的琥珀底药丸不一致（R10-P3-04）。 | 0.400 |
| **合计** | 100% | | | **8.20** |

---

## 第 9 轮问题逐项核实

| 问题 | 判定 | 证据 |
|---|---|---|
| **R9-P2-01** 已验收的有保留目标 | **大部分修复** | **已修好的部分**（en/zh × 亮/暗）：<br>• 目标页印章写 “Verified, with caveats / 已验证（有保留）”，实心圆切角（`path d="M9.25…"`）。<br>• 印章 tooltip 写 “…You accepted it with them / 你是带着这些保留验收的”。<br>• 看板行和命令面板的字形是 `●*`，aria 为 “Accepted, Verified, with caveats”。<br>• 页面 0 个 pageerror。<br>**遗漏的部分**见 R10-P3-01：peek、评审头、验证读数的 tooltip 仍写 “Look at them before you accept”；integrated 的 `◉` 不带缺角。<br>证据：`$R/honesty/deef352/log-{accepted,integrated}-*.txt`、`accepted-marks.png`、`accepted-goalheads.png`、`accepted-peek-*.png` |
| **R9-P3-01** 对比时裁决最后让位 | **已修复** | **扫描范围：**1024–1600 每 4px，正反两个方向，8 个组合（en/zh × G-0001/G-0003 × 对比/普通）。<br>**结果：**<br>• 封印和标准条在所有宽度下都完整（`lost: []`）。<br>• 正向和反向扫描在同一宽度下的 class 完全一致（hysteresis 0）。<br>• 每档稳定后等 250ms，`class` 都没有变化（idle churn 0）。<br>• 没有 ResizeObserver 报错。<br>**对照 `7a23f45`：**en G-0001 在 1024–1096 和 1244–1336 丢失裁决，en G-0003 在 1244–1356 丢失。<br>证据：`$R/sweep/{deef352,7a23f45}/sweep.txt`、`$R/sweep/sbs-G-0001-compare-en.png`<br>**只做记录：**让位不随宽度单调变化。比如 zh G-0003 对比时，1160–1240 还显示 “+11 −1”，1244–1340 反而整组藏起（`counts-off`）。en G-0003 只在 1280 一档加了 `tight`。都是稳定状态，不算抖动。 |
| **R9-P3-02** 快捷键提示和 tooltip | **已修复** | 8 个组合下，所有宽度都显示 2 个键帽（`kbdHidden: []`）。旧 commit 在 ≤1240 的所有模式下都藏起键帽。<br>tooltip 分别是 “Request changes C” 和 “Accept ⌘⇧↩”。`keys-off` 在所有 fixture 里都没有被触发。<br>证据：`$R/sweep/sbs-plain-1040.png` |
| **R9-P3-03** 台账运行标注 | **部分修复** | **已改：**标注换成单独一行，放在声明下面，class 为 t3。<br>**暗色可以区分：**原话 0.86，标注 0.72。<br>**亮色几乎不可分：**原话 text-2 是 `oklch(0.43)`，标注 text-3 是 `oklch(0.47)`，同为 12px、常规字重。放在下一行后，看起来像 agent 原话折到了第二行。见 R10-P3-03。<br>证据：`$R/ledger/deef352/log-*.txt`、`$R/ledger/zoom-runs-all.png` |
| **R9-P3-04** 测试机制哨兵 | **已修复** | 按真实哨兵构造了 5 组数据：`source_touches_tests`、`runner_patched`、`source_patches_tests`、加上 `assertion_identity_unchecked` 的组合、只点名 C1 的。en/zh 下：<br>• 证据条写 “code reaches into the test runner”（touches），或 “runner patched”（另外两种）。<br>• 目标页和验证读数里，都不再出现 “assertions untouched”。<br>**只做记录：**如果哨兵 detail 只点名 C1，C2 仍写 “assertions untouched”。这是按标准逐条判断的结果，不算错。<br>证据：`$R/evidence/deef352/log-*.txt`、`touches-goal-en-top.png` |
| **R9-P3-05** 修订合同时的折叠摘要 | **已修复** | 修订时折叠仍是关着的。摘要 9 项，每项都在一行内，en/zh × 亮/暗 × 1040/1440/1800 都一样，例如 “Thinking level high · Escalates to … · Ports 5432, 6379 · Loopback open”。<br>新建合同时，摘要只有 “Pi / Default OS Sandbox / No network / Autonomy Standard”。<br>证据：`$R/contract/deef352/log-*.txt`、`$R/contract/amend-summary-stack.png` |
| **R9-P3-06** 看板重叠提示 | **语义已修复，带出新的 P2** | Identity 列不再出现别的目标的 ID。提示写成 “◇ Overlaps G-0003 / ◇ 与 G-0003 改动重叠”，放在本行 ID 之后。≤1240 时提示消失，标题 tooltip 写 “Overlaps G-0003: src/cart.js”。<br>代价是标题被挤短，见 R10-P2-01。<br>证据：`$R/board/{deef352,7a23f45}/log-*.txt` |
| **R9-P3-07** “$” 压数字 | **已修复** | 所有单位都不再压数字：`$` 和数字之间留 4px；min、rounds、秒、分、次、“s to reach / 秒内可访问”（填到 1200）、设置页的“个”都检查过。<br>折叠里的字段在展开时会重新测量：`--unit-w` 从空变成 40px。<br>证据：`$R/dollar/sbs-budget-en-light.png`、`$R/contract/units-stack.png`、`units-*.txt`、`timeouts-*.txt` |
| **docs/12 三处** | **已对齐，带出 1 处新的不一致** | • `●*` 现在和代码一致。<br>• §12.4.4 只列 4 个 diff 令牌，和 `tokens.css` 一致；评论竖条确实是 `inset 2px … var(--st-attention)`（`app.css:3155`、`4870`）。<br>• 新的不一致：文档写保留以“中性药丸”出现在证据条上，代码画的是琥珀底，见 R10-P3-04。 |

---

## 诚实语法

| 规则 | 判定 | 证据 |
|---|---|---|
| 绿色只给验证器的结果 | **成立** | 台账 `greens: []`，agent 原话不是绿色。<br>已验收目标的看板行里，绿色只出现在字形和标准条的已验证段。accept 弹层里只有印章圆是绿色。<br>证据：`$R/honesty/deef352/log-*.txt` 里的 greens 行、`$R/ledger/deef352/log-*.txt` |
| 琥珀 ◆ 只表示“需要你 / 先看这里” | **成立** | ◆ 只出现在决策行、不作数的封印和需要判断的项上。测试机制保留用的是琥珀底药丸，没有 ◆，意思是“先看这里”，没有被当成证据。它和文档的说法不一致，见 R10-P3-04。 |
| 中点只用在标准条和预算行 | **成立** | 11 个状态 × en/zh 都扫过，包括对比模式和修订折叠。文本节点和 CSS 伪元素里，其他位置都是 0 处。<br>证据：`$R/dots/deef352/log.txt` |
| 有保留的通过：in_review | **一致** | 决策行、peek、目标头、评审头、验证读数、accept 弹层（“仍然验收”，按两次）、命令面板，都写“已验证（有保留）”，圆环或实心圆都有缺口或缺角。 |
| 有保留的通过：accepted / integrated | **基本一致，2 处遗漏** | **一致：**词和缺角在所有界面都一致。<br>**遗漏 1：**peek、评审头、验证读数的 tooltip 仍用“验收前先看过它们”的说法。<br>**遗漏 2：**integrated 的看板和面板字形是完整的 `◉`，aria 只写 “Merged”，而它的印章写“有保留”。<br>见 R10-P3-01。 |

---

## 回归检查（对照 `7a23f45`）

- **覆盖面：**15 个状态 × en/zh × 亮/暗 × 1040/1440/1800，每个 commit 180 张截图。状态包括：看板、收件箱、两个目标页、评审页、对比模式、accept 弹层、两个 peek、修订合同、Operations、Learning、设置、新建合同、欢迎页。
- **基本情况：**两个 commit 都是 0 个 pageerror，0 个元素越出窗口。
- **像素差异：**47 张完全相同，其余差异逐一归因：
  - 时间读数：“6h 59m” 和 “6h 58m” 这类。
  - 评审头：恢复了键帽；选择框面板；对比时计数让位。
  - 修订和新建合同：“$” 和单位的间距。
  - G-0003 台账：运行标注换行。
  - G-0001 证据条多了一个 “runner patched” 药丸，这是 D102 有意为之。
- **没有发现意外退化。**唯一的退化 R10-P2-01 在 fixture 的“待评审”看板行上才看得到：enrichRich 把 G-0001 放进了决策行，所以回归截图里没有它，是用 `$R/board` 的专项测试测出来的。
- **证据：**`$R/regress/{deef352,7a23f45}/`、`log.txt`、`p-*.png`，差异脚本在 `$R/tools/diff.py`。

---

## 新问题清单

### P0、P1

无。

### [R10-P2-01] 重叠提示挤占标题格，重叠行的标题被压到 1–5 个字（本轮引入，D104）

- **重现：**看板，G-0001（和 G-0003 改动重叠），窗口宽 1241–1440。
- **现象**（`标题可见宽 / 标题全宽`，单位 px）：

  | 情形 | `deef352` | `7a23f45` |
  |---|---|---|
  | demo 标题，en，1241 | 27/100，显示 “Fi…” | 100/100 |
  | demo 标题，en，1280 | 52 | 100 |
  | demo 标题，zh，1241 | 14 | 119 |
  | demo 标题，zh，1366 | 88/119，被截断 | 119 |
  | 长标题，en，1440 | 143 | 252 |
  | 长标题，zh，1366 | 88 | 210 |
  | 长标题，1800 | 164 | 272 |

  - 1240 宽时提示被藏起，标题反而有 251px。也就是说，窗口宽 1px，标题少了 224px。
  - 与此同时，Identity 列在这一行是空的。
- **证据**
  - `$R/board/sbs-demo-en-light-1241.png`（上为旧 commit，下为本轮）
  - `$R/board/sbs-long-zh-CN-dark-1366.png`
  - `$R/board/{deef352,7a23f45}/log-*.txt`
- **原因**
  - `GoalRow.tsx:84-91` 把 `.g-overlap` 放进标题格。
  - `console.css:270-277` 给它设了 `flex: none; white-space: nowrap`，宽约 103/116px。
  - `.g-title` 是 `flex: 0 1 auto`（`console.css:286`），只有它能被压缩。
  - 1241–1560 宽时，标题列是 `minmax(12em, 1.4fr)`（`app.css` ≥1241 的 grid）。
- **为什么是 P2**
  - 看板是主界面，标题是一行的主要标识，任何有重叠的目标在 1241 以上都会受影响，最常见的 1280 和 1366 尤其严重。
  - 不定为 P1：本行 ID 紧挨着、仍然可见，标题在 tooltip 和 peek 里也能看到，也没有说错任何事情。
- **修正目标**
  - 标题至少保留约 12em 的可读宽度（比如给 `.g-title` 设 `min-width`），提示先让位。
  - 或者在标题格放不下时，只画 `◇` 加 ID，完整文字放进 tooltip；也可以回到 Live 或 Identity 列，但要写成文字。
  - e2e 补上：重叠行在 1241/1280/1366/1440 下，标题可见宽度不少于无重叠时的某个比例。

### [R10-P3-01] 已验收或已合入的有保留目标：三处 tooltip 仍写“验收前先看过它们”，integrated 字形不带缺角（D98 修得不完整）

- **重现：**带 `progress.qualified` 的 G-0003，状态设为 accepted 或 integrated，打开 peek、评审页（R），再按 `e` 打开验证读数。
- **现象**
  - 三处封印的 title 都是 “Counts as verified on @15085f2, with caveats: … Look at them before you accept. / …验收前先看过它们。”
  - 同一个目标在目标页印章上写 “You accepted it with them”。
  - integrated 时，看板和命令面板的字形是完整的 `◉`，aria 只写 “Merged / 已合入”，而印章和 peek 写“有保留”。
- **证据：**`$R/honesty/deef352/log-{accepted,integrated}-{en,zh-CN}-*.txt` 的 peek、review head、verify 行，以及 `accepted-marks.png`。
- **原因**
  - `Seal` 的 `sealTitle` 不知道目标的状态（`Glyph.tsx`）。`PeekDrawer.tsx:99`、`Review.tsx:519`、`review/panels.tsx:74` 都没有传入完成态。
  - `LifecycleGlyph` 的 `qualified` 只认 in_review 和 accepted（`Glyph.tsx:60`），integrated 分支（`:160`）没有缺角。
- **为什么是 P3：**词和缺角是对的，只有 tooltip 末句说错了时态，加上一个较少见的状态。
- **修正目标**
  - `Seal` 也接受 `accepted`（或按 `state` 选 `qualifiedDoneTitle`）。
  - 决定 integrated 是否画 `◉*`，并写进 docs/12 的字形表。
  - e2e 覆盖 peek、评审头、验证读数。

### [R10-P3-02] “比较终点”选择框：界面写 Latest，原生 select 实际选中 Base（既有问题，本轮改变了表现）

- **重现：**评审页，点 Compare runs。
- **现象**
  - 面板写 “Latest @15085f2”，统计行的 pin 也是 @69a9769→@15085f2。
  - 原生 select 的值却是 `69a9769…`（`selectedIndex 0`），无障碍树是 `combobox "Compare to": option "Base @69a9769" [selected]`。
  - 所以读屏会念 “比较终点，Base @…”，打开菜单时勾在 Base 上。
  - `7a23f45` 上，这个错是所有人都能看到的：两个框都显示 “Base @69a9769”（`$R/sweep/sbs-G-0001-compare-en.png` 第 1、3、5 行）。新的面板只对视力正常的用户遮住了它。
  - 另外，两个快照的 rev 相同时（“Run #1 start” 和 “Run #2 start”，“Latest” 和 “Verified”），选第二个，面板会显示第一个的名字。
- **证据：**`$R/picker/{deef352,7a23f45}/values.txt`、`$R/picker/deef352/log.txt`
- **原因**
  - `Timeline.tsx:96` 写的是 `<select value={props.value}>`，`<For>` 生成的 option 在设置 value 之后才插入。Solid 不会在插入 option 后重新设置 value，所以浏览器默认选中第一项。
  - `Timeline.tsx:85` 按 rev 找名字，找到的总是第一个。
- **其余检查都通过**
  - 从 Compare 标签按 Tab，依次到“比较起点”“比较终点”和 diff 行按钮。
  - 焦点环是 1.5px 实线，`:focus-visible` 为 true，亮色和暗色都清楚。
  - combobox 的名称正确，5 个选项的名字都完整，点击面板就是点到 select。
  - 证据：`$R/picker/deef352/zoom-focus-*.png`
- **为什么是 P3：**比较范围本身是对的，错的是读屏和打开的菜单。
- **修正目标**
  - 在 option 渲染之后再设置 value，或者给 option 设 `selected={s.rev === props.value}`。
  - option 的 value 用唯一键，不要用 rev。
  - e2e 断言 `select.value` 和面板一致。

### [R10-P3-03] 亮色主题下，台账的运行标注和 agent 原话几乎同色，像原话折了一行（R9-P3-03 部分修复）

- **现象**
  - 亮色：原话 `oklch(0.43)`，标注 `oklch(0.47)`，同为 12px、常规字重、左对齐。“C1 npm test passes locally / runs 1, 2” 读起来是一段话。
  - 暗色：0.86 和 0.72，能分开。
- **证据：**`$R/ledger/zoom-runs-all.png`、`$R/ledger/deef352/log-en-light.txt`
- **原因**
  - 亮色的 `--text-2` 和 `--text-3` 只差 0.04（`tokens.css:212-213`）。
  - 测试断言的是“颜色不等”，没有断言“看得出来不同”。
- **修正目标：**用形态区分，不要只靠颜色。比如 11px 并缩进到声明文字下方，或者加前缀（“第 1、2 次运行都这样说”），或者放到行尾单独一格。

### [R10-P3-04] docs/12 说保留是“中性药丸”，代码画的是琥珀底；同一个保留在不同来源下色调和措辞都不同（本轮引入，D106）

- **现象**
  - docs/12 §12.5.2（第 249 行）写“以中性药丸出现在对应标准的证据条上”。
  - 实际上，“code reaches into the test runner / runner patched” 是 `ev-pill-attn` 琥珀底；“flaky” 是中性。
  - “断言未检查”如果来自金丝雀是中性，来自哨兵就是琥珀。
  - 印章 tooltip 统一写“代码触及测试运行器”，证据条对 `runner_patched` 和 `source_patches_tests` 却写“运行器被修补”。
- **证据：**`$R/evidence/touches-goal-en-top.png`、`$R/regress/p-goal1.png`
- **原因：**`views/goal/ext.ts:153-160` 的色调是 `"attn"`，`workbenches.css:124` 给它画琥珀底。
- **修正目标：**二选一，改文档或改代码，让同一种保留在证据条上只有一种色调、一套措辞。

### [R10-P3-05] zh 界面的运行选择框写英文：“Base / Latest / Run #1 start / Verified”（既有问题）

- **现象：**zh supervisor 导出的快照标签是英文，前端的兜底标签也是英文。D51/D86 声称“zh 界面没有 supervisor 英文”，这里漏了。
- **证据：**`$R/picker/deef352/focus-zh-CN-dark.png`、`$R/sweep/deef352/G-0003-compare-zh-CN-1440.png`
- **原因**
  - supervisor 写死了英文：`crates/tower-supervisor/src/edits.rs:171,203`、`crates/tower-git/src/timeline.rs:50,82`。
  - 前端 `Timeline.tsx:18-21` 的兜底标签也是英文：`base @`、`R-01 @`、`Current @`、`Last review @`。
- **修正目标：**supervisor 只给出 kind、run_no 和 pin，由前端用词典拼出名字。

### 只做记录，不计入

- 评审头的让位不随宽度单调变化：zh G-0003 对比时，1240 宽显示计数，1244 宽反而不显示。plain zh G-0001 的 pins 在 1244–1296 之间藏、显、藏，旧 commit 也是这样。
- en 1440 对比时，计数整组让位，标准条后面还空着约 160px。
- zh 的重叠 tooltip 用的是 ASCII 冒号（“与 G-0003 改动重叠: src/cart.js”）。zh 的 aria 拼接用 “, ”（“已验收, 已验证（有保留）”），和既有写法一致。
- 带 C1 点名的 `source_touches_tests` 哨兵，会让 C2 写“断言未被改动”。这是按标准逐条判断，可以接受。

---

## 新增 e2e 是否测到了它声称的东西

- **数量**
  - webkit 测试标题从 429 条变成 442 条：新增 15 条，替换 2 条，另外修改了 1 条（台账）。
  - vitest 从 230 变成 233（GoalDeck 新增 3 条）。
  - 对照文件：`$R/checks/e2e-titles-{7a23f45,deef352}.txt`
- **在 `7a23f45` 上跑：**选中 17 条，13 条失败，4 条通过（`$R/checks/new-e2e-on-7a23f45.log`）。
  - **失败原因正确的：**
    - 摘要缺少非默认项。
    - 1241 宽时找不到 `.g-title-cell .g-overlap`。
    - 印章写 “Verified”，不是 “Verified, with caveats”。
    - en G-0003 在 1248–1344 丢失裁决，en G-0001 在 1024–1088 和 1248–1336 丢失。
    - 1024 宽时键帽是 hidden。
  - **失败原因不对的（2 条）：**单位测试（`.field-unit` 不存在，“no unit”）和台账测试（`.ledger-runs` 不存在）都是因为 class 改名才失败。<br>我把它们改成不依赖 class 名的写法，在 `7a23f45` 上重跑，都因为正确的原因失败（`$R/checks/new-e2e-variants-on-7a23f45.log`）：<br>• `"$" 974..982 over text 978..1082`，以及 min、rounds 压字。<br>• 标注颜色 0.43，测试期望 0.47。<br>所以这两条测试的判断逻辑是有效的。
  - **4 条通过的：**
    - zh 的两条扫描：第 9 轮已经修好 zh，符合作者说的“两个 en 目标在旧 commit 上失败”。
    - 新建合同的默认值：守卫测试，本来就应该通过。
    - “unit stays clear (settings, en)”：**这条是空测**。en 设置页根本没有 `.unit-wrap`（`$R/contract/deef352/units-en-*.txt` 的 settings 为空），真正带单位“个”的 zh 设置页没有测到。
- **vitest：**新增 3 条里，2 条在 `7a23f45` 上失败（touches、runner）。`source_patches_tests` 那条通过，因为旧版本的匹配规则本来就包含它。日志：`$R/checks/new-vitest-on-7a23f45.log`。
- **覆盖缺口**
  - 重叠测试只检查提示可见、在格内，不检查标题还剩多少宽，所以漏掉了 R10-P2-01。
  - 已验收测试只看印章和字形，漏掉了 peek、评审头、验证读数的 tooltip，也没测 integrated（R10-P3-01）。
  - 选择框测试只检查面板非空，没检查 select 的值和面板一致（R10-P3-02）。
  - 台账测试只比较颜色是否“相等”，漏掉了亮色下实际看不出差别（R10-P3-03）。

## 工程检查（日志在 `$R/checks/`）

| 检查 | 结果 | 日志 |
|---|---|---|
| `pnpm check/test/build` | pnpm 自动安装失败，报 “workspace hoist directory is not a real directory”，原因是 node_modules 是符号链接。所以直接调用同样的二进制，和 package.json 脚本等价。 | `pnpm-attempt/check.log` |
| tsc | EXIT=0 | `tsc.log` |
| vitest | 43 个文件，233 个测试，全部通过 | `vitest.log` |
| vite build | 通过 | `build.log` |
| bundle-budget | 通过，**合计 160,896 / 163,840**，余 2,944 B（第 9 轮是 160,049）。<br>启动 55,129 / 65,536（单一语言 3,472），按需 105,767 / 110,592，目标页 11,588 / 12,288，worker 197,901 / 262,144。 | `bundle-budget.log` |
| line-limit | EXIT=0 | `line-limit.log` |
| doc-numbers | EXIT=0 | `doc-numbers.log` |
| Playwright 全量，按规定命令（端口 1441） | 362 通过，**4 失败**，76 跳过，1.5 分钟。<br>4 条失败都在 smoke.spec，原因是字体请求被拒（403）：字体文件不在 Vite 的服务允许范围内，因为 node_modules 是符号链接。这是环境问题，第 9 轮也一样。 | `e2e-full.log` |
| Playwright 全量，用能提供字体的 vite 配置 | **366 通过，0 失败**，76 跳过，1.4 分钟。和作者声称的 366/0 一致。 | `e2e-full-fonts.log` |

## 没能覆盖的

- **原生应用：**按规则没有运行打包好的应用，也没有跑 cargo。看到的都是 WebKit 加 stub IPC 的结果，数据都是注入 fixture 的，没有让真实 supervisor 产生 accepted 有保留的状态。
- **原生 select 菜单：**headless 下拍不到打开后的菜单。选项是否完整，是从 DOM 和无障碍树读出来的。
- **读屏：**没有做 VoiceOver 实测，结论来自无障碍树。
- **生产构建：**这一轮没有在生产构建（vite preview）上跑 e2e，1443 没有用到。shots 和 perf 项目没跑。
- **其他**
  - 设置页“个”字段里填两位数的情况没测：当前内容区宽 14px，“4” 宽 8px。
  - 看板宽度只取了 11 档采样，没有逐档扫描。评审头只扫到 1600。
  - Tab 顺序只验证到选择框附近。

## 验收条件

**通过。**没有必须先解决的问题。建议按这个顺序修：

1. **R10-P2-01**（本轮引入，影响主界面）：标题格要给标题留出最小可读宽度，e2e 加上标题宽度的断言。
2. **R10-P3-01、R10-P3-02**：一个是给 `Seal` 补上完成态并决定 integrated 的字形，一个是在 option 渲染后再设 select 的值。都是小改，各自补 e2e。
3. **R10-P3-03、R10-P3-04**：台账标注改用形态区分；证据条药丸的色调和措辞，与 docs/12 统一一种说法。
4. **R10-P3-05**（既有）：快照标签改由前端本地化。可以和 D51/D86 的 zh 覆盖面一起补上。