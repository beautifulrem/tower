## Tower 前端设计评审：第 11 轮（`2f1d0c5`，对照 `deef352`）

> 文中 `$R` 指 `/tmp/tower-design/review11`。所有截图、日志和临时 spec 都在这个目录下。

**结论：PASS。** 加权得分 **8.38/10**，不低于 8.0。没有未关闭的 P0、P1，也没有 P2。第 10 轮的 1 个 P2 和 5 个 P3 都已修好，这一轮新增 4 条 P3。

- **核心修复成立**
  - **R10-P2-01：** 重叠提示不再挤占标题。
    - 1241 宽：en 标题 100/100（上轮 27），zh 119/119（上轮 14），长标题 144px（上轮 en 27、zh 14）。
    - 悬停、选中、实时改标题，都不会让提示在 `◇` 和文字之间来回切换。
  - **R10-P3-01：** 已验收、已合入的有保留目标，四处印章的提示都改成“你是带着这些保留验收的”。integrated 的字形是 `◉*`。
  - **R10-P3-02 / 05：** 运行选择框的原生 select、面板文字和 tooltip 三者一致；zh 下运行名是中文。
  - **R10-P3-03：** 台账标注改成 11px，写作“第 1、2 次运行都这样说”。
  - **R10-P3-04：** 单一哨兵引起的保留，证据条上是中性药丸，用词和印章相同。
  - 上轮指出的空测已修：改测 zh 设置页，并要求页面上至少有一个带单位的字段。
- **新问题（4 条 P3）**
  - **R11-P3-01（本轮引入）：** 提示始终给悬停才出现的 peek 按钮预留 26px。结果在 1440（zh）、1728（en，G-0003）这类常用宽度，整行明明放得下，提示也只剩一个 `◇`；`deef352` 在这些宽度上标题和文字都是完整的。同一对重叠的两行写法也不一样。
  - **R11-P3-02（部分本轮引入）：** 通过被扣留（印章写“通过但不作数”）时，证据条上可能只有一个中性的“保留”药丸，真正扣留它的高危发现没有出现在这一行。
  - **R11-P3-03（部分本轮引入）：** 选择框刷新或切换范围后，选过的同 rev 名字会回到默认。终点 rev 离开列表时，面板变成空白（这一点是既有问题）。
  - **R11-P3-04（既有）：** 看板的实况列把 “Verified” 硬切成 “Verifi”，标识列从左侧被硬切。本轮把标题列下限提到 16em，1241–1277 宽时标识列又少了 23px。

**评审范围**
- **环境**
  - 评审 worktree：`/tmp/tower-design/wt-review11`（`2f1d0c5`）。对照 worktree：`/tmp/tower-design/wt-review11-base`（`deef352`，已删除）。
  - Playwright WebKit，Tauri IPC 用 stub，fixtures 为 `/tmp/tower-design/fixtures{,-zh}`。
  - 端口：评审用 1441，对照用 1442，1443 没有用到。
- **字体**
  - 按规定命令运行时，字体请求被拒（403），和上轮一样。
  - 所以测量和截图都跑在 `$R/tools/vite.review.config.mjs` 上。它只是把主 checkout 的 node_modules 加进 `fs.allow`，生产配置原样导入。
- **清理**
  - 临时 spec 存放在 `$R/checks/specs/{wt-review11,wt-review11-base}/`，已从两个 worktree 删除；两边的 `dist/` 和 `test-results/` 也已删除。
  - 对照 worktree 已用 `git worktree remove --force` 删除，`git worktree list` 只剩主 checkout 和 wt-review11。
  - 1441 和 1442 上的 vite 已停止，1441–1443 上没有服务在监听。
  - `git -C /tmp/tower-design/wt-review11 status`：HEAD 是 `2f1d0c5`，只剩 `node_modules` 和 `apps/desktop/node_modules` 两个符号链接。
  - 说明：vitest 通过符号链接，把缓存写进了主 checkout 里已有的 `node_modules/.vitest-cache`。这个目录被 git 忽略，作者的运行也在用。主 checkout 的 `git status` 只有原本就有的 `.claude/`。

---

## 加权评分

| 维度 | 权重 | 分数 | 理由 | 加权 |
|---|---|---|---|---|
| 产品适配 | 15% | 8.5 | 已验收、已合入的有保留目标，每一处印章都换成了验收后的说法；integrated 有了 `◉*`；zh 的运行名不再是英文。扣分：通过被扣留时，证据条可能只有一个中性“保留”药丸，扣留它的高危发现不在这一行（R11-P3-02）。 | 1.275 |
| 信息架构与工作流 | 20% | 8.5 | 标题在每个宽度都完整；重叠仍写在本行 ID 之后，≤1240 时收进 tooltip。扣分：为悬停预留的 26px，让提示在常用宽度只剩 `◇`，比上轮少显示了信息；同一对重叠的两行写法不同（R11-P3-01）。 | 1.700 |
| 视觉层级 | 15% | 8.5 | 标题重新成为一行的视觉锚点；评审头的裁决在 1024–1600 的任何宽度都在。扣分：1560 到 1561 时标题列宽度跳变（370 → 314px），提示随之收起。 | 1.275 |
| 原创性与产品身份 | 15% | 8.0 | `▲*` / `●*` / `◉*` 的缺口语汇完整了。缺口在 1x 下仍然很难看出（沿用上轮记录）。 | 1.200 |
| 工艺与排版 | 10% | 8.0 | 台账标注小一号、写成说明文字；看板上的 “Fi…” 没有了。扣分：实况列的 “Verifi” 硬切，没有省略号；标识列从左侧硬切（R11-P3-04，既有）。 | 0.800 |
| 密度与克制 | 10% | 8.5 | 没有新增装饰；提示让位时不再挤占标题。 | 0.850 |
| 交互 | 10% | 8.5 | 选择框的读屏值、打开的菜单、面板三者一致；悬停和选中都不会改变提示。扣分：刷新或切换范围后，选过的同 rev 名字回到默认；终点 rev 离开列表时面板为空（R11-P3-03）。 | 0.850 |
| 设计系统一致性 | 5% | 8.5 | 中性药丸、`◉*`、重叠提示让位都写进了 docs/12，和代码一致。扣分：文档的让位规则没有提到悬停预留；zh 读屏标签的逗号和文档不一致。 | 0.425 |
| **合计** | 100% | | | **8.38** |

---

## 第 10 轮问题逐项核实

| 问题 | 判定 | 证据 |
|---|---|---|
| **R10-P2-01** 重叠提示挤占标题 | **已修复，带出 R11-P3-01** | **标题可见宽度**（本轮 / `deef352`，单位 px，1241–1800 每 4px 扫描）：<br>• demo，en，G-0001：1241 宽 100/100 对 27；1281 宽 100 对 52。<br>• demo，zh，G-0001：1241 宽 119/119 对 14；1365 宽 119 对 87。<br>• 长标题：1241 宽 144 对 27（en）或 14（zh）；1441 宽 238 对 144/131；1797 宽 257 对 164/151。<br>• 1241 宽时，标题格只有 208px（16em），扣掉 ID 和 `◇` 后，144 已经是能给的上限。<br>**稳定性：**<br>• 悬停：4 组 × 140 个采样，提示形态 0 次变化（`flips: []`）。悬停时 peek 按钮让标题最多少 26px，这是设计如此。<br>• 选中：每 8px 采样，选中和未选中完全一致（`selBad: []`）。<br>• 实时改标题：en/zh × 1440/1800，改长后收起，改回后恢复。<br>• 没有越出单元格，没有 ResizeObserver 报错。≤1240 时提示收进 tooltip。<br>证据：`$R/board/{2f1d0c5,deef352}/sweep-*.txt`、`hover-*.txt`、`selected-*.txt`、`2f1d0c5/rename-*.txt`、`$R/board/sbs-demo-en-light-1241.png`、`sbs-long-zh-CN-dark-*.png` |
| **R10-P3-01** 已验收或已合入的 tooltip，以及 `◉*` | **已修复** | en/zh × 亮/暗，accepted 和 integrated 两种状态：<br>• peek、评审头、验证读数、目标页印章，都写 “You accepted it with them / 你是带着这些保留验收的”。日志里 “before you accept / 验收前先看” 出现 0 次。<br>• 看板和命令面板字形的 aria 是 “Accepted, Verified, with caveats”、“Merged, Verified, with caveats”、“已合入, 已验证（有保留）”。<br>• integrated 的外环 `stroke-dasharray="22.61 3.78"`，实心圆完整。<br>• in_review 的说法没有被波及：决策、peek、评审头、验证读数仍写 “Look at them before you accept”。<br>证据：`$R/honesty/2f1d0c5/log-{in_review,accepted,integrated}-*.txt`、`peek-*`、`reviewhead-*`、`verify-*`、`goalhead-*.png`、`$R/honesty/glyph-sheet-{light,dark}-x4.png` |
| **R10-P3-02** 选择框写 Latest、实际选中 Base | **已修复**（边缘情况见 R11-P3-03） | • 默认状态、选择之后、无障碍树里，select 选中的项 = 面板文字 = tooltip。<br>• option 的 value 是唯一键（`kind:run:at:rev`），所以同一个 rev 的两个点能分别选中。<br>• Tab 依次经过起点和终点；评审头 1024–1600 每 8px 扫描，en/zh × G-0001/G-0003：`lost/hyst/noKbd/cut` 全为空。<br>证据：`$R/picker/2f1d0c5/log-*.txt`、`default-*.png`、`picked-*.png`、`focus-to-*.png`、`$R/sweep/2f1d0c5/sweep.txt` |
| **R10-P3-03** 亮色台账标注 | **已修复** | • 标注 11px/16px，agent 原话 12px/18px。<br>• 写成 “said in runs 1 and 2 / 第 1、2 次运行都这样说”，放在原话下一行。<br>• 对比度：亮色下标注 6.69:1、原话 7.94:1；暗色下 7.59:1 和 12.26:1。<br>• 现在靠字号和措辞两种形态区分，不只靠颜色。<br>证据：`$R/ledger/sbs-{en,zh-CN}-light-1440.png`、`$R/ledger/2f1d0c5/log-*.txt` |
| **R10-P3-04** 证据条的色调和措辞 | **单一哨兵已修复**（组合情况见 R11-P3-02） | en/zh × 亮/暗：<br>• 低于高危的 touches/runner/patches：中性药丸，写 “code reaches into the test runner”，和印章同词，透明底。<br>• `assertion_identity_unchecked`：中性 “assertions not checked”。<br>• `source_patches_tests` 高危：琥珀 “runner patched”，印章写 “Passed, doesn't count”。<br>• `assertions_removed`：琥珀 “assertions weakened”，不再写 “runner patched”。<br>证据：`$R/evidence/2f1d0c5/log-{en,zh-CN}.txt`、`tones-{light,dark}.png` |
| **R10-P3-05** zh 运行名是英文 | **已修复** | • zh：基线 / 第 1 次运行开始 / 第 2 次运行开始 / 保存于 11月24日 02:00 / 验证时 / 最新。<br>• en：Base / Run 1 start / Run 2 start / Verification / Latest。<br>• Latest 总在最后；兜底列表是 基线 / 第 1 次运行开始 / 最新。<br>证据：`$R/picker/2f1d0c5/names-{en,zh-CN}.txt` |
| **空测** unit clearance（settings, en） | **已修复** | 改测 zh 设置页，并断言页面上至少有 1 个可见的 `.unit-wrap`。我把 settings en 放回去，在 `2f1d0c5` 上跑，报 “fields with a unit on the page: Received 0”，说明这条守卫是真的在检查。证据：`$R/checks/variant-contract-settings-en-on-2f1d0c5.log` |

---

## 诚实语法

| 规则 | 判定 | 证据 |
|---|---|---|
| 绿色只给验证器的结果 | **成立** | 所有诚实性日志里，绿色元素只有这几类：生命周期字形和印章的图标、标准条的已验证段（`seg-verified`）、验证器的通过结果（`result-pass` 和它的图标）。台账里的 agent 原话是 `oklch(0.43)` 灰色。证据：`$R/honesty/2f1d0c5/log-*.txt` 的 greens 行，`$R/ledger/2f1d0c5/log-*.txt` |
| 琥珀 ◆ 只表示“需要你 / 先看这里” | **成立** | ◆ 只出现在决策行和被扣留的标准行上。重叠提示的 `◇` 是 text-2 灰色空心，和琥珀 ◆ 在颜色和填充上都不同。 |
| 中点只用在标准条和预算行 | **成立** | 回归的 16 个状态 × en/zh × 亮/暗 × 3 个宽度（含对比模式、修订合同），两个 commit 的 `dots` 都是空的。证据：`$R/regress/{2f1d0c5,deef352}/log.txt` |
| 有保留的通过：in_review | **一致** | 看板字形、实况印章、侧栏、命令面板、peek、评审头、验证读数，都写“已验证（有保留）”，圆环有缺口。 |
| 有保留的通过：accepted / integrated | **一致** | 见 R10-P3-01 一行。 |
| 中性药丸只表示“计入的保留” | **不完全成立** | 通过被扣留时，一个低危发现仍画成中性的“保留”药丸，见 R11-P3-02。 |

---

## 回归检查（对照 `deef352`）

- **覆盖面：**16 个状态 × en/zh × 亮/暗 × 1040/1440/1800，每个 commit 192 张截图。状态包括：看板（两种）、收件箱、两个目标页、评审页、对比模式、accept 弹层、两个 peek、修订合同、Operations、Learning、设置、新建合同、欢迎页。
- **基本情况：**两个 commit 都是 0 个 pageerror，0 个元素越出窗口，0 处多余的中点。
- **像素差异：**48 张完全相同，其余逐一归因：
  - **时间读数：**两次运行相隔约 2 分钟，所以出现 “8h 8m” 和 “8h 6m”，Operations 的计划时间 “04:00” 和 “03:58” 这类差异（`$R/regress/corner-inbox.png`、`ops-zh-dark-1040.png`、`ov-en-1800.png`）。
  - **G-0003 目标页：**台账标注，D110 有意为之。
  - **zh 对比模式：**运行名变成中文，D112 有意为之。
  - **zh 1440 看板：**G-0001 的“与 G-0003 改动重叠”只剩 `◇`。这是 R11-P3-01（`$R/regress/ovp-zh-1440-row.png`，上为 `deef352`）。
  - **peek-G-0002 zh 暗色 1800（0.064%）：**抽屉后面的顶栏状态组位置不同。只有 `deef352` 这张暗色图的位置不一样，同一 commit 的亮色图和本轮的两张都一致，所以是截图时机的问题，不是改动（`$R/regress/peek2-top.png`、`peek2-top-light.png`）。
- **结论：**除了 R11-P3-01，没有发现意外的退化。
- **证据：**`$R/regress/{2f1d0c5,deef352}/`、`diff.txt`。差异脚本在 `$R/tools/diff.py`。

---

## 新问题清单

### P0、P1、P2

无。

### [R11-P3-01] 提示为悬停预留位置，整行放得下时也只剩 `◇`；同一对重叠的两行写法不同（本轮引入，D107）

- **重现：**看板 demo fixture。G-0001 和 G-0003 互相重叠，都在“待评审”组。窗口 1241–1800，每 4px 扫描一遍。
- **现象**
  - 提示文字出现的宽度（其余宽度只有 `◇`）：

    | 行 | en | zh |
    |---|---|---|
    | G-0001（标题 100 / 119px） | 1413–1800 | 1469–1560，以及 1565–1800 |
    | G-0003（标题 158 / 159px） | 只在 1509–1560 | 只在 1533–1560 |
    | 长标题（两行） | 只在 1509–1560 | 只在 1533–1560 |

  - 以下宽度，`deef352` 上标题和提示文字都是完整的，本轮只剩 `◇`，标题也没有因此多得到宽度：
    - en G-0001：1365–1409
    - en G-0003：1465–1505，1565–1800
    - zh G-0001：1421–1465
    - zh G-0003：1493–1529
  - 两个具体例子：
    - zh 1440：“修复购物车总价计算 G-0001 ◇ 与 G-0003 改动重叠” 变成了 “修复购物车总价计算 G-0001 ◇”。
    - 从 1561 起，G-0003 行只剩 `◇`，后面空着约 90–100px；紧挨着的 G-0001 行写着 “◇ Overlaps G-0003”。同一对重叠，一行写字，一行不写。
  - 宽度变化不单调：1560 显示文字，1561 只剩 `◇`。
  - MacBook 的常见默认宽度 1440（zh）和 1728（en G-0003），都落在只剩 `◇` 的区间。
- **证据**
  - `$R/board/sbs-new-1560-vs-1561-en.png`（上为 1560，下为 1561）
  - `$R/regress/ovp-zh-1440-row.png`
  - `$R/board/{2f1d0c5,deef352}/sweep-*.txt`
  - `$R/board/2f1d0c5/probe-*.txt`
- **原因**
  - `GoalRow.tsx:57-59` 判断时，总按 peek 按钮已经显示来算（`reserve` = 20 + 6 = 26px），而这个按钮只在悬停或选中时才出现。
    - 例：G-0003 在 1601 以上时，整行静止状态下文字后面还剩约 6px，不够 26px，于是文字被收起。
  - docs/12 第 664 行只写了“标题若显示不全……提示只留 `◇`”，没有这条预留。
  - ≥1561 时标题列是 `minmax(12em, 1.25fr)`（`app.css:4401-4404`），比 1241–1560 的 `minmax(16em, 1.4fr)`（`console.css:265-269`）窄。1561 宽时标题格从 370px 降到 314px。
  - 只剩 `◇` 时不带对方编号。上轮的修正目标写的是“只画 ◇ 加 ID”。
- **为什么是 P3**
  - 上轮 P2 的核心是标题这个主标识被挤短，这一点已经解决：标题在所有宽度都完整。
  - 信息没有丢：`◇` 的 tooltip 写全了（“Overlaps G-0003: src/cart.js”），读屏也能读到，没有说错任何事。
  - 不只是记录一下：它出现在最常用的几档宽度，而且和 `deef352` 相比少显示了信息，没有换来任何东西。
- **修正目标**
  - 按静止状态决定是否显示文字。peek 按钮出现时可以盖住提示末尾，或者把按钮移出标题格，不要为它常驻预留。
  - 放不下文字时写 `◇ G-0003`，不要只留一个 `◇`。
  - 让 1561 两侧的标题列下限接近。
  - 在 docs/12 写明让位规则。
  - e2e：断言“标题完整、文字也放得下”时文字可见；覆盖 G-0003 在 1728 宽、zh G-0001 在 1440 宽。

### [R11-P3-02] 通过被扣留时，证据条仍画中性“保留”药丸；同族的高危发现排在后面时不出现（D111 部分引入；只取第一个命中是既有问题）

- **重现：**G-0001 的 C1。哨兵组合是我构造的（`$R/checks/specs/wt-review11/tmp-review11-evidence.spec.ts`）：
  - A：`assertion_identity_unchecked`（2）+ `assertions_removed`（3）
  - B：`source_touches_tests`（2）+ 一个高危的绕过类哨兵。我用的名字是 `assert_bypass`，真实名字是 `bypass_around_bug`，两者在前端走同一条 `BYPASS_RE` 分支。
- **现象**
  - 两组的印章都写 “Passed, doesn't count”，行首有 ◆。
  - **A：**目标页证据条和验证读数里，都只有一个**中性**的 “assertions not checked”。扣留这次通过的 `assertions_removed` 在这一行完全没有出现。`deef352` 上是同样一个药丸，但是琥珀色，至少表示“先看这里”。
  - **B：**中性的 “code reaches into the test runner”（印章的保留用词）和琥珀的 “works around the bug” 并列。可是印章已经说了这次通过不作数，不存在“计入的保留”。
- **证据：**`$R/evidence/{2f1d0c5,deef352}/log-{en,zh-CN}.txt` 的 `unchecked2removed3` / `touches2bypass3` 两行，`$R/evidence/2f1d0c5/unchecked2removed3-goal-en.png`
- **原因**
  - `views/goal/ext.ts:154-155`：`gh` 和 `mh` 用 `find` 只取第一个命中，不看严重度。A 组里低危的那条排在前面，所以高危的被丢掉了（既有问题）。
  - `ext.ts:162`：是不是“保留”按单条发现判断，没有看这条标准的通过是否已被扣留（本轮引入）。
  - supervisor 那边，只要有高危发现，就不设 `qualified`（`summaries.rs:224-273`），也就是说这时任何发现都不算保留。
- **为什么是 P3**
  - 需要同一族里低危发现排在高危发现前面，或者低危的机制类发现和高危的绕过类发现同时出现。
  - 印章和 ◆ 已经说了“不作数”。按代码，目标页顶部的高危哨兵区（`GoalBlocks.tsx:271-276`）会列出 `assertions_removed`，这一点我没有截图核实。
- **修正目标**
  - 每一族按严重度取最高的一条。
  - 同一条标准里只要有高危发现，其他发现就不画成中性的“保留”。
  - GoalDeck 单测加上上面两组组合。

### [R11-P3-03] 运行选择框：刷新或切换范围后，选过的名字回到默认；终点 rev 离开列表时面板变空（前者本轮引入，后者既有）

- **重现：**评审页 G-0003，点 Compare runs。
- **现象**
  - **重新验证（同一个 rev，`verified.at` 变了）：**选过的 “Verification @15085f2” 刷新后变回 “Latest @15085f2”。rev 没变，比较范围没变，变的只是名字。
  - **切到别的范围再切回来：**“Run 2 start” 变回 “Run 1 start”，“Verification” 变回 “Latest”，rev 相同。
  - **比较时来了新的 pin，列表里没有别的点停在旧的终点 rev 上：**
    - 终点面板和 tooltip 都是空字符串；
    - 原生 select 选中第一项 “Base @69a9769”，读屏会念 Base；
    - 比较范围仍停在旧 rev。
    - `deef352` 上表现完全一样，所以这一条是既有问题。
  - 对照：如果验证点还在列表里，面板写 “Verification @15085f2”，这是诚实的。
- **证据：**`$R/picker/{2f1d0c5,deef352}/change-en-{verified-at-changes,old-rev-gone,verified-stays}.txt`、`$R/picker/2f1d0c5/change-en-old-rev-gone.png`。这个场景里统计行的 pin 是 stub 的产物，没有据此做判断。
- **原因**
  - `Timeline.tsx:50` 的 `keyOf` 里包含 `at`，验证时间一变，记住的 key 就对不上了。
  - `picked` 是 `RunPick` 内部的 signal（`:114`），切换范围时组件卸载，选择就丢了。
  - `:115-119` 在 `props.value` 不在列表里时返回空，面板因此为空，也没有任何 option 带 `selected`，浏览器就默认选第一项。`Review.tsx` 在快照变化时不修正 `cmp`。
- **为什么是 P3：**前两种情况比较范围是对的，错的只是名字。第三种要在比较时恰好来新 pin，而且列表里没有别的点留在旧 rev 上。
- **修正目标**
  - key 不要包含 `at`，比如用 `kind:run_no:rev`。
  - 把选择记在 Review 的状态里，而不是 `RunPick` 内部。
  - 终点 rev 不在列表里时，二选一：把范围移到 Latest 并告诉用户；或者补一个 “@abc1234（已不在列表）” 的 option 并选中它，让面板、select、读屏一致。
  - e2e 加上新 pin 到来的场景。

### [R11-P3-04] 看板硬切：实况列把 “Verified” 切成 “Verifi”，标识列从左侧被切（既有；本轮的 16em 下限让 1241–1277 的标识列少了 23px）

- **重现：**看板。demo fixture，以及我构造的 crowded fixture（两个项目；G-0003 带非默认引擎、PR、返工 1/3）。
- **现象**
  - **实况列：**en 在 1417 宽及以下、zh 在 1281 宽及以下，印章放不下。
    - 1241 宽时显示 “Ready to accept ✓ Verifi”，没有省略号。两个 commit 一样。
  - **标识列：**G-0003 的标识内容是 201px（zh 209px），列宽只有 130px（≥1561 时 163px），所以在所有宽度、两个 commit 下都被切。
    - 被切掉的是左边：1800 宽时引擎名只剩 “en”，紧贴着 “8h ago”；1241 宽时，PR 计数在本轮整个消失，在 `deef352` 上剩半个字形。
  - **本轮的变化：**1241–1277 宽时，标识列从 130px 降到 107–123px。
    - G-0001 的项目名，en 从 89/116 降到 66/116。
    - zh 的 “店面支付服务” 只剩 66/74；上轮是完整的。
- **证据**
  - `$R/board/sbs-crowded-{en,zh-CN}-1241.png`（上为 `deef352`）
  - `$R/board/crop-crowded-en-1800-right.png`
  - `$R/board/{2f1d0c5,deef352}/crowded-*.txt`、`sweep-*-demo.txt`（liveCut 字段）
- **原因**
  - `Live.tsx:136` 的 `.live-detail.ellipsis` 里放的是 `<Seal compact>`（`:158`），而 `.seal` 是 `display: inline-flex`（`app.css:524-528`）。`text-overflow: ellipsis` 对行内块不起作用，所以只能硬切。
  - `GoalRow.tsx:38-39` 的 `crowded` 按项数判断，不做测量。注释说引擎名会先让位、“完整，不被裁切”，但 1800 宽时它仍被裁切。
  - 标题列 16em 的下限见 `console.css:267`。
- **为什么是 P3**
  - 被切的是验证器的词，但同一格里有绿色勾和 “Ready to accept”，意思不会读错。
  - 标识列的问题要多个标识同时出现才会触发。
- **修正目标**
  - 实况列放不下时，先让 `@pin` 或印章的词按规则让位，或者给 `.seal-word` 单独的省略号。
  - 标识列按测量让位：先收引擎名，再收项目名，不要硬切。

### 只做记录，不计入

- **标点不一致**
  - docs/12 第 252 行写的读屏标签是“已合入，已验证（有保留）”，用全角逗号；代码输出的是 “已合入, 已验证（有保留）”。“已验收”也是这样，和既有写法一致。
  - zh 的重叠 tooltip 仍用 ASCII 冒号（“与 G-0001 改动重叠: src/cart.js”）。
- `GoalPage.tsx:140` 传入的 `accepted`，外层 `<Show>` 已经把 accepted 和 integrated 排除了，这个参数在这里永远用不上。无害。
- docs/12 第 249 行说“断言未检查”来自“金丝雀未能检查”。实际上 supervisor 也会根据 `assertions_unchecked` 和 `assertion_identity_unchecked` 哨兵给出这一项，文档没写全。
- zh 下，未知 kind 的快照仍显示 supervisor 给的英文标签（“Checkpoint @c0ffee0”）。这只在我构造的数据里出现，supervisor 目前只输出 5 种 kind。
- `◉*` 的缺口在 2x、4x 下清楚，在 1x 下很难看出，和上轮对印章的记录一样（`$R/honesty/glyph-sheet-light-x1.png`）。
- 台账标注和 C1 的编号左对齐（236px），没有对齐到原话（256px）。可以接受。

---

## 新增 e2e 是否测到了它声称的东西

- **数量**
  - webkit 测试从 442 条变成 450 条：重叠测试从 2 条变成 4 条，accepted/integrated 新增 4 条，选择框新增 2 条。
  - 台账和单位测试是修改，不是新增。
  - vitest 从 233 变成 236：GoalDeck 的哨兵用例从 3 条变成 6 条。
- **在 `deef352` 上跑：**选中 15 条，12 条失败，3 条通过（`$R/checks/new-e2e-on-deef352.log`）。和作者说的“12 e2e”一致。
  - **失败原因都正确**
    - 重叠 ×4：标题宽度不够，1241 宽时 en 27/100，zh 14/119。
    - 台账 ×2：先在措辞上失败（“runs 1, 2”），字号断言没有执行到。我单独去掉措辞断言后重跑，报 `Expected <= 11, Received 12`（`$R/checks/variant-ledger-form-on-deef352.log`），说明字号断言本身有效。
    - accepted ×2：peek 的 tooltip 写 “Look at them before you accept”。integrated ×2：字形 aria 是 “Merged / 已合入”。
    - 选择框 ×2：先在名字上失败（“Run #1 start”、顺序不对），“面板 = select” 的断言没有执行到。不过 `$R/picker/deef352/change-en-*.txt` 的 before 记录显示，默认状态下面板写 Latest、select 选的是 Base，所以这条断言在 `deef352` 上同样会失败。
  - **3 条通过：**单位测试（new en、new zh、settings zh）。R9-P3-07 在 `deef352` 已经修好，这几条本来就应该通过。
  - **新增的 `shown > 0` 守卫：**在 `2f1d0c5` 上换回 settings en 会失败（Received 0），守卫有效。
- **vitest：**文件共 11 条，5 条失败（`$R/checks/new-vitest-on-deef352.log`），正好是行为有变化的 5 个哨兵用例：touches/unchecked 的色调、runner/patches 的措辞、“assertions weakened”。`source_patches_tests` 高危那条通过，因为旧版本本来就画琥珀色的 “runner patched”。
- **有没有削弱测试**
  - 没有被删除而不补上的断言。台账、单位、GoalDeck 的断言都变严了：GoalDeck 现在要求恰好 1 个药丸，并检查 `data-mark`。
  - GoalDeck 的 `runner_patched`（低于高危）期望从 “runner patched” 改成了 “code reaches into the test runner”，这是 D111 有意的设计改动。
  - 重叠测试有意放宽了：原来要求 1241/1440/1800 都能看到文字，现在保留的 `toBeVisible()` 和 `toHaveText(words)`，在只显示 `◇` 时也会通过（文字仍在 sr-only 里）。真正检查“文字可见”的，只剩 G-0001 短标题在 1800 宽的 `shown[1800]`。这和设计改动一致，但留下了下面的缺口。
- **覆盖缺口**
  - 重叠测试只测 G-0001，也不检查“整行放得下时文字应该可见”，所以 R11-P3-01 能通过测试。
  - GoalDeck 只测单一哨兵，不测通过被扣留时的组合（R11-P3-02）。
  - 选择框测试不测刷新和新 pin 到来的情况（R11-P3-03）。
  - 没有测试覆盖实况列和标识列的硬切（R11-P3-04，既有）。

## 工程检查（日志在 `$R/checks/`）

| 检查 | 结果 | 日志 |
|---|---|---|
| `pnpm check/test/build` | pnpm 自动安装失败，报 “workspace hoist directory is not a real directory”，因为 node_modules 是符号链接。所以直接调用同样的二进制，和 package.json 里的脚本等价。 | `pnpm-attempt/check.log`、`run-checks.sh` |
| tsc | EXIT=0 | `tsc.log` |
| vitest | 43 个文件、236 个测试，全部通过 | `vitest.log` |
| vite build | 通过 | `build.log` |
| bundle-budget | 通过。**合计 161,693 / 163,840**，余 2,147 B（第 10 轮是 160,896，本轮 +797）。<br>启动 55,478 / 65,536（单一语言 3,472），按需加载 106,215 / 110,592，目标页 11,596 / 12,288，worker 197,901 / 262,144。 | `bundle-budget.log` |
| line-limit | EXIT=0 | `line-limit.log` |
| doc-numbers | EXIT=0 | `doc-numbers.log` |
| Playwright 全量，按规定命令（端口 1441） | 369 通过，**5 失败**，76 跳过，1.6 分钟。<br>5 条都在 smoke.spec，原因都是字体请求被拒（403，“outside of Vite serving allow list”），这是环境问题。上轮是 4 条，差别在于哪几条测试收集控制台错误时恰好碰上字体请求。 | `e2e-full.log` |
| Playwright 全量，用能提供字体的 vite 配置 | **374 通过，0 失败**，76 跳过，1.8 分钟。和作者说的 374/0 一致。 | `e2e-full-fonts.log` |
| 补充的变体检查 | 台账字号在 `deef352` 上失败（12 > 11）；settings en 在 `2f1d0c5` 上失败（0 个带单位的字段）。都是预期的失败。 | `variant-*.log` |

## 没能覆盖的

- **原生应用：**按规则没有运行打包好的应用，也没有跑 cargo。看到的都是 WebKit 加 stub IPC 的结果，数据都是注入的 fixture。
- **运行时切换语言：**设置页的语言选择是原生弹出菜单，stub 下驱动不了（`$R/board/2f1d0c5/lang-switch.txt` 只有切换前的记录）。
  - 所以“切换语言后提示重新测量”没有直接验证。
  - 我改用实时改标题，验证了同一条 MutationObserver 路径：en/zh × 1440/1800，改长、改回两个方向都重新判断，0 个错误。
  - 另外，设置是单独的视图，切回看板时行会重新挂载。
- **原生 select 菜单：**headless 下拍不到打开后的菜单，选项是从 DOM 和无障碍树读出来的。
- **读屏：**没有做 VoiceOver 实测，结论来自无障碍树。
- **生产构建：**没有在 vite preview 上跑 e2e，1443 没有用到，shots 和 perf 项目没有跑。
- **采样密度：**看板 1241–1800 每 4px 扫描，悬停和选中每 8px；1040–1240 只取了几个点。crowded 只用了一个两项目的 fixture。
- **R11-P3-02 的前提：**
  - 没有找到 supervisor 按严重度给哨兵排序的代码，所以真实数据里低危排在高危前面的概率没有核实。
  - 目标页顶部的高危哨兵区会不会列出被丢掉的那条，只读了代码，没有截图核实。
- **in_review 的 fixture：**我只设了 `progress.qualified`，没有加对应的哨兵，所以验证读数里写 “assertions untouched”，旁边的印章写 “code reaches into the test runner”。这是 fixture 造成的，不是产品问题，没有据此做判断。
- **DecisionCard：**它的 `accepted` 只在 review_ready 决策行上生效，只做了代码阅读。

## 验收条件

**通过。**没有必须先解决的问题。建议按这个顺序修：

1. **R11-P3-01**（本轮引入，影响主界面）：按静止状态决定是否显示提示文字，放不下时写 `◇ G-0003`；e2e 断言“放得下就显示”，并覆盖 G-0003 和 zh 1440。
2. **R11-P3-02**：`qualifiers()` 每一族按严重度取最高的一条；通过被扣留时不画中性的“保留”；单测补上组合用例。
3. **R11-P3-03**：选择框的 key 去掉 `at`，选择记在 Review 的状态里；终点 rev 不在列表时，让面板、select、读屏一致。
4. **R11-P3-04**（既有）：实况列的印章和标识列改成按测量让位，不要硬切。
