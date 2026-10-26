# 第 38 轮评审回应：07 / 08 / 09

依据 ADR-164。

| 决策 | 处理 | 位置 |
|---|---|---|
| ADR-164（M1 规则） | §7.4.3 的“带机密的标准”替换为 M1 规则，并注明唯一定义在 `11` §11.7.0：<br>• exec 标准不能声明机密，合同编辑器拒绝；<br>• 需要机密的检查写为 human 标准，编辑器一键转换；<br>• 验证器、槽位与检验检出都不接触机密，钥匙串只存放 Tower 自用的凭据 | `07` §7.4.3 |
| ADR-164（M1 `verify()`） | §7.4.1 的机密阶段一段改为一句话：“M1 中不存在，见 §7.4.11”。`verify()` 删去 `plainTodo`/`secretTodo` 拆分、`secretPhaseOnly` 分支与机密阶段，恢复为对 `todo` 的单一循环。`envHash` 不再含机密项。机会式验证的“跳过带机密标准”一条删去 | `07` §7.2.4、§7.4.1、§7.4.3 |
| ADR-164（M1 `decide()`） | `outcomeOf` 删去 `not_run` 过滤；`decide()` 删去 `secretPending` 与相关注释，哨兵处置恢复为 ADR-163 之前的写法（`sentinel_high` 选项为 `override_and_review`/`rework`/`abandon`）。组合表的 `sentinel_high` 行删去 `not_run` 注记；“暂停解除后的验证”表删去 `secretPhaseOnly` 行。`not_run`、`secretsVia` 字段标为“仅 M2”。证据输入与返工模板中关于带机密标准的说法移到 M2 | `07` §7.4.4、§7.10.3 |
| ADR-164（M2 小节） | 新增 **§7.4.11（M2）带机密的验证标准**，开头标明“不在 M1 范围”，并列出 M1 不包含的机制。原有内容整体移入：<br>• 7.4.11.1 投递与规则（原 §7.4.3，含耦合保护、不回送输出、脱敏与残余风险）；<br>• 7.4.11.2 机密阶段（原 §7.4.1）；<br>• 7.4.11.3 对 `outcomeOf`/`decide()` 的增补（`not_run` 语义、`blocked_by_sentinel`、`secretPhaseOnly` 表行）；<br>• 7.4.11.4 伪代码（拆分说明与 `runSecretPhase`）。<br>小节内的交叉引用已改指 §7.4.11.x | `07` §7.4.11 |
| ADR-164（`08`） | `secret_wait` 去重说明与标注行标为 M2；`sentinel` 标注行中关于 `blocked_by_sentinel` 的一句标为 M2；引用改指 `07` §7.4.11 | `08` §8.4、§8.8 |

`09` 无涉及。

lint `--checks rstuvwxyzck`：退出码 1，只有 (c) 一项——`16` L34 的 `Continuation.verify` 仍含 `secretPhaseOnly?`，与 `02` 不一致（`02` 已按 ADR-164 去掉）。不在 `07`/`08`/`09`。

## 工时（删除计为负）

| 线 | 内容 | 人周 |
|---|---|---|
| 系统（验证） | 机密阶段、互斥闸口、`secretPhaseOnly` 分支、`not_run` 语义、收尾与恢复移出 M1 | −0.4 |
| 系统（注意力） | `secret_wait` 条目与标注移出 M1 | −0.05 |
| 合计 | | **−0.45** |

## 需要主干修改的地方

1. **`16` L34**：`Continuation.verify` 删去 `secretPhaseOnly?`，或标注为 M2 并让 lint (c) 忽略 M2 字段（lint (c) 失败）。
