# 第 8 轮评审回应：07 / 08 / 09

依据 ADR-101 – ADR-105。

| 条目 / 决策 | 处理 | 位置 |
|---|---|---|
| R8-D7-01 / ADR-103 | §7.10.1 严重度表每一行增加“推导来源（pin / run）”列，并补 `sandbox_violation`/`policy_wall`、`post_settle_activity` 两行；`openSentinels(goal, pin)` = 该 pin 的 pin 类阻断命中 ∪ Goal 作用域内未覆盖的 run 类阻断命中；交还只清除 pin 类原因，run 类须 `override_sentinel`；交还对话框先列出；附验收用例描述 | `07` §7.10.1 |
| R8-D7-02 / ADR-105 | `runner_patched` 的每个条件都只针对相对 base 新出现或变化的情况；base 已有的别名/补丁/覆盖在 VerifyProfile `runnerExceptions` 中由人确认一次；P37 增加对照用例 | `07` §7.4.3、§7.13 |
| R8-D10-01 | 只读 store 的回退顺序：① 只私有化 store 的索引与临时目录；② 不得已才用 CoW 私有副本（非 CoW 卷禁用并提示）；SP6c 测量四种情况的时长与磁盘，`13` 登记；② 计入 30 GB 预算；副作用缓存关闭的重建时长计入首次验证服务时间 | `07` §7.4.3 |
| R8-D11-01 / ADR-101 | 嵌套仓库识别改为“名字粗筛（`HEAD` 或 `.git` 条目）+ git 确认（`rev-parse --absolute-git-dir`）”；确认为仓库的目录一律不复制到人工编辑与检验检出，并在信任提示中列出 | `07` §7.3.2 |
| R8-D13-01 / ADR-102 | base 中已跟踪的仓库形态夹具按普通内容进入影子、pin、seal 与评审，不产生哨兵；`nested_repo` 只针对 base 中未跟踪的仓库目录 | `07` §7.3.2、§7.10.1 |
| ADR-105（seal 说明） | seal 说明结构：Tower 摘要 → “Agent 提交记录（声明）”缩进引用、去除 trailer 形态行 → Tower 独占的 trailer 块；解析器限制引用 `10` §10.1.3 | `07` §7.3.2 |

## 需要主干修改的地方

1. **`16` §16.1.6**：为每个检测器登记“推导来源：pin / run”（取值以 `07` §7.10.1 的新列为准）；`VerifyProfile.runnerExceptions`。
2. **`14`**：登记“接管并交还不能绕过 run 类哨兵”用例；P37 对照用例。
3. **`13`**：登记 SP6c 只读 store 回退四种情况的预算。
