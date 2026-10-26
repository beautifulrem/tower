# 第 6 轮回应 · 主干与跨文档决策

跨文档决策：`15` ADR-089 – ADR-095（ADR-072 Superseded；ADR-081/088 Amended）。实验：`research/git-isolation-experiment.md` 第 6 轮补充（Seatbelt 下 gitdir 整体可写时常用 git 操作成功、嵌套 `.git` 被拒；策略路径必须 realpath）。

| 条目 | 处理 |
|---|---|
| R6-D13-01 白名单过窄 | ADR-089：gitdir 整体归 Agent（沙箱外不可发现后白名单无保护意义）；只保留“任意深度不可创建 `.git`”与 `GIT_CEILING_DIRECTORIES` |
| R6-D11-01 Tower 原始文件操作被劫持 | ADR-089 第 3 点：只做创建/整体删除/整体重建，`O_NOFOLLOW`、拒绝特殊文件、rename 原子替换；提交信息经沙箱化 `git log` 读取 |
| R6-D13-02 垫片泄漏 GIT_DIR | ADR-090 |
| R6-D2-01 技能目录 | ADR-091；`00` §0.5.1 新增技能一行 |
| R6-D7-01/02/03 | ADR-092、ADR-093 |
| R6-D8-01 人工编辑检出信任 | ADR-094（T31） |
| R6-D4-01/02 接管与重建失败转移 | ADR-094；`02` `takeoverFrom`、`resumeTo` 两种来源；`03` §3.2.1 human 与 satellite_missing 行 |
| R6-D6-01、R6-D16 重放包 | ADR-095 |

## round-6 lint 未决项裁决（`round-6-lint.md`）

| # | 裁决 |
|---|---|
| U1 | 多仓库 Goal 的 `run.rewind`/`run.fork_goal` 目标改为 `{piEntryId}`（每个仓库恢复到该条目最近的带检查点祖先）或 `{projectId, checkpointN}`（只回退单仓库代码）；`06` §6.4.3 已改 |
| U2 | Prisma 引擎由 I-预取写入 `$SH/prisma`（ADR-093 为准），再 CoW 物化到各角色的 `XDG_CACHE_HOME/prisma`（A：`$GS/xdg`；V/I：`$VS/xdg`）；`16` §16.8.1 已改 |
