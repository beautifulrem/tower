## Tower 前端设计评审：第 9 轮（`7a23f45`，对照 `4d0b9c4`，基线 `d6f07ef`）

> 当前环境不允许写报告类 `.md` 文件，所以没有生成报告文件。下面是完整报告，可以原样存到 `/tmp/tower-design/review9/report.md`。文中 `$R` 指 `/tmp/tower-design/review9`。

**结论：PASS（通过设计验收）。** 加权得分 8.28/10，不低于 8.0，没有未关闭的 P0 或 P1。
- **D58 的两项修复：**
  - 高严重度发现冻结所有通过，在所有界面上都已修好。`4d0b9c4` 上，红色哨兵旁边还挂着绿色 ✓，现在没有了。
  - “已验证（有保留）”在 in_review 状态下，10 个界面说法一致。
- **新的 P2（R9-P2-01）：** 有保留的通过被验收之后，目标页的印章变回了干净的 “Verified / 已验证”，tooltip 写“全部通过”。这和本次提交刚改过的 docs/12（accepted 有保留时画 `●*`）矛盾，supervisor 也确实会把 `qualified` 带到 accepted 状态。修法只需一行。
- **D96 部分修复（R9-P3-01）：** en 对比运行时，G-0001 在最小窗口 1040 下仍然看不到裁决，1248–1352 还有一段新的盲区。
- **其余 5 条新 P3** 都是本轮修改带出来的，另有 1 条既有 P3。
- **其余声称的修复**都已在 WebKit 里实测成立：bundle 余量、D91、D92、D51/D86、D20、D22、D23。

**设计方向：成立。**

**评审范围**
- **对象和环境**
  - worktree `/tmp/tower-design/wt-review9`，HEAD `7a23f45`（detached）。对照组 `/tmp/tower-design/wt-review9-base`，在 `4d0b9c4`。
  - Playwright WebKit，Tauri IPC 用 stub。fixtures 是 `/tmp/tower-design/fixtures` 和 `/tmp/tower-design/fixtures-zh`。
  - 端口：本轮 1441，对照 1442，生产构建预览 1443。没有运行 cargo，也没有运行打包好的应用。
- **覆盖面**
  - en/zh × 亮/暗 × 1040/1440/1800。D96 另做了 1024–1600 的逐 8px 扫描。
  - 每个 commit 各 96 张回归截图。
  - 诚实语法覆盖 10 个界面，用了三套数据：有保留的通过、高严重度冻结、按真实哨兵名构造的数据。
- **清理**
  - 临时 spec 有 10 个在本轮 worktree，14 个在对照 worktree，都已存到 `$R/checks/specs/{wt-review9,wt-review9-base}/`，并从两个 worktree 删除。`dist/` 和 `test-results/` 已删除。
  - 对照 worktree 已用 `git worktree remove --force` 移除，`git worktree list` 只剩主 checkout 和 wt-review9。
  - 1441、1442、1443 上的服务都已停掉。
  - `git -C /tmp/tower-design/wt-review9 status`：HEAD 仍是 `7a23f45`，没有任何已跟踪文件改动。未跟踪的只有 `node_modules` 和 `apps/desktop/node_modules` 两个 symlink，开工时就有，按要求没有删，所以严格说 status 不是完全空的。
  - 主 checkout 我只读过，并执行过 `git worktree add/remove`。它本身有未跟踪的 `.claude/` 和 `apps/desktop/design-evidence/README.md`，不是我创建的。

---

## 加权评分（满分 10）

| 维度 | 权重 | 分数 | 理由 | 加权 |
|---|---|---|---|---|
| 产品适配 | 15% | 8.5 | 高严重度冻结、通过但不作数、有保留的通过，三种结论在验收前都说清楚了；有保留的通过要按两次才能验收。扣分：验收后的永久记录丢掉了保留（R9-P2-01）。 | 1.275 |
| 信息架构与工作流 | 20% | 8.5 | 同一声明跨运行合成一行，标题后紧跟 ID，welcome 变成一列 setup，定时任务用文字写时间。扣分：Identity 列现在只放别的目标的 ID（R9-P3-06）；修订合同时，折叠摘要漏掉 loopback 和端口（R9-P3-05）。 | 1.700 |
| 视觉层级 | 15% | 8.5 | 合同侧栏从 20 个可见控件收成一行摘要，主栏成了视觉重心。扣分：对比运行时，裁决仍会在两个宽度段消失（R9-P3-01）。 | 1.275 |
| 原创性与产品身份 | 15% | 8.0 | 缺角印章和缺口圆环是 Tower 自己的语法，用得克制。10px 下缺角几乎看不出来（只做记录）。 | 1.200 |
| 工艺与排版 | 10% | 8.0 | bundle 余量从 120 B 回到 3,791 B，1040 下定时表不再断开。扣分：预算框的 “$” 压在数字上（既有，现在在折叠线以上，更显眼，R9-P3-07）；台账的运行标注和 agent 原话同字号同色（R9-P3-03）。 | 0.800 |
| 密度与克制 | 10% | 8.5 | 默认折叠的引擎条款是本轮最好的减法。 | 0.850 |
| 交互 | 10% | 8.0 | 0 个 pageerror，折叠摘要能用键盘聚焦、用 Space 打开。扣分：≤1240 时，评审头按钮的快捷键提示在所有模式下都被藏起来，而且没有 tooltip（R9-P3-02）。 | 0.800 |
| 设计系统一致性 | 5% | 7.5 | 中点只出现在标准条和预算行，绿色只给验证器。扣分：docs/12 和代码仍有三处对不上：accepted 的 `●*`、原因徽章、三个 diff token。 | 0.375 |
| **合计** | 100% | | | **8.28** |

---

## 声称的修复逐项判定

| 声称 | 判定 | 证据 |
|---|---|---|
| **bundle 余量**（词典键只发一次，`plugins/localeKeys.ts`） | **已修复** | **合计：**`4d0b9c4` 是 163,720 / 163,840（余 120 B），本轮 160,049（余 3,791 B）。<br>**分项：**<br>• 启动 54,064 → 54,859，其中单一语言 3,446。<br>• 按需 109,656 → 105,190。<br>• 目标页 11,437 → 11,573。<br>**生产构建：**全量 e2e 跑在 vite preview 上，en/zh 都能加载语言包（见“工程检查”）。<br>证据：`$R/checks/bundle-budget.log`、`bundle-budget-4d0b9c4.log` |
| **D91** 同一声明跨运行合成一行，标出运行 | **已修复（功能）**，但有视觉问题，见 R9-P3-03 | **功能：**G-0003 台账，en/zh × 亮/暗 × 1040/1440/1800 共 12 种组合，都是 2 行；旧 commit 是 4 行。行尾写 “runs 1, 2 / 第 1、2 次运行”。<br>证据：`$R/d91/7a23f45/log.txt`、`ledger-*.png`<br>**视觉问题：**运行标注和声明正文同色同字号，见 R9-P3-03。 |
| **D92** 引擎条款默认折叠 | **已修复**，修订合同时有缺口，见 R9-P3-05 | **新建合同：**en/zh × 亮/暗 × 3 个宽度，都是折叠的。摘要写 “Pi / Default OS Sandbox / No network / Autonomy Standard”，点开后控件完整（`$R/d92/7a23f45/side-folded-*.png`、`side-open-*.png`、`new-*.png`）。<br>**展开后可达性：**1100 和 1440 下，自主度控件和“单向”说明在滚到底后都看得见（`reach.txt`）。<br>**键盘：**Tab 第 10 下落到摘要，焦点环是 1.5px 实线，Space 能展开。合着时，里面的控件一个都不会被 Tab 选中（`focus.txt`、`summary-focus-{light,dark}.png`）。<br>**缺口：**修订合同时也是折叠的，摘要不提 loopback 和端口，见 R9-P3-05。 |
| **D96** 对比运行时评审头保留裁决 | **部分修复** | **1024–1600 逐 8px 扫描（`$R/d96/{7a23f45,4d0b9c4}/sweep.txt`）：**<br>• zh：G-0003 和 G-0001 现在在所有宽度下都保留了裁决。修复前分别在 1024–1064 和 1024–1096 丢失。<br>• en G-0003：1024–1176 修好了。<br>• **仍有问题：**en G-0003 在 1248–1352 丢失；en G-0001 在 1024–1096 和 1248–1336 丢失（R9-P3-01）。<br>**副作用：**≤1240 时快捷键提示在所有模式下消失（R9-P3-02）。 |
| **D51/D86** zh 界面里没有 supervisor 的英文；e2e 改用 zh supervisor dump | **已修复** | `language.spec` 的 8 个路由之外，我另测了 11 个 zh 状态：两个 peek、读数、两个 accept 弹层、两个 trace、readings、Operations、Learning、Settings。<br>• supervisor 英文句子命中都是 0。<br>• 只有 G-0004 的 trace 里有 4 段拉丁文，是 agent 的原话，按设计保留。<br>证据：`$R/d86/7a23f45/log.txt`、`*.png` |
| **D20** Operations 用文字写定时 | **已修复** | 现在写 “Weekdays 02:00”，原始 cron 放在第二行。1040–1800 下没有表格越框（`tableRight` 1007 小于外框 1008）。旧版的按钮文字粘连 “OnRun” 也修好了。<br>证据：`$R/d20/7a23f45/log.txt`、`sched-*.png`、`$R/regress/sbs-operations-en-light-1040.png` |
| **D22** welcome 改成 setup 页 | **已修复** | 标题是 “Set up Tower / 开始使用 Tower”，宽 600，en 高 751、zh 高 705，在 900 高的视口里不用滚动。主按钮是 “Copy the fix / 复制修复命令”。<br>证据：`$R/d22/7a23f45/log.txt`、`welcome-*.png` |
| **D23** ID 紧跟标题 | **已修复**，带出新歧义，见 R9-P3-06 | 1040/1440/1800 × en/zh × 亮/暗，标题和 ID 的间距都是 2px。旧版在 1440 下间距 818px，ID 贴在行尾（`$R/d23/{7a23f45,4d0b9c4}/log.txt`、`overview-*.png`）。<br>新歧义见 R9-P3-06。 |
| **D58** “已验证（有保留）” | **部分修复** | **in_review 状态已修好。**以下界面都写“Verified, with caveats / 已验证（有保留）”：目标头、peek、决策行、侧栏、看板行（在“待评审”里，动作是 Review）、收件箱、评审头、验证读数、accept 弹层、命令面板。<br>• accept 弹层里有 ◆ 判断项，写明保留的内容。按钮是 “Accept anyway”，要按两次。<br>• 绿色只用在验证器的标记上。<br>证据：`$R/honesty/7a23f45/q-*.png`、`log-*.txt`<br>**accepted 状态没修好：**见 R9-P2-01。 |
| **D58** 高严重度发现冻结所有通过 | **已修复** | **本轮：**目标页是 0 项通过、3 个 ◆。peek 和验证读数一致。accept 弹层写 “none counts while a high-severity finding stands” 和 “Seal withheld”。看板和侧栏把它放在需要你处理的位置。<br>**`4d0b9c4`：**红色哨兵旁边仍有绿色 ✓。<br>对比截图：`$R/regress/sbs-goal-G-0001-en-light-1440.png`、`sbs-peek-G-0001-zh-dark-1440.png`；日志：`$R/honesty/7a23f45/log-*.txt` 的 “hold” 行 |
| **docs/12 和代码对齐** | **部分修复** | 三处仍对不上：<br>• §12.5.2 和字形表（本次提交改过的行）写“accepted 有保留时，印章实心圆缺角 `●*`”，代码没有这样做（R9-P2-01）。<br>• §12.5.2 写“已验证（有保留）+ 中性原因徽章”。代码里的保留写在 tooltip 和 accept 弹层的正文里，没有徽章。<br>• §12.4.4 列出 `--diff-comment`、`--diff-human`、`--diff-external`，代码里不存在（`$R/checks/doc12-tokens.txt`）。 |

---

## 诚实语法

| 规则 | 判定 | 证据 |
|---|---|---|
| 绿色（`--st-verified`）只给验证器的结果 | **成立** | 10 个界面 × en/zh × 亮/暗都查过。绿色只出现在三处：印章和封印的实心圆、标准条里已验证的段、in_review 已验证的圆环字形。<br>agent 的原话（台账里的声明格）是 `oklch(0.43 0.006 70)`，text-2 中性色（`$R/d91/7a23f45/style.txt`）。 |
| 琥珀 ◆ 表示“需要你 / 不作数” | **成立** | 高严重度冻结时，每个通过都变成 ◆，看板和侧栏把它归到需要你。通过但不作数也是 ◆，没有绿色。 |
| 中点只用在标准条和预算行 | **成立（两个 commit 都是）** | 10 个路由 × en/zh，文本节点和 CSS 伪元素都扫过，其他位置 0 处（`$R/dots/{7a23f45,4d0b9c4}/log.txt`）。 |
| 有保留的通过在各界面一致 | **在 in_review 成立，accepted 不成立** | 见 R9-P2-01。<br>另外两点只做记录：<br>• 10px 的缺角实心圆几乎看不出缺角，14px 圆环的缺口清楚（`$R/honesty/7a23f45/zoom-disc-q-en-light.png`、`zoom-ring-q-en-light.png`）。<br>• 有保留时，评审头的 Accept 仍是主按钮（`$R/honesty/7a23f45/boardrow.txt`）。弹层里要按两次，所以不单列问题。 |
| 高严重度冻结在各界面一致 | **成立** | 见上表。 |

---

## 回归检查

| 检查项 | 判定 | 证据 |
|---|---|---|
| 看板、收件箱、两个目标页、评审页、accept 弹层、两个 peek、Operations、Learning、Settings、新建合同：12 个状态 × en/zh × 亮/暗 × 1040/1440，两个 commit 各 96 张 | **没有意外回归** | 两个 commit 都是 0 个 pageerror，0 个元素越出窗口（`$R/regress/{7a23f45,4d0b9c4}/log.txt`）。<br>差异都能对上本轮的改动：D20、D23、D58 冻结、D92 折叠、D91 台账。<br>唯一不是有意为之的差异是 R9-P3-02。并排对照图在 `$R/regress/sbs-*.png`。 |
| 评审页 | **一处退化** | 1040 普通模式（非对比）下，快捷键提示消失了（R9-P3-02，`$R/d96/cmp-plain-en-1040-base-vs-review.png`、`$R/regress/sbs-review-G-0001-en-light-1040.png`）。 |
| 合同编辑器 | **无回归** | 预算框的 “$” 重叠在旧 commit 上完全相同（R9-P3-07）。 |
| welcome | **无回归**（布局整体重做，见 D22） | |
| Settings、Learning | **无差异** | |

---

## 问题清单（本轮）

### P0、P1

无。

### [R9-P2-01] 有保留的通过被验收后，目标页印章变回干净的“已验证”，tooltip 写“全部通过”

- **重现**
  1. 一个带 `progress.qualified` 的目标，比如 flaky 加触及测试运行器，进入 accepted 或 integrated 状态。
  2. 打开它的目标页。
- **现象**
  - 印章写 “✓ Verified @15085f2 / 已验证 @115a373”，实心圆没有缺角。
  - tooltip 写 “…on a clean checkout of @15085f2; all passed / …跑过全部机器标准并通过”。
  - 验收前，同一个目标在 10 个界面上都写“有保留”。
- **证据**
  - `$R/honesty/7a23f45/q-accepted-goalhead-{en,zh-CN}-{light,dark}.png`
  - `$R/honesty/7a23f45/log-*.txt` 的 “accepted goal head” 行
- **原因**
  - `apps/desktop/src/views/GoalPage.tsx:200` 是 `<Stamp pin={pin()} size="m" tampered={notEvidence(g())} />`，没有传 `qualified`。其他 7 处 Seal/Stamp 都传了。
  - supervisor 计算 `qualified` 时不看状态（`crates/tower-store/src/summaries.rs:271`），所以真实数据会走到这里。
- **为什么是 P2**
  - 验收后的目标页是这次工作的长期记录。现在它读作“干净地全部通过”，和本次提交改过的 docs/12 §12.5.2、字形表（accepted `●` / `●*`）直接矛盾。
  - 不定为 P1：验收时弹层已经明确写了保留，并且要按两次。
- **修正目标**
  - 传入 `qualified={caveats(g())}`。
  - 在 `honesty.spec` 的 “a counted pass with caveats says so on every seal” 里加一个 accepted 状态的用例。

### [R9-P3-01] 对比运行时，en 评审头的裁决仍会在两个宽度段消失（D96 修得不完整）

- **重现：**en，评审页，切到 Compare runs，看统计行里的封印和标准条。
- **现象**
  - G-0001 在 1024–1096 和 1248–1336 丢失裁决，G-0003 在 1248–1352 丢失。只剩 “All changes / Last turn / Compare runs… / 两个 Base 选择框”。
  - 1040 是 `minWidth`，G-0001 在这里仍然没有裁决，正是 R8-P3-04 的修正目标。
- **证据**
  - `$R/d96/7a23f45/sweep.txt`
  - `$R/d96/7a23f45/sweep-G-0001-en-1024.png`、`sweep-G-0003-en-1248.png`
  - 对照：`$R/d96/4d0b9c4/sweep.txt`
- **原因：**让位规则写在 `@media (max-width: 1240px)` 里（`app.css` 约 2790–2814 行：藏起第一组统计、选择框限宽 128px）。1241–1352 正好不受这些规则管，而 G-0001 的裁决比 G-0003 长。
- **修正目标**
  - 让裁决在整个宽度范围里都是最后一个被去掉的。例如按 `.review-head` 的容器宽度判断，而不是按视口宽度；或者让选择框继续收窄。
  - e2e 加上 G-0001，并逐档扫描 1024–1400。

### [R9-P3-02] ≤1240 时，评审头按钮的快捷键提示在所有模式下都被藏起来，也没有 tooltip

- **重现：**1040，评审页，普通模式（不对比）。
- **现象**
  - `4d0b9c4` 显示 “Request changes C” 和 “Accept ⌘⇧↩”，本轮两个提示都没有。
  - 按钮没有 `title` 属性（`$R/d96/7a23f45/log.txt` 里 `kbd: []`、`btnTitles: ["",""]`）。
- **证据：**`$R/d96/cmp-plain-en-1040-base-vs-review.png`、`$R/regress/sbs-review-G-0001-en-light-1040.png`
- **原因：**`.review-head > .btn .kbd { display: none; }` 写在 ≤1240 的媒体查询里，没有限定在对比模式下。
- **修正目标**
  - 只在 `.comparing` 下藏提示。
  - 或者藏的时候给按钮补上带快捷键的 title。

### [R9-P3-03] 台账里的运行标注和 agent 的声明同色同字号，读起来像 agent 自己写的

- **现象**
  - “npm test passes locally runs 1, 2”：`.meta` 标注和声明正文都是 `oklch(0.43 0.006 70)`、12px、常规字重。
  - 前面的 “C1” 用的是 t3。
- **证据：**`$R/d91/7a23f45/style.txt`、`zoom-en-light.png`、`zoom-zh-light.png`
- **影响：**这是 Tower 加的注释，不是 agent 的话。按诚实语法，两种声音应该能区分开。
- **修正目标：**改用 t3 或单独一格，和 “C1” 同一个层级。

### [R9-P3-04] 已经写了“源码触及测试运行器”的保留，同一条标准下又写“断言未被改动”

- **现象**
  - 我按真实哨兵名构造数据：`source_touches_tests` 和 `runner_patched`，supervisor 把它们归为 `test_machinery`。
  - 保留写 “code reaches into the test runner / 源码触及断言库、测试框架或模块加载”。
  - 每条标准行下又写 “assertions untouched / 断言未被改动”。
- **证据：**`$R/honesty/7a23f45/q2-goal-en.png`、`q2-verify-{en,zh-CN}.png`、`log2-*.txt`
- **原因：**`apps/desktop/src/views/goal/ext.ts:125` 的 `GUARD_RE = /assertion|guard|source_patches_tests/` 不包含 supervisor 归入 test_machinery 的另外两个哨兵名。
- **修正目标：**让 `GUARD_RE` 和 `summaries.rs` 里 test_machinery 的哨兵清单一致。或者在有 test_machinery 保留时，不写“断言未被改动”。

### [R9-P3-05] 修订合同时，折叠摘要不提已经打开的 loopback 和端口

- **重现**
  1. 选一个合同：`network: false`、`ports: [5432, 6379]`、`loopback_open: true`。
  2. 在目标页按 Shift+E 修订。
- **现象**
  - 折叠是关着的。
  - 摘要写 “Pi / Default OS Sandbox / No network / Autonomy Autonomous”。
  - 只看摘要，会以为完全断网。
- **证据：**`$R/d92/7a23f45/amend.txt`，读的是 DOM。截图因为定位器超时没拍成，见“没能覆盖的”。
- **原因：**摘要只有 engine、model、sandbox、network、autonomy 五项（`ContractEditor.tsx`），也没有处理 thinking 和 escalation。
- **修正目标**
  - 设置过的非默认项都进摘要，例如 “loopback 5432, 6379”。
  - 或者修订时，如果有非默认项，就默认展开。

### [R9-P3-06] Identity 列现在只放别的目标的 ID

- **现象**
  - ID 挪到标题后面以后，G-0001 行的 Identity 列只剩 “◇ G-0003”，也就是重叠的那个目标。
  - 这一列以前放的是本行自己的 ID，扫读时容易把 G-0003 当成本行。
  - 目标页的写法是 “◇ Overlaps G-0001”，不会混。
- **证据：**`$R/honesty/7a23f45/q-overview-en-dark.png`、`$R/regress/sbs-overview-en-light-1440.png`
- **修正目标：**写成 “Overlaps G-0003 / 与 G-0003 重叠”，或者移到 Live 列。

### [R9-P3-07] 合同编辑器预算框的 “$” 压在第一个数字上（既有问题）

- **现象**
  - Soft cap 和 Hard cap 显示为 “$5”“$8”，符号和数字重叠。我看的是 en 1440 亮色。
  - 旧 commit 完全相同。本轮引擎条款折叠后，预算块上移到折叠线以上，更显眼了。
- **证据：**`$R/d92/7a23f45/zoom-dollar.png`、`$R/d92/4d0b9c4/budget-block.png`、`$R/regress/zoom-dollar-{base,review}.png`
- **修正目标：**给前缀留出 padding，或者把 “$” 放到输入框外面。

### 只做记录，不计入

- 10px 的缺角实心圆在看板和侧栏上几乎看不出缺角，要靠旁边的文字。
- 有保留时，评审头的 Accept 仍是主按钮。
- `design-evidence/packaged-app/*.webp` 是 833×521 的低清图，没法用来核对 1px 级的说法。`contract-engine-folded-D92.webp` 里有鼠标指针，标题栏显示 “1 error”（`$R/evidence-*.png` 是我转出来看的副本）。

---

## 新增 e2e 是否测到了它声称的东西

- **数量**
  - webkit 项目的测试标题从 407 条变成 429 条：新增 22 条，改名 1 条，没有删除（`$R/checks/e2e-titles-wt-review9{,-base}.txt`）。
  - 唯一新增的 skip 是 `test.skip(!FIXTURES_ZH…)`，没有 zh fixtures 时才跳过，属于有条件的跳过。
- **在 `4d0b9c4` 上跑新的 6 个 spec 和新的 `rich.ts`、`tauri.ts`：**19 条失败，210 条通过（`$R/checks/new-tests-on-4d0b9c4.log`）。失败原因都对得上要修的问题：
  - 1040 下 ID 和标题间距不是紧跟的。
  - 没有 `clause-fold`。
  - 标准条写 “Verified 0/3 · 1 doesn't count”，测试期望 3 项不作数。
  - welcome 还是旧标题。
  - 高严重度发现下仍有 2 个通过。
  - 台账 4 行，不是 2 行。
  - 字形读作 “Ready to accept”，不是 “Verified, with caveats”。
  - 开关不可见。
  - 没有 `.ops-when`。
  - 1024 下裁决右缘越界：en 904.6 > 754.4，zh 861.9 > 826.5。
  - 收件箱卡写 “1 doesn't count”。
  - 琥珀段 1 段，期望 3 段。
- **`language.spec` 在旧 commit 上也通过。**这项修复改的是 e2e 用的数据（zh supervisor dump），不是前端代码，所以它是守卫测试，证明不了旧 commit 有错。这符合修复的性质，不算缺陷。
- **覆盖缺口（我都另外实测过）**
  - D96 只测 G-0003、≤1240，所以漏掉了 R9-P3-01。
  - D58 只测 in_review，所以漏掉了 R9-P2-01。
  - D92 没测修订合同和 loopback，所以漏掉了 R9-P3-05。
  - D91 只数行数，没检查运行标注和声明能不能区分，所以漏掉了 R9-P3-03。

## 工程检查（日志在 `$R/checks/`）

| 检查 | 结果 | 日志 |
|---|---|---|
| `pnpm check/test/build` | pnpm 12.6.0 的自动安装报 “workspace hoist directory is not a real directory”，原因是 node_modules 是 symlink。<br>所以改为直接调用同样的二进制，和 package.json 脚本等价。 | `pnpm-attempt/` |
| `tsc --noEmit` | 通过，EXIT=0 | `tsc.log` |
| vitest | 43 个文件，230 个测试，全部通过 | `vitest.log` |
| vite build | 通过 | `build.log` |
| bundle-budget | 通过。<br>启动 54,859 / 65,536，按需 105,190 / 110,592，**合计 160,049 / 163,840**（余 3,791 B）。<br>目标页 11,573 / 12,288，worker 197,901 / 262,144。 | `bundle-budget.log` |
| line-limit | 通过，EXIT=0 | `line-limit.log` |
| Playwright 全量，按规定的命令（端口 1441） | 348 通过，**5 失败**，76 跳过。<br>5 条失败都在 smoke.spec，原因是字体请求被拒（403）：Vite 的 `fs.allow` 不放行 symlink 过来的 node_modules，是环境问题。<br>旧 commit 上同样失败 4 条。 | `e2e-full.log`、`smoke-on-4d0b9c4.log` |
| Playwright 全量，用能提供字体的 vite 配置 | **353 通过，0 失败**，76 跳过（shots 测试没设 SHOTS），1.4 分钟。<br>配置在 `$R/tools/vite.review.config.mjs`，只多放行了一个字体目录。 | `e2e-full-fonts.log` |
| Playwright 全量，跑在生产构建上（vite preview，端口 1443） | 350 通过，3 失败，76 跳过。<br>3 条失败（contract skeleton、resilience、startup）都依赖开发服务器的模块路径，比如 `/src/views/*.tsx`、`/locales/*.ts`，只能在开发模式下跑，不是构建缺陷。<br>en/zh 的语言包在构建产物里都能加载。 | `e2e-full-on-build.log` |

## 没能覆盖的

- **原生应用：**按规则没有运行打包好的应用，也没有跑 cargo。看到的都是 WebKit 加 stub IPC 的结果。
- **真实 supervisor：**没有让真实 supervisor 产生有保留或高严重度冻结的状态，数据都是注入 fixture 的。对应的 supervisor 路径（`summaries.rs`、`events.rs:318`）我读过源码。
- **accepted 有保留的其他界面：**只看了目标页头。peek 和看板行的代码会传 `qualified`，但我没逐一截图。
- **修订合同的截图：**定位器超时，没拍成。只有 DOM 数据。
- **Tab 顺序：**WebKit 默认的 Tab 会跳过按钮和链接，所以只验证了输入框和折叠摘要。
- **其他：**
  - shots.spec 没生成（76 跳过），perf 项目没跑，detector 没跑（不在本轮要求里）。
  - 没做 VoiceOver 实测，只读了 aria-label。
  - D96 扫描只到 1600。回归截图只有 1040 和 1440，1800 只在 D20/D22/D23/D91/D92 的专项里覆盖。
  - R8-P3-01 和 R8-P3-02 不在本轮清单里，没有单独复核。

## 验收条件

**通过。**没有必须先解决的问题。建议按这个顺序修：

1. **R9-P2-01**：一行 prop，加一个 accepted 状态的 e2e。
2. **R9-P3-01 和 R9-P3-02**：都在评审头，可以一起改。e2e 补上 G-0001，并做 1024–1400 的扫描。
3. **R9-P3-03 到 R9-P3-06**：各自只需一处小改。
4. **R9-P3-07**（既有）：可以和 docs/12 剩下的三处不一致一起排期。