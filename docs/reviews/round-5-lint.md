# 第 5 轮 · 一致性 lint 报告（ADR-039）

日期：2026-10-15 · 范围：`docs/00`–`docs/16`、`README.md` · 依据：`16-registry.md`、`15` ADR-001–088（新增 ADR-081–088；M1 = 31 个日历周）、`reviews/round-5.md` 与 5 份第 5 轮回应。原则同前：只做机械修正（ADR 优先于文档作者的落地口径），冲突列入 §4。

## 1. 方法与结果

| 检查 | 做法 | 结果 |
|---|---|---|
| 章节引用 | `python3 docs/reviews/lint/xref.py` | 2272 处、546 个编号标题、ADR-001–088：**0 断链、0 文档号不符** |
| 引用主题 | 与第 4 轮 dump 比对，新增/改动 180 处逐条过目 | 无指错；顺带发现 §2.4 的语义残留 |
| 枚举 16 ↔ 02 ↔ 06 DDL ↔ 用法 | 脚本 | `02` 与 `16` 的 `HumanDecision.kind` 完全一致（含 `reject_memory`）；DDL `CHECK` 值全部已登记；`verify_env_error.stage` 的 `exec` 在 `07`/`08` 未同步（§2.3） |
| DDL ↔ 02（规则 a） | 脚本 | `goals` 缺 `satellite_rebuilding`、`also_applies`（ADR-084 要求持久化）；`goals` 的表级 `CHECK` 夹在列定义中间（SQLite 语法要求表约束在列之后）；`resume_to` 注释与 ADR-084 不符（§2.2） |
| 环境变量 ↔ §16.8（规则 b） | 脚本 | 未登记的只剩 git 引用文件名（`ORIG_HEAD` 等）与 `IN_Q_OVERFLOW`（inotify 事件名），均非环境变量；A 的 `PATH` 未写 git 垫片（§2.1） |
| V 列（规则 c） | 逐格 | **通过**（新增的 Node 运行时、`PATH`、`.pnpmfile.cjs`、`file:` 依赖行均不引用 A 可写路径） |
| (d) Fact 名 / 检测器 id | 脚本 | 0 个未登记 |
| (e) 命令 ↔ `HumanDecision.kind` | 脚本 | 双向 0 缺项 |
| **(f) sentinel / anomaly 分类** | 按 `07` §7.10.1 表后规则，扫描全部 `sentinel{…}`、`anomaly{…}`（含 `detector:` 出现在花括号中任意位置）以及同句中“哨兵/异常”与检测器 id 的组合 | **0 处分类错误**：`nested_repo`、`git_control_tampered`、`lifecycle_script_changed`、`runner_tampered`、`prepare_untracked_output` 一律 `sentinel`；`verifier_store_tampered`、`stat_cache_mismatch`、`post_settle_activity`、`structured_content_dropped`、循环/停滞、`claim_contradicted` 一律 `anomaly`；`16` §16.1.6 已按此登记 |
| **(g) ADR-088 git 垫片** | grep `GIT_DIR`/`GIT_WORK_TREE` 的全部出现，逐条判断是否描述 Agent 沙箱 bash 的环境 | 修正 9 处（§2.1） |
| **(h) `Checkpoint` ↔ DDL** | 逐字段比对 `10` §10.7.1 与 `06` `checkpoints` | DDL 缺 `author`；`durationMs` 可空性不一致（§2.2） |
| **(i) 废弃项** | 先补 `16` §16.1.13 再 grep | “我来改”在卫星/工作目录中进行的残留 4 处已改（§2.4） |
| 数值与日期 | §16.2 ↔ 所属 §；M1 31 周 | 2026-11-09 + 31 周 → 2027-06-11 ✓；M2 14 周 → 2027-09-17 ✓；指纹节奏补“监视降级 60 s”（§2.5） |
| M1/M2 | ADR-059、ADR-078/081/082 | 人工编辑检出与检验检出均为 M1，内嵌预览 M2，未发现不一致 |

## 2. 改动清单（文件：之前 → 之后）

### 2.1 ADR-088：Agent 侧 git 垫片取代全局 `GIT_DIR`（检查 g）

- `05` §5.3.6 git 行：“沙箱 bash 经 `GIT_DIR`/`GIT_WORK_TREE` 指向它” → “沙箱 bash 不导出 `GIT_DIR`，由 PATH 首位的 Tower git 垫片……只对在卫星工作目录内运行、未显式指定其他仓库、子命令不是 `init`/`clone` 的 git 注入；其他目录中的 git 原样执行（ADR-088）”。
- `05` §5.3.6 “git 发现”行：“沙箱 bash：由 `spawnHook` 设置 `GIT_DIR`、`GIT_WORK_TREE` | … | `GIT_DIR` + `GIT_WORK_TREE`” → “沙箱 bash：**不导出**；git 垫片……| … | 不含 `GIT_DIR`；PATH 首位为 git 垫片”。
- `05` §5.3.6 `PATH` 行：补“沙箱 bash 的 PATH 最前另有 Tower git 垫片目录（Host 环境中没有）”。
- `07` §7.3.2 前提段：“Agent 经 `GIT_DIR`/`GIT_WORK_TREE` 使用” → “经 PATH 首位的 Tower git 垫片使用（只对卫星内运行的 git 注入，ADR-088）”。
- `10` §10.1 卫星行：“Agent 的 bash 以 `GIT_DIR`/`GIT_WORK_TREE` 使用它” → 经垫片使用。
- `10` §10.6.1：标题加 ADR-088；首段改为垫片的三个条件；“兼容性代价”整段（全局变量劫持临时仓库、`env -u` 简报提示、`commandPrefix` 备选）→ ADR-088 的代价（libgit2/isomorphic-git 看不到仓库；临时仓库不受影响；槽位不用垫片；G20 验证项）。
- `11` §11.6.2“为什么卫星 gitdir……”段：补第 (5) 点（Agent bash 不导出 `GIT_DIR`，垫片只作用于卫星内的 git）。
- `16` §16.2.6 git 隔离行：“Agent bash `GIT_DIR`/`GIT_WORK_TREE`” → 垫片表述；§16.8.1 `PATH` 行：补“A 的最前面是 Tower git 垫片目录（只读、A 不可写）……I、V 不使用垫片”。
- `14` G20：“统计因继承 `GIT_DIR` 而失败的测试；> 2% 改用 `commandPrefix`” → ADR-088 的验证项（临时仓库不受影响、`vitest --changed`/pnpm 正常、libgit2 类工具看不到仓库）；K22 改为 ADR-081/088 的代价与缓解；WBS W7 两处“Agent 的 `GIT_DIR` 环境” → “Agent 侧 git 垫片（ADR-088）”。
- `15` ADR-081 第 1 点：补 ADR-088 修订注。

### 2.2 DDL ↔ `02` 与 `Checkpoint`（检查 a、h）

- `06` §6.3 `goals`：新增 `satellite_rebuilding INTEGER NOT NULL DEFAULT 0`、`also_applies TEXT NOT NULL DEFAULT '[]'`（ADR-084：“`Goal.alsoApplies` 持久化（`02`、`06` DDL）”；`02`/`16` 已有，DDL 缺）；`resume_to` 注释 “`{state, pauseReason}`，重建成功后原样恢复” → “只用于 running 时卫星丢失；值恒为 `{"state":"running"}`”；表级 `CHECK (resume_to IS NULL OR pause_reason = 'satellite_missing')` 从列定义中间移到表尾。
- `06` §6.3 `checkpoints`：新增 `author TEXT NOT NULL DEFAULT 'agent' CHECK (author IN ('agent','human'))`；`run_id` 注释可空原因（safety、人工交还）。
- `10` §10.7.1 `Checkpoint.durationMs: number` → `durationMs?: number`（与 DDL `duration_ms` 可空一致）。
- `16` §16.1.12：新增 `Checkpoint.author` 行。
- `02` §2.7 `HumanDecision.kind`：注释整理（“paused 出口”注释原挂在 `reject_memory` 后面，改回到 `retry_verify|retry_claim|claim_on_behalf` 行）。

### 2.3 枚举

- `07` §7.4.4 `verify_env_error.stage` 联合类型：加 `"exec"`（ADR-085；`07` §7.4.1 与 `16` §16.1.3 已用）。
- `08` §8.4 `ve:` 键的阶段列表：加 `exec`，并注明以 `16` §16.1.3 为准。

### 2.4 ADR-081/084 的语义残留

- **ADR-084（卫星丢失是叠加态）**：`05` §5.5、`06` §6.1.6、`03` §3.2.1、`04` §4.18.3、`12` §12.6.5 仍按“覆盖在原状态之上的系统层暂停、`resumeTo = 原 (state, pauseReason)`、不参与优先级表”描述，与 ADR-084、`02`、`16` §16.1.1 和 `10` §10.16.2 情形 E（唯一定义）矛盾。按 ADR 改为：非 `running` 时只设 `satelliteRebuilding`，状态与 `pauseReason` 不变；`running` 时 abort → `paused(satellite_missing)`，`resumeTo={state:"running"}`；重建失败升级为常规原因、进入优先级表，并存原因记入 `alsoApplies`。（`05-06` 回应称“`alsoApplies` 删除”，与 ADR-084 相反，按 ADR 恢复。）
- **ADR-081（“我来改”不进卫星）**：`03` §3.4.2“在其 worktree 中亲自修改” → 在人工编辑检出 `_human/<goalId>` 中修改、交还时文件级写回卫星；`04` §4.2.4 与诊断视图线框“打开工作目录” → “打开人工编辑检出”；`16` §16.3 `E` 键说明补“M1 在人工编辑检出中用外部编辑器”；`15` ADR-036 补 ADR-081 修订注。

### 2.5 `16-registry.md` 其他

- §16.1.13 新增：Agent 沙箱 bash 全局导出 `GIT_DIR`/`GIT_WORK_TREE`（→ git 垫片，ADR-088）；卫星工作目录中的 `.git`（→ 分离 gitdir，ADR-081）。（`worktree_missing`、“我来改”直接在卫星中编辑、29 周、`replay/<factId>` 已由主干在本轮或上轮登记。）
- §16.2.3 指纹防抖与 §16.4 `in_review`/`accepted` 期间的指纹、§16.2.6 指纹预算行：第 4 轮写的“无定时巡检” → “正常无定时巡检；丢事件/溢出立即 decisive；监视降级时 60 s decisive 巡检（R5-D10-02）”，与同表“文件监视降级”行和 `07` §7.3.2、`13` §13.11 一致。

## 3. 过时术语扫描结果（修正后）

| 术语 | 剩余出现 | 说明 |
|---|---|---|
| Agent 环境导出 `GIT_DIR` | `15` ADR-081 第 1 点（已加修订注）、ADR-088 的“问题”段 | `10` §10.1.2 中的 `GIT_DIR=<影子或镜像>` 是 Tower 自己的 GitRunner 上下文，不是 Agent 环境 |
| 卫星工作目录中的 `.git` | 只以“没有 `.git`”“禁止创建 `.git`”与嵌套仓库扫描出现 | — |
| `worktree_missing` | `15` ADR-076 改名说明 | — |
| “我来改”在卫星中 | 0 | — |
| 29 周 | `14` §14.3.4、`15` ADR-038 推导 | 现行 31 周 |
| `replay/<factId>`、`--replay <factId>` | 只在 `16` §16.1.13 废弃表 | 全部为 `<verifyId>` |

## 4. 未解决的冲突

| # | 冲突 | 位置 | 说明 / 建议 |
|---|---|---|---|
| U1 | **多仓库 Goal 的检查点编号**：`10` §10.13 写“各仓库独立检查点序号空间（`refs/tower/<goalId>/cp/<n>` 在各仓库内各自编号，`Checkpoint` 增加 `projectId`）”，但 `10` §10.7.1 的 `Checkpoint` 接口无 `projectId`，`06` DDL 主键为 `(goal_id, n)`，无法容纳每仓库编号 | `06` §6.3、`10` §10.7.1、§10.13 | 多仓库 Goal 是 M3；需决定 M1 起就加 `project_id` 并改主键，还是留到 M3 迁移 |
| U2 | 主干回应把 `verifier_store_tampered` 列为 sentinel，而 `07` §7.10.1 规则、`16` §16.1.6 与本轮任务口径均为 anomaly。设计文档本身已一致（anomaly），仅回应文件表述不同 | `reviews/round-5-response-spine.md` | 以 `07`/`16` 为准；回应文件不在 lint 范围，未改 |

第 4 轮的未决项已在第 5 轮落地：U1（应用退出时验证中的 Goal 保持 `verifying` + `pendingVerify`，`03`/`06` 一致）、U2（新增 `reject_memory`）、U3（`contract.quick_ratify` 已沿用）。

## 5. 复现

```
python3 docs/reviews/lint/xref.py
python3 docs/reviews/lint/xref.py --dump refs.tsv
```

(f) 的判据：`07` §7.10.1 表后“sentinel 与 anomaly 的分类规则”；(h) 的判据：`10` §10.7.1 `Checkpoint` 的每个字段在 `06` `checkpoints` 中有同名列且可空性一致。
