# 第 47 轮评审回应（写作）

决策：ADR-173（`15` 末尾）。主干见 `round-47-response-spine.md`。行号为修改后的近似位置。

## 撤回 `local_file_unreadable` Fact（R47-D6-01）

| 文件 | 行 | 改动 |
|---|---|---|
| `02` | L381 | 项目级 Fact 举例删去 `local_file_unreadable`，只留 `remote_credential_blocked` |
| `02` | 原 L415 | `Fact.kind` 联合删除 `local_file_unreadable` 一行 |
| `16` | L129 | 项目级 Fact 归属字段：“目前为 `remote_credential_blocked`” |
| `16` | L130 | `Fact.kind`（33）→（32），删除 `local_file_unreadable` 条目 |
| `16` | L284 | 事件 `project.local_file_secret_detected`：不可读时“本应复制的条目不改写分类，只发进程内的 L1 通知”（ADR-172/173） |
| `16` | L373 | §16.1.13 废弃表新增一行（ADR-173）：项目级 Fact、由它产生与失效的通知、“未复制”提示取自该 Fact、验证结果上“记录的本地文件哈希与指纹 `extra`” → 进程内通知、`criterion_check.env.localFiles`、只按 tree 判新鲜度 |
| `06` | L234 | VerifierScheduler：本应复制的条目由执行复制的服务发“无法读取”L1 通知（进程内状态，按条目去重，不写账本，重启后不保留） |
| `06` | L596–597 | `facts` DDL 注释删去 `local_file_unreadable` |
| `07` | 原 L334 | §7.3.3 新鲜度表删除该行 |
| `10` | L1241 | §10.18 `project.local_file_secret_detected` 行：改为只发进程内的 L1 通知；两条事件保留 |
| `11` | L339 | 不可读时改为进程内 L1 通知（ADR-172/173） |
| `reviews/lint/xref.py` | `DELETED` | 加入 `('local_file_unreadable Fact', r'local_file_unreadable', 'ADR-173')`。check (d) 豁免 `15`、`16` §16.1.13 废弃表，以及附近有 `撤回`、`第 N 轮` 等历史标记的文字 |
| `14` | L215、L227 | 第 46 轮增量文字与 W9 行中的旧提法加注“（第 47 轮撤回，ADR-173）”/“（第 47 轮撤回）”，作为历史保留 |

## `ProjectLocalFile` 行（唯一定义，`16` L512）

- 标题与 ADR 列加上 ADR-173。
- “同一份内容”后面的句子改为：验证时，`seeded` 条目在查缓存之前读入一次。`envHash` 的本地文件项、`criterion_check.env.localFiles` 与写进槽位的内容都取自这一次读取，不读第二次（`07` §7.4.1 `verify()`）。指纹 `extra` 不与验证结果绑定。
- 不可读或不存在：执行复制的服务发 L1 通知“`<路径>` 无法读取（或不存在），本次未复制”。这条通知是进程内状态，按条目去重，不写账本。消失条件：之后成功读取；条目移出清单；`mark_secret` 使条目由非机密变为机密（按转移判断；`inspect_with_secrets` 中产生时已是机密的条目不受此条影响）。重启后不保留，下一次复制再读不到时重新出现。
- 失败提示的来源改为本次验证记录的 `criterion_check.env.localFiles` 中 `not_copied` 的条目，不取自显示时的项目级状态。
- 两个事件 `project.local_file_unmark_reverted`、`project.local_file_secret_detected` 不变。

## `07`（R47-D7-01、R47-D8-01）

| 行 | 改动 |
|---|---|
| L261–262 | `worktreeTree` 注释：删去“验证结果上记录的 extra……”；改为 `extra` 不与验证结果绑定，`criterion_check` 指纹为 `wt1:${tree}`、只按 tree 判新鲜度（§7.3.3），本地文件变化在下一次验证经 `envHash` 体现 |
| L394–399 | `verify()` 第 3 步：先 `const local = await readSeededLocalFiles(goal.projectId)`（逐个读入并按 `16` 重新判定），`cacheHit(..., envKey(goal, local.record), ...)`；全部命中时不取槽位，`cache.hit` 的结果同样记录 `local.record` |
| L416 | 新增 `await slot.seedLocalFiles(local)`：写出已读入的内容，不再读用户检出 |
| L425 | `criterion_check` 的 `data` 带上 `env.localFiles: local.record` |
| L462 | §7.4.1“本次未复制的本地文件”（ADR-172/173）：来源是本次验证的 `criterion_check.env.localFiles` 中 `not_copied` 的条目，不取自显示时的任何项目级状态 |
| L492 | §7.4.2 本地文件播种：哈希进入 `envHash` 并记入 `env.localFiles`，两者与槽位内容取自同一次读取；删去“指纹 `extra` 部分”与“两处的哈希都取自该槽位复制时……”；补充：`criterion_check` 只按 tree 判新鲜度，不用 `extra`（`extraGlobs` 保持 ADR-078 原义）；人修改本地文件不使已通过的结果变旧，下一次验证经 `envHash` 体现、缓存不命中 |
| L718–721 | §7.4.3 `envHash` 公式注释：来源是 `verify()` 查缓存之前的那一次读取，查询键、槽位内容与 `env.localFiles` 都取自它 |
| L856–857 | §7.4.7 `CriterionCheckData.env` 新增 `localFiles: { path; contentHash \| "not_copied" }[]`，只含本应复制的条目 |
| L869 | §7.4.8 同指纹缓存的诚实性保障：本应复制的本地文件经 `envHash` 进入，与槽位内容取自同一次读取（键的说法仍然成立） |
| L1650 | §7.10.3 返工消息模板加“本次验证有本应复制而未复制的本地文件时的一行提示（§7.4.1，ADR-172/173；来源为 `not_copied`），并写明该文件在用户检出中、Agent 无法恢复” |

## `04`

- L1300：“无法读取”通知改为不写入账本、按条目一条。消失条件为成功读取、移出清单、标为机密；重启后不保留，下一次复制仍读不到时再出现。“未复制”提示按这次验证的记录给出。
- L1483：§4.18.3 行写明按这次验证的 `criterion_check.env.localFiles` 中 `not_copied` 判断，不按显示卡片时的状态；之后恢复文件，这张卡片上的提示也不消失。

## `14` G46（L133）

- 标题：ADR 列表加 173，R32–R47。
- 场景 (ah)：加“文件仍缺失时重启 Tower，再触发一次播种”。场景 (ai) 第二组：先在已通过的情况下修改 `config/dev.local.json`，查看新鲜度，再触发验证。
- 期望 (ah)：
  - 不写任何 Fact 或账本事件；进程内 L1 通知，按条目去重。
  - 失败验证的 `env.localFiles` 中该条目为 `not_copied`，返工证据与卡片的“未复制”一行取自该字段，并写明 Agent 无法恢复。
  - 重启后在下一次复制失败之前没有这条通知，下一次复制失败时重新出现。
  - 恢复文件后复制成功，通知消失；之后成功的复制不移除旧失败卡片上的这一行。
- 期望 (ai) 第二组：
  - 修改之后、下一次验证之前，已通过的 `criterion_check` 仍为 `fresh`。
  - 下一次验证的 `envHash` 不同，缓存不命中。
  - `env.localFiles` 中的 `contentHash` 等于写进槽位的字节的哈希；缓存查询所用的 `envHash` 由同一次读取算出。

## 排期（`14` §14.3.4、`15` ADR-133 第 47 轮补记）

- **增量 +0.01 人周**：
  - W9 +0.01（Agent）：读取顺序、`env.localFiles`、提示来源与返工模板一行；撤回 Fact 抵消一部分。
  - W11 与第 46 轮的同类改动相抵，0。
  - W7 不足 0.01，0。
  - 不进入系统线。
- **WBS**：W9 10.80 → **10.81**；合计 121.62 → **121.63**（逐行求和核对）。
- **角色合计**：Agent 26.06 → **26.07**；系统 26.35、桌面 27.43、设计 28.38、安全 13.40 不变；合计 121.63。
- **冻结前所需**：Agent 25.67 × 1.1 = 28.237 → **28.24**；系统 28.88、桌面 28.19、设计 27.92 不变；安全 14.19（按 0.5 人为 28.38）。
- **余量**（29 减去取整值）：系统 0.12、Agent **0.76**、桌面 0.81、设计 1.08、安全 0.62。
- **增人备选**：28.24 + 28.88 + 28.19 + 27.92 + 14.19 = **127.42**；T = 129.42 / 5.5 = 23.53。新人承担约 2.4 人周（14.19 − 11.765 = 2.425）。仍为 26 个工作周，第 29 周末冻结，M1 为 33 周。
- **依赖链**：19.7 工作周，第 43–47 轮的增量不在链上。
- **`14` 的改动**：
  - L16、L398：“第 25–47 轮不变”；
  - L215：新增第 47 轮增量段；
  - L227：W9 行；
  - L238：合计；
  - L246：Agent 行；
  - L392：“第 47 轮后”；
  - L398：轮次列表加“第 47 轮 +0.01”，Agent 余量 0.76；
  - L400：127.42 / 129.42、“第 43–47 轮”；
  - L407：甘特 Agent 余量 0.76；其余甘特格不变。
- **`15` 的改动**：
  - L1108：ADR-133 第 47 轮补记，数值与 `14` 一致；
  - L1778：顺带更正 ADR-173 中的章节号，`verify()` 位于 §7.4.1，原文写作 §7.4.8。

## Lint

`python3 reviews/lint/xref.py --checks rstuvwxyzckdnSeRq`：全部为 0（(d) 已含 `local_file_unreadable`）。
