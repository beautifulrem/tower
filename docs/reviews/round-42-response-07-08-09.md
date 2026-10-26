# 第 42 轮评审回应：07 / 08 / 09

依据 ADR-168。

| 决策 | 处理 | 位置 |
|---|---|---|
| ADR-168（撤回自动归类） | “缺失的机密本地文件”一段改写：<br>• M1 不做自动归类，说明三点理由：输出文本可被 Agent 影响；沙箱拒绝规则对不存在的路径不触发；dotenv/Vite 每次都会尝试读取 `.env.local`。<br>• 这类失败一律是普通失败，按 §7.10.3 的归因规则处理，含自动返工与返工上限。<br>• 项目有未播种的机密本地文件时，只给出 Claim 语法的提示，出现在三处：`verify_failed` 卡片（附“改为 human 标准” → `contract.amend`）、返工证据、试运行红灯徽标的限定。<br>删除：“拒绝并报告”读取规则、`secret_file_unseeded` stage、它的三个出口、SP6a 回退一条。原有的 dotenv 反例只在 ADR 与 `14` G46 中，`07` 正文没有，无需删除 | `07` §7.4.1 |
| ADR-168（`decide()` 与表） | `outcomeOf` 的 `env_error` 注释改为：缺少机密本地文件不归为 `env_error`。组合表 `env_error` 行删去 `secret_file_unseeded` 的选项 | `07` §7.10.3 |
| ADR-168（证据与模板） | “验证失败的证据输入”与返工消息模板各加入该提示行 | `07` §7.10.3 |
| ADR-168（`08`） | 删除 `ve:{goalId}:secret_file_unseeded` 的说明与标注行，`verify_env_error.stage` 列表删去 `secret_file_unseeded`。“改为 human 标准”现在是 `verify_failed` 卡片上的一个选项，由既有的 `verify_failed` 标注行覆盖（选择任意处置选项 → `actionable`） | `08` §8.4、§8.8 |

`09` 无涉及。lint `--checks rstuvwxyzck`：退出码 0。

工时：−0.03 人周（删除沙箱报告归类与对应的 Needs-You；提示行只是文案）。
