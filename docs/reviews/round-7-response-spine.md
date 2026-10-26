# 第 7 轮回应 · 主干与跨文档决策

跨文档决策：`15` ADR-096 – ADR-100（ADR-065/089/090/091/092/094 标注修订）。实验：`research/git-isolation-experiment.md` 第 7 轮补充（`safe.bareRepository=explicit` 拒绝裸仓库布局；垫片 exec-path 拦截嵌套 git 调用）。

| 条目 | 处理 |
|---|---|
| R7-D11-01 裸仓库布局可被发现 | ADR-096（实验证实） |
| R7-D13-01 嵌套 git 绕过垫片 | ADR-097（主方案实验证实；备选与工作量登记） |
| R7-D7-01 别名与 workspace overrides | ADR-098；`02` protected 默认值 |
| R7-D7-02 安装阶段写共享缓存 | ADR-092 修订注：安装阶段对共享缓存只读 |
| R7-D4-01、R7-D6-01、R7-D8-01(a) “我来改”出路 | ADR-099；`02` `humanCheckout.syncState`、新决定类型；`03` §3.2.1 human / in_review / human_change_verify_failed 行 |
| R7-D2-01、R7-D11-02 读权限与提交信息读取 | ADR-100 |
| R7-D15-01 #2/#3/#4/#5/#10/#11 | `02` budget_hard_cap 注释、`alsoApplies: PauseReason[]`、`packageExtensions`、根集合 `--all`；`03` 卫星/槽位措辞；ADR-065 修订注 |

## round-7 lint 未决项裁决

| # | 裁决 |
|---|---|
| U1 | 从 `in_review`/`accepted` 接管后放弃改动、但卫星树 ≠ pin：进入 `verifying`（I2 语义，`verifyOrigin:"manual"`），与 `06` 一致；`10` §10.8.4 与 ADR-099 已同步 |
| 其他 | ADR-038：+1 人方案 29 周、第 7 轮后零余量；`00` §0.5.1 增加三行（全局 `safe.bareRepository` 建议、过宽技能路径、ADR-097 备选限制） |
