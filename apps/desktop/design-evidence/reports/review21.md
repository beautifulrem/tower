**结论：PASS。** 加权得分 **8.69/10**（8.685），没有未关闭的 P0、P1 或 P2。第 20 轮的 3 条 P3（D218–D220）都修好了，每条都在 `b6baa8a` 上复现过、再在 `9397e07` 上确认。其余各项里，D224–D226、D229、D231–D233、D235 成立，D222、D223、D228、D236 保留合理，D221、D227、D230、D234 只算部分修复。本轮新记 2 条 P3。R21-P3-01：并排对比里错误码在 `_` 后断开，这个现象在 `b6baa8a` 上就有、两个提交完全一样；本轮引入的是一条不起作用的 CSS 规则和一个假通过的测试，D221 因此声称修好了。R21-P3-02 是本轮引入：D230 去掉 `·` 后，审批卡片的代码块显示的是“另一条命令”。

# Tower 前端设计评审：第 21 轮（`9397e07`，含 `b59e68a`；对照 `b6baa8a`）

> 文中 `$R` 指 `/tmp/tower-design/review21`，截图、日志和测量都在这里。
> - **临时 spec：**已从所有 worktree 删除，副本在 `$R/checks/specs/`，共 10 个文件：d230、diff、flip、lib、live、look、marks、phone、u、wbr。
> - **检查日志：**工程检查在 `$R/checks/`；前端换回旧源码的结果在 `$R/checks/fswap/`；Rust 变异和探针在 `$R/checks/rust/`；flow 重复跑在 `$R/checks/flow/`；性能在 `$R/checks/perf/`；工作笔记 `$R/notes.md`。
> - **主仓库：**主 checkout 只用来读，以及执行 `git worktree add/remove`。主 checkout 的 `git status` 只有原本就有的 `?? .claude/`。
> - **清理后的状态：**
>   - `git -C /tmp/tower-design/wt-review21 status --short --ignored` 只剩两个 node_modules 软链接。
>   - 对照用的 `wt-review21-base` 和变异用的 `wt-review21-scratch`：先删掉各自的两个软链接（只删链接本身），再用 `worktree remove --force` 删除。删除前 scratch 的 `git status` 除软链接外是空的。
>   - 1441–1443 端口没有监听进程；10 个 `yes` 负载进程已结束（`pgrep -x yes` 为 0）。
>   - worktree 外的两个 cargo target（`$R/target`、`$R/target-scratch`）和 review vite 缓存都已删除。
> - **两处需要说明的产物：**
>   - **`apps/desktop/src-tauri/gen/`（已删除）：**是我跑 workspace clippy 时 tauri-build 生成的，在 `wt-review21` 里属于被忽略的文件，已删掉。
>   - **主 checkout 的 vite 缓存（没动）：**`apps/desktop/node_modules/.vite/deps` 在 14:53 被更新过，是我跑规定命令时生产 vite 经软链接写进去的。这个目录本来就有，我没有动它。
> - **`pnpm check` 没能直接跑：**它因为 node_modules 是软链接而拒绝执行（“workspace hoist directory is not a real directory”，`$R/checks/pnpm-check-attempt.log`）。所以我用 `./node_modules/.bin/` 下的程序直接跑 package.json 里的三个脚本：`check` = `tsc --noEmit`，`test` = `vitest run`，`build` = `vite build`。
> - **字体配置：**
>   - 规定的 e2e 命令（生产 vite）照原样跑了，4 个失败全是字体 403。
>   - 另外用 `$R/tools/vite.review.config.mjs` 再跑了一遍全量 e2e。这个配置原样导入生产配置，只把主 checkout 的 node_modules 加进 `fs.allow`。
>   - shots 和全部专项 spec 也用这个配置。

**第 20 轮的三条 P3 都修好了：**

- **R20-P3-01（D218）：**
  - 第 20 轮的复现方法是在 `open_inbox` 之后停 300 ms。现在这段停顿落在锁里面，flow 3/3 通过；把问题项挪回锁外再停 300 ms，3/3 在 `flow.rs:186` 失败，和 `b6baa8a` 一样。
  - 四个变异都让对应测试失败：问题项先开、对话框在锁外登记、先查对话框再拿锁、没有对话框时退回文本。
  - flow 整包在被评审的树上跑了 7 次：单独 4 次，和 scratch 同时 1 次，10 个 CPU 负载进程下 2 次（负载 11.8–37.8）。同时跑的那次，scratch 也是 50/50。8 次全部 50/50。
- **R20-P3-02（D219）：**每 50 ms 采样，5 种调用节奏 × 3 个宽度（1241、1440、1800）× 中英文：
  - 看板行细节每个调用只换一次，100 ms 一次的连续调用之间不会退回 “Run 2”；
  - 运行时间只出现在 “Run 2” 后面，每个宽度只有一个 x（英文 604/704/875，中文 627/899）；
  - `b6baa8a` 每个调用来回换两次，时间在 704–850 之间跳。
- **R20-P3-03（D220）：**8 种回到表格的方式 × 浅/深 × 合并/并排，焦点环内缘离数字左 28.4 px、右 3.3 px，按钮等于整个单元格。`b6baa8a` 右边是 −2.7，压在数字上。

**这一轮做得好的地方：**

- **看板安静了：**快速调用时看板行不再闪。运行时间要么完整显示，要么整个让出，从不截断；`b6baa8a` 在 1241 和中文 1440 会截成 “已运行 21 小时 3…”。
- **目标页不再说两遍 “Run 2”：**头部写第几次运行，实况行写已进行多久。
- **锁的语义更完整（D218、D229）：**问题项、对话框和“等你”在一把锁里一步写完；引擎自己的模式不再盖住开着的问题。每条都有会失败的测试。
- **图标改成字符串（D235）：**12 个路由、中英文下图标的 markup、尺寸、描边都没变，DPR 4 下逐像素一致，换来了 bundle 余量。

**新问题（都是 P3）：**

- **R21-P3-01（断行既有；本轮引入的是无效规则和假通过的测试）：**并排对比里，D221 的 `.u { white-space: nowrap }` 在 WebKit 里不起作用，`net::ERR_CONNECTION_REFUSED` 照样在 `_` 后断开，HEAD 和 `b6baa8a` 结果完全一样。新测试量的是 computed style，不是实际断行，所以是假通过。
- **R21-P3-02（本轮引入）：**审批卡片的代码块原来是 `bash · rm -rf …`，现在是 `bash rm -rf …`。卡片要你点“允许”，代码块里却显示一条不会被执行的命令。桌面和手机都这样。

---

## 评审范围

- **被评审：**`9397e07`（HEAD，detached）和它前面的 `b59e68a`，worktree `/tmp/tower-design/wt-review21`。
- **对照：**`b6baa8a`（第 20 轮），worktree `wt-review21-base`，端口 1442。HEAD 在 1441；scratch 在 1443，用来换旧文件和做 Rust 变异。
- **浏览器：**Playwright WebKit，DPR 2（手机页 DPR 2–3，图标特写 DPR 4）。
- **宽度：**1040、1241、1280、1281、1440、1800；手机 390、360、320。中英文、浅色和深色都看了。
- **Rust：**
  - 读了 `run/asks.rs`、`run/events.rs`、`run/mod.rs`、`control.rs`，以及 `tower-store` 的 `events.rs`、`inbox.rs`、`goals.rs`。
  - 变异和探针在 scratch 上做，每次做完都还原文件（`$R/checks/rust/summary.txt`）。

## 加权评分

| 维度 | 权重 | 分数 | 理由 | 加权 |
|---|---|---|---|---|
| 产品适配 | 15% | 8.7 | **加分：**<br>• 问题项和对话框一步登记；没有对话框的回答被拒绝，不再悄悄当文本发出去（D218）；<br>• 引擎自己的模式不再盖住开着的问题（D229）；<br>• 停止之后，测试覆盖的几条路径都不再写模式（D234）。<br>**扣分：**<br>• 审批卡片显示 `bash rm -rf …`，和真正要执行的命令不一样（R21-P3-02）；<br>• 暂停路径上 `stopping` 仍在锁外设置，人为放慢时能让已暂停的目标显示“执行中”（只做记录）。 | 1.305 |
| 信息架构与工作流 | 20% | 8.7 | **加分：**<br>• 目标页和速览的头部写第几次运行，实况行写已进行多久，不再说两遍（D224）；<br>• 一直没调用、沉默很久的第一次运行写 “Run 1”，不再写 “Getting started”（D225）；<br>• 条带里缺图框放得下 5 行，错误码和地址都在框里（D221 条带部分）。<br>**扣分：**<br>• 目标页上 “Silent  running 22h 0m” 两个词打架（只做记录）；<br>• 调用的悬停提示把命令和整次运行的时长放在一起：“pnpm test --filter checkout, running 21h 33m”（两个提交都有，只做记录）。 | 1.740 |
| 视觉层级 | 15% | 8.8 | **加分：**<br>• 看板行在快速调用时不再闪，时间位置固定（D219）；<br>• 侧栏 “Needs you” 和合并冲突的数字是墨色，等你的东西更显眼（D226）；<br>• 焦点环离开了行号数字（D220）。<br>**扣分：**并排对比里错误码仍在 `_` 后断开（R21-P3-01）。 | 1.320 |
| 原创性与产品身份 | 15% | 8.6 | 底色纱、光缝、缺口环、切角印章和注记竖线都没变，也没有新的识别元素。图标改成字符串后逐像素一致，身份没有损失。 | 1.290 |
| 工艺与排版 | 10% | 8.6 | **加分：**<br>• 焦点环两侧各留 3 px；<br>• `net::` 和 `://` 不再从中间断开；<br>• 运行时间从不截半。<br>**扣分：**<br>• 并排里 `.u` 规则无效（R21-P3-01）；<br>• 审批正文和停滞标题里，工具名和命令粘成一串（R21-P3-02）。 | 0.860 |
| 密度与克制 | 10% | 8.7 | Rust 字符串里的 `·` 从 21 处降到 6 处，剩下的都在规则允许或必须保留的位置；没有新增颜色、标记或字形。 | 0.870 |
| 交互 | 10% | 8.7 | **加分：**<br>• 看板停留 1 秒，快速调用读得清；<br>• diff 拖选 3 行再 ⌘C，两个提交都复制 3 行；<br>• 8 种回到表格的方式，焦点环位置都对。<br>**扣分：**停留的这 1 秒里，徽标已经是 “Thinking”，后面还是刚结束的调用 “read src/checkout/tota…”（设计取舍，只做记录）。 | 0.870 |
| 设计系统一致性 | 5% | 8.6 | **加分：**<br>• DESIGN.md 和 docs/04 写了停留 1 秒、时间只跟在运行名后面、头部写运行号（D227）；<br>• `·` 规则在 Rust 一侧也执行了。<br>**扣分：**<br>• 文档还写着“第一次运行在第一个调用之前写开始工作”，没写 D225 的例外（沉默后写 “Run 1”）；<br>• 桌面中文改成 “已进行”，手机仍是 “已运行”。 | 0.430 |
| **合计** | 100% | | | **8.685** |

---

## 负责人意见（标记、动效、劣质 UI）的总体评价

负责人的原话是：“我不喜欢现在的红色方块，黄色菱形◆和蓝色圆形这三个UI，以及其他地方出现的这种劣质UI和审美，请你注意这一点并进行全面的纠正”。

- **三种标记：**这一轮没有再动标记。
  - 图标改成字符串后（D235），12 个路由、中英文下共 30 种图标，markup、尺寸、描边逐项一致（`$R/marks/icons-diff-{en,zh-CN}.txt` 都是 0 行）。
  - DPR 4 特写里，除了侧栏数字的颜色和时钟，两个提交逐像素一样（`$R/marks/stack-zoom.png`）。
  - 没有回到方块、菱形、实心圆。
- **粗糙字形扫描（`$R/charscan/`）：**
  - Rust 源码里的 `·` 从 21 处降到 6 处。剩下的是：
    - honesty.rs 的文档注释；
    - `examples/run_goal.rs`；
    - 手机页 pips 的悬停提示（标准刻度，规则允许）；
    - held-out 失败的 “C1 · title” 头（两端都按这个格式解析成行，不原样显示）。
  - 界面源码里的 `·` 46 处没变。屏幕上实际出现的只有验收标准条和预算行（“$0.04 · <1% of the $5 soft cap”），两个提交一样。
  - CSS `content` 只有注记竖线 “┆ ”。■ ✕ × ● 只出现在注释、解析器和示例里；ContractRail 的 “3×” 是倍数，不是装饰。
- **看板变安静了：**这正是负责人说的“劣质”的反面。快速调用时细节不闪，时间不跳，也不再截成半个数字。
- **新出现的粗糙处（R21-P3-02）：**
  - 去掉 `·` 的做法是直接换成空格。于是审批卡片的等宽代码块里出现 `bash rm -rf dist node_modules/.cache`，停滞卡片标题成了 “bash npm test failed 3 times in a row”。
  - 删分隔符本身没错，但工具名和命令需要各自的位置，不该挤在一串里。
  - Geist 的 Snippet 和 Primer 的代码块，都默认里面的文字可以原样复制去执行；把工具名塞进去就破坏了这一点。工具名应该放在代码块外的标签里。
- **还没到位的地方：**并排对比的缺图框仍在 `_` 后断行（R21-P3-01），和第 20 轮记录的一样，并没有修好。

## 作者说明的准确性

- **说得准的：**
  - D218、D219、D220、D224、D225、D226、D229、D231、D232、D235 的修复和测试，都和我在旧源码或变异上看到的失败原因一致（见下一节）。
  - 全量 e2e 423 通过、0 失败，和作者的 423/0 一致（字体配置）。
- **说过头的：**
  - **D221：**“side by side … `_` gives no break and the code stays whole” 不成立。`.u` 规则在 WebKit 里没有效果。作者用来证明“去掉 `.u` 规则会失败”（`one-u-rule`）的那条断言，只查 computed `white-space`，查不到实际断行。
  - **D234：**“once a run is stopping nothing writes a mode over the stop's” 只对测试覆盖的路径成立：
    - `settle_on` 的上锁和 `report_mode` 的停止守卫都没有测试真正卡住，变异后测试仍通过；
    - 暂停路径上 `stopping` 也在锁外设置。
  - **D230：**“an approval body is shown whole” 是对的。但正因为整体显示，去掉分隔符后读起来就像另一条命令。
- **一处说明：**D233 写的是 “fails on `939be97`'s CSS”。标签规则在 `workbenches.css` 里，换这个文件，测试就在标签断言处失败；只换 `app.css` 测试仍通过，因为规则不在那里。

## D218–D236 逐项核实

A = 第 20 轮的 P3，B = 第 20 轮的记录项，C = 第 20 轮指出的测试弱点，D = 作者本轮自己发现的。

| 项 | 类 | 结论 | 证据 |
|---|---|---|---|
| D218 | A | **已修复** | • 变异 `p-open-before-lock`、`p2-dialog-after-lock`、`i2-lookup-before-lock` 都让 `a_question_answered_the_moment_it_opens_finds_its_dialog` 失败；<br>• `i-answer-falls-back-to-text` 让 `an_answer_with_no_dialog_is_refused` 失败；<br>• flow 探针：`open_inbox` 后在锁内停 300 ms，3/3 通过；问题项挪到锁外再停，3/3 在 `flow.rs:186` 失败（`$R/checks/rust/probe-p-open-pause*.log`）；<br>• flow 整包 8 次全过（`$R/checks/flow/summary.txt`）。 |
| D219 | A | **已修复** | • 节奏测量在 `$R/live/{9397e07,b6baa8a}/overtime-*.txt`：5 种节奏（300/300、100/100、1500/1200、200/900、200/1100 ms）× 3 宽度 × 中英文；<br>• 徽标宽度：英文 Working 47.6、Thinking 49.4，细节左缘因此移动 1.7 px（两个提交一样），中文不动（`$R/flip/`）；<br>• 换回 `b6baa8a` 的 `Live.tsx`，作者的测试在 “details” 序列处失败（`$R/checks/fswap/live-base.log`）。 |
| D220 | A | **已修复** | • 测量：`$R/diff/summary.txt`、`$R/diff/stack-ring.png`；<br>• 换回 `b6baa8a` 的 `app.css`，`review-keys.spec.ts` 报 `{"right":-3,"left":22.1,"cell":[6,6]}`（`$R/checks/fswap/css-base.log`）。 |
| D221 | B | **部分修复** | • 条带：缺图框 153.6×96 放 5 行，REFUSED 和 localhost 都在框里；`net::`、`://` 不从中间断；<br>• 验收读数 115.2×72 仍是 3 行（作者说明里写了）；<br>• 悬停提示：HEAD 上 5 个位置都带完整原因，没有单词被拆开，共条带 30 个框、手机标签 29、并排 28、并排手机标签 28、验收读数 8（`$R/look/9397e07/log.txt`，`$R/tools/looktitle.py`）；<br>• 中文长句：条带 5 行截断，提示里 71 字完整；并排 2–3 行完整；<br>• 手机标签里的缺图原因，在我的 spec 里固定是“文件不见了”这种短句（140×96 / 174.6×96，1 行），长原因没测；<br>• 并排：`.u` 规则无效，HEAD 和 `b6baa8a` 断行一样（R21-P3-01）。 |
| D222 | B | **保留合理** | 两侧都缺、或窗口太矮时，框需要自己的尺寸；CSS 这一轮没改。 |
| D223 | B | **保留合理** | `min-width: 140px` 让 12 px 的说明能读。本轮实测手机标签的缺图框：中文 140×96，英文 174.6×96，和第 20 轮一致（只用了短原因）。 |
| D224 | B | **已修复** | • 目标页（`$R/live/*/goal-peek.txt`、`$R/live/stack-goal-head.png`）：头部 “Run 2”；实况行 “Thinking  running 21h 33m  just now”，中文 “思考  已进行 21 小时 33 分  刚刚”；`b6baa8a` 是 “Thinking Run 2 10m ago”；<br>• 看板 6 个宽度从不截断（`$R/live/*/board-widths.txt`）：英文 1241/1280/1281 让出、1440/1800 完整；中文 1241–1440 让出、1800 完整；<br>• 换旧 `Live.tsx` 后，作者测试在 “the detail is cut” 和 “running 5m / Run 1” 处失败。 |
| D225 | B | **已修复** | • 看板 “Silent  Run 1  running 25h 24m”；`b6baa8a` 是 “Silent  Getting started  running 25h …”，被截断（`$R/shots/pair-overview.png`）；<br>• 单元测试在旧 `Live.tsx` 上 3 条失败，原因正确（`$R/checks/fswap/d225-liveunit-base.log`）。 |
| D226 | B | **已修复** | • 计算色 `oklch(0.23 0.006 70)`，即 text-1；`b6baa8a` 是 0.47；<br>• 换旧 CSS 后 `verdict.spec.ts` 在颜色断言处失败；<br>• Operations 行的合并冲突计数也跟着变成墨色，符合“需要注意但不用决定 = text-1 + 无色注记标记”，但没有测试覆盖（`$R/shots/pair-sidebar.png`）。 |
| D227 | B | **部分修复** | • DESIGN.md 的 Live line 一节和 docs/04 第 2 行写了：停留 1 秒、时间只跟在运行名后面、整个让出不截断、头部写运行号；D206 改成了 “Getting started”；<br>• 但两处都写“第一次运行在第一个调用之前写开始工作”，没写 D225 的例外（沉默后写 “Run 1”）。 |
| D228 | B | **保留合理** | bundle 163,674 / 163,840，只剩 166 B，拆键确实放不下。 |
| D229 | B | **已修复** | • 变异 `j-report-over-question`、`k-turn-thinks`、`k2-compaction-end-thinks`、`k3-retry-end-thinks` 都让 `the_engines_own_modes_never_cover_an_open_question` 失败；<br>• `launch-dialogs` 让 `a_question_opened_before_the_first_message_still_waits_on_you` 失败。 |
| D230 | B | **部分修复** | • `·` 按规则从 7 处去掉了：审批正文、停滞签名、推送标题、基线错误列表、沙箱说明、bench guard、PR 页脚；保留的两处理由成立；<br>• 但审批正文变成 `bash rm -rf …`（R21-P3-02）；<br>• 我实际渲染的只有审批正文和停滞签名（桌面和手机，`$R/d230/`），其余 5 种字符串只读了 Rust 源码。 |
| D231 | B | **已修复** | • flow 测试在两份 checkout 上同时跑，重叠约 40 s：两边都 50/50，`verification_leaves_nothing_running` 都通过（`$R/checks/flow/concurrent-*.log`）；<br>• highlight 测试换上 `939be97` 的 worker 后，失败信息是 “two lines, one pass: expected 4 to be 2”，是规则本身失败，不是导出缺失（`$R/checks/fswap/d231-worker939.log`）。 |
| D232 | C | **已修复** | • 变异 `f-start-lock-append-only`、`g-answer-sent-first-unlocked`、`g2-answer-sent-first-locked`、`h-launch-thinks-after` 都让各自的测试失败；<br>• `g3`（先写模式、但发送前放锁）测试仍通过，所以“锁一直持有到回答发出”没有测试；模式已在发送前写好，这个顺序无害；<br>• `between` 在生产里是空函数 `#[cfg(not(test))] #[inline(always)] fn between(..) {}`（`asks.rs:24–26`），非测试 rlib 里没有它和 `STEPS` 的符号（`$R/checks/rust/between-symbols.txt`）。 |
| D233 | C | **已修复** | • 换 `939be97` 的 `workbenches.css`，honesty 测试在标签断言处失败，收到 `oklch(0.6 0.15 65 / 0.32) 0px 0px 0px 1px inset`（`$R/checks/fswap/d233-wb939.log`）；<br>• 我第一次只换了 `app.css`，测试通过（`d233-css939.log`），因为标签规则不在那个文件里。 |
| D234 | D | **部分修复** | • 测试覆盖的守卫都成立：`stop-guard-settle`、`stop-guard-start`、`store-rest-guard` 都让测试失败；<br>• 没测到：`report_mode` 的停止守卫。去掉它后 `what_ends_after_a_stop…` 仍通过，因为测试里开着的问题挡住了。我加了一个没有问题的探针：HEAD 通过，去掉守卫后失败（`$R/checks/rust/probe-stop-nodialog*.log`）；<br>• 没测到：`settle_on` 把停止和模式放进锁里，`settle-on-unlocked` 变异后测试仍通过；<br>• 暂停路径的窗口见“只做记录”第 1 条。 |
| D235 | D | **已修复** | 见“负责人意见”一节；bundle 163,674 ≤ 163,840。 |
| D236 | C | **保留合理** | • 旧 harness 在上限处什么都不返回，所以返回值就是正确的第一个失败点；<br>• 并排部分的尺寸规则（192 宽）单改一处就会失败；<br>• 注意：本轮在同一个测试里新加的 `.u` 断言是 computed style 的代理，见 R21-P3-01。 |

## 并发与锁（D218、D229、D234）的阅读结论

- **锁的顺序：**`mode_lock` → `flags`（临时 guard，用完就放）→ store。
  - `answer` 先在 store 里结清问题项，再拿 `mode_lock`，两者是先后关系，不是嵌套。
  - `engine.answer` 是无界通道发送，不会在锁里阻塞。
  - 我没找到会死锁的顺序。
- **并行调用：**`on_tool_start` 在锁里 append，只有在 `dialogs` 为空且不在停止时才写模式，然后才把调用记进 `tools`。调用结束时 `settle_mode` 会看还有没有在跑的调用。变异 a、b、f 都会失败。
- **ask_user、多个对话框、超时和回答：**有对话框时 `settle_held` 保持“等你”；超时先移除对话框，晚到的回答被拒绝。d、e 变异失败。
- **AgentEnd：**会停掉没结束的调用的实况行。c 变异失败。
- **第一条消息和最先到的事件：**先写“思考”再发送；发送前已经开着的问题不会被盖掉。h、launch-dialogs 变异失败。
- **暂停和事件：**
  - 测试覆盖的路径里，停止后不再写模式。
  - 但 `stop_engine` 在锁外设置 `stopping`（`events.rs:632`），暂停最后写“空闲”也不拿这把锁。
  - 探针：我在 `settle_held` 读完 `stopping` 之后人为停 400 ms，期间调用 `control::pause`。3 次探针结束时都是模式 Executing、实况行 `running`，模式序列是 [Starting, Executing, Idle, Executing]（`$R/checks/rust/probe-pause-beside-settle.{patch,log}`）。
  - 不加人为延迟时，这个窗口需要一次 settle 比整个停止过程（46–259 ms）还慢。我在 8 次 flow 里没见到它自然发生。
- **store 守卫：**正在跑、没在停止的运行不会被写成 Idle/Settled（验证只在提交后或评审中发生），所以 store 的“静止时不设实况行”不会误伤。
- **一致性：**正常路径下，模式、实况行、`running`、桌面的转圈和手机页一致（flow 整包、手机页两个提交结果相同）。唯一不一致的情形就是上面那个暂停窗口。

## 诚实语法

- **绿色：**
  - 手机页（`$R/phone/*/log.txt`，390/360/320，中英文，浅色和深色）：
    - 绿色只出现在带验证器 pin（`@15085f2`）的行上；
    - “不作数”的通过是琥珀，不是绿；
    - 没有 pin 的写 “Not machine-verified”，用 text-3；
    - 两个提交逐行一样；
    - 运行中的行，pips 里的绿段是验收标准条（每条标准的验证器结果），和第 20 轮一样。
  - 桌面：这一轮没有动颜色，但我没有在桌面上逐色重新测量。判断依据：
    - 仓库里的 honesty/verdict spec 在 HEAD 全部通过（全量 423/0）；
    - 69 张截图里 28 张逐像素相同；其余 41 张遮掉侧栏数字一列后，剩下的差异只在看板和速览的实况行、Operations 的时钟、G-0002 的头部，以及 1100 宽下位置不同的侧栏数字（`$R/shots/diff-summary.txt`，`$R/tools/shotres.py`）；
    - 图标 markup 完全一致。
- **琥珀：**审批和停滞卡片只有一个 “!” 标记，手机上是琥珀色的头部条，都表示“需要你”，不用于证据。
- **红色：**没有新增红色。
- **注记标记：**合并冲突的计数现在是 text-1，旁边是无色的注记标记，符合规则（D226 的连带效果）。
- **沉默徽标：**手机上是 text-2、400、没有 svg；桌面 `.mode-silent` 是 text-2、400（读 CSS 确认）。
- **中点：**屏幕上只在验收标准条和预算行出现。
- **Agent 的话、GitHub check 计数：**相关代码和截图区域这轮都没变。

## 回归检查（对照 `b6baa8a`）

- **截图 69/69（两个提交都跑了）：**
  - 28 张逐像素相同：评审页、验收表、验收读数、全部接受、空评审、欢迎页（两种）、设置的注意事项和手机页、快捷键（评审）、空看板、cannot-run 和 held-out 卡片。
  - 其余 41 张，先遮掉侧栏数字一列（x 400–440），再按 40 px 的横带找剩下的差异（`$R/tools/shotres.py`）：
    - 26 张只剩侧栏数字变墨色（D226，`$R/shots/pair-sidebar.png`）。其中 `look-compare-zh-dark` 的其他差异最大通道差只有 9，低于阈值，是噪声（`pair-look-compare.png`）。
    - 看板 G-0002 那一行的实况行（overview、activity-empty、peek 背后的看板，`pair-overview.png`）和速览头部（`pair-peek.png`）：现在是 “Silent  Run 1  running 25h 24m” 和 “Silent  running 25h 24m”，`b6baa8a` 是 “Getting started”（D224/D225）。
    - G-0002 目标页头部那一行（D224）。
    - Operations：下次运行时间的分钟数，21:14 对 21:15（`pair-operations.png`）。
    - 1100 宽的看板里，侧栏数字的位置不同（x 359–372），也是 D226。
  - 侧栏、看板、速览、Operations 我各看了一张裁图；G-0002 头部看的是专项 spec 的截图（`$R/live/stack-goal-head.png`）；其余按差异框归类。
- **全量 e2e（字体配置）：**HEAD 423 通过、76 跳过、0 失败；`b6baa8a` 420 通过、76 跳过、0 失败（`$R/checks/e2e-fonts-{head,base}.log`）。
- **diff 键盘和拖选复制：**
  - 拖 3 行再 ⌘C，两个提交在浅/深 × 合并/并排下都复制 3 行。
  - Tab 进入、↓×9、点空白再 Tab，焦点环都落在对的行上。
  - 焦点环现在紧贴并排深色下悬停出现的 “+” 槽（只做记录）。
- **去掉中点后的 supervisor 文案：**只有审批正文和停滞签名读起来有问题（R21-P3-02）。其他的我读了源码，中英文都通顺。
- **手机页：**12 种组合（中英文 × 浅/深 × 3 个宽度）和 28 个单目标头部，两个提交的记录排序后 `diff` 为 0 行。比较的是行文字、徽标、颜色、是否溢出（`$R/phone/*/{log,single}.txt`）。
- **性能（单独跑，没有别的负载，HEAD 和 base 交替各 2 次，`$R/checks/perf/`）：**
  - 50 个目标的看板：HEAD 277/240 ms（种子看板 230/182）；base 251/264（种子 204/174）。
  - 切换视图，取 8 次的中位数：HEAD 70/61 ms（种子看板 33/25）；base 61.5/65.5（种子 24.5/24）。
  - 都在阈值内，看不出回退。

## 新问题清单

### P0

无。

### P1

无。

### P2

无。

### P3

#### [R21-P3-01] 并排对比里，缺图说明中的错误码仍在 `_` 后断开；D221 的 `.u` 规则在 WebKit 里不起作用，新测试是假通过（断行既有，两个提交一样；本轮引入的是无效规则、假通过的测试和“已修复”的说法）

- **复现：**
  1. 1440×900，英文。
  2. 目标 G-0001 的外观标准缺 “after” 图，`pin_error` 设为 “The page did not open after waiting waiting waiting waiting net::ERR_CONNECTION_REFUSED at http://localhost:3000/checkout”。错误码前多加几个词，是为了让它落到行尾。
  3. 点条带上的图，打开并排对比。
- **现象：**
  - 说明断成 “…waiting net::ERR_ / CONNECTION_REFUSED at …”。
  - 在错误码前加 k 个词：1040 宽时 k=2–5 和 12–14 会在 `_` 后断，1440 宽时 k=4–6 会断。
  - HEAD 和 `b6baa8a` 逐条相同；code 变体里 “trace_id=abc_ / def_123” 也这样。
- **证据：**
  - `$R/look/9397e07/side-code.txt` 和 `$R/look/b6baa8a/side-code.txt`（逐条一样）；
  - 截图 `$R/look/9397e07/side-code-split-1440-k5.png`；
  - 最小用例 `$R/look/wbr-in-nowrap.txt`：nowrap span 里放 `<wbr>`，和不加 nowrap 的结果一样，都是 “aaaaaaaaaa=bbb_ / cccccccc”。
- **原因：**`Look.tsx:29` 把 `_` 输出成 `<span class="u">_<wbr/></span>`。`app.css:5378` 的 `.look-side .look-missing .u { white-space: nowrap; }` 想在并排时关掉这个断点，但 WebKit 仍在 nowrap 元素里的 `<wbr>` 处断行。
- **为什么测试是假通过：**
  - `flows.spec.ts` 新加的 `breaks()` 查的是 `<wbr>` 父元素的 computed `white-space`。
  - `sameLine()` 只在那条测试原因本来就放得下一行的位置检查。
  - 我删掉 `.u` 规则再跑：测试只在 “wide, no break after a _” 这条 computed-style 断言处失败，前面的 `sameLine` 照样通过（`$R/checks/fswap/no-u-rule.{diff,log}`）。可见这条规则并没有让错误码保持完整。
- **为什么是 P3：**这是缺图时的说明框，完整文字在悬停提示里，不影响判断。但这一项声称修好了，实际没修好，测试也证明不了它。
- **修复目标：**
  - 并排时根本不输出 `_` 后面的 `<wbr>`（例如给 `Why` 传一个参数），或者把整个错误码包进一个不含断点的 nowrap span。
  - 测试改成量实际断行：在 1040 和 1440 下给原因加不同长度的前缀，让错误码扫过行尾，断言错误码的每个字符都在同一行。

#### [R21-P3-02] 审批卡片的代码块显示 `bash rm -rf …`，不是会被执行的命令；停滞标题里工具名和命令也粘在一起（本轮引入，D230）

- **复现：**
  - 任意一个要审批的 bash 命令，比如 `rm -rf dist node_modules/.cache`。
  - 扩展把 `{tool: "bash", target: <命令原文>}` 交给 supervisor（`extensions/tower-goal/index.ts:265`），supervisor 生成正文 `format!("{} {}", tool, target)`（`asks.rs:99`）。
  - 在收件箱或手机页上打开这张卡片。
  - 说明：我没有跑真实的 supervisor。卡片是我按上面两处源码拼出的收件箱数据，注入 e2e 的桌面页和手机页（`$R/checks/specs/tmp-review21-d230.spec.ts`）；`b6baa8a` 一侧用带 `·` 的旧格式。
- **现象：**
  - 桌面和手机的等宽代码块里都是 `bash rm -rf dist node_modules/.cache`；`b6baa8a` 是 `bash · rm -rf …`。
  - 这串字照字面读，是“用 bash 运行一个叫 rm 的脚本”，不是真正要执行的 `rm -rf …`。而卡片要你按的正是“允许”。
  - 同一个原因还影响停滞卡片。标题是 “bash npm test failed 3 times in a row”“bash npm test 连续失败 3 次”，看不出哪个是工具、哪个是命令。
- **证据：**`$R/d230/stack-desk.png`（HEAD 在上，base 在下）、`$R/d230/phone-head-en.png`、`$R/d230/{9397e07,b6baa8a}/log.txt`。
- **原因：**`asks.rs:99` 的审批正文、`events.rs:113` 的停滞签名，都只是把 `·` 换成了空格。客户端把审批正文整个当成机器文本放进代码块（`DecisionCard.tsx:108`，`remote.html:298`）。
- **为什么是 P3：**审批作用在真实命令上，不会执行错，读者多半也能猜出来。但审批卡片是最需要精确的决策位置，“显示的就是要执行的”这条原则在这里被打破了，而且是本轮的改动造成的。
- **修复目标：**
  - 代码块里只放 target。工具名放在代码块外，例如卡片头部，或一个 text-2 的小标签 “bash”，不用中点。
  - 停滞标题同样把工具名和命令分开写，比如 “`npm test`（bash）连续失败 3 次”，命令用等宽字体。
  - 测试断言审批卡片代码块的文字等于命令原文。

## 只做记录，不计入

1. **暂停路径仍有一个锁外窗口（D234 的剩余部分）：**
   - `stop_engine` 在锁外设置 `stopping`（`events.rs:632`），`control::pause` 写“空闲”也不拿这把锁。
   - 人为让 `settle_held` 在读完 `stopping` 后停 400 ms：3/3 次探针结束时，已暂停的目标仍是 Executing，实况行 `running`（`$R/checks/rust/probe-pause-beside-settle.*`）。
   - 我只看了探针结束时的状态。从代码看，暂停后不会再有事件把它纠正，但这一点没有实测。不加延迟时我没见到它自然发生。
   - 修复方向：在 `mode_lock` 下设置 `stopping`，或者暂停写“空闲”时也拿这把锁。
2. **D234 有两句话没有测试：**
   - `settle_on` 把停止和模式放进锁里：变异后测试仍通过。
   - `report_mode` 的停止守卫：被测试里开着的问题挡住了，变异后仍通过；我的无问题探针能抓到。
3. **D232 的“锁一直持有到回答发出”没有测试：**g3 变异通过。模式已在发送前写好，这个顺序无害。
4. **看板停留的这 1 秒：**
   - 徽标已经是 “Thinking”，后面还是刚结束的调用：“Thinking  read src/checkout/tota…”（`$R/flip/stack-linger-left.png`）。
   - 这正是 R19-P3-03 排除过的状态，现在作为防抖设计保留 1 秒。
   - 我的判断是可以接受：它最多 1 秒，而且不会落到别的目标上。看板用 `<For>` 按对象键控，`LiveLine` 的停留信号属于各自的行。
   - 更干净的做法是徽标也跟着停留 1 秒，让整行一起滞后。
5. **调用的悬停提示把命令和整次运行的时长放在一起：**“pnpm test --filter checkout, running 21h 33m” 读起来像这条命令跑了 21 小时。两个提交都有；HEAD 只在悬停提示里出现。
6. **目标页 “Silent  running 22h 0m  last activity 22h ago”：**“沉默”和“进行中”放在一起，词意打架。
7. **“Starting  Starting”：**第 2 次运行在启动时，目标页实况行把同一个词写两遍。既有问题，`b6baa8a` 是 “Starting StartingRun 2”。
8. **`run_started_at` 为空但状态是 running：**目标页实况行只有 “Thinking”，细节为空，却带着光带的类。正常流程到不了这里，因为 `begin` 在同一个 store 步骤里写状态和 RunStarted。
9. **D227 的文档遗漏：**DESIGN.md 和 docs/04 没写 D225 的例外（第一次运行在第一个调用之前就沉默时，写 “Run 1”）。
10. **桌面和手机用词不一：**桌面中文的运行时长是 “已进行 {d}”，手机页仍是 “已运行 {d}”。手机行里的这个前缀只给读屏；头部 “bash 已运行 3m” 是工具的时长，没问题。
11. **英文徽标宽度不同：**Working 47.6、Thinking 49.4，每次翻转细节左移或右移 1.7 px。两个提交都有；中文不动。
12. **焦点环紧贴悬停出现的 “+” 槽**（并排、深色）。
13. **合并冲突计数变墨色没有测试：**D226 的测试只查 “Needs you”。
14. **英文证据句的标点：**“Verifier: C1 passed @15085f2. The agent says …” 的句号紧跟在 pin 后面，容易被当成 pin 的一部分（`goals.rs:438`，D230 改的）。

## 新测试是否测到了它声称的东西

- **测到了：**
  - D219/D224 的看板与目标页测试：换旧 `Live.tsx` 后 4 条失败，原因分别是细节序列、截断、“running 5m / Run 1”。
  - D225 单元测试：3 条失败。
  - D220 焦点环：right −3。
  - D226：颜色 0.47。
  - D221 条带：错误码和地址不在框里。
  - D221 `::`/`://`：换旧 `Look.tsx` 后，“no break inside :: or ://” 收到 14 处。
  - D233：内描边。
  - D231：expected 4 to be 2。
  - D218/D229/D232 的 Rust 测试：每个变异都在声明的测试上失败。
  - 以上日志都在 `$R/checks/fswap/` 和 `$R/checks/rust/`。换回 HEAD 文件后，同一组测试全部通过（`head-same.log`、`live-head.log`）。
- **没测到：**
  - **D221 并排 `_`：**代理断言，假通过（R21-P3-01）。
  - **D234：**`settle_on` 的锁、`report_mode` 的守卫（见只做记录第 2 条）。
  - **D232：**“锁持有到发出”（无害）。
  - **D226：**合并冲突计数。
  - **D230：**没有测试检查审批正文的显示形式。
- **可能误报的地方：**D219 的 e2e 只用 300 ms 一次的固定节奏和 50 ms 采样，只覆盖一种节奏。我补了 4 种节奏，结论一致。

## 工程检查结果

| 检查 | 结果 | 日志 |
|---|---|---|
| `pnpm check` | 因软链接被拒绝执行；改跑同一脚本 `./node_modules/.bin/tsc --noEmit`，退出码 0 | `$R/checks/pnpm-check-attempt.log`、`tsc.log` |
| `pnpm test`（vitest） | 45 个文件，260 个测试全部通过 | `vitest.log` |
| `pnpm build`（vite build） | 成功 | `build.log` |
| `bundle-budget.sh` | 163,674 / 163,840 B（启动 56,147，按需 107,527）；目标页 chunk 11,626 / 12,288；worker 197,983 / 262,144 | `bundle-budget.log` |
| `line-limit.sh`、`doc-numbers.sh` | 通过 | `line-limit.log`、`doc-numbers.log` |
| `cargo fmt --all --check` | 通过 | `cargo-fmt.log` |
| `cargo clippy --workspace --all-targets -- -D warnings` | 通过 | `cargo-clippy.log` |
| `cargo test --workspace` | 29 个测试集，480 通过，0 失败，2 忽略 | `cargo-test.log` |
| flow 整包 | 8 次全部 50/50：单独 4 次（负载 3.9–7.7）；和 scratch 同时 1 次（scratch 也 50/50）；10 个 `yes` 负载下 2 次（负载 11.8–37.8） | `$R/checks/flow/summary.txt` |
| 规定 e2e（生产 vite） | 419 通过，4 失败，76 跳过。失败全在 `smoke.spec.ts:7/73/125/148`，原因是字体 403 导致的控制台错误 | `e2e-full.log` |
| 全量 e2e（字体配置） | HEAD 423/0/76；`b6baa8a` 420/0/76 | `e2e-fonts-{head,base}.log` |
| shots | 两个提交都是 69/69 | `shots-{head,base}.log` |
| perf（`--project=perf --no-deps`，交替） | 见回归一节，没有回退 | `$R/checks/perf/` |

## 没能覆盖的

- **桌面诚实语法的逐色测量：**这一轮没有在桌面上逐个元素重新取色。依据是仓库 spec 全过、截图差异限定在已知区域、图标 markup 一致。
- **D230 的其余 5 种字符串**（基线错误列表、沙箱说明、推送标题、PR 页脚、bench guard）：只读了 Rust 源码，没有在界面上渲染。PR 页脚和推送标题需要真实的 GitHub 和推送通道，本地做不到。
- **D218 的拒绝提示**（“The agent is no longer waiting…”）：只用 Rust 测试确认会拒绝并记日志，没有在界面上看到这句话。
- **引擎出错路径：**只读了代码，没有构造引擎出错与停止、问题交错的场景。
- **暂停窗口的自然发生率：**只在人为 400 ms 延迟下复现，没有做长时间负载压测。
- **打包后的应用：**按规定没有运行打包应用，WKWebView 和 Playwright WebKit 之间的差异没有覆盖。
- **手机标签里的长缺图原因：**手机标签的缺图框量了尺寸，但原因固定是“文件不见了”这种短句；带 URL 的长原因和中文长句没在手机标签里测。

## 验收条件（下一轮）

1. **R21-P3-01：**
   - 并排对比里，错误码在任何行尾位置都不在 `_` 后断开（1040 和 1440，前缀扫描）。
   - 测试量实际断行，并且在 `b6baa8a` 的 `Look.tsx`/`app.css` 上失败。
2. **R21-P3-02：**
   - 审批卡片代码块的文字等于命令原文，工具名在代码块外，不用中点。
   - 停滞标题把工具名和命令分开写。
   - 桌面和手机都有测试，并且在当前的正文格式上失败。
3. **只做记录第 1、2 条（建议）：**
   - 暂停时在锁内设置 `stopping`，或者暂停写“空闲”时也拿模式锁。
   - 给 `settle_on` 的锁和 `report_mode` 的停止守卫各加一个变异后会失败的测试；后者的测试里不要有开着的问题挡住。
4. **保持现状：**bundle 不超预算（现在余 166 B），flow 整包在负载下全部通过，全量 e2e 0 失败。
