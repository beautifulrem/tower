# 第 43 轮评审回应 · 各文档同步

依据 `15` ADR-169；`03` §3.4.5 `paused` 列与 `03` L83/L85 为唯一定义（主干已改），本轮只引用。`03`、`15` 未改动。

## R43-D4-01 “改为 human 标准”

| 文件 | 约行 | 改动 |
|---|---|---|
| `04` | L1351（F6 第 2 步） | 自动返工期间没有 `verify_failed` 卡片、不提供 `改为 human 标准`，提示只进入返工证据 |
| `04` | L1353（F6 第 4 步） | `paused(verify_failed_limit)` 的选项中加 `改为 human 标准`：修订生效后界面自动发出 `retry_verify{pin:"same"}`（引 `03` §3.4.5，ADR-169） |
| `04` | L1480（§4.18.3 错误状态表） | 卡片只在 `paused(verify_failed_limit)` / `paused(human_change_verify_failed)` 中出现；`running` 中不提供按钮；恢复动作改为“修订生效后界面自动发出 `retry_verify{pin:"same"}`，Goal 回到 `verifying`；修订取消则不发出，Needs-You 保持打开”，删去“批准后按修订规则以新合同重新验证” |
| `07` | L452（§7.4.1） | “按 `03` §3.4.5 以新合同重新验证”改为两步串联；补“卡片只在两个暂停中出现，自动返工期间提示只进入返工证据” |
| `08` | L486（`outcomeClass` 表） | `verify_failed` 的“改为 human 标准”例外：重新验证开始（`retry_verify` 被接受）时关闭并定类；修订取消则条目保持打开 |
| `06` | L234（VerifierScheduler） | 按钮说明由“按修订矩阵继续”改为“修订生效后界面串联 `retry_verify{pin:"same"}`” |
| `11` | L417（§11.7.0） | 同上 |
| `12` | L662 | 普通失败卡片只在两个暂停中出现，自动返工期间提示只进入返工证据 |
| `14` | L133（G46） | 标题加 ADR-169、R43。(n) 期望改为：返工期间提示进入返工证据，达上限后 `verify_failed` 卡片附提示与按钮。(w) 前提改为“(n) 返工达上限后，`paused(verify_failed_limit)` 的 `verify_failed` 卡片上点‘改为 human 标准’；另一组批准修订前取消”；期望改为 `contract.amended` 入账 → 界面发出 `retry_verify{pin:"same"}` → `verifying`，Needs-You 此时关闭，其余 exec 标准全部通过后 `in_review`，人勾选该 human 标准；取消一组 Needs-You 保持打开、Goal 仍暂停。新增 (aa)：`paused(human_change_verify_failed)` 中的同一操作；(ab)：自动返工期间不提供卡片与按钮 |

## R43-D15-01

| 文件 | 约行 | 改动 |
|---|---|---|
| `16` | L509（`ProjectLocalFile` 行） | 写出派生谓词（唯一定义）：`isSecret(f) = f.secretBy ≠ null ∧ f.unmarked = null`；`seeded(f) = f.approved ≠ null ∧ ¬isSecret(f)`；只有 `seeded` 播种到卫星、验证槽位与默认检验检出；提示只列 `isSecret` 的条目；ADR 列加 ADR-169 |
| `06` | L234（VerifierScheduler） | 删去自写的“`secret_by` 非空”定义，改为引用 `16` 的 `seeded` / `isSecret`；已取消标记并批准的文件照常播种；提示只列 `isSecret` 的条目 |
| `07` | L451（§7.4.1） | “`secretBy` 非空的条目”改为“满足 `isSecret` 的条目”，引用 `16`；已取消标记并批准的文件不列入 |
| `11` | L339（§11.6.2 本地文件行） | 两类文件以 `16` 的谓词为唯一判定；普通本地文件含已取消标记的文件，批准后即 `seeded` |
| `11` | L416（§11.7.0） | “项目存在未播种的机密本地文件”注明为 `isSecret` 的条目 |
| `10` | L814（§10.8.3 第 2 步） | “已批准清单中的普通条目”改为“满足 `seeded` 的条目”，引用 `16` |
| `04` | L1297（§4.15.1） | 含机密的本地文件以 `16` 的 `isSecret` 为准，已取消标记的不算 |
| `14` | L133（G46） | 新增 (ac)：已取消标记（`unmark_secret_file`）并批准的 `config/payments.local.json` 照常播种，失败卡片、返工证据与试运行提示都不列出它 |
| `06` | L877（`inspect.open`） | 检验对象改为“该 Goal 最近一次完成的验证的 pin”；`sentinel_high` 只限由 `verifying` 进入，`nested_repo_live` 返回 `E_STATE` |
| `16` | L884（权限矩阵 `inspect.open`） | 同上；标题加 ADR-169 |
| `04` | L563（§4.6.6 第 1 步） | 检验对象改为“最近一次完成的验证的 pin”；哨兵限于验证中发现的；`nested_repo_live` 暂停时按钮置灰 |
| `14` | L133（G46(v)） | 前提加“由 `nested_repo_live` 从 `running` 进入 `paused(sentinel_high)` 的 Goal”；期望写明其返回 `E_STATE`，检验对象为最近一次完成的验证的 pin |
| `04` | L1291（线框） | “（被忽略，最近被测试读取过）”改为“（被忽略，名称像运行时配置）”（同为 8 个全角字，右边框列不变） |
| `04` | L1296 | 定义建议来源：只来自用户检出中被 git 忽略、文件名匹配常见运行时配置模式（`.env*`、`*.local.*`、`config/*.local.json`）的文件；不以读取作依据；Tower 只建议，不自动加入 |

`12` 及其他文档中没有“被测试读取”的说法（只剩 `15` ADR-169 的引述）。`10` §10.8.3 没有“当前 pin”的说法。

## lint

`python3 reviews/lint/xref.py` → `problems=0`；`--checks rstuvwxyzckdnSeRq` → exit 0，各项均为 0。
