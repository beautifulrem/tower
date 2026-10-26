# 对抗评审 · 第 6 轮

> **评审者**：独立对抗 Agent，未参与写作。
>
> **评审对象**：`docs/00`–`docs/16`、`README.md`、`research/pi-release-diff.md`、`research/git-isolation-experiment.md`；`reviews/round-5.md`、5 份第 5 轮回应、`round-5-lint.md`。
>
> **核对依据**：
> - Pi 发布标签 `v1.2.0`（`git -C research/pi-mono show v1.2.0:<path>`）。
> - 本机实验：git 2.56.0、macOS `sandbox-exec`，在 `/tmp` 中完成，结束后已删除。实验用 Seatbelt 档位逐条模拟 ADR-081 第 3 点的 gitdir 写入白名单：`*.lock` 取最宽松的“任意层级”解释，`refs/**` 等目录规则含目录本身。
>
> 行号以本轮读到的文件为准。

---

## 1. 总评

第 5 轮的阻断（R5-D11-01，`commondir` 重定向）已被 ADR-081 实质关闭。我复现确认：工作目录没有 `.git`、设置 `GIT_CEILING_DIRECTORIES` 后，沙箱外的 git 得到“not a git repository”。ADR-082 的读允许列表、ADR-084 的叠加态、ADR-085 的运行器内容哈希、ADR-086 的大文件，也都已落到正文。

但这次修订本身带出了一批新问题，其中三条已实测：

- **白名单过窄**：git 2.56 在 `revert`/`cherry-pick`/非快进 `merge` 中写 `AUTO_MERGE`（无冲突时也写），`rebase` 写 `REBASE_HEAD`，`stash` 写 `index.stash.<pid>`。这三个文件都不在白名单内，所以这些常用操作全部失败。而文档声称它们“照常工作”。
- **垫片泄漏 `GIT_DIR`**：垫片注入的 `GIT_DIR` 会被 `rebase -x`/`bisect run` 的子进程继承。子进程里测试执行的 `git init` 会重新初始化卫星 gitdir——这正是 ADR-088 要消除的危害。
- **Tower 的原始文件读写可被劫持**：Tower 在沙箱外对 Agent 可写的 gitdir 做原始文件写入和读取。Agent 把 `refs/heads/tower` 换成符号链接，就能让 Tower 的写入覆盖任意文件；把 `HEAD` 换成 FIFO，就能让 Tower 的读取阻塞。

此外：

- 人工编辑检出（`_human`）没有像检验检出那样的信任边界，IDE 打开即可在沙箱外执行 Agent 代码。
- 安装阶段带 `$VS` 写权限运行 Agent 可控代码，可以跨 Goal 投毒 depcache。
- 断网安装与“安装时下载”的包（浏览器、引擎）冲突。
- 重放包无界增长。
- 状态机在“我来改”与重建失败上仍有缺口。

本轮没有阻断级问题。

## 2. 评分表

| # | 维度 | 分数 | 一句话理由 |
|---|---|---|---|
| D1 | 原论述契合度 | 94 | R5-D1-01 已闭合；主视图仍是实况行加全局状态，没有回到聊天/Session 中心；“我来改”与就地编辑的口径已统一 |
| D2 | Pi 哲学契合度 | 91 | §0.5.1 差异表已改正并补齐；但 ADR-082 的读允许列表使用户级 Pi 技能脚本不可执行，`read.external=ask` 使每次加载 SKILL.md 都要人批准，差异表没有登记 |
| D3 | 论证与证据 | 95 | 论证体系稳定；但“提交、rebase、cherry-pick、gc 照常工作”（`11` L336）没有实验支撑（ADR-081 附录只测了 commit），且已被实测推翻 |
| D4 | 领域模型与生命周期 | 87 | 叠加态与持久化已落地；但 `goal.resume` 的分派与 `03`、ADR-084 有三处矛盾；在 `in_review`/`accepted` 下“我来改”没有转移；非 running 状态下重建失败的入口未定义 |
| D5 | Agent 架构与 Pi 集成 | 93 | 延迟构造、`normalizePath`、`createTransport`（v1.2.0 源码已核实存在）均正确；只剩 ADR-065 正文与 HTTP 传输的 `authProvider` 透传等小项 |
| D6 | 系统架构与可靠性 | 89 | 重放包规格已唯一化；但每次验证（含机会式与失败返工）都永久保留重放包与保留 ref，磁盘预算未计入，与 30 GB 上限冲突 |
| D7 | 诚实与验证 | 84 | 运行器内容哈希、Node 选择、127 处理都已落地；但补丁和 overrides 能让篡改后的运行器得到“一致”的 manifest；安装阶段能写整个 `$VS`；断网安装与浏览器/引擎下载冲突 |
| D8 | 注意力与交互 | 86 | 检验检出的信任提示、档位、端口已补；但人工编辑检出没有信任边界，“人工编辑中”在界面与模型中都不可见；`04` 与 `10` 的检验清理口径仍矛盾 |
| D9 | 视觉设计与美观 | 95 | `◍`、叠加态 `◇` 一致；只缺“人工编辑中”和 `alsoApplies` 的呈现，另有“人工编辑副本/检出”术语不一 |
| D10 | 性能 | 90 | ADR-086、丢事件处理与 `$SH` 复核预算已落地；运行器全量内容哈希、垫片每次调用的开销、重放包增长没有预算 |
| D11 | 安全与自主度 | 85 | 阻断已关闭，读允许列表与脱敏覆盖完整；新问题是沙箱外 Tower 对 Agent 可写 gitdir 的原始文件读写（已复现），以及 `_human`/`_inspect` 中 IDE 自动执行 Agent 代码 |
| D12 | 记忆与学习 | 92 | 消歧键已入数据模型与导出；拆分后记忆归属在 ADR-087 与 `09` §9.12 中直接矛盾 |
| D13 | 隔离、git 与并发 | 84 | 分离 gitdir 的方向正确，镜像保留 ref 设计严谨；但白名单使 merge/rebase/cherry-pick/revert/stash/bisect 全部失败，垫片向子进程泄漏 `GIT_DIR`（均已复现） |
| D14 | 路线图与可验证性 | 89 | 31 周算术、WBS 合计、节假日都核对无误；但“+1 人 → 26 周”违背 18.6 工作周的依赖链；SP6c 的时间窗与甘特图不符；SP6b 的容量偏紧 |
| D15 | 文档一致性与可执行性 | 86 | lint 的 (f)(g)(h) 检查有效；但仍有十余处跨文档矛盾或陈旧表述（见 R6-D15-01） |
| D16 | 创新与差异化 | 90 | 判定可审计的规格已唯一；但 depcache 淘汰后重放需要复现同一 manifest 哈希，原生构建不可复现，旧证据会大面积“不可重放”，且没有登记验证 |

---

## 3. 第 5 轮条目核验

状态：**已解决** / **部分**（已改，但不完整、有残留，或引入新矛盾）/ **未解决**。

| 条目 | 状态 | 备注 |
|---|---|---|
| R5-D1-01 | 已解决 | `04` §4.6.5 L512 默认只有 seal 分支，开启地标才有 `cp/<n>`，pin 永不进入；就地编辑不替人提交，trailer 只在 seal 时写；`04` L478、`02` L182、`10` L351、ADR-036 一致 |
| R5-D2-01 | 已解决 | (a) ADR-066 标题已加修订注；(b) C31（`05` L1373）与 L369 一致，源码确认 `user_bash` 只在 `interactive-mode.ts:7005`、`rpc-mode.ts:562` 发出；(c) `00` §0.5.1 L78–83 补齐 `!cmd`、git 扩展、无远端、钩子、`llama.cpp` 五行 |
| R5-D4-01 | 部分 | ADR-084 叠加态已进入 `03` L83、`05` L573、`10` 情形 E、`16`；DDL 的 `CHECK` 已移到表尾。残留（R6-D4-01/02）：非 running 状态下重建失败的入口/出口未定义；`satellite_missing` 期间人发起暂停与 `resume_to` 的 `CHECK` 冲突；`goal.resume` 的分派与 `03`/ADR-084 矛盾 |
| R5-D4-02 | 已解决 | `pending_verify`、`verify_from` 已入 `06` L436–437 与 `02` L146；`07` §7.10.3 不再写“运行时字段” |
| R5-D5-01 | 部分 | (a) `session_start` 延迟构造、(b) `normalizePath`（`settings-manager.ts:971`）、(c) C28b 改为桩，均经源码核实；ADR-065 正文仍以“运行期 `registerTool` 可能改变注册表”为理由，未同步 |
| R5-D5-02 | 已解决 | v1.2.0 中 `McpExtensionOptions.createTransport` 存在（`extensions/mcp/index.ts` ~L68），`StdioTransport` 支持 `inheritEnv:false`；C21 已补用例；RPC 下登记为 T28。小残留：HTTP 传输需透传 `authProvider`，骨架未写 |
| R5-D6-01 | 已解决 | `07` §7.4.1 L377–387 是唯一规格，`06` L976、`16` L247 只引用。小残留：保留 ref 指向“pin”（`07`、`10` L789）还是“pin 或地标”（`06` L974、ADR-083）不一；ADR-070 正文未加修订注 |
| R5-D7-01 | 已解决 | 运行器集合做内容哈希（`07` L487–489），stat 快照含 ctime，新增 `prepare_untracked_output`，缓存已重置，传递闭包登记为残余“中”，P27 已登记。新的绕过路径见 R6-D7-01 |
| R5-D7-02 | 部分 | 拉取/安装已拆分，`file:` 依赖、`patchedDependencies` 的值、npm rebuild 已统一，P26/P28/P29 已登记；但安装阶段的写范围与断网规则引出新问题（R6-D7-02/03） |
| R5-D7-03 | 已解决 | 识别顺序、人确认、`VerifyProfile.node`、进入 `depsKey`、显式 `PATH`、P30 均已落地。Goal 自己修改 Node 版本时不会被发现，列入 R6-D7-03(d) |
| R5-D7-04 | 已解决 | 命令链中每个程序都参与判定；127/ENOENT 记 `verify_env_error{stage:"exec"}`；P31；`07`/`08`/`16` 的枚举一致 |
| R5-D8-01 | 部分 | 信任提示、验证器档位、独立端口段、S0 下只复制文件均已写。但清理口径矛盾：`04` §4.6.6 第 6 步说目录“保留到工作目录被删除”，关闭时提示“修改不会进入目标”；`10` §10.8.3 第 7 步说“关闭或验收/放弃先到者删除”，并提供“带回 Goal”。提示的频率与按钮两处也不同 |
| R5-D8-02 | 已解决 | S2 读改为允许列表（`11` L329–331），含密钥条目逐路径读拒绝，脱敏精确匹配集覆盖返工提示、验证日志与重放包（L380–381），A9 已登记 |
| R5-D10-01 | 已解决 | ADR-086；`07` L202、L208、L247 |
| R5-D10-02 | 已解决 | 含 ctime 的 stat 快速路径 + 24 h 全量；`MustScanSubDirs`/丢事件/`IN_Q_OVERFLOW` 时立即 decisive；监视降级为 60 s 巡检（`07`、`13`、`16`） |
| R5-D11-01 | 已解决 | 分离 gitdir、删除指针、Host 侧 `GIT_CEILING_DIRECTORIES`、白名单式控制校验，G10 已登记。本轮复现：沙箱外 `git status` 报“not a git repository”。修订带出的新问题见 R6-D13-01/02、R6-D11-01 |
| R5-D12-01 | 部分 | `--all` 根集合、消歧键选择、`disambiguator` 已入 `02` L76、`06` L405 与 `09` 导出。但拆分后的归属在 ADR-087（双方复制、“继承，待复审”）与 `09` L514（留在原 Project、新项目从空开始、逐条复制）中直接矛盾；`02` L96 未写 `--all` |
| R5-D13-01 | 已解决 | `refs/tower-live/*` + `refs/tower-retain/*`；宽限统一为 `2.weeks.ago`（`16` §16.2.6）；卫星删除前提的唯一定义在 `10` L192；有增长上限与提示（`10` L797）。小残留：`06` L221 仍写“镜像从不 prune”，`06` L974 漏 `tower-live` |
| R5-D14-01 | 部分 | (a) 口径改为 2.0 人周，但“在 W8 时间窗内执行”与甘特图中 Agent 份额在 W9b（第 17–21 周、W8 完成之后）矛盾；(b) `14` 已登记 P21–P31，`07` L534–544 仍标“建议新增”；(c) 已改正 |
| R5-D15-01 | 部分 | #1 #2 #5 已解决（分类规则见 `07` L1171，`16` L146–147）；#3 重复行已删，但 `06` L773 `criterion.check_human` 写“见下文同名行”，而该行已不存在；#4 守卫已加，但分派与 `03` 矛盾（R6-D4-02）；#6 `02` L141 仍漏 `claim_on_behalf` |

**合计**：第 5 轮实际共 20 条。第 5 轮结论写的是“18 条，次要 6 条”，按其正文清点应为：阻断 1、重要 11、次要 8。核验结果：已解决 13，部分 7，未解决 0。

---

## 4. 追问清单（新增与残留）

编号 `R6-D<维度>-<序号>`。严重度：**阻断** / **重要** / **次要**。

### D2 Pi 哲学契合度

**R6-D2-01｜重要**

- **问题**：ADR-082 的 S2 读允许列表与 `read.external` 级别，使用户级 Pi 技能在 Tower 中实际不可用。
  - Pi 在系统提示中列出技能的绝对路径 `<location>`，并要求模型“用 read 工具加载”“相对路径按技能目录解析为绝对路径后用于工具命令”（v1.2.0 `core/skills.ts` L368–381）。
  - **执行技能脚本会失败**：技能目录 `~/.pi/agent/skills/**`、`~/.agents/skills/**`、包内技能都不在 `11` L329 的读允许列表中，所以沙箱 bash 执行技能脚本（`python ~/.pi/agent/skills/x/scripts/y.py`）或 `cat SKILL.md` 都会被拒绝。
  - **加载 SKILL.md 要人批准**：`read` 工具读取技能文件被归为 `read.external`，在默认预设“标准修复”下是 `ask`（`11` L76）。每次加载技能都会产生一条 Needs-You。
  - **口径矛盾**：`05` L1231 与 README 第 8 点承诺技能“照常生效”，`00` §0.5.1 却没有登记这一差异。
  - **另一处静默消失**：用户检出中未跟踪的 `AGENTS.md`/`AGENTS.override.md` 不是卫星的祖先，这一差异也没有登记。
- **为什么重要**：技能是 Pi “Adapt Pi to your workflows”的主要载体。默认配置下静默失效或刷屏 ask，违背 Pi 哲学，也违背 README 的承诺。
- **文档位置**：`11` §11.6.2 L329、§11.2 L76、§11.3.1；`05` L1231；`00` §0.5.1；README。
- **期望的回答形态**：
  - 把用户已加载的技能目录（只读）加入 S2 读允许列表，并为 `read` 工具对这些路径设 `read.worktree` 同级。
  - 或者在 §0.5.1 如实登记并说明出路。
  - 未跟踪的上下文文件纳入“本地文件”清单的建议流程。
  - SP6a 增加“技能带脚本”的用例。

### D4 领域模型与生命周期

**R6-D4-01｜重要**

- **问题**：ADR-081 的“我来改”与 ADR-084 的重建失败，在状态机中没有完整的转移。
  - **(a) 评审中的“我来改”无转移**：`E` 在评审中可用（`04` L482、`16` L587），但 `in_review` 没有通往 `paused` 的出口（`03` L58）；`paused(human)` 只能从 running/verifying 进入（`03` L68）。`10` L516 要求“Agent 已暂停”，第 8 步却又写“若 Goal 在 in_review/accepted → 触发 I2”。交还只定义了 `paused → running` 并注入 `tower.handback`（`04` L992、`06` L766）：评审者改完只想重新验证时，会被错误地开一个 Agent Run。
  - **(b) “人工编辑中”不是建模状态**：没有持久化字段记录交接基线 `k/T0` 或 H 是否存在（`02`、`06`、`16` 均无）；H 中有未交还改动时，`goal.resume` 没有守卫，Agent 恢复后会改动卫星，问题要到交还第 6 步才暴露；应用重启后如何恢复 H 也未定义。
  - **(c) 非 running 状态下重建失败无入口**：ADR-084 规定重建失败时“升级为常规原因 `satellite_missing`”，但 `03` L83 该原因只有 `running` 一个入口、`→ running` 一个出口。从 `in_review`/`accepted`/`ready`/`claimed` 升级时如何进入 `paused`、“从更早检查点重建”成功后回到哪里，都未定义。
  - **(d) 与 `CHECK` 冲突**：Goal 处于 `paused(satellite_missing)`、`resumeTo={running}` 且仍在重建时，人发起暂停，`pauseReason` 变为 `human`。此时 `resume_to` 违反 `CHECK (resume_to IS NULL OR pause_reason='satellite_missing')`（`06` L451）。
- **为什么重要**：这些是 `transitions.ts` 必须实现的路径；属性测试（I1–I8）无法覆盖未定义的转移。
- **文档位置**：`03` §3.2、§3.2.1 L68、L83、§3.4.2；`10` §10.8.4、情形 E；`06` §6.3、L766；`04` L482、L991–992；`15` ADR-081、ADR-084。
- **期望的回答形态**：
  - 写明 `take_over` 允许的源状态。
  - 在 `in_review`/`accepted` 下给出“交还并只重新验证”的变体（`verifyOrigin:"human_change"`）。
  - 增加 `Goal.humanCheckout?: {k, t0, path}` 并持久化；H 存在时 `goal.resume` 返回 `E_STATE`。
  - 定义重建失败从各非终态进入 `paused(satellite_missing)` 的转移、出口和返回目标。
  - 规定 `resume_to` 在原因被覆盖时是迁入 `alsoApplies` 还是保留。

**R6-D4-02｜重要**

- **问题**：`goal.resume` 的分派（`06` L761）与 `03` §3.2.1、ADR-084 三处矛盾。
  - ① “有 `pendingVerify`（含 `verify_env_error`、`s0_grant_pending`）→ 回到 `verifying`”：但 ADR-084（`15` L581）明确规定这两者 `goal.resume` 返回 `E_STATE`；`03` L76 规定 `verify_env_error` 只能经 `retry_verify` 退出，L77 规定 `s0_grant_pending` 经 `grant_s0_exec` 退出。
  - ④ 守卫把 `verify_failed_limit` 列为“出口不含 resume”，而 `03` L72 写明它的出口是“`resume` 并修订合同或附转向”。
- **为什么重要**：同一命令在三份文档里的语义相反，实现与属性测试必然有一方是错的。
- **文档位置**：`06` §6.4.3 L761；`03` §3.2.1 L72、L76–77；`15` ADR-084。
- **期望的回答形态**：以 `03` §3.2.1 为唯一来源，逐原因列出 `goal.resume` 的结果，`06` 与 ADR-084 只引用；lint 增加“命令分派 ↔ §3.2.1 出口”检查。

### D6 系统架构与可靠性

**R6-D6-01｜重要**

- **问题**：重放包与保留 ref 无界增长。
  - `writeReplayBundle` 在**每次**验证后执行（`07` L350），包括机会式验证（每个 Goal 每小时约 2.6–4 次，`07` §7.4）和失败的返工。
  - 每个重放包“随 Fact 永久保留”，脱敏输出每条标准最多 50 MB（`07` L384–385），镜像中还有对应的永久 `refs/tower-retain/<goalId>/<verifyId>`。
  - `10` L797 的增长估计只算了镜像对象（每个 Goal 1–5 MB），没有算 `~/.tower/goals/*/replay/` 中的输出。
  - 这与 `16` §16.2.6 的“Tower 总占用 ≤ min(30 GB, 20%)”及磁盘压力回收顺序（`10` §10.3.2，不含重放包）都不相容。
  - 同一 pin 的对象在瘦 bundle 与镜像中各存一份。
- **为什么重要**：这是 D16 可审计论据的存储底座。按现规格，长期使用必然撞上磁盘预算，而规则又禁止自动删除证据。
- **文档位置**：`07` §7.4.1 L350、L377–387；`10` §10.17.1 L797、§10.3.2；`13` §13.11；`16` §16.2.6；ADR-083。
- **期望的回答形态**：
  - 只为“被 `decide()` 采纳为结论”的验证（或被验收/拒绝引用的那一次）保留永久重放包，其余按分层保留清理。
  - 输出的保留与体积另设上限。
  - 重放包计入磁盘预算，并写明磁盘压力下的处置。
  - 二选一：去掉 bundle 与镜像中的重复，或说明为何保留两份。

### D7 诚实与验证

**R6-D7-01｜重要**

- **问题**：`runner_tampered` 比对的 manifest，是安装器从 Agent 可控的输入生成的。
  - Agent 可以加一个针对 `vitest` 的 `patchedDependencies` 补丁，或用 `pnpm.overrides`/`resolutions` 把运行器指向 `link:./vendor/vitest`、`file:`。这时安装器产出的 manifest 逐文件哈希本身就是篡改后的版本，检查 (a)（`07` L487–489）照样通过。
  - 补丁文件与 `overrides`/`resolutions` 字段既不在 lifecycleIndirection（`07` L855），也不在 `02` 的默认 protected 列表（`02` L244–247）。
  - `allowNewDependencies=true` 时，锁文件的变化只是 severity 1 的 `lockfile_drift`。
- **为什么重要**：这是运行器完整性的旁路，不需要任何沙箱逃逸，`pass_mutated`/R-T9 也拦不住。
- **文档位置**：`07` §7.4.3 L448–489、L855；`02` §2.5 L244–247；`11` §11.3.3。
- **期望的回答形态**：
  - 运行器集合中的包必须解析为与 lockfile integrity 一致的注册表 tarball，且未被补丁、覆盖或链接；否则记阻断哨兵。
  - 补丁文件与 `overrides`/`resolutions`/`packageExtensions` 纳入 lifecycleIndirection（protected）。
  - SP6c 增加“补丁运行器”和“override 到 link:”两个用例。

**R6-D7-02｜重要**

- **问题**：安装阶段（I-install）运行 Agent 可控代码，却拥有对整个 `$VS` 的写权限。
  - `07` L463 的写允许 = stage + `$VS` + 临时目录。这里会运行 `.pnpmfile.cjs`（Agent 可改）和 `pnpm rebuild --pending` 中的第三方构建脚本（Agent 可以通过补丁修改它们）。
  - `depsKey` 是确定性的，Agent 可以自行算出（L448–450）。因此这段代码可以预先写入 `$VS/depcache/<他人或下一个 base 的 depsKey>/`，连同伪造的 manifest；安装器看到条目“已存在”就跳过构建（L452）。投毒由此跨 Goal 传播，也会进入未来的 base。
  - I 的 `TMPDIR` 位于 `$TI/tmp`（`16` L855），安装阶段是否对 `$TI/npmrc` 读拒绝没有写明。
  - T7 的缓解（`11` L517）与 `16` L862 的 T6 注释已过时。
- **为什么重要**：depcache 是验证器的信任根。被投毒的 depcache 会让所有后续验证（包括其他 Goal 的）都不可信，而 `verifier_store_tampered` 只比对 Tower 自己记录的哈希。
- **文档位置**：`07` §7.4.3 L448–469；`16` §16.8.1 L855、L862；`11` T6、T7。
- **期望的回答形态**：
  - 安装阶段只写本次运行的私有输出目录，由 Supervisor 校验后原子提交进 depcache。
  - depcache 的来源（depsKey → 生成它的安装运行、输入哈希）记在 Tower 数据库，而不是 `$VS` 内。
  - 安装阶段对 `$TI` 读写拒绝。
  - SP6c 增加“pnpmfile 预写他人 depsKey”的用例。

**R6-D7-03｜重要**

- **问题**：断网的安装阶段与“安装时下载”的包冲突，拉取阶段的“不执行任何代码”也不成立。
  - **(a) 预取放错阶段**：Playwright/Cypress/Puppeteer 浏览器、Prisma 引擎、`sharp` 的预编译库、node-gyp 头文件，都在 postinstall 或需要已安装的包代码（`playwright install`，`16` L851）才能下载。`07` L469 把它们归入“拉取阶段的网络请求”，但拉取阶段既没有 `node_modules`，也不执行代码。而安装阶段是断网的。
  - **(b) 允许域缺失**：`11` L332 的允许域不含 nodejs.org、Playwright CDN、binaries.prisma.sh、download.cypress.io。
  - **(c) 拉取阶段会执行代码**：git 托管的依赖在 `pnpm fetch`/`npm cache add` 时会执行其 `prepare`，与“拉取阶段不执行代码”矛盾，而且这一阶段持有令牌。
  - **(d) Node 版本变更不会被发现**：Goal 修改 `.nvmrc`/`engines`（例如升级 Node）只记为 `config.change`（`11` L203），验证仍在旧 `VerifyProfile.node` 上运行。没有规则要求重新确认或给出标签。
- **为什么重要**：按现规格，P10/P13/P14/P30 这类用例会失败。浏览器类 e2e 是 human/exec 标准的常见形态，而这条路径无解。
- **文档位置**：`07` §7.4.3 L459–469；`16` §16.8.1 L851；`11` L203、L332；`14` P 用例表。
- **期望的回答形态**：
  - 定义第三阶段（“带网络、无令牌、只允许已登记下载域、执行受信任的下载器”）或二进制预取清单，以及各自的沙箱规则。
  - git 依赖按“生态未支持”处理，或明确它在哪个阶段、以什么权限执行。
  - pin 中 Node 版本声明与 `VerifyProfile.node` 不一致时，给出标签或 Needs-You。

### D8 注意力与交互

**R6-D8-01｜重要**

- **问题**：人工编辑检出与检验检出都是“沙箱外执行 Agent 代码”的路径，但信任边界只覆盖了检验检出的终端命令。
  - **(a) `_human` 没有信任提示**：H 是卫星的 CoW 副本，包含 Agent 自己安装和修改过的 `node_modules`（`10` L521–522）。`04` L991 与 `11` L344 只论证了“git 元数据安全”。H 没有 ADR-082 那样的信任提示，也没有说明 H 中不含密钥本地文件、应用可能跑不起来。
  - **(b) IDE 打开即执行**：IDE 打开目录就会在沙箱外执行 Agent 可控的代码。例如：ESLint/Prettier/Tailwind/Vitest 扩展加载 `eslint.config.js`、`tailwind.config.js` 与工作区 `node_modules` 中的包；`.vscode/tasks.json` 的 `runOn: folderOpen`；direnv/mise 的 `.envrc`/`.mise.toml`。用户往往已信任父目录（如 `~/code`），所以 VS Code 的工作区信任不会再拦截。
  - **(c) 检验终端注入了用户的全部环境**：注入的是“用户 shell 的其余环境”（`10` L500），含云凭据等。信任提示（`04` L521–522）只提到本地密钥文件。
  - **(d) 符号链接写出卫星**：Agent 在卫星中放置的符号链接会原样进入 H 与检验目录，人的编辑器沿链接写到卫星以外。
  - **(e)** “人工编辑中”在卡片和实况行上都没有呈现（另见 R6-D4-01b）。
- **为什么重要**：这是人最常用的两个交接动作。安全承诺目前停在 git 元数据，而真实的执行面是 IDE 与终端。
- **文档位置**：`10` §10.8.3 第 0、5 步，§10.8.4；`04` §4.6.6、L991；`11` §11.6.3 L344；`12` L390、L783；ADR-081 第 4 点、ADR-082。
- **期望的回答形态**：
  - H 采用与检验检出同级的信任提示，明确写出 IDE 自动执行与环境变量范围；建议以受限模式（不信任该工作区）打开，并说明父目录已被信任时受限模式不会自动生效。
  - 检验终端的环境改为白名单。
  - 交接前列出工作区中指向卫星以外的符号链接。
  - 补上“人工编辑中”的卡片与实况行文案。
  - SP6b 增加 IDE 打开即执行的用例。

### D10 性能

**R6-D10-01｜次要**

- **问题**：三项新开销没有预算。
  - (a) 每次验证都对运行器集合做全量内容哈希（typescript、`@swc/*`、vite 及其直接依赖，常见 100–300 MB），它在 `claimed → in_review` 的关键路径上。
  - (b) 垫片是一个进程包装器，pnpm/vitest/lint-staged 的每次 git 调用都要多付它的启动成本。
  - (c) 重放包的增长（R6-D6-01）。
- **为什么重要**：前两项直接拉长验证时长与 Agent 的工具延迟，而 `13` 对这两项都有预算口径。
- **文档位置**：`07` §7.4.3 L487–489；`10` §10.6.1；`13` §13.11。
- **期望的回答形态**：给出 (a) 的耗时预算或缓存策略（例如按 depcache 条目缓存“已核验”结论，只复核物化后 ctime 变化的文件）；给出 (b) 的单次开销目标（例如 ≤ 5 ms），由 SP5 实测回填。

### D11 安全与自主度

**R6-D11-01｜重要**

- **问题**：Tower（沙箱外）以原始文件方式读写 Agent 可写的 gitdir 路径，可被符号链接或 FIFO 劫持。本轮已复现。
  - **写入可被重定向**：在模拟 ADR-081 白名单的 Seatbelt 档位内，Agent 能把 `<G>/refs/heads/tower` 替换为指向任意目录的符号链接——`refs/**` 在白名单内。之后，按 `10` §10.8.1 第 4 步“以写文件方式把 `<G>/refs/heads/tower/<goalId>` 改为该 sha”执行的写入，就落到了目标目录中的同名文件。实验中，沙箱外的 Node `writeFileSync` 覆盖了受害文件。§10.10 自动 rebase 的“卫星分支 ref 文件改指 newBase”同理。
  - **读取可被阻塞**：Agent 能把 `<G>/HEAD` 替换成 FIFO（已复现），`captureCheckpoint` 第 3 步“以纯文件方式读 `<G>/HEAD`”会阻塞，持有 `wtLock` 的检查点流水线随之停住。
  - **交还时同理**：交还第 7 步向卫星做文件级写回时，若路径的目录分量是 Agent 放置的符号链接，同样会写到卫星以外。
- **为什么重要**：这正是 ADR-060/081 要消除的那类问题——“Tower 在沙箱外作用于 Agent 可控元数据”的残留实例。后果是覆盖任意用户文件的内容（数据破坏），以及检查点与验证的拒绝服务。
- **文档位置**：`10` §10.7.1 第 3 步、§10.8.1 第 4 步、§10.8.4 第 7 步、§10.10；`11` §11.6.2 L336。
- **期望的回答形态**：
  - 写明 Tower 对卫星 gitdir 与工作区的一切原始读写都以 `O_NOFOLLOW` 逐级打开（`openat` + 不跟随符号链接），并要求目标是普通文件、有大小上限、非阻塞打开、带超时。
  - ref 更新改为在沙箱档位内执行 `git update-ref`，或采用“临时文件 + rename”，并先校验父目录不是符号链接。
  - SP6b 增加“symlink ref”“FIFO HEAD”“交还路径含符号链接”三个用例。

### D12 记忆与学习

**R6-D12-01｜次要**

- **问题**：
  - **记忆归属矛盾**：ADR-087（`15` L598）规定拆分后项目记忆“复制到双方并标记‘继承，待复审’”、VerifyProfile 复制后各自演化；`09` L514 规定记忆、信任与 VerifyProfile“留在原 Project”，新项目从空开始，逐条确认后复制。`16` L186 跟随 ADR 的措辞。
  - **Goal 归属悬空**：`09` L514 写 Goal 归属“按 `02`/`06` 定义”，但这两处都没有定义，只有 ADR-087 有。
  - `02` L96 没有写根集合按 `--all` 计算。
- **为什么重要**：拆分是一次性、难以撤销的数据迁移，两种语义会产生不同的记忆集合。
- **文档位置**：`15` ADR-087；`09` §9.12 L514；`02` §2.3 L96；`16` L186。
- **期望的回答形态**：二选一并同步三处；把 Goal 的归属规则写进 `02`。

### D13 隔离、git 与并发

**R6-D13-01｜重要**

- **问题**：ADR-081 第 3 点的 gitdir 写入白名单不足以支持常用 git 操作。文档却称“提交、rebase、cherry-pick、gc 照常工作”（`11` L336；`10` L28“可以提交、rebase、`gc --prune=now`”）。在 git 2.56 + Seatbelt 模拟中实测：

  | 操作 | 结果 | 原因 |
  |---|---|---|
  | `revert`、`cherry-pick`（无冲突也一样）、非快进 `merge` | **失败**：“update_ref failed for ref 'AUTO_MERGE'” | merge-ort 写 `<G>/AUTO_MERGE`；不受限的对照仓库在干净 revert 后同样留下 `AUTO_MERGE` |
  | `rebase` | **失败**：“could not update REBASE_HEAD” | `REBASE_HEAD` 不在白名单 |
  | `stash push` | **失败**：“unable to write new index file” | 临时索引 `index.stash.<pid>` |
  | `bisect start` | **失败** | `BISECT_START` 等 |
  | `gc` | 返回 0，但报错 | `pack-refs` 写 `packed-refs.new` 失败；`update-server-info` 写 `info/refs`、`objects/info/packs` 失败 |
  | `worktree add` | 失败 | 文档已写明，符合预期 |
  | `commit`、`commit -- <path>`、`commit --amend`、`tag -a`、`checkout -b`、`reset --hard` | 正常 | — |

  另外几个后果：

  - 位于 `packed-refs` 中的 ref 无法删除，因为重写 `packed-refs` 需要 `packed-refs.new`。
  - `SQUASH_MSG`、`TAG_EDITMSG` 的版本差异也未覆盖。
  - **S0 下误报**：没有 OS 强制，git 会正常写出这些合法文件（`AUTO_MERGE`、`gc.log`、`objects/info/commit-graph`、`objects/info/packs`、`info/refs`），控制校验（b）“白名单外条目清单与 `controlHash` 一致”（`10` L183）因此把它们判为 `git_control_tampered`（severity 3，阻断 Verified、拒绝交接，并删除这些文件）。这是日常操作上的系统性误报。
  - **证据不足**：ADR-081 附录实验没有在白名单下测试这些操作；A3 的通过条件只关心“不缺配置”。
- **为什么重要**：
  - Agent 遇到冲突或需要整理历史时，无法使用 git 的标准工具（merge/rebase 在冲突时也同样先写 `AUTO_MERGE`），只能回退到不透明的手工操作。
  - `git.history_rewrite` 的分类与“卫星是独立仓库，照常 rebase”的承诺落空。
  - S0 下哨兵大量误报，直接违反 Needs-You 纪律。
- **文档位置**：`15` ADR-081 第 3 点；`10` §10.1 L23、L28、§10.3.1 L183；`11` §11.6.2 L328、L330、L336；`14` A3、G 用例；`research/git-isolation-experiment.md` 附录。
- **期望的回答形态**：
  - 由 git 源码与实测推导白名单：至少补 `AUTO_MERGE`、`REBASE_HEAD`、`SQUASH_MSG`、`TAG_EDITMSG`、`BISECT_*`、`index.stash.*`、`packed-refs.new`、`gc.pid`/`gc.log`、`info/refs`、`objects/info/packs`、`objects/info/commit-graph*`。
  - 逐项论证这些文件只被沙箱内的 git 读取，因此不构成逃逸。`objects/info/alternates` 必须保持拒绝，因为 Tower 以临时 alternates 读取卫星对象时 git 会递归跟随它。
  - 控制校验改为“已知的重定向/可执行元数据黑名单 + 白名单外的未知条目”，而不是“任何白名单外条目”。
  - SP6b 新增 Gxx：在每个支持的 git 版本上，于真实 S2 档位内跑 commit/merge（含冲突）/rebase（含冲突）/cherry-pick/revert/stash/bisect/gc/pack-refs/branch -D（packed），全部成功，且 S0 下无 `git_control_tampered`。

**R6-D13-02｜重要**

- **问题**：ADR-088 的垫片把 `GIT_DIR`/`GIT_WORK_TREE` 注入真实 git 的进程环境，这两个变量会被该 git 的**全部子进程**继承：`rebase -x <cmd>`、`bisect run <cmd>`、`submodule foreach`、`!` 别名、`difftool`/外部 diff、`filter-branch`。

  复现：在 `GIT_DIR=<分离 gitdir>` 下执行 `git rebase -x 'cd /tmp/fx && git init'`，子进程环境中有 `GIT_DIR=<gitdir>`、`GIT_WORK_TREE=.`，`git init` 输出“Reinitialized existing Git repository in <gitdir>”。

  结果：测试在临时目录中执行的 `git init`/`add`/`commit`，经垫片的“原样执行”分支后，作用在卫星 gitdir 上，并且以夹具目录为工作树——夹具内容会被提交到卫星分支。这正是 ADR-088 要消除的危害。

  其他边缘情形：
  - 绝对路径调用（`/usr/bin/git`、`xcrun git`、dugite 等内置 git）在卫星中会向上越过 `<wtRoot>` 继续发现，因为 Agent 环境没有设置 `GIT_CEILING_DIRECTORIES`。目前只因 S2 读拒绝而安全失败，文档没有写。
  - 只继承了 `GIT_WORK_TREE`、只给了 `--work-tree` 的情形未定义。
  - S2 禁止在卫星内创建 `.git`，所以“在仓库目录树内 `git init` 夹具”的测试必然失败，而 `00` §0.5.1、K22、G20 都没有登记这一代价。
- **为什么重要**：卫星分支被夹具污染后，`satelliteHead` trailer、交还与返工中 Agent 的 git 视图都会出错；而 G20 恰好测不到这条路径（它只测直接在临时目录中运行的 git）。
- **文档位置**：`15` ADR-088；`10` §10.6.1；`05` L391、L396；`14` G20、K22；`00` §0.5.1。
- **期望的回答形态**：
  - 垫片规则增加一条：当前目录不在卫星内，且继承的 `GIT_DIR` 恰好等于本卫星 gitdir 时，剥离 `GIT_DIR`/`GIT_WORK_TREE` 后再原样执行。
  - Agent 环境设置 `GIT_CEILING_DIRECTORIES=<wtRoot>`。
  - 定义只有 `--work-tree` 时的行为。
  - 在 §0.5.1 登记“仓库内夹具 `git init` 失败”。
  - G20 增加 `rebase -x`、`bisect run` 与绝对路径 git 的用例。

### D14 路线图与可验证性

**R6-D14-01｜次要**

- **问题**：
  - **(a) 增人方案违背依赖链**：“+1 人 → 26 周”（`14` L178）把 81.35 人周均摊到 5 条线，约 16.7 工作周；但同节 L174 的严格依赖链是 18.6 工作周（W3 → W7-core → W8 → W9b → W12b）。按依赖链计算，冻结约在第 24 周，M1 约 28 周。除非论证新增的人能缩短这条链本身，26 周不成立。
  - **(b) SP6c 时间窗矛盾**：L32 说 SP6c“在 W8 的时间窗内执行”，但甘特图中 Agent 份额在 W9b（第 17–21 周），而 W8 在第 17 周已完成。
  - **(c) SP6b 容量偏紧**：SP6b 仍是 6 天、1.2 人周，却覆盖 G1–G20 × 3 个 git 版本；其中 G10/G11/G18/G20 依赖 W7 实现的垫片、人工编辑检出与保留 ref gc，而 M0 出口只允许 G19 滑入 M1（L99）。
  - **(d) 小残留**：桌面 + QA 应为 17.7 × 1.1 = 19.47，不是 19.65；`07` L534–544 的“建议新增”残留。
- **为什么重要**：增人方案是延期规则（L196）的触发选项，数字不成立会误导决策。
- **文档位置**：`14` §14.2 L31–32、L99；§14.3.4 L168–196；`07` L520–544。
- **期望的回答形态**：
  - 增人方案按依赖链重算，或写明新人承担链上的哪一段。
  - SP6c 的时间窗与甘特图一致。
  - SP6b 写明哪些 G 用例随 W7 推迟到 M1，以及对应的验收时点。

### D15 文档一致性与可执行性

**R6-D15-01｜重要**

- **问题**：跨文档矛盾与陈旧表述（均已逐处核对）：
  1. 检验清理：`04` §4.6.6 第 2、6 步与 `10` §10.8.3 第 0、7 步在时机、选项、提示频率与按钮上都不一致（R5-D8-01 的残留）。
  2. `11` §11.3.4 L212 “用户检出只禁写、不禁读，因此以用户检出为根的代码智能 MCP 仍可只读工作”，与同文 §11.3.3 第 3 点、ADR-082 的“读写用户主检出”硬底线相反。
  3. `budget_hard_cap` 的出口：`02` L141、`04` L1130、`12` L407 仍写“只能扩展预算或放弃”，漏了 `03` L70 与 `06` 已有的 `claim_on_behalf`。
  4. `06` L773 `criterion.check_human` 的参数写“见下文同名行”，但该行已删除。
  5. `06` L221 仍写“镜像从不 prune”；`06` L974 漏 `refs/tower-live/*`；保留 ref 指向“pin”（`07`、`10`）还是“pin 或地标”（`06`、ADR-083）不一。
  6. ADR-081 之后的陈旧表述：
     - `06` L125 的恢复检查仍看“worktree 中的 `.git/rebase-merge`”；
     - `03` L115、L128 写“为每个 binding 创建 worktree”；
     - `16` L593 `⌘⇧T` 写“在 worktree 打开终端（先暂停）”，而 `04` 说的是打开人工编辑检出；
     - `02` L177 写“自有 .git”。
  7. 术语不一：`12` L783 写“人工编辑副本”，`04` 写“人工编辑检出”。
  8. ADR-065 正文（运行期 `registerTool`）、ADR-070 正文（旧的重放规格，标题未标注 Amended by ADR-083）未同步。
  9. `02` L145 中 `alsoApplies` 的类型是 `string[]`，不是 `PauseReason[]`；`16` L147 中 `runner_tampered` 统一写“阻止 Verified”，没有区分 severity 2 的非运行器变体（`07` L493）。
  10. `goal.resume` 的分派矛盾，见 R6-D4-02。
- **为什么重要**：`06`、`16`、`03` 会被直接实现。lint 本轮“0 处分类错误”的声明可信，但覆盖不到语义层的矛盾。
- **文档位置**：如上。
- **期望的回答形态**：逐条修正；lint 增加三项检查：“命令分派 ↔ §3.2.1 出口”“陈旧术语（worktree、卫星 `.git`）白名单扫描”“ADR 正文中的 Amended 标注 ↔ 后续 ADR”。

### D16 创新与差异化

**R6-D16-01｜次要**

- **问题**：
  - **淘汰后难以重放**：`07` L387 规定 depcache 被淘汰后，重放必须由安装器重装，且得到的 manifest 哈希要与记录一致，否则“不可重放”。原生模块构建、安装时下载的二进制、带时间戳的产物通常不可逐字节复现，而 depcache 是 20 GB 的 LRU（`16` L534）。结果是：数周以前的证据会大面积“不可重放”。
  - **未登记为风险**：没有用例测量“淘汰后重放成功率”，也没有登记为已知风险。
- **为什么重要**：“判定可审计、可本机重放”是回应闭源质疑、支撑差异化的论据。如实报告“不可重放”保住了诚实，但可审计性的实际覆盖面未经验证。
- **文档位置**：`07` §7.4.1 L387；`16` L534；`14` G18；`15` ADR-070、ADR-083。
- **期望的回答形态**：
  - 把“淘汰后重放成功率”登记为带阈值的实验（例如 SP6c 或 M1 自用期：对 20 个已淘汰证据重放，成功率 ≥ X%）。
  - 或缩小承诺：可重放窗口 = depcache 保留期，之后只能“对照日志审计”。
  - 与 R6-D6-01 的保留策略联动。

---

## 5. 结论

- **是否所有维度为 100：否。** 最高为 D3、D9 的 95，最低为 D7、D13 的 84。
- **是否还有可追问的问题：有。**
  - **第 5 轮核验**：共 20 条，已解决 13、部分 7、未解决 0。
  - **本轮追问**：新增与残留共 **16** 条，其中阻断 0、重要 12（R6-D2-01、D4-01、D4-02、D6-01、D7-01、D7-02、D7-03、D8-01、D11-01、D13-01、D13-02、D15-01）、次要 4（R6-D10-01、D12-01、D14-01、D16-01）。
  - **已实测复现的三条**：R6-D13-01（白名单使 merge/rebase/cherry-pick/revert/stash/bisect 失败）、R6-D13-02（垫片向子进程泄漏 `GIT_DIR`，`git init` 重新初始化卫星 gitdir）、R6-D11-01（符号链接 ref 让 Tower 覆盖任意文件；FIFO `HEAD`）。
- **下一轮建议按以下顺序修订**：
  1. 由源码与实测推导 gitdir 写入白名单，控制校验改为“已知危险条目 + 未知条目”；修正垫片对继承 `GIT_DIR` 的处理与 Agent 侧的 ceiling；补 SP6b 用例（R6-D13-01/02）。
  2. Tower 对 Agent 可写路径的一切原始读写改为不跟随符号链接、只接受普通文件、非阻塞（R6-D11-01）。
  3. 安装阶段写范围收窄为私有输出目录，depcache 来源入库；运行器集合拒绝补丁、覆盖与链接；定义下载阶段（R6-D7-01/02/03）。
  4. 补齐“我来改”的状态、守卫与信任边界，以及重建失败的转移；`goal.resume` 以 `03` 为唯一来源（R6-D4-01/02、R6-D8-01）。
  5. 重放包按“被采纳的结论”保留并计入磁盘预算，登记“淘汰后重放成功率”实验（R6-D6-01、R6-D16-01）。
  6. 技能目录的读权限与差异表（R6-D2-01）。
  7. 清理 R6-D15-01 清单，同步 ADR-087 与 `09`，重算增人方案（R6-D12-01、R6-D14-01）。
