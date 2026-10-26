# 第 10 轮评审回应：07 / 08 / 09

依据 ADR-109、ADR-110。

| 条目 / 决策 | 处理 | 位置 |
|---|---|---|
| R10-D13-01 / ADR-109 | 以 `pinSafetyCheck(baseTree, pinTree)` 取代“物化 + 排除”：只读两个 tree（`diff-tree` + `ls-tree`），对新增或改变的**普通文件/符号链接**中名为 HEAD/commondir/gitdir（大小写不敏感，含只改 HEAD 内容）→ `nested_repo`；绝对或越出根的符号链接 → `symlink_escape`；两者 severity 3、pin 推导、只阻断不排除，覆盖后 seal 带 `Tower-Override`；作为 `verify()` 的**第一步**（在一切提前返回之前），验收与 seal 时对同一 tree 复核；删除槽位中的 `authoritativeNestedRepoCheck` 与排除/重新生成 pin 的逻辑；影子 `add` 只排除名为 `.git` 的条目 | `07` §7.3.2、§7.4.1、§7.10.1 |
| R10-D7-01 / ADR-110 | `sandbox_violation` 改为提示性（sev 1，进入“运行异常”区块，同类反复计入 `policy_wall`）；阻断 Verified 的 run 类命中只剩 `input_mutated_after_gate`（sentinel，可覆盖）；`openSentinels` 定义同步 | `07` §7.10.1 |
| R10-D7-02 | 标记规则只认普通文件或符号链接；名为 `head` 的目录不命中（并入 `pinSafetyCheck`） | `07` §7.3.2 |
| R10-D3-01 | 删除“git 判定不是仓库即不构成风险”的说法：早期预警依赖沙箱内的 git 判定，读被拒时与“不是仓库”无法区分，只作提示；结论只来自 tree 层面的 `pinSafetyCheck`；不再陈述“同一文件系统、同样大小写语义” | `07` §7.3.2 |
| R10-D10-01 (a) | 验收与 seal 时的检查改为在 tree 对象上执行，不需要槽位，原问题随之消失 | `07` §7.3.2 |
| R10-D10-01 (b) / R10-D13-02 | 两种检出只从影子树物化（删除“从槽位复制”的备选）；depcache 命中即 CoW 物化，未命中则先打开检出并在后台运行安装器、以横幅显示进度；依赖就绪后按验证器沙箱档位执行项目生命周期与 prepare（S0 未授权时不执行并说明）；与 Agent 环境的差异登记于 `00` §0.5.1；不写出的路径 = `pinSafetyCheck` 命中 + 早期预警确认的新造仓库目录，**base 中未改变的夹具照常写出**（它们本来就在用户主检出中，ADR-109 第 5 点只排除命中路径） | `07` §7.3.2、§7.4.2 |

## 需要主干修改的地方

1. **`16` §16.1.6**：`symlink_escape` 改为 severity 3、阻断（覆盖后 `Tower-Override` trailer）；`sandbox_violation` 为 sev 1 提示性。
2. **`00` §0.5.1 / `10` §10.8.3–10.8.4**：登记检出依赖准备流程与“未改变的 base 夹具照常写出”（与第 9 轮的更正不同，以 ADR-109 第 5 点为准，请确认）。
3. **`12`**：`symlink_escape` 使用阻断哨兵字形（R10-D9-01）。
