# Tower 前端设计评审：第 17 轮（`f9dd353`，对照 `2d3eeb8`）

> 文中 `$R` 指 `/tmp/tower-design/review17`，截图、日志和测量都在这里。
> - 临时 spec 已从 worktree 删除，副本在 `$R/checks/specs/`。
> - 工程检查日志在 `$R/checks/`；换回旧源码的结果在 `$R/checks/oldsrc/`。

**结论：PASS。** 加权得分 **8.45/10**（8.450），没有未关闭的 P0、P1。

**第 16 轮的 5 条 P3 全部修好：**

- **R16-P3-01：**手机页沉默行的徽章现在是 text-2、字重 400、不画字形。
- **R16-P3-02：**docs/12 的引用改成了 §12.4.3。
- **R16-P3-03：**手机空状态只写一句话，不再画灰色幽灵行。
- **R16-P3-04：**留出名单复制出来带分隔符；两个 pin 能各自完整复制。
- **R16-P3-05：**手机上“带保留的通过”有缺口环、切角印章和保留理由。

每一条我都先在 `2d3eeb8` 上复现，再在 `f9dd353` 上确认。

**这一轮做得好的地方：**

- **shimmer：**光带经过时，每个字母至少还保留 39–42% 的墨，旧代码只有 0.6–3.3%。亮色下读起来是被照亮，不再是逐个熄灭。
- **标题栏：**最后一个裸灰点没了。各读数的标记大小、墨色一致。
- **截图缩略图：**解码前保持 3:4 的页面框，不再塌成 2px 的竖线。
- **引导输入框：**懒加载失败时，原位写“没能加载”，并有“重试”。
- **并行工具调用：**两个调用并行时，一个结束不再把运行打回 thinking。
  - Rust 测试在旧逻辑下得到 `[Thinking]`，我自己重跑确认了。
  - 桌面的 pulse 测试在旧 `store.ts` 上也失败。
- **手机“暂停”按钮（作者没有提）：**
  - 在 `2d3eeb8` 上，这个按钮是 `pointer-events: none`，点了没反应。原因是 `.ghost` 规则同时命中了 `btn ghost`，这个缺陷从 `ba94b1b`（2026-10-27）起就存在。
  - 这一轮删掉 `.ghost` 规则，顺带修好了它。现在点一下会进入“再按一次”的确认状态。
  - 没有任何测试点过这个按钮，前几轮评审也没有发现。

**新问题：**

- **R17-P2-01（本轮引入，D163）：**
  - 在 diff 里用鼠标按下某一行，再按验收快捷键 ⌘⇧↩：验收弹层打开，同时那一行的评论框也打开。
  - 焦点落在弹层后面的评论框里。这时打字会进评论框，按 ⌘↩ 会存下一条评论草稿，再按 Tab 焦点继续留在弹层外面。
  - 在 `2d3eeb8` 上同样的操作只打开弹层，焦点在弹层里。
- **R17-P3-01（本轮引入，D163）：**diff 的多行复制在两种拖选下会静默丢内容：
  - 分栏视图里，从空着的左栏开始拖：剪贴板里只有换行。
  - 跨两个文件拖：第二个文件那部分被丢掉。
  - 旧代码用浏览器原生复制，这两种情况内容都在。
- **R17-P3-02（既有，D167 只修了一部分）：**
  - 窗口 1440×560 和 1440×640，页面还没滚动时，目标页右栏最下面的 58px 仍压在引导输入框下面。旧代码是 150px 和 141px。
  - 新加的测试只断言 max-height 变小，没有量几何位置。
- **R17-P3-03（既有，D169 没覆盖）：**
  - 回答 ask_user 时，如果另一个工具调用还在跑，supervisor 仍把 mode 设回 Thinking（`control.rs:313-315`）。
  - DELIVERY §15 写的是“两个调用在跑时，直到最后一个结束都算忙”，这条路径不成立。

---

## 评审范围

- **环境**
  - 被评审 worktree：`/tmp/tower-design/wt-review17`（`f9dd353`，detached），vite 跑在 1441。
  - 对照 worktree：`/tmp/tower-design/wt-review17-base`，从 `2d3eeb8` 建立，vite 跑在 1442。node_modules 照被评审 worktree 建成符号链接。用法分三步：
    1. 在 `2d3eeb8` 上跑对照截图和探针。
    2. 把 HEAD 的新测试拷到 `2d3eeb8` 的源码上跑（A 组）。
    3. 切到 `f9dd353`，把单个文件逐个换回 `2d3eeb8` 的版本再跑（B 组），Rust 的 `events.rs` 和 `run/mod.rs` 一起换。每换一次都恢复，并用 `git status` 确认没有残留。之后切回 `2d3eeb8`，补跑暂停按钮、右栏和 ⌘⇧↩ 三个探针。
  - 浏览器：Playwright WebKit（Desktop Safari）。桌面 DPR 2；手机页 DPR 3，宽 390、360、320。
  - 数据：Tauri IPC 用 stub，fixtures 是 `/tmp/tower-design/fixtures{,-zh}`。
  - 覆盖：
    - 标题栏的测量覆盖 1040、1241、1440、1800。
    - 右栏几何在 1040×640、1241×760、1440×560、1440×640、1440×900 下测。
    - shots 里有 1100 和 1800 两档。
    - en、zh，亮色、暗色都看了。
- **字体：**
  - 按规定命令跑全量 e2e，字体请求被拒（403），`smoke.spec` 有 5 条因此失败。
  - 所以测量、截图、第二次全量 e2e、shots、perf 都跑在 `$R/tools/vite.review.config.mjs` 上。这个配置原样导入生产配置，只把主 checkout 的 node_modules 加进 `fs.allow`。
  - 依赖缓存放在 `$R/vite-cache`，结束时已删除。
- **pnpm：**
  - `pnpm` 报 “workspace hoist directory is not a real directory”，因为 node_modules 是符号链接。失败记录在 `$R/checks/pnpm-attempt/`。
  - 所以我直接调用 package.json 脚本里的同一个二进制（`$R/checks/run-checks.sh`）。
- **cargo：**`CARGO_TARGET_DIR` 指向 worktree 外的 `$R/cargo-target`，结束时已删除。worktree 里没有生成 `target/`。
- **手机页：**
  - 没有起静态服务。照 `phone.spec.ts` 的做法，用 `page.route` 把磁盘上的 `remote.html` 送出去，`/api/state` 用构造的数据回答。
  - 空状态用 `goals: []` 的数据。
- **引导输入框加载失败：**用拦截模块请求的办法模拟。
- **清理：**
  - 两个 worktree 里的 `tmp-review17-*` 都已删除，`dist/`、`test-results/` 也已删除。
  - 1441、1442 的 vite 已停，1441–1443 现在都没有监听。
  - 对照 worktree 已用 `git worktree remove --force` 删除；`git worktree list` 只剩主 checkout 和 wt-review17。
  - `git -C /tmp/tower-design/wt-review17 status --short --ignored` 只剩两个 node_modules 符号链接。
- **主 checkout：**我只对它执行了 `git worktree add/remove`。它的 `git status` 只有一个未跟踪的 `.claude/app/`，不是我加的。

---

## 加权评分

| 维度 | 权重 | 分数 | 理由 | 加权 |
|---|---|---|---|---|
| 产品适配 | 15% | 8.5 | 离开电脑时，手机能分清“干净的通过”和“带保留的通过”；手机上终于能暂停；并行工具不再误报沉默。扣分：回答 ask_user 时另一个调用还在跑，运行会回到 thinking（R17-P3-03）。 | 1.275 |
| 信息架构与工作流 | 20% | 8.4 | 空状态是一句话；复制出来的内容可以直接用；按下某行后 ↩ 就评论这一行。扣分：验收是评审的主路径，按下某行后按验收快捷键，会同时打开评论框（R17-P2-01）；跨文件复制会丢内容。 | 1.680 |
| 视觉层级 | 15% | 8.6 | 手机沉默徽章退后一级；标题栏没有裸点；320 宽下 meta 行会折行，不再把文字挤没。扣分：“待验收”里多了一枚琥珀 !（保留理由），和“需要你”的条目是同一个标记；1440×560 下右栏底部压在引导框下。 | 1.290 |
| 原创性与产品身份 | 15% | 8.5 | 缺口环和切角印章在手机上 12px 依然清楚；shimmer 像一束光。扣分：暗色下光带读起来更像变暗。 | 1.275 |
| 工艺与排版 | 10% | 8.5 | shimmer 下每个字母都有墨；缩略图先占 3:4 的框。扣分：缩略图解码后宽度从 72px 跳到 59px；中文保留理由断在“测试运/行器”中间；中文留出名单的冒号后多一个空格；引导框失败时原样显示英文异常。 | 0.850 |
| 密度与克制 | 10% | 8.6 | 手机幽灵行全删；标题栏少了一个点。 | 0.860 |
| 交互 | 10% | 8.1 | 修好的：↩ 评论、最后一行按 ↓ 落在行号上、三击 +/− 列选中代码、三击空白行不选、拖选保留空行；手机暂停能按。扣分：R17-P2-01 焦点跑出模态、能误存评论；R17-P3-01 复制静默丢内容。 | 0.810 |
| 设计系统一致性 | 5% | 8.2 | 沉默徽章两端统一；D170 清掉陈旧措辞；docs 补了空状态规则。扣分：同一个“带保留”状态，手机用琥珀，桌面看板不着色（docs 有明文例外）；活动行写的是最后开始的工具，忙碌状态却取最早的调用。 | 0.410 |
| **合计** | 100% | | | **8.450** |

---

## 负责人意见（标记、动效、劣质 UI）的总体评价

负责人的原话：“我不喜欢现在的红色方块⬛️，黄色菱形◆和蓝色圆形这三个UI，以及其他地方出现的这种劣质UI和审美，请你注意这一点并进行全面的纠正”。

**点名的三种标记：**没有退回去。

- 在 `apps/desktop/src`（不含测试）和 `remote.html` 里，■ □ ◆ ◇ ○ ◐ ◑ ▲ △ ⬛ ✓ ✕ • 都是 0 处。
  - ● 只有 1 处，在 `Glyph.tsx:155` 的注释里。
  - × 只出现在注释和 “3×” 这种倍数写法里，没有拿来当标记。
  - 统计在 `$R/charscan/counts.txt`、`hits.txt`。
- 中点 · 只出现在三处：注释、标准条（`HonestyCore.tsx`）、预算行（`zh-CN.later.ts:669`），都是 docs 允许的。
- 运行标记仍是淡环加一段弧。标题栏的运行标记是 12px（1440 宽、未旋转时 12×12）。
- docs/12 §12.5.2 用 `▲*` `●*` 之类的符号给标记起名字，这只是记法，不是界面上画出来的东西。

**这一轮清掉的“劣质感”：**

- **标题栏最后一个裸圆点没了：**
  - 引擎读数现在只写 “Pi”（`$R/titlebar/{f9dd353,2d3eeb8}/log.txt` 里 dots 从 1 变成 0）。
  - 截图 `$R/titlebar/stack-right.png`。
  - 这和 Geist 的做法一致：状态点必须有颜色、有含义，没含义的灰点就删掉。
- **手机空状态：**每个标题下写一句话，配中性小环，不再画假行。这和 Primer 的 Blankslate 是同一种写法（`$R/phone/empty-{f9dd353,2d3eeb8}.png`、`$R/shots/pair-phone-heldout-en-light.png`）。
- **shimmer：**冻结在峰值时，4 个词（短的和长的）在亮色、暗色下都保留 0.392–0.420 的墨，旧代码是 0.006–0.033。
  - 证据：`$R/shimmer/{tag}/log.txt`、`*-peak.png`。
  - 放大图：`$R/shimmer/zoom-short.png`、`zoom-long.png`。
- **截图缩略图：**解码前是 72×96 的 3:4 框，不再是 2px 的竖线（`$R/look/stack.png`）。
- **手机带保留的通过：**12px 的缺口环和切角印章，在 DPR 3 下缺口清楚，亮色、暗色都能分辨（`$R/phone/zoom-marks-{light,dark}.png`、`$R/phone/f9dd353/mark-qual-*.png`）。

**还剩下的：**

- **琥珀密度：**“待验收”里，带保留的行多了一枚琥珀 !。它和“需要你”里每张卡片的标记一模一样，见下文 D161 的判断（`$R/phone/crop-ready-zh-dark-320.png`）。
- **暗色 shimmer：**光带峰值是 60% 的底色。暗色下，底色比字暗，所以光带经过时读起来像字变暗，不像被照亮。只做记录。
- **缩略图解码后变窄：**从 72px 跳到 59px。旁边的“改动后”框跟着往左移（`$R/look/{tag}/log.txt`）。Linear 和 GitHub 的做法是按最终比例预留空间。只做记录。
- **引导框失败态：**直接显示 “Importing a module script failed.”，中文界面也是英文。Linear、Geist 的错误态是一句人话加一个动作。只做记录。

**对照 Primer、Geist、Linear：**

- 模态对话框打开时，焦点必须在对话框里，背景不能接收输入（Primer Dialog 的做法）。R17-P2-01 打破了这一点。
- GitHub 的 diff 把 +/− 放在 CSS 伪元素里，不进选区，所以靠浏览器原生复制就对。Tower 改用 copy 事件重写剪贴板，在边缘的拖选下会丢内容（R17-P3-01）。

---

## 作者说明的准确性，以及保留项与取舍

| 说法 | 判断 |
|---|---|
| 作者的数字：vitest 43/248、e2e 407/0、包体 163,810/163,840、cargo 212 通过 2 忽略、rustfmt 干净 | 与我量到的一致。shots：作者写 69/69，那是 `shots.spec` 一个文件的数；我同时跑了手机的预览，所以是 95 条通过、各出 76 张图。 |
| 第一次跑门禁时包体超了 113 B、`FileDiff.tsx` 超过 800 行；改紧凑了，预算没改 | 属实。`tools/` 这一轮没有改动，`FileDiff.tsx` 现在 777 行。包体只剩 **30 B** 余量，下一轮任何修复都要守住预算。 |
| 改紧凑的 `beat`、`HeldOutFiles`、`Look` 没有改变行为 | 属实。`pulse.test` 在旧 `store.ts` 上失败、新代码上通过；我的复制探针和缩略图探针结果都对。 |
| 改紧凑的 `onTableKey` 没有改变行为 | 有问题。新加的 ↩ 分支不看修饰键，导致 R17-P2-01。旧代码在表格上根本不处理 ↩。 |
| D169：“桌面和 supervisor 都显示最早的那个调用” | 两个调用、其中一个结束的情形属实。但回答 ask_user 的路径没有覆盖（R17-P3-03）。另外两端的活动行文字取的是最后开始的工具，见下面 D169 的表。 |
| DELIVERY §15 补了一句 D169 | 属实（DESIGN_DELIVERY 第 72–73 行）。“直到最后一个结束都算忙”在 ask_user 路径上不成立。 |
| 没有说的 | 删除 `.ghost` 规则顺带修好了手机的暂停按钮：`$R/pause/2d3eeb8.txt.txt` 是 `pe: none`、点了还是 “Pause”；`$R/pause/f9dd353.txt.txt` 点一下变 “Press again”。DESIGN_REVIEW 里没有这一条 D 行，也没有测试守着。 |

---

## D157–D170 逐项核实

| 编号 | 作者的说法 | 判断 | 我的证据 |
|---|---|---|---|
| D157 | 手机沉默徽章是 text-2、字重 400、不画字形；提示标记只在页头出现一次；docs 写明标题栏、页头、行三处 | 已修复 | 运行行：`$R/phone/f9dd353/log.txt` 里 Silent／已沉默 的徽章是 `ink t2, weight 400, svg false`，en/zh、亮暗、三种宽度都一样；旧代码是 t1、500、带标记。页头：沉默时 `marks: 2`（运行环加提示标记），忙时 1（`header-silent-*.png`、`header-busy-*.png`）。docs/12 第 380 行。 |
| D158 | docs 的引用改成 §12.4.3 | 已修复 | docs/12 第 380 行附近已改。全文搜 `§12.2` 没有误引。 |
| D159 | 空状态一句话，不画替身行；docs 补一段，桌面和手机一样 | 已修复 | `$R/phone/empty-{f9dd353,2d3eeb8}.png`、`$R/phone/f9dd353/empty-*.png`；shots 对比 `$R/shots/pair-phone-heldout-en-light.png`（旧代码在“运行中 0”下面画了灰条）。docs/12 第 536 行。 |
| D160 | 留出名单带分隔符；两个 pin 拆开，三击任一个复制出完整的 pin | 已修复 | `$R/select/{tag}/log.txt`。en 三击得到 `rounding.test.js, tax.test.js`，zh 是 `、`，旧代码粘在一起。pin：左右各三击得到 `@69a9769`、`@15085f2`；三击箭头什么也不选；拖选得到 `@69a9769\n@15085f2`。旧代码是 `@69a9769@`。 |
| D161 | 带保留的通过：缺口环和切角印章、“已验证（有保留）”、下一行琥珀 ! 加保留理由；docs §12.5.3 第 8 条 | 已修复（琥珀 ! 的判断见下） | `$R/phone/f9dd353/log.txt`：三种带保留的行都是 GREEN + 琥珀，`dash 21.53 3.6`，理由行 t1。证据图：`ready-*-{320,360,390}.png`、`mark-qual-{ring,seal}-*.png`、`$R/phone/zoom-marks-*.png`。 |
| D162 | 320 宽下“待验收”的 meta 行折行，不再把“回到 Mac 上评审”挤成 0 宽 | 已修复 | HEAD 有 0 行溢出、0 个宽度为 0 的 detail；旧代码 en 320 亮暗各 1 行（`$R/phone/{tag}/log.txt`）。390 宽下，旧代码把 “Review a…” 截断，HEAD 正常折行（`$R/shots/pair-phone-en-light.png`）。中文的副作用见“只做记录”。 |
| D163 | ↩ 评论按下的那一行；最后一行按 ↓ 落在行号上；三击 +/− 列选中代码、三击空白行不选；拖选按每行代码复制、空白行保留、不带 +/− | 已修复，但引入 R17-P2-01 和 R17-P3-01 | `$R/diff/{tag}/log.txt`。↩ 打开第 2 行的评论框（旧代码没反应）；最后一行 ↓ 落在 #6（旧代码 -1）；↓↓↑ 依次是 3、4、3；三击符号列得到代码（旧代码是空串）；三击空白行为空（旧代码选到下一行）；拖选跨过空白行时留 `\n\n`。 |
| D164 | 光带峰值改成 60% 底色，每个字母至少保留 30% 的墨 | 已修复 | 最少的墨 0.392–0.420，旧代码 0.006–0.033（`$R/shimmer/{tag}/log.txt`、`$R/shimmer/zoom-*.png`）。暗色的观感见“只做记录”。 |
| D165 | 引擎读数去掉圆点；未就绪、手机页已关和错误计数一样用 text-1 | 已修复 | dots 从 1 变成 0（`$R/titlebar/{tag}/log.txt`）；`$R/titlebar/stack-right.png`。把 `app.css` 换回旧版后，`.gauge-phone` 的墨是 `oklch(0.43…)`，不是 text-1，测试失败（`$R/checks/oldsrc/b-appcss.log`）。 |
| D166 | 解码前保持 3:4 的页面框 | 已修复 | 等待时 72×96，解码后 59×96；旧代码 2px（`$R/look/{tag}/log.txt`、`$R/look/stack.png`）。 |
| D167 | 加载失败原位写“没能加载”加重试；右栏规则改成 `:has(.steer-console)`，删掉死规则 | 失败态已修复；右栏部分修复（R17-P3-02） | 失败态：`$R/steer/f9dd353/log.txt` 写 “Couldn't load this / Importing a module script failed. / Retry”，旧代码什么都没有（`failed: 0`）。截图 `$R/steer/fail-*.png`、`$R/steer/fail-en-light-half.png`。`resilience.spec:24` 在旧 `GoalPage.tsx` 上失败。右栏：`$R/regress/{tag}/rail.txt`、`rail2.txt`。 |
| D168 | 路径里的 `tests/C1/…`、文件名 `C2.test.js` 不算标准编号；“C2: …” 仍算 | 已修复 | 新正则 `/(^|[^\w/])(C\d+)(?![\w/]|\.\w)/g`（`ext.ts`）。把 `ext.ts` 换回旧版，GoalDeck 测试失败在 “tests/C2/cart.test.js asserts nothing now” 被算给了别的标准（`$R/checks/oldsrc/b-ext.log`）；新代码通过（`$R/checks/vitest.log`）。 |
| D169 | 并行调用中一个结束时，mode 取最早仍在跑的那个；桌面一样 | 部分修复（两个调用、一个结束的情形已修好；ask_user 路径见 R17-P3-03） | 把 `events.rs` 和 `run/mod.rs` 一起换回旧版，`a_tool_still_in_flight…` 失败，得到 `left: [Thinking] right: []`（`$R/checks/oldsrc/b-rust.log`）。把 `store.ts` 换回旧版，`pulse.test` 失败（`b-store.log`）。分情形见下表。 |
| D170 | DELIVERY §3、DESIGN_REVIEW Direction 不再写琥珀 ◆，重叠提示不再写 ◇ | 已修复 | 两处 Signature 都改成 “the amber ! mark…（an amber ◆ until D119）”。剩下的 ◆／◇ 都在 D 行的历史记录里，或者是“stale ◆ and ◇ words go”这种说明。 |

**D161：保留理由用琥珀 !，是否符合“琥珀 ! 表示需要你 / 先看这里，从不表示证据”？**

结论是**符合，但手机上缺了一句话**，判为保留合理，另记一条记录。

- **符合的理由：**
  - 证据仍然是绿色的切角印章和 pin；琥珀 ! 只放在理由那一行前面，意思是“验收前先看”，没有拿琥珀表示证据。
  - docs/12 §12.5.3 第 8 条明文写了手机上的这个画法（“验收前先看，与验收弹层的待看清单相同”）。
  - 桌面验收弹层对同一项用的也是 `NeedsYouMark`（`views/review/panels.tsx:231-249`）。
- **不足的地方：**
  - 手机那一行只写“有保留：……”，没有写“验收前先看”。只看手机的人不知道这个琥珀要他做什么，容易读成警告。
  - 同一个目标在桌面看板行和评审卡上，保留只放在印章的提示里，不着色（`Live.tsx:168`、`DecisionCard.tsx:337`）。所以同一个状态，手机是琥珀，看板是中性。
  - §12.5.2 写的是保留以中性药丸出现在证据条上。第 8 条说“不另立规则”，但实际上为手机另立了一条。

**D169 分情形核实**（读 Rust 和 `store.ts`，再对上 `fake_pi` 的测试）：

| 情形 | supervisor 的 mode | 桌面 pulse（`store.ts:342-356`） | 手机 | 判断 |
|---|---|---|---|---|
| bash 和 read 并行，read 先结束 | `events.rs:134-145` 取最早仍在跑的 bash，得到 Executing；旧代码得到 Thinking | `calls` 里还剩 bash，取最早的，所以还算忙 | `busy(g)` 看 mode，算忙。但行里的文字是 `live_line`，也就是最后开始的那个工具（已经结束的 read），因为 `tower-store/src/events.rs:98` 只在 ToolStarted 时写 | 已修复。文字和徽章可能各说各的，只做记录 |
| 先开始的先结束 | 取剩下那个工具的 mode | 同上 | 同上 | 正确 |
| 三个以上的调用 | 开始时取最新的（`events.rs:392-394`），结束时取最早的，两边策略不对称 | 取最早的 | 同上 | 只会在“读／执行”这类忙碌词之间切换，不会误报沉默。只做记录 |
| ask_user 和 bash 并行，用户回答 | `control.rs:313-315`：对话框清空就设成 Thinking，不看还有没有调用在跑 | `calls` 里还有 bash，算忙 | mode 是 thinking，两分钟后显示“已沉默” | **R17-P3-03**（既有，这一轮没碰 `control.rs`）。桌面和手机在这里说法不一 |
| 用户已回答，但 ask_user 的 ToolEnd 还没到，bash 先结束 | `tools` 里还有 ask_user，又被设回 WaitingOnYou | 不受影响 | 显示“需要你” | 窗口很短。只做记录 |
| log、submit | 开始和结束都不改 mode | 会计入 `calls`，所以 `p.tool` 可能是 log | 不受影响 | 基本无害。只做记录 |
| run_ended | 结束时 mode 变成 Settled 或 Idle（`events.rs:553`、`565`） | 清空 `calls` | 一致 | 正确 |
| engine_error | `ExtensionError`（`events.rs:205-212`）记一条 engine_error，但不结束任何调用，mode 不变 | 清空全部 `calls`（`store.ts:350`；旧代码第 345 行也这样） | 仍算忙 | 既有，桌面和手机不一致。只做记录 |
| 引擎没发 ToolEnd 就断了 | `tools` 表只在 ToolEnd 时删除（`events.rs:85`），AgentEnd、Settled 都不清空 | — | — | 理论上可能留下陈旧的调用。只做记录 |
| 未知工具 | `Mode::for_tool` 会返回 Thinking | — | — | 实际碰不到：`tower-pi/src/engine.rs:24` 的 `TOOLS` 加上 `--no-mcp` 限定了工具集 |

---

## 诚实语法

- **绿色只给验证器，并且总带 pin：**
  - **手机“待验收”：**8 种行 × en/zh × 亮暗 × 三种宽度（`$R/phone/f9dd353/log.txt` 的 `painted`）。
    - 画绿色的只有三种：算数的通过，和三种带保留的通过。每一行都带 `@15085f2`。
    - “不作数”只有琥珀。
    - 三种行是中性 t3：没有机器验证、有机器标准但没有 pin、没有摘要的卡片。
  - **桌面：**这一轮的 diff 没有改任何绿色的用法。76 对 shots 里，有差异的地方都对得上这一轮的改动或者渲染时机（见回归检查）。
  - 注意：桌面这一项没有像第 16 轮那样跑 320 种状态的矩阵，依据的是 diff 加 shots。
- **琥珀 ! 只表示“需要你 / 先看这里”：**
  - 手机上等你的行、不作数的行用琥珀 !，符合。
  - 保留理由的琥珀 !，判断见 D161。
  - 标题栏没有新增琥珀。
- **红色只用于 §12.4.3 的清单：**这一轮没有改红色。第 16 轮记录的墨色不一致已经统一：未就绪、手机页已关现在和错误计数一样用 text-1。
- **“要注意但不需要你决定”用 text-1 加不着色的提示标记：**手机页头的沉默有一个提示标记，行里的徽章不再画。符合。
- **沉默徽章：**text-2、字重 400、无字形，桌面和手机一致（D157）。
- **中点只在标准条和预算行：**符合（charscan）。
- **Agent 的话不画绿色、GitHub 检查数不用验证器的绿色：**这一轮没有触及，shots 里也没有变化。

---

## 回归检查（对照 `2d3eeb8`）

**shots：**两个提交各 76 张，阈值 24，结果在 `$R/shots/diff.txt`。

- 24 张完全相同，52 张有差异，每一类我都看过：

| 有差异的 | 张数 | 原因 |
|---|---|---|
| 只有标题栏那一条（y 40–66）有差异 | 44 | 去掉了引擎圆点（D165），加上时间读数本身在变 |
| 手机页尺寸变了 | 5 | meta 行折行（D162）、沉默徽章不再画标记（D157）、删掉了幽灵行（D159）。我看了 `pair-phone-en-light.png` 和 `pair-phone-heldout-en-light.png`，另外 3 张只按尺寸判断 |
| final-goal-deck-dark | 1 | 标题栏，加上 C4 缩略图：HEAD 截在解码之前（空的 3:4 框），旧代码截在解码之后。是截图时机，不是回归（`$R/shots/pair-final-goal-deck-dark.png`） |
| final-review-theater 亮、暗 | 2 | 一行 diff 的语法高亮还没到。高亮 worker 的时机，不是回归（`$R/shots/pair-final-review-theater-light.png`） |

- 这些图覆盖了评审页、目标页、看板、收件箱、peek、验收弹层、合同编辑器、Operations、欢迎页、设置、手机页，没有发现变差。

**diff 键盘：**

- Tab 进入落在第一行的行号；↓↓↑ 依次是 1、2、1；在行号上按 ↩ 打开评论；点行号也打开评论。两个提交一样（`$R/diff/{tag}/log.txt` 的 keys 一项）。
- review-keys 原有的测试在全量 e2e 里都通过。
- 回归的地方在 ⌘⇧↩，见 R17-P2-01。

**右栏高度（D167）在其他状态下：**

- in_review（G-0001、G-0003）、paused（G-0004、G-0005）这些状态没有引导框，两个提交的 max-height、位置、是否滚动完全相同（`$R/regress/{tag}/rail.txt`）。
- 1040 和 1241 宽时右栏不是粘性的，两个提交也一样。
- 只有 running 状态（G-0002）有变化，见 R17-P3-02。滚到底以后，HEAD 的右栏完整可见（顶 32px，底 408px，引导框从 432px 起）。旧代码的顶部是 -60px，有 60px 跑出了视口（`$R/regress/{tag}/rail2.txt`）。

**手机页：**运行行、页头、离线、等你、留出卡片都没有变差。暂停按钮从点不动变成能点。

**全量 e2e：**407 通过、0 失败（字体配置）。

---

## 新问题清单

### P0

无。

### P1

无。

### P2

### [R17-P2-01] 按下 diff 的某一行后按 ⌘⇧↩：验收弹层和评论框一起打开，焦点留在弹层后面（本轮引入，D163）

- **重现：**`review/G-0003`，1600×1000，DPR 2。在 `Money in whole cents` 那个文件第 2 行的代码上单击一下，然后按 ⌘⇧↩。
- **现象：**
  - 验收弹层打开（“Accept G-0003”），同时第 2 行下面打开了评论框。焦点在评论框的 textarea 里，不在对话框里（`focusInDialog: false`）。
  - 打一个 “x”，它进了弹层后面的评论框。
  - 按 ⌘↩，这条评论被存成草稿（`inlineComments` 从 0 变成 1），弹层还开着，焦点掉到 BODY。
  - 再按 Tab，焦点落到弹层后面的行号按钮上。
  - 按一次 Escape 关掉弹层，那条误存的评论草稿还在。
  - 在 `2d3eeb8` 上做同样的操作：只打开弹层，焦点在 `DIV.panel`，打字没有效果，Tab 落在弹层里的 `INPUT.identity-name`。
  - ↩ 加任意修饰键（⌘↩、⇧↩、⌥↩），按下某行后都会打开评论框，旧代码都没有反应。
  - 焦点在行号按钮上（Tab 进入再按 ↓）时按 ⌘⇧↩，两个提交都只打开弹层。所以只有“鼠标按下某行”这条路径有问题。
- **证据：**
  - `$R/diff/{f9dd353,2d3eeb8}/accept-probe.txt`、`accept-probe-after-modenter.png`；
  - `$R/diff/{tag}/accept-after-press.png`、`$R/diff/accept-after-press-{f9dd353,2d3eeb8}-half.png`；
  - `$R/diff/{tag}/log.txt` 里的 `"key":"accept"`、`meta-enter`、`shift-enter`、`alt-enter`。
- **原因：**
  - `views/review/FileDiff.tsx:138` 不检查修饰键：`if (e.key === "Enter") return void (onTable && btn && (go(btn), btn.click()));`。
  - 窗口上的快捷键层（`lib/keys.ts`）不看 `defaultPrevented`，所以照样执行 `Review.tsx:449` 的 `mod+shift+enter`（`inInputs: true`）。
  - 评论框拿到焦点的时间晚于弹层的初始聚焦（`components/ui.tsx` 的 Panel）。焦点一开始就在弹层外面，`trapTab` 就管不住了。
- **为什么是 P2，不是 P1：**
  - 验收本身不会被触发，结论也不会被改错。误存的只是一条本地评论草稿，看得见，也能删；Escape 就能恢复。
  - 但 ⌘⇧↩ 是这个产品最主要的决定快捷键，验收按钮上（`Review.tsx:549`）和页脚（`Review.tsx:723`）都标着它。而按下某一行是评审时最常见的动作。
  - 焦点跑出模态对话框，是基本的可访问性缺陷。
- **修正目标：**
  - `onTableKey` 只处理不带修饰键的 ↩（`!e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey`）。
  - 加一条 e2e：按下某行后按 ⌘⇧↩，只开弹层，焦点在弹层里，没有评论框；不带修饰键的 ↩ 仍然评论这一行。
  - 包体只剩 30 B，要在预算内改。

### P3

### [R17-P3-01] diff 的多行复制在两种拖选下静默丢内容（本轮引入，D163）

- **重现 1（分栏）：**
  - 在 `review/G-0003` 按 ⌥V 切到分栏视图。cart 是新文件，所以左栏是空的。
  - 从第 3 行的左栏空白处拖到右栏第 4 行的代码里，按 ⌘C。
- **重现 2（跨文件）：**单栏视图，从第一个文件的 `return fromCents…` 拖到第二个文件的 `function total(`，按 ⌘C。
- **现象：**
  - **分栏：**选区里有 `\texport const fromCents = (c) => c / 100;\n`，剪贴板里只有 `\n\n`；拖到第 5、6 行时是 `\n\n\n`、`\n\n\n\n`，只有换行。旧代码用原生复制，得到的是选区里的文字。
  - **跨文件：**选区里有 `…qty);\n}\nsrc/cart.js\nfunction total(`，剪贴板只有第一个文件的 ` return fromCents(cents(price) * qty);\n}`。旧代码全都在。
  - 在右栏里面开始拖，结果是对的。
- **证据：**`$R/diff/{f9dd353,2d3eeb8}/log.txt` 里 `"split":true,"side":0,"drag":…` 和 `"crossFile"` 两项；截图 `$R/diff/{tag}/drag-split-0.png`。
- **原因：**`views/review/diffSelect.ts`：
  - 第 15 行按选区起点所在的 `td.code` 决定取哪一栏，起点在空的左栏，就只取左栏。
  - 第 17 行只遍历当前这个表格的 `tr.dl`，别的文件的行不算。
  - 第 29–31 行只要有两行以上就 `preventDefault`，把原生复制整个替换掉。
- **为什么是 P3：**这两种拖选不常见，也不在验收结论的路径上。但内容是静默丢的，用户要粘贴之后才会发现。
- **修正目标：**
  - 选区跨了表格，或起点所在的一栏是空的，就退回原生复制，或者改取选区终点所在的那一栏。
  - 更稳的做法是学 GitHub：+/− 和行号做成不进选区的内容，去掉自定义的复制。
  - 测试用真实的 ⌘C，覆盖分栏和跨文件两种情况。现在的测试是派发合成事件。

### [R17-P3-02] 1440×560 和 1440×640 下，没滚动时右栏底部仍有 58px 压在引导框下面（既有；D167 只修了一部分）

- **重现：**`goal/G-0002`（running），窗口 1440×560 或 1440×640，页面不滚动。
- **现象：**
  - HEAD：右栏 max-height 是 376px（640 高时 456px），顶在 162px、底在 538px（618px）；引导框的顶在 480px（560px）。重叠 58px。右栏自己可以滚动，滚到最后几项时会被引导框挡住。
  - 旧代码：max-height 468px（548px），重叠 150px（141px）。
  - 页面滚到底以后，HEAD 没有重叠。
  - 1440×900 下两个提交都没有重叠。
- **证据：**`$R/regress/{tag}/rail2.txt`、`rail.txt`；截图 `$R/regress/{tag}/rail2-G-0002-*-end.png`、`$R/regress/rail-G-0002-1440x560-pair.png`。
- **原因：**`app.css` 的 `:has(.steer-console)` 规则写的是 `100vh - 标题栏 - sp5 - 112px`，前提是右栏贴在页面顶部。但没滚动时右栏的顶在 162px，下面在目标页头之下。
- **为什么是 P3：**作者说修好了，实际改善了大半，滚动后也正常。剩下的只在矮窗口、页面不滚动时出现。
- **修正目标：**
  - 让右栏的底不压到引导框：按右栏的实际顶部算高度，或者在滚动容器底部留出引导框的高度。
  - 测试改成量几何位置：断言 1440×560 时右栏的底 ≤ 引导框的顶。`flows.spec.ts:1962` 现在只断言 max-height 差值 ≥ 80。

### [R17-P3-03] 回答 ask_user 时另一个调用还在跑，运行仍被设回 Thinking（既有；D169 没有覆盖）

- **重现（读代码）：**引擎同时发起 ask_user 和 bash；用户在手机或桌面上回答这个问题，bash 还在跑。
- **现象：**
  - `control.rs:313-315`：`if run.flags().dialogs.is_empty() { inner.set_mode(goal, Mode::Thinking)?; }`，不看 `tools` 表。
  - ask_user 的 ToolEnd 本来就不改 mode（`events.rs:134`）。所以 mode 一直停在 thinking，直到下一个事件。
  - 手机：`busy(g)` 是 false，两分钟后显示“已沉默”。
  - 桌面：`calls` 里还有 bash，仍然算忙。两边说法不一。
- **原因：**D169 只改了 ToolEnd 这一条路径，回答问题的路径没有用同一条规则。
- **为什么是 P3：**ask_user 和 bash 并行的情况不常见，而且只影响状态词，不影响结论。但 DELIVERY §15 那句“直到最后一个结束都算忙”在这里不成立。
- **修正目标：**回答问题时也按 `events.rs:136-144` 的规则取仍在跑的调用（不算 log、submit），没有才设成 Thinking。Rust 测试补两种：ask_user 加 bash 再回答；三个调用的情况，能区分“取最早”和“取最新”。

### 只做记录，不计入

- **D161 的措辞：**手机的保留理由行可以加上“验收前先看：”，让琥珀的意思和验收弹层一致。桌面看板行对同一状态不着色，两边可以统一说法。
- **中文保留理由的折行：**320 宽暗色下，两种保留的那一行断成“代码触及测试运／行器”。因为 `text-wrap: pretty`，第一行右边还留着空（`$R/phone/crop-ready-zh-dark-320.png`、`$R/phone/f9dd353/ready-zh-CN-*-320.png`）。可以对理由词组用 `word-break: keep-all` 之类的办法。
- **手机左侧标记的位置：**有保留理由的行变高到 97–129px 后，左侧的缺口环落到行的中部，对着“回到电脑上评审并验收”那一行，不再和标题对齐（同一张图）。
- **活动行和忙碌状态各说各的：**活动行（桌面 `Live.tsx:83`、手机 `remote.html:501`）写的是最后开始的工具，即使它已经结束；忙碌状态取最早仍在跑的调用。两端一致，但同一行里，文字和徽章可能指的是两个不同的工具。
- **D169 的其他情形：**engine_error 时桌面清空调用而 supervisor 不清；`tools` 表不在 AgentEnd 时清空；用户回答后、ask_user 的 ToolEnd 到之前的那一小段窗口；桌面把 log、submit 也算进调用表。详见上面的表。
- **缩略图解码后变窄：**从 72px 跳到 59px（`$R/look/{tag}/log.txt`）。
- **引导框失败态：**显示英文的异常原文，“没能加载”也没说是什么没加载。
- **中文留出名单：**“…检查： test/holdout/…”，全角冒号后面多了一个空格（`$R/select/f9dd353/log.txt`）。
- **暗色 shimmer：**读起来像变暗，不像被照亮。
- **暂停按钮的修复没有记录：**这是作者没提到的行为变化。建议在 DESIGN_REVIEW 补一条 D 行，再加一条测试（见验收条件）。

---

## 新增和改写的测试是否测到了它声称的东西

### 换回旧源码后的结果

**A 组：HEAD 的测试，`2d3eeb8` 的源码**（`$R/checks/oldsrc/a-*.log`、`a-status.txt`）。

- **单测：**3 条失败、21 条通过，失败原因都对：
  - `pulse`：并行调用时，没有保持“忙”和最早那个调用的名字；
  - `GoalDeck`：发现被算给了无关的标准；
  - `Console`：错误计数的标记。
- **e2e：**13 条失败、113 条通过、7 条跳过。13 条都是新增或改写的测试，每条都失败在它声称要测的地方：
  - flows：shimmer 两条、缩略图、手机页已关的墨色、右栏；
  - phone：运行行、待验收 en 和 zh、空状态；
  - select：名单和 pin 两条；
  - resilience：引导框；
  - review-keys：选择和复制。
- 恢复后确认没有残留。

**B 组：HEAD 的源码，单个文件换回 `2d3eeb8` 的版本**（`$R/checks/swap-b.sh`、`$R/checks/oldsrc/b-*.log`）：

| 换回的文件 | 跑的测试 | 结果 |
|---|---|---|
| `remote.html` | `phone.spec.ts` | 4 条失败（运行行、待验收 en 和 zh、空状态），15 条通过 |
| `remote.html` 只去掉 `.meta.ready` 的折行（变异测试） | `phone.spec.ts` 的待验收 | en、zh 都失败在第 571 行的 `fit`。说明 D162 的断言真的在测折行 |
| `Honesty.tsx` | `select.spec.ts:73` | 失败，名单粘在一起 |
| `base.css` | `select.spec.ts:73` | 失败，原因同上 |
| `Review.tsx` | `select.spec.ts` | 2 条失败：`@69a9769@`，以及 `.review-stat-pins .code-val` 不存在 |
| `FileDiff.tsx` | `review-keys.spec.ts` | 失败在第 235 行，↩ 之后评论框没有焦点 |
| `app.css` | `flows.spec.ts` | 5 条失败：手机页已关的墨色 0.43、缩略图宽 2、shimmer、墨 3%、右栏差值 0 |
| `Look.tsx` | `flows.spec.ts:992` | 失败，没有 `look-img-in` |
| `TelemetryStrip.tsx` | `Console.test.tsx` | 1 条失败 |
| `GoalPage.tsx` | `resilience.spec.ts:24` | 失败 |
| `ext.ts` | `GoalDeck.test.tsx` | 1 条失败 |
| `store.ts` | `pulse.test.ts` | 失败 |
| `run/events.rs` + `run/mod.rs` | `cargo test --test flow a_tool_still` | 失败，`left: [Thinking]`，和作者说的一致 |

每次换完都已恢复，并用 `git status` 确认 0 处跟踪中的改动。

### 测试的弱点

- **`review-keys.spec.ts`：**
  - 复制用的是合成的 copy 事件，没按真的 ⌘C；也没测分栏从左栏开始拖、跨文件拖，所以放过了 R17-P3-01。
  - ↩ 的测试不带修饰键，放过了 R17-P2-01。
- **`flows.spec.ts:1962`：**只断言右栏的 max-height 少了至少 80px，不量右栏和引导框的几何位置，所以重叠的 58px 能通过。
- **Rust 测试：**只有两个调用、后开始的先结束。“取最早”和“取最新的剩余调用”两种实现都能通过；也没测回答 ask_user 的路径。
- **`phone.spec.ts` 的待验收：**在旧代码上先失败在保留理由那一行，到不了折行的断言。我用变异测试补证了折行断言是有效的。
- **暂停按钮：**没有任何测试点过手机的 `[data-pause]`。`phone.spec.ts:322` 的 “Press again” 测的是留出卡片上的“放弃”。所以这个按钮点不动的缺陷存在了 400 多个提交。
- **`resilience.spec.ts:24`：**只测“Couldn't load this”和“重试”，不测异常原文以什么语言显示。

### 有没有削弱测试

没有发现。

- 删掉的是旧规则的断言：幽灵行的 3 行、沉默徽章的提示标记路径。都对应这一轮的产品改动，并换成了相反方向的断言：没有 `.ghost`、`.bar`；text-2、字重 400、不画字形。
- `review-keys` 删掉了“按第 0 行再按 ↓ 到第 1 行”，换成“按第 2 行，↓↓↑ 得到 3、4、3”。这是第 16 轮指出的弱点，新的写法更强。
- `phone.spec` 的 `read(1)` 从精确相等改成 `objectContaining`，因为 `read()` 现在多返回 `gap`、`cut` 两个字段，同时补了 `why: ""`。没有放松实际的约束。

---

## 工程检查（日志在 `$R/checks/`）

| 检查 | 结果 | 日志 |
|---|---|---|
| `tsc --noEmit` | 0 错误 | `tsc.log` |
| vitest | 43 个文件、248 条全部通过 | `vitest.log` |
| 构建 | 通过 | `build.log` |
| 包体预算 | 总计 163,810 / 163,840（余 **30 B**）。启动 56,332 / 65,536；按需 107,478 / 110,592；目标页 11,590 / 12,288；worker 197,901 / 262,144。预算文件没有改动 | `bundle-budget.log` |
| 行数上限 | 0 处超限（`FileDiff.tsx` 777 行） | `line-limit.log` |
| 文档编号 | 0 处问题 | `doc-numbers.log` |
| `cargo test -p tower-supervisor` | 212 通过、0 失败、2 忽略。`CARGO_TARGET_DIR` 在 worktree 外 | `cargo-test.log` |
| `cargo fmt -p tower-supervisor --check` | 干净 | `cargo-fmt.log` |
| e2e 全量（规定命令） | 402 通过、5 失败（smoke，字体 403）、76 跳过 | `e2e-full.log` |
| e2e 全量（字体配置） | 407 通过、0 失败、76 跳过 | `e2e-full-fonts.log` |
| shots（`shots.spec` + 手机预览） | 两个提交各 95 条通过、76 张 PNG。差异见回归检查 | `shots-{f9dd353,2d3eeb8}.log`、`$R/shots/diff.txt` |
| perf（`--project=perf --no-deps`） | 2 条通过。50 个目标的看板 186/184/184ms，对照 137/107/103ms；切换视图 33–67ms，对照 17–26ms | `perf.log` |

76 条跳过的都是要设 `SHOTS` 才跑的截图测试。

---

## 没能覆盖的

- **打包好的应用：**按规定没有运行。结论都来自 Playwright WebKit 加 IPC stub。perf 的数字是 headless WebKit 的，不等于真实的 Tauri 窗口。
- **手机页：**
  - 没有真机，也没有真实的 SSE 流。
  - 标记只在 DPR 3 下看过，没看 DPR 1、2。
  - 暂停按钮只确认了能进入“再按一次”的状态，没有确认第二次按下会发出 `/api/pause`。
- **D169 和 R17-P3-03：**没有用真实的 pi 跑并行工具。依据是 `fake_pi` 的 flow 测试加读代码。ask_user 那条路径完全是读代码得出的。
- **桌面诚实语法：**没有像第 16 轮那样跑 320 种状态的矩阵。依据是这一轮的 diff 加 76 对 shots，每类差异只看了一两张。
- **右栏几何：**只测了 G-0002 一个 running 目标，没测 1800 宽、没测别的 running 目标。
- **shots 里的时机差异：**C4 缩略图和语法高亮两处，没有重跑来确认它们稳定。
- **引导框失败：**是拦截模块请求模拟出来的。开发服务器自己偶尔出现的 “Importing a module script failed”，没有深究原因。
- **读屏软件：**没有用真实的读屏软件。
- **对照 Primer、Geist、Linear：**凭对它们公开设计的了解，没有访问外部网站。

---

## 验收条件

这一轮 **PASS**，没有阻塞项。

**建议下一轮做：**

1. **R17-P2-01（优先）：**
   - `onTableKey` 只处理不带修饰键的 ↩。
   - 加 e2e：按下某行后按 ⌘⇧↩，只开弹层，焦点在弹层里，没有评论框。
   - 守住 30 B 的包体余量。
2. **R17-P3-01：**
   - 选区跨表格，或起点在空栏时，退回原生复制；或者改成 +/− 不进选区、去掉自定义复制。
   - 测试改用真实的 ⌘C，覆盖分栏和跨文件。
3. **R17-P3-02：**右栏的底不压到引导框；测试改为量 1440×560 下右栏和引导框的几何位置。
4. **R17-P3-03：**`control.rs` 回答问题时，按同一条规则取仍在跑的调用。Rust 测试补 ask_user 加 bash、以及三个调用的情况。
5. **暂停按钮：**
   - 在 DESIGN_REVIEW 补一条 D 行，记下“暂停按钮在 `ba94b1b`–`2d3eeb8` 间点不动，`f9dd353` 顺带修好”。
   - `phone.spec.ts` 加一条：真实点击 `[data-pause]` 后，按钮变成“再按一次”，再点一次发出 `/api/pause`。
6. **可以顺手做的（只做记录的几项）：**
   - 手机保留理由加上“验收前先看”；
   - 中文理由不要断在词中间；
   - 缩略图按最终比例占位；
   - 引导框失败态改用人话；
   - 删掉中文名单冒号后的空格。
