# 第 34 轮回应 · `10` `11` `13` `14` `16`

> 范围：ADR-160（R34 全部条目）及其补记在 `10`、`11`、`13`、`14`、`16` 中的落实。安全相关内容只写到设计层面。

| 条目 | 处理 | 位置 |
|---|---|---|
| R34-D11-01、D6-01、D5-01、D4-01 / ADR-160（`11`） | §11.7.0 的“独占窗口”一节整段改为**调度互斥**：<br>• “Agent 活动”的定义：任何 Goal `running`（含 settle）或准备中、Scratch 运行中、检验服务运行中；<br>• 没有任何其他活动时才开始；<br>• 运行期间冻结准入；<br>• 持有者的机会式验证不运行带机密的标准；<br>• 结束时终止槽位的全部进程；<br>• 等待超过 10 分钟进入 Needs-You `ve:{goalId}:secret_wait`，有 `keep` / `run_now`（`accept_secret_exposure`）/ `as_file` 三条命令，Goal 保持 `verifying`；<br>• `secrets.access`：卡片写明风险；有其他活动时进入 `approved_waiting`，“现在使用”为 `secrets.access.use_now`；<br>• 远程：`run_now` 与 `use_now` 仅本机，`keep` 与 `as_file` 允许远程（补记 2）；<br>• 项目设置 `secretMutex.enabled`。<br>投递表两行、§11.6.2、§11.6.4、§11.7.1、T33 与 **T33b** 同步：T33b 在互斥开启时为低，关闭或“接受风险”的那一次为中。 | `11` |
| 撤回清单（`11`、`10`、`13`、`14`、`16`） | 以下内容在我的文档中全部删除，并在 `16` 废弃表登记：<br>• gate 第 0 步；<br>• `SIGSTOP`/`SIGCONT` 及崩溃恢复中的补发与重跑；<br>• 挂起不计时；<br>• `goal.tool.abort` 与 `abort_tool_call`；<br>• `secret_window.*` 事件；<br>• `secret_window` Needs-You 与 stage；<br>• `secretWindow.enabled`。<br>lint (d) 的已删除名称清单加入这些名称，以及 R34-D15-01 第 2 项的“Tower 数据目录下的 0600 凭据文件”。`DEL_OK` 加入“撤回”与 “Supersedes”。 | `16`；`reviews/lint/xref.py` |
| `10` | • §10.3.1 删去“机密窗口的暂停”，改为两条：<br>&nbsp;&nbsp;– settle 时先对处于停止状态的进程发 `SIGCONT` 再发 `SIGTERM`，作为与机密无关的通用保险（例如 Agent 自己 `kill -STOP` 的进程）；<br>&nbsp;&nbsp;– 带机密的标准结束时，按同一并集终止验证槽位的进程。<br>• 残余改为“无法识别的脱离进程”（R34-D15-01 第 4 项）。<br>• **R34-D13-01**：分叉且尚未选择时 `baseTip` 返回 `baseCommit` 所在的一侧，即“不变”；没有分叉时调用 `goal.base.choose` 返回 `E_STATE`。 | `10` |
| `13` | 窗口预算行改为“机密调度互斥的等待”：<br>• 等待上限 10 分钟后进入 Needs-You；<br>• 计入“提交到验证开始”的延迟，这类 Goal 的延迟单独报告；<br>• 冻结准入时长 ≤ 标准超时；<br>• 不在 Run 内部拦截。 | `13` |
| `16` | • 删去两条 `secret_window.*` 事件行与独占窗口行，改为“调度互斥”行（含 `approved_waiting`、三条 `verify.secret_wait.*` 命令、`secrets.access.use_now`、`secretMutex.enabled`）。<br>• `HumanDecision.kind`：以 `accept_secret_exposure` 取代 `abort_tool_call`，修正 lint (s)。<br>• `verify_env_error.stage` 去掉 `secret_window`。<br>• §16.5：删去 `goal.tool.abort`；加入 `keep`、`as_file`（`decide`，允许远程），以及 `run_now`、`use_now`（仅本机，总规则 3）。<br>• `secretsVia` 行、投递表行、`baseTip` 行同步。<br>• 废弃表新增两行。 | `16` |
| 用例 | • **G46** 重写：撤去窗口、`SIGSTOP`、中止各组；新增：<br>&nbsp;&nbsp;– (e) 四种活动下等待互斥；<br>&nbsp;&nbsp;– (f) 冻结准入；<br>&nbsp;&nbsp;– (g) 机会式验证跳过带机密的标准；<br>&nbsp;&nbsp;– (h) 10 分钟后的 `keep` / `run_now`（远程不可用）/ `as_file`；<br>&nbsp;&nbsp;– (i) 有其他活动时的 `secrets.access`；<br>&nbsp;&nbsp;– (j) 标准结束时终止槽位进程；<br>&nbsp;&nbsp;– (k) 互斥关闭；<br>&nbsp;&nbsp;– (l) MCP 提示。<br>• **G45(c)** 第三组：分叉未选择时 `baseTip` 视为“不变”。 | `14` |

**本轮工作量与 M1：−0.13 人周（WBS 121.38），M1 维持 38 周，变轻。**

| 来源 | 估计（人周） | 计入的 WBS 行与承担线 |
|---|---|---|
| 05/06 | −0.18 | W6 −0.13、W9 −0.03（Agent）；W4 −0.05（桌面）；W3 +0.03（冻结准入，系统） |
| 04/12 | +0.01 | W11，桌面 |
| 本文：`11` | +0.02 | W10，安全 |
| 本文：`10` | +0.01 | W7-core，系统 |
| 本文：SP6b 用例 | +0.01 | G46 改写净增，Agent |
| `13` | 0 | 只是措辞修正 |

**各线余量**（缓冲外，工作周）：

| 线 | 余量 |
|---|---|
| 系统 | 0.19 |
| Agent | 0.82 |
| 桌面 | 0.99 |
| 设计 | 1.04 |
| 安全 | 0.64 |

**日程不变**：
- 第 34 周末冻结（2027-07-02）。
- 增人备选仍为 33 周（T ≥ 23.48），新人承担约 2.4 人周安全线工作。
- SP6b 补跑现值为 4.79 人周。
- ADR-133 的第 34 轮补记已写入 `15`，并注明系统线余量已低于 0.2 工作周：下一次落在系统线上、超过约 0.17 人周（未含 QA）的增量，须改派或顺延。
- `16` 的 M1 行已更新。

**lint**（`--checks rstuvwxyzckdnSeRq`）：(s) 已修正。新加入的 (d) 检索词命中**一处他人文档**，退出码因此为 1：`05` L409 仍写“Tower 把它们写入 Tower 数据目录下的 0600 凭据文件”（R34-D15-01 第 2 项）。其余检查全部通过。

**主干需要处理**：
1. **请 05/06 的作者**把 `05` L409 改为即时投递目录 `~/.tower/run/<deliveryId>/`。改完后 lint (d) 即可通过。
2. **`goal.base.choose` 在没有分叉时**：`10` 写为返回 `E_STATE`（“当前没有分叉，无需选择”），对应 R34-D13-01 的第二问。若 `06` 的命令表另有规定，请告知，我来对齐。
