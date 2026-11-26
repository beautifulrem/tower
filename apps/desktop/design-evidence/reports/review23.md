**结论：PASS。** 加权得分 **8.56/10**（8.560），没有未关闭的 P0 或 P1。新记 1 条 P2，是这一轮引入的。

- **第 22 轮的 P3（R22-P3-01 → D254）：部分修复。**
  - 第一个词不超过一行的命令都修好了：两种主题、六个宽度、两种界面字号下，续行都从第 2 格开始，钩画在前两格；命令自己缩进的行没有钩；词不会从中间断开；中间的空行和缩进复制出来都对。
  - 但只要一行的**第一个词**比一行还长（路径类审批本身就是一个词；以 URL 或长路径开头的命令也一样），它折下去的行就从第 0 格开始，钩压在头两个字符上；后面跟着的短词（如 `|`）会被排到第一行的行尾，读的顺序乱了。
  - 手机 390 宽下，超过 40 个字符的普通路径都会这样，比 `864d6c3` 差（那时续行悬挂在第 2 格，至少看得清）。
  - 这一条记为 **R23-P2-01**。作者的测试里没有一条命令的第一个词超过一行，所以测不出来。
- **其他各项：**
  - D255–D261、D265–D269 和 D262 补充都成立，D263 改正准确；
  - D264 成立：中文“已进行”需要单独变异才能证明测到了，我做了（`phone-zh-yiyunxing`），确实会失败。
  - 每条修复的测试，我都在旧源码或变异上重做过，都会失败，失败原因也对。
- **测试的假通过：**钩的墨迹测量只证明“左边两格有墨”，分不出形状、颜色，也不管有没有重复。
  - 我把钩换成实心灰块、换成琥珀色、改成不重复，桌面测试都照样通过（`$R/fswap/probe-stack-head-solid-amber.png`）；
  - 实心灰块正是负责人不喜欢的“方块”，琥珀色违反诚实语法。
- **另有 10 条只做记录。**

# Tower 前端设计评审：第 23 轮（`43576b0`；对照 `864d6c3`）

> 文中 `$R` 指 `/tmp/tower-design/review23`，截图、日志和测量都在这里。
> - **临时 spec：**已从两个 worktree 删除。副本在 `$R/specs/`，共 13 个文件：approval、evidence、green、live、look、marks、phone、probe、probe2、probe3、tall、trace 这 12 个 spec，加上公用模块 `tmp-review23-lib.ts`（不是 spec，所以没有 `.spec.ts` 后缀）。
> - **日志位置：**
>   - 工程检查：`$R/checks/`；
>   - 前端换旧源码和变异：`$R/fswap/`；
>   - Rust 变异：`$R/rust/`；
>   - flow 重复跑：`$R/flow/`；
>   - 截图对比：`$R/shots/`；
>   - 工具：`$R/tools/`（`mut.py`、`rmut.py`、`fswap.sh`、`rmut.sh`、`shotdiff.py`、`looksum.py`、`livesum.py`、`apsum.py`、`charscan.py`）。
> - **变异的做法：**没有另建 scratch worktree，换旧文件和变异都直接在 `wt-review23` 里做，每次做完都 `git checkout -- .`，再用 `git diff --quiet` 确认还原。每个 `$R/fswap/*.log`、`$R/rust/*.log` 的最后一行都是 “restored: git diff clean”。
> - **清理后的状态（`$R/checks/cleanup.txt`）：**
>   - `git -C /tmp/tower-design/wt-review23 status --short --ignored` 只剩 `?? apps/desktop/node_modules`、`?? node_modules` 两个软链接。
>   - 对照 worktree `wt-review23-base`：先删了它的两个软链接，再用 `worktree remove --force` 删除。`git worktree list` 现在只剩主 checkout 和 `wt-review23`。
>   - 1441–1443 端口没有监听进程；10 个 `yes` 负载进程已结束。
>   - worktree 外的 cargo target（`$R/target`，6.9G）和 review 用的 vite 缓存（`$R/vite-cache`）都已删除。
>   - worktree 里的 `dist/`、`test-results/`、`src-tauri/gen/` 都已删除。
> - **主 checkout：**
>   - 只用来读，以及执行 `git worktree add/remove`。`git status` 只有原本就有的 `?? .claude/`。
>   - 有一处要说明：经软链接，我的运行更新了主 checkout 的三个缓存目录。`apps/desktop/node_modules/.vite`（20:09，规定 e2e 命令用生产 vite 跑时写的）、`apps/desktop/node_modules/.vite-temp` 和 `node_modules/.vitest-cache`（20:47，vitest 和 vite 加载配置时写的）。
>   - 这三个目录 11 月 25 日就已存在，我没有删，也没有动别的东西。
> - **`pnpm check`：**因为 node_modules 是软链接，它拒绝执行（“workspace hoist directory is not a real directory”，`$R/checks/pnpm-check.log`）。所以我用 `./node_modules/.bin/` 下的程序直接跑：`tsc --noEmit`、`vitest run`、`vite build`。
> - **字体配置：**
>   - 规定的 e2e 命令照原样跑了，4 个失败全是字体 403；
>   - 另外用 `$R/tools/vite.review.config.mjs` 再跑一遍全量。这个配置原样导入生产配置，只把主 checkout 的 node_modules 加进 `fs.allow`，缓存放在 `$R/vite-cache`；
>   - 截图、专项 spec 和全部变异也用这个配置。
> - **fixtures：**我照 `tools/e2e.sh` 的 `dump` 用 HEAD 的 supervisor 自己生成了一份（`$R/fx/`）。和作者的 `iter23/final/fx` 比，只差 npm 输出尾巴和端口这类运行噪声（`$R/checks/fx-compare-semantic.txt`）。
> - **作者的日志：**`/tmp/tower-design/iter23/` 下的东西我没有运行，也没有拿来当证据。

**做得好的地方：**

- **普通命令的折行终于分得清：**
  - 续行前面画钩，命令自己的缩进没有钩；`--force-with-lease`、`--fill` 不再从连字符处断开；
  - 钩是 text-3 的一笔线，浅色深色都安静（`$R/approval/closeup-stack.png`，DPR 4）。
- **轨迹不再把 Tower 的动作写成“你的回答”：**
  - 撤回、超时、“被更新的一项取代”都是 text-2，没有人的竖线；
  - 人的回答仍是 text-1，有 “Your answer” 和竖线（`$R/trace/crop2-head-en-light.png`）。
- **收件箱去重移进 store：**桌面和手机一致。引擎的对话框（问题、审批、假设）一条也不会被合并。
- **手机页：**
  - 有了 `X-Frame-Options: DENY` 和 `frame-ancestors 'none'`；
  - CSP 放行 `data:` 之后，钩在手机上能画出来；
  - 中文时间改成字。

**新问题（1 条 P2，本轮引入）：**

- **R23-P2-01：**审批代码块里，如果某行的第一个词比一行长，它的续行从第 0 格开始，被钩压住头两个字符，后面的短词跑到第一行行尾。
  - 手机上的普通路径审批、桌面上较长的路径都会碰到；
  - 详见“新问题清单”。

---

## 评审范围

- **被评审：**`43576b0`（HEAD，detached），worktree `/tmp/tower-design/wt-review23`，端口 1441。
- **对照：**`864d6c3`（第 22 轮），worktree `wt-review23-base`（已删除），端口 1442。
- **浏览器：**Playwright WebKit。
  - DPR 2；审批特写 DPR 4；手机页 DPR 3。
  - 宽度 1040、1241、1280、1281、1440、1800；手机 390、360、320。
  - 中英文、浅色深色都看了；审批块另外看了 compact、large 两种界面字号。
- **审批用例：**
  - 单行、多行（带缩进和空行）、长命令、260 字符的路径、30 行的高块、URL 开头的 `… | sh`、中文提交信息、带 tab 的命令；
  - 两条同原因审批；停滞卡片和 CI 失败卡片；
  - 另有 44、56、84、90、121 字符的普通路径，在目标页和收件箱上看（`$R/approval/probe2.txt`、`probe3.txt`）。
- **Rust：**读了以下文件：
  - `run/asks.rs`、`run/events.rs`、`run/mod.rs`、`control.rs`、`pr.rs`、`remote.rs`；
  - `tower-pi/src/{engine,protocol}.rs`；
  - `tower-store/src/inbox.rs`、`tower-core/src/{event,i18n}.rs`。
- **扩展：**读了 `extensions/tower-goal/{index,acp,policy}.ts` 和 `policy.test.ts`。

## 加权评分

| 维度 | 权重 | 分数 | 理由 | 加权 |
|---|---|---|---|---|
| 产品适配 | 15% | 8.4 | **加分：**<br>• 停止中的运行不再弹审批（D255）；<br>• 同一件事再说一遍只留一张卡，桌面和手机一致，引擎的对话框从不合并（D259）；<br>• 手机页不能被别的网站放进 iframe（D269）。<br>**扣分：**<br>• 放行的地方，路径审批的字被钩压住，`… \| sh` 的词序也乱了（R23-P2-01）；<br>• 被取消的对话框，扩展对 Agent 说 “The human declined…”，这是 Tower 的动作，却说成人的决定（只做记录）。 | 1.260 |
| 信息架构与工作流 | 20% | 8.9 | **加分：**<br>• 没有开始时间时不再说两遍 “Run 2”（D256）；<br>• 悬停提示成了一句话（D258）；<br>• 手机标签也写截图失败的原因（D262）；<br>• 两条同原因审批是两张卡。<br>**扣分：**<br>• 轨迹里 Tower 的关闭说明没有来源标记，三种标点各不相同，也不说关的是哪一项（只做记录）。 | 1.780 |
| 视觉层级 | 15% | 8.7 | **加分：**<br>• 机器值用代码字体：停滞的命令、失败的检查名、证据句的 pin（D257、D261）；<br>• Tower 的说明是 text-2，人的回答是 text-1 加竖线，层级分得开（D268）。<br>**扣分：**<br>• 长的第一个词让钩压在字上，代码块的层级在这种情况下崩了（R23-P2-01）。 | 1.305 |
| 原创性与产品身份 | 15% | 8.6 | 钩是新的一笔线记号，和标记家族同一支笔，文档写明它不是状态标记。三种状态标记、印章、注记竖线都没变。 | 1.290 |
| 工艺与排版 | 10% | 7.6 | **加分：**<br>• 第一个词不长的命令，所有宽度、两种字号下续行都在第 2 格；<br>• 词不从中间断开；中文时间用字（D265）；<br>• 手机复制不再多出空格（D267）。<br>**扣分：**<br>• R23-P2-01：手机上 40 字符以上的路径就被压字，桌面上 121 字符的路径、大号字下 84 字符的路径也会，词序会乱；<br>• tab 分隔的命令在有空间时也会折行；<br>• 钩的箭头离下一个字约 2 px；<br>• 首尾空行复制时会丢（以上三条只做记录）。 | 0.760 |
| 密度与克制 | 10% | 8.7 | 没有新增颜色。钩是 text-3。屏幕上的 `·` 仍只在验收标准条和预算行。新出现的 “×” 只在 CSS 注释里。 | 0.870 |
| 交互 | 10% | 8.7 | **加分：**<br>• 选中复制得到的是命令原文（中间的缩进和空行都在）；<br>• 超过最大高度竖向滚动，钩跟着滚；<br>• 手机标签的缺图原因完整，悬停可看全文。<br>**扣分：**<br>• 首尾空行复制时被去掉（既有）。 | 0.870 |
| 设计系统一致性 | 5% | 8.5 | **加分：**<br>• 钩写进了 docs/12 的标记族说明和 DESIGN.md；<br>• 桌面和手机用同一个遮罩；<br>• docs/11 写明了手机页的真实 CSP。<br>**扣分：**<br>• 实现和文档自己的规定（“自动折下去的行从第 2 格开始”）在长的第一个词上不一致；<br>• 预览用的 `rich.ts` 里的 CI 项没有 `code`（只做记录）。 | 0.425 |
| **合计** | 100% | | | **8.560** |

---

## 负责人意见（标记、动效、劣质 UI）的总体评价

负责人的原话是：“我不喜欢现在的红色方块⬛️，黄色菱形◆和蓝色圆形这三个UI，以及其他地方出现的这种劣质UI和审美，请你注意这一点并进行全面的纠正”。

- **三种状态标记：**这一轮没有动。
  - 两个提交的逐元素着色扫描，以及绿色出现位置的扫描，除了 “23m ago / 25m ago” 这类时间文字以外完全一样（`$R/marks/{43576b0,864d6c3}/paint-*.txt`、`green-where.txt`）。
  - CSS `content` 里没有伪元素字形。
- **新增的钩（`--mark-hook`）：**
  - **怎么画的：**SVG 路径，1.25 描边，用 text-3 填遮罩；桌面 `tokens.css:98` 和手机 `remote.html:115` 用同一个。
  - **普通情况下：**清楚又不抢眼，浅色深色都分得清，命令自带的缩进没有钩（`$R/approval/closeup-stack.png`、`tall-scrolled-crop.png`、`cjk-tabs-stack.png`）。
  - **问题一：长的第一个词。**这时钩直接压在字母上，例如 “↳” 盖住 “cu”、“.t”，看上去像坏掉的字形，正是负责人说的那种粗糙（`$R/approval/stack-phone-390-ordinary-paths.png`、`stack-desk-ordinary-paths.png`，R23-P2-01）。
  - **问题二：测试守不住。**把钩换成实心灰块或琥珀色，测试都照样通过（`$R/fswap/probe-stack-head-solid-amber.png`）。也就是说，退回到“方块”，测试不会报警。
- **粗糙字形扫描（`$R/charscan/hits-*.txt`）：**
  - 和 `864d6c3` 比只多 1 处 “×”，在 `tokens.css:96` 的注释（“2ch × one 18px”）里，不会显示出来；
  - 其余命中与第 22 轮一致：`·` 在标准条和预算行，以及注释、解析器；↔ 是账本连接符；↩ 是键位提示。
- **动效：**
  - 没有开始时间时，实况行没有字，也不再闪光：HEAD 的 `moving=false`，`864d6c3` 是 true（`$R/live/summary-*.txt`）；
  - 没有新增动画。
- **对照 Primer / Geist / Linear 和常见编辑器，还不够好的地方：**
  1. **续行标记压字：**
     - GitHub 的代码块和 Geist 的 Snippet 都横向滚动，不折行。作者不用横向滚动的理由成立：审批时命令的结尾必须看得到。
     - 但编辑器的软换行都把续行标记放在文字之外，从不压字：VS Code 用续行缩进，JetBrains 在行尾或槽里画软换行标记。
     - Tower 的钩画在文字栏里，就必须保证这两格永远留给它。现在第一个词例外。
  2. **轨迹里 Tower 的说明没有来源标记：**
     - 同一页里，“Injected by Tower” 和 “Your answer” 都有标记，Tower 关闭收件箱项的三行却只有一句灰字；
     - 三种标点各不相同：“Withdrawn: The run stopped”、“(timed out: …)”、“Replaced by a newer one”。
     - GitHub 和 Linear 的时间线里，系统事件都会写出是谁做的。
  3. **CI 失败的问题行：**“unit-tests, lint” 连逗号带空格整体用了等宽字体。GitHub 是每个检查名分开写的。

## 作者说明的准确性

- **说得准的：**
  - 换旧源码和变异都失败，失败原因与说法一致：
    - D254：`DecisionCard.tsx`、`app.css`、`remote.html`，以及两端的 `.w` 改成 inline；
    - D266：`csp-no-data`；
    - D255：`asks-no-stop-guard`；
    - D259：`store-no-supersede`；
    - D261：`pin-old`；
    - D256、D258：`live-old`；
    - D262：`look-old`；
    - D265：`phone-old`。
  - 门禁数字与 `DESIGN_PROGRESS.md` 最后一条一致：vitest 44/264、e2e 434/0（76 跳过）、截图 69/69、cargo 29 个测试集 490 通过 2 忽略、扩展 33、安全测试 118、bundle 163,772。
- **说得宽了的：**
  - **D254：**
    - “自动折下去的行从第 2 格开始”，对第一个词就比一行长的行不成立（R23-P2-01）；
    - “复制得到的就是命令原文，缩进和空行都在”，中间的空行确实在，但开头和结尾的空行会丢（两个提交都这样，既有）；
    - “在截图里量左边两格有没有墨迹”，只能证明有墨，证明不了画的是钩。
  - **D264：**扩展测试在旧 `policy.ts` 上失败，只是因为 `import { declinedCommand }` 找不到导出（`$R/fswap/ext-policy-old.log`）。句子本身的内容没有变，所以这是预期内的失败方式。
  - **D255：**说“不开收件箱项、不写等你、不发通知”，准确。但没说被取消的对话框在扩展那边变成了 “The human declined…”（见下文 D255 的阅读结论）。

## 第 22 轮问题与“只做记录”、测试缺口的逐项核实（D254–D264），以及 D265–D269

| 项 | 来源 | 结论 | 证据 |
|---|---|---|---|
| D254 | R22-P3-01 | **部分修复（路径类审批比 `864d6c3` 差）** | **修好的部分：**<br>• 桌面 1040–1800 × 中英文 × 浅/深 × compact/large，第一个词不长的命令（长命令、多行、中文提交信息、30 行）：续行都在第 2 格；命令自带的缩进没有钩；没有词被断开（`$R/approval/43576b0/desk-summary.txt`、`desk-size-log.txt`）；<br>• 手机 390/360/320 同样（`phone-summary.txt`）；<br>• 中间的空行和缩进，复制结果与原文逐字相等（`tall-log.txt`）；<br>• 30 行的块竖向滚动，钩跟着走（`tall-scrolled-crop.png`）。<br>**没修好的部分（R23-P2-01）：**<br>• 第一个词比一行长时，续行在第 0 格，钩压字，后面的短词跑到第一行末尾：260 字符的路径 6 个宽度都是；URL 开头的命令在 1040 宽时 `\|` 在第 87 格（`r23-url-en-light-1040-pre.png`）；<br>• 手机上，40 字符以上的普通路径都压字（`stack-phone-390-ordinary-paths.png`）；<br>• `864d6c3` 上同一条路径悬挂在第 2 格，看得清（`stack-phone-r23-path-en-light-390-pre-base-vs-head.png`）。<br>**次要问题：**<br>• tab 不算分词符，`make⇥build` 在有空间时也折行；<br>• 钩是否和标记家族一致、有没有更好的做法，见“负责人意见”。 |
| D255 | 记录 1 | **已修复（锁的位置没有测试钉住）** | • `asks-no-stop-guard` 让两个测试失败（`open_kinds(...).is_empty()`，`$R/rust/asks-no-stop-guard.log`）；<br>• 把守卫挪到锁外（`asks-guard-outside-lock`），17/17 仍通过；<br>• 阅读结论见下一节。 |
| D256 | 记录 2 | **已修复** | • 没有开始时间：目标页 “Thinking just now”、速览 “Now Thinking just now Run 2”，不闪光；看板仍是 “Run 2”；<br>• `864d6c3`：“Thinking Run 2 just now”，速览 “…Run 2 just now Run 2”，在闪光；<br>• 中文是 “思考 刚刚” 和 “思考 第 2 次运行 刚刚”（`$R/live/summary-*.txt`）；<br>• 单元测试在旧 `Live.tsx` 上 2 个失败。 |
| D257 | 记录 3 | **已修复（桌面只有单元测试）** | • 桌面停滞卡片：“pnpm test” 是 JetBrains Mono，后面是 Inter；手机 `<code>pnpm test</code>（bash）连续失败 4 次`（`$R/approval/43576b0/{desk,phone}-log.txt`）；<br>• `Stall::text` 两种语言都把 target 原样放在句首，target 为空时放工具名（`i18n.rs:636–640`），所以客户端按长度切前缀是安全的；<br>• `stall-code-none` 让 Rust 测试失败；旧 `DecisionCard.tsx` 让单元测试失败；旧 `remote.html` 让手机 e2e 失败；<br>• 桌面没有 e2e。 |
| D258 | 记录 4 | **已修复** | • 提示 “pnpm test --filter checkout⏎Run 2, elapsed 21h 33m” / “第 2 次运行，已进行 21 小时 33 分”；<br>• `864d6c3` 中间没有逗号；<br>• 旧 `Live.tsx` 让 `flows.spec.ts` 的停留测试失败（`$R/fswap/live-title-old.log`）。 |
| D259 | 记录 5 | **已修复（§8.4 没做，作者写明了）** | • 我的 spec 在 `864d6c3` 桌面上 4/4 超时，等不到第二张同原因审批卡；HEAD 两张都在；<br>• 旧 `store.ts` 让作者的 e2e 失败（期望 2 张，实际 1 张）；<br>• `store-no-supersede` 让 2 个 Rust 测试失败，`store-folds-dialogs` 让 1 个失败；<br>• 阅读结论见下文。 |
| D260 | 记录 6 | **已修复** | D250 的 D 行现在写的是 “in the merged view”。 |
| D261 | 记录 7 | **已修复** | • HEAD 账本的 pin 是 `code.code-val`，JetBrains Mono、text-2，中英文、浅深色都一样；`864d6c3` 没有代码元素（`$R/evidence/*/log.txt`、`ledger-*.png`）；<br>• 旧 `GoalBlocks.tsx` 让 `honesty.spec.ts` 2 个失败。 |
| D262 | 记录 8 + 补充 | **已修复** | • **条带的手机标签：**HEAD 写完整原因（220×96，5 行）；`864d6c3` 写 “Not captured”；<br>• **并排对比的手机框：**宽度随窗口高度从 249.5 降到 155.3；HEAD 100 条记录里 0 个词被断开；`864d6c3` 50 个手机框都是 “Not captured / 没有截图”（`$R/look/summary-*.txt`）；<br>• 旧 `Look.tsx` 在 `toHaveText(why)` 处失败；<br>• 为了单独验证扫描本身，我把并排对比的手机框改回宽框的断点（`side-phone-wide`），扫描失败（“760: REFUSED” 等 10 处）。所以补充的测试测到了它声称的东西。 |
| D263 | 说法改正 | **改正准确** | D237 的 D 行现在写明 WebKit 还会在 `?` 后和中文字之间断行。 |
| D264 | 测试缺口 | **已修复** | • 拒绝的说法集中到 `policy.ts`，有测试（33/33）；<br>• 手机中文 “已进行”：我把它改成 “已运行”（`phone-zh-yiyunxing`），`.sr` 断言失败（期望 “已进行 ”，实际 “已运行 ”）；<br>• 手机的多行审批测试带缩进和空行，复制断言是 `toBe`。 |
| D265 | 作者发现 | **已修复** | • 手机中文：“bash 已运行 3 分钟”“已沉默 5 分钟”“已进行 1 小时 49 分”；`864d6c3` 是 “3m”“5m”“1h 49m”（`$R/phone/*/single.txt`）；<br>• 旧 `remote.html` 失败（“已进行 1h 49m”）。 |
| D266 | 作者发现 | **已修复** | • `csp-no-data` 让手机测试 2 个失败，原因是续行左边没有墨迹（`[2,false]`）；<br>• 读 `command.ts`：截图放到一个单独的空白页上解码和取色，所以页面的 CSP 挡不住测量本身。 |
| D267 | 作者发现 | **已修复** | 手机复制：`864d6c3` 是 “a\n \nb\n \nc”，HEAD 与原文相等。开头和结尾的空行两个提交都丢（只做记录）。 |
| D268 | 作者发现 | **已修复（旧数据库除外，见只做记录）** | • HEAD：三条 Tower 关闭的行是 `trace-system`、text-2，没有 “Your answer”，没有竖线；人的回答是 `trace-human`、text-1，有 “Your answer” 和竖线。`864d6c3` 四行都写 “Your answer”（`$R/trace/*/rows-*.txt`、`crop2-head-*.png`）；<br>• `auto-source-human` 让 Rust 测试失败（`(true, Human)`）；`timeout-not-auto` 让 flow 测试失败（`flow.rs:368`）；旧 `Trace.tsx` 让单元测试失败。 |
| D269 | 作者发现 | **frame 头已修复；Host/Origin 白名单不做：保留合理** | `no-xfo` 让 flow 测试失败（`flow.rs:1205`）。理由的判断见下文。 |

## D255 的阅读结论：锁与 Pi 那边

- **死锁：**我没找到。
  - 守卫在 `run.lock_mode()` 里面，先短暂拿 `flags` 读 `stopping`，再调 `engine.answer`（无界通道发送，不阻塞），然后直接返回（`asks.rs:153–163`）。
  - `stop_engine`（`events.rs:632`）和 `settle_on`（`events.rs:485`）的加锁顺序都是 mode_lock → flags；打开收件箱那条路仍是 mode_lock → store → flags → set_mode。
  - 没有反方向的加锁顺序，守卫持有期间也没有 `.await`；clippy（包括 `await_holding_lock`）通过。
- **为什么守卫要放在锁里：**
  - 停止也是在同一把锁里标记的。所以“检查没在停止”和“开卡、写等你”对停止来说是一步完成的，避免了“检查完、开卡前被停止”的窗口，也避免了暂停之后再开出卡来。
  - 但这一点没有测试钉住：把守卫挪到锁外，17/17 仍通过（`$R/rust/asks-guard-outside-lock.log`）。
- **被取消的对话框在 Pi 那边会怎样：**
  - Tower 发 `{"type":"extension_ui_response","id":…,"cancelled":true}`（`protocol.rs:252`）；
  - tower-goal 的 `ctx.ui.select` 得到 `undefined`，`isAllow` 为假，于是返回 `declinedWrite` / `declinedCommand`：“The human declined to let you …” / “The human declined this command …”（`index.ts:257–269`，`acp.ts` 相同）。
  - 也就是说，Tower 自己取消的事，在 Agent 那里成了“人拒绝了”，和 D268 是同一类问题。
  - 下一次运行用 `resume_session: goal.session_file` 接着原来的会话（`run/mod.rs:382`）。这句话会不会留在会话里、影响 Agent 之后的选择，我没有验证。
  - Pi 自己的对话框超时也会得到 `undefined`，得到同一句话，这是既有的。
  - 守卫在追加任何事件之前就返回，所以轨迹里看不到曾经有过这个审批请求（读源码得出）。

## D259 的阅读结论：替换会不会让人漏掉要回答的东西

- **只合并 `engine_ref` 为空的项：**
  - 这类项只有四种：暂停（`control.rs:117`）、待验收（`verify/mod.rs:677`）、停滞（`run/mod.rs:768`）、CI 失败（`pr.rs:205`）。
  - 问题、审批、扩展对话框（`asks.rs:106/127/143`）和假设（`events.rs:338`，`engine_ref: Some(claim_id)`）都带 `engine_ref`，从不合并。
  - 所以 Agent 在等的回答不会被替换掉。
- **合并的条件：**同一目标、同一类、同一句话（`inbox.rs:133–152`）。
  - 被替换的项写 “（被更新的一项取代）”，并追加 `InboxResolved { auto: true }`，来源是 System，轨迹显示 Tower 的说明；
  - 桌面和手机都读 store，所以一致。
  - 被延后提醒的旧项也会被替换，新项重新出现。
  - CI 在开新项之前，已经由 `pr.rs:191` 撤回了旧项。
- **通知：**新项照常通知，被替换的旧项静默关闭（读源码得出，没有端到端测试）。
- **边角：**暂停项的 subject 是当时语言的标签，所以两次暂停之间切换了语言就不会合并，影响很小。
- **docs/08 §8.4：**“合并后一个回答发给所有挂起的对话框”没有实现，作者写明了。现在对话框从不合并，两条同原因审批就是两张卡，要分别回答，不会答错对象。

## D269 的判断：不做 Host/Origin 白名单的理由成立

- **令牌只走请求头：**
  - 所有 API 和 SSE 都只认 `Authorization: Bearer`，256 位令牌，常数时间比较（`remote.rs:277–283`、`481`）；
  - 没有 CORS 头，跨站带 `Authorization` 的请求过不了预检。
- **令牌只在页面自己那里：**
  - 页面外壳不含数据；令牌从 URL 片段读出，存进本源的 `localStorage`，随即 `history.replaceState` 把地址换成 “/”（`remote.html:248`）。
  - 所以 DNS 重绑定的页面只能拿到空外壳，读不到令牌；按源隔离的存储也不会把令牌交给它。
- **剩下的风险是页面内 XSS：**
  - `script-src 'unsafe-inline'` 意味着一旦能注入 HTML，令牌就会泄露；
  - 唯一的防线是 `esc`（`remote.html:254`，转义 `&<>"'`）。所有插值我都读过，都经过 `esc`；
  - 我没有做注入测试（见“没能覆盖的”）。

## 诚实语法

- **绿色：**
  - 桌面：着色扫描里绿色只在验证器结论旁，同一行有 pin（G-0003 “Verified by Tower: passed 371ms @74e52b8”）。“可验收”的生命周期字形（DESIGN.md:242）是文档里写明的例外，这一轮没变。
  - 手机：绿色只出现在带 `@15085f2` 的行上；“不作数”的通过是琥珀；没有 pin 的写 “Not machine-verified”，用 text-3（`$R/phone/43576b0/log.txt`、`ready-zh-CN-light-390.png`）。
- **琥珀：**审批、停滞、CI 失败卡片和 “不能确认” 的账本行各有一个 “!”，不用于证据。钩是 text-3，不是琥珀，但测试不管它的颜色（见“新增测试”）。
- **红色：**没有新增。
- **注记：**没有变化。
- **沉默徽章：**手机 text-2、400、没有 svg；桌面扫描结果一样（`$R/marks/43576b0/scan-*.txt`）。
- **中点：**屏幕上只在验收标准条的 `.sep` 和预算行出现。
- **Agent 的话：**从不变绿。“不能确认”那一行的证据句是 text-2，pin 是 text-2 的等宽字。
- **GitHub 检查：**CI 卡片是琥珀 “!” 加等宽的检查名，不用验证器的绿色。
- **Tower 的动作：**轨迹里不再写成人的回答（D268）。扩展那边仍会对 Agent 说 “The human declined”（只做记录）。

## 回归检查（对照 `864d6c3`）

- **截图（两个提交都是 69/69，`$R/shots/diff.txt`，裁图在 `$R/shots/crops/`，上 HEAD 下 base）：**
  - 65 张逐像素相同，4 张不同：
    - `heldout-card-zh-dark`、`settings-zh-dark`：只是分钟数字（31 → 32），时钟噪声；
    - `inbox-en-light`、`inbox-zh-dark`：CI 卡片的检查名 “test (ubuntu-latest, node 22)” 在 HEAD 上是正文字体，`864d6c3` 是等宽。
  - 后两张的原因是预览数据 `e2e/rich.ts:155` 里的 CI 项没有 `code`，而真实的 store 一定会给 CI 项写 `code`（`inbox.rs:62`）。所以只是预览 fixtures 过时了，不是应用的回归（只做记录）。
  - 截图覆盖了评审页（含 accept 和 readout）、目标页、看板、收件箱、速览、合同编辑器、Operations、欢迎页、设置（含手机配对）、快捷键、学习页。
- **全量 e2e：**
  - HEAD 用字体配置和我的 fixtures：434 通过、0 失败、76 跳过；
  - 规定命令：430 通过，4 个失败全是 `smoke.spec.ts` 的字体 403（7/73/125/148 行），76 跳过。
- **专项 spec：**
  - 其余专项：HEAD 44/44，`864d6c3` 44/44；
  - approval：HEAD 11/12。失败的是我自己 spec 里手机页轮询重绘造成的 “element is not attached”，单独重跑通过；`864d6c3` 6/10，4 个超时就是 D259 的证据；
  - tall：两个提交各 2/2。
- **改过的文字，两种语言都读了：**
  - 提示：“Run 2, elapsed 21h 33m” / “第 2 次运行，已进行 21 小时 33 分”，通顺；
  - 停滞：“May be stuck: pnpm test (bash) failed 4 times in a row” / “可能卡住：pnpm test（bash）连续失败 4 次”，通顺；
  - 证据句：“…Verifier: C1 passed @74e52b8” / “…；验证器：C1 通过 @2666aa2”，通顺；
  - 扩展的拒绝说明：“The human declined this command (push to a remote (one-way door)). …”，括号套括号，读起来别扭（只做记录）；
  - 手机中文时间：见 D265，通顺。

## 新问题清单

### P0
无。

### P1
无。

### P2

**R23-P2-01：审批代码块里，第一个词比一行长时，续行从第 0 格开始，被钩压住头两个字符，后面的短词被排到第一行末尾（本轮引入，D254）**

- **复现：**
  1. 手机页 390 宽，放一条路径审批，正文 `apps/desktop/src/components/DecisionCard.tsx`（44 字符）；
  2. 桌面目标页或收件箱，1440 宽、默认字号，放一条路径审批，正文 `services/checkout-api/src/test/java/com/example/checkout/pricing/rounding/MultiCurrencyRoundingPolicyIntegrationTest.java`（121 字符）；
  3. 桌面 1040 宽，放一条命令 `https://raw.githubusercontent.com/example-org/checkout-service/feature/checkout-total-rounding-fix-for-multi-currency-carts/scripts/install.sh | sh`。
- **现象：**
  - **手机：**
    - “…/DecisionCard” 下一行的 “.tsx” 从第 0 格开始，钩盖住了 “.t”；
    - 56、90 字符的路径同样，例如 “m / ulti-currency.ts”、“PaymentMethodSelecto / r.test.tsx”；
    - 390 宽时，超过 40 字符的路径都会这样；360 宽是超过 35 字符（`$R/approval/stack-phone-390-ordinary-paths.png`、`probe2.txt`）。
    - `864d6c3` 上同一路径的续行悬挂在第 2 格，看得清（`stack-phone-r23-path-en-light-390-pre-base-vs-head.png`）。
  - **桌面（有 Allow 按钮的地方）：**
    - 默认字号下，90 字符以内的路径不折行；121 字符的路径折成 “services/checkout-” / “[钩压住 ap]i/src/…” / “[钩压住 .]java”；
    - 大号字下，84 字符（1440 目标页）、90 字符（1040）就会这样（`$R/approval/stack-desk-ordinary-paths.png`、`probe3.txt`）。
    - 第一行常常只到最后一个连字符，例如 “services/checkout-”，后面一大段空着。
  - **URL 开头的命令：**`|` 出现在第一行行尾第 87 格，URL 的后半段在下一行，“sh” 在第三行。读起来像是从 URL 中间开始接管道（`$R/approval/43576b0/desk/r23-url-en-light-1040-pre.png`、`$R/approval/stack-phone-path-url-390.png`）。
  - **复制：**复制结果仍是原文。
- **原因：**
  - 桌面 `apps/desktop/src/styles/app.css:2450–2476`：`.decision-cmd .tl` 用 `padding-left: 2ch; text-indent: -2ch`；`.decision-cmd .w` 是 `inline-block; max-width: 100%; text-indent: 0; overflow-wrap: anywhere`。
  - 每行第一个词的 inline-block 因为负缩进从第 0 格开始，它内部折下去的行又从这个盒子自己的左边（第 0 格）开始，而钩（`::after`，`left: 0; top: 18px`）正画在这里。
  - 这个盒子最宽只有一行减 2 格，所以后面的短词还能挤进第一行末尾的 2 格里。
  - 手机 `crates/tower-supervisor/src/remote.html:114–116` 规则相同；分词在 `DecisionCard.tsx:436` 和 `remote.html:332`。
- **为什么是 P2：**
  - **不是 P3：**
    - 审批卡是放行动作的地方；D238 定下的规则是“代码块只放要放行的命令或路径原文”，现在正是这段原文被压住、被打乱了词序，而且是这一轮的修复带进来的；
    - 手机上的普通长度路径就会碰到，比 `864d6c3` 差；
    - docs/12 和 DESIGN.md 写的“自动折下去的行从第 2 格开始”，在这种情况下不成立。
  - **不是 P1：**
    - 复制结果正确；
    - 桌面默认字号下，90 字符以内的路径和第一个词不长的命令都显示正确；
    - 手机上本来就不能允许审批（`remote.rs:571` 的 `answerable_away`，`remote.rs:621` 有测试）；
    - 标题已经用文字写明了原因。
- **修正目标：**
  1. 两端的续行，包括长的第一个词内部的续行，都从第 2 格开始；或者把钩放进一个文字永远不会进入的槽里。任何情况下钩都不压字，词序和原文一致。
  2. 在 `flows.spec.ts` 和 `phone.spec.ts` 里加两种用例：一条比一行长的路径审批，一条 URL 开头的 `… | sh`。断言每个续行的 `at` 都是 2，并且每一行按字符读出来的顺序就是原文的顺序。在 HEAD 上要失败。
  3. 让墨迹测量能分出“钩”和“块”：
     - 检查左边两格里墨迹的占比上限（实心块会接近填满）；
     - 检查墨色接近 text-3；
     - 用一个续行至少两行的词，验证钩每行都重复。
     - 实心灰块、琥珀色、不重复这三个变异都要让测试失败。

### P3
无。

### 只做记录，不计入

1. **钩的箭头离下一个字约 2 px：**DPR 4 特写里几乎贴上（`$R/approval/closeup-stack.png`）。遮罩宽 2ch，箭头尖在 11.5/14 处。
2. **tab 不算分词符：**`make⇥build⇥TARGET=release` 在第一行还有空间时，“make” 单独一行，其余整体折到下一行（`$R/approval/cjk-tabs-stack.png`）。带 tab 的命令很少见。
3. **开头和结尾的空行复制时会丢：**两个提交、桌面和手机都这样（`$R/approval/*/tall-log.txt` 的 blankFirst、trailingBlank），和文档“空行也在”的说法在首尾不一致。真实命令很少带首尾空行。
4. **轨迹里 Tower 的关闭说明：**
   - 没有来源标记，而同一页的 “Injected by Tower”、“Your answer” 都有；
   - 标点不统一：“Withdrawn: The run stopped”、“(timed out: …)”、“Replaced by a newer one”；
   - 也不说关闭的是哪一项。“Added to Needs you” 本来就不写标题，这一点是既有的。
5. **旧数据库里的事件仍写“你的回答”：**事件的来源在写入时就存进表里，旧的 `InboxResolved` 没有 `auto`，按 serde 默认值读成 false。所以升级前已有的“撤回”在轨迹里仍是 “Your answer: Withdrawn…”。这一条是读源码得出的，没有用旧数据库渲染过。
6. **被取消或超时的对话框，扩展对 Agent 说 “The human declined…”：**Tower 的动作被说成人的决定（D255 让停止时的取消也走这条路；Pi 超时是既有的）。轨迹里也没有“曾有过这个请求”的记录。建议让 `isAllow` 的调用方区分“取消”和“拒绝”。
7. **CI 问题行和预览数据：**
   - CI 问题行的 `code` 是整串 “unit-tests, lint”，逗号也是等宽；
   - `e2e/rich.ts:155` 的 CI 项没有 `code`，所以预览截图里检查名是正文字体，和应用不一致（`$R/shots/crops/inbox-*.png`）。
8. **Look 的缺图框：**
   - 条带的手机标签里，缺图框是 220×96，旁边的缩略图只有 59×96，而桌面标签的缺图框是 153.6×96，形状不统一；
   - 并排对比在 1040×560 时，手机框高 336，原因却只显示 8 行就加省略号（全文在悬停提示里，`$R/look/43576b0/side-phone-url-en-light-1040x560.png`）。
9. **拒绝说明括号套括号：**“(push to a remote (one-way door))”，这是给 Agent 看的话。
10. **bundle 余量：**全部界面 JS 163,772 / 163,840 B，只剩 68 B（第 22 轮剩 118 B）。

## 新增测试是否测到了它声称的东西

- **e2e（D254，`command.ts`）：**
  - **测到的：**
    - 旧 `DecisionCard.tsx`、旧 `app.css`：在 “a carried-over row starts two in, under the hook” 处失败；
    - 旧 `remote.html`：手机 5 个失败；
    - `.w` 改成 inline：桌面 “no word parted” 收到 48 处断开，手机 2 个失败；
    - `csp-no-data`：手机 2 个失败，原因是没有墨迹。
  - **假通过：**
    - 去掉遮罩变成实心灰块、改成琥珀色、改成不重复，桌面 2/2 都通过（`$R/fswap/desk-hook-{solid,amber,once}.log`，三者的样子见 `probe-stack-head-solid-amber.png`）；
    - 手机实心块：390 浅色通过；320 深色失败，只是因为缩进的 “  rm -rf dist” 那一行顺带被读成有墨，不是测试有意要查的。
  - **没覆盖的：**
    - 作者的命令里没有一个第一个词超过一行，所以 R23-P2-01 测不出来；
    - 宽度扫描用的是 `ink: false`，只查词有没有被断开。
- **Rust：**
  - D255 的 2 个测试，在去掉守卫时失败；
  - D259 的测试，在不合并时失败 2 个、连对话框也合并时失败 1 个；
  - D268 的测试，在来源改回 Human、超时写成非 auto 时失败；
  - D257 的测试，在 `Stall::code` 返回空时失败；
  - D269 的测试，在去掉 `X-Frame-Options` 时失败。
  - **缺口：**守卫“在模式锁里”这一点没有测试钉住（`asks-guard-outside-lock` 17/17 通过）。可以照 D239 的做法，用 `between` 钩子定住时序。
- **单元测试：**
  - `Live.test.tsx` 在旧 `Live.tsx` 上 2 个失败；
  - `Trace.test.tsx` 在旧 `Trace.tsx` 上 1 个失败（“Your answer Withdrawn…”）；
  - `DecisionCard.test.tsx` 在旧 `DecisionCard.tsx` 上 1 个失败（code 为空）。
- **e2e（其余）：**
  - D258 的提示在旧 `Live.tsx` 上失败；
  - D259 的两张卡在旧 `store.ts` 上失败（实际 1 张）；
  - D261 在旧 `GoalBlocks.tsx` 上失败；
  - D262 在旧 `Look.tsx` 上失败，补充的高度扫描用 `side-phone-wide` 单独验证过，会失败；
  - D264/D265 的中文时间、“已进行”各自单独变异后都会失败。
- **扩展：**`policy.test.ts` 在旧 `policy.ts` 上失败，原因是缺少导出，属于预期内的失败方式。
- **桌面 D257 没有 e2e：**只有单元测试。预览数据缺 `code`（只做记录第 7 条）没有被任何测试发现。

## 工程检查结果

| 检查 | 结果 | 日志 |
|---|---|---|
| `tsc --noEmit` | 通过（exit 0） | `$R/checks/tsc.log` |
| `vitest run` | 44 个文件、264 个测试全部通过 | `$R/checks/vitest.log` |
| `vite build` | 通过 | `$R/checks/build.log` |
| `bundle-budget.sh` | • 启动 56,202 / 65,536；<br>• 按需 107,570 / 110,592；<br>• 全部 **163,772 / 163,840**（剩 68 B）；<br>• 目标页 chunk 11,653 / 12,288；<br>• 高亮 worker 197,983 / 262,144 | `$R/checks/bundle-budget.log` |
| `line-limit.sh`、`doc-numbers.sh` | 通过 | `$R/checks/{line-limit,doc-numbers}.log` |
| `security-tests.mjs` | SECURITY.md 列出的 118 个测试都存在，CI 都会跑 | `$R/checks/security-tests.log` |
| 扩展 `node --test` | 33 通过、0 失败 | `$R/checks/ext-tests.log` |
| `cargo fmt --all --check` | 通过 | `$R/checks/cargo-fmt.log` |
| `cargo clippy --workspace --all-targets -- -D warnings` | 通过 | `$R/checks/cargo-clippy.log` |
| `cargo test --workspace` | 29 个测试集，490 通过、0 失败、2 忽略 | `$R/checks/cargo-test.log` |
| flow 整包 × 6 | 6 次都是 50/50：<br>• 安静 3 次，负载 4.2–5.7，40.4–40.7 s；<br>• 10 个 `yes` 负载下 3 次，负载 17.9–26.2，41.7–42.2 s | `$R/flow/summary.txt` |
| e2e（规定命令、作者的 fixtures） | 430 通过、4 失败（`smoke.spec.ts` 7/73/125/148，全是字体 403）、76 跳过 | `$R/checks/e2e-prescribed.log` |
| e2e（字体配置、我的 fixtures） | 434 通过、0 失败、76 跳过 | `$R/checks/e2e-fonts-head-myfx.log` |
| 截图 | HEAD 和对照各 69/69 | `$R/checks/shots-{head,base}.log` |
| 换旧源码 / 变异 | 前端 21 项，Rust 8 项，扩展 1 项。全部还原，结果见上一节 | `$R/fswap/`、`$R/rust/` |

## 没能覆盖的

- **打包应用：**打包后的应用和真实的 WKWebView 没有跑，界面结论都来自 Playwright WebKit。
- **原生 `title` 提示：**只读了属性值，没有截到它在屏幕上的样子。
- **真实 Pi：**
  - 取消对话框之后，“The human declined…” 会不会写进会话、影响续跑，没有验证；
  - 真实 Pi 会不会在中止时发审批，也没有验证。
- **旧数据库：**没有用升级前的数据库渲染轨迹，第 5 条只做记录是读源码得出的。
- **手机页的注入测试：**没有放带 `<img onerror>` 的 Agent 文字去验证 `esc`。
- **对照组的全量 e2e：**没跑。对照组只跑了专项 spec、截图和 live。
- **设计检测器：**`impeccable detect` 没跑，作者报的 17 对 17 没有复核。
- **读屏：**没用 VoiceOver 实际听。
- **性能：**没有测。
- **桌面上被替换的卡片里没发出的草稿：**会不会丢，没有验证。
- **作者的日志：**`/tmp/tower-design/iter23/` 里的日志没有当证据用，全部自己重做了。

## 验收条件

- **本轮：**加权 8.56 ≥ 8.0，没有未关闭的 P0/P1，结论 **PASS**。
- **下一轮必须做到：**
  1. 修 R23-P2-01：
     - 两端的续行（包括长的第一个词内部的续行）都从第 2 格开始，或者把钩放进不压字的槽里；
     - 词序和原文一致；
     - 测试加路径审批和 URL 开头的命令，在 HEAD 上要失败。
  2. 让钩的测试能分出形状和颜色：实心块、琥珀色、不重复三个变异都要失败。
- **建议，不阻塞：**
  3. 给 D255 “守卫在模式锁里”补一个用 `between` 定住时序的测试；
  4. 让扩展区分“取消”和“拒绝”，不要对 Agent 说 “The human declined”。可以同时在轨迹里记一行被取消的请求；
  5. 给轨迹里 Tower 关闭的行加来源标记，统一标点，写出关闭的是哪一项；
  6. 给 `e2e/rich.ts` 的 CI 项补上 `code`，给桌面 D257 补一条 e2e。
