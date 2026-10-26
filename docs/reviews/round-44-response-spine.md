# 第 44 轮评审回应（主干）

决策：ADR-170（`15` 末尾）。

| 条目 | 处理 | 落点 |
|---|---|---|
| R44-D11-01 ① | 采用方案 A：每次播种前对清单中每个条目按名字与当前内容重新判定；`secretBy = null` 的条目命中时写 `secretBy = "content"`（⚙️ `project.local_file_secret_detected`），不播种并通知；不可读按命中处理；命中值加入脱敏器匹配集。谓词不变 | `16` L509（唯一定义）；`06` L234、`07` L482、`10`、`11` L339/L496 引用；`02` 注释 |
| R44-D11-01 ② | `approve` 对不在清单中的路径返回 `E_STATE`；建议条目 `[添加]` = `add`，结果不是 `isSecret` 时界面再发 `approve` | `06` L874、`16`、`04` L1296 |
| R44-D11-01 ③ | DDL 加 `CHECK (unmarked IS NULL OR secret_by IS NOT NULL)`；`unmark_secret` 对 `secretBy = null` 返回 `E_STATE` | `06` DDL、L876；`16` |
| R44-D14-01 ① | 第 43–44 轮增量合并登记 | `14` §14.3.4、`15` ADR-133 附记 |
| R44-D14-01 ② | G46(ac) 前提改为返工达上限的暂停，并另放一个 `isSecret` 条目；新增 (ad)(ae) | `14` G46 |

注：ADR-170 初稿中写了一个“现有 2 MB 单文件上限”，正文中并无此规则，已在落地前删去。
