**结论：PASS。** 加权得分 **8.63/10**（8.625），没有未关闭的 P0、P1 或 P2。第 19 轮的 3 条 P3 都修好了，D207–D213 的记录项也都成立。D214–D217 成立，其中 D214 只有统计证据。这一轮新记 3 条 P3：一条是本轮引入，一条是既有，一条的竞争机制在两个提交上都有、本轮是否放大没有区分开。

# Tower 前端设计评审：第 20 轮（`b6baa8a`，对照 `939be97`）

> 文中 `$R` 指 `/tmp/tower-design/review20`，截图、日志和测量都在这里。
> - **临时 spec：**已从所有 worktree 删除，副本在 `$R/checks/specs/`，共 7 个：diff、live、look、marks、phone、widths 和 lib。
> - **检查日志：**
>   - 工程检查在 `$R/checks/`；
>   - 前端换回旧源码的结果在 `$R/checks/swaps/`，Rust 变异和探针在 `$R/checks/rust/`，flow 重复跑在 `$R/checks/flow/`。
> - **主仓库：**主 checkout 只用来读，以及执行 `git worktree add/remove`。
> - **清理后的状态：**
>   - `git -C /tmp/tower-design/wt-review20 status --short --ignored` 只剩两个 node_modules 软链接。
>   - 对照用的 `wt-review20-base` 和变异用的 `wt-review20-scratch` 已用 `worktree remove --force` 删除。删除前两边 `git diff` 都是空的（`$R/checks/rust/{scratch,base}-final.diff`，0 字节）。
>   - 1441–1443 端口没有监听进程。为制造负载起的 10 个 `yes` 进程已结束（`$R/checks/rust/burners.txt`）。
>   - worktree 外的 cargo target 和 review vite 缓存都已删除。
> - **两处需要说明的产物：**
>   - **`apps/desktop/src-tauri/gen/schemas/`（已删除）：**`wt-review20` 里多出这个目录，是 tauri-build 生成的。生成时间 11:11:27，正好落在我跑 workspace clippy 的 11:11:03–11:11:31 之间（`$R/checks/cargo-clippy.log` 首尾的时间戳），所以是我生成的。
>   - **主 checkout 的 vite 缓存（没动）：**`apps/desktop/node_modules/.vite/` 下的 `deps` 和 `vitest/…` 在 11:30 和 11:33 被更新过，是生产 vite 和 vitest 经软链接写进去的。这些目录本来就有，我没有动。
>   - 主 checkout 的 `git status` 只有原本就有的 `?? .claude/`。
> - **字体配置：**e2e 全量、shots 和专项 spec 用的是 `$R/tools/vite.review.config.mjs`。它原样导入生产配置，只把主 checkout 的 node_modules 加进 `fs.allow`。规定命令（生产 vite）也单独跑了。

**第 19 轮的三条 P3 都修好了**（每条都在 `939be97` 上复现，再在 `b6baa8a` 上确认）：

- **R19-P3-01（D204）：**我在 append 和插入 `tools` 之间加 150 ms 停顿（探针 q）：
  - `939be97` 3 次中有 1 次在 `flow.rs:351` 失败；
  - HEAD 3 次全过；
  - flow 测试整包单独跑 6 次，6 次全过。
- **R19-P3-02（D205）：**
  - 条带：缺图框 153.6×96，旁边的图 152.4×96；
  - 并排：532×332.5 对 532×333.3；
  - 验收读数：115.2×72 对 114×72。
  - 长 URL 和中文长句都限 3 行，没有单词被拆开，两个标题齐平。
  - 旧代码：并排 192×226.6，条带 142 或 158 高，“CONNECTION” 和 “checkout” 被拆开。
- **R19-P3-03（D206）：**调用结束后：
  - 目标页、看板、速览都写 “Thinking Run 1/2”“思考 第 2 次运行”；
  - 手机写 “Thinking pi Run 1”。
  - 旧代码在这些位置写的都是 “bash pnpm test…”。

**这一轮做得好的地方：**

- **黄色少了（D217）：**验收标准行下的标签去掉了琥珀描边，只留底色。这正对着负责人不喜欢的“黄色”。
- **侧栏冲突有了自己的字形（D209）：**一个 12px 的 `◇`，读屏名是“Merge conflict/合并冲突”，墨色，不用红。
- **焦点环和键盘落点一致（D213）：**回到 diff 时，焦点环就在 ↓ 和 ↩ 要作用的那一行。
- **对话框提前关闭（D210）：**在 Pi 的时限之前就关掉，晚到的回答会被拒绝，不会悄悄丢失。

**新问题（都是 P3）：**

- **R20-P3-01（竞争机制两个提交都有，本轮是否放大未区分）：**
  - 问题项在收件箱里出现时，对话框还没登记。这时回答，会留下一个永远关不掉的对话框，运行一直读成“等你”（琥珀），可收件箱里并没有问题。
  - 300 ms 探针在两个提交上都 3/3 复现。
  - 负载下自然出现两次：一次是 flow 测试失败，一次是标记命中。
- **R20-P3-02（本轮引入，D206 的代价）：**看板行的细节每个调用来回换两次（调用的字和 “Run 1” 交替），后面的“已运行”文字跟着横跳，最多 148 px。旧代码每个调用只跳一次，最多 69 px。
- **R20-P3-03（既有，D213 让它更常出现）：**diff 行号上的焦点环压在数字上。

---

## 评审范围

- **提交：**`b6baa8a`，50 个文件，+1350/−315，其中 review19.md 占 466 行；对照 `939be97`。
- **环境：**
  - Playwright WebKit：DPR 2；标记特写 DPR 4，diff 特写 DPR 3；
  - en/zh，亮色/暗色；
  - 宽度 1040、1241、1280、1281、1440、1800；
  - IPC stub 加 `/tmp/tower-design/fixtures{,-zh}`。
- **专项 spec**（两个提交跑同一份）：
  - look：D205；
  - live：D206，桌面，含 300 ms 节奏的时序采样；
  - phone：D206 和诚实语法；
  - diff：D213；
  - marks：D209、D217 和红色；
  - widths：1241 和 1281。
- **Rust：**
  - workspace 的 fmt、clippy、test；
  - 作者的 5 个变异，我重做了一遍；
  - 我自己的 3 个变异、2 个探针；
  - flow 测试整包：HEAD 跑了 29 次，`939be97` 跑了 10 次，其中 20 次是两个提交并发跑的，并带了“回答找不到对话框”的标记。
- **其他：**
  - e2e 全量：规定命令 1 次，两个提交在字体配置下各 1 次；
  - shots 两个提交各 69 张，做了像素比对；
  - 字符扫描；
  - i18n 合并键的比对；
  - 文档 diff 审读。

---

## 加权评分

| 维度 | 权重 | 分数 | 理由 | 加权 |
|---|---|---|---|---|
| 产品适配 | 15% | 8.7 | **加分：**<br>• 实况行只在调用还在跑、或运行已沉默时才写调用的字（D206）；<br>• 对话框在 Pi 的时限之前关闭，晚到的回答被拒绝（D210）；<br>• 合并冲突在侧栏有名字（D209）。<br>**扣分：**R20-P3-01，极少数时序下运行一直“等你”，却没有问题可答。 | 1.305 |
| 信息架构与工作流 | 20% | 8.6 | **加分：**缺图框和图成对；diff 回来时焦点环和 ↓/↩ 的落点一致。<br>**扣分：**<br>• 目标页元信息行写着 “Run 2”，紧下面的实况行又写一遍 “Run 2”；<br>• 条带里长错误的有用部分（REFUSED、URL）被截到第 3 行之后，完整文字只在悬停提示里（只做记录）。 | 1.720 |
| 视觉层级 | 15% | 8.7 | **加分：**<br>• 验收标准行的标签不再叠琥珀描边，行首标记的层级更清楚（D217）；<br>• 侧栏冲突换了字形，不只是加深墨色。<br>**扣分：**看板行的细节在快速调用时闪动（R20-P3-02）。 | 1.305 |
| 原创性与产品身份 | 15% | 8.6 | 底色纱、光缝、缺口环、切角印章和注记竖线都没变，也没有新的识别元素。光带不再扫过已结束的命令，“光 = 在干活”的读法更干净。 | 1.290 |
| 工艺与排版 | 10% | 8.6 | **加分：**缺图框尺寸精确（96、72、532×332.5）；在分隔符后断行，单词不拆开；标题齐平。<br>**扣分：**<br>• 焦点环压在行号上（R20-P3-03）；<br>• `net::` `ERR_` `CONNECTION_…` 在 `_` 和 `:` 处断开，标识符读起来是碎的；<br>• 中文 “第 2 次运行已运行 21 小时…” 里 “运行” 重复，1241 宽时被截成 “已...”。 | 0.860 |
| 密度与克制 | 10% | 8.7 | 合并了 29 个重复的键；去掉了 2 处描边；没有新增颜色或标记。 | 0.870 |
| 交互 | 10% | 8.5 | **加分：**D213 的 8 种回到表格的方式都和规则一致；Shift、⌘C、指针按下都不出环。<br>**扣分：**R20-P3-02 的闪动；R20-P3-03。 | 0.850 |
| 设计系统一致性 | 5% | 8.5 | **加分：**<br>• `--dur-settle` 进了 token，docs/12 也写了；<br>• docs/04 把冲突预测移到 `◇`；<br>• docs/12 §12.4.3 写明了侧栏的 `◇`。<br>**扣分：**<br>• `DESIGN.md` 的 Live line 一节和 docs/04 表格第 2 行都没写 “Run N” 这种细节；<br>• `DESIGN_REVIEW.md` 的 D206 写 “Get started”，界面上是 “Getting started”。 | 0.425 |
| **合计** | 100% | | | **8.625** |

---

## 负责人意见（标记、动效、劣质 UI）的总体评价

负责人的原话：“我不喜欢现在的红色方块⬛️，黄色菱形◆和蓝色圆形这三个UI，以及其他地方出现的这种劣质UI和审美，请你注意这一点并进行全面的纠正”。

**点名的三种标记：**没有退回去。

- 字符扫描（`$R/charscan/hits-{b6baa8a,939be97}.txt`）和第 19 轮一致，只有两处变化：
  - 一个 `·` 字符串从 `events.rs` 移到了 `asks.rs`；
  - `app.css` 注释里多了两个尺寸写法的 `×`。
- 其余字符：
  - `■` 1 处、`✕` 2 处，都在 `examples/run_goal.rs` 和 `prompts.rs` 的解析代码里；
  - `●`、`◉` 只在注释里。
- CSS 的 `content` 只有 `"┆ "`。状态标记仍然都是 SVG。

**这一轮清掉的“劣质感”：**

- **琥珀描边（D217）：**
  - 去掉了。HEAD 的标签计算样式是 `box-shadow: none`，旧代码是 1px、32% 的琥珀内描边（`$R/marks/{tag}/log.txt` 里的 “criteria pills”）。
  - 截图：`$R/shots/pairs/final-goal-deck-light.png`，上面是旧代码，下面是 HEAD。
  - 第 19 轮“验收标准行偏吵”的那一条，现在两行里只剩琥珀底色。
- **侧栏冲突（D209）：**
  - 冲突时，时钟图标换成 12px 的 `svg.mark-notice`，名字是 “Merge conflict/合并冲突”，墨色 t1；没有冲突时是 14px 时钟、t3（`$R/marks/side-stack.png`）。
  - Linear 的侧栏也是用不同的字形标出要你处理的项，这一做法和它一致。
- **缺图框（D205）：**和图同框，长理由限 3 行，单词不拆开，两个标题齐平（`$R/look/pairs/`）。Geist 的媒体错误占位也是保留原比例框、长文字截断。
- **光带（D206）：**不再扫过已结束的命令。

**还剩下的：**

- **R20-P3-03：**焦点环压在行号上，比如数字 “5” 的右边缘被 1.5px 的环切过（`$R/diff/zoom-ring.png`）。放大后很像“没对齐”。Primer 的焦点环从不压内容。
- **R20-P3-02：**看板行的细节在快速调用时来回换，后面的“已运行”时间横跳。
- **标识符被拆开（只做记录）：**
  - 条带里是 “The page did not open: net::ERR_ / CONNECTION_…”，断在 `_` 和 `:` 后面，有用的 “REFUSED” 和 URL 落在第 3 行省略号之后（`$R/widths/b6baa8a/goal1-1281-en-light.png`）。
  - 比上一轮逐字符断行好得多，但还不够好读。

**对照 Primer、Geist、Linear**（凭对它们公开设计的了解，没访问外部网站）：

- **焦点环：**Primer 用 2px 外偏移的环，环和内容之间留白。Tower 的 `outline-offset:-1.5px` 加上 `padding:0` 正好压在右对齐的数字上。
- **当前步骤：**GitHub Actions 和 Linear 的状态行都是“当前步骤”稳定显示，不会在两个短步骤之间闪成别的字。Tower 的 “Run N” 在单个目标页上是合理的；但看板行的“已运行”时间跟着细节一起移动，放大了闪动。
- **缺图占位：**现在和 Geist 的做法一致。

---

## 作者说明的准确性

- **门槛数字都对得上：**
  - vitest 45 个文件、257 条；
  - e2e 420 通过、0 失败（字体配置，HEAD）；
  - shots 69/69；
  - `cargo test --workspace` 29 个测试套件、472 通过、2 忽略；
  - clippy 通过；
  - 包体 163,733 / 163,840 B。
- **“the flow suite 20 of 20”：**
  - 我在 HEAD 上整包跑了 29 次，`every_end_and_an_answer…` 在有负载时失败 1 次（`$R/checks/flow/underload-2.log`）。
  - 作者的 20 次可能是在空闲时跑的，两者不矛盾。但 20/20 不能说明没有竞争（R20-P3-01）。这和第 19 轮的教训一样。
- **“Each fix's test fails on 939be97's sources or a stated mutation”：**我在旧源码上重放的都失败了，但有 3 处失败的原因不是测试声称要测的东西，见“测试是否测到了它声称的东西”。
- **措辞：**`DESIGN_REVIEW.md` 的 D206 写 “Get started”，界面上是 “Getting started/开始工作”。
- **perf 数字：**看板 50 个目标 609/286/202 ms 等，没有核对。

---

## D204–D217 逐项核实

| D | 结论 | 证据和说明 |
|---|---|---|
| D204 | **已修复**（关键性质没有测试） | **修复：**<br>• 探针 q（append 和插入 `tools` 之间停 150 ms）：HEAD 3/3 过，`939be97` 1/3 在 `flow.rs:351` 失败（`$R/checks/rust/q-start-pause-{head,base}.log`）；<br>• flow 单独整包 6/6 过。<br>**作者变异 a–e：**各自让对应的 asks 测试失败（`$R/checks/rust/summary.txt`）。<br>**测试缺口：**变异 f（只在 append 时持锁，append 后释放再停 150 ms，也就是第 19 轮那个窗口）下，asks 5/5 过，flow 超时测试 3/3 过。<br>• 锁存在与否测到了（b 失败）；<br>• 锁要一直持到插入 `tools` 这一点没测到。<br>**场景逐项（任务 3）：**<br>• 并行调用：有测试（`flow.rs:170`、asks b）；<br>• ask_user、log、submit 不算“在干活”：读代码（`at_work` 不变），第 19 轮的变异 r-m1/r-m3 已覆盖；<br>• AgentEnd：有测试（asks c）；<br>• engine error：读代码。`on_exit` 先 `remove_run`，到时关闭任务有 `ptr_eq` 守住，回答拿到“已不在运行”。没有测试。<br>• 多个对话框：<br>&nbsp;&nbsp;– 两个先后出现的问题有测试（`flow.rs:270`）；<br>&nbsp;&nbsp;– 同时开着的情况只读了代码：`settle_mode` 只要还有对话框开着就保持 WaitingOnYou。<br>• 超时和回答抢先：有测试（asks d、e）。<br>• 死锁：读代码。`mode_lock` 在最外层，flags 和 store 的 guard 都是临时值，`if run.flags()…` 的条件临时值在进块前就释放；中毒的锁用 `PoisonError::into_inner` 处理（`asks.rs:16-18`）。所有 flow 运行都没有挂住。<br>**新问题：**R20-P3-01。 |
| D205 | **已修复** | `$R/look/summary-{b6baa8a,939be97}.txt`，en/zh × 亮/暗，1040/1280/1440/1800：<br>• 条带 153.6×96 对 152.4×96，标题差 0；<br>• 并排 532×332.5 对 532×333.3（1040 宽时 460.8×288 对 460.8×288.7）；<br>• 验收读数 115.2×72 对 114×72；<br>• 长理由限 3 行，弹层里 8 行；<br>• `title` 是完整文字；<br>• 被拆开的单词：0。<br>1241/1281：两个提交的条带都是 96 高对旧代码的 142/158（`$R/widths/{tag}/log.txt`）。<br>只是 fixture 造成的现象：高的桌面截图、手机图 390×640（真实是 390×844）。<br>对照图：`$R/look/pairs/side-url-en-light-1440x900.png`、`strip-zhlong-zh-CN-light-1440x900.png`。<br>代价见“只做记录”第 1、2 条。 |
| D206 | **已修复**（代价是 R20-P3-02） | `$R/live/{tag}/log.txt`，7 种情况 × en/zh × 亮/暗：<br>• 调用已结束 → “Thinking Run 1/2”“思考 第 2 次运行”，光带在 “Run N” 上；<br>• 沉默 5 分钟 → 保留调用的字，不动；<br>• 在跑 → 写调用的字；<br>• 没有实况行 → “Getting started/开始工作”；<br>• 速览和目标页一样。<br>手机（`$R/phone/{tag}/single.txt`）：“Thinking pi Run 1”。<br>旧代码以上都写 “bash pnpm test…”。<br>换回旧 `Live.tsx` 后，单测失败（`['bash',…]` 对 `['Run 1','']`），`flows:478` 也失败；换回旧 `remote.html` 后 `phone:531` 失败。 |
| D207 | **已修复**（测试本身的失败原因不对） | 我把测试里的调用改成绑定 `this` 之后：旧 worker 4 行（跑了两遍），HEAD 2 行（`$R/checks/swaps/hl-bound.log`），逻辑成立。<br>测试原样跑在旧 worker 上：<br>• 先因为 `get` 没有导出而失败；<br>• 给旧文件补上 export 后，又因为测试里 `line(...a)` 没有绑定 `this`，在原型方法上抛 TypeError，被 worker 的 catch 吞掉，得到 1 行（`hl-old-exported.log`）。<br>所以作者测试的失败不是因为“跑了两遍”。作者自己的 `hl-old-rule` 变异我没有重跑。 |
| D208 | **已修复** | 我在 HEAD 上去掉 worker 出错时释放计数的那一行，`smoke:24` 在第 32 行失败（“1 worker answer(s)”）。<br>旧 `tauri.ts` 下失败，但原因只是返回类型（`undefined`）。<br>shots 断言 `settled(…, 15_000)` 为 null，两个提交都 69/69。<br>e2e 全量里只有 smoke:24 打出 1 条预期的 “still drawing” 警告。 |
| D209 | **已修复** | `$R/marks/{tag}/log.txt`：<br>• HEAD：`svg.mark-notice` 12×12，名字 “Merge conflict/合并冲突”，t1，计数 1（t3）；没有冲突时是 14px 时钟、t3，计数是活跃计划数 2；<br>• 旧代码：14px 时钟，t1，名字 “Notice”。<br>换回旧 `Sidebar.tsx` 后 `flows:432` 失败。<br>`.side-count` 上的 `t1` 类不起作用，这是既有问题，见“只做记录”第 6 条。 |
| D210 | **已修复** | `closes_after` 提前十分之一、最多 1 秒（`asks.rs:139-141`）。<br>变异 d（先删对话框）和 e（计时器等满 Pi 的时限）各自失败。<br>回答走的路径先 `resolve_inbox`（`actions.rs:84`）：到时关闭之后再来的回答会在这里报错，不会再调用 `answer_dialog`。<br>docs/05 已改。 |
| D211 | **已修复** | docs/04:235 把冲突预测从 `■` 移到 `◇`，并注明“写成墨色”；docs/12 §12.4.3 的两个表都写了侧栏的 `◇`。 |
| D212 | **已修复**（只核对了源码） | `tokens.css` 新增 `--dur-settle: 600ms`，`app.css:436` 的 `transition: opacity var(--dur-settle)`；docs/12 的 token 表和动效表都改了。 |
| D213 | **已修复** | `$R/diff/{tag}/log.txt`。HEAD：<br>• 按下第 4 行 → ⌘⇧↩ → Esc：环在第 4 行，↓ 到第 5 行；<br>• 按第 2 行 → ↓↓↓ → 弹层：焦点回到第 5 行，↓ 到第 6 行；<br>• 点空白 → Tab：环在按下的第 4 行；<br>• 窗口离开再回来、合成的 blur/focus：都不出环；<br>• 从前一个控件 Tab 进来、页面第一次 Tab：环在第 0 行；<br>• 按下后按 Shift、拖选后 ⌘C：不出环；<br>• 按 `a` 再 ⇧A 重绘后：按下的行丢了，环在表格上，↩ 什么也不做，和规则一致。<br>旧代码在这些情况下都不出环。<br>换回旧 `app.css` 或旧 `FileDiff.tsx` 后，`review-keys:187` 都失败。<br>新问题：R20-P3-03。 |
| D214 | **已修复**（只有统计证据） | 读代码：`answer_dialog` 先 settle 再发送（`control.rs:316-318`）；`launch` 先写 Thinking 再 prompt（`run/mod.rs`）。<br>两处改回去之后：<br>• 变异 g（先发回答）：asks 过，flow `every_end` 3/3 过；<br>• 变异 h（prompt 之后再写 Thinking）：lib `run::` 15 条全过。<br>没有确定性测试，作者给的是 20/20 这种统计证据。 |
| D215 | **已修复** | `.github/workflows/ci.yml:49` 是 `cargo clippy --workspace --all-targets -- -D warnings`，`:66` 是 `cargo test --workspace`。我跑了这两条：clippy 通过；测试 29 个套件、472 通过、2 忽略。 |
| D216 | **已修复** | `$R/i18n/merge.txt`：29 个合并的键，en 和 zh 的原文全都相同。<br>包体 163,733 / 163,840（余 107 B），预算脚本没改。<br>代价见“只做记录”第 8 条。 |
| D217 | **已修复**（没有测试） | HEAD 的标签：琥珀底、t1 墨色、`box-shadow: none`、圆角 4px；旧代码有 32% 的琥珀内描边。<br>`DESIGN.md` 加了 “Held tag” 的定义。<br>没有测试断言去掉了描边（GoalDeck 和 honesty 的测试只看类名）。纯样式删除，可以接受。 |

---

## 诚实语法

- **绿色：**只用在验证器在当前树上的结果，而且都带 pin：
  - 桌面是 “passed 379ms ⊥ @15085f2”；
  - 手机上绿色只和 pin @15085f2 一起出现（`$R/phone/{tag}/log.txt`）。
  - Agent 的说法没有着绿；GitHub 检查是中性的 ✓/×。
- **琥珀：**只在要你决定的地方：需要你、“Passed, doesn't count”、等你。
  - 手机上在跑的行只涂 BLUE，有问题时加 AMBER。
  - 例外是 R20-P3-01：竞争出现时，没有问题也会读成“等你”。
- **红色：**只有验证器的哨兵（`$R/marks/b6baa8a/verifier-red-*.png`）和 §12.4.3 清单里的项。冲突是 t1 的 `◇`。
- **提示、不需要决定：**冲突、沉默都用 text-1 的 `◇`，不着色。
- **沉默徽章：**text-2、字重 400、没有字形（`single.txt`：Silent t2 400 svg:false）。
- **中点：**界面源码里的 `·` 仍是 46 处，和第 19 轮一样。会到界面上的 Rust 字符串只读了代码，没在屏幕上看到，都是既有的：
  - 审批正文 “tool · target”（`asks.rs:67`）；
  - 停滞签名（`events.rs:111`）；
  - 推送标题（`inner.rs:216`）；
  - 手机 pips 的提示（`remote.html:371`）。
  - 它们是否违反“中点只用在标准条和预算行”，见“只做记录”第 10 条。
- **动效：**光带只在“在动”时扫，现在也只扫在跑的调用或 “Run N”，不再扫已结束的命令。

---

## 回归检查（对照 `939be97`）

- **e2e 全量（字体配置）：**两个提交都 0 失败：
  - HEAD 420 通过、76 跳过，4.7 分钟；
  - 旧代码 415 通过、76 跳过，4.5 分钟。
  - 两次都在 flow 循环的负载下跑，用时只作参考。
- **shots**（`$R/shots/diff-summary.txt`，`pairs/`）：69 对里 31 对像素完全一致，38 对有差异，都能解释：
  - **fixture 的时钟文字：**“22h 1m/22h 0m”“已沉默 22 小时/21 小时 59 分”“clock 1321/1320”。区域在标题栏，比如 (2292,42)–(2305,61)，以及看板的时间列。
  - **D209：**侧栏图标 (36,410)–(60,434)。
  - **D217：**标签描边，出现在 goal-G-0001、final-goal-deck、review readout，以及 look-compare 背后的标准行。
  - 我看了 12 对的截图，其余 26 对是按差异区域归类的。
- **1241/1281 宽：**两个提交都没有横向溢出（`$R/widths/{tag}/log.txt`）。
- **i18n：**29 个合并的键原文完全相同，没有界面文字变化。
- **diff 键盘和复制：**`review-keys:187` 在 HEAD 上通过。我的 diff spec 里，拖选后 ⌘C 有选中文字，也不出环。
- **没有发现旧功能退化。**R20-P3-02 是 D206 带来的新代价。

---

## 新问题清单

### P0

无。

### P1

无。

### P2

无。

### P3

#### [R20-P3-01] 问题项先在收件箱出现，再登记对话框：在这个窗口里回答，会留下一个关不掉的对话框，运行一直读成“等你”（竞争机制两个提交都有，本轮是否放大未区分）

- **复现：**
  - **探针 p：**在 `open_inbox` 之后停 300 ms，然后整包跑 flow。HEAD 3/3、`939be97` 3/3 在 `flow.rs:207` 失败（`$R/checks/rust/p-open-before-entry{,-base}.log`）。
  - **自然出现两次，都在 HEAD 上、都有负载：**
    - flow 整包和规定的 e2e 一起跑，5 次中失败 1 次（`$R/checks/flow/underload-2.log`）。
    - HEAD 和旧代码的 flow 循环并发、加 e2e 负载时，HEAD 第 6 次命中一次 “answer found no dialog ui1 goal G-0001”（`$R/checks/rust/mark-head-round1.txt`）。这次哪个测试命中的没能确定，那次运行里 `every_end` 测试是通过的。
  - **没有命中的：**
    - 旧代码并发跑 10 次，0 次命中、0 次失败（`mark-base.txt`）；
    - HEAD 在 CPU 负载下单独跑 8 次，0 次命中（`mark-head.txt`）。
  - **合计：**HEAD 专门跑的 29 次整包里，`every_end` 失败 1 次。
- **现象：**
  - 探针和 underload-2 的模式序列都是 `[Reading, Executing, Reading, Executing, WaitingOnYou]`，期望是 `[…, WaitingOnYou, Executing, Reading, Thinking]`。
  - 回答之后，命令还在跑、读文件结束、再到思考，模式一直停在 WaitingOnYou。
- **用户会看到的（推断，没在屏幕上复现）：**
  - 目标的徽章是琥珀“等你/Needs you”，但收件箱里已经没有这个问题；一直到这次运行结束。
  - 如果原来是 confirm 对话框，回答会按 “input” 的方式发出：Pi 收到的是 `Value`，不是 `Confirmed`。
- **原因：**
  - `asks.rs:114` 的 `open_inbox` 一写完，问题项就能看到、也能回答了（带着 `engine_ref`）。
  - 116–118 行要先拿到 `lock_mode()`，才插入 `dialogs`，再设 WaitingOnYou。
  - 回答落在两者之间时：
    1. `control.rs:304` 的 `dialogs.remove` 找不到对话框，method 退回 “input”；
    2. `dialogs` 是空的，于是 settle 到 Executing（316 行）；
    3. 之后才插入的那一条再也没人删。
  - `settle_mode` 只要看到 `dialogs` 非空就写 WaitingOnYou（`asks.rs` 的 `asked`）。
  - 如果这个对话框带时限，到时关闭任务的 `resolve_inbox` 也会失败（问题项已经解决了），它直接返回，同样不删这一条。
  - 旧代码里同样的两步就在 `events.rs:535-536`，紧挨着；HEAD 在中间多了一次拿锁，可能把窗口略微拉宽。两个提交的自然发生率没有区分开（1/18 对 0/10）。
- **为什么是 P3：**
  - 要在问题出现后几毫秒内回答，人做不到，只有自动应答或高负载才会碰上。
  - 运行结束后自己恢复。
  - 但它违背“琥珀 = 要你处理”：琥珀亮着，却没有东西可处理。
  - 同类问题的先例 R19-P3-01 也是 P3。
- **修复目标：**
  - 先在锁内插入 `dialogs`，再打开问题项；或者让打开问题项也在同一把锁里。
  - `answer_dialog` 找不到对话框时要报错或记录，不要默默退回 “input”。
  - 在两步之间注入可控的停顿钩子，写确定性测试；flow 整包在负载下连跑 20 次。

#### [R20-P3-02] 快速调用时，看板行的细节每个调用来回换两次，后面的“已运行”时间横跳（本轮引入，D206 的代价）

- **复现：**`$R/checks/specs/tmp-review20-live.spec.ts` 的 “R20 live over time overview”：8 个读文件调用，每 300 ms 开始一个、300 ms 后结束，每 50 ms 采样一次。这个节奏是合成的。
- **现象**（`$R/live/{tag}/overtime-overview.txt`）：
  - HEAD：细节在 “Working read src/money.ts” 和 “Thinking Run 1” 之间来回换，每个调用两次。“running 21h 33m” 的横坐标在 788/781/850/829 和 702 之间跳，最多 148 px。
  - 旧代码：每个调用只换一次字，坐标只在调用之间变（788→781→850→829），最多 69 px。
  - 目标页实况行的时间是固定列，两个提交都在 x=989 不动（`overtime-goal-G-0002.txt`）。
- **原因：**
  - `Live.tsx:85-99`：`running:false` 时细节换成 `runN`。
  - `Live.tsx:81` 的注释写明，看板行的“已运行”跟在细节后面，`Live.tsx:163-164` 的 `.live-elapsed` 是行内元素，不是固定列。
  - 第 19 轮的修正是对的，但在看板上把“每个调用一次”变成了“每个调用两次”，跳的范围也更大。
- **为什么是 P3：**
  - 看板是主界面。Agent 连续快速读文件很常见，这一行就会一直闪。
  - 字和位置都在动，读起来像界面不稳。这属于负责人说的“劣质感”。
  - 但信息本身是诚实的，目标页也不受影响。
- **修复目标：**
  - 看板行的“已运行”放进固定宽度的列，或者靠右对齐，不随细节移动。
  - 可选：调用刚结束后，等一小段时间（比如 1 s，没有新调用开始）再换成 “Run N”；这段时间里不画光带，不把已结束的调用写成在跑。
  - e2e：按上面的节奏采样，断言“已运行”的横坐标不变。

#### [R20-P3-03] diff 行号上的焦点环压在数字上（既有，从 `73a629f` 起；D213 让它更常出现）

- **复现：**
  - 在 diff 里按下一行，⌘⇧↩，再 Esc；或者从前一个控件 Tab 进 diff。
  - 亮色和暗色都会出现。
- **现象：**
  - 1.5px 的环的右边缘穿过行号最后一位。
  - HEAD：`$R/diff/zoom-ring.png`，数字 5，亮色和暗色。
  - `939be97`：`$R/diff/zoom-ring-base-tabin.png`，Tab 进来后的第 1 行。
- **原因：**`app.css:4964-4973` 的 `.ln-btn` 是 `padding:0; text-align:right; width:100%`，`4984-4989` 的 `outline:1.5px solid; outline-offset:-1.5px` 是内描边，正好画在右对齐数字的最后一列上。
- **为什么是 P3：**
  - 每次键盘焦点落在一行上都看得到，放大后是明显的工艺瑕疵。
  - 数字仍然读得出。
  - D213 之后，从弹层回来、点空白再 Tab 回来也会出环，出现得更多了。
- **修复目标：**
  - 给 `.ln-btn` 右侧留 4px 以上的内边距；或者改成画在整行上的 inset box-shadow；或者 outline-offset ≥ 0。
  - 给环和数字的间距加一条测试。

### 只做记录，不计入

1. **D205 的断行：**
   - 现象：断点在 `_` 和 `:` 之后，标识符被拆开（“net::” “ERR_” “CONNECTION_…”）。条带限 3 行，有用的 REFUSED 和 URL 落在省略号之后，完整文字只在 `title` 里，只有悬停才能看到。
   - 建议：`_` 不当断点；或者先写原因，后写代码。
2. **D205 的并排规则：**`.look-side .look-missing{width:min(100%,60vh*16/10);aspect-ratio:16/10}`（`app.css:5351-5355`）在测过的尺寸下是多余的。
   - 去掉它，`flows:1231` 仍然通过（`$R/checks/swaps/look-side-rule-removed.log`）：subgrid 的拉伸已经给了正确的宽高。
   - 换回旧的 192 宽规则就会失败（192×333 对 532×333，`look-side-old-rule.log`）。
   - 不是缺陷，只是这条规则要等两侧都缺、或者高度极端时才起作用。
3. **手机 tab 的条带：**缺图框 175（en）或 140（zh）宽，旁边是 59px 的手机缩略图。这是既有的，而且是有意的（`min-width:140px`）。
4. **D206 的重复：**
   - 目标页元信息行写 “Run 2”，紧下面的实况行又写 “Run 2”（`$R/widths/b6baa8a/goal2-1241-en-light.png`）。
   - 中文看板行是 “第 2 次运行已运行 21 小时…”，“运行” 重复，1241 宽时被截成 “已...”（`overview-1241-zh-CN-dark.png`）。
   - 实况行的时间位在 “Run N” 旁边显示的是那个已结束调用的时间。
5. **没有实况行时：**手机不写细节，桌面写 “Getting started/开始工作”（既有）。沉默了 22 小时、没有实况行的运行，在看板上读作 “Silent · Getting started”，两个提交都一样（`$R/shots/pairs/final-peek-drawer-light.png`）。
6. **`.side-count` 的 `t1` 类不起作用：**`app.css:313` 覆盖了 `base.css:142`，计数仍是 t3。既有，视觉上可以接受。
7. **文档：**
   - `DESIGN.md` 的 Live line 一节和 docs/04 表格第 2 行没写 “Run N” 这种细节。
   - `DESIGN_REVIEW.md` 的 D206 写 “Get started”，界面上是 “Getting started”。
8. **i18n 合并带来语义耦合：**比如 `trace.output→settings.testCheckOutput`、`sidebar.ended→state.archived`、`goal.resume→goal.purposeResume`。现在原文相同，以后改其中一处会牵连另一处。
9. **没加锁的模式写入：**`launch` 写 Thinking 时不看 `dialogs`；AgentStart/TurnStart 写 Thinking、压缩、重试也都不经过 `mode_lock`。prompt 之前就弹出的扩展对话框可能被盖掉。既有，只读了代码。
10. **Rust 字符串里的 `·`：**审批正文、停滞签名、推送标题、手机 pips 的提示，见“诚实语法”。既有，只读了代码。
11. **测试卫生：**
    - `verification_leaves_nothing_running` 用全局 `ps` 数 “sleep 4321”。两个 worktree 并发跑 flow 时，它会看到另一边的进程而失败：20 次并发跑失败 4 次，19 次单独跑 0 次。这是我并发跑造成的，原因是推断的，没算进 flow 的稳定性数字。
    - `highlight.test.ts` 依赖 HEAD 的包装函数已经绑定了 `this`（见 D207）。

---

## 新增和改写的测试是否测到了它声称的东西

### 换回旧源码（在 scratch 里放回 `939be97` 的文件，`$R/checks/swaps/summary.txt`）

| 换回的文件 | 跑的测试 | 结果 | 失败原因对不对 |
|---|---|---|---|
| `Live.tsx` | `Live.test.tsx` | 失败（`['bash',…]` 对 `['Run 1','']`） | 对 |
| `Live.tsx` | `flows:478` | 失败（toHaveText） | 对 |
| `remote.html` | `phone:531` | 失败（toHaveText） | 对 |
| `app.css` | `flows:1231`（en 和 zh） | 失败在条带（142/110 对 96） | 对，但没走到并排那一段 |
| `Look.tsx` | `flows:1231` | 失败（title 属性） | 对 |
| `Sidebar.tsx` | `flows:432` | 失败（toHaveAttribute） | 对 |
| `app.css` / `FileDiff.tsx` | `review-keys:187` | 都失败（“the line pressed wears the ring, the table none”） | 对 |
| `e2e/tauri.ts` | `smoke:24` | 失败（返回 `undefined`） | 只因为返回类型 |
| `highlight.worker.ts` | `highlight.test.ts` | 失败（`get` 没有导出） | 不对，见 D207 |
| 对照（不换文件） | vitest 6/6；smoke:24 等 7 条 | 都过 | — |

### 在 HEAD 上只改一处（`$R/checks/swaps/summary2.txt`）

| 改动 | 测试 | 结果 |
|---|---|---|
| 并排规则换回旧的 192 宽 | `flows:1231` | 2 个都失败，“gone 192×333.25 beside 532×333.25”。并排断言是有效的 |
| 去掉新的并排规则 | `flows:1231` | 2 个都过（规则多余，见“只做记录”第 2 条） |
| 去掉 worker 出错时释放计数 | `smoke:24` | 在第 32 行失败（“1 worker answer(s)”）。释放计数这一步是有效的 |
| 旧 worker 补上 `get` 导出，测试里的调用绑定 `this` | `highlight.test.ts` | 旧 4 行对 HEAD 2 行，逻辑成立（`hl-bound.log`） |

### Rust 变异和探针（`$R/checks/rust/`）

| 变异或探针 | 结果 |
|---|---|
| a `settle_mode` 不拿锁 | asks 失败（`asks.rs:265`） |
| b `on_tool_start` 不拿锁 | 失败（`asks.rs:292`） |
| c AgentEnd 不停实况行 | 失败（`asks.rs:311`） |
| d 到时先删对话框 | 失败（`asks.rs:331`） |
| e 计时器等满 Pi 的时限 | 失败（`asks.rs:347`） |
| **f 锁只包住 append，之后停 150 ms** | **asks 5/5 过，flow 超时测试 3/3 过：锁要持到插入 `tools` 这一点没有测试** |
| **g 回答先发送再 settle（D214 改回去）** | **asks 过，flow `every_end` 3/3 过：没有测试** |
| **h prompt 之后再写 Thinking（D214 改回去）** | **lib `run::` 15/15 过：没有测试** |
| q 探针：append 和插入之间停 150 ms | HEAD 3/3 过；`939be97` 1/3 失败（`flow.rs:351`）。第 19 轮的窗口关上了 |
| p 探针：`open_inbox` 之后停 300 ms | HEAD 3/3、`939be97` 3/3 失败（`flow.rs:207`），即 R20-P3-01 |

### 测试的弱点

- **D204：**锁要持到插入 `tools` 这一点没测（f）。
- **D214：**两处顺序都没有确定性测试（g、h）。
- **D217：**没有测试。
- **D207：**测试在旧源码上失败的原因不对。
- **D208：**换回旧文件时只因为返回类型失败；我单独去掉释放计数那一行补测过，那一步是有效的。
- **`flows:1231`：**换回旧 CSS 时停在条带断言上，走不到并排那一段；我单独补测过，并排断言是有效的。
- **`every_end_and_an_answer…`：**有负载时不稳定，原因在产品代码里（R20-P3-01）。

### 有没有削弱测试

没有。diff 里删掉的 `expect` 和 `assert` 都换成了等价或更强的；`settled()` 现在会返回还没完成的内容，shots 也会因它失败。

---

## 工程检查（日志在 `$R/checks/`）

| 检查 | 结果 | 日志 |
|---|---|---|
| pnpm | 没跑成：node_modules 是软链接，pnpm 报 “workspace hoist directory is not a real directory”。改为直接调用 `./node_modules/.bin` 里的命令 | `pnpm-attempt/` |
| `tsc --noEmit` | 0 错误 | `tsc.log` |
| vitest | 45 个文件、257 条全部通过 | `vitest.log` |
| 构建 | 通过（`dist/` 已删除） | `build.log` |
| 包体预算 | 总计 163,733 / 163,840。启动 56,254 / 65,536；按需 107,479 / 110,592；目标页 11,627 / 12,288；worker 197,983 / 262,144 | `bundle-budget.log` |
| 行数上限 | 通过 | `line-limit.log` |
| 文档编号 | 通过 | `doc-numbers.log` |
| `cargo fmt --all --check` | 干净 | `cargo-fmt.log` |
| `cargo clippy --workspace --all-targets -- -D warnings` | 通过 | `cargo-clippy.log` |
| `cargo test --workspace`（`CARGO_TARGET_DIR` 在 worktree 外） | 29 个套件，472 通过、0 失败、2 忽略 | `cargo-test.log` |
| flow 测试整包（HEAD） | 单独跑 6/6；和 e2e 同时跑 4/5，那 1 次失败是 R20-P3-01；带标记 10 次，`every_end` 没失败，标记命中 1 次（另有 3 次是并发串扰，见“只做记录”第 11 条）；CPU 负载下 8/8。合计 `every_end` 29 次中失败 1 次 | `flow/`、`rust/mark-*` |
| flow 测试整包（`939be97`，并发） | 10 次，`every_end` 0 次失败，标记 0 次（1 次串扰） | `rust/mark-base.*` |
| e2e 全量（规定命令，生产 vite，端口 1441） | 415 通过、5 失败（smoke 的无障碍测试，字体 403 产生的控制台错误）、76 跳过，3.0 分钟 | `e2e-full.log` |
| e2e 全量（字体配置，排除临时 spec） | HEAD 420 通过、0 失败、76 跳过；`939be97` 415 通过、0 失败、76 跳过 | `e2e-fonts-{head,base}.log` |
| shots | HEAD 69/69（32.1 s），`939be97` 69/69（26.9 s） | `shots-{head,base}.log` |

76 条跳过的都是要设 `SHOTS` 才跑的截图测试。

---

## 没能覆盖的

- **打包好的应用：**按规定没有运行。结论都来自 Playwright WebKit 加 IPC stub。
- **真实的 Pi：**没有用真实的 Pi 和真实扩展的对话框。
- **perf：**没有跑，作者的 perf 数字没有核对。
- **R20-P3-01 未查明的部分：**
  - 界面上“琥珀等你、没有问题”是推断的，没在屏幕上看到；
  - 那次标记是哪个测试命中的，不知道；
  - underload-2 的原因是推断的；
  - HEAD 和旧代码的自然发生率没有区分开。
- **只读了代码的路径：**engine error，同时开着多个对话框，`launch` 的写入顺序（D214）。
- **D207：**Shiki 在 WebKit 的 JSC 下的计时没有测；作者的 `hl-old-rule` 变异没有重跑。
- **shots：**38 对差异里看了 12 对截图，其余 26 对按差异区域归类。
- **实况行时序：**300 ms 的节奏是合成的，真实 Pi 的调用节奏没有测。手机上的随时间变化没有采样。
- **窗口失焦：**headless 下 `document.hasFocus()` 一直是 true，只用合成的 blur/focus 测了。
- **1241/1281 宽：**专项只看了概览和目标页（en 亮色、zh 暗色）；其他页面靠 e2e 的 `layout.spec` 覆盖。
- **读屏软件：**没有用真实的读屏软件。只核对了 `title` 和 `aria` 的名字。
- **真机：**没有。
- **对照 Primer、Geist、Linear：**凭对它们公开设计的了解，没访问外部网站。

---

## 验收条件

这一轮 **PASS**（8.63/10，8.625），没有阻塞项。

**建议下一轮做：**

1. **R20-P3-01（优先）：**
   - 先在锁内登记对话框，再打开问题项；`answer_dialog` 找不到对话框时不要默默退回 “input”。
   - 用停顿钩子写确定性测试。
   - 补上 D204 锁持续范围的测试（变异 f 要能失败），以及 D214 两处顺序的测试（变异 g、h 要能失败）。
   - flow 整包在负载下连跑 20 次。
2. **R20-P3-02：**
   - 看板行的“已运行”时间放进固定列，或者靠右对齐。
   - 可以考虑调用刚结束时短暂停留再换成 “Run N”。
   - 加一条随时间采样、断言横坐标不变的 e2e。
3. **R20-P3-03：**行号的焦点环不压数字，并加测试。
4. **可以顺手做的（只做记录的几项）：**
   - 条带里不在 `_` 处断，或者先写原因；
   - 目标页去掉重复的 “Run N”；
   - 中文的 “第 N 次运行 已运行” 换个说法；
   - `DESIGN.md` 和 docs/04 补写 “Run N” 细节；`DESIGN_REVIEW.md` 的 “Get started” 改成 “Getting started”；
   - `.side-count.t1` 要么生效，要么删掉；
   - `verification_leaves_nothing_running` 只数自己 worktree 起的进程。
