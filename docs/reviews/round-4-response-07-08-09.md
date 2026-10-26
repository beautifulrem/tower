# 第 4 轮评审回应：07 / 08 / 09

依据 ADR-071 – ADR-080，以及协调者关于“只有 seal 进入用户仓库”的裁决。

| 条目 / 决策 | 处理 | 位置 |
|---|---|---|
| R4-D7-01 | 新增 lifecycleIndirection：根与 workspace 的 `preinstall/install/postinstall/prepare/prepack/prepublish` 及标准脚本的 `pre*/post*` 连同其调用文件**默认 protected**，变化即 `lifecycle_script_changed`（sev 3，阻断）；槽位中生命周期与 prepare 之后，按物化时的 stat 快照 + depcache manifest 逐文件复核第三方依赖，生成路径白名单之外的改动 → `runner_tampered`（运行器类包 sev 3 阻断，其他 sev 2）；攻击用例 T14 | `07` §7.4.3、§7.5.1、§7.5.2 R-T9、§7.10.1 |
| R4-D7-02 | 识别顺序 `packageManager` → `devEngines.packageManager` → 在用户检出中探测 PATH 上的 `pnpm --version` 并经人确认记入 `VerifyProfile.packageManager`（确认前按“生态未支持”）；`lockfileVersion` 不用于判定主版本；安装器把确切版本取进 `$SH/tools`（校验 integrity），A/I/V 的 PATH 首位，不依赖 Corepack；关闭自切换 `manage-package-manager-versions=false`；用例 T12、T13 | `07` §7.4.3、§7.13 |
| R4-D7-03 | `ecosystemSupported(goal, criterion, pin)` 按标准逐条判定（cwd 最近 lockfile + 间接解析后的程序）；先有 exec 标准再判生态；yarn/bun 在 M1 按“生态未支持”；部分跳过 → `verified_qualified` 逐条列出，全部跳过 → `not_machine_verified{ecosystem_unsupported}`；示例三则 | `07` §7.4.1、§7.4.3、§7.10.3 |
| R4-D7-04 | 卫星侧物化：改写 `.modules.yaml` 指向 `$GS` store、删除 workspace state、A 配置 `confirm-modules-purge=false`；用例 T17（并入 SP6c P1–P4） | `07` §7.4.3 |
| R4-D7-05 | stage 的 package.json 只删 `scripts`，保留所有影响解析与构建的字段；项目 `.npmrc`（令牌剥离）与 `pnpm-workspace.yaml` 进入 stage 与 `depsKey`；确切命令：`pnpm install --frozen-lockfile --ignore-scripts` + `pnpm rebuild --pending`，`npm ci --ignore-scripts` + `npm rebuild <hasInstallScript 的非 workspace 包>`；生命周期执行顺序（阶段内 workspace 拓扑序、根包最后、单并发）、网络（`VerifyProfile.env.network`）、超时（`prepareTimeoutSec` 600 s）、守卫类脚本识别跳过；耗时计入 S 而非 5 s 物化预算；用例 T15、T16。`10` L204 的旧命令需由 `10` 改为引用 `07` | `07` §7.4.3、§7.13 |
| R4-D7-06 | 统一为 `verifier_store_tampered`：删除受影响条目、本次以 `verify_env_error{stage:"integrity"}` 结束、重新生成后自动重试一次、提示检查沙箱 | `07` §7.4.3、§7.10.1 |
| R4-D10-01 | 采用 ADR-075：`decisive` = 影子索引 + `trustctime`/`checkStat=default` 的 stat 检查；`full`（全新临时索引）只在 accept 与 seal；`in_review`/`accepted` 改为文件系统事件驱动；删除“≤ 30 ms 快路径”“≤ 2 s 决定性指纹”，改为 ≤ 150 ms（2 万文件无变化）与按规模实测登记的 full 耗时 | `07` §7.3.2、§7.14 |
| R4-D13-06 | `07` 不再列加固选项，只引用 `10` §10.1.2 作为唯一清单；槽位中不再执行 `submodule update`，M2 的子模块按 base 的 gitlink 从用户仓库取 | `07` §7.3.2、§7.4.2 |
| R4-D13-07 | `info/exclude` 复制与换行策略归 `10` §10.1.2（07 引用） | `07` §7.3.2 |
| R4-D16-01 | 重放包规格：内容、体积、保留（随验证日志；被 accept 引用的 180 天）、隐私、重放时 depcache 已淘汰的“近似重放”与缺失输入的“不可重放”；命令属开源核心 | `07` §7.4.1 |
| R4-D4-02 / ADR-077 | `Goal.s0Grant` 五态；`deny_s0_exec`；`denied_timeout` → `not_machine_verified{reason:"s0_denied", by:"timeout"}`；in_review/accepted 的 `retry_verify` 与 `grant_s0_exec` → verifying；从 `s0_grant_pending` 返回保留 `verifyFrom` | `07` §7.4.1、§7.10.3 |
| ADR-071 | 嵌套 `.git` 自有扫描与 `:(exclude)`、gitlink 永不入影子索引、被排除路径在评审中列出；`nested_repo` sev 3 阻断；子模块项目 → `not_machine_verified{submodules_unsupported}` | `07` §7.3.2、§7.4.1、§7.10.1 |
| ADR-072 | `git_control_tampered` 进入严重度表 | `07` §7.10.1 |
| ADR-073 | 影子与槽位的 alternates 指向 Tower 镜像库 | `07` §7.3.2、§7.4.2 |
| ADR-078 / R4-D8-01 / R4-D8-02 | 本地文件清单播种到槽位（含密钥的只给槽位与检验检出）；extraGlobs 哈希取播种来源；人工检验检出；被跟踪 env 文件对 Agent 可读并照常扫描 | `07` §7.3.2、§7.4.2、§7.6.6 |
| 协调者裁决（seal） | 只有 seal（及默认关闭的地标检查点）fetch 进用户仓库；pin 不在 in_review 时 fetch | `07` §7.3.2 |
| R4-D8-03 | 倒计时文案表：wait 不显示；use_defaults 下 approval/S0 授权“30 分钟后 → 拒绝（仅 use_defaults）”，standard/high 问题“超时后暂停（不自动作答）” | `08` §8.7.1 |
| R4-D8-04 | 不可能被机器验证的 Goal 在简报与摘要中显示“观测 O/M · 未经机器验证（原因）”，不显示“已验证 0/M” | `08` §8.10.4、§8.11 |
| R4-D12-01 | 绑定时同 canonicalRoot 但根集合/远端不一致 → 人确认（ADR-080） | `09` §9.1、§9.12.2、§9.12.3 |
| R4-D12-02 | 新 Needs-You kind `project_identity`（去重键、选项、`merge_projects`/`split_project`），不再复用 `sync_conflict`；`.towergoal` 与记忆导入同样使用 | `08` §8.4、§8.8；`09` §9.12.2–9.12.3 |
| R4-D12-03 | 卫星与检验检出永不登记为检出（实现归 `02`/`10`） | `09` §9.1 |
| ADR-076 | `paused(satellite_missing)` 的注意力映射 | `08` §8.6.5 |

## 需要主干修改的地方

1. **`02` §2.9 / `16` §16.1.7**：Needs-You kind 增加 `project_identity`；HumanDecision 增加 `merge_projects` / `split_project`。
2. **`16` §16.1.6**：detector 增加 `lifecycle_script_changed`、`runner_tampered`、`verifier_store_tampered`；删除 `depcache_tampered`、`verifier_config_tampered`；`verify_env_error.stage` 增加 `integrity`。
3. **`02` §2.5 / `11` §11.3.3**：默认 protected 集合加入 lifecycleIndirection（生命周期脚本键及其调用文件）。
4. **`16` §16.8 与 `10` §10.4.2**：stage 内容与安装命令按 `07` §7.4.3 改写（`--ignore-scripts` + rebuild、只删 `scripts`、`.npmrc` 入 stage 与 depsKey）；A 列加 `confirm-modules-purge=false` 与卫星的 `.modules.yaml` 改写；`manage-package-manager-versions=false`；`$SH/tools` 行。
5. **`16`**：VerifyProfile 新字段 `packageManager`、`prepareTimeoutSec`（600 s）、`generatedPaths`；命令 `tower verify --replay` 登记为开源核心；`not_machine_verified` 原因加 `submodules_unsupported` 与 `by`。
