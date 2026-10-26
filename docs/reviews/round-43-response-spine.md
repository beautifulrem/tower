# 第 43 轮评审回应（主干）

决策：ADR-169（`15` 末尾）。

| 条目 | 处理 | 落点 |
|---|---|---|
| R43-D4-01 | 采用方案 A：“改为 human 标准”只在 `paused(verify_failed_limit)` / `paused(human_change_verify_failed)` 的 `verify_failed` 卡片上提供；修订生效后界面自动发出 `retry_verify{pin:"same"}`；修订取消则 Needs-You 保持打开；`running` 中不提供该按钮。状态机不变 | `03` §3.4.5 `paused` 列（唯一定义）、`03` L83/L85 引用；`04`、`07`、`08`、`14` G46(w) 由作者同步 |
| R43-D15-01 ① | 派生谓词 `isSecret` / `seeded` 唯一定义在 `16`，`06`、`07`、`11` 引用；G46 加一组 | `16`、`06` L234、`07` L451、`11` L339、`14` G46 |
| R43-D15-01 ② | 检验 pin = 该 Goal 最近一次完成的验证的 pin；`sentinel_high` 只限由 `verifying` 进入，`nested_repo_live` 返回 `E_STATE`；G46(v) 加一组 | `06` L877、`16` L884、`15` ADR-168 条目已由 ADR-169 修订、`14` G46(v) |
| R43-D15-01 ③ | 删去“最近被测试读取过”；建议只来自被 git 忽略且文件名匹配常见运行时配置模式的文件 | `04` L1291、`12`（若有） |
