# 第 16 轮回应 · `10` `11` `13` `14`（及 `16` 相关行、lint）

> 范围：`round-16.md` 中文档位置含 `10`、`11`、`13`、`14`、`16` 的条目；ADR-137–139；主干对 `02`、`03` 的修改，包括：
> - `Continuation` 的 `run{openings}`、`claim`、`settle{adoptedHuman?}`；
> - `Goal.drainingFor`；
> - `Goal.stopConditionSilences`。
>
> 安全相关内容只写到设计层面。`11` 本轮没有条目。

| 条目 | 处理 | 位置 |
|---|---|---|
| R16-D4-01 / ADR-137 | **`10` §10.3.1**：<br>• `run` 目标下的 `keep`/`revert` 把决定追加到 `openings`，开场附 `tower.external_resolved{kept, reverted, mixed}`；<br>• `settle` 目标下的 `keep` 改写为 `settle{adoptedHuman:true}`，本次验证记 `human_change`，失败不自动返工。<br>**`10` §10.8.4**：`reverify` 的 `returnTo = takeoverFrom`。<br>**`16`**：<br>• continuation 行改写为六种形状，并写明执行规则；<br>• `verifyFrom` 写入点的唯一定义；<br>• `claim_on_behalf` → `claim`。<br>**用例**：G33c(a)–(e) | `10`；`16` §16.1.1、§16.1.5；`14` |
| R16-D4-02 / ADR-137 | **`10` §10.3.1**：<br>• settle 序列改为 `agent_bg_done` → I4 → pin 与 `claimed` 同一事务，`claimed` 中总有 pin；<br>• settle 中由任何原因进入的暂停都写 `settle`，解除后从宽限确认起完整重跑。<br>**`10` §10.8.4**：放弃改动在 `takeoverFrom = running` 或原因集合已含 `human` 时，保持 `paused(human)`。<br>**`10` §10.1.2**：`nested_repo_live` 条目消失时，一律加入 `human`；交还中人勾选删除不在此列。<br>**`budget.extend`**：只提高额度，不解除原因。<br>**用例**：G26c(e)、G33b(d)、G36c(f)、G36g(f) | `10`；`16` §16.1.13；`14` |
| R16-D6-01 / ADR-138 | **`10` §10.3.1**：<br>• 运行中检测时，同一事务写 `externalChange` 与 `drainingFor{reason:"external_change"}`；<br>• drain 中崩溃时以 `drainingFor.reason` 进入暂停，不 `autoResume`；E 不会被归入 Agent。<br>**`16`**：新增 `Goal.drainingFor` 行，DDL 列为 `draining_for`。<br>**用例**：G35e(a)–(d)、G35c(m) | `10`；`16`；`14` |
| R16-D6-02 / ADR-138 | 进程组改为按成员确认：开机会话相同，且组内存在启动时间不早于该行写入时间的成员（macOS 用 `proc_listpgrppids` 枚举）。组内无成员时删除该行。`13` 的成本已改。用例 G35c(j′)，对应 shell 已退出的情形 | `10`；`13`；`16`；`14` |
| R16-D7-01 / ADR-137 | 同 D4-01 的 `tower.external_resolved` 与 `adoptedHuman`。`16` 登记该注入的格式 | `10`；`16` |
| R16-D8-01 / ADR-139 | **`16`**：<br>• M1 实现四种停止条件，并写明各自的求值点；`natural` 只产生 `question`；<br>• `Goal.stopConditionSilences` 与默认再武装规则（DDL 列为 `stop_condition_silences`）；<br>• 原因码 `stop_condition_false_positive` 已在第 15 轮登记。<br>**用例**：G41 | `16`；`14` |
| R16-D13-01 / ADR-137/139 | **`10` §10.1.2 改为唯一定义**：在 `add` 之前**一次列出**全部会被拒的路径，规则为名字等价规则 ∪ git 的 NTFS 规则，作用于每个路径分量；然后一次性排除，不设数量上限。只有 git 仍拒绝时才兜底重试。结果是 `nested_repo` 或 `nested_repo_live`，不再出现 `verify_env_error`。§10.7.1 与 `13`、`16` 已同步。<br>**`10` §10.12**：较旧的 seal 合入时只记 `local_merged{seal, current:false}`，不进入 `integrated`；`accepted` 转为 `in_review`，并提示“base 已含较旧版本”。<br>**`16`**：`Fact.kind` 加 `local_merged`、`remote_merged`，并登记上述提示。<br>**用例**：G26d(c)(d)、G36c(e) | `10`；`13`；`16`；`14` |
| R16-D14-01 | 新增或改写的用例：<br>• G35c(j′)(m)(n)，其中 (n) 引用 `05` C36；<br>• G33c；<br>• G35e；<br>• G41；<br>• G36c(e)(f)；<br>• G26d(c)(d)；<br>• G26c(e)、G33b(d)。<br>SP6b 批次：B4 移到第 29 周，复跑移到第 30 周；补跑工时的现值为 2.9 人周 | `14` §14.2 |
| R16-D15-01 | 处理了以下几条：<br>• #1：继续目标的字段形状；<br>• #6：`budget.extend`；<br>• #7：`16` L126 改为 ADR-134/137 的口径；<br>• #10：lint。<br>lint 改动：<br>• 新增 (c)：每个 `{kind:"…"}` 继续目标字面量须与 `02` 的形状一致；<br>• 新增 (k)：`03` §3.2.1 的改写目标须在 `06` §6.4.3 对应行中；<br>• (z) 把 `00` 与 `03` §3.2 整体视为 M1 文本；<br>• M1 日期检查改为 36 周。<br>全部检查通过 | `reviews/lint/xref.py` |
| `16` 废弃表 | 新增九行：<br>• 不带载荷的 `run`；<br>• `claim_on_behalf` → `verify_new`；<br>• `budget.extend` 解除原因；<br>• 不含宽限确认的 `settle`；<br>• 只在唯一原因时生效的 `nested_repo_live` 例外；<br>• 任何 seal 合入都进入 `integrated`；<br>• drain 原因只在内存中；<br>• 按组长确认进程组；<br>• 超过 64 条记 `verify_env_error`。<br>另外改写了两行旧的排除规则。§16.5 不变。 | `16` |

**本轮工作量与 M1：+3.4 人周（WBS 114.55）。按 ADR-136/139 顺延 1 周到 36 周（2026-11-09 → 2027-07-16），不执行 ③、⑤。**

**去重。** 各写作者的估计按 WBS 行去重，同一条目取较大值：

| 写作者 | 估计 | 采用 |
|---|---|---|
| 05/06 | 1.15 人周 | W3 0.5 与 07/08/09 的系统 0.9 是同一项，取 0.9；W7-core 0.05 与本文的 0.15 是同一项，取 0.15 |
| 07/08/09 | 1.4 人周 | 同上；另计 W9 0.2、W13 0.3 |
| 04/12 | 0.75 人周 | 0.75 |
| 本文 | — | 0.15 + 0.1 + SP6b 新增用例 0.4 |

**为什么必须顺延。** 第 15 轮之后各线的缓冲外余量合计约 1.01 人周，不够吸收 3.4。顺延 1 周增加约 4.09 人周，合计约 5.10。

**各线分配与余量**（可用容量为 29 个工作周，减去 2 周冻结前缓冲）：

| 线 | 本轮分配（人周） | 冻结前所需工作周 | 缓冲外余量（工作周） |
|---|---|---|---|
| 系统 | +0.9 | 26.79（最长） | 0.21 |
| Agent | +0.85 | 26.73 | 0.27 |
| 桌面 | +0.75 | 26.62 | 0.38 |
| 设计 | +0.7 | 26.57 | 0.43 |
| 安全 | +0.2 | 25.85（按 0.5 人） | 1.15 |

**新日程**：

- 第 32 周末冻结（2027-06-18）；
- 第 33–35 周自用；
- 第 36 周退出评审；
- 各线的 QA 在第 29–30 周结束，第 31–32 周是完整的冻结前缓冲；
- M2 至 2027-10-22。

**增人备选为 32 周**，前提是新人承担约 1.9 人周的安全线工作。

ADR-133 的第 16 轮补记已写入 `15`。

**需要主干处理**：

- `00`、`15` ADR-038 的当前值改为 36 周 / 2027-07-16。
- `02` 的 `Fact.kind` 联合类型增加 `local_merged`、`remote_merged`。`16` 已登记，`data = {seal, current}`。
- `06` §6.4.3 `goal.external_change.keep` 行仍写“为 `settle` → 不变”，应改为 `settle{adoptedHuman:true}`，与 `02` 一致（05/06 写作者处理）。
- `07` 中关于“一次列出”的描述改为引用 `10` §10.1.2。
