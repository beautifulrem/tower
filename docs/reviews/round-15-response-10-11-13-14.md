# 第 15 轮回应 · `10` `11` `13` `14`（及 `16` 相关行）

> 范围：`round-15.md` 中文档位置含 `10`、`11`、`13`、`14`、`16` 的条目；ADR-134–136；主干对 `02` 与 `03` §3.2.1 的修改（含 `Continuation.verify` 不再带 `verifyFrom`、`Goal.verifyFrom` 与 `verify_new.returnTo`）；各写作者的工作量估计。安全相关内容只写到设计层面。

| 条目 | 处理 | 位置 |
|---|---|---|
| R15-D4-01 / ADR-134 | §10.3.1 改写：<br>• 检测时的状态不再写入 `externalChange`；`detectedIn`、`resumeTo`、`pendingVerify` 一律改为继续目标 `continuation`。<br>• `keep`/`revert` 只做两件事：解除本原因，以及显式改写继续目标（`keep` 把 `verify`/`review` 改写为 `verify_new{human_change}`）。离开 `paused` 只经过 `onAllReasonsCleared()`。<br>• `settle` 中检测只发生在进程树清空之后，解除后执行 `agent_bg_done` → I4 → `claimed`。<br>§10.8.4：<br>• `take_external` 时 `mode` 为空，不写 `pendingHandBack`，对话框中的去向置灰。<br>• 第 8 步改为由唯一转移函数执行。<br>• `discard_human_edits` 遇到已有的 `externalChange` 时并入路径，基线保持首次值；`takeoverFrom = running` 时保持 `paused(human)`。<br>§10.16 情形 E：卫星重建改用继续目标。<br>§10.1.2：`nested_repo_live` 是唯一原因且自动解除时进入 `paused(human)`。<br>用例：G33b 改写；G36e、G36f 改写；新增 G36g(a)–(f)；G26c(e) | `10` §10.1.2、§10.3.1、§10.8.4、§10.16.2；`16` §16.1.1、§16.1.13；`14` |
| R15-D4-02 / ADR-134 | `revert` 之后只考察 E 中的路径。E 之外的路径按检查点链归因，所以 `running` 中检测后撤销，不会把 Agent 的编辑判为新的检测。用例 G36b(h)，含 settle 序列中的一组 | `10` §10.3.1；`14` G36b |
| R15-D6-01 / ADR-135 | 进程组：<br>• macOS 改为“每个产生子进程的 bash 工具调用一行”，记入 `bash_process_groups`，`06` 已改名；<br>• 归因表第 2 行写明 Pi 的 bash 让每条命令自成进程组；<br>• `13` 的成本改为每次调用一行，每个运行中 Goal ≤ 6 行/分钟，终止时每行 < 1 ms。<br>`settling` 的下一步已确定（见 D4-01）。用例 G35c(j) 已同步 | `10` §10.3.1；`13` §13.11.1；`16` §16.1.12、§16.2.6 |
| R15-D7-01 / ADR-135 | `Checkpoint` 增加 `mixedPaths`。`ReviewUnit.author` 的推导顺序为 `mixedPaths` → `externalPaths`（未经 `keep`）→ `author`，写在 `10` 的接口注释与 `16`。已知误判 (c) 在 Trace 中注明；用例 G36b(i) | `10` §10.3.1、§10.7.1；`16`；`14` G36b |
| R15-D11-01 / ADR-136 | `~/.ssh/**` 整体归 `credential`，默认良性条目为 `(credential, write, ~/.ssh/known_hosts)`。`user_config` 改为包含式规则，并给出判定顺序与判例表。点目录中未被重定向的缓存写入在 M1 中是 severity 2：可以标为良性，由 E7 统计 | `16` §16.1.6；`11` §11.6.2 |
| R15-D13-01 / ADR-136 | 重新 seal：分支顶端仍是上一次 seal 时以 CAS 快进；否则写入 `<分支>-v<k>`，不改写用户的分支；分支已被删除时按首次 seal 处理。`:(exclude)` 改为循环，上限 64 条 / 64 次，超过记 `verify_env_error{integrity}`；这也覆盖只被 `protectNTFS` 拒绝的名字。用例 G40、G26d(b)(c) | `10` §10.1.2、§10.6、§10.7.1、§10.12；`13`；`14` |
| R15-D14-01 | 用例：<br>• G33b 按 ADR-134 重写为可执行的三组；<br>• G36f(b) 改为“清空之后、`agent_bg_done` 之前”，另设对照 (b′)，对应误判 (a)；<br>• 新增 G35c(l)（压缩期间的宽限）。<br>增人备选：计入安全线后改为 31 周，前提是新人承担约 2.0 人周的安全线工作。<br>设计线的 QA 在第 28–29 周，缓冲完整。<br>L284 改为 25.8。<br>ADR-133 增加第 15 轮补记 | `14` §14.2、§14.3.4；`15` ADR-133 |
| R15-D15-01 | • #4：就地编辑（M2）保存后须经 `keep` 确认，`10` L241、L251、L472 已统一；<br>• #6：执行 ④′ 的归属由 ADR-132 改为 ADR-133，`10`、`11`、`14`、`16` 共 20 处；<br>• #9 的 lint 新增：<br>&nbsp;&nbsp;(r) 概念“暂停的继续目标”（`03` §3.2.1）；<br>&nbsp;&nbsp;M1 日期改为检查 34 周 / 2027-07-02 / 第 30 周冻结的残留；<br>&nbsp;&nbsp;(x) 默认良性条目的类别必须等于按 `16` 规则算出的类别；<br>&nbsp;&nbsp;(y) 检查 `CREATE TABLE` 中的重复列。<br>全部检查通过 | `10`；`reviews/lint/xref.py` |
| `16` 注册表 | 新增行：<br>• `Goal.continuation` 与唯一转移函数；<br>• `Goal.verifyFrom`；<br>• 事件 `goal.continuation.set`；<br>• `StopCondition.id`（`sc-<n>`）；<br>• `goal.resume` 的 `feedback` 参数，以及原因码 `stop_condition_false_positive`（`target.criterionId` = `StopCondition.id`）；<br>• `bash_process_groups`。<br>删去的行：`resumeTo` 与 `pendingVerify`。<br>修改的行：<br>• `externalChange` 去掉 `detectedIn`；<br>• `pauseReason` 优先级注明“只决定显示，不决定去向”；<br>• `stop_condition` 卡片写明三个出口。<br>废弃表新增十一行。<br>§16.5 不变（没有新命令；`feedback` 随 `goal.resume` 的作用域）。<br>`16` 不镜像 D 行，所以 D55/D56 不登记 | `16` |

**本轮工作量与 M1：+3.7 人周（WBS 111.15）。按 ADR-136 顺延 1 周到 35 周（2026-11-09 → 2027-07-09），不执行 ③ 与 ⑤。** 去重的分项表见 `14` §14.3.4“第 15 轮的处理”。

**去重。** 各写作者的估计按 WBS 行去重，同一条目取较大值：

| 写作者 | 估计 | 采用 |
|---|---|---|
| 05/06 | 1.35 人周 | W3 0.5 与 07/08/09 的 0.8 是同一项（继续目标与唯一转移函数），取 0.8 |
| 07/08/09 | 1.2 人周 | 同上；另计 W9 0.2、W13 0.2 |
| 04/12 | 1.0 人周 | 1.0 |
| 本文 | — | 0.7（循环排除、重新 seal 与 05/06 的同一项取大值，另加 SP6b 新增用例 0.4） |

**为什么必须顺延。** 第 14 轮之后各线的缓冲外余量合计只有约 0.61 人周。顺延 1 周增加约 4.09 人周，合计约 4.70，足以吸收 3.7。

**各线分配与余量**（可用容量为 28 个工作周，减去 2 周冻结前缓冲）：

| 线 | 本轮分配（人周） | 冻结前所需工作周 | 缓冲外余量（工作周） |
|---|---|---|---|
| 系统 | +0.8 | 25.8 | 0.2 |
| Agent | +0.8 | 25.8 | 0.2 |
| 桌面 | +0.95 | 25.8 | 0.2 |
| 设计 | +0.85 | 25.8 | 0.2 |
| 安全 | +0.3 | 25.41（按 0.5 人） | 0.59 |

**新日程**：

- 第 31 周末冻结（2027-06-11）；
- 第 32–34 周自用；
- 第 35 周退出评审；
- 各线的 QA 在第 28–29 周结束；
- SP6b B4 在第 28 周，复跑在第 29 周；
- M2 至 2027-10-15。

**需要主干处理**：

- `00`、`15` ADR-038 的当前值改为 35 周 / 2027-07-09。ADR-133 的第 15 轮补记已写好。
- `08` §8.8 / `09`：由各自的写作者处理。
