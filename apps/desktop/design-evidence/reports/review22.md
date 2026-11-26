**结论：PASS。** 加权得分 **8.81/10**（8.810），没有未关闭的 P0、P1 或 P2。

- 第 21 轮的两条 P3 都修好了，每条都在 `9397e07` 上复现过，再在 `864d6c3` 上确认：
  - R21-P3-01 对应 D237；
  - R21-P3-02 对应 D238。
- D239、D240、D242–D253 成立。D241 保留合理。D221、D227、D230、D233、D234 改正后的说法与我看到的一致。
- 本轮新记 1 条 P3，是既有问题，不是本轮引入：**R22-P3-01**，审批代码块里分不出“自动折行”和“命令自己的换行”，手机上还会在 `--` 和 `fill` 之间断开。D238 让代码块“只放命令原文、多行照原样”，行结构从此有了含义，这个老问题因此变得显眼。
- 另有 8 条只做记录。

# Tower 前端设计评审：第 22 轮（`864d6c3`；对照 `9397e07`）

> 文中 `$R` 指 `/tmp/tower-design/review22`，截图、日志和测量都在这里。
> - **临时 spec：**已从所有 worktree 删除。副本在 `$R/checks/specs/`，共 10 个文件：approval、diff、evidence、green、lib、live、look、marks、phone、u。
>   - 其中 `tmp-review22-lib.ts` 是公用的辅助模块，不是 spec，所以不带 `.spec.ts` 后缀。
> - **检查日志：**
>   - 工程检查：`$R/checks/`；
>   - 前端换回旧源码和变异：`$R/fswap/`；
>   - Rust 变异和探针：`$R/rust/`；
>   - flow 重复跑：`$R/flow/`；
>   - 工具：`$R/tools/`；
>   - 工作笔记：`$R/notes.md`。
> - **主仓库：**主 checkout 只用来读，以及执行 `git worktree add/remove`。它的 `git status` 只有原本就有的 `?? .claude/`。
> - **清理后的状态：**
>   - `git -C /tmp/tower-design/wt-review22 status --short --ignored` 只剩两个 node_modules 软链接（`?? node_modules`、`?? apps/desktop/node_modules`）。
>   - 对照用的 `wt-review22-base` 和变异用的 `wt-review22-scratch`：先删掉各自的两个软链接（只删链接本身），再用 `worktree remove --force` 删除。删除前，scratch 的 `git status` 除软链接外是空的。`git worktree list` 现在只剩主 checkout 和 `wt-review22`。
>   - 1441–1443 端口没有监听进程；10 个 `yes` 负载进程已结束（`pgrep -x yes` 为 0）。
>   - worktree 外的 cargo target（`$R/target` 6.0G、`$R/target-scratch` 1.7G）和 review 用的 vite 缓存（`$R/vite-cache`）都已删除。
> - **需要说明的产物：**
>   - **`wt-review22` 里的 `apps/desktop/dist/`、`apps/desktop/src-tauri/gen/`、`apps/desktop/test-results/`：**分别来自 `vite build`、workspace clippy 时 tauri-build 的生成、Playwright。三者都是被忽略的文件，已删除。
>   - **主 checkout 的 vite 缓存（没动）：**`apps/desktop/node_modules/.vite/deps` 在今天 17:10:01 被更新过，是我跑规定的 e2e 命令时，生产 vite 经软链接写进去的。这个目录本来就有，我没有动它。同目录下的 `deps_temp_*` 和 `vitest/` 是 11 月 25 日的，不是我写的。
> - **`pnpm check` 没能直接跑：**它因为 node_modules 是软链接而拒绝执行（“workspace hoist directory is not a real directory”，`$R/checks/pnpm-check.log`）。所以我用 `./node_modules/.bin/` 下的程序直接跑 package.json 里的三个脚本：`tsc --noEmit`、`vitest run`、`vite build`。
> - **字体配置：**
>   - 规定的 e2e 命令（生产 vite、作者的 fixtures）照原样跑了，4 个失败全是字体 403。
>   - 另外用 `$R/tools/vite.review.config.mjs` 跑了一遍全量 e2e。这个配置原样导入生产配置，只把主 checkout 的 node_modules 加进 `fs.allow`，缓存目录指到 `$R/vite-cache`。
>   - shots 和全部专项 spec 也用这个配置。
> - **fixtures：**我照 `tools/e2e.sh` 的 `dump` 用 `864d6c3` 的 supervisor 自己生成了一份（`$R/fx/`）。和作者的 `iter22/final/fx` 相比，只有 id、seq、时间、端口和 project_id 不同（`$R/checks/fx-compare-substantive.txt`）。

**第 21 轮的两条 P3 都修好了：**

- **R21-P3-01（D237）：**
  - 我在并排对比的缺图框里，让错误码一个词一个词地挪到行尾附近，k 从 0 到 16；宽度 1040、1241、1440、1800；原因有英文、中文、trace 三种。
  - HEAD 三种原因各 68/68 次，`net::ERR_CONNECTION_REFUSED` 和 `http://` 都完整，没有溢出、没有截断。
  - `9397e07` 上分别有 23、28、12 次断开（`$R/look/{864d6c3,9397e07}/side-code-*.txt`，`$R/look/stack-side-code-en-1040-k5.png`）。
- **R21-P3-02（D238）：**
  - 审批代码块现在只放命令或路径原文：单行、多行、长命令、路径四种，中英文 × 浅/深，桌面上代码块文字和正文逐字相等。
  - 停滞标题是 “pnpm test (bash) failed 4 times in a row” / “pnpm test（bash）连续失败 4 次”。
  - supervisor 这一半的 3 个变异都让测试失败。

**这一轮做得好的地方：**

- **看板一行一起换：**每 50 ms 采样。HEAD 在调用的字停留的那 1 秒里，徽章仍是 “Working”；`9397e07` 已经变成 “Thinking”。
  - 英文徽章两个词都是 51.0 px，细节起点每个宽度只有一个 x（1440 下是 666.1）；`9397e07` 是 49.4/47.6，细节会来回挪 1.7 px。
- **目标页不再 “Starting  Starting”：**现在是 “Starting  elapsed 20s”。
  - “Silent  running 22h 0m” 变成 “Silent  elapsed 22h 0m”，“沉默”和“运行中”不再打架。
- **锁的语义补齐了：**停止在模式锁里标记；`settle_on` 的锁、`report_mode` 的停止守卫各有会失败的测试。

**新问题（1 条 P3，既有）：**

- **R22-P3-01：**审批代码块里，自动折行和命令自己的换行看起来一样。
  - 桌面：折出来的部分从第 0 列开始，和真正的新行一样；
  - 手机：用悬挂缩进折行，和命令自己的两格缩进一样，而且会在 `--` 和 `fill` 之间断开。
  - 详见“新问题清单”。

---

## 评审范围

- **被评审：**`864d6c3`（HEAD，detached），worktree `/tmp/tower-design/wt-review22`，端口 1441。
- **对照：**`9397e07`（第 21 轮），worktree `wt-review22-base`，端口 1442。
- **scratch：**`wt-review22-scratch`（`864d6c3`），端口 1443，用来换旧文件、做前端变异和 Rust 变异/探针。每次做完都 `git checkout` 还原，并记录还原后的状态（`$R/rust/scratch-after.txt`，各 `.log` 末尾）。
- **浏览器：**Playwright WebKit。DPR 2；手机页 DPR 3；diff 焦点环特写 DPR 3。
- **宽度：**1040、1241、1280、1281、1440、1800；手机 390、360、320。中英文、浅色和深色都看了。
- **Rust：**读了 `run/asks.rs`、`run/events.rs`、`run/mod.rs`、`run/slots.rs`、`control.rs`、`tower-pi/src/engine.rs`，以及 `tower-core/src/i18n.rs`、`tower-store/src/{goals,inbox,events}.rs`。
- **扩展：**读了 `extensions/tower-goal/{policy,index,acp}.ts` 和 `policy.test.ts`。

## 加权评分

| 维度 | 权重 | 分数 | 理由 | 加权 |
|---|---|---|---|---|
| 产品适配 | 15% | 8.9 | **加分：**<br>• 审批代码块就是要放行的命令或路径，不再出现“另一条命令”（D238）；<br>• 路径类审批的原因写成动作：“write to a path the contract makes read-only”；<br>• 停止在模式锁里标记，暂停不会被一次进行中的 settle 盖回“执行中”（D239）。<br>**扣分：**<br>• 代码块里折行和换行分不出（R22-P3-01，既有）；<br>• Pi 中止时如果发来审批，会短暂出现“等你”，之后才被撤回（只做记录，既有）。 | 1.335 |
| 信息架构与工作流 | 20% | 8.9 | **加分：**<br>• 启动中写 “Starting  elapsed 20s”，不再说两遍（D245）；<br>• 悬停提示把“第 N 次运行 + 时间”放在单独一行（D243）；<br>• 运行时间统一写 “elapsed / 已进行”，桌面和手机一致（D244、D248）；<br>• 证据句以 pin 结尾（D252）。<br>**扣分：**<br>• 没有开始时间时，目标页头部和实况行各写一遍 “Run 2”。正常流程走不到这种情况（只做记录）。 | 1.780 |
| 视觉层级 | 15% | 8.9 | **加分：**<br>• 看板行在停留期间整行一起换，细节起点不动（D242、D249）；<br>• 合并冲突计数的墨色有测试（D251）。<br>**扣分：**<br>• 停滞标题里的命令用的是正文字体（只做记录）。 | 1.335 |
| 原创性与产品身份 | 15% | 8.6 | 底色纱、光缝、缺口环、切角印章、注记竖线都没变，也没有新的识别元素；身份没有损失，也没有推进。 | 1.290 |
| 工艺与排版 | 10% | 8.7 | **加分：**<br>• 并排对比里错误码和地址在 4 个宽度 × 17 个位置都完整；<br>• 焦点环和 “+” 之间留 4 px（D250）；<br>• 没有一个词从中间断开。<br>**扣分：**<br>• 手机代码块在 `--` 和 `fill` 之间断开，悬挂缩进和命令自带的缩进相同（R22-P3-01）。 | 0.870 |
| 密度与克制 | 10% | 8.8 | 没有新增颜色、标记或字形。屏幕上的 `·` 仍只在验收标准条和预算行；源码里新出现的 `·` 只是 i18n 里为读旧格式保留的解码字符串。 | 0.880 |
| 交互 | 10% | 8.8 | **加分：**<br>• diff 合并视图里，↩ 打开评论框；拖 3 行再 ⌘C 复制 3 行，不带 “+”；<br>• 停留 1 秒，整行一次换完。<br>**扣分：**<br>• 悬停提示是原生 `title`，我没能截图核对它的实际样子（见“没能覆盖的”）。 | 0.880 |
| 设计系统一致性 | 5% | 8.8 | **加分：**<br>• DESIGN.md 的 Live line 一节和 docs/04 第 2 行写了 D225 的例外、停留时徽章不变、4.25em、提示行、“elapsed”（D247）；<br>• `review-scope.spec.ts` 不再依赖某一次 dump 的提交号（D253）。<br>**扣分：**<br>• D250 的 D 行写的是“并排深色”，但并排视图根本没有 “+”。 | 0.440 |
| **合计** | 100% | | | **8.810** |

---

## 负责人意见（标记、动效、劣质 UI）的总体评价

负责人的原话是：“我不喜欢现在的红色方块⬛️，黄色菱形◆和蓝色圆形这三个UI，以及其他地方出现的这种劣质UI和审美，请你注意这一点并进行全面的纠正”。

- **三种标记：**这一轮没有动标记，没有回到方块、菱形或实心圆。
  - 两个提交在 G-0001–G-0005、看板、收件箱、评审页等的逐元素着色扫描，除了时间文字（“19m ago / 28m ago” 这类）以外完全一样：`$R/marks/paint-all-{864d6c3,9397e07}.txt`，diff 共 66 行，全是时间。
  - CSS `content` 里没有伪元素字形。
- **粗糙字形扫描（`$R/charscan/hits-*.txt`）：**
  - 新出现的 `·` 只在 `i18n.rs` 里读旧停滞格式（“bash · npm test”）的解码字符串，不会显示出来。
  - 界面里的 “↔” 有 2 处（证据账本的连接符），本轮之前就有。
  - ●/◉ 只出现在注释里；■/✕ 只出现在示例和 prompts 解析器里。
- **这一轮的改动正是对“劣质”的纠正：**
  - 审批卡片不再把工具名粘在命令前面；
  - 停滞标题先说命令，工具放在括号里；
  - 看板一行不再一半换了、一半没换；
  - “Starting  Starting” 和 “Silent  running …” 这类叠词消失了。
- **动效：**这一轮没有新增动画。
  - 看板停留 1 秒时，徽章和字一起留；
  - 目标页实况行原有的微光（`live-moving`）没变：`$R/live/864d6c3/goal-starting-run2-en-light.png` 里 “elapsed 20s” 的前两个字母正处在微光里。
- **还没到位的地方（对照 Primer / Geist / Linear 的常见做法）：**
  1. **代码块的折行（R22-P3-01）：**GitHub 的代码块不自动折行，而是横向滚动；Geist 的 Snippet 是单行、可横向滚动。所以行结构就是命令的行结构。Tower 两端都自动折行，读的人分不出哪里是命令自己的换行。在 shell 里，换行就是两条命令。
  2. **停滞标题：**“pnpm test (bash) failed 4 times in a row” 整句都是正文字体。Linear 和 GitHub 会把命令、文件名这类标识符放进行内代码，读者一眼就能看出哪部分是原文。
  3. **悬停提示：**提示是原生 `title`，内容是 `src/cart.ts⏎Run 2 elapsed 21h 33m`。Linear/Geist 会用自绘提示做层级；原生提示在 macOS 上可以接受，但 “Run 2” 和 “elapsed” 之间没有任何分隔。
  4. **证据句里的 pin：**“Verifier: C1 passed @c772361” 里的 pin 是正文字体（`$R/evidence/864d6c3/ledger-en-light.png`）。Primer 显示 SHA 一律用等宽。这是小事。

## 作者说明的准确性

- **说得准的：**
  - D237–D240、D242–D253 的修复和测试，都和我在旧源码或变异上看到的失败原因一致（见下两节）。
  - D237 说“换回 `9397e07` 的 `Look.tsx` 和 `app.css` 会失败，两种语言共 58 个宽度”：我换回旧 `Look.tsx` 加旧 `app.css`（`look-old`）、只换旧 `Look.tsx`（`look-tsx-old`），以及只把 `Look.tsx` 里那一行改回“宽框也用条带的断点”（`wide-strip-breaks`），三次都在 “keeps the picture's frame” 失败，58 个宽度（`$R/fswap/`）。
  - D221、D227、D230、D233、D234 改正后的说法和第 21 轮报告的结论一致，范围也写对了（逐条见下表）。
- **说得宽了一点的（不影响结论）：**
  - **D237：**“并排的框只在地址里断行（`://` 之后或 `/` 之后）”不完全准确。WebKit 自己仍会在 `?` 之后断行，例如中文 1241–1440 下 “http://localhost:3000/checkout? / step=payment…”；中文长句也会在字之间断开，例如 “端 / 口”（`$R/look/summary.txt`）。两种断法都是正常的断点，错误码和 `://` 不会被断开，所以无害。
  - **D250：**D 行说问题出在“并排、深色”，但两个提交的并排视图里都没有 “+” 槽：每行 4 格，没有 gutter（`$R/diff/{864d6c3,9397e07}/log.txt`）。修复实际作用在合并视图上。第 21 轮的那条记录很可能量的就是合并视图：我用 Playwright 在打开后立刻按 `Alt+v`，布局没有切换，后来改为点 ⌥V 按钮才切过去。

## 第 21 轮问题与“只做记录”的逐项核实

A = 第 21 轮的 P3，B = 第 21 轮的记录项，C = 作者本轮自己发现的，E = 改正的旧说法。

| 项 | 类 | 结论 | 证据 |
|---|---|---|---|
| D237 | A | **已修复** | • 并排扫描：HEAD 英文/中文/trace 各 68/68 次完整，`9397e07` 分别 45/40/56 次完整（23/28/12 次断开），两边都不溢出、不截断（`$R/look/*/side-code-*.txt`、`$R/look/stack-side-code-en-1040-k5.png`）；<br>• 条带：30 个框都是 153.6×96，1、2 或 5 行，22 个截断，截断的都在提示里写全；验收读数 8 个框都是 115.2×72、3 行；所有位置没有一个词从中间断开（`$R/look/summary.txt`）；<br>• `.look-side .look-missing .u` 规则已删（读源码）；<br>• 换旧源码和一行变异都让作者的 e2e 失败，见上一节。 |
| D238 | A | **已修复** | • **桌面**：单行、多行、长命令、路径四种 × 中英文 × 浅/深，`.decision-tail` 的 innerText 和正文逐字相等，多行保留原来的缩进（`$R/approval/864d6c3/log.txt`、`$R/approval/stack-desk-864d6c3.png`）；<br>• **手机**：代码块内容正确（`$R/approval/phone-pair-864d6c3.png`），长命令的折行见 R22-P3-01；<br>• **Rust 变异**：`approval-tool-prefix` 让 `an_approval_shows_the_command_it_allows_and_nothing_else` 失败（“bash cd web &&…”）；`stall-tool-first` 和 `stall-no-dot-strip` 都让 `stalls_are_put_into_words_on_read` 失败（`$R/rust/`）；<br>• **扩展**：换回旧 `policy.ts`，`policy.test.ts` 失败（“the contract makes this path read-only” 不匹配 `/^write to a path /`，`$R/fswap/ext-policy-old.log`）；<br>• **客户端**：在代码块前加 `bash `，桌面 2 个、手机 1 个测试失败（`client-prefix-{desk,phone}`）。把手机的多行正文压成一行，手机 21 个测试全部通过（`client-oneline-phone`）。桌面的多行有测试钉住（`flows.spec.ts:2019` 用 `"cd web &&\n  rm -rf …"`，断言用 `toBe`）。<br>• **“这样是否够”**：supervisor 一半是够的。客户端测试确实钉住了“代码块就是正文，不加任何东西”，旧客户端通过是预期内的。唯一的缺口是手机的多行没人测，建议在 `phone.spec.ts` 里加一个多行正文。<br>• **拒绝后给 Agent 的话**：`index.ts:257`、`acp.ts:215` 只读了源码，没有测试钉住。三种路径原因（只读、被排除、在范围围栏外）代入 “The human declined to let you {reason}: {rel}.” 都读得通。 |
| D239 | B | **已修复** | • HEAD 上 `a_pause_beside_a_settle_has_the_last_word` 5/5 通过；<br>• 变异 `stop-outside-lock`（把停止标记挪回锁外）5/5 失败：期望 (Paused, Idle)，实际 (Paused, Executing)，模式序列 [Starting, Executing, Idle, Executing]（`$R/rust/stop-outside-lock.log`、`head-pause-test.log`）。锁的阅读结论见下一节。 |
| D240 | B | **已修复** | • HEAD 上 `a_run_settling_beside_a_settle_stays_settled` 5/5 通过，`settle-on-unlocked` 5/5 失败（Executing，不是 Settled）；<br>• `report-no-stop-guard` 让 `a_stopped_run_reports_no_mode_of_its_own` 失败（Compacting，不是 Idle）；<br>• 两个测试里都没有开着的问题，第 21 轮指出的“被问题挡住”的问题不存在了。 |
| D241 | B | **保留合理** | • `answer_dialog` 在锁里先写模式再发送；`engine.answer` 是无界通道发送，不会在锁里阻塞；<br>• 在写完模式之后、发送之前放锁，模式也已经写好，用户看不到差别；<br>• 为此在写和发之间加测试钩子，测不出任何用户能看到的东西。 |
| D242 | B | **已修复** | • 看板每 50 ms 采样（`$R/live/{864d6c3,9397e07}/overtime-*.txt`、`linger-*.png`）：`9397e07` 在 463 ms 时徽章已是 “Thinking”，后面仍是 “read src/cart.ts”；HEAD 每个调用的停留期间都是 “Working”，字一换徽章才换；<br>• “停留中来了问题”这一组：`9397e07` 是 Working → Thinking → Needs you，HEAD 是 Working → Needs you（`linger-question-*.txt`）；<br>• `badge-not-held` 变异让作者的 e2e 失败。 |
| D243 | B | **已修复** | • HEAD 提示：`src/cart.ts⏎Run 2 elapsed 21h 33m`；`9397e07`：“src/cart.ts, running 21h 33m”；<br>• 没有调用时只写 “elapsed 21h 33m”；<br>• `title-after-command` 变异失败（收到 “src/cart.ts, elapsed 2h 0m”）。 |
| D244 | B | **已修复** | • 看板、目标页、速览都写 “elapsed 21h 33m”，目标页是 “Silent  elapsed 22h 0m  last activity 22h ago”（`$R/live/864d6c3/goal-peek.txt`）；<br>• `en-running-word` 只把这个词改回去，3 个测试失败；<br>• `remote-old` 让手机测试失败（“running 1h 49m”）。 |
| D245 | B | **已修复** | • 目标页：HEAD “Starting  elapsed 20s”，`9397e07` “Starting  Starting”；<br>• 看板：HEAD “Run 1 \| elapsed 20s”，`9397e07` “Starting \| running 20s”（第 2 次运行是 “Starting \| Run 2 \| running 20s”）；<br>• `live.starting` 键已删：`en-old` 换上旧 `en.ts`，在键一致性检查处报 “extra key live.starting”；<br>• `unit-live-old` 有 2 个单元测试失败。 |
| D246 | B | **已修复** | • 没有开始时间时，看板写 “Run 2”，目标页和速览写 “Thinking  Run 2”。`9397e07` 的目标页只有 “Thinking” 加一段空白；<br>• 这样目标页头部和实况行各写一遍 “Run 2”，速览条也是 “Thinking Run 2 just now Run 2”；<br>• `slots::begin`（`slots.rs:79–93`）在同一个 store 闭包里写转换、`RunStarted` 和模式，正常流程走不到这种情况，只做记录。 |
| D247 | B | **已修复** | DESIGN.md 的 Live line 一节和 docs/04 第 2 行写了：D225 的例外（沉默后写 “Run 1”）、停留时徽章保留、4.25em、提示单独一行、“elapsed”（读文档 diff）。 |
| D248 | B | **已修复** | • 手机页 12 种组合加 28 个单目标头部：两个提交的记录排序后，只差运行时间这个词（`9397e07` 中文“已运行”、英文 “running”；HEAD “已进行” / “elapsed”）；<br>• 另有一个随时间变化的 “silent for 31s” 行，属于时钟噪声（`$R/phone/*/{log,single}.txt`）；<br>• 英文有 `remote-old` 变异测着，中文我只用记录核对过。 |
| D249 | B | **已修复** | • 英文徽章两个词都是 51.0 px；细节 x 在每个宽度都只有一个值：1040 下 531.8、1241 下 573.0、1440 下 666.1；<br>• 中文不变：42.0 px，1440 下 x 657.1；<br>• 加宽没有带来新的截断：各宽度被截断的采样比例和被截断的调用集合，两个提交完全一样（英文/中文 1241 下 31/47 对 60/76，1440 下 12/47 对 24/76，1800 下 4/47 对 8/76；`9397e07` 的采样更多，是因为徽章来回换）；<br>• `badge-col-35` 变异失败（细节挪 1.75 px）。 |
| D250 | B | **已修复（只在合并视图）** | • 合并视图：gutter 24 px（`9397e07` 是 20），焦点环到 “+” 4 px（原来 2 px），浅色深色一样（`$R/diff/*/log.txt`、`ring-plus-*.png`）；<br>• 并排视图两个提交都没有 “+”；<br>• ↩ 打开评论框；拖 3 行再 ⌘C 复制 3 行，没有 “+”；<br>• `gutter-20` 变异失败（收到 2）。 |
| D251 | B | **已修复** | `conflict-count-grey` 变异让 “merge conflict are said in ink” 失败（明度 0.47，期望 0.23）。 |
| D252 | B | **已修复** | • 账本行：“The agent says it changed the test machinery or the assertions: a pass cannot confirm this. Verifier: C1 passed @c772361”；中文“…；验证器：C1 通过 @e5f6483”。“不能确认” 用琥珀 “!” 标记，证据句是 text-2，没有绿色（`$R/evidence/864d6c3/ledger-*.png`、`log.txt`）；<br>• `evidence-pin-then-note` 变异让 `a_claim_a_pass_cannot_confirm_ends_on_its_pin` 失败；<br>• 两个客户端都不解析 “Verifier:”，证据当纯文本显示。 |
| D253 | C | **已修复** | • `9397e07` 的 `review-scope.spec.ts` 用我新 dump 的 fixtures 失败（`gone:c772361…` 不匹配 `/^gone:15085f2/`）；<br>• HEAD 的同一个 spec 用 11 月 25 日的旧 fixtures 6/6 通过，用新 fixtures 也包含在全量 425 个通过里（`$R/fswap/scope-*.log`）。 |
| D221 | E | **改正准确** | 现在写明并排部分没有修好（`.u` 在 WebKit 里不起作用，`one-u-rule` 只证明了样式值），转到 D237。 |
| D227 | E | **改正准确** | 现在写明没说 D225 的例外，转到 D247。 |
| D230 | E | **改正准确** | 现在写明整体显示的审批正文读起来像另一条命令、停滞标题粘在一起，转到 D238。 |
| D233 | E | **改正准确** | 现在写明测试要换 `939be97` 的 `workbenches.css` 才会失败，只换 `app.css` 会通过。 |
| D234 | E | **改正准确** | • 现在写明停止本身在锁外标记、`settle_on` 的锁和 `report_mode` 的守卫没有测试，转到 D239/D240；<br>• 它列出的范围是：settle、引擎自己的模式、调用开始、晚到的回答。审批对话框请求（`on_ui_request`）不在这个范围里，相关探针见下一节，只做记录。 |

## 并发与锁（D239–D241）的阅读结论

- **锁的顺序：**`mode_lock` → `flags`（临时 guard，用完就放）→ store。
  - `stop_engine` 先拿 `mode_lock`，在里面短暂拿 `flags` 写 `stopping`，两把锁都在 `.await` 之前放掉（`events.rs:632–638`）。
  - 我没找到反方向的加锁顺序。`clippy -D warnings`（包括 `await_holding_lock`）通过。
- **谁调 `stop_engine`，调用时有没有拿着模式锁：**
  - 暂停：`control.rs:136/146`；
  - 放弃：`control.rs:240/251`；
  - 准备失败：`run/mod.rs:646`。
  - 三处调用时都没有拿着模式锁，所以不会自锁。
  - `stop_engine` 会让一个 tokio 工作线程在 std Mutex 上短暂阻塞。锁里只有几行赋值和 set_mode，可以接受。
- **交付和报告受阻：**不走 `stop_engine`，而是 `settle_on`（`events.rs:485–489`，调用点 `events.rs:501/512`），在锁里同时写 `stopping` 和 `Settled`。`on_settled` 看到 `stopping` 就返回。
- **AgentEnd 和引擎出错：**
  - AgentEnd 走 settle，受 `stopping` 守卫；
  - `on_exit`（`events.rs:580–601`）先读 `stopping`，Tower 自己停的就直接返回；否则记 `crashed` 并暂停。这条路不拿模式锁，本轮没改，也没有和它并发的 settle（事件由 pump 依次处理）。
- **暂停与 settle 同时发生：**
  - `settle_held` 读完 `stopping` 之后，有测试钩子 `between(run, "settle-read")`。在这里插入暂停，HEAD 5/5 结束在 (Paused, Idle)。
  - 把标记挪回锁外，5/5 结束在 (Paused, Executing)。
  - `stop_engine` 的注释（`events.rs:633`）说的是“没有 settle 会在它之后写模式”。按这个范围理解，注释是准确的。
- **暂停与问题/审批同时发生（只做记录，既有）：**`on_ui_request`（`asks.rs:77` 起）没有停止守卫。
  - **用假引擎、经真实 pump 的探针：**脚本在收到 abort 时发出一个审批请求。无延迟 5 次，加 300 ms 延迟 3 次，结果都是模式序列 [Starting, Executing, WaitingOnYou, Idle]，最后 (Paused, Idle)，没有开着的项。也就是说，停止标记之后、停止写 Idle 之前，会短暂出现“等你”，随后被 `record_pause` 撤回（`$R/rust/probe-question-pumped*.log`）。它没有写在停止的 Idle 之上，所以不违反 D234 的说法。
  - **直接调用的探针：**暂停完成之后再直接调 `on_ui_request`，结果是 (Paused, WaitingOnYou)，还留着一个开着的审批项（`$R/rust/probe-question-after-pause.log`）。要在真实运行中走到这一步，pump 必须落后于暂停的关停和 `record_pause`，我没有端到端复现出来。
  - 真实 Pi 会不会在中止时发审批，以及那一瞬间的“等你”会不会触发提醒，我都没有验证。
- **一致性：**
  - 正常路径下，模式、实况行、`running`、桌面转圈、手机页一致：flow 6 次都是 50/50；手机记录两个提交只差时间这个词。
  - 唯一的不一致，就是上面那个审批瞬间。

## 诚实语法

- **绿色：**
  - 桌面：着色扫描里，绿色出现在验证器结论旁，同一行有 pin（例如 G-0003 “Verified by Tower: passed 369ms @c772361”）。
  - 例外有两处，都写在文档里，本轮没变：
    - “可验收”生命周期字形是绿色（DESIGN.md:242）；
    - diff 的增删底色是独立的一套色，只能在“标准 / 色觉友好”之间切换（docs/12 第 211、883 行），和状态色无关。
  - 手机：绿色只出现在带 pin 的行上；“不作数”的通过是琥珀；没有 pin 的写 “Not machine-verified”，用 text-3。两个提交逐行一样。
- **琥珀：**审批、停滞卡片和 “不能确认” 的账本行各有一个 “!” 标记，表示“需要你 / 先看这里”，不用于证据。
- **红色：**没有新增。
- **注记：**合并冲突计数是 text-1 加不着色的注记标记，现在有测试（D251）。
- **沉默徽章：**手机记录里是 text-2、400、没有 svg；桌面的 marks 扫描结果一样。
- **中点：**屏幕上只在验收标准条的 `.sep` 和预算行出现。
- **Agent 的话：**“不能确认”那一行的 Agent 说法是 text-2，从不变绿。
- **GitHub 检查数：**相关代码本轮没改。

## 回归检查（对照 `9397e07`）

- **截图 69/69（两个提交都跑了，`$R/shots/`）：**
  - 两个提交用的都是我用 HEAD 的 supervisor dump 的同一份 fixtures，所以截图看不出 supervisor 文案的变化；那部分由专项 spec 覆盖。
  - 38 张逐像素相同。31 张不同（`$R/shots/diff.txt`，裁图在 `$R/shots/crops/`，上 HEAD 下 base）：
    - **英文看板、速览背后的看板、空 activity、G-0002 头部：**只有 “running 43m” 变成 “elapsed 43m”（D244）；
    - **评审页 G-0001、G-0003 和评审剧场：**合并视图的代码整体右移 4 px（DPR 2 下 8 px），即 gutter 从 20 变 24（D250）；
    - **全部 zh-dark 截图：**只有分钟数字 42 变 43，两次运行之间跨过了一分钟。其中 3 张我看了裁图，其余按差异的大小分类：每块差异都是 12 px 宽、16 px 高的单个数字。
  - 没有其他变化。
- **全量 e2e：**
  - HEAD 用字体配置加我的 fixtures：425 通过、0 失败、76 跳过；
  - 规定命令：421 通过，4 个失败全是 `smoke.spec.ts` 的字体 403，76 跳过；
  - 对照组本轮没跑全量，见“没能覆盖的”。
- **diff 键盘和拖选复制：**见 D250。两个提交在浅/深 × 合并/并排下，拖 3 行都复制 3 行。
- **改过的 supervisor 文案，两种语言都读了：**
  - 审批标题：“Approval needed: write to a path the contract makes read-only” / “需要你批准：写入合同设为只读的路径”；
  - 停滞：“May be stuck: pnpm test (bash) failed 4 times in a row” / “可能卡住：pnpm test（bash）连续失败 4 次”；
  - 证据句：见 D252；
  - 扩展的拒绝说明：见 D238。
  - 都通顺。中文用的是全角括号，符合中文排版。
- **看板宽度：**
  - 1240 及以下，实况行的对象和时间按设计收起（`app.css:4580–4594` 的 `display:none`），只留 “Thinking  Run 2” 或 “Working  read”，提示里写全，两个提交一样。我的宽度探针读的是 DOM 文字，不是可见性，所以 1040 下记成了 “可见”，以截图 `$R/live/864d6c3/linger-2-after-en-1040.png` 为准。
  - 1241 下调用对象被省略号截断，两个提交一样，属于既有设计。

## 新问题清单

### P0
无。

### P1
无。

### P2
无。

### P3

**R22-P3-01：审批代码块分不出自动折行和命令自己的换行；手机还会在 `--` 和 `fill` 之间断开（既有，不是本轮引入）**

- **复现：**
  1. 收件箱放一条审批，正文是长命令 `git push --force-with-lease origin feature/checkout-total-rounding-fix-for-multi-currency-carts && gh pr create --fill`；
  2. 再放一条多行命令 `cd web &&\n  rm -rf dist node_modules/.cache`；
  3. 桌面 1440 宽，手机 390 宽，看代码块。
- **现象：**
  - **桌面：**长命令折成 “…&& gh pr” 和 “create --fill” 两行，第二行从第 0 列开始，和命令自己的一行一模一样（`$R/approval/stack-desk-864d6c3.png`）。真正换行、不带缩进的命令（例如 `cd web\nrm -rf dist`）按 CSS 会显示得完全相同。这一点是从 CSS 推出来的，我没有专门渲染这个用例。
  - **手机：**
    - 长命令折成 4 行，续行用悬挂缩进 2 格。这和多行命令自带的 “  rm -rf” 缩进看起来一样。
    - 而且在 “gh pr create --” 和 “fill” 之间断开，读起来像 `--`（选项结束）加一个参数 `fill`（`$R/approval/phone-pair-864d6c3.png`）。
- **原因：**
  - 桌面 `.output-tail` 用 `white-space: pre-wrap; word-break: break-word`（`apps/desktop/src/styles/app.css:2045–2046`），续行没有任何标记。
  - 手机 `.tail` 用 `white-space: pre-wrap`，并对每个原始行做悬挂缩进 `.tl { padding-left: 2ch; text-indent: -2ch }`（`crates/tower-supervisor/src/remote.html:106–107`）。
  - `pre-wrap` 下连字符后面本来就是断点（截图里 “fix-for-” 和 “--” 后面都断了），这是普通的连字符断行。`overflow-wrap: anywhere` 在这里不是主要原因，我没有单独隔离验证。
- **为什么是 P3：**
  - 审批是放行动作的地方，D238 让代码块“只放命令原文、多行照原样”，行结构从此有了含义（shell 里换行就是另一条命令），这个老问题因此更显眼。
  - 但手机上只能拒绝，允许要回到电脑上做；桌面上大多数长命令仍能读懂。所以是清晰度问题，不是功能错误。
- **修正目标：**
  - 两端都让人能看出哪里是自动折行。可以选一种：
    - 不自动折行，横向滚动（GitHub 代码块的做法）；
    - 在续行行首加一个不可复制的折行标记（如 `↪`，用伪元素，复制时不会带上）。
  - 手机不在选项内部断开，例如每个空格分隔的词用 `white-space: nowrap`，太长的词再横向滚动。
  - 在 `phone.spec.ts` 里加多行正文和长命令的断言，按字符所在的行去量，不要只量 computed style。

### 只做记录，不计入

1. **审批在停止时短暂“等你”（既有）：**`on_ui_request`（`asks.rs:77`）没有停止守卫。
   - 假引擎在 abort 时发出审批：模式序列是 [Starting, Executing, WaitingOnYou, Idle]，之后被 `record_pause` 撤回。
   - 如果请求在暂停完成后才被处理，会留下 (Paused, WaitingOnYou) 和一个开着的审批，这只在直接调用的探针里出现过。
   - 真实 Pi 会不会这样发、会不会触发提醒，都没验证。
   - 建议在 `on_ui_request` 里，停止后直接拒绝或忽略对话框请求，并写一个测试。
2. **没有开始时间时说两遍 “Run 2”（D246 的取舍）：**目标页头部和实况行各一遍，速览条是 “Thinking Run 2 just now Run 2”。正常流程走不到（`slots.rs:79–93` 一次写完）。
3. **停滞标题里的命令用正文字体：**“pnpm test (bash) failed 4 times in a row”。可以考虑把命令放进行内代码。
4. **提示里 “Run 2” 和 “elapsed 21h 33m” 之间没有分隔：**`src/cart.ts⏎Run 2 elapsed 21h 33m`。
5. **桌面收件箱按 (goal, kind, subject) 去重（`lib/store.ts` 的 `dedupeInbox`，既有）：**同一个目标的两条同原因审批，桌面只显示较新的一条，手机两条都显示。按 docs/11，Pi 的钩子是依次执行的，tower-goal 产生不了两条同时开着的审批，所以只做记录。
6. **D250 的 D 行写“并排、深色”，但并排没有 “+”：**修复作用在合并视图。第 21 轮的那次测量很可能是在合并视图里做的。
7. **证据句里的 pin “@c772361” 是正文字体。**
8. **手机标签页的缺图框只显示短句：**`Look` 只在桌面视口传入 `pin_error`，所以长原因在手机标签里没有对象可测（设计如此）。

## 新增测试是否测到了它声称的东西

- **Rust：**
  - 4 个新测试在对应变异下都失败，失败的断言正是声称的那一点：`a_pause_beside_a_settle_has_the_last_word`、`a_run_settling_beside_a_settle_stays_settled`、`a_stopped_run_reports_no_mode_of_its_own`、`an_approval_shows_the_command_it_allows_and_nothing_else`；
  - `stalls_are_put_into_words_on_read` 在两种变异下失败（工具名放前面、不剥掉 `· `）；
  - `a_claim_a_pass_cannot_confirm_ends_on_its_pin` 在把 pin 挪回句首时失败；
  - 暂停和 settle 的两个并发测试，HEAD 各 5/5 通过、变异各 5/5 失败。它们用 `between` 把时序定死，不靠运气。
- **扩展：**`policy.test.ts` 在旧 `policy.ts` 上失败。
- **e2e：**
  - D237 的扫描按字符实际所在的行去量，不是 computed style 的代理。旧源码、旧 `Look.tsx`、一行变异三种情况都会失败，没有第 21 轮那种假通过的风险。
  - D242、D243、D244、D249、D250、D251 各自的变异都失败。
  - D238 的客户端前缀变异，桌面和手机都失败。
  - D253 的旧写法在新 dump 上失败。
- **单元测试：**`Live.test.tsx` 在旧 `Live.tsx` 上有 2 个失败（“live.starting” 和空串，期望 “Run 1”）。
- **缺口：**
  - 手机的多行正文没有测试（`client-oneline-phone` 通过）；
  - 扩展里拒绝后给 Agent 的那句话没有测试；
  - D248 的中文 “已进行” 没有测试，只有英文被 `remote-old` 测到。

## 工程检查结果

| 检查 | 结果 | 日志 |
|---|---|---|
| `tsc --noEmit` | 通过（exit 0） | `$R/checks/tsc.log` |
| `vitest run` | 45 个文件、262 个测试全部通过 | `$R/checks/vitest.log` |
| `vite build` | 通过 | `$R/checks/build.log` |
| `bundle-budget.sh` | 启动 56,180 / 65,536；按需 107,542 / 110,592；全部 **163,722 / 163,840**（剩 118 B）；目标页 chunk 11,627 / 12,288；高亮 worker 197,983 / 262,144 | `$R/checks/bundle-budget.log` |
| `line-limit.sh`、`doc-numbers.sh` | 通过 | `$R/checks/{line-limit,doc-numbers}.log` |
| `security-tests.mjs` | SECURITY.md 列出的 118 个测试都存在，CI 都会跑 | `$R/checks/security-tests.log` |
| 扩展 `node --test` | 32 通过、0 失败 | `$R/checks/ext-tests.log` |
| `cargo fmt --all --check` | 通过 | `$R/checks/cargo-fmt.log` |
| `cargo clippy --workspace --all-targets -- -D warnings` | 通过 | `$R/checks/cargo-clippy.log` |
| `cargo test --workspace` | 29 个测试集，485 通过、0 失败、2 忽略 | `$R/checks/cargo-test.log` |
| flow 整包 × 6 | 6 次都是 50/50：<br>• 安静 3 次，负载 4.5–6.3，40–42 s；<br>• 10 个 `yes` 负载下 3 次，负载 21.1–29.1，41–46 s。<br>统计结果不能证明没有竞争，但两个关键的竞争窗口已经由 `between` 测试确定性覆盖。 | `$R/flow/summary.txt` |
| e2e（规定命令、作者的 fixtures） | 421 通过、4 失败（`smoke.spec.ts:7/73/125/148`，全是字体 403）、76 跳过 | `$R/checks/e2e-prescribed.log` |
| e2e（字体配置、我的 fixtures） | 425 通过、0 失败、76 跳过 | `$R/checks/e2e-fonts-head-myfx.log` |
| 截图 | HEAD 和对照各 69/69 | `$R/checks/shots-{head,base}.log` |

## 没能覆盖的

- **打包应用：**打包后的应用和真实的 WKWebView 没有跑。所有界面结论都来自 Playwright WebKit。
- **原生 `title` 提示：**只读了属性值，没有截到它在屏幕上的样子。
- **真实 Pi：**会不会在中止时发出审批，那一瞬间的“等你”会不会触发提醒，都没验证，探针用的是假引擎。
- **对照组的全量 e2e：**本轮没跑。对照组只跑了专项 spec（`$R/checks/spec-base.log`，40/40）、shots 和 live。
- **性能：**本轮没有测，改动只涉及几处字符串和 CSS 宽度。
- **设计检测器：**`impeccable detect` 没跑，作者报的 17 对 17 没有复核。
- **读屏：**没用 VoiceOver 实际听。读屏文字只通过 DOM 里的 `sr-only` 和 aria 核对。
- **桌面上“不带缩进的真实换行”：**和自动折行看起来一样，这是从 CSS 推出来的，没有专门渲染这个用例（R22-P3-01）。
- **手机标签的长缺图原因：**设计上不显示，所以没测。
- **作者的日志：**`/tmp/tower-design/iter22/` 里的日志我没有当证据用，全部自己重做了。

## 验收条件

- **本轮：**加权 8.81 ≥ 8.0，没有未关闭的 P0/P1，结论 **PASS**。
- **下一轮建议，不阻塞本轮：**
  1. 修 R22-P3-01：两端都能看出自动折行；手机不在选项内部断开。`phone.spec.ts` 加多行和长命令用例，按字符实际所在的行断言，在旧 CSS 上要失败。
  2. 在 `on_ui_request` 里给停止中的运行加守卫（只做记录第 1 条），并写一个在停止后到达的审批不会留下“等你”的测试。
  3. 给扩展里拒绝后给 Agent 的话、D248 的中文“已进行”各补一条测试。
  4. 把 D250 的 D 行改成“合并视图”。
