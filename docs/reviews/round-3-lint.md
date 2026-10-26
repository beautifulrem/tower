# 第 3 轮 · 一致性 lint 报告（ADR-039）

日期：2026-10-15 · 范围：`docs/00`–`docs/16`、`README.md` · 依据：`16-registry.md`、`15` ADR-001–070（ADR-044 Superseded by ADR-060；ADR-046 冻结部分 Superseded by ADR-065；ADR-038 = 26 周；ADR-063 安装器 npmrc 位置）、`reviews/round-3.md` 与 5 份第 3 轮回应。原则同第 2 轮：只做机械修正，不改设计决定；冲突列入 §4。

## 1. 方法与结果

| 检查 | 做法 | 结果 |
|---|---|---|
| 章节引用解析 | `python3 docs/reviews/lint/xref.py` | 1991 处章节引用、538 个编号标题、ADR-001–070：**0 断链、0 文档号不符** |
| 引用主题匹配 | `--dump` 后与第 2 轮的引用集合按“文档 + 目标 § + 前文 25 字”比对，筛出第 3 轮新增或改动的 298 处，逐条过目 | 1 处指错（`16` §16.8 的“M0 SP6”），2 处与所属文档矛盾的描述（`07` 备份经用户仓库、`10` 槽位检出来源），已改 |
| 枚举 | `16` §16.1 ↔ `02` 类型 ↔ `06` DDL `CHECK`（脚本逐列比对，35 个 CHECK 集合）↔ 用法抽取 + 近似拼写检测 | DDL 的 CHECK 值全部已登记（`engine_outbox.state`、`timers.state` 为内部状态，未登记）；补登记 3 个新值（§2.2） |
| **新规则 (a)** DDL 列 ↔ `02` 字段 | 脚本按 13 对“表 ↔ 接口”展开嵌套字段比对，人工排除扁平化（`attach.*`、`crossCheck.*`、`submit.*` 等）与关联表（`goal_deps`、`watermarks`、`project_checkouts`） | 3 处真缺口已修：`goals.shaping_issue` 缺列；`checkpoints.head_sha NOT NULL` 与 `10` §10.7.1 `Checkpoint{satelliteHead?, inUserRepo}` 不符；`02` `attach.mode:"satellite"` 与 ADR-060/`10`/DDL 的 `satellite: true` 不符 |
| **新规则 (b)** 环境变量 ↔ `16` §16.8 | 抽取全部 `UPPER_SNAKE` 与 `npm_/pnpm_config_*` 变量（84 个），与 §16.8 文本比对，再按“包管理器 / 工具链 / 代理”归类 | 9 个与包管理器或工具链相关的变量出现在 `05`/`07`/`10`/`11` 却未登记，已登记（§2.4）；`PRISMA_ENGINES_CACHE`、`npm_config_devdir` 只剩 ADR-045 正文与废弃表 |
| **新规则 (c)** §16.8 V 列不得引用 A 可写路径（ADR-061） | 逐格检查 §16.8.1–16.8.3 的 V 列：只允许 `$VS`、`$SH`、`$SLOT`、`$TI`、`—` | **通过**。唯一读取 Agent 产物的是“项目级 `.npmrc` 读取 pin 中的版本”：它属于被测代码本身，已按 `02` §2.5 protected 并有哨兵，不是 ADR-061 所指的“验证器配置”。另修正 `07` §7.4.3 中“I/V 的 npmrc 都在 `$VS`”（与 ADR-063、§16.8 矛盾） |
| 过时术语 | 先把 12 条新废弃项写入 `16` §16.1.13，再逐项 grep | 修正 9 处残留（§3） |
| 数值 | `16` §16.2 每行数字 ↔ 所属 §；`07` §7.13、`08` §8.14、`09` §9.13 对照表；M1 日期 | 无新的数值不符；1 处语义冲突列入 §4 U3 |
| M1 / M2 标注 | 按 ADR-059（ADR-064 修订）检查生态、RPC、摘要、`.towergoal` 等 | `08` §8.14 摘要补 M2；ADR-059 本身的生态行与 ADR-064 不符，已加修订注 |

## 2. 改动清单（文件：之前 → 之后）

### 2.1 `16-registry.md`

- §16.1.13 新增 12 行废弃项：linked worktree → 卫星克隆；`GIT_OBJECT_DIRECTORY`/私有对象目录；`$GIT_COMMON_DIR` 下的 Agent 写入许可；RPC 输入深度冻结（ADR-065）；`PRISMA_ENGINES_CACHE`；`npm_config_devdir`；pnpm ≥ 11 用 `npm_config_*`；“有保留的已验证（生态未支持）”；`fsmonitor_mismatch`；运行阶段 `paused(s0_grant_pending)`（ADR-068）；参考硬件“8 核”。（“20 周”已在既有“16 周 / 20 周 → 26 周”行中。）
- §16.1.3：新增 `ScopeFence.includeOrigin` = `explicit` · `template` · `compiled`（`02` §2.5 已有，未登记）。
- §16.1.7 `stalled` 子类型：加 `worktree_missing`（`10` §10.16.2 情形 E：卫星重建失败）。
- §16.1.12“分支 / 影子 ref”：`tower/<goalId>-<slug>`；`{cp,pin,safety,abandoned}` → 区分用户仓库 Goal 分支 `refs/heads/tower/<goalId>-<slug>`（只由 seal 产生）与卫星工作分支 `tower/<goalId>`；补 `seal/<n>` 与 `refs/tower/<goalId>/base`（ADR-060 保活）；注明写入点为影子目录（与 `10` §10.2 一致）。
- §16.2.6 端口段：补 `TOWER_PORT_COUNT`（20）（`05` §5.3.6 已设置）。
- §16.7：威胁表 T1–T28 → T1–T29。
- §16.8 抬头：“M0 SP6 的验收清单逐行覆盖本表” → “SP6c（M1 第 1–3 周，计入 W8）的验收清单 P1–P12 逐行覆盖本表”（`14` §14.2 已把包管理器矩阵拆入 SP6c）。
- §16.8 规则 4（代理）：补 `ALL_PROXY`、大小写两种写法、`NO_PROXY`（`05` §5.3.6 已列）。
- §16.8.1：新增“构建结果缓存旁路”行 `TURBO_FORCE=true`、`NX_SKIP_NX_CACHE=true`（V，`07` §7.4.3 `VerifyEnv.set`）；新增“继承的工具链定位变量”段：A 继承 `JAVA_HOME`、`GOPATH`、`NVM_DIR`、`PNPM_HOME`、`CARGO_HOME`、`RUSTUP_HOME`、`VOLTA_HOME`（`11` §11.7，非 Node 的 `CARGO_HOME`/`GOPATH` 由 §16.8.2 改写），V 继承 `NVM_DIR`、`RUSTUP_HOME`、`GOROOT`、`PYENV_ROOT`（`07` §7.4.3）。
- §16.8.3 Python 行：补 V 的 `UV_LINK_MODE=clone uv sync --frozen --offline`（`07` §7.4.3、`10` §10.4.2）与 Poetry 的 `POETRY_VIRTUALENVS_IN_PROJECT=true`（`10` §10.4.2 草案）。

### 2.2 枚举与 DDL ↔ `02`（新规则 a）

- `06` §6.3 `goals`：新增 `shaping_issue TEXT CHECK (shaping_issue IN ('no_proposal','crashed','budget','unresponsive'))`（`02` §2.4 `Goal.shapingIssue` 无对应列）。
- `06` §6.3 `checkpoints`：`head_sha TEXT NOT NULL` → `satellite_head TEXT`（可空，信息性）+ `in_user_repo INTEGER NOT NULL DEFAULT 0`，并注明 `commit_sha`/`tree_sha` 位于影子目录（`10` §10.7.1 `Checkpoint`，ADR-060；回应文件已要求去掉 `headAtCapture`）。
- `02` §2.4 `WorkspaceBinding.attach`：`mode: "satellite"` → `satellite: true`（ADR-060 第“后果”条、`10` §10.1.1、DDL `satellite` 列三处一致）。
- `07` §7.10.3 `decide()`：零机器标准的标签由裸字符串 `"not_machine_verified"` → `{label:"not_machine_verified", reason:"human_only"}`（与 `16` §16.1.1 的原因枚举一致；`exec_not_run` 分支已带原因）。

### 2.3 环境变量与角色（新规则 b、c）

- `07` §7.4.3“按包管理器主版本生成配置”：“npmrc 副本（A 在 `$GS`，I/V 在 `$VS`）” → “A 在 `$GS`，V 在 `$VS`（不含令牌），I 的含令牌副本在 `$TI` = `~/.tower/installer/<projectId>/`，A 不可读；ADR-063”。
- `07` §7.4.3 安装器伪代码：“配置 = $VS 中生成的副本” → “配置 = $TI 中含令牌的 npmrc 副本 + $VS 中生成的其余配置，ADR-063”。

### 2.4 ADR-060（卫星克隆 + 影子目录）的残留

- `05` 陷阱表 G1、`06` §6.2.4 时序图、`06` §6.8 F5 与 F14：`ensureWorktree` → `ensureSatellite`（`16` §16.1.13 已登记为废弃；`10` §10.3.1 已改名。`05-06` 回应称“`06` 沿用 `ensureWorktree` 函数名”，与注册表冲突，按注册表处理）。
- `06` §6.1.1：“每个 worktree 的 fsmonitor 守护进程（`10` §10.14）另计约 5–15 MB” → “fsmonitor 在 ADR-060 下默认关闭（M1 计 0；若 SP5 评估后启用，每个卫星或槽位约 15 MB，`13` §13.8.3）”。
- `07` §7.3.2 伪代码注释：“需要进入用户仓库时（seal、备份）” → “（seal、归档前的地标检查点；备份 bundle 直接从影子生成，`10` §10.16.3）”。
- `09` §9.12.4 清除全部：“执行 `git worktree prune`” → “删除 `refs/tower/*` 与 `refs/heads/tower/*`；删除各卫星克隆目录（不再有 linked worktree）”。
- `10` §10.2 卫星回退位置：`~/.tower/worktrees.noindex/<projectId>/<goalId>` → “`Project.worktreeRoot` 或 `~/.tower/worktrees`（带 `.noindex` 后缀的子目录，§10.4.3）下的 `<projectId>/<goalId>`”（与 `10` §10.4.3 正文和 `16` §16.1.12 一致）。
- `10` §10.2 验证器槽位行：“槽位从用户仓库（已 fetch 的 pin）检出” → “槽位工作目录无 `.git`，由 Tower 自有的 `slot-<k>.git`（alternates → 影子与用户对象库）检出 pin”（`07` §7.4.2 是槽位的所属文档）。另见 §4 U1。
- `11` §11.4 事后检测：“`git restore --source=<prevCp>`” → “Tower 在影子上下文中执行 `restore --source=<prevCp>`（`10` §10.1.2、§10.8.1）”（检查点对象只在影子中，卫星里无法解析）。

### 2.5 ADR-065（RPC 不冻结）与其他 ADR 的残留

- `11` §11.12 T27 缓解措施：“ADR-046：tower-goal 最先加载并深度冻结输入 … 检测到拦截型扩展时 RPC 只允许低风险 Goal” → “ADR-065：不冻结；哈希比对；RPC 只在无 `tool_call`/`tool_result` 处理器、无 bash 覆盖时可用，每次 `tool_call` 用 `getAllTools()` 复核，否则必须用 SDK”；残余风险说明同步。
- `15` ADR-024 标题：补“Amended by ADR-065”。
- `15` ADR-021 第 1 点：补“具体变量与前缀以 `16` §16.8 为准，按包管理器主版本区分（ADR-063）”。
- `15` ADR-045 正文：补“（ADR-063 修订：pnpm ≥ 11 用 `pnpm_config_*`；node-gyp 改为 `npm_package_config_node_gyp_devdir`；Prisma 改为按角色的 `XDG_CACHE_HOME`；npmrc 按角色生成副本）”。
- `15` ADR-043 正文：“有保留的已验证（生态未支持）”后补 ADR-064 修订注。
- `15` ADR-059：标题补“Amended by ADR-064：生态行”；生态行“其他生态‘有保留’的基本验证” → “其他生态 Agent 侧可用、验证器不运行，以‘未经机器验证（生态未支持）’进入评审”，推迟列 → “其他生态的机器验证：M2”。

### 2.6 远程与里程碑

- `06` §6.4.3 `contract.amend` scope：`full` → `full（远程：web 只允许不放宽的修订，mobile 禁止，`16` §16.5）`（第 2 轮 U1 已由 `16` §16.5 与 `04` §4.14 裁决，命令表未同步）。
- `08` §8.14：“摘要” → “摘要（M2）”。

## 3. 过时术语扫描结果（修正后）

| 术语 | 剩余出现 | 说明 |
|---|---|---|
| linked worktree | `10` §10.1（ADR-060 的取代说明）、§10.1.1（用户自己的多个检出）、`15` ADR-008/060 | 历史或指用户自己的 worktree |
| `GIT_OBJECT_DIRECTORY`、`_objects/`、迁回 | `10` §10.6.1“为何不再设置”、`15` ADR-044（已 Superseded） | — |
| `$GIT_COMMON_DIR` 写允许 | 0（`15` ADR-060“后果”中的改写说明除外） | `11` §11.6.2 为完全只读 |
| RPC 深度冻结 | `15` ADR-046（冻结部分已 Superseded）；`05` §5.4.1、`11` §11.4 均为“不冻结” | “输入冻结比对”是 ADR-024 的哈希比对名称，非冻结 |
| `PRISMA_ENGINES_CACHE`、`npm_config_devdir`、pnpm ≥ 11 的 `npm_config_*` | `15` ADR-021/045（已加修订注）、`16` 废弃表 | — |
| “有保留的已验证（生态未支持）” | `15` ADR-043（已加修订注）、`12` §12.16 #24（变更记录） | — |
| `fsmonitor_mismatch` | 0 | `07`/`16` 均为 `stat_cache_mismatch` |
| 20 周 | `14` §14.3.4（“第 2 轮的 20 周估算有两处错误”）、`15` ADR-038 推导 | 现行 26 周（备选 24 周） |
| 运行阶段 `paused(s0_grant_pending)` | 0；`03`/`04`/`05`/`06`/`07`/`12` 均写明只在验证阶段 | — |
| 参考硬件 8 核 | `07` §7.4.10、`13` §13.8.3 的“8 核变体结论不变”注 | 现行 10 核（8P + 2E）/ 16 GB |
| `ensureWorktree`、`worktree.*` 事件 | 0（`10` §10.18 的“原 `worktree.*`”注除外） | — |

## 4. 未解决的冲突（未改动设计）

| # | 冲突 | 位置 | 说明 / 建议 |
|---|---|---|---|
| U1 | **pin 是否在验证前进入用户仓库**：`10` §10.2 末段与 §10.6 规定“验证前在用户仓库 `fetch` pin，验证器从用户仓库检出”；`07` §7.3.2/§7.4.2 规定槽位用自有 `slot-<k>.git`（alternates → 影子与用户对象库）**直接从影子检出 pin，不需要进入用户仓库**。ADR-060 第 5 点只说“需要进入用户仓库时”经 fetch | `07` §7.3.2、§7.4.2；`10` §10.2、§10.6 | 本轮只把 `10` §10.2 槽位行改为与 `07` 一致的检出方式，未改“验证前 fetch”规则。需决定：验证前 fetch（便于审计、用户仓库可见 pin）或不 fetch（用户仓库更少 Tower ref） |
| U2 | **pin 的父提交**：`07` §7.3.2 `commit-tree tree -p <最近检查点>`；`10` §10.6 `commit-tree T -p <baseCommit>` | `07`、`10` | 指纹不含 HEAD，结论不受影响，但审计链与 `git log` 形态不同；由 `07`/`10` 作者统一 |
| U3 | **Agent 进程树杀进程上限的口径**：`13` §13.8.3 与 `16` §16.2.6 为 `max(m_v, 1.5 × p90_g)`，`m_v` = 验证槽位**预留**（`1.3 × p95`，无历史 2 GB），理由是“不得低于验证器的杀进程上限”；但 `07` §7.4.4 的验证器杀进程上限是 `env.memLimitMb ?? max(2 GB, 2 × 预留)`，高于 `m_v` | `13` §13.8.3、`07` §7.4.4、`16` §16.2.3/§16.2.6 | 按 `13` 自己的理由应取验证器的杀进程上限；或修改理由。属 R3-D10-01 的数值决定，交 `13`/`07` |
| U4 | `worktree_missing` 是否随 ADR-060 改名（如 `satellite_missing`）；界面文案已是“工作目录缺失” | `16` §16.1.1、§16.1.7；`02`、`06` DDL | 标识符保持不变（改名需同步 DDL 与事件迁移）；如改名应先发 ADR |
| U5 | 第 2 轮 U3（`contract.quick_ratify` 命令名由 lint 选定）仍待 `06` 所有者确认 | `06` §6.4.3、`16` §16.5 | 未变 |

第 2 轮的其余未决项已在第 3 轮落地：U1（远程修订 → `16` §16.5 只允许 web 上不放宽的修订）、U2（`verify_env` 的 dedupeKey → `08` §8.4）、U4（摘要 M2 与 E3 → `14` E3 注明摘要臂只在 M2 运行）、U5（`createBashToolDefinition` → `11`、ADR-041 已统一）。

## 5. 复现

```
python3 docs/reviews/lint/xref.py                  # 断链与文档号（0 problems → 退出码 0）
python3 docs/reviews/lint/xref.py --dump refs.tsv  # 全部引用及目标标题，供主题核对
```

新规则 (a)(b)(c) 的检查方式见 §1；(c) 的判据已写在 `16` §16.8 规则 1。
