**结论：PASS。** 加权得分 **8.59/10**（8.585），没有未关闭的 P0 或 P1。第 18 轮的 4 条 P3 都修好了，作者处理的 13 条“只做记录”里大多数成立。这一轮新记 3 条 P3：两条是本轮引入，一条是既有问题。

# Tower 前端设计评审：第 19 轮（`939be97`，对照 `54ba274`）

> 文中 `$R` 指 `/tmp/tower-design/review19`，截图、日志和测量都在这里。
> - **临时 spec：**已从两个 worktree 删除，副本在 `$R/checks/specs/`。
> - **检查日志：**工程检查在 `$R/checks/`。前端换回旧源码的结果在 `$R/checks/swaps/`，Rust 变异的结果在 `$R/checks/rust/`。
> - **主仓库：**主 checkout 只用来读，以及执行 `git worktree add/remove`。
> - **清理后的状态：**
>   - `git -C /tmp/tower-design/wt-review19 status --short --ignored` 只剩两个 node_modules 软链接。
>   - 对照用的 `wt-review19-base` 和变异用的 `wt-review19-scratch` 已用 `worktree remove --force` 删除。scratch 里的诊断改动存在 `$R/checks/rust/scratch-flow-diag.diff`。
>   - 1441–1443 端口没有监听进程。
>   - `dist/`、`test-results/`、cargo target 和 vite 缓存都已删除。
> - **字体配置：**e2e、shots 和专项 spec 用的是 `$R/tools/vite.review.config.mjs`。它原样导入生产配置，只把主 checkout 的 node_modules 加进 `fs.allow`，否则字体会 403。规定命令（生产 vite）也单独跑了，结果见“工程检查”。

**第 18 轮的问题都修好了**（每条都在 `54ba274` 上复现，再在 `939be97` 上确认）：

- **R18-P3-01（D189）：**
  - 1281/1360/1440/1800 宽、560/640/900 高，accepted、in_review、paused、running 四种状态，单行和 6 行引导框，滚到页面底部时右栏顶边都不高于吸顶位置 72px。
  - 旧代码在 −43 到 62 之间。
  - 其他块没有挪，页面总高度不变。
- **R18-P3-02（D190）：**五种弹层关闭后焦点都留在表格上：快捷键表、验收、命令面板、路径跳转、改动说明。之后 ↓ 到第 5 行，↩ 在第 4 行开评论框。旧代码分别是第 0、1 行和第 0 行。
- **R18-P3-03（D191）：**问题开着、命令在跑时：
  - 手机页头是 “bash running for 3m”，只有一个标记；
  - 桌面标题栏是 “bash running for 5m”；
  - 旧代码两端都是“已沉默”。
- **R18-P3-04（D193）：**`review-keys.spec.ts:187` 在负载均值约 8 时跑了 40 次，40 次全过。

**这一轮做得好的地方：**

- **红色只留给验证器：**观测到的失败改用墨色加 ×（D202）。这三处是 GitHub 检查失败数、合并冲突和侧栏运维图标。
- **暗色 shimmer 停下时不再跳（D198）：**光带停在原位，0.6 s 内淡出。运动减弱时整条光带都不画。
- **截图更完整（D194、D195）：**shots 和测试截图里，引导框、缩略图和 diff 的语法着色都在了。
- **i18n：**合并的 16 个键在中英两种语言里原文完全相同（D201）。

**新问题（都是 P3）：**

- **R19-P3-01（本轮引入，D196）：**对话框超时后由一个单独的任务关闭，它和事件泵会抢。命令在跑时，模式会读成 Thinking，实况行说“没在跑”。新的 flow 测试也因此不稳定：flow 测试整包跑 12 次，失败 3 次。
- **R19-P3-02（本轮引入，D200 没做到）：**
  - 对比弹层并排时，缺失的一侧是 192×226.6 的竖框，旁边的图是 532×333。
  - 中文长错误把条带里的框撑到 110 高，旁边的图是 96。
  - 长 URL 被逐字符断开。
- **R19-P3-03（既有，D192 没覆盖到）：**调用已经结束（`running:false`）时，目标页实况行、看板行和手机行仍把它写成当前动作，光带还在它上面扫过。

---

## 评审范围

- **提交：**
  - `939be97`：第 19 轮，49 个文件，+1247/−171；
  - `54ba274`：对照。
- **环境：**
  - Playwright WebKit，DPR 2，手机页 DPR 3；
  - en 和 zh，亮色和暗色；
  - 宽度 1040、1241、1280、1281、1360、1440、1800，手机 390、360、320；
  - IPC stub 加 `/tmp/tower-design/fixtures{,-zh}`。
- **专项 spec**（两个提交跑同一份 spec，在 `$R/checks/specs/`）：
  - rail：D189、D199；
  - diff：D190；
  - phone：D191、D203；
  - live：D191、D192，只有亮色；
  - shimmer：D198，只有英文；
  - look：D200；
  - marks：D202。
- **Rust：**`cargo test` 两次（一次 fail-fast，一次 `--no-fail-fast`）。另外：
  - D196 的测试单独跑 10 次；
  - flow 测试整包跑 11 次；
  - 我自己的 7 个变异，加 1 个只改时序的变体。
- **其他：**
  - shots 两个提交各 69 张，做了像素比对；
  - 字符扫描；
  - 文档 diff 审读。

---

## 加权评分

| 维度 | 权重 | 分数 | 理由 | 加权 |
|---|---|---|---|---|
| 产品适配 | 15% | 8.6 | 实况行会说调用还在不在跑，手机和桌面都按它判断（D191、D192）。扩展发起的限时对话框到时会关闭，不再永远“等你”（D196）。扣分：超时这条路径上有竞争，命令在跑时可能读成 Thinking 和沉默（R19-P3-01）；已结束的调用仍写成当前动作（R19-P3-03，既有）。 | 1.290 |
| 信息架构与工作流 | 20% | 8.6 | 短窗口滚到底时，合同摘要一直看得到（D189）。弹层关闭后，按下的那一行还在（D190）。扣分：对比弹层里缺失的一侧和另一侧对不成一对（R19-P3-02）。 | 1.720 |
| 视觉层级 | 15% | 8.6 | 红色只剩验证器、哨兵和 Tower 自己的故障，失败的层级更清楚。右栏头部不再被遮住。扣分：侧栏的冲突提示只是图标墨色从 text-3 提到 text-1，和“活跃计划数”共用一个计数位（只做记录）。 | 1.290 |
| 原创性与产品身份 | 15% | 8.6 | “底色纱 + 光缝”的读法补全了：停下时光带原地淡出。缺口环、切角印章、注记竖线没变。没有新的识别元素。 | 1.290 |
| 工艺与排版 | 10% | 8.5 | 条带里的缺图框和图同宽同高（153.6×96 对 152.4×96）。暗色停下时字的墨色是渐变，不再跳。扣分：R19-P3-02 的竖框、110 高的框和逐字符断行。 | 0.850 |
| 密度与克制 | 10% | 8.7 | 16 个重复的键合并了。没有新增颜色和标记。红色用得更少了。 | 0.870 |
| 交互 | 10% | 8.5 | D190 五种弹层都对。D193 在负载下 40 次全过。焦点规则在点空白再 Tab 回来时也一致。 | 0.850 |
| 设计系统一致性 | 5% | 8.5 | docs/12 统一用 `◆`。§12.4.3 写明观测到的失败用墨色。扣分：docs/04:235 仍把“冲突预测”列在 `■` 下；0.6 s 是裸值，不是动效 token；侧栏提示的读屏名从“Problem”变成更含糊的“Notice/提示”。 | 0.425 |
| **合计** | 100% | | | **8.585** |

---

## 负责人意见（标记、动效、劣质 UI）的总体评价

负责人的原话：“我不喜欢现在的红色方块⬛️，黄色菱形◆和蓝色圆形这三个UI，以及其他地方出现的这种劣质UI和审美，请你注意这一点并进行全面的纠正”。

**点名的三种标记：**没有退回去。

- 扫描了 `apps/desktop/src`（不含测试）和 `remote.html`（`$R/charscan/counts.txt`、`hits.txt`），结果和第 18 轮完全一样：
  - `×` 20 处，都在注释、尺寸写法和 `ContractRail.tsx:105` 的倍数里；
  - `·` 46 处；
  - `●` 1 处，在注释里。
- CSS 的 `content` 只有 `"┆ "`。
- 状态标记仍然都是 SVG，没有方块、菱形字符，也没有实心蓝点。

**这一轮清掉的“劣质感”：**

- **红色少了（D202）：**
  - 页面：PR 行的失败数、合并队列的冲突、侧栏运维图标都改成墨色（`$R/marks/{tag}/log.txt`，computed color 是 t1/t2，没有 danger）。
  - 截图：
    - PR 行：`$R/marks/939be97/pr-goal-en-light.png`，“✓ 3 × 1” 里的 × 是墨色；旧代码是红色圆盘。
    - 冲突：`mq-conflict-zh-CN-dark.png`；
    - 对照：`$R/shots/pairs/inbox.png`、`ops-zh-dark.png`。
  - 这正对着负责人不喜欢的“红色方块”：红色只留给验证器、哨兵和 Tower 自己的故障。
- **暗色 shimmer 停下（D198）：**
  - 运行转为问题、自称完成或沉默时，光带停在原位，不透明度在约 595 ms 里从 1 降到 0，transform 不变（`$R/shimmer/summary.txt`）。
  - 动作词的平均墨色是渐变的，例如暗色转为问题时 141→163→170，旧代码第一帧就是全墨（`$R/shimmer/stop-ink.txt`）。
- **截图完整（D194、D195）：**
  - HEAD 的 shots 里有引导框（`$R/shots/pairs/g2-en-light-bottom.png`）、语法着色（`review-g1.png`，旧代码是 0 个着色像素）和对比缩略图（`deck-dark.png`）。
  - 旧代码三项都漏过。

**还剩下的：**

- **R19-P3-02：**
  - 对比弹层里缺失的一侧是一个虚线竖框，标题“改动后”浮在框高一半的位置。
  - 长错误逐字符断开，比如 “CONNECTIO / N_REFUSED”、“checko / ut”、“60 / 秒后”。
  - 这正是“劣质 UI”的观感。
- **R19-P3-03：**“Thinking  bash pnpm test --filter checkout  just now”，光带扫过一条已经结束的命令。
- **侧栏冲突提示太弱（只做记录）：**
  - 同一个时钟图标，只从 text-3 提到 text-1。
  - 计数位也用来显示活跃计划数。
  - 悬停和当前行的图标本来就会变深。
- **验收标准行偏吵（既有）：**`$R/shots/939be97/final-goal-deck-dark.png` 里，C1、C2 各有琥珀圆盘，下面还有琥珀描边的小标签（“runner patched”“assertions not checked”）。三个琥珀描边标签叠在两行里，比别处吵。这次没改，也不扣分。

**对照 Primer、Geist、Linear**（凭对它们公开设计的了解，没访问外部网站）：

- **失败检查的颜色：**Primer 和 GitHub 把失败的检查画成红色 ✕。Tower 有意改成墨色 ✕，因为红色只留给自己的验证器。
  - 这在 Tower 的诚实语法里讲得通，× 的形状和计数也能传达失败。
  - 风险：习惯 GitHub 的人可能会低估它。
- **缺图占位：**Geist 的缺图和错误占位保留媒体本来的比例框，长错误截断后放进提示里。R19-P3-02 应该照这个做。
- **侧栏：**Linear 侧栏的计数是中性色，但要你处理的项会换一个不同的字形，不只是加深墨色。这支持把侧栏提示记为“只做记录”。

---

## 作者说明的准确性

- **门槛数字都对得上：**
  - vitest 44 个文件、252 条；
  - e2e 415 通过、0 失败（字体配置）；
  - shots 69/69；
  - `cargo test` 388 通过、2 忽略（第二次）；
  - 包体 163,802 / 163,840 B。
- **“three full flow runs pass”（`DESIGN_PROGRESS.md:443`）不能证明这个测试稳定：**
  - 我在 HEAD 上把 flow 测试整包跑了 12 次，失败 3 次。
  - 作者把先前那次失败归因于测试时序，于是让命令一直跑到测试放行。
  - 失败时的 trace 显示，原因在产品代码里，是一个竞争（R19-P3-01）。
- **变异日志：**
  - `/tmp/tower-design/iter19/oldsrc/` 的 m1、m1b、m2、m3、m5 日志都存在，也都失败。
  - 日志里的行号对应的是更早的树（`events.rs:433`，HEAD 是 441；`flow.rs:296/309`）。
  - 我在 `939be97` 上重新做了这 5 个变异，都按说明失败（见“测试是否测到了它声称的东西”）。
- **D200：**说明写“within 2 px of the picture's width, the same height”。这只对条带和短理由成立；并排时和中文长错误时都不成立。
- **D194：**说明写“新的一个都没漏”，对引导框和图片是对的。但作者自己的探针日志 `settled-new.log` 里，36 次中有 3 次在 `settled()` 返回时 `__towerBusy()` 还是 5，也就是 worker 还有 5 个请求没回。
- **D192：**说明写“desk takes the line's word”，只落实到了标题栏，实况行的细节没有。

---

## D189–D203 逐项核实

| D | 结论 | 证据和说明 |
|---|---|---|
| D189 | **成立** | `$R/rail/analysis.txt`：HEAD 在所有状态和尺寸下，滚到底时右栏顶边都 ≥ 72。旧代码是 52、62、−43、37、63。6 行引导框时重叠为 0。页面总高度和其他块的位置不变。对照图：`$R/rail/pair-running-1440x560-end.png`（HEAD 从 “Contract v1 summary” 开始，旧代码从 “Scope fence” 开始）、`pair-running-1280x640-end.png`（折叠时两版一样）、`pair-watching-1440x560-end.png`。换回旧 `GoalPage.tsx` 后 `flows.spec.ts:2157` 失败（页面顶部重叠 27,200）；换回旧 `app.css` 后也失败（railTop 52 < 72）。 |
| D190 | **成立** | `$R/diff/{tag}/sheets.txt`：五种弹层、↓ 和 ↩ 各一组。`nowhere.txt`：没有按过时，从页首或前一个控件 Tab 进来，仍落在第 0 行。`window.txt`：合成的 blur 之后回到表格，↩ 在第 4 行。换回旧 `FileDiff.tsx` 后 `review-keys.spec.ts:187` 失败（“↩ after the sheet closes comments on the line pressed”）。点空白后再 Tab 回来，焦点落在表格本身，↓ 从第 5 行接着走；这和规则一致，见“只做记录”。 |
| D191 | **成立**（注意 R19-P3-01） | 手机（`$R/phone/{tag}/single.txt`）：HEAD 是 “bash running for 3m” 和“bash 已运行 3m”，头部 1 个标记；旧代码是 “silent for 3m”，2 个标记。桌面（`$R/live/{tag}/log.txt` 的 question-beside-command）：HEAD 是 “bash running for 5m”，旧代码是 “silent for 5m”。截图：`$R/phone/939be97/header-G-0031-zh-CN-light.png`。换回旧 `remote.html` 后 `phone.spec.ts:144` 失败（Received “silent for 3m”）。Rust 变异 r-m2、r-m3 都让 `flow.rs:270` 的测试失败。 |
| D192 | **部分成立** | 成立的部分：命令跑了 5 分钟后刷新，标题栏读 “bash running for 5m”，徽章是 Working，旧代码是 Silent（`$R/live/{tag}/log.txt` 的 command-5m）。log、submit、ask_user 不再改写实况行（r-m1、r-m1b 失败）。换回旧 `store.ts` 后，`pulse.test.ts` 和 `flows.spec.ts:455` 都失败。没成立的部分：调用结束后，细节仍写成当前动作（R19-P3-03）。另外，AgentEnd 停掉实况行这条路径没有任何测试覆盖（r-agentend 全过）。 |
| D193 | **成立** | `$R/checks/d193-repeat40.log`：`--repeat-each=40 --workers=6`，同时在跑 Rust 变异（负载约 8），40 次全过。测试改成先等到文字和颜色出现。 |
| D194 | **成立**，有保留 | shots 对比（`$R/shots/diff-summary.txt`，`pairs/`）：HEAD 有引导框、着色和缩略图，旧代码漏了。保留：`settled()` 到 5 s 上限时不报任何信息；作者探针里 3/36 次返回时 worker 仍欠 5 个回答（见“只做记录”）。 |
| D195 | **成立**，有代价 | 换回旧 worker 后 `highlight.test.ts` 失败（1 个 token，期望 6 个）。代价见“只做记录”第 1 条：只要整次调用超过 500 ms 就重跑一遍，大 hunk 和极长的行成本翻倍，病态的行重跑后仍然粗。 |
| D196 | **功能成立，有竞争** | r-m5（不启动计时器）让 `flow.rs:321` 的测试失败。docs/05 写明了 Pi 自己的默认应答。从代码看：两个对话框时，要都关掉才回到原来的模式；`ptr_eq` 守住了“旧的那次运行到时不碰新的运行”。问题：R19-P3-01。 |
| D197 | **成立** | docs/12 的规则 8 和标题栏沙箱那一行都改用 `◆`，和表格的记法一致。 |
| D198 | **成立** | `$R/shimmer/summary.txt`：<br>• 转为问题、自称完成、沉默三种停下：光带都停住，约 595 ms 淡到 0，transform 只有一个值；<br>• 回答后重新开始：不透明度从 0.001 淡入，同时开始移动；<br>• 首次打开页面：立即是 1；<br>• 不动的行：`still-*` 两版像素完全一致。<br>0.6 s 合适：约 190 ms 时不透明度降到一半，墨色约 400 ms 就基本到位；这是环境性的状态变化，不是对输入的反馈，比 100–300 ms 的微交互慢一些也合理。运动减弱时整段在 `no-preference` 媒体查询里，不画光带。旧 `app.css` 下 `flows.spec.ts:971` 失败。 |
| D199 | **同意保留** | `$R/rail/939be97/box.txt`：引导框 1280 宽时 984px（输入区 883），1281 时 613（512），1440 时 772，1800 时 908。输入区最窄 512px，约 60–70 个字符一行，写引导指令够用。引导框跟着主栏宽，和 Linear 把评论框放在主栏里的做法一致；横跨到右栏下面正是 D189 的起因。 |
| D200 | **部分成立** | `$R/look/{tag}/log.txt`：<br>• 条带：153.6×96 对 152.4×96；<br>• 验收读数：115.2×72 对 114×72；<br>• 并排：192×226.6 对 532×333.3（说明是 16:10、120 高），旧代码 532×120；<br>• 中文长错误在条带里：153.6×110 对 96。<br>见 R19-P3-02。换回旧 `app.css` 后，`flows.spec.ts:1178` 的 en 和 zh 都失败（175×96、140×96）。 |
| D201 | **成立** | `$R/i18n/keys.txt`：16 个合并的键在 en 和 zh 里原文都相同。包体 163,802 / 163,840 B（余 38 B），预算脚本没改。 |
| D202 | **成立** | `$R/marks/{tag}/log.txt`：<br>• PR 失败数：t1，没有 danger；<br>• 冲突：t2；<br>• 侧栏图标：t1，`side-icon-notice`；<br>• 旧代码三处都是 RED。<br>换回旧 `Pr.tsx`、`Operations.tsx`、`Sidebar.tsx` 后，`flows.spec.ts:432` 失败。docs/12 §12.4.3 已列入。 |
| D203 | **同意保留** | `$R/phone/939be97/log.txt` 的 whyLines 和 `ready-zh-CN-light-390.png`：G-0012 在冒号后断行，因为后面的短语放不下；G-0013 把“代码触及测试运行器、”留在第一行，在顿号后断。规则一致，中文在冒号或顿号后断行是对的。 |

---

## 诚实语法

- **红色：**`danger` 的使用者都在 §12.4.3 的清单里：
  - 验证器的 Look 控制台错误（`ext.ts:197`，通过时降为 attn）；
  - 哨兵（`ext.ts:180, 188`）；
  - 引擎、git、Claude 缺失（`labels.ts:240-252`）；
  - 评审封条的哨兵（`panels.tsx:363`）；
  - 危险按钮。
  - 观测到的失败（GitHub 检查、合并冲突）已经移出红色。
- **琥珀：**只用在要你决定的事和“先看”的清单前，这一轮没有变化。
- **动效：**`moving()`（`labels.ts:172`）在等你或沉默时不转。光带停下时停住淡出，不再“边停边跑”。
  - 例外是 R19-P3-03：Thinking 时光带扫过一条已结束的命令。字和动效一起，把“在想”说成了“在跑 bash”。
- **实况行的“在跑”：**标题栏和手机页头按 `running` 读，是对的。目标页实况行、看板行和手机行的细节不读它（R19-P3-03）。
- **文档：**docs/12 已改。docs/04:235 仍把“冲突预测（M2）”列在 `■` 异常下（只做记录）。docs/19 和 `DESIGN.md` 只有“red = danger”的总则，没有和本轮冲突的写法。

---

## 回归检查（对照 `54ba274`）

- **shots：**69 对里 36 对像素完全一致，33 对有差异，都能解释：
  - D202：侧栏图标 (36,410)–(60,434) 一块，出现在 learning、overview、palette、peek 等页；PR 行的 ×1；合并队列的冲突。
  - D194/D195：
    - `goal-G-0002-en-light` 多了引导框；
    - review 系列（G-0001、G-0003、theater）多了着色，例如 `review-G-0003-en-light` 的饱和像素 2326 对 0；
    - deck 多了对比缩略图，因此后面的内容往下移了。
  - `look-compare-zh-dark` 的差异在阈值以下（超过 24 的像素为 0）。
- **专项 spec：**
  - 右栏：页面总高度和其他块不变（`$R/rail/analysis.txt`）。
  - 不动的实况行：像素完全一致。
  - 手机“待验收”行：除 D191 的页头外，文字和断行都一样。
- **e2e：**两个提交都 0 失败。HEAD 415 条用了 1 分 58 秒，旧代码 410 条用了 1 分 33 秒。两次跑时负载不同，只作参考。
- **没有发现旧功能退化。**R19-P3-01 和 R19-P3-02 都是本轮新代码带来的。

---

## 新问题清单

### P0

无。

### P1

无。

### P2

无。

### P3

#### [R19-P3-01] 对话框超时后的关闭任务和事件泵抢先后：命令在跑时，模式读成 Thinking，实况行说没在跑（本轮引入，D196）

- **复现：**
  1. 在 HEAD 上跑 `CARGO_TARGET_DIR=… cargo test -p tower-supervisor --test flow`，整包跑。
  2. 单独跑这个测试时 10 次都过（`$R/checks/rust/flaky-d196-alone.log`）。
  3. 整包跑的失败记录：
     - 第一次 `cargo test`：`$R/checks/cargo-test.log`，失败在 `flow.rs:351`；
     - 5 次中失败 1 次：`$R/checks/rust/flaky-d196-suite.log`；
     - 6 次中失败 1 次，带诊断输出：`$R/checks/rust/d196-race-A.log`。
  4. 合计：flow 测试整包跑 12 次，失败 3 次。
- **现象：**`d196-race-A.log` 第 10–18 行的 trace 依次是：

  | 时间（ms，末三位） | 事件 |
  |---|---|
  | 700 | `InboxResolved`（timed out） |
  | 702 | `ToolStarted bash "touch done.txt"` |
  | 703 | `ModeChanged Executing` |
  | 704 | `ModeChanged Thinking` |

  - 最终 `mode=Thinking`，`live_line.running=false`，而 `touch done.txt` 还在被测试挂着。
  - 只改时序的变体 r-race 在 3 次中失败 1 次，这次是另一种交错：`left: Thinking`，`right: Executing`（`$R/checks/rust/r-race.log`）。这个变体只是提高了出现的频率，不是确定性复现。
- **用户看到的（推断，没在屏幕上复现）：**
  - 命令跑多久，目标页就写多久 Thinking。
  - 超过两分钟后，标题栏和手机页头读成“已沉默 Xm”，还带提示标记。这正是 D191 修掉的那类错误，现在出现在超时这条路径上。
  - 调用结束时，`settle_mode` 会把状态纠正过来。
- **原因：**
  - 到时关闭在 `events.rs:543-550` 用 `tokio::spawn` 单独起一个任务。`expire_dialog`（`events.rs:553-572`）最后在 569–571 行调用 `settle_mode`（`run/mod.rs:169-185`），它读 `flags.tools` 来决定在跑的是哪个调用。
  - 事件泵里的 `on_tool_start`（`events.rs:381-396`）分三步：
    1. 先 append `ToolStarted`，store 把实况行写成 running:true；
    2. 再 `set_mode`（391-393）；
    3. 最后才 `tools.insert`（396）。
  - `settle_mode` 落在第 1 步和第 3 步之间时，看到的是没有调用在跑，于是 `stop_live_line` 加 Thinking。
  - Pi 自己的时限和 Tower 的计时器一样长。Pi 一到时就让扩展继续往下走，紧接着就是下一个调用，所以这个窗口正好在这个功能的主路径上。这解释了为什么单独跑 0/10，整包跑有负载时 3/12。
- **为什么是 P3：**
  - 只出现在用户自己的扩展发起的限时对话框上，Tower 自己的问题没有时限。
  - 调用结束时会自己纠正。
  - 同类问题的先例：R18-P3-03（命令旁有问题时手机读成沉默）是 P3，R18-P3-04（证据测试在负载下不稳定）也是 P3。
- **修复目标：**
  - 让到时关闭走运行自己的事件泵，比如把一个 Expire 消息送进处理 Pi 事件的同一个循环；或者在 append 和 set_mode 之前就把调用插进 `tools`，三步在一把 flags 锁里完成。
  - 测试不要靠时序：在 append 和 insert 之间注入可控的停顿钩子，断言模式和 `running`。
  - flow 测试整包至少连跑 20 次都通过。

#### [R19-P3-02] 对比弹层并排时，缺失一侧的框对不上；长错误逐字符断行，把框撑高（本轮引入，D200 没做到）

- **复现：**
  1. 打开 Look 对比弹层，选并排。
  2. 让“改动后”的截图文件不存在，或者是一个长加载错误。
  3. en/zh、亮色/暗色都会出现。条带里用中文长错误也会出现。
- **现象：**
  - **并排：**缺失框是 192×226.6，旁边的图是 532×333.3。说明写的是“16:10，120 高”，也就是 192×120；旧代码是 532×120。
    - “After/改动后”的标题浮在框高一半处。旧代码也不对齐，是既有问题。
  - **条带里的中文长错误：**框 153.6×110，旁边的图 152.4×96，“改动前/改动后”两个标题错开 14px。
  - **逐字符断行：**`overflow-wrap:anywhere` 把 “checko|ut”、“CONNECTIO|N_REFUSED”、“60|秒后” 拆开。
- **证据：**
  - `$R/look/{939be97,54ba274}/log.txt`；
  - `$R/look/939be97/side-long-error-zh-CN-light.png`、`side-gone-en-dark.png`、`strip-long-error-zh-CN-dark.png`、`strip-long-error-en-light.png`；
  - 对照 `$R/look/54ba274/side-long-error-zh-CN-light.png`。
- **原因：**
  - `app.css:5326-5329` 给缺失框设了宽 192 和最小高 120。
  - 但 `.look-side`（5311）是两列 grid，会把两个 figure 拉到同一行高；`.look-shot`（5221，`display:grid`）又把自己的 auto 行一起拉高，于是框长到 226.6。高度是实测的，拉伸的机制是我读 CSS 得出的。
  - `overflow-wrap:anywhere` 在 5285 行。
  - `flows.spec.ts:1178` 只测了条带和短理由。
- **为什么是 P3：**截图丢失是少见状态，文字也读得出来。但这正是负责人说的“劣质 UI”，而且 D200 明确承诺了“120 beside”。
- **修复目标：**
  - **并排时：**缺失的一侧取另一侧图片的框，或者按列宽取 16:10；加 `align-self:start`，两个标题齐平。
  - **长理由：**限 3 行，完整文字放进 title 或 aria。URL 只在 `/`、`.` 处断（比如插入 `<wbr>`），用 `overflow-wrap:break-word` 代替 `anywhere`。
  - **e2e：**补并排和中文长理由两种情况，断言和图片同高。

#### [R19-P3-03] 调用已结束（`running:false`）时，实况行、看板行和手机行仍把它写成当前动作，光带扫过它（既有，D192 没覆盖到）

- **复现：**G-0002 运行中，模式 thinking，`live_line` 是 `{action:"bash", target:"pnpm test --filter checkout", running:false}`，调用在 20 秒前结束。
- **现象：**
  - 目标页实况行：“Thinking  bash pnpm test --filter checkout  just now”，`moving:true`，光带在 “bash” 上扫过。
  - 看板行：“Thinking / bash pnpm test --filter…”。
  - 手机行：“Thinking · pi · bash pnpm …”。
  - 标题栏是对的：“22s ago”，没有 “bash running”。
  - 旧代码完全一样。
- **证据：**
  - `$R/live/{939be97,54ba274}/log.txt`（ended-20s-thinking）；
  - `$R/live/939be97/annunciator-ended-20s-thinking-en.png`、`row-ended-20s-thinking-zh-CN.png`；
  - `$R/phone/939be97/runs-en-dark-360.png`。
- **原因：**
  - `Live.tsx:83` 的 `if (g.live_line && g.state === "running")` 不看 `live_line.running`。
  - `remote.html:506` 只要有 `l` 就写细节。
  - 同一个文件 `Live.tsx:92` 的注释自己写着：“No tool in flight: the badge already says what kind of step it is; the detail says which run.”
- **为什么是 P3：**徽章的词对，标题栏也对。但字加动效把“在想”说成了“在跑 bash”，违背了诚实语法里“动效 = 在干活”的约定。这是第 18 轮“只做记录”第 3 条（调用都结束了还写着最后一个）在界面上的一半。
- **修复目标：**
  - `running === false` 且没沉默时，细节写这是第几次运行（“Run 1”“第 1 次运行”），或者写成过去式“刚结束：bash …”，光带不扫这些字。
  - 沉默时保留最后一个调用的字，这有用。
  - 测试：`pulse` 或 `Glyph` 单测，加一条 `running:false` + thinking 的 e2e。

### 只做记录，不计入

1. **D195 的代价：**重跑条件是整次调用超过 500 ms（`highlight.worker.ts:62-64`），不是某一行被截断了。
   - 我在 Node（V8，不是 JSC，只能参考）里量了，见 `$R/d195/shiki-time.txt`：
     - 128 kB 的 TSX，冷启动 6.8 s，暖的时候 0.9 s，所以首次要多花约 0.9 s；
     - 一行 10 万字符的压缩代码，0.63 s，没有一行被截断，也会再跑一遍，总耗时翻倍；
     - 真正的病态行重跑后照样粗。
   - 只发生在 worker 里，颜色晚到，不阻塞界面。
   - **更好的做法：**按行判断（grammar 的 `tokenizeLine2` 会返回 `stoppedEarly`）；或者只重跑回来是单个长 token 的行；或者加载语言时先用一小段代码预热。
2. **`settled()` 到 5 s 上限时不报信息**（`e2e/tauri.ts:67`）：
   - 作者的 `settled-new.log` 里，36 次中有 3 次返回时 `__towerBusy()==5`。是到了上限，还是计数器没回到 0，没查明。
   - Worker 包装是给每条消息减一。如果 worker 出错或者一次回多条消息，计数就会错。
   - shots 用时 HEAD 20.3 s，旧代码 12.1 s，说明确实等得更久了。
   - 建议到上限时打印警告，或者让测试失败。
3. **侧栏冲突提示：**`side-icon-notice` 只把同一个时钟图标从 text-3 提到 text-1（`app.css:304-306`）。计数位和活跃计划数共用（`Sidebar.tsx:128-129`）。读屏名从 “Problem/问题” 变成更含糊的 “Notice/提示”。队列行写了 “Conflict”，所以不计。
4. **同一时刻的回答：**
   - Tower 的计时器比 Pi 的晚启动几毫秒。
   - 在这个窗口里提交的回答会被记为“已回答”，经 `answer_dialog` 发给 Pi，但 Pi 已经自己应答过了。没有人会被告知。
   - 只读了代码，没复现。
5. **docs/04:235** 仍把“冲突预测（M2）”列在 `■` 异常下。它和 docs/12 新写的“冲突是观测到的，用墨色”读起来冲突，虽然一个是预测、一个是观测。
6. **0.6 s 是裸值**（`app.css:436`），没有用动效 token。
7. **D190 的边界：**按下第 4 行 → 点页面空白 → Tab 回来，焦点落在 `TABLE` 本身（row −1），↓ 从第 5 行接着走（`$R/diff/939be97/nowhere.txt`）。这符合“交还的焦点保留按下的行”的规则。表格本身有没有可见的焦点环，没查。

---

## 新增和改写的测试是否测到了它声称的东西

### 换回旧源码（在 scratch 里把 `54ba274` 的文件放回去，`$R/checks/swaps/`）

| 换回的文件 | 跑的测试 | 结果 | 对照（不换文件） |
|---|---|---|---|
| `FileDiff.tsx` | `review-keys.spec.ts` | `:187` 失败（↩ 在按下的那一行） | 6/6 过 |
| `remote.html` | `phone.spec.ts` | `:144` 失败（“silent for 3m”） | 20/20 过 |
| `app.css` | flows 的新测试 | `:432`、`:971`、`:1178`（en 和 zh）、`:2157` 失败 | 7/7 过 |
| `Pr.tsx` + `Operations.tsx` + `Sidebar.tsx` | `flows.spec.ts:432` | 失败 | 同上 |
| `store.ts` | `flows.spec.ts:455`、`pulse.test.ts` | 都失败 | 单测 16/16 过 |
| `GoalPage.tsx` | 右栏两条 | `:2157` 失败（重叠 27,200） | — |
| `highlight.worker.ts` | `highlight.test.ts` | 失败（1 个 token，期望 6 个） | — |

### Rust 变异（在 `939be97` 上我自己做的，`$R/checks/rust/`）

| 变异 | 结果 |
|---|---|
| r-m1：store 允许 ask_user 写实况行 | `events.rs:441` 失败 |
| r-m1b：store 不做任何判断 | 失败（“log is not work”） |
| r-m2：`settle_mode` 不停实况行 | `flow.rs:270` 的测试失败 |
| r-m3：问题开着时 `at_work` 算上 ask_user | 失败 |
| r-m5：不启动计时器 | `flow.rs:321` 的测试失败 |
| **r-agentend：AgentEnd 不停实况行** | **flow 50 条、store 29 条全过。这条路径没有测试** |
| r-race：只改时序 | 3 次中失败 1 次（R19-P3-01） |

### 测试的弱点

- **`flows.spec.ts:1178`：**只测条带和短理由。并排和长理由的情况漏掉了（R19-P3-02）。
- **`flow.rs:321`：**本身不稳定，原因在产品代码里（R19-P3-01）。作者把它当成测试时序问题处理了。
- **D192：**AgentEnd 停掉实况行的路径没测。细节的 `running:false` 也没测（R19-P3-03）。
- **D190：**e2e 只测了 ⌘⇧↩。我的 spec 把五种弹层和点空白都补测了。
- **`settled()`：**到上限时不报信息。

### 有没有削弱测试

没有。

- 删掉的断言都换成了等价或更强的：
  - 右栏测试改了提示文字，并加了 railTop 断言；
  - `review-keys` 的 `toBeVisible` 换成等待文字和颜色；
  - `Glyph.test` 跟着 `busy` 的新规则改了。
- 换回旧代码后，新测试都失败。

---

## 工程检查（日志在 `$R/checks/`）

| 检查 | 结果 | 日志 |
|---|---|---|
| pnpm | 没跑成：node_modules 是软链接，pnpm 报 “workspace hoist directory is not a real directory”。改为直接调用 `./node_modules/.bin` 里的命令 | `pnpm-attempt/` |
| `tsc --noEmit` | 0 错误 | `tsc.log` |
| vitest | 44 个文件、252 条全部通过 | `vitest.log` |
| 构建 | 通过 | `build.log` |
| 包体预算 | 总计 163,802 / 163,840（余 38 B）。启动 56,242 / 65,536；按需 107,560 / 110,592；目标页 11,594 / 12,288；worker 197,930 / 262,144。预算脚本没改 | `bundle-budget.log` |
| 行数上限 | 通过 | `line-limit.log` |
| 文档编号 | 通过 | `doc-numbers.log` |
| `cargo fmt --all --check` | 干净 | `cargo-fmt.log` |
| `cargo test -p tower-supervisor -p tower-store -p tower-core` | 第一次在 `flow.rs:351` 失败（R19-P3-01），fail-fast 停在 375 通过；`--no-fail-fast` 重跑 388 通过、0 失败、2 忽略。`CARGO_TARGET_DIR` 在 worktree 外 | `cargo-test.log`、`cargo-test-2.log` |
| flow 测试整包重复跑 | 12 次失败 3 次。D196 的测试单独跑 10 次都过 | `rust/` |
| e2e 全量（规定命令，生产 vite） | 410 通过、5 失败（smoke，字体 403 产生的控制台错误）、76 跳过 | `e2e-full.log` |
| e2e 全量（字体配置，不含临时 spec） | HEAD 415 通过、0 失败、76 跳过，1 分 58 秒；`54ba274` 410 通过、0 失败、76 跳过，1 分 33 秒 | `e2e-fonts-{head,base}.log` |
| shots | 两个提交各 69 条通过、69 张 PNG | `shots-{head,base}.log`、`$R/shots/diff-summary.txt` |
| D193 重复 40 次（有负载） | 40/40 | `d193-repeat40.log` |

76 条跳过的都是要设 `SHOTS` 才跑的截图测试。

---

## 没能覆盖的

- **打包好的应用：**按规定没有运行。结论都来自 Playwright WebKit 加 IPC stub。
- **perf：**这一轮没跑。作者给的 perf 数字（看板 50 个目标 607/250/187 ms 等）没有核对。
- **R19-P3-01 的界面表现：**只在 supervisor 状态里复现（mode、live_line）。“标题栏和手机读成沉默”是按 D191 已验证的显示规则推出来的，没在屏幕上看到。也没有用真实的 Pi 和真实扩展的限时对话框跑。
- **D196 的其他分支：**两个对话框同时开着、旧的那次运行到时，只读了代码。同一时刻回答的情况也只读了代码。
- **`settled()` 的 busy=5：**来自作者的日志，原因（到了上限还是计数器错了）没查明。
- **Shiki 计时：**用的是 Node 的 V8，不是 WebKit 的 JSC。脚本里检查 `stoppedEarly` 的部分没有输出。
- **D190：**落在表格本身时可见的焦点环没检查。headless 下 `document.hasFocus()` 一直是 true，所以只用合成的 blur 测了窗口失焦。
- **`@` 弹层：**探针没打开它（`$R/rail/939be97/box.txt` 里 `atPopover: null`），它和右栏的关系没评。
- **专项 spec 的覆盖面：**
  - live spec 只跑了亮色；
  - shimmer spec 只跑了英文；
  - phone、look、marks、rail 都是 en/zh 加亮/暗。
- **e2e 用时对比：**两次跑时负载不同，只作参考。
- **手机：**没有真机，也没有真实的 SSE 流。
- **读屏软件：**没有用真实的读屏软件。
- **对照 Primer、Geist、Linear：**凭对它们公开设计的了解，没访问外部网站。

---

## 验收条件

这一轮 **PASS**（8.59/10），没有阻塞项。

**建议下一轮做：**

1. **R19-P3-01（优先）：**
   - 到时关闭走运行自己的事件泵，或者先插入 `tools` 再 append 和 set_mode。
   - 用注入的停顿钩子写确定性测试。
   - flow 测试整包连跑 20 次都过。
   - 同时给 AgentEnd 停掉实况行补一条测试（r-agentend 现在全过）。
2. **R19-P3-02：**
   - 并排时，缺失的一侧和另一侧图片同框，标题齐平。
   - 长理由限 3 行，URL 只在分隔符处断。
   - e2e 补并排和中文长理由。
3. **R19-P3-03：**`running:false` 时，细节不再把结束的调用当当前动作，光带不扫它。桌面、看板和手机三处一起改，加单测和 e2e。
4. **可以顺手做的（只做记录的几项）：**
   - D195 改成按行判断，或者加载语言时预热；
   - `settled()` 到上限时报警；
   - 侧栏冲突提示换一个可区分的字形，读屏名写成具体的“合并冲突”；
   - docs/04:235 和 docs/12 统一；
   - 0.6 s 改用动效 token。
