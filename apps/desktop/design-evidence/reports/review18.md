**结论：PASS。** 加权得分 **8.47/10**（8.470），没有未关闭的 P0 或 P1。第 17 轮的 R17-P2-01 和 3 条 P3 都修好了；这一轮新记 4 条 P3。

# Tower 前端设计评审：第 18 轮（`03999c0` + `54ba274`，对照 `f9dd353`）

> 文中 `$R` 指 `/tmp/tower-design/review18`，截图、日志和测量都在这里。
> - 临时 spec 已从 worktree 删除，副本在 `$R/checks/specs/`。
> - 工程检查日志在 `$R/checks/`，换回旧源码的结果在 `$R/checks/oldsrc/`。
> - 清理后的状态：
>   - `wt-review18` 的 `git status --short --ignored` 只剩两个 node_modules 软链接。
>   - 对照 worktree `wt-review18-base` 已用 `worktree remove --force` 删除。
>   - 1441–1443 端口没有监听进程。
>   - `dist/`、`test-results/`、vite 缓存和 cargo target 都已删除。

**第 17 轮的问题都修好了**（每条都先在 `f9dd353` 上复现，再在 `54ba274` 上确认）：

- **R17-P2-01：**按下 diff 某行后按 ⌘⇧↩，现在只开验收弹层。焦点在弹层里，没有评论框。⌥↩、⇧↩、⌘↩、Ctrl+↩ 也都不再开评论框。
- **R17-P3-01：**
  - 跨文件拖选改用浏览器原生复制，两个文件都在。
  - 分栏从空左栏起拖，复制出右栏的内容。
  - 只拖行号也有内容，旧代码只有 `\n\n`。
- **R17-P3-02：**宽度 ≥ 1281 时，在 560、640、900 三种高度下，页面顶部和底部右栏与引导框的重叠都是 0。旧代码最多 19,720 px²。
- **R17-P3-03：**回答 ask_user 时还有调用在跑，运行跟着最新的调用（mode 和实况行用同一条规则）。问题开着时，一直是“等你”。

**这一轮做得好的地方：**

- **暗色 shimmer：**
  - 改成“底色纱 + 光缝”：静止时字保留 64–66% 的墨，光缝里是全墨。
  - 读起来终于是“被照亮”，不是“变暗”。
  - 亮色不变，最低墨 0.40–0.42。
- **缩略图：**解码前按 Tower 截图的比例占位，桌面 152px、手机 45px，解码后宽度不变。“改动后”的左缘一直在 491px，旧代码会从 411 跳到 491。
- **失败文案：**引导框和整页的加载失败，都用界面语言写一句人话，不再显示 “Importing a module script failed.”。
- **手机：**
  - 保留理由前写“有保留，验收前先看：”。
  - 中文按词断行。
  - 标记对齐标题行。
  - 暂停按钮有了真实点击的测试。

**新问题（都是 P3）：**

- **R18-P3-01（本轮引入，D173）：**
  - 短窗口滚到页面底部时，右栏头部藏到标题栏后面。
  - 1440×560 藏 104px，1440×640 藏 72px，旧代码只藏 12px。
  - 藏住的是“Contract v1 summary”和 Intent，正是右栏要一直露出来的东西。
- **R18-P3-02（本轮暴露，机制既有）：**按下第 4 行 → ⌘⇧↩ → Esc 取消，焦点跳到第 0 行的行号。这时按 ↩，会在第 0 行开评论框。
- **R18-P3-03（既有，D186 让它成为稳定状态，推断链）：**
  - 问题开着、旁边命令在跑 5 分钟：手机页头写“已沉默 5m”加提示标记，桌面标题栏写 “bash running for 5m”。
  - 两端说法不一致，桌面是对的。
- **R18-P3-04（既有，测试）：**D171、D172 的证据测试 `review-keys.spec.ts:187` 不稳定。
  - 有负载时 8 次失败 4 次，旧提交 8 次失败 1 次。
  - 作者的 “e2e 410/0” 我没能复现，我是 409 通过、1 失败（就是这条）。

---

## 评审范围

- **提交：**`03999c0`（第 18 轮）和 `54ba274`（补充 D186–D188），共 31 个文件，+1179 −147。对照 `f9dd353`。
- **环境：**Playwright WebKit，DPR 2，用 Tauri IPC stub 加 `/tmp/tower-design/fixtures{,-zh}`。
- **review 用的 vite 配置（`$R/tools/vite.review.config.mjs`）：**只在 `fs.allow` 里加了主 checkout 的 node_modules，用来解决字体 403。
- **服务：**HEAD 用 1441 端口，`f9dd353` 用 1442 端口。
- **临时 spec（`tmp-review18-*`）：**

| spec | 测什么 |
|---|---|
| `diff` | diff 的按键、选择、复制 |
| `esc` | 取消验收后焦点去哪 |
| `rail` | 4 种状态 × 12 种尺寸 × 顶部/底部 |
| `phone` | 320/360/390，en/zh，亮/暗 |
| `desk` | 标题栏、看板 4 种宽度 |
| `pulse` | 桌面脉搏与 supervisor 模式 |

- **Rust：**在对照 worktree 里换回旧文件，或做单行变异，跑 `cargo test --test flow`。
- **没有做的：**没运行打包好的应用，没调用任何外部或付费 API。

---

## 加权评分

| 维度 | 权重 | 分数 | 理由 | 加权 |
|---|---|---|---|---|
| 产品适配 | 15% | 8.5 | 回答问题、并行调用时，supervisor 的模式和实况行按同一条规则走（D174、D186）。手机暂停有了测试，保留理由写明“验收前先看”。扣分：问题开着、命令在跑时，手机页头写“已沉默”，桌面写 “bash running”（R18-P3-03）。桌面刷新后，长命令也读成沉默（既有）。 | 1.275 |
| 信息架构与工作流 | 20% | 8.4 | 按下某行后验收快捷键只开弹层；跨文件复制完整；引导框不再压住右栏。扣分：短窗口滚到底时，右栏头部的合同摘要看不到（R18-P3-01）；取消验收后，按下的位置丢了（R18-P3-02）。 | 1.680 |
| 视觉层级 | 15% | 8.5 | 手机标记都对齐标题行；暗色 shimmer 的明暗方向对了；缩略图不再跳。扣分：R18-P3-01；在 1280 和 1281 两侧，引导框从 984px 跳到 613px。 | 1.275 |
| 原创性与产品身份 | 15% | 8.6 | “纱 + 光缝”让亮暗两套光的读法一致，是这一轮最好的改动。缺口环、切角印章、注记竖线保持不变。扣分：暗色下，运行中的动作词静止时只有 65% 的墨，运行停下时跳回全墨。 | 1.290 |
| 工艺与排版 | 10% | 8.6 | 中文按词断行；中文冒号后不再多空格；失败文案用界面语言；缩略图按最终比例占位。扣分：坏图框宽 175px（en）、140px（zh），与 152px 的占位框不一致；390 宽下“有保留，验收前先看：”有时单独占一行。 | 0.860 |
| 密度与克制 | 10% | 8.6 | 没有新增颜色和标记；删掉了没人用的 `LookStepsRead`。 | 0.860 |
| 交互 | 10% | 8.2 | D171、D172 修好，修饰键加 ↩ 都不再开评论框。扣分：R18-P3-02；D171、D172 的证据测试本身不稳定（R18-P3-04）。 | 0.820 |
| 设计系统一致性 | 5% | 8.2 | docs/12 §12.5.3 规则 8 写清了琥珀 ! 只用在“先看”的清单前。扣分：规则 8 把这个标记叫“琥珀 `!`”，§12.6.2 和另外 51 行仍叫 `◆`；GitHub 失败检查 ✗ 和合并队列 “Conflict” 是红色，但不在 §12.4.3 的红色清单里（既有）。 | 0.410 |
| **合计** | 100% | | | **8.470** |

---

## 负责人意见（标记、动效、劣质 UI）的总体评价

负责人的原话：“我不喜欢现在的红色方块⬛️，黄色菱形◆和蓝色圆形这三个UI，以及其他地方出现的这种劣质UI和审美，请你注意这一点并进行全面的纠正”。

**点名的三种标记：**没有退回去。

- 扫描了 `apps/desktop/src`（不含测试）和 `remote.html`（`$R/charscan/counts.txt`、`hits.txt`），只出现三个字符：
  - `·` 46 处；
  - `×` 20 处，都在注释、尺寸写法（390×844）和 “3×” 倍数（`ContractRail.tsx:105`）里，没有拿来当标记；
  - `●` 1 处，在 `Glyph.tsx:155` 的注释里。
- CSS 的 `content` 只有 `"┆ "`（Agent 说法的注记竖线）。
- 截图里状态标记都是 SVG：琥珀圆盘里镂空 !、绿色勾环、红色圆盘里 ×、淡环加一段弧。没有方块、菱形或实心蓝点。
- docs/12 仍用 `◆`、`■`、`◇` 当记法，§12.6.2 前的说明写明“界面画的是 SVG 形状一列”。这是记法，不是界面。但规则 8 的“琥珀 `!`”和全文的 `◆` 混用，记在“只做记录”。

**这一轮清掉的“劣质感”：**

- **暗色 shimmer**（`$R/shimmer/{tag}/log.txt`，放大图 `$R/shimmer/zoom-dark-lines.png`）：
  - 旧代码的光带是比字暗的底色，经过时字像被擦掉。
  - 现在静止时字被 35% 的底色纱罩住，灰度 144（全墨是 211），光缝经过的地方是全墨。读起来是一束光扫过。
  - 静止时对 app 底色的对比度是 5.71:1，对速览底色是 5.43:1（按灰度计算）。
- **缩略图**（`$R/look/{tag}/log.txt`，`$R/look/stack-look-half.png`）：桌面截图解码前后都是 152px，手机都是 45px，“改动后”的左缘一直在 491px。
  - 这是 GitHub、Linear 的做法：按最终比例预留空间，图片到了不挪位置。
- **失败文案**（`$R/fail/{tag}/log.txt`，`$R/fail/steer-pair.png`）：
  - “Tower 的这部分界面没有加载出来。请重试；一直失败的话，重启 Tower。”
  - 一句人话加一个动作，符合 Geist、Linear 的错误态写法。
- **手机**（`$R/phone/{tag}/marks.txt`）：所有行的标记和标题中心相差不超过 0.34px，旧代码差 9–43.5px。中文保留理由按词断行。

**还剩下的：**

- R18-P3-01：右栏头部被标题栏遮住。这和右栏“一直在视线里”的承诺冲突，见 `app.css:1752-1754` 的注释。
- 在 1280 和 1281 两侧，引导框从 984px 跳到 613px（textarea 512px）。613px 能用，但输入区明显变窄了。
- 暗色运行中的动作词静止时偏暗，运行停下时跳回全墨。
- 解码前的空框在暗色里是一块没有内容的深色矩形（shots 里碰巧拍到，`$R/shots/pairs/deck-final-goal-deck-dark.png`）。尺寸是对的，这是可接受的占位，但不算精致。

**对照 Primer、Geist、Linear：**

- **整体：**中性侧栏、发丝线分隔、13px 正文、等宽字体只给 id 和命令、颜色只给状态字形。这和 Linear 的克制是同一路线。
- **状态：**标记带文字（“Needs you”“Verified”），不单靠颜色。这符合 Primer 的状态写法。GitHub 检查的 ✓3 是中性色，这一点对。
- **焦点：**Primer Dialog 的约定是“关闭后焦点回到打开它的元素”。Tower 的焦点确实回到了表格，但随后被 `onTableFocus` 当成 Tab 进入，挪到了第一行（R18-P3-02）。

---

## 作者说明的准确性

| 作者的说法 | 我的结果 |
|---|---|
| vitest 43 个文件、250 条 | 一致（`$R/checks/vitest.log`） |
| e2e 410 通过、0 失败 | **没复现。** 规定命令：405 通过、5 失败、76 跳过，5 条都是 smoke 的字体 403（`e2e-full.log`）。用 review 字体配置：409 通过、1 失败、76 跳过，失败的是 `review-keys.spec.ts:187`（`e2e-full-fonts.log`），见 R18-P3-04 |
| shots 69/69 | 我跑的是 `shots.spec` 加手机 `-g shot`，两个提交各 76 条全过、76 张 PNG。69 这个数对不上我的选择，不做判断 |
| perf：50 个目标 660/296/188ms，对照 188/161/107ms | **660 没复现。** HEAD 是 221/227/189ms，对照 150/143/105ms；`f9dd353` 是 227/230/188ms，对照 153/138/107ms。切换视图 HEAD 36–64ms、`f9dd353` 32–64ms。两个提交一样，离 750ms 的门槛很远（`perf-{head,base}.log`） |
| cargo 385 通过、2 忽略 | 一致，跑的是 supervisor、store、core 三个 crate（`cargo-test.log`） |
| 包体 163,830 / 163,840 | 一致，余 **10 B**（`bundle-budget.log`）。D184 那行写的是 163,813 B，是 `03999c0` 的数字，我没单独构建它。`54ba274` 多出的 17 B 应该来自补充提交 |
| D173 “到底时右栏的底在窗口里” | 底确实在窗口里，但顶跑到标题栏后面去了（R18-P3-01） |
| D180 “去掉手机的规则，Mobile 页签会按 152 等待” | 这个变异我没单独跑 |

---

## D171–D188 逐项核实

| 编号 | 作者的说法 | 判断 | 我的证据 |
|---|---|---|---|
| D171 | 表格只接不带修饰键的 ↩；⌘⇧↩ 是页面快捷键 | **已修复**，暴露 R18-P3-02 | `$R/diff/{54ba274,f9dd353}/log.txt`。HEAD 按 ⌘⇧↩：`dialog 1, composer 0`，焦点在 `DIV.panel`。⇧↩、⌘↩、⌥↩、Ctrl+↩ 都是 `dialog 0, composer 0`，焦点留在 TABLE。`f9dd353` 上都会开评论框。截图 `$R/diff/54ba274/press-accept.png`。换回旧 `FileDiff.tsx` 后测试失败，`toHaveCount` 期望 0、实际 1（`oldsrc/b-filediff.log`） |
| D172 | 跨文件用原生复制；起点在空栏时取终点那一侧；没有行内容的复制交给原生复制 | **已修复** | `$R/diff/54ba274/log.txt`：跨文件，unified 和 split 都是 `handled:false`，包含 `src/cart.js` 和 `function total(`（`lastA:true`）。split 从空左栏起拖，复制出右栏的 `export const fromCents…`，旧代码是 `\n\n`、`\n\n\n`。只拖行号复制出右栏的行。从文件头起拖是原生复制。换回旧 `diffSelect.ts` 后失败在 “and the next file's”（`oldsrc/b-diffselect.log`） |
| D173 | 从 1281 起，引导框的右边距让开右栏，删掉右栏的高度规则 | **重叠已修复，但引入 R18-P3-01** | `$R/rail/{tag}/log.txt`：HEAD 宽度 ≥ 1281 时，running 和 paused 两种状态，16 种组合重叠都是 0；`f9dd353` 最多 19,720 px²。到底时右栏顶部：HEAD running 1440×560 是 −52，640 高是 −20；`f9dd353` 都是 40。截图 `$R/rail/pair-running-1440x560-end-half.png`、`pair-running-1281x640-half.png`。只换回 `workbenches.css` 或两个 CSS 都换回，测试失败；只换回 `app.css`，重叠测试通过（`oldsrc/b-appcss.log` 失败的 2 条是 shimmer 和缩略图） |
| D174 | 开始、结束、回答都用同一条规则：在跑的最新调用（不含 log、submit、已回答的问题）；实况行跟着它 | **已修复** | 见下方“D174 的 Rust 证据” |
| D175 | 手机暂停的测试 | **已修复，测试有效** | `$R/phone/{tag}/pause.txt`：en、zh 都是 Pause → “Press again”（`btn ghost armed`）→ POST `{goal:"G-0021"}`，两个提交一样。用 `2d3eeb8` 的 `remote.html` 测试失败，`div.row intercepts pointer events`（`oldsrc/b-remote-2d.log`） |
| D176 | “With caveats, look first: …” / “有保留，验收前先看：……”；规则 8 | **已修复，规则说得通** | `phone/54ba274/log.txt` 里的文案确认。用 `f9dd353` 的 `remote.html`，测试失败在 “With caveats:”（`oldsrc/b-remote-f9.log`）。规则：琥珀只放在要你先看的清单前，只显示缺口的地方保持中性。这条规则自洽 |
| D177 | `keep-all` 加 `overflow-wrap:anywhere` | **已修复** | 320、360、390 三种宽度，中文理由都在词组之间断行（`phone/54ba274/log.txt` 的 `whyBreaks`）。去掉 keep-all 后中文测试失败（`oldsrc/b-remote-nokeepall.log`）。390 宽下引导语有时单独一行，见“只做记录” |
| D178 | 标记放在标题行上 | **已修复** | `$R/phone/{tag}/marks.txt`：HEAD 待验收行 `markDy` 是 0，运行行是 −0.34；`f9dd353` 是 9–43.5，运行行 10.66。去掉这条规则后测试失败（`oldsrc/b-remote-noglyph.log`，en、zh）。测试只覆盖待验收行 |
| D179 | 实况行和模式在两端跟同一个调用；AgentEnd 清空调用；桌面不把 log、submit、ask_user 算作工作 | **已修复**，残留见“只做记录” | `pulse.test.ts` 现在有 4 条：用 `f9dd353` 的 `store.ts` 失败 3 条（`oldsrc/b-store-f9.log`）；用 `03999c0` 的 `store.ts` 只有同一毫秒那条失败（`b-store-03.log`）。supervisor 的 AgentEnd 清空在 `run/events.rs:208` |
| D180 | 解码前按 Tower 截图比例占位，桌面 1280×800、手机 390×844 | **已修复** | 见下方“D180 的测量” |
| D181 | 代码没加载出来，用界面语言说 | **已修复** | `$R/fail/{tag}/log.txt`：en、zh，亮、暗，引导框和整页都是新文案；`f9dd353` 是 “Importing a module script failed.”。换回旧 `ui.tsx` 后 3 条 resilience 测试失败（`oldsrc/b-ui.log`） |
| D182 | 中文冒号后不加空格 | **已修复** | 换回旧 `Honesty.tsx` 后 `flows.spec.ts:1440` 失败，出现 “检查： test/holdout/…”（`oldsrc/b-honesty.log`） |
| D183 | 暗色用 35% 底色纱加光缝；亮色不变 | **已修复** | 见下方“D183 的测量” |
| D184 | 关掉 modulepreload polyfill，删掉 `LookStepsRead`，没动预算 | **已核实（部分）** | `dist/index.html` 只有一个 `<link rel="modulepreload">`（`native-*.js`）。预算文件没改。总计 163,830 B，余 10 B。Safari 16 上的行为测不了，见“没能覆盖的” |
| D185 | “Reviews of this work” 表补上第 15–17 轮 | **已修复** | `DESIGN_REVIEW.md` 有 Iteration 15、16、17 三行。结论与报告一致：8.285 不通过；8.46 PASS；8.45 PASS |
| D186 | 问题开着时，不管旁边开始或结束什么调用，运行都是“等你” | **已修复** | 见下方“D174 的 Rust 证据” |
| D187 | 同一毫秒开始的两个调用，取后开始的那个 | **已修复** | 用 `03999c0` 的 `store.ts` 只有这一条失败，实际 “read”、期望 “bash”。ACP 的 call id 是 `tower_<pid>_<n>`，不是数字，所以 `Object.values` 保留插入顺序，规则成立 |
| D188 | 重叠测试补上 1281×640、1280×640、1280×900 | **已修复** | 测试代码确认（`flows.spec.ts:2059` 起）。宽度 ≤ 1280 时，我量到顶部会重叠，最多 78,720 px²；这是折叠后的右栏作为页面内容从吸底的引导框下面经过，两个提交一样。到底时都是 0。和作者的描述一致 |

**D174 的 Rust 证据**（`$R/checks/oldsrc/r-*.log`）：

- **对照组：**不换任何文件，3 条测试全过。
- **只换回 `f9dd353` 的 `control.rs`：**
  - `every_end…` 失败：回答后是 Thinking，应该是 Executing。
  - `while_a_question…` 失败：`[Executing, WaitingOnYou, Thinking]`。
- **D174 的 4 个文件全换回：**
  - 实况行写 “ls”，应该是 “bash”。
  - 模式序列是 `[Executing, WaitingOnYou, Reading, WaitingOnYou, Thinking]`。
- **变异“取最早的调用”：**`every_end…` 失败，实况行写 “read”。
- **变异“`settle_mode` 不动实况行”：**`every_end…` 失败，实况行写 “ls”。

**D186 的 Rust 证据：**

- 换回 `03999c0` 的 `run/events.rs`：模式序列是 `[Executing, WaitingOnYou, Reading, WaitingOnYou, Reading, Thinking]`。
- 换回 `03999c0` 的 `run/mod.rs`：问题开着时模式是 Reading。
- 两种情况都只有 `while_a_question…` 失败。

**D180 的测量**（`$R/look/{tag}/log.txt`）：

| 情况 | HEAD 解码前 → 解码后 | `f9dd353` 解码前 → 解码后 |
|---|---|---|
| 桌面截图 | 152 → 152px | 72 → 152px |
| 手机截图 | 45 → 45px | 72 → 45px |
| 高图放在桌面槽 | 152 → 59px，“改动后”左移 93px（作者已接受） | — |

- 换回旧 `Look.tsx` 或旧 `app.css`，测试都失败，宽度是 72。
- 坏图在两个提交里一样：虚线框，“The screenshot file is gone” 175×96，“截图文件已不在” 140×96。

**D183 的测量：**

- 暗色静止时最低墨 0.64–0.66，光缝里是全墨，`whole` 列逐帧上升。
- 亮色最低墨 0.40–0.42，与上一轮相同。
- 换回旧 `app.css`，暗色测试失败，静止时墨为 1（`oldsrc/b-appcss.log`）。

---

## 诚实语法

- **绿色只给验证器，并且总带 pin：**
  - 这一轮的 diff 没有改任何绿色的用法。
  - 手机“待验收”只有算数的通过画绿，并带 `@15085f2`；保留理由用琥珀（`phone/54ba274/log.txt`）。
  - 手机运行行的标准条绿格不带 pin，桌面 `CriteriaBar` 也一样。第 16 轮已按 ADR-020“已验证的格是事实”判过，这一轮没动，不计。
  - shots 里有差异的地方都和这一轮的改动或时机对得上，见回归检查。
- **琥珀 ! 只表示“需要你 / 先看这里”，从不表示证据：**
  - 手机上等你的行、不作数的行、保留清单前用琥珀 !。规则 8 的划分自洽。
  - 标题栏没有新增琥珀。
- **红色只用于 §12.4.3 的清单：**这一轮没有改红色。GitHub 失败检查的 ✗ 和合并队列的 “Conflict” 用红色，但清单里没写，见“只做记录”。
- **“要注意但不需要你决定”用 text-1 加不着色的提示标记：**
  - 手机页头的沉默是文字加一个提示标记（`headerMarks 2` = 运行标记 + 提示标记）。
  - 桌面标题栏的沉默是一个提示标记（`hbMarks [1]`）。
  - 用法符合规则，但手机页头在 R18-P3-03 的情形下用错了。
- **沉默徽章：**text-2、字重 400、不画字形。手机 “Silent”、“已沉默” 是 `ink t2, weight 400, svg false`（`phone/{tag}/question.txt`）。
- **中点只在标准条和预算行：**
  - 显示出来的中点只在 `HonestyCore.tsx`（标准条）和预算的标题、行文案里（`en.ts:367`、`en.later.ts:676`、`zh-CN.ts:373`、`zh-CN.later.ts:669`）。
  - 其余是不显示的：留出名单的解析正则（`DecisionCard.tsx:137`、`remote.html:303`）、模糊搜索的分隔符（`fuzzy.ts:18`）。
  - 手机标准条的 `title` 提示文字（`remote.html:370`）第 16 轮记过。
- **Agent 的话不画绿：**“Agent says” 那一栏在截图里是中性注记竖线加 text-2。
- **GitHub 检查数不用验证器的绿色：**收件箱 CI 卡片的 ✓3 是中性色（`$R/shots/pairs/inbox-ci-head.png`）。

---

## 回归检查（对照 `f9dd353`）

**shots：**两个提交各 76 张，阈值 24，结果在 `$R/shots/diff.txt`。59 张完全相同，17 张有差异，全部能解释：

| 差异 | 张数 | 原因 |
|---|---|---|
| `goal-G-0001-*`、`review-G-0001-accept-*`、`review-G-0001-readout-*`、`look-compare-zh-dark`、`final-goal-deck-light` | 9 | 夹具的桌面截图从 390×640 改成了 1280×800（`rich.ts`），缩略图变宽。所以 shots 分不清 D180，D180 的结论靠我的 look spec |
| `final-goal-deck-dark` | 1 | 夹具改动，加上拍照时图片还没解码：两个空框，尺寸正确（`$R/shots/pairs/deck-final-goal-deck-dark.png`） |
| `goal-G-0002-en-light` | 1 | 截图时机竞争：引导框还没渲染出来。单独重跑，HEAD 7 次里 2 次没有框，`f9dd353` 5 次里 1 次没有（`$R/shots/rerun-*`、`rerunb-*`）。用 `rerun-2` 作为 HEAD 的参照，框在主栏、右栏旁边，正常（`$R/shots/pairs/G2-head-rerun2-bottom.png`） |
| `final-review-theater-{light,dark}` | 2 | HEAD 有一行有语法高亮色，`f9dd353` 没有。原因没查明，可能是高亮 worker 的时机：shot 等待着色 3 秒，超时就放行 |
| `phone-*` | 4 | D178，标记移到标题行 |

**其他回归：**

- **标题栏：**en、zh，亮、暗，1040、1241、1440、1800 四种宽度（`$R/titlebar/`），差异只在运行弧的旋转相位（≤ 0.045%）。
- **看板：**16 张（`$R/board/`），差异 ≤ 0.013%，是运行弧的相位和亮色 shimmer 的相位（`$R/shots/pairs/board-zh-1241-diff.png`）。
- **控制组：**在 `54ba274` 上，review-keys、phone、resilience、flows 一共 122 条全过（`oldsrc/b-control.log`）。

---

## 新问题清单

### P0

无。

### P1

无。

### P2

无。

### P3

#### [R18-P3-01] 短窗口滚到页面底部时，右栏头部藏到标题栏后面（本轮引入，D173）

- **复现：**
  1. 窗口 1440×560。1281×560、1281/1300/1360/1440×640 同样会出现。
  2. 打开运行中的目标 G-0002，或暂停且没有待办的 G-0004。
  3. 把目标页滚到底。
- **现象：**

  | 状态和尺寸 | HEAD 右栏顶部 | HEAD 藏住 | `f9dd353` 右栏顶部 | `f9dd353` 藏住 |
  |---|---|---|---|---|
  | running，560 高 | −52 | 104px | 40 | 12px |
  | running，640 高 | −20 | 72px | 40 | 12px |
  | paused，560 高 | −43 | 95px | 40 | 12px |
  | paused，640 高 | 37 | 15px | 40 | 12px |

  - 标题栏底边在 52px，右栏正常吸顶位置是 72px。
  - 藏住的是 “Contract v1 summary” 标题和 Intent 的三行。
  - 右栏自己滚动也看不到：它的 scrollTop 已经是 0，只能往下滚；它还有 `overscroll-behavior: contain`。只能把整页往回滚。
  - 页面顶部时，右栏底部有 70px（560 高）或 38px（640 高）在窗口外，旧代码都在窗口内。这部分滚动页面能看到。
- **证据：**
  - `$R/rail/{54ba274,f9dd353}/log.txt`；
  - `$R/rail/pair-running-1440x560-end-half.png`：上图是 HEAD，右栏从 “Scope fence” 开始；下图是 `f9dd353`，标题只被切掉一点；
  - `$R/rail/pair-running-1281x640-half.png`。
- **原因：**
  - `app.css:1755-1762` 里，`.goal-rail` 的 max-height 是 `100vh − titlebar − 2·sp5`，560 高时是 468px。删掉的 `:has(.steer-console)` 规则原来还要再减 112px。
  - 右栏在 `.goal-body` 里吸顶，但 `.goal-body` 在吸底的引导框（`workbenches.css:253-264`）之前就结束了。560 高滚到底时，`.goal-body` 的底在 416px，也就是引导框顶部 440 减去 24 的外边距。
  - 468px 的右栏被包含块推到 −52。
  - **推断（只测了夹具里 516px 高的右栏和 80px 高的引导框）：**藏住的高度 ≈ 右栏高度 −（窗口高 − 196）。右栏到最大高度时，任何窗口高度都会藏 104px。引导框输入多行变高时会藏得更多。
- **测试的空子：**`flows.spec.ts:2083-2084` 只断言重叠为 0、右栏底边 ≤ 窗口高，不量顶边。只换回旧 `app.css` 也能通过。
- **为什么是 P3：**内容没丢，往回滚就能看到；只在短窗口的页面底部出现。但藏住的正好是合同摘要，而右栏存在的意义就是让它一直可见（`app.css:1752-1754` 的注释说 “the rail runs its full height and nothing covers it”）。
- **修复目标：**
  - 在 1281 和 1440 宽、560/640/900 高，滚到底时右栏顶边不低于吸顶位置，至少不低于标题栏底边。
  - 做法之一：把吸底的引导框放进 `.goal-main`，让 `.goal-body` 一直延伸到页面底部；
  - 做法之二：右栏的 max-height 在有引导框时扣掉框高和外边距。
  - 测试加上顶边断言。

#### [R18-P3-02] 按下 diff 某行 → ⌘⇧↩ → Esc，焦点跳到第 0 行（本轮暴露，机制既有）

- **复现：**
  1. 打开评审 G-0003，用鼠标按下 `src/cart/money.js` 的第 4 行。
  2. 按 ⌘⇧↩，验收弹层打开。
  3. 按 Esc 关闭弹层。
  4. 按 ↩ 或 ↓。
- **现象：**
  - Esc 之后焦点在第 0 行的行号按钮上。
  - 按 ↩ 在第 0 行打开评论框；按 ↓ 去第 1 行，不是第 5 行。
- **证据：**`$R/diff/54ba274/esc.txt`：`{"pressed":4,"next":"Enter","afterEsc":{"tag":"BUTTON","cls":"ln-btn","row":0},…,"composerRow":0}`。
- **原因：**
  - 弹层关闭时，焦点还给打开它之前的表格。
  - `FileDiff.tsx:129-132` 的 `onTableFocus` 把所有“不是鼠标带来的”表格焦点都当成 Tab 进入，挪到第一个 `.ln-btn`。这时鼠标早已松开，`pressed` 是 false。
  - `pressedRow` 还指着第 4 行，但焦点已经在第 0 行的按钮上，`onTableKey` 就从那里算起。
  - `onTableFocus` 在 `f9dd353` 里就有。`f9dd353` 上 ⌘⇧↩ 会开评论框（R17-P2-01），所以走不到这条路径。
  - 其他由键盘打开、会还焦点的弹层（比如 `?`），在旧提交上可能也有这个问题，没测。
- **为什么是 P3：**取消验收后按下的位置丢了，↩ 会在错的行开评论框。评论框看得见，也能取消，不丢数据。
- **修复目标：**焦点回到表格时，如果 `pressedRow` 还在，就留在表格上或落到 `pressedRow` 的行号。测试：按下第 4 行 → ⌘⇧↩ → Esc → ↩，评论框在第 4 行。

#### [R18-P3-03] 问题开着、命令在跑时，手机页头写“已沉默”，桌面写 “bash running”（既有；D186 让它成为稳定状态，推断链）

- **复现（构造夹具）：**一个运行中的目标，mode 是 `waiting_on_you`，needs_you 1，实况行是 bash `pnpm test`，5 分钟没有新事件。
- **现象：**
  - 手机页头：“1/3 running / silent for 5m”、“1/3 运行 / 已沉默 5m”，加提示标记。
  - 手机行徽章：“Needs you” / “等你”，正确。
  - 桌面标题栏，用实时 trace 事件驱动：问题和 bash 都开着，5 分钟后写 “bash running for 5m”。
  - 两端说法不一致，桌面是对的：命令确实在跑。
- **证据：**
  - `$R/phone/{54ba274,f9dd353}/question.txt` 的 `ask+bash 5min`，两个提交一样；截图 `phone/54ba274/question-ask-bash-5min-{en,zh-CN}.png`。
  - `$R/pulse/{tag}/log.txt` 的 “question beside a command”。
- **原因：**
  - 手机的 `busy(g)` 只看 mode 是不是 reading、editing、executing。mode 是 waiting_on_you 时，在跑的命令不算，页头就从实况行时间算沉默。
  - 桌面标题栏看的是 store 里在跑的调用（`store.ts` 的 `beat`）。
- **推断链：**
  - D186 的 Rust 测试 `while_a_question_is_open…` 证明：问题开着时，supervisor 一直是 WaitingOnYou，不管旁边开始或结束什么。
  - D186 之前，旁边的调用开始或结束会把 mode 设成 reading 或 executing，手机有时会读成“忙”。
  - 所以 D186 让这个状态变成了稳定的那一个。手机这一侧是用构造的夹具测的，没有接真实的 supervisor。
- **相关（既有，两个提交一样）：**桌面在长命令跑到一半时刷新。
  - 刷新后 store 里没有调用，标题栏写 “silent for 5m” 加提示标记，徽章写 “Silent”。
  - 手机（mode executing）写 “bash running for 5m” 和 “Working”（`$R/pulse/{tag}/log.txt` 的 “reload during a 5-minute command”）。
- **为什么是 P3：**行徽章“等你”是对的，这才是主要信号。页头的“已沉默”是中性色加提示标记，不是红色，但它把有命令在跑说成了没动静，而且两端矛盾。
- **修复目标：**
  - supervisor 在目标视图里发布“在跑的调用”，至少要有数量和最新那个的名字。
  - 手机页头和桌面刷新后的标题栏都按它判断忙不忙。
  - 测试：ask_user 加 bash 跑 5 分钟，两端都写 “bash running for 5m”。

#### [R18-P3-04] D171、D172 的证据测试 `review-keys.spec.ts:187` 不稳定（既有，测试）

- **现象：**
  - `--repeat-each=8 --workers=4` 单独跑：HEAD 8 次失败 4 次，`f9dd353` 8 次失败 1 次。这两次重复是同时跑的，机器有负载。
  - 用字体配置跑全量时，这是唯一一条失败（409/1）。
  - 规定命令的全量里它通过了。
  - 在 `54ba274` 上单独跑 review-keys、phone、resilience、flows，122 条全过。
- **失败信息：**`Expected: ""`，`Received: "import { mock } from 'node:test';"`（`$R/checks/flaky/rk187-{head,base}.log`）。
- **原因：**`review-keys.spec.ts:190-192` 只等 `.code` 可见，就读了一次 `innerText`。格子可见时文字还没填进去，读到空串，于是三击的断言期望空串。
- **为什么记成 P3：**
  - 这条测试从 `2cd8b3d` 起就有。但这一轮在里面加了 D171、D172 的断言，它就是这两项的证据。
  - 它一抖，作者的 “410/0” 就复现不了，真正的回归也可能被重试吞掉。
  - 4/8 对 1/8 的样本太小，不能说这一轮让它更抖了。
- **修复目标：**读之前先 `await expect(code).toHaveText(/\S/)`。

### 只做记录，不计入

1. **shots 的时机竞争：**`settled()` 不等引导框的懒加载块，也不等缩略图解码。`goal-G-0002` 的框时有时无，两个提交都会。`final-goal-deck-dark` 拍到空框。`final-review-theater` 的高亮着色原因没查明。
2. **log、submit、ask_user 开始时也会改写实况行：**`tower-store/src/events.rs:98-104` 对每个 ToolStarted 都写 live_line，直到 `settle_mode` 改回来，中间实况行会短暂写 “log”。
   - 既有。我的 pulse spec 想在桌面上看到这一刻，但发出去的目标更新没刷新目标页，没有看到。
3. **所有调用结束后，实况行仍写最后那个调用：**只有 ModeChanged 为 Idle 或 Settled 时才清空（同一文件 92-96 行）。既有。
4. **桌面的孤儿调用：**trace 里没有 agent_end 事件，桌面只在 run_ended 时清空调用。D179 说 supervisor 在 AgentEnd 清空，桌面这一侧做不到。既有。
5. **过期对话框（推测，只读了代码）：**
   - D186 让对话框开着时一直是 WaitingOnYou。
   - supervisor 忽略 `UiRequest.timeout`（tower-pi `protocol.rs`）。
   - 用户自己的扩展弹出一个带超时的对话框，超时关掉后，运行可能一直停在 WaitingOnYou。
   - Tower 自己的 ask_user 不设超时（`extensions/tower-goal/index.ts`），所以不受影响。
6. **docs/12 的记法：**§12.5.3 规则 8 写“琥珀 `!`”，§12.6.2 的表和全文 52 行（62 处）仍叫 `◆`；`■` 有 37 处，`◇` 有 63 处。第 333 行附近说明了这一列是记法，但同一个标记两个名字，读的人要自己对上。
7. **暗色 shimmer：**运行中的动作词静止时是灰度 144，不跑时是 211，运行停下的那一刻会跳亮。亮色峰值对比度约 1.96:1（既有）。
8. **引导框宽度跳变：**1280 是 984px，1281 是 613px（textarea 512px）。1440 是 772px，旧代码是 1144px。1800 是 908px。
9. **坏图框宽度：**175px（en）、140px（zh），和 152px 的占位框不一样宽。两个提交一样。
10. **高图放在桌面槽：**解码后从 152px 变成 59px，“改动后”左移 93px。真实的桌面截图都是 1280×800（`look.rs` 的 `Viewport::DESKTOP`，只有 bench 会改尺寸），作者已接受。
11. **包体余量只剩 10 B**（163,830 / 163,840）。
12. **红色清单没写全：**
    - GitHub 失败检查的 ✗1、合并队列的 “Conflict” 都是红色圆盘加 ×（`$R/shots/pairs/inbox-ci-head.png`、`ops-conflict.png`）。
    - §12.4.3 的红色清单没列这两种，最接近的条目是“观测到的失败（中性）”。
    - `Glyph.tsx:235` 的注释写了 “a failing check”，代码是有意这么做的。
    - 我在第 15–17 轮的报告里没找到对这两处的判断。这一轮没改，既有。
13. **390 宽中文：**“有保留，验收前先看：”有时单独占一行，是 keep-all 的副作用，可以接受。

---

## 新增和改写的测试是否测到了它声称的东西

### 换回旧源码后的结果（`$R/checks/oldsrc/`）

在 `54ba274` 的源码上，每次只换回一个修复的文件，或做一处单行变异：

| 换回或变异 | 跑的测试 | 结果 |
|---|---|---|
| `FileDiff.tsx` 换回 `f9dd353` | `review-keys.spec.ts` | 失败在 ⌘⇧↩ 之后评论框的数量，期望 0、实际 1。原因对 |
| `diffSelect.ts` 换回 `f9dd353` | 同上 | 失败在 “and the next file's”，缺 `function total(`。原因对 |
| 两个 CSS 都换回 | `flows.spec.ts:2059` | 失败 |
| 只换回 `workbenches.css` | 同上 | 失败 |
| 只换回 `app.css` | `flows.spec.ts` | 重叠测试**通过**。失败的 2 条是 shimmer（856）和缩略图（1067） |
| `Look.tsx` 换回 | `flows.spec.ts:1067` | 失败 |
| `ui.tsx` 换回 | `resilience.spec.ts` | 3 条失败 |
| `Honesty.tsx` 换回 | `flows.spec.ts:1440` | 失败，“检查： test/…” |
| `remote.html` 换回 `2d3eeb8` | `phone.spec.ts:335` | 失败，被 row 拦截点击 |
| `remote.html` 换回 `f9dd353` | `phone.spec.ts` | 2 条失败，“With caveats:” |
| `remote.html` 去掉 keep-all | `phone.spec.ts:529` | zh 失败 |
| `remote.html` 去掉标记置顶 | `phone.spec.ts:529` | en、zh 都失败 |
| `store.ts` 换回 `f9dd353` | `pulse.test.ts` | 4 条里 3 条失败 |
| `store.ts` 换回 `03999c0` | `pulse.test.ts` | 只有同一毫秒那条失败 |
| Rust：D174、D186 的换回和变异 | `cargo test --test flow` | 见上方“D174 的 Rust 证据”，每次都失败在声称的断言上 |

每次换完都已恢复，并用 `git status` 确认没有跟踪中的改动。

### 测试的弱点

- **`flows.spec.ts:2083-2084`：**只测重叠和右栏底边，不测顶边，所以放过了 R18-P3-01。只换回 `app.css` 也能通过。
- **`review-keys.spec.ts:187`：**
  - 开头读文字有时机竞争（R18-P3-04）。
  - ⌘⇧↩ 的断言只测打开，不测 Esc 之后焦点回到哪，所以放过了 R18-P3-02。
- **Rust `while_a_question_is_open…`：**不检查实况行。“`settle_mode` 不动实况行”的变异只有 `every_end…` 抓得到，两条合起来才完整。
- **`phone.spec.ts:529`：**标记对齐只测待验收行。运行行我测过，也修好了（−0.34px），但没有测试守着。
- **shots：**夹具的桌面截图改了比例，shots 不能单独证明 D180。

### 有没有削弱测试

没有发现。

- `rich.ts` 把默认的 `pageImage` 改成 1280×800。原来测“高图保持比例”的两条测试，改用 `enrichTallLook` 自带的高图，约束没有放松。
- `review-keys` 是扩展，没有删断言。

---

## 工程检查（日志在 `$R/checks/`）

| 检查 | 结果 | 日志 |
|---|---|---|
| pnpm | 没跑成：node_modules 是软链接，pnpm 报 “workspace hoist directory is not a real directory”。改为直接调用 package.json 里的命令 | `pnpm-attempt/` |
| `tsc --noEmit` | 0 错误 | `tsc.log` |
| vitest | 43 个文件、250 条全部通过 | `vitest.log` |
| 构建 | 通过 | `build.log` |
| 包体预算 | 总计 163,830 / 163,840（余 **10 B**）。启动 56,233 / 65,536；按需 107,597 / 110,592；目标页 11,589 / 12,288；worker 197,901 / 262,144。预算文件没改 | `bundle-budget.log` |
| 行数上限 | 0 处超限（`FileDiff.tsx` 779 行） | `line-limit.log` |
| 文档编号 | 0 处问题 | `doc-numbers.log` |
| `cargo fmt --all --check` | 干净 | `cargo-fmt.log` |
| `cargo test -p tower-supervisor -p tower-store -p tower-core` | 385 通过、0 失败、2 忽略。`CARGO_TARGET_DIR` 在 worktree 外 | `cargo-test.log` |
| e2e 全量（规定命令） | 405 通过、5 失败（smoke，字体 403）、76 跳过 | `e2e-full.log` |
| e2e 全量（字体配置） | 409 通过、1 失败（`review-keys.spec.ts:187`）、76 跳过 | `e2e-full-fonts.log` |
| shots（`shots.spec` + 手机预览） | 两个提交各 76 条通过、76 张 PNG | `shots-{54ba274,f9dd353}.log`、`$R/shots/diff.txt` |
| perf（`--project=perf --no-deps`，每棵树单独跑） | 2 条通过，数字见“作者说明的准确性” | `perf-{head,base}.log` |

76 条跳过的都是要设 `SHOTS` 才跑的截图测试。

---

## 没能覆盖的

- **打包好的应用：**按规定没有运行。结论都来自 Playwright WebKit 加 IPC stub，perf 是 headless WebKit 的数字。
- **D184 在 Safari 16 上：**macOS 13 不更新时，没有 modulepreload polyfill 的行为测不了。依据只有 `dist` 里只剩一个 modulepreload 链接，以及本地磁盘加载的推理。
- **`03999c0`：**没有单独构建，D184 行里的 163,813 B 没有核对。
- **`@` 弹层：**在 1281 宽下我的探针没打开它（`$R/rail/54ba274/box.txt` 里 `atPopover: null`，截图里只有输入的 “@”），它和右栏的关系没评。
- **右栏：**
  - 只量了页面顶部和底部，没量滚到一半时的位置。
  - 只测了夹具里 516px 高的右栏和单行的引导框；更高的右栏、多行输入是推断。
- **R18-P3-02：**在旧提交上用其他快捷键弹层（比如 `?`）会不会出现，没测。
- **桌面目标页的徽章：**我发出的目标更新没有刷新目标页，原因没查明，所以只用了标题栏的结论。“log 开始时实况行改写”没在屏幕上看到。
- **并行工具和 ask_user：**没用真实的 pi 跑。依据是 `fake_pi` 的 flow 测试加读代码；手机一侧用的是构造的夹具。
- **手机：**没有真机，也没有真实的 SSE 流。
- **桌面诚实语法：**没跑全状态矩阵，依据是 diff、76 对 shots 和这一轮的专项 spec。
- **shots 的时机差异：**只对 `goal-G-0002` 重跑了；`final-goal-deck-dark` 和 `final-review-theater` 在清理服务之后才注意到，没重跑。
- **D180：**“去掉手机规则”的变异没跑。
- **读屏软件：**没有用真实的读屏软件。
- **对照 Primer、Geist、Linear：**凭对它们公开设计的了解，没访问外部网站。

---

## 验收条件

这一轮 **PASS**（8.47/10），没有阻塞项。

**建议下一轮做：**

1. **R18-P3-01（优先）：**
   - 滚到底时，右栏顶边不进标题栏。
   - `flows.spec.ts` 的右栏测试加上顶边断言，至少覆盖 1281 和 1440 宽、560 和 640 高。
2. **R18-P3-02：**
   - 焦点回到表格、`pressedRow` 还在时，不挪到第一行。
   - 加 e2e：按下第 4 行 → ⌘⇧↩ → Esc → ↩，评论框在第 4 行。
3. **R18-P3-04：**`review-keys.spec.ts:190-192` 等到文字非空再读。修好后，再用 `--repeat-each` 在有负载的情况下确认。
4. **R18-P3-03：**
   - supervisor 在目标视图里发布在跑的调用，手机页头和桌面刷新后的标题栏都按它判断忙不忙。
   - 测试：ask_user 加 bash 跑 5 分钟，两端说法一致。
5. **可以顺手做的（只做记录的几项）：**
   - docs/12 统一琥珀 ! 的记法；
   - 红色清单补上 GitHub 失败检查和合并冲突，或改成中性；
   - 坏图框改成和占位框一样宽；
   - shots 的 `settled()` 等懒加载块和图片解码；
   - 守住 10 B 的包体余量。
