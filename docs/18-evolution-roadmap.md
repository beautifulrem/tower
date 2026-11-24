# 18 · 演进路线图与系统优化方案（2026-11 起）

> 本文在 `docs/17-implementation.md`（当前原型基线）与 `research/evolution-landscape-2026-11.md`（2026-11 行业与技术调研）的基础上，制定 Tower 下一阶段的务实演进路线图，涵盖 **验证与安全后端、核心架构、桌面前端与发布工程**。
>
> **与既有文档的关系**：`docs/00`–`docs/16` 构成经 112 轮评审的原始完整规范；`ROADMAP.md` 是面向外部用户的简洁清单；本文是面向开发的**可落地工程演进蓝图**，每项改动均标明代码锚点、核心约束与退出验收标准。

---

## 18.1 不可动摇的设计红线（护城河校验清单）

在执行本路线图的任何阶段，所有新特性必须通过以下五条校验；凡违背者一律否决：

1. **事实与声明分离（R1 Honesty Grammar）**：永远不引入“小模型读聊天记录就给绿勾”的捷径；任何 LLM 生成的摘要、评审讲解、规则建议或保留测试草案，在未经机器验证或人类显式批准前，均按 `Claim` 渲染，永不变绿。
2. **极简模型面与上下文透明（`00` §0.5）**：严控注入模型的常驻工具数与 token 预算；所有 Tower 注入给引擎的消息必须在 Trace 中原样可见。
3. **默认拒绝与边界先于弹窗（R5 + `SECURITY.md`）**：靠 OS 内核边界和精确机制减少打扰，不靠堆砌审批弹窗制造安全幻觉；每新增一条安全承诺，必须同步写入 `SECURITY.md` 的 `Property | Test` 表并由 `tools/security-tests.mjs` 强制锁死。
4. **本地优先与引擎中立**：不强制云账户、不静默上传代码、不静默推送远端；绝不为“多支持一个引擎”而放松沙箱与工具白名单底线。
5. **轻量与工程洁癖**：继续由 CI 强制守卫前端体积预算（启动 ≤ 64 KB、合计 ≤ 160 KB gzip，`tools/bundle-budget.sh`）、单源文件 ≤ 800 行（`tools/line-limit.sh`）、Rust 全局 `unsafe_code = "deny"`（除最小且带 `SAFETY` 证明的 OS FFI）以及 `ts-rs` 零漂移。

---

## 18.2 总体分期概览

```mermaid
flowchart LR
    P0["P0 · 诚实闭环定型与公开发布\n(4-6 周)"] --> P1["P1 · 引擎中立、长周期与评审提速\n(6-8 周)"]
    P1 --> P2["P2 · 跨平台隔离底座与学习闭环\n(8-12 周)"]
```

| 阶段 | 主题 | 核心产出 | 阶段退出门槛（Exit Criteria） |
|---|---|---|---|
| **P0** | **诚实闭环定型与可信发布** | 清零对抗测试已知漏检；常驻沙箱文件助手；签名公证 DMG + Homebrew Cask + 自动更新 | 1. 真实模型对抗回归 `tests/adversarial.rs`（30+ 变体）漏检率 **0%**、诚实组误拦率 **0%**，且在 CI 定时跑通<br>2. 干净 macOS 账户安装免 Gatekeeper 警告，内置更新链路实测通过<br>3. 文件工具单次延迟从 ~15 ms 降至 < 1 ms |
| **P1** | **引擎中立、长周期与高吞吐评审** | 通用 ACP 引擎层（Codex / Gemini CLI / OpenCode，过安全闸门后启用）；分层模型升级；多模态贴图；大 Diff 虚拟化 + AST 语义降噪；端口池与磁盘清理 | 1. 至少 2 个新引擎通过与 `real_pi` 等价的沙箱渗透测试<br>2. 5,000 行大 Diff 与整文件展开在 WebKit 中保持 60 fps 流畅滚动，总 JS 仍 ≤ 160 KB<br>3. 10 个并发 Goal 无端口冲突、磁盘占用可见且可安全回收 |
| **P2** | **跨平台隔离底座与学习闭环** | `SandboxBackend` 抽象；Linux（`bwrap` + Landlock + cgroups v2）正式支持；Apple Containerization MicroVM 高风险档位；定时 Goal；人审学习闭环与轻量合并队列 | 1. Linux CI 跑通与 `SECURITY.md` 对齐的核心隔离测试集<br>2. 定时/过夜 Goal 崩溃重启后状态幂等恢复，单向门零误重放<br>3. 记忆提议带完整污染标记（`taint`）与人审队列上线 |

---

## 18.3 P0 · 诚实闭环定型与可信发布

### P0.1 补齐反作弊验证器的 5 项硬缺口

对应代码：`crates/tower-supervisor/src/verify/`、`crates/tower-core/src/roles.rs`、`crates/tower-core/src/sentinel.rs`、`extensions/tower-goal/`

1. **修复运行时 Assertion Guard 的多进程覆盖盲区**
   - **现状问题**：`verify/bench.rs:724–728` 仅判断 `report.finished == 0`，当命令派生多个进程（如 `npm test` 外层 `npm` + 内层测试进程）且内层进程跳过退出上报时，外层的 `finished >= 1` 会掩盖内层逃逸。
   - **改进方案**：
     - 在 `assertion_identity()` 中检查 `report.finished < report.started`：有进程提交了 `start` 却未提交 `end` 时，不再放行“干净已验证”，而是记录未交卷进程数并视退出状态降级/阻断；
     - 在 `assert_guard.cjs` 中保护退出监听器（拦截对自身 `exit` 回调的 `removeAllListeners` / `removeListener`）并补充 `beforeExit`；
     - **升级至 Node.js `module.registerHooks()`（Node 22.15+ / 24）**：通过 `NODE_OPTIONS` 配合 `--import` 同步主线程拦截 ESM `import` 与 CJS `require`，彻底消除异步 `import('node:assert').then(...)` 竞态，并将身份守卫扩展至局部导入的 `vitest`、`chai`、`@jest/globals`、`expect`（同时保留对旧版 Node 的 `--require` 回退）。
2. **引入轻量化 `tree-sitter`（Rust crate）修复 Rust 内联测试漏检**
   - **目标**：消灭 `docs/17 §17.7` 中“Rust 源文件内联测试区域被当成源码”的已知漏检。
   - **改进方案**：
     - 在 `tower-core`（或独立轻量 crate `tower-ast`，隔离 C 编译依赖）接入 `tree-sitter-rust`；
     - **Source-only 重跑增强**：对修改过的 `.rs` 文件，解析出所有 `#[cfg(test)]` 模块与测试函数 span，将其还原为 base 版本后再重跑 `cargo test`；
     - **条件编译作弊哨兵**：若源码在非测试模块中新增 `#[cfg(test)]` 分支修改返回值，或读取 `current_exe()` / `RUST_TEST_THREADS` 判断测试环境，直接命中高危哨兵。
     - **体积约束**：控制总 binary 增量在 ≤ 2.5 MB，并纳入 CI 体积观测。
3. **双路破解“字面量期望下的查表 / 派生属性特判”**
   - **路径 A（自动结构 + 扰动联合证据）**：当 `verify/perturb.rs` 对某断言产出 `Finding::Confined`（只在测试输入点改变输出，所有邻近输入退回旧代码结果）且 AST 静态分析发现 **Bypass-around-bug 形态**（原错误计算表达式未被删除/修正，仅在其前增加针对少量常量或派生条件的早退/查表分支）时，将该哨兵由 `medium` 升格为高危拦截（同时保留对纯映射表修改、日历边界修复的诚实对照组测试，确保误拦率保持 0%）。
   - **路径 B（人审合成保留测试，Human-Approved Synthetic Holdouts）**：在合同编辑或预检阶段提供可选动作——根据合同意图与已有测试，起草 2–3 条额外验证用例（仅在人类逐条审阅点击“加入隐藏保留测试”后写入 `holdout/`），Agent 全程不可见且由现有 `held_out.rs` write-only drop box 逐文件证明执行。用信息论边界根治一切硬编码特判。
4. **增设“诚实上报阻塞 / 不可行”出口与早停探测**
   - **依据**：2025–2026 Reward Hacking 实证表明，缺乏受认可的“任务不可行/规格冲突”出口会显著诱发模型钻空子或耗尽预算。
   - **改进方案**：
     - 扩展 `submit` 参数（保持 7 工具预算不变，不增加工具数量）：支持 `outcome: "done" | "blocked"`（`blocked` 需附原因与证据，直接进入新增的 `PauseReason::AgentReportedBlocked`，交由人决定修改合同、提供指引或放弃）；
     - 增强 `run/mod.rs` Stall 检测：当 Agent 连续触发 ≥ 5 次沙箱越界拒绝且最近 N 分钟工作区无有效增量时，提前暂停并标明“持续探测沙箱边界，无实质进展”，彻底解决对抗测试中 600s 超时无结论问题。
5. **Flaky Test（不稳定测试）显式识别**
   - 在 `verify/bench.rs` 中，对首次失败的可见标准支持可选自动重跑 1 次（配置默认开启或按项目设置）；若“一红一绿”，标记为 `Flaky` 提示人类并在 Trace 中保留两次输出，避免把不稳定测试当成代码回归反复消耗自动返工额度。

### P0.2 常驻沙箱文件助手（消除 `sandboxfs.ts` 延迟瓶颈）

- **现状问题**：`extensions/tower-goal/sandboxfs.ts` 每次 `read`/`access`/`write`/`mkdir` 都派生新的 `/usr/bin/sandbox-exec` 子进程，高频读写大仓库时存在显著累积延迟。
- **改进方案**：
  - 实现极简常驻进程 `tower-fs-helper`（可在 `tower-supervisor` 同工作区编译或复用单一二进制子命令 `tower --fs-helper`），随 Goal 启动并一次性落入与该 Goal 完全相同的 Seatbelt profile；
  - `sandboxfs.ts` 改为通过长连接 stdio JSONL 与助手通信执行文件读写、目录创建、MIME 探测与 16 MB 上限校验；
  - **顺带补齐设计差额**：在 `sandbox/mod.rs` 的 Seatbelt 模板中补齐设计文档 `00` §0.5.1 要求的两项防线——① 禁止在工作区任意深度写入 `AGENTS*.md`、`CLAUDE.md`、`.pi/`、`.agents/`；② 禁止在沙箱内创建硬链接（`(deny file-write-link)`，防通过硬链接绕过路径级读拒绝），并全部补齐 `SECURITY.md` 对应测试。

### P0.3 签名公证发布与自动更新闭环

对应文件：`RELEASING.md`、`.github/workflows/release.yml`、`apps/desktop/src-tauri/tauri.conf.json`、`packaging/homebrew/tower.rb`

1. 配置 Apple Developer ID 签名证书与 App Store Connect API Key 公证流程，产出 Universal（Apple Silicon + Intel）已公证 `.dmg`；
2. 接入 `tauri-plugin-updater`（Ed25519 密钥对签发 `latest.json` 与 `.sig`），遵循 Tower“从不静默变更”原则——仅在应用内温和提示有新版本及完整更新日志，由用户显式点击安装重启；
3. Release Workflow 自动化更新独立 Homebrew Tap 的 `Casks/tower.rb` 版本号与 SHA256。

---

## 18.4 P1 · 引擎中立、长周期监督与高吞吐评审

### P1.1 通用 ACP 引擎层与“引擎接入安全闸门”

对应代码：`extensions/tower-goal/acp.ts`、`crates/tower-supervisor/src/acp_adapter.rs`、`crates/tower-supervisor/src/inner.rs`

1. **将 ACP 桥从“Claude Code 特化”抽象为 `EngineAdapterSpec`**：
   - 支持配置/内置多种引擎驱动（`pi`、`claude-code`、`codex`、`gemini-cli`、`opencode`），统一锁死适配器依赖的 lockfile integrity hash 与 `--ignore-scripts` 安装机制；
   - 统一 `usage_update` 费用采集、会话恢复（`session/load`）与模型列表发现。
2. **设立强制性 Engine Onboarding Trust Gate（安全闸门）**：
   - 针对调研发现的痛点（`codex-acp` 与 `gemini-cli --acp` 目前缺乏类似 Claude Code `tools: []` 的原生一键清零内置工具开关），任何新引擎在标为“正式受控引擎”前必须通过自动化渗透套件：
     1. 无法读取 `~/.ssh`、`~/.aws`、`~/.pi/agent/auth.json`；
     2. 无法绕过 `mcp__tower__*` 修改工作区文件或逃出工作区；
     3. 无法在合同关闭网络时外连或访问未声明的本机端口；
     4. 单向门命令必经审批。
   - **实施策略**：优先推动或适配各引擎的“全工具禁绝 / 强制 `session/request_permission` + 外部沙箱包裹”方案；若某引擎的内置只读工具暂时无法禁用，则仅以“实验引擎（受限沙箱保障）”标注并在环境检查与合同卡片显式说明，绝不误导用户。

### P1.2 面向长周期任务的分层模型策略与校准统计

对应代码：`crates/tower-core/src/contract.rs`、`crates/tower-supervisor/src/verify/mod.rs`、`crates/tower-store/src/schema.rs`

1. **返工模型升级（Rework Escalation）**：
   - 在 Contract 与全局 Settings 中新增可选的 `escalation_model`（例如初轮用高性价比模型 DeepSeek V4.1 / Sonnet / Flash，若连续 2 次验证失败自动切换至 Opus 5.5 / GPT-6 攻坚）；
   - 模型切换作为一等 `EventKind` 记入 Trace，清晰归因每轮费用。
2. **校准数据静默采集（为 P2 校准记分板铺路）**：
   - 在 SQLite 中按 `(engine, model)` 聚合只读统计事实：一次验证通过率、平均返工轮数、高危哨兵触发率、诚实阻塞上报率与单位验收成本。遵循 R10（指标是校准而非满意度）。

### P1.3 后端并发、AST 门禁与运行时并行隔离

1. **Bash 门禁升级为 AST 解析（`tree-sitter-bash`）**：
   - 替换 `extensions/tower-goal/policy.ts` 的正则切分，在 Rust 侧（或通过常驻助手）对复杂管道、子 shell、重定向、变量拼接和 `python -c` 等进行准确命令分类，降低谨慎模式误弹窗同时封堵正则绕过。
2. **SQLite WAL 读写分离 + 异步远程服务**：
   - `inner.rs` 将写操作保留在唯一 `Mutex<Store>` 单写者，同时为 `goals()`、`detail()`、`trace()`、重叠雷达与手机页查询提供只读连接池，消除高频事件写入时的界面读阻塞；
   - `remote.rs` 摆脱单线程同步 `tiny_http` + `rt.block_on` 阻塞模型，改为轻量异步处理（并支持可选 SSE 事件推送，降低手机端轮询耗电）。
3. **动态端口池与磁盘生命周期管理**：
   - 为每个活跃 Goal 分配不重叠的端口段（如注入 `TOWER_PORT_BASE` 及 10 个预留端口），同步自动加入该 Goal 的 Seatbelt Loopback 允许列表，彻底解决并行开发服务器端口冲突；
   - `look` 视觉证据同步采集目标页面的浏览器 **Console `error` 与未捕获 `pageerror`** 作为结构化 Fact 展示在截图下方，并支持可选多视口（桌面 + 窄屏）截图；
   - 新增后端存储盘点 API：统计每个 Goal 的卫星克隆、私有缓存、临时目录与验证残留磁盘占用，支持一键清理已归档/放弃的 Goal（硬保护所有运行中、待验收、需要你及有未提交改动的工作区）。

### P1.4 前端高吞吐评审、多模态与“3 秒扫一眼”优化

对应代码：`apps/desktop/src/views/Review.tsx`、`FileDiff.tsx`、`Overview.tsx`、`ContractEditor.tsx`、`SteerBox.tsx`

1. **大 Diff 分离几何（Split-Geometry）虚拟化**：
   - 借鉴 GitHub Copilot App 2026-09 工程方案：为 `FileDiff.tsx` 文件容器加上 `content-visibility: auto`，并对超过 400 行或开启“查看整文件”的 Diff 启用轻量自研虚拟滚动（代码行固定行高前缀和 + 行内评论异步懒测量 + 基于 `(path, line, side)` 的锚定防跳动），代码增量控制在 ≤ 2.5 KB gzipped。
2. **AST 语义增强 + 评审时间线**：
   - **移动代码降噪**：后端标注“纯移动未改逻辑”与“纯格式化”的 hunk，前端默认折叠为 `Moved unchanged` 提示条，把人类注意力聚焦于真实逻辑变更；
   - **单元“为何改”虚线注解**：每个 Review Unit 顶部附一句由该 Goal 轨迹 `log` 派生的虚线摘要，明确标注 **“Agent 称”**（永不着色为 Fact）；
   - **快照时间线切换器**：利用已有的内容寻址快照（`refs/tower/runs/<n>` 与历次 `pin`），将 Review 范围从 `全部 / 自上次评审` 扩展至 **`上一轮改动` 与 `任意两次 Run 之间对比`**。
3. **多模态贴图与 `@file` 引用**：
   - `ContractEditor.tsx`、`SteerBox.tsx` 与 `DecisionCard.tsx` 支持直接粘贴/拖拽截图（存至 Goal 私有目录，Agent 通过沙箱 `read` 工具读取，不破沙箱规则）以及输入框 `@` 路径自动补全（基于已有 `fuzzy.ts` + `pinyin.ts`）。
4. **Overview 列表 `Space` 键就地 Peek 与存储面板**：
   - 在 `Overview.tsx` 对任意 Goal 行按 `Space` 弹出轻量浮层（不切路由），一眼看清最近实况行、标准两轨进度与最新日志，支持按 `P` 暂停或 `R` 直达评审；
   - 在 Settings 新增按需加载的“工作区与磁盘空间”面板，按项目/Goal 列出占用并提供安全清理。

---

## 18.5 P2 · 跨平台隔离底座与完整学习闭环

### P2.1 `SandboxBackend` 抽象与 Linux / MicroVM 双轨支持

对应代码：`crates/tower-supervisor/src/sandbox/`、`procs.rs`、`caches.rs`、`jail.rs`

1. **抽离平台无关 `SandboxBackend` Trait**：
   - 统一封装：策略生成（读白名单、写白名单、只写投递箱、只追加日志、网络与 Loopback 端口规则）、命令包装、常驻文件助手启动、原子进程树清理、包缓存写时复制。
2. **Linux 一等公民支持（`bwrap` + Landlock ABI v3+ + cgroups v2）**：
   - 文件隔离：`bwrap --unshare-all` 配合 Landlock 细粒度权限精确复现 write-only drop box 与 append-only transcript；
   - 网络隔离：离线模式 `--unshare-net` 物理断网；合同声明端口经受控转发桥按端口打通；
   - 进程治理：通过 `systemd-run --user --scope` + `cgroup.kill` 原子清理进程树；
   - 发行支持：AppImage / `.deb`，环境自检自动检测 Ubuntu 24.04+ AppArmor userns 限制并给出精确指引。
3. **Apple Containerization MicroVM 可选高安全档位（macOS 26+ Apple Silicon）**：
   - 面向高风险 Goal（如依赖大升级、执行陌生构建脚本的跨平台 Linux 栈仓库），提供可选的 MicroVM 隔离档位（基于 Apple 开源 `container` / `Virtualization.framework`、`virtiofs` 挂载与 `vmnet` 网络隔离），作为 Seatbelt 之上的 Hypervisor 纵深防御与长期退路。

### P2.2 定时 / 过夜 Goal（Scheduled Goals）与耐久恢复

- 支持按 Cron 或事件触发的无人值守 Goal（如夜间依赖安全巡检、脆弱测试狩猎），复用完全相同的 Contract、沙箱与六步验证台；Cron 表达式按 **UTC** 计算（`schedule.rs`），运行与队列界面标出 UTC 并以本地日期时间显示下次运行；
- 吸收 `pi-durable` 的 **Checkpoint + 幂等分级** 机制：过夜 Goal 遇到 Provider 限流、网络中断或机器唤醒后可断点续跑，但**所有单向门与扩大权限操作在无人值守期间一律硬暂停进入 Needs-You**，绝不自动放行或重放。

### P2.3 有人工闸门的学习闭环与轻量合并队列

对应设计：`docs/09-memory-and-learning.md`、`docs/10-isolation-git-concurrency.md`

1. **学习闭环与污染（Taint）追踪**：
   - 在 Goal 经过返工或 Review 批注最终验收时，从**人类原话（转向/批注）与 Harness 事实（失败签名/哨兵）**中挖掘候选项目规则，进入“记忆批准队列”；
   - 严格落实 `docs/09` §9.2.1 的反向白名单污染模型：纯来自人类自由文本与 Harness Fact 的提议为 `taint: none`，凡沾染仓库内容/工具输出/外部 MCP 的提议默认带 `standard` 或 `high` 污染等级，高污染提议强制人工编辑或复述确认后方可注入后续 Goal。
2. **校准记分板（Calibration Scoreboard）**：
   - 在独立按需视图中展示按项目与模型维度的历史事实（验证一次通过率、常见哨兵类别、人工返工率），样本不足时如实标注样本不足。
3. **轻量合并队列与跨 Goal 依赖**：
   - 在现有“重叠雷达 + 验收冲突预判”基础上，允许为同一项目的多个已验收 Goal 排队顺序合入并在每次基线移动后自动触发重验，支持简单的 Goal 前置依赖关系。

---

## 18.6 工程治理与验证纪律（贯穿全阶段）

为确保路线图演进不稀释 Tower 现有的高工程水准，以下门禁同步随阶段升级：

| 维度 | 持续执行机制 | 新增门禁项 |
|---|---|---|
| **安全性质回归** | `node tools/security-tests.mjs` + `cargo test` | 每新增一条沙箱防线（`AGENTS.md` 保护、硬链接禁止、Linux Landlock、新 ACP 引擎渗透测试），必须写入 `SECURITY.md` 表格并强制 CI 校验 |
| **反作弊实测** | `.github/workflows/adversarial.yml` | P0 阶段正式配置 CI secret 并按周定时运行，报告归档追踪跨模型版本（Claude / GPT / Gemini / DeepSeek）的拦截率与误拦率 |
| **体积与性能预算** | `tools/bundle-budget.sh` + `tools/doc-numbers.sh` + `e2e/perf.spec.ts` + `tests/perf_verify.rs` | 新增 **大 Diff（5,000 行）帧率/渲染时间 E2E 基准** 与 **Rust 安装包体积上限告警（≤ 15 MB）** |
| **代码健康度** | `tools/line-limit.sh` + `clippy -D warnings` + `unsafe_code = "deny"` | 保持每源文件 ≤ 800 行；新增 AST/Linux 沙箱模块按清晰 crate 边界拆分，不把 `tower-supervisor` 膨胀为巨石 |
