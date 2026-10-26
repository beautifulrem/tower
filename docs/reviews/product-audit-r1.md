# Tower 产品审计 · 第 1 轮

> 日期：2026-10-26　审计对象：`main` @ `df01d91`（v0.1.0）　评分表：`docs/reviews/product-rubric.md`（D1–D17）
>
> 视角：中文开发者，每天同时跑 3–5 个 Agent 任务，日常用 Claude Code、Codex、Cursor、Conductor。既当真实用户，也当工程评审。打分从严：**95+ 的意思是“我会毫无保留地推荐给同事，并且看不到任何实质性要修的地方”**。

---

## 0. 审计方法与证据

| 类型 | 内容 |
|---|---|
| 截图 | `docs/reviews/product/r1/` 共 13 张，逐张查看。另用 `tools/screenshot.sh` 补拍 2 张真实模型数据（`TOWER_HOME=/tmp/tower-live/home`）：`goal/G-0002`、`review/G-0002`。这两张存放在 `/tmp/audit-live-goal.png`、`/tmp/audit-live-review.png`，没有写入仓库 |
| 代码 | 通读 `apps/desktop/src` 的全部视图与组件、`styles/tokens.css`、`base.css` 和 `app.css` 的相关部分、`src-tauri/src/lib.rs`、`tauri.conf.json`、`capabilities/`。读了 `crates/tower-supervisor` 中的 `verify.rs`、`actions.rs`、`run.rs`（后半）、`sandbox.rs`、`lib.rs`（存储与注入部分），以及 `crates/tower-core/src/sentinel.rs`、`extensions/tower-goal/{index,policy}.ts` |
| 测试 | `cargo test --workspace` 全部通过，共 121 个：tower-core 64、tower-git 3+3、tower-pi 4+3、tower-store 13、tower-supervisor 14 + flow 8 + real_pi 1（本机装有 pi，耗时 11 秒）、tower-verify 8。`tsc --noEmit` 0 错误。`node --test extensions/tower-goal/policy.test.ts` 8 个通过。**前端 0 个测试，Tauri 层 0 个测试** |
| 沙箱实测 | 按 `sandbox.rs` 的规则写了一份等价的 Seatbelt 配置，在 `/tmp` 下做无害探测：网络、钥匙串服务能否连上、主目录其他文件能否读取。没有读取任何凭据内容，探测目录用完已删 |
| 竞品 | 已有调研 `research/harness-gui-landscape-2026.md`、`research/ui-aesthetics-2026.md`，加上本轮的网络检索（链接附在第 4 节）。凡是只引用已有调研、本轮没有复核的，都注明“见已有调研” |
| 仓库状态 | `gh repo view`：仓库是 **PRIVATE**，0 个 release，0 个 tag |
| 并发改动 | 审计开始时工作区是干净的。审计期间，另一个进程在工作区留下了**未提交的国际化改动**：53 个文件，新增 `apps/desktop/src/lib/i18n.ts`、`crates/tower-core/src/i18n.rs`。本报告以已提交的 `df01d91` 为准。我在改动后的工作区里复核了关键结论：`read` 仍无门禁（`index.ts` 只处理 edit、write、bash）；后台任务中的 `let _ = pause(...)` 仍在；收件箱的 `1–9` 仍直接作答。这三条依然成立。D17 和 D13 中关于“中文硬编码”的结论，可能被这批进行中的改动部分解决，下一轮需要复评 |

### 0.1 先说证据本身的问题（严重）

1. **`10-goal-real-model.png` 拍的不是 Tower。** 画面是 Otty 终端里一个 Claude Code 会话（标题“服务器检查”），内容是 fail2ban 和 sshd 加固。图中明文写着用户的公网 IP `14.153.73.79`、服务器加固方案和撤销方法。这张图已经提交进仓库。
2. **`02-goal-rework.png` 被外部浮层遮住了一块。** 与 `assets/screenshots/goal.png` 的 md5 完全相同（`fda638b9…`），也就是 **README 首屏引用的“Goal page”图**。右上角盖着 Otty 的会话浮层，标题区被挡住，同样泄露了上面那段服务器会话的内容。
3. 结论：本轮“真实模型产出的目标”这一项证据作废，以我补拍的 `/tmp/audit-live-*.png` 为准。**这两张图要立即从仓库和 Git 历史中移除**，见 D12、D15。

---

## 1. 分数总览

| # | 维度 | 分数 | 一句话 |
|---|---|---|---|
| D1 | 上手与引导 | **60** | 欢迎页的环境检查做得好，但仓库是私有的、没有 release，要先装 Pi 并在终端登录，也不检查 Pi 版本 |
| D2 | 核心流程完整度 | **68** | 从目标到推送、开 PR 端到端可走通；缺回退、缺并行冲突检测，已结束的目标找不到，删除行不能批注 |
| D3 | 可信度与诚实 | **80** | 全场最强。干净检出重跑、事实与说法分开、哨兵、验收前检查快照，都是真的；但仍有几处“看起来通过”的漏洞 |
| D4 | 注意力管理 | **68** | 收件箱、角标、只在后台通知，方向对；计数口径不一致，1–9 热键一键就能放弃目标，通知点不进具体目标 |
| D5 | 评审体验 | **60** | 风险单元、已看标记、草稿、自上次评审都有；diff 本身落后主流一代：没有词级高亮、不能展开上下文、删除行不能批注 |
| D6 | 视觉美学与原创性 | **64** | 克制、暖灰、状态色有纪律；但信息密度低、图标是拼凑的 Unicode、说法标记三重冗余，整体是“干净的开发者工具默认样” |
| D7 | 信息架构与布局 | **66** | 页面职责清楚；目标页不按状态裁剪内容，概览顶部叠了三条横条，评审页没有返回按钮 |
| D8 | 交互细节与键盘 | **70** | 键盘覆盖广、照顾了输入法、用原生菜单；单键就能改变状态且无确认，确认框是网页式的，命令面板不支持拼音 |
| D9 | 文案与中文排版 | **70** | 语气工程化、具体；自动标题从中间截断，中文标题生成的分支名一律是 `goal`，术语对新手不友好 |
| D10 | 性能与响应 | **72** | Tauri、Solid、高亮放在 Worker 里，单元上限 300 行，思路正确；轨迹没有虚拟化，每条事件都要复制整个数组，也没有任何实测数据 |
| D11 | 稳定性与错误处理 | **68** | 退出与崩溃恢复有设计；后台任务里的错误被 `let _ =` 吞掉，可能让目标卡死，预算只在一轮结束时检查 |
| D12 | 安全与隔离 | **42** | Agent 的 `read` 工具既不在沙箱里也没有门禁；网络全开，钥匙串服务可达；与欢迎页和 SECURITY.md 的承诺相矛盾 |
| D13 | 代码架构与可维护性 | **74** | crate 分层干净，核心是纯函数状态机，类型由 ts-rs 生成；界面逻辑靠匹配中文文案，评审状态分散存放，文档与代码不一致 |
| D14 | 测试与质量保障 | **64** | Rust 侧扎实，有真实 Seatbelt 和真实 Pi 的测试；前端 0 测试，CI 大概率跳过 real_pi，没有 UI 回归 |
| D15 | 开源项目成熟度 | **52** | 文件齐全；但仓库是私有的、没有 release，README 的安装路径不通，首屏截图泄露隐私，实现文档与 CHANGELOG 互相矛盾 |
| D16 | 竞争力 | **64** | “事实和说法分开”是独有的护城河；但只支持 Pi 引擎、只支持 macOS、没有云端和移动端、没有预览或终端，日常可用性落后 |
| D17 | 可访问性与国际化 | **38** | 只有中文界面，中文字符串硬编码在前后端两侧；状态图形对读屏不可见，浅色主题行号对比度约 2.4:1 |

**平均 64.7。没有一个维度达到 95，离通过线差得很远。** 最需要先修的是 D12（安全承诺与实现不符）和 D15（证据与发布）。这两项都和“诚实”这个产品立身之本直接冲突。

---

## 2. 逐维度评审

### D1 上手与引导 · 60

**发现**

1. **安装路径不通。** README 第 34 行写“Download the latest build from Releases”，但仓库是私有的，0 个 release，0 个 tag。外部用户第一步就会失败。release 工作流（`.github/workflows/release.yml`）只产出草稿，而且没有公证，首次打开要右键。
2. **欢迎页质量不错。** 见 `09-welcome.png`：一句话说清价值主张，三条原则，然后是环境检查（Pi、模型数、git、沙箱）。每个失败项都给出可复制的修复命令（`Welcome.tsx` 中 `Check.fix`），最后一个“添加一个 git 仓库”按钮。这比 Claude Code 和 Codex 的首屏更诚实。
3. **前置步骤全在应用外完成。** 要先 `npm i -g @earendil-works/pi-coding-agent`，再在终端运行 `pi` 并 `/login`。如果模型来自扩展（例如 ClinePass），还要去设置页手填扩展入口文件路径、在登录 shell 里 export key（README 第 43 行）。我的人设平时用 Claude Code 和 Codex，等于要迁移到一个新的引擎生态。
4. **不检查 Pi 版本兼容性。** `docs/00` 写的是“固定版本 1.2.0（精确）”，欢迎页对 `Pi 1.4.0` 直接打绿勾（`09-welcome.png`）。`lib.rs:339` 只读取了版本号，没有比较。
5. **第一个目标怎么写没有引导。** 快速路径依赖项目里能检测到测试命令（`Overview.tsx` 的 `quick-warn`）；合同编辑器要手写验收命令、范围 glob、预算。设计中的“塑形（Agent 起草合同）”尚未实现（`docs/17` §17.5）。没有示例项目，也没有在应用内“试一试 demo”的入口；demo-engine 只能从命令行启动。
6. 环境检查中“其他问题”的过滤写成 `!p.includes("沙箱") && !p.includes("pi") && !p.includes("git")`（`Welcome.tsx:107`）。任何含 `pi`、`git` 子串的问题（例如 “api”“pipe”）都会被吞掉，不显示。

**修复（按影响排序）**

1. 公开仓库并发布签名、公证过的 v0.1.0 DMG，同时提供 Homebrew cask。在此之前，README 第一屏改成“从源码构建”。
2. 欢迎页加“试用 demo 项目”按钮：一键生成 `make_demo_repo.sh` 的仓库，用 demo-engine 跑一个目标，30 秒内让用户看到从“自称完成”到“已验证”再到“评审”的全过程，不需要任何凭据。
3. 检查 Pi 版本：低于支持范围的标为 ■ 并给出 `npm i -g @earendil-works/pi-coding-agent@<范围>`；高于已测版本的标为 ◇“未验证的版本”。
4. 在应用内完成登录：检测到 0 个模型时，提供“在终端中运行 `pi /login`”的按钮（打开 Terminal 并预填命令），或者直接引导填写 API key 环境变量。
5. 第一个目标用向导完成：选仓库 → 检测测试命令并**在 base 上试跑一次** → 写一句话 → 开始。
6. 把基于字符串的问题过滤改成结构化的 `problem.kind` 枚举。

---

### D2 核心流程完整度 · 68

**发现**

1. **主链路完整。** 合同 → 准备卫星克隆 → 运行 → `submit` → 拍快照 → 干净检出验证 → 自动返工或待验收 → 评审 → 验收（写本地分支）→“推送并开 PR”（`GoalPage.tsx:230`，用 `confirm` 二次确认）→ 每分钟检测是否已合入。`tests/flow.rs` 的 8 个端到端测试覆盖了主流程、返工、提问、停下未提交、暂停、继续、放弃。
2. **已结束的目标在侧栏里无法打开。** `Sidebar.tsx` 中“已结束 N”只是一行标题，不可点击，只能靠 ⌘K 搜 ID。
3. **并行目标之间没有冲突检测。** 3–5 个目标从同一个 base 出发、改同一个文件，Tower 只在验收时各写一个分支，冲突要到用户自己合并时才暴露。设计里的冲突雷达和合并队列都未实现（`docs/17` §17.5）。这正是我这个人设每天会遇到的场景。
4. **没有回退和检查点 UI**（`docs/17` §17.4 承认）。返工跑坏了，只能放弃或手动处理。
5. 评审只能对新行批注：`DiffRow` 的点击要求 `props.l.new_no` 存在（`Review.tsx:398`），**删除行不能批注**。可“你为什么删了这段”恰恰是最常见的评审意见。
6. 目标页不随状态裁剪：在 `in_review` 状态下仍显示“接下来：Agent 还没有说明下一步”和预算条（`/tmp/audit-live-goal.png`），而这时真正的下一步是“你来评审”。
7. 推送之后没有 PR 状态（CI 结果、评审评论），也没有“把 CI 失败发回 Agent”的闭环。Claude Code 的 Auto-fix 和 Conductor 的 Checks 都已经有了（见第 4 节）。

**修复**

1. 冲突雷达的最小版本：两个进行中的目标触及同一文件时，在两张卡片上标 ◇“与 G-000x 改动重叠”；验收第二个时，用 `git merge-tree` 预判冲突。
2. 侧栏的“已结束”可以展开，或者新增一个“历史”视图（⌘3）。
3. 删除行允许批注，锚定到 `old_no`，发给 Agent 时写成 `path:old Lnn（已删除）`。
4. 目标页按状态裁剪区块：待验收时“接下来”改为一行 CTA“评审 2 个单元 · R”，预算折叠成一行 meta。
5. 回退：在“运行”区块的每个 R-xx 行后加“回到这次运行开始时的快照”。
6. 推送后轮询 `gh pr checks`：失败时生成“CI 失败”决策卡，提供“发回 Agent”选项。

---

### D3 可信度与诚实 · 80

**发现**

1. **核心机制是真的，而且做得严谨。** `verify.rs:84-202` 的流程是：pin 快照 → 对 base 到 pin 的 diff 跑哨兵 → 在 pin 的干净检出中跑准备命令和每条机器标准（套 Seatbelt，去掉凭据，`CI=1`）→ 每个结果记为 `CriterionResult` 事实。准备失败或命令无法运行算环境错误（`EnvError`），暂停，不返工。验收时（`actions.rs:205-247`）**重新拍快照，与已验证的 pin 比对**，不一致就拒绝。这是同类产品里唯一真正做到“验证的就是将要提交的”。
2. **视觉上的诚实语法有效。** “Agent 称”标签 + 虚线框的“观测 通过（Agent 环境，未计入已验证）”+“⚙ 通过 · 708ms @a4a90b2”这三种外观一眼就能分开（`02`、`03` 截图）。账本（说法 ↔ 事实）中“C3 本地 npm test 通过 → 无依据”的判定很有价值（`03-goal-review-ready.png`）。
3. **哨兵是字符串匹配，容易绕过。** `sentinel.rs` 的 `SKIP_MARKERS` 只认 `.skip(`、`.only(`、`xit(` 这类字面量。以下写法都识别不到：
   - Node 内置 test 的 `test("x", { skip: true }, …)`
   - `it.skipIf(` 能被 `.skip` 前缀碰巧命中，但 `if (false)` 包住断言就不行
   - 直接改断言期望值，把 `assert.equal(total, 17)` 改成 `16`
   - 在测试里 `return;` 提前退出
   - 在 `package.json` 里给测试脚本加 `--testPathIgnorePatterns`，只有当它不在 readonly 里时才能被“改了测试命令”检出

   “断言减少”只是计数。对一个以“抓住看起来通过的坏结果”为卖点的产品，这一层还很薄。
4. **标准本身可能毫无区分度。** 真实模型的合同 C1 是 `npm test && grep -q taxRate test/cart.test.js`（`/tmp/audit-live-goal.png`）。`grep` 那一半，Agent 只要在测试里写个注释就能满足。Tower 不检查一条标准**在 base 上是否本来就通过**。如果 base 上就是绿的，这条标准对“完成”没有任何证明力。
5. **验收时，未确认的假设会被静默撤回。** `accept()` 最后调用 `withdraw(goal, &[ReviewReady, Assumption], "已验收")`。验收面板（`Review.tsx` 中的 `AcceptPanel`）只列人工标准，不列“还有 1 条假设没确认”，也不列 severity 2 的哨兵。
6. **文档自相矛盾，削弱可信度。** `docs/17` §17.4 写“哨兵：未实现”“墙钟只显示，不触发暂停”；但 CHANGELOG 和代码（`verify.rs:111`、`run.rs:316`）都已经实现。一个以诚实为卖点的产品，自己的实现说明却与事实不符。
7. 管道命令观测永远成功的问题（`docs/17` §17.6）处理得体：观测永远不着色。

**修复**

1. **“红 → 绿”证据：** 第一次验证时，同时在 base 的干净检出上跑一遍机器标准。只有在 base 上失败、在 pin 上通过的标准才标为“区分性证据”；base 上本来就通过的，标为 ◇“这条标准在改动前就通过，不能证明完成”。这一项竞品没有，而且只需要多跑一遍。
2. 哨兵升级为 AST 级或语言感知：JS/TS 用 `@babel/parser` 统计 `test`/`it` 调用数和 `assert`/`expect` 调用数，比较 base 与 pin；同时识别 `{ skip: true }`、`if (false)` 和提前 `return`。Python 用 `ast` 统计 `assert` 数。
3. 验收面板列出全部未决项：未确认的假设、severity 2 的哨兵、未看过的单元。允许验收，但要逐项勾选“我知道”。
4. 合同校验加一条：标准命令中出现 `grep`、`test -f`、`echo` 这类与测试无关的片段时，提示 ◇“这一段只检查文本，不检查行为”。
5. 修正 `docs/17` §17.4 和 §17.6，让文档与代码一致。

---

### D4 注意力管理 · 68

**发现**

1. **注意力阶梯基本正确。** 只有 Question、Approval、Paused、Stalled 会发系统通知，而且只在窗口不在前台时发，每条最多一次（`src-tauri/src/lib.rs:35-58`）。其余变化只更新界面。概览顶部的“下一件”、`g` 和 `⌘⌥↓` 循环跳转“下一个需要你的目标”，都借鉴了 Codex 和 Conductor 的做法，做得对。
2. **计数口径不一致。** 侧栏顶部“需要你 4”，下面分组“需要你 1”（`01-overview.png`）。Dock 角标同样计入了待验收项（`set_badge_count(items.len())`）。`ui-aesthetics-2026.md` §4.2 已经指出过，至今没改。
3. **1–9 热键会一键执行破坏性操作。** `Inbox.tsx:21` 中，按数字直接调用 `api.answer(it.id, it.options[n])`。已暂停卡片的选项 2 是“放弃这个目标”（`04-inbox.png`），**按一下 `2` 就放弃，没有确认**。而在目标页，同一个操作要走 `confirm()`（`GoalPage.tsx:206`）。
4. **通知标题是 `G-0003 需要你`。** 用户记不住编号。点击通知只会激活应用，不会跳到该目标（插件没有设置 action 或 deep link）。
5. **假设卡的“写给 Agent 的话”是语义陷阱。** 在假设卡上输入文字并点“发送”，后端 `actions.rs:68-70` 会把它当作**驳回**（`approved = response == APPROVE`，否则就是驳回附带说明）。而点“批准”时又带不上文字。界面没有任何提示。
6. 没有免打扰、稍后提醒、按目标静音；收件箱没有“全部待验收”的批处理。

**修复**

1. 拆开口径：侧栏显示“需要你 1”（阻塞项）+ 另一行“待验收 2”；Dock 角标只计阻塞项。
2. 破坏性选项（放弃、覆盖哨兵）不分配数字热键，或者按下后进入 2 秒的“再按一次确认”状态，按钮上显示倒计时。
3. 通知标题用目标标题（截断到 24 字），正文写种类和问题。注册通知点击回调后跳到 `goal/<id>`；Tauri 的 notification 插件不支持时，就在应用激活时打开最近一条未读。
4. 假设卡改成“批准 / 驳回”两个按钮各自带上文本框的内容，发送按钮去掉。或者把发送按钮文案改为“驳回并说明”。
5. 设置中增加“专注时段”（只发 urgency 0 的审批）和逐目标静音。

---

### D5 评审体验 · 60

**发现**

1. **结构上的设计领先：** ≤300 行、按风险排序的评审单元，哨兵横幅，“已看”标记在 diff 改变后自动失效（`reviewState.ts` 的 `fileHash`），草稿批注跨重启保留，“全部改动 / 自上次评审”切换，⌘ 点行号在编辑器中打开，批注汇总后作为转向发回 Agent。这一套比 Claude Code 的 Changes 卡完整。
2. **diff 本身落后一代：**
   - **没有词级高亮。** `--diff-add-word`、`--diff-del-word` 在 `tokens.css` 中定义了，但全仓库没有一处使用。`05-review.png` 里唯一的改动是 `+` 变成 `*`，一个字符，评审者要逐字比对两行才能看出来。
   - 只有统一视图，没有并排视图。
   - 不能展开上下文：hunk 外的代码看不到，只能跳去编辑器。
   - 不能查看整个文件。
3. **批注入口难以发现。** 只有点**行号**才能批注，而行号是 11.5px、`--text-4` 颜色（`app.css:1480`），浅色主题对比度约 2.4:1。悬停时没有“+”提示，只有 `title` 属性。批注写完后不能编辑，只能在提交面板里删掉。
4. **评审状态存放在 `localStorage`**（`reviewState.ts`），键是 `tower.viewed.G-0001`。不同 `TOWER_HOME` 下的 `G-0001` 会**互相串用**已看标记和草稿（demo 数据与真实数据就是这样）。这些状态也不在 SQLite 里，违背了 README 第 89 行“The supervisor owns all state”。
5. **单元列表的视觉 bug。** 单元标题显示目录 `src/`，文件名 `cart.js` 另起一行，而且目录比文件名多缩进了约 22px（空的 `.unit-risk` 14px + 8px gap）。看起来像一条断开的路径（`05`、`13` 和 `/tmp/audit-live-review.png`）。
6. 验收面板的“你已查看 X/Y 个评审单元”算法是 `seen().size + (unit() ? 1 : 0)`（`Review.tsx:211`），把当前单元算作已看，会多算 1。
7. 评审页没有显示验证输出和轨迹证据。要看某条标准的输出，得回到目标页点 FactChip。

**修复（含具体尺寸）**

1. 词级 diff：把相邻的 del/add 行对做 token 级 LCS，变化片段包上 `<mark class="w-add|w-del">`，背景用已定义的 `--diff-*-word`，2px 圆角，不加边框。
2. hunk 之间插入 24px 高的行“↕ 展开 20 行”（11px text-3），点击后从 pin 取上下文。文件头加“整个文件”切换。
3. 宽度 ≥1280px 时提供并排视图（`⌥V` 切换），偏好按目标记住。
4. 批注入口：行号列加宽到 44px；悬停整行时，在新行号左侧显示 16×16 的“+”按钮（`--bg-selected` 底，`--text-1` 字）。行号颜色从 `--text-4` 改成 `--text-3`。删除行也可以批注。已添加的批注可以点击编辑。
5. 把已看标记、草稿和上次评审的 pin 搬进 SQLite（`review_state` 表），以 goal 和 pin 为键。
6. 单元列表改成单行：`cart.js`（13px、`--text-1`、mono）+ 右侧 `src/`（11.5px、`--text-3`）+ 行数；风险标记放在行尾，没有风险就不占位。
7. 评审页顶部的验证两轨（已验证 2/2）可以点开，弹出每条标准的输出尾部。

---

### D6 视觉美学与原创性 · 64

**总体判断：** 经过“quiet-cockpit”那一轮，`ui-aesthetics-2026.md` 列出的大部分“AI 征兆”已经修掉：紫色强调色去掉了，焦点改成 1.5px 中性实线，`cursor: default`，原生 select 换成原生菜单，卡片圆角统一为 6px。底子是干净的。但它现在给人的感觉是“一个有品位的工程师做的、干净的开发者工具”，**还不是 Linear、Raycast、Things 那种一眼认得出的作品**。

**发现**

1. **信息密度低，留白没有设计。** 在 1440×900 的窗口中：
   - 概览只有 4 张卡，占不到内容区的 45%，右侧 40% 是空的（`01`、`11`）。每组 1–2 张卡，固定宽 372px，第三列永远空着。
   - 评审页一个 6 行的 diff 下面有约 600px 空白（`05`、`13`）。
   - 合同编辑器左栏和右栏的底部都留着大块空白，而“范围围栏”却被挤到首屏以下（`06`）。

   对一个同时监督 3–5 个任务的人来说，这是在浪费屏幕。
2. **图标是拼凑的 Unicode。** `＋`（全角）、`▦`、`⋯`、`←`、`⚙`、`◇`、`■`、`◆`、`▪▪`、`✓`、`✕`、`⟲`、`○✓` 来自不同字体，基线和笔画粗细都不一致：侧栏的 `＋` 明显比 `▦` 粗。`⚙`（齿轮）被用来表示“Tower 测得的事实”，普通用户会读成“设置”。这是现在最像“临时拼起来”的地方。
3. **生命周期图形的语义有违直觉。** “已验证 / 待验收”用的是**绿色实心三角 ▲**（`Glyph.tsx` 中 △ → ◭ → ▲ → ●）。在 macOS、ISA-101 和大多数工业 HMI 中，三角形表示警告。侧栏里一列绿三角，第一眼读成“有警告”。
4. **说法标记三重冗余。** 每一行是 `┆ Agent 称　原因 · 文本`（`02`、`03`）：虚线竖条、“Agent 称”标签、种类标签，三层都在说同一件事。当一个区块全是说法时（“原因”“接下来”），每行重复的“Agent 称”变成了噪音。
5. **章节节奏单调。** 目标页的每个区块都是“14px/500 标题 + 1px 上边线 + 16px 内边距”，没有主次。“验收标准”（最重要）和“运行”（最次要）看起来一样重，读起来像一份文档，而不是一个驾驶舱。
6. **预算条是装饰性的。** 360px 宽、细线、软上限刻度，在 $0.02/$8 时完全读不出任何信息（`03`、`08`），文案还混用了 `/` 和 `·`（`预算 $0.02 / 软 $5 · 硬 $8`）。
7. **合同编辑器仍是“网页表单”。**
   - 标签 13px text-1，说明 12px text-2，层级反了：说明比标签还长。
   - `+ 命令` 有描边，`+ 人工` 没有，同级按钮两种样式。
   - 超时输入框 `600` 没有单位。
   - “验证前的准备命令”紧贴在 C1 行下面，只有 8px 间距；“范围围栏”的说明文字和“可以改”标签之间几乎没有间距（`06`）。
8. **浅色主题没有灵魂。** `bg-app` 0.992 与 `bg-raised` 1.0 几乎相同，靠 6% 的边框分层，可以接受；但琥珀色在浅色下变成 `oklch(0.60 0.15 65)`，决策条头的桃色底（`12-light-goal.png`）比深色版刺眼。

**与标杆的具体差距**

- Linear 用 Inter Display 做标题，字重 510/590，文字和边框只用三个变量生成（[Linear 改版说明](https://linear.app/now/how-we-redesigned-the-linear-ui)），图标是自绘的统一图标集。2026 年改版的原则是“Structure should be felt, not seen”（[Linear 2026](https://linear.app/now/behind-the-latest-design-refresh)）。Tower 的 1px 分隔线和框还是“看得见的结构”。
- Raycast 的密度来自 44px 列表行加右侧快捷键；Tower 的卡片高 124px，只装 5 行信息。
- Things 3 的层级完全来自字重和留白，几乎不用线。Tower 的标题与正文只差 1px（14 对 13），层级不够。

**修复（具体数值）**

1. **换掉 Unicode 图标。** 自绘一套 12×12 的 SVG 图标（1.25px 描边，与 `Glyph.tsx` 相同的笔画），至少包括：新目标、需要你、概览、更多、返回、事实、观测、哨兵、风险。“事实”不用齿轮，改用“刻度尺”或“⊢”形的测量记号。
2. **生命周期图形：** 待验收且已验证改用“实心圆 + 内部对勾”（●✓，`--st-verified`）；已合入用实心圆。三角形只留给哨兵和告警。
3. **概览改为两栏：** 左栏 440px 是“需要你”决策队列（可直接作答），右栏是其他目标的**紧凑行列表**（每行 36px：图形 / 标题 / 实况行 / 两轨进度 / 花费 / 时间），而不是卡片网格。或者至少把卡片栅格改成 `repeat(auto-fill, minmax(300px, 1fr))`，并取消按组断行。
4. **说法标记减为一层。** 区块内全是说法时，只在区块标题右侧写一次“Agent 称”（11px text-3），行内只保留虚线竖条。种类标签“原因 ·”已经和区块标题重复，删掉。
5. **章节分出主次。** “验收标准”和“改动”的标题用 15px/600；“运行”“账本”这类次要区块默认折叠，标题 12px/500 text-2，去掉上边线，改用 24px 间距。
6. **预算改成一行文字：** `花费 $0.02 · 软上限 $5 · 硬上限 $8`。只有超过软上限的 50% 时才显示进度条，超过软上限时数字变 `--st-attention`。
7. **合同编辑器：**
   - 标签 12px/500 text-2，说明 12px/400 text-3。
   - 区块之间 32px，区块内字段之间 16px。
   - `+ 命令`、`+ 人工` 都用 ghost 样式。
   - 超时框右侧内嵌“秒”（text-3）。
   - 主按钮禁用时，下方显示一行原因（例如“目的不能为空”）。
8. 浅色主题的 `--attention-bg` 从 `oklch(0.965 0.030 75)` 降到 `oklch(0.975 0.018 75)`，条头文字改用 `--text-1`。

---

### D7 信息架构与布局 · 66

**发现**

1. **页面职责清楚。** 概览负责“哪些需要我、各自是什么状态”，目标页负责“状态，不是流水”，评审是独立的全屏模式，收件箱只放可执行的条目。符合 `docs/00` §0.4 的五个北极星问题。
2. **概览顶部叠了三条横条：** “下一件 · …”、快速输入框、“自 20:51 起 · G-0004 已暂停 …… 知道了”，合计约 110px，还没开始显示目标（`01`）。简报的每一项都以 `·` 开头，看起来像列表断了。
3. **目标页不按状态裁剪**（见 D2.6）；已暂停页面同时有两个输入框：决策卡里的“写给 Agent 的话”和页面底部的“写一条批注，继续时带给 Agent…”（`08-goal-paused.png`），用户不知道该用哪个。已暂停的标题 meta 写“停下了但没有提交”，决策卡又写一遍“Agent 停下了但没有提交”。
4. **轨迹（Watch）没有可见入口。** 只能用 `W` 键，或者从 `⋯` 菜单进去。`docs/00` R3 和 R12 强调“轨迹一键可达”，但界面上没有任何提示。
5. **评审页隐藏了标题栏**（`App.tsx:96`），所以**没有返回按钮**。只有 Esc 能回去（`05`、`13`）。
6. **没有项目维度。** 有多个仓库时，概览混在一起，没有按项目筛选或分组；快速输入框的项目选择器是原生 `<select>`（`Overview.tsx:156`），与其他地方的原生菜单不一致。
7. 右栏“合同摘要”的“工作区 `/tmp/tower-demo/home/work/G-0003`”这类内部路径对用户没用，却占了首屏。

**修复**

1. 合并顶部：“下一件”并入简报行的最左侧；快速输入框收起成 32px，按 `/` 或 `N` 展开。
2. 目标页每种状态只保留一个输入框：暂停时只用决策卡的文本框，底部的转向框只在 `running` 时出现。
3. 目标页头部加一个次级按钮“轨迹 W”（与“改动 R”同级）。
4. 评审页头部最左侧加 `←` 按钮（与 TitleBar 一致），标题改为“评审 · {标题}”。
5. 侧栏分组支持按项目二级分组（项目数 >1 时出现），快速输入框的项目选择改用 `Select` 组件。
6. 把“工作区”移到 `⋯ → 在 Finder 中显示`，右栏留给“自主度、范围、模型”。

---

### D8 交互细节与键盘 · 70

**发现**

1. **键盘覆盖广：** `n`、`⌘N`、`⌘1/2`、`⌘,`、`⌘K`、`g`、`⌘⌥↓`、`j/k`、`r`、`p`、`w`、`⇧E`、`1–9`、`V`、`C`、`]`、`[`、`⌘⇧↩`、Esc/`⌘[`（`App.tsx`、`GoalPage.tsx`、`Review.tsx`）。`keys.ts` 检查了 `e.isComposing`，**中文输入法组字时不会误触**，这一点很多产品没做到。下拉选择和 `⋯` 菜单都是原生 macOS 菜单（`ui.tsx` 的 `Select`、`native.ts` 的 `popupActions`），原生感好。窗口失焦时按钮变暗（`App.tsx:58`），也是细节。
2. **单键改变状态，没有确认：** 在目标页按 `p` 会暂停一个正在运行的 Agent；在收件箱按 `2` 会放弃目标（见 D4.3）。
3. **确认框是网页 `window.confirm()`**（`GoalPage.tsx:175/198/206`），已经引入了 `@tauri-apps/plugin-dialog`，却没有用它的 `ask()`。
4. **命令面板只做子串匹配**（`Chrome.tsx` 的 `filtered`）：不支持模糊匹配，不支持拼音首字母（输入 `gwc` 找不到“购物车”），只显示 12 条，没有最近使用排序。
5. 覆盖层（命令面板、验收面板、要求修改面板）没有 `role="dialog"` 和 `aria-modal`，没有焦点陷阱，关闭后焦点不回到触发它的元素。
6. 没有快捷键速查（`?`），也没有撤销。

**修复**

1. `p` 暂停改为 `⇧P`，或者在实况行显示 2 秒的“已暂停 · ⌘Z 撤销”提示。收件箱的破坏性选项见 D4.2。
2. 所有确认改用 `plugin-dialog` 的 `ask()`，用 `kind: 'warning'` 和原生按钮文案（“推送”/“取消”）。
3. 命令面板用 `fzy`/`fuse` 一类的模糊打分，加上 `pinyin-pro` 首字母索引，记住最近使用的命令。
4. 抽一个 `Overlay` 组件：`role="dialog"`、`aria-modal`、焦点陷阱，关闭后恢复焦点。
5. `?` 打开快捷键面板，内容从 `docs/16` §16.3 的注册表生成。

---

### D9 文案与中文排版 · 70

**发现**

1. **基调好。** 文案具体、带工程语气，没有“✨ 智能”一类的营销腔。单行标签用 PingFang 的 `halt` 特性压缩标点宽度（`base.css:82`）；拉丁文字距只作用于 Inter，中文不加字距。
2. **自动标题从中间截断。** `lib.rs:540` 中 `intent.chars().take(48)` 不加省略号，也不按标点断句，真实数据里的标题因此停在半句：“给 total() 增加可选的税率参数 taxRate（默认 0，按折扣后的金额”，括号没闭合（`/tmp/audit-live-goal.png`）。
3. **中文标题生成的分支名一律是 `goal`。** `slug()`（`actions.rs:263`）只保留 ASCII，所以“修复购物车总价计算”对应的分支是 `tower/g-0001-goal`。而中文用户的标题绝大多数是中文。
4. 写进用户仓库的提交信息里有 `Agent 称：…`（`actions.rs:252`）。英文团队的仓库里会出现中文标记，PR 标题也是截断后的中文标题。
5. **术语门槛高。** “S2 · Seatbelt”“单向门”“墙钟”“pin”“@a4a90b2”“相对 base”“卫星”“观测 1/2”“人工 0/1”都直接出现在主界面。对没读过 `docs/` 的用户，`已验证 2/2 · 观测 1/2 · 人工 0/1` 需要解释。
6. 同一个 `R` 键的按钮，在不同状态下叫“评审”或“改动”（`GoalPage.tsx:216/242`）；同一个概念，有的地方叫“验收标准”，有的地方叫“机器标准”。
7. 标点与分隔符：`预算 $0.02 / 软 $5 · 硬 $8` 混用两种分隔符；`R-01 首次 · 21:00 · 13s` 中，`13s` 用的是英文单位，而别处写“分钟前”。

**修复**

1. 标题生成：先按 `，。；：（` 断句，取第一个分句；超过 28 个字时，在词边界截断并加“…”。或者让模型在 `submit` 前用 `log(kind: "title")` 给出标题。
2. 分支名：中文标题转拼音（`pinyin` crate），或使用 `tower/g-0001` 加上来自 intent 的英文关键字。设置中允许选择“分支前缀模板”。
3. 提交信息改用英文 trailer：`Tower-Agent-Summary:`，人类可读部分保持用户的语言。
4. 术语表：悬停“观测”“S2”“单向门”时显示一句解释；主界面上的 `S2 · Seatbelt` 改成“沙箱：只能写自己的工作区”。
5. 统一用“·”分隔；时长统一写成“13 秒”“1 分 05 秒”。

---

### D10 性能与响应 · 72

**发现**

1. **选型正确：** Tauri 2（应用约 11 MB）、Solid 细粒度更新、语法高亮在 Worker 里做并带 400 条缓存（`highlight.ts`）、超过 200 KB 的块不高亮、评审单元 ≤300 行天然限制了 DOM 规模，界面状态是只读副本，由合并后的更新驱动。
2. **轨迹没有虚拟化，每条事件都复制整个数组。** `Trace.tsx` 中 `setEntries((list) => [...list, e])`，每条事件一次 O(n) 复制，并且全部渲染。一个跑了 1 小时的目标有上千条工具事件，Watch 模式会越来越卡。
3. **每条轨迹事件都单独过一次 IPC。** `Inner::append` 每次都 `emit(UiUpdate::Trace)`（`lib.rs:113`），只有目标摘要做了合并。目标页在任何“事实”事件后都会在 400ms 内**整页重新拉取** `api.goal`（`GoalPage.tsx:31-40`）。
4. SQLite 访问是 `std::sync::Mutex<Store>` 加同步调用，在 tokio 工作线程上执行（`lib.rs:106`）。并发 4 个目标且事件密集时，会互相阻塞。
5. 每次验证都要在干净检出中重新安装依赖（`docs/17` §17.4 承认）。对 pnpm 和 cargo 项目，每轮验证要多花几十秒到几分钟。这是用户能直接感到的“慢”。
6. **没有任何实测数据。** README 的“50 KB gzip”与 `docs/17` 的“38 KB”自相矛盾；没有启动时间、长 diff、长轨迹的基准，CI 也不测。

**修复**

1. 轨迹改用虚拟列表（`@tanstack/solid-virtual`），数据存成按 seq 分段的不可变块；live 事件每 100ms 批量追加一次。
2. Trace 事件改为按目标合并，每 100ms 一批；目标详情改成增量补丁（`UiUpdate::GoalDetailPatch`），不再整页重拉。
3. Store 改成专用线程加 channel（真正的“单写者”），或者用 `spawn_blocking` 包装。
4. 验证的依赖缓存：以锁文件哈希为键，把 `node_modules` 或 `target` 快照放在 `~/.tower/cache/<hash>`，用 APFS 的 `clonefile` 拷进检出（几乎零成本）。
5. 加一个 `bench/` 目录：冷启动到首帧、5000 行 diff 首屏、1 万条轨迹滚动，在 CI 里设阈值。

---

### D11 稳定性与错误处理 · 68

**发现**

1. **恢复路径有设计：** 退出时，运行中的目标以“Tower 退出”暂停，下次启动自动继续；验证中的目标在启动时重新验证；被强制结束的运行记为“被中断”（`lib.rs:288-327`）。Pi 意外退出时，会带上 stderr 尾部暂停，原因写为“引擎退出”（`run.rs:716-734`）。环境错误与标准失败分开处理。
2. **后台任务里的错误被吞掉，目标可能卡死：**
   - `run.rs:682`：`let _ = finish_submitted(...)`。如果这一步失败（比如状态转换被拒），目标会停在“自称完成”，既没有验证，也没有收件箱条目。
   - `run.rs:598`：预算超限时的 `let _ = pause(...)`。暂停失败时，Agent 继续花钱，而且没有任何记录。
3. **预算只在一轮结束时检查**（`on_turn_end`）。一轮很长的工具调用或思考可能显著超过硬上限。
4. 多个事件组成的操作不是原子的，例如 `OVERRIDE_SENTINEL` 要连续写 Note、VerifyStarted、VerifyPassed 和收件箱条目（`actions.rs:102-108`）。中途崩溃会留下半完成的状态。
5. 全局 `Mutex` 上有 20 个 `.expect("… lock")`。任何一次持锁时的 panic 都会让锁中毒，之后所有命令都会 panic。
6. 错误只显示为 6 秒的 toast（`store.ts` 的 `act`），文本是后端的原始字符串，没有错误历史可查。启动失败时显示“Tower 无法启动：{error}”（`App.tsx:92`），没有重试按钮，也没有日志入口。

**修复**

1. 去掉后台任务里所有 `let _ =`：失败时至少要追加 `EngineError` 事件并打开 Paused 收件箱条目，原因写为“Tower 内部错误”，选项“重试 / 放弃”。
2. 预算：在 `message_update` 中按 token 估算花费，越过硬上限就立刻 `abort`。
3. Store 提供 `transaction(|tx| …)`，复合操作在一个事务里完成。
4. 锁换成 `parking_lot::Mutex`（不会中毒），或者在锁中毒时恢复 inner。
5. 增加“活动与错误”面板（⌘⇧L），保留最近 200 条错误和警告，每条可复制。启动失败页提供“重试”“打开日志”“重置数据目录（先备份）”。

---

### D12 安全与隔离 · 42

**这是本轮最严重的问题：产品对用户作出的安全承诺与实现不符。**

**发现**

1. **Agent 的 `read` 工具完全不受限。**
   - `tower-goal` 的 `tool_call` 门禁只拦截 `edit`、`write` 和 `bash`（`extensions/tower-goal/index.ts` 中 `if (name === "edit" || name === "write")` 和 `if (name === "bash")`），其余工具一律放行（`return undefined`）。
   - Pi 启动参数没有限制工具集（`tower-pi/src/engine.rs:47-64` 中没有 `--tools`），所以 Pi 内置的 `read` 在 Pi 宿主进程里运行，不在 Seatbelt 中，路径也不检查。
   - 也就是说，**Agent 可以 `read ~/.ssh/id_ed25519`、`~/.aws/credentials`、其他项目的 `.env`**。
   - 这与以下三处承诺直接矛盾：欢迎页写“Agent 的命令只能写它自己的工作区，读不到你的凭据”；`SECURITY.md` 写“the agent cannot read credential stores”，在 Known limits 中只说文件工具是“path-checked”，而 `read` 实际上连路径检查都没有；README 写的是“Your repository is untouched”。
   - 这一条是从代码路径推出的结论，我没有用真实模型去实际读取凭据。
2. **Seatbelt 配置是黑名单式的，而且网络全开。** `sandbox.rs` 以 `(allow default)` 开头，只禁止写入（白名单之外）和读取 15 个凭据目录。我的无害实测（等价配置）结果：
   - 外网 `curl https://example.com` → 200
   - `security list-keychains` → 能连上钥匙串服务（mach-lookup 没有被禁止）。git-credential-osxkeychain 或 gh 存在钥匙串里的令牌**可能**可以取出；这一点我没有尝试，未验证
   - `~/.zsh_history` 可读，`~/Library/Application Support` 可读，其他目标的工作区和用户的其他仓库都可读

   **读取任意文件 + 网络外发**，正是 `docs/11` 自己点名的“致命三要素”。设计文档说 S2 限制网络，实现里没有。
3. **沙箱外的持久化或投毒路径。** 写白名单包括 `~/.cargo/registry`、`~/.cargo/git`、`~/.cache`、`~/Library/Caches`、`~/.m2`、`~/.gradle`、`/private/var/folders`。Agent 可以改写 cargo registry 中已解包的 crate 源码，而用户之后在沙箱外 `cargo build` 自己的其他项目时会编译这些代码。这是一条越出沙箱的执行路径。
4. **验证器用的是同一份配置**（`verify.rs:226`）。网络开着，主目录除凭据外都可读。“干净环境”只是指文件状态干净，不是指隔离。
5. **bash 门禁是正则，绕过很容易**：`git -c a=b push`、`g""it push`、`$(printf git) push`。好在卫星克隆没有远端，所以实际危害主要落在“谨慎”档的命令判定上。
6. 设置中“加载我全部的 Pi 扩展”会让扩展在沙箱外以用户权限运行。界面有一行提示，但没有逐个扩展的确认清单（`docs/17` §17.4 承认这是简化）。
7. **仓库中提交了隐私信息**：`10-goal-real-model.png` 和 `assets/screenshots/goal.png` 里有公网 IP 和服务器加固细节（见 0.1）。
8. 做得好的地方：凭据形环境变量剥除（`policy.ts` 的 `scrubEnv`）；`.git/config` 和 hooks 只读，`core.hooksPath` 指向空目录；卫星没有远端；推送由人显式触发并经过 `confirm`；Tauri CSP 严格，`opener:allow-open-url` 只允许本仓库的 URL。

**修复（按影响排序）**

1. **立刻**：让 `read`（以及 Pi 启用的 `grep`、`find`、`ls`）走门禁，对 `realpath` 后的路径应用 `SECRET_DIRS` 和“工作区 + 工具链 + Pi 资源”的读白名单。或者用 `--tools` 只启用 `read`、`bash`、`edit`、`write`，再给 `read` 包一层与 bash 相同的 `sandbox-exec cat` 实现（ADR-220 原本的设计）。
2. **立刻**：在修好之前，把欢迎页、README 和 SECURITY.md 的措辞改成真实情况：“bash 在沙箱中；文件读取工具目前不在沙箱中”。对一个以诚实为卖点的产品，这一条比修代码更紧急。
3. Seatbelt 改为白名单式读取：`(deny default)` 加上必要的系统路径、工具链、工作区和 TMPDIR；`(deny mach-lookup (global-name "com.apple.SecurityServer"))` 加上 `com.apple.securityd.xpc` 一类服务；网络默认 `(deny network-outbound)`，只给准备命令开放包管理器镜像域名（可在设置中添加）。
4. 缓存目录不再直接可写：给每个目标设置私有的 `CARGO_HOME`、`npm_config_cache`、`PIP_CACHE_DIR`，或者把缓存挂成只读、让新增依赖写到私有目录。
5. 从 Git 历史中清除两张泄露截图（`git filter-repo`），并在 `tools/screenshot.sh` 中改用 `screencapture -l <windowid>`，只截 Tower 窗口，不截屏幕区域。这样可以从根本上避免其他应用的浮层进入截图。
6. 加一个 `security` 测试套件：用 real_pi 让脚本化模型调用 `read ~/.ssh/x`、`curl`、写 `~/.cargo/registry`，断言全部被拒绝。

---

### D13 代码架构与可维护性 · 74

**发现**

1. **分层清晰：** `tower-core` 是纯逻辑（状态机只有一个 `apply()` 转换函数、合同、诚实语法、哨兵、评审单元），`tower-store` 是事件日志加投影，`tower-pi` 是 RPC 适配，`tower-git` 和 `tower-verify` 各自独立，`tower-supervisor` 负责编排。`ts-rs` 从 Rust 生成 TS 类型（`src/gen`），前后端契约是类型化的。注释写的是“为什么”，引用设计章节，质量高。
2. **界面逻辑依赖中文文案匹配：**
   - `GoalPage.tsx:551` 用 `state.env?.problems.some((p) => p.includes("沙箱"))` 判断沙箱是否可用
   - `Welcome.tsx` 用 `includes("pi")` 和 `includes("git")` 过滤问题
   - `DecisionCard.tsx` 用正则去掉“已暂停：”这类前缀

   一旦做国际化或改一处文案，这些逻辑就会坏。
3. **状态不统一：** 评审状态在 `localStorage`，概览“上次查看”在 `localStorage`（`tower.overviewSeenAt`），草稿意图在 `sessionStorage`，其余在 SQLite。
4. **标签映射分散：** 运行结果（`GoalPage.tsx:373`）、运行目的（`:365`）、自主度（`:507`）的中文映射写在组件里；后端 `briefing::pause_label` 也有一份。Rust 中有 303 行中文字符串，分布在 22 个文件里。
5. `run.rs` 941 行、`supervisor/lib.rs` 775 行、`app.css` 1817 行，已经接近需要拆分的规模。
6. **设计文档与代码漂移严重。** `docs/` 有 16 MB，其中 `reviews/` 有 509 个文件，`15-decision-log.md` 有 1.2 MB，`docs/00` §0.5.1 的单个表格单元超过 500 字。`docs/00` 写 Pi 1.2.0 和 SDK 宿主，实现用的是 RPC，本机是 1.4.0；`docs/17` 说哨兵没有实现，实际已经实现。新贡献者无法据此判断哪些设计是真的。

**修复**

1. 后端返回结构化的 `Problem { kind: SandboxMissing | PiMissing | … }` 和 `PauseReason` 枚举，界面只根据枚举渲染文案。
2. 统一一个 `labels` 模块（前端）和 `messages` 模块（后端），为 i18n 做准备（见 D17）。
3. 评审状态和查看时间搬进 SQLite。
4. `run.rs` 拆成 `run/{start,events,stop,stall}.rs`。
5. 文档分两层：`docs/` 只保留“当前实现的设计”（每章 ≤30 KB）；112 轮对抗评审与 ADR 移到 `docs/archive/` 或另一个仓库。在 `docs/17` 顶部维护一张“设计 ↔ 实现”状态表，由 CI 检查链接的符号是否存在。

---

### D14 测试与质量保障 · 64

**发现**

1. **Rust 侧扎实：** 121 个测试全部通过，覆盖状态机的不变式、存储回滚、Pi 帧切分（包括 U+2028）、在真实 git 上的隔离链路、进程组超时，以及**真实 Seatbelt** 是否生效（`sandbox.rs` 的 `profile_is_enforced_by_sandbox_exec`）。`real_pi.rs` 用脚本化的 OpenAI 兼容服务驱动真实 pi，验证了扩展的三个工具、审批对话框、沙箱拒绝和 `*_API_KEY` 剥除。这一层在同类开源项目里少见。
2. **前端 0 测试**，Tauri 命令层 0 测试。像“1–9 一键放弃”“验收面板已看计数多 1”“假设卡发文字等于驳回”这类交互 bug，都是测试本该抓住的。
3. CI（`.github/workflows/ci.yml`）不安装 pi，所以 `real_pi` 在 CI 中大概率直接跳过（`docs/17` §17.7 写“没有安装 pi 时跳过”）。最关键的引擎集成测试只在维护者本机运行。
4. **没有覆盖 D12 的安全回归**：`read` 越权、网络外发、缓存投毒，全都没有测试。
5. 哨兵只有正例测试，没有“绕过”样例集（D3.3）。
6. 没有 UI 截图回归。本轮的截图事故（外部浮层、错误的应用）说明截图流程本身需要自动化校验。

**修复**

1. 引入 `vitest` 和 `@solidjs/testing-library`：先为 `keys.ts`、`reviewState.ts`、`DecisionCard`、`AcceptPanel`、`CommandPalette` 写单元测试。
2. CI 中 `npm i -g @earendil-works/pi-coding-agent@<固定版本>`，让 `real_pi` 真正运行；版本矩阵包括最低支持版本和最新版本。
3. 安全测试套件（见 D12 修复 6）。
4. 建一个哨兵对抗样例目录 `crates/tower-core/tests/sentinel_evasion/`，每种绕过一个 diff 夹具。
5. 用 `tauri-driver` 或 WebDriver 跑 3 条 UI 冒烟流程，再用像素差比较 6 个路由的截图；截图用 `screencapture -l` 只截窗口。

---

### D15 开源项目成熟度 · 52

**发现**

1. **文件齐全：** `LICENSE`（MIT）、`CONTRIBUTING.md`、`SECURITY.md`（包含私下报告渠道和已知限制）、`CODE_OF_CONDUCT.md`、Issue 和 PR 模板、按 Keep a Changelog 格式写的 `CHANGELOG.md`、CI（fmt、clippy `-D warnings`、测试）、release 工作流（universal binary）、英文 README 加中文 README。
2. **仓库是私有的，0 个 release**，README 的下载链接不通（见 D1.1）。
3. **README 首屏的截图被污染：** `assets/screenshots/goal.png` 上有外部应用浮层，并泄露隐私（见 0.1）。别人看到的第一印象是“连截图都没检查”。
4. **CHANGELOG 与 `docs/17` 矛盾**（哨兵、墙钟）；README 说 JS 包约 50 KB，`docs/17` 说约 38 KB。
5. 没有签名，没有公证，也没有自动更新（Tauri updater 未配置）。
6. 仓库里有 16 MB 的设计文档和 509 个评审文件，对外部贡献者是一堵墙；CONTRIBUTING 也没有“从哪里开始读”的指引。
7. 没有 roadmap 或 issue 标签（如 good first issue），没有讨论区。

**修复**

1. 清除泄露截图并重写历史；用新的窗口截图流程重拍 README 的图片。
2. 公开仓库，发布 v0.1.0（签名 + 公证 + Homebrew cask），接入 Tauri updater。
3. 修正 `docs/17` 与 README 中的数字，保证一处来源。
4. CONTRIBUTING 加“30 分钟上手路线”：`docs/17` → `tower-core/lifecycle.rs` → `supervisor/verify.rs` → 跑 demo。
5. 归档评审轮次（见 D13 修复 5），公开一份简短的 ROADMAP.md。

---

### D16 竞争力 · 64

**Tower 独有的东西（我检索后能确认没有竞品做到的）：**

- 在 Agent 从未接触过的干净检出中**重跑验收标准**，并以此作为唯一的“绿色”。Codex 的引用、Cursor 的视频和截图、Copilot 的 PR 前检查，都是在 Agent 自己的环境中产生的证据（见第 4 节）。
- 事实、观测、说法、人的决定，在**数据模型和界面上**都分开，而且有账本比对。
- 哨兵会在测试被删、出现 skip 标记、测试命令被改时**硬性阻止**进入评审。
- 目标以合同为单位：意图、可执行标准、范围围栏、预算、自主度、停止条件。
- 按风险排序的评审单元；批注即转向。
- 原生简体中文界面。对比之下，Claude Code、Codex（内置但不稳定）、Cursor 的 Agents 窗口、Zed、Warp、Copilot app、Antigravity 都没有官方简体中文界面。

**日常可用性的短板（我的人设会因此犹豫）：**

1. **引擎锁定在 Pi。** 我已经为 Claude Max 或 ChatGPT Pro 付费，日常工具是 Claude Code 和 Codex。Conductor、Zed、Warp Oz、GitHub Agent HQ 都能托管多种引擎；Tower 只支持 Pi。
2. **没有“出口”：** 没有内置终端、预览或浏览器，不能为前端任务启动开发服务器并截图。对 UI 类任务，Tower 的“已验证”只能靠命令，证据不完整。
3. **没有云端、远程和移动端审批**（Claude、Codex、Cursor、Conductor 都有，Conductor 在 2026-10 推出了 iOS 版）。Tower 退出就暂停，等于必须一直开着电脑。
4. 没有 PR 闭环（CI 自动修、评审评论回灌）。
5. 只支持 macOS；Linux 和 Windows 没有沙箱。
6. 评审 diff 的基本功落后（D5）。

**修复方向（战略级）**

1. 用 ACP 或适配层接入 Claude Code 和 Codex CLI 作为可选引擎，把 Tower 的独特价值（合同、验证、哨兵、评审单元）变成“任何引擎之上的信任层”。这是最大的增长杠杆。
2. 加一种“证据类型：预览”：合同中可以声明 `dev` 命令和 URL，验证时在干净检出中启动服务，用 headless WebKit 截图，作为事实附在目标上。
3. `serve` 只读远程模式加决策卡（设计中已有），先做局域网和 Tailscale 访问。

---

### D17 可访问性与国际化 · 38

**发现**

1. **只有中文界面**（README 第 30 行承认），没有 i18n 框架。前端每个视图都有几十处硬编码中文，后端 22 个文件里有 303 行中文字符串，涉及暂停原因、收件箱标题、错误信息。英文界面要前后端一起改。好在 Agent 写给你的语言已经可以设置。
2. **读屏不友好：**
   - 生命周期图形 `aria-hidden="true"`（`Glyph.tsx:49`），侧栏行的 `title` 只有 `${id} ${title}`，读屏用户听不到目标的状态
   - 覆盖层没有 dialog 语义（D8.5）
   - toast 统一用 `role="status" aria-live="polite"`，错误也是 polite，不会打断朗读
   - 诚实语法的“虚线框 = 观测”“绿色 = 事实”纯靠视觉，没有给读屏的等价表达，只有 `⚙` 有 `aria-label="Tower 测得"`
3. **对比度**（按 OKLCH 明度近似换算）：
   - 浅色主题 `--text-4` 0.72 对 `--bg-app` 0.992 约 **2.4:1**，用于 diff 行号（这是批注入口）和“过期”标准的标题，不达标
   - 深色主题 `--text-4` 0.58 对 0.18 约 4.4:1，刚好低于 4.5
   - 11px 的提示文字（`--fs-hint`）用在快捷键提示上，偏小
4. 做得好的地方：`prefers-reduced-motion` 时去掉所有动画；`:focus-visible` 有 1.5px 实线；键盘可达性好；照顾了输入法组字。
5. 不支持界面缩放（没有“界面大小”设置，Raycast 有）；固定的 px 字号不跟随系统设置。

**修复**

1. 引入 `@solid-primitives/i18n`（或类似方案）和 `fluent`/`rust-i18n`：后端只返回消息 ID 加参数，前端按语言渲染；先做英文界面。
2. 图形加 `role="img"` 和 `aria-label={stateLabel}`；侧栏行的 `aria-label` 写成“{标题}，{状态}，需要你”；事实、观测、说法在 DOM 中加 sr-only 前缀“（已验证）”“（观测，未计入）”“（Agent 声称）”。
3. 错误 toast 用 `role="alert"`。
4. 浅色 `--text-4` 调到 0.60（约 4.0:1），行号改用 `--text-3`；深色 `--text-4` 调到 0.62。
5. 设置中加“界面大小：紧凑 / 标准 / 大”，用根元素的 `font-size` 和 `--sp-*` 一起缩放。

---

## 3. 总评

**一句话：** Tower 是我见过的**唯一一个把“Agent 说完成”和“真的完成”在数据和界面上严格分开的 Agent GUI**。验证链路（干净检出、pin、验收前重新比对）在工程上是真的，不是演示。但作为一个每天要交给它 3–5 个任务的用户，**今天我不会推荐给同事**，原因有三：

1. **它对安全的承诺与实现不符：** `read` 工具不受限，网络全开，钥匙串服务可达。对一个以“诚实”立身的产品，这是最伤的一类问题，必须先修，或者至少先如实说明。
2. **日常可用性落后：** 只支持 Pi，diff 落后一代，并行任务之间没有冲突检测，没有预览或终端，离开电脑就停。
3. **门面问题：** 仓库私有、没有 release，README 首屏截图泄露隐私，实现文档与 CHANGELOG 矛盾。

如果修好 D12 的前三项、D5 的词级 diff 和展开上下文、D4 的计数与热键、D15 的发布与截图，我估计平均分能从 65 升到 75 左右。要达到 95，还需要 D16 的多引擎接入和 D17 的英文界面加读屏支持，这是另一个量级的工作。

---

## 4. 前 20 项修复（按用户影响排序）

| # | 修复 | 维度 | 工作量 |
|---|---|---|---|
| 1 | `read`（以及 grep、find、ls）走门禁或沙箱，读取凭据目录与工作区之外的路径一律拒绝 | D12 D3 | 中 |
| 2 | 在修好之前，立即把欢迎页、README、SECURITY.md 的安全描述改成真实情况 | D12 D15 | 小 |
| 3 | 从仓库和 Git 历史中清除泄露 IP 的两张截图；截图脚本改为只截 Tower 窗口 | D12 D15 | 小 |
| 4 | Seatbelt 网络默认拒绝（准备命令只放行镜像源），禁止 SecurityServer 的 mach-lookup，读取改为白名单 | D12 | 中 |
| 5 | 公开仓库并发布签名、公证过的 v0.1.0 和 Homebrew cask，接入自动更新 | D1 D15 | 中 |
| 6 | 词级 diff 高亮（令牌已定义）、展开上下文、并排视图 | D5 | 中 |
| 7 | “红 → 绿”证据：在 base 上跑一遍标准，标出不能证明完成的标准 | D3 | 中 |
| 8 | 并行目标的文件重叠提示，验收前用 `git merge-tree` 预判冲突 | D2 D16 | 中 |
| 9 | 收件箱与目标页的破坏性操作不能一键执行（`2` 放弃、`p` 暂停），确认改用原生 `ask()` | D4 D8 | 小 |
| 10 | “需要你”计数拆成“阻塞 / 待验收”，Dock 角标只计阻塞项 | D4 | 小 |
| 11 | 去掉后台任务中吞掉错误的 `let _ =`，失败时给出带出路的暂停；预算在流式更新中实时检查 | D11 | 中 |
| 12 | 删除行可批注、批注入口可见（悬停“+”）、批注可编辑，行号对比度修复 | D5 D17 | 小 |
| 13 | 评审状态从 `localStorage` 搬进 SQLite（修复跨数据目录串用） | D5 D13 | 小 |
| 14 | 自绘统一 SVG 图标替换 Unicode 符号，“已验证”不再用三角形，“事实”不再用齿轮 | D6 | 中 |
| 15 | 概览改成“决策队列 + 紧凑行列表”两栏，顶部三条横条合为一条 | D6 D7 | 中 |
| 16 | 目标页按状态裁剪内容，暂停时只保留一个输入框，加可见的“轨迹 W”按钮，评审页加返回按钮 | D7 | 小 |
| 17 | 标题按分句截断，中文标题生成可读的分支名，提交信息用英文 trailer | D9 | 小 |
| 18 | 前端测试（vitest）、CI 中真实运行 real_pi、安全回归套件、哨兵绕过样例 | D14 | 中 |
| 19 | 欢迎页“一键试用 demo”、Pi 版本检查、首个目标向导（含在 base 上试跑测试命令） | D1 | 中 |
| 20 | i18n 基础设施（前后端消息 ID）加英文界面，读屏标签，错误 toast 用 `role="alert"` | D17 D13 | 大 |

---

## 5. 与主流 harness GUI 的对比：独有优势与差距

带链接的条目是本轮检索的结果。注明“已有调研”的条目引自 `research/harness-gui-landscape-2026.md`，本轮没有复核。

| 产品 | 隔离与并行 | 验证与证据 | 评审 | 注意力 | 中文 / 无障碍 | 它强在哪里，Tower 强在哪里 |
|---|---|---|---|---|---|---|
| **Claude Code**（桌面 Code 标签 + Web） | 云端每个会话一个 VM，GitHub 凭据经代理注入、不进 VM（[文档](https://code.claude.com/docs/en/claude-code-on-the-web)） | 没有独立验证；`autoVerify` 是 Agent 自己截图（已有调研 §2.1） | Changes 卡、行内批注、任意分支对比、PR 自动修 CI 和评论（同一文档） | 远程和移动端 | 没有中文界面（[#81913](https://github.com/anthropics/claude-code/issues/81913)）；diff 面板读屏只会读“Add comment”（[#100911](https://github.com/anthropics/claude-code/issues/100911)） | **它强：** 模型最强、云端加移动端、PR 闭环。**Tower 强：** 独立重跑、哨兵、事实与说法分开、中文 |
| **OpenAI Codex**（桌面 + 云） | 最多 15 个 worktree，删除前做快照，`--attempts 1–4`（已有调研 §2.2） | 用终端日志和测试输出的“引用”作证据，但由 Agent 自己挑选（[OpenAI](https://openai.com/index/introducing-codex/)） | 5 种 diff 范围、按 hunk 暂存和撤销（已有调研） | 移动端 | 带有 zh-CN 但不稳定（[#53852](https://github.com/openai/codex/issues/53852)）；macOS 应用不暴露无障碍接口（[#25740](https://github.com/openai/codex/issues/25740)） | **它强：** diff 范围与打磨程度、多次尝试。**Tower 强：** 证据不由 Agent 挑选，验收前比对快照 |
| **Cursor 3**（Agents 窗口 + 云 Agent） | 每个云 Agent 一个 VM（[更新日志](https://cursor.com/changelog/02-24-26)） | PR 附视频、截图和日志，可以接管远程桌面（同上） | Last Agent Turn、Bugbot（已有调研 §2.4） | 有 | Agents 窗口只有英文（[论坛](https://forum.cursor.com/t/please-add-chinese-support-for-the-agents-window/161942)） | **它强：** UI 任务有视觉证据，编辑器一体化。**Tower 强：** 证据产生在 Agent 环境之外，有合同 |
| **Conductor** | worktree（官方说明它不是安全边界），每个工作区 10 个端口，setup、run、archive 脚本（已有调研 §2.15） | Checks 标签（0.31.1） | 可直接在 diff 中编辑（0.84） | 远程控制（0.92）、iOS（[更新日志](https://www.conductor.build/changelog)） | 未见 i18n | **它强：** 多引擎（Claude、Codex、Cursor、OpenCode）、端口和脚本、移动端。**Tower 强：** 有沙箱、独立验证、哨兵 |
| **Imbue Sculptor** | 容器（实验性），macOS 和 Linux（[v0.48.0](https://github.com/imbue-ai/sculptor/releases/tag/sculptor-v0.48.0)） | CI Babysitter（已有调研） | 有 | — | — | **它强：** 也接入了 Pi，有 Linux 版。**Tower 强：** 合同和哨兵 |
| **Vibe Kanban** | 本地 worktree；公司已于 2026-04-10 关停，转为社区维护（[公告](https://www.vibekanban.com/blog/shutdown)） | 无 | 基本 | 看板 | 有 zh-Hant | **它强：** 看板式并行视图，有中文界面。**Tower 强：** 仍在积极开发，有完整的验证链路 |
| **Warp（Oz）** | Docker 或 K8s 沙箱，免费层 4 个并发（[发布稿](https://www.warp.dev/newsroom/2026/2/10/warp-launches-oz-the-orchestration-platform-for-cloud-coding-agents)） | 无独立验证 | 应用前的确认（回车接受、R 修改、E 编辑），⌘↩ 把评审意见发给 Agent（已有调研 §2.7） | 有收件箱 | 只有英文，中文输入法有乱码 bug（[#10587](https://github.com/warpdotdev/warp/issues/10587)） | **它强：** 定时、webhook、Slack 触发，终端原生。**Tower 强：** 信任层、中文 |
| **Zed**（并行 Agent） | Threads 侧栏，每个线程可选一个 worktree，支持外部 Agent（[报道](https://alternativeto.net/news/2026/4/zed-launches-parallel-agent-orchestration-with-a-threads-sidebar-to-control-and-monitor-them/)） | 无 | 编辑器级 diff | 侧栏 | 只有英文（[#7409](https://github.com/zed-industries/zed/issues/7409)） | **它强：** 编辑器性能、ACP 多引擎。**Tower 强：** 监督视角，不是编辑器视角 |
| **Devin** | 最多 20 个 worktree（LRU）（已有调研 §2.5） | 测试录屏卡片 | Devin Review：逐文件“已看”，每次 push 自动复审 | Command Center | 未见非英文界面 | **它强：** 复审自动化、录屏。**Tower 强：** 本地、可审计、开源 |
| **GitHub Copilot Agent HQ** | 云端，按 issue 和 PR 分派，可以选 Claude 或 Codex（[博客](https://github.blog/news-insights/company-news/welcome-home-agents/)） | 开 PR 前跑 CodeQL、密钥扫描和项目测试，但在 Agent 环境里跑（已有调研 §2.3） | 就是 PR 本身 | GitHub 通知 | 应用无多语言（[app#4396](https://github.com/github/app/issues/4396)） | **它强：** 在团队工作流里原生运行。**Tower 强：** 先在本地验证再推送，事实与说法分开 |
| **TRAE SOLO**（字节，中文原生） | 多任务并行，有子 Agent（[论坛](https://forum.trae.cn/t/topic/6498)） | 无独立验证 | IDE 内 | — | 原生中文 | **它强：** 中文生态、免费模型。**Tower 强：** 可信度与可审计性 |

**归纳**

- **Tower 独有：** 在干净检出中独立重跑；哨兵硬性阻断；事实与说法分开并有账本；合同化的目标；按风险排序的评审；原生简体中文。在上面这 11 个产品里，前五项我都没找到第二家做到。
- **Tower 落后：** 多引擎；云端和移动端；预览、视频这类视觉证据；PR 和 CI 闭环；diff 基本功；端口和脚本这些工作区运行时能力；Linux 和 Windows；英文界面。

---

## 6. 分数小结

D1 60 · D2 68 · D3 80 · D4 68 · D5 60 · D6 64 · D7 66 · D8 70 · D9 70 · D10 72 · D11 68 · D12 42 · D13 74 · D14 64 · D15 52 · D16 64 · D17 38（平均 64.7；没有维度达到 95，本轮不通过）
