# 第 3 轮评审回应：07 / 08 / 09

依据 ADR-060 – ADR-070。

| 条目 / 决策 | 处理 | 位置 |
|---|---|---|
| ADR-060（R3-D11-01、R3-D13-01/02） | 指纹、检查点、验证 pin 全部经 Tower 影子 git 目录执行（`towerGit`：`--git-dir=<影子> --work-tree=<卫星>`，`core.fsmonitor=false`、`hooksPath=/dev/null`、最小全局配置）；从不读卫星的 config/index/hooks。advisory 用影子目录自己的索引作 stat 缓存，decisive 用全新临时索引；删除 fsmonitor 快速路径及其 token 判据；pin/检查点只写影子目录，进入用户仓库时在用户仓库执行 fetch。验证槽位改为无 `.git` 的工作目录 + Tower 自有的 `slot-<k>.git`（可选 `exposeGit` 一次性克隆）；检查点恢复也经 `towerGit` | `07` §7.3.2、§7.4.1、§7.4.2、§7.4.4、§7.5.5、§7.13 |
| ADR-061（R3-D7-01） | 验证器只读取 `$VS` 中由安装器生成的配置，带内容哈希、每次验证前复核；篡改记 `anomaly{verifier_config_tampered}`；说明 `node-options` 攻击；SP6 用例 T10 | `07` §7.4.3、§7.4.4 |
| ADR-062（R3-D7-02） | stage 只为第三方依赖安装（`--ignore-scripts` + 只为依赖 rebuild）；项目自身生命周期脚本与 `VerifyProfile.prepare` 在槽位中针对 pin 执行；`depsKey` 只覆盖第三方输入（增加包管理器主版本）；Prisma 用例 T9；`pathDependent` 改为安装器按槽位路径构建 depcache 变体（槽位内从不 install） | `07` §7.4.3、§7.13（`prepare` 注释） |
| ADR-063（R3-D7-04） | 按包管理器主版本生成配置（pnpm ≤ 10 用 `npm_config_*`，≥ 11 用 `pnpm_config_*`）；npmrc 副本按角色；改写 `.modules.yaml`、删除 `.pnpm-workspace-state-v1.json`；槽位只执行 run 类命令；Prisma 经 `XDG_CACHE_HOME`；node-gyp 新变量；版本矩阵 T11；变量清单引用 `16` §16.8 | `07` §7.4.3 |
| ADR-064（R3-D7-03） | M1 非 Node：Agent 侧私有生态目录可用；验证器不运行，exec 标准只计入 O；以“未经机器验证（生态未支持）”进入评审；删除“有保留的已验证（生态未支持）”；`decide()` 增加 `exec_not_run` | `07` §7.2.4、§7.4.1、§7.4.3、§7.10.3 |
| ADR-068（R3-D4-01） | `decide()`：S0 授权未决 → `paused(s0_grant_pending)`，授权后以同一 pin 回到 verifying；拒绝 → `in_review`“未经机器验证（S0 未授权）”，可在评审中授权后重验；组合表补三行 | `07` §7.4.1、§7.10.3 |
| ADR-070（R3-D16-01） | 判定逻辑开源可审计；每次验证写重放包，`tower verify --replay <verifyId>` 本机重放 | `07` §7.4.1 |
| R3-D8-01 | 问题超时并暂停时条目保持打开、不写 `resolution`，只记 `timedOutAt`；与“超时并按默认作答”（写 `resolution.by="timeout"`）分开；精度统计中带 `timedOutAt` 的打开条目不进入分母，另单列超时暂停次数与超时后作答延迟 | `08` §8.7.1、§8.8 |
| R3-D8-02 | dedupeKey 表补 `verify_env`：`ve:{goal}:{stage}`；`outcomeClass` 表补一行 | `08` §8.4、§8.8 |
| R3-D10-01（参考硬件部分） | 统一为 **M1 Pro 10 核（8P + 2E）/ 16 GB**；注明 8 核机型同样得 c = 2，排队结论不变 | `07` §7.4.10 |
| R3-D12-01 | 只有 `canonicalRoot` 相同才自动合并；仅别名相交 → `sync_conflict` + 人确认的合并 Project 流程，确认前不注入；导入同规则；§9.1 注明 canonicalRoot 首次绑定后固定、新根只记为别名 | `09` §9.1、§9.12.2、§9.12.3 |

## 需要主干修改的地方

1. **`13` §13.8.3**：参考配置演算写的是“8 核”，请改为“10 核（M1 Pro 8P+2E）”，与 `07`/`16` 一致（c 不变）。R3-D10-01 的另一半（Agent 进程树杀进程上限与验证器上限同口径）属于 `13`/`16`。
2. **`16` §16.1**：Mode/标签中加入“未经机器验证”的 reason 枚举 `ecosystem_unsupported` · `s0_denied`（`07` §7.10.3 的 `exec_not_run`），供 `12` 的徽章文案引用。
3. **`02` VerifyProfile 引用 / `16`**：`VerifyProfile.exposeGit?: boolean`（`07` §7.13 已加），以及 anomaly detector id `stat_cache_mismatch`、`verifier_config_tampered`（替代原 `fsmonitor_mismatch`），请登记到 `16` §16.1.6。
