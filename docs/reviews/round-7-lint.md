# 第 7 轮 · 一致性 lint 报告（ADR-039）

日期：2026-10-15 · 范围：`docs/00`–`docs/16`、`README.md` · 依据：`16-registry.md`、`15` ADR-001–100（新增 ADR-096–100；M1 = 31 个日历周、缓冲外零余量，+1 人 = 29 周）、`reviews/round-7.md` 与第 7 轮回应。原则同前：只做机械修正（ADR 与登记表优先于文档作者的落地口径），设计冲突列入 §4。

## 1. 方法与结果

| 检查 | 做法 | 结果 |
|---|---|---|
| 章节引用 | `python3 docs/reviews/lint/xref.py` | 2429 处、549 个编号标题、ADR-001–100：**0 断链、0 文档号不符** |
| 引用主题 | 含 ADR-096–100 / R7- 的行中 110 处 § 引用，随机抽 65 处比对目标标题 | 无指错 |
| 枚举 16 ↔ 02 ↔ 06 DDL ↔ 用法 | 脚本 | `02` 已加 `discard_human_edits`、`bring_back_inspection`、`retry_after_human_change`，**`16` §16.1.5 未登记**（已补）；`goal.retry_after_human_change` 记的是 `human.decision{hand_back}`，与 `02` 新 kind 不符（已改）；`hand_back` 模式在 `06` 又回到 `"agent"/"verify"`（第 6 轮已修，再次对齐） |
| DDL ↔ 02（规则 a） | 脚本 | `humanCheckout.syncState/written` 在 `02` 与 DDL 注释一致；`16` 把 `written` 写成必填（已改为 `written?`）；`06` 正文 7 处仍用旧列名 `take_over_from`（已统一为 `takeover_from`） |
| 环境变量 ↔ §16.8（规则 b） | 脚本 + 逐行 | `GIT_EXEC_PATH`、`GIT_CONFIG_*`（`safe.bareRepository`）两行已登记，与 `05` §5.3.6 一致；**`PATH` 行的后 4 格被错并到 `GIT_CONFIG_*` 行末**（表格错位，已修）；I-prefetch 的角色说明仍写“写 `$SH` 与 `$VS/xdg`”，与新的 F/P/N 说明及 `XDG_CACHE_HOME` 行不符（已改） |
| I 列分阶段（§16.8 新规则） | 脚本：I 列每个写入都有 F/P/N 或 I-fetch/prefetch/install 前缀 | 通过 |
| V 列（规则 c） | 脚本 | 通过（不含 `$GS`、卫星、`_gitdirs`、`_shim`、`$TMPDIR/tower-*`） |
| (d) Fact 名 / 检测器 id | 脚本 | 唯一未登记：`git_control_tampered`（只在 Superseded 的 ADR-072 中） |
| (e) 命令 ↔ `HumanDecision.kind` | 脚本 | 修正后双向 0 缺项（`discard_human_edits`、`bring_back_inspection`、`retry_after_human_change` 均有命令） |
| (f) sentinel / anomaly | 按 `07` §7.10.1 | 0 处错误；裸仓库布局计为 `nested_repo`（sentinel）各处一致 |
| (g) 垫片措辞（ADR-088/090/097） | grep “垫片”、`GIT_EXEC_PATH`、“绕过垫片” | `05` §5.3.6、`10` §10.6.1 已含 exec-path；`16` §16.8 `PATH` 行未提嵌套调用（已补）；**S2 读允许列表未包含垫片目录 `<wtRoot>/_stores/_shim/`**，Agent 无法执行 `GIT_EXEC_PATH` 中的程序（已补，`11` §11.6.2） |
| (h) `Checkpoint` ↔ DDL | 逐字段 | 一致；第 6 轮 U1 已由作者在 `06` `run.rewind`/`run.fork_goal` 落地（`target: {piEntryId} \| {projectId, checkpointN}`） |
| 废弃项 | 先补 `16` §16.1.13 再 grep | 见 §3 |
| 数值 | §16.2 ↔ 所属 § | 提交对象解析上限（1 MB / 200 个提交 / 5 s）`10` §10.1.3 与 `16` §16.2.6 一致；git 最低 2.40 一致；其余为已知误报 |
| M1/M2 与日期 | `14` §14.3.4、ADR-038、`16` | 31 周 → 2027-06-11 ✓；+1 人：第 25 周末冻结、29 周至 2027-05-28 ✓；`16` M1 行的“ADR-038 待主干同步”已过时（ADR-038 已写 29 周，已删） |
| 00 §0.5.1 | 对照 ADR-096/097/100 | `safe.bareRepository` 建议、扩展目录不可读两行已在；ADR-097 备选行按设计只在 G20 失败时加入 |

## 2. 改动清单

### 2.1 HumanDecision 与命令（ADR-099）

- `16` §16.1.5 `HumanDecision.kind`：补 `discard_human_edits` · `bring_back_inspection` · `retry_after_human_change`。
- `06` §6.4.3 `goal.retry_after_human_change`：`human.decision{hand_back}` → `human.decision{retry_after_human_change}`。
- `06` §6.4.3 `goal.hand_back`：`mode: "agent" | "verify"` 及正文 `mode:"agent"`/`mode:"verify"` → `continue_agent`/`reverify`（`16` §16.1.3）。
- `06` §6.1.6、§6.3 注释、§6.4.3 共 7 处 `take_over_from` → `takeover_from`（与 DDL 列名一致）。
- `02` §2.7：新 kind 的注释与 `reject_memory` 的注释错位（已分行）；§2.4 `humanCheckout` 注释顺序整理。
- `03` §3.2.1 `human` 行出口列：补 “→ `in_review`/`accepted`（放弃改动回到 `takeoverFrom`）；→ `paused` 保持（交还后仍有与 pin 无关的原因）”——`06` 的 `goal.resume` 声明此列为唯一来源。
- `04` §4.6.7：`paused(human_change_verify_failed)` 的两个按钮分别对应 `goal.retry_after_human_change`（交给 Agent 修复）与 `goal.retry_verify`（重新验证）；原文把两者都归为前者。
- `16` §16.1.1 `Goal.humanCheckout`：`written: string[]` → `written?: string[]`（`02`、DDL）。

### 2.2 git 隔离（ADR-096/097/100）

- `10` §10.6 seal 的 `msg`：“GitRunner 沙箱中只读 `git --git-dir=<卫星 gitdir> log`” → “Tower 自行只读解析卫星 gitdir 中的提交对象，不运行 git（ADR-100，上限见 §10.1.3）”。
- `11` §11.6.2 S2 读允许列表：补“Tower git 垫片目录与垫片 exec-path `<wtRoot>/_stores/_shim/`（ADR-088/097）”。
- `16` §16.8 `PATH` 行：恢复被错并到下一行的 4 个单元格；补“嵌套调用经 `GIT_EXEC_PATH` 垫片 exec-path 同样经过垫片（ADR-097）”。
- `16` §16.2.6 git 隔离行标题：补 ADR-096/097/100。
- `15` 修订注：ADR-071 ← ADR-096；ADR-088 ← ADR-097。

### 2.3 读权限与安装器（ADR-098/100、R7-D7-02）

- `16` §16.1.10 `read.pi_resources`：去掉 `~/.pi/agent/extensions/**`，改为 ADR-100 的路径集合（与 `11` §11.1 一致）。
- `16` §16.8 角色说明：I-prefetch “写 `$SH` 与 `$VS/xdg`” → “写入暂存目录、由 Supervisor 校验后发布到 `$SH`（Prisma 引擎在发布 depcache 时物化到 `$VS/xdg`）”。
- `07` §7.4.3 物化表：Prisma 引擎位置同上（第 6 轮 U2 已由作者在 `16` 落地，本处对齐）。
- `02` §2.5 默认 protected：`pnpm-workspace.yaml` 键补 `catalogs`（与 `11` §11.3.3 一致）。

### 2.4 登记表其他

- §16.1.13 新增废弃行：Tower 在卫星 gitdir 上运行 git；`~/.pi/agent/extensions/**` 对 Agent 可读；对无检出的 `paused(human_change_verify_failed)` 使用 `hand_back`；“嵌套 git 调用绕过垫片属已知限制”。
- §16.1.13 M1 行依据：“ADR-038 待主干同步” → “ADR-038”。

## 3. 过时术语扫描结果（修正后）

| 术语 | 剩余出现 | 说明 |
|---|---|---|
| 在卫星 gitdir 上运行 `git log` | `15` ADR-089 第 3 点（已有 Amended by ADR-100） | `10`/`06`/`16` 均为“自行解析” |
| `~/.pi/agent/extensions` 对 Agent 可读 | `15` ADR-091 正文（已有 Amended by ADR-100） | 其他出现均为“不可读”或 Host 侧扩展发现 |
| 无检出时 `hand_back` | 0 | — |
| “+1 人 28 周” | 只在 `16` §16.1.13 废弃表 | 现行 29 周 |
| `take_over_from` | 0 | — |
| `git_control_tampered` | ADR-072/089 与退役说明 | — |

## 4. 未解决的冲突

| # | 冲突 | 位置 | 说明 / 建议 |
|---|---|---|---|
| U1 | **从 `in_review`/`accepted` 接管后放弃改动、但卫星树已不等于 pin 的树时去哪里**：`06` §6.4.3 写 → `verifying`（I2）；`10` §10.8.4 写“否则回到 `paused(<接管前的原因>)`”（从 `in_review`/`accepted` 接管时没有接管前原因）；ADR-099 写“`paused(<接管前的原因>)` 或 `takeoverFrom` 对应的最近一致状态”，未定义；`03` §3.2.1 写“回到接管前的状态/原因” | `15` ADR-099、`06` §6.4.3、`10` §10.8.4、`03` §3.2.1 | 需裁决：重新验证（`verifying`，符合 I2 但相当于自动开验证），还是停在 `paused(human)` 让人选。裁决后在 ADR-099 写明，`10`/`03` 照抄 |

第 6 轮未决项已落地：U1（多仓库回退/分叉按 `piEntryId` 或 `{projectId, checkpointN}`，`06` §6.4.3）；U2（Prisma 引擎预取到 `$SH/prisma`，发布时物化到 `$VS/xdg`，`16` §16.8）。

## 5. 复现

```
python3 docs/reviews/lint/xref.py
python3 docs/reviews/lint/xref.py --dump refs.tsv
```

(e) 的判据：`06` §6.4.3 每条命令产生的 `human.decision{kind}` 都在 `02` §2.7 与 `16` §16.1.5，反之每个 kind 至少有一条命令产生。§16.8 I 列判据：每个写入都标注 F/P/N 阶段。
