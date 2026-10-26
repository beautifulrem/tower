# 第 5 轮评审回应：07 / 08 / 09

依据 ADR-081 – ADR-087。

| 条目 / 决策 | 处理 | 位置 |
|---|---|---|
| R5-D6-01 / ADR-083 | `07` §7.4.1 成为重放包的**唯一规格**：位置 `replay/<verifyId>/`（manifest 列出 factId）；内容 = 验证日志 + 瘦 bundle（base..pin）+ lockfile/`depsKey`/depcache manifest 哈希 + `$VS` 配置哈希 + 脱敏输出 + 工具版本；base 对象依赖镜像库与保留 ref `refs/tower-retain/<goalId>/<factId>`；随 Fact 永久保留；隐私清除删除重放包与保留 ref；**不做近似重放**，缺失或不一致即“不可重放” | `07` §7.4.1；`09` §9.12.4 |
| R5-D7-01 / ADR-085 | 运行器集合（运行器本体 + 直接依赖 + 命令链中每个程序解析到的包）做**内容哈希**比对；其他依赖的 stat 快照加入 ctime；prepare 后的未跟踪产物检查（`prepare_untracked_output`）；标准执行前重置 TMPDIR 与运行器缓存（含 jest `--cacheDirectory`）；调用文件传递闭包登记为残余风险（中）；规避用例 P27 | `07` §7.4.3、§7.10.1 |
| R5-D7-02 / ADR-085 | 安装器拆为带令牌、只拉取（`pnpm fetch --ignore-pnpmfile` / `npm cache add`）与无令牌、断网的安装阶段；`.pnpmfile.cjs` 视为项目代码（protected → `lifecycle_script_changed`），只在安装阶段运行；`file:` 本地依赖源目录进入 stage 与 `depsKey`；补丁路径取自 `patchedDependencies` 的值；npm rebuild 命令统一（`10` 引用 `07`）；用例 P26、P28、P29 | `07` §7.4.3 |
| R5-D7-03 / ADR-085 | Node 选择顺序 `.nvmrc` → `.node-version` → `volta.node` → `engines.node` → 默认 LTS，人确认后记入 `VerifyProfile.node`；工具缓存安装（校验 SHASUMS256）；Node 版本进入 `depsKey`；A/I/V 的 PATH 由 Tower 显式构造；用例 P30 | `07` §7.4.3、§7.13 |
| R5-D7-04 / ADR-085 | 命令链中**每个**程序参与生态判定；exit 127 / ENOENT → `verify_env_error{stage:"exec", missing}`；用例 P31 | `07` §7.4.1 |
| R5-D10-01 / ADR-086 | `bigFileExcludes` 只用于 advisory（只服务 Live Line 显示）；观察器、检查点、pin、seal、验收重哈希收录全部文件；大文件在评审单元中折叠 | `07` §7.3.2 |
| R5-D10-02 | (a) `$SH` 与 depcache 每次验证前只做含 ctime 的 stat 快照比对（≤ 200 ms），不一致或超过 24 h 才做全量内容哈希（后台）；(b) FSEvents `MustScanSubDirs`/`UserDropped`/`KernelDropped` 与 inotify `IN_Q_OVERFLOW` → 立即 decisive；watch 上限或监视失败 → 退回 60 s decisive 巡检并标注“监视降级” | `07` §7.3.2、§7.4.3 |
| R5-D4-02 / ADR-084 | 删除“运行时字段，不持久化”；`verifyFrom` 与 `pendingVerify` 持久化，跨越 `s0_grant_pending` 与重启 | `07` §7.10.3 |
| R5-D8-01/02 / ADR-082 | 检验检出按验证器沙箱档位执行，S0 未授权时只复制文件；含密钥本地文件只到槽位与检验检出，Agent 对 `_verify`/`_inspect`/`_human` 与用户主检出读拒绝 | `07` §7.4.2 |
| ADR-081 | 卫星无 `.git`、分离 gitdir；“我来改”使用人工编辑检出（`08` 诊断视图动作同步） | `07` §7.3.2；`08` §8.13.3 |
| R5-D12-01 / ADR-087 | 导出与同步元数据加入 `disambiguator`；自动合并要求 `canonicalRoot` 与 `disambiguator` 都相同；根集合按全部 ref 计算；拆分后记忆、信任、VerifyProfile 留在原 Project，新 Project 可逐条复制记忆（`origin:"copied_from_project"`） | `09` §9.1、§9.2、§9.12.2、§9.12.3 |
| R5-D14-01 (b)(c) | 测试编号统一为 `14` 的 P 编号：旧 T1–T17 的映射表，`14` 尚无的列为 P21–P31（建议新增）；更正 `pnpm rebuild --pending` 会执行根包 postinstall 的描述（stage 已删 scripts，故无害） | `07` §7.4.3 |
| R5-D15-01 #1 | 定出 sentinel / anomaly 分类规则（Goal 内容与执行效果 → sentinel；Tower 自身状态 → anomaly），据此请 `16` 改正 | `07` §7.10.1 |
| R5-D15-01 #6（`09` 部分） | 清除一个 Goal 补全卫星、gitdir、影子、人工/检验检出、镜像保留 ref、重放包；“清除全部”按可配置的 seal 分支前缀 | `09` §9.12.4 |

## 需要主干修改的地方

1. **`14` §14.2**：登记 P21–P31（内容见 `07` §7.4.3 映射表）。
2. **`16` §16.1.6**：按 `07` §7.10.1 的规则把 `nested_repo`、`git_control_tampered`、`runner_tampered`、`lifecycle_script_changed` 改为 sentinel，并加入 `prepare_untracked_output`（sentinel）；`verify_env_error.stage` 加 `exec`（附 `missing`）。
3. **`16` §16.1.12、`06` §6.6.4**：重放包路径统一为 `replay/<verifyId>/`，并改为引用 `07` §7.4.1；`tower verify --replay <verifyId>`。
4. **`02` / `16`**：VerifyProfile 加 `node`；MemoryItem `origin` 加 `copied_from_project`。
5. **`10` §10.4.2**：安装命令与 npm rebuild 改为引用 `07` §7.4.3（fetch / install 两阶段）。
