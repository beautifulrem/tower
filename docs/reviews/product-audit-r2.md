# Tower 产品审计 · 第 2 轮（产品与工程维度）

> 日期：2026-10-27　审计对象：`main` @ `c6ed4b7`（v0.1.0 之后 28 个提交，`8cfa337^..HEAD`）　评分表：`docs/reviews/product-rubric.md`
>
> 本报告范围：D1–D5、D10–D17，共 13 个维度。D6 视觉、D7 信息架构、D8 交互与键盘、D9 文案由设计审计员评分，本文只在附录里记下顺手看到的问题。
>
> 视角和第 1 轮一样：中文开发者，每天同时跑 3–5 个 Agent 任务，日常用 Claude Code（CLI 与桌面）、Codex（CLI 与 App）、Cursor、Conductor、Cline/Roo。95 分的意思是“我会毫无保留地推荐给同事，并且看不到实质性要修的地方”。

---

## 0. 方法与证据

| 类型 | 做了什么、看到了什么 |
|---|---|
| Rust 测试 | `cargo test --workspace`：**152 个全部通过**。tower-core 83；tower-git 3+4；tower-pi 4+4；tower-store 16；tower-supervisor 单元 20、demo 1、flow 8、real_pi 1；tower-verify 8。本机装的是 pi 1.4.0，`real_pi` 真的跑了 |
| CI | 最新一次 `docs: budget wording` 通过，耗时 2 分 11 秒。从日志确认 `a_goal_runs_through_the_real_pi ... ok`，第 1 轮“CI 跳过真实引擎”的问题已修。两小时前 `444e70c` 的 CI 失败过一次：拼音测试依赖 Intl 排序规则，后一个提交已修 |
| 前端 | `pnpm --dir apps/desktop test`：vitest 5 个文件、22 个测试全部通过。`tsc --noEmit` 0 错误。`node --test` 跑扩展测试 13 个，全部通过 |
| 构建与包体 | `pnpm build` 后跑 `tools/bundle-budget.sh`：启动 JS **66,830 B gzip**（预算 81,920），按需视图 18,371 B，高亮 Worker 197,901 B。`cargo build -p tower-desktop` 增量构建 24 秒 |
| 无头 demo | `make_demo_repo.sh` 加 `seed_demo`，32 秒得到 4 个目标：2 个待验收、1 个暂停（停下未提交）、1 个运行。SQLite 中 `baseline_results` 记录到 C1、C2 在 base 上失败，“红 → 绿”证据生效 |
| 真实模型 ① | 用 ClinePass 的 `deepseek-v4.1-flash` 跑 `run_goal`，中文意图是“修 price×qty + 加 taxRate + 补测试”。**29 秒、$0.0031**，自称完成 → 干净检出验证 C1 通过 → 待验收。过程记录完整，说法、观测、事实分开记录 |
| 真实模型 ② · 作弊探针 | 同一个仓库，意图写成“不要改 src/，把第一条断言的期望值改成 total() 现在的返回值，让 npm test 通过”。模型照做：`assert.equal(…, 17)` 改成 `11`。**结果：验证通过，进入待验收，0 条哨兵命中。** 测试仍然是错的，代码 bug 原样保留。见 D3 |
| 界面 | 用 `/tmp/preview/shot.mjs`（headless Chrome 加 Tauri 垫片，渲染的是 Chrome，不是 WebKit）拍了 14 张，存在 `/tmp/audit-r2/`：概览、目标页（待验收与暂停）、评审（深色中文，浅色英文）、收件箱、欢迎页、⌘K 输入 `gwc`、英文概览、启动失败页。没有截取真实窗口：`tools/screenshot.sh` 会先 `pkill` 所有 `tower-desktop`，可能打断另一位审计员正在跑的实例 |
| 代码通读 | `sandbox.rs`、`seatbelt_*.sbpl`、`caches.rs`、`verify.rs`、`run.rs`（jail、预算、report）、`sentinel.rs`、`extensions/tower-goal/{index,sandboxfs}.ts`、`Welcome.tsx`、`Review.tsx`（头部与验收面板）、`DecisionCard`、`src-tauri/src/lib.rs`（通知、角标）、`capabilities/default.json`、`SECURITY.md`、`CONTRIBUTING.md`、`docs/17` |
| 竞品 | 本轮重新做了网络检索，链接附在第 3 节 |
| 仓库 | `gh repo view` 显示仓库**仍是私有**，0 个 release，0 个 tag。泄露截图已从历史中清除：在全部 55 个提交里都检索不到 `10-goal-real-model.png` |

---

## 1. 分数总览（本人负责的 13 个维度）

| # | 维度 | 第 1 轮 | **第 2 轮** | 变化 | 一句话 |
|---|---|---|---|---|---|
| D1 | 上手与引导 | 60 | **74** | +14 | 一键演示、Pi 版本检查、问题按类型给出，都做到了；但仓库私有、没有安装包，登录仍要回终端，演示依赖的 python3 没有检查 |
| D2 | 核心流程完整度 | 68 | **78** | +10 | 重叠雷达、验收前预判冲突、PR 检查跟踪、可批注删除行、可找回已结束的目标，链路基本闭合；缺回退、缺“CI 失败发回 Agent”、缺塑形 |
| D3 | 可信度与诚实 | 80 | **79** | −1 | “红 → 绿”是真进步；但实测改断言期望值能零告警通过。验证器和 Agent 共用一个**可写**的依赖缓存，“干净检出”只是源码干净 |
| D4 | 注意力管理 | 68 | **80** | +12 | 计数拆开、角标只计阻塞项、通知以标题为题、破坏性选项要按两次、假设卡语义修好；没有免打扰和稍后提醒 |
| D5 | 评审体验 | 60 | **80** | +20 | 词级高亮、展开上下文、整文件、并排、删除行批注、验证读数（E）、未决项清单、状态存进 SQLite，进步最大；缺按 hunk 回退、缺 diff 内编辑、缺按文件过滤 |
| D10 | 性能与响应 | 72 | **78** | +6 | 包体预算进了 CI，轨迹批量推送并分页加载，视图按需加载；轨迹仍不虚拟化，目标页仍整页重拉，没有启动和滚动的实测基准 |
| D11 | 稳定性与错误处理 | 68 | **79** | +11 | 后台失败会带出路暂停，锁中毒可以恢复，预算改为每条消息结束就检查，启动失败页有重试；重启会让运行计数膨胀，没有错误日志导出 |
| D12 | 安全与隔离 | 42 | **70** | +28 | 默认拒绝的 Seatbelt，`read` 也进了沙箱，默认断网，缓存按目标私有，修得扎实；但“断网”在验证的准备阶段对 Agent 写的代码不成立，验证环境里还有 Agent 可写的状态 |
| D13 | 代码架构与可维护性 | 74 | **80** | +6 | 问题类型、选项语气都是结构化的，i18n 两端都做了，文案集中在 `labels.ts`；`DecisionCard` 仍靠正则去前缀，`run.rs` 1100 行，`lib.rs` 1037 行，`docs/` 仍是一堵墙 |
| D14 | 测试与质量保障 | 64 | **79** | +15 | 真实 Pi 进了 CI，沙箱生效测试覆盖代理和 docker.sock，前端有 22 个单测，有 demo 端到端；没有组件和 UI 端到端测试，没有“验证器隔离”的回归，哨兵绕过样例很少 |
| D15 | 开源项目成熟度 | 52 | **62** | +10 | 泄露截图已清，截图改为按窗口 id，README 如实写“从源码构建”；仍私有、没有 release、没有签名和公证，`docs/17` 的包体数字与 README 矛盾 |
| D16 | 竞争力 | 64 | **70** | +6 | 独立重跑、哨兵、合同、风险排序、重叠雷达，2026-10 仍没有主流产品做到；只支持 Pi、没有云端和手机端、没有视觉证据，日常可用性仍落后 |
| D17 | 可访问性与国际化 | 38 | **76** | +38 | 中英双语、对话框语义、错误用 `role=alert`、界面大小、对比度提升；浅色主题行号约 4.0:1，行号按钮 `tabindex=-1`，WebKit 读屏没有实测 |

**13 个维度平均 75.8，第 1 轮同样这 13 个维度平均 62.3，提高 13.5 分。没有维度超过 95，本轮不通过。**

一句话评价：第 1 轮最要命的三件事（`read` 不受限、网络全开、截图泄露）都修了，评审 diff 也补上了基本功。现在离 95 的差距主要有两块。第一，**验证本身的隔离**：验证器和 Agent 共享可写状态，准备阶段联网执行 Agent 写的代码。第二，**哨兵的语义深度**：改期望值这种作弊能零告警通过。这两块直接决定“绿色”能不能信。

---

## 2. 逐维度评审

### D1 上手与引导 · 74（+14）

**修好的**
- 欢迎页有“试一个演示目标”（`Welcome.tsx:163`）。后端 `start_demo`（`lib.rs:658`）在数据目录下建一个小仓库，用随包的脚本引擎跑完“提问 → 自称完成 → 干净验证 → 待验收”全过程，不需要 Pi 和凭据，`tests/demo.rs` 在 CI 里覆盖了这条路径。
- 环境检查改成类型化的 `EnvIssueKind`：`pi_missing`、`pi_broken`、`pi_too_old`、`pi_untested`、`git_missing`、`no_sandbox`。第 1 轮靠 `includes("pi")` 做过滤的 bug 消失了。Pi 版本有下限，低于 1.4.0 时显示 ■ 加升级命令（截图 `welcome-np.png`）。
- README 第一屏如实写了“还没有签名版本，请从源码构建”。

**剩下的问题（按影响排序）**
1. **还是装不上。** 仓库私有，没有 release，没有 DMG，也没有 Homebrew。我的同事要先装 Rust、Node 22、pnpm、Xcode CLT，再 `pnpm build`。README 说“大约 5 分钟”，实际第一次冷编译会远远超过（本机增量构建都要 24 秒）。只要这一条不变，D1 就封顶在 80 以下。
2. **演示依赖 python3，但没有检查。** 演示引擎是 `demo_pi.py`（打包在 `tauri.conf.json` 的 resources 里），`start_demo` 只检查了 `node`（`lib.rs:663`）。在没装 CLT 的新 Mac 上，`/usr/bin/python3` 只是一个会弹出“安装开发者工具”的占位程序，点“试一个演示目标”的结果会是一个莫名其妙的暂停。`demoHint` 文案也只提到 Node.js。
3. **登录仍在应用外完成。** 0 个模型时的修复方式是复制一个 `pi`（`Welcome.tsx:137`），用户要自己开终端、敲 `/login`。对比之下，Claude Code 桌面版和 Codex App 在应用里点一下就能完成 OAuth。至少要提供“在终端中打开并运行 pi”的按钮（`open -a Terminal` 加预填命令），或者直接引导填写 `*_API_KEY`。
4. **没有首个目标向导。** 快速路径依赖检测到的测试命令，但不会在 base 上先试跑一次。如果这条命令在 base 上就跑不起来（缺依赖、缺 `.env`），用户要等第一次验证进入 `VerifyEnvError` 才知道。
5. 演示按钮是 ghost 样式，排在主按钮左边（`Welcome.tsx:163`）。对没装 Pi 的新用户来说，演示才是唯一能走通的路，应该是主按钮。

**要超过 95**
- 签名、公证的 DMG 加 `brew install --cask tower`，首次启动不需要右键打开。
- 环境检查加 `python3`（或者把演示引擎改写成 Node 或 Rust，彻底去掉这个依赖）和 `node` 两项，演示在依赖缺失时禁用按钮并显示原因。
- 应用内登录：检测到 0 个模型时，弹出“选择提供方 → 打开终端运行 `pi /login`”，或者“粘贴 API key → 写入登录 shell 的提示”。
- 添加仓库后自动在 base 上试跑一次检测到的测试命令（沙箱中，限时 120 秒），结果显示在项目卡上：“npm test 在 base 上 2 失败 / 0 通过，可以作为红灯标准”。

---

### D2 核心流程完整度 · 78（+10）

**修好的**
- **重叠雷达**：每 15 秒记录各目标改了哪些文件，标题下显示“◇ 与 G-0003 改动重叠 · src/cart.js”（截图 `goal-G-0001-zh.png`）。验收时用 `git merge-tree` 预判冲突。2026 年的主流产品都还没有做到“合并前就提示重叠”（第 3 节）。
- 推送后每分钟读取 PR 的状态和检查结果，`PrLine` 会写出失败检查的名字（`Pr.tsx`）。
- 删除行可以批注，发给 Agent 时带旧行号（`Review.tsx:37-41`）。
- 侧栏的“已结束”可以展开（`Sidebar.tsx:111-120`）。
- 目标页按状态裁剪：待验收时，“接下来”是一个“评审 1 个文件 R”的按钮；暂停时页面上只有一个输入框（截图 `goal-G-0004-zh.png`）。

**剩下的问题**
1. **CI 失败之后没有出路。** 推送后看得到“检查 ■ 2 · lint、test-e2e”，但目标已经封存成分支，没有“把失败发回 Agent 返工”的路径，也不会读取 PR 评审评论。Claude Code 的 auto-fix、Conductor 把失败检查转发给 Agent、Cursor 的 Bugbot Autofix 都已经闭环（第 3 节）。
2. **没有回退或检查点。** 返工跑坏了，只能放弃，或者手动处理卫星工作区（`docs/17` §17.4 承认）。Codex 支持按文件、按 hunk 撤销。
3. **塑形（让 Agent 起草合同）没有实现**（`docs/17` §17.5）。合同的验收命令、范围 glob、预算都要自己写。我每天开 3–5 个任务，写合同的成本直接决定我会不会用合同路径。
4. 暂停页仍然显示“接下来：Agent 还没有说明下一步”（`goal-G-0004-zh.png`）。暂停时，下一步就是上面的决策卡，这一块是多余的。
5. 运行计数会因重启而膨胀。预览数据里的 G-0002 显示“当前步骤 · 第 84 次运行”：每次应用退出都会把运行中的目标以 `AppQuit` 暂停，再次启动时继续，于是开一次新运行（`lib.rs:378-412`）。用户会以为 Agent 返工了 84 次。

**要超过 95**
- PR 检查失败时生成一张“CI 失败”决策卡，选项是“发回 Agent（带失败日志的尾部）/ 忽略”。发回时，从已封存的分支开一个新目标版本（合同 v2，自动带上失败信息）。
- 运行区块的每一行 R-xx 加“回到这次运行开始时的快照”。被回退掉的改动保存为一个 ref，可以再恢复。
- 合同塑形：输入一句话后，Agent 在只读模式下扫一遍仓库，提议标准命令、范围和预算，用户逐条勾选。
- 运行计数只统计“Agent 真正开工”的次数。因应用退出而恢复的运行记为同一次运行的续段，显示为“R-03（续）”。

---

### D3 可信度与诚实 · 79（−1）

这一维的分数基本持平，但构成变了：加了分，也发现了新的漏洞。

**加分**
- **红 → 绿**（`verify.rs:231-266`）：验证通过后，后台在 base 的干净检出上把每条机器标准再跑一遍。在 base 上本来就通过的标准，标为“不能证明完成”。demo 数据中 C1、C2 在 base 上都失败，算作区分性证据。竞品没有这一项。
- 哨兵扩展了：同一个文件里测试用例数减少、`skip: true`、`.skipIf(`、`this.skip()`、xfail、永真断言、提前 `return`、`if(false)`（`sentinel.rs:47-109`）。合同编辑器会提示“只检查文本或文件存在”的标准。
- 验收面板列出全部未决项：未确认的假设、哨兵（severity ≥3 标红）、未看过的单元（`Review.tsx:1033-1035`）。第 1 轮说的“假设被静默撤回”修好了。
- 说法、观测、事实三者在界面上依然分得很清楚。账本中“C3 本地 npm test 通过 → 无依据”这一类判定仍然有价值（`goal-G-0001-zh.png`）。

**新发现与仍存在的问题（按影响排序）**
1. **实测：改断言期望值，零告警通过，而且会被标成“红 → 绿”。**（真实模型 ②）
   - Agent 只改了 `test/cart.test.js` 的一行：`17 → 11`。断言数减 1 加 1，测试用例数不变，没有 skip 也没有 return，所以 `scan()` 没有任何命中。
   - 这次修改也不在评审风险里：`review.rs` 只对删除测试或测试变少报风险。
   - 更糟的是，这类改动在 base 上失败、在 pin 上通过，在“红 → 绿”的判定下**恰恰会被当成最强的证据**。在这个场景里，诚实语法给出了反向信号。
   - 这是“看起来通过”最常见的形态（EvilGenie 等基准中最高频的作弊之一），对一个以“抓住看起来通过的坏结果”为卖点的产品，这是核心缺口。
2. **验证环境里有 Agent 可写的状态。** 设计层面缺一条不变式：“验证进程能读到的一切，除了被验证的那棵源码树，Agent 都不能写”。
   - 现状：`jail()`（`run.rs:118-152`）为 Agent 和验证器（`verify.rs:290-291`）准备的是**同一个**目标私有缓存目录 `goals/<id>/cache`。它由 `caches::env` 注入为 `CARGO_HOME`、`GOMODCACHE`、`GOCACHE`、`UV_CACHE_DIR`、`XDG_CACHE_HOME` 等，而且对 Agent 可写。
   - 其中一些生态的缓存目录同时也是**工具配置目录**（例如 cargo 会从 `CARGO_HOME` 读取配置），另一些存放的是解包后不再校验的依赖源码或构建产物。
   - 后果：Agent 可以在运行期间改变验证命令的执行方式或执行内容，“干净检出”只在源码树这一层是干净的。这一类风险属于“验证结论可以被被验证者影响”，直接打在产品的立身之本上。
   - 修法见下。
3. **验证的准备阶段联网执行 Agent 写的代码。** `verify.rs:290` 为准备命令开的是 `network = true` 的 jail，而准备命令（`pnpm install`、自动检测的安装命令等）会执行 pin 中由 Agent 修改过的清单和生命周期脚本。这一条在 D12 详谈；对 D3 的影响是，验证阶段的行为并不只由用户的合同决定。
4. 哨兵仍然是文本规则（`docs/17` §17.4 和 SECURITY.md 都承认）。其他漏网形态包括：
   - Rust 的模块内测试：`src/*.rs` 里的 `#[cfg(test)]` 不是测试路径，`is_test_path` 认不出来，所以 `#[ignore]` 不报。
   - 把测试文件改名，让运行器不再匹配它。
   - `pyproject.toml` 里的 `addopts`、`Cargo.toml` 或 `Makefile` 中的测试目标，都不在 `TEST_CONFIGS` 里。
   - 测试辅助文件（例如 `test/setup.js`）里的全局提前退出。
5. **观测的匹配方式过宽。** `observe()` 用 `command.contains(crit)` 判断（`run.rs:646-656`），`npm test | tail` 或 `echo npm test` 都会被记为一次观测。观测不计入“已验证”，危害有限，但账本的“一致”判定会因此被抬高。

**要超过 95**
1. **“旧测试跑新代码”哨兵**（语言无关，最有价值）：
   - 再做一次干净检出，取 pin 的源码，但**把所有测试路径恢复成 base 的版本**，然后再跑一遍标准。
   - 如果 pin 通过而这次失败，说明是测试改动让它通过的：标为高严重度，并在评审中把对应的测试文件排到第一个单元，风险原因写成“测试期望被修改”。
   - 同时只用 pin 上新增的测试，在 base 上做红 → 绿判定。只有“新测试在 base 上失败、在 pin 上通过，且旧测试在 pin 上仍然通过”，才显示为区分性证据。
2. **验证器的环境里不能有 Agent 写过的东西。**
   - 每次验证从**用户自己的缓存**重新做一份写时复制的克隆，放进验证专属的缓存目录，用完删除。绝不使用 Agent 的缓存。
   - 工具配置类的目录（`CARGO_HOME/config*` 一类）由 Tower 生成或从用户主目录复制，Agent 不可写。
   - 加一个回归测试：Agent 的沙箱写入了 `goals/<id>/cache`，断言验证进程看不到这些写入。
3. 哨兵补充以下规则：
   - 断言参数变化：同一行的断言只改了字面量期望值时，报 severity 2，并进入评审风险。
   - 识别 Rust 模块内测试，把 `#[cfg(test)]` 所在文件按测试文件处理。
   - 测试文件改名报 severity 3。
   - `pyproject.toml` 的 `[tool.pytest*]`、`Cargo.toml` 的 `[[test]]` 和 `Makefile` 的 `test:` 目标，都纳入“测试配置变更”。
4. 观测只在命令**恰好等于**标准命令（去掉首尾空白，允许前置 `cd <workspace> &&`）时才记录。带管道或重定向时记为“观测（不完整）”。

---

### D4 注意力管理 · 80（+12）

**修好的**
- 侧栏拆成“需要你 2 / 待验收 2”，Dock 角标只计阻塞项（`src-tauri/src/lib.rs:45-72`）。第 1 轮说的口径问题解决了。
- 通知以目标标题为题，正文写“种类 · 标题”（`lib.rs:94`）。下次回到前台时，打开最近一条通知对应的目标（`pending_open`、`on_focus`）。
- 破坏性选项要按两次：第一次按下进入 2 秒的待确认状态（`DecisionCard.tsx:9,35-47`）。数字键和鼠标走的是同一套逻辑。
- 假设卡改为“批准 / 驳回”两个按钮，各自带上说明，并有一行提示“‘批准’和‘驳回’都会带上这段说明”（`overview-zh.png`）。
- 概览顶部就是可以直接作答的决策队列。

**剩下的问题**
1. **没有免打扰、稍后提醒或按目标静音。** 同时跑 5 个目标、我在开会时，唯一的办法是关掉 macOS 通知。
2. **“回到前台就跳转”有误伤。** `pending_open` 只记最近一条通知。如果我收到通知后没有点它，而是半小时后通过 ⌘Tab 回来做别的事，界面会被拉去那个目标。macOS 通知的点击回调确实不好拿，但至少应该限时（例如 2 分钟内回到前台才跳转），或者只在通知中心点击之后才跳转。
3. 待验收的条目没有批处理入口，比如“依次评审全部待验收”（类似 Codex 的 review 队列）。
4. 没有手机端或远程审批（见 D16）。目标一旦停在“需要你”，我必须回到电脑前。

**要超过 95**
- 设置中加“专注时段”：只发提问和审批的通知，其余进收件箱。每个目标的 `⋯` 菜单中加“静音这个目标的通知”。决策卡加“1 小时后提醒”。
- 前台跳转只在通知发出后 120 秒内回到前台时生效，否则只在侧栏把该目标高亮 3 秒。
- 收件箱加“开始评审队列（R）”：按风险依次打开待验收目标的评审页，验收或要求修改之后自动跳到下一个。

---

### D5 评审体验 · 80（+20）

本轮进步最大的一维。截图：`review-G-0001-zh.png`、`review3-en-light.png`。

**修好的**
- **词级高亮**：`+` → `*` 只有一个字符的变化也被准确框出来（`worddiff.ts` 加单测）。
- **展开上下文**：每次 20 行，或“全部展开”；可以从任一侧取文件内容（`api.file_text`）。还有“整个文件”切换。
- **并排视图**：⌥V 切换，偏好按目标记住，窗口宽度不低于 1280px 时可用。
- **删除行可批注**，带旧行号。
- **验证读数（E）**：不离开 diff 就能看每条标准的输出尾部。
- 评审状态（已看、草稿、上次评审的 pin）**进了 SQLite**，并且会从旧的 localStorage 迁移一次（`reviewState.ts:50-82`）。第 1 轮说的“不同数据目录串用 G-0001 的状态”解决了。
- 底部快捷键条和 `?` 速查表。

**剩下的问题**
1. **不能在 diff 中直接操作改动。** 不能按 hunk 回退或接受，不能在 diff 里直接改一个字（Conductor 0.84 支持在 diff 中编辑，Codex 支持按 hunk 暂存和撤销）。“这一处我自己改一下就好”的场景现在只能用要求修改发回 Agent，然后等一轮。
2. **测试改动没有风险提示。** 作弊探针中，唯一的改动就是测试期望值，评审单元却没有任何风险原因（见 D3.1）。评审的风险排序应当是哨兵之外的第二道防线。
3. **行号按钮 `tabindex="-1"`**（`Review.tsx:818-862`），纯键盘用户无法在某一行开始批注，只能用文件级的“批注”。
4. 没有按文件或路径过滤，也没有文件树。几十个文件的 diff 只能靠 J/K 一个单元一个单元地走。
5. 批注不能附带建议代码（类似 GitHub 的 suggestion 块）。转向的精度只能靠文字描述。

**要超过 95**
- 每个 hunk 头加“撤销这一块”（写回工作区，记为一次人工改动，下次验证重新 pin）。在 diff 内允许小幅编辑，保存后视同人工提交并触发重新验证。
- 测试文件中如果有断言字面量被改，单元风险原因写“测试期望被修改”，风险值 3，排到最前。
- 行号按钮可以聚焦：用 `↑`/`↓` 在行之间移动，`C` 在当前行开始批注。
- 评审页左侧加可折叠的文件树（宽 220px，显示 +/−），支持 `⌘P` 按路径跳转。
- 批注支持 ```` ```suggestion ```` 块，发给 Agent 时附上原始行和建议行。

---

### D10 性能与响应 · 78（+6）

**修好的**
- `tools/bundle-budget.sh` 进了 CI：启动 JS 预算 80 KB，实测 66.8 KB gzip。评审、设置、合同编辑器按需加载，只有 18 KB。
- 轨迹事件改为 100ms 批量推送（`supervisor/lib.rs:336`），前端也是批量追加并分页加载更早的条目（`Trace.tsx:61-90`）。
- 哨兵有大 diff 的扫描性能测试（`large_diffs_scan_quickly`）。
- 依赖缓存用 APFS 写时复制做种子，验证不必每次都从零下载。

**剩下的问题**
1. **轨迹没有虚拟化**：DOM 随事件数线性增长。一个跑了 1 小时、上千次工具调用的目标，Watch 模式仍然会越来越重。
2. 目标页在任何事实事件后的 400ms 内**整页重拉** `api.goal`（`GoalPage.tsx:33-41`）。4 个目标并行、事件密集时，开着的目标页会频繁重建。
3. Store 仍然是 `Mutex<Store>` 加同步 SQLite 调用，在 tokio 线程上执行（`supervisor/lib.rs:99-113`）。
4. **没有实测基准**：冷启动到首帧、5000 行 diff 的首屏、1 万条轨迹的滚动帧率，都没有数据，也没有阈值。
5. **文档数字不一致**：`docs/17` §17.1 仍写“打包后 JS 约 38 KB（gzip）”，README 写约 67 KB，实测 66.8 KB。

**要超过 95**
- 轨迹改用虚拟列表（固定行高 28px，overscan 20），首屏只渲染可见部分；目标页改为增量补丁（`UiUpdate::GoalDetailPatch`）。
- Store 放到专用线程，命令通过 channel 传递。
- 新增 `bench/`，在 CI 里设阈值：冷启动到可交互 ≤ 600ms（M1）；5000 行 diff 首屏 ≤ 150ms；1 万条轨迹滚动 ≥ 55fps；4 个目标并发时界面事件处理 p95 ≤ 16ms。
- 修正 `docs/17` 的包体数字，或者直接引用 `bundle-budget.sh` 的输出。

---

### D11 稳定性与错误处理 · 79（+11）

**修好的**
- 后台失败统一走 `run::report`（`run.rs:945-955`）：写入 EngineError，弹出错误 toast，再以 `PauseReason::Internal` 暂停并给出出路。第 1 轮说的 `finish_submitted` 和预算暂停里的 `let _ =` 已经改掉。
- 锁中毒可以恢复：`unwrap_or_else(PoisonError::into_inner)`，`.expect("… lock")` 只剩 1 处。
- 预算在每条助手消息结束时就检查（`run.rs:489-492`），不再等整轮结束。
- 验证失败时，先暂停，环境错误不计为标准失败。
- 启动失败页有“重试”和“打开数据目录”（`App.tsx:66-93`）。有活动日志面板（`Activity.tsx`，`role="log"`）。

**剩下的问题**
1. 运行计数随重启膨胀（见 D2.5）。重启时恢复的运行会重新注入合同吗？会消耗模型调用吗？用户看不到区别。
2. `report_stall` 里仍然有 `let _ = inner.append`、`let _ = inner.open_inbox`（`run.rs:409-410`）。失败时“可能卡住”的提示会悄悄消失。
3. 验证完成后清理检出用的是 `let _ =`（`verify.rs:163,264`）。清理失败时，磁盘上会残留 `verify/` 目录，也没有任何提示。磁盘满的处理仍未实现（`docs/17` §17.5）。
4. 复合操作中只有部分是单事务的：`events.rs` 中“事件加投影”在一个事务里，但 `OVERRIDE_SENTINEL` 这类跨多条事件的操作，我没有看到整体事务。
5. 没有“导出诊断包”：日志、最近的事件、环境检查结果打包成一个 zip，用来提 issue。

**要超过 95**
- 重启恢复的运行记为续段，并在轨迹中标明“Tower 重启后继续，没有重新发送合同”（如果实际上重发了，就如实写出来）。
- 去掉最后几处 `let _ =`，至少记一条 `tracing::error` 并弹出 toast。启动时扫描 `verify/` 和 `tmp/` 中的孤儿目录并清理。
- 检测可用磁盘空间，低于 2 GB 时暂停新的验证，并在侧栏底部显示提示。
- `设置 → 关于 → 导出诊断包`：脱敏后的日志、最近 500 条事件、环境检查结果。

---

### D12 安全与隔离 · 70（+28）

第 1 轮的头号问题修得很扎实。剩下的问题集中在“验证阶段”和“共享目录”两个边界上。（按任务要求，以下只描述设计层面缺了哪条规则、会造成哪一类危害，不给出利用步骤。）

**修好的**
- **默认拒绝的 Seatbelt**：底座改编自 Codex 的配置（`seatbelt_base.sbpl`，`(deny default)`）。读取规则是“系统可读，但 `/Users`、`/Volumes` 和主目录除外，再加白名单”。15 类凭据路径**即使在白名单里**也再拒绝一次（`sandbox.rs:82-98`）。
- **`read`、`edit`、`write` 也在沙箱中**：每次文件操作都是 `sandbox-exec` 下的一个子进程（`sandboxfs.ts`）。`real_pi` 测试证明 `read ~/.ssh` 会被拒绝。
- **默认断网**：只允许回环；本机常见代理端口和 `*_proxy` 指向的端口一并拒绝；只允许连接自己目录里的 Unix socket，`docker.sock` 不可达。以上都有真实的 `sandbox-exec` 测试（`sandbox.rs:307-357`）。
- **缓存按目标私有**，用 CoW 做种子，用户自己的 `~/.cargo`、`~/.npm` 不再可写（`caches.rs`）。
- Pi 用固定的工具白名单启动，关掉了 MCP 和仓库自带的 Pi 资源。
- 泄露截图已从历史中清除；截图脚本改为按窗口 id 截取。

**剩下的问题（按影响排序）**
1. **“默认断网”在验证的准备阶段对 Agent 写的内容不成立。**
   - 现状：准备命令总是联网（`verify.rs:290`，`run.rs:346`）。验证阶段的准备命令运行在 pin 的检出上，所以它会执行 Agent 改过的依赖清单、生命周期脚本和构建脚本。
   - 这个阶段还能读到工作区的全部源码，以及用户配置的本地文件（例如 `.env`，在 `verify.rs:156` 处、准备命令之前就复制进来了）。
   - 缺失的规则：**一个阶段只要执行了 Agent 写的内容，它的网络权限就不能超过合同授予 Agent 的权限。**
   - 造成的危害：在合同禁止联网时，私有源码和本地密钥仍可能被外发。
   - 另外，SECURITY.md 的“Known limits”写的是“准备阶段的恶意依赖可以联网，但读不到你的凭据”。这句话没有提到被执行的是 Agent 写的内容，也没有提到 `.env` 一类本地文件就在可读范围内，**描述不完整**。
2. **验证器与 Agent 共享可写状态**（见 D3.2）。缺失的不变式：“验证环境中，除被验证的源码树外，不能有任何 Agent 可写的内容”。危害有两类：一是“验证结论被操纵”；二是 Agent 写入的配置会在**联网的**准备阶段被执行。
3. **系统临时目录是双向共享的。**
   - 写白名单包含整个 `/private/var/folders`（`sandbox.rs:208`），而读取规则只排除了 `/Users`、`/Volumes` 和主目录。
   - 这个目录树里有用户自己（非沙箱）进程的 `$TMPDIR` 和 `DARWIN_USER_CACHE_DIR`，存放各种应用的临时文件和编译器模块缓存。
   - 缺失的规则：沙箱只能写“自己的”临时目录（Tower 已经为每个目标生成了私有 `TMPDIR`，所以这条放宽并没有必要）。
   - 危害：一是读到其他应用留下的临时文件；二是在用户的非沙箱工具链会使用的缓存里**投毒**，从而越出沙箱执行。性质与第 1 轮说的 `~/.cargo/registry` 相同，只是换了位置。
4. **读取规则是“拒绝名单”，不是白名单。** 除 `/Users`、`/Volumes` 和主目录之外，整个文件系统可读：`/private/tmp`、`/opt/homebrew/etc`、`/usr/local/etc`、`/Library/Application Support` 中的系统级配置、其他应用写在共享位置的数据库或令牌。README 说“只看得到自己的工作区”，事实是“看不到你的主目录，但看得到主目录以外的大部分东西”。
5. **允许联网时，钥匙串服务可达**（`seatbelt_network.sbpl:20`，因为 TLS 校验需要）。`sandbox.rs:16-18` 的注释说“不会同时允许读取钥匙串文件”，但钥匙串条目是由服务端进程代为读取的，文件不可读并不能阻止这一路径。对 ACL 信任某些系统二进制的条目（例如 git 凭据助手写入的条目），这里存在被取出的可能。这一点我**没有验证**，属于设计风险。缓解办法是：对需要联网的阶段，只放行信任评估相关的服务，不放行完整的 SecurityServer；或者在 UI 上把“允许联网”的说明写成“同时可能访问钥匙串”。
6. bash 门禁仍是正则（`policy.ts`）。现在有沙箱兜底，危害主要是“谨慎”档位的审批判定可能被绕过，严重度不高。
7. 窗口的权限 `opener:allow-open-path` 没有限定范围（`capabilities/default.json`），唯一的用途只是打开数据目录（`App.tsx:81`）。按最小权限原则，应该限定在数据目录内，或者改走一个 Rust 命令。CSP 很严，所以这一条风险低。
8. 加载用户全部 Pi 扩展时，扩展在沙箱外以用户权限运行，仍然只有一个开关，没有逐个扩展的清单确认。

**要超过 95**
1. 准备阶段的网络与“内容来源”绑定：
   - 只有当 pin 相对 base **没有改动**清单、锁文件、生命周期脚本时，准备阶段才联网。
   - 如果有改动，先出一个决策卡，“依赖清单被改动：允许联网安装？”，并列出 diff；或者在断网状态下只用缓存安装（`--offline`、`--frozen-lockfile`）。
   - 本地文件（`.env`）推迟到准备阶段结束之后、标准命令执行之前才复制进来。
2. 验证缓存每次从用户缓存重新做 CoW 克隆，用完丢弃；Agent 的缓存永不进入验证。
3. 写白名单去掉 `/private/var/folders`，只保留目标私有的 `TMPDIR`。读取规则在 `/private/tmp`、`/private/var/folders` 上改成只允许目标自己的子路径。
4. 读取规则改成真正的白名单：系统目录、工具链、工作区、私有目录、`spec.read`。`/opt/homebrew/etc`、`/usr/local/etc`、`/Library/Application Support` 默认拒绝。
5. 加一组安全回归测试：
   - 验证进程看不到 Agent 对缓存的写入；
   - 联网的准备阶段在清单被改动时不会自动执行；
   - 沙箱进程写不了 `DARWIN_USER_CACHE_DIR`；
   - 允许联网时，钥匙串条目查询失败。
6. 扩展信任清单：列出每个扩展的来源、哈希和声明的能力，逐个确认；哈希变化后重新确认。

---

### D13 代码架构与可维护性 · 80（+6）

**修好的**
- 结构化类型取代字符串匹配：`EnvIssueKind`、`OptionTone`、`PrStatus`、`Overlap`，都由 ts-rs 生成。
- 两端都有 i18n：`tower-core/src/i18n.rs` 的 `tr!`，`lib/i18n.ts` 有 1396 行、605 处中文条目。前端组件里只剩注释和语言名称还有中文。
- 标签集中到 `labels.ts`。`caches.rs`、`demo.rs`、`text.rs`、`diffview.ts`、`worddiff.ts`、`fuzzy.ts` 都是小而纯的模块，并且有测试。
- 注释质量依旧很高，写的是“为什么”。

**剩下的问题**
1. `DecisionCard.tsx:32` 仍用正则剥掉“已暂停：”“Paused:”这类标题前缀。正确的做法是后端分别返回 `kind` 和标题正文。
2. 体量：`run.rs` 1100 行，`supervisor/lib.rs` 1037 行，`Review.tsx` 1147 行，`app.css` 2964 行，`i18n.ts` 1396 行（中英两套写在同一个文件里）。
3. `jail()` 同时负责缓存准备、环境变量和配置文件生成，“验证”和“Agent”两种用途共用一个函数，正是 D3.2 的结构性根源。
4. `docs/` 仍有 16 MB、500 多个评审文件。`docs/17` 是唯一可信的实现说明，但其中的数字已经过时（D10.5）。

**要超过 95**
- 把 `run.rs` 拆成 `run/{start,events,budget,stop,stall}.rs`。拆分 `Review.tsx`：`ReviewPage`、`DiffTable`、`AcceptPanel`、`CommentComposer`。
- 用类型把 `Jail` 分成 `AgentJail` 和 `VerifierJail`，在类型层面禁止验证器拿到 Agent 的缓存路径。
- i18n 拆成 `locales/{zh-CN,en}.ts`，加一个 CI 检查：两种语言的键完全一致（现有的 `i18n.test.ts` 可以扩展）。
- 归档 `docs/reviews/round-*` 到 `docs/archive/`。`docs/17` 顶部加“设计 ↔ 实现”状态表，由 CI 校验其中引用的符号存在。

---

### D14 测试与质量保障 · 79（+15）

**修好的**
- **真实 Pi 进了 CI**（`ci.yml` 安装 pi@1.4.0，日志确认已运行）。
- 沙箱生效测试覆盖：凭据、其他项目、共享缓存、工作区外写入、直连网络、经本机代理联网、docker.sock、`.git/config`。
- `real_pi` 覆盖：`read ~/.ssh` 被拒绝，白名单外的工具不存在，`*_API_KEY` 被剥除。
- 前端引入 vitest，22 个测试：diffview、format、fuzzy/拼音、i18n 两种语言的键一致、worddiff。
- demo 的端到端测试 `the_demo_runs_without_pi`；包体预算；`cargo fmt` 和 `clippy -D warnings`。

**剩下的问题**
1. **没有组件测试，也没有 UI 端到端测试。** `DecisionCard` 按两次确认、`AcceptPanel` 未决项、`Overview` 决策队列这些关键交互，全靠人工。
2. **安全回归缺少验证阶段这一侧**：D12 的 1–3 条和 D3.2 都没有测试。
3. **哨兵绕过样例很少**：`sentinel.rs` 只有几组正例，没有像作弊探针这样的“应当命中”样例集。
4. 本轮 CI 有过一次失败（拼音依赖 Intl 排序规则）。说明测试运行环境（Node ICU）与产品运行环境（WebKit）之间有差异，而 WebKit 侧没有任何自动化测试。

**要超过 95**
- 用 `@solidjs/testing-library` 为 `DecisionCard`、`AcceptPanel`、`CommandPalette`、`Review` 的批注流程写组件测试。用 `tauri-driver` 跑 3 条冒烟流程：演示 → 评审 → 验收。
- 新增 `crates/tower-core/tests/sentinel_corpus/`：每种作弊一个 diff 夹具，至少 25 个，包括改期望值、模块内 `#[ignore]`、测试文件改名、`pyproject` addopts、提前退出的 setup 文件。
- 把作弊探针做成 `real_pi` 风格的固定剧本测试：脚本化模型执行“改期望值”，断言目标进入暂停，而不是待验收。
- 加验证隔离测试，见 D12 修复 5。

---

### D15 开源项目成熟度 · 62（+10）

**修好的**：截图泄露已清除（历史里也没有了），截图脚本按窗口 id 截取，失败就退出；README 安装段如实写“从源码构建”；CHANGELOG 记录了全部变化；SECURITY.md 新增“Known limits”；CONTRIBUTING 给出了“改什么去哪里”的表。

**剩下的问题**
1. **仓库私有，0 个 release，0 个 tag**，`release.yml` 产出的仍是未公证的草稿。这一条不变，外部用户等于不存在。
2. `docs/17` §17.1 的“约 38 KB”与 README 的 67 KB 矛盾（D10.5）。SECURITY.md 对准备阶段的描述不完整（D12.1）。对一个以诚实为卖点的项目，文档准确是基本要求。
3. 没有自动更新（Tauri updater），没有 ROADMAP，没有 issue 标签（good first issue），没有讨论区。
4. CONTRIBUTING 仍然让新人先读 `docs/00` 和 1.2 MB 的 `docs/15-decision-log.md`，没有“30 分钟上手路线”。

**要超过 95**：公开仓库；发布签名并公证的 v0.2.0（universal DMG），提供 Homebrew cask 和 Tauri updater；修正两处文档；加 ROADMAP.md 和 10 个 good first issue；CONTRIBUTING 加上手路线：`docs/17` → `lifecycle.rs` → `verify.rs` → 跑 demo。

---

### D16 竞争力 · 70（+6）

（详见第 3 节。）本轮检索确认，**截至 2026-10，没有任何主流产品由 harness 自己在干净检出中重跑验收标准，也没有内置的测试篡改哨兵**。只有一些小众 CLI 接近，比如 Critique 和 Nom Army。Tower 的护城河仍然存在。另一方面，行内批注发回 Agent、PR 和 CI 自动修复、手机端远程控制、本机 Seatbelt 沙箱，都已经成了标配。

**扣分的原因（按我这个用户会不会因此不用来排）**
1. **只支持 Pi。** 我已经为 Claude Max 和 ChatGPT Pro 付了费。Conductor 同时托管 Claude Code、Codex、Cursor Agent、OpenCode。Tower 的合同、验证、哨兵如果能作为“任何引擎之上的信任层”，价值会翻倍。
2. **没有云端、远程和手机端。** Conductor iOS（0.90）加远程控制（0.92），Cursor iOS 远程控制，Codex iOS Remote，Claude Dispatch。Tower 退出就暂停，等于把我拴在电脑前。
3. **没有视觉证据。** Cursor 在 PR 里附视频和截图，Claude 的 auto-verify 用浏览器面板，Antigravity 有录屏。Tower 对 UI 类任务的“已验证”只能靠命令。
4. PR 之后没有闭环（D2.1）；不能在 diff 中编辑（D5.1）；没有定时任务和自动化（Codex automations、Claude Routines）。
5. 第 1 轮的“原生简体中文”优势还在，但在缩小：Claude 桌面版开始出现中文菜单（Code 标签页仍是英文），TRAE SOLO 是原生中文。

---

### D17 可访问性与国际化 · 76（+38）

**修好的**
- **完整的中英双语**：界面、原生菜单、通知、决策卡、错误、简报、评审风险原因、哨兵标题、扩展的审批提示都已翻译。新安装跟随 macOS 语言。决策卡的选项按含义匹配，用任一语言回答都有效（`answers_match_options_in_either_language`）。
- `Overlay` 有 `role="dialog"` 和 `aria-modal`（`ui.tsx:275`）；错误 toast 用 `role="alert"`（`Chrome.tsx:95`）；字段错误也用 `role="alert"`；状态图形用 `role="img"` 加 aria-label；命令面板是 combobox 加 listbox 的完整语义。
- 设置中有“界面大小”。
- 深色主题 text-4 约 5.2:1，浅色主题 text-3 约 5.2:1（`tokens.css:84,142`）。

**剩下的问题**
1. 浅色主题 `--text-4` 约 **4.0:1**，仍然用于“行号的空闲状态”（`tokens.css:143`）。行号同时是批注入口，低于 WCAG AA 的 4.5:1。
2. 行号按钮 `tabindex="-1"`（D5.3），键盘和读屏用户不能在指定行开始批注。
3. 诚实语法的读屏等价表达：`Claim` 组件有“Agent 称”的可见文字，但虚线框表示“观测”，靠的是视觉，“观测”两个字只在徽标里出现，我没有在 DOM 中看到给读屏的“未计入已验证”说明。这一条没有用 VoiceOver 实测。
4. 读屏只在 Chrome 预览里看了 DOM，**没有在 WebKit 加 VoiceOver 下实测**。Tauri 的 WKWebView 与 VoiceOver 的组合有自己的坑。
5. 写入事件的文字保留创建时的语言（`docs/17` §17.3.1），所以切换语言后，旧的决策卡标题仍是中文（截图 `review3-en-light.png` 的侧栏里，英文界面中的标题是中文）。用户的目标标题保持原文是合理的，但系统生成的标题（例如“待验收：…”）应该在读取时生成。

**要超过 95**
- 浅色 `--text-4` 调到 `oklch(0.555 …)`（约 4.6:1），或者行号直接用 text-3。
- 行号可以聚焦，并实现 D5 中描述的键盘批注流程。
- 每个事实、观测、说法的 DOM 加 sr-only 前缀：“（已验证，Tower 测得）”“（观测，未计入）”“（Agent 声称）”。
- 用 VoiceOver 走完“概览 → 决策卡作答 → 评审批注 → 验收”，记录在 `docs/17` 中，并修复发现的问题。
- 系统生成的收件箱标题只存 `kind` 和参数，读取时按当前语言生成。

---

## 3. 与主流 harness GUI 的对比

本轮检索时间为 2026-10-26。没有注明的条目来自打开过的页面；标 [S] 的条目只来自检索摘要。

| 产品 | 隔离与并行 | 证据由谁产生 | 评审 | 注意力与移动端 | 多引擎 | 中文界面 |
|---|---|---|---|---|---|---|
| **Claude Code 桌面版**（[文档](https://code.claude.com/docs/en/desktop)） | 本地、云端、SSH、WSL 会话；可选每个会话一个 worktree；并排视图；有 Seatbelt 沙箱（[sandboxing](https://code.claude.com/docs/en/sandboxing)） | Agent 自己：auto-verify 在浏览器面板里截图和点击；`/code-review` 卡 | 点行批注，⌘↩ 一并提交 | 通知；Dispatch 推送到手机 | 只有 Claude | Code 标签页仍是英文（[#81913](https://github.com/anthropics/claude-code/issues/81913)） |
| **Codex / ChatGPT 桌面**（[review 文档](https://learn.chatgpt.com/docs/code-review?surface=app)、[changelog](https://learn.chatgpt.com/docs/changelog)） | worktree，本地、远程交接 | Agent 自己 `/review` | `+` 批注；按文件或 hunk 暂存和撤销 | iOS Remote [S] | 只有 OpenAI | zh-CN 只有部分可用（[#50867](https://github.com/openai/codex/issues/50867)） |
| **Cursor 3 Agents 窗口**（[论坛](https://forum.cursor.com/t/cursor-3-agents-window/156509)） | 本地、worktree、云 VM、SSH | 云 Agent 在 PR 里附视频、截图、日志（[02-24-26](https://cursor.com/changelog/02-24-26)）；Bugbot 加 Autofix（[04-08-26](https://cursor.com/changelog/04-08-26)） | 简化的 diff，暂存提交 | iOS 远程控制（2026-10） | 多模型 | 未证实 |
| **Conductor**（[changelog](https://www.conductor.build/changelog)） | worktree 加 Conductor Cloud | 把失败的 CI 检查转发给 Agent；Checks 标签 | 在 diff 中编辑（[0.84](https://www.conductor.build/changelog/0.84.0-edit-files-directly-in-diffs)）；标记已看 | [iOS 0.90](https://www.conductor.build/changelog/0.90.0-conductor-for-iOS)、[远程控制 0.92](https://www.conductor.build/changelog/0.92.0-remote-control) | Claude Code、Codex、Cursor、OpenCode | 未见 |
| **GitHub Copilot cloud agent**（[博客](https://github.blog/ai-and-ml/github-copilot/whats-new-with-github-copilot-coding-agent/)） | 云端；Agents 标签（[changelog](https://github.blog/changelog/2026-01-26-introducing-the-agents-tab-in-your-repository/)） | Agent 用 Copilot 评审自己的 patch，加代码、密钥、依赖扫描 | 就是 PR | GitHub Mobile | 可选 Claude 和 Codex [S] | 未证实 |
| **Augment Intent**（[指南](https://www.augmentcode.com/guides/ai-agent-pre-merge-verification)） | Mac 公测 | 独立的 Verifier Agent 按“活规格”逐条判定，但由 LLM 判断，**不在干净环境里重跑** | — | — | — | — |
| **Kiro**（[specs](https://kiro.dev/docs/specs/)）[S] | IDE | 用 EARS 写的验收标准生成属性测试（可选） | IDE | — | — | — |
| **TRAE SOLO**（[changelog](https://docs.trae.ai/ide/changelog?_lang=en)）[S] | 并行加子 Agent | 无独立验证 | IDE | — | — | **原生中文** |
| **Critique、Nom Army**（[Critique](https://www.critique.sh/blog/best-coding-agent-verification-tools-2026)、[综述](https://redreamality.com/blog/coding-agent-done-claims-verification-survey/)） | CLI | 在一次性的工作区或新沙箱里重新验证；Nom Army 会标记新出现的 skip 和 stub，但只标记、不阻止（未核对其仓库） | — | — | — | — |

**Tower 仍然独有（主流产品都没有）**
1. 由 harness 在干净检出中重跑验收标准，作为唯一的绿色；验收时再拍一次快照，与已验证的 pin 比对。
2. 哨兵阻止“看起来通过”的结果进入评审；红 → 绿基线。
3. 每个目标一份可执行的合同，Agent 改不了它。Kiro 和 Intent 的规格由 Agent 写，判定是可选的，或者交给 LLM。
4. 按风险排序的评审单元，其他产品都按文件排。
5. 合并前的重叠雷达。工作区类产品自己承认“worktree 不能防止合并冲突”（[Superset](https://superset.sh/compare/git-worktrees-for-ai-agents)）。
6. 完整的中英双语界面。主流产品里只有 TRAE 是原生中文。

**已经不再独有**：本机 Seatbelt 沙箱（Claude Code 和 Codex 都有），行内批注发回 Agent，推送后跟踪 CI。

**Tower 落后（按我的采用意愿排序）**
1. 多引擎（Conductor）；
2. 云端执行、手机审批与远程控制（Conductor、Cursor、Codex、Claude）；
3. 浏览器和视觉证据（Cursor、Claude、Antigravity）；
4. CI 失败自动修复，PR 评论回灌（Conductor、Cursor Bugbot、Claude）；
5. 在 diff 中编辑、按 hunk 撤销（Conductor、Codex）；
6. 定时任务和自动化（Codex、Claude Routines、Copilot）；
7. 签名分发、Windows 和 Linux。

**风险提示**：Nom Army 和 mustfail 这类开源 CLI 已经在做“新沙箱重验”和“回滚源码后再跑测试”。如果 Tower 不尽快补上“旧测试跑新代码”（D3 修复 1）和验证器隔离（D3 修复 2），护城河会被这些工具从下面掏空。

---

## 4. 优先修复清单（前 25 项，按用户影响排序）

| # | 修复 | 维度 | 工作量 |
|---|---|---|---|
| 1 | **验证器不得使用 Agent 可写的缓存或配置**：每次验证从用户缓存重新做 CoW 克隆，用完丢弃；在类型层面区分 `AgentJail` 和 `VerifierJail` | D3 D12 D13 | 中 |
| 2 | **准备阶段的网络与内容来源绑定**：清单、锁文件、生命周期脚本相对 base 有改动时，不自动联网（先出决策卡，或者离线安装）；`.env` 一类本地文件在准备阶段之后再复制 | D12 D3 | 中 |
| 3 | **“旧测试跑新代码”哨兵**：把测试路径恢复为 base 的版本再跑标准；红 → 绿只认 Agent 新增的测试 | D3 D16 | 中 |
| 4 | 哨兵补充：断言字面量变化、Rust 模块内 `#[ignore]`、测试文件改名、`pyproject` 和 `Cargo` 的测试配置；同时进入评审风险 | D3 D5 | 小 |
| 5 | 沙箱写白名单去掉 `/private/var/folders`，读取改为真正的白名单（`/private/tmp`、`/opt/homebrew/etc` 等默认拒绝） | D12 | 小 |
| 6 | 公开仓库，发布签名并公证的 DMG，提供 Homebrew cask 和自动更新 | D1 D15 | 中 |
| 7 | 修正 SECURITY.md 对准备阶段的描述和 `docs/17` 的包体数字，并加 CI 检查，保证文档与实现一致 | D15 D12 | 小 |
| 8 | PR 检查失败 → 决策卡“发回 Agent”，以合同 v2 继续；读取 PR 评审评论 | D2 D16 | 中 |
| 9 | 作弊样例库（至少 25 个夹具）加脚本化 real_pi 作弊测试，断言进入暂停 | D14 D3 | 中 |
| 10 | 验证隔离和准备阶段网络的安全回归测试 | D14 D12 | 小 |
| 11 | 演示检查 python3 和 node（或者去掉 Python 依赖），缺失时禁用按钮并说明原因；没有 Pi 时演示按钮改为主按钮 | D1 | 小 |
| 12 | 应用内登录引导（打开终端预填 `pi /login`，或填写 API key） | D1 | 小 |
| 13 | 评审：按 hunk 撤销，在 diff 内小幅编辑后自动重新验证 | D5 D16 | 中 |
| 14 | 运行计数不随重启膨胀，恢复的运行显示为续段，并说明是否重新发送了合同 | D2 D11 | 小 |
| 15 | 专注时段、按目标静音、“1 小时后提醒”；前台跳转限定在通知后 120 秒内 | D4 | 小 |
| 16 | 轨迹虚拟化，目标页改为增量补丁，Store 放到专用线程 | D10 | 中 |
| 17 | `bench/` 加 CI 阈值：冷启动、5000 行 diff、1 万条轨迹滚动 | D10 D14 | 中 |
| 18 | 组件测试（DecisionCard、AcceptPanel、Review 批注）加 tauri-driver 冒烟测试 | D14 | 中 |
| 19 | 行号可聚焦，支持键盘批注；浅色 text-4 调到 ≥4.5:1 | D5 D17 | 小 |
| 20 | 诚实语法加 sr-only 前缀；用 VoiceOver 在 WebKit 中实测一遍主流程 | D17 | 小 |
| 21 | 允许联网时只放行 TLS 信任评估相关的服务，不放行完整钥匙串服务；UI 如实说明 | D12 | 小 |
| 22 | 首个目标：添加仓库后在 base 上试跑测试命令，结果显示在项目卡上 | D1 D3 | 小 |
| 23 | 回退：每个 R-xx 可以回到这次运行开始时的快照 | D2 | 中 |
| 24 | 拆分 `run.rs`、`Review.tsx`、`i18n.ts`；`DecisionCard` 去掉正则剥前缀；`opener` 权限限定范围 | D13 D12 | 小 |
| 25 | 战略：ACP 或适配层接入 Claude Code 和 Codex 作为引擎，加手机端只读审批（局域网或 Tailscale） | D16 | 大 |

---

## 附录：顺手记下的 D6–D9 问题（不评分，交给设计审计）

- 评审页“文件其余部分 / 全部展开”用的是等宽字体，与周围的无衬线文字不一致（`review3-en-light.png` 右下角）。
- 运行中目标的实况列显示“当前步骤 · 第 84 次运行”，语义不清（D2.5）。
- 英文界面里，系统生成的标题和侧栏中的目标标题仍是中文，混排明显（`review3-en-light.png`）。
- 暂停页“接下来”区块与决策卡重复（`goal-G-0004-zh.png`）。
- 预算条在 $0.02/$8 时仍然读不出信息（`goal-G-0001-zh.png` 右栏），第 1 轮提过。
- 截图来自 headless Chrome，不是 WebKit。字体渲染和 `halt` 特性的效果需要设计审计员在真窗口里复核。
