**结论：PASS。** 加权得分 **8.66/10**（8.655），没有未关闭的 P0、P1，也没有 P2。新记 3 条 P3：两条是这一轮引入的（D287、D285），一条从 D254 起就有，这一轮只是文档写得比实际宽。

- **第 23 轮的 P2（R23-P2-01，对应 D270）：已修复。**
  - 桌面量了 312 个代码块，手机 156 个，覆盖两种语言、两种主题、各个宽度。没有一个续行从第 0 格开始，字符顺序没有乱，也没有词被不该断的地方断开。
  - 220 字符的路径、URL 开头接 `| sh` 的命令，每一行都填满，后面的词照原文顺序接上。复制结果和原文一致。
  - `43576b0` 上同样的用例能重现第 23 轮的问题。
- **第 23 轮的两个测试缺口：**
  - **D271 补上了：**实心块、琥珀色、只画一次这三种变异，在桌面和手机上都会失败。
  - **D272 只补了一半：**把整段守卫挪到锁外，测试会失败；但只把读 `stopping` 挪到锁外、钩子留在锁里，测试 18/18 照样通过。
- **记录项和没覆盖的（D273–D285）：**都处理了，结论见逐项表。
- **D286：**中英文轨迹里不再出现事件名。
- **D287：**手机页的状态没变就不重绘（120 秒内重绘 4 次，`43576b0` 是 24 次）；选中的文字和没发出去的字都保住了。
- **新问题（3 条 P3）：**
  - **R24-P3-01（D287 引入）：**手机页上选中文字时，卡片停在旧状态，页脚却写着新的读取时间。已经回答的卡片还留着，还能点。
  - **R24-P3-02（D285 引入）：**迁移 24 用不分大小写的前缀匹配，把人手写的回答也改成 Tower 的；而且它改写的是文档里说只追加的事件日志。
  - **R24-P3-03（D254 起就有）：**比一行还长的词如果不在行首（前面有缩进或别的词），会整块挪到下一行。有缩进时会空出一整行，看起来像命令里有空行；后面的词也会另起一行。DESIGN.md 新写的 “first in its line or not … the next word follows it” 在这种情况下不成立。
- **另有 11 条只做记录。**

# Tower 前端设计评审：第 24 轮（`af6d189`；对照 `43576b0`）

> 文中 `$R` 指 `/tmp/tower-design/review24`，截图、日志和测量都在这里。
> - **临时 spec：**已从两个 worktree 删除。副本在 `$R/specs/`：8 个 spec（ac1、approval、drafts、green、look、marks、phone、trace）和公用模块 `tmp-review24-lib.ts`。
> - **日志位置：**
>   - 工程检查：`$R/checks/`；
>   - 前端换旧源码和变异：`$R/fswap/`（汇总在 `summary.txt`）；
>   - Rust 变异：`$R/rust/`；
>   - flow：`$R/flow/`；
>   - 截图对比：`$R/shots/`；
>   - 迁移 24 的 SQL 实验：`$R/sql/`；
>   - 工具：`$R/tools/`。
> - **变异的做法：**换旧文件和变异都直接在 `wt-review24` 里做，每次做完都 `git checkout -- .`。每段日志最后一行都是 “restored: git diff clean”。`rmut.sh` 和 `fswap.sh` 改过一次：遇到模式匹配错误时也先还原再退出。
> - **清理后的状态（`$R/checks/cleanup.txt`）：**
>   - `git -C /tmp/tower-design/wt-review24 status --short --ignored` 只剩 `?? apps/desktop/node_modules` 和 `?? node_modules` 两个软链接。`dist/` 和 `src-tauri/gen/`（cargo 生成的 schemas）已删除。
>   - 对照 worktree `wt-review24-base`：先删了它的两个软链接，再用 `worktree remove --force` 删除。`git worktree list` 现在只剩主 checkout 和 `wt-review24`。
>   - 1441–1443 端口没有监听进程；10 个 `yes` 负载进程已结束。
>   - `$R/target`（6.7G）和 `$R/vite-cache` 已删除。
> - **主 checkout：**
>   - 只用来读，以及执行 `git worktree add/remove`。`git status` 只有原本就有的 `?? .claude/`。
>   - 经软链接，我的运行更新了三个缓存目录：`apps/desktop/node_modules/.vite`（23:20，规定 e2e 命令用生产 vite 配置时写的）、`apps/desktop/node_modules/.vite-temp` 和 `node_modules/.vitest-cache`（23:30）。这三个目录之前就存在，我没有删。
> - **`pnpm check`：**node_modules 是软链接，所以直接用 `./node_modules/.bin/` 下的 `tsc --noEmit`、`vitest run`、`vite build`。
> - **字体配置：**
>   - 规定的 e2e 命令照原样跑了；
>   - 截图、测量、专项 spec 和变异用的是 `$R/tools/vite.review.config.mjs`。它原样导入生产配置，只把主 checkout 的 node_modules 加进 `fs.allow`，缓存放在 `$R/vite-cache`（已删除）。
> - **fixtures：**我照 `tools/e2e.sh` 的 `dump`，用 HEAD 的 supervisor 生成了一份（`$R/fx/`）。和作者的 `iter24/final/fx` 比，语义上相同（`$R/checks/fx-compare-semantic.txt`）。
> - **作者的东西：**`/tmp/tower-design/iter24/` 下的脚本一个都没运行，只读了 `final/flow/summary`。

**做得好的地方：**

- **审批代码块不再压字：**
  - 第一个词就是这一行自己的文字。220 字符的路径在第 0 格开始，续行都在第 2 格；
  - 钩向左移了，离下一个字 4.5 px（`43576b0` 是 3.0 px）；
  - 浅色深色都安静（`$R/approval/af6d189/closeup/r24-path220-*.png`、`r24-url-*.png`）。
- **轨迹里 Tower 做的事有了名字和标记：**
  - “Tower closed “CI failed: lint”: Newer check results” 带 harness 字形，是 text-2；
  - 进入“需要你”的那一行写出是哪一项；
  - 这一轮有了 “Tower cancelled …: the run was stopping” 这条说明；
  - 事件名不再直接出现（`$R/trace/af6d189/trace-*.png`、`crop-zh-dark.png`）。
- **CI 失败的问题行：**每个检查名是一段等宽代码，名字之间的 “, ” 用正文字体，矩阵任务名 “e2e (webkit, shard 2/4)” 是一段（`$R/approval/af6d189/desk/r24-ci3-en-light-1241.png`、`phone/r24-ci3-zh-CN-dark-320.png`）。
- **没发出去的字不会丢：**桌面卡片换视图或被替换后，字还在；手机页离开回复框后，字也还在。

---

## 评审范围

- **被评审：**`af6d189`（detached），worktree `/tmp/tower-design/wt-review24`，端口 1441。
- **对照：**`43576b0`，worktree `wt-review24-base`（已删除），端口 1442。
- **浏览器：**Playwright WebKit。
  - DPR 2；审批特写 DPR 4；手机 DPR 3。
  - 宽度 1040、1241、1280、1281、1440、1800；手机 390、360、320。
  - 中英文、浅色深色都看了；审批块另外看了 compact、large 两种界面字号。
- **审批用例：**
  - 单行、多行带缩进；长命令；高块；
  - 44、56、95、220 字符的路径；
  - URL 开头接 `| sh`；URL 是第三个词；URL 在缩进的续行里（`curl -fsSL \` / `    https://… \` / `  | sh`）；
  - 带 tab 的命令；中文提交信息；
  - CI 失败卡片（单个检查名、矩阵任务名）和停滞卡片。
- **手机页：**
  - 审批块；
  - 120 秒的轮询重绘计数；
  - 选中文字时来了新状态、在选中状态下回答；
  - 正在输入时来了新状态，然后点 “Send”。
- **读过的代码：**
  - `run/asks.rs`；
  - `tower-store/src/{events,inbox,schema}.rs`；
  - `tower-core/src/i18n.rs` 的 `event_words`；
  - `pr.rs`、`remote.html`；
  - `DecisionCard.tsx`、`Trace.tsx`、`App.tsx`；
  - `extensions/tower-goal/{policy,index,acp}.ts`。

## 加权评分

| 维度 | 权重 | 分数 | 理由 | 加权 |
|---|---|---|---|---|
| 产品适配 | 15% | 8.6 | **加分：**<br>• Agent 不会再把 Tower 取消的对话框读成 “The human declined”（D273）；<br>• 运行停止时被取消的请求在轨迹里有记录（D275）；<br>• 草稿不会丢（D283、D287）。<br>**扣分：**<br>• 选中文字时，手机页的卡片和页脚的时间说的不是同一个状态（R24-P3-01）；<br>• 迁移 24 可能把人手写的回答标成 Tower 的（R24-P3-02）。 | 1.290 |
| 信息架构与工作流 | 20% | 8.9 | **加分：**<br>• 关闭行、进入行都写出是哪一项；<br>• 8 种事件有了句子；<br>• CI 检查名一个一段。<br>**扣分：**<br>• Tower 取消的说明没有 Tower 标记，而关闭行有；<br>• 迁移来的旧关闭行仍是 “Withdrawn: The run stopped” 这种老格式。 | 1.780 |
| 视觉层级 | 15% | 8.8 | **加分：**<br>• 钩离字 4.5 px；<br>• 长路径每行填满、在第 2 格；<br>• CI 名字等宽、逗号用正文字体，读得出几个检查。<br>**扣分：**<br>• 缩进行里的长 URL 前面空出一整行（R24-P3-03）。 | 1.320 |
| 原创性与产品身份 | 15% | 8.6 | 钩、三种状态标记、印章、注记竖线都没变。harness 字形开始当作 “Tower 做的” 来源标记用，这个方向对，但还没有贯彻到 Tower 的所有说明行。 | 1.290 |
| 工艺与排版 | 10% | 8.3 | **加分：**<br>• R23-P2-01 在两端、所有宽度和两种字号下都修好了；<br>• tab 也能分词。<br>**扣分：**<br>• R24-P3-03；<br>• Look 手机标签的缺图框改成和桌面一样的 153.6×96 横框，挨着竖的手机缩略图，原因只剩 5 行加省略号（`43576b0` 是 220 宽，能看全）。 | 0.830 |
| 密度与克制 | 10% | 8.7 | 没有新增颜色。中点仍只在验收标准条和预算行。新出现的两个 “×” 只在 `app.css` 的一行注释里。 | 0.870 |
| 交互 | 10% | 8.5 | **加分：**<br>• 手机页不再无故重绘，选中的命令能复制；<br>• 桌面和手机的草稿都能留住。<br>**扣分：**<br>• 选中状态下回答后，卡片还留着、还能点（R24-P3-01）；<br>• 输入时来了新状态，第一次点 “Send” 会被吞掉（既有，见只做记录）。 | 0.850 |
| 设计系统一致性 | 5% | 8.5 | **加分：**<br>• DESIGN.md 和 docs/12 写明首尾空行会去掉（D279）；<br>• 钩的位置和 tokens 一致。<br>**扣分：**<br>• DESIGN.md 关于长词的新说法比实际宽；<br>• 取消说明和关闭行的标记不一致。 | 0.425 |
| **合计** | 100% | | | **8.655** |

## 负责人意见（标记、动效、劣质 UI）的总体评价

- **三种状态标记：**这一轮没有动。
  - 两个提交的逐元素着色扫描，以及绿色出现位置的扫描，除了时间、pin 的 sha 和运行时间以外完全一样（`$R/marks/{af6d189,43576b0}/paint-*.txt`、`green-where.txt`）。
  - G-0002 的 `burn-fill.over` 只在对照组出现，因为对照组用的是另一份 fixtures。
- **钩：**
  - 墨迹横向在 1.2–10.8 px（`43576b0` 是 2.8–12.2 px），离下一个字 4.5 px（`43576b0` 是 3.0 px）；
  - 最深的像素：浅色 (93,90,87)，深色 (167,164,161)，都是 text-3；只占两格的 12%（`$R/approval/af6d189/hook-gap.txt`、`$R/approval/43576b0/hook-gap.txt`）。
  - 第 23 轮那种钩压在字上的情况没有了，看起来是一个续行记号，不是块。
- **粗糙字形扫描（`$R/charscan/`）：**
  - 和 `43576b0` 比只多了 `app.css` 一行注释里的两个 “×”（“220×96 … 154×96”），不会显示出来；
  - 其余命中和第 23 轮一样。
- **动效：**没有新增。
- **对照 Primer / Geist / Linear，还不够好的地方：**
  1. **Tower 的说明行，来源标记还不统一：**
     - “Tower closed …” 有 harness 字形；同为 Tower 的 “Tower cancelled …” 没有（`Trace.tsx:520` 的 note 行只有 `t2`）；
     - GitHub 和 Linear 的时间线里，系统事件都用同一种来源记号。
  2. **长词不在行首时整块下移：**编辑器的软换行会在原地继续，不会空出一行（R24-P3-03）。
  3. **Look 手机标签的缺图框是横的，挨着竖的手机缩略图：**两个标签的框形状统一了，但手机标签里“前后”两张不再是同一种比例。

## 作者说明的准确性

- **说得准的：**
  - 每条修复在旧源码或说明的变异上都失败，失败原因与说法一致（见“新增测试”一节）。
  - 门禁数字与 `DESIGN_PROGRESS.md` 最后一条一致：tsc；vitest 44/265；cargo 29 个测试集、494 通过、2 忽略；扩展 34；安全测试 118；bundle 163,735；截图 69/69；用字体配置跑 e2e，439/0。
  - flow：作者在负载下 20/20，负载 18.7–36.4，是 D287 之前跑的。我在最终代码上又跑了 6 次，全部通过。
- **说得宽了的：**
  - **D270 和 DESIGN.md：**
    - DESIGN.md 说长词 “first in its line or not, fills each row it runs over … and the next word follows it”；
    - 长词不在行首时不成立：它整块挪到下一行，后面的词另起一行；有缩进时还会空出一行（R24-P3-03）。
  - **D272：**“把守卫挪到锁外会失败”只对整段挪出去成立。只把读 `stopping` 挪到锁外、钩子留在锁里，测试照样通过（`$R/rust/guard-read-outside-hook-inside.log`，18/18）。
  - **D271：**说的三种变异都会失败，这是对的。但钩画成 text-1，或者换成一根细竖线，桌面测试 2/2 都通过（`$R/fswap/desk-text1.log`、`desk-bar.log`）。
  - **D285：**“文字不变”准确。没说的有两点：
    - `LIKE` 不分大小写，人手写的回答也会被改成 Tower 的；
    - 迁移改写的是 `schema.rs:45` 和 docs/06 §6.3 说只追加的事件日志（R24-P3-02）。
  - **D287：**“有选中的文字时，新状态等到选区放开再画”是对的。但这期间页脚的读取时间和顶栏数字照常更新，已经回答的卡片也一直留着（R24-P3-01）。
  - **e2e 439/0：**规定命令在我这里是 434 通过、5 失败：
    - 4 个是字体 403；
    - 第 5 个是 `verdict.spec.ts:650`（1100 en）：收到 608，上限 600。`43576b0` 在同样的配置下能过。原因是 `rich.ts` 的 CI 项换成了真实的长正文，卡片从 106 px 高到 126 px。
    - 字体加载时，1440 en 的标准标题在 598，只差 2 px 就到上限（`$R/checks/ac1-*.txt`、`verdict600-*-prescribed.log`）。

## 第 23 轮问题与“只做记录”、没覆盖、测试缺口的逐项核实（D270–D285），以及 D286、D287

| 项 | 来源 | 结论 | 证据 |
|---|---|---|---|
| D270 | R23-P2-01 | **已修复（但不在行首的长词另有问题，见 R24-P3-03）** | • 桌面 312 块、手机 156 块：没有续行在第 0 格，disorder 0，没有断词。<br>• 220、95 字符的路径、URL 开头接 `| sh`：每行填满，`| sh` 接在 URL 后面（`$R/approval/summary-af6d189.txt`、`closeup/r24-url-light.png`）。<br>• `43576b0` 上重现了第 23 轮的问题，例如手机 44 字符路径的 “.tsx” 在第 0 格（`$R/approval/43576b0/`）。<br>• 换旧源码、第一个词改回 box、去掉 break-all：桌面、手机都失败。 |
| D271 | R23 测试缺口 | **已修复（还有两个探针能通过）** | • 实心、琥珀、只画一次，桌面和手机各 2 个失败（`$R/fswap/{desk,phone}-{solid,amber,once}.log`）。<br>• text-1 色的钩、细竖线：桌面 2/2 通过。 |
| D272 | R23 测试缺口 | **部分修复（测试只钉住了钩子的位置）** | • 代码：读 `stopping`、钩子、取消、写说明，都在 `lock_mode()` 里面（`asks.rs:153–175`）。<br>• 整段挪到锁外：模式序列变成 [Starting, Settled, WaitingOnYou]，测试失败（`$R/rust/guard-outside-lock.log`）。<br>• 只把读挪到锁外：18/18 通过。<br>• 负载下 5/5 通过（`$R/flow/d272-load-*.log`）。 |
| D273 | 记录 6 | **已修复** | • 没人回答时：“No one answered whether this command may run, so it did not run” / “No one answered whether you may …, so it was not written”；有人拒绝时仍是 “The human declined…”（`policy.ts:49–62`）。<br>• 改成总说拒绝：扩展 1 个失败；旧 `policy.ts`：2 个失败（`$R/fswap/ext-*.log`）。 |
| D274 | 记录 9 | **已修复** | “…. Tower asked because of: push to a remote (one-way door). Find another way or ask_user.”（`policy.ts:61`），不再括号套括号。 |
| D275 | 记录 6 后半 | **已修复（说明行没有 Tower 标记，只做记录）** | • 轨迹里有 “Tower cancelled “Approval needed: delete recursively”: the run was stopping” / “Tower 取消了“需要你批准：递归删除”：运行正在停止”（`$R/trace/af6d189/rows-en-light.txt`、`crop-zh-dark.png`）。<br>• `asks-no-note`：1 个失败。 |
| D276 | 记录 4 | **已修复** | • 7 种关闭都是 “Tower closed “标题”: 原因”，带 harness 字形，text-2。<br>• 进入行写出是哪一项。<br>• `store-closing-reason`、`unit-trace-old`、`trace-opened-unnamed` 都失败。 |
| D277 | 记录 2 | **已修复** | • 带 tab 的命令在 tab 处分词（`closeup/r24-tabs-*.png`）。<br>• 只按空格分词的变异：桌面、手机各 2 个失败。 |
| D278 | 记录 1 | **已修复** | 钩横向 1.2–10.8 / 14.3 px，离下一个字 4.5 px；`43576b0` 是 2.8–12.2，3.0 px。 |
| D279 | 记录 3 | **保留合理** | DESIGN.md 和 docs/12 写明正文首尾的空行和空白会去掉。高块的复制结果只差末尾的空行，与文档一致。 |
| D280 | 记录 7 | **已修复** | • 截图见上。<br>• 预览数据有了 `code`，截图里的检查名是等宽（`$R/shots/crops/inbox-en-light.png`）。<br>• `store-ci-one-code`、`desk-ci-one-code`、`desk-ci-old-src` 失败；手机旧源码也失败。 |
| D281 | 记录 8 | **已修复（手机标签的框是横的，只做记录）** | • 两个标签的缺图框都是 153.6×96（`43576b0` 手机标签是 220×96）。<br>• 并排对比的手机框，在所有尺寸下宽高比都是 0.46。<br>• 1040×640：URL 7 行、中文长句 6 行，都没有截断；1040×560：9 行，没有截断（`43576b0` 是 8 行加省略号）。<br>• 证据：`$R/look/sum-*.txt`、`side-phone-url-en-light-1040x640.png`。<br>• `look-css-old`：2 个失败。 |
| D282 | R23 没覆盖 | **已修复** | 让 `esc` 直接返回输入：“no element made from an agent's words”，收到 15 个元素，测试失败。 |
| D283 | R23 没覆盖 | **已修复（同一个键的卡片共用草稿，只做记录）** | • 换视图回来、被同键的新项替换：字都还在；回答之后清掉（`$R/drafts/af6d189.txt`）。<br>• 单元测试在旧卡片上失败，回答后不清草稿的两个变异也失败。 |
| D284 | 记录 10 | **保留合理** | 预算没有提高。全部界面 JS 163,735 / 163,840，剩 105 B（第 23 轮剩 68 B）。 |
| D285 | 记录 5 | **部分修复（R24-P3-02）** | • 旧格式的关闭行变成系统来源、auto。<br>• 但 “withdrawn: the PR, please redo it”、“WITHDRAWN: yes”、“(Timed Out: I was away)” 这类人手写的回答也被改了（`$R/sql/result.txt`）。<br>• `schema-no-migration`：1 个失败。 |
| D286 | 本轮 | **已修复；语言切换的做法保留合理** | • 中英文、浅深色的轨迹里都没有事件名（`$R/trace/af6d189/raw-*.txt` 为空）。<br>• `trace-no-words`、`trace-old-fixtures`、`store-words-append`、`store-words-read` 都失败。 |
| D287 | 本轮 | **已修复（选中时有新问题，见 R24-P3-01）** | • 120 秒内重绘 4 次，`43576b0` 是 24 次（`$R/phone/*/repaints.txt`）。<br>• 选中的文字保住了；离开回复框后字还在（`send-after-pending.txt`）。<br>• 旧源码 4 个失败；每次都重绘、不等选区、不存草稿、按 id 存草稿、回答后不清草稿，这 5 个变异都失败。 |

## D272、D275 的阅读结论：守卫、取消和说明在锁里的顺序

- **代码：**`on_ui_request` 在 `run.lock_mode()` 里依次做这几步（`asks.rs:153–175`）：
  1. 读 `stopping`；
  2. 钩子 `stop-checked`；
  3. 如果正在停止：取消对话框，写 Note，返回；
  4. 否则：开收件箱项、登记对话框、把模式设成 WaitingOnYou。
- **结论：**停止是在同一把锁里标记的，所以停止不能插到检查和打开之间。说明写在锁里，在取消之后，顺序没问题。
- **测试的缺口：**钩子在锁里面，测试只能证明“钩子之后的部分在锁里”。如果读 `stopping` 挪到加锁之前，测试照样通过。要钉住这一点，钩子应该放在读之前，或者在加锁之前另加一个钩子。
- **取消时：**不开收件箱项，也没有“进入需要你”那一行，轨迹里只有一条取消说明。这和 D255 的设计一致。

## D285 的阅读结论：会不会把人的回答标成 Tower 的

- **会，概率小，但改了就改不回来。**
  - 条件是 `response LIKE 'Withdrawn: %'` 或 `LIKE '(timed out: %'`（`schema.rs:336–347`）。SQLite 的 `LIKE` 对 ASCII 不分大小写。
  - 问题和假设卡片可以写自由文本，人如果写了 “withdrawn: …” 或 “(timed out: …”，就会被改成 `source='system'`、`auto`，在轨迹里画上 Tower 的标记。
  - 这是诚实语法的反方向：人的决定被说成 Tower 的。
- **它改写的是只追加的事件日志：**
  - `schema.rs:45` 写着 “The append-only log”，docs/06 §6.3 也这样定义事件日志；
  - 迁移 24 是第一次用 UPDATE 改历史事件。
- **修正的方向：**
  - 只匹配 Tower 自己写过的那几句：用大小写敏感的比较（`substr(...) =` 或 `GLOB`），或者列出完整句子；
  - 或者不改日志，只在读取时解释。

## D283 的阅读结论：键（目标 + 类型 + 主题）会不会让不该共享的草稿共享

- **同时存在的同键卡片会共用草稿：**
  - 例如同一个目标对同一条命令连问两次审批，或者问了两个一样的问题；
  - 在一张卡里打的字会出现在另一张，回答一张会清掉两张的草稿（`$R/drafts/af6d189.txt` 的 sameKey）。
  - 引擎的对话框不合并（D259），所以这种情况可能出现，但两张卡说的是同一件事，影响很小。
- **只在本机回答时才清草稿（`DecisionCard.tsx:71`、`283`）：**
  - 如果项是在手机上回答的，或者被 Tower 关掉了，草稿会一直留着；
  - 之后同一个目标再问同样的问题，旧字会回来。这一点是读代码得出的，没有实测。
- **键是直接拼起来的（`DecisionCard.tsx:53`）：**没有分隔符。目标 id 格式固定，类型是枚举，实际不会撞键。

## D286 的阅读结论：追加时是否每次都读设置，切换语言后是否可接受

- **追加时：**`events.rs:308` 把读语言写成闭包传进 `event_words`（`i18n.rs:652`）。只有那 8 种事件才会调用闭包，其余事件不读设置。
- **读取时：**`worded()`（`events.rs:348–351`）每一批只读一次语言。
- **切换语言：**
  - 只有设置页能改语言（`Settings.tsx`）；
  - 设置页是单独的路由，用 `Switch/Match` 切换，会卸载目标页（`App.tsx:221–232`）；
  - 轨迹只挂在目标页（`GoalPage.tsx:280`），回来时重新挂载、重新读取，句子就跟着新语言走。
  - 所以“要等重新读取才变”在实际使用中看不到。**保留合理。**
  - 当时写下的 Note、关闭原因仍是写入时的语言，这一点是既有的。

## D287 的判断：行为是否合适，`selecting()` 在 iOS 上的风险

- **合适的部分：**
  - 标记没变就不动节点；
  - 选中时先不画，这样能复制命令；
  - 草稿按目标 + 类型 + 主题保存，回答之后清掉。
- **问题（R24-P3-01）：**
  - 选中期间，`showStatus()`（`remote.html:418–436`）照常把页脚改成 “Read at 10:01”，顶栏的数字也换成新状态的，卡片却还是旧的（`$R/phone/af6d189/held-selection.png`、`selection.txt`）。
  - 在选中状态下点选项回答（WebKit 里点按钮不会清掉选区），已回答的卡片一直留着，还能再点（`selection-realclick.txt`）。
- **iOS 的风险（推断，没有真机）：**
  - 在 iOS 上，用户常常是长按选中命令、复制、切到别的 app 去粘贴，选区会一直留着；
  - 回来时卡片停在旧状态，而页脚显示刚读过。`selectionchange` 在 iOS Safari 上是支持的，问题在于选区留着时用户自己意识不到。
  - 建议：选中期间页脚注明“有新状态，放开选中后更新”，或者只保留包含选区的那张卡、其余照画；回答成功后，立刻在本地把那张卡拿掉。

## 诚实语法

- **绿色：**
  - 只在验证器结论旁，同一行有 pin（G-0003 “Verified by Tower: passed 412ms @6fa501f”）；
  - 侧栏 “Ready to accept” 的生命周期字形没有 pin，这是文档写明的例外，没有变（`$R/marks/af6d189/green-where.txt`）。
- **琥珀：**审批、停滞、CI 卡片的 “!”。钩是 text-3。
- **红色：**没有新增。
- **注记：**没有变化。
- **沉默徽章：**text-2、400、没有 svg（`$R/marks/af6d189/scan-*.txt`）。
- **中点：**只在验收标准条的 `.sep` 和预算行。
- **Agent 的话：**不会变绿。
- **GitHub 检查：**CI 卡是琥珀 “!” 加等宽的检查名，不用验证器的绿色。
- **Tower 的动作：**
  - 关闭行写成 “Tower closed …” 并带标记；
  - 扩展对 Agent 说 “No one answered”，不再说成人的拒绝；
  - 取消说明的文字里写了 Tower，但没有标记（只做记录）。
- **反方向的风险：**迁移 24 可能把人的回答标成 Tower 的（R24-P3-02）。
- **时间的诚实：**手机页选中期间，“Read at” 的时间比卡片新（R24-P3-01）。

## 回归检查（对照 `43576b0`）

- **截图（两边都用我从 `af6d189` 生成的 fixtures；HEAD 和对照各 69/69，`$R/shots/diff.txt`，裁图在 `$R/shots/crops/`，上 HEAD 下 base）：**
  - 28 张逐像素相同，41 张不同，原因都对得上：
    - **时钟：**两次跑相隔约 1 分钟，“33m” 变成 “34m”。顶栏、“ago” 列、Operations、调色板、快捷键都是这个原因（例如 `contract-en-light.png`、`check-small.png`）。
    - **预览数据（D280，`rich.ts`）：**CI 项有了 `code`、真实的正文和选项文字。影响 `goal-G-0001-*`、`final-goal-deck-*`、`inbox-*`。
    - **连带的滚动位置：**`look-compare-zh-dark` 弹层下面的页面滚动位置差约 20 px，因为上面的 CI 卡变高了。
  - 没有布局回归。截图覆盖评审页（含 readout）、目标页、看板、收件箱、速览、合同编辑器、Operations、欢迎页、设置、快捷键、学习页、Look 对比。
- **全量 e2e：**
  - HEAD 用字体配置和我的 fixtures：439 通过、0 失败、76 跳过；
  - 规定命令：434 通过、5 失败（字体 403 四个，加 `verdict.spec.ts:650` 1100 en 收到 608）、76 跳过。
- **专项 spec：**
  - HEAD：23/23，加 marks、green、look 10/10。
  - 对照组：21/23，加 10/10。两个失败是 drafts（功能不存在）和手机审批 “Element is not attached”（正是 D287 修的问题）。
- **改过的文字，两种语言都读了：**
  - 进入行：“…” added to Needs you / “…”进入“需要你”，通顺。
  - 关闭行：“Tower closed “…”: It timed out; the asker stopped waiting for an answer” / “Tower 关闭了“…”：已超时，提问的一方不再等这个回答”，通顺。
  - 事件句：“Ports 20020–20029 set aside for this goal” / “为这个目标留出端口 20020–20029”、“C1: a test that must fail passed” / “C1：一个必然失败的测试通过了”，通顺。
  - 扩展：“No one answered whether you may write to a path the contract makes read-only: …, so it was not written”，冒号夹在句子中间，略别扭，能读。
  - 英文冒号后大小写不一：“: The run stopped” 与 “: the run was stopping”（只做记录）。
- **性能（`--project=perf --no-deps`，两边交替各跑 3 次，`$R/checks/perf-*.log`）：**
  - 机器上还开着别的应用，负载在 11–27 之间，数字只能看个大概。
  - 50 个目标的看板，3 次中位数：HEAD 356 / 750 / 279 ms，对照 267 / 786 / 780 ms；视图切换的中位数两边差不多。
  - HEAD 3/3 通过；对照组有一次在负载 24 时视图切换超限，失败。看不出回归。

## 新问题清单

### P0
无。

### P1
无。

### P2
无。

### P3

**R24-P3-01：手机页选中卡片上的文字时，卡片停在旧状态，但页脚和顶栏换成了新状态；已回答的卡片留着、还能点（本轮引入，D287）**

- **复现：**
  1. 手机页有两张卡（审批、问题）；
  2. 选中审批卡上的命令；
  3. 让下一次读取多一张卡，等一次轮询；
  4. 再在问题卡上点 “Percentage” 回答，然后让服务端的状态去掉这张问题卡。
- **现象：**
  - 第 3 步之后：页脚从 “Read at 10:00” 变成 “Read at 10:01”，顶栏多了 “bash running for 1m”，卡片仍是 2 张，新卡没有出现（`$R/phone/af6d189/held-selection.png`、`selection.txt` 的 held）。
  - 第 4 步：回答发出去了，问题卡一直留着，选项还能点（WebKit 里真实点击按钮不会清掉选区，`selection-realclick.txt`）。
  - `43576b0` 上选区会被重绘冲掉，卡片是新的（`$R/phone/43576b0/selection.txt`）。
- **原因：**
  - `remote.html:446–466`：`selecting()` 为真时，`applyState` 只存 `pendingState` 并调用 `showStatus()`；
  - `showStatus()`（`remote.html:418–436`）会更新 `fresh` 和 `gauges`；
  - `answer()`（`remote.html:363–369`）之后的 `load()` 也被挡住。
- **为什么是 P3：**
  - **不是 P2：**
    - 再点一次已回答的项，服务端会拒绝（“no longer waiting”）；
    - 手机上本来就不能允许审批；
    - 选区一放开就恢复。
  - **够得上记一条：**
    - 页脚的时间说“刚读过”，卡片却是旧的，违背“界面说的就是它知道的”；
    - 在 iOS 上，复制完命令去别的 app，选区会留着，用户不会想到要放开。
- **修正目标：**
  - 选中期间，要么照画不含选区的卡片，只保留选区所在那张；要么在页脚写明“有新状态，放开选中后更新”，并且不更新 “Read at”。
  - 回答成功后，立刻在本地把那张卡拿掉。
  - 测试：选中期间，“Read at” 和卡片要么都是新的，要么页面写明有更新在等；回答后卡片消失。在 HEAD 上要失败。

**R24-P3-02：迁移 24 用不分大小写的前缀匹配改写只追加的事件日志，可能把人手写的回答标成 Tower 的（本轮引入，D285）**

- **复现：**
  - 建一个 user_version 23 的库，写入几条 `inbox_resolved` 事件（`source='human'`，没有 auto），response 分别是 “withdrawn: the PR, please redo it”、“WITHDRAWN: yes”、“(Timed Out: I was away)”；
  - 执行迁移 24 的 SQL（`$R/sql/mig24.sql`、`t.db`）。
- **现象：**这三条都变成 `system|1`；“replaced by a newer one”（小写）、“Withdrawn” 这类没有被改（`$R/sql/result.txt`）。
- **原因：**`crates/tower-store/src/schema.rs:336–347`，条件是 `LIKE 'Withdrawn: %'` 和 `LIKE '(timed out: %'`，而 SQLite 的 `LIKE` 对 ASCII 不分大小写。
- **为什么是 P3：**
  - **不是 P2：**人这样写的可能性很小；只对升级前就有的数据生效一次。
  - **够得上记一条：**
    - 一旦命中，人的决定就被画成 Tower 的，而且改不回来；
    - 这也是第一次对 docs/06 §6.3 所说的只追加日志做 UPDATE，文档没有交代。
- **修正目标：**
  - 只匹配 Tower 自己写过的那几句，用大小写敏感的比较；
  - 或者改为在读取时解释，不改日志；
  - docs/06 写明这一次例外；
  - 在 `schema.rs` 的测试里加大小写不同的人手写回答，断言来源不变。

**R24-P3-03：比一行还长的词不在行首时整块下移；有缩进时空出一整行，后面的词另起一行（D254 起就有；DESIGN.md 本轮新写的说法不成立）**

- **复现：**
  - 桌面 1040–1440，审批命令写成三行：`curl -fsSL \`、`    https://raw.githubusercontent.com/…/install.sh \`、`  | sh -s -- --yes`；
  - 或者一行：`curl -fsSL https://…/install.sh -o /tmp/install.sh`；
  - 手机 390 / 320 也一样。
- **现象：**
  - 第一种：第 2 行只有 4 个空格，看起来像命令里有一行空行（shell 里 `\` 后面接空行会结束命令）；URL 从下一行开始，带钩；最后的 `\` 自己占一行（`$R/approval/af6d189/closeup/r24-indenturl-light.png`，行数据 `['F',0,'    ']`）。
  - 第二种：“curl -fsSL ” 一行，后面空着；URL 从下一行开始；“-o /tmp/install.sh” 另起一行（`$R/approval/af6d189/desk-log.txt` 的 r24-thirdurl）。
  - 复制结果是对的。
  - `43576b0` 一样（`$R/approval/43576b0/closeup/r24-indenturl-light.png`、`desk-log.txt`）。
- **原因：**
  - `DecisionCard.tsx:447` 和 `remote.html:335`：只有 `j == 0` 的部分是这一行自己的文字。
  - 有缩进时，`split(/(\s+)/)` 的第 0 段是空串，缩进是第 1 段，URL 是第 2 段，被包成 `.w`（`inline-block; max-width: 100%`）。
  - 这个盒子放不进缩进后面剩下的位置，只能整块下移；它折行以后宽度就是整行，后面的词也就接不上。
- **为什么是 P3：**
  - **不是 P2：**不压字，顺序对，复制对，钩也画在正确的行上。
  - **够得上记一条：**
    - 多出来的空行会让人误读命令的结构；
    - `curl … | sh` 这类安装命令，常常就是缩进续行里放一个长 URL；
    - DESIGN.md 新写的 “first in its line or not … the next word follows it” 在这种情况下不成立。
- **修正目标：**
  - 比一行还长的词不包成 box（或者第一个非空白的词也算这一行自己的文字），让它在原地开始、填满；
  - 测试加上缩进续行里的长 URL 和 “URL 是第三个词” 两种情况，断言 blankRows 为 0，并且 URL 之后的词和它在同一行开始。

### 只做记录，不计入

1. **Tower 取消的说明没有标记：**
   - “Tower cancelled …” 是普通 note（`Trace.tsx:520`），没有 harness 字形；
   - 同样是 Tower 做的 “Tower closed …” 有标记（`Trace.tsx:503–506`）。
2. **英文冒号后大小写不一：**
   - “Tower closed …: The run stopped / Accepted / A newer one replaced it”；
   - “Tower cancelled …: the run was stopping”。
3. **迁移来的旧关闭行仍是旧格式：**
   - 显示成 harness 标记加 “Withdrawn: The run stopped”，不是统一的 “Tower closed …”；
   - 中文界面里还会夹一条写入时的英文，或者反过来（`$R/trace/af6d189/rows-en-light.txt` 第 37、38 行）。
4. **同键草稿：**
   - 同时存在的同键卡片共用草稿；
   - 别处回答过的项，草稿会留着（读代码得出）。见 D283 的阅读结论。
5. **Look 手机标签的缺图框：**
   - 153.6×96 的横框，挨着竖的手机缩略图；
   - 原因只显示 5 行加省略号（`$R/look/af6d189/phone-url-en-dark-1040x640.png`）；`43576b0` 是 220 宽，5 行能看全；
   - 全文在并排对比里能看到。
6. **验收标准离顶部的余量：**
   - 字体加载时，1440 en 的标题在 598，上限 600；
   - 字体没加载（规定命令下 403）时，1100 en 是 608，`verdict.spec.ts:650` 失败；
   - 原因是预览里 CI 卡的正文变长了（106 → 126 px）。
7. **输入时来了新状态，点 “Send” 会被吞掉（既有）：**
   - 回复框失焦触发重绘，按钮在 click 之前就被换掉了，回答没有发出（两个提交都这样，`$R/phone/*/send-after-pending.txt`）；
   - HEAD 至少把字留住了，可以再点一次（`43576b0` 上字也没了）。
8. **D272 测试的钩子在读之后：**只把读挪到锁外，测试 18/18 照样通过。
9. **D271 钩的测试：**text-1 色的钩、一根细竖线，桌面都能通过。
10. **bundle：**剩 105 B（第 23 轮剩 68 B）。
11. **中文 CI 问题行：**检查名之间用的是英文 “, ”。名字本身是代码，可以接受；换成 “、” 也说得过去。

## 新增测试是否测到了它声称的东西

- **e2e（`command.ts`、`flows.spec.ts`、`phone.spec.ts`）：**
  - 旧 `DecisionCard.tsx` 和 `app.css`、第一个词改回 box、去掉 break-all：桌面各 2 个失败；
  - 手机旧 `remote.html`：4 个失败，原因是 “a carried-over row starts two in, under the hook”、CI/停滞的代码、刷新测试；手机的 first-box、no-breakall 各 2 个失败；
  - 只按空格分词：桌面、手机各 2 个失败；
  - 去掉 `esc`：收到 15 个元素，失败；
  - D287：每次都重绘（“the same state leaves the block the node it was”）、不等选区（收到 3 张卡）、不存草稿、按 id 存草稿、回答后不清草稿：都失败；
  - D280：`desk-ci-one-code`、`desk-ci-old-src`：失败；
  - D281：`look-css-old`：中英文各 1 个失败；
  - D286：`trace-no-words` 2 个失败。`trace-old-fixtures` 也是 2 个失败，原因对（第 1580 行的句子）；但那次批跑脚本顺带套了一个无关的 `desk-first-box` 变异，所以那份日志不算干净。
- **e2e 的缺口：**
  - 没有“不在行首的长词”和“缩进续行里的长词”（R24-P3-03）；
  - 没有测选中期间的页脚和已回答的卡片（R24-P3-01）；
  - 钩的测试分不出 text-1 和细竖线。
- **Rust：**
  - `guard-outside-lock` 失败，模式序列是 [Starting, Settled, WaitingOnYou]；
  - `asks-no-note`、`store-closing-reason`、`store-ci-one-code`、`schema-no-migration`、`store-words-append`、`store-words-read` 都失败（`$R/rust/summary*.txt`）；
  - **缺口：**`guard-read-outside-hook-inside` 18/18 通过；迁移测试没有大小写不同的人手写回答。
- **单元测试：**
  - 旧 `DecisionCard.tsx`：1 个失败；回答后不清草稿（选项、回复两个变异）：各 1 个失败；
  - 旧 `Trace.tsx`、进入行不写标题：各 1 个失败。
- **扩展：**总说拒绝：1 个失败；旧 `policy.ts`：2 个失败。
- **会不会在别的实现下假通过：**
  - 钩：颜色只有“够深”的下限，形状只量占比，所以 text-1 和细竖线都能过；
  - D272：只钉住了钩子之后的部分；
  - D283：测的是换视图和替换，没测同键的两张卡同时存在。

## 工程检查结果

| 检查 | 结果 | 日志 |
|---|---|---|
| `tsc --noEmit` | 通过（exit 0） | `$R/checks/tsc.log` |
| `vitest run` | 44 个文件、265 个测试全部通过 | `$R/checks/vitest.log` |
| `vite build` | 通过 | `$R/checks/build.log` |
| `bundle-budget.sh` | • 启动 56,286 / 65,536；<br>• 按需 107,449 / 110,592；<br>• 全部 **163,735 / 163,840**（剩 105 B）；<br>• 目标页 chunk 11,651 / 12,288；<br>• 高亮 worker 197,983 / 262,144 | `$R/checks/bundle-budget.log` |
| `line-limit.sh`、`doc-numbers.sh` | 通过 | `$R/checks/{line-limit,doc-numbers}.log` |
| `security-tests.mjs` | SECURITY.md 列出的 118 个测试都存在，CI 都会跑 | `$R/checks/security-tests.log` |
| 扩展 `node --test` | 34 通过、0 失败 | `$R/checks/ext-tests.log` |
| `cargo fmt --all --check` | 通过 | `$R/checks/cargo-fmt.log` |
| `cargo clippy --workspace --all-targets -- -D warnings` | 通过 | `$R/checks/cargo-clippy.log` |
| `cargo test --workspace` | 29 个测试集，494 通过、0 失败、2 忽略 | `$R/checks/cargo-test.log` |
| flow 整包 × 6 | 6 次都是 50/50：<br>• 不加负载 3 次，负载 6.7–7.3（机器上还开着别的应用），41–43 s；<br>• 10 个 `yes` 负载下 3 次，负载 24.6–30.5，45–49 s | `$R/flow/summary`、`run-*.log` |
| D272 测试，负载下 × 5 | 5/5 通过 | `$R/flow/d272-load-*.log` |
| e2e（规定命令、作者的 fixtures） | 434 通过、5 失败（`smoke.spec.ts` 7/73/125/148 字体 403；`verdict.spec.ts:650` 1100 en 收到 608）、76 跳过 | `$R/checks/e2e-prescribed.log`、`verdict600-*-prescribed.log` |
| e2e（字体配置、我的 fixtures） | 439 通过、0 失败、76 跳过 | `$R/checks/e2e-fonts-head-myfx.log` |
| 截图 | HEAD 和对照各 69/69；28 张相同，41 张不同，都对得上原因 | `$R/checks/shots-*.log`、`$R/shots/diff.txt` |
| perf（交替跑，各 3 次） | HEAD 3/3 通过，对照 2/3（负载 24 时视图切换超限），看不出回归 | `$R/checks/perf-*.log` |
| 换旧源码 / 变异 | 前端 32 项，Rust 8 项，扩展 2 项。全部还原，结果见上一节 | `$R/fswap/`、`$R/rust/` |

## 没能覆盖的

- **打包应用：**没有跑打包后的应用，也没有用真实的 WKWebView。界面结论都来自 Playwright WebKit。
- **iOS Safari 真机：**`selecting()` 的风险是推断出来的。只在桌面 WebKit 里验证了“点按钮不会清掉选区”。
- **旧数据库的界面：**迁移 24 只在合成的库上用 SQL 验证过，没有用升级前的真实数据库渲染轨迹。
- **真实 Pi 和 Agent：**“No one answered…” 到了真实会话里会怎样，没有验证。
- **语言切换：**没有接真实 supervisor 实测，D286 的结论是读代码得出的。
- **桌面草稿：**“项在别处被回答后草稿还在”只读了代码，没有实测。
- **设计检测器：**`impeccable detect` 没跑，作者报的 17 对 17 没有复核。
- **读屏：**没用 VoiceOver 实际听。
- **原生 `title` 提示：**没有截到它在屏幕上的样子。
- **对照组的全量 e2e：**没跑。对照组只跑了专项 spec、截图和 perf。
- **性能：**机器上还开着别的应用，负载没降到空闲，perf 只能看个大概。

## 验收条件

- **本轮：**加权 8.655 ≥ 8.0，没有未关闭的 P0/P1，结论 **PASS**。
- **建议下一轮做（不阻塞）：**
  1. **R24-P3-01：**手机页选中期间，要么照画不含选区的卡片，要么写明有更新在等、不更新 “Read at”；回答后立刻拿掉那张卡；补测试。
  2. **R24-P3-02：**迁移 24 只用大小写敏感的比较匹配 Tower 写过的句子，或者改为读取时解释；docs/06 写明这次对日志的例外；测试加上人手写的回答。
  3. **R24-P3-03：**比一行长的词不论在哪个位置都原地开始、填满；修正 DESIGN.md 的说法；测试加上缩进续行和“URL 是第三个词”两种情况。
  4. **测试：**
     - D272 的钩子挪到读 `stopping` 之前；
     - 钩的测试加上颜色上限（text-1 要失败）和形状检查（细竖线要失败）；
     - `verdict.spec.ts:650` 的余量和对字体的依赖要处理。
  5. **记录项：**给 “Tower cancelled …” 加上 Tower 的标记，统一冒号后的大小写；输入时来了新状态，不要吞掉 “Send” 的点击。
