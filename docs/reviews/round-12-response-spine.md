# 第 12 轮回应 — 主干文档（00、02、03、15）

| 条目 | 处理 | 位置 |
|---|---|---|
| R12-D4-01 | `03` §3.2 `verifying` 行的 `sentinel_high` 出口加上“存在未覆盖的 run 类阻断命中时不提供返工”的条件，与 §3.2.1、`07` `decide` 相同；ADR-102、ADR-103、ADR-104、ADR-108 正文就地标注被取代的句子（删除线 + 〔取代说明〕），ADR-108 的唯一触发条件按 `03` §3.2.1 末段重写为单一判定条件 | `03` §3.2；`15` ADR-102/103/104/108 |
| R12-D4-02 | ADR-114：撤销目标只在 `10` §10.3.1 定义一次；接管期间的外部写入由交还第 6 步一并处置；`03` `external_change` 行改为引用；`02` L421 注释改正；`02` `HumanDecision.handBack.externalResolution` | `15` ADR-114；`03` §3.2.1；`02` §2.7 |
| R12-D6-01 | ADR-115：settle → 终止追踪进程 → 等待清空（10 s，再 SIGKILL）→ `agent_bg_done` 检查点 → 2 s 宽限 → `claimed` → pin；`(pid, 启动时间)` 身份确认；追踪集合持久化与崩溃恢复 | `15` ADR-115；`10`/`06`/`14` 由对应作者落地 |
| R12-D7-01 | ADR-114：`in_review`/`accepted` 中的外部写入标为 `author:"external"`，须“采纳为我的改动 / 撤销到 pin”才能验收；`Tower-Human-Edit` 只对显式人工决定写入；新决定种类 `adopt_external_hunks` / `revert_external_hunks` | `15` ADR-114；`02` §2.7、§2.8 |
| R12-D8-01 | ADR-117：出口“知悉 / 这是良性的（+ 项目良性清单）/ 收紧策略 / 放弃 Goal”；去重键以 `08` §8.4 为准；措辞改为“可能表明”；E7 降级规则；新决定种类 `acknowledge_signal` / `mark_benign` | `15` ADR-117；`02` §2.7 |
| R12-D8-02 | ADR-118：`goal.hand_back` 增加 `resolvePinHits`，第 7 步执行、记 `author:"human"`；`02` `HumanDecision.handBack.resolvePinHits` | `15` ADR-118；`02` §2.7 |
| R12-D11-01 | ADR-116：pin 中全部符号链接整链解析；tree 中不存在的分量与 `.git` 分量视为逃逸；根目录是候选目录 | `15` ADR-116 |
| R12-D11-02 | ADR-116：覆盖后两种检出中 git 元数据文件写出 base 版本；覆盖对话框以 Fact 列出被改动的元数据文件与可执行/重定向配置键 | `15` ADR-116 |
| R12-D13-01 | ADR-116：依赖目录采用 `07` 的“物化后扫描、不写出、列入信任提示”；ADR-118：非回合检查点入口与 landmark | `15` ADR-116、ADR-118 |
| R12-D15-01 | 主干残留：ADR-102 L703、ADR-103 L710、ADR-104/108、ADR-105 ② 与 trailer 列表（加 `Tower-Override`、`Tower-Human-Edit` 限定）已改；其余由各文档作者与 lint 处理 | `15` |
