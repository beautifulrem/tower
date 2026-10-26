# 第 1 轮评审回应：07 / 08 / 09

依据 ADR-014（修订）与 ADR-020 – ADR-039。各文档末尾的“主干修订状态”已按 ADR-039 删除，未决事项记录在本文末尾。

## 逐条回应

| 条目 | 处理 | 位置 |
|---|---|---|
| R1-D7-01 | 两轨进度 V/M（验证器、干净环境、新鲜）与 O/M（Agent 环境观测，永不计入 V）作为唯一口径；机会式验证（指纹稳定 120 s、间隔 10 min、空闲槽位、可抢占、不触发返工）；燃烧检测、重入简报、站会摘要统一改用 V/O | `07` §7.2.4、§7.7.2；`08` §8.10.3–8.10.4、§8.11 |
| R1-D7-02 | Agent 存储（每 Goal）与验证器存储分离；只有 Supervisor 安装器在独立沙箱中写验证器存储，启用完整性校验；depcache 只读；物化只用 clonefile/reflink，**禁止硬链接**；每 24 h 抽查树哈希；S0 残余风险与“有保留”标记 | `07` §7.4.2–7.4.4 |
| R1-D7-03 | 带机密标准的相关测试文件强制 protected/forbid；回送模型的只有 verdict、计数、失败用例名、签名哈希，从不回送输出尾部；编码变换的额外脱敏；残余风险评为中 | `07` §7.4.3、§7.4.7（`tail` 字段）、§7.10.3（返工模板） |
| R1-D7-04 | `services`/`setup`/`teardown`/`ports`；端口段（20 个，从 41000 起，`TOWER_PORT_BASE`/`PORT`）；`ports:"fixed"` → 并发度 1；docker 默认不可达，需批准，compose project 隔离；`verify_env_error` 不返工、进 Needs-You | `07` §7.4.4、§7.13、§7.10.3；`09` §9.7（学习规则） |
| R1-D7-05 | flake 先在 pin 上重跑，再在 base 上重复 5 次确认；改动引入的不确定性 = `fail`（`introduced_nondeterminism`）；`pass_with_preexisting_flakes` 只以“有保留的已验证”显示；误判方向的演算 | `07` §7.4.6、§7.4.7、§7.10.1 |
| R1-D7-06 | v1 删除“观察器结果替代”；`cleanEnv:false` 不再改变判定，Agent 环境结果只进 O 轨 | `07` §7.2.4、§7.4.8 |
| R1-D7-07 | 哨兵基准语料（5 类来源、≥ 300 diff、双人标注、κ）与上线门槛（Wilson 下界）；离线精度作为线上先验；`source:"static"` 的计数永不阻断 | `07` §7.11.5、§7.5.4、§7.10.1 |
| R1-D7-08 | 完整的 `decide(goal, pin, trigger)`：触发枚举、`verifyOrigin`、env_error、零机器标准、验收延续、merge_queue、人引起的变化；全组合表；`blocksReview` 列为唯一阻断集合，Verified 唯一定义 | `07` §7.4.1、§7.10.1、§7.10.3、§7.3.3 |
| R1-D7-09 | 指纹 `advisory`/`decisive` 两种模式：凡改变状态或让东西变绿的调用强制慢路径；`in_review`/`accepted` 期间每 60 s decisive 巡检；token 与内容不一致时永久关闭快速路径并记录 anomaly；Linux 无 watchman 时没有快速路径 | `07` §7.3.2 |
| R1-D7-10 | 硬矛盾（结构化字段 + 确定性 Fact，danger 色）与软矛盾（自由文本抽取或启发式，中性 `?`）；H2 改为“模型文本可以作为被观测对象，但不能作为判定字段的来源” | `07` §7.1 H2/H4、§7.8.1–7.8.2、§7.10.1；`09` §9.8（记分板只计硬矛盾）；`08` §8.13.1 |
| R1-D7-11 | 参考项目（5 min 套件）的 M/M/c 排队模型，三个场景的 p50/p95；M1 延迟预算 p50 ≤ 10 min / p95 ≤ 20 min（8 核、3 个 Goal）；降级策略（从不跳过标准） | `07` §7.4.10 |
| R1-D3-01 | 45–76% 等数字标注为客服/AppWorld 领域、非编码 Agent、同分布结果；措辞检测器按 ADR-019 默认关，附 Tower 场景的标签、样本量与开启阈值 | `07` §7.0、§7.9；`09` §9.8（本地口径注明） |
| R1-D3-05 | 阈值来源审计表（数值 → 来源 → 证据等级 → 回填实验），07 与 08 各一张；08 同时给出 R1-D3-02 要求的迁移假设 | `07` §7.14；`08` §8.15 |
| R1-D4-03 | artifact 检查语法（exists / heading / sections / min_words / links:internal / links:reachable / frontmatter）、执行者（验证器内置检查，读取 pin 的 tree）、Fact 格式、`art1:` 内容哈希新鲜度、离线时 `links_unchecked`；零机器标准显示“未经机器验证” | `07` §7.4.9、§7.10.3 |
| R1-D8-01 | 对话框规格引用 `05` §5.6.4（ADR-023）；`riskTier ≥ standard` 的问题**不允许**超时作答（超时即暂停）；只有 low 风险且 Harness 判定可逆时才可默认推荐项；“可逆”的判定规则由 Harness 按动作类给出 | `08` §8.7.1 |
| R1-D8-04 | 防饿死：`agent_blocked` 在 L2 超过 20 min 无视令牌桶升 L3 一次，仍未处理则在重入简报与摘要中置顶；吞吐损失估算（2.5–4%，令牌耗尽时最坏约 17%） | `08` §8.3.4、§8.3.5 |
| R1-D8-07 | 实际投递延迟的演算表（各状态 × 各类条目）；指出起作用的常数（maxHold、θ(busy_elsewhere)、令牌桶、防饿死），说明 θ(review)=6 被 maxHold 支配；E3 的标定方法（maxHold 三档 A/B） | `08` §8.3.5 |
| R1-D8-08 | 覆盖层优先级与互斥规则（L4 > 诊断 > 应用级简报 > 单 Goal 简报 > L3 提示条 > 原位高亮；同时至多一个浮层；按 itemId 去重；`Esc` 后本次重入不再自动弹出）。`04` 引用此节 | `08` §8.10.5、§8.13.1 |
| R1-D12-01 | 默认带污染、反向白名单（只有人类原话与 Harness 事实）；污染类别补全 `dependency_code`、`fixtures`、`tool_output`、`registry_fetch`、`extension_tool`、`repo_content`（含他人在 base 上的提交）；分 none/standard/high 三级的批准要求；记忆投毒残余风险上调为**中**（见下方给 `11` 的说明） | `09` §9.2.1 |
| R1-D12-02 | 采用 ADR-035：仓库提交的 AGENTS.md/CLAUDE.md 优先于个人记忆；冲突时三个选项（保留约定 / 本 Goal 例外 / 提议修改仓库约定）；注入文本删除“冲突时听记忆的” | `09` §9.4.3、§9.5.3 |
| R1-D12-03 | **决定：调整条目长度，不改预算。** `text` 上限改为 ADR-032 口径估算 ≤ 80 token（约 120 汉字 / 320 英文字符），起草目标 ≤ 40 token；新增 `detail`（≤ 600 字符，只按需进入 `contract.md`）；置顶区至少能放下一条 80 token 的条目 | `09` §9.2、§9.5.2、§9.6.3、§9.13 |
| R1-D12-04 | 批量批准只对 `taint.level="none"`、无可疑指令、无冲突、无密钥命中的提议生效，其余自动排除并提示。`04` 跟随 | `09` §9.3.2 |
| R1-D12-05 | 每条目带版本向量 `vv`，并保存共同祖先文本；只有支配关系才快进，并发编辑 → `sync_conflict`（ADR-034） | `09` §9.12.3、§9.2 |
| R1-D12-06 | 基线 r0 与事后 r1、Beta(1,1) 先验、评估时点（10 个相关 Goal 或 60 天）、有效/无效果/遗漏召回/数据不足四种结论的阈值；四条退役提议阈值（只提议不自动执行） | `09` §9.6.4 |
| R1-D15-04 | 独立评审在所有风险等级默认关闭 | `07` §7.0、§7.12、§7.13 |
| R1-D15-10 | `VerifyProfile` 完整类型作为权威定义（prepare、setup、services、teardown、ports、integration、commands.test/build/lint/typecheck、`fingerprint.extraGlobs`、`irrelevantGlobs`、rerunFailed、learned 等）；`09` 改为引用；键名统一 | `07` §7.13；`09` §9.7 |
| R1-D15-12 | 删除 `08` 中重复的 `AttentionPrefsExt`，以 `02` §2.14 为权威，`08` §8.2 只保留不进入领域模型的运行时字段 | `08` §8.2 |
| ADR-014（修订） | 积压公式改为 `H = C − P − F`、`reviewBacklogLimitLoc`、有效评审 `max(5 s, 1.2 s × loc)` + 全部 hunk 进入视口、默认提示模式 | `08` §8.5.5、§8.14、§8.15 |
| ADR-039 | 三份文档的“主干修订状态”已删除；默认值表注明以 `16-registry.md` 为单一来源 | `07` §7.13；`08` §8.14；`09` §9.13 |

## 给 `11` 作者（aed3）的说明

- **T22 记忆投毒应从“低”上调为“中”。** `09` §9.2.1 改为默认带污染，几乎所有 Agent 提议都会带污染，所以唯一的屏障是人的逐条确认，而批准疲劳是已知风险（ADR-010）。建议 T22 的缓解列写成：“默认污染 + 反向白名单；standard 逐条确认、high 需编辑或输入确认；批量批准排除带污染的条目；注入在 Trace 可见”，残余风险写“中”。
- `11` §11.8 第 5 点中的 `tainted` 布尔标记，请改为引用 `09` §9.2.1 的 `taint{level, classes}`。
- ADR-021 要求 Agent 的包缓存改为 `<wtRoot>/_stores/<goalId>/`。`11` §11.6.2 的 S2 写允许列表中仍列出用户全局缓存（`~/.pnpm-store`、`~/.npm/_cacache`、`~/.cache/uv`、`~/.cargo/registry` 等），需要替换为私有存储，并对 `<wtRoot>/_stores/_verifier/` 与 depcache 加写拒绝（`07` §7.4.3–7.4.4）。
- ADR-037 下 Linux 不再使用 `--unshare-net`（会破坏 docker 与本地服务），改用代理的主机允许列表（`07` §7.4.4）；如 `11` §11.6 有相应描述，请同步。

## 需要主干修改的地方（请协调者处理）

1. **`02` §2.14**：`reviewCapacityLocPerDay` 尚未按 ADR-014 改名为 `reviewBacklogLimitLoc`；需加入 `mode: "hint" | "block"`。
2. **`02` §2.10**：`text` 注释“≤ 300 字符”改为“`estTokens(text) ≤ 80`（ADR-032 口径）”；注释中列出的扩展字段 `tainted` 改为 `taint`，并加入 `detail`（定义在 `09` §9.2）。
3. **`02` §2.7**：Fact `kind` 增加 `verify_env_error`（ADR-037，`07` §7.4.4）；`Claim.crossCheck` 增加 `strength: "hard" | "soft"`（`07` §7.8.1）；`criterion_check` 允许 `workspaceFingerprint` 取 `art1:<hash>`（artifact，ADR-031）。
4. **`02` / `03`**：`pauseReason` 增加 `verify_env_error`（`07` §7.10.3 的环境故障出口；`03` §3.2 的 verifying 行需加此转移）；Goal 增加 `verifyOrigin`（或在 `03` 中说明由事件推导）。
5. **`02` §2.5 Criterion `cleanEnv`**：v1 中已无作用（R1-D7-06），建议删除该字段；`03` §3.2 verifying 行中“`cleanEnv` 的例外规则见 `07` §7.4”一并删除。
6. **`16-registry.md` 尚不存在**：`07` §7.13、`08` §8.14、`09` §9.13 的默认值表需要迁入注册表；`08` 的“下一件最值得看的事”快捷键按 `04` 采用 `G N`。
