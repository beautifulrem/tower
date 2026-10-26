# 第 5 轮回应 · 主干与跨文档决策

跨文档决策：`15` ADR-081 – ADR-087（ADR-066/072/073/078/080 标注修订）。实验：`research/git-isolation-experiment.md` 补充实验（ADR-081）。

| 条目 | 处理 |
|---|---|
| R5-D11-01 commondir 重定向（阻断） | ADR-081：gitdir 移出工作目录（`--separate-git-dir`，删除指针文件），Agent 经 `GIT_DIR`/`GIT_WORK_TREE` 使用 git；沙箱外进程 `GIT_CEILING_DIRECTORIES` 下发现不了仓库；gitdir 写入白名单；“我来改”改为人工编辑检出 + 文件级回写；实验证实 |
| R5-D8-01/02 检验检出与密钥文件 | ADR-082：检验检出按验证器沙箱档位执行；Agent 读权限白名单化 |
| R5-D6-01、R5-D13-01 重放包与镜像保留 | ADR-083：唯一规格在 `07` §7.4.1；镜像保留 ref |
| R5-D4-01/02 resumeTo、verifyFrom | ADR-084：`satellite_missing` 叠加态、`resumeTo` 只记 running、`alsoApplies` 持久化与逐级解除、`goal.resume` 守卫、`pendingVerify` 持久化；`02`、`16` 同步 |
| R5-D7-01..04 Node 细节 | ADR-085 |
| R5-D10-01 大文件 | ADR-086 |
| R5-D12-01 身份输入与消歧键 | ADR-087（`--all` 根集合、消歧键选择与存储、拆分后的归属）；`02` `identity.disambiguator` |
| R5-D2-01 (a)(c) | ADR-066 修订注；`00` §0.5.1：M1 不提供 `!cmd`，补 git 扩展、卫星无远端、钩子、`llama.cpp` 四行 |
| R5-D15-01 #1 | `16`：`nested_repo`、`git_control_tampered`、`runner_tampered`、`lifecycle_script_changed`、`verifier_store_tampered` 归为 sentinel 检测器 id（非 Fact kind） |
| 第 5 轮修订带出的 `GIT_DIR` 副作用 | ADR-088：Agent 侧 git 垫片取代全局 `GIT_DIR`；`00` §0.5.1 登记 libgit2 类实现的限制 |
| M1 时长 | ADR-038：31 个日历周（第 5 轮 +6.4 人周） |
| 检测器分类 | 以 `07` §7.10.1 的规则为准：Goal 内容/效果 → sentinel；Tower 自身状态 → anomaly；`16` §16.1.6 同步 |
| 重放路径 | 全部统一为 `replay/<verifyId>/` 与 `refs/tower-retain/<goalId>/<verifyId>` |
